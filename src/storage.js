const STORAGE_KEY = 'star-anki-history'

function normalizeCount(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function normalizeTimestamp(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { acertos: 0, erros: 0, ultimaVez: null }
  }
  return {
    acertos: normalizeCount(entry.acertos),
    erros: normalizeCount(entry.erros),
    ultimaVez: normalizeTimestamp(entry.ultimaVez),
  }
}

function normalizeHistory(parsed) {
  const history = Object.create(null)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return history
  for (const [guid, entry] of Object.entries(parsed)) {
    history[guid] = normalizeEntry(entry)
  }
  return history
}

export function loadHistory() {
  try {
    if (typeof localStorage === 'undefined') return Object.create(null)
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return normalizeHistory(parsed)
  } catch {
    return Object.create(null)
  }
}

export function saveHistory(history) {
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history || {}))
    return true
  } catch {
    // Histórico é melhoria persistente, não requisito para manter a partida jogável. Falhas de
    // quota/permissão não podem interromper settleQuestion() nem a tela de fim da sessão.
    return false
  }
}

export function recordResult(history, guid, correct) {
  const target = history && typeof history === 'object' && !Array.isArray(history)
    ? history : Object.create(null)
  const hasOwn = Object.prototype.hasOwnProperty.call(target, guid)
  const entry = normalizeEntry(hasOwn ? target[guid] : null)
  if (correct) entry.acertos += 1
  else entry.erros += 1
  entry.ultimaVez = Date.now()

  // Object.defineProperty evita o setter mágico de `__proto__` em objetos comuns. GUIDs vêm de
  // arquivos importados pelo usuário, então até nomes de propriedade especiais precisam ser
  // tratados como dados normais, nunca como alteração do protótipo do histórico.
  Object.defineProperty(target, String(guid), {
    value: entry,
    writable: true,
    enumerable: true,
    configurable: true,
  })
  return target
}
