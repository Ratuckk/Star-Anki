import * as THREE from 'three'
import { buildDeck, exportTagsTsv, parseAnkiExport } from './anki.js'
import { createSession, nextQuestion, resolveAnswer, getSummary, createPainelSession, nextPainelCard, resolvePainel, pickBonusCard, buildBonusQuestion } from './quiz.js'
import { createRailController } from './rail.js'
import { createCombatSystem } from './combat.js'
import { createEnemiesSystem } from './enemies.js'
import { createPlayerSystem } from './player.js'
import { createEffectsSystem } from './effects.js'
import { createInputState } from './input.js'
import { showPreGameMenu, showDeckManager, showSettingsScreen, createGameHud, showSectorEnd, showPainelCard, showPainelAnswer } from './hud.js'
import { loadHistory, saveHistory, recordResult } from './storage.js'
import { getDeck, buildMergedDeck } from './decks.js'
import { getSettings } from './settings.js'
import { getBindings, isActionPressed } from './keybindings.js'
import { pickRandomCards } from './roguelike.js'

const CYCLE_MS = 90000
const WARNING_MS = 10000
const RECALL_MS = 3500
const ALT_MS = 6000
const FEEDBACK_MS = 1500
const SPEED_STEP = 0.05
const BOOST_EVERY_CORRECT = 2
const GROUND_Y = -10

const INVINCIBILITY_FLICKER_MS = 90

// ============ SHAKE AO LEVAR HIT ============
const HIT_SHAKE_DURATION_MS = 300
const SHIP_SHAKE_MAGNITUDE = 0.3
const CAMERA_SHAKE_MAGNITUDE = 0.5

// ============ BACKGROUND POR "NÍVEL" ============
const LEVEL_BACKGROUNDS = [
  0x0b0d12,
  0x120b18,
  0x0b1812,
  0x18110b,
  0x0b1218,
  0x180b0f,
]

// ============ MIRA ============
const RETICLE_AHEAD = 30
const RETICLE_OVERSHOOT_FACTOR = 0.12
const RETICLE_SETTLE_RATE = 6

const BOSS_EVERY_QUESTIONS = 5
const BOSS_CYCLE_MS = 120000
const BOSS_ENEMY_INTERVAL_MULT = 0.7
const BOSS_BUILDUP_MS = 90000
// ============ FASE 5: CAÇADA DE PERGUNTAS DO CHEFE (orbes no mapa) ============
const BOSS_QUESTION_COUNT = 6 // quantos orbes-pergunta espalhados na arena do chefe
const BOSS_HUNT_BONUS_MS = 10000 // tempo ganho a cada pergunta acertada durante a caçada
const BOSS_BASE_HP = 3
const BOSS_DEFEAT_BONUS = 500
const BOSS_SPREAD_MIN_BASE = 45
const BOSS_SPREAD_MAX_BASE = 95
const BOSS_SPREAD_STEP = 12
const BOSS_SPREAD_MIN_CAP = 75
const BOSS_SPREAD_MAX_CAP = 150
const BOSS_EXTRA_ENEMIES_BASE = 2
const BOSS_EXTRA_ENEMIES_STEP = 1
const BOSS_EXTRA_ENEMIES_CAP = 6
const BOSS_DIFFICULTY_CAP = 5

// intervalo de spawn do modo ARENA
const ENEMY_INTERVAL_MIN_BASE = 900
const ENEMY_INTERVAL_MAX_BASE = 1500
const ENEMY_INTERVAL_FLOOR = 350
const ENEMY_INTERVAL_STEP = 70
const ENEMY_AGGRESSION_STEP = 0.15
const ENEMY_AGGRESSION_CAP = 3.5

// ============ FASE 4: TETO DE INIMIGOS E TAXA DE SPAWN DO MODO NORMAL ============
const ENEMY_CAP_NORMAL_BASE = 16
const ENEMY_CAP_ARENA_BASE = 20
const ENEMY_CAP_STEP_PER_ERROR = 1

const NORMAL_SPAWN_INTERVAL_MS = 2500
const NORMAL_SPAWN_MIN_COUNT = 2
const NORMAL_SPAWN_MAX_COUNT = 4
const NORMAL_SPAWN_PAUSE_BEFORE_QUESTION_MS = 3000
const MINI_SWARM_CHANCE = 0.22

const BONUS_INTERVAL_MIN = 9000
const BONUS_INTERVAL_MAX = 16000

const REVIEW_ENEMY_INTERVAL_MULT = 0.6
const REVIEW_ANSWER_MS_MULT = 0.75

const GOLDEN_INTERVAL_MIN_MS = 45000
const GOLDEN_INTERVAL_MAX_MS = 100000
const GOLDEN_ARENA_MS_MIN = 25000
const GOLDEN_ARENA_MS_MAX = 30000
const GOLDEN_SPREAD_MIN = 40
const GOLDEN_SPREAD_MAX = 90

const TIME_ENEMY_SPAWN_CHANCE = 0.2

// ============ TRANSIÇÃO PARA ALL-RANGE MODE (dourado/chefe se aproximando) — Fase 5 ============
// aviso visível ("surgindo em Ns") nos últimos ARENA_WARNING_COUNTDOWN_MS antes da arena
const ARENA_WARNING_COUNTDOWN_MS = 5000
// para de gerar inimigo/bônus/dourado novo a partir daqui (3s de silêncio antes do aviso
// começar a contar, mais os 5s do aviso em si = 8s totais sem spawn novo)
const ARENA_WARNING_STOP_SPAWN_MS = 8000
// duração da cutscene (câmera se ajeitando) entre o fim do aviso e a arena de verdade começar
const ARENA_CUTSCENE_MS = 2500
const ARENA_CUTSCENE_PULLBACK = 14
const ARENA_CUTSCENE_FOV_BUMP = 16

// ============ ROGUELIKE (fase 4) ============
// só o que continua sendo lido/usado direto em main.js — os stats que as cartas mutam
// (escudo/homing/boost/etc.) agora moram em player.js
const HOMING_LOCK_INTERVAL_MS = 500

const DODGE_TAP_WINDOW_MS = 350
const DEFLECT_RADIUS = 6

// ============ PROPULSOR / REPULSOR (A/S — Fase 3) ============
const RAM_DAMAGE = 5

// ============ VIGNETTE DE VIDA BAIXA ============
// a partir de qual fração da vida máxima a vignette começa a aparecer, e quão vermelha ela
// fica no pior caso (0 = invisível, 1 = vermelho bem forte). O HUD cuida de suavizar a
// transição via CSS; aqui só decidimos a intensidade a cada frame.
const LOW_HEALTH_THRESHOLD_FRAC = 0.4

