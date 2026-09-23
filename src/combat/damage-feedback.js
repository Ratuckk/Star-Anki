import { aiValidator } from '../ai-validator.js'

// Canal exclusivamente visual. Não participa de pontos, combo, kills ou IA.
export function createDamageFeedback(hit, damage, { pilotId = null, charged = false, instant = false, sourceKind = null } = {}) {
  if (!hit || hit.blocked) return null
  const resolvedSourceKind = sourceKind || hit.sourceKind || (pilotId == null ? (hit.kind === 'detrito' ? 'environment' : 'player') : 'wingman')
  if (!Number.isFinite(damage) || damage <= 0) {
    aiValidator.logMechanic('damage-feedback', 'ignored-non-damage', {
      damage, pilotId, kind: hit.kind ?? null, sourceKind: resolvedSourceKind,
    })
    return null
  }
  const valid = !!hit.worldPos && [hit.worldPos.x, hit.worldPos.y, hit.worldPos.z].every(Number.isFinite)
    && (pilotId === null || (Number.isInteger(pilotId) && pilotId >= 0 && pilotId <= 3))
    && typeof resolvedSourceKind === 'string' && resolvedSourceKind.length > 0
  aiValidator.expect('Feedback de dano confirmado tem valor, posição e origem válidos', () => valid,
    { damage, pilotId, kind: hit.kind, sourceKind: resolvedSourceKind })
  if (!valid) return null
  const targetPosition = hit.meshRef?.position
  const targetPositionValid = targetPosition && [targetPosition.x, targetPosition.y, targetPosition.z].every(Number.isFinite)
  return {
    worldPos: hit.worldPos.clone(),
    targetWorldPos: targetPositionValid && typeof targetPosition.clone === 'function' ? targetPosition.clone() : hit.worldPos.clone(),
    targetId: hit.meshRef?.uuid ?? null, kind: hit.kind ?? null,
    targetMaxHp: Number.isFinite(hit.targetMaxHp) ? hit.targetMaxHp : null,
    damage, pilotId, sourceKind: resolvedSourceKind, charged, instant, killed: !!hit.killed,
    points: hit.enemyKillPoints || hit.points || 0,
  }
}
