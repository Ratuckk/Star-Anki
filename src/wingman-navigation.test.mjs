import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  WINGMAN_NAVIGATION_INTENTS,
  WINGMAN_RAIL_CATCHUP_START,
  WINGMAN_RAIL_CATCHUP_FULL,
  WINGMAN_RAIL_CATCHUP_MAX_BONUS,
  computeRailCatchupBoost,
  computeRailLongitudinalLag,
  isFiniteWingmanPosition,
  navigationIntentForWingman,
} from './combat/wingman-navigation.js'

const frame = { forward: { x: 0, y: 0, z: 1 } }
const player = { x: 0, y: 0, z: 100 }

assert.equal(computeRailLongitudinalLag({ x: 80, y: 20, z: 100 }, player, frame), 0, 'distância lateral não pode parecer atraso no rail')
assert.equal(computeRailLongitudinalLag({ x: 0, y: 0, z: 40 }, player, frame), 60)
assert.equal(computeRailLongitudinalLag({ x: 0, y: 0, z: 130 }, player, frame), -30)
assert.equal(computeRailLongitudinalLag({ x: NaN, y: 0, z: 0 }, player, frame), null)

assert.equal(computeRailCatchupBoost(WINGMAN_RAIL_CATCHUP_START), 0)
assert.ok(computeRailCatchupBoost(60) > 0)
assert.ok(computeRailCatchupBoost(60) < computeRailCatchupBoost(90))
assert.equal(computeRailCatchupBoost(WINGMAN_RAIL_CATCHUP_FULL), WINGMAN_RAIL_CATCHUP_MAX_BONUS)
assert.equal(computeRailCatchupBoost(999), WINGMAN_RAIL_CATCHUP_MAX_BONUS)

assert.equal(navigationIntentForWingman({ state: 'patrol' }), WINGMAN_NAVIGATION_INTENTS.FORMATION)
assert.equal(navigationIntentForWingman({ state: 'damaged-passive' }), WINGMAN_NAVIGATION_INTENTS.FORMATION)
assert.equal(navigationIntentForWingman({ state: 'dogfight' }), WINGMAN_NAVIGATION_INTENTS.ATTACK_LANE)
assert.equal(navigationIntentForWingman({ state: 'ram' }), WINGMAN_NAVIGATION_INTENTS.ATTACK_LANE)
assert.equal(navigationIntentForWingman({ state: 'rescue' }), WINGMAN_NAVIGATION_INTENTS.SUPPORT_PLAYER)
assert.equal(navigationIntentForWingman({ state: 'escort', escortKind: 'assist' }), WINGMAN_NAVIGATION_INTENTS.SUPPORT_PLAYER)
assert.equal(isFiniteWingmanPosition({ x: 1, y: 2, z: 3 }), true)
assert.equal(isFiniteWingmanPosition({ x: Infinity, y: 2, z: 3 }), false)

// Guardas estruturais do overhaul: distância do jogador não pode mais criar um estado de
// reagrupamento, e o All-Range não pode possuir catch-up baseado em distância.
const wingmenSource = readFileSync(new URL('./combat/wingmen.js', import.meta.url), 'utf8')
const controllerSource = readFileSync(new URL('./combat/wingman-state-controller.js', import.meta.url), 'utf8')
for (const forbidden of [
  'WINGMAN_MAX_DISTANCE_RAIL',
  'WINGMAN_MAX_DISTANCE_ARENA',
  'WINGMAN_EMERGENCY_REGROUP_MULTIPLIER',
  'WINGMAN_EMERGENCY_REGROUP_SPEED',
  'enterEmergencyRegroup',
  "w.state === 'regroup'",
  'regroup-distance-exceeded',
]) {
  assert.ok(!wingmenSource.includes(forbidden), `runtime ainda contém reagrupamento por distância: ${forbidden}`)
}
assert.ok(!controllerSource.includes("REGROUP: 'regroup'"), 'regroup não deve continuar como Behavior autoritativo')
assert.ok(!controllerSource.includes('enterEmergencyRegroup'), 'controller não deve expor emergency regroup')
assert.ok(wingmenSource.includes('computeRailLongitudinalLag') && wingmenSource.includes('computeRailCatchupBoost'), 'rail precisa usar catch-up longitudinal')
assert.match(wingmenSource, /if \(!inArena\) \{[\s\S]{0,1400}computeRailLongitudinalLag/, 'catch-up longitudinal deve existir apenas no Rail')

console.log('wingman-navigation.test.mjs: OK')
