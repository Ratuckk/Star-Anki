const STORAGE_KEY = 'star-anki-history'

export function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function saveHistory(history) {
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
    return true
  } catch {
    return false
  }
}

export function recordResult(history, guid, correct) {
  if (!history || typeof history !== 'object') history = {}
  const raw = history[guid]
  const entry = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw
    : { acertos: 0, erros: 0, ultimaVez: null }
  if (!Number.isFinite(entry.acertos)) entry.acertos = 0
  if (!Number.isFinite(entry.erros)) entry.erros = 0
  if (correct) entry.acertos += 1
  else entry.erros += 1
  entry.ultimaVez = Date.now()
  history[guid] = entry
  return history
}