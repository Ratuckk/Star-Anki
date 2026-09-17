import * as THREE from 'three'
import { spawnPositionForEnemy } from './shared.js'

// ============ FRAGATA-ESCUDO — placa de blindagem giratória, só arena/all-range ============
// pedido do usuário: uma placa protege um arco fixo (girando devagar e previsível) — só toma
// dano de verdade quando o tiro vem do lado que a rotação deixou exposto NAQUELE instante.
// Diferente da Sentinela (que resolve por POSIÇÃO do jogador), aqui é por ÂNGULO do tiro —
// nenhum inimigo hoje checa direção de ataque, só posição/hp puro. Só faz sentido em arena:
// o jogador precisa poder voar ao redor pra explorar o lado exposto, e no trilho não tem como
// flanquear.
export const FRAGATA_KIND = 'fragata'
export const FRAGATA_BODY_COLOR = 0x2563eb // Azul cobalto elétrico vibrante (alta visibilidade)
export const FRAGATA_SHIELD_COLOR = 0xffaa00 // Âmbar dourado brilhante
export const FRAGATA_HIT_RADIUS = 3.74 // 3.4 * 1.10 (+10%)
export const FRAGATA_DEATH_DURATION = 0.3
export const FRAGATA_HP = 6
export const FRAGATA_KILL_BONUS = 40

const SPIN_RATE = 0.9 // rad/s — velocidade da blindagem girando, sempre no mesmo sentido
const SHIELD_OFFSET = 2.2 // ajustado para escala +10%
const STANDOFF = 40
const APPROACH_SPEED_FACTOR = 0.4
const WORLD_UP = new THREE.Vector3(0, 1, 0)

// Geometrias +10% maiores
const bodyGeometry = new THREE.IcosahedronGeometry(1.76, 0)
const bodyMaterial = new THREE.MeshPhongMaterial({
  color: FRAGATA_BODY_COLOR,
  emissive: 0x1d4ed8,
  emissiveIntensity: 0.65,
  flatShading: true,
})
const shieldGeometry = new THREE.BoxGeometry(0.38, 3.52, 3.52)
const shieldMaterial = new THREE.MeshPhongMaterial({
  color: FRAGATA_SHIELD_COLOR,
  flatShading: true,
  emissive: 0x884400,
  emissiveIntensity: 0.8,
})

export function spawnFragata(scene, rail, id) {
  if (!rail.isArena()) return null
  const position = spawnPositionForEnemy(rail, 50, 85, 7, 5)
  // grupo NUNCA rotaciona (sem lookAt/rotation) — assim a posição local da placa (`shieldFacing`)
  // é diretamente a direção mundial, sem precisar converter espaço a cada checagem de dano
  const group = new THREE.Group()
  group.add(new THREE.Mesh(bodyGeometry, bodyMaterial))
  const shield = new THREE.Mesh(shieldGeometry, shieldMaterial)
  shield.position.set(SHIELD_OFFSET, 0, 0)
  group.add(shield)
  group.position.copy(position)
  scene.add(group)
  return {
    id, mesh: group, kind: FRAGATA_KIND, dying: false, deathT: 0, hp: FRAGATA_HP, maxHp: FRAGATA_HP, fireTimer: Infinity,
    shieldFacing: new THREE.Vector3(1, 0, 0),
    shieldMesh: shield,
  }
}

export function updateFragataMovement(enemy, dt, playerPosition, speedCap) {
  enemy.shieldFacing.applyAxisAngle(WORLD_UP, SPIN_RATE * dt)
  enemy.shieldMesh.position.copy(enemy.shieldFacing).multiplyScalar(SHIELD_OFFSET)

  // mantém distância de cerco — nunca avança rápido demais, é um alvo pra rodear, não perseguir
  const toPlayer = playerPosition.clone().sub(enemy.mesh.position)
  const dist = toPlayer.length()
  if (dist > STANDOFF && dist > 1e-4) {
    enemy.mesh.position.addScaledVector(toPlayer.normalize(), speedCap * APPROACH_SPEED_FACTOR * dt)
  }
}

// `prevPos` é a posição do projétil um instante antes do impacto — aproxima "de que direção o
// disparo veio". Se essa direção cai do lado que a blindagem cobre agora, bloqueia o dano.
export function isFragataShielded(enemy, prevPos) {
  const incoming = prevPos.clone().sub(enemy.mesh.position)
  if (incoming.lengthSq() < 1e-8) return false
  return incoming.normalize().dot(enemy.shieldFacing) > 0
}

export function disposeFragata() {
  bodyGeometry.dispose()
  bodyMaterial.dispose()
  shieldGeometry.dispose()
  shieldMaterial.dispose()
}
