import * as THREE from 'three'
import { ENEMY_SOUND_CUES, triggerSoundCue } from '../audio-cues.js'
import { POWER_LEVEL_BASIC } from './shared.js'

// ============ SUSSURRO OVERHAUL (FASE 4) ============
// Batedor furtivo com ciclo perceptível de IA, silhueta alongada assimétrica e ataque próprio.
// Ciclo: CLOAKED_APPROACH -> REVEAL_TELEGRAPH -> ATTACK/SUMMON -> EVADE -> CLOAKED_APPROACH
export const SUSSURRO_KIND = 'sussurro'
export const SUSSURRO_COLOR = 0x00e5ff // Ciano neon elétrico visível
export const SUSSURRO_HIT_RADIUS = 2.0
export const SUSSURRO_DEATH_DURATION = 0.35
export const SUSSURRO_HP = 3
export const SUSSURRO_KILL_BONUS = 35

export const SUSSURRO_STATES = Object.freeze({
  CLOAKED_APPROACH: 'CLOAKED_APPROACH',
  REVEAL_TELEGRAPH: 'REVEAL_TELEGRAPH',
  ATTACK: 'ATTACK',
  SUMMON: 'SUMMON',
  EVADE: 'EVADE',
})

const SPAWN_DISTANCE_MIN = 54
const SPAWN_DISTANCE_MAX = 88
const BOX_X = 8
const BOX_Y = 5
const ADVANCE_SPEED = 12

// Opacidades: nunca cai a ponto de desaparecer completamente (Fase 4.1)
export const OPACITY_CLOAKED = 0.38
export const OPACITY_REVEALED = 0.95
export const OPACITY_DENSE_FOG_MIN = 0.22

export const TELEGRAPH_DURATION = 0.7 // ~0.7s conforme requisito 4.2
const ATTACK_SHOT_INTERVAL = 0.18 // stagger ~0.18s entre os 2 disparos
const EVADE_DURATION = 1.2
const SUSSURRO_SUMMON_COOLDOWN = 12.0 // Não invoca continuamente (respeita cooldown)

// Geometrias do novo visual (silhueta alongada assimétrica com aletas e núcleo)
const bodyGeo = new THREE.ConeGeometry(0.72, 3.2, 5)
bodyGeo.rotateX(Math.PI / 2)

const finsGeo = new THREE.BoxGeometry(2.4, 0.08, 1.2)
const finLeftGeo = new THREE.ConeGeometry(0.28, 1.1, 4)
finLeftGeo.rotateZ(Math.PI / 3)
const finRightGeo = new THREE.ConeGeometry(0.22, 0.9, 4)
finRightGeo.rotateZ(-Math.PI / 4)

const coreGeo = new THREE.SphereGeometry(0.38, 8, 8)
const rimGeo = new THREE.TorusGeometry(1.35, 0.04, 6, 20)

// Projétil espectral exclusivo do Sussurro
const spectralProjectileGeo = new THREE.ConeGeometry(0.28, 1.3, 5)
spectralProjectileGeo.rotateX(Math.PI / 2)
const spectralProjectileMat = new THREE.MeshBasicMaterial({ color: SUSSURRO_COLOR })

function createSussurroVisual() {
  const root = new THREE.Group()
  const visualGroup = new THREE.Group()
  root.add(visualGroup)

  const hullMat = new THREE.MeshPhongMaterial({
    color: 0x082030,
    emissive: 0x004455,
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: OPACITY_CLOAKED,
    flatShading: true,
  })

  const finMat = new THREE.MeshPhongMaterial({
    color: SUSSURRO_COLOR,
    emissive: 0x0088aa,
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: OPACITY_CLOAKED,
    flatShading: true,
  })

  const body = new THREE.Mesh(bodyGeo, hullMat)
  visualGroup.add(body)

  const fins = new THREE.Mesh(finsGeo, finMat)
  fins.position.set(0, 0, -0.4)
  visualGroup.add(fins)

  // Aletas assimétricas (Fase 4.1: corpo assimétrico perceptível)
  const aletaL = new THREE.Mesh(finLeftGeo, finMat)
  aletaL.position.set(-1.0, 0.25, -0.2)
  const aletaR = new THREE.Mesh(finRightGeo, finMat)
  aletaR.position.set(1.0, -0.15, -0.3)
  visualGroup.add(aletaL, aletaR)

  // Núcleo interno pulsante
  const coreMat = new THREE.MeshBasicMaterial({ color: SUSSURRO_COLOR })
  const core = new THREE.Mesh(coreGeo, coreMat)
  core.position.set(0, 0.1, 0.3)
  visualGroup.add(core)

  // Rim / halo de distorção
  const rimMat = new THREE.MeshBasicMaterial({
    color: SUSSURRO_COLOR,
    transparent: true,
    opacity: 0.28,
    wireframe: true,
  })
  const rim = new THREE.Mesh(rimGeo, rimMat)
  rim.position.set(0, 0, 0)
  visualGroup.add(rim)

  return { root, visualGroup, hullMat, finMat, core, rim, coreMat, rimMat }
}

