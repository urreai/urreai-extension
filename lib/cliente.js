/* UrreAI — lo que la extensión le pide a la app, en un solo sitio.
 *
 * Lo cargan el fondo (con `importScripts` en Chrome y en `background.scripts`
 * en Firefox), el popup y el panel lateral. Hasta la 0.2.0 el popup y el fondo
 * tenían cada uno su copia, y ya no decían lo mismo: uno avisaba con un código
 * y el otro con una frase, y solo uno borraba el código cuando la app lo
 * rechazaba.
 *
 * Va después de `lib/enlaces.js`, del que toma las rutas.
 */
;(function (global) {
  'use strict'

  const E = global.URREAI_ENLACES

  /** Lo que la extensión guarda en el navegador. */
  const CLAVE = {
    token: 'urreai_token',
    api: 'urreai_api',
    paciente: 'urreai_paciente',
    preferencias: 'urreai_prefs',
    captura: 'urreai_capture',
    catalogo: 'urreai_catalogo',
    resumen: 'urreai_resumen',
    rotacion: 'urreai_rotacion',
    /** La tarjeta que el clic derecho o el atajo le dejan al panel. */
    tarjeta: 'urreai_tarjeta',
    /** La que se estaba escribiendo en el popup, que se cierra al hacer clic fuera. */
    borrador: 'urreai_borrador',
  }

  /** El tope del frente de una tarjeta, el mismo que en la app. */
  const MAX_FRENTE = 2000

  /** Un día: el catálogo cambia cuando se publica una calculadora, no cada hora. */
  const VIGENCIA_DEL_CATALOGO = 24 * 60 * 60 * 1000

  // Con callbacks, que es como funciona igual en Chrome y en Firefox.
  function leer(claves) {
    return new Promise(resolve => chrome.storage.local.get(claves, resolve))
  }
  function guardar(datos) {
    return new Promise(resolve => chrome.storage.local.set(datos, resolve))
  }
  function borrar(claves) {
    return new Promise(resolve => chrome.storage.local.remove(claves, resolve))
  }

  /** Un error que quiere decir «hay que volver a vincular», distinguible de los demás. */
  function sinVincular(mensaje) {
    const error = new Error(mensaje)
    error.codigo = 'SIN_VINCULAR'
    return error
  }

  /** La app con la que está vinculada: la de producción, o la de desarrollo si se vinculó desde ella. */
  async function baseDeLaApp() {
    const { [CLAVE.api]: api } = await leer([CLAVE.api])
    return api && E.esLaApp(api) ? api : E.APP
  }

  /**
   * Una llamada a la app con el código de vinculación. `cuerpo`, si lo hay, va
   * como JSON y la llamada es un POST.
   */
  async function pedir(ruta, { metodo, cuerpo } = {}) {
    const { [CLAVE.token]: token } = await leer([CLAVE.token])
    if (!token) throw sinVincular('Vincula la extensión con tu cuenta: abre el ícono de UrreAI.')
    const base = await baseDeLaApp()
    const res = await fetch(`${base}${ruta}`, {
      method: metodo || (cuerpo === undefined ? 'GET' : 'POST'),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    })
    const datos = await res.json().catch(() => ({}))
    if (res.status === 401) {
      await borrar([CLAVE.token])
      throw sinVincular('La extensión se desvinculó de tu cuenta. Vuelve a vincularla desde el ícono.')
    }
    if (!res.ok || !datos.success) throw new Error(datos.error || `Error ${res.status}`)
    return datos.data ?? {}
  }

  /**
   * Las 185 calculadoras de la app, guardadas un día. No pide código: son
   * nombres de escalas, y así se buscan aunque la extensión no esté vinculada.
   * Sin red, la última copia; sin copia, las dieciséis de fábrica.
   */
  async function catalogo({ forzar = false } = {}) {
    const { [CLAVE.catalogo]: guardado } = await leer([CLAVE.catalogo])
    const tieneLista = Boolean(guardado && Array.isArray(guardado.lista) && guardado.lista.length)
    if (tieneLista && !forzar && Date.now() - guardado.cuando < VIGENCIA_DEL_CATALOGO) return guardado.lista
    try {
      const res = await fetch(`${await baseDeLaApp()}${E.API.calculadoras}`)
      const datos = await res.json()
      const lista = datos && datos.data && datos.data.calculadoras
      if (!res.ok || !datos.success || !Array.isArray(lista) || !lista.length) throw new Error('Catálogo vacío')
      await guardar({ [CLAVE.catalogo]: { lista, cuando: Date.now() } })
      return lista
    } catch {
      return tieneLista ? guardado.lista : E.CALCULADORAS.slice()
    }
  }

  /**
   * Lo de hoy: tarjetas para repasar, favoritas y rotaciones. Guarda la
   * respuesta para enseñarla al instante la próxima vez que se abra.
   */
  async function resumen() {
    const datos = await pedir(E.API.resumen)
    await guardar({ [CLAVE.resumen]: { ...datos, cuando: Date.now() } })
    return datos
  }

  async function resumenGuardado() {
    const { [CLAVE.resumen]: guardado } = await leer([CLAVE.resumen])
    return guardado || null
  }

  /** Guarda una flashcard en la cuenta. Devuelve su id. */
  async function guardarTarjeta({ pregunta, respuesta, rotacion }) {
    return pedir(E.API.flashcard, {
      cuerpo: { pregunta, respuesta, rotacion: rotacion || null },
    })
  }

  global.URREAI_CLIENTE = {
    CLAVE,
    MAX_FRENTE,
    leer,
    guardar,
    borrar,
    baseDeLaApp,
    pedir,
    catalogo,
    resumen,
    resumenGuardado,
    guardarTarjeta,
  }
})(typeof self !== 'undefined' ? self : this)
