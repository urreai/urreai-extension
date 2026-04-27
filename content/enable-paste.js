/* UrreAI — content script: rehabilita pegar en campos bloqueados por JS */

(function () {
  if (window.__urreaiPasteEnabled) return
  window.__urreaiPasteEnabled = true

  function unlockField(el) {
    // Clona el nodo para eliminar todos los event listeners registrados
    // (incluyendo los que bloquean paste/copy/cut vía addEventListener)
    const clone = el.cloneNode(true)
    el.parentNode.replaceChild(clone, el)

    // Por si el sitio usa atributos inline onpaste=""
    clone.removeAttribute('onpaste')
    clone.removeAttribute('oncopy')
    clone.removeAttribute('oncut')

    // Fuerza que paste funcione anulando cualquier handler que pueda añadirse
    // después vía event delegation en document/body
    clone.addEventListener('paste', function (e) { e.stopImmediatePropagation() }, true)
    clone.addEventListener('copy',  function (e) { e.stopImmediatePropagation() }, true)
    clone.addEventListener('cut',   function (e) { e.stopImmediatePropagation() }, true)
  }

  function unlockAll() {
    document.querySelectorAll('input, textarea, [contenteditable]').forEach(unlockField)
  }

  // Desbloquea elementos ya presentes
  unlockAll()

  // Desbloquea elementos que aparezcan después (SPAs, modales)
  const observer = new MutationObserver(function (mutations) {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue
        if (['INPUT', 'TEXTAREA'].includes(node.tagName) || node.getAttribute?.('contenteditable')) {
          unlockField(node)
        }
        node.querySelectorAll?.('input, textarea, [contenteditable]').forEach(unlockField)
      }
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })

  // Elimina handlers a nivel document que bloqueen paste en captura
  document.addEventListener('paste', function (e) { e.stopImmediatePropagation() }, true)
  document.addEventListener('copy',  function (e) { e.stopImmediatePropagation() }, true)
  document.addEventListener('cut',   function (e) { e.stopImmediatePropagation() }, true)
})()
