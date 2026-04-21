/* UrreAI browser extension — popup */

const API_BASE = 'https://app.urreai.com'
const STORAGE_KEY_TOKEN = 'urreai_token'
const STORAGE_KEY_PATIENT = 'urreai_active_patient'

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
  return data
}

// ─── View switching ────────────────────────────────────────────────────────

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'))
  const el = document.getElementById(`view-${name}`)
  if (el) el.classList.remove('hidden')
}

// ─── Auth ──────────────────────────────────────────────────────────────────

const STORAGE_KEY_AWAITING = 'urreai_awaiting_token'

function showPasteField() {
  document.getElementById('token-input-wrap').classList.remove('hidden')
  document.getElementById('connect-btn').classList.add('hidden')
}

async function tryAutoPasteFromClipboard() {
  // Si navigator.clipboard.readText está disponible y hay un token en el
  // portapapeles, autopegarlo. Ahorra un paso al usuario.
  try {
    if (!navigator.clipboard || !navigator.clipboard.readText) return
    const txt = (await navigator.clipboard.readText()).trim()
    if (txt.startsWith('urreai_ext_') && txt.length >= 30) {
      const input = document.getElementById('token-input')
      input.value = txt
      const msg = document.createElement('p')
      msg.className = 'token-input__label'
      msg.style.color = '#059669'
      msg.textContent = '✓ Código detectado en el portapapeles — solo confirma.'
      input.parentNode.insertBefore(msg, input)
    }
  } catch { /* clipboard permission denied, ignore */ }
}

document.getElementById('connect-btn').addEventListener('click', async () => {
  // Guardamos flag "esperando token" para que al reabrir el popup vaya
  // directo al campo de pegar sin repetir el paso de abrir tab.
  await storageSet(STORAGE_KEY_AWAITING, true)
  // Abre la pagina de vinculacion en el app para generar el token
  chrome.tabs.create({ url: `${API_BASE}/dashboard/extension` })
  showPasteField()
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
    await storageRemove(STORAGE_KEY_AWAITING)
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
  await storageRemove(STORAGE_KEY_AWAITING)
  // Reset UI
  document.getElementById('token-input-wrap').classList.add('hidden')
  document.getElementById('connect-btn').classList.remove('hidden')
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

    if (rounds.length === 0 && recent.length === 0) {
      hint.innerHTML = 'Aún no tienes pacientes. <a href="' + API_BASE + '/dashboard" target="_blank" rel="noopener" style="color:#7c3aed">Crea uno en UrreAI →</a>'
    } else {
      hint.textContent = `${rounds.length + recent.length} disponibles · se selecciona automáticamente al volver.`
    }

    // Recuperar seleccion previa
    const saved = await storageGet(STORAGE_KEY_PATIENT)
    if (saved && Array.from(select.options).some(o => o.value === saved)) {
      select.value = saved
      updateActionsEnabled()
    }
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

function updateActionsEnabled() {
  const val = document.getElementById('patient-select').value
  document.querySelectorAll('.action[data-action]').forEach(btn => {
    const action = btn.getAttribute('data-action')
    // calculadora no necesita paciente
    if (action === 'calculator') {
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

    if (action === 'calculator') {
      chrome.tabs.create({ url: `${API_BASE}/dashboard/calculators` })
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
            await apiFetch('/api/extension/capture', {
              method: 'POST',
              body: JSON.stringify({
                kind: 'note',
                target,
                text,
                sourceUrl: tab.url,
              }),
            })
            showFeedback('ok', `✓ Nota guardada (${text.length} caracteres)`)
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

;(async () => {
  const token = await storageGet(STORAGE_KEY_TOKEN)
  if (token) {
    showView('main')
    await loadPatients()
    return
  }
  // Si hay un flow de vinculacion en progreso, saltarse el boton "Conectar"
  // y llevar al usuario directo al campo de pegar token.
  const awaiting = await storageGet(STORAGE_KEY_AWAITING)
  showView('auth')
  if (awaiting) {
    showPasteField()
    await tryAutoPasteFromClipboard()
  }
})()
