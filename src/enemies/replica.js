import * as THREE from 'three'
import { randomSpawnPositionOnPath, POWER_LEVEL_BASIC } from './shared.js'
import { ENEMY_SOUND_CUES, triggerSoundCue } from '../audio-cues.js'

// ============ RÉPLICA OVERHAUL (FASE 4) ============
// Cópia corrompida da nave do jogador:
// - Silhueta com fuselagem, asas, motores e canhões duplos
// - Material espectral violeta/ciano com ruído e duplicação glitch
// - Perseguição lateral com atraso histórico (~0.4s)
// - Rajada ofensiva de 3 tiros (stagger ~0.12s, telegraph ~0.35s, cooldown 2.2-3.2s)
// - Mira preditiva sobre a posição futura do jogador
export const REPLICA_KIND = 'replica'
export const REPLICA_COLOR = 0xba68c8 // Violeta espectral corrompido
export const REPLICA_HIT_RADIUS = 2.05
export const REPLICA_DEATH_DURATION = 0.3
export const REPLICA_HP = 4
export const REPLICA_KILL_BONUS = 40

const SPAWN_DISTANCE_MIN = 54
const SPAWN_DISTANCE_MAX = 84
const BOX_X = 6
const BOX_Y = 4

const STANDOFF = 48
const STANDOFF_EASE_RATE = 2.8
const DELAY_S = 0.4
const HISTORY_MAX_AGE_S = DELAY_S + 0.35

export const REPLICA_BURST_COUNT = 3
export const REPLICA_BURST_INTERVAL = 0.12
export const REPLICA_TELEGRAPH_DURATION = 0.35
export const REPLICA_COOLDOWN_MIN = 2.2
export const REPLICA_COOLDOWN_MAX = 3.2

// Geometrias da cópia corrompida (fuselagem, asas delta, motores duplos, canhões duplos)
const fuselageGeo = new THREE.ConeGeometry(0.55, 3.2, 4)
fuselageGeo.rotateX(Math.PI / 2)

const wingsGeo = new THREE.BoxGeometry(3.6, 0.08, 1.35)
const engineGeo = new THREE.CylinderGeometry(0.18, 0.24, 0.85, 6)
engineGeo.rotateX(Math.PI / 2)

const cannonGeo = new THREE.CylinderGeometry(0.08, 0.11, 1.3, 5)
cannonGeo.rotateX(Math.PI / 2)

// Wireframe/glitch echo duplicado
const echoFuselageGeo = new THREE.ConeGeometry(0.62, 3.4, 4)
echoFuselageGeo.rotateX(Math.PI / 2)
const echoWingsGeo = new THREE.BoxGeometry(3.85, 0.12, 1.45)

const replicaProjectileGeo = new THREE.ConeGeometry(0.24, 1.25, 5)
replicaProjectileGeo.rotateX(Math.PI / 2)
const replicaProjectileMat = new THREE.MeshBasicMaterial({ color: 0xba68c8 })

