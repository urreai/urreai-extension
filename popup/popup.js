/* UrreAI — el popup del ícono, el panel lateral y la ventana de la flashcard.
 *
 * Los tres son esta página. Lo que cambia entre ellos:
 *   · el popup se cierra al hacer clic fuera, así que la flashcard a medio
 *     escribir se guarda como borrador; y solo él puede leer la selección de
 *     la pestaña, porque el navegador le da permiso al pulsar el ícono;
 *   · el panel lateral se queda abierto junto a la página, y recoge las
 *     flashcards que le manda el clic derecho;
 *   · la ventana existe para cuando el navegador no deja abrir el panel.
 */

const E = window.URREAI_ENLACES
const C = window.URREAI_CLIENTE
const { CLAVE, leer, guardar, borrar, baseDeLaApp } = C
const nav = typeof browser !== 'undefined' ? browser : chrome

const PREFERENCIAS = {
  campoLab: 'objetivo',
  campoSignos: 'objetivo',
  campoImagen: 'objetivo',
  campoTexto: 'subjetivo',
  notaDeHoy: true,
  labConRango: true,
  modo: 'save',
}

/** Cuánto vale una flashcard que dejó el clic derecho: si nadie la recoge en ese tiempo, ya no es de ahora. */
const VIGENCIA_DE_LA_TARJETA = 2 * 60 * 1000

const $ = (id) => document.getElementById(id)

// ─── Dónde se abrió ────────────────────────────────────────────────────────

/**
 * La ventana se abre con `?en=ventana`. El popup se reconoce porque el
 * navegador lo cuenta entre sus popups; lo demás es el panel lateral.
 */
function dondeSeAbrio() {
  if (new URLSearchParams(window.location.search).get('en') === 'ventana') return 'ventana'
  try {
    const vistas = chrome.extension && chrome.extension.getViews
    if (typeof vistas !== 'function') return 'popup'
    return vistas({ type: 'popup' }).includes(window) ? 'popup' : 'panel'
  } catch {
    return 'popup'
  }
}
const EN = dondeSeAbrio()
document.body.classList.add(`en-${EN}`)

/** La ventana del navegador donde está esta página. Hace falta ya en el clic que abre el panel. */
let miVentana = null
nav.windows.getCurrent().then(v => { miVentana = v.id }).catch(() => {})

async function preferencias() {
  const { [CLAVE.preferencias]: p } = await leer([CLAVE.preferencias])
  return { ...PREFERENCIAS, ...(p || {}) }
}

/** Abre la app en una pestaña. El popup y la ventana se cierran; el panel se queda. */
async function abrir(url) {
  await nav.tabs.create({ url })
  if (EN !== 'panel') window.close()
}

async function enlace(ruta, valor) {
  return E.enlace(await baseDeLaApp(), ruta, valor)
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

function sinVincular(err) {
  if (err && err.codigo === 'SIN_VINCULAR') {
    mostrar('vincular')
    return true
  }
  return false
}

// ─── Vincular ──────────────────────────────────────────────────────────────

$('ir-a-vincular').addEventListener('click', async () => abrir(await enlace('vincular')))

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
    await C.pedir(E.API.pacientes)
    mostrar('principal')
    iniciarPrincipal()
  } catch (err) {
    await borrar([CLAVE.token])
    error.textContent = err.codigo === 'SIN_VINCULAR'
      ? 'La app no reconoció el código. Genera otro en la página de la extensión.'
      : err.message
    error.classList.remove('oculta')
  }
})

$('desvincular').addEventListener('click', async () => {
  // Se desvincula también en la cuenta, no solo aquí: si no, el código seguiría
  // valiendo seis meses en la lista de la página.
  try {
    await C.pedir(E.API.vinculaciones, { metodo: 'DELETE', cuerpo: {} })
  } catch { /* sin red o ya desvinculada: igual se borra aquí */ }
  await borrar([CLAVE.token, CLAVE.paciente, CLAVE.api, CLAVE.resumen, CLAVE.borrador])
  $('codigo').value = ''
  mostrar('vincular')
})

// ─── Lo de hoy ─────────────────────────────────────────────────────────────

