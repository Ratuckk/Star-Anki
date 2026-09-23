import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createDamageFeedback } from './combat/damage-feedback.js'
import { MANGA_VISUAL_SCALE, ORBIT_RADIUS, getOrbitAngle } from './hud-damage.js'
import { aiValidator } from './ai-validator.js'
import { getSettings, setSetting } from './settings.js'

const data = new Map()
globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
const position = { x: 1, y: 2, z: 3, clone() { return { x: this.x, y: this.y, z: this.z } } }
const targetPosition = { x: 9, y: 8, z: 7, clone() { return { x: this.x, y: this.y, z: this.z } } }
const hit = { worldPos: position, meshRef: { uuid: 'target-7', position: targetPosition }, kind: 'tank', targetMaxHp: 18, killed: true, enemyKillPoints: 100 }
assert.equal(createDamageFeedback({ ...hit, blocked: true }, 8), null)
const result = createDamageFeedback(hit, 8, { pilotId: 2, charged: true })
assert.equal(result.targetWorldPos.x, 9)
result.targetWorldPos.x = 999
assert.equal(targetPosition.x, 9, 'centro visual deve ser clone independente')
result.worldPos.x = 999
assert.equal(position.x, 1)
assert.equal(MANGA_VISUAL_SCALE, .5, 'Mangá precisa ter metade do tamanho visual')
assert.equal(ORBIT_RADIUS, 64)
assert.ok(Math.abs((getOrbitAngle(2, 1) - getOrbitAngle(2, 0)) - Math.PI * 2) < 1e-9)
const damageSource = readFileSync(new URL('./hud-damage.js', import.meta.url), 'utf8')
assert.ok(damageSource.includes("document.createElementNS(ns, 'circle')"), 'Buraco Negro precisa usar círculo SVG real')
assert.ok(!damageSource.includes('stroke-dasharray'), 'círculo não pode voltar a ser fragmentos por autor')
assert.ok(damageSource.includes('OFFSETS[slot][0] * launch'), 'Mangá precisa nascer do centro antes de ocupar o offset')
assert.equal(aiValidator.buildReport().expectativas_falhas.length, 0)
assert.equal(getSettings().damageNumberStyle, 'classic')
for (const style of ['manga', 'orbit', 'classic']) { setSetting('damageNumberStyle', style); assert.equal(getSettings().damageNumberStyle, style) }
console.log('damage-feedback.test.mjs: OK')
