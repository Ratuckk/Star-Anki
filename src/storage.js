const STORAGE_KEY = 'star-anki-history'
const DECK_KEY = 'star-anki-saved-deck'

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

// baralho lembrado entre sessões: guarda o texto bruto do export (o mesmo que o usuário
// colou/carregou), pra ele não precisar re-selecionar o arquivo toda vez que abrir o jogo.
// São poucos KB de texto puro — bem dentro do limite do localStorage (~5 MB por origem).
export function loadSavedDeck() {
  try {
    return localStorage.getItem(DECK_KEY) || null
  } catch {
    return null
  }
}

export function saveDeck(text) {
  try {
    localStorage.setItem(DECK_KEY, text)
  } catch {
    // quota excedida ou localStorage desabilitado (modo privado antigo, etc.) — falha
    // silenciosa de propósito: o jogo continua funcionando, só não lembra da próxima vez
  }
}

export function clearSavedDeck() {
  try {
    localStorage.removeItem(DECK_KEY)
  } catch {
    // idem
  }
}