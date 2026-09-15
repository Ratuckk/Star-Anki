import * as THREE from 'three'
import { nextQuestion, resolveAnswer, getSummary, pickBonusCard, buildBonusQuestion, computeDifficultyBias } from './quiz.js'
import { createRailController } from './rail.js'
import { createCombatSystem } from './combat/index.js'
import { createEnemiesSystem } from './enemies/index.js'
import { createPlayerSystem } from './player.js'
import { createEffectsSystem } from './effects.js'
import { createInputState } from './input.js'
import { createGameHud } from './hud.js'
import { saveHistory, recordResult } from './storage.js'
import { getSettings } from './settings.js'
import { getBindings, isActionPressed } from './keybindings.js'
import { pickRandomCards } from './roguelike.js'
import { createGameMenu } from './game-menu.js'
import { createDebugActions } from './debug-actions.js'
import { initMobileSupport, requestGameOrientation, releaseGameOrientation } from './mobile.js'
import {
  CYCLE_MS, ENEMY_KILL_CYCLE_ADVANCE_MS, WARNING_MS, FEEDBACK_MS, WRONG_FEEDBACK_MS,
  SPEED_STEP, BOOST_EVERY_CORRECT, GROUND_Y,
  INVINCIBILITY_FLICKER_MS,
  HIT_SHAKE_DURATION_MS, SHIP_SHAKE_MAGNITUDE, CAMERA_SHAKE_MAGNITUDE, HOMING_KILL_SHAKE_MS,
  LEVEL_BACKGROUNDS,
  RETICLE_AHEAD, RETICLE_OVERSHOOT_FACTOR, RETICLE_SETTLE_RATE,
  BOSS_EVERY_QUESTIONS, BOSS_CYCLE_MS, BOSS_ENEMY_INTERVAL_MULT, BOSS_BUILDUP_MS,
  BOSS_QUESTION_COUNT, BOSS_HUNT_BONUS_MS, BOSS_BASE_HP, BOSS_HP_PER_ERROR,
  BOSS_DEFEAT_BONUS, BOSS_SPREAD_MIN_BASE, BOSS_SPREAD_MAX_BASE, BOSS_SPREAD_STEP,
  BOSS_SPREAD_MIN_CAP, BOSS_SPREAD_MAX_CAP, BOSS_EXTRA_ENEMIES_BASE, BOSS_EXTRA_ENEMIES_STEP,
  BOSS_EXTRA_ENEMIES_CAP, BOSS_DIFFICULTY_CAP,
  ENEMY_INTERVAL_MIN_BASE, ENEMY_INTERVAL_MAX_BASE, ENEMY_INTERVAL_FLOOR, ENEMY_INTERVAL_STEP,
  ENEMY_AGGRESSION_STEP, ENEMY_AGGRESSION_CAP,
  ENEMY_SPAWN_BONUS_WRONG_THRESHOLD, ENEMY_PROJECTILE_SPEED_PER_WRONG, ENEMY_DAMAGE_WRONG_THRESHOLD,
  DIFFICULTY_BIAS_INTERVAL_RANGE_MS,
  ENEMY_CAP_NORMAL_BASE, ENEMY_CAP_ARENA_BASE, ENEMY_CAP_STEP_PER_ERROR, ARENA_ENEMY_INTERVAL_MULT,
  NORMAL_SPAWN_INTERVAL_MS, NORMAL_SPAWN_MIN_COUNT, NORMAL_SPAWN_MAX_COUNT,
  NORMAL_SPAWN_PAUSE_BEFORE_QUESTION_MS, MINI_SWARM_CHANCE,
  BONUS_INTERVAL_MIN, BONUS_INTERVAL_MAX, REVIEW_ENEMY_INTERVAL_MULT,
  GOLDEN_INTERVAL_MIN_MS, GOLDEN_INTERVAL_MAX_MS, GOLDEN_SPREAD_MIN, GOLDEN_SPREAD_MAX,
  TIME_ENEMY_SPAWN_CHANCE, TIME_ENEMY_MEGA_CHANCE, SENTINELA_SPAWN_CHANCE,
  DETRITO_SPAWN_INTERVAL_MIN_MS, DETRITO_SPAWN_INTERVAL_MAX_MS,
  REPLICA_SPAWN_CHANCE, VERME_SPAWN_CHANCE, SUSSURRO_SPAWN_CHANCE, FRAGATA_SPAWN_CHANCE,
  IMA_SPAWN_INTERVAL_MIN_MS, IMA_SPAWN_INTERVAL_MAX_MS,
  ARENA_WARNING_COUNTDOWN_MS, ARENA_WARNING_STOP_SPAWN_MS, ARENA_CUTSCENE_MS,
  ARENA_CUTSCENE_PULLBACK, ARENA_CUTSCENE_FOV_BUMP, ARENA_CUTSCENE_ORBIT,
  BOSS_SUMMON_CUTSCENE_MS,
  DEATH_CUTSCENE_MS, DEATH_CUTSCENE_TIME_SCALE, DEATH_CUTSCENE_ZOOM_FOV,
  HOMING_LOCK_INTERVAL_MS, DODGE_TAP_WINDOW_MS, DEFLECT_RADIUS, RAM_DAMAGE,
  LOW_HEALTH_THRESHOLD_FRAC,
} from './main-constants.js'

