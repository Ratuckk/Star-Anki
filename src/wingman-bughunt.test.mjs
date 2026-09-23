import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  isWingmanCombatTargetReady,
} from './combat/wingman-flight-stability.js'
import {
  WINGMAN_RAIL_CATCHUP_MAX_BONUS,
  computeRailCatchupBoost,
  computeRailLongitudinalLag,
  updateRailCatchupState,
  isFiniteWingmanPosition,
} from './combat/wingman-navigation.js'

const wingmen = readFileSync(new URL('./combat/wingmen.js', import.meta.url), 'utf8')
const combat = readFileSync(new URL('./combat/index.js', import.meta.url), 'utf8')
let passed = 0
function check(name, fn) {
  fn()
  passed += 1
  console.log(`  ok ${passed} - ${name}`)
}

check('Bug 1: snapshots de posição não expõem Vector3 mutável', () => {
  const positionsStart = wingmen.indexOf('getWingmanPositions:')
  const damageTargetsStart = wingmen.indexOf('getDamageTargets:', positionsStart)
  const vitalsStart = wingmen.indexOf('getVitalSnapshots:', damageTargetsStart)
  const damageApplyStart = wingmen.indexOf('applyDamageToWingman,', vitalsStart)
  assert.ok(positionsStart >= 0 && damageTargetsStart > positionsStart && vitalsStart > damageTargetsStart && damageApplyStart > vitalsStart)
  const positionsBlock = wingmen.slice(positionsStart, damageTargetsStart)
  const damageTargetsBlock = wingmen.slice(damageTargetsStart, vitalsStart)
  const vitalsBlock = wingmen.slice(vitalsStart, damageApplyStart)
  assert.ok(positionsBlock.includes('w.mesh.position.clone()'), 'getWingmanPositions precisa clonar posição')
  assert.ok(damageTargetsBlock.includes('worldPos: w.mesh.position.clone()'), 'getDamageTargets precisa clonar posição')
  assert.ok(vitalsBlock.includes('worldPos: w.mesh.position.clone()'), 'getVitalSnapshots precisa clonar posição')
})

check('Bug 2: recovery substitui instância stale em retreat', () => {
  assert.match(wingmen, /staleIndex = activeWingmen\.findIndex\(\(w\) => w\.profile\.id === profileId && w\.state === 'retreating'\)/)
  assert.match(wingmen, /retreat-instance-replaced/)
})

check('Bug 3: getWingmanCount ignora retreating', () => {
  assert.match(wingmen, /getWingmanCount: \(\) => activeWingmen\.filter\(\(w\) => w\.state !== 'retreating'\)\.length/)
})

check('Bug 4: markWingmanDown acontece na entrada do retreat', () => {
  assert.match(combat, /if \(hit\?\.enteredRetreat\) player\.markWingmanDown\?\.\(profileId\)/)
})

check('Bug 5: retreat cancela rádio pendente do piloto', () => {
  assert.match(wingmen, /wingmanRadio\.cancelPendingResponse\?\.\('pilot-retreated'\)/)
  assert.match(wingmen, /pendingRadioMessages\[i\]\?\.pilotId === w\.profile\.id/)
})

check('Bug 6: retreat limpa escudo auxiliar e cor crítica', () => {
  assert.match(wingmen, /w\.auxShieldVisual\.visible = false/)
  assert.match(wingmen, /damageMaterials[\s\S]{0,220}color\.copy\(w\.damageColors\[i\]\)/)
})

check('Bug 7: Chain Ram pode usar pool pronto incluindo Dourado', () => {
  assert.match(wingmen, /if \(enemies && enemies\.getGoldenAlive\)/)
  assert.match(wingmen, /for \(const g of enemies\.getGoldenAlive\(\)\) if \(isWingmanCombatTargetReady\(g\)\) alive\.push\(g\)/)
  assert.match(wingmen, /FALCO_CHAIN_RADIUS/)
})

check('Bug 8: readiness rejeita spawn, fade e HP zero', () => {
  const mesh = { parent: {} }
  assert.equal(isWingmanCombatTargetReady({ mesh, hp: 2 }), true)
  assert.equal(isWingmanCombatTargetReady({ mesh, hp: 0 }), false)
  assert.equal(isWingmanCombatTargetReady({ mesh, hp: 2, fadingOut: true }), false)
  assert.equal(isWingmanCombatTargetReady({ mesh, hp: 2, spawnPhase: 'materialize' }), false)
  assert.equal(isWingmanCombatTargetReady({ mesh, hp: 2, spawnInvincibleTimer: 0.2 }), false)
})

check('Bug 9: clearSquadron reseta estado transitório', () => {
  const required = [
    "squadronCommandMode = 'free'",
    'squadronCommandDurationTimer = 0',
    'squadronCommandCooldownTimer = 0',
    'moraleDamageBonus = 0',
    'chargeHeldTimer = 0',
    'playerRollHistory.length = 0',
    'abilityCooldownMultByProfileId.fill(1)',
    'hasPreviousPlayerPosition = false',
  ]
  for (const marker of required) assert.ok(wingmen.includes(marker), `clearSquadron sem reset: ${marker}`)
})

check('Bug 10: navegação protege finitude, clamp e histerese', () => {
  assert.equal(isFiniteWingmanPosition({ x: 1, y: 2, z: 3 }), true)
  assert.equal(isFiniteWingmanPosition({ x: NaN, y: 2, z: 3 }), false)
  assert.equal(computeRailLongitudinalLag({ x: NaN, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { forward: { x: 0, y: 0, z: 1 } }), null)
  assert.equal(updateRailCatchupState(33, false), true)
  assert.equal(updateRailCatchupState(25, true), true)
  assert.equal(updateRailCatchupState(21, true), false)
  assert.equal(computeRailCatchupBoost(10000), WINGMAN_RAIL_CATCHUP_MAX_BONUS)
})

assert.equal(passed, 10)
console.log('wingman-bughunt.test.mjs: 10/10')
