// Validator do Esquadrão Dourado no sistema de inimigos REAL (headless Node, sem Chromium):
// dificuldades 1/5/9 com 0/2/4 aliados (caps de esquadrão 2/6/10, ofensivo 1/3/5), participação por
// caça, ordens, Pincer, Strafing, Laser Flank, Coordinated Fire, tiros reais, abates, reposição,
// teleporte do comandante e comandante sozinho. NÃO valida aparência.
//   node tools/validate-golden-runtime.mjs
import { runGoldenScenarios } from './lib/golden-scenarios.mjs'
const { results, evidence } = runGoldenScenarios()
const failed = results.filter((r) => !r.ok)
for (const r of results) console.log(`${r.ok ? '✔' : '✗'} ${r.name}${r.ok ? '' : ' — ' + r.detail}`)
console.log('\nEVIDÊNCIA:\n' + JSON.stringify(evidence, null, 1))
console.log(`\n[GOLDEN-RUNTIME] ${results.length} verificações, ${failed.length} falha(s)`)
console.log('VALIDADO EM RUNTIME (sistema de inimigos real, frames simulados): ' + (failed.length ? 'NÃO — há falhas' : 'SIM'))
console.log('VALIDADO VISUALMENTE: NÃO — NÃO FOI POSSÍVEL VALIDAR VISUALMENTE.')
process.exit(failed.length ? 1 : 0)
