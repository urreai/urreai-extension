/* UrreAI — rehabilita pegar en campos bloqueados por JS (sin tocar el DOM) */

(function () {
  if (window.__urreaiPasteEnabled) return
  window.__urreaiPasteEnabled = true

  // Hace que preventDefault() sea un no-op para paste/copy/cut.
  // Cualquier listener del sitio que llame event.preventDefault() para
  // bloquear el pegado simplemente no tiene efecto.
  // No clona ni modifica nodos del DOM — seguro con React, Angular, Vue.
  const orig = Event.prototype.preventDefault
  Event.prototype.preventDefault = function () {
    if (this.type === 'paste' || this.type === 'copy' || this.type === 'cut') return
    return orig.call(this)
  }
})()
