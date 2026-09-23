import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  computeWingmanPairSeparation,
  WINGMAN_CLUMP_DISTANCE,
  WINGMAN_CLUMP_GRACE_S,
} from './combat/wingman-formation-separation.js'

const frame = {
  right: { x: 1, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  forward: { x: 0, y: 0, z: 1 },
}

function member(id, x, y, z, slot) {
  return { id, position: { x, y, z }, slot, retreating: false }
}

// 1. Sobreposição exata precisa produzir impulsos finitos, opostos e alinhados às vagas.
{
  const a = member(0, 0, 0, 0, { side: -11, up: 1, forward: 14 })
  const b = member(1, 0, 0, 0, { side: 12.5, up: -0.5, forward: 5 })
  const r = computeWingmanPairSeparation(a, b, frame, 7, 48)
  assert.ok(r, 'par exatamente sobreposto deveria receber separação')
  assert.ok(Number.isFinite(r.pushA.x) && Number.isFinite(r.pushA.y) && Number.isFinite(r.pushA.z))
  assert.deepStrictEqual(r.pushB, { x: -r.pushA.x, y: -r.pushA.y, z: -r.pushA.z })
  assert.deepStrictEqual(r.correctionB, { x: -r.correctionA.x, y: -r.correctionA.y, z: -r.correctionA.z })
  const correctedDistance = Math.hypot(
    (a.position.x + r.correctionA.x) - (b.position.x + r.correctionB.x),
    (a.position.y + r.correctionA.y) - (b.position.y + r.correctionB.y),
    (a.position.z + r.correctionA.z) - (b.position.z + r.correctionB.z),
  )
  assert.ok(correctedDistance > 1, 'correcao posicional precisa tirar sobreposicao exata da zona de clump em um frame')
  const expected = { x: a.slot.side - b.slot.side, y: a.slot.up - b.slot.up, z: a.slot.forward - b.slot.forward }
  const dot = r.pushA.x * expected.x + r.pushA.y * expected.y + r.pushA.z * expected.z
  assert.ok(dot > 0, 'fallback de sobreposição exata deve empurrar cada piloto rumo ao lado da própria vaga')
}

// 2. Par parcialmente sobreposto também deve receber impulsos perfeitamente simétricos.
{
  const a = member(0, 1, 2, 3, { side: -11, up: 1, forward: 14 })
  const b = member(2, 4, 2, 3, { side: -12.5, up: -0.5, forward: 4 })
  const r = computeWingmanPairSeparation(a, b, frame, 7, 48)
  assert.ok(r)
  assert.ok(Math.abs(r.distance - 3) < 1e-9)
  assert.ok(Math.abs(r.pushA.x + r.pushB.x) < 1e-9)
  assert.ok(Math.abs(r.pushA.y + r.pushB.y) < 1e-9)
  assert.ok(Math.abs(r.pushA.z + r.pushB.z) < 1e-9)
}

// 3. Fora do raio, não existe correção.
{
  const a = member(0, 0, 0, 0, { side: -11, up: 1, forward: 14 })
  const b = member(3, 9, 0, 0, { side: 11, up: 2.2, forward: 16 })
  assert.strictEqual(computeWingmanPairSeparation(a, b, frame, 7, 48), null)
}

// 4. Retreat não participa da deconflição da formação.
{
  const a = member(0, 0, 0, 0, { side: -11, up: 1, forward: 14 })
  const b = member(1, 0, 0, 0, { side: 12.5, up: -0.5, forward: 5 })
  b.retreating = true
  assert.strictEqual(computeWingmanPairSeparation(a, b, frame, 7, 48), null)
}

// 5. Os limites do detector de clump precisam ser positivos e pequenos o bastante para não
//    acusar a formação nominal, mas longos o bastante para ignorar cruzamentos instantâneos.
assert.ok(WINGMAN_CLUMP_DISTANCE > 0 && WINGMAN_CLUMP_DISTANCE < 7)
assert.ok(WINGMAN_CLUMP_GRACE_S >= 0.4 && WINGMAN_CLUMP_GRACE_S <= 1)

// 6. Proteção estrutural: a integração calcula cada par uma vez e mantém a separação como
//    proteção local, não como remendo de um estado global de regroup.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const wingmenSource = readFileSync(path.join(__dirname, 'combat', 'wingmen.js'), 'utf8')
assert.ok(wingmenSource.includes('otherIdx = idx + 1'), 'separação precisa iterar pares não ordenados apenas uma vez')
assert.ok(wingmenSource.includes('separationPush.addScaledVector'), 'integração precisa aplicar contribuição simétrica pré-calculada')
assert.ok(wingmenSource.includes('separationCorrection') && wingmenSource.includes('WINGMAN_SEPARATION_POSITION_STEP_CAP'), 'integração precisa corrigir penetracao fisica com passo limitado')
assert.ok(!wingmenSource.includes('emergencyRegroup'), 'separação não pode depender de emergency regroup')

console.log('wingman-formation-separation.test.mjs: OK')
