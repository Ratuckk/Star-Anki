import * as THREE from 'three'
import { aiValidator } from '../ai-validator.js'
import {
  computeLockBudgets,
  sourceCanLockEntity,
  LOCK_SOURCE_BASE,
  LOCK_SOURCE_MIYU,
} from './miyu-assist-lock-budget.js'

export { LOCK_SOURCE_BASE, LOCK_SOURCE_MIYU }

// ============ LOCK-ON do tiro carregado ============
// Overhaul da prioridade de aquisição: foco automático na maior ameaça do combate (Boss > maior maxHp).
// Preserva as 3 camadas da arquitetura existente:
//
//   1) IDENTIDADE (o que trava) — entity + seq + source, estável
//   2) ÂNCORA (onde o alvo está) — getWorldPosition() a cada frame, nunca guardada
//   3) LAYOUT (onde o marcador aparece) — função pura de (N travas no alvo, índice), sem
//      estado. 1 trava → âncora exata; N travas → anel determinístico em volta.
//
// Suporta a arquitetura de orçamentos independentes BASE vs MIYU (Carga Compartilhada).

// Fase 8 (VISUAL): ângulo de "tô mirando em algo" pra mira normal (crosshair muda de cor) —
// hint puramente visual para o HUD.
export const AIM_HINT_ANGLE = THREE.MathUtils.degToRad(7)

// Ângulos autoritativos de aquisição e manutenção:
// Aquisição estrita (~7.5°): só alvos no cone do retículo podem ser travados.
// Manutenção com histerese (~12°): evita flicker ao mover sutilmente a nave, mas solta
// imediatamente se o retículo sair claramente do alvo.
export const AIM_ACQUIRE_ANGLE = THREE.MathUtils.degToRad(7.5)
export const AIM_MAINTAIN_ANGLE = THREE.MathUtils.degToRad(12)

// distância máxima pra um alvo poder ser travado/auto-mirável. Sem isso, dá pra "magnetizar"
// tiro em inimigo a centenas de unidades de distância.
export const MAX_LOCK_RANGE = 90
// não deixa travar/mantém travado um inimigo mais perto que isso — evita travar algo que já vai
// passar pelo jogador no próximo frame
export const MIN_LOCK_RANGE = 10
export const PASS_BEHIND = -4

function isBigLockTarget(e) {
  return e.kind === 'boss' || e.kind === 'golden'
}

// Quantas travas o MESMO alvo pode acumular. Chefe/Dourado: sem teto próprio (só o orçamento
// geral de maxAllowed limita). Horda: até 2 — ela é grande o bastante pra "merecer" mais de uma
// trava mas não é um alvo-tipo-chefe. Todo o resto: 1 (trava única, comportamento original).
function maxLocksForEntity(e) {
  if (isBigLockTarget(e)) return Infinity
  if (e.kind === 'horda') return 2
  return 1
}

// temporário de módulo — evita alocar Vector3 novo a cada snapshot por frame
const _tmpWorldPos = new THREE.Vector3()
const _tmpRel = new THREE.Vector3()

// ============ GEOMETRIA COMUM DE ELEGIBILIDADE NO CONE ============
// Função autoritativa única que governa se um alvo está dentro de um cone de mira:
// leva em consideração range, plano frontal da nave e raio angular do alvo.
export function isTargetInCone(targetPos, targetRadius, origin, forward, direction, maxAngle) {
  _tmpRel.copy(targetPos).sub(origin)
  const dist = _tmpRel.length()
  if (dist < MIN_LOCK_RANGE || dist > MAX_LOCK_RANGE) return false
  if (_tmpRel.dot(forward) < PASS_BEHIND) return false
  const dirDot = THREE.MathUtils.clamp(direction.dot(_tmpRel.multiplyScalar(1 / dist)), -1, 1)
  const angle = Math.acos(dirDot)
  const angularRadius = Math.atan2(targetRadius || 1.5, dist)
  return (angle - angularRadius) <= maxAngle
}

