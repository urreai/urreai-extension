/* UrreAI — qué abre la extensión en la app, y dónde está la app.
 *
 * Es la otra mitad de `urreai-app/src/lib/extension/enlaces.ts`. La app tiene
 * una prueba (`contratoDeLaExtension.test.ts`) que carga ESTE archivo y exige
 * las mismas rutas y las mismas calculadoras, en el mismo orden: si cambias
 * algo aquí, cámbialo también allá.
 *
 * Hasta la 0.2.0 los atajos del popup mandaban `?new=case`, `?new=1` y
 * `?tab=hoy`, y la app no leía ninguno: la página se abría y no pasaba nada.
 *
 * Es un script clásico y no un módulo: lo cargan el service worker de Chrome
 * (`importScripts`), la página de fondo de Firefox (`background.scripts`) y el
 * popup (`<script>`), y los tres entienden un script clásico.
 */
;(function (global) {
  'use strict'

  var APP = 'https://app.urreai.com'

  /** Desde dónde se puede vincular la extensión: la app, y la de desarrollo. */
  var ORIGENES_DE_LA_APP = [APP, 'http://localhost:3000']

  var RUTAS = {
    pregunta: '/dashboard/chat-evidencia?pregunta=',
    flashcard: '/dashboard/study-queue?nueva=1&frente=',
    caso: '/dashboard/logbook?nuevo=caso',
    calculadora: '/dashboard/calculators?focus=',
    favoritas: '/dashboard/calculators?view=favoritas',
    buscarCalculadora: '/dashboard/calculators?q=',
    estudio: '/dashboard/study',
    vincular: '/dashboard/extension',
    repasar: '/dashboard/study-queue/session',
    flashcards: '/dashboard/study-queue',
  }

  /** Lo que la extensión le pide a la app con su código de vinculación. */
  var API = {
    pacientes: '/api/extension/context',
    captura: '/api/extension/capture',
    flashcard: '/api/extension/flashcard',
    resumen: '/api/extension/resumen',
    calculadoras: '/api/extension/calculadoras',
    vinculaciones: '/api/extension/tokens',
  }

  /**
   * Las que la extensión trae de fábrica, por id, que es lo que la página de
   * calculadoras abre con `focus`. Desde la 0.3.0 son solo el respaldo sin red:
   * lo normal es buscar en las 185 del catálogo de la app
   * (`API.calculadoras`), que la extensión guarda un día.
   */
  var CALCULADORAS = [
    { id: 'glasgow_coma', nombre: 'Glasgow', busca: 'glasgow gcs coma' },
    { id: 'curb65', nombre: 'CURB-65', busca: 'curb65 neumonia' },
    { id: 'qsofa', nombre: 'qSOFA', busca: 'qsofa sepsis' },
    { id: 'sofa', nombre: 'SOFA', busca: 'sofa sepsis uci' },
    { id: 'apgar', nombre: 'Apgar', busca: 'apgar recien nacido' },
    { id: 'wells_dvt', nombre: 'Wells TVP', busca: 'wells tvp trombosis' },
    { id: 'perc', nombre: 'PERC', busca: 'perc tep embolia' },
    { id: 'ckd_epi_2021', nombre: 'CKD-EPI 2021', busca: 'ckd epi tfg creatinina' },
    { id: 'imc_adultos', nombre: 'IMC', busca: 'imc bmi obesidad' },
    { id: 'dosis_pediatrica', nombre: 'Dosis pediátrica', busca: 'dosis pediatrica peso' },
    { id: 'cha2ds2_vasc', nombre: 'CHA₂DS₂-VASc', busca: 'chads cha2ds2 vasc fibrilacion' },
    { id: 'has_bled', nombre: 'HAS-BLED', busca: 'hasbled sangrado anticoagulacion' },
    { id: 'pews', nombre: 'PEWS', busca: 'pews pediatria alerta' },
    { id: 'z_peso_edad', nombre: 'Z peso para la edad', busca: 'zscore peso edad oms' },
    { id: 'nihss_abreviado', nombre: 'NIHSS', busca: 'nihss ictus acv' },
    { id: 'pam', nombre: 'Presión arterial media', busca: 'pam presion arterial media' },
  ]

  /** Una ruta de `RUTAS` con su valor codificado, sobre la app que toque. */
  function enlace(base, ruta, valor) {
    var destino = RUTAS[ruta]
    if (!destino) throw new Error('Ruta desconocida: ' + ruta)
    return (base || APP) + destino + (valor === undefined ? '' : encodeURIComponent(valor))
  }

  /** ¿Es una de las direcciones de la app? */
  function esLaApp(origen) {
    return ORIGENES_DE_LA_APP.indexOf(origen) !== -1
  }

  /** Normaliza para buscar: minúsculas y sin tildes. */
  function normalizar(texto) {
    return String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  }

  /** Todo lo que se puede buscar de una ficha, sea de fábrica (`busca`) o del catálogo de la app. */
  function textoDeBusqueda(c) {
    return normalizar([c.nombre, c.busca, c.descripcion, c.palabras, c.categoria].join(' '))
  }

  /**
   * Las calculadoras que tienen TODAS las palabras escritas, en cualquier orden
   * y en cualquier campo: «presión media» encuentra la presión arterial media.
   * Primero las que EMPIEZAN por lo escrito, después las que lo tienen en el
   * nombre, y al final las que solo lo tienen en la descripción o en sus
   * etiquetas: con 185 calculadoras, «sofa» tiene que dar SOFA antes que qSOFA.
   *
   * `lista` es el catálogo de la app; sin él, las de fábrica.
   */
  function buscarCalculadoras(texto, lista) {
    var todas = lista && lista.length ? lista : CALCULADORAS
    var consulta = normalizar(texto).trim()
    var palabras = consulta.split(/\s+/).filter(Boolean)
    if (!palabras.length) return todas.slice()
    var puntuadas = []
    todas.forEach(function (c, i) {
      var donde = textoDeBusqueda(c)
      if (!palabras.every(function (p) { return donde.indexOf(p) !== -1 })) return
      var nombre = normalizar(c.nombre)
      var puntos = nombre.indexOf(consulta) === 0 ? 0
        : palabras.every(function (p) { return nombre.indexOf(p) !== -1 }) ? 1 : 2
      puntuadas.push({ c: c, puntos: puntos, i: i })
    })
    puntuadas.sort(function (a, b) { return a.puntos - b.puntos || a.i - b.i })
    return puntuadas.map(function (p) { return p.c })
  }

  global.URREAI_ENLACES = {
    APP: APP,
    ORIGENES_DE_LA_APP: ORIGENES_DE_LA_APP,
    RUTAS: RUTAS,
    API: API,
    CALCULADORAS: CALCULADORAS,
    enlace: enlace,
    esLaApp: esLaApp,
    buscarCalculadoras: buscarCalculadoras,
  }
})(typeof self !== 'undefined' ? self : this)
