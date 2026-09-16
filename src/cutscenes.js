// cutscenes.js
//
// Overhaul Cinemático (v0.53.0-dev, branch feature/cutscenes-overhaul):
// Sistema unificado de cutscenes arcade estilo Star Fox 64:
//   1. Decolagem / Início de Missão (updateLaunchCutscene): câmera baixa nos motores, ignição,
//      aceleração com speedlines e banner de setor, pulável com [Espaço].
//   2. Apresentação do Chefe / Anomalia Dourada (updateArenaCutscene): faixas de cinema (letterbox),
//      pulsos de fenda espacial, Arcade Warning Card ("RED CORE // FORTALEZA DEFENSIVA"), arco de
//      câmera dramático e transição suave pro All-Range.
//   3. Morte do Chefe & Vitória (updateDeathCutscene): detonações secundárias em cadeia pela carcaça,
//      clarão branco terminal (whiteout), transição para o voo rasante da vitória e banner
//      MISSION ACCOMPLISHED antes das recompensas.

import * as THREE from 'three'
import {
  ARENA_CUTSCENE_PULLBACK,
  ARENA_CUTSCENE_FOV_BUMP,
  ARENA_CUTSCENE_ORBIT,
  DEATH_CUTSCENE_MS,
  BOSS_DEATH_CUTSCENE_MS,
  DEATH_CUTSCENE_TIME_SCALE,
  DEATH_CUTSCENE_ZOOM_FOV,
  LAUNCH_CUTSCENE_MS,
} from './main-constants.js'