/** El número de «Para hoy» de Flashcards, con su botón: repasar si hay, ver si no. */
function pintarHoy(r) {
  const texto = $('hoy-texto')
  const boton = $('hoy-boton')
  texto.textContent = ''
  if (!r) {
    texto.textContent = 'Buscando tus flashcards de hoy…'
    boton.className = 'boton boton--chico oculta'
    return
  }
  if (r.error) {
    texto.textContent = 'No se pudo cargar lo de hoy.'
    boton.textContent = 'Abrir Flashcards'
    boton.className = 'boton boton--secundario boton--chico'
    boton.dataset.ir = 'flashcards'
    return
  }
  const n = Number(r.paraHoy) || 0
  if (n > 0) {
    const numero = document.createElement('strong')
    numero.textContent = r.tope ? `${n} o más` : String(n)
    texto.append(numero, n === 1 && !r.tope ? ' flashcard para hoy' : ' flashcards para hoy')
    boton.textContent = 'Repasar'
    boton.className = 'boton boton--principal boton--chico'
    boton.dataset.ir = 'repasar'
  } else {
    texto.textContent = 'Al día con tus flashcards.'
    boton.textContent = 'Ver'
    boton.className = 'boton boton--secundario boton--chico'
    boton.dataset.ir = 'flashcards'
  }
}

$('hoy-boton').addEventListener('click', async () => abrir(await enlace($('hoy-boton').dataset.ir || 'flashcards')))

async function cargarResumen() {
  const guardado = await C.resumenGuardado()
  if (guardado) usarResumen(guardado)
  try {
    usarResumen(await C.resumen())
  } catch (err) {
    if (sinVincular(err)) return
    if (!guardado) pintarHoy({ error: true })
  }
}

function usarResumen(r) {
  pintarHoy(r)
  pintarFavoritas(r.favoritas)
  llenarRotaciones(r.rotaciones)
}

// ─── Calculadoras ──────────────────────────────────────────────────────────

/** Las 185 de la app en cuanto llegan; mientras tanto, las de fábrica. */
let catalogo = E.CALCULADORAS.slice()
let favoritas = []
let resultados = []
let activo = -1

const campoBuscar = $('buscar-calculadora')
const listaResultados = $('resultados')

async function abrirCalculadora(id) {
  abrir(await enlace('calculadora', id))
}

function pintarFavoritas(lista) {
  favoritas = Array.isArray(lista) ? lista : []
  if (!campoBuscar.value.trim()) pintarPastillas()
}

/** Sin nada escrito: las favoritas de la cuenta, o unas de fábrica si no hay. */
function pintarPastillas() {
  const contenedor = $('calculadoras')
  const pista = $('calculadoras-pista')
  contenedor.innerHTML = ''
  const lista = favoritas.length ? favoritas.slice(0, 12) : E.CALCULADORAS.slice(0, 8)
  pista.textContent = favoritas.length
    ? 'Tus favoritas'
    : 'Aún no marcas favoritas: se marcan con la estrella en Calculadoras.'
  for (const calc of lista) {
    const boton = document.createElement('button')
    boton.type = 'button'
    boton.className = 'pastilla'
    boton.textContent = calc.nombre
    boton.title = `Abrir ${calc.nombre}`
    boton.addEventListener('click', () => abrirCalculadora(calc.id))
    contenedor.appendChild(boton)
  }
  contenedor.classList.remove('oculta')
  pista.classList.remove('oculta')
}

function marcarActivo(indice) {
  activo = indice
  listaResultados.querySelectorAll('[role="option"]').forEach((opcion, i) => {
    opcion.setAttribute('aria-selected', String(i === indice))
    if (i === indice) opcion.scrollIntoView({ block: 'nearest' })
  })
  campoBuscar.setAttribute('aria-activedescendant', indice >= 0 ? `resultado-${indice}` : '')
}

async function buscarEnLaApp(texto) {
  abrir(await enlace('buscarCalculadora', texto))
}

