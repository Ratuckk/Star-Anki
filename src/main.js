import * as THREE from 'three'
import { buildDeck, exportTagsTsv } from './anki.js'
import { createSession, nextQuestion, resolveAnswer, getSummary, createPainelSession, nextPainelCard, resolvePainel, pickBonusCard, buildBonusQuestion } from './quiz.js'
import { createRailController } from './rail.js'
import { createCombatSystem, DEFAULT_FIRE_COOLDOWN, DEFAULT_AIM_ASSIST_ANGLE } from './combat.js'
import { createEffectsSystem } from './effects.js'
import { createInputState } from './input.js'
import { showPreGameMenu, showDeckManager, showSettingsScreen, createGameHud, showSectorEnd, showPainelCard, showPainelAnswer } from './hud.js'
import { loadHistory, saveHistory, recordResult } from './storage.js'
import { getDeck } from './decks.js'
import { getSettings } from './settings.js'
import { getBindings, isActionPressed } from './keybindings.js'

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
// A mira vive em espaço de MUNDO, ancorada no NARIZ da nave. Ela tem física PRÓPRIA e um
// alcance MAIOR que o da nave — é isso que faz ela "se mover mais e chegar nas bordas antes".
//
// Comparação direta com a nave (rail.js):
//   - Nave:  LATERAL_SPEED=22, BOX_X=12, BOX_Y=8
//   - Mira:  RETICLE_SPEED=35, RETICLE_MAX_X=20, RETICLE_MAX_Y=14
// Ou seja: mira 60% mais rápida e com 66% mais curso lateral que a nave.
//
// O tiro sai do NARIZ e aponta para a MIRA — como os dois são pontos 3D no mesmo espaço, o
// projétil passa visualmente pela mira por construção.
const RETICLE_AHEAD = 30       // distância à frente do nariz onde a mira é posicionada
const RETICLE_MAX_X = 20       // MUITO maior que o da nave (12)
const RETICLE_MAX_Y = 14       // MUITO maior que o da nave (8)
const RETICLE_SPEED = 35       // 60% mais rápida que a nave (22)
const RETICLE_ACCEL = 30       // resposta rápida

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
let currentDeckId = null
let history = loadHistory()
let sessionResults = []
let painelDone = false

function handlePlayDeck(deckId) {
  const entry = getDeck(deckId)
  if (!entry) return
  const built = buildDeck(entry.text)
  if (built.warning) return

  currentDeckId = deckId
  deck = built
  deckText = entry.text
  sessionResults = []
  painelDone = false
  mountGame(createSession(deck, { history, startingShields: getSettings().startingHealth }))
}

function restart() {
  deck = null
  deckText = null
  showPreGameMenu({
    onPlay: () => showDeckManager({ onPlay: handlePlayDeck, onBack: restart }),
    onAddDeck: () => showDeckManager({ onPlay: handlePlayDeck, onBack: restart, startInAdd: true }),
    onSettings: () => showSettingsScreen({ onBack: restart }),
  })
}

