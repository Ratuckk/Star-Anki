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
import { getBindings, isActionPressed } from './keybindings.js'
import { createGameMenu } from './game-menu.js'
import { createDebugActions } from './debug-actions.js'
import { initMobileSupport, requestGameOrientation, releaseGameOrientation } from './mobile.js'
import { createCutscenesSystem } from './cutscenes.js'
import { createBossFlow } from './flow-boss.js'
import { createQuestionFlow } from './flow-question.js'
import { createProgressionFlow } from './flow-progression.js'
import {
  CYCLE_MS, ENEMY_KILL_CYCLE_ADVANCE_MS, WARNING_MS,
  GROUND_Y,
  INVINCIBILITY_FLICKER_MS,
  HIT_SHAKE_DURATION_MS, SHIP_SHAKE_MAGNITUDE, CAMERA_SHAKE_MAGNITUDE, HOMING_KILL_SHAKE_MS,
  LEVEL_BACKGROUNDS,
  RETICLE_AHEAD, RETICLE_OVERSHOOT_FACTOR, RETICLE_SETTLE_RATE,
  BOSS_EVERY_QUESTIONS, BOSS_CYCLE_MS, BOSS_ENEMY_INTERVAL_MULT,
  ENEMY_INTERVAL_MIN_BASE, ENEMY_INTERVAL_MAX_BASE, ENEMY_INTERVAL_FLOOR,
  DIFFICULTY_BIAS_INTERVAL_RANGE_MS,
  ARENA_ENEMY_INTERVAL_MULT,
  NORMAL_SPAWN_INTERVAL_MS, NORMAL_SPAWN_MIN_COUNT, NORMAL_SPAWN_MAX_COUNT,
  NORMAL_SPAWN_PAUSE_BEFORE_QUESTION_MS, MINI_SWARM_CHANCE,
  REVIEW_ENEMY_INTERVAL_MULT,
  GOLDEN_SPREAD_MIN, GOLDEN_SPREAD_MAX,
  TIME_ENEMY_SPAWN_CHANCE, TIME_ENEMY_MEGA_CHANCE, SENTINELA_SPAWN_CHANCE,
  REPLICA_SPAWN_CHANCE, VERME_SPAWN_CHANCE, SUSSURRO_SPAWN_CHANCE, FRAGATA_SPAWN_CHANCE,
  ARENA_WARNING_COUNTDOWN_MS, ARENA_WARNING_STOP_SPAWN_MS,
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
  // Ver comentário detalhado na entrega da etapa 2 — resumo: era ~40 `let` soltos, agora um
  // objeto único compartilhado por referência com os flows extraídos.
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
    goldenTimer: 0, // valor real logo abaixo (progression.randomGoldenInterval)
    goldenCard: null,

    // ============ cutscene de arena (dourado/chefe se aproximando) ============
    arenaCutsceneTimer: 0,
    arenaCutsceneDurationMs: 0, // setado por startArenaCutscene (flow-boss.js) antes de rodar
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
    detritoTimer: 0, // valor real logo abaixo (progression.randomDetritoInterval)
    imaTimer: 0, // valor real logo abaixo (progression.randomImaInterval)
    bonusTimer: 0, // valor real logo abaixo (progression.randomBonusInterval)
  }

  // ============ PROGRESSÃO (etapa 6 do overhaul) ============
  // Extraído pra flow-progression.js: applyDifficulty/applyBossDifficulty/applySpeedProgression,
  // currentEnemyCap/currentBossSpread/currentBossExtraEnemies e os 5 randomizadores de
  // intervalo. Antes eram function declarations hoisted aqui (a "gambiarra" citada no
  // comentário da etapa 4) — os flows recebiam os helpers por deps nomeadas e funcionava só
  // porque declarations são içadas; agora o objeto é explícito e a ordem de criação é linear.
  const progression = createProgressionFlow({ state, rail, combat })

  // inicialização "pós-declaração" dos timers que dependem de funções de progressão (antes
  // era `randomGoldenInterval()` etc., que dependia de hoisting; agora chama explicitamente
  // o objeto já criado — mesma inicialização, sem hoisting implícito).
  state.goldenTimer = progression.randomGoldenInterval()
  state.detritoTimer = progression.randomDetritoInterval()
  state.imaTimer = progression.randomImaInterval()
  state.bonusTimer = progression.randomBonusInterval()

  // cutscenes (etapa 3): arenaCutscene/deathCutscene extraídas pra cutscenes.js
  const cutscenes = createCutscenesSystem({ state, camera, renderer, scene, effects, hud, rail, player })

  // fluxo do chefe/dourado (etapa 4): caçada de orbes, invocação, luta, vitória + arena dourada
  // e sua pergunta-bônus + a cutscene de transição compartilhada — tudo extraído pra
  // flow-boss.js. Helpers de progressão agora vêm de `progression.*` (era a nota de "gambiarra"
  // do comentário da etapa 4; desde a etapa 6 a dependência é explícita).
  const bossFlow = createBossFlow({
    state, session, deck, menu,
    camera, hud, combat, rail,
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
    hud, combat, player,
    applyDifficulty: progression.applyDifficulty,
    applySpeedProgression: progression.applySpeedProgression,
    applyHealthLoss, endSector,
  })

  function currentHomingAllowedTargets(heldMs) {
    const chargeMs = Math.max(0, heldMs - player.config.homingChargeMinMs)
    return Math.max(1, Math.min(player.config.homingMaxTargets, 1 + Math.floor(chargeMs / HOMING_LOCK_INTERVAL_MS)))
  }

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

  function applyHealthLoss() {
    return player.applyHealthLoss()
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
    if (state.phase === 'bossQuestionPause' || state.phase === 'questionPause' || state.phase === 'cardChoice') {
      renderer.render(scene, camera)
      return
    }

    // cutscenes (etapa 3): arenaCutscene e deathCutscene extraídas pra cutscenes.js
    if (cutscenes.updateArenaCutscene(dt)) return
    if (cutscenes.updateDeathCutscene(rawDt)) return

    state.hitShakeTimer = Math.max(0, state.hitShakeTimer - dt * 1000)
    rail.setShakeIntensity(state.hitShakeTimer > 0 ? SHIP_SHAKE_MAGNITUDE * (state.hitShakeTimer / HIT_SHAKE_DURATION_MS) : 0)

    player.update(dt)

    // pedido do usuário: removida a guinada assistida rumo ao inimigo mais próximo (Fase 9)
    rail.update(dt, inputState)
    // CRÍTICO: camera.updateMatrixWorld() — ver comentário no arquivo original
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

    // Fase 8 (VISUAL): mira normal acende quando há um inimigo vivo na frente dela
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

    // v0.34.0: Detrito/Enxame-Ímã com timer próprio — só "tá em combate de verdade" importa
    if (enemiesActive) {
      state.detritoTimer -= dt * 1000
      if (state.detritoTimer <= 0) {
        combat.spawnDetrito()
        state.detritoTimer = progression.randomDetritoInterval()
      }
      state.imaTimer -= dt * 1000
      if (state.imaTimer <= 0) {
        combat.spawnImaSwarm()
        state.imaTimer = progression.randomImaInterval()
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
      skipTrail: player.isRepulsionActive(),
      ramActive,
      rollActive: player.isRollIframeActive(),
    })
    effects.spawnContrailTick(combat.getWingmanPositions(), dt)

    if (events.enemyKillPoints) session.score += events.enemyKillPoints
    if (events.bonusKillPoints) session.score += events.bonusKillPoints
    if (events.timeReductionMs) state.cycleTimer = Math.max(0, state.cycleTimer - events.timeReductionMs)
    if (events.enemyKills > 0) state.cycleTimer = Math.max(0, state.cycleTimer - events.enemyKills * ENEMY_KILL_CYCLE_ADVANCE_MS)

    // cutscene em câmera lenta do chefe explodindo antes de sair da arena — handler extraído
    // pra flow-boss.js. A guarda de fase continua AQUI (era um `if` de topo de tick no
    // original, antes dos branches de fase), preservando a estrutura original.
    if (events.bossDefeated && state.phase === 'bossFight') {
      bossFlow.handleBossDefeated(events.bossHitWorldPos || playerPos)
    }

    // ============ DANO AO JOGADOR (escudo vs vida, efeitos distintos) ============
    if (events.enemyHits > 0 && !player.isInvincible() && !state.debugFlags.godMode) {
      state.hitShakeTimer = HIT_SHAKE_DURATION_MS

      const result = player.takeDamage(Math.max(state.enemyDamageValue, events.enemyDamage || 1))
      rail.triggerImpactSquash()

      if (result.absorbedByShield) {
        hud.showShieldBlock()
        effects.shockwave(playerPos, 0x4da6ff, 0.6)
        effects.explosion(playerPos, 0x4da6ff, 0.5)
        if (result.shieldBroke) effects.glassShatter(playerPos, 0x4da6ff)
      } else {
        hud.showDamageSide()
        hud.damageFlash()
        effects.explosion(playerPos, 0xff4d4d, 0.7)
      }

      if (result.outOfLives) {
        endSector()
        return
      }
    }
    // pedido do usuário: não pisca durante o rolamento (giro completo)
    rail.setShipVisible(
      player.isRollIframeActive() ||
      !player.isInvincible() ||
      Math.floor(player.getInvincibleRemainingMs() / INVINCIBILITY_FLICKER_MS) % 2 === 0,
    )

    if (state.phase === 'goldenArena' || state.phase === 'bossBuildup') {
      state.enemyTimer -= dt * 1000
      if (state.enemyTimer <= 0) {
        if (combat.getEnemyCount() < progression.currentEnemyCap()) {
          if (Math.random() < FRAGATA_SPAWN_CHANCE) combat.spawnFragata()
          else combat.spawnEnemy()
        }
        state.enemyTimer = progression.randomEnemyInterval() * ARENA_ENEMY_INTERVAL_MULT * (state.isBossCycle ? BOSS_ENEMY_INTERVAL_MULT : 1) * (state.isReviewQuestion ? REVIEW_ENEMY_INTERVAL_MULT : 1)
      }
    } else if (state.phase === 'combat') {
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
            const room = Math.max(0, progression.currentEnemyCap() - combat.getEnemyCount())
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
          state.bonusTimer = progression.randomBonusInterval()
        }

        state.goldenTimer -= dt * 1000
        if (state.goldenTimer <= 0) bossFlow.startArenaCutscene('golden', bossFlow.enterGoldenArena)
      }

      if (state.phase === 'combat') {
        state.cycleTimer -= dt * 1000
        const bossWarnActive = state.isBossCycle && state.cycleTimer > 0 && state.cycleTimer <= ARENA_WARNING_COUNTDOWN_MS
        const goldenWarnActive = !state.isBossCycle && state.goldenTimer > 0 && state.goldenTimer <= ARENA_WARNING_COUNTDOWN_MS
        if (bossWarnActive && !state.arenaPreviewShown) { combat.showArenaPreview('boss'); state.arenaPreviewShown = true }
        else if (goldenWarnActive && !state.arenaPreviewShown) { combat.showArenaPreview('golden'); state.arenaPreviewShown = true }
        if (!bossWarnActive && !goldenWarnActive) state.arenaPreviewShown = false
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
          if (state.isBossCycle) bossFlow.startArenaCutscene('boss', bossFlow.enterBossBuildup)
          else questionFlow.enterAlternatives()
        }
      }
    } else if (state.phase === 'bossBuildup') {
      state.bossBuildupTimer -= dt * 1000
      hud.setCountdown(Math.max(0, Math.ceil(state.bossBuildupTimer / 1000)), state.bossBuildupTimer <= WARNING_MS)
      if (state.bossBuildupTimer <= 0) {
        bossFlow.finishBossHunt()
      } else if (events.bossOrbHit) {
        bossFlow.triggerBossQuestion()
      }
    } else if (state.phase === 'bossBuildupResolution') {
      state.phaseTimer -= dt * 1000
      if (state.phaseTimer <= 0) {
        // bug reportado: o painel de "Acertou!" ficava preso na tela pra sempre depois disso —
        // nem aqui, nem em finishBossHunt()/enterBossFight() ninguém limpava o feedback.
        hud.setFeedback(null)
        const proceed = () => {
          if (state.bossOrbsRemaining > 0 && state.bossBuildupTimer > 0) state.phase = 'bossBuildup'
          else bossFlow.finishBossHunt()
        }
        if (state.pendingCardChoice) questionFlow.enterCardChoice(proceed)
        else proceed()
      }
    } else if (state.phase === 'bossVictory') {
      state.phaseTimer -= dt * 1000
      if (state.phaseTimer <= 0) {
        if (state.pendingCardChoice) questionFlow.enterCardChoice(enterCombat)
        else enterCombat()
      }
    } else if (state.phase === 'goldenArena') {
      // v0.32: duração ilimitada — só sai daqui derrotando o dourado (pedido do usuário).
      // O handler (handleGoldenDefeated) NÃO checa fase internamente — o branch já é a guarda.
      if (events.goldenSpecialHit) {
        bossFlow.handleGoldenDefeated(events.goldenHitWorldPos || playerPos)
      }
    } else if (state.phase === 'resolution') {
      state.phaseTimer -= dt * 1000
      if (state.phaseTimer <= 0) {
        if (state.pendingSectorOver) {
          endSector()
          return
        }
        if (state.pendingCardChoice) questionFlow.enterCardChoice(enterCombat)
        else enterCombat()
      }
    } else if (state.phase === 'goldenResolution') {
      state.phaseTimer -= dt * 1000
      if (state.phaseTimer <= 0) {
        if (state.pendingCardChoice) questionFlow.enterCardChoice(bossFlow.resumeCombatFromGolden)
        else bossFlow.resumeCombatFromGolden()
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
    if (state.phase === 'bossQuestionPause') bossFlow.settleBossBuildupQuestion(outcome)
    else if (state.phase === 'questionPause' && state.pendingQuestionKind === 'golden') bossFlow.settleGoldenBonus(outcome)
    else if (state.phase === 'questionPause' && state.pendingQuestionKind === 'normal') questionFlow.settleQuestion(outcome)
  }

  hud.debug.bind(createDebugActions({
    combat, session, player, rail, effects, hud,
    GOLDEN_SPREAD_MIN, GOLDEN_SPREAD_MAX, DEFLECT_RADIUS,
    debugFlags: state.debugFlags,
    getPhase: () => state.phase,
    resetBossHealthBonus: () => { state.bossHealthBonus = 0 },
    applyHealthLoss, endSector, forceAnswerOutcome,
    startArenaCutscene: bossFlow.startArenaCutscene,
    enterBossBuildup: bossFlow.enterBossBuildup,
    finishBossHunt: bossFlow.finishBossHunt,
    enterBossFight: bossFlow.enterBossFight,
    enterGoldenArena: bossFlow.enterGoldenArena,
    enterCardChoice: questionFlow.enterCardChoice, enterCombat,
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