let deck = null
let deckTexts = []
let currentDeckIds = null
let history = loadHistory()
let sessionResults = []
let painelDone = false

function handlePlayDeck(deckId) {
  const entry = getDeck(deckId)
  if (!entry) return
  const built = buildDeck(entry.text)
  if (built.warning) return

  currentDeckIds = deckId
  deck = built
  deckTexts = [entry.text]
  sessionResults = []
  painelDone = false
  mountGame(createSession(deck, { history, startingHealth: getSettings().startingHealth }))
}

function handlePlayMergedDecks(deckIds) {
  const merged = buildMergedDeck(deckIds)
  if (merged.error) return

  currentDeckIds = deckIds
  deck = merged.built
  deckTexts = merged.texts
  sessionResults = []
  painelDone = false
  mountGame(createSession(deck, { history, startingHealth: getSettings().startingHealth }))
}

function restart() {
  deck = null
  deckTexts = []
  showPreGameMenu({
    onPlay: () => showDeckManager({ onPlay: handlePlayDeck, onPlayMerged: handlePlayMergedDecks, onBack: restart }),
    onAddDeck: () => showDeckManager({ onPlay: handlePlayDeck, onPlayMerged: handlePlayMergedDecks, onBack: restart, startInAdd: true }),
    onSettings: () => showSettingsScreen({ onBack: restart }),
  })
}

function playAgain() {
  if (Array.isArray(currentDeckIds)) handlePlayMergedDecks(currentDeckIds)
  else if (currentDeckIds) handlePlayDeck(currentDeckIds)
  else restart()
}

