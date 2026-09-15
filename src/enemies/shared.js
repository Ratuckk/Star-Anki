import * as THREE from 'three'

// ============ helpers sem estado, reaproveitados por quase toda classe de inimigo ============

export const PASS_BEHIND = -4
export const FORWARD_AXIS = new THREE.Vector3(0, 0, 1)
export const HOMING_EXPLOSION_COLOR = 0x2bff88

const _dtsSeg = new THREE.Vector3()
const _dtsSub = new THREE.Vector3()
const _dtsClose = new THREE.Vector3()

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
// v0.51.5: spawn ancorado na CÂMERA (rail.getAimLineAhead/getSpawnFrame), não na nave — medido
// e confirmado (em vídeo real do bug) que ancorar na nave deixa o spawn sistematicamente do
// lado da tela em que o jogador já está, porque a câmera só acompanha 30% do deslocamento
// lateral dela. Ver histórico completo em rail.js, junto de getAimLineAhead.
export function randomSpawnPositionOnPath(rail, distanceMin, distanceMax, boxX, boxY) {
  const distanceAhead = distanceMin + Math.random() * (distanceMax - distanceMin)
  const frame = rail.getSpawnFrame()
  const base = rail.getAimLineAhead(distanceAhead)
  const lateralX = (Math.random() * 2 - 1) * boxX
  const lateralY = (Math.random() * 2 - 1) * boxY
  return base
    .addScaledVector(frame.right, lateralX)
    .addScaledVector(frame.up, lateralY)
}

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
