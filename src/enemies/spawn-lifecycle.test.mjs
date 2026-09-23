import assert from 'node:assert'
import { isEnemySpawnPending, isolateSpawnMaterial, releaseSpawnMaterial } from './spawn-lifecycle.js'

for (const phase of ['peek', 'materialize', 'settle']) {
  assert.strictEqual(isEnemySpawnPending({ spawnPhase: phase }), true, `${phase} ainda deve estar fora do gameplay`)
}
assert.strictEqual(isEnemySpawnPending({ spawnPhase: null }), false, 'spawn concluído deve entrar no gameplay')
assert.strictEqual(isEnemySpawnPending(null), false, 'entrada nula não deve ser tratada como spawn pendente')

let disposed = 0
const sharedMaterial = {
  emissiveIntensity: 0.75,
  clone() {
    return {
      emissiveIntensity: this.emissiveIntensity,
      dispose() { disposed += 1 },
    }
  },
}
const enemy = { mesh: { material: sharedMaterial } }
const isolated = isolateSpawnMaterial(enemy)
assert.notStrictEqual(isolated, sharedMaterial, 'animação de spawn deve usar material isolado')
isolated.emissiveIntensity = 0
assert.strictEqual(sharedMaterial.emissiveIntensity, 0.75, 'spawn de uma instância não pode alterar material compartilhado')
releaseSpawnMaterial(enemy)
assert.strictEqual(enemy.mesh.material, sharedMaterial, 'fim do spawn deve restaurar material compartilhado original')
assert.strictEqual(disposed, 1, 'clone temporário do spawn deve ser descartado exatamente uma vez')

releaseSpawnMaterial(enemy)
assert.strictEqual(disposed, 1, 'release repetido não pode descartar o mesmo clone duas vezes')

console.log('OK: lifecycle de spawn e isolamento de material validados.')
