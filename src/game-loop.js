// game-loop.js
//
// Etapa 7a do overhaul de organização do main.js. Extrai o tick() do jogo — o loop principal
// que orquestra input → pause/debug → cutscenes → player → rail → tiro → events → HUD sync →
// render. Depois das etapas 1-6 (constants, state object, cutscenes, flows de boss/pergunta/
// progressão), o tick() era o último bloco grande com lógica real fora do main.js. Este passo
// tira ele pra cá, junto do único helper que só ele usava (currentHomingAllowedTargets),
// pra deixar o main.js como bootstrap puro (etapa 7b: mount-game.js).
//
// Padrão (mesmo dos outros flows): recebe `state` + deps por referência, mexe direto, e
// devolve `{ start, stop }` — `start` agenda o primeiro RAF (e reseta state.lastTime pro
// primeiro dt não sair gigante), `stop` cancela o RAF pendente. `teardown` do mount-game chama
// `stop()`; o resto do teardown (dispose dos sistemas, unmount do HUD, orientação) continua
// no mount-game, onde os sistemas nascem.

import * as THREE from 'three'
import { isActionPressed } from './keybindings.js'
import { ENVIRONMENT_CONFIG } from './environment-config.js'
import { HOMING_MAX_TARGETS_CAP } from './player.js'
import {
  ENEMY_KILL_CYCLE_ADVANCE_MS, WARNING_MS,
  INVINCIBILITY_FLICKER_MS,
  HIT_SHAKE_DURATION_MS, SHIP_SHAKE_MAGNITUDE, CAMERA_SHAKE_MAGNITUDE, HOMING_KILL_SHAKE_MS,
  RETICLE_AHEAD, RETICLE_OVERSHOOT_FACTOR, RETICLE_SETTLE_RATE,
  ARENA_ENEMY_INTERVAL_MULT,
  NORMAL_SPAWN_INTERVAL_MS, NORMAL_SPAWN_MIN_COUNT, NORMAL_SPAWN_MAX_COUNT,
  NORMAL_SPAWN_PAUSE_BEFORE_QUESTION_MS, MINI_SWARM_CHANCE,
  REVIEW_ENEMY_INTERVAL_MULT,
  TIME_ENEMY_SPAWN_CHANCE, TIME_ENEMY_MEGA_CHANCE, SENTINELA_SPAWN_CHANCE,
  REPLICA_SPAWN_CHANCE, VERME_SPAWN_CHANCE, SUSSURRO_SPAWN_CHANCE, FRAGATA_SPAWN_CHANCE,
  ARENA_WARNING_COUNTDOWN_MS, ARENA_WARNING_STOP_SPAWN_MS,
  HOMING_LOCK_INTERVAL_MS, DODGE_TAP_WINDOW_MS, DEFLECT_RADIUS, RAM_DAMAGE,
  LOW_HEALTH_THRESHOLD_FRAC,
  BOSS_ENEMY_INTERVAL_MULT,
  LEVEL_BACKGROUNDS,
} from './main-constants.js'

// Temporários reutilizáveis para interpolação da neblina cósmica (evita 21.600 alocações/min no GC)
const _cosmicTint1 = new THREE.Color(0x0c1626) // azul-petróleo
const _cosmicTint2 = new THREE.Color(0x190d24) // roxo estelar
const _cosmicTint3 = new THREE.Color(0x0a1f18) // verde-abissal
const _baseColor = new THREE.Color()
const _blendedShift = new THREE.Color()
const _finalColor = new THREE.Color()

