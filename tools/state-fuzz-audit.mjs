import {
  computeWingmanPairSeparation,
  WINGMAN_SEPARATION_PAIR_CORRECTION_CAP,
} from '../src/combat/wingman-formation-separation.js'
import {
  WINGMAN_RAIL_CATCHUP_MAX_BONUS,
  computeRailCatchupBoost,
  computeRailLongitudinalLag,
  updateRailCatchupState,
} from '../src/combat/wingman-navigation.js'
import {
  computeFormationMotionGain,
  computeWingmanArrivalScale,
} from '../src/combat/wingman-flight-stability.js'

let seed = 0x5a17c0de
function rnd() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed / 0x100000000
}
function span(min, max) { return min + (max - min) * rnd() }
function finiteVec(v) { return v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z) }

const failures = []
let checks = 0
function expect(description, condition, context = {}) {
  checks += 1
  if (!condition && failures.length < 100) failures.push({ description, context })
}

const frame = {
  right: { x: 1, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  forward: { x: 0, y: 0, z: 1 },
}
const slots = [
  { side: -11, up: 1, forward: 14 },
  { side: 12.5, up: -0.5, forward: 5 },
  { side: -12.5, up: -0.5, forward: 4 },
  { side: 11, up: 2.2, forward: 16 },
]

for (let i = 0; i < 6000; i += 1) {
  const aId = Math.floor(rnd() * 4)
  let bId = Math.floor(rnd() * 4)
  if (bId === aId) bId = (bId + 1) % 4
  const a = {
    id: aId,
    position: { x: span(-20, 20), y: span(-8, 8), z: span(-20, 20) },
    slot: slots[aId],
    retreating: rnd() < 0.03,
  }
  const b = {
    id: bId,
    position: rnd() < 0.08
      ? { ...a.position }
      : { x: span(-20, 20), y: span(-8, 8), z: span(-20, 20) },
    slot: slots[bId],
    retreating: rnd() < 0.03,
  }
  const sep = computeWingmanPairSeparation(a, b, frame, 7, 48)
  if (sep) {
    expect('pair separation finite', finiteVec(sep.pushA) && finiteVec(sep.pushB) && finiteVec(sep.correctionA) && finiteVec(sep.correctionB), { i, sep })
    expect('pair push symmetric', Math.abs(sep.pushA.x + sep.pushB.x) < 1e-9 && Math.abs(sep.pushA.y + sep.pushB.y) < 1e-9 && Math.abs(sep.pushA.z + sep.pushB.z) < 1e-9, { i, sep })
    const correctionMag = Math.hypot(sep.correctionA.x, sep.correctionA.y, sep.correctionA.z)
    expect('pair correction clamped', correctionMag <= WINGMAN_SEPARATION_PAIR_CORRECTION_CAP + 1e-9, { i, correctionMag })
  }

  const lag = span(-180, 420)
  const wasActive = rnd() < 0.5
  const active = updateRailCatchupState(lag, wasActive)
  const boost = active ? computeRailCatchupBoost(Math.max(lag, 32)) : 0
  expect('catchup boolean', typeof active === 'boolean', { i, lag, wasActive, active })
  expect('catchup boost finite/clamped', Number.isFinite(boost) && boost >= 0 && boost <= WINGMAN_RAIL_CATCHUP_MAX_BONUS, { i, lag, boost })

  const player = { x: span(-100, 100), y: span(-100, 100), z: span(-100, 100) }
  const wingman = { x: span(-100, 100), y: span(-100, 100), z: span(-100, 100) }
  const longitudinal = computeRailLongitudinalLag(wingman, player, frame)
  expect('longitudinal lag finite', Number.isFinite(longitudinal), { i, longitudinal })

  const arrival = computeWingmanArrivalScale(span(-5, 40))
  const motionGain = computeFormationMotionGain(span(-5, 80))
  expect('arrival scale normalized', Number.isFinite(arrival) && arrival >= 0 && arrival <= 1, { i, arrival })
  expect('motion gain normalized', Number.isFinite(motionGain) && motionGain >= 0 && motionGain <= 1, { i, motionGain })
}

const report = {
  seed: '0x5a17c0de',
  iterations: 6000,
  verificacoes: checks,
  falhas: failures.length,
  expectativas_falhas: failures,
}
console.log(JSON.stringify(report, null, 2))
if (failures.length) process.exitCode = 1
