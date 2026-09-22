import assert from 'node:assert/strict'
import { createDamageFeedback } from './combat/damage-feedback.js'
import { aiValidator } from './ai-validator.js'
import { getSettings, setSetting } from './settings.js'

const data = new Map()
globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
const position = { x: 1, y: 2, z: 3, clone() { return { x: this.x, y: this.y, z: this.z } } }
const hit = { worldPos: position, meshRef: { uuid: 'target-7' }, kind: 'tank', targetMaxHp: 18, killed: true, enemyKillPoints: 100 }
assert.equal(createDamageFeedback({ ...hit, blocked: true }, 8), null, 'escudo não pode gerar dano visual')
assert.equal(createDamageFeedback(null, 8), null)
for (const pilotId of [null, 0, 1, 2, 3]) {
  const result = createDamageFeedback(hit, 8, { pilotId, charged: true })
  assert.equal(result.pilotId, pilotId)
  assert.equal(result.damage, 8)
  assert.equal(result.points, 100)
  assert.equal(result.killed, true)
  assert.equal(result.targetId, 'target-7')
  assert.equal(result.targetMaxHp, 18)
  assert.equal(result.kind, 'tank')
  result.worldPos.x = 999
  assert.equal(position.x, 1, 'projeção visual não deve corromper posição do impacto')
}
assert.equal(aiValidator.buildReport().expectativas_falhas.length, 0)
assert.equal(getSettings().damageNumberStyle, 'classic', 'save antigo continua válido')
assert.equal(getSettings().damageOrbitEnabled, true, 'orbita cooperativa vem ligada por padrao mas pode ser desligada')
setSetting('damageOrbitEnabled', false)
assert.equal(getSettings().damageOrbitEnabled, false)
setSetting('damageOrbitEnabled', true)
for (const style of ['manga', 'orbit', 'classic']) {
  setSetting('damageNumberStyle', style)
  assert.equal(getSettings().damageNumberStyle, style)
}
setSetting('damageNumberStyle', 'corrompido')
assert.equal(getSettings().damageNumberStyle, 'classic')
console.log('OK: autoria, bloqueios, dano letal, posição independente e persistência dos estilos.')
