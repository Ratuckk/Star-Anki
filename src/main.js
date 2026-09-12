import * as THREE from 'three'
import { buildDeck, exportTagsTsv, parseAnkiExport } from './anki.js'
import { createSession, nextQuestion, resolveAnswer, getSummary, createPainelSession, nextPainelCard, resolvePainel, pickBonusCard, buildBonusQuestion } from './quiz.js'
import { createRailController } from './rail.js'
import { createCombatSystem, DEFAULT_FIRE_COOLDOWN, DEFAULT_AIM_ASSIST_ANGLE } from './combat.js'
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

const INVINCIBILITY_MS = 1500
const INVINCIBILITY_FLICKER_MS = 90

// ============ ESCUDO ============
// camada de defesa em FRENTE à barra de saúde: uma barra contínua (não binário cheio/vazio).
// Cada hit consome 1 unidade; depois de um hit, espera SHIELD_REGEN_DELAY_MS e passa a
// regenerar sozinho a SHIELD_REGEN_RATE por segundo — regenera aos poucos mesmo sem ter sido
// zerado de vez, não só quando esgota totalmente. Valores mutáveis (não const) porque cartas
// do roguelike ajustam capacidade/velocidade.
const SHIELD_MAX = 2
const SHIELD_REGEN_DELAY_MS = 1500
const SHIELD_REGEN_RATE = 0.4

// ============ SHAKE AO LEVAR HIT ============
const HIT_SHAKE_DURATION_MS = 300
const SHIP_SHAKE_MAGNITUDE = 0.3
const CAMERA_SHAKE_MAGNITUDE = 0.5

// ============ BACKGROUND POR "NÍVEL" ============
// cores escuras variadas, trocadas a cada pergunta (session.pointer) — só ilusão de ambientes
// diferentes, não muda jogabilidade nenhuma
const LEVEL_BACKGROUNDS = [
  0x0b0d12, // padrão: cinza-azulado escuro
  0x120b18, // roxo escuro
  0x0b1812, // verde escuro
  0x18110b, // marrom/laranja escuro
  0x0b1218, // azul petróleo escuro
  0x180b0f, // vinho escuro
]

// ============ MIRA ============
// A mira fica ancorada no NARIZ da nave e acompanha o MESMO deslocamento lateral da nave
// (rail.getPlayerLateral()), só que amplificado um pouco — "no meio da tela quando a nave
// está centrada, se move junto com ela, um pouquinho mais rápido". Nada de física própria
// independente (isso já foi tentado antes e ficava difícil de prever onde o tiro ia).
const RETICLE_AHEAD = 30        // distância à frente do nariz onde a mira é posicionada
const RETICLE_LATERAL_MULT = 1.25 // um pouco mais rápida/ampla que a nave, mas sempre junto

const BOSS_EVERY_QUESTIONS = 5
const BOSS_CYCLE_MS = 120000
const BOSS_ENEMY_INTERVAL_MULT = 0.7
// caçada de perguntas antes do chefe chegar: 90s procurando blocos flutuantes; cada erro/não
// resposta nesse período DOBRA a vida do chefe (BOSS_BASE_HP * 2^erros)
const BOSS_BUILDUP_MS = 90000
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

const ENEMY_INTERVAL_MIN_BASE = 900
const ENEMY_INTERVAL_MAX_BASE = 1500
const ENEMY_INTERVAL_FLOOR = 350
const ENEMY_INTERVAL_STEP = 70
const ENEMY_AGGRESSION_STEP = 0.15
const ENEMY_AGGRESSION_CAP = 3.5
const WRONG_ANSWER_EXTRA_ENEMIES = 2

const BONUS_INTERVAL_MIN = 9000
const BONUS_INTERVAL_MAX = 16000

const REVIEW_ENEMY_INTERVAL_MULT = 0.6
const REVIEW_ANSWER_MS_MULT = 0.75

const FIRE_COOLDOWN_MULT_PER_CORRECT = 0.85
const FIRE_COOLDOWN_FLOOR = 0.06
const AIM_ASSIST_STEP = THREE.MathUtils.degToRad(1.5)
const AIM_ASSIST_CAP = THREE.MathUtils.degToRad(14)
const PROJECTILE_COUNT_CAP = 4
const PROJECTILE_COUNT_START = 2

