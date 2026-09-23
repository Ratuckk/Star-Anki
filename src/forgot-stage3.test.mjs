import assert from 'node:assert/strict'
import fs from 'node:fs'
import { sampleSwirlCamera, SWIRL_CAMERA_RELEASE_DEG } from './swirl-camera-model.js'
import { fogPocketVisualStrength, nextFogBankOffsets, FOG_BANK_PERIOD } from './fog-visual-model.js'

const start = sampleSwirlCamera(0, 300)
const anticipation = sampleSwirlCamera(30, 300)
const release = sampleSwirlCamera(120, 300)
const end = sampleSwirlCamera(300, 300)
assert.equal(start.phase, 'anticipation')
assert.equal(start.fovOffsetDeg, 0)
assert.ok(anticipation.fovOffsetDeg < 0, 'anticipation must compress FOV')
assert.equal(release.phase, 'release')
assert.ok(release.fovOffsetDeg > 0, 'release must open after the compression beat')
assert.ok(release.fovOffsetDeg <= SWIRL_CAMERA_RELEASE_DEG + 1e-9)
assert.equal(end.phase, 'return')
assert.ok(Math.abs(end.fovOffsetDeg) < 1e-9, 'camera curve must end on exact base FOV')
assert.ok(Math.abs(end.rollRad) < 1e-9, 'camera curve must end with zero added roll')

assert.ok(fogPocketVisualStrength(47.5) > 0.99, 'fog bank center should read as dense')
assert.ok(fogPocketVisualStrength(170) < 0.01, 'space between banks should remain clear')
assert.ok(fogPocketVisualStrength(47.5 + FOG_BANK_PERIOD) > 0.99, 'fog visual must be periodic')
const offsets = nextFogBankOffsets(50, 4)
assert.equal(offsets.length, 4)
assert.ok(offsets.every((v) => v >= 0), 'bank sampling must never ask rail for a negative offset')
for (let i = 1; i < offsets.length; i += 1) assert.equal(offsets[i] - offsets[i - 1], FOG_BANK_PERIOD)

const flow = fs.readFileSync(new URL('./flow-question.js', import.meta.url), 'utf8')
const hud = fs.readFileSync(new URL('./hud-game.js', import.meta.url), 'utf8')
const loop = fs.readFileSync(new URL('./game-loop.js', import.meta.url), 'utf8')
const env = fs.readFileSync(new URL('./environment.js', import.meta.url), 'utf8')
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
assert.match(flow, /compact:\s*compactArcadeDraft/)
assert.match(hud, /arcade-compact/)
assert.match(html, /\.card-choice-overlay\.arcade-compact/)
assert.match(loop, /sampleSwirlCamera\(/)
assert.match(loop, /swirlCameraBaseFov/)
assert.doesNotMatch(loop, /camera\.fov\s*=\s*70\s*\+/)
assert.match(env, /fog:\s*true/)
assert.match(env, /nextFogBankOffsets/)
assert.match(env, /fogBankRoots/)

console.log('forgot stage 3 tests: ok')