function buscar() {
  const texto = campoBuscar.value.trim()
  const hay = texto.length > 0
  $('calculadoras').classList.toggle('oculta', hay)
  $('calculadoras-pista').classList.toggle('oculta', hay)
  listaResultados.classList.toggle('oculta', !hay)
  campoBuscar.setAttribute('aria-expanded', String(hay))
  if (!hay) {
    resultados = []
    pintarPastillas()
    return
  }

  resultados = E.buscarCalculadoras(texto, catalogo).slice(0, 8)
  listaResultados.innerHTML = ''
  resultados.forEach((calc, i) => {
    const opcion = document.createElement('li')
    opcion.id = `resultado-${i}`
    opcion.className = 'resultado'
    opcion.setAttribute('role', 'option')
    opcion.setAttribute('aria-selected', 'false')
    const nombre = document.createElement('span')
    nombre.className = 'resultado__nombre'
    nombre.textContent = calc.nombre
    opcion.appendChild(nombre)
    if (calc.categoria) {
      const categoria = document.createElement('span')
      categoria.className = 'resultado__categoria'
      categoria.textContent = calc.categoria
      opcion.appendChild(categoria)
    }
    opcion.addEventListener('click', () => abrirCalculadora(calc.id))
    listaResultados.appendChild(opcion)
  })

  const final = document.createElement('li')
  final.className = 'resultado resultado--app'
  final.setAttribute('role', 'presentation')
  const boton = document.createElement('button')
  boton.type = 'button'
  boton.className = 'enlace'
  boton.textContent = resultados.length ? `Ver «${texto}» en la app` : `Ninguna con «${texto}». Buscar en la app`
  boton.addEventListener('click', () => buscarEnLaApp(texto))
  final.appendChild(boton)
  listaResultados.appendChild(final)
  marcarActivo(resultados.length ? 0 : -1)
}

campoBuscar.addEventListener('input', buscar)
campoBuscar.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' && resultados.length) {
    e.preventDefault()
    marcarActivo((activo + 1) % resultados.length)
  } else if (e.key === 'ArrowUp' && resultados.length) {
    e.preventDefault()
    marcarActivo((activo - 1 + resultados.length) % resultados.length)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const texto = campoBuscar.value.trim()
    if (resultados[activo]) abrirCalculadora(resultados[activo].id)
    else if (texto) buscarEnLaApp(texto)
  } else if (e.key === 'Escape' && campoBuscar.value) {
    e.preventDefault()
    campoBuscar.value = ''
    buscar()
  }
})

$('favoritas').addEventListener('click', async () => abrir(await enlace('favoritas')))

function cargarCatalogo() {
  C.catalogo().then(lista => {
    catalogo = lista
    campoBuscar.title = `Busca entre las ${lista.length} calculadoras de UrreAI`
    if (campoBuscar.value.trim()) buscar()
  })
}

// ─── La selección de la pestaña ────────────────────────────────────────────

let seleccion = { tab: null, texto: '' }

/**
 * El texto seleccionado en la pestaña. Solo el popup puede leerlo: el
 * navegador le da permiso a la extensión sobre la pestaña al pulsar su ícono,
 * y no al usar el panel.
 */
