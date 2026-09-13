import * as THREE from 'three'
import { spawnPositionForEnemy } from './shared.js'
import { BLASTER_KILL_BONUS } from './blaster.js'

// ============ DETRITO — obstáculo cinza destrutível ============
// v0.34.0: pedido do usuário — "obstáculo" que fica surgindo aleatoriamente pelo mapa SEM seguir
// as regras de pausa/limite que os outros inimigos recebem (o timer próprio mora em main.js).
// Aqui dentro ele é só mais um `kind` normal: sem movimento nem tiro, recebe kamikaze e tiro do
// jogador pelo mesmo caminho genérico de todo mundo.
export const DETRITO_KIND = 'detrito'
export const DETRITO_COLOR = 0x888888
export const DETRITO_HIT_RADIUS = 1.9
export const DETRITO_DEATH_DURATION = 0.2
export const DETRITO_HP = 6
export const DETRITO_KILL_BONUS = BLASTER_KILL_BONUS / 2 // confirmado com o usuário: bônus menor, não é alvo de combate de verdade
const SPAWN_DISTANCE_MIN = 90
const SPAWN_DISTANCE_MAX = 140
const BOX_X = 7
const BOX_Y = 5
const SPIN_RATE_MIN = 0.15
const SPIN_RATE_MAX = 0.45

const geometry = new THREE.IcosahedronGeometry(1.3, 0)
const material = new THREE.MeshPhongMaterial({ color: DETRITO_COLOR, flatShading: true })

export function spawnDetrito(scene, rail, id) {
  const position = spawnPositionForEnemy(rail, SPAWN_DISTANCE_MIN, SPAWN_DISTANCE_MAX, BOX_X, BOX_Y)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(position)
  // rotação inicial aleatória — cada detrito nasce virado diferente, reforça a leitura de
  // "destroço no espaço" em vez de peça repetida
  mesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2)
  scene.add(mesh)
  return {
    id, mesh, kind: DETRITO_KIND, dying: false, deathT: 0, hp: DETRITO_HP, maxHp: DETRITO_HP, fireTimer: Infinity,
    spinAxis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
    spinRate: SPIN_RATE_MIN + Math.random() * (SPIN_RATE_MAX - SPIN_RATE_MIN),
  }
}

// giro lento e constante só por vida visual — sem lookAt (não "encara" o jogador, é um objeto
// inerte flutuando, não uma nave)
export function updateDetritoSpin(enemy, dt) {
  enemy.mesh.rotateOnAxis(enemy.spinAxis, enemy.spinRate * dt)
}

export function disposeDetrito() {
  geometry.dispose()
  material.dispose()
}
