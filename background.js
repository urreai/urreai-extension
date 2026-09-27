/* UrreAI — fondo de la extensión (service worker en Chrome, página de fondo en Firefox).
 *
 * Qué hace, y nada más:
 *   · el menú del clic derecho: preguntar al chat, crear una flashcard, guardar
 *     la selección en la nota del paciente y capturar una imagen;
 *   · el omnibox («urreai» y el nombre de una calculadora);
 *   · los atajos de captura y el recorte de la región;
 *   · la vinculación con un clic desde la página de la app;
 *   · y los avisos en la página, porque sin ellos cada acción fallaba en
 *     silencio: hasta la 0.2.0 `notify` escribía en la consola y nada más.
 */

if (typeof importScripts === 'function' && typeof self.URREAI_ENLACES === 'undefined') {
  importScripts('lib/enlaces.js')
}
const E = self.URREAI_ENLACES

/*
 * Las llamadas que se esperan con `await` van por `browser` donde existe
 * (Firefox, que ahí siempre devuelve promesas) y por `chrome` donde no
 * (Chrome, que las devuelve en Manifest V3). Los eventos van por `chrome`,
 * que Firefox también atiende.
 */
const nav = typeof browser !== 'undefined' ? browser : chrome

const CLAVE = {
  token: 'urreai_token',
  api: 'urreai_api',
  paciente: 'urreai_paciente',
  preferencias: 'urreai_prefs',
  captura: 'urreai_capture',
}

// ─── Almacenamiento (con callbacks: así funciona igual en Chrome y en Firefox) ─

function leer(claves) {
  return new Promise(resolve => chrome.storage.local.get(claves, resolve))
}
function guardar(datos) {
  return new Promise(resolve => chrome.storage.local.set(datos, resolve))
}
function borrar(claves) {
  return new Promise(resolve => chrome.storage.local.remove(claves, resolve))
}

/** La app con la que está vinculada: la de producción, o la de desarrollo si se vinculó desde ella. */
async function baseDeLaApp() {
  const { [CLAVE.api]: api } = await leer([CLAVE.api])
  return api && E.esLaApp(api) ? api : E.APP
}

async function preferencias() {
  const { [CLAVE.preferencias]: p } = await leer([CLAVE.preferencias])
  return {
    campoLab: p?.campoLab ?? p?.fieldLab ?? 'objetivo',
    campoSignos: p?.campoSignos ?? p?.fieldVital ?? 'objetivo',
    campoImagen: p?.campoImagen ?? p?.fieldImaging ?? 'objetivo',
    campoTexto: p?.campoTexto ?? p?.fieldNote ?? 'subjetivo',
    notaDeHoy: (p?.notaDeHoy ?? p?.appendToToday) !== false,
    labConRango: p?.labConRango !== false,
    modo: p?.modo ?? p?.saveMode ?? 'save',
  }
}

// ─── La app ────────────────────────────────────────────────────────────────

async function pedirALaApp(ruta, cuerpo) {
  const { [CLAVE.token]: token } = await leer([CLAVE.token])
  if (!token) throw new Error('Vincula la extensión con tu cuenta: abre el ícono de UrreAI.')
  const base = await baseDeLaApp()
  const res = await fetch(`${base}${ruta}`, {
    method: cuerpo ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
  })
  const datos = await res.json().catch(() => ({}))
  if (res.status === 401) {
    await borrar([CLAVE.token])
    throw new Error('La extensión se desvinculó de tu cuenta. Vuelve a vincularla desde el ícono.')
  }
  if (!res.ok || !datos.success) throw new Error(datos.error || `Error ${res.status}`)
  return datos.data ?? {}
}

/** Manda una captura con las preferencias del estudiante, y copia el texto si la app lo devuelve. */
async function enviarCaptura(tabId, cuerpo) {
  const p = await preferencias()
  const campo = { lab: p.campoLab, vital: p.campoSignos, imaging: p.campoImagen, note: p.campoTexto }[cuerpo.kind]
  const datos = await pedirALaApp('/api/extension/capture', {
    ...cuerpo,
    field: campo,
    appendToTodayNote: p.notaDeHoy,
    saveMode: p.modo,
    ...(cuerpo.kind === 'lab' ? { labMode: p.labConRango ? 'interpreted' : 'raw' } : {}),
  })
  const habiaQueCopiar = typeof datos.clipboardText === 'string' && datos.clipboardText.length > 0
  const copiado = habiaQueCopiar ? await copiarEnLaPagina(tabId, datos.clipboardText) : false
  return { guardado: datos.guardado === true, aviso: datos.aviso || '', copiado, fallaCopia: habiaQueCopiar && !copiado }
}