// ============ SELETOR DE PRIORIDADE DE ALVOS (Retículo Governa) ============
// Hierarquia fundamental de foco: BOSS ATIVO > INIMIGO COM MAIOR MAXHP.
// Executado linearmente e de forma determinística SOMENTE entre alvos DENTRO DO RETÍCULO.
function findBestLockCandidate(candidates, lockedEnemies, origin, forward, direction, source = LOCK_SOURCE_BASE, enemiesSystem = null) {
  let best = null
  let bestIsBoss = false
  let bestMaxHp = -Infinity
  let bestId = Infinity

  // Item 6B: Locks triangulares extras da Miyu devem empilhar no mesmo inimigo se o jogador
  // continuar mantendo a retícula sobre ele. Se já houver um alvo travado e ele ainda estiver
  // dentro do cone de aquisição, Miyu prioriza acumular nele até o fim do orçamento.
  if (source === LOCK_SOURCE_MIYU && lockedEnemies.length > 0) {
    // Procura se o último alvo travado (ou qualquer alvo já travado) ainda está na mira do retículo
    for (let j = lockedEnemies.length - 1; j >= 0; j--) {
      const e = lockedEnemies[j].entity
      if (!e || e.dying || e.fadingOut || (e.hp != null && e.hp <= 0) || !e.mesh) continue
      const targetRadius = enemiesSystem?.getLockableRadius ? enemiesSystem.getLockableRadius(e) : 1.5
      if (isTargetInCone(e.mesh.position, targetRadius, origin, forward, direction, AIM_ACQUIRE_ANGLE)) {
        return e
      }
    }
  }

  for (let i = 0; i < candidates.length; i++) {
    const e = candidates[i]
    if (!e || e.dying || e.fadingOut || (e.hp != null && e.hp <= 0) || !e.mesh) continue

    // Teto por entidade para a fonte em questão
    let existingLocksForSource = 0
    for (let j = 0; j < lockedEnemies.length; j++) {
      if (lockedEnemies[j].entity === e && lockedEnemies[j].source === source) {
        existingLocksForSource++
      }
    }
    if (!sourceCanLockEntity(source, existingLocksForSource, maxLocksForEntity(e))) continue

    // Validade espacial estrita: DEVE estar dentro do cone de aquisição da direção mirada
    const targetRadius = enemiesSystem?.getLockableRadius ? enemiesSystem.getLockableRadius(e) : 1.5
    if (!isTargetInCone(e.mesh.position, targetRadius, origin, forward, direction, AIM_ACQUIRE_ANGLE)) continue

    const isBoss = e.kind === 'boss'
    const maxHp = Number.isFinite(e.maxHp) ? e.maxHp : (Number.isFinite(e.hp) ? e.hp : 1)
    const entityId = Number.isFinite(e.id) ? e.id : i

    if (!best) {
      best = e
      bestIsBoss = isBoss
      bestMaxHp = maxHp
      bestId = entityId
      continue
    }

    // Regra 1: Boss ativo possui prioridade absoluta sobre qualquer inimigo comum dentro da mira
    if (isBoss && !bestIsBoss) {
      best = e
      bestIsBoss = true
      bestMaxHp = maxHp
      bestId = entityId
      continue
    }
    if (!isBoss && bestIsBoss) continue

    // Regra 2: Maior maxHp (HP máximo autoritativo entre os que estão no retículo)
    if (maxHp > bestMaxHp) {
      best = e
      bestIsBoss = isBoss
      bestMaxHp = maxHp
      bestId = entityId
      continue
    }
    if (maxHp < bestMaxHp) continue

    // Desempate técnico estável e determinístico (ID menor) para evitar oscilação/flicker
    if (entityId < bestId) {
      best = e
      bestIsBoss = isBoss
      bestMaxHp = maxHp
      bestId = entityId
    }
  }

  return best
}