const SUSSURRO_HP_PER_LEVEL = 0.5
const SUSSURRO_HP_CAP = 7
export function sussurroStatsForLevel(level = 1) {
  const steps = Math.max(0, (level || 1) - 1)
  return { hp: Math.min(SUSSURRO_HP_CAP, Math.round(SUSSURRO_HP + steps * SUSSURRO_HP_PER_LEVEL)) }
}

export function spawnSussurro(scene, rail, id, level = 1) {
  if (rail.isArena()) return null
  const stats = sussurroStatsForLevel(level)
  const { root, visualGroup, hullMat, finMat, core, rim, coreMat, rimMat } = createSussurroVisual()
  scene.add(root)

  const distanceAhead = SPAWN_DISTANCE_MIN + Math.random() * (SPAWN_DISTANCE_MAX - SPAWN_DISTANCE_MIN)
  const baseScreenX = (Math.random() * 2 - 1) * BOX_X
  const baseScreenY = (Math.random() * 2 - 1) * BOX_Y

  const enemy = {
    id,
    mesh: root,
    visualGroup,
    hullMat,
    finMat,
    coreMesh: core,
    rimMesh: rim,
    coreMat,
    rimMat,
    kind: SUSSURRO_KIND,
    dying: false,
    deathT: 0,
    hp: stats.hp,
    maxHp: stats.hp,
    level,
    hitRadius: SUSSURRO_HIT_RADIUS,
    depth: distanceAhead,
    screenX: baseScreenX,
    screenY: baseScreenY,
    baseScreenX,
    baseScreenY,
    clock: Math.random() * 5.0,
    state: SUSSURRO_STATES.CLOAKED_APPROACH,
    stateTimer: 0,
    approachDuration: 2.6 + Math.random() * 1.2,
    evadeDir: Math.random() < 0.5 ? -1 : 1,
    shotsRemaining: 0,
    shotTimer: 0,
    summonCooldown: 2.0, // Janela inicial antes de tentar primeira invocação
    summonRequested: false,
    fireTimer: 2.5,
    projectileOpts: {
      geometry: spectralProjectileGeo,
      material: spectralProjectileMat,
      damage: 1,
      speed: 26,
      hitRadius: 1.3,
      maxRange: 75,
      powerLevel: POWER_LEVEL_BASIC,
    },
  }

  projectSussurroToWorld(enemy, rail)
  return enemy
}

function projectSussurroToWorld(enemy, rail) {
  const frame = rail.getSpawnFrame ? rail.getSpawnFrame() : (rail.getFrameAt ? rail.getFrameAt(0) : null)
  if (!frame) return
  enemy.mesh.position.copy(frame.position)
    .addScaledVector(frame.forward, enemy.depth)
    .addScaledVector(frame.right, enemy.screenX)
    .addScaledVector(frame.up, enemy.screenY)
}

