// Tank rodando no sistema de inimigos REAL por frames simulados (sem Chromium; cenários em
// tools/lib/tank-scenarios.mjs). Cobre o defeito que os testes estáticos anteriores não pegavam:
// o Tank disparava UM Siege Shot e caía num estado "undefined" (ENEMY_STATES.RECOVERING/DYING
// inexistentes → chave literal "undefined" no mapa de estados), autodestruindo-se.
import assert from 'node:assert/strict'
import { ENEMY_STATES, createStateMachine } from './enemies/state-machine.js'
import { runTankScenarios } from '../tools/lib/tank-scenarios.mjs'

// Guarda estrutural: estados inexistentes não podem mais virar a chave "undefined" silenciosamente.
assert.throws(() => createStateMachine({}, { [ENEMY_STATES.NAO_EXISTE]: {}, [ENEMY_STATES.SPAWNING]: {} }, ENEMY_STATES.SPAWNING), /undefined/)
for (const name of ['RECOVERY', 'DYING', 'STAGGERED', 'DISENGAGING', 'BRACING', 'REPOSITIONING']) assert.ok(ENEMY_STATES[name], `ENEMY_STATES.${name} existe`)
assert.equal(ENEMY_STATES.RECOVERING, undefined, 'não existe ENEMY_STATES.RECOVERING (o estado se chama RECOVERY)')

const { results } = runTankScenarios()
const failed = results.filter((r) => !r.ok)
for (const f of failed) console.error(`✗ ${f.name} — ${f.detail}`)
assert.equal(failed.length, 0, `${failed.length} cenário(s) do Tank falharam`)
console.log(`✔ tank-runtime.test.mjs: ${results.length} verificações no sistema real`)
