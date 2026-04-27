/* UrreAI — desbloquea pegado en páginas que lo impiden
 *
 * Implementación robusta que cubre 5 técnicas de bloqueo usadas por
 * historias clínicas institucionales y otros sistemas restrictivos:
 *  1. Capture phase en document — intercepta ANTES de handlers de la página
 *  2. Override de addEventListener — bloquea registro futuro de handlers de paste/copy/cut
 *  3. MutationObserver — limpia onpaste/oncopy/oncut en elementos nuevos
 *  4. Limpieza de elementos existentes (onpaste=null, readonly dinámico)
 *  5. CSS injection — habilita user-select en todos los elementos
 */

;(function () {
  'use strict'

  if (window.__urreaiPasteEnabled) return
  window.__urreaiPasteEnabled = true

  // 1. Capture phase en document para interceptar ANTES de handlers de la página
  document.addEventListener('paste', function (e) { e.stopImmediatePropagation() }, { capture: true, passive: false })
  document.addEventListener('copy',  function (e) { e.stopImmediatePropagation() }, { capture: true, passive: false })
  document.addEventListener('cut',   function (e) { e.stopImmediatePropagation() }, { capture: true, passive: false })

  // 2. Override de addEventListener para bloquear registro futuro de handlers de paste/copy/cut
  const origAddEventListener = EventTarget.prototype.addEventListener
  EventTarget.prototype.addEventListener = function (type, handler, options) {
    if (type === 'paste' || type === 'copy' || type === 'cut') {
      return // ignorar intentos de bloquear paste/copy/cut
    }
    return origAddEventListener.call(this, type, handler, options)
  }

  // 3. Limpiar onpaste/oncopy/oncut en un elemento y habilitar si tenía readonly dinámico
  function enablePasteOnElement(el) {
    if (!el || el.nodeType !== 1) return
    const tag = el.tagName
    const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || el.contentEditable === 'true'
    if (!isEditable) return
    el.onpaste = null
    el.oncopy  = null
    el.oncut   = null
    // Remover readonly solo si no era readonly desde el HTML original
    if (el.readOnly && el.getAttribute('data-originally-readonly') === null) {
      el.readOnly = false
    }
  }

  // Aplicar a elementos ya presentes en el DOM
  document.querySelectorAll('input, textarea, [contenteditable]').forEach(enablePasteOnElement)

  // 4. Observer para elementos nuevos que se agreguen al DOM
  const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return
        enablePasteOnElement(node)
        if (node.querySelectorAll) {
          node.querySelectorAll('input, textarea, [contenteditable]').forEach(enablePasteOnElement)
        }
      })
    })
  })

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  })

  // 5. CSS para habilitar selección de texto en toda la página
  const style = document.createElement('style')
  style.textContent = '* { -webkit-user-select: text !important; user-select: text !important; }'
  ;(document.head || document.documentElement).appendChild(style)

})()
