/* UrreAI — fondo de la extensión (service worker en Chrome, página de fondo en Firefox).
 *
 * Qué hace, y nada más:
 *   · el menú del clic derecho: crear una flashcard, preguntar al chat,
 *     guardar la selección en la nota del paciente y capturar una imagen;
 *   · abrir el panel lateral con la flashcard lista para escribirle el dorso;
 *   · el omnibox («urreai» y el nombre de cualquiera de las 185 calculadoras);
 *   · los atajos y el recorte de la región;
 *   · la vinculación con un clic desde la página de la app;
 *   · y los avisos en la página, porque sin ellos cada acción fallaba en
 *     silencio: hasta la 0.2.0 `notify` escribía en la consola y nada más.
 *
 * Lo que se le pide a la app pasa por `lib/cliente.js`, que comparten el
 * popup y el panel.
 */

if (typeof importScripts === 'function' && typeof self.URREAI_CLIENTE === 'undefined') {
  importScripts('lib/enlaces.js', 'lib/cliente.js')
}
const E = self.URREAI_ENLACES
const C = self.URREAI_CLIENTE
const { CLAVE, leer, guardar, borrar, baseDeLaApp } = C

/*
 * Las llamadas que se esperan con `await` van por `browser` donde existe
 * (Firefox, que ahí siempre devuelve promesas) y por `chrome` donde no
 * (Chrome, que las devuelve en Manifest V3). Los eventos van por `chrome`,
 * que Firefox también atiende.
 */
const nav = typeof browser !== 'undefined' ? browser : chrome

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

// ─── Capturas ──────────────────────────────────────────────────────────────