// Fluxo de menu/baralho/painel de revisão mora em game-menu.js (extraído daqui) — mountGame
// recebe `deck` e o pacote `menu` ({ sessionResults, renderEndScreen }) de lá, porque endSector()
// precisa mostrar a tela de fim de partida. `session.history` já vem populado por createSession
// (quiz.js) com o mesmo objeto de histórico que game-menu.js persiste, então mountGame nunca
// precisa de uma cópia própria.
function mountGame(session, deck, menu) {
  const hud = createGameHud()
  // suporte mobile: tela cheia + travar em paisagem, best-effort (ver mobile.js) — o aviso de
  // "gire o celular" continua cobrindo o caso onde nenhum dos dois é suportado pelo navegador
  requestGameOrientation()

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0b0d12)
  // v0.51.10: densidade 0.014 deixava um inimigo a 140 unidades (distância normal de spawn)
  // ~98% coberto pela cor de fundo — na prática invisível até chegar bem perto. 0.004 deixa
  // ~27% de neblina a 140u (visível, ainda com profundidade atmosférica) e ~92% perto do plano
  // de corte da câmera (400u, fade de horizonte continua existindo).
  scene.fog = new THREE.FogExp2(0x0b0d12, 0.004)

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

  // visual da nave escolhido em Configurações (lido uma vez no início da partida, mesmo padrão
  // de startingHealth/showEnemyHealthBars — a nave é montada uma única vez aqui)
  const rail = createRailController(camera, scene, getSettings().shipVisual)
  // Fase 9 (ideia all-range, item 5): sensibilidade de giro configurável em Configurações
  rail.setTurnSensitivity(getSettings().arenaTurnSensitivity)
  const effects = createEffectsSystem(scene, { grid })
  const enemies = createEnemiesSystem(scene, rail, effects)
  const player = createPlayerSystem(session)
  const combat = createCombatSystem(scene, rail, effects, enemies, player)
  const input = createInputState()

  const bindings = getBindings()
  const showEnemyHealthBars = getSettings().showEnemyHealthBars

  // Fase 9 (ideia de baralho, item 1): desloca só o ponto de partida do intervalo de spawn
  // pelo histórico de erro do baralho — ver comentário de DIFFICULTY_BIAS_INTERVAL_RANGE_MS.
  // (computado ANTES do `state` object porque enemyIntervalMax depende de enemyIntervalMin)
  const difficultyBias = computeDifficultyBias(deck.shooterCards, session.history)
  const difficultyBiasOffsetMs = (difficultyBias - 0.5) * 2 * DIFFICULTY_BIAS_INTERVAL_RANGE_MS
  const enemyIntervalMinInit = Math.max(ENEMY_INTERVAL_FLOOR, ENEMY_INTERVAL_MIN_BASE + difficultyBiasOffsetMs)
  const enemyIntervalMaxInit = Math.max(enemyIntervalMinInit + 150, ENEMY_INTERVAL_MAX_BASE + difficultyBiasOffsetMs)

  // ============ ESTADO MUTÁVEL DA PARTIDA (etapa 2 do overhaul de organização) ============
  // Antes vivia espalhado como ~40 `let` soltos dentro do closure de mountGame. Agora agrupado
  // num objeto único (mesmo padrão que `debugFlags` já usava, ver comentário em
  // debug-actions.js: "objeto (não 4 lets soltos) pra poder ser compartilhado por referência
  // com debug-actions.js"). O motivo é o mesmo em escala maior: nas próximas etapas do overhaul
  // (extração de flows — cutscenes, fluxo boss/dourado, fluxo pergunta/cartas, progressão),
  // cada flow extraído recebe `state` como referência e mexe nele diretamente, sem precisar
  // devolver N valores diferentes por retorno.
  //
  // Zero mudança de comportamento: nenhum nome de variável mudou, só o endereço de memória
  // (todos os `x = ...` e `x === ...` viraram `state.x = ...` e `state.x === ...`). Os campos
  // que dependiam de funções locais (`randomGoldenInterval` etc.) são inicializados em 0 no
  // literal e recebem o valor real logo abaixo — mantém a inicialização legível sem depender
  // de hoisting.
  const state = {
    // ============ loop / debug ============
    debugVisible: false,
    debugFlags: { godMode: false, infiniteAmmoActive: false, hitboxesActive: false, slowMoActive: false },
    lastTime: performance.now(),
    rafId: null,
    stopped: false,
    paused: false,

    // ============ máquina de estados (phase) ============
    phase: null,
    phaseTimer: 0,
    cycleTimer: 0,
    enemyTimer: 0,
    questionResult: null,
    pendingSectorOver: false,
    pendingQuestionKind: null,
    pendingCardChoice: false,
    consecutiveCorrect: 0,
    speedMultiplier: 1,
    isBossCycle: false,
    isReviewQuestion: false,

    // ============ chefe ============
    bossHealthBonus: 0,
    bossBuildupTimer: 0,
    bossOrbsRemaining: 0,
    bossDifficulty: 0,

    // ============ dourado ============
    goldenTimer: 0, // valor real logo abaixo (randomGoldenInterval)
    goldenCard: null,

    // ============ cutscene de arena (dourado/chefe se aproximando) ============
    arenaCutsceneTimer: 0,
    arenaCutsceneDurationMs: ARENA_CUTSCENE_MS, // reaproveitada com valor maior pro summon do chefe (ver BOSS_SUMMON_CUTSCENE_MS)
    arenaCutsceneOnDone: null,
    arenaCutsceneBaseCameraPos: null,
    arenaCutsceneBaseForward: null,
    arenaCutsceneBaseRight: null,
    arenaPreviewShown: false,

    // ============ cutscene de morte (chefe/dourado explodindo) ============
    deathCutsceneTimer: 0,
    deathCutscenePos: null,
    deathCutsceneOnDone: null,

    // ============ input / timing / feedback visual ============
    fireHeldMs: 0,
    reticleOffsetX: 0,
    reticleOffsetY: 0,
    lastDodgeLeftTapAt: -Infinity,
    lastDodgeRightTapAt: -Infinity,
    // Fase 9 (ideia all-range, item 4): duplo toque em repulsão (sem Baixo, que já é a
    // cambalhota) dispara o freio de emergência — mesma janela de detecção do giro completo
    lastRepulsionTapAt: -Infinity,
    hitShakeTimer: 0,

    // ============ dificuldade (escalada por erro) ============
    enemyIntervalMin: enemyIntervalMinInit,
    enemyIntervalMax: enemyIntervalMaxInit,
    enemyAggression: 1,
    wrongAnswerCount: 0,
    extraSpawnPerBatch: 0,
    enemyDamageValue: 1,
    enemyCap: 0,

    // ============ timers de spawn ============
    normalSpawnTimer: NORMAL_SPAWN_INTERVAL_MS,
    detritoTimer: 0, // valor real logo abaixo (randomDetritoInterval)
    imaTimer: 0, // valor real logo abaixo (randomImaInterval)
    bonusTimer: 0, // valor real logo abaixo (randomBonusInterval)
  }

  // inicialização "pós-declaração" dos timers que dependem de funções locais (todas self-
  // contained, só leem constantes — ver definições logo abaixo). Antes viviam inline em `let
  // x = randomYInterval()`, mas agora ficam explicitamente fora do literal do state pra não
  // depender de hoisting de function declaration dentro de object literal.
  state.goldenTimer = randomGoldenInterval()
  state.detritoTimer = randomDetritoInterval()
  state.imaTimer = randomImaInterval()
  state.bonusTimer = randomBonusInterval()

  function currentEnemyCap() {
    return (rail.isArena() ? ENEMY_CAP_ARENA_BASE : ENEMY_CAP_NORMAL_BASE) + state.enemyCap
  }

  function randomDetritoInterval() {
    return DETRITO_SPAWN_INTERVAL_MIN_MS + Math.random() * (DETRITO_SPAWN_INTERVAL_MAX_MS - DETRITO_SPAWN_INTERVAL_MIN_MS)
  }

  function randomImaInterval() {
    return IMA_SPAWN_INTERVAL_MIN_MS + Math.random() * (IMA_SPAWN_INTERVAL_MAX_MS - IMA_SPAWN_INTERVAL_MIN_MS)
  }

  function randomEnemyInterval() {
    return state.enemyIntervalMin + Math.random() * (state.enemyIntervalMax - state.enemyIntervalMin)
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
      state.consecutiveCorrect += 1
      if (state.consecutiveCorrect % BOOST_EVERY_CORRECT === 0) {
        state.speedMultiplier *= 1 + SPEED_STEP
        rail.setSpeedMultiplier(state.speedMultiplier)
      }
    } else {
      state.consecutiveCorrect = 0
      state.speedMultiplier = 1
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
    state.phase = 'cardChoice'
    hud.showCardChoice({
      cards,
      onPick: (card) => {
        applyRoguelikeCard(card)
        onDone()
      },
    })
  }

  function applyDifficulty() {
    state.enemyIntervalMin = Math.max(ENEMY_INTERVAL_FLOOR, state.enemyIntervalMin - ENEMY_INTERVAL_STEP)
    state.enemyIntervalMax = Math.max(state.enemyIntervalMin + 150, state.enemyIntervalMax - ENEMY_INTERVAL_STEP)
    state.enemyAggression = Math.min(ENEMY_AGGRESSION_CAP, state.enemyAggression + ENEMY_AGGRESSION_STEP)
    combat.setEnemyAggressiveness(state.enemyAggression)
    state.enemyCap += ENEMY_CAP_STEP_PER_ERROR

    // pedido do usuário: escalada quantificada em cima do que já existia acima
    state.wrongAnswerCount += 1
    state.extraSpawnPerBatch = Math.floor(state.wrongAnswerCount / ENEMY_SPAWN_BONUS_WRONG_THRESHOLD)
    state.enemyDamageValue = 1 + Math.floor(state.wrongAnswerCount / ENEMY_DAMAGE_WRONG_THRESHOLD)
    combat.setEnemyProjectileSpeedBonus(state.wrongAnswerCount * ENEMY_PROJECTILE_SPEED_PER_WRONG)
  }

  function applyBossDifficulty() {
    state.bossDifficulty = Math.min(BOSS_DIFFICULTY_CAP, state.bossDifficulty + 1)
  }

  function currentBossSpread() {
    return {
      distanceMin: Math.min(BOSS_SPREAD_MIN_CAP, BOSS_SPREAD_MIN_BASE + state.bossDifficulty * BOSS_SPREAD_STEP),
      distanceMax: Math.min(BOSS_SPREAD_MAX_CAP, BOSS_SPREAD_MAX_BASE + state.bossDifficulty * BOSS_SPREAD_STEP),
    }
  }

  function currentBossExtraEnemies() {
    return Math.min(BOSS_EXTRA_ENEMIES_CAP, BOSS_EXTRA_ENEMIES_BASE + state.bossDifficulty * BOSS_EXTRA_ENEMIES_STEP)
  }

  function enterCombat() {
    state.phase = 'combat'
    state.isBossCycle = (session.pointer + 1) % BOSS_EVERY_QUESTIONS === 0
    state.isReviewQuestion = (session.history[session.queue[session.pointer].guid]?.erros ?? 0) > 0
    state.cycleTimer = state.isBossCycle ? BOSS_CYCLE_MS : CYCLE_MS
    state.enemyTimer = randomEnemyInterval() * (state.isBossCycle ? BOSS_ENEMY_INTERVAL_MULT : 1) * (state.isReviewQuestion ? REVIEW_ENEMY_INTERVAL_MULT : 1)
    state.normalSpawnTimer = NORMAL_SPAWN_INTERVAL_MS
    state.bonusTimer = randomBonusInterval()
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
    state.questionResult = result
    state.pendingQuestionKind = 'normal'
    state.phase = 'questionPause'
    hud.showQuestionModal({
      question: result.card.question,
      alternatives: result.alternatives,
      onPick: (slot) => {
        settleQuestion({
          type: slot === state.questionResult.correctSlot ? 'correct' : 'wrong',
          card: state.questionResult.card,
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
    state.phase = 'bossBuildup'
    state.bossBuildupTimer = BOSS_BUILDUP_MS
    state.bossHealthBonus = 0
    state.bossOrbsRemaining = BOSS_QUESTION_COUNT
    state.questionResult = null
    rail.enterArena()
    hud.setBossActive(true, state.bossOrbsRemaining)
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
    state.questionResult = result
    state.bossOrbsRemaining = Math.max(0, state.bossOrbsRemaining - 1)
    hud.setBossActive(true, state.bossOrbsRemaining)
    state.phase = 'bossQuestionPause'
    hud.showQuestionModal({
      question: result.card.question,
      alternatives: result.alternatives,
      onPick: (slot) => {
        settleBossBuildupQuestion({
          type: slot === state.questionResult.correctSlot ? 'correct' : 'wrong',
          card: state.questionResult.card,
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
      state.bossHealthBonus += BOSS_HP_PER_ERROR
    } else {
      state.bossBuildupTimer += BOSS_HUNT_BONUS_MS
    }

    recordResult(session.history, outcome.card.guid, correct)
    saveHistory(session.history)
    menu.sessionResults.push({ guid: outcome.card.guid, correct })

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

    // v0.51.0 — `resolution.sectorOver` removido: desde o modo infinito (v0.29.6) o único fim
    // de setor é zerar vidas, e desde o ajuste de "errar não tira vida" ele é SEMPRE false.
    // `applyHealthLoss()` continua sendo o único caminho real (health chegou a 0 vindo de dano
    // de inimigo).
    const outOfLives = applyHealthLoss()
    if (outOfLives) {
      state.pendingSectorOver = true
      state.pendingCardChoice = false
      state.phase = 'resolution'
      state.phaseTimer = correct ? 0 : WRONG_FEEDBACK_MS
      return
    }

    state.pendingCardChoice = correct
    state.phase = 'bossBuildupResolution'
    state.phaseTimer = correct ? 0 : WRONG_FEEDBACK_MS
  }

  // tempo (90s + bônus) acabou antes das 6 perguntas: chefe surge na hora, +20 de vida por orbe
  // que sobrou sem ser respondido — igual à punição de errar (confirmado com o usuário)
  function finishBossHunt() {
    hud.hideQuestionModal()
    state.bossHealthBonus += BOSS_HP_PER_ERROR * state.bossOrbsRemaining
    state.bossOrbsRemaining = 0
    combat.clearBossOrbs()
    // pedido do usuário: em vez do chefe simplesmente aparecer na hora, roda uma cutscene de
    // pelo menos 5s ("pro jogador respirar") antes de invocar ele de verdade
    startArenaCutscene('bossSummon', enterBossFight, BOSS_SUMMON_CUTSCENE_MS)
  }

  // usado tanto pro dourado quanto pro chefe: 5s de aviso (já em andamento antes desta chamada,
  // via hud.setArenaWarning) + cutscene de câmera se ajeitando (nave travada, ver tick()) antes
  // de `onDone` (enterGoldenArena/enterBossBuildup) finalmente rodar
  function startArenaCutscene(kind, onDone, durationMs = ARENA_CUTSCENE_MS) {
    state.phase = 'arenaCutscene'
    state.arenaCutsceneTimer = durationMs
    state.arenaCutsceneDurationMs = durationMs
    state.arenaCutsceneOnDone = onDone
    state.arenaCutsceneBaseCameraPos = camera.position.clone()
    state.arenaCutsceneBaseForward = rail.getFrameAt(0).forward.clone()
    state.arenaCutsceneBaseRight = rail.getFrameAt(0).right.clone()
    hud.setArenaWarning(null)
    hud.setCountdown(null)
    hud.setArenaCutscene(kind)
    // pedido do usuário: o preview do chefe/dourado ao longe (mostrado durante o aviso de 5s)
    // só fazia sentido até aqui — a partir da cutscene de verdade, some (o combate real spawna
    // o chefe/dourado de verdade em seguida)
    combat.clearArenaPreview()
  }

  function enterBossFight() {
    state.phase = 'bossFight'
    hud.setBossActive(false)
    hud.setCountdown(null)
    hud.setBossTint(true)
    combat.clearAllCombatants()
    const bossHp = BOSS_BASE_HP + state.bossHealthBonus
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
    state.phase = 'goldenArena'
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
    state.phase = 'combat'
    rail.setAdvancing(true)
    state.goldenTimer = randomGoldenInterval()
    hud.setFeedback(null)
  }

  // v0.32: mesma mudança da pergunta normal — sem a fase 'goldenRecall' de 3.5s antes do modal
  function enterGoldenAlternatives() {
    state.goldenCard = pickBonusCard(deck, session)
    const result = buildBonusQuestion(state.goldenCard, deck.allCards)
    state.questionResult = result
    state.pendingQuestionKind = 'golden'
    state.phase = 'questionPause'
    hud.showQuestionModal({
      question: result.card.question,
      alternatives: result.alternatives,
      onPick: (slot) => {
        settleGoldenBonus({
          type: slot === state.questionResult.correctSlot ? 'correct' : 'wrong',
          card: state.questionResult.card,
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

    recordResult(session.history, outcome.card.guid, correct)
    saveHistory(session.history)
    menu.sessionResults.push({ guid: outcome.card.guid, correct })

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

    // v0.51.0 — `resolution.sectorOver` removido (ver comentário em settleBossBuildupQuestion).
    const outOfLives = applyHealthLoss()
    state.pendingSectorOver = outOfLives
    state.pendingCardChoice = correct
    state.phase = 'resolution'
    state.phaseTimer = correct ? 0 : WRONG_FEEDBACK_MS
  }

  function settleGoldenBonus(outcome) {
    hud.hideQuestionModal()
    const correct = outcome.type === 'correct'

    recordResult(session.history, outcome.card.guid, correct)
    saveHistory(session.history)
    menu.sessionResults.push({ guid: outcome.card.guid, correct })

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

    state.pendingCardChoice = correct
    state.phase = 'goldenResolution'
    state.phaseTimer = correct ? 0 : WRONG_FEEDBACK_MS
  }

  function endSector() {
    teardown()
    menu.renderEndScreen(getSummary(session))
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener('resize', onResize)

  function teardown() {
    state.stopped = true
    cancelAnimationFrame(state.rafId)
    window.removeEventListener('resize', onResize)
    input.dispose()
    effects.dispose()
    combat.dispose()
    renderer.dispose()
    hud.unmount()
    releaseGameOrientation()
  }

  function tick(now) {
    if (state.stopped) return
    state.rafId = requestAnimationFrame(tick)
    const rawDt = Math.min((now - state.lastTime) / 1000, 0.1)
    const dt = state.debugFlags.slowMoActive ? rawDt * 0.25 : rawDt
    state.lastTime = now

    const inputState = input.update()

    if (isActionPressed(bindings, inputState.pressed, 'pause')) {
      state.paused = !state.paused
      hud.setPaused(state.paused)
    }
    if (isActionPressed(bindings, inputState.pressed, 'debugToggle')) {
      state.debugVisible = !state.debugVisible
      hud.debug.setVisible(state.debugVisible)
    }
    if (state.paused) return

    // ============ PAUSA TOTAL: PERGUNTA (CHEFE/NORMAL/DOURADO) OU CARTA ROGUELIKE ============
    // nave travada, sem input nenhum — só espera a resolução (modal ou clique na carta).
    // questionPause é da Fase 6: pergunta normal e bônus dourado passaram a pausar tudo igual
    // ao chefe (Fase 5), em vez de "voa e atira nos 4 alvos flutuantes". cardChoice entrou
    // antes disso, na v0.29.6. Continua renderizando a cena parada.
    if (state.phase === 'bossQuestionPause' || state.phase === 'questionPause' || state.phase === 'cardChoice') {
      renderer.render(scene, camera)
      return
    }

    // ============ CUTSCENE DE TRANSIÇÃO PARA ALL-RANGE (dourado/chefe) ============
    // nave travada, só a câmera se move sozinha (puxa pra trás + abre o FOV e volta), igual
    // confirmado com o usuário — ao terminar, chama arenaCutsceneOnDone (enterGoldenArena ou
    // enterBossBuildup), que aí sim muda de fase e liga o modo all-range de verdade.
    if (state.phase === 'arenaCutscene') {
      state.arenaCutsceneTimer -= dt * 1000
      const t = THREE.MathUtils.clamp(1 - Math.max(0, state.arenaCutsceneTimer) / state.arenaCutsceneDurationMs, 0, 1)
      const pull = Math.sin(Math.min(1, t) * Math.PI)
      camera.position.copy(state.arenaCutsceneBaseCameraPos)
        .addScaledVector(state.arenaCutsceneBaseForward, -pull * ARENA_CUTSCENE_PULLBACK)
        .addScaledVector(state.arenaCutsceneBaseRight, pull * ARENA_CUTSCENE_ORBIT)
      camera.fov = 70 + pull * ARENA_CUTSCENE_FOV_BUMP
      camera.updateProjectionMatrix()
      camera.lookAt(state.arenaCutsceneBaseCameraPos.clone().addScaledVector(state.arenaCutsceneBaseForward, 40))
      if (state.arenaCutsceneTimer <= 0) {
        camera.fov = 70
        camera.updateProjectionMatrix()
        hud.setArenaCutscene(null)
        const done = state.arenaCutsceneOnDone
        state.arenaCutsceneOnDone = null
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
    if (state.phase === 'deathCutscene') {
      state.deathCutsceneTimer -= rawDt * 1000
      const slowDt = rawDt * DEATH_CUTSCENE_TIME_SCALE
      effects.update(slowDt, rail.getPlayerPosition(), rail.getFrameAt(0).forward, {
        camera,
        shieldValue: player.getShieldValue(),
        shieldMax: player.getShieldMax(),
        boostActive: false,
        skipTrail: true,
      })
      const t = THREE.MathUtils.clamp(1 - Math.max(0, state.deathCutsceneTimer) / DEATH_CUTSCENE_MS, 0, 1)
      const zoomT = Math.sin(Math.min(1, t) * Math.PI)
      camera.fov = 70 - zoomT * (70 - DEATH_CUTSCENE_ZOOM_FOV)
      camera.updateProjectionMatrix()
      if (state.deathCutscenePos) {
        const targetQuat = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().lookAt(camera.position, state.deathCutscenePos, camera.up),
        )
        camera.quaternion.slerp(targetQuat, 1 - Math.exp(-6 * rawDt))
      }
      if (state.deathCutsceneTimer <= 0) {
        camera.fov = 70
        camera.updateProjectionMatrix()
        const done = state.deathCutsceneOnDone
        state.deathCutsceneOnDone = null
        state.deathCutscenePos = null
        done()
      }
      renderer.render(scene, camera)
      return
    }

    state.hitShakeTimer = Math.max(0, state.hitShakeTimer - dt * 1000)
    rail.setShakeIntensity(state.hitShakeTimer > 0 ? SHIP_SHAKE_MAGNITUDE * (state.hitShakeTimer / HIT_SHAKE_DURATION_MS) : 0)

    player.update(dt)

    // pedido do usuário: removida a guinada assistida rumo ao inimigo mais próximo (Fase 9) —
    // em lutas de chefe/dourado o "mais próximo" quase sempre era ele mesmo, então a nave ficava
    // sendo puxada pra lá o tempo todo em vez de responder só ao controle manual do jogador.
    rail.update(dt, inputState)
    // CRÍTICO: camera.lookAt() (chamado dentro de rail.update) atualiza camera.matrixWorld,
    // mas NÃO camera.matrixWorldInverse — e Vector3.project(camera) usa matrixWorldInverse.
    // Sem isso, TODO project() feito neste tick usa a câmera do frame ANTERIOR: marcador de
    // lock, barra de vida de inimigo, número de dano, reticle e minimapa ficam deslocados pelo
    // deslocamento do trilho entre frames (~0.37u a 60fps). O renderer só sincroniza no final
    // do tick, tarde demais pros HUDs que leem .project() no meio do update.
    camera.updateMatrixWorld()

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
      state.reticleOffsetX += (targetOffsetX - state.reticleOffsetX) * settleT
      state.reticleOffsetY += (targetOffsetY - state.reticleOffsetY) * settleT
      reticleX = state.reticleOffsetX
      reticleY = state.reticleOffsetY
    } else {
      state.reticleOffsetX = 0
      state.reticleOffsetY = 0
    }

    const reticleWorldPos = nosePos.clone()
      .addScaledVector(noseFrame.right, reticleX)
      .addScaledVector(noseFrame.up, reticleY)
      .addScaledVector(noseFrame.forward, RETICLE_AHEAD)

    const fireDirection = reticleWorldPos.clone().sub(nosePos).normalize()

    // Fase 8 (VISUAL): mira normal acende quando há um inimigo vivo na frente dela — só hint,
    // roda sempre (charging ou não), independente do lock-on de verdade do tiro teleguiado
    hud.setReticleAiming(combat.isAimingAtEnemy(nosePos, fireDirection))

    const isCharging = state.fireHeldMs >= player.config.homingChargeMinMs
    if (inputState.firing) {
      if (!isCharging && combat.tryFire(nosePos, fireDirection)) rail.triggerRecoil()
      state.fireHeldMs += dt * 1000
      if (isCharging) {
        const chargeFrac = Math.min(1, (state.fireHeldMs - player.config.homingChargeMinMs) / (player.config.homingChargeMaxMs - player.config.homingChargeMinMs))
        effects.setChargeGlow(true, chargeFrac, nosePos, fireDirection)

        combat.sweepLockOn(nosePos, fireDirection, currentHomingAllowedTargets(state.fireHeldMs))
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
        const isMaxCharge = state.fireHeldMs >= player.config.homingChargeMaxMs
        combat.fireHomingShot(nosePos, currentHomingAllowedTargets(state.fireHeldMs), isMaxCharge)
      }
      state.fireHeldMs = 0
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
        if (nowMs - state.lastDodgeLeftTapAt <= DODGE_TAP_WINDOW_MS && !player.isFullSpinOnCooldown()) {
          rail.triggerFullSpin(-1)
          player.triggerFullSpinIframes()
          effects.spinWind(playerPos, noseFrame.forward, -1)
          if (player.isDeflectActive()) {
            combat.deflectNearbyProjectiles(playerPos, DEFLECT_RADIUS)
            // pedido do usuário: argolas azuis + afterimage marcando o giro rebatedor de verdade
            effects.deflectBurst(playerPos, noseFrame.forward)
          }
        }
        state.lastDodgeLeftTapAt = nowMs
      }
    }
    if (dodgeRightTapped) {
      if (arenaNow && inputState.propulsionHeld) {
        rail.triggerArenaLateralDash(1)
      } else {
        if (nowMs - state.lastDodgeRightTapAt <= DODGE_TAP_WINDOW_MS && !player.isFullSpinOnCooldown()) {
          rail.triggerFullSpin(1)
          player.triggerFullSpinIframes()
          effects.spinWind(playerPos, noseFrame.forward, 1)
          if (player.isDeflectActive()) {
            combat.deflectNearbyProjectiles(playerPos, DEFLECT_RADIUS)
            // pedido do usuário: argolas azuis + afterimage marcando o giro rebatedor de verdade
            effects.deflectBurst(playerPos, noseFrame.forward)
          }
        }
        state.lastDodgeRightTapAt = nowMs
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
      } else if (arenaNow && nowMs - state.lastRepulsionTapAt <= DODGE_TAP_WINDOW_MS) {
        // 2º toque rápido (sem Baixo) — freio de emergência em vez de outra repulsão normal
        rail.triggerEmergencyBrake()
        state.lastRepulsionTapAt = -Infinity
      } else {
        player.activateRepulsion()
        state.lastRepulsionTapAt = nowMs
      }
    }

    rail.setSpeedMultiplier(state.speedMultiplier * player.getBoostSpeedFactor())
    hud.setBoost(player.getBoostCharge(), player.isPropulsionActive() || player.isRepulsionActive())

    const boostOn = player.isPropulsionActive()
    hud.setMotionLines(boostOn)
    hud.setBoostDistortion(boostOn)
    rail.setBoostActive(boostOn)

    const ramActive = player.isRamCardActive() && player.isPropulsionActive()
    if (ramActive) player.grantInvincibility(player.getPropulsionActiveTimer())

    const enemiesActive = state.phase === 'combat' || state.phase === 'goldenArena' || state.phase === 'bossBuildup' || state.phase === 'bossFight'

    // v0.34.0: Detrito spawna no timer próprio, sem checar spawnPauseThreshold/currentEnemyCap()
    // — só "tá em combate de verdade" importa (pedido do usuário, confirmado: ignora as duas
    // regras que os outros inimigos seguem)
    if (enemiesActive) {
      state.detritoTimer -= dt * 1000
      if (state.detritoTimer <= 0) {
        combat.spawnDetrito()
        state.detritoTimer = randomDetritoInterval()
      }
      // Enxame-Ímã: campo estático, funciona nos dois modos (ver comentário na declaração)
      state.imaTimer -= dt * 1000
      if (state.imaTimer <= 0) {
        combat.spawnImaSwarm()
        state.imaTimer = randomImaInterval()
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
      state.hitShakeTimer = Math.max(state.hitShakeTimer, 120)
      effects.gridPulse()
    }
    // shake maior — inimigo comum, dourado ou chefe destruído pelo tiro carregado (teleguiado)
    const chargedKillHappened =
      (events.hitsLog && events.hitsLog.some((h) => h.killed && h.isHoming)) ||
      (events.goldenSpecialHit && events.goldenSpecialHitIsHoming)
    if (chargedKillHappened) state.hitShakeTimer = Math.max(state.hitShakeTimer, HOMING_KILL_SHAKE_MS)

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
    // destruído, mostrando exatamente quanto tempo aquele kill específico reduziu do ciclo
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
      ramActive,
      rollActive: player.isRollIframeActive(),
    })
    // v0.51.0 — passa `dt` (era passo fixo de 1/60 lá dentro; ver comentário em effects.js).
    effects.spawnContrailTick(combat.getWingmanPositions(), dt)

    if (events.enemyKillPoints) session.score += events.enemyKillPoints
    if (events.bonusKillPoints) session.score += events.bonusKillPoints
    if (events.timeReductionMs) state.cycleTimer = Math.max(0, state.cycleTimer - events.timeReductionMs)
    if (events.enemyKills > 0) state.cycleTimer = Math.max(0, state.cycleTimer - events.enemyKills * ENEMY_KILL_CYCLE_ADVANCE_MS)

    // pedido do usuário: cutscene em câmera lenta do chefe explodindo antes de sair da arena,
    // em vez da transição instantânea/awkward direto pro modo normal — a explosão de verdade
    // (explodeBoss) já foi disparada dentro de enemies.js no mesmo frame; aqui só segura a
    // câmera nela por um instante em slow-mo antes de aplicar a transição de verdade.
    if (events.bossDefeated && state.phase === 'bossFight') {
      hud.setBossFight(false)
      hud.setBossTint(false)
      // pedido do usuário: destrói todo o resto (inimigos extras + projéteis inimigos) na hora
      // em que o chefe morre, em vez de deixá-los na tela — o próprio chefe (já `dying`) não é
      // afetado, continua a animação/explosão dele normalmente.
      combat.clearOtherEnemies()
      state.deathCutscenePos = (events.bossHitWorldPos || playerPos).clone()
      state.deathCutsceneOnDone = () => {
        session.score += BOSS_DEFEAT_BONUS
        rail.exitArena()
        hud.setFeedback({
          correct: true,
          correctAnswer: '',
          points: BOSS_DEFEAT_BONUS,
          comboMultiplier: session.comboMultiplier,
          health: session.health,
        })
        state.pendingCardChoice = true
        state.phase = 'bossVictory'
        state.phaseTimer = FEEDBACK_MS
      }
      state.phase = 'deathCutscene'
      state.deathCutsceneTimer = DEATH_CUTSCENE_MS
    }

    // ============ DANO AO JOGADOR (escudo vs vida, efeitos distintos) ============
    if (events.enemyHits > 0 && !player.isInvincible() && !state.debugFlags.godMode) {
      state.hitShakeTimer = HIT_SHAKE_DURATION_MS

      // v0.34.0: alguns ataques específicos (laser da ampulheta mega, borda da moldura da
      // sentinela) declaram seu próprio dano "pesado" (events.enemyDamage) — usa o MAIOR entre
      // esse valor e a escalada normal por erro, nunca o menor (não quero a dificuldade por erro
      // "abafar" o ataque especial nem o contrário)
      const result = player.takeDamage(Math.max(state.enemyDamageValue, events.enemyDamage || 1))
      rail.triggerImpactSquash()

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
    // pedido do usuário: não pisca durante o rolamento (giro completo) — o afterimage (ver
    // effects.update, rollActive) já comunica a invencibilidade nessa janela específica
    rail.setShipVisible(
      player.isRollIframeActive() ||
      !player.isInvincible() ||
      Math.floor(player.getInvincibleRemainingMs() / INVINCIBILITY_FLICKER_MS) % 2 === 0,
    )

    if (state.phase === 'goldenArena' || state.phase === 'bossBuildup') {
      state.enemyTimer -= dt * 1000
      if (state.enemyTimer <= 0) {
        if (combat.getEnemyCount() < currentEnemyCap()) {
          // Fragata-Escudo: só arena/all-range, o mecanismo de "flanquear o lado exposto" só
          // faz sentido num espaço onde o jogador pode voar ao redor
          if (Math.random() < FRAGATA_SPAWN_CHANCE) combat.spawnFragata()
          else combat.spawnEnemy()
        }
        state.enemyTimer = randomEnemyInterval() * ARENA_ENEMY_INTERVAL_MULT * (state.isBossCycle ? BOSS_ENEMY_INTERVAL_MULT : 1) * (state.isReviewQuestion ? REVIEW_ENEMY_INTERVAL_MULT : 1)
      }
    } else if (state.phase === 'combat') {
      // pausa maior (8s) num ciclo de chefe, porque além do "vai vir pergunta" tem o aviso de
      // 5s + cutscene do chefe se aproximando; também para tudo enquanto o dourado está a
      // menos de 8s de surgir (mesma regra, "impedindo a geração de inimigos")
      const spawnPauseThreshold = state.isBossCycle ? ARENA_WARNING_STOP_SPAWN_MS : NORMAL_SPAWN_PAUSE_BEFORE_QUESTION_MS
      if (state.cycleTimer > spawnPauseThreshold && state.goldenTimer > ARENA_WARNING_STOP_SPAWN_MS) {
        state.normalSpawnTimer -= dt * 1000
        if (state.normalSpawnTimer <= 0) {
          state.normalSpawnTimer = NORMAL_SPAWN_INTERVAL_MS
          if (Math.random() < TIME_ENEMY_SPAWN_CHANCE) {
            if (Math.random() < TIME_ENEMY_MEGA_CHANCE) combat.spawnTimeEnemyMega()
            else combat.spawnTimeEnemy()
          } else if (Math.random() < MINI_SWARM_CHANCE) {
            combat.spawnMiniSwarm()
          } else if (Math.random() < SENTINELA_SPAWN_CHANCE) {
            combat.spawnSentinela()
          } else if (Math.random() < REPLICA_SPAWN_CHANCE) {
            combat.spawnReplica()
          } else if (Math.random() < VERME_SPAWN_CHANCE) {
            combat.spawnVerme()
          } else if (Math.random() < SUSSURRO_SPAWN_CHANCE) {
            combat.spawnSussurro()
          } else {
            const room = Math.max(0, currentEnemyCap() - combat.getEnemyCount())
            const roll = NORMAL_SPAWN_MIN_COUNT + Math.floor(Math.random() * (NORMAL_SPAWN_MAX_COUNT - NORMAL_SPAWN_MIN_COUNT + 1))
            const count = Math.min(room, roll + state.extraSpawnPerBatch)
            for (let i = 0; i < count; i += 1) combat.spawnEnemy()
          }
        }
      }
    }

    if (state.phase === 'combat') {
      if (!state.isBossCycle && state.cycleTimer > NORMAL_SPAWN_PAUSE_BEFORE_QUESTION_MS) {
        state.bonusTimer -= dt * 1000
        if (state.bonusTimer <= 0) {
          combat.spawnBonusTarget()
          state.bonusTimer = randomBonusInterval()
        }

        state.goldenTimer -= dt * 1000
        if (state.goldenTimer <= 0) startArenaCutscene('golden', enterGoldenArena)
      }

      if (state.phase === 'combat') {
        state.cycleTimer -= dt * 1000
        // aviso de "chefe se aproximando" substitui o contador genérico do ciclo nos últimos 5s
        // (confirmado com o usuário); o do dourado aparece por cima, sem esconder o contador
        const bossWarnActive = state.isBossCycle && state.cycleTimer > 0 && state.cycleTimer <= ARENA_WARNING_COUNTDOWN_MS
        const goldenWarnActive = !state.isBossCycle && state.goldenTimer > 0 && state.goldenTimer <= ARENA_WARNING_COUNTDOWN_MS
        // pedido do usuário: o chefe/dourado já aparece bem distante mas visível assim que o
        // aviso de 5s começa — dispara só na borda (não a cada frame) pra não recriar o mesh
        if (bossWarnActive && !state.arenaPreviewShown) { combat.showArenaPreview('boss'); state.arenaPreviewShown = true }
        else if (goldenWarnActive && !state.arenaPreviewShown) { combat.showArenaPreview('golden'); state.arenaPreviewShown = true }
        if (!bossWarnActive && !goldenWarnActive) state.arenaPreviewShown = false
        // pedido do usuário: segurar o impulso durante o aviso de 5s dobra a velocidade da
        // contagem — indica visualmente que o jogador tá "se aproximando mais rápido" do
        // chefe/dourado (uma segunda passada de decremento por cima da normal, só nessa janela)
        if (player.isPropulsionActive()) {
          if (bossWarnActive) state.cycleTimer = Math.max(0, state.cycleTimer - dt * 1000)
          if (goldenWarnActive) state.goldenTimer = Math.max(0, state.goldenTimer - dt * 1000)
        }
        if (bossWarnActive) {
          hud.setCountdown(null)
          hud.setArenaWarning('boss', Math.max(1, Math.ceil(state.cycleTimer / 1000)))
        } else {
          hud.setCountdown(Math.max(0, Math.ceil(state.cycleTimer / 1000)), state.cycleTimer <= WARNING_MS)
          hud.setArenaWarning(goldenWarnActive ? 'golden' : null, goldenWarnActive ? Math.max(1, Math.ceil(state.goldenTimer / 1000)) : null)
        }
        // v0.32: pergunta abre na hora — sem a fase 'recall' de 3.5s antes do modal
        if (state.cycleTimer <= 0) {
          if (state.isBossCycle) startArenaCutscene('boss', enterBossBuildup)
          else enterAlternatives()
        }
      }
    } else if (state.phase === 'bossBuildup') {
      state.bossBuildupTimer -= dt * 1000
      hud.setCountdown(Math.max(0, Math.ceil(state.bossBuildupTimer / 1000)), state.bossBuildupTimer <= WARNING_MS)
      if (state.bossBuildupTimer <= 0) {
        finishBossHunt()
      } else if (events.bossOrbHit) {
        triggerBossQuestion()
      }
    } else if (state.phase === 'bossBuildupResolution') {
      state.phaseTimer -= dt * 1000
      if (state.phaseTimer <= 0) {
        // bug reportado: o painel de "Acertou!" ficava preso na tela pra sempre depois disso —
        // nem aqui, nem em finishBossHunt()/enterBossFight() ninguém limpava o feedback (os
        // outros fluxos limpam via enterCombat()/resumeCombatFromGolden(), mas a caçada de
        // orbes do chefe volta pra 'bossBuildup' direto, sem passar por nenhum dos dois).
        hud.setFeedback(null)
        const proceed = () => {
          if (state.bossOrbsRemaining > 0 && state.bossBuildupTimer > 0) state.phase = 'bossBuildup'
          else finishBossHunt()
        }
        if (state.pendingCardChoice) enterCardChoice(proceed)
        else proceed()
      }
    } else if (state.phase === 'bossVictory') {
      state.phaseTimer -= dt * 1000
      if (state.phaseTimer <= 0) {
        if (state.pendingCardChoice) enterCardChoice(enterCombat)
        else enterCombat()
      }
    } else if (state.phase === 'goldenArena') {
      // v0.32: duração ilimitada — só sai daqui derrotando o dourado (pedido do usuário),
      // e a explosão dele ganha a mesma cutscene em câmera lenta do chefe antes da transição.
      if (events.goldenSpecialHit) {
        // pedido do usuário: mesmo comportamento do chefe — destrói o resto na hora
        combat.clearOtherEnemies()
        state.deathCutscenePos = (events.goldenHitWorldPos || playerPos).clone()
        state.deathCutsceneOnDone = () => {
          exitGoldenArenaVisuals()
          enterGoldenAlternatives()
        }
        state.phase = 'deathCutscene'
        state.deathCutsceneTimer = DEATH_CUTSCENE_MS
      }
    } else if (state.phase === 'resolution') {
      state.phaseTimer -= dt * 1000
      if (state.phaseTimer <= 0) {
        if (state.pendingSectorOver) {
          endSector()
          return
        }
        if (state.pendingCardChoice) enterCardChoice(enterCombat)
        else enterCombat()
      }
    } else if (state.phase === 'goldenResolution') {
      state.phaseTimer -= dt * 1000
      if (state.phaseTimer <= 0) {
        if (state.pendingCardChoice) enterCardChoice(resumeCombatFromGolden)
        else resumeCombatFromGolden()
      }
    }

    if (state.stopped) return

    hud.setStatus({ health: session.health, maxHealth: player.getMaxHealth(), score: session.score, combo: session.comboMultiplier })
    hud.setLives(session.lives, player.getMaxLives())
    hud.setShield(player.getShieldValue(), player.getShieldMax())

    hud.setLowHealth(player.getLowHealthIntensity(LOW_HEALTH_THRESHOLD_FRAC))

    if (state.phase === 'bossFight') {
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

    if (state.hitShakeTimer > 0) {
      const t = state.hitShakeTimer / HIT_SHAKE_DURATION_MS
      camera.position.x += (Math.random() * 2 - 1) * CAMERA_SHAKE_MAGNITUDE * t
      camera.position.y += (Math.random() * 2 - 1) * CAMERA_SHAKE_MAGNITUDE * t
    }

    renderer.render(scene, camera)
  }

  function forceAnswerOutcome(correct) {
    if (!state.questionResult) return
    const outcome = { type: correct ? 'correct' : 'wrong', card: state.questionResult.card, timeBonus: 1.2, accuracyBonus: 1.2 }
    if (state.phase === 'bossQuestionPause') settleBossBuildupQuestion(outcome)
    else if (state.phase === 'questionPause' && state.pendingQuestionKind === 'golden') settleGoldenBonus(outcome)
    else if (state.phase === 'questionPause' && state.pendingQuestionKind === 'normal') settleQuestion(outcome)
  }

  hud.debug.bind(createDebugActions({
    combat, session, player, rail, effects, hud,
    GOLDEN_SPREAD_MIN, GOLDEN_SPREAD_MAX, DEFLECT_RADIUS,
    debugFlags: state.debugFlags,
    getPhase: () => state.phase,
    resetBossHealthBonus: () => { state.bossHealthBonus = 0 },
    applyHealthLoss, endSector, forceAnswerOutcome,
    startArenaCutscene, enterBossBuildup, finishBossHunt, enterBossFight, enterGoldenArena,
    enterCardChoice, enterCombat,
  }))

  enterCombat()
  hud.setStatus({ health: session.health, maxHealth: player.getMaxHealth(), score: session.score, combo: session.comboMultiplier })
  hud.setLives(session.lives, player.getMaxLives())
  hud.setShield(player.getShieldValue(), player.getShieldMax())
  state.lastTime = performance.now()
  state.rafId = requestAnimationFrame(tick)
}

initMobileSupport()
const { restart } = createGameMenu(mountGame)
restart()
