import * as THREE from 'three'
import { spawnPositionForEnemy } from './shared.js'

// ============ TANQUE (debug) — movimento/tiro genéricos, só HP/escala mudam ============
export const TANK_KIND = 'tank'
export const TANK_COLOR = 0xff9100
export const TANK_HIT_RADIUS = 2.57 // 2.34 * 1.10 (+10%)
export const TANK_DEATH_DURATION = 0.2
const TANK_SCALE = 2.29 // 2.08 * 1.10 (+10%)
export const TANK_DEFAULT_HP = 15
const SPAWN_DISTANCE_MIN = 45
const SPAWN_DISTANCE_MAX = 70
const BOX_X = 7
const BOX_Y = 5

const enemyGeometry = new THREE.ConeGeometry(1, 2.2, 4)
enemyGeometry.rotateX(Math.PI / 2)
const material = new THREE.MeshPhongMaterial({
  color: TANK_COLOR,
  emissive: 0x773300,
  emissiveIntensity: 0.75,
  flatShading: true,
})

export function spawnTankEnemy(scene, rail, id, hp = TANK_DEFAULT_HP) {
  const position = spawnPositionForEnemy(rail, SPAWN_DISTANCE_MIN, SPAWN_DISTANCE_MAX, BOX_X, BOX_Y)
  const mesh = new THREE.Mesh(enemyGeometry, material)
  mesh.position.copy(position)
  mesh.scale.setScalar(TANK_SCALE)
  scene.add(mesh)
  return {
    id,
    mesh,
    kind: TANK_KIND,
    dying: false,
    deathT: 0,
    hp,
    maxHp: hp,
    fireTimer: null,
    shotsFired: 0,
    disengaging: false,
  }
}

export function disposeTank() {
  enemyGeometry.dispose()
  material.dispose()
}