export function updateSussurro(enemy, dt, ctx, isDenseFog = false) {
  enemy.clock += dt
  enemy.stateTimer += dt
  enemy.summonCooldown = Math.max(0, enemy.summonCooldown - dt)

  const minCloakOpacity = isDenseFog ? OPACITY_DENSE_FOG_MIN : OPACITY_CLOAKED

  switch (enemy.state) {
    case SUSSURRO_STATES.CLOAKED_APPROACH: {
      // 1. Aproximação em arco oblíquo
      enemy.depth -= ADVANCE_SPEED * dt
      enemy.screenX = enemy.baseScreenX + Math.sin(enemy.clock * 1.4) * 3.6
      enemy.screenY = enemy.baseScreenY + Math.cos(enemy.clock * 0.9) * 1.6

      // Pulso fraco de camuflagem (sempre visível contra espaço preto e fog)
      const pulse = Math.sin(enemy.clock * 4.2) * 0.08
      const currentOpacity = THREE.MathUtils.clamp(minCloakOpacity + pulse, minCloakOpacity, 0.55)
      enemy.hullMat.opacity = currentOpacity
      enemy.finMat.opacity = currentOpacity
      enemy.rimMesh.rotation.z += dt * 1.2
      enemy.coreMesh.scale.setScalar(1.0 + Math.sin(enemy.clock * 5) * 0.15)

      // Transição para telegraph quando avança o bastante ou vence o tempo de aproximação
      if (enemy.stateTimer >= enemy.approachDuration && enemy.depth <= 70) {
        enemy.state = SUSSURRO_STATES.REVEAL_TELEGRAPH
        enemy.stateTimer = 0
        triggerSoundCue(ENEMY_SOUND_CUES.sussurro_cloak_pulse, { worldPos: enemy.mesh.position, visible: true })
        ctx?.effects?.telegraph?.(enemy.mesh.position, SUSSURRO_COLOR)
      }
      break
    }

    case SUSSURRO_STATES.REVEAL_TELEGRAPH: {
      // 2. Reveal Telegraph (~0.7s): silhueta se revela, núcleo expande
      const progress = Math.min(1, enemy.stateTimer / TELEGRAPH_DURATION)
      enemy.hullMat.opacity = THREE.MathUtils.lerp(minCloakOpacity, OPACITY_REVEALED, progress)
      enemy.finMat.opacity = THREE.MathUtils.lerp(minCloakOpacity, OPACITY_REVEALED, progress)
      enemy.coreMesh.scale.setScalar(THREE.MathUtils.lerp(1.0, 1.65, progress))
      enemy.depth -= ADVANCE_SPEED * 0.5 * dt

      if (enemy.stateTimer >= TELEGRAPH_DURATION) {
        // Decide entre Summon (se cooldown venceu) e Attack (rajada espectral de 2 tiros)
        if (enemy.summonCooldown <= 0) {
          enemy.state = SUSSURRO_STATES.SUMMON
          enemy.stateTimer = 0
          enemy.summonCooldown = SUSSURRO_SUMMON_COOLDOWN
          enemy.summonRequested = true
        } else {
          enemy.state = SUSSURRO_STATES.ATTACK
          enemy.stateTimer = 0
          enemy.shotsRemaining = 1 // 1º tiro sai de imediato, 2º tiro agendado
          enemy.shotTimer = ATTACK_SHOT_INTERVAL
          if (ctx?.fireEnemyProjectile && ctx?.playerPosition) {
            ctx.fireEnemyProjectile(enemy, ctx.playerPosition)
            triggerSoundCue(ENEMY_SOUND_CUES.blaster_fire, { enemyId: enemy.id, kind: enemy.kind, worldPos: enemy.mesh.position })
          }
        }
      }
      break
    }

    case SUSSURRO_STATES.ATTACK: {
      // 3. Rajada espectral de 2 tiros com stagger ~0.18s
      enemy.depth -= ADVANCE_SPEED * 0.3 * dt
      enemy.shotTimer -= dt
      if (enemy.shotsRemaining > 0 && enemy.shotTimer <= 0) {
        enemy.shotsRemaining -= 1
        enemy.shotTimer = ATTACK_SHOT_INTERVAL
        if (ctx?.fireEnemyProjectile && ctx?.playerPosition) {
          ctx.fireEnemyProjectile(enemy, ctx.playerPosition)
          triggerSoundCue(ENEMY_SOUND_CUES.blaster_fire, { enemyId: enemy.id, kind: enemy.kind, worldPos: enemy.mesh.position })
        }
      }

      if (enemy.shotsRemaining <= 0 && enemy.stateTimer >= 0.42) {
        enemy.state = SUSSURRO_STATES.EVADE
        enemy.stateTimer = 0
        enemy.evadeDir *= -1
      }
      break
    }

    case SUSSURRO_STATES.SUMMON: {
      // 4. Invocação com feedback visível
      ctx?.effects?.shockwave?.(enemy.mesh.position, SUSSURRO_COLOR, 0.9)
      triggerSoundCue(ENEMY_SOUND_CUES.sussurro_summon, { worldPos: enemy.mesh.position })
      enemy.state = SUSSURRO_STATES.EVADE
      enemy.stateTimer = 0
      break
    }

    case SUSSURRO_STATES.EVADE: {
      // 5. Deslocamento lateral em arco e volta gradual ao cloak
      const evadeProgress = Math.min(1, enemy.stateTimer / EVADE_DURATION)
      enemy.screenX += enemy.evadeDir * 7.5 * dt
      enemy.screenY += Math.sin(enemy.clock * 2) * 2.0 * dt
      enemy.depth -= ADVANCE_SPEED * 0.7 * dt

      // Fade suave de volta ao cloak
      enemy.hullMat.opacity = THREE.MathUtils.lerp(OPACITY_REVEALED, minCloakOpacity, evadeProgress)
      enemy.finMat.opacity = THREE.MathUtils.lerp(OPACITY_REVEALED, minCloakOpacity, evadeProgress)
      enemy.coreMesh.scale.setScalar(THREE.MathUtils.lerp(1.65, 1.0, evadeProgress))

      if (enemy.stateTimer >= EVADE_DURATION) {
        enemy.baseScreenX = enemy.screenX
        enemy.baseScreenY = enemy.screenY
        enemy.approachDuration = 2.4 + Math.random() * 1.0
        enemy.state = SUSSURRO_STATES.CLOAKED_APPROACH
        enemy.stateTimer = 0
      }
      break
    }
  }

  const rail = ctx?.rail || ctx
  projectSussurroToWorld(enemy, rail)
}

export function sussurroShouldSummon(enemy) {
  if (enemy.summonRequested) {
    enemy.summonRequested = false
    return true
  }
  return false
}

export function disposeSussurro() {
  bodyGeo.dispose()
  finsGeo.dispose()
  finLeftGeo.dispose()
  finRightGeo.dispose()
  coreGeo.dispose()
  rimGeo.dispose()
  spectralProjectileGeo.dispose()
  spectralProjectileMat.dispose()
}
