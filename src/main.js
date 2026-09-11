import * as THREE from 'three'
import { buildDeck, exportTagsTsv } from './anki.js'
import { createSession, nextQuestion, resolveAnswer, getSummary, createPainelSession, nextPainelCard, resolvePainel, pickBonusCard, buildBonusQuestion, STARTING_SHIELDS } from './quiz.js'
import { createRailController } from './rail.js'
import { createCombatSystem, DEFAULT_FIRE_COOLDOWN, DEFAULT_AIM_ASSIST_ANGLE } from './combat.js'
import { createEffectsSystem } from './effects.js'
import { createInputState } from './input.js'
import { showLoadScreen, showWarning, createGameHud, showSectorEnd, showPainelCard, showPainelAnswer } from './hud.js'
import { loadHistory, saveHistory, recordResult, loadSavedDeck, saveDeck, clearSavedDeck } from './storage.js'

const CYCLE_MS = 90000
const WARNING_MS = 10000
const RECALL_MS = 3500
const ALT_MS = 6000
const FEEDBACK_MS = 1500
const SPEED_STEP = 0.05
const BOOST_EVERY_CORRECT = 2
const GROUND_Y = -10

const INVINCIBILITY_MS = 1200
const INVINCIBILITY_FLICKER_MS = 90

// ============ MIRA ============
// A mira vive em coordenadas de TELA (NDC: -1 a 1 em cada eixo), não em coordenadas de mundo.
// Isso é o que garante que os tiros passem exatamente por onde a mira está: o tiro é o raio
// da câmera através do ponto NDC da mira. Sem essa mudança, qualquer cálculo de "nariz -> mira"
// produzia ângulos minúsculos e o tiro saía praticamente reto.
//
// Física própria em NDC, mais rápida que a nave:
//   - RETICLE_NDC_SPEED (3.2) > velocidade lateral da nave em unidades de tela
//   - RETICLE_NDC_MAX_X/Y (0.85/0.65) fazem a mira chegar quase na borda antes da nave
//   - RETICLE_NDC_ACCEL (28) dá resposta imediata, sem "escorregar"
const RETICLE_NDC_MAX_X = 0.85
const RETICLE_NDC_MAX_Y = 0.65
const RETICLE_NDC_ACCEL = 28
const RETICLE_NDC_SPEED = 3.2

const BOSS_EVERY_QUESTIONS = 5
const BOSS_CYCLE_MS = 120000
const BOSS_ENEMY_INTERVAL_MULT = 0.7
const ARENA_MS_BASE = 28000
const ARENA_MS_FLOOR = 18000
const ARENA_MS_STEP = 2000
const BOSS_SPREAD_MIN_BASE = 45
const BOSS_SPREAD_MAX_BASE = 95
const BOSS_SPREAD_STEP = 12
const BOSS_SPREAD_MIN_CAP = 75
const BOSS_SPREAD_MAX_CAP = 150
const BOSS_EXTRA_ENEMIES_BASE = 2
const BOSS_EXTRA_ENEMIES_STEP = 1
const BOSS_EXTRA_ENEMIES_CAP = 6
const BOSS_DIFFICULTY_CAP = 5

const ENEMY_INTERVAL_MIN_BASE = 900
const ENEMY_INTERVAL_MAX_BASE = 1500
const ENEMY_INTERVAL_FLOOR = 350
const ENEMY_INTERVAL_STEP = 70
const ENEMY_AGGRESSION_STEP = 0.15
const ENEMY_AGGRESSION_CAP = 3.5

const BONUS_INTERVAL_MIN = 9000
const BONUS_INTERVAL_MAX = 16000

const REVIEW_ENEMY_INTERVAL_MULT = 0.6
const REVIEW_ANSWER_MS_MULT = 0.75

const FIRE_COOLDOWN_MULT_PER_CORRECT = 0.85
const FIRE_COOLDOWN_FLOOR = 0.06
const AIM_ASSIST_STEP = THREE.MathUtils.degToRad(1.5)
const AIM_ASSIST_CAP = THREE.MathUtils.degToRad(14)
const PROJECTILE_STEP_EVERY_CORRECT = 3
const PROJECTILE_COUNT_CAP = 4
const PROJECTILE_COUNT_START = 2

const GOLDEN_INTERVAL_MIN_MS = 45000
const GOLDEN_INTERVAL_MAX_MS = 100000
const GOLDEN_ARENA_MS_MIN = 25000
const GOLDEN_ARENA_MS_MAX = 30000
const GOLDEN_SPREAD_MIN = 40
const GOLDEN_SPREAD_MAX = 90

const TIME_ENEMY_SPAWN_CHANCE = 0.2

let deck = null
let deckText = null
let history = loadHistory()
let sessionResults = []
let painelDone = false

function handleLoad(text) {
  const built = buildDeck(text)
  if (built.warning) {
    showWarning(built.warning)
    return
  }
  saveDeck(text)
  deck = built
  deckText = text
  sessionResults = []
  painelDone = false
  mountGame(createSession(deck, { history }))
}

function buildSavedDeckInfo() {
  const text = loadSavedDeck()
  if (!text) return null
  const built = buildDeck(text)
  if (built.warning) return { valid: false, text }
  const deckNames = [...new Set(built.allCards.map((c) => c.deck))].filter(Boolean).join(', ') || 'baralho'
  return {
    valid: true,
    text,
    deckNames,
    shooterCount: built.shooterCards.length,
    painelCount: built.painelCards.length,
  }
}

