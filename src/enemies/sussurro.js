import * as THREE from 'three'

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

// pedido do usuário: "a maioria dos inimigos fica tão longe" — reduzido pra engajar mais cedo
const SPAWN_DISTANCE_MIN = 70
const SPAWN_DISTANCE_MAX = 110
const BOX_X = 7
const BOX_Y = 5
const ADVANCE_SPEED = 5
const PULSE_VISIBLE_MS = 500
const PULSE_INVISIBLE_MS = 2200
const OPACITY_VISIBLE = 0.85
const OPACITY_HIDDEN = 0.12

const geometry = new THREE.OctahedronGeometry(1.1, 0)
const baseMaterial = new THREE.MeshBasicMaterial({ color: SUSSURRO_COLOR, transparent: true, opacity: OPACITY_HIDDEN })

// v0.51.11: mesmo modelo profundidade+tela do blaster.js (ver comentário lá) — `updateSussurro`
// só avança em linha reta, mas mesmo isso acumulado por 6+ segundos (o tempo até invocar
// reforços) sobre um `frame.forward` que gira com a curva do trilho causava deriva lateral
// perceptível. Aqui não tem lateral nenhuma pra perseguir, então screenX/screenY ficam FIXOS no
// valor do spawn — só a profundidade diminui.
function projectSussurroToWorld(enemy, rail) {
  const frame = rail.getSpawnFrame()
  enemy.mesh.position.copy(frame.position)
    .addScaledVector(frame.forward, enemy.depth)
    .addScaledVector(frame.right, enemy.screenX)
    .addScaledVector(frame.up, enemy.screenY)
}

export function spawnSussurro(scene, rail, id) {
  if (rail.isArena()) return null
  const distanceAhead = SPAWN_DISTANCE_MIN + Math.random() * (SPAWN_DISTANCE_MAX - SPAWN_DISTANCE_MIN)
  const screenX = (Math.random() * 2 - 1) * BOX_X
  const screenY = (Math.random() * 2 - 1) * BOX_Y
  // material clonado por instância — a opacidade pulsa por conta própria em cada um, dessincronizada
  const mesh = new THREE.Mesh(geometry, baseMaterial.clone())
  scene.add(mesh)
  const enemy = {
    id, mesh, kind: SUSSURRO_KIND, dying: false, deathT: 0, hp: SUSSURRO_HP, maxHp: SUSSURRO_HP, fireTimer: Infinity,
    depth: distanceAhead, screenX, screenY,
    aliveMs: 0,
    pulseTimer: Math.random() * PULSE_INVISIBLE_MS, // dessincroniza vários sussurros entre si
    pulseVisible: false,
    summoned: false,
  }
  projectSussurroToWorld(enemy, rail)
  return enemy
}

export function updateSussurro(enemy, dt, rail) {
  enemy.depth -= ADVANCE_SPEED * dt
  projectSussurroToWorld(enemy, rail)
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
