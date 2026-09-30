// Esquadrão Dourado no sistema de inimigos REAL por frames simulados (sem Chromium; cenários em
// tools/lib/golden-scenarios.mjs). Cobre o que os testes estruturais anteriores não cobriam:
//  - rodízio de participantes (antes `slice(0, cap)` escolhia SEMPRE os mesmos caças: no D1 um caça
//    agia 15 vezes e o outro 1; os demais do esquadrão ficavam parados na formação);
//  - Pincer com flancos reais (flankOffset/elevationOffset eram dados mortos: o "Pincer" era um
//    mergulho reto a partir do slot).
import assert from 'node:assert/strict'
import { runGoldenScenarios } from '../tools/lib/golden-scenarios.mjs'

const { results } = runGoldenScenarios()
const failed = results.filter((r) => !r.ok)
for (const f of failed) console.error(`✗ ${f.name} — ${f.detail}`)
assert.equal(failed.length, 0, `${failed.length} cenário(s) do Esquadrão Dourado falharam`)
console.log(`✔ golden-runtime.test.mjs: ${results.length} verificações no sistema real`)
