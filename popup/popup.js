/* UrreAI — el popup de la extensión. */

const E = window.URREAI_ENLACES
const nav = typeof browser !== 'undefined' ? browser : chrome

const CLAVE = {
  token: 'urreai_token',
  api: 'urreai_api',
  paciente: 'urreai_paciente',
  preferencias: 'urreai_prefs',
}

const PREFERENCIAS = {
  campoLab: 'objetivo',
  campoSignos: 'objetivo',
  campoImagen: 'objetivo',
  campoTexto: 'subjetivo',
  notaDeHoy: true,
  labConRango: true,
  modo: 'save',
}

const $ = (id) => document.getElementById(id)

// ─── Almacenamiento ────────────────────────────────────────────────────────

function leer(claves) {
  return new Promise(resolve => chrome.storage.local.get(claves, resolve))
}
function guardar(datos) {
  return new Promise(resolve => chrome.storage.local.set(datos, resolve))
}
function borrar(claves) {
  return new Promise(resolve => chrome.storage.local.remove(claves, resolve))
}

async function baseDeLaApp() {
  const { [CLAVE.api]: api } = await leer([CLAVE.api])
  return api && E.esLaApp(api) ? api : E.APP
}

async function preferencias() {
  const { [CLAVE.preferencias]: p } = await leer([CLAVE.preferencias])
  return { ...PREFERENCIAS, ...(p || {}) }
}

// ─── La app ────────────────────────────────────────────────────────────────

async function pedirALaApp(ruta, opciones = {}) {
  const { [CLAVE.token]: token } = await leer([CLAVE.token])
  if (!token) throw new Error('SIN_VINCULAR')
  const base = await baseDeLaApp()
  const res = await fetch(`${base}${ruta}`, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opciones.headers || {}) },
  })
  if (res.status === 401) {
    await borrar([CLAVE.token])
    throw new Error('SIN_VINCULAR')
  }
  const datos = await res.json().catch(() => ({}))
  if (!res.ok || !datos.success) throw new Error(datos.error || `Error ${res.status}`)
  return datos.data ?? {}
}

async function abrir(url) {
  await nav.tabs.create({ url })
  window.close()
}

// ─── Vistas ────────────────────────────────────────────────────────────────

let vistaAnterior = 'principal'

function mostrar(vista) {
  document.querySelectorAll('.vista').forEach(v => v.classList.add('oculta'))
  $(`vista-${vista}`).classList.remove('oculta')
  if (vista !== 'preferencias') vistaAnterior = vista
  $('estado').textContent = vista === 'vincular' ? 'Sin vincular' : 'Vinculada a tu cuenta'
}

function responder(texto, tipo = 'ok') {
  const caja = $('respuesta')
  caja.className = `respuesta respuesta--${tipo}`
  caja.textContent = texto
  if (tipo === 'ok') setTimeout(() => caja.classList.add('oculta'), 5000)
}

// ─── Vincular ──────────────────────────────────────────────────────────────

$('ir-a-vincular').addEventListener('click', async () => {
  await abrir(E.enlace(await baseDeLaApp(), 'vincular'))
})

$('vincular-con-codigo').addEventListener('click', async () => {
  const error = $('error-codigo')
  const codigo = $('codigo').value.trim()
  error.classList.add('oculta')
  if (!/^urreai_ext_[a-f0-9]{40}$/.test(codigo)) {
    error.textContent = 'Ese no es un código de UrreAI: empieza por «urreai_ext_». Genera uno en la página de la extensión.'
    error.classList.remove('oculta')
    return
  }
  await guardar({ [CLAVE.token]: codigo })
  try {
    await pedirALaApp('/api/extension/context')
    mostrar('principal')
    await iniciarPrincipal()
  } catch (err) {
    await borrar([CLAVE.token])
    error.textContent = err.message === 'SIN_VINCULAR'
      ? 'La app no reconoció el código. Genera otro en la página de la extensión.'
      : err.message
    error.classList.remove('oculta')
  }
})

$('desvincular').addEventListener('click', async () => {
  // Se desvincula también en la cuenta, no solo aquí: si no, el código seguiría
  // valiendo seis meses en la lista de la página.
  try {
    await pedirALaApp('/api/extension/tokens', { method: 'DELETE', body: '{}' })
  } catch { /* sin red o ya desvinculada: igual se borra aquí */ }
  await borrar([CLAVE.token, CLAVE.paciente, CLAVE.api])
  $('codigo').value = ''
  mostrar('vincular')
})

// ─── Pacientes ─────────────────────────────────────────────────────────────