function createReplicaVisual() {
  const root = new THREE.Group()
  const visualGroup = new THREE.Group()
  root.add(visualGroup)

  const hullMat = new THREE.MeshPhongMaterial({
    color: 0x311b92,
    emissive: 0x7b1fa2,
    emissiveIntensity: 0.88,
    flatShading: true,
    transparent: true,
    opacity: 0.88,
  })

  const cannonMat = new THREE.MeshPhongMaterial({
    color: 0x1a0033,
    emissive: 0xba68c8,
    emissiveIntensity: 0.65,
    flatShading: true,
  })

  const engineMat = new THREE.MeshBasicMaterial({ color: 0xe040fb })

  const echoMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    wireframe: true,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
  })

  // 1. Fuselagem principal
  const fuselage = new THREE.Mesh(fuselageGeo, hullMat)
  visualGroup.add(fuselage)

  // 2. Asas delta
  const wings = new THREE.Mesh(wingsGeo, hullMat)
  wings.position.set(0, 0, -0.3)
  visualGroup.add(wings)

  // 3. Motores traseiros duplos
  const engineL = new THREE.Mesh(engineGeo, engineMat)
  engineL.position.set(-0.65, 0.05, -1.5)
  const engineR = new THREE.Mesh(engineGeo, engineMat)
  engineR.position.set(0.65, 0.05, -1.5)
  visualGroup.add(engineL, engineR)

  // 4. Canhões duplos na ponta das asas
  const cannonL = new THREE.Mesh(cannonGeo, cannonMat)
  cannonL.position.set(-1.65, 0, 0.4)
  const cannonR = new THREE.Mesh(cannonGeo, cannonMat)
  cannonR.position.set(1.65, 0, 0.4)
  visualGroup.add(cannonL, cannonR)

  // 5. Casca de eco corrompida / ruído espectral
  const echoGroup = new THREE.Group()
  const echoF = new THREE.Mesh(echoFuselageGeo, echoMat)
  const echoW = new THREE.Mesh(echoWingsGeo, echoMat)
  echoW.position.set(0, 0, -0.3)
  echoGroup.add(echoF, echoW)
  visualGroup.add(echoGroup)

  return { root, visualGroup, echoGroup, hullMat, cannonMat, engineMat, echoMat }
}

const REPLICA_HP_PER_LEVEL = 0.5
const REPLICA_HP_CAP = 8
export function replicaStatsForLevel(level = 1) {
  const steps = Math.max(0, (level || 1) - 1)
  return { hp: Math.min(REPLICA_HP_CAP, Math.round(REPLICA_HP + steps * REPLICA_HP_PER_LEVEL)) }
}

export function spawnReplica(scene, rail, id, level = 1) {
  if (rail.isArena()) return null
  const stats = replicaStatsForLevel(level)
  const position = randomSpawnPositionOnPath(rail, SPAWN_DISTANCE_MIN, SPAWN_DISTANCE_MAX, BOX_X, BOX_Y)
  const { root, visualGroup, echoGroup, hullMat, cannonMat, engineMat, echoMat } = createReplicaVisual()
  root.position.copy(position)
  scene.add(root)

  triggerSoundCue(ENEMY_SOUND_CUES.replica_spawn, { worldPos: position })

  return {
    id,
    mesh: root,
    visualGroup,
    echoGroup,
    hullMat,
    cannonMat,
    engineMat,
    echoMat,
    kind: REPLICA_KIND,
    dying: false,
    deathT: 0,
    hp: stats.hp,
    maxHp: stats.hp,
    level,
    hitRadius: REPLICA_HIT_RADIUS,
    clock: 0,
    history: [],
    alongDistance: SPAWN_DISTANCE_MIN,
    fireTimer: 2.2 + Math.random() * 0.8, // Timer real e finito (Fase 4.4)
    telegraphTriggered: false,
    burstShotsRemaining: 0,
    burstShotTimer: 0,
    projectileOpts: {
      geometry: replicaProjectileGeo,
      material: replicaProjectileMat,
      damage: 1,
      speed: 30,
      hitRadius: 1.25,
      maxRange: 80,
      powerLevel: POWER_LEVEL_BASIC,
    },
  }
}

function fireReplicaShot(enemy, rail, frame, ctx) {
  const playerVel = rail.getPlayerVelocity ? rail.getPlayerVelocity() : new THREE.Vector2(0, 0)
  const predictedPos = ctx.playerPosition.clone()
    .addScaledVector(frame.right, playerVel.x * 0.42)
    .addScaledVector(frame.up, playerVel.y * 0.42)
  predictedPos.addScaledVector(frame.right, (Math.random() - 0.5) * 0.75)
  predictedPos.addScaledVector(frame.up, (Math.random() - 0.5) * 0.75)

  ctx.fireEnemyProjectile(enemy, predictedPos)
  triggerSoundCue(ENEMY_SOUND_CUES.blaster_fire, { enemyId: enemy.id, kind: enemy.kind, worldPos: enemy.mesh.position })
}

