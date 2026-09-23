export const WINGMAN_ARENA_ARRIVAL_STOP_RADIUS = 0.9
export const WINGMAN_ARENA_ARRIVAL_FULL_SPEED_RADIUS = 10
export const WINGMAN_RESCUE_TIMEOUT_S = 5
export const WINGMAN_STALL_SAMPLE_INTERVAL_S = 0.35
export const WINGMAN_STALL_RECOVERY_S = 1.4
export const WINGMAN_STALL_MIN_PROGRESS = 0.12

function clamp01(value) { return Math.max(0, Math.min(1, value)) }
function smoothstep01(value) {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

export function computeWingmanArrivalScale(distance, stopRadius = WINGMAN_ARENA_ARRIVAL_STOP_RADIUS, fullSpeedRadius = WINGMAN_ARENA_ARRIVAL_FULL_SPEED_RADIUS) {
  if (!Number.isFinite(distance) || distance <= stopRadius) return 0
  if (distance >= fullSpeedRadius) return 1
  return smoothstep01((distance - stopRadius) / Math.max(0.001, fullSpeedRadius - stopRadius))
}

export function computeFormationMotionGain(playerSpeed, idleThreshold = 0.75, fullMotionSpeed = 8) {
  if (!Number.isFinite(playerSpeed) || playerSpeed <= idleThreshold) return 0
  if (playerSpeed >= fullMotionSpeed) return 1
  return smoothstep01((playerSpeed - idleThreshold) / Math.max(0.001, fullMotionSpeed - idleThreshold))
}

export function isWingmanCombatTargetReady(target, readyTargets = null) {
  if (!target || target.dying || target.fadingOut || !target.mesh || !target.mesh.parent) return false
  // Alguns inimigos já possuem mesh durante a apresentação de spawn, mas ainda estão invulneráveis.
  // Para IA de Wingman isso continua sendo "não surgiu": não pode virar alvo até o timer zerar.
  if (Number.isFinite(target.spawnInvincibleTimer) && target.spawnInvincibleTimer > 0) return false
  if (readyTargets && !readyTargets.has(target)) return false
  return true
}

export function createWingmanStallWatch(position) {
  return {
    sampleElapsed: 0,
    stalledFor: 0,
    lastPosition: { x: position?.x || 0, y: position?.y || 0, z: position?.z || 0 },
  }
}

export function updateWingmanStallWatch(watch, { dt, position, targetDistance, desiredSpeed } = {}) {
  if (!watch || !position || !Number.isFinite(dt) || dt <= 0) return { recover: false, moved: 0, stalledFor: watch?.stalledFor || 0 }
  watch.sampleElapsed += dt
  if (watch.sampleElapsed < WINGMAN_STALL_SAMPLE_INTERVAL_S) return { recover: false, moved: 0, stalledFor: watch.stalledFor }

  const sampleElapsed = watch.sampleElapsed
  watch.sampleElapsed = 0
  const dx = position.x - watch.lastPosition.x
  const dy = position.y - watch.lastPosition.y
  const dz = position.z - watch.lastPosition.z
  const moved = Math.hypot(dx, dy, dz)
  watch.lastPosition.x = position.x
  watch.lastPosition.y = position.y
  watch.lastPosition.z = position.z

  const shouldProgress = Number.isFinite(targetDistance) && targetDistance > 6 && Number.isFinite(desiredSpeed) && desiredSpeed > 6
  if (shouldProgress && moved < WINGMAN_STALL_MIN_PROGRESS) watch.stalledFor += sampleElapsed
  else watch.stalledFor = 0

  const recover = watch.stalledFor >= WINGMAN_STALL_RECOVERY_S
  if (recover) watch.stalledFor = 0
  return { recover, moved, stalledFor: watch.stalledFor }
}
