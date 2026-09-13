import * as THREE from 'three'
import { spawnPositionForEnemy } from './shared.js'

// ============ SUSSURRO — batedor quase invisível que chama reforços, só trilho ============
// pedido do usuário: fica invisível a maior parte do tempo, pisca visível por janelas curtas, e
// se sobreviver tempo demais invoca uma leva extra de Blasters — nenhum inimigo hoje invoca
// outro sozinho (todo spawn hoje vem do timer central do main.js). O convite pra invocar mora
// aqui dentro do orquestrador (updateEnemies em index.js), que já tem `spawnBlaster`/`enemies`/
// `nextEnemyId` em escopo.
export const SUSSURRO_KIND = 'sussurro'
export const SUSSURRO_COLOR = 0xc7ccd4
export const SUSSURRO_HIT_RADIUS = 1.6
export const SUSSURRO_DEATH_DURATION = 0.2
export const SUSSURRO_HP = 2
export const SUSSURRO_KILL_BONUS = 25
export const SUSSURRO_SUMMON_AFTER_S = 6 // sobreviveu esse tempo sem morrer → chama reforços

const SPAWN_DISTANCE_MIN = 100
const SPAWN_DISTANCE_MAX = 150
const BOX_X = 7
const BOX_Y = 5
const ADVANCE_SPEED = 5
const PULSE_VISIBLE_MS = 500
const PULSE_INVISIBLE_MS = 2200
const OPACITY_VISIBLE = 0.85
const OPACITY_HIDDEN = 0.12

const geometry = new THREE.OctahedronGeometry(1.1, 0)
const baseMaterial = new THREE.MeshBasicMaterial({ color: SUSSURRO_COLOR, transparent: true, opacity: OPACITY_HIDDEN })

export function spawnSussurro(scene, rail, id) {
  if (rail.isArena()) return null
  const position = spawnPositionForEnemy(rail, SPAWN_DISTANCE_MIN, SPAWN_DISTANCE_MAX, BOX_X, BOX_Y)
  // material clonado por instância — a opacidade pulsa por conta própria em cada um, dessincronizada
  const mesh = new THREE.Mesh(geometry, baseMaterial.clone())
  mesh.position.copy(position)
  scene.add(mesh)
  return {
    id, mesh, kind: SUSSURRO_KIND, dying: false, deathT: 0, hp: SUSSURRO_HP, maxHp: SUSSURRO_HP, fireTimer: Infinity,
    aliveMs: 0,
    pulseTimer: Math.random() * PULSE_INVISIBLE_MS, // dessincroniza vários sussurros entre si
    pulseVisible: false,
    summoned: false,
  }
}

export function updateSussurro(enemy, dt, frame) {
  enemy.mesh.position.addScaledVector(frame.forward, -ADVANCE_SPEED * dt)
  enemy.aliveMs += dt * 1000

  enemy.pulseTimer -= dt * 1000
  if (enemy.pulseTimer <= 0) {
    enemy.pulseVisible = !enemy.pulseVisible
    enemy.pulseTimer = enemy.pulseVisible ? PULSE_VISIBLE_MS : PULSE_INVISIBLE_MS
  }
  enemy.mesh.material.opacity = enemy.pulseVisible ? OPACITY_VISIBLE : OPACITY_HIDDEN
}

// true só na borda exata em que cruza o limiar de invocação (chamador dispara o spawn 1x)
export function sussurroShouldSummon(enemy) {
  if (enemy.summoned) return false
  if (enemy.aliveMs < SUSSURRO_SUMMON_AFTER_S * 1000) return false
  enemy.summoned = true
  return true
}

export function disposeSussurro() {
  geometry.dispose()
  baseMaterial.dispose()
}
