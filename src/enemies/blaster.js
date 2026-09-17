import * as THREE from 'three'
import { PASS_BEHIND } from './shared.js'

// ============ BLASTER — caças estelares genéricos ============
// Modelos unificados em cone 4 faces (+10% maiores), diferenciados por cores saturadas e vibrantes.
// Ao completar 4 ataques, puxam para cima e vão embora voando sem teleguiar.
// Proibidos de empacar ao lado ou atrás do jogador.
export const BLASTER_KIND = 'blaster'
export const BLASTER_HIT_RADIUS = 2.28 // 2.07 * 1.10
export const BLASTER_DEATH_DURATION = 0.2
export const BLASTER_KILL_BONUS = 30

export const BLASTER_SPAWN_DISTANCE_MIN = 45
export const BLASTER_SPAWN_DISTANCE_MAX = 75
export const BLASTER_BOX_X = 5.2
export const BLASTER_BOX_Y = 3.4

const MAX_SCREEN_X = 5.4
const MAX_SCREEN_Y = 3.5

const ENEMY_TURN_RATE = 1.6
const ENEMY_ORBIT_RADIUS_MIN = 12
const ENEMY_ORBIT_RADIUS_MAX = 22
const ENEMY_ORBIT_ANGULAR_SPEED = 0.8

// 6 variações com cores ultra-vibrantes e componentes emissivos para alta visibilidade no espaço negro
export const BLASTER_PROFILES = [
  { id: 'orbit', color: 0x00e5ff, emissive: 0x005588 },    // Ciano elétrico
  { id: 'advance', color: 0xff1744, emissive: 0x880018 },  // Vermelho puro/escarlate
  { id: 'slow', color: 0x00e676, emissive: 0x006622 },     // Verde neon
  { id: 'follow', color: 0xff9100, emissive: 0x773300 },   // Âmbar dourado
  { id: 'circular', color: 0xffffff, emissive: 0x666666 }, // Branco brilhante
  { id: 'evasive', color: 0xd500f9, emissive: 0x660088 },  // Magenta/roxo elétrico
]
export const BLASTER_PROFILE_COLOR = new Map(BLASTER_PROFILES.map((p) => [p.id, p.color]))
const BLASTER_PROFILE_SPEED_RANGE = {
  orbit: [0.45, 0.70],
  advance: [0.80, 0.95],
  slow: [0.15, 0.30],
  follow: [0.45, 0.65],
  circular: [0.45, 0.70],
  evasive: [0.50, 0.75],
}
const ARENA_FOLLOW_STANDOFF = 18
const CIRCULAR_ANGULAR_SPEED = 1.4
const CIRCULAR_SHRINK_RATE = 0.6
const CIRCULAR_MIN_RADIUS = 1.2
const EVASIVE_JUKE_INTERVAL_MIN = 0.8
const EVASIVE_JUKE_INTERVAL_MAX = 1.6

const RAIL_ORBIT_RADIUS = 2.0
const RAIL_ORBIT_SPEED = 1.0
const RAIL_ADVANCE_SPEED = 12
const RAIL_SLOW_SPEED = 6.0
const RAIL_CIRCULAR_DRIFT_SPEED = 5.2

// Geometria clássica unificada do caça (+10% maior: 1.265 raio, 2.783 altura)
const enemyGeometry = new THREE.ConeGeometry(1.265, 2.783, 4)
enemyGeometry.rotateX(Math.PI / 2)

const profileMaterials = new Map(
  BLASTER_PROFILES.map((p) => [
    p.id,
    new THREE.MeshPhongMaterial({
      color: p.color,
      emissive: p.emissive,
      emissiveIntensity: 0.75,
      flatShading: true,
    }),
  ]),
)

