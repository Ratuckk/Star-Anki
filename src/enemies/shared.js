import * as THREE from 'three'

// ============ helpers sem estado, reaproveitados por quase toda classe de inimigo ============
// Extraído do antigo enemies.js monolítico (v0.34.0) na separação por classe/arquivo — mesmo
// comportamento, só virou módulo próprio pra cada arquivo de classe poder importar sem duplicar.

export const PASS_BEHIND = -4
// a geometria de todo cone deste projeto nasce apontando pro +Z local — usado pra virar o cone
// na direção do tiro via quaternion.setFromUnitVectors(FORWARD_AXIS, direction)
export const FORWARD_AXIS = new THREE.Vector3(0, 0, 1)
// mesma cor do teleguiado em combat.js (HOMING_EXPLOSION_COLOR) — mantém consistência visual da
// explosão/impacto quando quem acerta o inimigo é o tiro carregado
export const HOMING_EXPLOSION_COLOR = 0x2bff88

// pedido do usuário: inimigos surgiam muito à esquerda da câmera quando a nave estava à direita
// — o spawn era sempre em torno da CENTERLINE do trilho, não de onde a nave realmente está. A
// câmera só segue 30% do movimento lateral do jogador, então o inimigo nascia no offset 0 e
// aparecia deslocado no lado oposto ao que o jogador estava. Compensa uma FRAÇÃO do desvio
// lateral do jogador (0.7 — não 1.0 completo, senão todo inimigo nasce colado na nave e perde
// a variedade de "tem inimigo vindo pela esquerda também"). Ajustável entre 0.5 (mais variedade)
// e 0.9 (mais centrado na nave).
const SPAWN_PLAYER_LATERAL_COMPENSATION = 0.7

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

// spawn "no trilho": um pouco à frente da nave, com espalhamento lateral (boxX/boxY) — e,
// desde o bug-fix do "nasce à esquerda da câmera", também DESLOCADO por uma fração do offset
// lateral ATUAL do jogador, pra o centro do espalhamento acompanhar a nave em vez da centerline
// do trilho. A fração (0.7) foi escolhida pra: (a) resolver o sintoma (que ficava feio com
// nave nas laterais), (b) manter variedade — parte dos inimigos ainda nasce no lado oposto.
export function randomSpawnPositionOnPath(rail, distanceMin, distanceMax, boxX, boxY) {
  const distanceAhead = distanceMin + Math.random() * (distanceMax - distanceMin)
  const frame = rail.getFrameAt(distanceAhead)
  const lateralX = (Math.random() * 2 - 1) * boxX
  const lateralY = (Math.random() * 2 - 1) * boxY
  // rail.getPlayerLateral() devolve o offset CRU da nave em relação à centerline, medido no
  // frame atual — é uma aproximação aplicar o mesmo valor no frame futuro (distanceAhead tem
  // right/up próprios, que giram com a curva), mas em curvas do trilho atual essa diferença é
  // pequena o bastante pra não importar.
  const lateral = rail.getPlayerLateral ? rail.getPlayerLateral() : null
  const compensateX = lateral ? lateral.x * SPAWN_PLAYER_LATERAL_COMPENSATION : 0
  const compensateY = lateral ? lateral.y * SPAWN_PLAYER_LATERAL_COMPENSATION : 0
  return frame.position.clone()
    .addScaledVector(frame.right, lateralX + compensateX)
    .addScaledVector(frame.up, lateralY + compensateY)
}

// spawn "no mapa" em modo arena: ponto aleatório numa casca esférica ao redor do CENTRO da
// arena (não do jogador!) — espalha os inimigos pelo mapa em vez de colar do lado da nave.
// Não usa o mesmo truque do randomSpawnPositionOnPath: em arena a distância lateral do jogador
// ao centro é limitada pelo raio (ARENA_RADIUS = 190) e o inimigo vem de qualquer direção do
// hemisfério, então não existe o "sempre nasce no lado oposto" que motivou o fix de trilho.
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

export const ENEMY_ARENA_SPAWN_MIN = 70
export const ENEMY_ARENA_SPAWN_MAX = 160

export function spawnPositionForEnemy(rail, distanceMin, distanceMax, boxX, boxY) {
  return rail.isArena()
    ? randomSpawnAroundArena(rail, ENEMY_ARENA_SPAWN_MIN, ENEMY_ARENA_SPAWN_MAX)
    : randomSpawnPositionOnPath(rail, distanceMin, distanceMax, boxX, boxY)
}
