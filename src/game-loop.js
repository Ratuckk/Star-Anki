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
import { PLAYER_SOUND_CUES, triggerSoundCue } from './audio-cues.js'
import { POWER_LEVEL_HIGH_IMPACT } from './enemies/shared.js'
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
  HORDA_SPAWN_CHANCE,
  ARENA_WARNING_COUNTDOWN_MS, ARENA_WARNING_STOP_SPAWN_MS,
  HOMING_LOCK_INTERVAL_MS, DODGE_TAP_WINDOW_MS, DEFLECT_RADIUS, RAM_DAMAGE,
  LOW_HEALTH_THRESHOLD_FRAC,
  BOSS_ENEMY_INTERVAL_MULT,
  LEVEL_BACKGROUNDS,
  DENSE_FOG_THRESHOLD_RATIO, DENSE_FOG_REFERENCE_DENSITY,
  SWIRL_SLOW_MO_MS, SWIRL_SLOW_MO_FACTOR, SWIRL_FOV_BUMP_MS, SWIRL_FOV_TARGET,
  ARCADE_CARD_CHOICE_TIME_SCALE,
} from './main-constants.js'
import { getDifficultyLevel } from './enemies/shared.js'
import { createWingmanReactivity } from './combat/wingman-reactivity.js'
import { getSettings } from './settings.js'
import { aiValidator } from './ai-validator.js'

// Cadeia de abates ("Arcade Neon", v0.73.0) — quanto tempo sem abate novo até o contador zerar
const KILL_CHAIN_DECAY_S = 3.0

// Temporários reutilizáveis para interpolação da neblina cósmica (evita 21.600 alocações/min no GC)
const _cosmicTint1 = new THREE.Color(0x0c1626) // azul-petróleo
const _cosmicTint2 = new THREE.Color(0x190d24) // roxo estelar
const _cosmicTint3 = new THREE.Color(0x0a1f18) // verde-abissal
const _baseColor = new THREE.Color()
const _blendedShift = new THREE.Color()
const _finalColor = new THREE.Color()
const _threatProj = new THREE.Vector3()
const _threatCamDir = new THREE.Vector3()
const _toThreat = new THREE.Vector3()
const _reticleWorldPos = new THREE.Vector3()
const _fireDirection = new THREE.Vector3()
const _minimapRel = new THREE.Vector3()