/** Qué decirle al estudiante después de una captura, con lo que de verdad pasó. */
function resumenDeCaptura({ guardado, aviso, copiado, fallaCopia }, paciente) {
  const partes = []
  if (guardado) partes.push(`Guardado en ${paciente?.nombre || 'el paciente'}.`)
  if (fallaCopia) partes.push('No se pudo copiar: esta página no deja escribir en el portapapeles.')
  else if (aviso) partes.push(aviso)
  else if (copiado) partes.push('Copiado: pégalo donde lo necesites.')
  return partes.join(' ') || 'Listo.'
}

// ─── En la página: copiar y avisar ─────────────────────────────────────────

async function copiarEnLaPagina(tabId, texto) {
  if (!tabId || !texto) return false
  try {
    const [{ result } = {}] = await nav.scripting.executeScript({
      target: { tabId },
      args: [texto],
      func: async (t) => {
        try {
          await navigator.clipboard.writeText(t)
          return true
        } catch {
          const area = document.createElement('textarea')
          area.value = t
          area.style.cssText = 'position:fixed;left:-9999px;top:-9999px;'
          if (!document.body) return false
          document.body.appendChild(area)
          area.select()
          let ok = false
          try { ok = document.execCommand('copy') } catch { ok = false }
          area.remove()
          return ok
        }
      },
    })
    return result === true
  } catch {
    return false
  }
}

/**
 * Un aviso pequeño abajo a la derecha de la página, con los colores de la
 * marca. Donde el navegador no deja escribir en la página (sus propias
 * páginas, la tienda) queda en la consola de la extensión.
 */
async function avisar(tabId, texto, tipo = 'ok') {
  if (!tabId) { console.log(`[UrreAI] ${texto}`); return }
  try {
    await nav.scripting.executeScript({
      target: { tabId },
      args: [texto, tipo],
      func: (t, clase) => {
        const previo = document.getElementById('urreai-aviso')
        if (previo) previo.remove()
        const caja = document.createElement('div')
        caja.id = 'urreai-aviso'
        caja.setAttribute('role', 'status')
        const error = clase === 'error'
        caja.style.cssText = [
          'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647', 'max-width:340px',
          'padding:12px 14px', 'border-radius:14px', 'font:600 13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif',
          'box-sizing:border-box', 'white-space:pre-line',
          error
            ? 'background:#FEF2F2;color:#991B1B;border:2px solid #FECACA;border-bottom-width:4px'
            : 'background:#047857;color:#FFFFFF;border:0;border-bottom:4px solid #065F46',
        ].join(';')
        caja.textContent = t
        ;(document.body || document.documentElement).appendChild(caja)
        setTimeout(() => caja.remove(), error ? 7000 : 4500)
      },
    })
  } catch {
    console.log(`[UrreAI] ${texto}`)
  }
}

async function abrir(url) {
  await nav.tabs.create({ url })
}

// ─── Instalación y menú del clic derecho ───────────────────────────────────

chrome.runtime.onInstalled.addListener(async (detalles) => {
  if (detalles.reason === 'install') {
    await abrir(E.enlace(E.APP, 'vincular'))
  }
  if (detalles.reason === 'update') {
    // Los pacientes de la 0.1 se guardaban con destinos que la app ya no
    // acepta (`round:`, `patient:`): se borran y se vuelven a elegir.
    await borrar(['urreai_active_patient'])
  }

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'preguntar', title: 'Preguntar al chat de evidencia', contexts: ['selection'] })
    chrome.contextMenus.create({ id: 'flashcard', title: 'Crear flashcard con la selección', contexts: ['selection'] })
    chrome.contextMenus.create({ id: 'nota', title: 'Guardar en la nota del paciente', contexts: ['selection'] })
    chrome.contextMenus.create({ id: 'imagen-lab', title: 'UrreAI: capturar como laboratorio', contexts: ['image'] })
    chrome.contextMenus.create({ id: 'imagen-signos', title: 'UrreAI: capturar como signos vitales', contexts: ['image'] })
    chrome.contextMenus.create({ id: 'imagen-informe', title: 'UrreAI: capturar como informe de imagen', contexts: ['image'] })
  })
})

const TIPO_DE_IMAGEN = { 'imagen-lab': 'lab', 'imagen-signos': 'vital', 'imagen-informe': 'imaging' }

