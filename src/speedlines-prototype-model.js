export const SPEEDLINES_DEFAULTS = Object.freeze({
  intensity: 78,
  density: 72,
  length: 76,
  thickness: 42,
  brightness: 66,
  peripheralBias: 74,
  environmental: true,
  abstract: true,
  boss: true,
})

export const SPEEDLINES_PRESETS = Object.freeze({
  neutral: { intensity: 8, density: 35, length: 28, thickness: 30, brightness: 38, peripheralBias: 68 },
  high: { intensity: 62, density: 66, length: 64, thickness: 38, brightness: 58, peripheralBias: 72 },
  extreme: { intensity: 96, density: 88, length: 92, thickness: 58, brightness: 82, peripheralBias: 78 },
})

export function clampPercent(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0
}

export function normalizeSpeedlinesState(candidate = {}) {
  const state = { ...SPEEDLINES_DEFAULTS, ...candidate }
  for (const key of ['intensity', 'density', 'length', 'thickness', 'brightness', 'peripheralBias']) {
    state[key] = clampPercent(state[key])
  }
  for (const key of ['environmental', 'abstract', 'boss']) state[key] = !!state[key]
  return state
}

export function intensityBand(value) {
  const v = clampPercent(value)
  if (v <= 20) return 'QUASE NEUTRO'
  if (v <= 45) return 'PERCEPTÍVEL'
  if (v <= 70) return 'ALTA'
  if (v <= 90) return 'MUITO ALTA'
  return 'EXTREMA'
}

export function visualCurves(state) {
  const s = normalizeSpeedlinesState(state)
  const t = s.intensity / 100
  const environmental = Math.pow(t, 1.12)
  const abstract = Math.pow(Math.max(0, (t - 0.18) / 0.82), 1.34)
  return {
    t,
    environmental,
    abstract,
    lineCount: Math.round(12 + 168 * abstract * (s.density / 100)),
    trailLength: (0.06 + 24 * environmental * (s.length / 100)),
    travelSpeed: 4 + 82 * Math.pow(t, 1.45),
    centerClearance: 0.12 + 0.35 * (s.peripheralBias / 100),
  }
}
