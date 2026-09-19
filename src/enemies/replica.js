import * as THREE from 'three'
import { PASS_BEHIND, randomSpawnPositionOnPath } from './shared.js'
import { ENEMY_SOUND_CUES, triggerSoundCue } from '../audio-cues.js'

// ============ RÉPLICA — eco fantasma do movimento lateral do jogador, só trilho ============
// pedido do usuário: copia o deslocamento lateral do JOGADOR com um atraso curto (sempre ocupa
// onde você ESTAVA, não onde está agora) — fácil de prever, difícil de acertar de frente porque
// sempre reage a um movimento que já passou. Não existe em nenhum outro inimigo: todos os outros
// ou perseguem `playerPosition` direto ou rodam um padrão fixo; a Réplica "grava e reproduz" o
// próprio input do jogador (`rail.getPlayerLateral()`).
export const REPLICA_KIND = 'replica'
export const REPLICA_COLOR = 0x80d8ff // Ciano espectral luminoso vibrante
export const REPLICA_HIT_RADIUS = 1.87 // 1.7 * 1.10 (+10%)
export const REPLICA_DEATH_DURATION = 0.2
export const REPLICA_HP = 3
export const REPLICA_KILL_BONUS = 30
// Pedido do usuário: estilo Star Fox 64 — surge visível a 45-70u (atualizado +20%, ver pedido
// "inimigos no mínimo 20% mais distantes")
const SPAWN_DISTANCE_MIN = 54 // 45 * 1.2
const SPAWN_DISTANCE_MAX = 84 // 70 * 1.2
const BOX_X = 6
const BOX_Y = 4

const STANDOFF = 48 // distância fixa à frente da câmera, próximo e legível
const STANDOFF_EASE_RATE = 2.5 // s^-1, independente de framerate
const DELAY_S = 0.4 // quanto tempo no passado o movimento lateral copiado reflete
const HISTORY_MAX_AGE_S = DELAY_S + 0.3

const geometry = new THREE.ConeGeometry(1.1, 2.42, 4)
geometry.rotateX(Math.PI / 2)
const material = new THREE.MeshPhongMaterial({
  color: REPLICA_COLOR,
  emissive: 0x0091ea,
  emissiveIntensity: 0.8,
  flatShading: true,
  transparent: true,
  opacity: 0.88,
})

// Arquétipo "enxame" (escala devagar, 0.5/nível — ver blasterStatsForLevel em blaster.js pro
// raciocínio completo).
const REPLICA_HP_PER_LEVEL = 0.5
const REPLICA_HP_CAP = 7
export function replicaStatsForLevel(level = 1) {
  const steps = Math.max(0, (level || 1) - 1)
  return { hp: Math.min(REPLICA_HP_CAP, Math.round(REPLICA_HP + steps * REPLICA_HP_PER_LEVEL)) }
}

export function spawnReplica(scene, rail, id, level = 1) {
  const stats = replicaStatsForLevel(level)
  if (rail.isArena()) return null
  const position = randomSpawnPositionOnPath(rail, SPAWN_DISTANCE_MIN, SPAWN_DISTANCE_MAX, BOX_X, BOX_Y)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(position)
  scene.add(mesh)
  triggerSoundCue(ENEMY_SOUND_CUES.replica_spawn, { worldPos: position })
  return {
    id, mesh, kind: REPLICA_KIND, dying: false, deathT: 0, hp: stats.hp, maxHp: stats.hp, fireTimer: Infinity,
    clock: 0,
    history: [], // { t, x, y } — amostras do lateral do jogador, mais antiga primeiro
    alongDistance: SPAWN_DISTANCE_MIN,
  }
}

// grava a posição lateral ATUAL do jogador a cada frame e reproduz a amostra de ~DELAY_S atrás —
// a distância ao longo do trilho converge suavemente pro standoff (não copia o avanço, só o
// lateral, senão perderia a leitura de "sempre um pouco atrás no tempo, não no espaço")
export function updateReplicaMovement(enemy, dt, rail, frame) {
  enemy.clock += dt
  const lateral = rail.getPlayerLateral()
  enemy.history.push({ t: enemy.clock, x: lateral.x, y: lateral.y })
  while (enemy.history.length > 2 && enemy.history[1].t < enemy.clock - HISTORY_MAX_AGE_S) enemy.history.shift()

  const targetT = enemy.clock - DELAY_S
  let delayed = enemy.history[0] || { x: 0, y: 0 }
  for (const sample of enemy.history) {
    if (sample.t > targetT) break
    delayed = sample
  }

  enemy.alongDistance += (STANDOFF - enemy.alongDistance) * Math.min(1, STANDOFF_EASE_RATE * dt)
  enemy.mesh.position.copy(frame.position)
    .addScaledVector(frame.right, delayed.x)
    .addScaledVector(frame.up, delayed.y)
    .addScaledVector(frame.forward, enemy.alongDistance)
}

// mesmo princípio do 'follow' do Blaster/Sentinela — não deixa "passar" fácil, já que fica
// deliberadamente pairando a uma distância fixa em vez de avançar por conta própria
export function replicaPassBehind() {
  return PASS_BEHIND * 5
}

export function disposeReplica() {
  geometry.dispose()
  material.dispose()
}
