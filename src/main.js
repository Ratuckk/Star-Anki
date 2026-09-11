import * as THREE from 'three'
import { buildDeck, exportTagsTsv } from './anki.js'
import { createSession, nextQuestion, resolveAnswer, getSummary, createPainelSession, nextPainelCard, resolvePainel, pickBonusCard, buildBonusQuestion, STARTING_SHIELDS } from './quiz.js'
import { createRailController } from './rail.js'
import { createCombatSystem, DEFAULT_FIRE_COOLDOWN, DEFAULT_AIM_ASSIST_ANGLE } from './combat.js'
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

// depois de tomar um hit, o jogador fica intocável por um instante — sem isso, um único inimigo atravessando
// a hitbox ou uma sequência de projéteis próximos derruba vários pontos de vida no mesmo momento, sem chance de reagir
const INVINCIBILITY_MS = 1200
const INVINCIBILITY_FLICKER_MS = 90

// distância à frente do nariz da nave usada só pra projetar a mira na tela — o tiro em si continua saindo
// na direção real da câmera (ver tryFire), isso é puramente visual pra mira acompanhar a nave suavemente
const RETICLE_AHEAD_DISTANCE = 20

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

// inimigo dourado especial: raro, força All-Range imediatamente, pausa o cycleTimer enquanto existir
const GOLDEN_INTERVAL_MIN_MS = 45000
const GOLDEN_INTERVAL_MAX_MS = 100000
const GOLDEN_ARENA_MS_MIN = 25000
const GOLDEN_ARENA_MS_MAX = 30000
const GOLDEN_SPREAD_MIN = 40
const GOLDEN_SPREAD_MAX = 90

// chance de o spawn periódico de inimigo, durante combate normal, ser o redutor de tempo em vez do vermelho comum
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
  // lembra do baralho pra próxima sessão — o texto bruto é o mesmo que foi colado/carregado,
  // então dá pra re-parsear exatamente igual quando o usuário clicar em "Usar baralho salvo"
  saveDeck(text)
  deck = built
  deckText = text
  sessionResults = []
  painelDone = false
  mountGame(createSession(deck, { history }))
}

