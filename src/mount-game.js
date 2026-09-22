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
import { getDifficultyLevel } from './enemies/shared.js'
import { createPlayerSystem } from './player.js'
import { createPlayerTelemetry } from './player-telemetry.js'
import { createEffectsSystem } from './effects.js'
import { createInputState } from './input.js'
import { createGameHud } from './hud.js'
import { getSettings } from './settings.js'
import { getBindings } from './keybindings.js'
import { createDebugActions } from './debug-actions.js'
import { aiValidator } from './ai-validator.js'
import { requestGameOrientation, releaseGameOrientation } from './mobile.js'
import { createCutscenesSystem } from './cutscenes.js'
import { createBossFlow } from './flow-boss.js'
import { createQuestionFlow } from './flow-question.js'
import { createProgressionFlow } from './flow-progression.js'
import { createEnvironmentSystem } from './environment.js'
import { createGameLoop } from './game-loop.js'
import { createAudioSystem } from './audio.js'
import {
  GROUND_Y,
  LEVEL_BACKGROUNDS,
  BOSS_EVERY_QUESTIONS, BOSS_CYCLE_MS, BOSS_ENEMY_INTERVAL_MULT, BOSS_NO_DECK_SCORE_INTERVAL,
  CYCLE_MS,
  NORMAL_SPAWN_INTERVAL_MS, REVIEW_ENEMY_INTERVAL_MULT,
  ENEMY_INTERVAL_MIN_BASE, ENEMY_INTERVAL_MAX_BASE, ENEMY_INTERVAL_FLOOR,
  DIFFICULTY_BIAS_INTERVAL_RANGE_MS,
  GOLDEN_SPREAD_MIN, GOLDEN_SPREAD_MAX, DEFLECT_RADIUS,
  ARENA_MAX_SPAWN_DISTANCE, TRACK_MAX_SPAWN_DISTANCE,
} from './main-constants.js'

