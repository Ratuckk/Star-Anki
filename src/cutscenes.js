// cutscenes.js
//
// Etapa 3 do overhaul de organização do main.js. Extrai os dois blocos de cutscene que viviam
// no topo do tick() (early-return, auto-contidos) — `arenaCutscene` (transição pro all-range
// antes do chefe/dourado) e `deathCutscene` (câmera lenta segurando na explosão do chefe/
// dourado). Zero mudança de comportamento.
//
// Padrão: cada função recebe apenas `dt` e devolve boolean — "eu tratei este frame". Quem chama
// (main.js) decide o que fazer com o retorno (early-return do tick). Todo o estado compartilhado
// (state.arenaCutsceneTimer, state.deathCutsceneOnDone, etc.) mora no objeto `state` que o
// main.js já tem — este módulo não tem estado próprio, é uma função pura de leitura/escrita
// sobre a referência que recebeu.

import * as THREE from 'three'
import {
  ARENA_CUTSCENE_PULLBACK,
  ARENA_CUTSCENE_FOV_BUMP,
  ARENA_CUTSCENE_ORBIT,
  DEATH_CUTSCENE_MS,
  DEATH_CUTSCENE_TIME_SCALE,
  DEATH_CUTSCENE_ZOOM_FOV,
} from './main-constants.js'

export function createCutscenesSystem(deps) {
  const { state, camera, renderer, scene, effects, hud, rail, player } = deps

  // ============ CUTSCENE DE TRANSIÇÃO PARA ALL-RANGE (dourado/chefe) ============
  // nave travada, só a câmera se move sozinha (puxa pra trás + abre o FOV e volta), igual
  // confirmado com o usuário — ao terminar, chama state.arenaCutsceneOnDone (enterGoldenArena
  // ou enterBossBuildup), que aí sim muda de fase e liga o modo all-range de verdade.
  //
  // Usa `dt` (já escalado por slowMo de debug) — preserva comportamento original.
  function updateArenaCutscene(dt) {
    if (state.phase !== 'arenaCutscene') return false

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
    return true
  }

  // ============ CUTSCENE DE MORTE (chefe/dourado explodindo) ============
  // pedido do usuário: "cutscene em câmera lenta do inimigo dourado/boss sendo destruído e
  // explodindo" em vez da transição instantânea pro modo normal. Nave travada (sem input),
  // tempo desacelerado — a explosão e o encolhimento do mesh morrendo (já disparados no frame
  // do kill, dentro de enemies.js) continuam a tocar por baixo, só mais devagar; a câmera gira
  // suavemente (tempo real, não desacelerado) até focar na explosão e segura ali.
  //
  // Usa `rawDt` (NÃO escalado por slowMo) — preserva comportamento original (é uma cutscene em
  // câmera lenta por conta própria, via DEATH_CUTSCENE_TIME_SCALE; se usasse `dt`, um slowMo
  // de debug em cima dela ia desacelerar duas vezes e travar o jogador num limbo visual).
  function updateDeathCutscene(rawDt) {
    if (state.phase !== 'deathCutscene') return false

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
    return true
  }

  return { updateArenaCutscene, updateDeathCutscene }
}
