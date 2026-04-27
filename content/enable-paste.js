/* UrreAI — desbloquea pegado en páginas que lo impiden
 *
 * Técnica de "Don't F**k With Paste": registra un listener en capture phase
 * sobre document. Al dispararse ANTES que cualquier handler de la página,
 * llama stopImmediatePropagation() para que ningún handler pueda llamar
 * preventDefault() y bloquear el clipboard. El navegador ejecuta el paste
 * nativo normalmente — sin manipular el DOM ni el texto manualmente.
 */

;(function () {
  if (window.__urreaiPasteEnabled) return
  window.__urreaiPasteEnabled = true

  document.addEventListener('paste', function (e) { e.stopImmediatePropagation() }, true)
  document.addEventListener('copy',  function (e) { e.stopImmediatePropagation() }, true)
  document.addEventListener('cut',   function (e) { e.stopImmediatePropagation() }, true)
})()