function aBase64(texto) {
  const bytes = new TextEncoder().encode(texto)
  let binario = ''
  bytes.forEach(b => { binario += String.fromCharCode(b) })
  return btoa(binario)
}

async function cargarPacientes() {
  const pista = $('pista-paciente')
  const selector = $('paciente')
  pista.textContent = 'Cargando tus pacientes…'
  try {
    const { ronda = [], notas = [] } = await pedirALaApp('/api/extension/context')
    selector.innerHTML = '<option value="">Elige un paciente</option>'
    const etiquetas = new Map()

    if (ronda.length) {
      const grupo = document.createElement('optgroup')
      grupo.label = 'Mi ronda'
      for (const p of ronda) {
        const opcion = document.createElement('option')
        opcion.value = `ronda:${p.id}`
        opcion.textContent = p.cama ? `Cama ${p.cama} · ${p.nombre}` : p.nombre
        etiquetas.set(opcion.value, p.nombre)
        grupo.appendChild(opcion)
      }
      selector.appendChild(grupo)
    }
    if (notas.length) {
      const grupo = document.createElement('optgroup')
      grupo.label = 'Notas del paciente'
      for (const p of notas) {
        const opcion = document.createElement('option')
        opcion.value = `soap:${aBase64(p.alias)}`
        opcion.textContent = `${p.alias} · ${p.notas} ${p.notas === 1 ? 'nota' : 'notas'}`
        etiquetas.set(opcion.value, p.alias)
        grupo.appendChild(opcion)
      }
      selector.appendChild(grupo)
    }
    selector.dataset.etiquetas = JSON.stringify([...etiquetas])

    const total = ronda.length + notas.length
    pista.textContent = total
      ? 'Los de Mi ronda guardan laboratorios; los de Notas del paciente, todo en la nota de hoy.'
      : 'Todavía no tienes pacientes: añádelos en Mi ronda o en Notas del paciente.'

    const { [CLAVE.paciente]: guardado } = await leer([CLAVE.paciente])
    if (guardado && etiquetas.has(guardado.destino)) selector.value = guardado.destino
    await actualizarAcciones()
  } catch (err) {
    if (err.message === 'SIN_VINCULAR') { mostrar('vincular'); return }
    pista.textContent = 'No se pudieron cargar tus pacientes. Prueba con el botón de recargar.'
  }
}

$('paciente').addEventListener('change', async (e) => {
  const destino = e.target.value
  const etiquetas = new Map(JSON.parse(e.target.dataset.etiquetas || '[]'))
  if (destino) await guardar({ [CLAVE.paciente]: { destino, nombre: etiquetas.get(destino) || 'el paciente' } })
  else await borrar([CLAVE.paciente])
  await actualizarAcciones()
})

$('recargar').addEventListener('click', () => cargarPacientes())

async function actualizarAcciones() {
  const { modo } = await preferencias()
  const hayPaciente = Boolean($('paciente').value)
  document.querySelectorAll('[data-con-paciente]').forEach(boton => {
    boton.disabled = !hayPaciente && modo !== 'clipboard'
  })
}

// ─── Acciones ──────────────────────────────────────────────────────────────

/** El texto seleccionado en la pestaña, o cadena vacía donde el navegador no deja leerlo. */
async function seleccionDeLaPestana() {
  try {
    const [tab] = await nav.tabs.query({ active: true, currentWindow: true })
    const [{ result } = {}] = await nav.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (window.getSelection ? window.getSelection().toString() : ''),
    })
    return { tab, texto: (result || '').trim() }
  } catch {
    return { tab: null, texto: '' }
  }
}

const TIPO_DE_CAPTURA = { 'capturar-lab': 'lab', 'capturar-signos': 'vital', 'capturar-informe': 'imaging' }

