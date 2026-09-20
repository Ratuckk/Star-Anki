import * as THREE from 'three'

// ============ helpers sem estado, reaproveitados por quase toda classe de inimigo ============
// Extraído do antigo enemies.js monolítico (v0.34.0) na separação por classe/arquivo — mesmo
// comportamento, só virou módulo próprio pra cada arquivo de classe poder importar sem duplicar.

// Proibição de ficar atrás do jogador: qualquer inimigo que ultrapassar a profundidade -2.0 é removido
export const PASS_BEHIND = -2.0

// Janela de disparo genérica (Blaster/Tank/Boss/Time/Sentinela) — ver a nota histórica em
// enemies/index.js sobre o pedido "estilo Star Fox 64" de não atirar de longe demais.
export const ENEMY_FIRE_RANGE = 55
export const ENEMY_FIRE_MIN_DISTANCE = 8
export const ENEMY_ARENA_FIRE_MAX_DISTANCE = 48

// Só usada pelos inimigos já migrados pra FSM (Blaster/Tank) — Boss é sempre "em alcance"
// (unconditional) no loop genérico antigo, os outros ainda calculam isso inline lá.
export function computeInFireRange(distToPlayer, relativeForward, inArena) {
  if (distToPlayer <= ENEMY_FIRE_MIN_DISTANCE) return false
  return inArena ? distToPlayer <= ENEMY_ARENA_FIRE_MAX_DISTANCE : (relativeForward > 0 && relativeForward < ENEMY_FIRE_RANGE)
}

export function enemyInFireRange(enemy, ctx) {
  const relativeForward = ctx.inArena ? 0 : enemy.mesh.position.clone().sub(ctx.frame.position).dot(ctx.frame.forward)
  const distToPlayer = enemy.mesh.position.distanceTo(ctx.playerPosition)
  return computeInFireRange(distToPlayer, relativeForward, ctx.inArena)
}

// "Nível de dificuldade" (1-9) pra escalar HP/dano de inimigos que pedem isso explicitamente —
// hoje só a Horda usa. NÃO existe um conceito de "nível" em nenhum outro lugar do jogo: a
// dificuldade real é o wrongAnswerCount contínuo (ver applyDifficulty em flow-progression.js).
// Em modo arcade (deck.isNoDeck) não há perguntas erradas pra contar, então o nível sobe por
// pontuação (session.score) em vez de erros — pedido explícito do usuário.
const DIFFICULTY_LEVEL_MAX = 9
const DIFFICULTY_LEVEL_WRONG_STEP = 2 // +1 nível a cada 2 erros
const DIFFICULTY_LEVEL_SCORE_STEP = 10000 // +1 nível a cada 10000 pontos (modo arcade)
export function getDifficultyLevel({ wrongAnswerCount = 0, score = 0, isNoDeck = false } = {}) {
  const steps = isNoDeck
    ? Math.floor(score / DIFFICULTY_LEVEL_SCORE_STEP)
    : Math.floor(wrongAnswerCount / DIFFICULTY_LEVEL_WRONG_STEP)
  return 1 + Math.min(DIFFICULTY_LEVEL_MAX - 1, Math.max(0, steps))
}
// ============ HIERARQUIA DE PODER DE PROJÉTIL (pedido explícito do usuário) ============
// 4 níveis, usados pra decidir a REAÇÃO do jogador ao ser atingido — hoje só o nível 4 tem
// comportamento próprio (perda de controle, ver rail.js → triggerHighImpactTumble), os outros
// 3 níveis existem como classificação pronta pra reações futuras (ex.: shake maior no nível 3).
// Todo projétil/laser/moldura inimigo nasce nível 1 por padrão (ver enemies/index.js); só marca
// explicitamente `powerLevel: POWER_LEVEL_HIGH_IMPACT` quem precisa subir.
// 1 - básico: tiros do jogador, de inimigos genéricos (Blaster/Tank/Time/Sentinela/etc.) e dos aliados
// 2 - teleguiado ou maior: projéteis com homing ou maiores que o padrão (sem uso concreto ainda)
// 3 - dano em área: projéteis com splash/AOE (sem uso concreto ainda)
// 4 - alto-impacto: Chefe, Dourado, Horda — projéteis grandes/de dano alto
export const POWER_LEVEL_BASIC = 1
export const POWER_LEVEL_GUIDED_OR_LARGE = 2
export const POWER_LEVEL_AREA_DAMAGE = 3
export const POWER_LEVEL_HIGH_IMPACT = 4

