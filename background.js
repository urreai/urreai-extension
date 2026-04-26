/* UrreAI extension — background service worker */

const API_BASE = 'https://app.urreai.com'
const STORAGE_KEY_TOKEN = 'urreai_token'
const STORAGE_KEY_PATIENT = 'urreai_active_patient'

// ─── Helpers ───────────────────────────────────────────────────────────────

function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve))
}

async function getToken() {
  const { [STORAGE_KEY_TOKEN]: token } = await storageGet([STORAGE_KEY_TOKEN])
  return token || null
}

async function getActivePatient() {
  const { [STORAGE_KEY_PATIENT]: target } = await storageGet([STORAGE_KEY_PATIENT])
  return target || null
}

const STORAGE_KEY_PREFS = 'urreai_prefs'

async function getPreferences() {
  const { [STORAGE_KEY_PREFS]: prefs } = await storageGet([STORAGE_KEY_PREFS])
  return {
    fieldLab:       prefs?.fieldLab       ?? 'objetivo',
    fieldVital:     prefs?.fieldVital     ?? 'objetivo',
    fieldImaging:   prefs?.fieldImaging   ?? 'objetivo',
    fieldNote:      prefs?.fieldNote      ?? 'subjetivo',
    appendToToday:  prefs?.appendToToday  !== false, // default true
    formatLab:      prefs?.formatLab      ?? '',
    formatVital:    prefs?.formatVital    ?? '',
    formatImaging:  prefs?.formatImaging  ?? '',
    saveMode:       prefs?.saveMode       ?? 'save',  // 'save' | 'clipboard' | 'both'
  }
}

/**
 * Copia texto al portapapeles del tab activo. Como el service worker no
 * tiene acceso a navigator.clipboard directo, inyecta un script que lo
 * ejecuta en el contexto de la página.
 */
/**
 * Muestra un mini-dialog en la página activa preguntando si el laboratorio
 * debe guardarse "tal cual" (texto OCR literal) o "interpretado" (con
 * rangos de referencia + nota clínica). Retorna 'raw' | 'interpreted' |
 * 'cancel'. Usado solo para kind='lab' — vitals siempre va interpretado.
 */
async function askLabFormat() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]
    if (!tab) return 'interpreted'
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        return await new Promise(resolve => {
          const prev = document.getElementById('urreai-lab-format-dialog')
          if (prev) prev.remove()
          const root = document.createElement('div')
          root.id = 'urreai-lab-format-dialog'
          root.style.cssText = `
            position:fixed;inset:0;z-index:2147483647;
            background:rgba(15,23,42,0.55);backdrop-filter:blur(2px);
            display:flex;align-items:center;justify-content:center;
            font-family:-apple-system,BlinkMacSystemFont,Inter,system-ui,sans-serif;
          `
          root.innerHTML = `
            <div style="background:#fff;border-radius:16px;padding:20px 22px;max-width:380px;width:90%;box-shadow:0 20px 40px -10px rgba(0,0,0,0.3);">
              <p style="font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#7c3aed;margin:0 0 6px;">UrreAI — Captura de laboratorio</p>
              <h2 style="font-size:17px;font-weight:800;color:#0f172a;margin:0 0 4px;">¿Cómo lo guardo en la nota?</h2>
              <p style="font-size:13px;color:#64748b;margin:0 0 16px;line-height:1.5;">Elige cómo quieres que quede este laboratorio en la historia clínica del paciente.</p>
              <div style="display:flex;flex-direction:column;gap:8px;">
                <button data-choice="interpreted" style="display:flex;flex-direction:column;gap:2px;align-items:flex-start;padding:10px 12px;border:1px solid #c4b5fd;background:#f5f3ff;border-radius:10px;cursor:pointer;text-align:left;">
                  <span style="font-size:13px;font-weight:700;color:#5b21b6;">Interpretado</span>
                  <span style="font-size:11px;color:#6b21a8;">Con valores de referencia + nota clínica (recomendado)</span>
                </button>
                <button data-choice="raw" style="display:flex;flex-direction:column;gap:2px;align-items:flex-start;padding:10px 12px;border:1px solid #cbd5e1;background:#fff;border-radius:10px;cursor:pointer;text-align:left;">
                  <span style="font-size:13px;font-weight:700;color:#334155;">Tal cual</span>
                  <span style="font-size:11px;color:#64748b;">Solo los valores, sin interpretación</span>
                </button>
                <button data-choice="cancel" style="padding:8px;border:none;background:transparent;color:#94a3b8;cursor:pointer;font-size:12px;margin-top:4px;">Cancelar</button>
              </div>
            </div>
          `
          const done = (v) => { root.remove(); resolve(v) }
          root.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-choice]')
            if (btn) done(btn.getAttribute('data-choice'))
            else if (e.target === root) done('cancel')
          })
          document.addEventListener('keydown', function esc(e) {
            if (e.key === 'Escape') { document.removeEventListener('keydown', esc); done('cancel') }
          })
          document.body.appendChild(root)
        })
      },
    })
    return result || 'interpreted'
  } catch (err) {
    console.warn('[UrreAI] askLabFormat injection failed, defaulting to interpreted:', err)
    return 'interpreted'
  }
}

