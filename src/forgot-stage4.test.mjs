import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fogSpawnStrengthAtOffset, FOG_BANK_PERIOD } from './fog-visual-model.js'

const centerDistance = 47.5
assert.ok(fogSpawnStrengthAtOffset(centerDistance, 0) > 0.99)
assert.ok(fogSpawnStrengthAtOffset(centerDistance - 40, 40) > 0.99, 'forward spawn should sample the visible bank ahead')
assert.equal(
  fogSpawnStrengthAtOffset(centerDistance, -999),
  fogSpawnStrengthAtOffset(centerDistance, 0),
  'negative spawn offsets must clamp to the player rail distance',
)
assert.ok(fogSpawnStrengthAtOffset(centerDistance + FOG_BANK_PERIOD, 0) > 0.99)

const enemies = fs.readFileSync(new URL('./enemies/index.js', import.meta.url), 'utf8')
const effects = fs.readFileSync(new URL('./effects.js', import.meta.url), 'utf8')
const projectiles = fs.readFileSync(new URL('./combat/projectiles.js', import.meta.url), 'utf8')

assert.match(enemies, /spawnFogVisualStrengthFor/)
assert.match(enemies, /materialize-from-visible-bank/)
assert.match(enemies, /triggerFogSpawnMaterialization\(enemy\)/)
assert.match(enemies, /SPAWN_FOG_INTEGRATION_THRESHOLD/)
assert.match(effects, /opts\.bossClass/)
assert.match(effects, /opts\.kind === 'golden'/)
assert.match(projectiles, /bossClassImpact = h\.kind === BOSS_KIND \|\| h\.kind === GOLDEN_KIND/)
assert.match(projectiles, /SWIRL_TRAIL_SPACING = 3\.2/)
assert.match(projectiles, /trailDistance/)
assert.match(effects, /SWIRL_AFTERIMAGE_DURATION = 0\.8/)

console.log('forgot stage 4 tests: ok')
