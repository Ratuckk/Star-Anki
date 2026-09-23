import assert from 'node:assert/strict'
import { resolveDamageChannels } from './player.js'
import { createDamageFeedback } from './combat/damage-feedback.js'
import * as THREE from 'three'

let r = resolveDamageChannels({ shield: 5, shieldDamage: 4, hullDamage: 2 })
assert.equal(r.shield, 1)
assert.equal(r.hullDamageApplied, 0)
assert.equal(r.shieldBroke, false)

r = resolveDamageChannels({ temporaryShield: 1, shield: 2, shieldDamage: 4, hullDamage: 2 })
assert.equal(r.temporaryShield, 0)
assert.equal(r.shield, 0)
assert.equal(r.shieldBroke, true)
assert.equal(r.hullDamageApplied, 2)

r = resolveDamageChannels({ shield: 0, shieldDamage: 4, hullDamage: 2 })
assert.equal(r.hullDamageApplied, 2)

const worldPos = new THREE.Vector3(1, 2, 3)
assert.equal(createDamageFeedback({ worldPos, kind: 'detrito', sourceKind: 'environment' }, 0), null)
const feedback = createDamageFeedback({ worldPos, kind: 'tank' }, 3)
assert.equal(feedback.damage, 3)
assert.equal(feedback.sourceKind, 'player')
console.log('forgot-stage2.test.mjs: damage-channel and feedback regressions passed')
