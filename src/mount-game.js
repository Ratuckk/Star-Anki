// mount-game.js
//
// Etapa 7b do overhaul de organização do main.js. Extrai o mountGame inteiro pra arquivo
// próprio — depois das etapas 1-6 (constants, state, cutscenes, flows de boss/pergunta/
// progressão) e da etapa 7a (game-loop), o que sobrou no main.js era isso: setup do cenário
// (scene/camera/renderer/luzes/grid), construção dos sistemas de jogo, criação do `state` e
// dos 4 flows, enterCombat/teardown/onResize, forceAnswerOutcome, o bind do debug — e a
// chamada final pro gameLoop.start().
//
// main.js vira bootstrap puro (5 linhas). Este arquivo é o "setup + glue" — quem quiser mexer
// no loop em si vai pro game-loop.js; quem quiser mexer no fluxo de pergunta vai pro
// flow-question.js; e assim por diante. Zero mudança de comportamento.

import * as THREE from 'three'
import { getSummary, computeDifficultyBias } from './quiz.js'
import { createRailController } from './rail.js'
import { createCombatSystem } from './combat/index.js'
import { createEnemiesSystem } from './enemies/index.js'
import { createPlayerSystem } from './player.js'
import { createEffectsSystem } from './effects.js'
import { createInputState } from './input.js'
import { createGameHud } from './hud.js'
import { getSettings } from './settings.js'
import { getBindings } from './keybindings.js'
import { createDebugActions } from './debug-actions.js'
import { requestGameOrientation, releaseGameOrientation } from './mobile.js'
import { createCutscenesSystem } from './cutscenes.js'
import { createBossFlow } from './flow-boss.js'
import { createQuestionFlow } from './flow-question.js'
import { createProgressionFlow } from './flow-progression.js'
import { createEnvironmentSystem } from './environment.js'
import { createGameLoop } from './game-loop.js'
import {
  GROUND_Y,
  LEVEL_BACKGROUNDS,
  BOSS_EVERY_QUESTIONS, BOSS_CYCLE_MS, BOSS_ENEMY_INTERVAL_MULT,
  CYCLE_MS,
  NORMAL_SPAWN_INTERVAL_MS, REVIEW_ENEMY_INTERVAL_MULT,
  ENEMY_INTERVAL_MIN_BASE, ENEMY_INTERVAL_MAX_BASE, ENEMY_INTERVAL_FLOOR,
  DIFFICULTY_BIAS_INTERVAL_RANGE_MS,
  GOLDEN_SPREAD_MIN, GOLDEN_SPREAD_MAX, DEFLECT_RADIUS,
} from './main-constants.js'

