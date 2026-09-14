import * as THREE from 'three'
import { PASS_BEHIND, spawnPositionForEnemy } from './shared.js'

// ============ BLASTER — vermelho comum atirador ============
// v0.34.0: nome formal da classe (antes só existia como kind:'red', sem identidade própria).
//
// v0.50.0 OVERHAUL: os 6 perfis de movimento (entregues na v0.33.1) agora também definem o
// TIRO. Antes daqui, todos os perfis usavam o mesmo `fireEnemyProjectile` genérico — a cor
// dizia só onde o inimigo ia estar, não o que ele ia atirar em você. Agora cada perfil tem um
// `fire` com (count / spread / velocidade / erro de mira / offset angular), lido pela função
// de tiro em `enemies/index.js`. A leitura completa passa a ser "viu laranja = vem rápido e
// atira rápido", "viu rosa = não chega perto mas não erra", etc.

export const BLASTER_KIND = 'blaster'
export const BLASTER_HIT_RADIUS = 1.8
export const BLASTER_DEATH_DURATION = 0.2
export const BLASTER_KILL_BONUS = 30
export const BLASTER_SPAWN_DISTANCE_MIN = 90
export const BLASTER_SPAWN_DISTANCE_MAX = 140
export const BLASTER_BOX_X = 7
export const BLASTER_BOX_Y = 5

const ENEMY_TURN_RATE = 1.6
const ENEMY_ORBIT_RADIUS_MIN = 14
const ENEMY_ORBIT_RADIUS_MAX = 26
const ENEMY_ORBIT_ANGULAR_SPEED = 0.8

// ============ PERFIS ============
// Cada perfil: cor do mesh (e do telegraph, via `blasterColor`) + identidade de movimento
// (updateBlasterArenaMovement / updateBlasterRailMovement) + identidade de TIRO (`fire`).
//
// `fire` campos:
//   count         — quantos projéteis disparam no mesmo instante (fan)
//   spreadDeg     — separação angular entre os projéteis do fan, em graus (0 = todos na mesma direção)
//   aimErrorDeg   — raio (máx) de erro aleatório em cima da direção "certa" (0 = mira perfeita)
//   speedMult     — multiplicador da velocidade base do projétil inimigo (1.0 = padrão)
//   aimOffsetDeg  — desvio SISTEMÁTICO do centro do fan em relação à direção do jogador
//                   (positivo = sentido horário). Usado pra dar "flavor" direcional a um perfil.
//
// A soma dos efeitos (fan + erro + offset) é o que dá personalidade ao perfil sem precisar de
// IA nova — tudo sai do mesmo loop de updateEnemies.
export const BLASTER_PROFILES = [
  {
    id: 'orbit', color: 0xff4d4d,
    fire: { count: 2, spreadDeg: 12, aimErrorDeg: 5, speedMult: 1.0, aimOffsetDeg: 0 },
  },
  {
    id: 'advance', color: 0xff7a29,
    fire: { count: 1, spreadDeg: 0, aimErrorDeg: 12, speedMult: 1.6, aimOffsetDeg: 0 },
  },
  {
    id: 'slow', color: 0x7a2020,
    fire: { count: 1, spreadDeg: 0, aimErrorDeg: 5, speedMult: 1.0, aimOffsetDeg: 0 },
  },
  {
    id: 'follow', color: 0xff2f8f,
    fire: { count: 1, spreadDeg: 0, aimErrorDeg: 0, speedMult: 1.0, aimOffsetDeg: 0 },
  },
  {
    id: 'circular', color: 0xc61aff,
    fire: { count: 1, spreadDeg: 0, aimErrorDeg: 5, speedMult: 1.0, aimOffsetDeg: 20 },
  },
  {
    id: 'evasive', color: 0xffb347,
    fire: { count: 1, spreadDeg: 0, aimErrorDeg: 40, speedMult: 1.0, aimOffsetDeg: 0 },
  },
]
export const BLASTER_PROFILE_COLOR = new Map(BLASTER_PROFILES.map((p) => [p.id, p.color]))
// mapa de fire por id — leitura O(1) na hora do disparo (sem find por nome)
export const BLASTER_PROFILE_FIRE = new Map(BLASTER_PROFILES.map((p) => [p.id, p.fire]))
const BLASTER_PROFILE_SPEED_RANGE = {
  orbit: [0.45, 0.75],
  advance: [0.85, 1.0],
  slow: [0.15, 0.3],
  follow: [0.5, 0.7],
  circular: [0.5, 0.8],
  evasive: [0.6, 0.9],
}
const ARENA_FOLLOW_STANDOFF = 18
const CIRCULAR_ANGULAR_SPEED = 2.2
const CIRCULAR_SHRINK_RATE = 1.2
const CIRCULAR_MIN_RADIUS = 6
const EVASIVE_JUKE_INTERVAL_MIN = 0.4
const EVASIVE_JUKE_INTERVAL_MAX = 0.9

const RAIL_ORBIT_RADIUS = 4.5
const RAIL_ORBIT_SPEED = 1.4
const RAIL_ADVANCE_SPEED = 9
const RAIL_SLOW_SPEED = 2
const RAIL_FOLLOW_SPEED = 7
const RAIL_FOLLOW_STANDOFF = 10
export const BLASTER_RAIL_FOLLOW_PASS_BEHIND = PASS_BEHIND * 5 // bem mais tolerante — esse perfil não "passa" fácil
const RAIL_CIRCULAR_DRIFT_SPEED = 3.2
const RAIL_EVASIVE_SPEED = 6