export function updateReplicaMovement(enemy, dt, rail, frame, ctx = null) {
  enemy.clock += dt

  // 1. Histórico lateral com delay característico (~0.4s)
  const lateral = rail.getPlayerLateral()
  enemy.history.push({ t: enemy.clock, x: lateral.x, y: lateral.y })
  while (enemy.history.length > 2 && enemy.history[1].t < enemy.clock - HISTORY_MAX_AGE_S) {
    enemy.history.shift()
  }

  const targetT = enemy.clock - DELAY_S
  let delayed = enemy.history[0] || { x: 0, y: 0 }
  for (const sample of enemy.history) {
    if (sample.t > targetT) break
    delayed = sample
  }

  enemy.alongDistance += (STANDOFF - enemy.alongDistance) * Math.min(1, STANDOFF_EASE_RATE * dt)
  enemy.mesh.position.copy(frame.position)
    .addScaledVector(frame.right, delayed.x)
    .addScaledVector(frame.up, delayed.y)
    .addScaledVector(frame.forward, enemy.alongDistance)

  // 2. Efeito visual de ruído/glitch espectral no eco duplicado
  if (enemy.echoGroup) {
    const jitterX = Math.sin(enemy.clock * 32) * 0.08
    const jitterY = Math.cos(enemy.clock * 26) * 0.06
    enemy.echoGroup.position.set(jitterX, jitterY, (Math.sin(enemy.clock * 18) - 0.5) * 0.1)
  }

  // 3. Comportamento ofensivo: telegraph ~0.35s e rajada de 3 tiros preditivos
  if (ctx && ctx.fireEnemyProjectile && ctx.playerPosition) {
    const distToPlayer = enemy.mesh.position.distanceTo(ctx.playerPosition)
    const inFireRange = distToPlayer > 18 && distToPlayer < 75

    // Telegraph nos últimos 0.35s do cooldown
    if (inFireRange && enemy.fireTimer <= REPLICA_TELEGRAPH_DURATION && !enemy.telegraphTriggered) {
      enemy.telegraphTriggered = true
      ctx?.effects?.telegraph?.(enemy.mesh.position, REPLICA_COLOR)
      triggerSoundCue(ENEMY_SOUND_CUES.blaster_telegraph, { enemyId: enemy.id, kind: enemy.kind, worldPos: enemy.mesh.position })
    }

    // Gerencia rajada ativa
    if (enemy.burstShotsRemaining > 0) {
      enemy.burstShotTimer -= dt
      if (enemy.burstShotTimer <= 0) {
        enemy.burstShotsRemaining -= 1
        enemy.burstShotTimer = REPLICA_BURST_INTERVAL
        fireReplicaShot(enemy, rail, frame, ctx)
      }
    } else {
      enemy.fireTimer -= dt
      if (enemy.fireTimer <= 0 && inFireRange) {
        // Inicia rajada de 3 tiros (1º imediato + 2 escalonados a 0.12s)
        enemy.burstShotsRemaining = REPLICA_BURST_COUNT - 1
        enemy.burstShotTimer = REPLICA_BURST_INTERVAL
        enemy.telegraphTriggered = false
        enemy.fireTimer = REPLICA_COOLDOWN_MIN + Math.random() * (REPLICA_COOLDOWN_MAX - REPLICA_COOLDOWN_MIN)
        fireReplicaShot(enemy, rail, frame, ctx)
      }
    }
  }
}

export function replicaPassBehind() {
  return -25 // Dá espaço para standoff
}

export function disposeReplica() {
  fuselageGeo.dispose()
  wingsGeo.dispose()
  engineGeo.dispose()
  cannonGeo.dispose()
  echoFuselageGeo.dispose()
  echoWingsGeo.dispose()
  replicaProjectileGeo.dispose()
  replicaProjectileMat.dispose()
}