async function copyToClipboardFromTab(text) {
  if (!text) return
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]
    if (!tab) return
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [text],
      func: async (txt) => {
        try {
          await navigator.clipboard.writeText(txt)
        } catch {
          // Fallback: textarea + execCommand (más viejo pero funciona sin permisos)
          const ta = document.createElement('textarea')
          ta.value = txt
          ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;'
          document.body.appendChild(ta)
          ta.select()
          try { document.execCommand('copy') } catch {}
          ta.remove()
        }
      },
    })
  } catch (err) { console.error('[UrreAI] copyToClipboard fail:', err) }
}

async function apiPost(path, body) {
  const token = await getToken()
  if (!token) throw new Error('Sin sesión. Abre la extensión y vincula tu cuenta.')

  // Inyectar preferencias automáticamente en capturas
  if (path === '/api/extension/capture' && body && typeof body === 'object') {
    const prefs = await getPreferences()
    if (!('field' in body)) {
      body.field =
        body.kind === 'lab'     ? prefs.fieldLab :
        body.kind === 'vital'   ? prefs.fieldVital :
        body.kind === 'imaging' ? prefs.fieldImaging :
        prefs.fieldNote
    }
    if (!('appendToTodayNote' in body)) body.appendToTodayNote = prefs.appendToToday
    if (!('format' in body) && body.kind) {
      body.format =
        body.kind === 'lab'     ? prefs.formatLab :
        body.kind === 'vital'   ? prefs.formatVital :
        body.kind === 'imaging' ? prefs.formatImaging :
        ''
    }
    if (!('saveMode' in body)) body.saveMode = prefs.saveMode
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.success) throw new Error(data.error || `Error ${res.status}`)

  // Si el API devolvió texto para clipboard, copiarlo automáticamente.
  if (data?.data?.clipboardText) {
    await copyToClipboardFromTab(data.data.clipboardText)
  }

  return data
}

// ─── Context menus ─────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  try { chrome.contextMenus.removeAll() } catch {}
  // Menu al seleccionar texto
  chrome.contextMenus.create({
    id: 'urreai-save-selection',
    title: 'UrreAI: Guardar selección como nota',
    contexts: ['selection'],
  })
  // Menu al hacer click derecho en una imagen
  chrome.contextMenus.create({
    id: 'urreai-capture-image-lab',
    title: 'UrreAI: Capturar imagen como laboratorio',
    contexts: ['image'],
  })
  chrome.contextMenus.create({
    id: 'urreai-capture-image-vital',
    title: 'UrreAI: Capturar imagen como signo vital',
    contexts: ['image'],
  })
  chrome.contextMenus.create({
    id: 'urreai-capture-image-imaging',
    title: 'UrreAI: Capturar imagen como reporte de imagen',
    contexts: ['image'],
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const target = await getActivePatient()

  // Guardar seleccion como nota
  if (info.menuItemId === 'urreai-save-selection') {
    const text = (info.selectionText || '').trim()
    if (!text) return
    if (!target) { notify('Primero selecciona un paciente en la extensión.', 'error'); return }
    try {
      await apiPost('/api/extension/capture', { kind: 'note', target, text, sourceUrl: tab?.url || '' })
      notify('Nota guardada en UrreAI.', 'ok')
    } catch (err) { notify(err.message || 'Error guardando la nota.', 'error') }
    return
  }

  // Capturar imagen directa (sin selector de region) como lab, vital o imaging
  if (
    info.menuItemId === 'urreai-capture-image-lab' ||
    info.menuItemId === 'urreai-capture-image-vital' ||
    info.menuItemId === 'urreai-capture-image-imaging'
  ) {
    if (!target) { notify('Primero selecciona un paciente en la extensión.', 'error'); return }
    const kind =
      info.menuItemId === 'urreai-capture-image-lab'     ? 'lab' :
      info.menuItemId === 'urreai-capture-image-imaging' ? 'imaging' :
      'vital'
    const srcUrl = info.srcUrl
    if (!srcUrl) { notify('No se encontró la imagen.', 'error'); return }
    try {
      // Para laboratorios, preguntar si es "tal cual" o "interpretado"
      // ANTES de descargar y enviar. Así si el user cancela no gastamos
      // IA en backend.
      let labMode = null
      if (kind === 'lab') {
        labMode = await askLabFormat()
        if (labMode === 'cancel') { notify('Captura cancelada.', 'ok'); return }
      }
      // Descargar la imagen como dataURL (el service worker puede hacer fetch)
      const res = await fetch(srcUrl)
      if (!res.ok) throw new Error(`No se pudo descargar la imagen (${res.status})`)
      const blob = await res.blob()
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      const body = {
        kind, target,
        imageDataUrl: dataUrl,
        sourceUrl: tab?.url || srcUrl,
      }
      if (labMode) body.labMode = labMode
      await apiPost('/api/extension/capture', body)
      const label =
        kind === 'lab'     ? `laboratorio (${labMode === 'raw' ? 'tal cual' : 'interpretado'})` :
        kind === 'imaging' ? 'reporte de imagen' :
        'signos vitales'
      notify(`Imagen enviada a UrreAI como ${label}.`, 'ok')
    } catch (err) { notify(err.message || 'Error procesando imagen.', 'error') }
    return
  }
})

