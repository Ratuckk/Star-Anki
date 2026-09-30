// Validator do Tank no sistema de inimigos REAL (headless Node, sem Chromium). Imprime a
// evidência por cenário: estados, ataques, projéteis (speed/dano/power), Ram, Stagger, blindagem,
// ciclos/disengage. NÃO valida aparência.
//   node tools/validate-tank-runtime.mjs
import { runTankScenarios } from './lib/tank-scenarios.mjs'
const { results, evidence } = runTankScenarios()
const failed = results.filter((r) => !r.ok)
for (const r of results) console.log(`${r.ok ? '✔' : '✗'} ${r.name}${r.ok ? '' : ' — ' + r.detail}`)
console.log('\nEVIDÊNCIA:\n' + JSON.stringify(evidence, null, 1))
console.log(`\n[TANK-RUNTIME] ${results.length} verificações, ${failed.length} falha(s)`)
console.log('VALIDADO EM RUNTIME (sistema de inimigos real, frames simulados): ' + (failed.length ? 'NÃO — há falhas' : 'SIM'))
console.log('VALIDADO VISUALMENTE: NÃO — NÃO FOI POSSÍVEL VALIDAR VISUALMENTE.')
process.exit(failed.length ? 1 : 0)