document.querySelectorAll('[data-accion]').forEach(boton => {
  boton.addEventListener('click', async () => {
    const accion = boton.getAttribute('data-accion')
    const base = await baseDeLaApp()

    if (accion === 'preguntar' || accion === 'flashcard') {
      const { texto } = await seleccionDeLaPestana()
      if (accion === 'preguntar') {
        await abrir(texto ? E.enlace(base, 'pregunta', texto) : `${base}/dashboard/chat-evidencia`)
      } else {
        await abrir(E.enlace(base, 'flashcard', texto))
      }
      return
    }
    if (accion === 'caso') { await abrir(E.enlace(base, 'caso')); return }
    if (accion === 'estudio') { await abrir(E.enlace(base, 'estudio')); return }

    if (TIPO_DE_CAPTURA[accion]) {
      chrome.runtime.sendMessage({ type: 'START_CAPTURE', captureType: TIPO_DE_CAPTURA[accion] }, (r) => {
        const error = chrome.runtime.lastError ? chrome.runtime.lastError.message : r?.error
        if (error) responder(error, 'error')
        else window.close()
      })
      return
    }

    if (accion === 'nota') {
      const { tab, texto } = await seleccionDeLaPestana()
      if (!texto) { responder('Selecciona primero el texto en la página.', 'error'); return }
      const p = await preferencias()
      const { [CLAVE.paciente]: paciente } = await leer([CLAVE.paciente])
      try {
        const datos = await pedirALaApp('/api/extension/capture', {
          method: 'POST',
          body: JSON.stringify({
            kind: 'note', target: paciente?.destino, text: texto, sourceUrl: tab?.url || '',
            field: p.campoTexto, appendToTodayNote: p.notaDeHoy, saveMode: p.modo,
          }),
        })
        let copiado = false
        if (datos.clipboardText) {
          try { await navigator.clipboard.writeText(datos.clipboardText); copiado = true } catch { copiado = false }
        }
        const partes = []
        if (datos.guardado) partes.push(`Guardado en ${paciente?.nombre || 'el paciente'}.`)
        if (datos.aviso) partes.push(datos.aviso)
        else if (copiado) partes.push('Copiado: pégalo donde lo necesites.')
        responder(partes.join(' ') || 'Listo.')
      } catch (err) {
        if (err.message === 'SIN_VINCULAR') { mostrar('vincular'); return }
        responder(err.message || 'No se pudo guardar.', 'error')
      }
    }
  })
})

$('favoritas').addEventListener('click', async () => abrir(E.enlace(await baseDeLaApp(), 'favoritas')))
$('abrir-app').addEventListener('click', async () => abrir(`${await baseDeLaApp()}/dashboard`))

function pintarCalculadoras() {
  const contenedor = $('calculadoras')
  contenedor.innerHTML = ''
  for (const calc of E.CALCULADORAS.slice(0, 12)) {
    const boton = document.createElement('button')
    boton.type = 'button'
    boton.className = 'pastilla'
    boton.textContent = calc.nombre
    boton.title = `Abrir ${calc.nombre}`
    boton.addEventListener('click', async () => abrir(E.enlace(await baseDeLaApp(), 'calculadora', calc.id)))
    contenedor.appendChild(boton)
  }
}

// ─── Preferencias ──────────────────────────────────────────────────────────

function marcar(nombre, valor) {
  const opcion = document.querySelector(`input[name="${nombre}"][value="${valor}"]`)
  if (opcion) opcion.checked = true
}
function marcado(nombre) {
  return document.querySelector(`input[name="${nombre}"]:checked`)?.value
}

$('abrir-preferencias').addEventListener('click', async () => {
  const p = await preferencias()
  marcar('modo', p.modo)
  marcar('notaDeHoy', p.notaDeHoy ? 'si' : 'no')
  marcar('labConRango', p.labConRango ? 'si' : 'no')
  $('campo-lab').value = p.campoLab
  $('campo-signos').value = p.campoSignos
  $('campo-imagen').value = p.campoImagen
  $('campo-texto').value = p.campoTexto
  $('grupo-nota-de-hoy').hidden = p.modo === 'clipboard'
  mostrar('preferencias')
})

document.querySelectorAll('input[name="modo"]').forEach(opcion => {
  opcion.addEventListener('change', () => { $('grupo-nota-de-hoy').hidden = marcado('modo') === 'clipboard' })
})

$('cerrar-preferencias').addEventListener('click', () => mostrar(vistaAnterior))

$('guardar-preferencias').addEventListener('click', async () => {
  await guardar({
    [CLAVE.preferencias]: {
      modo: marcado('modo') || 'save',
      notaDeHoy: marcado('notaDeHoy') !== 'no',
      labConRango: marcado('labConRango') !== 'no',
      campoLab: $('campo-lab').value,
      campoSignos: $('campo-signos').value,
      campoImagen: $('campo-imagen').value,
      campoTexto: $('campo-texto').value,
    },
  })
  const hecho = $('preferencias-guardadas')
  hecho.classList.remove('oculta')
  setTimeout(() => hecho.classList.add('oculta'), 2000)
  await actualizarAcciones()
})

// ─── Arranque ──────────────────────────────────────────────────────────────

async function iniciarPrincipal() {
  pintarCalculadoras()
  await cargarPacientes()
}

;(async () => {
  const { [CLAVE.token]: token } = await leer([CLAVE.token])
  if (!token) { mostrar('vincular'); return }
  mostrar('principal')
  await iniciarPrincipal()
})()
