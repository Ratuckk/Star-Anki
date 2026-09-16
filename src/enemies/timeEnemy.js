import * as THREE from 'three'
import { FORWARD_AXIS, PASS_BEHIND, spawnPositionForEnemy } from './shared.js'

// ============ AMPULHETA (redutor de tempo) — normal + variante "mega" ============
export const TIME_KIND = 'time'
export const TIME_COLOR = 0xb026ff
const TIME_EMISSIVE = 0x4b0082
// pedido do usuário: "a maioria dos inimigos fica tão longe" — reduzido pra engajar mais cedo.
// v0.62.2: alargado de 60-100 pra 50-150 pelo mesmo motivo do Blaster (ver comentário lá) — dar
// variação real de distância a cada spawn sem repetir o problema antigo do teto alto demais.
const SPAWN_DISTANCE_MIN = 50
const SPAWN_DISTANCE_MAX = 150
const BOX_X = 7
const BOX_Y = 5
export const TIME_HIT_RADIUS = 1.8
export const TIME_DEATH_DURATION = 0.2
const TIME_MAX_HP = 5
const TIME_SPIN_RATE = 1.6 // rad/s, gira em cima do próprio eixo
// default de quem não seta speedFactor é 0.6 (movimento genérico de arena) — a ampulheta fica
// bem abaixo disso, "ainda mais lenta" (pedido do usuário)
const TIME_SPEED_FACTOR = 0.3
export const TIME_REDUCTION_MIN_MS = 10000
export const TIME_REDUCTION_MAX_MS = 30000

// v0.34.0: variante grande pedida pelo usuário — mais vida, fica mais tempo em tela (mesmo
// truque do perfil "follow" do Blaster: PASS_BEHIND bem mais tolerante) e troca o projétil
// comum por um laser reto que dá muito dano no escudo.
const TIME_MEGA_COLOR = 0x7a00e0 // roxo mais rico/escuro que o normal (0xb026ff)
const TIME_MEGA_SCALE = 1.6
const TIME_MEGA_HP = 10
export const TIME_MEGA_PASS_BEHIND = PASS_BEHIND * 4
const TIME_MEGA_LASER_SPEED = 50
const TIME_MEGA_LASER_HIT_RADIUS = 2.0
const TIME_MEGA_LASER_MAX_RANGE = 180
// >= SHIELD_MAX_CAP (player.js) — garante estourar o escudo cheio numa hitada só, mesmo com
// upgrade de carga extra de escudo
const TIME_MEGA_SHIELD_DAMAGE = 4

const timeEnemyGeometry = new THREE.ConeGeometry(0.9, 1.3, 4)
const timeEnemyMaterial = new THREE.MeshPhongMaterial({ color: TIME_COLOR, emissive: TIME_EMISSIVE, flatShading: true })
const timeMegaMaterial = new THREE.MeshPhongMaterial({ color: TIME_MEGA_COLOR, emissive: TIME_EMISSIVE, flatShading: true })

function buildMesh(material) {
  const top = new THREE.Mesh(timeEnemyGeometry, material)
  top.position.y = 0.65
  top.rotation.x = Math.PI
  const bottom = new THREE.Mesh(timeEnemyGeometry, material)
  bottom.position.y = -0.65
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
