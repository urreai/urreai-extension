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

async function apiPost(path, body) {
  const token = await getToken()
  if (!token) throw new Error('Sin sesión. Abre la extensión y vincula tu cuenta.')
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.success) throw new Error(data.error || `Error ${res.status}`)
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

  // Capturar imagen directa (sin selector de region) como lab o vital
  if (info.menuItemId === 'urreai-capture-image-lab' || info.menuItemId === 'urreai-capture-image-vital') {
    if (!target) { notify('Primero selecciona un paciente en la extensión.', 'error'); return }
    const kind = info.menuItemId === 'urreai-capture-image-lab' ? 'lab' : 'vital'
    const srcUrl = info.srcUrl
    if (!srcUrl) { notify('No se encontró la imagen.', 'error'); return }
    try {
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
      await apiPost('/api/extension/capture', {
        kind, target,
        imageDataUrl: dataUrl,
        sourceUrl: tab?.url || srcUrl,
      })
      notify(`Imagen enviada a UrreAI como ${kind === 'lab' ? 'laboratorio' : 'signos vitales'}.`, 'ok')
    } catch (err) { notify(err.message || 'Error procesando imagen.', 'error') }
    return
  }
})

// ─── Omnibox: escribe "urreai <query>" en la barra de direcciones ──────────

chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  const q = (text || '').trim()
  // Lista curada de sugerencias según lo que escriba el usuario
  const allCalcs = [
    { name: 'Glasgow Coma Scale', slug: 'glasgow' },
    { name: 'CURB-65 (Neumonía)', slug: 'curb-65' },
    { name: 'qSOFA (Sepsis)', slug: 'qsofa' },
    { name: 'SOFA', slug: 'sofa' },
    { name: 'Apgar (Recién nacido)', slug: 'apgar' },
    { name: 'Wells DVT', slug: 'wells-dvt' },
    { name: 'Wells TEP', slug: 'wells-tep' },
    { name: 'TFG (CKD-EPI)', slug: 'tfg-ckd-epi' },
    { name: 'IMC / BMI', slug: 'imc' },
    { name: 'Dosis Pediátrica por peso', slug: 'dosis-peds' },
    { name: 'CHA₂DS₂-VASc', slug: 'cha2ds2-vasc' },
    { name: 'HAS-BLED', slug: 'has-bled' },
    { name: 'Bristol (Heces)', slug: 'bristol' },
    { name: 'PEWS (Pediatric Early Warning)', slug: 'pews' },
    { name: 'Z-scores OMS (Peso/Talla)', slug: 'z-scores' },
    { name: 'NIHSS (ACV)', slug: 'nihss' },
    { name: 'Índice Shock', slug: 'indice-shock' },
  ]
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const qNorm = norm(q)
  const matches = qNorm
    ? allCalcs.filter(c => norm(c.name).includes(qNorm) || norm(c.slug).includes(qNorm))
    : allCalcs.slice(0, 6)

  const suggestions = matches.slice(0, 8).map(c => ({
    content: c.name,
    description: `<match>${escXml(c.name)}</match> <dim>— abrir en UrreAI</dim>`,
  }))
  // Opcion extra: abrir página completa con búsqueda
  if (q) {
    suggestions.push({
      content: `__search__${q}`,
      description: `Buscar <match>${escXml(q)}</match> en todas las 205 calculadoras`,
    })
  }
  suggest(suggestions)
})

chrome.omnibox.onInputEntered.addListener((input) => {
  let url
  if (input.startsWith('__search__')) {
    const q = input.slice(10)
    url = `${API_BASE}/dashboard/calculators?q=${encodeURIComponent(q)}`
  } else {
    // Usa el texto como query contra la calculadoras
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

        // Subir al backend
        const response = await apiPost('/api/extension/capture', {
          kind: ctx.captureType,  // 'lab' | 'vital'
          target: ctx.target,
          imageDataUrl: croppedDataUrl,
          sourceUrl: tab.url,
        })

        await chrome.storage.local.remove(['urreai_capture'])
        sendResponse({ ok: true, data: response.data })
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