export function createCutscenesSystem(deps) {
  const { state, camera, renderer, scene, effects, hud, rail, player } = deps

  // ============ CUTSCENE 1: DECOLAGEM / INÍCIO DE MISSÃO ============
  function startLaunchCutscene(onDone, bannerOptions = {}) {
    state.phase = 'launchCutscene'
    state.launchCutsceneTimer = LAUNCH_CUTSCENE_MS
    state.launchCutsceneDurationMs = LAUNCH_CUTSCENE_MS
    state.launchCutsceneOnDone = onDone
    state.launchIgnited = false
    hud.setLetterbox(true)
    hud.showLaunchBanner({
      sector: bannerOptions.sector || 'SETOR 01',
      text: bannerOptions.text || 'MISSÃO INICIADA // BOA SORTE',
      skipText: bannerOptions.skipText || '[ESPAÇO / TIRO] PULAR DECOLAGEM',
    })
  }

  function updateLaunchCutscene(dt, inputState = {}) {
    if (state.phase !== 'launchCutscene') return false

    const duration = state.launchCutsceneDurationMs || LAUNCH_CUTSCENE_MS
    const elapsed = duration - state.launchCutsceneTimer

    // Skip por input (Espaço ou Disparo) após breve período para evitar clique acidental do menu
    const wantsSkip = inputState.firing || (inputState.pressed && (
      inputState.pressed.has('Space') || inputState.pressed.has('KeyZ') || inputState.pressed.has('Enter')
    ))
    if (wantsSkip && elapsed > 250) {
      state.launchCutsceneTimer = 0
    }

    state.launchCutsceneTimer -= dt * 1000
    const t = THREE.MathUtils.clamp(1 - Math.max(0, state.launchCutsceneTimer) / duration, 0, 1)

    // Fase 1: 0 a 0.35 (Pre-ignição / foco nos propulsores)
    // Fase 2: 0.35 a 1.0 (Ignição dos propulsores + aceleração suave pela pista reta)
    const ignitionT = 0.35

    if (t >= ignitionT && !state.launchIgnited) {
      state.launchIgnited = true
      const pPos = rail.getPlayerPosition()
      const pFrame = rail.getFrameAt(0)
      if (effects) {
        effects.propulsionBurst(pPos, pFrame.forward)
        effects.shockwave(pPos, 0x3ea6ff, 2.0)
        effects.muzzleFlash(pPos, pFrame.forward)
      }
    }

    // Aceleração contínua da nave ao longo da pista reta a partir da ignição
    let currentDist = 0
    if (t >= ignitionT) {
      const p = (t - ignitionT) / (1 - ignitionT)
      const accelCurve = p * p
      currentDist = accelCurve * 22
      rail.setDistance(currentDist)
    } else {
      rail.setDistance(0)
    }

    const playerPos = rail.getPlayerPosition()
    const frame = rail.getFrameAt(currentDist)

    // Câmera dinâmica de decolagem
    const initialFrame = rail.getFrameAt(0)
    const baseStartCam = initialFrame.position.clone()
      .addScaledVector(initialFrame.forward, -6.5)
      .addScaledVector(initialFrame.right, 3.8)
      .addScaledVector(initialFrame.up, 1.2)

    const endCamPos = playerPos.clone()
      .addScaledVector(frame.forward, -10)
      .addScaledVector(frame.up, 3)

    if (t < ignitionT) {
      camera.position.copy(baseStartCam)
      camera.fov = 68
      camera.lookAt(playerPos.clone().addScaledVector(frame.forward, 2.5))
    } else {
      const p = (t - ignitionT) / (1 - ignitionT)
      const camProgress = THREE.MathUtils.smoothstep(p, 0, 1)
      const dynamicStartCam = playerPos.clone()
        .addScaledVector(frame.forward, -6.5)
        .addScaledVector(frame.right, 3.8 * (1 - camProgress))
        .addScaledVector(frame.up, 1.2 + camProgress * 1.8)
      camera.position.lerpVectors(dynamicStartCam, endCamPos, camProgress)
      camera.fov = 70 + Math.sin(camProgress * Math.PI) * 12
      camera.lookAt(playerPos.clone().addScaledVector(frame.forward, 15 + camProgress * 20))
    }
    camera.updateProjectionMatrix()

    if (effects) {
      effects.update(dt, playerPos, frame.forward, {
        camera,
        shieldValue: player.getShieldValue(),
        shieldMax: player.getShieldMax(),
        boostActive: t >= ignitionT,
      })
    }

    if (state.launchCutsceneTimer <= 0) {
      hud.hideLaunchBanner()
      hud.setLetterbox(false)
      camera.fov = 70
      camera.updateProjectionMatrix()
      const done = state.launchCutsceneOnDone
      state.launchCutsceneOnDone = null
      if (done) done()
    }

    renderer.render(scene, camera)
    return true
  }

  // ============ CUTSCENE 2: APRESENTAÇÃO DO CHEFE / ANOMALIA DOURADA ============
  function updateArenaCutscene(dt) {
    if (state.phase !== 'arenaCutscene') return false

    state.arenaCutsceneTimer -= dt * 1000
    const duration = state.arenaCutsceneDurationMs || 3000
    const t = THREE.MathUtils.clamp(1 - Math.max(0, state.arenaCutsceneTimer) / duration, 0, 1)

    const isBoss = state.arenaCutsceneKind === 'bossSummon'
    const isGolden = state.arenaCutsceneKind === 'golden' || state.arenaCutsceneKind === 'goldenArena'

    // Início da cutscene: ativa letterbox e warning card
    if (!state.arenaCutsceneUiInitialized) {
      state.arenaCutsceneUiInitialized = true
      hud.setLetterbox(true)
      if (isBoss) {
        hud.showBossWarningCard({
          name: 'NÚCLEO RUBRO // RED CORE',
          subtitle: 'FORTALEZA DEFENSIVA',
          warning: 'ALERTA MÁXIMO // AMEAÇA DETECTADA',
        })
      } else if (isGolden) {
        hud.showGoldenWarningCard({
          title: 'ANOMALIA TEMPORAL DETECTADA',
          subtitle: 'ALVO DE ALTO VALOR // ALL-RANGE MODE',
        })
      }
    }

    // Fenda espacial / ondas de choque durante a aparição (primeiros 65% do tempo)
    if (isBoss && t < 0.65) {
      state.bossRiftPulseTimer = (state.bossRiftPulseTimer || 0) - dt
      if (state.bossRiftPulseTimer <= 0) {
        state.bossRiftPulseTimer = 0.55
        const riftPos = state.arenaCutsceneBaseCameraPos.clone()
          .addScaledVector(state.arenaCutsceneBaseForward, 50)
        if (effects) {
          effects.shockwave(riftPos, 0xff2d4d, 2.4)
          effects.hitSpark(riftPos, 0xffffff)
        }
      }
    } else if (isGolden && t < 0.65) {
      state.bossRiftPulseTimer = (state.bossRiftPulseTimer || 0) - dt
      if (state.bossRiftPulseTimer <= 0) {
        state.bossRiftPulseTimer = 0.6
        const riftPos = state.arenaCutsceneBaseCameraPos.clone()
          .addScaledVector(state.arenaCutsceneBaseForward, 45)
        if (effects) {
          effects.shockwave(riftPos, 0xffd700, 2.0)
          effects.hitSpark(riftPos, 0xffea70)
        }
      }
    }

    // Movimentação dramática de câmera
    if (t < 0.68) {
      const pull = Math.sin(t * (Math.PI / 0.68))
      camera.position.copy(state.arenaCutsceneBaseCameraPos)
        .addScaledVector(state.arenaCutsceneBaseForward, -pull * ARENA_CUTSCENE_PULLBACK * 1.25)
        .addScaledVector(state.arenaCutsceneBaseRight, Math.sin(t * Math.PI * 1.5) * ARENA_CUTSCENE_ORBIT * 1.4)
        .addScaledVector(new THREE.Vector3(0, 1, 0), pull * 4.5)
      camera.fov = 70 + pull * (ARENA_CUTSCENE_FOV_BUMP + 4)
      camera.updateProjectionMatrix()
      camera.lookAt(state.arenaCutsceneBaseCameraPos.clone().addScaledVector(state.arenaCutsceneBaseForward, 42))
    } else {
      // Retomada suave para trás da nave
      const recoverT = (t - 0.68) / 0.32
      camera.position.lerp(state.arenaCutsceneBaseCameraPos, recoverT)
      camera.fov = 70 + (1 - recoverT) * 8
      camera.updateProjectionMatrix()
      camera.lookAt(state.arenaCutsceneBaseCameraPos.clone().addScaledVector(state.arenaCutsceneBaseForward, 40))
    }

    // Retirada dos cards e letterbox antes do frame final
    if (t >= 0.65) {
      hud.hideBossWarningCard()
      hud.hideGoldenWarningCard()
    }
    if (t >= 0.92) {
      hud.setLetterbox(false)
    }

    if (state.arenaCutsceneTimer <= 0) {
      camera.fov = 70
      camera.updateProjectionMatrix()
      hud.setArenaCutscene(null)
      hud.hideBossWarningCard()
      hud.hideGoldenWarningCard()
      hud.setLetterbox(false)
      state.arenaCutsceneUiInitialized = false
      const done = state.arenaCutsceneOnDone
      state.arenaCutsceneOnDone = null
      if (done) done()
    }

    renderer.render(scene, camera)
    return true
  }

  // ============ CUTSCENE 3: MORTE DO CHEFE / ANOMALIA & VITÓRIA ============
  function updateDeathCutscene(rawDt) {
    if (state.phase !== 'deathCutscene') return false

    state.deathCutsceneTimer -= rawDt * 1000
    const duration = state.deathCutsceneDurationMs || (state.deathCutsceneKind === 'boss' ? BOSS_DEATH_CUTSCENE_MS : DEATH_CUTSCENE_MS)
    const t = THREE.MathUtils.clamp(1 - Math.max(0, state.deathCutsceneTimer) / duration, 0, 1)

    const isBoss = state.deathCutsceneKind === 'boss'

    if (!state.deathCutsceneUiInitialized) {
      state.deathCutsceneUiInitialized = true
      hud.setLetterbox(true)
    }

    if (isBoss) {
      // ---- MORTE DO CHEFE: DETONAÇÕES SECUNDÁRIAS + WHITEOUT + FLYBY ----
      const phase1T = 0.36 // 0 a 36% do tempo: destabilização em câmera lenta
      if (t < phase1T) {
        const slowDt = rawDt * DEATH_CUTSCENE_TIME_SCALE
        if (effects) {
          effects.update(slowDt, rail.getPlayerPosition(), rail.getFrameAt(0).forward, {
            camera,
            shieldValue: player.getShieldValue(),
            shieldMax: player.getShieldMax(),
            boostActive: false,
            skipTrail: true,
          })
        }

        // Detonações secundárias pela carcaça do chefe
        state.secondaryExplosionTimer = (state.secondaryExplosionTimer || 0) - rawDt
        if (state.secondaryExplosionTimer <= 0 && state.deathCutscenePos) {
          state.secondaryExplosionTimer = 0.16
          const offset = new THREE.Vector3(
            (Math.random() - 0.5) * 7.5,
            (Math.random() - 0.5) * 7.5,
            (Math.random() - 0.5) * 7.5,
          )
          if (effects) {
            effects.explosion(state.deathCutscenePos.clone().add(offset), 0xff6622, 1.8, { rings: true })
            effects.hitSpark(state.deathCutscenePos.clone().add(offset), 0xffffff)
          }
        }

        // Zoom dramático no chefe morrendo
        const zoomT = Math.sin((t / phase1T) * Math.PI)
        camera.fov = 70 - zoomT * (70 - DEATH_CUTSCENE_ZOOM_FOV)
        camera.updateProjectionMatrix()
        if (state.deathCutscenePos) {
          const targetQuat = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().lookAt(camera.position, state.deathCutscenePos, camera.up),
          )
          camera.quaternion.slerp(targetQuat, 1 - Math.exp(-6 * rawDt))
        }
      } else {
        // Fase 2 & 3: Whiteout terminal + Voo rasante comemorativo
        if (!state.deathWhiteoutTriggered) {
          state.deathWhiteoutTriggered = true
          hud.triggerWhiteout()
          hud.setLetterbox(true)
          hud.showMissionComplete({
            title: 'MISSION ACCOMPLISHED',
            subtitle: 'SETOR CONCLUÍDO // CHEFE DESTRUÍDO',
          })
          if (effects && state.deathCutscenePos) {
            effects.explosion(state.deathCutscenePos, 0xff2d4d, 5.5, { rings: true, isBoss: true })
            effects.shockwave(state.deathCutscenePos, 0xffffff, 2.8)
            effects.shockwave(state.deathCutscenePos, 0xff2d4d, 3.6)
          }
        }

        // Câmera posicionada após a zona de fumaça, olhando pra trás
        if (state.deathCutscenePos) {
          const forward = rail.getFrameAt(0).forward
          const flybyCam = state.deathCutscenePos.clone()
            .addScaledVector(forward, 20)
            .addScaledVector(new THREE.Vector3(0, 1, 0), 2.2)
          camera.position.lerp(flybyCam, 0.08)
          camera.lookAt(state.deathCutscenePos)
        }

        if (effects) {
          effects.update(rawDt * 0.75, rail.getPlayerPosition(), rail.getFrameAt(0).forward, {
            camera,
            shieldValue: player.getShieldValue(),
            shieldMax: player.getShieldMax(),
            boostActive: true,
            skipTrail: false,
          })
        }
      }
    } else if (state.deathCutsceneKind === 'golden') {
      // ---- MORTE ESPALHAFATOSA DO INIMIGO DOURADO: DETONAÇÕES DOURADAS + WHITEOUT + EXPLOSÃO MASSIVA ----
      const phase1T = 0.45 // 0 a 45%: colapso e detonações rápidas
      if (t < phase1T) {
        const slowDt = rawDt * 0.22
        if (effects) {
          effects.update(slowDt, rail.getPlayerPosition(), rail.getFrameAt(0).forward, {
            camera,
            shieldValue: player.getShieldValue(),
            shieldMax: player.getShieldMax(),
            boostActive: false,
            skipTrail: true,
          })
        }

        // Detonações secundárias douradas em cascata rápida (a cada 90ms)
        state.secondaryExplosionTimer = (state.secondaryExplosionTimer || 0) - rawDt
        if (state.secondaryExplosionTimer <= 0 && state.deathCutscenePos) {
          state.secondaryExplosionTimer = 0.09
          const offset = new THREE.Vector3(
            (Math.random() - 0.5) * 4.5,
            (Math.random() - 0.5) * 4.5,
            (Math.random() - 0.5) * 4.5,
          )
          if (effects) {
            const goldColors = [0xffd700, 0xffaa00, 0xffffff, 0xffea75]
            const col = goldColors[Math.floor(Math.random() * goldColors.length)]
            effects.explosion(state.deathCutscenePos.clone().add(offset), col, 2.2, { rings: true })
            effects.hitSpark(state.deathCutscenePos.clone().add(offset), 0xffffff)
            effects.shockwave(state.deathCutscenePos.clone().add(offset), col, 1.4)
          }
        }

        // Zoom dramático e câmera focada
        const zoomT = Math.sin((t / phase1T) * Math.PI)
        camera.fov = 70 - zoomT * 26
        camera.updateProjectionMatrix()
        if (state.deathCutscenePos) {
          const targetQuat = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().lookAt(camera.position, state.deathCutscenePos, camera.up),
          )
          camera.quaternion.slerp(targetQuat, 1 - Math.exp(-8 * rawDt))
        }
      } else {
        // Fase 2: Clímax com Whiteout cegante + Explosão Dourada Titânica
        if (!state.deathWhiteoutTriggered) {
          state.deathWhiteoutTriggered = true
          hud.triggerWhiteout()
          hud.setLetterbox(true)
          hud.showMissionComplete({
            title: 'ANOMALIA DOURADA DESTRUÍDA',
            subtitle: 'SETOR PURIFICADO // RECOMPENSA DESBLOQUEADA',
          })
          if (effects && state.deathCutscenePos) {
            effects.explosion(state.deathCutscenePos, 0xffd700, 6.5, { rings: true, isBoss: true })
            effects.explosion(state.deathCutscenePos, 0xff9900, 5.0, { rings: true })
            effects.shockwave(state.deathCutscenePos, 0xffffff, 4.2)
            effects.shockwave(state.deathCutscenePos, 0xffd700, 5.5)
            effects.hitSpark(state.deathCutscenePos, 0xffffff)
          }
        }

        // Câmera orbita suavemente com recuo dramático
        if (state.deathCutscenePos) {
          const p = (t - phase1T) / (1 - phase1T)
          const forward = rail.getFrameAt(0).forward
          const retreatCam = state.deathCutscenePos.clone()
            .addScaledVector(forward, 14 + p * 12)
            .addScaledVector(new THREE.Vector3(0, 1, 0), 3.0 + p * 2.5)
          camera.position.lerp(retreatCam, 0.08)
          camera.lookAt(state.deathCutscenePos)
        }

        if (effects) {
          effects.update(rawDt * 0.6, rail.getPlayerPosition(), rail.getFrameAt(0).forward, {
            camera,
            shieldValue: player.getShieldValue(),
            shieldMax: player.getShieldMax(),
            boostActive: false,
            skipTrail: true,
          })
        }
      }
    } else {
      // ---- MORTE DE INIMIGO COMUM ----
      const slowDt = rawDt * DEATH_CUTSCENE_TIME_SCALE
      if (effects) {
        effects.update(slowDt, rail.getPlayerPosition(), rail.getFrameAt(0).forward, {
          camera,
          shieldValue: player.getShieldValue(),
          shieldMax: player.getShieldMax(),
          boostActive: false,
          skipTrail: true,
        })
      }
      const zoomT = Math.sin(Math.min(1, t) * Math.PI)
      camera.fov = 70 - zoomT * (70 - DEATH_CUTSCENE_ZOOM_FOV)
      camera.updateProjectionMatrix()
      if (state.deathCutscenePos) {
        const targetQuat = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().lookAt(camera.position, state.deathCutscenePos, camera.up),
        )
        camera.quaternion.slerp(targetQuat, 1 - Math.exp(-6 * rawDt))
      }
    }

    if (state.deathCutsceneTimer <= 0) {
      hud.hideMissionComplete()
      hud.setLetterbox(false)
      camera.fov = 70
      camera.updateProjectionMatrix()
      state.deathCutsceneUiInitialized = false
      state.deathWhiteoutTriggered = false
      state.secondaryExplosionTimer = 0
      const done = state.deathCutsceneOnDone
      state.deathCutsceneOnDone = null
      state.deathCutscenePos = null
      if (done) done()
    }

    renderer.render(scene, camera)
    return true
  }

  return {
    startLaunchCutscene,
    updateLaunchCutscene,
    updateArenaCutscene,
    updateDeathCutscene,
  }
}
