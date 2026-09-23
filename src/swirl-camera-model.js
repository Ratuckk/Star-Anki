const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
const smoothstep = (t) => {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3)
const lerp = (a, b, t) => a + (b - a) * t

export const SWIRL_CAMERA_ANTICIPATION_FRAC = 0.16
export const SWIRL_CAMERA_RELEASE_FRAC = 0.48
export const SWIRL_CAMERA_COMPRESS_DEG = -4
export const SWIRL_CAMERA_RELEASE_DEG = 8
export const SWIRL_CAMERA_ROLL_DEG = 2.4

// Curva puramente visual. A câmera comprime primeiro (projétil parece maior), dá o kick no
// release e volta exatamente a zero no fim. O caller aplica os offsets sobre o FOV que o rail
// tinha no instante do disparo, então não existe um hardcode de 70° nem drift cumulativo.
export function sampleSwirlCamera(elapsedMs, durationMs) {
  const duration = Math.max(1, Number.isFinite(durationMs) ? durationMs : 1)
  const t = clamp01((Number.isFinite(elapsedMs) ? elapsedMs : 0) / duration)

  if (t < SWIRL_CAMERA_ANTICIPATION_FRAC) {
    const u = smoothstep(t / SWIRL_CAMERA_ANTICIPATION_FRAC)
    return {
      phase: 'anticipation',
      fovOffsetDeg: lerp(0, SWIRL_CAMERA_COMPRESS_DEG, u),
      rollRad: 0,
      punchReady: false,
      progress: t,
    }
  }

  if (t < SWIRL_CAMERA_RELEASE_FRAC) {
    const u = easeOutCubic((t - SWIRL_CAMERA_ANTICIPATION_FRAC) / (SWIRL_CAMERA_RELEASE_FRAC - SWIRL_CAMERA_ANTICIPATION_FRAC))
    return {
      phase: 'release',
      fovOffsetDeg: lerp(SWIRL_CAMERA_COMPRESS_DEG, SWIRL_CAMERA_RELEASE_DEG, u),
      rollRad: (SWIRL_CAMERA_ROLL_DEG * Math.PI / 180) * Math.sin(u * Math.PI * 0.5),
      punchReady: true,
      progress: t,
    }
  }

  const u = smoothstep((t - SWIRL_CAMERA_RELEASE_FRAC) / (1 - SWIRL_CAMERA_RELEASE_FRAC))
  return {
    phase: 'return',
    fovOffsetDeg: lerp(SWIRL_CAMERA_RELEASE_DEG, 0, u),
    rollRad: (SWIRL_CAMERA_ROLL_DEG * Math.PI / 180) * (1 - u),
    punchReady: true,
    progress: t,
  }
}