// monta o objeto que showLoadScreen() usa pra desenhar a seção "Baralho salvo" — já validando
// que o texto salvo ainda passa pelo buildDeck, pra não oferecer um botão que só daria erro
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
  const combat = createCombatSystem(scene, rail)
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

  // teardown() marca isso pra o tick atual poder abortar cedo depois que o HUD/renderer foram
  // desmontados. Sem isso, um endSector() no meio do tick (via enterAlternatives/enterBossArena
  // chamados de dentro do handler de 'recall') deixava o código continuar e chamar
  // hud.setStatus()/renderer.render() em elementos já destruídos.
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
  // espelha o padrão do combat.js (canhões duplos); o buff de acerto sobe isso até PROJECTILE_COUNT_CAP
  let projectileCount = PROJECTILE_COUNT_START
  let correctBuffCount = 0

  let enemyIntervalMin = ENEMY_INTERVAL_MIN_BASE
  let enemyIntervalMax = ENEMY_INTERVAL_MAX_BASE
  let enemyAggression = 1

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
      const slot = [...inputState.pressed]
        .map((code) => ({ Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[code]))
        .find((s) => s !== undefined)
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

  // dificuldade do CHEFE sobe só quando o jogador erra/estoura o tempo NUM chefe, e nunca desce
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
    // dificuldade por histórico é por-pergunta e coexiste com a permanente da sessão (enemyIntervalMin/Max/aggression)
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

  // timeout (não encontrado a tempo) ou pergunta bônus resolvida: volta ao combate de onde parou, sem
  // passar por enterCombat() — cycleTimer/enemyTimer/bonusTimer/isBossCycle continuam intocados desde
  // que o dourado especial apareceu, o que é exatamente o efeito de "pausa" pedido
  function resumeCombatFromGolden() {
    phase = 'combat'
    rail.setAdvancing(true)
    goldenTimer = randomGoldenInterval()
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

  // pergunta bônus do dourado especial: NÃO passa por resolveAnswer (não mexe em pointer/shields/combo/dificuldade),
  // acerto dá mais um estágio do buff de arma, erro/timeout não tem penalidade nenhuma — mas ambos entram no
  // histórico e no export de tags igual a uma pergunta normal, pra valer de verdade como estudo
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
    combat.dispose()
    renderer.dispose()
    hud.unmount()
  }

  function tick(now) {
    if (stopped) return
    rafId = requestAnimationFrame(tick)
    const dt = Math.min((now - lastTime) / 1000, 0.1)
    lastTime = now

    const inputState = input.update()

    if (inputState.pressed.has('Escape') || inputState.pressed.has('KeyP') || inputState.pressed.has('GamepadStart')) {
      paused = !paused
      hud.setPaused(paused)
    }
    if (paused) return

    rail.update(dt, inputState)
    const playerPos = rail.getPlayerPosition()
    const noseFrame = rail.getFrameAt(0)
    const nosePos = rail.getShipNosePosition()

    const aimDirection = camera.getWorldDirection(new THREE.Vector3())
    if (inputState.firing) combat.tryFire(nosePos, aimDirection)

    // mira puramente visual: projeta um ponto à frente do nariz na tela, então o retículo acompanha a nave
    // suavemente (banking, deslocamento lateral) em vez de ficar travado no centro da tela
    const aimPoint = nosePos.clone().addScaledVector(noseFrame.forward, RETICLE_AHEAD_DISTANCE)
    const ndc = aimPoint.project(camera)
    hud.setReticlePosition(THREE.MathUtils.clamp((ndc.x + 1) / 2, 0, 1), THREE.MathUtils.clamp((1 - ndc.y) / 2, 0, 1))

    const enemiesActive = phase === 'combat' || phase === 'boss' || phase === 'goldenArena'
    const events = combat.update(dt, playerPos, { enemiesActive })

    if (events.enemyKillPoints) session.score += events.enemyKillPoints
    if (events.bonusKillPoints) session.score += events.bonusKillPoints
    // reduz o cycleTimer (pausado ou não) sempre que um inimigo redutor de tempo é abatido, mesmo durante o dourado especial
    if (events.timeReductionMs) cycleTimer = Math.max(0, cycleTimer - events.timeReductionMs)

    invincibleTimer = Math.max(0, invincibleTimer - dt * 1000)
    // um hit só conta se o jogador não estiver invencível — evita que colisões múltiplas no mesmo instante
    // (ou uma sequência delas em menos de INVINCIBILITY_MS) derrubem vários pontos de vida de uma vez
    if (events.enemyHits > 0 && invincibleTimer <= 0) {
      session.shields = Math.max(0, session.shields - 1)
      invincibleTimer = INVINCIBILITY_MS
      if (session.shields <= 0) {
        endSector()
        return
      }
    }
    rail.setShipVisible(invincibleTimer <= 0 || Math.floor(invincibleTimer / INVINCIBILITY_FLICKER_MS) % 2 === 0)

    // spawn periódico de inimigo continua durante a caça ao dourado especial (não é um "tempo seguro")
    if (phase === 'combat' || phase === 'goldenArena') {
      enemyTimer -= dt * 1000
      if (enemyTimer <= 0) {
        if (phase === 'combat' && Math.random() < TIME_ENEMY_SPAWN_CHANCE) combat.spawnTimeEnemy()
        else combat.spawnEnemy()
        enemyTimer = randomEnemyInterval() * (isBossCycle ? BOSS_ENEMY_INTERVAL_MULT : 1) * (isReviewQuestion ? REVIEW_ENEMY_INTERVAL_MULT : 1)
      }
    }

    if (phase === 'combat') {
      // alvo bônus verde e o dourado especial só no ciclo de combate normal, nunca durante o build-up de um chefe
      if (!isBossCycle) {
        bonusTimer -= dt * 1000
        if (bonusTimer <= 0) {
          combat.spawnBonusTarget()
          bonusTimer = randomBonusInterval()
        }

        goldenTimer -= dt * 1000
        if (goldenTimer <= 0) enterGoldenArena()
      }

      // enterGoldenArena() acima pode ter trocado a fase neste mesmo tick — nesse caso o ciclo principal
      // já está pausado (é exatamente o efeito pedido) e não deve descontar mais nada até o dourado sumir
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

    // o handler de 'recall' acima pode ter chamado enterAlternatives()/enterBossArena(), que por sua
    // vez podem ter chamado endSector() → teardown() já limpou HUD/renderer. Aborta aqui pra não
    // mexer em elementos destruídos (o RAF do próximo frame já foi cancelado por teardown()).
    if (stopped) return

    hud.setStatus({ shields: session.shields, maxShields: STARTING_SHIELDS, score: session.score, combo: session.comboMultiplier })
    renderer.render(scene, camera)
  }

  enterCombat()
  hud.setStatus({ shields: session.shields, maxShields: STARTING_SHIELDS, score: session.score, combo: session.comboMultiplier })
  lastTime = performance.now()
  rafId = requestAnimationFrame(tick)
}

// ponto de entrada: mostra a tela de carregamento já com a seção "Baralho salvo" (se houver
// um salvo de sessão anterior). Antes era showLoadScreen(handleLoad) direto — agora passa por
// restart(), que monta o savedDeckInfo e liga o botão "Esquecer".
restart()