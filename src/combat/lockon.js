import * as THREE from 'three'
import { aiValidator } from '../ai-validator.js'
import {
  LOCK_SOURCE_BASE,
  LOCK_SOURCE_MIYU,
  computeLockBudgets,
  sourceCanLockEntity,
} from './miyu-assist-lock-budget.js'

// ============ LOCK-ON do tiro carregado ============
// Overhaul em cima do split de combat.js (v0.38.0). O sistema anterior guardava um `offset`
// vetorial em cada record de trava, calculado no instante da aquisição — o que causava 4
// classes de bug (marcador fora do alvo comum, clump visual no multi-lock, flicker no limite
// do cone, acoplamento com position de mesh frágil). Reescrito em 3 camadas separadas:
//
//   1) IDENTIDADE (o que trava) — entity + seq, estável
//   2) ÂNCORA (onde o alvo está) — getWorldPosition() a cada frame, nunca guardada
//   3) LAYOUT (onde o marcador aparece) — função pura de (N travas no alvo, índice), sem
//      estado. 1 trava → âncora exata; N travas → anel determinístico em volta.
//
// A API pública é idêntica (sweepLockOn / isAimingAtEnemy / takeLockedTargets /
// clearLockedEnemies / getLockedEnemySnapshots) — main.js, combat/projectiles.js e
// combat/index.js não mudam nenhuma linha.

// cone de AQUISIÇÃO — só usado pra travar um alvo novo. Uma vez travado, o alvo fica travado
// (ver comentário em sweepLockOn) até virar inválido por conta própria, não por causa da mira.
const LOCK_ACQUIRE_ANGLE = THREE.MathUtils.degToRad(6)

// Fase 8 (VISUAL): ângulo de "tô mirando em algo" pra mira normal (crosshair muda de cor) —
// mais largo que o cone de aquisição porque aqui é só um hint visual, não trava nada.
const AIM_HINT_ANGLE = THREE.MathUtils.degToRad(7)

// distância máxima pra um alvo poder ser travado/auto-mirável. Sem isso, dá pra "magnetizar"
// tiro em inimigo a centenas de unidades de distância.
const MAX_LOCK_RANGE = 90
// não deixa travar/mantém travado um inimigo mais perto que isso — evita travar algo que já vai
// passar pelo jogador no próximo frame
const MIN_LOCK_RANGE = 10
const PASS_BEHIND = -4

// ============ ORIGEM DO LOCK — MIYU vs. BASE ============
// Fox e Miyu possuem orçamentos independentes; a origem agora é mecânica, não só visual.
export { LOCK_SOURCE_BASE, LOCK_SOURCE_MIYU }

// ============ LAYOUT DE MULTI-LOCK ============
// raio do anel de marcadores quando há >1 trava no MESMO alvo grande. Não é o raio de colisão:
// é o raio VISUAL onde os quadradinhos ficam distribuídos. Escolhido pra ficar perceptivelmente
// dentro do corpo do chefe (raio de colisão 7) sem colar uns nos outros.
const BIG_TARGET_RING_RADIUS = 4

function isBigLockTarget(e) {
  return e.kind === 'boss' || e.kind === 'golden'
}

// Quantas travas o MESMO alvo pode acumular. Chefe/Dourado: sem teto próprio (só o orçamento
// geral de maxAllowed limita). Horda: até 2 — ela é grande o bastante pra "merecer" mais de uma
// trava mas não é um alvo-tipo-chefe (pedido explícito do usuário). Todo o resto: 1 (trava única,
// comportamento original).
function maxLocksForEntity(e) {
  if (isBigLockTarget(e)) return Infinity
  if (e.kind === 'horda') return 2
  return 1
}

// temporário de módulo — evita alocar Vector3 novo a cada snapshot por frame
const _tmpWorldPos = new THREE.Vector3()
const _tmpOffset = new THREE.Vector3()

