import * as THREE from 'three'
import { buildDeck, exportTagsTsv, parseAnkiExport, filterDeckByTags } from './anki.js'
import { createSession, nextQuestion, resolveAnswer, getSummary, createPainelSession, nextPainelCard, resolvePainel, pickBonusCard, buildBonusQuestion, computeDifficultyBias } from './quiz.js'
import { createRailController } from './rail.js'
import { createCombatSystem } from './combat.js'
import { createEnemiesSystem } from './enemies/index.js'
import { createPlayerSystem } from './player.js'
import { createEffectsSystem } from './effects.js'
import { createInputState } from './input.js'
import { showPreGameMenu, showDeckManager, showSettingsScreen, createGameHud, showSectorEnd, showPainelCard, showPainelAnswer } from './hud.js'
import { loadHistory, saveHistory, recordResult } from './storage.js'
import { getDeck, buildMergedDeck, buildReviewDeck, REVIEW_DECK_ID } from './decks.js'
import { getSettings } from './settings.js'
import { getBindings, isActionPressed } from './keybindings.js'
import { pickRandomCards } from './roguelike.js'

const CYCLE_MS = 110000 // era 90000 (pedido do usuário: 110s, compensado pelo avanço por kill abaixo)
// pedido do usuário: "avance este timer em 2 para cada inimigo derrotado durante ele" — todo
// kill de inimigo comum (não só o redutor de tempo, que já reduz bem mais) adianta o ciclo
const ENEMY_KILL_CYCLE_ADVANCE_MS = 2000
const WARNING_MS = 10000
const FEEDBACK_MS = 1500
// v0.29.6: errar não mostra mais o painel de feedback (resposta certa/pontos/combo) — só um
// texto flutuante vermelho pequeno por 3s, e o jogo segura a fase por esse tempo
const WRONG_FEEDBACK_MS = 3000
const SPEED_STEP = 0.05
const BOOST_EVERY_CORRECT = 2
const GROUND_Y = -10

const INVINCIBILITY_FLICKER_MS = 90

// ============ SHAKE AO LEVAR HIT ============
const HIT_SHAKE_DURATION_MS = 300
const SHIP_SHAKE_MAGNITUDE = 0.3
const CAMERA_SHAKE_MAGNITUDE = 0.5
// pedido do usuário: shake de tela maior especificamente quando o tiro CARREGADO (teleguiado)
// destrói um inimigo comum, dourado ou o chefe — usa a mesma barra de tempo de hitShakeTimer,
// só com um valor bem acima do shake padrão de kill (120ms)
const HOMING_KILL_SHAKE_MS = 380

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
const BOSS_BASE_HP = 33 // era 3 (pedido do usuário: +30 de vida inicial)
// pedido do usuário: "aumente a quantidade de vida que ele recebe por erro em 20" — troca o
// antigo `bossHealthMultiplier *= 2` (dobrava a cada erro/orbe sem resposta, virava
// exponencial rápido demais) por um bônus aditivo simples, mais fácil de calibrar
const BOSS_HP_PER_ERROR = 20
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

// pedido do usuário: escalada explícita e quantificada por pergunta errada, em cima do que já
// existia (intervalo de spawn/enemyCap/enemyAggression, que continuam iguais) — "+1 na geração
// de inimigos a cada 3 erros, +1 na velocidade dos disparos por erro, +1 no dano deles a cada
// 2 erros". Os 3 contadores derivam do mesmo wrongAnswerCount, só dividem por thresholds
// diferentes.
const ENEMY_SPAWN_BONUS_WRONG_THRESHOLD = 3
const ENEMY_PROJECTILE_SPEED_PER_WRONG = 1
const ENEMY_DAMAGE_WRONG_THRESHOLD = 2

// Fase 9 (ideia de baralho, item 1): só desloca o PONTO DE PARTIDA do intervalo de spawn — a
// escalada por erro (applyDifficulty, ENEMY_INTERVAL_STEP) continua igual depois disso. Baralho
// com histórico de muito erro (difficultyBias perto de 1) começa um pouco mais devagar — o
// conteúdo já é difícil, não precisa também punir mais no combate; baralho fácil (bias perto de
// 0) começa um pouco mais rápido.
const DIFFICULTY_BIAS_INTERVAL_RANGE_MS = 250

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

const GOLDEN_INTERVAL_MIN_MS = 45000
const GOLDEN_INTERVAL_MAX_MS = 100000
const GOLDEN_SPREAD_MIN = 40
const GOLDEN_SPREAD_MAX = 90

const TIME_ENEMY_SPAWN_CHANCE = 0.2
// v0.34.0: variante grande da ampulheta — sorteada dentro do mesmo branch de spawn da normal
const TIME_ENEMY_MEGA_CHANCE = 0.2
// v0.34.0: sentinela entra na mesma rotação de spawn normal (time/mini-swarm/blaster) — mais
// rara, é um mini-encontro de 4 disparos, não um inimigo qualquer
const SENTINELA_SPAWN_CHANCE = 0.12
// v0.34.0: Detrito (obstáculo cinza) — pedido do usuário: NÃO segue a pausa antes de
// pergunta/dourado nem o currentEnemyCap(), só o "tá em combate de verdade" (enemiesActive)
const DETRITO_SPAWN_INTERVAL_MIN_MS = 4000
const DETRITO_SPAWN_INTERVAL_MAX_MS = 8000

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
// Fase 8 (VISUAL): leve varredura lateral por cima do pull-back reto (sai e volta, sincronizada
// com o mesmo `pull` do zoom) — dá sensação de dolly/orbit de verdade em vez de câmera só
// recuando em linha reta olhando pro mesmo ponto.
const ARENA_CUTSCENE_ORBIT = 9