export function createGameLoop(deps) {
  const {
    state, session, bindings, showEnemyHealthBars,
    hud, scene, camera, renderer, rail, effects, player, combat, input,
    progression, cutscenes, bossFlow, questionFlow,
    environment,
    enterCombat, applyHealthLoss, endSector,
    isNoDeck,
  } = deps

  // Overhaul de Personalidade dos wingmen, Ideia 5 — instância própria (não recriar por frame,
  // precisa lembrar quando foi a última vida perdida entre ticks).
  const wingmanReactivity = createWingmanReactivity()

  function triggerDebrisStorm(durationMs = 15000) {
    if (!ENVIRONMENT_CONFIG.enableDebrisStormEvent) return
    state.debrisStormActive = true
    state.debrisStormTimer = durationMs
    state.debrisStormSpawnTimer = 300 // primeiro spawn rápido
    environment?.setFogProfile?.('debrisStorm')
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
    // Miyu (Carga Compartilhada): +1 alvo de trava enquanto acoplado, empilhando com a carta
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
    const baseDt = state.debugFlags.slowMoActive ? rawDt * 0.25 : rawDt
    // Bullet-time no Card Choice (Arcade) — Docs/Bullet-time no Card Choice (Arcade).md, §3.1.
    // Só no modo arcade, só na tela de 3 cartas, e só com a pausa total desligada nas
    // Configurações. Calculado ANTES do early-return de cardChoice (logo abaixo) — é essa
    // condição que decide se aquele bloco continua pausando ou deixa o frame seguir.
    const inArcadeCardChoiceBulletTime =
      state.phase === 'cardChoice' && isNoDeck && !getSettings().arcadeCardChoicePauses
    // Precedência entre as 3 fontes de câmera lenta (só uma decide o dt por frame, nunca
    // compõem): slowMo de DEBUG sempre vence (ferramenta de dev, previsível); bullet-time do
    // card choice (Docs/Bullet-time...) vem depois; Swirl Blast (§4.5) por último — na prática
    // nunca competem de verdade (cardChoice pausa o combate, então o Swirl não tem como estar
    // "no ar" nesse phase).
    const dt = state.debugFlags.slowMoActive
      ? baseDt
      : inArcadeCardChoiceBulletTime
        ? rawDt * ARCADE_CARD_CHOICE_TIME_SCALE
        : state.swirlSlowMoMs > 0
          ? baseDt * SWIRL_SLOW_MO_FACTOR
          : baseDt
    state.swirlSlowMoMs = Math.max(0, state.swirlSlowMoMs - rawDt * 1000)
    state.swirlFovBumpMs = Math.max(0, state.swirlFovBumpMs - rawDt * 1000)
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

    if (state.phase === 'bossQuestionPause' || state.phase === 'questionPause') {
      renderer.render(scene, camera)
      return
    }
    // Bullet-time no Card Choice (Arcade), §3.2: cardChoice deixa de ser pausa incondicional —
    // com `inArcadeCardChoiceBulletTime`, o frame CONTINUA (rail/inimigos/jogador seguem
    // rodando com o dt já escalado lá em cima); sem isso, cai no comportamento de sempre.
    if (state.phase === 'cardChoice' && !inArcadeCardChoiceBulletTime) {
      renderer.render(scene, camera)
      return
    }

    // cutscenes: launchCutscene, arenaCutscene e deathCutscene
    if (cutscenes.updateLaunchCutscene(rawDt, inputState)) return
    if (cutscenes.updateArenaCutscene(dt)) return
    if (cutscenes.updateDeathCutscene(rawDt)) return

    state.hitShakeTimer = Math.max(0, state.hitShakeTimer - dt * 1000)
    rail.setShakeIntensity(state.hitShakeTimer > 0 ? SHIP_SHAKE_MAGNITUDE * (state.hitShakeTimer / HIT_SHAKE_DURATION_MS) : 0)

    player.update(dt, inputState.repulsionHeld)

    // pedido do usuário: removida a guinada assistida rumo ao inimigo mais próximo (Fase 9)
    rail.update(dt, inputState)

    // Swirl Blast (§4.5) — FOV bump + "punch" de câmera por cima do que rail.update() acabou de
    // calcular (o lerp de FOV do boost continua rodando por baixo; isso só SOBRESCREVE o valor
    // final do frame enquanto durar, e some sozinho quando o timer zera — sem precisar "devolver
    // o controle" de propósito). Sobe linear nos primeiros 50% da janela, ease-out nos últimos 50%.
    if (state.swirlFovBumpMs > 0) {
      const elapsedMs = SWIRL_FOV_BUMP_MS - state.swirlFovBumpMs
      const halfMs = SWIRL_FOV_BUMP_MS / 2
      const bumpFrac = elapsedMs <= halfMs
        ? elapsedMs / halfMs
        : 1 - Math.pow((elapsedMs - halfMs) / halfMs, 2)
      camera.fov = 70 + bumpFrac * (SWIRL_FOV_TARGET - 70)
      camera.updateProjectionMatrix()
      camera.rotateZ(THREE.MathUtils.degToRad(3) * bumpFrac)
      // Punch de câmera "afastando" (§4.5: "offset de +1.5 no eixo Z NO INSTANTE do disparo") —
      // BUG CORRIGIDO: `camera.translateZ()` é incremento relativo ao eixo local, não um offset
      // absoluto. Chamar isso a cada frame do bump (era `translateZ(1.5 * bumpFrac)` sem guarda)
      // empilhava ~18 frames de +1.5*bumpFrac em 300ms — o lerp de `rail.update()` só corrige uma
      // fração da posição por frame, não o suficiente pra compensar, então a câmera fugia dezenas
      // de unidades pra trás da nave em vez do impulso pontual de 1.5u descrito no doc. Agora
      // dispara só UMA VEZ (no primeiro frame em que o bump fica ativo, guardado por
      // `state.swirlPunchFired`) — o lerp do rail traz a câmera de volta sozinho depois, mesma
      // dinâmica do shake de dano.
      if (!state.swirlPunchFired) {
        state.swirlPunchFired = true
        const _prePunchPos = camera.position.clone()
        camera.translateZ(1.5)
        // Regressão exata do bug corrigido acima: translateZ(1.5) tem que mover a câmera 1.5u
        // NESTE frame e só neste frame — se voltar a empilhar (ex: alguém remove a guarda de
        // `swirlPunchFired` de novo), a distância medida aqui vai estourar bem além de 1.5.
        aiValidator.expect(
          'Swirl Blast: punch de câmera desloca exatamente 1.5u, uma vez por disparo (não acumula frame a frame)',
          () => Math.abs(camera.position.distanceTo(_prePunchPos) - 1.5) < 0.01,
          { distanceMoved: camera.position.distanceTo(_prePunchPos), bumpFrac }
        )
      }
    } else if (state.swirlPunchFired) {
      state.swirlPunchFired = false
    }
    // CRÍTICO: camera.updateMatrixWorld() — ver comentário no arquivo original
    camera.updateMatrixWorld()
    player.getTelemetry?.()?.update({ player, rail, session, camera, elapsed: performance.now() / 1000, dt })

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

    _reticleWorldPos.copy(nosePos)
      .addScaledVector(noseFrame.right, reticleX)
      .addScaledVector(noseFrame.up, reticleY)
      .addScaledVector(noseFrame.forward, RETICLE_AHEAD)

    _fireDirection.copy(_reticleWorldPos).sub(nosePos).normalize()

    // Fase 8 (VISUAL): mira normal acende quando há um inimigo vivo na frente dela
    hud.setReticleAiming(combat.isAimingAtEnemy(nosePos, _fireDirection))

    const isCharging = state.fireHeldMs >= player.config.homingChargeMinMs
    if (inputState.firing) {
      if (!isCharging && combat.tryFire(nosePos, _fireDirection)) rail.triggerRecoil()
      // Miyu (Carga Compartilhada): quando acoplado ao jogador, acelera o carregamento do
      // tiro teleguiado. Lê o estado do frame ANTERIOR (squadron.update ainda não rodou neste
      // frame) — defasagem de ~16ms, imperceptível e sem dependência circular.
      const assistMult = combat.getAssistChargeMult ? combat.getAssistChargeMult() : 1
      state.fireHeldMs += dt * 1000 * assistMult
      if (isCharging) {
        if (!state.chargeLoopSignaled) {
          state.chargeLoopSignaled = true
          triggerSoundCue(PLAYER_SOUND_CUES.charge_loop)
        }
        const atMax = state.fireHeldMs >= player.config.homingChargeMaxMs
        if (atMax && !state.chargeMaxSignaled) {
          state.chargeMaxSignaled = true
          triggerSoundCue(PLAYER_SOUND_CUES.charge_max_ready)
          if (effects && effects.maxChargeReady) {
            effects.maxChargeReady(nosePos, _fireDirection)
          }
        }
        const chargeFrac = Math.min(1, (state.fireHeldMs - player.config.homingChargeMinMs) / (player.config.homingChargeMaxMs - player.config.homingChargeMinMs))
        effects.setChargeGlow(true, chargeFrac, nosePos, _fireDirection)

        combat.sweepLockOn(nosePos, _fireDirection, currentHomingAllowedTargets(state.fireHeldMs))
        const lockedBars = combat.getLockedEnemySnapshots().map((s) => {
          const ndcL = s.worldPos.project(camera)
          return {
            id: s.id,
            xFrac: THREE.MathUtils.clamp((ndcL.x + 1) / 2, 0, 1),
            yFrac: THREE.MathUtils.clamp((1 - ndcL.y) / 2, 0, 1),
            sizeHint: s.sizeHint,
          }
        })
        hud.setLockedEnemyMarkers(lockedBars)
      } else {
        effects.setChargeGlow(false)
        state.chargeMaxSignaled = false
        state.chargeLoopSignaled = false
      }
    } else {
      state.chargeMaxSignaled = false
      state.chargeLoopSignaled = false
      if (isCharging) {
        const isMaxCharge = state.fireHeldMs >= player.config.homingChargeMaxMs
        const canSwirl = isMaxCharge && rail.isFullSpinActive() && player.isSwirlReady()
        if (canSwirl) {
          combat.fireSwirlBlast(nosePos, _fireDirection)
          player.startSwirlCooldown()
          // Swirl Blast (§4.5/§4.6) — cutscene de super ataque: câmera lenta + FOV bump. As
          // speedlines reagem sozinhas a `swirlSlowMoMs > 0` mais abaixo no frame, sem precisar
          // de uma chamada explícita aqui.
          state.swirlSlowMoMs = SWIRL_SLOW_MO_MS
          state.swirlFovBumpMs = SWIRL_FOV_BUMP_MS
          state.swirlPunchFired = false
        } else {
          combat.fireHomingShot(nosePos, _fireDirection, currentHomingAllowedTargets(state.fireHeldMs), isMaxCharge)
        }
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
        if (effects && effects.lateralDashVFX) {
          effects.lateralDashVFX(playerPos, noseFrame.right, -1)
        }
      } else {
        if (nowMs - state.lastDodgeLeftTapAt <= DODGE_TAP_WINDOW_MS && !player.isFullSpinOnCooldown()) {
          rail.triggerFullSpin(-1)
          player.triggerFullSpinIframes()
          rail.cancelTumble?.()
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
        if (effects && effects.lateralDashVFX) {
          effects.lateralDashVFX(playerPos, noseFrame.right, 1)
        }
      } else {
        if (nowMs - state.lastDodgeRightTapAt <= DODGE_TAP_WINDOW_MS && !player.isFullSpinOnCooldown()) {
          rail.triggerFullSpin(1)
          player.triggerFullSpinIframes()
          rail.cancelTumble?.()
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
      // QoL item 4c: duplo-toque de freio de emergência removido — a repulsão progressiva
      // (segurar o botão, ver player.js update()) já cobre trilho e arena igual.
      if (arenaNow && inputState.moveY === -1) {
        rail.triggerArenaSummersault()
        if (effects && effects.summersaultVFX) {
          effects.summersaultVFX(playerPos, noseFrame.forward)
        }
      } else {
        if (player.activateRepulsion()) rail.cancelTumble?.()
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
          remaining: res.remaining,
          xFrac,
          yFrac,
        })
      }
    }

    rail.setSpeedMultiplier(state.speedMultiplier * player.getBoostSpeedFactor())
    hud.setBoost(player.getBoostCharge(), player.isPropulsionActive() || player.isRepulsionActive())

    const boostOn = player.isPropulsionActive()
    // Swirl Blast (§4.6) — speedlines na intensidade máxima durante o slow-mo do disparo,
    // independente do jogador estar boostando; some junto quando a cutscene termina, voltando
    // ao controle normal do boost sem precisar de um restore explícito em outro lugar.
    const swirlMotionActive = state.swirlSlowMoMs > 0
    // Dash lateral (propulsão + bank em arena, ver rail.js) — pedido do usuário: speedlines
    // também durante o deslize (ARENA_DASH_DURATION = 0.22s), mesma intensidade máxima do swirl.
    const dashActive = rail.isLateralDashActive()
    hud.setMotionLines(boostOn || swirlMotionActive || dashActive, (swirlMotionActive || dashActive) ? 1.0 : null)
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
            environment?.setFogProfile?.(null)
            // pedido do usuário: +15% de chance/frequência — intervalo até a próxima reduzido em
            // 15% (55-90s → ~46.75-76.5s)
            state.nextDebrisStormTimer = 46750 + Math.random() * 29750
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
    // Overhaul de Personalidade dos wingmen, Ideia 5 — calculado aqui (único lugar com session/
    // player/state.killChainCount/isNoDeck no mesmo escopo) e repassado pra baixo (combat/index.js
    // → wingmen.js) via opts, mesmo padrão de boostActive/homingCharging logo abaixo.
    const reactivity = wingmanReactivity.update({
      session, player, isNoDeck, killChainCount: state.killChainCount,
    })
    // Fog tático (Overhaul 4, pilar 3) — "denso" é proporcional à densidade calibrada de
    // referência (ver DENSE_FOG_REFERENCE_DENSITY em main-constants.js), não um valor fixo, pra
    // não quebrar com os diferentes contextos de calibração (Horda sozinha vs arena de chefe).
    const isDenseFog = !!getSettings().fogTacticalEffects
      && !!environment?.getFogDensity
      && environment.getFogDensity() >= DENSE_FOG_REFERENCE_DENSITY * DENSE_FOG_THRESHOLD_RATIO
    const events = combat.update(dt, playerPos, {
      enemiesActive,
      aimDirection: _fireDirection,
      ramDamage: ramActive ? RAM_DAMAGE : 0,
      allowBossOrbHit: state.phase === 'bossBuildup',
      boostActive: boostOn,
      shipHitboxPoints,
      homingCharging: isCharging,
      reactivity,
      isDenseFog,
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
        // QoL item 5: hit de tiro NORMAL "não-letal" (acertou, alvo sobreviveu) ganha um leque de
        // faíscas extra além do flash/hitSpark padrão — o teleguiado (isHoming) já tem sua própria
        // explosão de impacto incondicional (ver enemies/index.js), não precisa disso em cima.
        // normal = direção contrária à mira atual (hitsLog não carrega a velocidade exata do
        // projétil que causou cada hit, então usamos a mira do frame como aproximação razoável).
        if (!h.killed && !h.isHoming && effects.ricochetSparks) {
          effects.ricochetSparks(h.worldPos, _fireDirection.clone().negate())
        }
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

    // ============ RÁDIO DOS ALIADOS (Overhaul de Personalidade, Ideia 3) ============
    if (getSettings().wingmanRadioEnabled) {
      // radioQueue (rajada de "prontidão" do [D], vários pilotos em fila) tem prioridade sobre um
      // radioMessage avulso do mesmo frame — na prática nunca competem de verdade (o toggleCommand
      // não passa pelo mesmo laço que gera radioMessage), mas a ordem deixa a intenção explícita.
      if (events.radioQueue && hud.showWingmanRadioQueue) {
        hud.showWingmanRadioQueue(events.radioQueue)
      } else if (events.radioMessage && hud.showWingmanRadio) {
        hud.showWingmanRadio(events.radioMessage)
      }
    }

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
    // ============ CADEIA DE ABATES — "Arcade Neon" (v0.73.0) ============
    // Sobe 1 a cada abate que rendeu pontos (h.points > 0, chefe não conta — ele tem seu próprio
    // momento de K.O. logo abaixo) e zera sozinha depois de KILL_CHAIN_DECAY_S sem abate novo.
    if (events.hitsLog && events.hitsLog.length > 0) {
      for (const h of events.hitsLog) {
        if (h.killed && h.points) {
          state.killChainCount = (state.killChainCount || 0) + 1
          state.killChainTimer = 0
        }
      }
    }
    if ((state.killChainCount || 0) > 0) {
      state.killChainTimer = (state.killChainTimer || 0) + dt
      if (state.killChainTimer >= KILL_CHAIN_DECAY_S) {
        state.killChainCount = 0
        state.killChainTimer = 0
      }
    }
    hud.setKillChain(state.killChainCount || 0)

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

    const ndc = _reticleWorldPos.project(camera)
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
      skipTrail: player.isRepulsionActive(),
      ramActive,
      rollActive: player.isRollIframeActive(),
      dashActive,
    })
    // Pedido explícito do usuário (repetido): propulsores/rastros dos aliados devem ser "iguais
    // aos do jogador" (que não tem NENHUM) pra não distrair. Esse era o rastro real por trás da
    // reclamação — uma esfera "contrail" brilhante (0x7fe0ff) nascendo ~17x/s atrás de CADA
    // aliado (CONTRAIL_INTERVAL=0.06s em effects.js/spawnContrailTick), inteiramente separado do
    // cone pequeno do propulsor em wingmen.js que já tinha sido reduzido/escondido antes.

    if (environment) {
      environment.update(dt, playerPos, {
        boostActive: player.isPropulsionActive(),
      })
    }

    // ============ FUNDO PRETO CLÁSSICO E NEBLINA CÓSMICA ============
    // Overhaul 4 (fog tático, pilar 4): com a setting fogTacticalColors ligada, o
    // environment.js controla a cor do fog (perfis de aviso/morte de chefe/dourado/tempestade —
    // ver setFogProfile) e ESTE force fica desligado, senão sobrescreveria a cor a cada frame
    // (environment.update() já rodou antes deste ponto no mesmo tick). Com a setting desligada
    // (default), comportamento idêntico a sempre — preto clássico incondicional.
    if (scene.fog && state.phase === 'combat' && !rail.isArena() && !getSettings().fogTacticalColors) {
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
    if (events.enemyCollisionWorldPos && events.enemyCollisionTier > 0) {
      rail.triggerEnemyCollisionTumble(events.enemyCollisionTier, events.enemyCollisionWorldPos)
      hud.showKnockbackFeedback?.(events.enemyCollisionTier)
      state.hitShakeTimer = Math.max(state.hitShakeTimer, 180 + events.enemyCollisionTier * 70)
    }

    // ============ DANO AO JOGADOR (escudo vs vida, efeitos distintos) ============
    if (events.enemyHits > 0 && !player.isInvincible() && !state.debugFlags.godMode) {
      state.hitShakeTimer = HIT_SHAKE_DURATION_MS

      const result = player.takeDamage(Math.max(state.enemyDamageValue, events.enemyDamage || 1))
      rail.triggerImpactSquash()
      // Rádio (Ideia 3, evento player_take_damage — §3.5 do doc, decisão b): só reage a dano do
      // JOGADOR, nunca do wingman (invulnerável). O piloto que fala é sorteado dentro do sistema.
      combat.notifyPlayerDamaged?.()

      // Perda de controle por projétil de alto-impacto (nível 4 — Chefe/Dourado/Horda, ver
      // PROJECTILE_POWER_LEVEL em enemies/shared.js) — giro + pisca vermelho por 2s, pedido
      // explícito do usuário. Dispara mesmo se o escudo absorveu o dano (é reação a TOMAR o
      // hit, não ao dano de vida em si).
      if (events.enemyProjectileHits > 0) {
        const projectileTier = Math.min(4, Math.max(2, events.enemyHitPowerLevel || 1))
        const finalTumbleTier = result.shieldBroke ? Math.max(3, projectileTier) : projectileTier
        rail.triggerEnemyCollisionTumble(finalTumbleTier, null)
        hud.showKnockbackFeedback?.(finalTumbleTier)
      } else if (result.shieldBroke && events.enemyCollisionTier > 0) {
        // QoL #6d: o último ponto de escudo sempre pesa como impacto alto, mesmo que a fonte
        // física original fosse um inimigo pequeno (o trigger de tier baixo deste frame é
        // sobrescrito de propósito por esta chamada).
        const finalCollisionTier = Math.max(3, events.enemyCollisionTier)
        rail.triggerEnemyCollisionTumble(finalCollisionTier, events.enemyCollisionWorldPos)
        hud.showKnockbackFeedback?.(finalCollisionTier)
      }

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

    if (state.debugFlags?.disableAutoSpawn) {
      // geração automática desligada via debug — não avança os timers de spawn
    } else if (state.phase === 'goldenArena' || state.phase === 'bossBuildup') {
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
          } else if (Math.random() < HORDA_SPAWN_CHANCE) {
            combat.spawnHorda()
          } else {
            const room = Math.max(0, progression.currentEnemyCap() - combat.getEnemyCount())
            if (room >= 3 && Math.random() < 0.65 && combat.spawnSquadron) {
              const formations = ['vFormation', 'sweepLine', 'trailColumn', 'pincer']
              const picked = formations[Math.floor(Math.random() * formations.length)]
              combat.spawnSquadron(picked)
            } else {
              const roll = NORMAL_SPAWN_MIN_COUNT + Math.floor(Math.random() * (NORMAL_SPAWN_MAX_COUNT - NORMAL_SPAWN_MIN_COUNT + 1))
              // pedido do usuário: quanto mais aliados no esquadrão, mais inimigos por leva —
              // +2 por piloto recrutado, lido na hora do spawn (sempre em dia, sem precisar
              // recalcular quando alguém entra/sai da formação no meio da run)
              const wingmanSpawnBonus = (combat.getWingmanCount ? combat.getWingmanCount() : 0) * 2
              const count = Math.min(room, roll + state.extraSpawnPerBatch + wingmanSpawnBonus)
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

    // nível 1-9 (eixo por-inimigo, distinto do wrongAnswerCount contínuo que applyDifficulty já
    // usa) — recalculado todo frame (não só em resposta errada) pra também refletir a escalada
    // por PONTUAÇÃO do modo sem baralho. Flash de subida dispara aqui (retrocesso é silencioso).
    const difficultyLevel = getDifficultyLevel({ wrongAnswerCount: state.wrongAnswerCount, score: session.score, isNoDeck })
    if (difficultyLevel > state.lastDifficultyLevel) hud.showTierIncrease(difficultyLevel)
    state.lastDifficultyLevel = difficultyLevel

    hud.setStatus({ health: session.health, maxHealth: player.getMaxHealth(), score: session.score, combo: session.comboMultiplier, difficultyLevel })
    hud.setLives(session.lives, player.getMaxLives())
    hud.setShield(player.getShieldValue(), player.getShieldMax())
    // HUD orbital (settings.vitalsHudStyle): âncora dos arcos = projeção na tela da nave, mesmo
    // padrão de setReticlePosition/updateSquadronNoticePosition abaixo. Clamp com margem generosa
    // porque o cluster se estende bem mais PRA CIMA da âncora do que pros lados/baixo (a
    // varredura vai de baixo-direita a cima-esquerda) — sem isso o leque cortaria no topo da tela
    // quando a nave sobe perto da borda. No-op no estilo clássico (setVitalsAnchor primeiro checa
    // useOrbitalVitals e retorna sem fazer nada).
    if (hud.setVitalsAnchor) {
      const vitalsAnchorPos = playerPos.clone().addScaledVector(noseFrame.up, 0.9)
      const ndcVitals = vitalsAnchorPos.project(camera)
      hud.setVitalsAnchor(
        THREE.MathUtils.clamp((ndcVitals.x + 1) / 2, 0.18, 0.82),
        THREE.MathUtils.clamp((1 - ndcVitals.y) / 2, 0.34, 0.90)
      )
    }
    hud.updateCollectedCards(player.getCollectedCards())
    if (hud.setSquadronAbilities && combat.getAbilityStates) hud.setSquadronAbilities(combat.getAbilityStates())
    if (hud.setSquadronSubAbilities && combat.getSubAbilityStates) {
      hud.setSquadronSubAbilities(combat.getSubAbilityStates({ falcoInterceptStacks: player.getFalcoInterceptStacks() }))
    }
    if (hud.setSquadronCommandState && combat.getSquadronCommandState) hud.setSquadronCommandState(combat.getSquadronCommandState())
    if (hud.setSwirlCooldown) hud.setSwirlCooldown(player.getSwirlCooldownMs(), player.getSwirlCooldownTotalMs())

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

    // ============ RADAR TÁTICO (overhaul do minimapa, opção A escolhida pelo usuário) ============
    // Antes só aparecia em arena de chefe/dourado; agora fica ativo o combate inteiro. Projeção
    // relativa ao jogador (frame.right/forward) em vez de eixos XZ do mundo — necessário fora da
    // arena porque o trilho curva em 3D, então "mundo fixo, ícone do jogador gira" vira ilegível.
    // O jogador fica sempre fixo no centro apontando "pra cima"; o mundo é que gira ao redor dele.
    {
      const mapRadius = 190
      const alertRadius = 32
      let alert = false
      const rawBlips = combat.getMinimapBlips ? combat.getMinimapBlips() : []
      // Radar como contra-jogo (Overhaul 4, pilar 2) — se o fog está denso, o radar também não
      // vê tudo com clareza: inimigo além do alcance de visibilidade direta (fog cobrindo mais
      // que 15% da cor dele) vira um blip "fantasma" (difuso, sem tipo/posição exata) em vez de
      // sólido. Boss/golden/detrito nunca viram fantasma — são grandes demais pra se esconder.
      const ghostBlipsEnabled = getSettings().minimapGhostBlips
      const fogDensity = environment?.getFogDensity ? environment.getFogDensity() : 0.0075
      const visibilityThreshold = fogDensity > 0 ? Math.sqrt(-Math.log(0.15)) / fogDensity : Infinity
      const blips = rawBlips.map((b) => {
        _minimapRel.copy(b.worldPos).sub(playerPos)
        const dist = _minimapRel.length()
        if (b.type !== 'golden' && dist < alertRadius) alert = true
        const alwaysVisible = b.type === 'boss' || b.type === 'golden' || b.kind === 'detrito'
        const visState = (!ghostBlipsEnabled || alwaysVisible || dist < visibilityThreshold) ? 'visible' : 'ghost'
        return {
          type: b.type,
          kind: b.kind,
          visState,
          xFrac: THREE.MathUtils.clamp(_minimapRel.dot(noseFrame.right) / mapRadius, -1, 1),
          yFrac: THREE.MathUtils.clamp(-_minimapRel.dot(noseFrame.forward) / mapRadius, -1, 1),
        }
      })
      const wingmanPositions = combat.getWingmanPositions ? combat.getWingmanPositions() : []
      const wingmanMembers = combat.getActiveWingmen ? combat.getActiveWingmen() : []
      const allies = wingmanPositions.map((pos, i) => {
        _minimapRel.copy(pos).sub(playerPos)
        const colorHex = typeof wingmanMembers[i]?.color === 'number'
          ? `#${wingmanMembers[i].color.toString(16).padStart(6, '0')}` : '#5ad1ff'
        return {
          xFrac: THREE.MathUtils.clamp(_minimapRel.dot(noseFrame.right) / mapRadius, -1, 1),
          yFrac: THREE.MathUtils.clamp(-_minimapRel.dot(noseFrame.forward) / mapRadius, -1, 1),
          color: colorHex,
        }
      })
      hud.setMinimap(true, { blips, allies, alert })

      // ============ INDICADOR DIRECIONAL DE AMEAÇAS FORA DA TELA (Item 4 — QOL v0.76.0) ============
      if (hud.setOffscreenThreats) {
        camera.getWorldDirection(_threatCamDir)
        const offscreenThreats = []
        const MAX_THREAT_DIST = 70
        const boundX = 0.90
        const boundY = 0.88

        for (const b of rawBlips) {
          if (b.type === 'golden') continue
          const dist = b.worldPos.distanceTo(playerPos)
          if (dist > MAX_THREAT_DIST) continue

          _toThreat.copy(b.worldPos).sub(camera.position)
          const isBehind = _toThreat.dot(_threatCamDir) <= 0

          _threatProj.copy(b.worldPos).project(camera)
          let ndcX = _threatProj.x
          let ndcY = _threatProj.y

          if (isBehind) {
            ndcX = -ndcX
            ndcY = -ndcY
          }

          // Se estiver dentro da área visível da tela e na frente da câmera, não precisa de ponteiro
          if (!isBehind && Math.abs(ndcX) <= boundX && Math.abs(ndcY) <= boundY) {
            continue
          }

          // Projeção na borda do retângulo da tela
          const m = ndcY / (ndcX || 0.0001)
          let edgeX = ndcX
          let edgeY = ndcY
          if (Math.abs(ndcX) * boundY > Math.abs(ndcY) * boundX) {
            edgeX = ndcX > 0 ? boundX : -boundX
            edgeY = edgeX * m
          } else {
            edgeY = ndcY > 0 ? boundY : -boundY
            edgeX = edgeY / m
          }

          const xPct = (edgeX * 0.5 + 0.5) * 100
          const yPct = (-edgeY * 0.5 + 0.5) * 100
          const rotDeg = Math.atan2(-edgeY, edgeX) * (180 / Math.PI)

          offscreenThreats.push({
            xPct,
            yPct,
            rotDeg,
            dist,
            isCritical: dist < alertRadius,
          })
        }

        offscreenThreats.sort((a, b) => a.dist - b.dist)
        hud.setOffscreenThreats(offscreenThreats.slice(0, 4))
      }
    }

    if (state.hitShakeTimer > 0) {
      const t = state.hitShakeTimer / HIT_SHAKE_DURATION_MS
      camera.position.x += (Math.random() * 2 - 1) * CAMERA_SHAKE_MAGNITUDE * t
      camera.position.y += (Math.random() * 2 - 1) * CAMERA_SHAKE_MAGNITUDE * t
    }

    // Wobble pós-spawn (Overhaul de spawn/despawn) — aplicado no ÚLTIMO instante antes do
    // render, nunca antes (hit-test/lock-on/IA do frame já leram a posição "real" sem jitter).
    combat.applySpawnWobbles?.()
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
