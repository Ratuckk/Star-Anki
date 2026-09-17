import * as THREE from 'three'
import { spawnPositionForEnemy } from './shared.js'

// ============ TANQUE (debug) — movimento/tiro genéricos, só HP/escala mudam ============
export const TANK_KIND = 'tank'
export const TANK_COLOR = 0xff9d4d
export const TANK_HIT_RADIUS = 1.8
export const TANK_DEATH_DURATION = 0.2
const TANK_SCALE = 1.6
export const TANK_DEFAULT_HP = 5
const SPAWN_DISTANCE_MIN = 45
const SPAWN_DISTANCE_MAX = 70
const BOX_X = 7
const BOX_Y = 5

const enemyGeometry = new THREE.ConeGeometry(1, 2.2, 4)
enemyGeometry.rotateX(Math.PI / 2)
const material = new THREE.MeshPhongMaterial({ color: TANK_COLOR, flatShading: true })

export function spawnTankEnemy(scene, rail, id, hp = TANK_DEFAULT_HP) {
  const position = spawnPositionForEnemy(rail, SPAWN_DISTANCE_MIN, SPAWN_DISTANCE_MAX, BOX_X, BOX_Y)
  const mesh = new THREE.Mesh(enemyGeometry, material)
  mesh.position.copy(position)
  mesh.scale.setScalar(TANK_SCALE)
  scene.add(mesh)
  return { id, mesh, kind: TANK_KIND, dying: false, deathT: 0, hp, maxHp: hp, fireTimer: null }
}

export function disposeTank() {
  enemyGeometry.dispose()
  material.dispose()
}
