import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  RUNTIME_SPEEDLINES_PRESET,
  createSpeedlineDescriptor,
  resolveRuntimeSpeedlinesState,
} from './hud-speedlines.js'
import { visualCurves } from './speedlines-prototype-model.js'

assert.deepEqual(
  [
    RUNTIME_SPEEDLINES_PRESET.intensity,
    RUNTIME_SPEEDLINES_PRESET.density,
    RUNTIME_SPEEDLINES_PRESET.length,
    RUNTIME_SPEEDLINES_PRESET.thickness,
    RUNTIME_SPEEDLINES_PRESET.brightness,
    RUNTIME_SPEEDLINES_PRESET.peripheralBias,
  ],
  [90, 58, 62, 100, 30, 0],
  'preset de gameplay deve preservar a referência escolhida',
)
assert.equal(RUNTIME_SPEEDLINES_PRESET.environmental, false, 'runtime não deve duplicar estrelas/partículas ambientais')
assert.equal(RUNTIME_SPEEDLINES_PRESET.abstract, true)
assert.equal(RUNTIME_SPEEDLINES_PRESET.boss, false)

const off = resolveRuntimeSpeedlinesState(false)
assert.equal(off.intensity, 0, 'fora de boost/Swirl/Dash a intensidade deve ser zero')
const boost = resolveRuntimeSpeedlinesState(true)
assert.equal(boost.intensity, 90, 'boost normal usa 90%')
const max = resolveRuntimeSpeedlinesState(true, 1)
assert.equal(max.intensity, 100, 'Swirl/Dash podem pedir intensidade máxima')
assert.equal(resolveRuntimeSpeedlinesState(true, 0.5).intensity, 50)
assert.equal(resolveRuntimeSpeedlinesState(true, 170).intensity, 100, 'override deve ser limitado a 100')
assert.ok(visualCurves(boost).lineCount > 0)
assert.ok(visualCurves(max).lineCount >= visualCurves(boost).lineCount)

assert.deepEqual(createSpeedlineDescriptor(17), createSpeedlineDescriptor(17), 'pool deve ser determinístico')
assert.notDeepEqual(createSpeedlineDescriptor(17), createSpeedlineDescriptor(18), 'linhas diferentes não devem colapsar no mesmo descritor')

const hudFacade = readFileSync(new URL('./hud.js', import.meta.url), 'utf8')
assert.match(hudFacade, /createHudSpeedlines/, 'hud.js deve integrar o renderer direcional')
assert.ok(hudFacade.includes('hud.setMotionLines = (active, intensity = null) => {'), 'fachada deve substituir setMotionLines legado')
assert.match(hudFacade, /speedlines.dispose()/, 'unmount deve liberar canvas/RAF/listeners')

const runtimeSource = readFileSync(new URL('./hud-speedlines.js', import.meta.url), 'utf8')
assert.ok(runtimeSource.includes("querySelector('.hud-motion-lines')?.remove()"), 'spinner legado precisa sair do DOM')
assert.doesNotMatch(runtimeSource, /environmental.*true/, 'renderer de gameplay não deve ativar camada ambiental do laboratório')

console.log('hud-speedlines.test.mjs: OK')