function renderEndScreen(summary) {
  const practiceAvailable = !painelDone && deck.painelCards.length > 0
  showSectorEnd({
    summary,
    onPlayAgain: playAgain,
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
  deckTexts.forEach((text, i) => {
    const { notes } = parseAnkiExport(text)
    const guidsHere = new Set(notes.map((n) => n.guid))
    const resultsHere = sessionResults.filter((r) => guidsHere.has(r.guid))
    if (resultsHere.length === 0) return

    const tsv = exportTagsTsv(text, resultsHere)
    const blob = new Blob([tsv], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = deckTexts.length > 1 ? `star-anki-tags-${i + 1}.txt` : 'star-anki-tags.txt'
    link.click()
    URL.revokeObjectURL(url)
  })
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
  const effects = createEffectsSystem(scene, { grid })
  const enemies = createEnemiesSystem(scene, rail, effects)
  const player = createPlayerSystem(session)
  const combat = createCombatSystem(scene, rail, effects, enemies, player)
  const input = createInputState()

  const bindings = getBindings()
  const showEnemyHealthBars = getSettings().showEnemyHealthBars

  let debugVisible = false
  let godMode = false
  let infiniteAmmoActive = false
  let hitboxesActive = false
  let slowMoActive = false

  let hitShakeTimer = 0

  let pendingCardChoice = false
  let lastDodgeLeftTapAt = -Infinity
  let lastDodgeRightTapAt = -Infinity

  let bossHealthMultiplier = 1
  let bossBuildupTimer = 0
  let bossOrbsRemaining = 0

  // ============ CUTSCENE DE TRANSIÇÃO PARA ALL-RANGE (Fase 5) ============
  let arenaCutsceneTimer = 0
  let arenaCutsceneOnDone = null // callback chamado quando a cutscene termina (enterGoldenArena/enterBossBuildup)
  let arenaCutsceneBaseCameraPos = null // posição da câmera capturada no instante em que a cutscene começa
  let arenaCutsceneBaseForward = null // direção "pra frente" da nave nesse mesmo instante

  let fireHeldMs = 0
  let reticleOffsetX = 0
  let reticleOffsetY = 0

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
  let altTotalMs = ALT_MS
  let bonusTimer = 0

  let goldenTimer = randomGoldenInterval()
  let goldenArenaTimer = 0
  let goldenCard = null

  let enemyIntervalMin = ENEMY_INTERVAL_MIN_BASE
  let enemyIntervalMax = ENEMY_INTERVAL_MAX_BASE
  let enemyAggression = 1

  let enemyCap = 0
  let normalSpawnTimer = NORMAL_SPAWN_INTERVAL_MS

  function currentEnemyCap() {
    return (rail.isArena() ? ENEMY_CAP_ARENA_BASE : ENEMY_CAP_NORMAL_BASE) + enemyCap
  }

  function randomEnemyInterval() {
    return enemyIntervalMin + Math.random() * (enemyIntervalMax - enemyIntervalMin)
  }

  function currentHomingAllowedTargets(heldMs) {
    const chargeMs = Math.max(0, heldMs - player.config.homingChargeMinMs)
    return Math.max(1, Math.min(player.config.homingMaxTargets, 1 + Math.floor(chargeMs / HOMING_LOCK_INTERVAL_MS)))
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
    return 1.5 - (elapsed / totalMs) * 0.5
  }

  function slotForPressed(pressedSet) {
    for (let i = 0; i < 4; i += 1) {
      if (isActionPressed(bindings, pressedSet, `quizSlot${i + 1}`)) return i
    }
    return undefined
  }

  function processAnswerPhase(events, inputState, dt, totalMs, mode) {
    let outcome = null

    if (events.targetHit) {
      const shotsFired = combat.getQuizShotsFired()
      outcome = {
        type: events.targetHit.isCorrect ? 'correct' : 'wrong',
        card: questionResult.card,
        timeBonus: computeTimeBonus(totalMs),
        accuracyBonus: Math.max(1.0, 1.2 - 0.1 * (shotsFired - 1)),
      }
    } else {
      const slot = slotForPressed(inputState.pressed)
      if (slot !== undefined) {
        outcome = {
          type: slot === questionResult.correctSlot ? 'correct' : 'wrong',
          card: questionResult.card,
          timeBonus: computeTimeBonus(totalMs),
          accuracyBonus: 1.2,
        }
      } else {
        phaseTimer -= dt * 1000
        if (phaseTimer <= 0) {
          outcome = {
            type: 'timeout',
            card: questionResult.card,
            timeBonus: computeTimeBonus(totalMs),
            accuracyBonus: Math.max(1.0, 1.2 - 0.1 * combat.getQuizShotsFired()),
          }
        }
      }
    }

    if (!outcome) return
    if (mode === 'golden') settleGoldenBonus(outcome)
    else settleQuestion(outcome)
  }

  function applySpeedProgression(type) {
    if (type === 'correct') {
      consecutiveCorrect += 1
      if (consecutiveCorrect % BOOST_EVERY_CORRECT === 0) {
        speedMultiplier *= 1 + SPEED_STEP
        rail.setSpeedMultiplier(speedMultiplier)
      }
    } else {
      consecutiveCorrect = 0
      speedMultiplier = 1
      rail.setSpeedMultiplier(1)
    }
  }

  // efeito de cada carta mora em player.js (é estado do jogador) — combat.js já lê
  // projectileCount/aimAssistAngle direto de player.config (Fase 3 da refatoração), então só
  // fireCooldown (que tem lógica própria de override pro debug "Tiro infinito") e o wingman
  // (mesh cosmético, vive em combat.js) ainda precisam de sincronização explícita aqui
  function applyRoguelikeCard(card) {
    player.applyCard(card)
    combat.setFireCooldown(player.config.fireCooldown)
    combat.setWingmanCount(player.getWingmanCount())
    hud.setLives(session.lives, player.getMaxLives())
  }

  function buildCardExcludeSet() {
    return player.buildCardExcludeSet()
  }

  function enterCardChoice(onDone) {
    const cards = pickRandomCards(3, buildCardExcludeSet())
    if (cards.length === 0) { onDone(); return }
    phase = 'cardChoice'
    hud.showCardChoice({
      cards,
      onPick: (card) => {
        applyRoguelikeCard(card)
        onDone()
      },
    })
  }

  function applyDifficulty() {
    enemyIntervalMin = Math.max(ENEMY_INTERVAL_FLOOR, enemyIntervalMin - ENEMY_INTERVAL_STEP)
    enemyIntervalMax = Math.max(enemyIntervalMin + 150, enemyIntervalMax - ENEMY_INTERVAL_STEP)
    enemyAggression = Math.min(ENEMY_AGGRESSION_CAP, enemyAggression + ENEMY_AGGRESSION_STEP)
    combat.setEnemyAggressiveness(enemyAggression)
    enemyCap += ENEMY_CAP_STEP_PER_ERROR
  }

  function applyBossDifficulty() {
    bossDifficulty = Math.min(BOSS_DIFFICULTY_CAP, bossDifficulty + 1)
  }

  function currentBossSpread() {
    return {
      distanceMin: Math.min(BOSS_SPREAD_MIN_CAP, BOSS_SPREAD_MIN_BASE + bossDifficulty * BOSS_SPREAD_STEP),
      distanceMax: Math.min(BOSS_SPREAD_MAX_CAP, BOSS_SPREAD_MAX_BASE + bossDifficulty * BOSS_SPREAD_STEP),
    }
  }

  function currentBossExtraEnemies() {
    return Math.min(BOSS_EXTRA_ENEMIES_CAP, BOSS_EXTRA_ENEMIES_BASE + bossDifficulty * BOSS_EXTRA_ENEMIES_STEP)
  }

  function enterCombat() {
    phase = 'combat'
    isBossCycle = (session.pointer + 1) % BOSS_EVERY_QUESTIONS === 0
    isReviewQuestion = (history[session.queue[session.pointer].guid]?.erros ?? 0) > 0
    cycleTimer = isBossCycle ? BOSS_CYCLE_MS : CYCLE_MS
    enemyTimer = randomEnemyInterval() * (isBossCycle ? BOSS_ENEMY_INTERVAL_MULT : 1) * (isReviewQuestion ? REVIEW_ENEMY_INTERVAL_MULT : 1)
    normalSpawnTimer = NORMAL_SPAWN_INTERVAL_MS
    bonusTimer = randomBonusInterval()
    rail.setAdvancing(true)
    hud.setQuestion(null)
    hud.setAlternatives(null)
    hud.setFeedback(null)
    hud.setCountdown(null)
    hud.setBossActive(false)

    const bg = LEVEL_BACKGROUNDS[session.pointer % LEVEL_BACKGROUNDS.length]
    scene.background.set(bg)
    scene.fog.color.set(bg)
  }

  function enterRecall() {
    phase = 'recall'
    phaseTimer = RECALL_MS
    rail.setAdvancing(false)
    combat.clearBonusTargets()
    hud.setCountdown(null)
    hud.setQuestion(session.queue[session.pointer].question)
    hud.setAlternatives(null)
    hud.setFeedback(null)
  }

  function enterAlternatives() {
    const result = nextQuestion(session, deck.allCards)
    if (!result) {
      endSector()
      return
    }
    questionResult = result
    phase = 'alternatives'
    altTotalMs = ALT_MS * (isReviewQuestion ? REVIEW_ANSWER_MS_MULT : 1)
    phaseTimer = altTotalMs
    hud.setQuestion(result.card.question)
    hud.setAlternatives(result.alternatives)
    combat.spawnQuizTargets(result.alternatives)
  }

  // Fase 5: a caçada agora é literal — 6 orbes-pergunta genéricos espalhados pela arena
  // (combat.spawnBossOrbs), o jogador precisa achar e atirar em cada um pra revelar/responder
  // aquela pergunta (numa pausa total, ver triggerBossQuestion). Nada de pergunta já visível
  // na tela esperando 4 alternativas-alvo, como era antes.
  function enterBossBuildup() {
    phase = 'bossBuildup'
    bossBuildupTimer = BOSS_BUILDUP_MS
    bossHealthMultiplier = 1
    bossOrbsRemaining = BOSS_QUESTION_COUNT
    questionResult = null
    rail.enterArena()
    hud.setBossActive(true, bossOrbsRemaining)
    hud.setCountdown(null)
    for (let i = 0; i < currentBossExtraEnemies(); i += 1) combat.spawnEnemy()
    combat.spawnBossOrbs(BOSS_QUESTION_COUNT, currentBossSpread())
  }

  // chamado quando um projétil acerta QUALQUER orbe-pergunta (events.bossOrbHit) — pausa total
  // (nave travada, ver tick()) e mostra a pergunta+alternativas centralizadas pra escolher por
  // clique, em vez de atirar nelas
  function triggerBossQuestion() {
    const result = nextQuestion(session, deck.allCards)
    if (!result) {
      endSector()
      return
    }
    questionResult = result
    bossOrbsRemaining = Math.max(0, bossOrbsRemaining - 1)
    hud.setBossActive(true, bossOrbsRemaining)
    phase = 'bossQuestionPause'
    hud.showQuestionModal({
      question: result.card.question,
      alternatives: result.alternatives,
      onPick: (slot) => {
        settleBossBuildupQuestion({
          type: slot === questionResult.correctSlot ? 'correct' : 'wrong',
          card: questionResult.card,
          timeBonus: 1.2,
          accuracyBonus: 1.2,
        })
      },
    })
  }

  // errar mantém a punição de sempre (vida do chefe dobra); acertar soma tempo de caçada —
  // confirmado com o usuário (ver PROGRESSO.md, Fase 5)
  function settleBossBuildupQuestion(outcome) {
    hud.hideQuestionModal()
    const correct = outcome.type === 'correct'
    const resolution = resolveAnswer(session, outcome)
    applySpeedProgression(outcome.type)
    if (!correct) {
      applyDifficulty()
      applyBossDifficulty()
      bossHealthMultiplier *= 2
    } else {
      bossBuildupTimer += BOSS_HUNT_BONUS_MS
    }

    history = recordResult(history, outcome.card.guid, correct)
    saveHistory(history)
    sessionResults.push({ guid: outcome.card.guid, correct })

    hud.setFeedback({
      correct,
      correctAnswer: outcome.card.answer,
      points: resolution.points,
      comboMultiplier: resolution.comboMultiplier,
      health: resolution.healthRemaining,
      accuracyBonus: outcome.accuracyBonus,   // <-- NOVO: HUD usa pra PERFEITO/BOM/ACERTOU
    })

    const outOfLives = applyHealthLoss()
    if (resolution.sectorOver || outOfLives) {
      pendingSectorOver = true
      pendingCardChoice = false
      phase = 'resolution'
      phaseTimer = FEEDBACK_MS
      return
    }

    pendingCardChoice = correct
    phase = 'bossBuildupResolution'
    phaseTimer = FEEDBACK_MS
  }

  // tempo (90s + bônus) acabou antes das 6 perguntas: chefe surge na hora, vida dobrada uma vez
  // por orbe que sobrou sem ser respondido — igual à punição de errar (confirmado com o usuário)
  function finishBossHunt() {
    hud.hideQuestionModal()
    for (let i = 0; i < bossOrbsRemaining; i += 1) bossHealthMultiplier *= 2
    bossOrbsRemaining = 0
    combat.clearBossOrbs()
    enterBossFight()
  }

  // usado tanto pro dourado quanto pro chefe: 5s de aviso (já em andamento antes desta chamada,
  // via hud.setArenaWarning) + cutscene de câmera se ajeitando (nave travada, ver tick()) antes
  // de `onDone` (enterGoldenArena/enterBossBuildup) finalmente rodar
  function startArenaCutscene(kind, onDone) {
    phase = 'arenaCutscene'
    arenaCutsceneTimer = ARENA_CUTSCENE_MS
    arenaCutsceneOnDone = onDone
    arenaCutsceneBaseCameraPos = camera.position.clone()
    arenaCutsceneBaseForward = rail.getFrameAt(0).forward.clone()
    hud.setArenaWarning(null)
    hud.setCountdown(null)
    hud.setArenaCutscene(kind)
  }

  function enterBossFight() {
    phase = 'bossFight'
    hud.setBossActive(false)
    hud.setCountdown(null)
    hud.setBossTint(true)
    combat.clearAllCombatants()
    const bossHp = Math.round(BOSS_BASE_HP * bossHealthMultiplier)
    combat.spawnBossEnemy(bossHp)
    hud.setBossFight(true, bossHp, bossHp)

    // flash branco + zoom out cinematográfico na entrada do chefe
    hud.damageFlash()
    camera.fov = 88
    camera.updateProjectionMatrix()
    setTimeout(() => {
      camera.fov = 70
      camera.updateProjectionMatrix()
    }, 500)
  }

  function enterGoldenArena() {
    phase = 'goldenArena'
    goldenArenaTimer = randomGoldenArenaMs()
    rail.enterArena()
    combat.spawnGoldenSpecial({ distanceMin: GOLDEN_SPREAD_MIN, distanceMax: GOLDEN_SPREAD_MAX })
    hud.setGoldenActive(true)
  }

  function exitGoldenArenaVisuals() {
    rail.exitArena()
    combat.clearGoldenTargets()
    hud.setGoldenActive(false)
  }

  function resumeCombatFromGolden() {
    phase = 'combat'
    rail.setAdvancing(true)
    goldenTimer = randomGoldenInterval()
    hud.setFeedback(null)
  }

  function enterGoldenRecall() {
    goldenCard = pickBonusCard(deck, session)
    phase = 'goldenRecall'
    phaseTimer = RECALL_MS
    rail.setAdvancing(false)
    hud.setQuestion(goldenCard.question)
    hud.setAlternatives(null)
    hud.setFeedback(null)
  }

  function enterGoldenAlternatives() {
    const result = buildBonusQuestion(goldenCard, deck.allCards)
    questionResult = result
    phase = 'goldenAlternatives'
    phaseTimer = ALT_MS
    hud.setQuestion(result.card.question)
    hud.setAlternatives(result.alternatives)
    combat.spawnQuizTargets(result.alternatives)
  }

  function applyHealthLoss() {
    return player.applyHealthLoss()
  }

  function settleQuestion(outcome) {
    combat.clearQuizTargets()
    const resolution = resolveAnswer(session, outcome)
    applySpeedProgression(outcome.type)

    const correct = outcome.type === 'correct'
    if (!correct) applyDifficulty()

    history = recordResult(history, outcome.card.guid, correct)
    saveHistory(history)
    sessionResults.push({ guid: outcome.card.guid, correct })

    hud.setQuestion(null)
    hud.setAlternatives(null)
    hud.setBossActive(false)
    hud.setFeedback({
      correct: outcome.type === 'correct',
      correctAnswer: outcome.card.answer,
      points: resolution.points,
      comboMultiplier: resolution.comboMultiplier,
      health: resolution.healthRemaining,
      accuracyBonus: outcome.accuracyBonus,   // <-- NOVO
    })

    const outOfLives = applyHealthLoss()
    pendingSectorOver = resolution.sectorOver || outOfLives
    pendingCardChoice = correct
    phase = 'resolution'
    phaseTimer = FEEDBACK_MS
  }

  function settleGoldenBonus(outcome) {
    combat.clearQuizTargets()
    const correct = outcome.type === 'correct'

    history = recordResult(history, outcome.card.guid, correct)
    saveHistory(history)
    sessionResults.push({ guid: outcome.card.guid, correct })

    hud.setQuestion(null)
    hud.setAlternatives(null)
    hud.setFeedback({
      correct,
      correctAnswer: outcome.card.answer,
      bonus: true,
      accuracyBonus: outcome.accuracyBonus,   // <-- NOVO (bônus não tem penalidade, mas a HUD usa)
    })

    pendingCardChoice = correct
    phase = 'goldenResolution'
    phaseTimer = FEEDBACK_MS
  }

  function endSector() {
    teardown()
    renderEndScreen(getSummary(session))
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener('resize', onResize)

  function teardown() {
    stopped = true
    cancelAnimationFrame(rafId)
    window.removeEventListener('resize', onResize)
    input.dispose()
    effects.dispose()
    combat.dispose()
    renderer.dispose()
    hud.unmount()
  }

  function tick(now) {
    if (stopped) return
    rafId = requestAnimationFrame(tick)
    const rawDt = Math.min((now - lastTime) / 1000, 0.1)
    const dt = slowMoActive ? rawDt * 0.25 : rawDt
    lastTime = now

    const inputState = input.update()

    if (isActionPressed(bindings, inputState.pressed, 'pause') || inputState.pressed.has('GamepadStart')) {
      paused = !paused
      hud.setPaused(paused)
    }
    if (isActionPressed(bindings, inputState.pressed, 'debugToggle')) {
      debugVisible = !debugVisible
      hud.debug.setVisible(debugVisible)
    }
    if (paused) return

    // ============ PAUSA TOTAL: PERGUNTA DO CHEFE (orbe atingido) ============
    // nave travada, sem input nenhum — só espera a escolha no modal (hud.showQuestionModal),
    // que resolve via settleBossBuildupQuestion. Continua renderizando a cena parada.
    if (phase === 'bossQuestionPause') {
      renderer.render(scene, camera)
      return
    }

    // ============ CUTSCENE DE TRANSIÇÃO PARA ALL-RANGE (dourado/chefe) ============
    // nave travada, só a câmera se move sozinha (puxa pra trás + abre o FOV e volta), igual
    // confirmado com o usuário — ao terminar, chama arenaCutsceneOnDone (enterGoldenArena ou
    // enterBossBuildup), que aí sim muda de fase e liga o modo all-range de verdade.
    if (phase === 'arenaCutscene') {
      arenaCutsceneTimer -= dt * 1000
      const t = THREE.MathUtils.clamp(1 - Math.max(0, arenaCutsceneTimer) / ARENA_CUTSCENE_MS, 0, 1)
      const pull = Math.sin(Math.min(1, t) * Math.PI)
      camera.position.copy(arenaCutsceneBaseCameraPos).addScaledVector(arenaCutsceneBaseForward, -pull * ARENA_CUTSCENE_PULLBACK)
      camera.fov = 70 + pull * ARENA_CUTSCENE_FOV_BUMP
      camera.updateProjectionMatrix()
      camera.lookAt(arenaCutsceneBaseCameraPos.clone().addScaledVector(arenaCutsceneBaseForward, 40))
      if (arenaCutsceneTimer <= 0) {
        camera.fov = 70
        camera.updateProjectionMatrix()
        hud.setArenaCutscene(null)
        const done = arenaCutsceneOnDone
        arenaCutsceneOnDone = null
        done()
      }
      renderer.render(scene, camera)
      return
    }

    hitShakeTimer = Math.max(0, hitShakeTimer - dt * 1000)
    rail.setShakeIntensity(hitShakeTimer > 0 ? SHIP_SHAKE_MAGNITUDE * (hitShakeTimer / HIT_SHAKE_DURATION_MS) : 0)

    player.update(dt)
    rail.update(dt, inputState)
    const playerPos = rail.getPlayerPosition()
    const noseFrame = rail.getFrameAt(0)
    const nosePos = rail.getShipNosePosition()

    let reticleX = 0
    let reticleY = 0
    if (!rail.isArena()) {
      const lateralVel = rail.getPlayerLateralVelocity()
      const targetOffsetX = lateralVel.x * RETICLE_OVERSHOOT_FACTOR
      const targetOffsetY = lateralVel.y * RETICLE_OVERSHOOT_FACTOR
      const settleT = 1 - Math.exp(-RETICLE_SETTLE_RATE * dt)
      reticleOffsetX += (targetOffsetX - reticleOffsetX) * settleT
      reticleOffsetY += (targetOffsetY - reticleOffsetY) * settleT
      reticleX = reticleOffsetX
      reticleY = reticleOffsetY
    } else {
      reticleOffsetX = 0
      reticleOffsetY = 0
    }

    const reticleWorldPos = nosePos.clone()
      .addScaledVector(noseFrame.right, reticleX)
      .addScaledVector(noseFrame.up, reticleY)
      .addScaledVector(noseFrame.forward, RETICLE_AHEAD)

    const fireDirection = reticleWorldPos.clone().sub(nosePos).normalize()

    const isCharging = fireHeldMs >= player.config.homingChargeMinMs
    if (inputState.firing) {
      if (!isCharging) combat.tryFire(nosePos, fireDirection)
      fireHeldMs += dt * 1000
      if (isCharging) {
        const chargeFrac = Math.min(1, (fireHeldMs - player.config.homingChargeMinMs) / (player.config.homingChargeMaxMs - player.config.homingChargeMinMs))
        hud.setChargeIndicator(true, chargeFrac)
        effects.setChargeGlow(true, chargeFrac, nosePos, fireDirection)

        combat.sweepLockOn(nosePos, fireDirection, currentHomingAllowedTargets(fireHeldMs))
        const lockedBars = combat.getLockedEnemySnapshots().map((s) => {
          const ndcL = s.worldPos.project(camera)
          return {
            id: s.id,
            xFrac: THREE.MathUtils.clamp((ndcL.x + 1) / 2, 0, 1),
            yFrac: THREE.MathUtils.clamp((1 - ndcL.y) / 2, 0, 1),
          }
        })
        hud.setLockedEnemyMarkers(lockedBars)
      } else {
        hud.setChargeIndicator(false)
        effects.setChargeGlow(false)
      }
    } else {
      if (isCharging) {
        combat.fireHomingShot(nosePos, currentHomingAllowedTargets(fireHeldMs))
      }
      fireHeldMs = 0
      hud.setChargeIndicator(false)
      effects.setChargeGlow(false)
      combat.clearLockedEnemies()
      hud.setLockedEnemyMarkers([])
    }

    const arenaNow = rail.isArena()
    const dodgeLeftTapped = isActionPressed(bindings, inputState.pressed, 'dodgeLeft')
    const dodgeRightTapped = isActionPressed(bindings, inputState.pressed, 'dodgeRight')
    const nowMs = performance.now()

    if (dodgeLeftTapped) {
      if (arenaNow && inputState.propulsionHeld) {
        rail.triggerArenaLateralDash(-1)
      } else {
        if (nowMs - lastDodgeLeftTapAt <= DODGE_TAP_WINDOW_MS && !player.isFullSpinOnCooldown()) {
          rail.triggerFullSpin(-1)
          player.triggerFullSpinIframes()
          if (player.isDeflectActive()) combat.deflectNearbyProjectiles(playerPos, DEFLECT_RADIUS)
        }
        lastDodgeLeftTapAt = nowMs
      }
    }
    if (dodgeRightTapped) {
      if (arenaNow && inputState.propulsionHeld) {
        rail.triggerArenaLateralDash(1)
      } else {
        if (nowMs - lastDodgeRightTapAt <= DODGE_TAP_WINDOW_MS && !player.isFullSpinOnCooldown()) {
          rail.triggerFullSpin(1)
          player.triggerFullSpinIframes()
          if (player.isDeflectActive()) combat.deflectNearbyProjectiles(playerPos, DEFLECT_RADIUS)
        }
        lastDodgeRightTapAt = nowMs
      }
    }

    if (isActionPressed(bindings, inputState.pressed, 'propulsion')) {
      if (arenaNow && inputState.bank !== 0) {
        rail.triggerArenaLateralDash(inputState.bank)
      } else {
        player.activatePropulsion()
      }
    }
    if (isActionPressed(bindings, inputState.pressed, 'repulsion')) {
      if (arenaNow && inputState.moveY === -1) {
        rail.triggerArenaSummersault()
      } else {
        player.activateRepulsion()
      }
    }

    rail.setSpeedMultiplier(speedMultiplier * player.getBoostSpeedFactor())
    hud.setBoost(player.getBoostCharge(), player.isPropulsionActive() || player.isRepulsionActive())

    // motion lines + distorção de tela só durante o impulso de propulsão (não na repulsão)
    const boostOn = player.isPropulsionActive()
    hud.setMotionLines(boostOn)
    hud.setBoostDistortion(boostOn)

    const ramActive = player.isRamCardActive() && player.isPropulsionActive()
    if (ramActive) player.grantInvincibility(player.getPropulsionActiveTimer())

    const enemiesActive = phase === 'combat' || phase === 'goldenArena' || phase === 'bossBuildup' || phase === 'bossFight'
    const events = combat.update(dt, playerPos, {
      enemiesActive,
      aimOrigin: nosePos,
      aimDirection: fireDirection,
      ramDamage: ramActive ? RAM_DAMAGE : 0,
    })

    // ============ HIT MARKER ============
    // qualquer kill/evento de acerto vira o "X" rápido na mira. Kills ficam vermelhos.
    // (hits SEM kill só aparecem se o combat.js devolver hitsLog — ver bloco abaixo.)
    if (events.enemyKills > 0 || events.bonusKillPoints > 0 || events.goldenSpecialHit || events.bossDefeated) {
      hud.hitMarker(true)
    } else if (events.hitsLog && events.hitsLog.length > 0) {
      hud.hitMarker(false)
    }

    // ============ FAÍSCAS + FLASH NO MESH + SHAKE DE KILL ============
    if (events.hitsLog && events.hitsLog.length > 0) {
      for (const h of events.hitsLog) {
        effects.hitSpark(h.worldPos, h.isHoming ? 0x2bff88 : 0xffb066)
        if (h.meshRef) effects.flashMesh(h.meshRef, 0.06)
      }
    }
    if (events.enemyKills > 0) {
      hitShakeTimer = Math.max(hitShakeTimer, 120)
      effects.gridPulse()
    }

    // ============ NÚMEROS DE DANO FLUTUANTES ============
    // defensivo: só roda se o combat.js devolver hitsLog (com { worldPos, damage, points,
    // killed, isHoming }). Enquanto o combat.js não tiver isso, esse bloco é ignorado e o
    // resto do HUD funciona normalmente.
    if (events.hitsLog && events.hitsLog.length > 0) {
      for (const h of events.hitsLog) {
        const ndcH = h.worldPos.project(camera)
        const xFrac = THREE.MathUtils.clamp((ndcH.x + 1) / 2, 0, 1)
        const yFrac = THREE.MathUtils.clamp((1 - ndcH.y) / 2, 0, 1)
        if (h.points) {
          hud.spawnDamageNumber(xFrac, yFrac, h.points, { points: true, prefix: '+', big: true })
        } else {
          hud.spawnDamageNumber(xFrac, yFrac, h.damage, { homing: !!h.isHoming })
        }
      }
    }

    const lockOn = combat.getLockOnTarget()
    const reticleScreenPos = lockOn ? lockOn.mesh.position.clone() : reticleWorldPos
    const ndc = reticleScreenPos.project(camera)
    hud.setReticlePosition(
      THREE.MathUtils.clamp((ndc.x + 1) / 2, 0, 1),
      THREE.MathUtils.clamp((1 - ndc.y) / 2, 0, 1),
    )
    hud.setReticleLocked(!!lockOn)

    if (showEnemyHealthBars) {
      const bars = combat.getEnemySnapshots().map((s) => {
        const ndcE = s.worldPos.project(camera)
        return {
          id: s.id,
          xFrac: THREE.MathUtils.clamp((ndcE.x + 1) / 2, 0, 1),
          yFrac: THREE.MathUtils.clamp((1 - ndcE.y) / 2, 0, 1),
          hp: s.hp,
          maxHp: s.maxHp,
        }
      })
      hud.setEnemyHealthBars(bars)
    }

    effects.update(dt, playerPos, noseFrame.forward, {
      boosting: speedMultiplier,
      camera,
      shieldValue: player.getShieldValue(),
      shieldMax: player.getShieldMax(),
      boostActive: player.isPropulsionActive(),
    })
    effects.spawnContrailTick(combat.getWingmanPositions())

    if (events.enemyKillPoints) session.score += events.enemyKillPoints
    if (events.bonusKillPoints) session.score += events.bonusKillPoints
    if (events.timeReductionMs) cycleTimer = Math.max(0, cycleTimer - events.timeReductionMs)

    if (events.bossDefeated && phase === 'bossFight') {
      session.score += BOSS_DEFEAT_BONUS
      hud.setBossFight(false)
      hud.setBossTint(false)
      rail.exitArena()
      hud.setFeedback({
        correct: true,
        correctAnswer: '',
        points: BOSS_DEFEAT_BONUS,
        comboMultiplier: session.comboMultiplier,
        health: session.health,
      })
      pendingCardChoice = true
      phase = 'bossVictory'
      phaseTimer = FEEDBACK_MS
    }

    if (events.enemyHits > 0 && !player.isInvincible() && !godMode) {
      hitShakeTimer = HIT_SHAKE_DURATION_MS
      hud.damageFlash()

      // direção aproximada do dano — o combat ainda não devolve a origem do projétil, então
      // chuta pra frente da nave
      const originApprox = playerPos.clone().addScaledVector(noseFrame.forward, 30)
      const ndcDir = originApprox.project(camera)
      hud.showDamageDirection(
        THREE.MathUtils.clamp((ndcDir.x + 1) / 2, 0, 1),
        THREE.MathUtils.clamp((1 - ndcDir.y) / 2, 0, 1),
      )

      const result = player.takeDamage()
      if (result.absorbedByShield) {
        effects.shockwave(playerPos, 0x4da6ff, 0.6)
        if (result.shieldBroke) effects.glassShatter(playerPos, 0x4da6ff)
      } else if (result.outOfLives) {
        endSector()
        return
      }
    }
    rail.setShipVisible(!player.isInvincible() || Math.floor(player.getInvincibleRemainingMs() / INVINCIBILITY_FLICKER_MS) % 2 === 0)

    if (phase === 'goldenArena' || phase === 'bossBuildup') {
      enemyTimer -= dt * 1000
      if (enemyTimer <= 0) {
        if (combat.getEnemyCount() < currentEnemyCap()) combat.spawnEnemy()
        enemyTimer = randomEnemyInterval() * (isBossCycle ? BOSS_ENEMY_INTERVAL_MULT : 1) * (isReviewQuestion ? REVIEW_ENEMY_INTERVAL_MULT : 1)
      }
    } else if (phase === 'combat') {
      // pausa maior (8s) num ciclo de chefe, porque além do "vai vir pergunta" tem o aviso de
      // 5s + cutscene do chefe se aproximando; também para tudo enquanto o dourado está a
      // menos de 8s de surgir (mesma regra, "impedindo a geração de inimigos")
      const spawnPauseThreshold = isBossCycle ? ARENA_WARNING_STOP_SPAWN_MS : NORMAL_SPAWN_PAUSE_BEFORE_QUESTION_MS
      if (cycleTimer > spawnPauseThreshold && goldenTimer > ARENA_WARNING_STOP_SPAWN_MS) {
        normalSpawnTimer -= dt * 1000
        if (normalSpawnTimer <= 0) {
          normalSpawnTimer = NORMAL_SPAWN_INTERVAL_MS
          if (Math.random() < TIME_ENEMY_SPAWN_CHANCE) {
            combat.spawnTimeEnemy()
          } else if (Math.random() < MINI_SWARM_CHANCE) {
            combat.spawnMiniSwarm()
          } else {
            const room = Math.max(0, currentEnemyCap() - combat.getEnemyCount())
            const roll = NORMAL_SPAWN_MIN_COUNT + Math.floor(Math.random() * (NORMAL_SPAWN_MAX_COUNT - NORMAL_SPAWN_MIN_COUNT + 1))
            const count = Math.min(room, roll)
            for (let i = 0; i < count; i += 1) combat.spawnEnemy()
          }
        }
      }
    }

    if (phase === 'combat') {
      if (!isBossCycle && cycleTimer > NORMAL_SPAWN_PAUSE_BEFORE_QUESTION_MS) {
        bonusTimer -= dt * 1000
        if (bonusTimer <= 0) {
          combat.spawnBonusTarget()
          bonusTimer = randomBonusInterval()
        }

        goldenTimer -= dt * 1000
        if (goldenTimer <= 0) startArenaCutscene('golden', enterGoldenArena)
      }

      if (phase === 'combat') {
        cycleTimer -= dt * 1000
        // aviso de "chefe se aproximando" substitui o contador genérico do ciclo nos últimos 5s
        // (confirmado com o usuário); o do dourado aparece por cima, sem esconder o contador
        const bossWarnActive = isBossCycle && cycleTimer > 0 && cycleTimer <= ARENA_WARNING_COUNTDOWN_MS
        const goldenWarnActive = !isBossCycle && goldenTimer > 0 && goldenTimer <= ARENA_WARNING_COUNTDOWN_MS
        if (bossWarnActive) {
          hud.setCountdown(null)
          hud.setArenaWarning('boss', Math.max(1, Math.ceil(cycleTimer / 1000)))
        } else {
          hud.setCountdown(Math.max(0, Math.ceil(cycleTimer / 1000)), cycleTimer <= WARNING_MS)
          hud.setArenaWarning(goldenWarnActive ? 'golden' : null, goldenWarnActive ? Math.max(1, Math.ceil(goldenTimer / 1000)) : null)
        }
        if (cycleTimer <= 0) enterRecall()
      }
    } else if (phase === 'recall') {
      phaseTimer -= dt * 1000
      if (phaseTimer <= 0) {
        if (isBossCycle) startArenaCutscene('boss', enterBossBuildup)
        else enterAlternatives()
      }
    } else if (phase === 'alternatives') {
      processAnswerPhase(events, inputState, dt, altTotalMs, 'normal')
    } else if (phase === 'bossBuildup') {
      bossBuildupTimer -= dt * 1000
      hud.setCountdown(Math.max(0, Math.ceil(bossBuildupTimer / 1000)), bossBuildupTimer <= WARNING_MS)
      if (bossBuildupTimer <= 0) {
        finishBossHunt()
      } else if (events.bossOrbHit) {
        triggerBossQuestion()
      }
    } else if (phase === 'bossBuildupResolution') {
      phaseTimer -= dt * 1000
      if (phaseTimer <= 0) {
        const proceed = () => {
          if (bossOrbsRemaining > 0 && bossBuildupTimer > 0) phase = 'bossBuildup'
          else finishBossHunt()
        }
        if (pendingCardChoice) enterCardChoice(proceed)
        else proceed()
      }
    } else if (phase === 'bossVictory') {
      phaseTimer -= dt * 1000
      if (phaseTimer <= 0) {
        if (pendingCardChoice) enterCardChoice(enterCombat)
        else enterCombat()
      }
    } else if (phase === 'goldenArena') {
      if (events.goldenSpecialHit) {
        exitGoldenArenaVisuals()
        enterGoldenRecall()
      } else {
        goldenArenaTimer -= dt * 1000
        if (goldenArenaTimer <= 0) {
          exitGoldenArenaVisuals()
          resumeCombatFromGolden()
        }
      }
    } else if (phase === 'goldenRecall') {
      phaseTimer -= dt * 1000
      if (phaseTimer <= 0) enterGoldenAlternatives()
    } else if (phase === 'goldenAlternatives') {
      processAnswerPhase(events, inputState, dt, ALT_MS, 'golden')
    } else if (phase === 'resolution') {
      phaseTimer -= dt * 1000
      if (phaseTimer <= 0) {
        if (pendingSectorOver) {
          endSector()
          return
        }
        if (pendingCardChoice) enterCardChoice(enterCombat)
        else enterCombat()
      }
    } else if (phase === 'goldenResolution') {
      phaseTimer -= dt * 1000
      if (phaseTimer <= 0) {
        if (pendingCardChoice) enterCardChoice(resumeCombatFromGolden)
        else resumeCombatFromGolden()
      }
    }

    if (stopped) return

    hud.setStatus({ health: session.health, maxHealth: player.getMaxHealth(), score: session.score, combo: session.comboMultiplier })
    hud.setLives(session.lives, player.getMaxLives())
    hud.setShield(player.getShieldValue(), player.getShieldMax())

    // ============ VIGNETTE DE VIDA BAIXA ============
    // 0 = vida ok (invisível), 1 = crítico. A partir de 40% da vida máxima já começa a
    // aparecer; a 0 de vida fica totalmente vermelho. Suavização é via CSS no hud.js.
    hud.setLowHealth(player.getLowHealthIntensity(LOW_HEALTH_THRESHOLD_FRAC))

    if (phase === 'bossFight') {
      const bossSnap = combat.getBossSnapshot()
      if (bossSnap) hud.setBossFight(true, bossSnap.hp, bossSnap.maxHp)
    }

    if (rail.isArena()) {
      const center = rail.getArenaCenter()
      const mapRadius = 190
      const rel = playerPos.clone().sub(center)
      const playerAngle = Math.atan2(noseFrame.forward.x, noseFrame.forward.z)
      const blips = combat.getMinimapBlips().map((b) => {
        const r = b.worldPos.clone().sub(center)
        return {
          type: b.type,
          xFrac: THREE.MathUtils.clamp(r.x / mapRadius, -1, 1),
          yFrac: THREE.MathUtils.clamp(r.z / mapRadius, -1, 1),
        }
      })
      hud.setMinimap(true, {
        player: {
          xFrac: THREE.MathUtils.clamp(rel.x / mapRadius, -1, 1),
          yFrac: THREE.MathUtils.clamp(rel.z / mapRadius, -1, 1),
          angle: playerAngle,
        },
        blips,
      })
    } else {
      hud.setMinimap(false)
    }

    if (hitShakeTimer > 0) {
      const t = hitShakeTimer / HIT_SHAKE_DURATION_MS
      camera.position.x += (Math.random() * 2 - 1) * CAMERA_SHAKE_MAGNITUDE * t
      camera.position.y += (Math.random() * 2 - 1) * CAMERA_SHAKE_MAGNITUDE * t
    }

    renderer.render(scene, camera)
  }

  function forceAnswerOutcome(correct) {
    if (!questionResult) return
    const outcome = { type: correct ? 'correct' : 'wrong', card: questionResult.card, timeBonus: 1.2, accuracyBonus: 1.2 }
    if (phase === 'goldenAlternatives') settleGoldenBonus(outcome)
    else if (phase === 'bossQuestionPause') settleBossBuildupQuestion(outcome)
    else if (phase === 'alternatives') settleQuestion(outcome)
  }

  hud.debug.bind({
    spawnEnemy: () => combat.spawnEnemy(),
    spawnTimeEnemy: () => combat.spawnTimeEnemy(),
    spawnBonus: () => combat.spawnBonusTarget(),
    spawnGolden: () => combat.spawnGoldenSpecial({ distanceMin: GOLDEN_SPREAD_MIN, distanceMax: GOLDEN_SPREAD_MAX }),
    spawnTank: () => combat.spawnTankEnemy(),
    spawnMiniSwarm: () => combat.spawnMiniSwarm(),
    forceCorrect: () => forceAnswerOutcome(true),
    forceWrong: () => forceAnswerOutcome(false),
    addScore: () => { session.score += 100 },
    heal: () => player.heal(1),
    damage: () => {
      session.health = Math.max(0, session.health - 1)
      if (applyHealthLoss()) endSector()
    },
    fullHeal: () => { session.health = player.getMaxHealth() },
    loseLife: () => {
      session.lives = Math.max(0, session.lives - 1)
      hud.setLives(session.lives, player.getMaxLives())
      if (session.lives <= 0) endSector()
    },
    rechargeShield: () => player.rechargeShield(),
    godMode: () => {
      godMode = !godMode
      hud.debug.setToggleActive('godMode', godMode)
    },
    infiniteAmmo: () => {
      infiniteAmmoActive = !infiniteAmmoActive
      combat.setFireCooldown(infiniteAmmoActive ? 0 : player.config.fireCooldown)
      hud.debug.setToggleActive('infiniteAmmo', infiniteAmmoActive)
    },
    maxBuffs: () => player.debugMaxBuffs(),
    gotoBoss: () => { if (phase === 'combat') enterBossBuildup() },
    skipToBossFight: () => {
      if (phase === 'bossBuildup' || phase === 'bossQuestionPause') finishBossHunt()
      else if (phase === 'combat') { bossHealthMultiplier = 1; rail.enterArena(); enterBossFight() }
    },
    gotoGolden: () => { if (phase === 'combat') enterGoldenArena() },
    clearCombatants: () => combat.clearAllCombatants(),
    showHitboxes: () => {
      hitboxesActive = !hitboxesActive
      combat.setShowHitboxes(hitboxesActive)
      hud.debug.setToggleActive('showHitboxes', hitboxesActive)
    },
    slowMo: () => {
      slowMoActive = !slowMoActive
      hud.debug.setToggleActive('slowMo', slowMoActive)
    },
    giveCard: () => { if (phase === 'combat') enterCardChoice(enterCombat) },
    triggerFullDodge: () => {
      player.grantInvincibility(1000)
      if (player.isDeflectActive()) combat.deflectNearbyProjectiles(rail.getPlayerPosition(), DEFLECT_RADIUS)
      rail.debugForceBank(1, 1000)
    },
    fireHomingTest: () => combat.fireHomingShot(rail.getShipNosePosition(), player.config.homingMaxTargets),
  })

  enterCombat()
  hud.setStatus({ health: session.health, maxHealth: player.getMaxHealth(), score: session.score, combo: session.comboMultiplier })
  hud.setLives(session.lives, player.getMaxLives())
  hud.setShield(player.getShieldValue(), player.getShieldMax())
  lastTime = performance.now()
  rafId = requestAnimationFrame(tick)
}

restart()
