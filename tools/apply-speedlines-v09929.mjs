import fs from 'node:fs'

function replaceExact(path, before, after) {
  const source = fs.readFileSync(path, 'utf8')
  if (source.includes(after)) return
  if (!source.includes(before)) {
    throw new Error(`Trecho esperado não encontrado em ${path}`)
  }
  fs.writeFileSync(path, source.replace(before, after))
}

const runtimeModule = `import { aiValidator } from './ai-validator.js'
import { clampPercent, normalizeSpeedlinesState, visualCurves } from './speedlines-prototype-model.js'

export const RUNTIME_SPEEDLINES_PRESET = Object.freeze({
  intensity: 90,
  density: 58,
  length: 62,
  thickness: 100,
  brightness: 30,
  peripheralBias: 0,
  environmental: false,
  abstract: true,
  boss: false,
})

const ABSTRACT_COUNT = 180
const MAX_DPR = 1.5

function hash01(index, salt) {
  const value = Math.sin((index + 1) * (12.9898 + salt * 17.131)) * 43758.5453123
  return value - Math.floor(value)
}

export function resolveRuntimeSpeedlinesState(active, intensityOverride = null) {
  if (!active) return normalizeSpeedlinesState({ ...RUNTIME_SPEEDLINES_PRESET, intensity: 0 })
  let intensity = RUNTIME_SPEEDLINES_PRESET.intensity
  if (intensityOverride != null) {
    const numeric = Number(intensityOverride)
    if (Number.isFinite(numeric)) intensity = numeric <= 1 ? numeric * 100 : numeric
  }
  return normalizeSpeedlinesState({ ...RUNTIME_SPEEDLINES_PRESET, intensity: clampPercent(intensity) })
}

export function createSpeedlineDescriptor(index) {
  return Object.freeze({
    angle: (index / ABSTRACT_COUNT) * Math.PI * 2 + (hash01(index, 1) - 0.5) * 0.16,
    phase: hash01(index, 2),
    speed: 0.55 + hash01(index, 3) * 1.15,
    width: 0.55 + hash01(index, 4) * 1.5,
    length: 0.55 + hash01(index, 5) * 0.75,
    hue: hash01(index, 6) < 0.16 ? 202 : 215,
  })
}

export function createHudSpeedlines(root = document.getElementById('game-screen')) {
  if (!root) throw new Error('createHudSpeedlines: #game-screen não encontrado')

  // O HUD legado cria um spinner via repeating-conic-gradient. A fachada nova assume o canal
  // inteiro e remove o nó antigo para não deixar dois efeitos concorrendo pela mesma leitura.
  root.querySelector('.hud-motion-lines')?.remove()

  const canvas = document.createElement('canvas')
  canvas.className = 'hud-directional-speedlines'
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '3',
    opacity: '1',
    willChange: 'contents, opacity',
  })
  root.appendChild(canvas)

  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) throw new Error('createHudSpeedlines: contexto 2D indisponível')

  const lines = Array.from({ length: ABSTRACT_COUNT }, (_, index) => ({ ...createSpeedlineDescriptor(index) }))
  let state = resolveRuntimeSpeedlinesState(false)
  let active = false
  let disposed = false
  let rafId = 0
  let lastFrameAt = 0
  let width = 1
  let height = 1
  let dpr = 1
  let lastValidationSignature = ''

  function resize() {
    if (disposed) return
    const rect = root.getBoundingClientRect()
    width = Math.max(1, rect.width || window.innerWidth || 1)
    height = Math.max(1, rect.height || window.innerHeight || 1)
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    const pixelWidth = Math.max(1, Math.round(width * dpr))
    const pixelHeight = Math.max(1, Math.round(height * dpr))
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth
      canvas.height = pixelHeight
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
  }

  function clear() {
    ctx.clearRect(0, 0, width, height)
  }

  function draw(now) {
    rafId = 0
    if (!active || disposed) return
    resize()
    const dt = lastFrameAt > 0 ? Math.min(0.05, Math.max(0, (now - lastFrameAt) / 1000)) : 0
    lastFrameAt = now
    const curves = visualCurves(state)
    clear()
    if (curves.abstract <= 0.003) return

    const cx = width * 0.5
    const cy = height * 0.47
    const maxRadius = Math.hypot(width, height) * 0.68
    const innerRadius = Math.min(width, height) * curves.centerClearance
    const count = Math.min(ABSTRACT_COUNT, curves.lineCount)

    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    for (let i = 0; i < count; i += 1) {
      const line = lines[i]
      line.phase = (line.phase + dt * line.speed * (0.16 + curves.abstract * 1.7)) % 1
      const eased = line.phase * line.phase
      const startRadius = innerRadius + eased * (maxRadius - innerRadius)
      const lineLength = (18 + 210 * curves.abstract * state.length / 100) * line.length * (0.35 + line.phase)
      const endRadius = Math.min(maxRadius * 1.15, startRadius + lineLength)
      const cos = Math.cos(line.angle)
      const sin = Math.sin(line.angle)
      const alpha = curves.abstract * (state.brightness / 100) * Math.sin(line.phase * Math.PI) * 0.76
      ctx.strokeStyle = `hsla(${line.hue}, 90%, 82%, ${alpha})`
      ctx.lineWidth = (0.35 + state.thickness / 100 * 2.6) * line.width
      ctx.beginPath()
      ctx.moveTo(cx + cos * startRadius, cy + sin * startRadius)
      ctx.lineTo(cx + cos * endRadius, cy + sin * endRadius)
      ctx.stroke()
    }
    ctx.globalCompositeOperation = 'source-over'
    rafId = requestAnimationFrame(draw)
  }

  function start() {
    if (rafId || disposed) return
    lastFrameAt = 0
    rafId = requestAnimationFrame(draw)
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
    lastFrameAt = 0
    clear()
  }

  function set(nextActive, intensityOverride = null) {
    if (disposed) return
    const resolved = resolveRuntimeSpeedlinesState(!!nextActive, intensityOverride)
    const nextIsActive = !!nextActive && resolved.intensity > 0
    state = resolved

    const signature = `${nextIsActive ? 1 : 0}:${Math.round(state.intensity)}`
    if (signature !== lastValidationSignature) {
      lastValidationSignature = signature
      aiValidator.expect(
        'Speedlines direcionais mantêm intensidade válida e zeram fora dos gatilhos',
        () => state.intensity >= 0 && state.intensity <= 100 && (nextIsActive || state.intensity === 0),
        { active: nextIsActive, intensity: state.intensity, density: state.density, length: state.length },
      )
      aiValidator.logMechanic('hud-speedlines', nextIsActive ? 'ativadas' : 'desativadas', {
        intensity: state.intensity,
        density: state.density,
        length: state.length,
        thickness: state.thickness,
        brightness: state.brightness,
        peripheralBias: state.peripheralBias,
      })
    }

    if (active !== nextIsActive) {
      active = nextIsActive
      if (active) start()
      else stop()
    } else if (active) {
      start()
    }
  }

  const onResize = () => resize()
  window.addEventListener('resize', onResize)
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
  resizeObserver?.observe(root)
  resize()

  return {
    canvas,
    set,
    dispose() {
      if (disposed) return
      disposed = true
      stop()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', onResize)
      canvas.remove()
    },
  }
}
`