function rerollJukeDir(enemy, frame) {
  enemy.jukeTimer = EVASIVE_JUKE_INTERVAL_MIN + Math.random() * (EVASIVE_JUKE_INTERVAL_MAX - EVASIVE_JUKE_INTERVAL_MIN)
  const angle = Math.random() * Math.PI * 2
  enemy.jukeDir.set(0, 0, 0)
    .addScaledVector(frame.right, Math.cos(angle))
    .addScaledVector(frame.up, Math.sin(angle))
}

function projectBlasterToWorld(enemy, rail) {
  const frame = rail.getSpawnFrame()
  enemy.mesh.position.copy(frame.position)
    .addScaledVector(frame.forward, enemy.depth + (enemy.recoilZ || 0))
    .addScaledVector(frame.right, enemy.screenX)
    .addScaledVector(frame.up, enemy.screenY)
}

export function spawnBlaster(scene, rail, id, opts = {}) {
  const distanceAhead = opts.depth ?? (BLASTER_SPAWN_DISTANCE_MIN + Math.random() * (BLASTER_SPAWN_DISTANCE_MAX - BLASTER_SPAWN_DISTANCE_MIN))
  const screenX = opts.screenX ?? ((Math.random() * 2 - 1) * BLASTER_BOX_X)
  const screenY = opts.screenY ?? ((Math.random() * 2 - 1) * BLASTER_BOX_Y)
  const profileId = opts.profile ?? BLASTER_PROFILES[Math.floor(Math.random() * BLASTER_PROFILES.length)].id
  const profile = BLASTER_PROFILES.find((p) => p.id === profileId) ?? BLASTER_PROFILES[0]

  const mesh = new THREE.Mesh(enemyGeometry, profileMaterials.get(profile.id))
  scene.add(mesh)

  const [speedMin, speedMax] = BLASTER_PROFILE_SPEED_RANGE[profile.id]
  const enemy = {
    id,
    mesh,
    kind: BLASTER_KIND,
    dying: false,
    deathT: 0,
    hp: 2,
    maxHp: 2,
    fireTimer: null,
    shotsFired: 0,
    disengaging: false,
    profile: profile.id,
    speedFactor: speedMin + Math.random() * (speedMax - speedMin),
    depth: distanceAhead,
    screenX,
    screenY,
    orbitCenterX: screenX,
    orbitCenterY: screenY,
    orbitRadius: ENEMY_ORBIT_RADIUS_MIN + Math.random() * (ENEMY_ORBIT_RADIUS_MAX - ENEMY_ORBIT_RADIUS_MIN),
    orbitAngle: Math.random() * Math.PI * 2,
    orbitDir: Math.random() < 0.5 ? 1 : -1,
    jukeTimer: 0,
    jukeAngle: Math.random() * Math.PI * 2,
    jukeDir: new THREE.Vector3(),
    targetScreenX: screenX,
    targetScreenY: screenY,
    moveDir: null,
    recoilZ: 0,
    wingBroken: false,
    tumbleSpin: false,
    tumbleRollSpeed: 0,
    isLeader: !!opts.isLeader,
    squadronId: opts.squadronId ?? null,
  }

  projectBlasterToWorld(enemy, rail)
  return enemy
}