export function createLockOnSystem(rail, enemies) {
  // records: { entity, seq }. Nem offset, nem posição, nem "estado de travado" — todas essas
  // coisas são derivadas (âncora a cada frame, layout a cada snapshot). Se a trava existe no
  // array, ela está ativa; se não existe, não está. Não há estado intermediário pra ficar
  // dessincronizado.
  let lockedEnemies = []
  let nextLockSeq = 1

  return {
    // maxAllowed (main.js): quantos alvos podem estar travados NESTE instante do carregamento —
    // 1 no início, +1 a cada intervalo (travar um alvo novo por vez, não todos de uma vez).
    sweepLockOn(origin, direction, maxAllowed = Infinity, baseMaxAllowed = maxAllowed) {
      const frame = rail.getFrameAt(0)

      // 1) MANUTENÇÃO — remove records inválidos. NÃO usa mais o ângulo da mira atual: isto é
      // um MULTI-lock que ACUMULA alvos ao longo da carga (maxAllowed sobe aos poucos) — se uma
      // trava já feita fosse solta assim que a mira sai do cone dela, virar a mira pra travar o
      // PRÓXIMO alvo destravava o anterior na hora (bug reportado: "esquece o alvo que já
      // estava mirando"). Uma trava só sai por motivo de VALIDADE do alvo em si (morreu, ficou
      // perto demais, passou pra trás) — nunca porque a mira do jogador se moveu.
      lockedEnemies = lockedEnemies.filter((rec) => {
        if (rec.entity.dying) return false
        const rel = rec.entity.mesh.position.clone().sub(origin)
        const dist = rel.length()
        if (dist < MIN_LOCK_RANGE) return false
        if (rel.dot(frame.forward) < PASS_BEHIND) return false
        return true
      })

      // 2) AQUISIÇÃO — Fox e Miyu têm orçamentos separados. O orçamento BASE continua
      // obedecendo o limite por entidade; MIYU pode repetir o mesmo alvo enquanto ele segue na mira.
      const candidates = [...enemies.getAlive(), ...enemies.getGoldenAlive()]
      const budgets = computeLockBudgets(maxAllowed, baseMaxAllowed)
      let baseCount = lockedEnemies.reduce((n, rec) => n + (rec.source === LOCK_SOURCE_BASE ? 1 : 0), 0)
      let miyuCount = lockedEnemies.reduce((n, rec) => n + (rec.source === LOCK_SOURCE_MIYU ? 1 : 0), 0)

      const candidateIsAimedAndValid = (e) => {
        const rel = e.mesh.position.clone().sub(origin)
        const dist = rel.length()
        if (dist > MAX_LOCK_RANGE || dist < MIN_LOCK_RANGE) return false
        if (rel.dot(frame.forward) < PASS_BEHIND) return false
        const toTarget = rel.clone().normalize()
        const angle = Math.acos(THREE.MathUtils.clamp(direction.dot(toTarget), -1, 1))
        return angle < LOCK_ACQUIRE_ANGLE
      }

      if (baseCount < budgets.base) {
        for (const e of candidates) {
          if (baseCount >= budgets.base) break
          const existingBaseLocksForEntity = lockedEnemies.reduce(
            (n, rec) => n + (rec.source === LOCK_SOURCE_BASE && rec.entity === e ? 1 : 0), 0,
          )
          if (!sourceCanLockEntity(LOCK_SOURCE_BASE, existingBaseLocksForEntity, maxLocksForEntity(e))) continue
          if (!candidateIsAimedAndValid(e)) continue
          lockedEnemies.push({ entity: e, seq: nextLockSeq++, source: LOCK_SOURCE_BASE })
          baseCount += 1
        }
      }

      if (miyuCount < budgets.miyu) {
        for (const e of candidates) {
          if (miyuCount >= budgets.miyu) break
          if (!candidateIsAimedAndValid(e)) continue
          const existingMiyuLocksForEntity = lockedEnemies.reduce(
            (n, rec) => n + (rec.source === LOCK_SOURCE_MIYU && rec.entity === e ? 1 : 0), 0,
          )
          if (!sourceCanLockEntity(LOCK_SOURCE_MIYU, existingMiyuLocksForEntity, maxLocksForEntity(e))) continue
          lockedEnemies.push({ entity: e, seq: nextLockSeq++, source: LOCK_SOURCE_MIYU })
          miyuCount += 1
          aiValidator.expect('Carga Compartilhada respeita o orçamento de locks triangulares da Miyu',
            () => miyuCount <= budgets.miyu,
            { miyuCount, miyuBudget: budgets.miyu, targetKind: e.kind, repeatedOnTarget: existingMiyuLocksForEntity + 1 },
          )
          aiValidator.logMechanic('miyu-assist-lock', 'triangular-lock-acquired', {
            targetKind: e.kind, repeatedOnTarget: existingMiyuLocksForEntity + 1,
            miyuCount, miyuBudget: budgets.miyu,
          })
        }
      }

    },

    // Fase 8 (VISUAL): hint pra mira normal — não trava nem marca nada, só responde "tem um
    // inimigo vivo bem na frente da mira agora?" pro HUD colorir o crosshair.
    isAimingAtEnemy(origin, direction) {
      const frame = rail.getFrameAt(0)
      const targets = [...enemies.getAlive(), ...(enemies.getGoldenAlive ? enemies.getGoldenAlive() : [])]
      for (const e of targets) {
        if (!e || e.dying || !e.mesh) continue
        const rel = e.mesh.position.clone().sub(origin)
        const dist = rel.length()
        if (dist > MAX_LOCK_RANGE || dist < MIN_LOCK_RANGE || rel.dot(frame.forward) < PASS_BEHIND) continue
        const angle = Math.acos(THREE.MathUtils.clamp(direction.dot(rel.normalize()), -1, 1))
        if (angle < AIM_HINT_ANGLE) return true
      }
      return false
    },

    // QoL #3: usado pelo tiro carregado quando SOLTA sem nenhum alvo travado — decide se
    // persegue algo (tem inimigo dentro do cone da mira, mesmo cone de isAimingAtEnemy acima)
    // ou dispara reto (nenhum inimigo na direção mirada). Substitui o antigo fallback de
    // "N inimigos mais próximos", que perseguia qualquer coisa no range mesmo fora da mira.
    getEnemiesInAimCone(origin, direction, maxCount) {
      const frame = rail.getFrameAt(0)
      const targets = [...enemies.getAlive(), ...(enemies.getGoldenAlive ? enemies.getGoldenAlive() : [])]
      const inCone = []
      for (const e of targets) {
        if (!e || e.dying || !e.mesh) continue
        const rel = e.mesh.position.clone().sub(origin)
        const dist = rel.length()
        if (dist > MAX_LOCK_RANGE || dist < MIN_LOCK_RANGE || rel.dot(frame.forward) < PASS_BEHIND) continue
        const angle = Math.acos(THREE.MathUtils.clamp(direction.dot(rel.normalize()), -1, 1))
        if (angle >= AIM_HINT_ANGLE) continue
        inCone.push({ entity: e, dist })
      }
      inCone.sort((a, b) => a.dist - b.dist)
      return inCone.slice(0, Math.max(0, maxCount)).map((r) => r.entity)
    },

    // consumido pelo tiro carregado ao soltar: devolve os alvos travados vivos e dentro de
    // `inRange`, e sempre limpa as travas em seguida (mesmo se vazio) — o "carregamento"
    // sempre reseta ao disparar. Importante: se o alvo grande recebeu N travas, devolve a
    // MESMA entity N vezes — o chamador (fireHomingShot) já sabe lidar com isso (cada trava =
    // 1 tiro teleguiado independente).
    takeLockedTargetGroups(inRange) {
      const groups = { base: [], miyu: [] }
      for (const rec of lockedEnemies) {
        if (rec.entity.dying || !inRange(rec.entity)) continue
        if (rec.source === LOCK_SOURCE_MIYU) groups.miyu.push(rec.entity)
        else groups.base.push(rec.entity)
      }
      lockedEnemies = []
      return groups
    },

    takeLockedTargets(inRange) {
      const targets = lockedEnemies
        .filter((rec) => !rec.entity.dying && inRange(rec.entity))
        .map((rec) => rec.entity)
      lockedEnemies = []
      return targets
    },


    getLockedEntities: () => lockedEnemies.filter((rec) => !rec.entity.dying).map((rec) => rec.entity),
    clearLockedEnemies() { lockedEnemies = [] },

    // ============ SNAPSHOTS — âncora + layout, sem estado ============
    // O HUD chama isso a cada frame pra posicionar os marcadores. Duas etapas:
    //
    //   a) ÂNCORA: getWorldPosition() em vez de mesh.position. Se o mesh do alvo estiver
    //      aninhado dentro de um Group pai (chefe com corpo + anéis + filhos é o caso clássico),
    //      `.position` seria LOCAL e o marcador apareceria no lugar errado.
    //
    //   b) LAYOUT: agrupa records por entidade. 1 trava no alvo → marcador exatamente na
    //      âncora (bug do "marcador deslocado pra esquerda/direita" original era justamente
    //      NÃO fazer isso — o offset perpendicular à mira ficava salvo no record). N travas
    //      no MESMO alvo → anel determinístico, com ângulo `i * 2π/N` ordenado por `seq`.
    //      Reflow a cada chamada: se uma trava some, as outras reequilibram o anel sem estado
    //      guardado. Nada de clump aleatório.
    getLockedEnemySnapshots: () => {
      const alive = lockedEnemies.filter((rec) => !rec.entity.dying)

      // agrupa por entidade mantendo a ordem de aquisição (seq) dentro de cada grupo — a
      // ordenação por seq garante que o anel se mantenha estável quando uma trava é solta
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
        // QoL #2: raio real do alvo (hit radius) — alimenta tanto o tamanho do marcador no HUD
        // quanto o raio do anel de multi-lock abaixo, em vez de um fallback hardcoded que não
        // sabia o tamanho de cada `kind`.
        const sizeHint = enemies.getLockableRadius(entity)

        // trava única (o caso 99% das vezes — inimigo comum): marcador exatamente na âncora.
        // Sem offset, sem espalhamento, sem ruído.
        if (group.length === 1) {
          result.push({ id: group[0].seq, worldPos: _tmpWorldPos.clone(), sizeHint, source: group[0].source })
          continue
        }

        // multi-lock no mesmo alvo (chefe/dourado BASE ou qualquer alvo com locks da Miyu):
        // distribui em anel no plano horizontal.
        // horizontal (XZ, mundo). Não é o plano perpendicular à visão (precisaria da câmera,
        // que o HUD tem mas o lockon não) — o plano XZ lê bem porque os alvos grandes são
        // vistos quase sempre de frente/longe, e um anel "deitado" ao redor deles parece
        // natural.
        const radius = Math.min(BIG_TARGET_RING_RADIUS, sizeHint)
        for (let i = 0; i < group.length; i += 1) {
          const angle = (i / group.length) * Math.PI * 2
          _tmpOffset.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
          result.push({ id: group[i].seq, worldPos: _tmpWorldPos.clone().add(_tmpOffset), sizeHint, source: group[i].source })
        }
      }
      return result
    },
  }
}
