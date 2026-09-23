// Curvas e preset compartilhados pelo laboratório e pelo gameplay real. As funções escalares
// não alocam objetos, então podem ser usadas dentro do game loop sem gerar pressão de GC.
export const SPEEDLINES_APPROVED = Object.freeze({
  intensity: 90,
  density: 58,
  length: 62,
  thickness: 100,
  brightness: 30,
  peripheralBias: 0,
})

export function clampUnit(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : 0
}

export function speedlinesEnvironmentalCurve(intensity) {
  return Math.pow(clampUnit(intensity), 1.12)
}

export function speedlinesAbstractCurve(intensity) {
  return Math.pow(Math.max(0, (clampUnit(intensity) - 0.18) / 0.82), 1.34)
}

export function speedlinesLineCount(intensity, densityPercent = SPEEDLINES_APPROVED.density) {
  return Math.round(12 + 168 * speedlinesAbstractCurve(intensity) * (Math.max(0, Math.min(100, densityPercent)) / 100))
}

export function speedlinesTrailLength(intensity, lengthPercent = SPEEDLINES_APPROVED.length) {
  return 0.06 + 24 * speedlinesEnvironmentalCurve(intensity) * (Math.max(0, Math.min(100, lengthPercent)) / 100)
}

export function speedlinesTravelSpeed(intensity) {
  return 4 + 82 * Math.pow(clampUnit(intensity), 1.45)
}

export function speedlinesCenterClearance(peripheralBiasPercent = SPEEDLINES_APPROVED.peripheralBias) {
  return 0.12 + 0.35 * (Math.max(0, Math.min(100, peripheralBiasPercent)) / 100)
}