async function pacienteActivo() {
  const { [CLAVE.paciente]: paciente } = await leer([CLAVE.paciente])
  return paciente && typeof paciente.destino === 'string' ? paciente : null
}

async function imagenComoDataUrl(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`No se pudo descargar la imagen (${res.status}).`)
  const blob = await res.blob()
  return await new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onloadend = () => resolve(lector.result)
    lector.onerror = reject
    lector.readAsDataURL(blob)
  })
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const tabId = tab?.id
  const seleccion = (info.selectionText || '').trim()
  const base = await baseDeLaApp()

  if (info.menuItemId === 'preguntar') {
    if (seleccion) await abrir(E.enlace(base, 'pregunta', seleccion))
    return
  }
  if (info.menuItemId === 'flashcard') {
    if (seleccion) await abrir(E.enlace(base, 'flashcard', seleccion))
    return
  }

  const p = await preferencias()
  const paciente = await pacienteActivo()
  if (!paciente && p.modo !== 'clipboard') {
    await avisar(tabId, 'Elige primero un paciente: abre el ícono de UrreAI.', 'error')
    return
  }

  try {
    if (info.menuItemId === 'nota') {
      if (!seleccion) return
      const r = await enviarCaptura(tabId, { kind: 'note', target: paciente?.destino, text: seleccion, sourceUrl: tab?.url || '' })
      await avisar(tabId, resumenDeCaptura(r, paciente))
      return
    }
    const kind = TIPO_DE_IMAGEN[info.menuItemId]
    if (!kind) return
    if (!info.srcUrl) throw new Error('No se encontró la imagen.')
    await avisar(tabId, 'Leyendo la imagen…')
    const imageDataUrl = await imagenComoDataUrl(info.srcUrl)
    const r = await enviarCaptura(tabId, { kind, target: paciente?.destino, imageDataUrl, sourceUrl: tab?.url || info.srcUrl })
    await avisar(tabId, resumenDeCaptura(r, paciente))
  } catch (err) {
    await avisar(tabId, err.message || 'No se pudo guardar.', 'error')
  }
})

// ─── Omnibox: «urreai» y lo que buscas ─────────────────────────────────────

function escaparXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

chrome.omnibox.onInputChanged.addListener((texto, sugerir) => {
  const q = (texto || '').trim()
  const sugerencias = E.buscarCalculadoras(q).slice(0, 6).map(c => ({
    content: `calc:${c.id}`,
    description: `${escaparXml(c.nombre)} · abrir la calculadora`,
  }))
  if (q.length >= 5) {
    sugerencias.push({ content: `pregunta:${q}`, description: `Preguntar al chat de evidencia: ${escaparXml(q)}` })
  }
  if (q) {
    sugerencias.push({ content: `buscar:${q}`, description: `Buscar «${escaparXml(q)}» en las 185 calculadoras` })
  }
  sugerir(sugerencias)
})

chrome.omnibox.onInputEntered.addListener(async (entrada) => {
  const base = await baseDeLaApp()
  let url
  if (entrada.startsWith('calc:')) url = E.enlace(base, 'calculadora', entrada.slice(5))
  else if (entrada.startsWith('pregunta:')) url = E.enlace(base, 'pregunta', entrada.slice(9))
  else if (entrada.startsWith('buscar:')) url = E.enlace(base, 'buscarCalculadora', entrada.slice(7))
  else {
    // Texto escrito sin elegir sugerencia: si nombra una sola calculadora, esa.
    const coinciden = E.buscarCalculadoras(entrada)
    url = coinciden.length === 1
      ? E.enlace(base, 'calculadora', coinciden[0].id)
      : E.enlace(base, 'buscarCalculadora', entrada.trim())
  }
  await abrir(url)
})

// ─── Capturar una región de la pantalla ────────────────────────────────────

const TIPO_DE_ATAJO = { 'capture-lab': 'lab', 'capture-vital': 'vital', 'capture-imaging': 'imaging' }

async function empezarCaptura(tipo) {
  const [tab] = await nav.tabs.query({ active: true, currentWindow: true })
  if (!tab) throw new Error('No hay una pestaña activa.')
  const p = await preferencias()
  const paciente = await pacienteActivo()
  if (!paciente && p.modo !== 'clipboard') throw new Error('Elige primero un paciente en el ícono de UrreAI.')
  await guardar({ [CLAVE.captura]: { tipo, destino: paciente?.destino || null, tabId: tab.id } })
  await nav.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content/capture-overlay.css'] })
  await nav.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/capture-overlay.js'] })
}