async function seleccionDeLaPestana() {
  if (EN !== 'popup') return { tab: null, texto: '' }
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

async function pintarSeleccion() {
  seleccion = await seleccionDeLaPestana()
  if (!seleccion.texto) return
  const texto = seleccion.texto.replace(/\s+/g, ' ')
  $('seleccion-texto').textContent = texto.length > 220 ? `${texto.slice(0, 220)}…` : texto
  $('seleccion').classList.remove('oculta')
}

async function preguntar(texto) {
  abrir(texto ? await enlace('pregunta', texto) : `${await baseDeLaApp()}/dashboard/chat-evidencia`)
}

$('seleccion-flashcard').addEventListener('click', () => abrirTarjeta({ frente: seleccion.texto }))
$('seleccion-preguntar').addEventListener('click', () => preguntar(seleccion.texto))

// ─── Nueva flashcard ───────────────────────────────────────────────────────

const campoFrente = $('tarjeta-frente')
const campoDorso = $('tarjeta-dorso')
const selectorRotacion = $('tarjeta-rotacion')
const campoOtra = $('tarjeta-rotacion-otra')

function llenarRotaciones(lista) {
  if (!Array.isArray(lista) || !lista.length) return
  const actual = selectorRotacion.value
  selectorRotacion.innerHTML = ''
  const ninguna = document.createElement('option')
  ninguna.value = ''
  ninguna.textContent = 'Sin rotación'
  selectorRotacion.appendChild(ninguna)
  for (const r of lista) {
    const opcion = document.createElement('option')
    opcion.value = r
    opcion.textContent = r === 'Otra' ? 'Otra…' : r
    selectorRotacion.appendChild(opcion)
  }
  if ([...selectorRotacion.options].some(o => o.value === actual)) selectorRotacion.value = actual
}

function hayOpcion(valor) {
  return [...selectorRotacion.options].some(o => o.value === valor)
}

/** La última rotación que usó el estudiante: casi siempre sigue en la misma. */
async function ponerRotacionGuardada() {
  const { [CLAVE.rotacion]: guardada } = await leer([CLAVE.rotacion])
  campoOtra.classList.add('oculta')
  if (!guardada) return
  if (hayOpcion(guardada)) {
    selectorRotacion.value = guardada
  } else if (hayOpcion('Otra')) {
    selectorRotacion.value = 'Otra'
    campoOtra.value = guardada
    campoOtra.classList.remove('oculta')
  } else {
    const opcion = document.createElement('option')
    opcion.value = guardada
    opcion.textContent = guardada
    selectorRotacion.appendChild(opcion)
    selectorRotacion.value = guardada
  }
}

function rotacionElegida() {
  return selectorRotacion.value === 'Otra' ? campoOtra.value.trim() : selectorRotacion.value
}

selectorRotacion.addEventListener('change', () => {
  const otra = selectorRotacion.value === 'Otra'
  campoOtra.classList.toggle('oculta', !otra)
  if (otra) campoOtra.focus()
})

function errorDeTarjeta(texto) {
  const caja = $('tarjeta-error')
  caja.textContent = texto || ''
  caja.classList.toggle('oculta', !texto)
}

/**
 * Abre el formulario. `frente` es lo seleccionado; sin él, en el popup se
 * recupera la tarjeta que quedó a medias al cerrarse.
 */
async function abrirTarjeta({ frente = '' } = {}) {
  errorDeTarjeta('')
  $('form-tarjeta').classList.remove('oculta')
  $('tarjeta-guardada').classList.add('oculta')

  let dorso = ''
  if (EN === 'popup') {
    const { [CLAVE.borrador]: borrador } = await leer([CLAVE.borrador])
    if (borrador && !frente) {
      frente = borrador.frente || ''
      dorso = borrador.dorso || ''
    } else if (borrador && borrador.frente === frente) {
      dorso = borrador.dorso || ''
    }
  }
  const recortado = frente.length > C.MAX_FRENTE
  campoFrente.value = frente.slice(0, C.MAX_FRENTE)
  campoDorso.value = dorso
  await ponerRotacionGuardada()
  mostrar('tarjeta')
  if (recortado) errorDeTarjeta(`La selección pasaba de ${C.MAX_FRENTE} caracteres: quedó recortada.`)
  ;(campoFrente.value ? campoDorso : campoFrente).focus()
}

let pendienteDeBorrador = null
function guardarBorrador() {
  if (EN !== 'popup') return
  clearTimeout(pendienteDeBorrador)
  pendienteDeBorrador = setTimeout(() => {
    guardar({ [CLAVE.borrador]: { frente: campoFrente.value, dorso: campoDorso.value } })
  }, 300)
}
campoFrente.addEventListener('input', guardarBorrador)
campoDorso.addEventListener('input', guardarBorrador)

$('intercambiar').addEventListener('click', () => {
  const frente = campoFrente.value
  campoFrente.value = campoDorso.value
  campoDorso.value = frente
  guardarBorrador()
})

for (const campo of [campoFrente, campoDorso, campoOtra]) {
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      $('form-tarjeta').requestSubmit()
    }
  })
}

