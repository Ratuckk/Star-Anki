import {
  SPEEDLINES_APPROVED,
  clampUnit,
  speedlinesAbstractCurve,
  speedlinesCenterClearance,
  speedlinesEnvironmentalCurve,
  speedlinesLineCount,
  speedlinesTrailLength,
  speedlinesTravelSpeed,
} from './speedlines-visual-model.js'

export { SPEEDLINES_APPROVED }

export const SPEEDLINES_DEFAULTS = Object.freeze({
  ...SPEEDLINES_APPROVED,
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
  const t = clampUnit(s.intensity / 100)
  const environmental = speedlinesEnvironmentalCurve(t)
  const abstract = speedlinesAbstractCurve(t)
  return {
    t,
    environmental,
    abstract,
    lineCount: speedlinesLineCount(t, s.density),
    trailLength: speedlinesTrailLength(t, s.length),
    travelSpeed: speedlinesTravelSpeed(t),
    centerClearance: speedlinesCenterClearance(s.peripheralBias),
  }
}
