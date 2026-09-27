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
  }

  /** Por id, que es lo que la página de calculadoras abre con `focus`. */
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

  /**
   * Las calculadoras que tienen TODAS las palabras escritas, en su nombre o en
   * sus palabras de búsqueda y en cualquier orden: «presión media» encuentra la
   * presión arterial media.
   */
  function buscarCalculadoras(texto) {
    var palabras = normalizar(texto).split(/\s+/).filter(Boolean)
    if (!palabras.length) return CALCULADORAS.slice()
    return CALCULADORAS.filter(function (c) {
      var donde = normalizar(c.nombre + ' ' + c.busca)
      return palabras.every(function (p) { return donde.indexOf(p) !== -1 })
    })
  }

  global.URREAI_ENLACES = {
    APP: APP,
    ORIGENES_DE_LA_APP: ORIGENES_DE_LA_APP,
    RUTAS: RUTAS,
    CALCULADORAS: CALCULADORAS,
    enlace: enlace,
    esLaApp: esLaApp,
    buscarCalculadoras: buscarCalculadoras,
  }
})(typeof self !== 'undefined' ? self : this)