const GOLDEN_INTERVAL_MIN_MS = 45000
const GOLDEN_INTERVAL_MAX_MS = 100000
const GOLDEN_ARENA_MS_MIN = 25000
const GOLDEN_ARENA_MS_MAX = 30000
const GOLDEN_SPREAD_MIN = 40
const GOLDEN_SPREAD_MAX = 90

const TIME_ENEMY_SPAWN_CHANCE = 0.2

// ============ ROGUELIKE (fase 4) ============
// caps/pisos das cartas que ajustam mecânicas novas desta fase. As cartas de ofensivo que
// reaproveitam fireCooldown/aimAssistAngle/projectileCount usam os mesmos FIRE_COOLDOWN_*/
// AIM_ASSIST_*/PROJECTILE_COUNT_CAP já existentes acima (antes usados pelo applyBuff()
// automático, que a escolha de carta substitui).
const SHIELD_MAX_CAP = 4
const SHIELD_REGEN_DELAY_FLOOR_MS = 500
const INVINCIBILITY_CAP_MS = 3000
const WINGMAN_CAP = 2
const LIVES_CAP = 5

// tiro teleguiado: segurar o botão de atirar carrega, de HOMING_CHARGE_MIN_MS (começa a valer)
// até HOMING_CHARGE_MAX_MS (carga máxima); nº de alvos escala de HOMING_MIN_TARGETS até
// homingMaxTargets (mutável, cartas aumentam) nesse intervalo
const HOMING_CHARGE_MIN_MS = 1000
const HOMING_CHARGE_MAX_MS = 4000
const HOMING_CHARGE_MIN_FLOOR_MS = 1000
const HOMING_MIN_TARGETS = 2
const HOMING_MAX_TARGETS_BASE = 5
const HOMING_MAX_TARGETS_CAP = 8

// giro-desvio (Z/C): segurar inclina a nave de verdade (rail.js cuida do ângulo) e concede
// i-frames enquanto durar, mais uma folga curta depois de soltar; com a carta certa, também
// rebate projéteis inimigos próximos continuamente enquanto girando
const DODGE_IFRAME_GRACE_MS = 400
const DEFLECT_RADIUS = 6

let deck = null
let deckTexts = [] // textos brutos das fontes do baralho atual (1 normal, 2+ se fundido) — usados na exportação de tags, um arquivo por fonte
let currentDeckIds = null // id único (string) ou array de ids (fusão) — usado por "jogar novamente"
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

// fusão: mesmo fluxo do handlePlayDeck, mas com 2+ baralhos concatenados numa sessão só
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

// "Jogar novamente" volta direto pro mesmo baralho (ou fusão) sem reenviar/reselecionar
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