fs.writeFileSync('src/hud-speedlines.js', runtimeModule)

const runtimeTest = `import assert from 'node:assert/strict'
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
assert.match(hudFacade, /hud\.setMotionLines\s*=\s*\(active, intensity = null\)/, 'fachada deve substituir setMotionLines legado')
assert.match(hudFacade, /speedlines\.dispose\(\)/, 'unmount deve liberar canvas/RAF/listeners')

const runtimeSource = readFileSync(new URL('./hud-speedlines.js', import.meta.url), 'utf8')
assert.match(runtimeSource, /querySelector\('\.hud-motion-lines'\)\?\.remove\(\)/, 'spinner legado precisa sair do DOM')
assert.doesNotMatch(runtimeSource, /environmental.*true/, 'renderer de gameplay não deve ativar camada ambiental do laboratório')

console.log('hud-speedlines.test.mjs: OK')
`
fs.writeFileSync('src/hud-speedlines.test.mjs', runtimeTest)

replaceExact(
  'src/hud.js',
  "import { createWingmanRadioSlots } from './hud-wingman-radio-slots.js'\n",
  "import { createWingmanRadioSlots } from './hud-wingman-radio-slots.js'\nimport { createHudSpeedlines } from './hud-speedlines.js'\n",
)
replaceExact(
  'src/hud.js',
  "  const wingmanSlots = createWingmanRadioSlots()\n  const baseUnmount = hud.unmount?.bind(hud)\n",
  "  const wingmanSlots = createWingmanRadioSlots()\n  const speedlines = createHudSpeedlines(document.getElementById('game-screen'))\n  const baseUnmount = hud.unmount?.bind(hud)\n",
)
replaceExact(
  'src/hud.js',
  "  hud.unmount = () => {\n    wingmanSlots.dispose()\n    baseUnmount?.()\n  }\n",
  "  // O contrato antigo do game-loop continua intacto: boost passa intensity=null e usa o\n  // preset de gameplay; Swirl/Dash passam 1.0 e elevam apenas a intensidade para 100%.\n  hud.setMotionLines = (active, intensity = null) => {\n    speedlines.set(active, intensity)\n  }\n\n  hud.unmount = () => {\n    speedlines.dispose()\n    wingmanSlots.dispose()\n    baseUnmount?.()\n  }\n",
)

