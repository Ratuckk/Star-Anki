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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
}

export function recordResult(history, guid, correct) {
  const entry = history[guid] ?? { acertos: 0, erros: 0, ultimaVez: null }
  if (correct) entry.acertos += 1
  else entry.erros += 1
  entry.ultimaVez = Date.now()
  history[guid] = entry
  return history
}