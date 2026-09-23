import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  WINGMAN_RESCUE_TIMEOUT_S,
  computeFormationMotionGain,
  computeWingmanArrivalScale,
  createWingmanStallWatch,
  isWingmanCombatTargetReady,
  updateWingmanStallWatch,
} from './combat/wingman-flight-stability.js'

assert.equal(computeWingmanArrivalScale(0), 0)
assert.equal(computeWingmanArrivalScale(.9), 0)
assert.equal(computeWingmanArrivalScale(10), 1)
assert.ok(computeWingmanArrivalScale(4) > 0 && computeWingmanArrivalScale(4) < 1)
assert.equal(computeFormationMotionGain(0), 0)
assert.equal(computeFormationMotionGain(.7), 0)
assert.equal(computeFormationMotionGain(8), 1)
assert.equal(WINGMAN_RESCUE_TIMEOUT_S, 5)

const wingmenSource = readFileSync(new URL('./combat/wingmen.js', import.meta.url), 'utf8')
const occurrences = (needle) => wingmenSource.split(needle).length - 1
assert.equal(occurrences('const previousPlayerPosition = new THREE.Vector3()'), 1, 'estado de posição anterior não pode ser redeclarado')
assert.equal(occurrences('motionWatch: createWingmanStallWatch(spawnPos)'), 1, 'motionWatch não pode ser duplicado no objeto do Wingman')
assert.equal(occurrences('const playerMotionSpeed = hasPreviousPlayerPosition && dt > 0'), 1, 'velocidade do jogador deve ser calculada uma vez por frame')
assert.equal(occurrences('const readyCombatTargets = new Set(getAliveEnemies())'), 1, 'snapshot de alvos deve existir uma vez por update')
assert.ok(wingmenSource.includes('for (const e of enemies.getAlive()) if (isWingmanCombatTargetReady(e)) alive.push(e)'), 'lista de alvos deve preservar hardening gameplay-ready')
assert.ok(wingmenSource.includes('squadronFocusTargets = squadronFocusTargets.filter((t) => isWingmanCombatTargetReady(t, readyCombatTargets))'), 'Focus deve preservar validação de alvo ativo')

const ready = { mesh: { parent: {} }, dying: false, fadingOut: false }
const pending = { mesh: { parent: {} }, dying: false, fadingOut: false }
const readySet = new Set([ready])
assert.equal(isWingmanCombatTargetReady(ready, readySet), true)
assert.equal(isWingmanCombatTargetReady(pending, readySet), false, 'alvo fora da lista gameplay-ready não pode sustentar dogfight')
assert.equal(isWingmanCombatTargetReady({ ...ready, fadingOut: true }, null), false)
assert.equal(isWingmanCombatTargetReady({ ...ready, spawnInvincibleTimer: .2 }, null), false, 'spawn ainda invulnerável não pode virar alvo')
assert.equal(isWingmanCombatTargetReady({ ...ready, mesh: { parent: null } }, null), false)

const watch = createWingmanStallWatch({ x: 0, y: 0, z: 0 })
let recovered = false
for (let i = 0; i < 6; i++) {
  const result = updateWingmanStallWatch(watch, { dt: .35, position: { x: 0, y: 0, z: 0 }, targetDistance: 20, desiredSpeed: 30 })
  recovered ||= result.recover
}
assert.equal(recovered, true, 'ausência persistente de progresso deve acionar recuperação de velocidade')
const settled = createWingmanStallWatch({ x: 0, y: 0, z: 0 })
for (let i = 0; i < 8; i++) {
  assert.equal(updateWingmanStallWatch(settled, { dt: .35, position: { x: 0, y: 0, z: 0 }, targetDistance: .5, desiredSpeed: 0 }).recover, false)
}
console.log('wingman-flight-stability.test.mjs: OK')