/** Manda una captura con las preferencias del estudiante, y copia el texto si la app lo devuelve. */
async function enviarCaptura(tabId, cuerpo) {
  const p = await preferencias()
  const campo = { lab: p.campoLab, vital: p.campoSignos, imaging: p.campoImagen, note: p.campoTexto }[cuerpo.kind]
  const datos = await C.pedir(E.API.captura, {
    cuerpo: {
      ...cuerpo,
      field: campo,
      appendToTodayNote: p.notaDeHoy,
      saveMode: p.modo,
      ...(cuerpo.kind === 'lab' ? { labMode: p.labConRango ? 'interpreted' : 'raw' } : {}),
    },
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

// ─── En la página: leer la selección, copiar y avisar ──────────────────────

/** El texto seleccionado en la pestaña, o cadena vacía donde el navegador no deja leerlo. */
async function seleccionEn(tabId) {
  if (!tabId) return ''
  try {
    const [{ result } = {}] = await nav.scripting.executeScript({
      target: { tabId },
      func: () => (window.getSelection ? window.getSelection().toString() : ''),
    })
    return (result || '').trim()
  } catch {
    return ''
  }
}

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

// ─── La flashcard, en el panel lateral ─────────────────────────────────────

/**
 * Abre el panel lateral de UrreAI en la ventana de la pestaña. Tiene que
 * llamarse ANTES de cualquier `await`: Chrome y Firefox solo dejan abrirlo
 * mientras dura el gesto del clic o del atajo, y un `await` lo termina.
 * Devuelve la promesa del navegador, que se rechaza si no lo dejó.
 */
function abrirPanel(ventana) {
  try {
    if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
      if (typeof ventana !== 'number') return Promise.reject(new Error('Sin ventana'))
      return chrome.sidePanel.open({ windowId: ventana })
    }
    if (typeof browser !== 'undefined' && browser.sidebarAction && typeof browser.sidebarAction.open === 'function') {
      return browser.sidebarAction.open()
    }
  } catch (err) {
    return Promise.reject(err)
  }
  return Promise.reject(new Error('Este navegador no tiene panel lateral.'))
}

/**
 * Deja la tarjeta para el panel y lo abre. El panel la recoge al cargar o, si
 * ya estaba abierto, al cambiar el almacenamiento. Si el navegador no deja
 * abrir el panel, la tarjeta se escribe en una ventana pequeña.
 *
 * `frente` puede ser una promesa: el atajo tiene que abrir el panel antes de
 * leer la selección, que lleva un `await`.
 */
function abrirTarjeta(tab, frente) {
  const ventana = tab?.windowId
  const panel = abrirPanel(ventana)
  // El rechazo se atiende más abajo, después de guardar la tarjeta; sin esto
  // el navegador lo anota antes como una promesa sin atender.
  panel.catch(() => {})
  return Promise.resolve(frente)
    .then(texto => guardar({
      [CLAVE.tarjeta]: { frente: String(texto || '').slice(0, C.MAX_FRENTE), ventana: ventana ?? null, cuando: Date.now() },
    }).then(() => panel))
    .catch(async () => {
      const { [CLAVE.tarjeta]: tarjeta } = await leer([CLAVE.tarjeta])
      await guardar({ [CLAVE.tarjeta]: { ...(tarjeta || { frente: '', cuando: Date.now() }), ventana: 'nueva' } })
      await nav.windows.create({ url: chrome.runtime.getURL('popup/popup.html?en=ventana'), type: 'popup', width: 420, height: 640 })
    })
}

// ─── Instalación y menú del clic derecho ───────────────────────────────────

chrome.runtime.onInstalled.addListener(async (detalles) => {
  if (detalles.reason === 'install') {
    await abrir(E.enlace(E.APP, 'vincular'))
  }
  if (detalles.reason === 'update') {
    // Los pacientes de la 0.1 se guardaban con destinos que la app ya no
    // acepta: se borran y se vuelven a elegir.
    await borrar(['urreai_active_patient'])
  }

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'flashcard', title: 'Crear flashcard con la selección', contexts: ['selection'] })
    chrome.contextMenus.create({ id: 'preguntar', title: 'Preguntar al chat de evidencia', contexts: ['selection'] })
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

async function preguntar(texto) {
  const base = await baseDeLaApp()
  await abrir(texto ? E.enlace(base, 'pregunta', texto) : `${base}/dashboard/chat-evidencia`)
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const seleccion = (info.selectionText || '').trim()
  // Sin `await` antes: abrir el panel necesita el gesto del clic.
  if (info.menuItemId === 'flashcard') {
    abrirTarjeta(tab, seleccion)
    return
  }
  if (info.menuItemId === 'preguntar') {
    if (seleccion) preguntar(seleccion)
    return
  }
  capturarDesdeElMenu(info, tab, seleccion)
})

async function capturarDesdeElMenu(info, tab, seleccion) {
  const tabId = tab?.id
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
}

// ─── Omnibox: «urreai» y lo que buscas ─────────────────────────────────────

function escaparXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

chrome.omnibox.onInputChanged.addListener((texto, sugerir) => {
  const q = (texto || '').trim()
  C.catalogo().then(lista => {
    const sugerencias = E.buscarCalculadoras(q, lista).slice(0, 6).map(c => ({
      content: `calc:${c.id}`,
      description: `${escaparXml(c.nombre)} · abrir la calculadora`,
    }))
    if (q.length >= 5) {
      sugerencias.push({ content: `pregunta:${q}`, description: `Preguntar al chat de evidencia: ${escaparXml(q)}` })
    }
    if (q) {
      sugerencias.push({ content: `buscar:${q}`, description: `Buscar «${escaparXml(q)}» en las calculadoras de UrreAI` })
    }
    sugerir(sugerencias)
  })
})

chrome.omnibox.onInputEntered.addListener(async (entrada) => {
  const base = await baseDeLaApp()
  let url
  if (entrada.startsWith('calc:')) url = E.enlace(base, 'calculadora', entrada.slice(5))
  else if (entrada.startsWith('pregunta:')) url = E.enlace(base, 'pregunta', entrada.slice(9))
  else if (entrada.startsWith('buscar:')) url = E.enlace(base, 'buscarCalculadora', entrada.slice(7))
  else {
    // Texto escrito sin elegir sugerencia: si nombra una sola calculadora, esa.
    const coinciden = E.buscarCalculadoras(entrada, await C.catalogo())
    url = coinciden.length === 1
      ? E.enlace(base, 'calculadora', coinciden[0].id)
      : E.enlace(base, 'buscarCalculadora', entrada.trim())
  }
  await abrir(url)
})

// ─── Atajos ────────────────────────────────────────────────────────────────

const TIPO_DE_ATAJO = { 'capture-lab': 'lab', 'capture-vital': 'vital', 'capture-imaging': 'imaging' }

async function pestanaActiva() {
  const [tab] = await nav.tabs.query({ active: true, currentWindow: true })
  return tab || null
}

async function empezarCaptura(tipo) {
  const tab = await pestanaActiva()
  if (!tab) throw new Error('No hay una pestaña activa.')
  const p = await preferencias()
  const paciente = await pacienteActivo()
  if (!paciente && p.modo !== 'clipboard') throw new Error('Elige primero un paciente en el ícono de UrreAI.')
  await guardar({ [CLAVE.captura]: { tipo, destino: paciente?.destino || null, tabId: tab.id } })
  await nav.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content/capture-overlay.css'] })
  await nav.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/capture-overlay.js'] })
}

chrome.commands.onCommand.addListener((comando, tab) => {
  if (comando === 'crear-flashcard') {
    // El panel se abre primero, con el gesto; la selección llega después.
    abrirTarjeta(tab, seleccionEn(tab?.id))
    return
  }
  if (comando === 'preguntar') {
    ;(async () => preguntar(await seleccionEn((tab || await pestanaActiva())?.id)))()
    return
  }
  const tipo = TIPO_DE_ATAJO[comando]
  if (!tipo) return
  empezarCaptura(tipo).catch(async (err) => {
    await avisar((await pestanaActiva())?.id, err.message || 'No se pudo empezar la captura.', 'error')
  })
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
  const res = await fetch(`${origen}${E.API.pacientes}`, { headers: { Authorization: `Bearer ${codigo}` } })
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
