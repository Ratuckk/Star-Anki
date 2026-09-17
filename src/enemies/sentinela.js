import * as THREE from 'three'
import { PASS_BEHIND, FORWARD_AXIS, randomSpawnPositionOnPath } from './shared.js'

// ============ SENTINELA — inimigo quadrado inédito, só modo trilho ============
// v0.34.0: pedido do usuário — persegue o jogador mantendo distância (nunca passa por ele),
// dispara 4 "molduras" quadradas (borda causa dano, centro vazado é seguro pra atravessar) e
// depois vai embora. Só existe em trilho (guard no spawn, igual ao mini-swarm).
export const SENTINELA_KIND = 'sentinela'
export const SENTINELA_COLOR = 0x00d4ff
export const SENTINELA_HIT_RADIUS = 2.2 // 10% maior (era 2.0)
export const SENTINELA_DEATH_DURATION = 0.25
export const SENTINELA_HP = 10

const SPAWN_DISTANCE_MIN = 45
const SPAWN_DISTANCE_MAX = 70
const BOX_X = 6
const BOX_Y = 4

const ENGAGE_STANDOFF = 48 // distância-alvo fixa à frente da nave durante os 4 ataques
const LATERAL_TRACK_RATE = 7 // rastreamento lateral suave do jogador
const LEAVE_SPEED = 32 // velocidade de fuga após o 4º disparo
export const SENTINELA_SHOTS_TOTAL = 4
export const SENTINELA_FIRE_INTERVAL = 1.9 // intervalo entre os 4 disparos

export const SENTINELA_STATE_ENGAGING = 'engaging'
export const SENTINELA_STATE_LEAVING = 'leaving'

// ============ DIMENSÕES DA MOLDURA QUADRADA ============
// Abertura central: 5.2 x 5.2 (raio interno 2.6). Espaço seguro justo para a nave centralizada.
// Bordas sólidas luminosas: 3.8 de espessura (raio externo 6.4). Colidir com a borda causa dano real.
const GATE_INNER_HALF = 2.6
const GATE_OUTER_HALF = 6.4
const GATE_BORDER_WIDTH = 3.8
const GATE_BAR_THICKNESS = 0.4
const GATE_SPEED = 18 // velocidade equilibrada e legível (aproximação total ~40 u/s)
const GATE_DAMAGE = 1
const GATE_SHIELD_DAMAGE = 1
const GATE_COLOR = 0x00d4ff

// Sentinela em LEAVING voa para cima e para frente
const SENTINELA_LEAVE_DESPAWN_AHEAD = 160

// Modelo 3D 10% maior com emissivo neon vibrante
const geometry = new THREE.BoxGeometry(2.64, 2.64, 0.44)
const material = new THREE.MeshPhongMaterial({
  color: SENTINELA_COLOR,
  emissive: 0x005588,
  emissiveIntensity: 0.8,
  flatShading: true,
})

// Moldura: 4 barras sólidas luminosas + plano central translúcido
const gateBorderTopBottomGeo = new THREE.BoxGeometry(GATE_OUTER_HALF * 2, GATE_BORDER_WIDTH, GATE_BAR_THICKNESS)
const gateBorderSideGeo = new THREE.BoxGeometry(GATE_BORDER_WIDTH, GATE_INNER_HALF * 2, GATE_BAR_THICKNESS)
const gateBorderMaterial = new THREE.MeshBasicMaterial({
  color: 0x00f0ff,
  transparent: true,
  opacity: 0.95,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})

const gateCenterGeo = new THREE.PlaneGeometry(GATE_INNER_HALF * 2, GATE_INNER_HALF * 2)
const gateCenterMaterial = new THREE.MeshBasicMaterial({
  color: 0x00b4d8,
  transparent: true,
  opacity: 0.18,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})

function projectSentinelaToWorld(enemy, rail) {
  const frame = rail.getSpawnFrame()
  const pos = frame.position.clone()
    .addScaledVector(frame.forward, enemy.depth)
    .addScaledVector(frame.right, enemy.screenX)
    .addScaledVector(frame.up, enemy.screenY)
  enemy.mesh.position.copy(pos)
}

export function spawnSentinela(scene, rail, id) {
  if (rail.isArena()) return null
  const mesh = new THREE.Mesh(geometry, material)
  scene.add(mesh)
  const lateral = rail.getPlayerLateral ? rail.getPlayerLateral() : { x: 0, y: 0 }
  const enemy = {
    id,
    mesh,
    kind: SENTINELA_KIND,
    dying: false,
    deathT: 0,
    hp: SENTINELA_HP,
    maxHp: SENTINELA_HP,
    fireTimer: 1.2,
    shotsFired: 0,
    state: SENTINELA_STATE_ENGAGING,
    depth: ENGAGE_STANDOFF,
    screenX: lateral.x || 0,
    screenY: lateral.y || 0,
  }
  projectSentinelaToWorld(enemy, rail)
  return enemy
}

// Em ENGAGING: profundidade cravada em ENGAGE_STANDOFF (48u) à frente do frame da nave.
// Como avança rigidamente com o frame da pista, NUNCA se aproxima da nave antes de terminar
// os 4 disparos! Ao terminar os 4 ataques, empina para cima e acelera para frente até sumir.
export function updateSentinelaMovement(enemy, dt, frame, rail) {
  if (enemy.state === SENTINELA_STATE_LEAVING) {
    enemy.screenY += 12 * dt
    enemy.depth += LEAVE_SPEED * dt
    projectSentinelaToWorld(enemy, rail)
    return
  }

  // Trava de profundidade absoluta: não aproxima de jeito nenhum antes dos 4 disparos
  enemy.depth = ENGAGE_STANDOFF

  const lateral = rail.getPlayerLateral ? rail.getPlayerLateral() : { x: 0, y: 0 }
  const ease = Math.min(1, LATERAL_TRACK_RATE * dt)
  enemy.screenX = THREE.MathUtils.lerp(enemy.screenX, lateral.x || 0, ease)
  enemy.screenY = THREE.MathUtils.lerp(enemy.screenY, lateral.y || 0, ease)
  projectSentinelaToWorld(enemy, rail)
}