export function updateBlasterArenaMovement(enemy, dt, playerPosition, frame, speedCap) {
  const chaseSpeed = (enemy.speedFactor ?? 0.6) * speedCap

  // Após 4 ataques: sobe e foge em alta velocidade sem teleguiar
  if (enemy.disengaging) {
    const escapeDir = (enemy.moveDir || new THREE.Vector3(0, 1, 0)).clone()
    escapeDir.y = Math.max(0.5, escapeDir.y + dt * 1.5)
    escapeDir.normalize()
    enemy.moveDir = escapeDir
    enemy.mesh.position.addScaledVector(escapeDir, chaseSpeed * 1.8 * dt)
    return
  }

  let desiredDir
  if (enemy.profile === 'orbit' || enemy.profile === 'circular') {
    const angularSpeed = enemy.profile === 'circular' ? CIRCULAR_ANGULAR_SPEED : ENEMY_ORBIT_ANGULAR_SPEED
    enemy.orbitAngle += angularSpeed * enemy.orbitDir * dt
    if (enemy.profile === 'circular') {
      enemy.orbitRadius = Math.max(CIRCULAR_MIN_RADIUS, enemy.orbitRadius - CIRCULAR_SHRINK_RATE * dt)
    }
    const orbitPoint = playerPosition.clone()
      .addScaledVector(frame.right, Math.cos(enemy.orbitAngle) * enemy.orbitRadius)
      .addScaledVector(frame.up, Math.sin(enemy.orbitAngle) * enemy.orbitRadius)
    desiredDir = orbitPoint.sub(enemy.mesh.position)
  } else if (enemy.profile === 'follow') {
    const toPlayer = playerPosition.clone().sub(enemy.mesh.position)
    desiredDir = toPlayer.length() > ARENA_FOLLOW_STANDOFF ? toPlayer : toPlayer.multiplyScalar(-1)
  } else if (enemy.profile === 'evasive') {
    if ((enemy.jukeTimer -= dt) <= 0) rerollJukeDir(enemy, frame)
    desiredDir = playerPosition.clone().sub(enemy.mesh.position).normalize().add(enemy.jukeDir)
  } else {
    desiredDir = playerPosition.clone().sub(enemy.mesh.position)
  }

  if (desiredDir.lengthSq() > 1e-4) {
    desiredDir.normalize()
    if (!enemy.moveDir) enemy.moveDir = desiredDir.clone()
    enemy.moveDir.lerp(desiredDir, Math.min(1, ENEMY_TURN_RATE * dt))
    if (enemy.moveDir.lengthSq() > 1e-6) enemy.moveDir.normalize()
    enemy.mesh.position.addScaledVector(enemy.moveDir, chaseSpeed * dt)
  }
  enemy.mesh.lookAt(playerPosition)
}

export function triggerBlasterRecoil(enemy) {
  if (!enemy) return
  enemy.recoilZ = -0.3
}

export function breakBlasterWing(enemy) {
  if (!enemy || enemy.wingBroken) return null
  enemy.wingBroken = true
  enemy.tumbleSpin = true
  enemy.tumbleRollSpeed = (Math.random() < 0.5 ? 1 : -1) * (3.5 + Math.random() * 2)
  return { worldPos: enemy.mesh.position.clone(), color: blasterColor(enemy) }
}

