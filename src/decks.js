import { buildDeck } from './anki.js'

const DECKS_KEY = 'star-anki-decks-v1'
const LEGACY_DECK_KEY = 'star-anki-saved-deck'

function readAll() {
  try {
    const raw = localStorage.getItem(DECKS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(DECKS_KEY, JSON.stringify(list))
  } catch {
    // quota excedida ou localStorage desabilitado — falha silenciosa de propósito
  }
}

function migrateLegacyDeck() {
  let legacyText = null
  try {
    legacyText = localStorage.getItem(LEGACY_DECK_KEY)
  } catch {
    return
  }
  if (!legacyText) return

  const list = readAll()
  if (list.length === 0) {
    list.push({ id: makeId(), name: 'Baralho importado', text: legacyText, savedAt: Date.now() })
    writeAll(list)
  }
  try {
    localStorage.removeItem(LEGACY_DECK_KEY)
  } catch {
    // idem
  }
}

function makeId() {
  return `deck-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function describe(entry) {
  const built = buildDeck(entry.text)
  if (built.warning) return { id: entry.id, name: entry.name, savedAt: entry.savedAt, valid: false, warning: built.warning }
  return {
    id: entry.id,
    name: entry.name,
    savedAt: entry.savedAt,
    valid: true,
    shooterCount: built.shooterCards.length,
    painelCount: built.painelCards.length,
  }
}

export function listDecks() {
  migrateLegacyDeck()
  return readAll().map(describe).sort((a, b) => b.savedAt - a.savedAt)
}

export function getDeck(id) {
  return readAll().find((d) => d.id === id) || null
}

export function addDeck(name, text) {
  const built = buildDeck(text)
  if (built.warning) return { error: built.warning }

  const list = readAll()
  const entry = { id: makeId(), name: name?.trim() || 'Baralho sem nome', text, savedAt: Date.now() }
  list.push(entry)
  writeAll(list)
  return { entry: describe(entry) }
}

export function updateDeck(id, { name, text }) {
  const built = buildDeck(text)
  if (built.warning) return { error: built.warning }

  const list = readAll()
  const idx = list.findIndex((d) => d.id === id)
  if (idx === -1) return { error: 'Baralho não encontrado.' }

  list[idx] = { ...list[idx], name: name?.trim() || list[idx].name, text, savedAt: Date.now() }
  writeAll(list)
  return { entry: describe(list[idx]) }
}

export function removeDeck(id) {
  writeAll(readAll().filter((d) => d.id !== id))
}
