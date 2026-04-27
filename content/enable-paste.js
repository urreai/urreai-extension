/* UrreAI — fuerza pegado en campos bloqueados por JS */
/* Estrategia: intercepta Ctrl+V en captura e inserta el texto directamente
   sin disparar el evento paste, evitando los listeners que lo bloquean. */

(function () {
  if (window.__urreaiPasteEnabled) return
  window.__urreaiPasteEnabled = true

  document.addEventListener('keydown', function (e) {
    // Solo Ctrl+V (Windows/Linux) o Cmd+V (Mac)
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'v') return
    if (e.shiftKey || e.altKey) return

    const el = document.activeElement
    if (!el) return

    const isInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
    const isEditable = el.isContentEditable || el.getAttribute('contenteditable') === 'true'
    if (!isInput && !isEditable) return

    // Leer el portapapeles antes de cancelar el evento nativo
    navigator.clipboard.readText().then(function (text) {
      if (!text) return

      if (isInput) {
        const input = /** @type {HTMLInputElement|HTMLTextAreaElement} */ (el)
        const start = input.selectionStart ?? input.value.length
        const end   = input.selectionEnd   ?? input.value.length
        input.value = input.value.slice(0, start) + text + input.value.slice(end)
        input.selectionStart = input.selectionEnd = start + text.length
        // Notificar al framework (React, Vue, jQuery) del cambio
        input.dispatchEvent(new Event('input',  { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      } else {
        // Campo contenteditable (ej: rich-text editor)
        document.execCommand('insertText', false, text)
      }
    }).catch(function () {
      // Sin permiso de portapapeles — dejar que el navegador maneje el paste normal
    })

    // Cancelar el evento nativo para que el navegador no dispare
    // el evento 'paste' que el sitio bloquea
    e.preventDefault()
    e.stopImmediatePropagation()

  }, true /* captura: antes de cualquier listener del sitio */)
})()