export function sentinelaPassBehind(enemy) {
  return PASS_BEHIND
}

export function sentinelaShouldDespawn(enemy, frame) {
  if (enemy.state !== SENTINELA_STATE_LEAVING) return false
  return (enemy.depth || 0) > SENTINELA_LEAVE_DESPAWN_AHEAD || (enemy.screenY || 0) > 16
}

// Dispara moldura quadrada orientada na direção do jogador.
export function sentinelaFire(scene, enemy, playerPosition, ctx, frame) {
  const targetPos = playerPosition.clone()
  const originPos = enemy.mesh.position.clone()
  const toTarget = targetPos.clone().sub(originPos)
  const targetDistance = toTarget.length()
  const dir = targetDistance > 1e-4 ? toTarget.clone().normalize() : new THREE.Vector3(0, 0, -1)

  const relTarget = targetPos.clone().sub(frame.position)
  const targetLocal = {
    depth: relTarget.dot(frame.forward),
    right: relTarget.dot(frame.right),
    up: relTarget.dot(frame.up),
  }

  const group = new THREE.Group()
  const centerMesh = new THREE.Mesh(gateCenterGeo, gateCenterMaterial)
  const borderOffset = GATE_INNER_HALF + GATE_BORDER_WIDTH / 2
  const top = new THREE.Mesh(gateBorderTopBottomGeo, gateBorderMaterial)
  top.position.set(0, borderOffset, 0)
  const bottom = new THREE.Mesh(gateBorderTopBottomGeo, gateBorderMaterial)
  bottom.position.set(0, -borderOffset, 0)
  const left = new THREE.Mesh(gateBorderSideGeo, gateBorderMaterial)
  left.position.set(-borderOffset, 0, 0)
  const right = new THREE.Mesh(gateBorderSideGeo, gateBorderMaterial)
  right.position.set(borderOffset, 0, 0)
  group.add(centerMesh, top, bottom, left, right)
  group.position.copy(originPos)
  group.quaternion.setFromUnitVectors(FORWARD_AXIS, dir)
  group.scale.set(1, 1, 1)
  scene.add(group)

  const gate = {
    mesh: group,
    dir,
    right: new THREE.Vector3(1, 0, 0).applyQuaternion(group.quaternion),
    up: new THREE.Vector3(0, 1, 0).applyQuaternion(group.quaternion),
    originPos,
    targetLocal,
    targetDistance,
    traveled: 0,
    innerHalf: GATE_INNER_HALF,
    outerHalf: GATE_OUTER_HALF,
    damage: GATE_DAMAGE,
    shieldDamage: GATE_SHIELD_DAMAGE,
  }
  ctx.pushGate(gate)

  enemy.shotsFired += 1
  if (enemy.shotsFired >= SENTINELA_SHOTS_TOTAL) {
    enemy.state = SENTINELA_STATE_LEAVING
    enemy.fireTimer = Infinity
  }
  return true
}

export function updateGateFlight(gate, dt, rail) {
  const frame = rail.getFrameAt(0)
  const targetNow = frame.position.clone()
    .addScaledVector(frame.forward, gate.targetLocal.depth)
    .addScaledVector(frame.right, gate.targetLocal.right)
    .addScaledVector(frame.up, gate.targetLocal.up)
  const toTarget = targetNow.sub(gate.originPos)
  if (toTarget.lengthSq() > 1e-6) {
    gate.dir = toTarget.normalize()
    gate.mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, gate.dir)
    gate.right.set(1, 0, 0).applyQuaternion(gate.mesh.quaternion)
    gate.up.set(0, 1, 0).applyQuaternion(gate.mesh.quaternion)
  }
  gate.traveled += GATE_SPEED * dt
  gate.mesh.position.copy(gate.originPos).addScaledVector(gate.dir, gate.traveled)
}

export function updateGateAnimation(gate) {
  // Escala estável e nítida para que o jogador julgue com clareza o tamanho do quadrado
  gate.mesh.scale.set(1, 1, 1)
}

// Resolução precisa de colisão com a moldura:
// - Centro vazado (<= inner - radius): seguro, sem dano.
// - Borda sólida (inner - radius até outer + radius): DANO REAL!
// - Fora da moldura (> outer + radius): esquiva completa, sem dano.
export function resolveGateHit(gate, playerPosition, opts = {}) {
  const shipPoints = (opts && opts.shipHitboxPoints) || (playerPosition ? [{ worldPos: playerPosition, radius: 0.5 }] : [])
  const inner = gate.innerHalf
  const outer = gate.outerHalf

  let hit = false
  for (const pt of shipPoints) {
    const rel = pt.worldPos.clone().sub(gate.mesh.position)
    const localX = Math.abs(rel.dot(gate.right))
    const localY = Math.abs(rel.dot(gate.up))
    const maxCoord = Math.max(localX, localY)

    // Colisão com a borda sólida
    const hitBorder = maxCoord >= (inner - pt.radius) && maxCoord <= (outer + pt.radius)
    if (hitBorder) {
      hit = true
      break
    }
  }
  return { hit }
}

export function disposeSentinela() {
  geometry.dispose()
  material.dispose()
  gateBorderTopBottomGeo.dispose()
  gateBorderSideGeo.dispose()
  gateBorderMaterial.dispose()
  gateCenterGeo.dispose()
  gateCenterMaterial.dispose()
}