// ─── Omnibox: escribe "urreai <query>" en la barra de direcciones ──────────

chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  const q = (text || '').trim()
  // Lista curada de sugerencias. El campo `q` debe coincidir con un tag o
  // substring del nombre en CALCULATORS de
  // urreai-app/src/app/(dashboard)/dashboard/calculators/page.tsx
  // (el filtro de la app hace `tags.some(t => t.includes(q.toLowerCase()))`).
  // Si cambias un tag en la app, actualiza también esta lista.
  const allCalcs = [
    { name: 'Glasgow Coma Scale', q: 'glasgow' },
    { name: 'CURB-65 (Neumonía)', q: 'curb65' },
    { name: 'qSOFA (Sepsis)', q: 'qsofa' },
    { name: 'SOFA', q: 'sofa' },
    { name: 'Apgar (Recién nacido)', q: 'apgar' },
    { name: 'Wells TVP', q: 'wells' },
    { name: 'PERC Rule (descarte TEP)', q: 'perc' },
    { name: 'TFG (CKD-EPI)', q: 'tfg' },
    { name: 'IMC / BMI', q: 'imc' },
    { name: 'Dosis Pediátrica por peso', q: 'dosis' },
    { name: 'CHA₂DS₂-VASc', q: 'chads' },
    { name: 'HAS-BLED', q: 'hasbled' },
    { name: 'PEWS (Pediatric Early Warning)', q: 'pews' },
    { name: 'Z-score OMS (Peso/Talla)', q: 'zscore' },
    { name: 'NIHSS (ACV)', q: 'nihss' },
    { name: 'PAM (Presión Arterial Media)', q: 'pam' },
  ]
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const qNorm = norm(q)
  const matches = qNorm
    ? allCalcs.filter(c => norm(c.name).includes(qNorm) || norm(c.q).includes(qNorm))
    : allCalcs.slice(0, 6)

  const suggestions = matches.slice(0, 8).map(c => ({
    // content: lo que se envía a onInputEntered al seleccionar la sugerencia.
    // Usamos un prefijo "__calc__" + el query corto, así onInputEntered sabe
    // que es un calc preseleccionado y manda el query corto (que SÍ matchea
    // con los tags de la app). Antes mandaba el name completo, que no
    // matcheaba ningún tag y mostraba lista vacía.
    content: `__calc__${c.q}`,
    description: `<match>${escXml(c.name)}</match> <dim>— abrir en UrreAI</dim>`,
  }))
  // Opcion extra: abrir página completa con búsqueda libre
  if (q) {
    suggestions.push({
      content: `__search__${q}`,
      description: `Buscar <match>${escXml(q)}</match> en todas las calculadoras`,
    })
  }
  suggest(suggestions)
})

chrome.omnibox.onInputEntered.addListener((input) => {
  let url
  if (input.startsWith('__calc__')) {
    const q = input.slice('__calc__'.length)
    url = `${API_BASE}/dashboard/calculators?q=${encodeURIComponent(q)}`
  } else if (input.startsWith('__search__')) {
    const q = input.slice('__search__'.length)
    url = `${API_BASE}/dashboard/calculators?q=${encodeURIComponent(q)}`
  } else {
    // Texto libre escrito por el usuario sin seleccionar sugerencia.
    url = `${API_BASE}/dashboard/calculators?q=${encodeURIComponent(input)}`
  }
  chrome.tabs.create({ url })
})

function escXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ─── Commands (atajos de teclado) ──────────────────────────────────────────
// Ctrl+Shift+L / Ctrl+Shift+I — capturar lab/vital directamente sobre la
// pestaña activa, sin necesidad de abrir el popup.

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'capture-lab' && command !== 'capture-vital' && command !== 'capture-imaging') return
  const captureType =
    command === 'capture-lab'     ? 'lab' :
    command === 'capture-imaging' ? 'imaging' :
    'vital'

  const target = await getActivePatient()
  if (!target) {
    // Sin paciente activo no hay donde guardar. Abrimos el popup para
    // que el usuario elija uno.
    try { await chrome.action.openPopup() } catch {}
    return
  }

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]
    if (!tab) return

    // Guardar contexto para el content script
    await chrome.storage.local.set({
      urreai_capture: { captureType, target, tabId: tab.id },
    })

    // Inyectar overlay de seleccion de region
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content/capture-overlay.css'],
    })
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/capture-overlay.js'],
    })
  } catch (err) {
    console.error('[UrreAI] capture command failed:', err)
  }
})

function notify(text, type) {
  // Fallback silencioso — extension notifications requieren permiso extra
  console.log(`[UrreAI ${type}] ${text}`)
}

// ─── Capture flow ──────────────────────────────────────────────────────────
// El popup envia START_CAPTURE con el tipo (lab/vital) y target.
// Inyectamos el overlay en el tab activo; el content script pide el
// screenshot via mensaje, recorta la region seleccionada y llama al API.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_CAPTURE') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
        const tab = tabs[0]
        if (!tab) throw new Error('No hay pestaña activa')

        // Guardar contexto de captura para que el content script lo use
        await chrome.storage.local.set({
          urreai_capture: { captureType: msg.captureType, target: msg.target, tabId: tab.id },
        })

        // Inyectar overlay
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content/capture-overlay.css'],
        })
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/capture-overlay.js'],
        })
        sendResponse({ ok: true })
      } catch (err) {
        sendResponse({ error: err.message || String(err) })
      }
    })()
    return true // async sendResponse
  }

  if (msg.type === 'CAPTURE_REGION') {
    (async () => {
      try {
        const { region } = msg  // { x, y, width, height, devicePixelRatio }
        const { urreai_capture: ctx } = await storageGet(['urreai_capture'])
        if (!ctx) throw new Error('Contexto de captura perdido')

        // Tomar screenshot del viewport
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
        const tab = tabs[0]
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })

        // Recortar la region seleccionada usando un OffscreenCanvas
        const croppedDataUrl = await cropImage(dataUrl, region)

        // Para laboratorios, preguntar si es "tal cual" o "interpretado"
        let labMode = null
        if (ctx.captureType === 'lab') {
          labMode = await askLabFormat()
          if (labMode === 'cancel') {
            await chrome.storage.local.remove(['urreai_capture'])
            sendResponse({ ok: true, cancelled: true })
            return
          }
        }

        // Subir al backend
        const body = {
          kind: ctx.captureType,  // 'lab' | 'vital'
          target: ctx.target,
          imageDataUrl: croppedDataUrl,
          sourceUrl: tab.url,
        }
        if (labMode) body.labMode = labMode
        const response = await apiPost('/api/extension/capture', body)

        await chrome.storage.local.remove(['urreai_capture'])
        sendResponse({ ok: true, data: response.data, labMode })
      } catch (err) {
        sendResponse({ error: err.message || String(err) })
      }
    })()
    return true
  }

  if (msg.type === 'CAPTURE_CANCELLED') {
    chrome.storage.local.remove(['urreai_capture'])
    sendResponse({ ok: true })
    return
  }
})

async function cropImage(dataUrl, region) {
  // En service worker usamos OffscreenCanvas + createImageBitmap
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  const bmp = await createImageBitmap(blob)

  const dpr = region.devicePixelRatio || 1
  const sx = Math.max(0, Math.round(region.x * dpr))
  const sy = Math.max(0, Math.round(region.y * dpr))
  const sw = Math.max(1, Math.round(region.width * dpr))
  const sh = Math.max(1, Math.round(region.height * dpr))

  const canvas = new OffscreenCanvas(sw, sh)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh)
  const outBlob = await canvas.convertToBlob({ type: 'image/png' })

  // Convertir blob a dataURL para subir
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(outBlob)
  })
}
