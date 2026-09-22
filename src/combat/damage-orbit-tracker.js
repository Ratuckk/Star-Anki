export const DAMAGE_ORBIT_WINDOW_MS = 1000
export const DAMAGE_ORBIT_MIN_TARGET_MAX_HP = 12

function authorKey(pilotId) {
  return Number.isInteger(pilotId) && pilotId >= 0 && pilotId <= 3
    ? `wingman:${pilotId}`
    : 'player'
}

export function createDamageOrbitTracker() {
  const targets = new Map()

  function clearTarget(targetId) {
    if (!targetId) return false
    return targets.delete(targetId)
  }

  function reset() {
    targets.clear()
  }

  function recordHit({ targetId, pilotId = null, targetMaxHp = null, killed = false, now = 0 } = {}) {
    const result = {
      eligible: false,
      orbit: false,
      triggeredNow: false,
      clearTarget: false,
      windowMs: DAMAGE_ORBIT_WINDOW_MS,
    }
    if (!targetId || !Number.isFinite(now)) return result

    if (killed) {
      clearTarget(targetId)
      result.clearTarget = true
      return result
    }

    if (!Number.isFinite(targetMaxHp) || targetMaxHp < DAMAGE_ORBIT_MIN_TARGET_MAX_HP) {
      clearTarget(targetId)
      return result
    }
    result.eligible = true

    const cutoff = now - DAMAGE_ORBIT_WINDOW_MS
    const state = targets.get(targetId) || { hits: [], orbitUntil: -Infinity }
    state.hits = state.hits.filter((hit) => hit.at >= cutoff && hit.at <= now)

    const author = authorKey(pilotId)
    const hasDifferentRecentAuthor = state.hits.some((hit) => hit.author !== author)
    const hasRecentWingman = state.hits.some((hit) => hit.author.startsWith('wingman:'))
    const currentIsWingman = author.startsWith('wingman:')
    const cooperativeHit = hasDifferentRecentAuthor && (currentIsWingman || hasRecentWingman)

    if (cooperativeHit) {
      state.orbitUntil = now + DAMAGE_ORBIT_WINDOW_MS
      result.triggeredNow = true
    }

    state.hits.push({ author, at: now })
    targets.set(targetId, state)
    result.orbit = result.triggeredNow || state.orbitUntil >= now
    return result
  }

  return { recordHit, clearTarget, reset }
}