replaceExact('src/version.js', "export const GAME_VERSION = 'v0.99.28'\n", "export const GAME_VERSION = 'v0.99.29'\n")

const progressPath = 'progresso/PROGRESSO_POS_.90.md'
let progress = fs.readFileSync(progressPath, 'utf8')
if (!progress.includes('### v0.99.29 — Speedlines direcionais do Visual Lab no gameplay')) {
  progress += `\n\n### v0.99.29 — Speedlines direcionais do Visual Lab no gameplay\n\n- O laboratório isolado permanece como referência; o gameplay reaproveita apenas a camada abstrata em canvas, sem duplicar estrelas/partículas ambientais.\n- \\`src/hud-speedlines.js\\` substitui visualmente o spinner legado de \\.hud-motion-lines\\` e preserva o contrato \\`hud.setMotionLines(active, intensity)\\`.\n- Boost normal usa o preset escolhido 90/58/62/100/30/0 (intensidade/densidade/comprimento/espessura/brilho/bias); Swirl Blast e dash lateral continuam podendo elevar a intensidade a 100%. Fora desses gatilhos a intensidade é 0 e o canvas é limpo.\n- O renderer usa pool determinístico de 180 linhas, RAF somente enquanto ativo, DPR limitado a 1.5, resize responsivo e dispose completo no unmount.\n- O \\`aiValidator\\` registra apenas transições discretas de ligado/desligado/intensidade, sem log por frame.\n- O Service Worker não ganhou manifesto fixo: o módulo novo segue a estratégia network-first já existente para módulos same-origin e entra no cache ao ser solicitado.\n\n**Validação automatizada:** \\`node --check\\` nos módulos alterados, \\`node src/hud-speedlines.test.mjs\\`, \\`node src/speedlines-prototype.test.mjs\\`, \\`node src/selftest.mjs\\` e \\`git diff --check\\`.\n\n**Playtest pendente:** confirmar no navegador que boost normal corresponde visualmente à referência do laboratório, Swirl/Dash atingem o pico sem o spinner legado, resize/restart não deixam canvas órfão e o console permanece limpo.\n`
  fs.writeFileSync(progressPath, progress)
}

console.log('apply-speedlines-v09929.mjs: OK')