chrome.commands.onCommand.addListener(async (comando) => {
  const tipo = TIPO_DE_ATAJO[comando]
  if (!tipo) return
  try {
    await empezarCaptura(tipo)
  } catch (err) {
    const [tab] = await nav.tabs.query({ active: true, currentWindow: true })
    await avisar(tab?.id, err.message || 'No se pudo empezar la captura.', 'error')
  }
})

async function recortar(dataUrl, region) {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob())
  const dpr = region.devicePixelRatio || 1
  const x = Math.max(0, Math.round(region.x * dpr))
  const y = Math.max(0, Math.round(region.y * dpr))
  const ancho = Math.max(1, Math.round(region.width * dpr))
  const alto = Math.max(1, Math.round(region.height * dpr))
  const lienzo = new OffscreenCanvas(ancho, alto)
  lienzo.getContext('2d').drawImage(bitmap, x, y, ancho, alto, 0, 0, ancho, alto)
  const blob = await lienzo.convertToBlob({ type: 'image/png' })
  return await new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onloadend = () => resolve(lector.result)
    lector.onerror = reject
    lector.readAsDataURL(blob)
  })
}

// ─── Vincular desde la página de la app ────────────────────────────────────

const FORMATO_DEL_CODIGO = /^urreai_ext_[a-f0-9]{40}$/

/** Solo el script de vinculación de esta extensión, dentro de la app, puede vincular. */
function vieneDeLaApp(remitente) {
  if (remitente.id !== chrome.runtime.id || !remitente.url) return null
  try {
    const origen = new URL(remitente.url).origin
    return E.esLaApp(origen) ? origen : null
  } catch {
    return null
  }
}

async function vincular(codigo, origen) {
  if (!FORMATO_DEL_CODIGO.test(codigo)) throw new Error('El código no tiene el formato de UrreAI.')
  const res = await fetch(`${origen}/api/extension/context`, { headers: { Authorization: `Bearer ${codigo}` } })
  if (!res.ok) throw new Error('La app no reconoció el código. Genera otro.')
  await guardar({ [CLAVE.token]: codigo, [CLAVE.api]: origen })
}

// ─── Mensajes del popup, del recorte y de la página ────────────────────────

chrome.runtime.onMessage.addListener((mensaje, remitente, responder) => {
  if (mensaje?.type === 'START_CAPTURE') {
    empezarCaptura(mensaje.captureType)
      .then(() => responder({ ok: true }))
      .catch(err => responder({ error: err.message || String(err) }))
    return true
  }

  if (mensaje?.type === 'CAPTURE_REGION') {
    ;(async () => {
      const tabId = remitente.tab?.id
      try {
        const { [CLAVE.captura]: ctx } = await leer([CLAVE.captura])
        if (!ctx || ctx.tabId !== tabId) throw new Error('Se perdió la captura. Vuelve a empezarla.')
        const imagen = await nav.tabs.captureVisibleTab(remitente.tab.windowId, { format: 'png' })
        // Ya está tomada: el recorte puede enseñar que está leyendo sin salir en la foto.
        nav.tabs.sendMessage(tabId, { type: 'CAPTURA_TOMADA' }).catch(() => {})
        const recorte = await recortar(imagen, mensaje.region)
        const paciente = await pacienteActivo()
        const r = await enviarCaptura(tabId, { kind: ctx.tipo, target: ctx.destino || undefined, imageDataUrl: recorte, sourceUrl: remitente.tab.url })
        responder({ ok: true, texto: resumenDeCaptura(r, paciente) })
      } catch (err) {
        responder({ error: err.message || String(err) })
      } finally {
        await borrar([CLAVE.captura])
      }
    })()
    return true
  }

  if (mensaje?.type === 'CAPTURE_CANCELLED') {
    borrar([CLAVE.captura]).then(() => responder({ ok: true }))
    return true
  }

  if (mensaje?.type === 'VINCULAR') {
    const origen = vieneDeLaApp(remitente)
    if (!origen) {
      responder({ ok: false, error: 'Solo se puede vincular desde la app de UrreAI.' })
      return false
    }
    vincular(String(mensaje.token || ''), origen)
      .then(() => responder({ ok: true }))
      .catch(err => responder({ ok: false, error: err.message || 'No se pudo vincular.' }))
    return true
  }

  return false
})