export function createGameLoop(deps) {
  const {
    state, session, bindings, showEnemyHealthBars,
    hud, scene, camera, renderer, rail, effects, player, combat, input,
    progression, cutscenes, bossFlow, questionFlow,
    environment,
    enterCombat, applyHealthLoss, endSector,
  } = deps

  function triggerDebrisStorm(durationMs = 15000) {
    if (!ENVIRONMENT_CONFIG.enableDebrisStormEvent) return
    state.debrisStormActive = true
    state.debrisStormTimer = durationMs
    state.debrisStormSpawnTimer = 300 // primeiro spawn rápido
    if (hud?.showDebrisStormNotice) {
      hud.showDebrisStormNotice({
        active: true,
        title: 'TEMPESTADE DE DETRITOS DETECTADA',
        sub: 'CAMPO DENSO DE ASTEROIDES // MANOBRAS EVASIVAS',
      })
    }
  }
  state.triggerDebrisStorm = triggerDebrisStorm

  // tiro carregado: quantos alvos podem estar travados NESTE instante do carregamento — 1 no
  // início, +1 progressivo conforme a carga avança até o ápice (escala proporcionalmente
  // quando a carta 'faster-charge' acelera a carga, acelerando também os locks de alvos)
  function currentHomingAllowedTargets(heldMs) {
    const chargeMs = Math.max(0, heldMs - player.config.homingChargeMinMs)
    const windowMs = Math.max(250, player.config.homingChargeMaxMs - player.config.homingChargeMinMs)
    // Phantom (Carga Compartilhada): +1 alvo de trava enquanto acoplado, empilhando com a carta
    // 'more-homing-targets' sem passar do teto global — recalcula o passo de trava (lockStep) em
    // cima do teto efetivo pra o alvo extra ficar de fato alcançável dentro da mesma janela de
    // carga, não só um número de fachada que nunca é atingido.
    const assistExtra = combat.getAssistExtraTargets ? combat.getAssistExtraTargets() : 0
    const effectiveMax = Math.min(HOMING_MAX_TARGETS_CAP, (player.config.homingMaxTargets || 4) + assistExtra)
    const maxAdditionalTargets = Math.max(1, effectiveMax - 1)
    const lockStep = Math.max(100, windowMs / maxAdditionalTargets)
    return Math.max(1, Math.min(effectiveMax, 1 + Math.floor(chargeMs / lockStep)))
  }

  function runFrame(now, forcedRawDt) {
    if (state.stopped) return
    const rawDt = forcedRawDt != null ? forcedRawDt : Math.min((now - state.lastTime) / 1000, 0.1)
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

    // ============ PAUSA TOTAL: PERGUNTA (CHEFE/NORMAL/DOURADO) OU CARTA ROGUELIKE OU PAUSA DE ERRO ============
    if (state.phase === 'wrongPause') {
      state.phaseTimer -= rawDt * 1000
      const skipPressed = isActionPressed(bindings, inputState.pressed, 'skipErrorFeedback') ||
        inputState.pressed?.has('Space') ||
        inputState.pressed?.has('Enter') ||
        inputState.pressed?.has('KeyX')
      if (skipPressed || state.phaseTimer <= 0) {
        hud.hideErrorFloat()
        enterCombat()
      } else {
        renderer.render(scene, camera)
        return
      }
    }

    if (state.phase === 'bossQuestionPause' || state.phase === 'questionPause' || state.phase === 'cardChoice') {
      renderer.render(scene, camera)
      return
    }

    // cutscenes: launchCutscene, arenaCutscene e deathCutscene
    if (cutscenes.updateLaunchCutscene(rawDt, inputState)) return
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
      // Phantom (Carga Compartilhada): quando acoplado ao jogador, acelera o carregamento do
      // tiro teleguiado. Lê o estado do frame ANTERIOR (squadron.update ainda não rodou neste
      // frame) — defasagem de ~16ms, imperceptível e sem dependência circular.
      const assistMult = combat.getAssistChargeMult ? combat.getAssistChargeMult() : 1
      state.fireHeldMs += dt * 1000 * assistMult
      if (isCharging) {
        const atMax = state.fireHeldMs >= player.config.homingChargeMaxMs
        if (atMax && !state.chargeMaxSignaled) {
          state.chargeMaxSignaled = true
          if (effects && effects.maxChargeReady) {
            effects.maxChargeReady(nosePos, fireDirection)
          }
        }
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
        state.chargeMaxSignaled = false
      }
    } else {
      state.chargeMaxSignaled = false
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
        if (effects && effects.lateralDashVFX) {
          effects.lateralDashVFX(playerPos, noseFrame.right, inputState.bank)
        }
      } else if (player.activatePropulsion()) {
        effects.propulsionBurst(playerPos, noseFrame.forward)
      }
    }
    if (isActionPressed(bindings, inputState.pressed, 'repulsion')) {
      if (arenaNow && inputState.moveY === -1) {
        rail.triggerArenaSummersault()
        if (effects && effects.summersaultVFX) {
          effects.summersaultVFX(playerPos, noseFrame.forward)
        }
      } else if (arenaNow && nowMs - state.lastRepulsionTapAt <= DODGE_TAP_WINDOW_MS) {
        // 2º toque rápido (sem Baixo) — freio de emergência em vez de outra repulsão normal
        rail.triggerEmergencyBrake()
        if (effects && effects.emergencyBrakeVFX) {
          effects.emergencyBrakeVFX(playerPos, noseFrame.forward, noseFrame.right)
        }
        state.lastRepulsionTapAt = -Infinity
      } else {
        player.activateRepulsion()
        state.lastRepulsionTapAt = nowMs
      }
    }

    if (isActionPressed(bindings, inputState.pressed, 'squadronCommand')) {
      const res = combat.toggleSquadronCommand(playerPos)
      if (res && hud && hud.showSquadronNotice) {
        const shipAbove = playerPos.clone().addScaledVector(noseFrame.up, 3.2)
        const ndcAbove = shipAbove.project(camera)
        const xFrac = THREE.MathUtils.clamp((ndcAbove.x + 1) / 2, 0.05, 0.95)
        const yFrac = THREE.MathUtils.clamp((1 - ndcAbove.y) / 2, 0.05, 0.95)
        hud.showSquadronNotice({
          mode: res.mode,
          targetCount: res.targetCount,
          hasLocked: res.hasLocked,
          xFrac,
          yFrac,
        })
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
        // Pedido do usuário: taxa de detritos moderada (1 a 2, raramente 3) para permitir navegação limpa
        const inArena = rail.isArena()
        const roll = Math.random()
        let count = 1
        if (inArena) {
          if (roll < 0.20) count = 3
          else if (roll < 0.60) count = 2
          else count = 1
        } else {
          if (roll < 0.15) count = 3
          else if (roll < 0.50) count = 2
          else count = 1
        }
        combat.spawnDetrito(count)
        state.detritoTimer = (inArena
          ? progression.randomDetritoInterval() * 0.9
          : progression.randomDetritoInterval()) * 1.3
      }
      state.imaTimer -= dt * 1000
      if (state.imaTimer <= 0) {
        combat.spawnImaSwarm()
        state.imaTimer = progression.randomImaInterval()
      }

      // ============ EVENTO: TEMPESTADE / CHUVA INTENSA DE DETRITOS (v0.57.0) ============
      if (ENVIRONMENT_CONFIG.enableDebrisStormEvent) {
        if (!state.debrisStormActive) {
          state.nextDebrisStormTimer -= dt * 1000
          if (state.nextDebrisStormTimer <= 0) {
            triggerDebrisStorm(15000)
          }
        } else {
          state.debrisStormTimer -= dt * 1000
          state.debrisStormSpawnTimer -= dt * 1000

          // Durante a tempestade, spawna levas rápidas a cada 0.8s a 1.25s
          if (state.debrisStormSpawnTimer <= 0) {
            state.debrisStormSpawnTimer = 1100 + Math.random() * 500
            const stormCount = Math.floor(Math.random() * 2) + 2 // 2 a 3 por salva
            combat.spawnDetrito(stormCount, { drift: true })

            // 20% de chance de surgir um detrito TITÂNICO colossal (respeitando limite de 2)
            if (Math.random() < 0.20) {
              combat.spawnTitanicDetrito({ drift: true })
            }
          }

          if (state.debrisStormTimer <= 0) {
            state.debrisStormActive = false
            state.nextDebrisStormTimer = 55000 + Math.random() * 35000 // próxima em 55-90s
            if (hud?.showDebrisStormNotice) {
              hud.showDebrisStormNotice({
                active: false,
                cleared: true,
                title: 'CAMPO DE DETRITOS SUPERADO',
                sub: 'TURBULÊNCIA CESSADA // ROTA LIVRE',
              })
            }
          }
        }
      } else if (state.debrisStormActive) {
        state.debrisStormActive = false
      }
    }

    const shipHitboxPoints = rail.getShipHitboxPoints ? rail.getShipHitboxPoints() : null
    const events = combat.update(dt, playerPos, {
      enemiesActive,
      aimDirection: fireDirection,
      ramDamage: ramActive ? RAM_DAMAGE : 0,
      allowBossOrbHit: state.phase === 'bossBuildup',
      boostActive: boostOn,
      shipHitboxPoints,
      homingCharging: isCharging,
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

    // ============ SQUAD WIPE & FRENESI DE FOCO ============
    if (events.squadWipe && hud.showCombatEventBanner) {
      hud.showCombatEventBanner('SQUAD WIPE!', `+${events.squadWipeBonus || 150} PTS // ELIMINAÇÃO TOTAL`, 'squad-wipe')
    }
    if (events.focusFrenzyActivated && hud.showCombatEventBanner) {
      hud.showCombatEventBanner('FRENESI DE FOCO!', 'DISPARO TRIPLO ACELERADO (5S)', 'frenzy')
    }

    const ndc = reticleWorldPos.project(camera)
    hud.setReticlePosition(
      THREE.MathUtils.clamp((ndc.x + 1) / 2, 0, 1),
      THREE.MathUtils.clamp((1 - ndc.y) / 2, 0, 1),
    )

    if (hud.updateSquadronNoticePosition) {
      const shipAbove = playerPos.clone().addScaledVector(noseFrame.up, 3.2)
      const ndcAbove = shipAbove.project(camera)
      hud.updateSquadronNoticePosition(
        THREE.MathUtils.clamp((ndcAbove.x + 1) / 2, 0.05, 0.95),
        THREE.MathUtils.clamp((1 - ndcAbove.y) / 2, 0.05, 0.95),
      )
    }

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
      repulsionActive: player.isRepulsionActive(),
      shipRight: noseFrame.right,
      skipTrail: player.isRepulsionActive(),
      ramActive,
      rollActive: player.isRollIframeActive(),
    })
    effects.spawnContrailTick(combat.getWingmanPositions(), dt)

    if (environment) {
      environment.update(dt, playerPos, {
        boostActive: player.isPropulsionActive(),
      })
    }

    // ============ FUNDO PRETO CLÁSSICO E NEBLINA CÓSMICA ============
    if (scene.fog && state.phase === 'combat' && !rail.isArena()) {
      scene.fog.color.set(0x000000)
      scene.background.set(0x000000)
    }

    if (events.enemyKillPoints) session.score += events.enemyKillPoints
    if (events.bonusKillPoints) session.score += events.bonusKillPoints
    if (events.timeReductionMs) state.cycleTimer = Math.max(0, state.cycleTimer - events.timeReductionMs)
    if (events.enemyKills > 0) state.cycleTimer = Math.max(0, state.cycleTimer - events.enemyKills * ENEMY_KILL_CYCLE_ADVANCE_MS)

    // cutscene em câmera lenta do chefe explodindo antes de sair da arena — handler extraído
    // pra flow-boss.js.
    const bossDefeatedFromCombat = combat.consumeBossDefeated ? combat.consumeBossDefeated() : null
    const isBossDefeated = Boolean(events.bossDefeated || bossDefeatedFromCombat?.defeated)
    const bossDeathWorldPos = events.bossHitWorldPos || bossDefeatedFromCombat?.worldPos || (combat.getBossWorldPos ? combat.getBossWorldPos() : null) || playerPos

    if (state.phase === 'bossFight') {
      const bossAlive = combat.hasAliveBoss ? combat.hasAliveBoss() : false
      const bossDying = combat.isBossDying ? combat.isBossDying() : false
      const bossSnap = combat.getBossSnapshot()

      // Dispara cutscene de vitória e saída da arena se:
      // 1) O chefe foi derrotado (tiro do jogador, raio teleguiado, tiro de wingman, splash, aríete)
      // 2) O chefe está no estado dying (animação de explosão iniciada)
      // 3) Fail-safe: não há chefe vivo e snapshot de HP está nulo ou zerado
      if (isBossDefeated || bossDying || (!bossAlive && (!bossSnap || bossSnap.hp <= 0))) {
        bossFlow.handleBossDefeated(bossDeathWorldPos)
      }
    } else if (isBossDefeated && (state.phase === 'bossBuildup' || (rail.isArena() && !state.phase.startsWith('golden')))) {
      bossFlow.handleBossDefeated(bossDeathWorldPos)
    }

    // ============ COLISÃO FÍSICA COM BOSS / DOURADO (KNOCKBACK + TUMBLE SPIN) ============
    if (events.bossCollisionWorldPos) {
      rail.triggerBossCollisionTumble(events.bossCollisionWorldPos)
      state.hitShakeTimer = Math.max(state.hitShakeTimer, 450)
      if (effects) {
        effects.hitSpark(playerPos, 0xffbb22)
        effects.shockwave(playerPos, 0xffaa00, 1.0)
      }
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
        if (effects.hullDamageBurst) effects.hullDamageBurst(playerPos)
        if (!result.outOfLives && effects.respawnBurst) {
          effects.respawnBurst(playerPos)
        }
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
          const fragataChance = FRAGATA_SPAWN_CHANCE + Math.min(0.25, (state.wrongAnswerCount || 0) * 0.05)
          if (Math.random() < fragataChance) combat.spawnFragata()
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
          const sentinelaChance = SENTINELA_SPAWN_CHANCE + Math.min(0.20, (state.wrongAnswerCount || 0) * 0.04)
          if (Math.random() < TIME_ENEMY_SPAWN_CHANCE) {
            if (Math.random() < TIME_ENEMY_MEGA_CHANCE) combat.spawnTimeEnemyMega()
            else combat.spawnTimeEnemy()
          } else if (Math.random() < MINI_SWARM_CHANCE) {
            combat.spawnMiniSwarm()
          } else if (Math.random() < sentinelaChance) {
            combat.spawnSentinela()
          } else if (Math.random() < REPLICA_SPAWN_CHANCE) {
            combat.spawnReplica()
          } else if (Math.random() < VERME_SPAWN_CHANCE) {
            combat.spawnVerme()
          } else if (Math.random() < SUSSURRO_SPAWN_CHANCE) {
            combat.spawnSussurro()
          } else {
            const room = Math.max(0, progression.currentEnemyCap() - combat.getEnemyCount())
            if (room >= 3 && Math.random() < 0.65 && combat.spawnSquadron) {
              const formations = ['vFormation', 'sweepLine', 'trailColumn', 'pincer']
              const picked = formations[Math.floor(Math.random() * formations.length)]
              combat.spawnSquadron(picked)
            } else {
              const roll = NORMAL_SPAWN_MIN_COUNT + Math.floor(Math.random() * (NORMAL_SPAWN_MAX_COUNT - NORMAL_SPAWN_MIN_COUNT + 1))
              const count = Math.min(room, roll + state.extraSpawnPerBatch)
              for (let i = 0; i < count; i += 1) combat.spawnEnemy()
            }
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
        if (state.goldenTimer <= 0) {
          if (state.debugFlags?.disableArena) {
            state.goldenTimer = progression.randomGoldenInterval()
          } else {
            bossFlow.startArenaCutscene('golden', bossFlow.enterGoldenArena)
          }
        }
      }

      if (state.phase === 'combat') {
        state.cycleTimer -= dt * 1000
        const disableArena = !!state.debugFlags?.disableArena
        const bossWarnActive = !disableArena && state.isBossCycle && state.cycleTimer > 0 && state.cycleTimer <= ARENA_WARNING_COUNTDOWN_MS
        const goldenWarnActive = !disableArena && !state.isBossCycle && state.goldenTimer > 0 && state.goldenTimer <= ARENA_WARNING_COUNTDOWN_MS
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
          if (state.isBossCycle && !disableArena) bossFlow.startArenaCutscene('boss', bossFlow.enterBossBuildup)
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
    hud.updateCollectedCards(player.getCollectedCards())
    if (hud.setSquadronAbilities && combat.getAbilityStates) hud.setSquadronAbilities(combat.getAbilityStates())

    hud.setLowHealth(player.getLowHealthIntensity(LOW_HEALTH_THRESHOLD_FRAC))

    if (state.phase === 'bossFight') {
      const bossSnap = combat.getBossSnapshot()
      if (bossSnap && bossSnap.hp > 0) hud.setBossFight(true, bossSnap.hp, bossSnap.maxHp, 'CHEFE', false)
      else hud.setBossFight(false, 0, 1)
    } else if (state.phase === 'goldenArena') {
      const goldenSnap = combat.getGoldenSnapshot()
      if (goldenSnap && goldenSnap.hp > 0) hud.setBossFight(true, goldenSnap.hp, goldenSnap.maxHp, 'ANOMALIA DOURADA', true)
      else hud.setBossFight(false, 0, 1)
    } else {
      hud.setBossFight(false, 0, 1)
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

  function tick(now) {
    if (state.stopped) return
    if (!state.manualStepActive) {
      state.rafId = requestAnimationFrame(tick)
    }
    runFrame(now)
  }

  function setManualStepping(enabled) {
    const active = !!enabled
    state.manualStepActive = active
    if (state.debugFlags) {
      state.debugFlags.manualStepActive = active
    }
    if (hud?.debug?.setToggleActive) {
      hud.debug.setToggleActive('toggleManualStep', active)
    }
    if (active) {
      if (state.rafId != null) {
        cancelAnimationFrame(state.rafId)
        state.rafId = null
      }
    } else {
      if (!state.stopped && state.rafId == null) {
        state.lastTime = performance.now()
        state.rafId = requestAnimationFrame(tick)
      }
    }
    hud?.debug?.refreshStats?.()
    return state.manualStepActive
  }

  function step(frames = 1, dtMs = 16.6667) {
    if (state.stopped) return
    if (state.paused) {
      state.paused = false
      hud.setPaused(false)
    }
    if (!state.manualStepActive) {
      setManualStepping(true)
    }
    const count = Math.max(1, Math.floor(frames))
    const dtSec = dtMs / 1000
    for (let i = 0; i < count; i++) {
      if (state.stopped) break
      const now = (state.lastTime || performance.now()) + dtMs
      runFrame(now, dtSec)
    }
    hud?.debug?.refreshStats?.()
  }

  function start() {
    state.lastTime = performance.now()
    if (!state.manualStepActive) {
      state.rafId = requestAnimationFrame(tick)
    }
  }

  function stop() {
    state.stopped = true
    if (state.rafId != null) {
      cancelAnimationFrame(state.rafId)
      state.rafId = null
    }
  }

  return {
    start,
    stop,
    step,
    setManualStepping,
    isManualStepping: () => !!state.manualStepActive,
  }
}
