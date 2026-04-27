/* UrreAI — fuerza pegado en campos bloqueados por JS */

(function () {
  if (window.__urreaiPasteEnabled) return
  window.__urreaiPasteEnabled = true

  document.addEventListener('paste', function (e) {
    var el = e.target
    if (!el) return

    var isInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
    var isEditable = el.isContentEditable || el.getAttribute('contenteditable') === 'true'
    if (!isInput && !isEditable) return

    // Leer el texto del portapapeles SINCRÓNICAMENTE desde el evento
    var text = (e.clipboardData || window.clipboardData || {getData: function(){return ''}}).getData('text/plain')

    // Bloquear todos los handlers del sitio Y el paste nativo del navegador
    e.stopImmediatePropagation()
    e.preventDefault()

    if (!text) return

    // Insertar manualmente en input/textarea
    if (isInput) {
      var start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length
      var end   = typeof el.selectionEnd   === 'number' ? el.selectionEnd   : el.value.length
      el.value = el.value.slice(0, start) + text + el.value.slice(end)
      el.selectionStart = el.selectionEnd = start + text.length
      el.dispatchEvent(new Event('input',  {bubbles: true}))
      el.dispatchEvent(new Event('change', {bubbles: true}))
      return
    }

    // Insertar en contenteditable
    if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
      document.execCommand('insertText', false, text)
    }

  }, true /* captura: se ejecuta ANTES que cualquier listener del sitio */)

})()
