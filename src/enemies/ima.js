import * as THREE from 'three'
import { spawnPositionForEnemy } from './shared.js'

// ============ ENXAME-ÍMÃ — campo estático que curva o tiro NORMAL, ambos os modos ============
// pedido do usuário: pequenas esferas paradas (sem IA de perseguição nem tiro, igual o Detrito)
// que empurram o tiro NORMAL do jogador pra longe quando ele passa perto — o teleguiado ignora
// o campo. Nenhum desvio de trajetória hoje é CONTRA o jogador (o único existente, o steer do
// tiro normal, é a favor, puxando rumo à mira) — a força de verdade mora em
// combat/projectiles.js (getMagnetSources() exposta por este módulo/pelo orquestrador).
export const IMA_KIND = 'ima'
export const IMA_COLOR = 0x7c4dff // Violeta elétrico vibrante
export const IMA_HIT_RADIUS = 1.43 // 1.3 * 1.10 (+10%)
export const IMA_DEATH_DURATION = 0.2
export const IMA_HP = 4
export const IMA_KILL_BONUS = 15
// campo maior = o projétil fica dentro por mais tempo acumulando mais desvio
export const IMA_FIELD_RADIUS = 12
// força ~7x maior que antes (era 26): com 26 o desvio total ficava em ~3-4° (imperceptível),
// porque o efeito dura só ~0.3s (tempo de travessia do raio 9 a 60 u/s) e a força é somada à
// velocidade POR FRAME em projectiles.js. 180 dá ~25° de desvio visível — a curva aparece de
// verdade no tiro normal que passa perto. Ver tabela no comentário do projectiles.js.
export const IMA_FIELD_STRENGTH = 180

const GROUP_MIN = 3
const GROUP_MAX = 5
const SPREAD = 3.5
// Pedido do usuário: estilo Star Fox 64 — surge visível a 40-65u
const SPAWN_DISTANCE_MIN = 40
const SPAWN_DISTANCE_MAX = 65
const BOX_X = 6
const BOX_Y = 5

const geometry = new THREE.SphereGeometry(0.77, 10, 8) // +10% maior (era 0.7)
const material = new THREE.MeshPhongMaterial({
  color: IMA_COLOR,
  flatShading: true,
  emissive: 0x3d00e0,
  emissiveIntensity: 0.95,
  transparent: true,
  opacity: 0.95,
})

export function spawnImaSwarm(scene, rail, makeId) {
  const count = GROUP_MIN + Math.floor(Math.random() * (GROUP_MAX - GROUP_MIN + 1))
  const base = spawnPositionForEnemy(rail, SPAWN_DISTANCE_MIN, SPAWN_DISTANCE_MAX, BOX_X, BOX_Y)
  const group = []
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(base).add(new THREE.Vector3(
      (Math.random() * 2 - 1) * SPREAD,
      (Math.random() * 2 - 1) * SPREAD,
      (Math.random() * 2 - 1) * SPREAD,
    ))
    scene.add(mesh)
    group.push({ id: makeId(), mesh, kind: IMA_KIND, dying: false, deathT: 0, hp: IMA_HP, maxHp: IMA_HP, fireTimer: Infinity })
  }
  return group
}

export function updateImaSpin(enemy, dt) {
  enemy.mesh.rotation.y += dt * 1.4
  enemy.mesh.rotation.x += dt * 0.6
}

export function disposeIma() {
  geometry.dispose()
  material.dispose()
}
