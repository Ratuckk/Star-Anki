import assert from 'node:assert/strict'
import {
  SPEEDLINES_DEFAULTS,
  SPEEDLINES_PRESETS,
  clampPercent,
  intensityBand,
  normalizeSpeedlinesState,
  visualCurves,
} from './speedlines-prototype-model.js'

assert.equal(clampPercent(-9), 0)
assert.equal(clampPercent(125), 100)
assert.equal(clampPercent('62'), 62)
assert.equal(intensityBand(8), 'QUASE NEUTRO')
assert.equal(intensityBand(62), 'ALTA')
assert.equal(intensityBand(96), 'EXTREMA')
assert.deepEqual(normalizeSpeedlinesState(), SPEEDLINES_DEFAULTS)
assert.equal(normalizeSpeedlinesState({ environmental: 0 }).environmental, false)

const neutral = visualCurves(SPEEDLINES_PRESETS.neutral)
const high = visualCurves(SPEEDLINES_PRESETS.high)
const extreme = visualCurves(SPEEDLINES_PRESETS.extreme)
assert.ok(neutral.trailLength < high.trailLength && high.trailLength < extreme.trailLength)
assert.ok(neutral.lineCount < high.lineCount && high.lineCount < extreme.lineCount)
assert.ok(extreme.centerClearance > 0.35)

console.log('speedlines-prototype.test.mjs: OK')
