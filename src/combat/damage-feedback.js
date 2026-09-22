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
  return {
    worldPos: hit.worldPos.clone(), targetId: hit.meshRef?.uuid ?? null,
    damage, pilotId, charged, instant, killed: !!hit.killed,
    points: hit.enemyKillPoints || hit.points || 0,
  }
}
