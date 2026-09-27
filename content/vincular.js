/* UrreAI — vincular con un clic, desde la página de la extensión en la app.
 *
 * Corre en las páginas de la app y en ninguna otra (ver `content_scripts` en
 * el manifiesto). No en todas por gusto: la app cambia de página sin recargar,
 * y un script declarado solo para `/dashboard/extension` no se inyecta cuando
 * el estudiante llega ahí desde el menú. Es pasivo: no lee la página, solo
 * contesta a sus mensajes. Hace dos cosas:
 *
 *   1. Le dice a la página que la extensión está instalada, su versión y si
 *      ya está vinculada, para que la página ofrezca el botón en vez de las
 *      instrucciones de instalar.
 *   2. Recibe el código cuando el estudiante pulsa «Vincular» y se lo pasa al
 *      fondo, que lo comprueba contra la app antes de guardarlo.
 *
 * Antes había que generar el código, copiarlo, abrir el popup y pegarlo. Con
 * esto es un clic, y el código no pasa por el portapapeles.
 *
 * Los mensajes son los de `urreai-app/src/lib/extension/vinculacion.ts`. Solo
 * se aceptan los de la propia página (`event.source === window` y el mismo
 * origen): un iframe de otro sitio no puede hablarle a este script.
 */
;(function () {
  'use strict'
  if (window.__urreaiVincular) return
  window.__urreaiVincular = true

  var VERSION = chrome.runtime.getManifest().version

  function aLaPagina(mensaje) {
    mensaje.urreai = 'extension'
    window.postMessage(mensaje, window.location.origin)
  }

  function anunciarse() {
    chrome.storage.local.get(['urreai_token'], function (datos) {
      aLaPagina({ tipo: 'presente', version: VERSION, vinculada: Boolean(datos && datos.urreai_token) })
    })
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window || event.origin !== window.location.origin) return
    var d = event.data
    if (!d || d.urreai !== 'app') return

    if (d.tipo === 'hola') {
      anunciarse()
      return
    }
    if (d.tipo === 'vincular' && typeof d.token === 'string') {
      chrome.runtime.sendMessage({ type: 'VINCULAR', token: d.token }, function (respuesta) {
        var error = chrome.runtime.lastError ? chrome.runtime.lastError.message : (respuesta && respuesta.error)
        aLaPagina({ tipo: 'resultado', ok: Boolean(respuesta && respuesta.ok), error: error || '' })
      })
    }
  })

  anunciarse()
})()
