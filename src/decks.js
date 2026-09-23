import { buildDeck } from './anki.js'

const DECKS_KEY = 'star-anki-decks-v1'
const LEGACY_DECK_KEY = 'star-anki-saved-deck'

// Fase 9 (ideia de baralho, item 5): "baralho de revisão" virtual — nunca é salvo em
// star-anki-decks-v1, é recalculado toda vez a partir do histórico + dos baralhos reais já
// salvos. REVIEW_DECK_ID identifica ele nos mesmos fluxos (onPlay/handlePlayDeck) que um id de
// baralho de verdade usa.
export const REVIEW_DECK_ID = '__review__'
const REVIEW_MIN_CARDS = 8
const REVIEW_MAX_CARDS = 40

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
  if (typeof entry.id !== 'string' || !entry.id.trim()) return null
  if (typeof entry.text !== 'string') return null
  const savedAt = Number(entry.savedAt)
  return {
    id: entry.id,
    name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : 'Baralho sem nome',
    text: entry.text,
    savedAt: Number.isFinite(savedAt) && savedAt >= 0 ? savedAt : 0,
  }
}

function readAll() {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(DECKS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    const result = []
    const seen = new Set()
    // Se uma gravação antiga/corrompida repetiu um id, mantém a ocorrência mais recente. IDs
    // duplicados fariam Editar/Excluir operar no item errado, pois getDeck usa find().
    for (let i = parsed.length - 1; i >= 0; i -= 1) {
      const entry = normalizeEntry(parsed[i])
      if (!entry || seen.has(entry.id)) continue
      seen.add(entry.id)
      result.push(entry)
    }
    return result.reverse()
  } catch {
    return []
  }
}

function writeAll(list) {
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.setItem(DECKS_KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

function migrateLegacyDeck() {
  let legacyText = null
  try {
    if (typeof localStorage === 'undefined') return
    legacyText = localStorage.getItem(LEGACY_DECK_KEY)
  } catch {
    return
  }
  if (!legacyText) return

  const list = readAll()
  let migrationSafe = list.length > 0
  if (list.length === 0) {
    list.push({ id: makeId(), name: 'Baralho importado', text: legacyText, savedAt: Date.now() })
    migrationSafe = writeAll(list)
  }
  // Nunca apaga a única cópia legado se a gravação no formato novo falhou.
  if (!migrationSafe) return
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
  try {
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
  } catch {
    return { id: entry.id, name: entry.name, savedAt: entry.savedAt, valid: false, warning: 'Conteúdo do baralho salvo está corrompido.' }
  }
}

export function listDecks() {
  migrateLegacyDeck()
  return readAll().map(describe).sort((a, b) => b.savedAt - a.savedAt)
}

export function getDeck(id) {
  return readAll().find((d) => d.id === id) || null
}

// funde 2+ baralhos salvos numa única sessão: cada baralho é parseado com seu próprio texto
// (podem ter headers/formatos diferentes) e as listas de cartas são concatenadas. `texts` fica
// disponível separado pra exportação de tags depois (cada fonte exporta seu próprio arquivo).
export function buildMergedDeck(ids) {
  const entries = ids.map(getDeck).filter(Boolean)
  if (entries.length < 2) return { error: 'Selecione pelo menos 2 baralhos pra fundir.' }

  const builds = entries.map((entry) => ({ entry, built: buildDeck(entry.text) }))
  const invalid = builds.find((b) => b.built.warning)
  if (invalid) return { error: `"${invalid.entry.name}": ${invalid.built.warning}` }

  return {
    built: {
      shooterCards: builds.flatMap((b) => b.built.shooterCards),
      painelCards: builds.flatMap((b) => b.built.painelCards),
      allCards: builds.flatMap((b) => b.built.allCards),
      warning: null,
    },
    texts: entries.map((e) => e.text),
    name: entries.map((e) => e.name).join(' + '),
  }
}

export function addDeck(name, text) {
  let built
  try {
    built = buildDeck(text)
  } catch {
    return { error: 'Não foi possível interpretar o conteúdo deste baralho.' }
  }
  if (built.warning) return { error: built.warning }

  const list = readAll()
  const entry = { id: makeId(), name: name?.trim() || 'Baralho sem nome', text, savedAt: Date.now() }
  list.push(entry)
  if (!writeAll(list)) return { error: 'Não foi possível salvar o baralho neste navegador. Verifique armazenamento/permissões e tente novamente.' }
  return { entry: describe(entry) }
}

export function updateDeck(id, { name, text }) {
  let built
  try {
    built = buildDeck(text)
  } catch {
    return { error: 'Não foi possível interpretar o conteúdo deste baralho.' }
  }
  if (built.warning) return { error: built.warning }

  const list = readAll()
  const idx = list.findIndex((d) => d.id === id)
  if (idx === -1) return { error: 'Baralho não encontrado.' }

  list[idx] = { ...list[idx], name: name?.trim() || list[idx].name, text, savedAt: Date.now() }
  if (!writeAll(list)) return { error: 'Não foi possível salvar as alterações neste navegador.' }
  return { entry: describe(list[idx]) }
}

export function removeDeck(id) {
  const list = readAll()
  if (!list.some((d) => d.id === id)) return { ok: true }
  if (!writeAll(list.filter((d) => d.id !== id))) {
    return { error: 'Não foi possível excluir o baralho do armazenamento deste navegador.' }
  }
  return { ok: true }
}

// Fase 9: junta as perguntas com pelo menos 1 erro registrado, de TODOS os baralhos salvos
// (dedupe por guid, prioriza a maior contagem de erro), até REVIEW_MAX_CARDS. Devolve null se
// não há dado suficiente ainda (REVIEW_MIN_CARDS) — quem chama decide se mostra a opção ou não.
export function buildReviewDeck(history) {
  const byGuid = new Map()
  for (const entry of readAll()) {
    const built = buildDeck(entry.text)
    if (built.warning) continue
    for (const card of built.shooterCards) {
      if (!byGuid.has(card.guid) && (history[card.guid]?.erros ?? 0) > 0) byGuid.set(card.guid, card)
    }
  }
  const cards = [...byGuid.values()]
    .sort((a, b) => (history[b.guid]?.erros ?? 0) - (history[a.guid]?.erros ?? 0))
    .slice(0, REVIEW_MAX_CARDS)
  if (cards.length < REVIEW_MIN_CARDS) return null
  return { shooterCards: cards, painelCards: [], allCards: cards, warning: null }
}

// Modo Arcade / Sem Baralho: jogo sem perguntas com fluxo direto para cartas roguelike
export const NO_DECK_ID = '__no_deck__'

export function buildNoDeckVirtual() {
  const dummyCard = {
    guid: 'arcade-virtual-card',
    question: 'Modo Arcade',
    answer: 'Sem Baralho',
    tags: ['arcade'],
    explanation: 'Modo de combate puro sem perguntas.',
  }
  return {
    id: NO_DECK_ID,
    name: 'Modo Arcade (Sem Baralho)',
    title: 'Arcade Roguelike',
    shooterCards: [dummyCard],
    allCards: [dummyCard],
    painelCards: [],
    warning: null,
    isNoDeck: true,
  }
}
