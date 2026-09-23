import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  TANK_ATTACKS, TANK_DEATH_DURATION, TANK_HIT_RADIUS, TANK_KILL_BONUS, TANK_POPULATION_WEIGHT,
  spawnTankEnemy, tankArmorBand, tankAttackForCycle, tankShouldLeaveAfterCycle, tankStatsForLevel,
} from './enemies/tank.js'

assert.equal(TANK_HIT_RADIUS, 2.8)
assert.equal(TANK_DEATH_DURATION, 0.65)
assert.equal(TANK_KILL_BONUS, 75)
assert.equal(TANK_POPULATION_WEIGHT, 2)
assert.deepEqual([tankAttackForCycle(0), tankAttackForCycle(1), tankAttackForCycle(2)], [TANK_ATTACKS.SIEGE, TANK_ATTACKS.SUPPRESSION, TANK_ATTACKS.RAM])
assert.equal(tankAttackForCycle(3), TANK_ATTACKS.SIEGE)
assert.deepEqual(tankStatsForLevel(1), { hp: 15 })
assert.deepEqual(tankStatsForLevel(9), { hp: 27 })
assert.equal(tankArmorBand(15, 15), 3)
assert.equal(tankArmorBand(8, 15), 2)
assert.equal(tankArmorBand(2, 15), 1)
assert.equal(tankShouldLeaveAfterCycle(3, false), true)
assert.equal(tankShouldLeaveAfterCycle(99, true), false)

const scene = new THREE.Scene()
const frame = {
  position: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, 1),
  right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0),
}
const rail = {
  isArena: () => false,
  getSpawnFrame: () => frame,
  getFrameAt: () => frame,
  getPlayerPosition: () => new THREE.Vector3(),
}
const tank = spawnTankEnemy(scene, rail, 7, 15)
assert.ok(tank.visualGroup?.isGroup && tank.armorPanels.length === 6)
assert.equal(tank.requestStagger('swirl'), true)
assert.equal(tank.requestStagger('swirl-again'), false, 'anti stun-lock blocks a second stagger inside immunity')
console.log('tank.test.mjs: 15 assertions passed')