// Fluxo de menu/baralho/painel de revisão mora em game-menu.js — mountGame recebe `deck` e o
// pacote `menu` ({ sessionResults, renderEndScreen }) de lá, porque endSector() precisa mostrar
// a tela de fim de partida. `session.history` já vem populado por createSession (quiz.js) com
// o mesmo objeto de histórico que game-menu.js persiste, então mountGame nunca precisa de uma
// cópia própria.
export function mountGame(session, deck, menu) {
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
  const environment = createEnvironmentSystem(scene, camera, rail, { grid, sun })
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
  // Ver comentário detalhado na entrega da etapa 2 — resumo: era ~40 `let` soltos, agora um
  // objeto único compartilhado por referência com os flows extraídos.
  const state = {
    // ============ loop / debug ============
    debugVisible: false,
    debugFlags: { godMode: false, infiniteAmmoActive: false, hitboxesActive: false, slowMoActive: false, disableArena: false },
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
    bossFovTimeout: null,

    // ============ dourado ============
    goldenTimer: 0, // valor real logo abaixo (progression.randomGoldenInterval)
    goldenCard: null,

    // ============ cutscenes (decolagem / arena / morte) ============
    launchCutsceneTimer: 0,
    launchCutsceneDurationMs: 0,
    launchCutsceneOnDone: null,
    launchIgnited: false,

    arenaCutsceneTimer: 0,
    arenaCutsceneDurationMs: 0, // setado por startArenaCutscene (flow-boss.js) antes de rodar
    arenaCutsceneOnDone: null,
    arenaCutsceneBaseCameraPos: null,
    arenaCutsceneBaseForward: null,
    arenaCutsceneBaseRight: null,
    arenaPreviewShown: false,
    arenaCutsceneKind: null,
    arenaCutsceneUiInitialized: false,

    deathCutsceneTimer: 0,
    deathCutsceneDurationMs: 0,
    deathCutscenePos: null,
    deathCutsceneKind: null,
    deathCutsceneOnDone: null,
    deathWhiteoutTriggered: false,
    secondaryExplosionTimer: 0,

    // ============ input / timing / feedback visual ============
    fireHeldMs: 0,
    chargeMaxSignaled: false,
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
    detritoTimer: 0, // valor real logo abaixo (progression.randomDetritoInterval)
    imaTimer: 0, // valor real logo abaixo (progression.randomImaInterval)
    bonusTimer: 0, // valor real logo abaixo (progression.randomBonusInterval)
    // ============ evento de tempestade/chuva de detritos (v0.57.0) ============
    debrisStormActive: false,
    debrisStormTimer: 0,
    debrisStormSpawnTimer: 0,
    nextDebrisStormTimer: 32000 + Math.random() * 28000,
  }

  // ============ PROGRESSÃO (etapa 6 do overhaul) ============
  // Extraído pra flow-progression.js: applyDifficulty/applyBossDifficulty/applySpeedProgression,
  // currentEnemyCap/currentBossSpread/currentBossExtraEnemies e os 5 randomizadores de
  // intervalo.
  const progression = createProgressionFlow({ state, rail, combat, hud, player })

  // inicialização dos timers que dependem de funções de progressão
  state.goldenTimer = progression.randomGoldenInterval()
  state.detritoTimer = progression.randomDetritoInterval()
  state.imaTimer = progression.randomImaInterval()
  state.bonusTimer = progression.randomBonusInterval()

  // cutscenes (etapa 3): arenaCutscene/deathCutscene extraídas pra cutscenes.js
  const cutscenes = createCutscenesSystem({ state, camera, renderer, scene, effects, hud, rail, player })

  // fluxo do chefe/dourado (etapa 4): caçada de orbes, invocação, luta, vitória + arena dourada
  // e sua pergunta-bônus + a cutscene de transição compartilhada — tudo extraído pra
  // flow-boss.js.
  const bossFlow = createBossFlow({
    state, session, deck, menu,
    camera, hud, combat, rail, effects,
    applyDifficulty: progression.applyDifficulty,
    applyBossDifficulty: progression.applyBossDifficulty,
    applySpeedProgression: progression.applySpeedProgression,
    currentBossSpread: progression.currentBossSpread,
    currentBossExtraEnemies: progression.currentBossExtraEnemies,
    randomGoldenInterval: progression.randomGoldenInterval,
    applyHealthLoss, endSector,
  })

  // fluxo da pergunta normal + cartas roguelike (etapa 5): extraído pra flow-question.js.
  // forceAnswerOutcome (que roteia entre os dois flows) continua morando aqui, porque só aqui
  // os dois lados são visíveis juntos.
  const questionFlow = createQuestionFlow({
    state, session, deck, menu,
    hud, combat, player, effects, rail,
    applyDifficulty: progression.applyDifficulty,
    applySpeedProgression: progression.applySpeedProgression,
    applyHealthLoss, endSector,
  })

  // ============ ENTER-COMBAT (estado inicial de cada ciclo) ============
  function enterCombat() {
    state.phase = 'combat'
    state.isBossCycle = (session.pointer + 1) % BOSS_EVERY_QUESTIONS === 0
    state.isReviewQuestion = (session.history[session.queue[session.pointer].guid]?.erros ?? 0) > 0
    state.cycleTimer = state.isBossCycle ? BOSS_CYCLE_MS : CYCLE_MS
    state.enemyTimer = progression.randomEnemyInterval() * (state.isBossCycle ? BOSS_ENEMY_INTERVAL_MULT : 1) * (state.isReviewQuestion ? REVIEW_ENEMY_INTERVAL_MULT : 1)
    state.normalSpawnTimer = NORMAL_SPAWN_INTERVAL_MS
    state.bonusTimer = progression.randomBonusInterval()
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

  // ============ WRAPPERS FINOS (usados pelos flows e pelo tick) ============
  function applyHealthLoss() {
    return player.applyHealthLoss()
  }

  function endSector() {
    teardown()
    menu.renderEndScreen(getSummary(session))
  }

  // ============ RESIZE / TEARDOWN ============
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener('resize', onResize)

  function teardown() {
    // gameLoop.stop() cobre state.stopped = true + cancelAnimationFrame(state.rafId) — antes
    // essas duas linhas ficavam aqui; agora o game-loop.js é dono do ciclo de vida do RAF.
    gameLoop.stop()
    if (state.bossFovTimeout) {
      clearTimeout(state.bossFovTimeout)
      state.bossFovTimeout = null
    }
    window.removeEventListener('resize', onResize)
    input.dispose()
    environment.dispose()
    effects.dispose()
    combat.dispose()
    renderer.dispose()
    hud.unmount()
    releaseGameOrientation()
  }

  // ============ GAME LOOP (etapa 7a) ============
  // Extraído pra game-loop.js. Depois de criado, o loop é o único ponto que lê `state` a cada
  // frame — recebe tudo que precisa por referência. `currentHomingAllowedTargets` migrou pra
  // dentro do loop (só ele usava).
  const gameLoop = createGameLoop({
    state, session, bindings, showEnemyHealthBars,
    hud, scene, camera, renderer, rail, effects, player, combat, input,
    progression, cutscenes, bossFlow, questionFlow,
    environment,
    enterCombat, applyHealthLoss, endSector,
  })

  // ============ FORCE-ANSWER-OUTCOME (debug) ============
  // Ponto único que roteia pros 3 fluxos de pergunta (chefe / dourado / normal) — fica aqui
  // porque só aqui os dois flows são visíveis juntos.
  function forceAnswerOutcome(correct) {
    if (!state.questionResult) return
    const outcome = { type: correct ? 'correct' : 'wrong', card: state.questionResult.card, timeBonus: 1.2, accuracyBonus: 1.2 }
    if (state.phase === 'bossQuestionPause') bossFlow.settleBossBuildupQuestion(outcome)
    else if (state.phase === 'questionPause' && state.pendingQuestionKind === 'golden') bossFlow.settleGoldenBonus(outcome)
    else if (state.phase === 'questionPause' && state.pendingQuestionKind === 'normal') questionFlow.settleQuestion(outcome)
  }

  // ============ CONTROLE DE SETOR / ARENA (debug) ============
  function restartSector() {
    rail.exitArena()
    combat.clearAllCombatants()
    hud.setBossFight(false)
    hud.setBossTint(false)
    hud.setGoldenActive(false)
    hud.setMinimap(false)
    hud.setHorizon(null)
    enterCombat()
  }

  function nextSector() {
    session.pointer = (session.pointer + 1) % session.queue.length
    rail.exitArena()
    combat.clearAllCombatants()
    hud.setBossFight(false)
    hud.setBossTint(false)
    hud.setGoldenActive(false)
    hud.setMinimap(false)
    hud.setHorizon(null)
    enterCombat()
  }

  function prevSector() {
    session.pointer = (session.pointer - 1 + session.queue.length) % session.queue.length
    rail.exitArena()
    combat.clearAllCombatants()
    hud.setBossFight(false)
    hud.setBossTint(false)
    hud.setGoldenActive(false)
    hud.setMinimap(false)
    hud.setHorizon(null)
    enterCombat()
  }

  function exitArenaNow() {
    rail.exitArena()
    combat.clearAllCombatants()
    hud.setBossFight(false)
    hud.setBossTint(false)
    hud.setGoldenActive(false)
    hud.setMinimap(false)
    hud.setHorizon(null)
    enterCombat()
  }

  // ============ DEBUG PANEL ============
  hud.debug.bind(createDebugActions({
    combat, session, player, rail, effects, hud, enemies,
    environment,
    GOLDEN_SPREAD_MIN, GOLDEN_SPREAD_MAX, DEFLECT_RADIUS,
    debugFlags: state.debugFlags,
    triggerDebrisStorm: (dur) => state.triggerDebrisStorm?.(dur),
    getPhase: () => state.phase,
    resetBossHealthBonus: () => { state.bossHealthBonus = 0 },
    applyHealthLoss, endSector, forceAnswerOutcome,
    startArenaCutscene: bossFlow.startArenaCutscene,
    enterBossBuildup: bossFlow.enterBossBuildup,
    finishBossHunt: bossFlow.finishBossHunt,
    enterBossFight: bossFlow.enterBossFight,
    enterGoldenArena: bossFlow.enterGoldenArena,
    enterCardChoice: questionFlow.enterCardChoice, enterCombat,
    restartSector, nextSector, prevSector, exitArenaNow,
  }))

  // ============ KICKOFF ============
  enterCombat()
  hud.setStatus({ health: session.health, maxHealth: player.getMaxHealth(), score: session.score, combo: session.comboMultiplier })
  hud.setLives(session.lives, player.getMaxLives())
  hud.setShield(player.getShieldValue(), player.getShieldMax())
  hud.updateCollectedCards(player.getCollectedCards())

  const sectorNum = (session.pointer || 0) + 1
  const deckTitle = deck?.title || deck?.name || 'ESPACIAL'
  cutscenes.startLaunchCutscene(() => {
    state.phase = 'combat'
  }, {
    sector: `SETOR ${String(sectorNum).padStart(2, '0')} // ${deckTitle.toUpperCase()}`,
    text: 'DECOLAGEM AUTORIZADA // BOA SORTE',
    skipText: '[ESPAÇO / TIRO] PULAR DECOLAGEM',
  })

  gameLoop.start()
}