$('form-tarjeta').addEventListener('submit', async (e) => {
  e.preventDefault()
  const pregunta = campoFrente.value.trim()
  const respuesta = campoDorso.value.trim()
  if (!pregunta) { errorDeTarjeta('Escribe el frente de la tarjeta.'); campoFrente.focus(); return }
  if (!respuesta) { errorDeTarjeta('Escribe el dorso de la tarjeta.'); campoDorso.focus(); return }
  errorDeTarjeta('')

  const boton = $('guardar-tarjeta')
  boton.disabled = true
  boton.textContent = 'Guardando…'
  const rotacion = rotacionElegida()
  try {
    await C.guardarTarjeta({ pregunta, respuesta, rotacion })
    clearTimeout(pendienteDeBorrador)
    await borrar([CLAVE.borrador])
    await (rotacion ? guardar({ [CLAVE.rotacion]: rotacion }) : borrar([CLAVE.rotacion]))
    $('form-tarjeta').classList.add('oculta')
    $('tarjeta-guardada').classList.remove('oculta')
    $('otra-tarjeta').focus()
    C.resumen().then(usarResumen).catch(() => {})
    if (EN === 'ventana') setTimeout(() => window.close(), 1600)
  } catch (err) {
    if (sinVincular(err)) return
    errorDeTarjeta(err.message || 'No se pudo guardar. Revisa tu conexión e inténtalo otra vez.')
  } finally {
    boton.disabled = false
    boton.textContent = 'Guardar flashcard'
  }
})

$('otra-tarjeta').addEventListener('click', () => abrirTarjeta())
$('ver-flashcards').addEventListener('click', async () => abrir(await enlace('flashcards')))
$('cerrar-tarjeta').addEventListener('click', () => {
  if (EN === 'ventana') window.close()
  else mostrar('principal')
})

/**
 * La flashcard que dejó el clic derecho o el atajo. El panel solo recoge las
 * de su ventana, por si hay otro panel abierto en otra; la ventana, la suya.
 */
async function recogerTarjetaPendiente() {
  if (EN === 'popup') return
  const { [CLAVE.tarjeta]: tarjeta } = await leer([CLAVE.tarjeta])
  if (!tarjeta || Date.now() - tarjeta.cuando > VIGENCIA_DE_LA_TARJETA) return
  if (EN === 'panel') {
    const ventana = miVentana ?? (await nav.windows.getCurrent()).id
    if (tarjeta.ventana !== ventana) return
  } else if (tarjeta.ventana !== 'nueva') {
    return
  }
  await borrar([CLAVE.tarjeta])
  const { [CLAVE.token]: token } = await leer([CLAVE.token])
  if (!token) { mostrar('vincular'); return }
  await abrirTarjeta({ frente: tarjeta.frente || '' })
}

chrome.storage.onChanged.addListener((cambios, area) => {
  if (area !== 'local') return
  if (cambios[CLAVE.tarjeta] && cambios[CLAVE.tarjeta].newValue) recogerTarjetaPendiente()
  // Se vinculó o se desvinculó desde otra parte: la página de la app o el popup.
  if (cambios[CLAVE.token]) {
    if (cambios[CLAVE.token].newValue && !$('vista-vincular').classList.contains('oculta')) {
      mostrar('principal')
      iniciarPrincipal()
    } else if (!cambios[CLAVE.token].newValue) {
      mostrar('vincular')
    }
  }
})

// ─── El panel lateral ──────────────────────────────────────────────────────

function hayPanel() {
  return Boolean((chrome.sidePanel && chrome.sidePanel.open) ||
    (typeof browser !== 'undefined' && browser.sidebarAction && browser.sidebarAction.open))
}

$('abrir-panel').addEventListener('click', () => {
  // Sin `await` antes: el navegador solo deja abrir el panel durante el clic.
  let abierto
  try {
    abierto = chrome.sidePanel && chrome.sidePanel.open
      ? chrome.sidePanel.open({ windowId: miVentana })
      : browser.sidebarAction.open()
  } catch (err) {
    abierto = Promise.reject(err)
  }
  Promise.resolve(abierto)
    .then(() => window.close())
    .catch(() => responder('Este navegador no dejó abrir el panel lateral. Ábrelo desde su menú de paneles.', 'error'))
})

