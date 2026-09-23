export const LOCK_SOURCE_BASE = 'base'
export const LOCK_SOURCE_MIYU = 'miyu'

function normalizeBudget(value) {
  if (value === Infinity) return Infinity
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

export function computeLockBudgets(maxAllowed, baseMaxAllowed) {
  const totalBudget = normalizeBudget(maxAllowed)
  const baseCap = normalizeBudget(baseMaxAllowed)
  const base = Math.min(totalBudget, baseCap)
  const miyu = totalBudget === Infinity
    ? (baseCap === Infinity ? 0 : Infinity)
    : Math.max(0, totalBudget - baseCap)
  return { base, miyu }
}

export function sourceCanLockEntity(source, existingSourceLocksForEntity, baseEntityCap) {
  if (source === LOCK_SOURCE_MIYU) return true
  return existingSourceLocksForEntity < baseEntityCap
}
