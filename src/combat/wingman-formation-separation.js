export const WINGMAN_CLUMP_DISTANCE = 1
export const WINGMAN_CLUMP_GRACE_S = 0.5

function finiteVector(v) {
  return v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
}

function normalized(x, y, z) {
  const len = Math.hypot(x, y, z)
  if (!(len > 1e-8)) return null
  return { x: x / len, y: y / len, z: z / len }
}

function fallbackDirection(a, b, frame) {
  const slotA = a.slot || { side: 0, up: 0, forward: 0 }
  const slotB = b.slot || { side: 0, up: 0, forward: 0 }
  const side = (slotA.side || 0) - (slotB.side || 0)
  const up = (slotA.up || 0) - (slotB.up || 0)
  const forward = (slotA.forward || 0) - (slotB.forward || 0)
  const r = frame?.right || { x: 1, y: 0, z: 0 }
  const u = frame?.up || { x: 0, y: 1, z: 0 }
  const f = frame?.forward || { x: 0, y: 0, z: 1 }
  const bySlot = normalized(
    r.x * side + u.x * up + f.x * forward,
    r.y * side + u.y * up + f.y * forward,
    r.z * side + u.z * up + f.z * forward,
  )
  if (bySlot) return bySlot
  return (a.id ?? 0) < (b.id ?? 0) ? { x: -1, y: 0, z: 0 } : { x: 1, y: 0, z: 0 }
}

export function computeWingmanPairSeparation(a, b, frame, minDistance, separationSpeed) {
  if (!a || !b || a.retreating || b.retreating) return null
  if (!finiteVector(a.position) || !finiteVector(b.position)) return null
  if (!(minDistance > 0) || !(separationSpeed > 0)) return null

  const dx = a.position.x - b.position.x
  const dy = a.position.y - b.position.y
  const dz = a.position.z - b.position.z
  const distance = Math.hypot(dx, dy, dz)
  if (distance >= minDistance) return null

  const direction = distance > 0.01
    ? { x: dx / distance, y: dy / distance, z: dz / distance }
    : fallbackDirection(a, b, frame)
  const overlap = 1 - distance / minDistance
  const magnitude = separationSpeed * overlap
  const pushA = {
    x: direction.x * magnitude,
    y: direction.y * magnitude,
    z: direction.z * magnitude,
  }
  return {
    distance,
    pushA,
    pushB: { x: -pushA.x, y: -pushA.y, z: -pushA.z },
  }
}
