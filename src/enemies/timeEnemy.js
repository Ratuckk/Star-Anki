import * as THREE from 'three'
import { FORWARD_AXIS, PASS_BEHIND, spawnPositionForEnemy } from './shared.js'

// ============ AMPULHETA (redutor de tempo) — normal + variante "mega" ============
export const TIME_KIND = 'time'
export const TIME_COLOR = 0xd500f9 // Magenta neon vibrante
const TIME_EMISSIVE = 0x660088
// Pedido do usuário: estilo Star Fox 64 — surge visível a 45-75u
const SPAWN_DISTANCE_MIN = 45
const SPAWN_DISTANCE_MAX = 75
const BOX_X = 7
const BOX_Y = 5
export const TIME_HIT_RADIUS = 1.98 // 1.8 * 1.10 (+10%)
export const TIME_DEATH_DURATION = 0.2
const TIME_MAX_HP = 5
const TIME_SPIN_RATE = 1.6 // rad/s, gira em cima do próprio eixo
const TIME_SPEED_FACTOR = 0.3
export const TIME_REDUCTION_MIN_MS = 10000
export const TIME_REDUCTION_MAX_MS = 30000

// Variante mega
const TIME_MEGA_COLOR = 0xaa00ff // Roxo elétrico vibrante
const TIME_MEGA_SCALE = 1.76 // 1.6 * 1.10 (+10%)
const TIME_MEGA_HP = 10
export const TIME_MEGA_PASS_BEHIND = PASS_BEHIND
const TIME_MEGA_LASER_SPEED = 50
const TIME_MEGA_LASER_HIT_RADIUS = 2.2
const TIME_MEGA_LASER_MAX_RANGE = 180
const TIME_MEGA_SHIELD_DAMAGE = 4

// Geometria da ampulheta +10% maior (0.99 raio, 1.43 altura)
const timeEnemyGeometry = new THREE.ConeGeometry(0.99, 1.43, 4)
const timeEnemyMaterial = new THREE.MeshPhongMaterial({
  color: TIME_COLOR,
  emissive: TIME_EMISSIVE,
  emissiveIntensity: 0.8,
  flatShading: true,
})
const timeMegaMaterial = new THREE.MeshPhongMaterial({
  color: TIME_MEGA_COLOR,
  emissive: 0x4a0072,
  emissiveIntensity: 0.85,
  flatShading: true,
})

function buildMesh(material) {
  const top = new THREE.Mesh(timeEnemyGeometry, material)
  top.position.y = 0.715
  top.rotation.x = Math.PI
  const bottom = new THREE.Mesh(timeEnemyGeometry, material)
  bottom.position.y = -0.715
  const group = new THREE.Group()
  group.add(top, bottom)
  return group
}

export function spawnTimeEnemy(scene, rail, id) {
  const position = spawnPositionForEnemy(rail, SPAWN_DISTANCE_MIN, SPAWN_DISTANCE_MAX, BOX_X, BOX_Y)
  const mesh = buildMesh(timeEnemyMaterial)
  mesh.position.copy(position)
  scene.add(mesh)
  return {
    id, mesh, kind: TIME_KIND, dying: false, deathT: 0,
    hp: TIME_MAX_HP, maxHp: TIME_MAX_HP, fireTimer: null,
    speedFactor: TIME_SPEED_FACTOR,
  }
}

export function spawnTimeEnemyMega(scene, rail, id) {
  const position = spawnPositionForEnemy(rail, SPAWN_DISTANCE_MIN, SPAWN_DISTANCE_MAX, BOX_X, BOX_Y)
  const mesh = buildMesh(timeMegaMaterial)
  mesh.position.copy(position)
  mesh.scale.setScalar(TIME_MEGA_SCALE)
  scene.add(mesh)
  return {
    id, mesh, kind: TIME_KIND, dying: false, deathT: 0,
    hp: TIME_MEGA_HP, maxHp: TIME_MEGA_HP, fireTimer: null,
    speedFactor: TIME_SPEED_FACTOR,
    variant: 'mega',
  }
}

export function updateTimeSpin(enemy, dt) {
  enemy.mesh.rotateY(dt * TIME_SPIN_RATE)
}

export function timePassBehind(enemy) {
  return enemy.variant === 'mega' ? TIME_MEGA_PASS_BEHIND : PASS_BEHIND
}

export function timeColor(enemy) {
  return enemy.variant === 'mega' ? TIME_MEGA_COLOR : TIME_COLOR
}

// dispara um laser reto (mesma técnica visual do laser do chefe) em vez do cone de projétil
// comum — só a variante mega faz isso. Retorna true quando assumiu o disparo (index.js não
// deve cair no fireEnemyProjectile padrão nesse caso).
export function timeFire(scene, enemy, playerPosition, ctx) {
  if (enemy.variant !== 'mega') return false
  const startPos = enemy.mesh.position.clone()
  const direction = playerPosition.clone().sub(startPos).normalize()
  const geo = new THREE.ConeGeometry(0.45, 9, 8)
  geo.rotateX(Math.PI / 2)
  const mat = new THREE.MeshBasicMaterial({
    color: TIME_MEGA_COLOR, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.copy(startPos)
  mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, direction)
  scene.add(mesh)
  ctx.pushLaser({
    mesh, geo, mat, velocity: direction.multiplyScalar(TIME_MEGA_LASER_SPEED), traveled: 0,
    maxRange: TIME_MEGA_LASER_MAX_RANGE, hitRadius: TIME_MEGA_LASER_HIT_RADIUS,
    shieldDamage: TIME_MEGA_SHIELD_DAMAGE,
  })
  return true
}

export function disposeTimeEnemy() {
  timeEnemyGeometry.dispose()
  timeEnemyMaterial.dispose()
  timeMegaMaterial.dispose()
}