// baralho fundido = 2+ textos de origem, possivelmente com headers/formatos diferentes — exporta
// um arquivo de tags por fonte, cada um só com os resultados dos guids que pertencem a ela
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
  const effects = createEffectsSystem(scene)
  const combat = createCombatSystem(scene, rail, effects)
  const input = createInputState()

  // lidas uma vez por sessão — a tela de configurações só é acessível fora do jogo, então não
  // precisa reler a cada frame
  const bindings = getBindings()
  const maxHealth = session.health
  let maxLives = session.lives
  const showEnemyHealthBars = getSettings().showEnemyHealthBars

  let debugVisible = false
  let godMode = false
  let infiniteAmmoActive = false
  let hitboxesActive = false
  let slowMoActive = false

  let shieldMax = SHIELD_MAX
  let shieldRegenDelayMs = SHIELD_REGEN_DELAY_MS
  let shieldRegenRate = SHIELD_REGEN_RATE
  let shieldValue = shieldMax
  let shieldRegenDelayTimer = 0
  let hitShakeTimer = 0
  let invincibilityDurationMs = INVINCIBILITY_MS

  // ---- roguelike: estado que as cartas ajustam ----
  let pendingCardChoice = false
  let wingmanCount = 0
  let deflectCardActive = false
  let homingMaxTargets = HOMING_MAX_TARGETS_BASE
  let homingChargeMinMs = HOMING_CHARGE_MIN_MS
  let homingChargeMaxMs = HOMING_CHARGE_MAX_MS
  let dodgeIframeGraceMs = DODGE_IFRAME_GRACE_MS

  // ---- chefe (fase 90s de caçada + o combate em si) ----
  let bossHealthMultiplier = 1
  let bossBuildupTimer = 0

  // ---- tiro carregado / giro-desvio: estado de input em tempo real ----
  let fireHeldMs = 0

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

  let invincibleTimer = 0

  let fireCooldown = DEFAULT_FIRE_COOLDOWN
  let aimAssistAngle = DEFAULT_AIM_ASSIST_ANGLE
  let projectileCount = PROJECTILE_COUNT_START

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

  // efeito de cada carta do roguelike — chamado quando o jogador escolhe uma na tela de
  // escolha (substitui o antigo applyBuff() automático: agora é o jogador quem decide)
  function applyRoguelikeCard(card) {
    switch (card.id) {
      case 'extra-projectile':
        projectileCount = Math.min(PROJECTILE_COUNT_CAP, projectileCount + 1)
        combat.setProjectileCount(projectileCount)
        break
      case 'faster-fire':
        fireCooldown = Math.max(FIRE_COOLDOWN_FLOOR, fireCooldown * FIRE_COOLDOWN_MULT_PER_CORRECT)
        combat.setFireCooldown(fireCooldown)
        break
      case 'wingman':
        wingmanCount = Math.min(WINGMAN_CAP, wingmanCount + 1)
        combat.setWingmanCount(wingmanCount)
        break
      case 'wider-lock':
        aimAssistAngle = Math.min(AIM_ASSIST_CAP, aimAssistAngle + AIM_ASSIST_STEP)
        combat.setAimAssistAngle(aimAssistAngle)
        break
      case 'more-homing-targets':
        homingMaxTargets = Math.min(HOMING_MAX_TARGETS_CAP, homingMaxTargets + 1)
        break
      case 'extra-shield-charge':
        shieldMax = Math.min(SHIELD_MAX_CAP, shieldMax + 1)
        shieldValue = Math.min(shieldMax, shieldValue + 1)
        break
      case 'faster-shield-recharge':
        shieldRegenRate *= 1.3
        shieldRegenDelayMs = Math.max(SHIELD_REGEN_DELAY_FLOOR_MS, shieldRegenDelayMs * 0.75)
        break
      case 'longer-invincibility':
        invincibilityDurationMs = Math.min(INVINCIBILITY_CAP_MS, invincibilityDurationMs + 200)
        break
      case 'extra-life':
        session.lives = Math.min(LIVES_CAP, session.lives + 1)
        maxLives = Math.max(maxLives, session.lives)
        hud.setLives(session.lives, maxLives)
        break
      case 'deflect-on-spin':
        deflectCardActive = true
        break
      case 'faster-charge':
        homingChargeMinMs = Math.max(HOMING_CHARGE_MIN_FLOOR_MS, homingChargeMinMs - 300)
        homingChargeMaxMs = Math.max(homingChargeMinMs + 500, homingChargeMaxMs - 300)
        break
      case 'longer-dodge-iframe':
        dodgeIframeGraceMs += 150
        break
      default:
        break
    }
  }

  // cartas que já estão no máximo (ou já foram pegas, pra "deflect-on-spin" que é liga/desliga)
  // não aparecem de novo — evita oferecer escolhas inúteis
  function buildCardExcludeSet() {
    const exclude = new Set()
    if (deflectCardActive) exclude.add('deflect-on-spin')
    if (wingmanCount >= WINGMAN_CAP) exclude.add('wingman')
    if (shieldMax >= SHIELD_MAX_CAP) exclude.add('extra-shield-charge')
    if (homingMaxTargets >= HOMING_MAX_TARGETS_CAP) exclude.add('more-homing-targets')
    if (projectileCount >= PROJECTILE_COUNT_CAP) exclude.add('extra-projectile')
    if (aimAssistAngle >= AIM_ASSIST_CAP) exclude.add('wider-lock')
    if (session.lives >= LIVES_CAP) exclude.add('extra-life')
    if (homingChargeMinMs <= HOMING_CHARGE_MIN_FLOOR_MS) exclude.add('faster-charge')
    return exclude
  }

  // tela de escolha de carta: aberta a cada resposta correta (normal, chefe ou bônus dourado).
  // onDone é chamado depois que o jogador escolhe — cada chamador decide pra onde voltar
  // (enterCombat ou resumeCombatFromGolden)
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
    // cada erro/timeout escala a sessão: +2 inimigos na hora, além do intervalo/agressividade
    for (let i = 0; i < WRONG_ANSWER_EXTRA_ENEMIES; i += 1) combat.spawnEnemy()
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
    bonusTimer = randomBonusInterval()
    rail.setAdvancing(true)
    hud.setQuestion(null)
    hud.setAlternatives(null)
    hud.setFeedback(null)
    hud.setCountdown(null)
    hud.setBossActive(false)

    // background/fog trocam de cor a cada pergunta — ilusão de "nível" diferente, cosmético
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

  // ============ CHEFE (fase 4/correção) ============
  // Ao chegar no ciclo de chefe: 90s caçando perguntas (blocos flutuantes parados, atire neles
  // pra abrir as 4 alternativas — igual ao "modo chefe" antigo, só que agora com VÁRIAS
  // perguntas em sequência dentro da janela de 90s, não uma só). Cada erro ou pergunta que fica
  // sem resposta até o tempo acabar DOBRA a vida do chefe. Quando os 90s terminam, o chefe
  // gigante aparece com a vida acumulada — a IA dele por enquanto é simples (persegue e atira
  // em rajada); ainda não temos um design mais elaborado pra esse combate.
  function enterBossBuildup() {
    phase = 'bossBuildup'
    bossBuildupTimer = BOSS_BUILDUP_MS
    bossHealthMultiplier = 1
    rail.enterArena()
    hud.setBossActive(true)
    hud.setCountdown(null)
    for (let i = 0; i < currentBossExtraEnemies(); i += 1) combat.spawnEnemy()
    spawnNextBossQuestion()
  }

  function spawnNextBossQuestion() {
    const result = nextQuestion(session, deck.allCards)
    if (!result) {
      endSector()
      return
    }
    questionResult = result
    hud.setQuestion(result.card.question)
    hud.setAlternatives(result.alternatives)
    combat.spawnBossTargets(result.alternatives, currentBossSpread())
  }

  function processBossBuildupAnswer(events, inputState) {
    let outcome = null
    if (events.targetHit) {
      outcome = { type: events.targetHit.isCorrect ? 'correct' : 'wrong', card: questionResult.card, timeBonus: 1.2, accuracyBonus: 1.2 }
    } else {
      const slot = slotForPressed(inputState.pressed)
      if (slot !== undefined) {
        outcome = { type: slot === questionResult.correctSlot ? 'correct' : 'wrong', card: questionResult.card, timeBonus: 1.2, accuracyBonus: 1.2 }
      }
    }
    if (outcome) settleBossBuildupQuestion(outcome)
  }

  function settleBossBuildupQuestion(outcome) {
    combat.clearQuizTargets()
    const correct = outcome.type === 'correct'
    const resolution = resolveAnswer(session, outcome)
    applySpeedProgression(outcome.type)
    if (!correct) {
      applyDifficulty()
      applyBossDifficulty()
      bossHealthMultiplier *= 2
    }

    history = recordResult(history, outcome.card.guid, correct)
    saveHistory(history)
    sessionResults.push({ guid: outcome.card.guid, correct })

    hud.setQuestion(null)
    hud.setAlternatives(null)
    hud.setFeedback({
      correct,
      correctAnswer: outcome.card.answer,
      points: resolution.points,
      comboMultiplier: resolution.comboMultiplier,
      health: resolution.healthRemaining,
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

  function enterBossFight() {
    phase = 'bossFight'
    hud.setBossActive(false)
    hud.setCountdown(null)
    combat.clearAllCombatants()
    const bossHp = Math.round(BOSS_BASE_HP * bossHealthMultiplier)
    combat.spawnBossEnemy(bossHp)
    hud.setBossFight(true, bossHp, bossHp)
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

  // saúde zerada consome 1 vida e reabastece a saúde (e o escudo); zerar as vidas é que
  // realmente acaba a run. Chamar isso é seguro mesmo com saúde > 0 (vira no-op).
  function applyHealthLoss() {
    if (session.health > 0) return false
    session.lives -= 1
    if (session.lives <= 0) return true
    session.health = maxHealth
    shieldValue = shieldMax
    shieldRegenDelayTimer = 0
    return false
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

    hitShakeTimer = Math.max(0, hitShakeTimer - dt * 1000)
    rail.setShakeIntensity(hitShakeTimer > 0 ? SHIP_SHAKE_MAGNITUDE * (hitShakeTimer / HIT_SHAKE_DURATION_MS) : 0)

    rail.update(dt, inputState)
    const playerPos = rail.getPlayerPosition()
    const noseFrame = rail.getFrameAt(0)
    const nosePos = rail.getShipNosePosition()

    // ============ MIRA ============
    // acompanha o mesmo deslocamento lateral da nave (amplificado um pouco) — centrada quando
    // a nave está centrada, "no meio da tela e junto com o jogador". Em modo arena, centrada
    // (o voo livre já é a mira).
    let reticleX = 0
    let reticleY = 0
    if (!rail.isArena()) {
      const lateral = rail.getPlayerLateral()
      reticleX = lateral.x * RETICLE_LATERAL_MULT
      reticleY = lateral.y * RETICLE_LATERAL_MULT
    }

    // posição 3D da mira: ancorada no NARIZ, deslocada lateral/verticalmente, e avançada pelo
    // RETICLE_AHEAD no eixo forward
    const reticleWorldPos = nosePos.clone()
      .addScaledVector(noseFrame.right, reticleX)
      .addScaledVector(noseFrame.up, reticleY)
      .addScaledVector(noseFrame.forward, RETICLE_AHEAD)

    // direção do tiro: do NARIZ até a MIRA — o projétil passa visualmente pela mira por construção
    const fireDirection = reticleWorldPos.clone().sub(nosePos).normalize()

    // ============ TIRO / TIRO TELEGUIADO CARREGADO ============
    // a barra e o glow visual só aparecem DEPOIS do wind-up (fireHeldMs >= homingChargeMinMs)
    // — antes disso o botão segurado ainda está só disparando normal, sem feedback de carga.
    const isCharging = fireHeldMs >= homingChargeMinMs
    if (inputState.firing) {
      if (!isCharging) combat.tryFire(nosePos, fireDirection)
      fireHeldMs += dt * 1000
      if (isCharging) {
        const chargeFrac = Math.min(1, (fireHeldMs - homingChargeMinMs) / (homingChargeMaxMs - homingChargeMinMs))
        hud.setChargeIndicator(true, chargeFrac)
        effects.setChargeGlow(true, chargeFrac, nosePos, fireDirection)

        // varre a mira sobre inimigos só depois do wind-up (carga de verdade já começou) —
        // cada um que passa pela mira fica marcado (lock-on) pro teleguiado mirar exatamente
        // neles ao soltar, em vez dos N mais próximos
        combat.sweepLockOn(nosePos, fireDirection)
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
        const chargeFrac = Math.min(1, (fireHeldMs - homingChargeMinMs) / (homingChargeMaxMs - homingChargeMinMs))
        const targetCount = Math.round(HOMING_MIN_TARGETS + (homingMaxTargets - HOMING_MIN_TARGETS) * chargeFrac)
        combat.fireHomingShot(nosePos, targetCount)
      }
      fireHeldMs = 0
      hud.setChargeIndicator(false)
      effects.setChargeGlow(false)
      combat.clearLockedEnemies()
      hud.setLockedEnemyMarkers([])
    }

    // ============ GIRO/INCLINAÇÃO (Z/C) ============
    // segurar Z ou C inclina a nave de verdade e ela FICA inclinada enquanto durar (rail.js já
    // leu inputState.bank e calculou o ângulo em rail.update, chamado antes disto). Aqui só
    // cuida do que não é visual: i-frames enquanto girando + rebate de projéteis com a carta
    if (inputState.bank !== 0) {
      invincibleTimer = Math.max(invincibleTimer, dodgeIframeGraceMs)
      if (deflectCardActive) combat.deflectNearbyProjectiles(playerPos, DEFLECT_RADIUS)
    }

    const enemiesActive = phase === 'combat' || phase === 'goldenArena' || phase === 'bossBuildup' || phase === 'bossFight'
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

    // escudo: regenera sozinho (contínuo) depois de um pequeno atraso pós-hit — não só quando
    // esgota de vez
    if (shieldRegenDelayTimer > 0) {
      shieldRegenDelayTimer = Math.max(0, shieldRegenDelayTimer - dt * 1000)
    } else if (shieldValue < shieldMax) {
      shieldValue = Math.min(shieldMax, shieldValue + shieldRegenRate * dt)
    }

    if (events.bossDefeated && phase === 'bossFight') {
      session.score += BOSS_DEFEAT_BONUS
      hud.setBossFight(false)
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

    invincibleTimer = Math.max(0, invincibleTimer - dt * 1000)
    if (events.enemyHits > 0 && invincibleTimer <= 0 && !godMode) {
      invincibleTimer = invincibilityDurationMs
      hitShakeTimer = HIT_SHAKE_DURATION_MS
      hud.damageFlash()
      shieldRegenDelayTimer = shieldRegenDelayMs

      if (shieldValue >= 1) {
        // escudo absorve o hit — saúde intocada
        shieldValue -= 1
      } else {
        session.health = Math.max(0, session.health - 1)
        if (applyHealthLoss()) {
          endSector()
          return
        }
      }
    }
    rail.setShipVisible(invincibleTimer <= 0 || Math.floor(invincibleTimer / INVINCIBILITY_FLICKER_MS) % 2 === 0)

    if (phase === 'combat' || phase === 'goldenArena' || phase === 'bossBuildup') {
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
        if (isBossCycle) enterBossBuildup()
        else enterAlternatives()
      }
    } else if (phase === 'alternatives') {
      processAnswerPhase(events, inputState, dt, altTotalMs, 'normal')
    } else if (phase === 'bossBuildup') {
      bossBuildupTimer -= dt * 1000
      hud.setCountdown(Math.max(0, Math.ceil(bossBuildupTimer / 1000)), bossBuildupTimer <= WARNING_MS)
      if (bossBuildupTimer <= 0) {
        // pergunta que ficou sem resposta até o tempo acabar conta como "não respondida"
        if (questionResult) {
          bossHealthMultiplier *= 2
          combat.clearQuizTargets()
          questionResult = null
          hud.setQuestion(null)
          hud.setAlternatives(null)
        }
        enterBossFight()
      } else {
        processBossBuildupAnswer(events, inputState)
      }
    } else if (phase === 'bossBuildupResolution') {
      phaseTimer -= dt * 1000
      if (phaseTimer <= 0) {
        const proceed = () => {
          if (bossBuildupTimer > 0) { phase = 'bossBuildup'; spawnNextBossQuestion() }
          else enterBossFight()
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

    hud.setStatus({ health: session.health, maxHealth, score: session.score, combo: session.comboMultiplier })
    hud.setLives(session.lives, maxLives)
    hud.setShield(shieldValue, shieldMax)

    if (phase === 'bossFight') {
      const bossSnap = combat.getBossSnapshot()
      if (bossSnap) hud.setBossFight(true, bossSnap.hp, bossSnap.maxHp)
    }

    // minimapa: só em modo arena (chefe/dourado), onde é mais fácil se perder — pontos
    // relativos ao CENTRO da arena (não à nave), mapeados numa janela quadrada -1..1
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

    // shake de câmera: aplicado por último, só na posição de render — não interfere em nenhum
    // cálculo de jogo (mira, colisão) feito mais acima neste mesmo frame
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
    else if (phase === 'bossBuildup') settleBossBuildupQuestion(outcome)
    else if (phase === 'alternatives') settleQuestion(outcome)
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
    heal: () => { session.health = Math.min(maxHealth, session.health + 1) },
    damage: () => {
      session.health = Math.max(0, session.health - 1)
      if (applyHealthLoss()) endSector()
    },
    fullHeal: () => { session.health = maxHealth },
    loseLife: () => {
      session.lives = Math.max(0, session.lives - 1)
      hud.setLives(session.lives, maxLives)
      if (session.lives <= 0) endSector()
    },
    rechargeShield: () => {
      shieldValue = shieldMax
      shieldRegenDelayTimer = 0
    },
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
    gotoBoss: () => { if (phase === 'combat') enterBossBuildup() },
    skipToBossFight: () => {
      if (phase === 'bossBuildup') bossBuildupTimer = 0
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
      invincibleTimer = Math.max(invincibleTimer, 1000)
      if (deflectCardActive) combat.deflectNearbyProjectiles(rail.getPlayerPosition(), DEFLECT_RADIUS)
      rail.debugForceBank(1, 1000)
    },
    fireHomingTest: () => combat.fireHomingShot(rail.getShipNosePosition(), homingMaxTargets),
  })

  enterCombat()
  hud.setStatus({ health: session.health, maxHealth, score: session.score, combo: session.comboMultiplier })
  hud.setLives(session.lives, maxLives)
  hud.setShield(shieldValue, shieldMax)
  lastTime = performance.now()
  rafId = requestAnimationFrame(tick)
}

restart()