const enemyGeometry = new THREE.ConeGeometry(1, 2.2, 4)
enemyGeometry.rotateX(Math.PI / 2)
const profileMaterials = new Map(
  BLASTER_PROFILES.map((p) => [p.id, new THREE.MeshPhongMaterial({ color: p.color, flatShading: true })]),
)

// gira o "jukeDir" pra um novo ângulo lateral aleatório a cada intervalo — aproximação de
// "tentativa de desvio" (sem ler tiro do jogador de fato, só troca de rumo errático)
function rerollJukeDir(enemy, frame) {
  enemy.jukeTimer = EVASIVE_JUKE_INTERVAL_MIN + Math.random() * (EVASIVE_JUKE_INTERVAL_MAX - EVASIVE_JUKE_INTERVAL_MIN)
  const angle = Math.random() * Math.PI * 2
  enemy.jukeDir.set(0, 0, 0)
    .addScaledVector(frame.right, Math.cos(angle))
    .addScaledVector(frame.up, Math.sin(angle))
}

export function spawnBlaster(scene, rail, id) {
  const position = spawnPositionForEnemy(rail, BLASTER_SPAWN_DISTANCE_MIN, BLASTER_SPAWN_DISTANCE_MAX, BLASTER_BOX_X, BLASTER_BOX_Y)
  const profile = BLASTER_PROFILES[Math.floor(Math.random() * BLASTER_PROFILES.length)]
  const mesh = new THREE.Mesh(enemyGeometry, profileMaterials.get(profile.id))
  mesh.position.copy(position)
  scene.add(mesh)
  const [speedMin, speedMax] = BLASTER_PROFILE_SPEED_RANGE[profile.id]
  return {
    id, mesh, kind: BLASTER_KIND, dying: false, deathT: 0, hp: 2, maxHp: 2, fireTimer: null,
    profile: profile.id,
    speedFactor: speedMin + Math.random() * (speedMax - speedMin),
    railSpawnPos: position.clone(),
    orbitRadius: ENEMY_ORBIT_RADIUS_MIN + Math.random() * (ENEMY_ORBIT_RADIUS_MAX - ENEMY_ORBIT_RADIUS_MIN),
    orbitAngle: Math.random() * Math.PI * 2,
    orbitDir: Math.random() < 0.5 ? 1 : -1,
    jukeTimer: 0,
    jukeDir: new THREE.Vector3(),
    moveDir: null,
  }
}

export function updateBlasterArenaMovement(enemy, dt, playerPosition, frame, speedCap) {
  const chaseSpeed = (enemy.speedFactor ?? 0.6) * speedCap
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

export function updateBlasterRailMovement(enemy, dt, frame) {
  if (enemy.profile === 'orbit') {
    enemy.orbitAngle += RAIL_ORBIT_SPEED * enemy.orbitDir * dt
    enemy.mesh.position.copy(enemy.railSpawnPos)
      .addScaledVector(frame.right, Math.cos(enemy.orbitAngle) * RAIL_ORBIT_RADIUS)
      .addScaledVector(frame.up, Math.sin(enemy.orbitAngle) * RAIL_ORBIT_RADIUS)
  } else if (enemy.profile === 'circular') {
    enemy.orbitAngle += CIRCULAR_ANGULAR_SPEED * enemy.orbitDir * dt
    enemy.railSpawnPos.addScaledVector(frame.forward, -RAIL_CIRCULAR_DRIFT_SPEED * dt)
    enemy.mesh.position.copy(enemy.railSpawnPos)
      .addScaledVector(frame.right, Math.cos(enemy.orbitAngle) * RAIL_ORBIT_RADIUS)
      .addScaledVector(frame.up, Math.sin(enemy.orbitAngle) * RAIL_ORBIT_RADIUS)
  } else if (enemy.profile === 'advance') {
    enemy.mesh.position.addScaledVector(frame.forward, -RAIL_ADVANCE_SPEED * dt)
  } else if (enemy.profile === 'slow') {
    enemy.mesh.position.addScaledVector(frame.forward, -RAIL_SLOW_SPEED * dt)
  } else if (enemy.profile === 'follow') {
    const along = enemy.mesh.position.clone().sub(frame.position).dot(frame.forward)
    const correction = along > RAIL_FOLLOW_STANDOFF ? -1 : along < RAIL_FOLLOW_STANDOFF * 0.5 ? 1 : 0
    enemy.mesh.position.addScaledVector(frame.forward, correction * RAIL_FOLLOW_SPEED * dt)
  } else if (enemy.profile === 'evasive') {
    if ((enemy.jukeTimer -= dt) <= 0) rerollJukeDir(enemy, frame)
    enemy.mesh.position.addScaledVector(enemy.jukeDir, RAIL_EVASIVE_SPEED * dt)
  }
}

export function blasterPassBehind(enemy) {
  return enemy.profile === 'follow' ? BLASTER_RAIL_FOLLOW_PASS_BEHIND : PASS_BEHIND
}

export function blasterColor(enemy) {
  return BLASTER_PROFILE_COLOR.get(enemy.profile) ?? BLASTER_PROFILES[0].color
}

export function blasterFireConfig(enemy) {
  return BLASTER_PROFILE_FIRE.get(enemy.profile) ?? BLASTER_PROFILE_FIRE.get('orbit')
}

export function disposeBlaster() {
  enemyGeometry.dispose()
  for (const m of profileMaterials.values()) m.dispose()
}
