/* UrreAI browser extension — popup */

const API_BASE = 'https://app.urreai.com'
const STORAGE_KEY_TOKEN = 'urreai_token'
const STORAGE_KEY_PATIENT = 'urreai_active_patient'
const STORAGE_KEY_PREFS = 'urreai_prefs'

const DEFAULT_PREFS = {
  fieldLab: 'objetivo',
  fieldVital: 'objetivo',
  fieldNote: 'subjetivo',
  appendToToday: true,
  formatLab: '',
  formatVital: '',
  saveMode: 'save',  // 'save' | 'clipboard' | 'both'
}

// ─── Storage helpers (cross-browser: chrome.* funciona en Firefox tambien con manifest v3) ──

function storageGet(key) {
  return new Promise(resolve => {
    chrome.storage.local.get([key], result => resolve(result[key]))
  })
}
function storageSet(key, value) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: value }, () => resolve())
  })
}
function storageRemove(key) {
  return new Promise(resolve => {
    chrome.storage.local.remove([key], () => resolve())
  })
}

// ─── API client ────────────────────────────────────────────────────────────

async function apiFetch(path, opts = {}) {
  const token = await storageGet(STORAGE_KEY_TOKEN)
  if (!token) throw new Error('NO_AUTH')
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(opts.headers || {}),
  }
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers })
  if (res.status === 401) {
    await storageRemove(STORAGE_KEY_TOKEN)
    throw new Error('NO_AUTH')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Error ${res.status}`)
  }
  // Auto-copy si el API devolvió clipboardText
  if (data?.data?.clipboardText) {
    try { await navigator.clipboard.writeText(data.data.clipboardText) } catch {}
  }
  return data
}

// ─── View switching ────────────────────────────────────────────────────────

let lastView = 'main'

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'))
  const el = document.getElementById(`view-${name}`)
  if (el) el.classList.remove('hidden')
  if (name === 'main' || name === 'auth') lastView = name
}

// ─── Settings ──────────────────────────────────────────────────────────────

function updateSaveModeUI() {
  // Ocultar sección de "agregar a nota de hoy" si el modo es solo clipboard
  const mode = (document.querySelector('input[name="saveMode"]:checked') || {}).value
  const appendGroup = document.getElementById('settings-group-append')
  if (appendGroup) {
    appendGroup.style.display = mode === 'clipboard' ? 'none' : ''
  }
}

async function loadPrefsIntoForm() {
  const saved = await storageGet(STORAGE_KEY_PREFS)
  const prefs = { ...DEFAULT_PREFS, ...(saved || {}) }
  document.getElementById('field-lab').value = prefs.fieldLab
  document.getElementById('field-vital').value = prefs.fieldVital
  document.getElementById('field-note').value = prefs.fieldNote
  document.getElementById('format-lab').value = prefs.formatLab
  document.getElementById('format-vital').value = prefs.formatVital
  document.getElementById('append-true').checked = prefs.appendToToday
  document.getElementById('append-false').checked = !prefs.appendToToday
  const modeEl = document.getElementById(`mode-${prefs.saveMode}`)
  if (modeEl) modeEl.checked = true
  updateSaveModeUI()
}

async function savePrefs() {
  const modeInput = document.querySelector('input[name="saveMode"]:checked')
  const prefs = {
    fieldLab: document.getElementById('field-lab').value,
    fieldVital: document.getElementById('field-vital').value,
    fieldNote: document.getElementById('field-note').value,
    formatLab: document.getElementById('format-lab').value.trim(),
    formatVital: document.getElementById('format-vital').value.trim(),
    appendToToday: document.getElementById('append-true').checked,
    saveMode: modeInput ? modeInput.value : 'save',
  }
  await storageSet(STORAGE_KEY_PREFS, prefs)
  const saved = document.getElementById('prefs-saved')
  saved.classList.remove('hidden')
  setTimeout(() => saved.classList.add('hidden'), 2000)
}

// Reactivo: cuando el usuario cambia el modo, ocultar/mostrar secciones
document.querySelectorAll('input[name="saveMode"]').forEach(el => {
  el.addEventListener('change', updateSaveModeUI)
})

document.getElementById('settings-btn').addEventListener('click', async () => {
  await loadPrefsIntoForm()
  showView('settings')
})
document.getElementById('settings-back').addEventListener('click', () => {
  showView(lastView)
})
document.getElementById('save-prefs').addEventListener('click', savePrefs)
document.getElementById('open-shortcuts').addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })
})

// ─── Inyectar prefs en apiFetch al capturar ────────────────────────────────

async function getPrefs() {
  const saved = await storageGet(STORAGE_KEY_PREFS)
  return { ...DEFAULT_PREFS, ...(saved || {}) }
}

// ─── Auth ──────────────────────────────────────────────────────────────────

async function tryAutoPasteFromClipboard() {
  // Si navigator.clipboard.readText está disponible y hay un token en el
  // portapapeles, autopegarlo. Ahorra un paso al usuario.
  try {
    if (!navigator.clipboard || !navigator.clipboard.readText) return
    const txt = (await navigator.clipboard.readText()).trim()
    if (txt.startsWith('urreai_ext_') && txt.length >= 30) {
      const input = document.getElementById('token-input')
      if (input && !input.value) {
        input.value = txt
        input.style.borderColor = '#10B981'
      }
    }
  } catch { /* clipboard permission denied, ignore */ }
}

document.getElementById('connect-btn').addEventListener('click', async () => {
  // Abre la página de vinculación en una pestaña nueva. El popup se
  // cierra automáticamente (comportamiento normal del navegador). Cuando
  // el usuario vuelva a click en el ícono, el popup abre de nuevo y ve
  // tanto el botón como el campo para pegar listos.
  chrome.tabs.create({ url: `${API_BASE}/dashboard/extension` })
})

document.getElementById('save-token-btn').addEventListener('click', async () => {
  const input = document.getElementById('token-input')
  const errorEl = document.getElementById('token-error')
  const token = (input.value || '').trim()
  errorEl.classList.add('hidden')
  if (!token.startsWith('urreai_ext_')) {
    errorEl.textContent = 'El código debe empezar con "urreai_ext_".'
    errorEl.classList.remove('hidden')
    return
  }
  await storageSet(STORAGE_KEY_TOKEN, token)
  try {
    // Validar el token contra /api/extension/context
    await apiFetch('/api/extension/context')
    showView('main')
    await loadPatients()
  } catch (err) {
    await storageRemove(STORAGE_KEY_TOKEN)
    errorEl.textContent = err.message || 'Código inválido. Copia de nuevo desde la página.'
    errorEl.classList.remove('hidden')
  }
})

document.getElementById('logout-btn').addEventListener('click', async () => {
  await storageRemove(STORAGE_KEY_TOKEN)
  await storageRemove(STORAGE_KEY_PATIENT)
  document.getElementById('token-input').value = ''
  showView('auth')
})

// ─── Patients ──────────────────────────────────────────────────────────────

async function loadPatients() {
  const hint = document.getElementById('patient-hint')
  const select = document.getElementById('patient-select')
  hint.textContent = 'Cargando tus pacientes…'

  try {
    const { data } = await apiFetch('/api/extension/context')
    const rounds = data.roundPatients || []
    const soap = data.soapPatients || []
    const recent = data.recentPatients || []

    select.innerHTML = '<option value="">— Selecciona un paciente —</option>'

    if (rounds.length > 0) {
      const group = document.createElement('optgroup')
      group.label = `En ronda (${rounds.length})`
      rounds.forEach(p => {
        const opt = document.createElement('option')
        opt.value = `round:${p.roundId}:${p.id}`
        opt.textContent = `${p.nombre || p.alias} · ${p.cama || 'sin cama'}`
        group.appendChild(opt)
      })
      select.appendChild(group)
    }
    if (soap.length > 0) {
      const group = document.createElement('optgroup')
      group.label = `Notas SOAP (${soap.length})`
      soap.forEach(p => {
        const opt = document.createElement('option')
        // base64 del alias para soportar caracteres especiales (tildes, espacios)
        const b64 = btoa(unescape(encodeURIComponent(p.alias)))
        opt.value = `soap:${b64}`
        opt.textContent = `${p.alias} · ${p.count} nota${p.count === 1 ? '' : 's'}`
        group.appendChild(opt)
      })
      select.appendChild(group)
    }
    if (recent.length > 0) {
      const group = document.createElement('optgroup')
      group.label = `Recientes (consulta)`
      recent.forEach(p => {
        const opt = document.createElement('option')
        opt.value = `patient:${p.id}`
        opt.textContent = p.nombre
        group.appendChild(opt)
      })
      select.appendChild(group)
    }

    const total = rounds.length + soap.length + recent.length
    if (total === 0) {
      hint.innerHTML = 'Aún no tienes pacientes. <a href="' + API_BASE + '/dashboard" target="_blank" rel="noopener" style="color:#7c3aed">Crea uno en UrreAI →</a>'
    } else {
      hint.textContent = `${total} disponibles · se selecciona automáticamente al volver.`
    }

    // Recuperar seleccion previa
    const saved = await storageGet(STORAGE_KEY_PATIENT)
    if (saved && Array.from(select.options).some(o => o.value === saved)) {
      select.value = saved
    }
    // Habilitar las acciones que no dependen de paciente (calcs, flashcard,
    // caso rapido, sesion de hoy) desde el inicio.
    updateActionsEnabled()
  } catch (err) {
    if (err.message === 'NO_AUTH') {
      showView('auth')
      return
    }
    hint.textContent = 'Error cargando pacientes.'
  }
}

document.getElementById('patient-select').addEventListener('change', async e => {
  await storageSet(STORAGE_KEY_PATIENT, e.target.value)
  updateActionsEnabled()
})

document.getElementById('refresh-patients').addEventListener('click', () => loadPatients())

const ACTIONS_NO_PATIENT = new Set(['calculator-favs', 'new-case', 'new-flashcard', 'today-study'])

function updateActionsEnabled() {
  const val = document.getElementById('patient-select').value
  document.querySelectorAll('.action[data-action]').forEach(btn => {
    const action = btn.getAttribute('data-action')
    if (ACTIONS_NO_PATIENT.has(action)) {
      btn.disabled = false
      return
    }
    btn.disabled = !val
  })
}

// ─── Feedback helper ───────────────────────────────────────────────────────

function showFeedback(type, text) {
  const fb = document.getElementById('feedback')
  fb.className = `feedback feedback--${type}`
  fb.textContent = text
  fb.classList.remove('hidden')
  if (type === 'ok') setTimeout(() => fb.classList.add('hidden'), 4000)
}

// ─── Actions ───────────────────────────────────────────────────────────────

document.querySelectorAll('.action[data-action]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const action = btn.getAttribute('data-action')
    const target = document.getElementById('patient-select').value

    // Acciones que no requieren paciente activo
    if (action === 'calculator-favs') {
      chrome.tabs.create({ url: `${API_BASE}/dashboard/calculators?view=favoritas` })
      window.close()
      return
    }
    if (action === 'new-case') {
      chrome.tabs.create({ url: `${API_BASE}/dashboard/logbook?new=case` })
      window.close()
      return
    }
    if (action === 'new-flashcard') {
      chrome.tabs.create({ url: `${API_BASE}/dashboard/study-queue?new=1` })
      window.close()
      return
    }
    if (action === 'today-study') {
      chrome.tabs.create({ url: `${API_BASE}/dashboard/study?tab=hoy` })
      window.close()
      return
    }

    if (!target) {
      showFeedback('err', 'Selecciona primero un paciente.')
      return
    }

    if (action === 'capture-lab' || action === 'capture-vitals') {
      // Pedir al background que inyecte el overlay en el tab activo
      const captureType = action === 'capture-lab' ? 'lab' : 'vital'
      chrome.runtime.sendMessage({ type: 'START_CAPTURE', captureType, target }, response => {
        if (response?.error) showFeedback('err', response.error)
        else {
          showFeedback('info', 'Selecciona la región en la pestaña. Cuando termines, la IA la procesa.')
          window.close()
        }
      })
      return
    }

    if (action === 'save-selection') {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        const tab = tabs[0]
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => window.getSelection()?.toString() || '',
        }, async results => {
          const text = (results?.[0]?.result || '').trim()
          if (!text) {
            showFeedback('err', 'No hay texto seleccionado en la pestaña.')
            return
          }
          try {
            const prefs = await getPrefs()
            await apiFetch('/api/extension/capture', {
              method: 'POST',
              body: JSON.stringify({
                kind: 'note',
                target,
                text,
                sourceUrl: tab.url,
                field: prefs.fieldNote,
                appendToTodayNote: prefs.appendToToday,
                saveMode: prefs.saveMode,
              }),
            })
            let tipo
            if (prefs.saveMode === 'clipboard')   tipo = 'copiado al portapapeles'
            else if (prefs.saveMode === 'both')   tipo = 'guardado + copiado al portapapeles'
            else                                   tipo = prefs.appendToToday ? 'agregado a nota de hoy' : 'nota nueva creada'
            showFeedback('ok', `✓ ${text.length} caracteres — ${tipo}`)
          } catch (err) {
            showFeedback('err', err.message || 'Error guardando')
          }
        })
      })
      return
    }
  })
})

// ─── Init ──────────────────────────────────────────────────────────────────

// ─── Populate popular calculators grid ───────────────────────────────────

const POPULAR_CALCS = [
  { name: 'Glasgow',       q: 'glasgow',         color: '#3B82F6' },
  { name: 'CURB-65',       q: 'curb-65',         color: '#10B981' },
  { name: 'qSOFA',         q: 'qsofa',           color: '#EF4444' },
  { name: 'Apgar',         q: 'apgar',           color: '#F59E0B' },
  { name: 'IMC / BMI',     q: 'imc',             color: '#8B5CF6' },
  { name: 'TFG CKD-EPI',   q: 'tfg',             color: '#06B6D4' },
  { name: 'Dosis peds',    q: 'dosis pediátrica', color: '#EC4899' },
  { name: 'Wells TEP',     q: 'wells tep',       color: '#0EA5E9' },
  { name: 'CHA₂DS₂-VASc',  q: 'chads',           color: '#DC2626' },
  { name: 'Z-scores OMS',  q: 'z-score',         color: '#059669' },
  { name: 'NIHSS',         q: 'nihss',           color: '#7C3AED' },
  { name: 'PEWS',          q: 'pews',            color: '#F97316' },
]

function renderCalcGrid() {
  const grid = document.getElementById('calc-grid')
  if (!grid) return
  grid.innerHTML = ''
  POPULAR_CALCS.forEach(c => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'calc-pill'
    btn.title = `Abrir ${c.name} en UrreAI`
    btn.innerHTML = `<span class="calc-pill__dot" style="background:${c.color}"></span>${c.name}`
    btn.addEventListener('click', () => {
      chrome.tabs.create({ url: `${API_BASE}/dashboard/calculators?q=${encodeURIComponent(c.q)}` })
      window.close()
    })
    grid.appendChild(btn)
  })
}

;(async () => {
  const token = await storageGet(STORAGE_KEY_TOKEN)
  if (token) {
    showView('main')
    renderCalcGrid()
    await loadPatients()
    return
  }
  showView('auth')
  // Siempre intentar auto-pegar del clipboard — si el usuario acaba de
  // copiar el código, se pega solo y solo tiene que dar "Vincular".
  await tryAutoPasteFromClipboard()
})()
