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

// ============ SPAWN NO TRILHO ============
// Reescrito do zero: ancorar no JOGADOR (posição atual, já inclui o offset lateral dele em
// relação à centerline) + eixos do frame ATUAL — não mais "projetar a posição futura da
// centerline e compensar". Por que essa mudança:
//
//   1) Durante uma curva, a posição FUTURA da centerline está desviada da direção em que a
//      câmera está olhando (a câmera aponta pro forward ATUAL; a centerline curva pra fora
//      dessa linha). O inimigo nascia fora do eixo da tela — tipicamente pro lado da curva.
//   2) Mesmo em reta, a câmera segue só ~30% do deslocamento lateral do jogador
//      (CAM_FOLLOW_LATERAL = 0.3 em rail.js). O spawn ancorado na centerline nascia deslocado
//      do jogador no lado oposto ao movimento. A compensação parcial (0.7) aliviava mas não
//      resolvia — e criava dois sistemas concorrentes de correção.
//
// Ancorando no jogador + forward ATUAL, o spawn fica SEMPRE na frente dele, dentro de uma
// "janela" perpendicular à direção que a câmera olha — que é literalmente o que "aparecer na
// tela" significa. Válido para reta e curva, sem caso especial.
export function randomSpawnPositionOnPath(rail, distanceMin, distanceMax, boxX, boxY) {
  const distanceAhead = distanceMin + Math.random() * (distanceMax - distanceMin)

  // getFrameAt(0) SEMPRE devolve o frame ATUAL (em rail e em arena — ver o early-return de
  // getFrameAt em rail.js). getPlayerPosition() já devolve um clone novo.
  const frame = rail.getFrameAt(0)
  const playerPos = rail.getPlayerPosition()

  const lateralX = (Math.random() * 2 - 1) * boxX
  const lateralY = (Math.random() * 2 - 1) * boxY

  return playerPos
    .addScaledVector(frame.forward, distanceAhead)
    .addScaledVector(frame.right, lateralX)
    .addScaledVector(frame.up, lateralY)
}

// spawn "no mapa" em modo arena: inalterado — o problema era exclusivo do trilho (a câmera de
// arena segue mais de perto o jogador e o spawn já era centrado nele por natureza).
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
