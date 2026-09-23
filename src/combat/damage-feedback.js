import { aiValidator } from '../ai-validator.js'

// Canal exclusivamente visual. Não participa de pontos, combo, kills ou IA.
export function createDamageFeedback(hit, damage, { pilotId = null, charged = false, instant = false } = {}) {
  if (!hit || hit.blocked) return null
  const valid = !!hit.worldPos && [hit.worldPos.x, hit.worldPos.y, hit.worldPos.z].every(Number.isFinite)
    && Number.isFinite(damage) && damage > 0
    && (pilotId === null || (Number.isInteger(pilotId) && pilotId >= 0 && pilotId <= 3))
  aiValidator.expect('Feedback de dano confirmado tem valor, posição e autoria válidos', () => valid,
    { damage, pilotId, kind: hit.kind })
  if (!valid) return null
  const targetPosition = hit.meshRef?.position
  const targetPositionValid = targetPosition && [targetPosition.x, targetPosition.y, targetPosition.z].every(Number.isFinite)
  return {
    worldPos: hit.worldPos.clone(),
    targetWorldPos: targetPositionValid && typeof targetPosition.clone === 'function' ? targetPosition.clone() : hit.worldPos.clone(),
    targetId: hit.meshRef?.uuid ?? null, kind: hit.kind ?? null,
    targetMaxHp: Number.isFinite(hit.targetMaxHp) ? hit.targetMaxHp : null,
    damage, pilotId, charged, instant, killed: !!hit.killed,
    points: hit.enemyKillPoints || hit.points || 0,
  }
}