// a geometria de todo cone deste projeto nasce apontando pro +Z local — usado pra virar o cone
// na direção do tiro via quaternion.setFromUnitVectors(FORWARD_AXIS, direction)
export const FORWARD_AXIS = new THREE.Vector3(0, 0, 1)
// mesma cor do teleguiado em combat.js (HOMING_EXPLOSION_COLOR) — mantém consistência visual da
// explosão/impacto quando quem acerta o inimigo é o tiro carregado
export const HOMING_EXPLOSION_COLOR = 0x2bff88

const _dtsSeg = new THREE.Vector3()
const _dtsSub = new THREE.Vector3()
const _dtsClose = new THREE.Vector3()

// v0.29.4 (QoL): temporários de módulo — chamada por projétil × alvo × frame (centenas de vezes
// num pico de enxame), então cada .clone() era pressão de GC pura. Mesma fórmula, zero alocação.
export function distanceToSegment(point, segStart, segEnd) {
  _dtsSeg.subVectors(segEnd, segStart)
  const lenSq = _dtsSeg.lengthSq()
  if (lenSq < 1e-8) return point.distanceTo(segStart)
  _dtsSub.subVectors(point, segStart)
  const t = THREE.MathUtils.clamp(_dtsSub.dot(_dtsSeg) / lenSq, 0, 1)
  _dtsClose.copy(segStart).addScaledVector(_dtsSeg, t)
  return point.distanceTo(_dtsClose)
}

const ARENA_SPAWN_ELEVATION_MAX = THREE.MathUtils.degToRad(50)

// spawn "no trilho": um pouco à frente da nave, com espalhamento lateral (boxX/boxY)
export function randomSpawnPositionOnPath(rail, distanceMin, distanceMax, boxX, boxY) {
  const distanceAhead = distanceMin + Math.random() * (distanceMax - distanceMin)
  const frame = rail.getFrameAt(distanceAhead)
  const lateralX = (Math.random() * 2 - 1) * boxX
  const lateralY = (Math.random() * 2 - 1) * boxY
  const pos = frame.position.clone().addScaledVector(frame.right, lateralX).addScaledVector(frame.up, lateralY)
  pos.distanceAhead = distanceAhead
  return pos
}

// spawn "no mapa" em modo arena: ponto aleatório numa casca esférica ao redor do CENTRO da
// arena (não do jogador!) — espalha os inimigos pelo mapa em vez de colar do lado da nave
export function randomSpawnAroundArena(rail, distanceMin, distanceMax) {
  const center = rail.getArenaCenter()
  const azimuth = Math.random() * Math.PI * 2
  const elevation = (Math.random() * 2 - 1) * ARENA_SPAWN_ELEVATION_MAX
  const distance = distanceMin + Math.random() * (distanceMax - distanceMin)
  const offset = new THREE.Vector3(
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(azimuth) * Math.cos(elevation),
  ).multiplyScalar(distance)
  return center.add(offset)
}

// Pedido do usuário: inimigos no mínimo 20% mais distantes (era 45-80; também define a faixa de
// spawn do Boss em arena, ver boss.js: ENEMY_ARENA_SPAWN_MAX*0.6 a ENEMY_ARENA_SPAWN_MAX).
export const ENEMY_ARENA_SPAWN_MIN = 54 // 45 * 1.2
export const ENEMY_ARENA_SPAWN_MAX = 96 // 80 * 1.2

export function spawnPositionForEnemy(rail, distanceMin, distanceMax, boxX, boxY) {
  return rail.isArena()
    ? randomSpawnAroundArena(rail, ENEMY_ARENA_SPAWN_MIN, ENEMY_ARENA_SPAWN_MAX)
    : randomSpawnPositionOnPath(rail, distanceMin, distanceMax, boxX, boxY)
}