// Fluxo de menu/baralho/painel de revisão mora em game-menu.js — mountGame recebe `deck` e o
// pacote `menu` ({ sessionResults, renderEndScreen }) de lá, porque endSector() precisa mostrar
// a tela de fim de partida. `session.history` já vem populado por createSession (quiz.js) com
// o mesmo objeto de histórico que game-menu.js persiste, então mountGame nunca precisa de uma
// cópia própria.
export function mountGame(session, deck, menu) {
  const hud = createGameHud()
  // mountGame nasce de uma ação explícita do jogador; aproveitar esse gesto desbloqueia o áudio
  // nos navegadores que bloqueiam reprodução automática até o primeiro clique/tecla.
  const audio = createAudioSystem()
  audio.unlock()
  audio.preloadMappedFiles()
  // suporte mobile: tela cheia + travar em paisagem, best-effort (ver mobile.js) — o aviso de
  // "gire o celular" continua cobrindo o caso onde nenhum dos dois é suportado pelo navegador
  requestGameOrientation()

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000000)
  scene.fog = new THREE.FogExp2(0x000000, 0.0075)

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
  const playerTelemetry = createPlayerTelemetry()
  player.setTelemetry(playerTelemetry)
  const combat = createCombatSystem(scene, rail, effects, enemies, player)
  const input = createInputState()

  const bindings = getBindings()
  const showEnemyHealthBars = getSettings().showEnemyHealthBars

  // Iniciar partida já com companheiros escolhidos no pré-jogo / configurações
  const startingWingmen = menu?.startingWingmen ?? getSettings().startingWingmen ?? 0
  if (startingWingmen > 0) {
    player.setWingmanCount(startingWingmen)
    combat.setWingmanCount(startingWingmen)
  }

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
    debugFlags: { godMode: false, infiniteAmmoActive: false, hitboxesActive: false, slowMoActive: false, disableArena: false, manualStepActive: false, disableAutoSpawn: false },
    // Swirl Blast (§4.5) — cutscene de câmera lenta/FOV no disparo, ver game-loop.js runFrame()
    swirlSlowMoMs: 0,
    swirlFovBumpMs: 0,
    swirlPunchFired: false, // guarda o disparo único do punch de câmera (ver game-loop.js runFrame)
    lastTime: performance.now(),
    rafId: null,
    stopped: false,
    paused: false,
    manualStepActive: false,

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
    hitShakeTimer: 0,
    // Cadeia de abates — "Arcade Neon" (v0.73.0), ver KILL_CHAIN_DECAY_S em game-loop.js
    killChainCount: 0,
    killChainTimer: 0,

    // ============ dificuldade (escalada por erro) ============
    enemyIntervalMin: enemyIntervalMinInit,
    enemyIntervalMax: enemyIntervalMaxInit,
    enemyAggression: 1,
    wrongAnswerCount: 0,
    // Modo sem baralho: session.pointer fica preso em 0 pra sempre (ver flow-question.js,
    // enterAlternatives), então (pointer+1) % BOSS_EVERY_QUESTIONS nunca bate — o chefe usa
    // pontuação acumulada desde o último chefe em vez disso (ver enterCombat/BOSS_NO_DECK_SCORE_INTERVAL).
    bossNoDeckScoreCheckpoint: 0,
    // último nível 1-9 exibido — usado só pra saber quando MOSTRAR o flash de subida (nunca de
    // descida, retrocesso é silencioso por pedido do usuário). O indicador persistente (HUD)
    // sempre mostra o valor atual, independente disso.
    lastDifficultyLevel: 1,
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
    // pedido do usuário: +15% de chance/frequência do evento — intervalo até o próximo storm
    // reduzido em 15% (32-60s → ~27.2-51s). Evento ligado por padrão
    // (ENVIRONMENT_CONFIG.enableDebrisStormEvent = true, ver environment-config.js).
    nextDebrisStormTimer: 27200 + Math.random() * 23800,
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

  // Nível de dificuldade 1-9 por inimigo (distinto do eixo contínuo wrongAnswerCount que
  // applyDifficulty já usa pra spawn rate/agressividade — os dois coexistem). Registrado uma
  // única vez aqui porque só este arquivo tem `state`/`session`/`deck` no mesmo escopo;
  // enemies/index.js chama esse provider internamente em cada spawnX() (ver
  // setDifficultyLevelProvider lá).
  enemies.setDifficultyLevelProvider(() => getDifficultyLevel({
    wrongAnswerCount: state.wrongAnswerCount,
    score: session.score,
    isNoDeck: !!deck?.isNoDeck,
  }))

  // cutscenes (etapa 3): arenaCutscene/deathCutscene extraídas pra cutscenes.js
  // `environment` entrou nas deps só pra decolagem chamar environment.update() (ver
  // cutscenes.js) — sem isso o sistema de skydome/planeta/grid ficava preso no visible=true
  // padrão do three.js durante toda a cutscene, nunca sincronizado com ENVIRONMENT_CONFIG.
  const cutscenes = createCutscenesSystem({ state, camera, renderer, scene, effects, hud, rail, player, environment })

  // fluxo do chefe/dourado (etapa 4): caçada de orbes, invocação, luta, vitória + arena dourada
  // e sua pergunta-bônus + a cutscene de transição compartilhada — tudo extraído pra
  // flow-boss.js.
  const bossFlow = createBossFlow({
    state, session, deck, menu,
    camera, hud, combat, rail, effects, environment,
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
    enterCombat: () => enterCombat(),
  })

  // ============ ENTER-COMBAT (estado inicial de cada ciclo) ============
  function enterCombat() {
    state.phase = 'combat'
    state.isBossCycle = deck?.isNoDeck
      ? (session.score - state.bossNoDeckScoreCheckpoint) >= BOSS_NO_DECK_SCORE_INTERVAL
      : (session.pointer + 1) % BOSS_EVERY_QUESTIONS === 0
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

    // Fog calibrado (Overhaul 4, pilar 1) — recalcula a distância máxima de spawn do contexto
    // que este ciclo vai usar (arena de chefe/dourado tem alcance bem maior que o trilho comum).
    if (environment?.setSpawnDistanceExpectation) {
      const maxSpawnDistance = state.isBossCycle ? ARENA_MAX_SPAWN_DISTANCE : TRACK_MAX_SPAWN_DISTANCE
      environment.setSpawnDistanceExpectation(maxSpawnDistance)
    }
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
    if (window.__starAnki) delete window.__starAnki
    if (window.__stepFrames) delete window.__stepFrames
    if (state.bossFovTimeout) {
      clearTimeout(state.bossFovTimeout)
      state.bossFovTimeout = null
    }
    window.removeEventListener('resize', onResize)
    input.dispose()
    audio.dispose()
    environment.dispose()
    effects.dispose()
    combat.dispose()
    renderer.dispose()
    hud.unmount()
    releaseGameOrientation()
  }

  // ============ MENU DE PAUSA (overhaul v0.80.0, pedido do usuário) ============
  // onResume espelha exatamente o toggle que o game-loop já fazia pro atalho de pausa (P/Esc) —
  // ver isActionPressed(...,'pause') em game-loop.js. onRestart/onExitToMenu reusam o mesmo
  // contrato de endSector() (teardown() da partida atual, depois o próximo passo do menu) — a
  // confirmação "tem certeza?" já aconteceu dentro do próprio overlay (hud-pause.js) antes de
  // qualquer um desses dois ser chamado.
  hud.bindPauseMenu({
    onResume: () => {
      state.paused = false
      hud.setPaused(false)
    },
    onRestart: () => {
      teardown()
      menu.playAgain()
    },
    onExitToMenu: () => {
      teardown()
      menu.restart()
    },
  })

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
    isNoDeck: !!deck?.isNoDeck,
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
    state,
    gameLoop,
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
    aiValidator,
  }))

  // Snapshot plano pro overhaul do painel de debug (v0.68.0) — hud-game.js só chama isso e
  // pinta os valores, sem precisar importar combat/rail/session/enemies (mantém o HUD como
  // camada de apresentação pura, mesmo padrão dos outros métodos do hud que recebem dados
  // já prontos de quem chama).
  hud.debug.setStatsProvider(() => {
    const pos = rail.getPlayerPosition()
    const aliveEnemies = (enemies.getAlive ? enemies.getAlive().length : 0) +
      (enemies.getGoldenAlive ? enemies.getGoldenAlive().length : 0)
    const tele = combat.getWingmanTelemetry ? combat.getWingmanTelemetry() : null
    const wingmenDetail = tele && tele.wingmen && tele.wingmen.length > 0
      ? tele.wingmen.map((w) => `${w.name[0]}:${w.state[0].toUpperCase()}(${w.relativeToPlayer.dist}u,${w.rotation.smoothRollDeg}°)`).join(' ')
      : 'nenhum'
    return {
      phase: state.phase,
      sector: `${(session.pointer || 0) + 1}/${session.queue.length}`,
      health: session.health,
      maxHealth: player.getMaxHealth(),
      shield: player.getShieldValue(),
      maxShield: player.getShieldMax(),
      lives: session.lives,
      maxLives: player.getMaxLives(),
      score: Math.round(session.score),
      combo: session.comboMultiplier,
      enemies: aliveEnemies,
      wingmen: `${combat.getWingmanCount()} [${wingmenDetail}]`,
      position: `${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`,
      flags: state.debugFlags,
    }
  })

  // ============ KICKOFF ============
  enterCombat()
  hud.setStatus({ health: session.health, maxHealth: player.getMaxHealth(), score: session.score, combo: session.comboMultiplier })
  hud.setLives(session.lives, player.getMaxLives())
  hud.setShield(player.getShieldValue(), player.getShieldMax())
  hud.updateCollectedCards(player.getCollectedCards())

  const sectorNum = (session.pointer || 0) + 1
  const deckTitle = deck?.isNoDeck ? 'MODO ARCADE' : (deck?.title || deck?.name || 'ESPACIAL')
  cutscenes.startLaunchCutscene(() => {
    state.phase = 'combat'
  }, {
    sector: `SETOR ${String(sectorNum).padStart(2, '0')} // ${deckTitle.toUpperCase()}`,
    text: deck?.isNoDeck ? 'MODO ARCADE // COMBATE DIRETO' : 'DECOLAGEM AUTORIZADA // BOA SORTE',
    skipText: '[ESPAÇO / TIRO] PULAR DECOLAGEM',
  })

  gameLoop.start()

  // Suporte a testes determinísticos, inspeção de tempo (stepper manual) e telemetria (jogador, esquadrão e inimigos)
  window.__starAnki = {
    state,
    gameLoop,
    combat,
    player,
    enemies,
    rail,
    camera,
    scene,
    step: (frames, dtMs) => gameLoop.step(frames, dtMs),
    setManualStepping: (active) => gameLoop.setManualStepping(active),
    isManualStepping: () => gameLoop.isManualStepping(),

    // Telemetria da Esquadrilha (Aliados)
    getWingmanTelemetry: () => combat.getWingmanTelemetry?.(),
    dumpWingmanTelemetry: () => combat.dumpWingmanTelemetry?.(),
    getWingmanFlightLog: (limit) => combat.getWingmanFlightLog?.(limit),
    copyWingmanFlightLog: () => combat.copyWingmanFlightLog?.(),

    // Telemetria do Jogador
    getPlayerTelemetry: () => combat.getPlayerTelemetry?.(),
    dumpPlayerTelemetry: () => combat.dumpPlayerTelemetry?.(),
    getPlayerFlightLog: (limit) => combat.getPlayerFlightLog?.(limit),
    copyPlayerFlightLog: () => combat.copyPlayerFlightLog?.(),

    // Telemetria dos Inimigos
    getEnemyTelemetry: () => combat.getEnemyTelemetry?.(),
    dumpEnemyTelemetry: () => combat.dumpEnemyTelemetry?.(),
    getEnemyCombatLog: (limit) => combat.getEnemyCombatLog?.(limit),
    copyEnemyCombatLog: () => combat.copyEnemyCombatLog?.(),

    // Telemetria Global Integrada
    getCombatTelemetry: () => combat.getCombatTelemetry?.(),
    dumpCombatTelemetry: () => combat.dumpCombatTelemetry?.(),
  }

  // Atalhos rápidos no escopo global do console
  window.__stepFrames = (frames, dtMs) => gameLoop.step(frames, dtMs)

  window.__getWingmanTelemetry = () => combat.getWingmanTelemetry?.()
  window.__dumpWingmanTelemetry = () => combat.dumpWingmanTelemetry?.()
  window.__wingmanFlightLog = (limit) => combat.getWingmanFlightLog?.(limit)

  window.__getPlayerTelemetry = () => combat.getPlayerTelemetry?.()
  window.__dumpPlayerTelemetry = () => combat.dumpPlayerTelemetry?.()
  window.__playerFlightLog = (limit) => combat.getPlayerFlightLog?.(limit)

  window.__getEnemyTelemetry = () => combat.getEnemyTelemetry?.()
  window.__dumpEnemyTelemetry = () => combat.dumpEnemyTelemetry?.()
  window.__enemyCombatLog = (limit) => combat.getEnemyCombatLog?.(limit)

  window.__getCombatTelemetry = () => combat.getCombatTelemetry?.()
  window.__dumpCombatTelemetry = () => combat.dumpCombatTelemetry?.()
}
