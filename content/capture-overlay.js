/* UrreAI — recorte de una región de la pantalla para capturarla.
 *
 * Se inyecta solo cuando el estudiante pide una captura. Dibuja una capa encima
 * de la página, deja arrastrar un rectángulo y le pasa sus coordenadas al fondo,
 * que toma la foto de la pestaña y la recorta.
 *
 * El aviso del final dice lo que de verdad pasó, con el texto que devuelve el
 * fondo: hasta la 0.2.0 decía «Captura guardada en UrreAI» también cuando no se
 * había guardado nada (en Mi ronda, los signos vitales se copian y no se guardan).
 */
;(function () {
  'use strict'
  if (window.__urreaiCaptureActive) return
  window.__urreaiCaptureActive = true

  var capa = document.createElement('div')
  capa.className = 'urreai-capture-overlay'
  capa.innerHTML =
    '<div class="urreai-capture-hint"><strong>Arrastra</strong> sobre lo que quieres capturar · <kbd>Esc</kbd> para cancelar</div>' +
    '<div class="urreai-capture-rect" style="display:none"></div>'
  document.documentElement.appendChild(capa)

  var marco = capa.querySelector('.urreai-capture-rect')
  var inicioX = 0
  var inicioY = 0
  var arrastrando = false
  var leyendo = null

  function alRecibir(mensaje) {
    // La foto ya está tomada: se puede enseñar que está leyendo sin salir en ella.
    if (mensaje && mensaje.type === 'CAPTURA_TOMADA' && !leyendo) {
      leyendo = aviso('Leyendo la captura…', 'info', 0)
    }
  }
  chrome.runtime.onMessage.addListener(alRecibir)

  function terminar() {
    window.__urreaiCaptureActive = false
    capa.remove()
    document.removeEventListener('keydown', alTeclear, true)
    chrome.runtime.onMessage.removeListener(alRecibir)
  }

  function alTeclear(e) {
    if (e.key === 'Escape') {
      terminar()
      chrome.runtime.sendMessage({ type: 'CAPTURE_CANCELLED' })
    }
  }
  document.addEventListener('keydown', alTeclear, true)

  capa.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return
    arrastrando = true
    capa.classList.add('urreai-capture-overlay--arrastrando')
    inicioX = e.clientX
    inicioY = e.clientY
    marco.style.display = 'block'
    marco.style.left = inicioX + 'px'
    marco.style.top = inicioY + 'px'
    marco.style.width = '0px'
    marco.style.height = '0px'
    e.preventDefault()
  })

  capa.addEventListener('mousemove', function (e) {
    if (!arrastrando) return
    marco.style.left = Math.min(inicioX, e.clientX) + 'px'
    marco.style.top = Math.min(inicioY, e.clientY) + 'px'
    marco.style.width = Math.abs(e.clientX - inicioX) + 'px'
    marco.style.height = Math.abs(e.clientY - inicioY) + 'px'
  })

  capa.addEventListener('mouseup', function (e) {
    if (!arrastrando) return
    arrastrando = false
    var x = Math.min(inicioX, e.clientX)
    var y = Math.min(inicioY, e.clientY)
    var ancho = Math.abs(e.clientX - inicioX)
    var alto = Math.abs(e.clientY - inicioY)
    if (ancho < 20 || alto < 20) {
      marco.style.display = 'none'
      capa.classList.remove('urreai-capture-overlay--arrastrando')
      return
    }

    // La capa sale de la foto: se esconde entera antes de que el fondo la tome.
    capa.style.visibility = 'hidden'
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        chrome.runtime.sendMessage({
          type: 'CAPTURE_REGION',
          region: { x: x, y: y, width: ancho, height: alto, devicePixelRatio: window.devicePixelRatio || 1 },
        }, function (respuesta) {
          if (leyendo) leyendo.remove()
          terminar()
          var error = chrome.runtime.lastError ? chrome.runtime.lastError.message : (respuesta && respuesta.error)
          if (error) aviso(error, 'error', 7000)
          else aviso((respuesta && respuesta.texto) || 'Listo.', 'ok', 5000)
        })
      })
    })
  })

  function aviso(texto, tipo, duracion) {
    var caja = document.createElement('div')
    caja.className = 'urreai-capture-toast urreai-capture-toast--' + tipo
    caja.setAttribute('role', 'status')
    caja.textContent = texto
    document.documentElement.appendChild(caja)
    if (duracion) setTimeout(function () { caja.remove() }, duracion)
    return caja
  }
})()