// "Jogar novamente" volta direto pro mesmo baralho (sem reenviar/reselecionar) quando possível
function playAgain() {
  if (currentDeckId) handlePlayDeck(currentDeckId)
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

  // lidas uma vez por sessão — a tela de configurações só é acessível fora do jogo, então não
  // precisa reler a cada frame
  const bindings = getBindings()
  const maxShields = session.shields
  const showEnemyHealthBars = getSettings().showEnemyHealthBars

  let debugVisible = false
  let godMode = false
  let infiniteAmmoActive = false
  let hitboxesActive = false
  let slowMoActive = false

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

  // Estado da mira: offset lateral/vertical em relação ao nariz, em unidades de mundo
  let reticleX = 0
  let reticleY = 0
  let reticleVelX = 0
  let reticleVelY = 0

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
    else settleQuestion(outcome, mode === 'boss')
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

  function applyBuff() {
    correctBuffCount += 1
    fireCooldown = Math.max(FIRE_COOLDOWN_FLOOR, fireCooldown * FIRE_COOLDOWN_MULT_PER_CORRECT)
    combat.setFireCooldown(fireCooldown)
    aimAssistAngle = Math.min(AIM_ASSIST_CAP, aimAssistAngle + AIM_ASSIST_STEP)
    combat.setAimAssistAngle(aimAssistAngle)
    if (correctBuffCount % PROJECTILE_STEP_EVERY_CORRECT === 0) {
      projectileCount = Math.min(PROJECTILE_COUNT_CAP, projectileCount + 1)
      combat.setProjectileCount(projectileCount)
    }
  }

  function applyDifficulty() {
    enemyIntervalMin = Math.max(ENEMY_INTERVAL_FLOOR, enemyIntervalMin - ENEMY_INTERVAL_STEP)
    enemyIntervalMax = Math.max(enemyIntervalMin + 150, enemyIntervalMax - ENEMY_INTERVAL_STEP)
    enemyAggression = Math.min(ENEMY_AGGRESSION_CAP, enemyAggression + ENEMY_AGGRESSION_STEP)
    combat.setEnemyAggressiveness(enemyAggression)
  }

  function applyBossDifficulty() {
    bossDifficulty = Math.min(BOSS_DIFFICULTY_CAP, bossDifficulty + 1)
  }

  function currentArenaMs() {
    return Math.max(ARENA_MS_FLOOR, ARENA_MS_BASE - bossDifficulty * ARENA_MS_STEP)
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
    bonusTimer = randomBonusInterval()
    rail.setAdvancing(true)
    hud.setQuestion(null)
    hud.setAlternatives(null)
    hud.setFeedback(null)
    hud.setCountdown(null)
    hud.setBossActive(false)
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

  function enterBossArena() {
    const result = nextQuestion(session, deck.allCards)
    if (!result) {
      endSector()
      return
    }
    questionResult = result
    phase = 'boss'
    arenaTotalMs = currentArenaMs()
    phaseTimer = arenaTotalMs
    rail.enterArena()
    hud.setQuestion(result.card.question)
    hud.setAlternatives(result.alternatives)
    hud.setBossActive(true)
    combat.spawnBossTargets(result.alternatives, currentBossSpread())
    for (let i = 0; i < currentBossExtraEnemies(); i += 1) combat.spawnEnemy()
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

  function settleQuestion(outcome, isBoss) {
    combat.clearQuizTargets()
    if (isBoss) rail.exitArena()
    const resolution = resolveAnswer(session, outcome)
    applySpeedProgression(outcome.type)

    const correct = outcome.type === 'correct'
    if (correct) applyBuff()
    else applyDifficulty()
    if (isBoss && !correct) applyBossDifficulty()

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
      shields: resolution.shieldsRemaining,
    })

    pendingSectorOver = resolution.sectorOver
    phase = 'resolution'
    phaseTimer = FEEDBACK_MS
  }

  function settleGoldenBonus(outcome) {
    combat.clearQuizTargets()
    const correct = outcome.type === 'correct'
    if (correct) applyBuff()

    history = recordResult(history, outcome.card.guid, correct)
    saveHistory(history)
    sessionResults.push({ guid: outcome.card.guid, correct })

    hud.setQuestion(null)
    hud.setAlternatives(null)
    hud.setFeedback({
      correct,
      correctAnswer: outcome.card.answer,
      bonus: true,
    })

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

    rail.update(dt, inputState)
    const playerPos = rail.getPlayerPosition()
    const noseFrame = rail.getFrameAt(0)
    const nosePos = rail.getShipNosePosition()

    // ============ MIRA ============
    // física própria da mira, mais rápida e com mais alcance que a nave. Em modo arena, mira
    // centrada (o voo livre já é a mira).
    if (rail.isArena()) {
      reticleX = 0
      reticleY = 0
      reticleVelX = 0
      reticleVelY = 0
    } else {
      const tvx = inputState.moveX * RETICLE_SPEED
      const tvy = inputState.moveY * RETICLE_SPEED
      const rblend = 1 - Math.exp(-RETICLE_ACCEL * dt)
      reticleVelX += (tvx - reticleVelX) * rblend
      reticleVelY += (tvy - reticleVelY) * rblend
      reticleX += reticleVelX * dt
      reticleY += reticleVelY * dt

      if (reticleX > RETICLE_MAX_X) { reticleX = RETICLE_MAX_X; reticleVelX = 0 }
      else if (reticleX < -RETICLE_MAX_X) { reticleX = -RETICLE_MAX_X; reticleVelX = 0 }
      if (reticleY > RETICLE_MAX_Y) { reticleY = RETICLE_MAX_Y; reticleVelY = 0 }
      else if (reticleY < -RETICLE_MAX_Y) { reticleY = -RETICLE_MAX_Y; reticleVelY = 0 }
    }

    // posição 3D da mira: ancorada no NARIZ, deslocada lateral/verticalmente, e avançada pelo
    // RETICLE_AHEAD no eixo forward
    const reticleWorldPos = nosePos.clone()
      .addScaledVector(noseFrame.right, reticleX)
      .addScaledVector(noseFrame.up, reticleY)
      .addScaledVector(noseFrame.forward, RETICLE_AHEAD)

    // direção do tiro: do NARIZ até a MIRA — o projétil passa visualmente pela mira por construção
    const fireDirection = reticleWorldPos.clone().sub(nosePos).normalize()

    if (inputState.firing) combat.tryFire(nosePos, fireDirection)

    const enemiesActive = phase === 'combat' || phase === 'boss' || phase === 'goldenArena'
    const events = combat.update(dt, playerPos, {
      enemiesActive,
      aimOrigin: nosePos,
      aimDirection: fireDirection,
    })

    // posição visual da mira na tela: projeção do ponto 3D
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

    effects.update(dt, playerPos, noseFrame.forward, { boosting: speedMultiplier })

    if (events.enemyKillPoints) session.score += events.enemyKillPoints
    if (events.bonusKillPoints) session.score += events.bonusKillPoints
    if (events.timeReductionMs) cycleTimer = Math.max(0, cycleTimer - events.timeReductionMs)

    invincibleTimer = Math.max(0, invincibleTimer - dt * 1000)
    if (events.enemyHits > 0 && invincibleTimer <= 0 && !godMode) {
      session.shields = Math.max(0, session.shields - 1)
      invincibleTimer = INVINCIBILITY_MS
      hud.damageFlash()
      if (session.shields <= 0) {
        endSector()
        return
      }
    }
    rail.setShipVisible(invincibleTimer <= 0 || Math.floor(invincibleTimer / INVINCIBILITY_FLICKER_MS) % 2 === 0)

    if (phase === 'combat' || phase === 'goldenArena') {
      enemyTimer -= dt * 1000
      if (enemyTimer <= 0) {
        if (phase === 'combat' && Math.random() < TIME_ENEMY_SPAWN_CHANCE) combat.spawnTimeEnemy()
        else combat.spawnEnemy()
        enemyTimer = randomEnemyInterval() * (isBossCycle ? BOSS_ENEMY_INTERVAL_MULT : 1) * (isReviewQuestion ? REVIEW_ENEMY_INTERVAL_MULT : 1)
      }
    }

    if (phase === 'combat') {
      if (!isBossCycle) {
        bonusTimer -= dt * 1000
        if (bonusTimer <= 0) {
          combat.spawnBonusTarget()
          bonusTimer = randomBonusInterval()
        }

        goldenTimer -= dt * 1000
        if (goldenTimer <= 0) enterGoldenArena()
      }

      if (phase === 'combat') {
        cycleTimer -= dt * 1000
        hud.setCountdown(Math.max(0, Math.ceil(cycleTimer / 1000)), cycleTimer <= WARNING_MS)
        if (cycleTimer <= 0) enterRecall()
      }
    } else if (phase === 'recall') {
      phaseTimer -= dt * 1000
      if (phaseTimer <= 0) {
        if (isBossCycle) enterBossArena()
        else enterAlternatives()
      }
    } else if (phase === 'alternatives') {
      processAnswerPhase(events, inputState, dt, altTotalMs, 'normal')
    } else if (phase === 'boss') {
      processAnswerPhase(events, inputState, dt, arenaTotalMs, 'boss')
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
        enterCombat()
      }
    } else if (phase === 'goldenResolution') {
      phaseTimer -= dt * 1000
      if (phaseTimer <= 0) resumeCombatFromGolden()
    }

    if (stopped) return

    hud.setStatus({ shields: session.shields, maxShields, score: session.score, combo: session.comboMultiplier })
    renderer.render(scene, camera)
  }

  function forceAnswerOutcome(correct) {
    if (!questionResult) return
    const outcome = { type: correct ? 'correct' : 'wrong', card: questionResult.card, timeBonus: 1.2, accuracyBonus: 1.2 }
    if (phase === 'goldenAlternatives') settleGoldenBonus(outcome)
    else if (phase === 'boss') settleQuestion(outcome, true)
    else if (phase === 'alternatives') settleQuestion(outcome, false)
  }

  hud.debug.bind({
    spawnEnemy: () => combat.spawnEnemy(),
    spawnTimeEnemy: () => combat.spawnTimeEnemy(),
    spawnBonus: () => combat.spawnBonusTarget(),
    spawnGolden: () => combat.spawnGoldenSpecial({ distanceMin: GOLDEN_SPREAD_MIN, distanceMax: GOLDEN_SPREAD_MAX }),
    spawnTank: () => combat.spawnTankEnemy(),
    forceCorrect: () => forceAnswerOutcome(true),
    forceWrong: () => forceAnswerOutcome(false),
    addScore: () => { session.score += 100 },
    heal: () => { session.shields = Math.min(maxShields, session.shields + 1) },
    damage: () => { session.shields = Math.max(0, session.shields - 1) },
    fullHeal: () => { session.shields = maxShields },
    godMode: () => {
      godMode = !godMode
      hud.debug.setToggleActive('godMode', godMode)
    },
    infiniteAmmo: () => {
      infiniteAmmoActive = !infiniteAmmoActive
      combat.setFireCooldown(infiniteAmmoActive ? 0 : fireCooldown)
      hud.debug.setToggleActive('infiniteAmmo', infiniteAmmoActive)
    },
    maxBuffs: () => {
      aimAssistAngle = AIM_ASSIST_CAP
      projectileCount = PROJECTILE_COUNT_CAP
      combat.setAimAssistAngle(aimAssistAngle)
      combat.setProjectileCount(projectileCount)
    },
    gotoBoss: () => { if (phase === 'combat') enterBossArena() },
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
  })

  enterCombat()
  hud.setStatus({ shields: session.shields, maxShields, score: session.score, combo: session.comboMultiplier })
  lastTime = performance.now()
  rafId = requestAnimationFrame(tick)
}

restart()