export function updateBlasterRailMovement(enemy, dt, rail) {
  // Recuo elástico de disparo
  if (enemy.recoilZ < 0) {
    enemy.recoilZ = Math.min(0, enemy.recoilZ + dt * 4.0)
  }

  // Tumble spin suave ao sofrer impacto
  if (enemy.tumbleSpin) {
    enemy.mesh.rotation.z += enemy.tumbleRollSpeed * dt
    enemy.depth -= RAIL_ADVANCE_SPEED * dt
    enemy.screenX = THREE.MathUtils.clamp(enemy.screenX + (enemy.tumbleRollSpeed > 0 ? 0.6 : -0.6) * dt, -MAX_SCREEN_X, MAX_SCREEN_X)
    projectBlasterToWorld(enemy, rail)
    return
  }

  // APÓS 4 DISPAROS: sobe para cima do jogador e vai embora voando sem teleguiar
  if (enemy.disengaging) {
    enemy.screenY += 12.0 * dt
    enemy.depth -= 16.0 * dt
    enemy.mesh.rotation.x = -0.35 // empinado para cima
    projectBlasterToWorld(enemy, rail)
    return
  }

  if (enemy.profile === 'orbit') {
    enemy.orbitAngle += RAIL_ORBIT_SPEED * enemy.orbitDir * dt
    enemy.depth -= RAIL_SLOW_SPEED * dt
    enemy.screenX = THREE.MathUtils.clamp(enemy.orbitCenterX + Math.cos(enemy.orbitAngle) * RAIL_ORBIT_RADIUS, -MAX_SCREEN_X, MAX_SCREEN_X)
    enemy.screenY = THREE.MathUtils.clamp(enemy.orbitCenterY + Math.sin(enemy.orbitAngle) * RAIL_ORBIT_RADIUS, -MAX_SCREEN_Y, MAX_SCREEN_Y)
    enemy.mesh.rotation.z = Math.sin(enemy.orbitAngle) * 0.35
  } else if (enemy.profile === 'circular') {
    enemy.orbitAngle += CIRCULAR_ANGULAR_SPEED * enemy.orbitDir * dt
    enemy.orbitRadius = Math.max(CIRCULAR_MIN_RADIUS, enemy.orbitRadius - CIRCULAR_SHRINK_RATE * dt)
    enemy.depth -= RAIL_CIRCULAR_DRIFT_SPEED * dt
    enemy.screenX = THREE.MathUtils.clamp(enemy.orbitCenterX + Math.cos(enemy.orbitAngle) * enemy.orbitRadius, -MAX_SCREEN_X, MAX_SCREEN_X)
    enemy.screenY = THREE.MathUtils.clamp(enemy.orbitCenterY + Math.sin(enemy.orbitAngle) * enemy.orbitRadius, -MAX_SCREEN_Y, MAX_SCREEN_Y)
    enemy.mesh.rotation.z = Math.sin(enemy.orbitAngle) * 0.4
  } else if (enemy.profile === 'advance') {
    enemy.depth -= RAIL_ADVANCE_SPEED * dt
  } else if (enemy.profile === 'slow') {
    enemy.depth -= RAIL_SLOW_SPEED * dt
  } else if (enemy.profile === 'follow') {
    // Proibido de ficar emparelhado: avança sempre para frente, acelerando na passagem
    const passSpeed = enemy.depth < 14 ? RAIL_ADVANCE_SPEED : RAIL_SLOW_SPEED
    enemy.depth -= passSpeed * dt
  } else if (enemy.profile === 'evasive') {
    if ((enemy.jukeTimer -= dt) <= 0) {
      enemy.jukeTimer = EVASIVE_JUKE_INTERVAL_MIN + Math.random() * (EVASIVE_JUKE_INTERVAL_MAX - EVASIVE_JUKE_INTERVAL_MIN)
      enemy.targetScreenX = (Math.random() * 2 - 1) * (MAX_SCREEN_X * 0.75)
      enemy.targetScreenY = (Math.random() * 2 - 1) * (MAX_SCREEN_Y * 0.75)
    }
    enemy.depth -= RAIL_SLOW_SPEED * dt
    const prevX = enemy.screenX
    enemy.screenX = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(enemy.screenX, enemy.targetScreenX, Math.min(1, dt * 2.2)),
      -MAX_SCREEN_X,
      MAX_SCREEN_X,
    )
    enemy.screenY = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(enemy.screenY, enemy.targetScreenY, Math.min(1, dt * 2.2)),
      -MAX_SCREEN_Y,
      MAX_SCREEN_Y,
    )
    enemy.mesh.rotation.z = THREE.MathUtils.clamp((enemy.screenX - prevX) * 4.0, -0.6, 0.6)
  }

  // Garantia absoluta contra ficar preso ao exato lado do jogador:
  // Ao atingir profundidade próxima (< 5.0u), acelera para ultrapassar e sair da tela
  if (enemy.depth < 5.0) {
    enemy.depth -= 14.0 * dt
  }

  projectBlasterToWorld(enemy, rail)
}

export function blasterPassBehind(enemy) {
  return PASS_BEHIND
}

export function blasterColor(enemy) {
  return BLASTER_PROFILE_COLOR.get(enemy.profile) ?? BLASTER_PROFILES[0].color
}

export function disposeBlaster() {
  enemyGeometry.dispose()
  for (const m of profileMaterials.values()) m.dispose()
}