// ─── Crear, ir y pacientes ─────────────────────────────────────────────────

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
    const { ronda = [], notas = [] } = await C.pedir(E.API.pacientes)
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
    if (sinVincular(err)) return
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
    // La selección solo la lee el popup: en el panel, «Guardar la selección» va por el clic derecho.
    const sinSeleccion = boton.dataset.accion === 'nota' && EN !== 'popup'
    boton.disabled = sinSeleccion || (!hayPaciente && modo !== 'clipboard')
  })
}

const TIPO_DE_CAPTURA = { 'capturar-lab': 'lab', 'capturar-signos': 'vital', 'capturar-informe': 'imaging' }

async function guardarSeleccionEnLaNota() {
  const { tab, texto } = await seleccionDeLaPestana()
  if (!texto) { responder('Selecciona primero el texto en la página.', 'error'); return }
  const p = await preferencias()
  const { [CLAVE.paciente]: paciente } = await leer([CLAVE.paciente])
  try {
    const datos = await C.pedir(E.API.captura, {
      cuerpo: {
        kind: 'note', target: paciente?.destino, text: texto, sourceUrl: tab?.url || '',
        field: p.campoTexto, appendToTodayNote: p.notaDeHoy, saveMode: p.modo,
      },
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
    if (sinVincular(err)) return
    responder(err.message || 'No se pudo guardar.', 'error')
  }
}

document.querySelectorAll('[data-accion]').forEach(boton => {
  boton.addEventListener('click', async () => {
    const accion = boton.getAttribute('data-accion')
    if (accion === 'flashcard') { abrirTarjeta({ frente: seleccion.texto }); return }
    if (accion === 'preguntar') { preguntar(seleccion.texto); return }
    if (accion === 'caso') { abrir(await enlace('caso')); return }
    if (accion === 'estudio') { abrir(await enlace('estudio')); return }
    if (accion === 'nota') { guardarSeleccionEnLaNota(); return }
    if (TIPO_DE_CAPTURA[accion]) {
      chrome.runtime.sendMessage({ type: 'START_CAPTURE', captureType: TIPO_DE_CAPTURA[accion] }, (r) => {
        const error = chrome.runtime.lastError ? chrome.runtime.lastError.message : r?.error
        if (error) responder(error, 'error')
        else if (EN !== 'panel') window.close()
      })
    }
  })
})

$('abrir-app').addEventListener('click', async () => abrir(`${await baseDeLaApp()}/dashboard`))

// ─── Preferencias ──────────────────────────────────────────────────────────

function marcar(nombre, valor) {
  const opcion = document.querySelector(`input[name="${nombre}"][value="${valor}"]`)
  if (opcion) opcion.checked = true
}
function marcado(nombre) {
  return document.querySelector(`input[name="${nombre}"]:checked`)?.value
}

/** Los atajos como están de verdad en este navegador, que el estudiante puede haber cambiado. */
async function pintarAtajos() {
  const contenedor = $('atajos')
  contenedor.innerHTML = ''
  let comandos = []
  try { comandos = await nav.commands.getAll() } catch { comandos = [] }
  for (const comando of comandos) {
    const fila = document.createElement('p')
    fila.className = 'atajo'
    const teclas = document.createElement('span')
    teclas.className = 'atajo__teclas'
    if (comando.shortcut) {
      for (const tecla of comando.shortcut.split('+')) {
        const kbd = document.createElement('kbd')
        kbd.textContent = tecla
        teclas.appendChild(kbd)
      }
    } else {
      teclas.textContent = 'Sin atajo'
    }
    const que = document.createElement('span')
    que.textContent = comando.name === '_execute_action' ? 'Abrir UrreAI' : (comando.description || comando.name)
    fila.append(teclas, que)
    contenedor.appendChild(fila)
  }
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
  await pintarAtajos()
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

function iniciarPrincipal() {
  pintarPastillas()
  cargarResumen()
  cargarPacientes()
  pintarSeleccion()
}

;(async () => {
  if (EN !== 'popup' || !hayPanel()) $('abrir-panel').classList.add('oculta')
  cargarCatalogo()
  const { [CLAVE.token]: token } = await leer([CLAVE.token])
  if (!token) { mostrar('vincular'); return }
  mostrar('principal')
  iniciarPrincipal()
  recogerTarjetaPendiente()
})()