// pedido do usuário: em vez do chefe simplesmente aparecer assim que a caçada de orbes termina
// (acertou a última/errou/tempo acabou), roda a MESMA cutscene de câmera acima, só que mais
// longa (pelo menos uns 5s "pro jogador respirar") antes de `enterBossFight` de verdade.
const BOSS_SUMMON_CUTSCENE_MS = 5200

// ============ CUTSCENE DE MORTE (chefe/dourado explodindo) ============
// pedido do usuário: câmera lenta segurando na explosão do chefe/dourado ao ser derrotado,
// em vez de sair da arena instantaneamente por cima da explosão ainda rodando. Nave travada
// (sem input), tempo desacelerado — a explosão (efeitos + encolhimento do mesh em enemies.js)
// continua rodando normalmente durante a cutscene, só em câmera lenta.
const DEATH_CUTSCENE_MS = 1400
const DEATH_CUTSCENE_TIME_SCALE = 0.22
const DEATH_CUTSCENE_ZOOM_FOV = 55

// ============ ROGUELIKE (fase 4) ============
const HOMING_LOCK_INTERVAL_MS = 500

const DODGE_TAP_WINDOW_MS = 350
const DEFLECT_RADIUS = 6

// ============ PROPULSOR / REPULSOR (A/S — Fase 3) ============
const RAM_DAMAGE = 5

// ============ VIGNETTE DE VIDA BAIXA ============
const LOW_HEALTH_THRESHOLD_FRAC = 0.4

let deck = null
let deckTexts = []
let currentDeckIds = null
let history = loadHistory()
let sessionResults = []
let painelDone = false

