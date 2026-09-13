import { generateDistractors } from './anki.js'

export const SLOT_STYLES = [
  { slot: 0, shape: 'octaedro', color: 'azul' },
  { slot: 1, shape: 'cubo', color: 'âmbar' },
  { slot: 2, shape: 'tetraedro', color: 'magenta' },
  { slot: 3, shape: 'icosaedro', color: 'ciano' },
]

export const STARTING_HEALTH = 10
export const STARTING_LIVES = 3
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

// fila com prioridade de erro: cartas com histórico de erro vêm primeiro (mais erradas
// primeiro), resto embaralhado atrás. Extraído pra função própria (Fase 9, ideia de baralho
// "fila prioritária pra erros recentes") porque agora roda de novo a CADA reciclagem da fila
// infinita, não só na criação da sessão — antes disso, só o primeiro lap priorizava erro; do
// segundo em diante era shuffle uniforme, perdendo a priorização pro resto da run.
function buildPriorityQueue(cards, history) {
  const withErrors = shuffle(cards.filter((c) => (history[c.guid]?.erros ?? 0) > 0))
  withErrors.sort((a, b) => (history[b.guid]?.erros ?? 0) - (history[a.guid]?.erros ?? 0))
  const usedGuids = new Set(withErrors.map((c) => c.guid))
  const rest = shuffle(cards.filter((c) => !usedGuids.has(c.guid)))
  return [...withErrors, ...rest]
}

// modo infinito (v0.29.6): não fatia mais em SECTOR_SIZE — a fila começa com o baralho
// inteiro (erradas primeiro, resto embaralhado) e nextQuestion() recicla (reembaralha e volta
// pro início) quando esgota. Guarda `allShooterCards` só pra essa reciclagem.
export function createSession(deck, opts = {}) {
  const { shooterCards } = deck
  const history = opts.history || {}
  const startingHealth = opts.startingHealth ?? STARTING_HEALTH
  const startingLives = opts.startingLives ?? STARTING_LIVES

  return {
    queue: buildPriorityQueue(shooterCards, history),
    pointer: 0,
    health: startingHealth,
    lives: startingLives,
    comboMultiplier: 1.0,
    score: 0,
    log: [],
    allShooterCards: shooterCards,
    // referência (não cópia) — recordResult muta o mesmo objeto que main.js já mantém, então
    // isso fica automaticamente atualizado com os erros da própria sessão em andamento
    history,
  }
}

// Fase 9 (ideia de baralho, item 1): fração de cartas do baralho com pelo menos 1 erro
// registrado no histórico — usado por main.js pra suavizar/acentuar o ritmo de spawn inicial
// (baralho historicamente difícil começa um pouco mais devagar; fácil, um pouco mais rápido).
// Não conhece nada de inimigos/spawn — só devolve a proporção 0..1.
export function computeDifficultyBias(shooterCards, history) {
  if (shooterCards.length === 0) return 0.5
  let missed = 0
  for (const c of shooterCards) if ((history[c.guid]?.erros ?? 0) > 0) missed += 1
  return missed / shooterCards.length
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
  if (session.lives <= 0) return null
  // fila esgotou: reconstrói (reembaralha + repriorizar erro) e recomeça — é o que faz o jogo
  // ser infinito, mantendo a prioridade de erro em toda reciclagem, não só na primeira
  if (session.pointer >= session.queue.length) {
    session.queue = buildPriorityQueue(session.allShooterCards, session.history)
    session.pointer = 0
  }
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
    // >> AJUSTADO: erro/timeout não tira mais saúde do jogador — só quebra o combo e conta pra
    // estatística / sobe a dificuldade (main.js). A vida só é perdida por DANO DE INIMIGO. <<
    session.comboMultiplier = 1.0
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

  // modo infinito (v0.29.6): não existe mais "fim de setor" por acabar as perguntas — só
  // zerar as vidas termina o jogo (main.js decide isso via applyHealthLoss/outOfLives)
  return {
    points,
    comboMultiplier: session.comboMultiplier,
    healthRemaining: session.health,
    sectorOver: false,
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