export function createLockOnSystem(rail, enemies) {
  let lockedEnemies = []
  let nextLockSeq = 1

  return {
    sweepLockOn(origin, direction, maxAllowed = Infinity, baseMaxAllowed = maxAllowed) {
      const frame = rail.getFrameAt(0)
      const dirNorm = direction ? direction.clone().normalize() : frame.forward.clone().normalize()

      // 1) MANUTENÇÃO — remove records inválidos. Uma trava já adquirida permanece no alvo
      // enquanto ele continuar válido e dentro do cone de manutenção com histerese (AIM_MAINTAIN_ANGLE).
      // Se o retículo sair claramente do alvo, a trava é liberada imediatamente.
      lockedEnemies = lockedEnemies.filter((rec) => {
        if (!rec.entity || rec.entity.dying || rec.entity.fadingOut || (rec.entity.hp != null && rec.entity.hp <= 0)) return false
        if (!rec.entity.mesh) return false
        const targetRadius = enemies.getLockableRadius ? enemies.getLockableRadius(rec.entity) : 1.5
        return isTargetInCone(rec.entity.mesh.position, targetRadius, origin, frame.forward, dirNorm, AIM_MAINTAIN_ANGLE)
      })

      // 2) AQUISIÇÃO — adiciona travas progressivas respeitando orçamentos BASE e MIYU
      if (lockedEnemies.length >= maxAllowed) return
      const budgets = computeLockBudgets(maxAllowed, baseMaxAllowed)
      let baseCount = lockedEnemies.reduce((n, rec) => n + (rec.source === LOCK_SOURCE_BASE ? 1 : 0), 0)
      let miyuCount = lockedEnemies.reduce((n, rec) => n + (rec.source === LOCK_SOURCE_MIYU ? 1 : 0), 0)

      const candidates = [...enemies.getAlive(), ...(enemies.getGoldenAlive ? enemies.getGoldenAlive() : [])]

      while (baseCount < budgets.base) {
        const best = findBestLockCandidate(candidates, lockedEnemies, origin, frame.forward, dirNorm, LOCK_SOURCE_BASE, enemies)
        if (!best) break
        lockedEnemies.push({ entity: best, seq: nextLockSeq++, source: LOCK_SOURCE_BASE })
        baseCount++
      }

      while (miyuCount < budgets.miyu) {
        const best = findBestLockCandidate(candidates, lockedEnemies, origin, frame.forward, dirNorm, LOCK_SOURCE_MIYU, enemies)
        if (!best) break
        const existingMiyuLocksForEntity = lockedEnemies.reduce(
          (n, rec) => n + (rec.source === LOCK_SOURCE_MIYU && rec.entity === best ? 1 : 0), 0,
        )
        lockedEnemies.push({ entity: best, seq: nextLockSeq++, source: LOCK_SOURCE_MIYU })
        miyuCount++
        aiValidator.expect('Carga Compartilhada respeita o orçamento de locks triangulares da Miyu',
          () => miyuCount <= budgets.miyu,
          { miyuCount, miyuBudget: budgets.miyu, targetKind: best.kind, repeatedOnTarget: existingMiyuLocksForEntity + 1 },
        )
        aiValidator.logMechanic('miyu-assist-lock', 'triangular-lock-acquired', {
          targetKind: best.kind, repeatedOnTarget: existingMiyuLocksForEntity + 1,
          miyuCount, miyuBudget: budgets.miyu,
        })
      }
    },

    // Fase 8 (VISUAL): hint pra mira normal — usa a mesma verdade geométrica de cone
    isAimingAtEnemy(origin, direction) {
      const frame = rail.getFrameAt(0)
      const dirNorm = direction ? direction.clone().normalize() : frame.forward.clone().normalize()
      const targets = [...enemies.getAlive(), ...(enemies.getGoldenAlive ? enemies.getGoldenAlive() : [])]
      for (const e of targets) {
        if (!e || e.dying || !e.mesh) continue
        const targetRadius = enemies.getLockableRadius ? enemies.getLockableRadius(e) : 1.5
        if (isTargetInCone(e.mesh.position, targetRadius, origin, frame.forward, dirNorm, AIM_HINT_ANGLE)) {
          return true
        }
      }
      return false
    },

    // QoL #3: usado pelo tiro carregado quando solta sem nenhum alvo travado
    getEnemiesInAimCone(origin, direction, maxCount) {
      const frame = rail.getFrameAt(0)
      const dirNorm = direction ? direction.clone().normalize() : frame.forward.clone().normalize()
      const targets = [...enemies.getAlive(), ...(enemies.getGoldenAlive ? enemies.getGoldenAlive() : [])]
      const inCone = []
      for (const e of targets) {
        if (!e || e.dying || !e.mesh) continue
        const targetRadius = enemies.getLockableRadius ? enemies.getLockableRadius(e) : 1.5
        if (!isTargetInCone(e.mesh.position, targetRadius, origin, frame.forward, dirNorm, AIM_HINT_ANGLE)) continue
        const dist = origin.distanceTo(e.mesh.position)
        inCone.push({ entity: e, dist })
      }
      inCone.sort((a, b) => a.dist - b.dist)
      return inCone.slice(0, Math.max(0, maxCount)).map((r) => r.entity)
    },

    takeLockedTargetGroups(inRange) {
      const groups = { base: [], miyu: [] }
      for (const rec of lockedEnemies) {
        if (!rec.entity || rec.entity.dying || rec.entity.fadingOut || !inRange(rec.entity)) continue
        if (rec.source === LOCK_SOURCE_MIYU) groups.miyu.push(rec.entity)
        else groups.base.push(rec.entity)
      }
      lockedEnemies = []
      return groups
    },

    takeLockedTargets(inRange) {
      const targets = lockedEnemies
        .filter((rec) => !rec.entity.dying && !rec.entity.fadingOut && inRange(rec.entity))
        .map((rec) => rec.entity)
      lockedEnemies = []
      return targets
    },

    getLockedEntities: () => lockedEnemies.filter((rec) => !rec.entity.dying && !rec.entity.fadingOut).map((rec) => rec.entity),
    clearLockedEnemies() { lockedEnemies = [] },

    // Snapshots para renderização do HUD:
    // A posição mundial (worldPos) é a ÂNCORA AUTORITATIVA REAL do alvo (centro exato).
    // A separação visual entre múltiplos marcadores no mesmo alvo agora é feita em
    // screen-space / HUD-space usando groupIndex e groupCount, sem nunca deslocar worldPos em 3D!
    getLockedEnemySnapshots: () => {
      const alive = lockedEnemies.filter((rec) => !rec.entity.dying && !rec.entity.fadingOut && rec.entity.mesh)

      const byEntity = new Map()
      for (const rec of alive) {
        let group = byEntity.get(rec.entity)
        if (!group) { group = []; byEntity.set(rec.entity, group) }
        group.push(rec)
      }

      const result = []
      for (const [entity, group] of byEntity) {
        group.sort((a, b) => a.seq - b.seq)
        entity.mesh.getWorldPosition(_tmpWorldPos)
        const sizeHint = enemies.getLockableRadius ? enemies.getLockableRadius(entity) : 1.5
        const groupCount = group.length
        const entityId = entity.id

        for (let i = 0; i < groupCount; i += 1) {
          result.push({
            id: group[i].seq,
            entityId,
            worldPos: _tmpWorldPos.clone(),
            sizeHint,
            source: group[i].source,
            groupIndex: i,
            groupCount,
          })
        }
      }
      return result
    },
  }
}
