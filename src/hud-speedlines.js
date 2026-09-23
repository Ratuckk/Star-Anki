import { aiValidator } from './ai-validator.js'
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
      canvas.style.width = width + 'px'
      canvas.style.height = height + 'px'
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
      ctx.strokeStyle = 'hsla(' + line.hue + ', 90%, 82%, ' + alpha + ')'
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

    const signature = (nextIsActive ? 1 : 0) + ':' + Math.round(state.intensity)
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
