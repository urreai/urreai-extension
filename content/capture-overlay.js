/* UrreAI — content script: overlay de seleccion de region para screenshot */

(function () {
  // Evitar doble inyeccion
  if (window.__urreaiCaptureActive) return
  window.__urreaiCaptureActive = true

  // Contenedor fullscreen
  const overlay = document.createElement('div')
  overlay.className = 'urreai-capture-overlay'
  overlay.innerHTML = `
    <div class="urreai-capture-hint">
      <strong>Arrastra</strong> para seleccionar la región · <kbd>Esc</kbd> cancelar
    </div>
    <div class="urreai-capture-rect" style="display:none"></div>
  `
  document.documentElement.appendChild(overlay)

  const rect = overlay.querySelector('.urreai-capture-rect')
  let startX = 0, startY = 0, isDragging = false

  function cleanup() {
    window.__urreaiCaptureActive = false
    overlay.remove()
    document.removeEventListener('keydown', onKey, true)
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      cleanup()
      chrome.runtime.sendMessage({ type: 'CAPTURE_CANCELLED' })
    }
  }
  document.addEventListener('keydown', onKey, true)

  overlay.addEventListener('mousedown', e => {
    if (e.button !== 0) return
    isDragging = true
    startX = e.clientX
    startY = e.clientY
    rect.style.display = 'block'
    rect.style.left = startX + 'px'
    rect.style.top = startY + 'px'
    rect.style.width = '0px'
    rect.style.height = '0px'
    e.preventDefault()
  })

  overlay.addEventListener('mousemove', e => {
    if (!isDragging) return
    const x = Math.min(startX, e.clientX)
    const y = Math.min(startY, e.clientY)
    const w = Math.abs(e.clientX - startX)
    const h = Math.abs(e.clientY - startY)
    rect.style.left = x + 'px'
    rect.style.top = y + 'px'
    rect.style.width = w + 'px'
    rect.style.height = h + 'px'
  })

  overlay.addEventListener('mouseup', async e => {
    if (!isDragging) return
    isDragging = false

    const x = Math.min(startX, e.clientX)
    const y = Math.min(startY, e.clientY)
    const w = Math.abs(e.clientX - startX)
    const h = Math.abs(e.clientY - startY)

    if (w < 20 || h < 20) {
      // muy pequeño, cancelar
      rect.style.display = 'none'
      return
    }

    // Mostrar estado "procesando"
    const hint = overlay.querySelector('.urreai-capture-hint')
    hint.innerHTML = '<span class="urreai-capture-spinner"></span> Procesando captura…'
    rect.style.borderColor = '#10B981'
    rect.style.background = 'rgba(16, 185, 129, 0.15)'

    // Ocultar overlay de display (para que chrome.tabs.captureVisibleTab no lo incluya)
    // pero mantenemos el processing indicator
    overlay.style.background = 'transparent'
    rect.style.display = 'none'
    hint.style.display = 'none'

    // Darle un frame al browser para que pinte
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))

    chrome.runtime.sendMessage({
      type: 'CAPTURE_REGION',
      region: {
        x, y, width: w, height: h,
        devicePixelRatio: window.devicePixelRatio || 1,
      },
    }, response => {
      cleanup()
      // Notificacion simple al usuario
      if (response?.error) {
        showToast('⚠ ' + response.error, 'err')
      } else {
        showToast('✓ Captura guardada en UrreAI', 'ok')
      }
    })
  })

  function showToast(text, type) {
    const toast = document.createElement('div')
    toast.className = 'urreai-capture-toast urreai-capture-toast--' + type
    toast.textContent = text
    document.documentElement.appendChild(toast)
    setTimeout(() => toast.remove(), 4000)
  }
})()