// tagFilter (Fase 9, ideia de baralho "tags/categorias"): guids de assunto marcados no
// gerenciador de baralhos — vazio joga o baralho inteiro, igual sempre foi.
function handlePlayDeck(deckId, tagFilter = []) {
  let built
  let text = null
  if (deckId === REVIEW_DECK_ID) {
    // Fase 9 (ideia de baralho "revisão automática"): baralho virtual, recalculado na hora a
    // partir do histórico — nunca fica obsoleto, e não existe texto original pra exportar tags.
    built = buildReviewDeck(history)
    if (!built) return
  } else {
    const entry = getDeck(deckId)
    if (!entry) return
    text = entry.text
    built = buildDeck(text)
    if (built.warning) return
    if (tagFilter.length > 0) {
      built = filterDeckByTags(built, tagFilter)
      if (built.warning) return
    }
  }

  currentDeckIds = deckId
  deck = built
  deckTexts = text ? [text] : []
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
    onPlay: () => showDeckManager({ onPlay: handlePlayDeck, onPlayMerged: handlePlayMergedDecks, onBack: restart, history }),
    onAddDeck: () => showDeckManager({ onPlay: handlePlayDeck, onPlayMerged: handlePlayMergedDecks, onBack: restart, startInAdd: true, history }),
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
  // Fase 9 (ideia all-range, item 5): sensibilidade de giro configurável em Configurações
  rail.setTurnSensitivity(getSettings().arenaTurnSensitivity)
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
  // Fase 9 (ideia all-range, item 4): duplo toque em repulsão (sem Baixo, que já é a
  // cambalhota) dispara o freio de emergência — mesma janela de detecção do giro completo
  let lastRepulsionTapAt = -Infinity

  let bossHealthBonus = 0
  let bossBuildupTimer = 0
  let bossOrbsRemaining = 0

  // ============ CUTSCENE DE TRANSIÇÃO PARA ALL-RANGE (Fase 5) ============
  let arenaCutsceneTimer = 0
  let arenaCutsceneDurationMs = ARENA_CUTSCENE_MS // reaproveitada com valor maior pro summon do chefe (ver BOSS_SUMMON_CUTSCENE_MS)
  let arenaCutsceneOnDone = null // callback chamado quando a cutscene termina (enterGoldenArena/enterBossBuildup)
  let arenaCutsceneBaseCameraPos = null // posição da câmera capturada no instante em que a cutscene começa
  let arenaCutsceneBaseForward = null // direção "pra frente" da nave nesse mesmo instante
  let arenaCutsceneBaseRight = null // Fase 8: lateral da nave nesse instante, pro leve orbit da câmera
  let arenaPreviewShown = false // já mostrou o preview distante do chefe/dourado nesse aviso de 5s?

  // ============ CUTSCENE DE MORTE (chefe/dourado) — câmera lenta segurando na explosão antes
  // de sair da arena, em vez da transição instantânea direto pro modo normal ============
  let deathCutsceneTimer = 0
  let deathCutscenePos = null // posição (clonada) de onde o inimigo explodiu, câmera foca nela
  let deathCutsceneOnDone = null // callback com a transição de verdade (bossVictory/goldenAlternatives)

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
  let bonusTimer = 0
  // Fase 6: qual settle function usar enquanto phase === 'questionPause' — normal e dourado
  // compartilham a mesma fase de pausa (o chefe tem a dele própria, bossQuestionPause)
  let pendingQuestionKind = null

  let goldenTimer = randomGoldenInterval()
  let goldenCard = null

  // Fase 9 (ideia de baralho, item 1): desloca só o ponto de partida do intervalo de spawn
  // pelo histórico de erro do baralho — ver comentário de DIFFICULTY_BIAS_INTERVAL_RANGE_MS
  const difficultyBias = computeDifficultyBias(deck.shooterCards, history)
  const difficultyBiasOffsetMs = (difficultyBias - 0.5) * 2 * DIFFICULTY_BIAS_INTERVAL_RANGE_MS
  let enemyIntervalMin = Math.max(ENEMY_INTERVAL_FLOOR, ENEMY_INTERVAL_MIN_BASE + difficultyBiasOffsetMs)
  let enemyIntervalMax = Math.max(enemyIntervalMin + 150, ENEMY_INTERVAL_MAX_BASE + difficultyBiasOffsetMs)
  let enemyAggression = 1
  let wrongAnswerCount = 0
  let extraSpawnPerBatch = 0
  let enemyDamageValue = 1

  let enemyCap = 0
  let normalSpawnTimer = NORMAL_SPAWN_INTERVAL_MS
  // v0.34.0: timer independente do Detrito — não reseta por ciclo (enterCombat não mexe nele),
  // só pausa quando o jogo não está em combate de verdade nenhum (ver enemiesActive)
  let detritoTimer = randomDetritoInterval()

  function currentEnemyCap() {
    return (rail.isArena() ? ENEMY_CAP_ARENA_BASE : ENEMY_CAP_NORMAL_BASE) + enemyCap
  }

  function randomDetritoInterval() {
    return DETRITO_SPAWN_INTERVAL_MIN_MS + Math.random() * (DETRITO_SPAWN_INTERVAL_MAX_MS - DETRITO_SPAWN_INTERVAL_MIN_MS)
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

    // pedido do usuário: escalada quantificada em cima do que já existia acima
    wrongAnswerCount += 1
    extraSpawnPerBatch = Math.floor(wrongAnswerCount / ENEMY_SPAWN_BONUS_WRONG_THRESHOLD)
    enemyDamageValue = 1 + Math.floor(wrongAnswerCount / ENEMY_DAMAGE_WRONG_THRESHOLD)
    combat.setEnemyProjectileSpeedBonus(wrongAnswerCount * ENEMY_PROJECTILE_SPEED_PER_WRONG)
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

  // Fase 6: pergunta normal também pausa tudo e usa o modal centralizado (mesmo modelo do
  // chefe, Fase 5) — não é mais "voa e atira nos 4 alvos flutuantes". pendingQuestionKind
  // marca qual settle function usar enquanto phase === 'questionPause' (normal ou dourado
  // compartilham a mesma fase de pausa).
  // v0.32: pergunta abre na hora que o ciclo termina — era precedida por uma fase 'recall' de
  // 3.5s (só mostrando o texto da pergunta, sem alternativas, sobra da mecânica antiga de
  // "voar e atirar") que o usuário reportou como "intervalo estranho depois que o jogo pausa".
  function enterAlternatives() {
    const result = nextQuestion(session, deck.allCards)
    if (!result) {
      endSector()
      return
    }
    combat.clearBonusTargets()
    hud.setCountdown(null)
    hud.setFeedback(null)
    questionResult = result
    pendingQuestionKind = 'normal'
    phase = 'questionPause'
    hud.showQuestionModal({
      question: result.card.question,
      alternatives: result.alternatives,
      onPick: (slot) => {
        settleQuestion({
          type: slot === questionResult.correctSlot ? 'correct' : 'wrong',
          card: questionResult.card,
          timeBonus: 1.2,
          accuracyBonus: 1.2,
        })
      },
    })
  }

  // Fase 5: a caçada agora é literal — 6 orbes-pergunta genéricos espalhados pela arena
  // (combat.spawnBossOrbs), o jogador precisa achar e atirar em cada um pra revelar/responder
  // aquela pergunta (numa pausa total, ver triggerBossQuestion). Nada de pergunta já visível
  // na tela esperando 4 alternativas-alvo, como era antes.
  function enterBossBuildup() {
    phase = 'bossBuildup'
    bossBuildupTimer = BOSS_BUILDUP_MS
    bossHealthBonus = 0
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
      bossHealthBonus += BOSS_HP_PER_ERROR
    } else {
      bossBuildupTimer += BOSS_HUNT_BONUS_MS
    }

    history = recordResult(history, outcome.card.guid, correct)
    saveHistory(history)
    sessionResults.push({ guid: outcome.card.guid, correct })

    if (correct) {
      hud.setFeedback({
        correct: true,
        correctAnswer: outcome.card.answer,
        points: resolution.points,
        comboMultiplier: resolution.comboMultiplier,
        health: resolution.healthRemaining,
        accuracyBonus: outcome.accuracyBonus,
      })
    } else {
      hud.showErrorFloat('Errou!')
    }

    const outOfLives = applyHealthLoss()
    if (resolution.sectorOver || outOfLives) {
      pendingSectorOver = true
      pendingCardChoice = false
      phase = 'resolution'
      phaseTimer = correct ? 0 : WRONG_FEEDBACK_MS
      return
    }

    pendingCardChoice = correct
    phase = 'bossBuildupResolution'
    phaseTimer = correct ? 0 : WRONG_FEEDBACK_MS
  }

  // tempo (90s + bônus) acabou antes das 6 perguntas: chefe surge na hora, +20 de vida por orbe
  // que sobrou sem ser respondido — igual à punição de errar (confirmado com o usuário)
  function finishBossHunt() {
    hud.hideQuestionModal()
    bossHealthBonus += BOSS_HP_PER_ERROR * bossOrbsRemaining
    bossOrbsRemaining = 0
    combat.clearBossOrbs()
    // pedido do usuário: em vez do chefe simplesmente aparecer na hora, roda uma cutscene de
    // pelo menos 5s ("pro jogador respirar") antes de invocar ele de verdade
    startArenaCutscene('bossSummon', enterBossFight, BOSS_SUMMON_CUTSCENE_MS)
  }

  // usado tanto pro dourado quanto pro chefe: 5s de aviso (já em andamento antes desta chamada,
  // via hud.setArenaWarning) + cutscene de câmera se ajeitando (nave travada, ver tick()) antes
  // de `onDone` (enterGoldenArena/enterBossBuildup) finalmente rodar
  function startArenaCutscene(kind, onDone, durationMs = ARENA_CUTSCENE_MS) {
    phase = 'arenaCutscene'
    arenaCutsceneTimer = durationMs
    arenaCutsceneDurationMs = durationMs
    arenaCutsceneOnDone = onDone
    arenaCutsceneBaseCameraPos = camera.position.clone()
    arenaCutsceneBaseForward = rail.getFrameAt(0).forward.clone()
    arenaCutsceneBaseRight = rail.getFrameAt(0).right.clone()
    hud.setArenaWarning(null)
    hud.setCountdown(null)
    hud.setArenaCutscene(kind)
    // pedido do usuário: o preview do chefe/dourado ao longe (mostrado durante o aviso de 5s)
    // só fazia sentido até aqui — a partir da cutscene de verdade, some (o combate real spawna
    // o chefe/dourado de verdade em seguida)
    combat.clearArenaPreview()
  }

  function enterBossFight() {
    phase = 'bossFight'
    hud.setBossActive(false)
    hud.setCountdown(null)
    hud.setBossTint(true)
    combat.clearAllCombatants()
    const bossHp = BOSS_BASE_HP + bossHealthBonus
    combat.spawnBossEnemy(bossHp)
    hud.setBossFight(true, bossHp, bossHp)

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
    // v0.32: duração ilimitada — a luta só acaba quando o dourado é derrotado (pedido do
    // usuário), sem mais um timeout que forçava a volta ao combate normal.
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

  // v0.32: mesma mudança da pergunta normal — sem a fase 'goldenRecall' de 3.5s antes do modal
  function enterGoldenAlternatives() {
    goldenCard = pickBonusCard(deck, session)
    const result = buildBonusQuestion(goldenCard, deck.allCards)
    questionResult = result
    pendingQuestionKind = 'golden'
    phase = 'questionPause'
    hud.showQuestionModal({
      question: result.card.question,
      alternatives: result.alternatives,
      onPick: (slot) => {
        settleGoldenBonus({
          type: slot === questionResult.correctSlot ? 'correct' : 'wrong',
          card: questionResult.card,
          timeBonus: 1.2,
          accuracyBonus: 1.2,
        })
      },
    })
  }

  function applyHealthLoss() {
    return player.applyHealthLoss()
  }

  function settleQuestion(outcome) {
    hud.hideQuestionModal()
    const resolution = resolveAnswer(session, outcome)
    applySpeedProgression(outcome.type)

    const correct = outcome.type === 'correct'
    if (!correct) applyDifficulty()

    history = recordResult(history, outcome.card.guid, correct)
    saveHistory(history)
    sessionResults.push({ guid: outcome.card.guid, correct })

    hud.setBossActive(false)
    // v0.29.6: painel de feedback só pra acerto — erro vira um texto flutuante rápido
    if (correct) {
      hud.setFeedback({
        correct: true,
        correctAnswer: outcome.card.answer,
        points: resolution.points,
        comboMultiplier: resolution.comboMultiplier,
        health: resolution.healthRemaining,
        accuracyBonus: outcome.accuracyBonus,
      })
    } else {
      hud.showErrorFloat('Errou!')
    }

    const outOfLives = applyHealthLoss()
    pendingSectorOver = resolution.sectorOver || outOfLives
    pendingCardChoice = correct
    phase = 'resolution'
    phaseTimer = correct ? 0 : WRONG_FEEDBACK_MS
  }

  function settleGoldenBonus(outcome) {
    hud.hideQuestionModal()
    const correct = outcome.type === 'correct'

    history = recordResult(history, outcome.card.guid, correct)
    saveHistory(history)
    sessionResults.push({ guid: outcome.card.guid, correct })

    if (correct) {
      hud.setFeedback({
        correct: true,
        correctAnswer: outcome.card.answer,
        bonus: true,
        accuracyBonus: outcome.accuracyBonus,
      })
    } else {
      hud.showErrorFloat('Errou!')
    }

    pendingCardChoice = correct
    phase = 'goldenResolution'
    phaseTimer = correct ? 0 : WRONG_FEEDBACK_MS
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

    // ============ PAUSA TOTAL: PERGUNTA (CHEFE/NORMAL/DOURADO) OU CARTA ROGUELIKE ============
    // nave travada, sem input nenhum — só espera a resolução (modal ou clique na carta).
    // questionPause é da Fase 6: pergunta normal e bônus dourado passaram a pausar tudo igual
    // ao chefe (Fase 5), em vez de "voa e atira nos 4 alvos flutuantes". cardChoice entrou
    // antes disso, na v0.29.6. Continua renderizando a cena parada.
    if (phase === 'bossQuestionPause' || phase === 'questionPause' || phase === 'cardChoice') {
      renderer.render(scene, camera)
      return
    }

    // ============ CUTSCENE DE TRANSIÇÃO PARA ALL-RANGE (dourado/chefe) ============
    // nave travada, só a câmera se move sozinha (puxa pra trás + abre o FOV e volta), igual
    // confirmado com o usuário — ao terminar, chama arenaCutsceneOnDone (enterGoldenArena ou
    // enterBossBuildup), que aí sim muda de fase e liga o modo all-range de verdade.
    if (phase === 'arenaCutscene') {
      arenaCutsceneTimer -= dt * 1000
      const t = THREE.MathUtils.clamp(1 - Math.max(0, arenaCutsceneTimer) / arenaCutsceneDurationMs, 0, 1)
      const pull = Math.sin(Math.min(1, t) * Math.PI)
      camera.position.copy(arenaCutsceneBaseCameraPos)
        .addScaledVector(arenaCutsceneBaseForward, -pull * ARENA_CUTSCENE_PULLBACK)
        .addScaledVector(arenaCutsceneBaseRight, pull * ARENA_CUTSCENE_ORBIT)
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

    // ============ CUTSCENE DE MORTE (chefe/dourado explodindo) ============
    // pedido do usuário: "cutscene em câmera lenta do inimigo dourado/boss sendo destruído e
    // explodindo" em vez da transição instantânea pro modo normal. Nave travada (sem input),
    // tempo desacelerado — a explosão e o encolhimento do mesh morrendo (já disparados no
    // frame do kill, dentro de enemies.js) continuam a tocar por baixo, só mais devagar; a
    // câmera gira suavemente (tempo real, não desacelerado) até focar na explosão e segura ali.
    if (phase === 'deathCutscene') {
      deathCutsceneTimer -= rawDt * 1000
      const slowDt = rawDt * DEATH_CUTSCENE_TIME_SCALE
      effects.update(slowDt, rail.getPlayerPosition(), rail.getFrameAt(0).forward, {
        camera,
        shieldValue: player.getShieldValue(),
        shieldMax: player.getShieldMax(),
        boostActive: false,
        skipTrail: true,
      })
      const t = THREE.MathUtils.clamp(1 - Math.max(0, deathCutsceneTimer) / DEATH_CUTSCENE_MS, 0, 1)
      const zoomT = Math.sin(Math.min(1, t) * Math.PI)
      camera.fov = 70 - zoomT * (70 - DEATH_CUTSCENE_ZOOM_FOV)
      camera.updateProjectionMatrix()
      if (deathCutscenePos) {
        const targetQuat = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().lookAt(camera.position, deathCutscenePos, camera.up),
        )
        camera.quaternion.slerp(targetQuat, 1 - Math.exp(-6 * rawDt))
      }
      if (deathCutsceneTimer <= 0) {
        camera.fov = 70
        camera.updateProjectionMatrix()
        const done = deathCutsceneOnDone
        deathCutsceneOnDone = null
        deathCutscenePos = null
        done()
      }
      renderer.render(scene, camera)
      return
    }

    hitShakeTimer = Math.max(0, hitShakeTimer - dt * 1000)
    rail.setShakeIntensity(hitShakeTimer > 0 ? SHIP_SHAKE_MAGNITUDE * (hitShakeTimer / HIT_SHAKE_DURATION_MS) : 0)

    player.update(dt)

    // pedido do usuário: removida a guinada assistida rumo ao inimigo mais próximo (Fase 9) —
    // em lutas de chefe/dourado o "mais próximo" quase sempre era ele mesmo, então a nave ficava
    // sendo puxada pra lá o tempo todo em vez de responder só ao controle manual do jogador.
    rail.update(dt, inputState)
    const playerPos = rail.getPlayerPosition()
    const noseFrame = rail.getFrameAt(0)
    const nosePos = rail.getShipNosePosition()

    if (rail.isArena()) {
      const attitude = rail.getArenaAttitude()
      hud.setHorizon(attitude.pitch, attitude.roll)
    } else {
      hud.setHorizon(null)
    }

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

    // Fase 8 (VISUAL): mira normal acende quando há um inimigo vivo na frente dela — só hint,
    // roda sempre (charging ou não), independente do lock-on de verdade do tiro teleguiado
    hud.setReticleAiming(combat.isAimingAtEnemy(nosePos, fireDirection))

    const isCharging = fireHeldMs >= player.config.homingChargeMinMs
    if (inputState.firing) {
      if (!isCharging) combat.tryFire(nosePos, fireDirection)
      fireHeldMs += dt * 1000
      if (isCharging) {
        const chargeFrac = Math.min(1, (fireHeldMs - player.config.homingChargeMinMs) / (player.config.homingChargeMaxMs - player.config.homingChargeMinMs))
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
        effects.setChargeGlow(false)
      }
    } else {
      if (isCharging) {
        combat.fireHomingShot(nosePos, currentHomingAllowedTargets(fireHeldMs))
      }
      fireHeldMs = 0
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
          effects.spinWind(playerPos, noseFrame.forward, -1)
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
          effects.spinWind(playerPos, noseFrame.forward, 1)
          if (player.isDeflectActive()) combat.deflectNearbyProjectiles(playerPos, DEFLECT_RADIUS)
        }
        lastDodgeRightTapAt = nowMs
      }
    }

    if (isActionPressed(bindings, inputState.pressed, 'propulsion')) {
      if (arenaNow && inputState.bank !== 0) {
        rail.triggerArenaLateralDash(inputState.bank)
      } else if (player.activatePropulsion()) {
        effects.propulsionBurst(playerPos, noseFrame.forward)
      }
    }
    if (isActionPressed(bindings, inputState.pressed, 'repulsion')) {
      if (arenaNow && inputState.moveY === -1) {
        rail.triggerArenaSummersault()
      } else if (arenaNow && nowMs - lastRepulsionTapAt <= DODGE_TAP_WINDOW_MS) {
        // 2º toque rápido (sem Baixo) — freio de emergência em vez de outra repulsão normal
        rail.triggerEmergencyBrake()
        lastRepulsionTapAt = -Infinity
      } else {
        player.activateRepulsion()
        lastRepulsionTapAt = nowMs
      }
    }

    rail.setSpeedMultiplier(speedMultiplier * player.getBoostSpeedFactor())
    hud.setBoost(player.getBoostCharge(), player.isPropulsionActive() || player.isRepulsionActive())

    const boostOn = player.isPropulsionActive()
    hud.setMotionLines(boostOn)
    hud.setBoostDistortion(boostOn)
    rail.setBoostActive(boostOn)

    const ramActive = player.isRamCardActive() && player.isPropulsionActive()
    if (ramActive) player.grantInvincibility(player.getPropulsionActiveTimer())

    const enemiesActive = phase === 'combat' || phase === 'goldenArena' || phase === 'bossBuildup' || phase === 'bossFight'

    // v0.34.0: Detrito spawna no timer próprio, sem checar spawnPauseThreshold/currentEnemyCap()
    // — só "tá em combate de verdade" importa (pedido do usuário, confirmado: ignora as duas
    // regras que os outros inimigos seguem)
    if (enemiesActive) {
      detritoTimer -= dt * 1000
      if (detritoTimer <= 0) {
        combat.spawnDetrito()
        detritoTimer = randomDetritoInterval()
      }
    }

    const events = combat.update(dt, playerPos, {
      enemiesActive,
      aimDirection: fireDirection,
      ramDamage: ramActive ? RAM_DAMAGE : 0,
    })

    // ============ HIT MARKER ============
    if (events.enemyKills > 0 || events.bonusKillPoints > 0 || events.goldenSpecialHit || events.bossDefeated) {
      hud.hitMarker(true)
    } else if (events.hitsLog && events.hitsLog.length > 0) {
      hud.hitMarker(false)
    }

    // ============ FAÍSCAS + FLASH NO MESH + SHAKE DE KILL ============
    if (events.hitsLog && events.hitsLog.length > 0) {
      for (const h of events.hitsLog) {
        effects.hitSpark(h.worldPos, h.isHoming ? 0x2bff88 : 0xffb066)
        if (h.meshRef) effects.flashMesh(h.meshRef)
      }
    }
    if (events.enemyKills > 0) {
      hitShakeTimer = Math.max(hitShakeTimer, 120)
      effects.gridPulse()
    }
    // shake maior — inimigo comum, dourado ou chefe destruído pelo tiro carregado (teleguiado)
    const chargedKillHappened =
      (events.hitsLog && events.hitsLog.some((h) => h.killed && h.isHoming)) ||
      (events.goldenSpecialHit && events.goldenSpecialHitIsHoming)
    if (chargedKillHappened) hitShakeTimer = Math.max(hitShakeTimer, HOMING_KILL_SHAKE_MS)

    // ============ NÚMEROS DE DANO FLUTUANTES ============
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
    // pedido do usuário: número roxo pequeno + ícone de ampulheta acima do redutor de tempo
    // destruído, mostrando exatamente quanto tempo aquele kill reduziu do ciclo
    if (events.timeReductionMs && events.timeReductionWorldPos) {
      const ndcT = events.timeReductionWorldPos.project(camera)
      const xFracT = THREE.MathUtils.clamp((ndcT.x + 1) / 2, 0, 1)
      const yFracT = THREE.MathUtils.clamp((1 - ndcT.y) / 2, 0, 1)
      hud.spawnDamageNumber(xFracT, yFracT, `${Math.round(events.timeReductionMs / 1000)}s ⏳`, { time: true, prefix: '-' })
    }

    const ndc = reticleWorldPos.project(camera)
    hud.setReticlePosition(
      THREE.MathUtils.clamp((ndc.x + 1) / 2, 0, 1),
      THREE.MathUtils.clamp((1 - ndc.y) / 2, 0, 1),
    )

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
      camera,
      shieldValue: player.getShieldValue(),
      shieldMax: player.getShieldMax(),
      boostActive: player.isPropulsionActive(),
      skipTrail: player.isRepulsionActive(), // freando = sem rastro de motor
    })
    effects.spawnContrailTick(combat.getWingmanPositions())

    if (events.enemyKillPoints) session.score += events.enemyKillPoints
    if (events.bonusKillPoints) session.score += events.bonusKillPoints
    if (events.timeReductionMs) cycleTimer = Math.max(0, cycleTimer - events.timeReductionMs)
    if (events.enemyKills > 0) cycleTimer = Math.max(0, cycleTimer - events.enemyKills * ENEMY_KILL_CYCLE_ADVANCE_MS)

    // pedido do usuário: cutscene em câmera lenta do chefe explodindo antes de sair da arena,
    // em vez da transição instantânea/awkward direto pro modo normal — a explosão de verdade
    // (explodeBoss) já foi disparada dentro de enemies.js no mesmo frame; aqui só segura a
    // câmera nela por um instante em slow-mo antes de aplicar a transição de verdade.
    if (events.bossDefeated && phase === 'bossFight') {
      hud.setBossFight(false)
      hud.setBossTint(false)
      // pedido do usuário: destrói todo o resto (inimigos extras + projéteis inimigos) na hora
      // em que o chefe morre, em vez de deixá-los na tela — o próprio chefe (já `dying`) não é
      // afetado, continua a animação/explosão dele normalmente.
      combat.clearOtherEnemies()
      deathCutscenePos = (events.bossHitWorldPos || playerPos).clone()
      deathCutsceneOnDone = () => {
        session.score += BOSS_DEFEAT_BONUS
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
      phase = 'deathCutscene'
      deathCutsceneTimer = DEATH_CUTSCENE_MS
    }

    // ============ DANO AO JOGADOR (escudo vs vida, efeitos distintos) ============
    if (events.enemyHits > 0 && !player.isInvincible() && !godMode) {
      hitShakeTimer = HIT_SHAKE_DURATION_MS

      // v0.34.0: alguns ataques específicos (laser da ampulheta mega, borda da moldura da
      // sentinela) declaram seu próprio dano "pesado" (events.enemyDamage) — usa o MAIOR entre
      // esse valor e a escalada normal por erro, nunca o menor (não quero a dificuldade por erro
      // "abafar" o ataque especial nem o contrário)
      const result = player.takeDamage(Math.max(enemyDamageValue, events.enemyDamage || 1))

      if (result.absorbedByShield) {
        // ---- dano ABSORVIDO pelo escudo: faixa azul com grid nas laterais ----
        hud.showShieldBlock()
        effects.shockwave(playerPos, 0x4da6ff, 0.6)
        effects.explosion(playerPos, 0x4da6ff, 0.5)
        if (result.shieldBroke) effects.glassShatter(playerPos, 0x4da6ff)
      } else {
        // ---- dano DIRETO na vida: faixa vermelha nas laterais + flash rápido ----
        hud.showDamageSide()
        hud.damageFlash()
        // Fase 7: "levar um acerto causa um efeito de explosão de tiro na nossa nave" — faltava
        // qualquer efeito 3D na própria nave quando o dano ia direto na vida (só existia o
        // shockwave azul do lado do escudo); agora todo acerto real também explode na nave.
        effects.explosion(playerPos, 0xff4d4d, 0.7)
      }

      if (result.outOfLives) {
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
            if (Math.random() < TIME_ENEMY_MEGA_CHANCE) combat.spawnTimeEnemyMega()
            else combat.spawnTimeEnemy()
          } else if (Math.random() < MINI_SWARM_CHANCE) {
            combat.spawnMiniSwarm()
          } else if (Math.random() < SENTINELA_SPAWN_CHANCE) {
            combat.spawnSentinela()
          } else {
            const room = Math.max(0, currentEnemyCap() - combat.getEnemyCount())
            const roll = NORMAL_SPAWN_MIN_COUNT + Math.floor(Math.random() * (NORMAL_SPAWN_MAX_COUNT - NORMAL_SPAWN_MIN_COUNT + 1))
            const count = Math.min(room, roll + extraSpawnPerBatch)
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
        // pedido do usuário: o chefe/dourado já aparece bem distante mas visível assim que o
        // aviso de 5s começa — dispara só na borda (não a cada frame) pra não recriar o mesh
        if (bossWarnActive && !arenaPreviewShown) { combat.showArenaPreview('boss'); arenaPreviewShown = true }
        else if (goldenWarnActive && !arenaPreviewShown) { combat.showArenaPreview('golden'); arenaPreviewShown = true }
        if (!bossWarnActive && !goldenWarnActive) arenaPreviewShown = false
        // pedido do usuário: segurar o impulso durante o aviso de 5s dobra a velocidade da
        // contagem — indica visualmente que o jogador tá "se aproximando mais rápido" do
        // chefe/dourado (uma segunda passada de decremento por cima da normal, só nessa janela)
        if (player.isPropulsionActive()) {
          if (bossWarnActive) cycleTimer = Math.max(0, cycleTimer - dt * 1000)
          if (goldenWarnActive) goldenTimer = Math.max(0, goldenTimer - dt * 1000)
        }
        if (bossWarnActive) {
          hud.setCountdown(null)
          hud.setArenaWarning('boss', Math.max(1, Math.ceil(cycleTimer / 1000)))
        } else {
          hud.setCountdown(Math.max(0, Math.ceil(cycleTimer / 1000)), cycleTimer <= WARNING_MS)
          hud.setArenaWarning(goldenWarnActive ? 'golden' : null, goldenWarnActive ? Math.max(1, Math.ceil(goldenTimer / 1000)) : null)
        }
        // v0.32: pergunta abre na hora — sem a fase 'recall' de 3.5s antes do modal
        if (cycleTimer <= 0) {
          if (isBossCycle) startArenaCutscene('boss', enterBossBuildup)
          else enterAlternatives()
        }
      }
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
        // bug reportado: o painel de "Acertou!" ficava preso na tela pra sempre depois disso —
        // nem aqui, nem em finishBossHunt()/enterBossFight() ninguém limpava o feedback (os
        // outros fluxos limpam via enterCombat()/resumeCombatFromGolden(), mas a caçada de
        // orbes do chefe volta pra 'bossBuildup' direto, sem passar por nenhum dos dois).
        hud.setFeedback(null)
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
      // v0.32: duração ilimitada — só sai daqui derrotando o dourado (pedido do usuário),
      // e a explosão dele ganha a mesma cutscene em câmera lenta do chefe antes da transição.
      if (events.goldenSpecialHit) {
        // pedido do usuário: mesmo comportamento do chefe — destrói o resto na hora
        combat.clearOtherEnemies()
        deathCutscenePos = (events.goldenHitWorldPos || playerPos).clone()
        deathCutsceneOnDone = () => {
          exitGoldenArenaVisuals()
          enterGoldenAlternatives()
        }
        phase = 'deathCutscene'
        deathCutsceneTimer = DEATH_CUTSCENE_MS
      }
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
    if (phase === 'bossQuestionPause') settleBossBuildupQuestion(outcome)
    else if (phase === 'questionPause' && pendingQuestionKind === 'golden') settleGoldenBonus(outcome)
    else if (phase === 'questionPause' && pendingQuestionKind === 'normal') settleQuestion(outcome)
  }

  hud.debug.bind({
    spawnEnemy: () => combat.spawnEnemy(),
    spawnTimeEnemy: () => combat.spawnTimeEnemy(),
    spawnBonus: () => combat.spawnBonusTarget(),
    spawnGolden: () => combat.spawnGoldenSpecial({ distanceMin: GOLDEN_SPREAD_MIN, distanceMax: GOLDEN_SPREAD_MAX }),
    spawnTank: () => combat.spawnTankEnemy(),
    spawnMiniSwarm: () => combat.spawnMiniSwarm(),
    spawnTimeEnemyMega: () => combat.spawnTimeEnemyMega(),
    spawnDetrito: () => combat.spawnDetrito(),
    spawnSentinela: () => combat.spawnSentinela(),
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
    maxBuffs: () => {
      player.debugMaxBuffs()
      combat.setWingmanCount(player.getWingmanCount())
    },
    // QoL: antes iam direto pra enterBossBuildup/enterGoldenArena, pulando a cutscene — não
    // dava pra testar a transição sem esperar o gatilho natural (dourado 45-100s, chefe a cada
    // 5 perguntas). Agora roteiam pela mesma startArenaCutscene que o jogo usa de verdade.
    // skipToBossFight continua sendo o atalho SEM cutscene, pra testar só a luta em si.
    gotoBoss: () => { if (phase === 'combat') startArenaCutscene('boss', enterBossBuildup) },
    skipToBossFight: () => {
      if (phase === 'bossBuildup' || phase === 'bossQuestionPause') finishBossHunt()
      else if (phase === 'combat') { bossHealthBonus = 0; rail.enterArena(); enterBossFight() }
    },
    gotoGolden: () => { if (phase === 'combat') startArenaCutscene('golden', enterGoldenArena) },
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
