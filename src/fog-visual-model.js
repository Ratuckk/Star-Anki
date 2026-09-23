export const FOG_BANK_PERIOD = 340
export const FOG_BANK_LENGTH = 95
export const FOG_BANK_FADE_MARGIN = 26

function positiveMod(value, mod) {
  return ((value % mod) + mod) % mod
}

function smoothstep01(value) {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

// Intensidade visual do bolsão atual, com fade antes/depois da faixa de densidade de gameplay.
// Isso não altera o FogExp2 nem a mecânica: só alimenta estrelas intermediárias e volumes.
export function fogPocketVisualStrength(distance) {
  const local = positiveMod(Number.isFinite(distance) ? distance : 0, FOG_BANK_PERIOD)
  const center = FOG_BANK_LENGTH * 0.5
  const half = FOG_BANK_LENGTH * 0.5
  const rawDelta = Math.abs(local - center)
  const circularDelta = Math.min(rawDelta, FOG_BANK_PERIOD - rawDelta)
  const core = Math.max(0, half - 10)
  const outer = half + FOG_BANK_FADE_MARGIN
  if (circularDelta <= core) return 1
  if (circularDelta >= outer) return 0
  return 1 - smoothstep01((circularDelta - core) / (outer - core))
}

// Centros dos próximos bancos à frente do jogador. Nunca retorna offset negativo, então o
// renderer não depende de getFrameAt() aceitar amostras atrás da nave.
export function nextFogBankOffsets(distance, count = 3) {
  const n = Math.max(0, Math.trunc(count))
  const local = positiveMod(Number.isFinite(distance) ? distance : 0, FOG_BANK_PERIOD)
  const center = FOG_BANK_LENGTH * 0.5
  let first = center - local
  if (first < 6) first += FOG_BANK_PERIOD
  return Array.from({ length: n }, (_, i) => first + i * FOG_BANK_PERIOD)
}
