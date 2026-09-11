import { generateDistractors } from './anki.js'

export const SLOT_STYLES = [
  { slot: 0, shape: 'octaedro', color: 'azul' },
  { slot: 1, shape: 'cubo', color: 'âmbar' },
  { slot: 2, shape: 'tetraedro', color: 'magenta' },
  { slot: 3, shape: 'icosaedro', color: 'ciano' },
]

const SECTOR_SIZE = 10
export const STARTING_SHIELDS = 10
const COMBO_STEP = 0.15
const COMBO_CAP = 2.5

function shuffle(array) {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function createSession(deck, opts = {}) {
  const { shooterCards } = deck
  const history = opts.history || {}
  const sectorSize = Math.min(SECTOR_SIZE, shooterCards.length)

  const withErrors = shuffle(shooterCards.filter((c) => (history[c.guid]?.erros ?? 0) > 0))
  withErrors.sort((a, b) => history[b.guid].erros - history[a.guid].erros)
  const usedGuids = new Set(withErrors.map((c) => c.guid))
  const rest = shuffle(shooterCards.filter((c) => !usedGuids.has(c.guid)))

  const queue = [...withErrors, ...rest].slice(0, sectorSize)

  return {
    queue,
    pointer: 0,
    shields: STARTING_SHIELDS,
    comboMultiplier: 1.0,
    score: 0,
    log: [],
    sectorSize,
  }
}

function buildAlternatives(card, allCards) {
  const distractors = generateDistractors(card, allCards, { count: 3 })
  const combined = shuffle([
    { text: card.answer, isCorrect: true },
    ...distractors.map((text) => ({ text, isCorrect: false })),
  ])
  const alternatives = combined.map((alt, i) => ({ ...SLOT_STYLES[i], ...alt }))
  const correctSlot = alternatives.findIndex((a) => a.isCorrect)

  return { card, alternatives, correctSlot }
}

export function nextQuestion(session, allCards) {
  if (session.pointer >= session.sectorSize || session.shields <= 0) return null
  return buildAlternatives(session.queue[session.pointer], allCards)
}

// carta "sobrando" pro inimigo dourado especial: do baralho shooter inteiro, menos o que já está na fila do setor
export function pickBonusCard(deck, session) {
  const usedGuids = new Set(session.queue.map((c) => c.guid))
  const pool = deck.shooterCards.filter((c) => !usedGuids.has(c.guid))
  const source = pool.length > 0 ? pool : deck.shooterCards
  return source[Math.floor(Math.random() * source.length)]
}

export function buildBonusQuestion(card, allCards) {
  return buildAlternatives(card, allCards)
}

export function resolveAnswer(session, outcome) {
  const { type, timeBonus = 1.0, accuracyBonus = 1.0, card } = outcome
  let points = 0

  if (type === 'correct') {
    points = 100 * session.comboMultiplier * timeBonus * accuracyBonus
    // arredonda para 2 casas para evitar deriva de ponto flutuante nas somas sucessivas de 0.15
    session.comboMultiplier = Math.min(COMBO_CAP, Math.round((session.comboMultiplier + COMBO_STEP) * 100) / 100)
  } else {
    session.comboMultiplier = 1.0
    if (type === 'wrong') session.shields -= 1
  }

  session.score += points
  session.pointer += 1
  session.log.push({
    guid: card.guid,
    question: card.question,
    answer: card.answer,
    type,
    points,
  })

  const sectorOver = session.pointer >= session.sectorSize || session.shields <= 0

  return {
    points,
    comboMultiplier: session.comboMultiplier,
    shieldsRemaining: session.shields,
    sectorOver,
    comboBroken: type !== 'correct',
  }
}

export function createPainelSession(painelCards) {
  return { queue: painelCards, pointer: 0, log: [] }
}

export function nextPainelCard(session) {
  return session.pointer < session.queue.length ? session.queue[session.pointer] : null
}

export function resolvePainel(session, correct) {
  const card = session.queue[session.pointer]
  session.log.push({ guid: card.guid, correct })
  session.pointer += 1
  return { done: session.pointer >= session.queue.length }
}

export function getSummary(session) {
  const correctCount = session.log.filter((e) => e.type === 'correct').length
  const wrongCount = session.log.filter((e) => e.type !== 'correct').length
  const missed = session.log
    .filter((e) => e.type !== 'correct')
    .map((e) => ({ guid: e.guid, question: e.question, answer: e.answer }))

  return { correctCount, wrongCount, totalScore: session.score, missed }
}