function restart() {
  deck = null
  deckText = null
  showLoadScreen(handleLoad, {
    savedDeck: buildSavedDeckInfo(),
    onForget: () => {
      clearSavedDeck()
      restart()
    },
  })
}

function renderEndScreen(summary) {
  const practiceAvailable = !painelDone && deck.painelCards.length > 0
  showSectorEnd({
    summary,
    onPlayAgain: restart,
    practiceCount: practiceAvailable ? deck.painelCards.length : 0,
    onPractice: practiceAvailable ? () => startPainelPractice(summary) : null,
    onExportTags: downloadTagsExport,
  })
}

function startPainelPractice(summary) {
  const ordered = [...deck.painelCards].sort((a, b) => (history[b.guid]?.erros ?? 0) - (history[a.guid]?.erros ?? 0))
  const session = createPainelSession(ordered)
  let revealed = false

  function onKeyDown(e) {
    const card = nextPainelCard(session)
    if (!card) return
    if (!revealed && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault()
      reveal(card)
    } else if (revealed && e.code === 'Digit1') {
      assess(card, true)
    } else if (revealed && e.code === 'Digit2') {
      assess(card, false)
    }
  }
  window.addEventListener('keydown', onKeyDown)

  function renderCard() {
    const card = nextPainelCard(session)
    if (!card) {
      window.removeEventListener('keydown', onKeyDown)
      painelDone = true
      renderEndScreen(summary)
      return
    }
    revealed = false
    showPainelCard({
      index: session.pointer,
      total: session.queue.length,
      question: card.question,
      onReveal: () => reveal(card),
    })
  }

  function reveal(card) {
    revealed = true
    showPainelAnswer({
      index: session.pointer,
      total: session.queue.length,
      question: card.question,
      answer: card.answer,
      onAssess: (correct) => assess(card, correct),
    })
  }

  function assess(card, correct) {
    history = recordResult(history, card.guid, correct)
    saveHistory(history)
    sessionResults.push({ guid: card.guid, correct })
    resolvePainel(session, correct)
    renderCard()
  }

  renderCard()
}

function downloadTagsExport() {
  const tsv = exportTagsTsv(deckText, sessionResults)
  const blob = new Blob([tsv], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'star-anki-tags.txt'
  link.click()
  URL.revokeObjectURL(url)
}

function mountGame(session) {
  const hud = createGameHud()

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0b0d12)
  scene.fog = new THREE.FogExp2(0x0b0d12, 0.014)

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 400)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  hud.sceneRoot.appendChild(renderer.domElement)

  scene.add(new THREE.AmbientLight(0x50607a, 0.7))
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.1)
  sun.position.set(60, 90, 40)
  scene.add(sun)

  const grid = new THREE.GridHelper(420, 42, 0x3a4a5c, 0x232d38)
  grid.position.set(-27, GROUND_Y, -85)
  scene.add(grid)

  const rail = createRailController(camera, scene)
  const effects = createEffectsSystem(scene)
  const combat = createCombatSystem(scene, rail, effects)
  const input = createInputState()

  let phase = null
  let phaseTimer = 0
  let cycleTimer = 0
  let enemyTimer = 0
  let questionResult = null
  let pendingSectorOver = false
  let consecutiveCorrect = 0
  let speedMultiplier = 1
  let paused = false
  let lastTime = performance.now()
  let rafId = null
  let stopped = false

  let isBossCycle = false
  let isReviewQuestion = false
  let bossDifficulty = 0
  let arenaTotalMs = ARENA_MS_BASE
  let altTotalMs = ALT_MS
  let bonusTimer = 0

  let goldenTimer = randomGoldenInterval()
  let goldenArenaTimer = 0
  let goldenCard = null

  let invincibleTimer = 0

  let fireCooldown = DEFAULT_FIRE_COOLDOWN
  let aimAssistAngle = DEFAULT_AIM_ASSIST_ANGLE
  let projectileCount = PROJECTILE_COUNT_START
  let correctBuffCount = 0

  let enemyIntervalMin = ENEMY_INTERVAL_MIN_BASE
  let enemyIntervalMax = ENEMY_INTERVAL_MAX_BASE
  let enemyAggression = 1

  // estado da mira em NDC (Normalized Device Coordinates: -1..1 em x e y)
  let reticleNDCX = 0
  let reticleNDCY = 0
  let reticleVelX = 0
  let reticleVelY = 0

  // raio reutilizado pra não alocar Vector3 por frame
  const rayHelper = new THREE.Vector3()

  function randomEnemyInterval() {
    return enemyIntervalMin + Math.random() * (enemyIntervalMax - enemyIntervalMin)
  }

  function randomBonusInterval() {
    return BONUS_INTERVAL_MIN + Math.random() * (BONUS_INTERVAL_MAX - BONUS_INTERVAL_MIN)
  }

  function randomGoldenInterval() {
    return GOLDEN_INTERVAL_MIN_MS + Math.random() * (GOLDEN_INTERVAL_MAX_MS - GOLDEN_INTERVAL_MIN_MS)
  }

  function randomGoldenArenaMs() {
    return GOLDEN_ARENA_MS_MIN + Math.random() * (GOLDEN_ARENA_MS_MAX - GOLDEN_ARENA_MS_MIN)
  }

  function computeTimeBonus(totalMs) {
    const elapsed = Math.min(Math.max(totalMs - phaseTimer, 0), totalMs)
    return
