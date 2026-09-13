import * as THREE from 'three'

// ============ LOCK-ON do tiro carregado ============
// Extraído de combat.js (v0.38.0, split por sistema). O tiro carregado passa a poder travar o
// chefe/dourado (antes só inimigos comuns), e um alvo GRANDE (chefe/dourado) pode receber várias
// travas ao mesmo tempo em vez de só 1 — cada trava vira um tiro teleguiado independente na hora
// de soltar. Por isso `lockedEnemies` é um array de "lock records" ({ entity, offset, seq }), não
// um Set (não dava pra repetir a mesma entidade) — offset é o ponto (relativo ao centro do alvo)
// onde a mira estava no instante da trava, usado só pro marcador verde do HUD aparecer espalhado
// pelo corpo do alvo em vez de empilhado no centro.

const PASS_BEHIND = -4
const ENEMY_LOCK_ANGLE = THREE.MathUtils.degToRad(6)
// Fase 8 (VISUAL): ângulo de "tô mirando em algo" pra mira normal (crosshair muda de cor) — mais
// largo que o ENEMY_LOCK_ANGLE do teleguiado porque aqui é só um hint visual, não trava nada.
const AIM_HINT_ANGLE = THREE.MathUtils.degToRad(7)
// distância máxima pra um alvo poder ser travado/auto-mirável. Sem isso, dá pra "magnetizar"
// tiro em inimigo a centenas de unidades de distância.
const MAX_LOCK_RANGE = 90
// não deixa travar/mantém travado um inimigo mais perto que isso — evita travar algo que já vai
// passar pelo jogador no próximo frame
const MIN_LOCK_RANGE = 10

function isBigLockTarget(e) {
  return e.kind === 'boss' || e.kind === 'golden'
}

export function createLockOnSystem(rail, enemies) {
  let lockedEnemies = []
  let nextLockSeq = 1

  return {
    // maxAllowed (main.js): quantos alvos podem estar travados NESTE instante do carregamento —
    // 1 no início, +1 a cada intervalo (travar um alvo novo por vez, não todos de uma vez).
    sweepLockOn(origin, direction, maxAllowed = Infinity) {
      const frame = rail.getFrameAt(0)
      lockedEnemies = lockedEnemies.filter((rec) => {
        if (rec.entity.dying) return false
        const rel = rec.entity.mesh.position.clone().sub(origin)
        return rel.length() >= MIN_LOCK_RANGE && rel.dot(frame.forward) >= PASS_BEHIND
      })
      if (lockedEnemies.length >= maxAllowed) return
      const candidates = [...enemies.getAlive(), ...enemies.getGoldenAlive()]
      for (const e of candidates) {
        if (lockedEnemies.length >= maxAllowed) break
        // alvo comum já travado não trava de novo; alvo grande pode acumular quantas travas o
        // orçamento (maxAllowed) permitir
        if (!isBigLockTarget(e) && lockedEnemies.some((rec) => rec.entity === e)) continue
        const rel = e.mesh.position.clone().sub(origin)
        const dist = rel.length()
        if (dist > MAX_LOCK_RANGE || dist < MIN_LOCK_RANGE || rel.dot(frame.forward) < PASS_BEHIND) continue
        const toTarget = rel.clone().normalize()
        const angle = Math.acos(THREE.MathUtils.clamp(direction.dot(toTarget), -1, 1))
        if (angle >= ENEMY_LOCK_ANGLE) continue
        // ponto na direção da mira mais próximo do centro do alvo — os quadrados verdes aparecem
        // onde o jogador de fato mirou, não num ponto aleatório.
        const offset = direction.clone().multiplyScalar(rel.dot(direction)).sub(rel)
        lockedEnemies.push({ entity: e, offset, seq: nextLockSeq++ })
      }
    },

    // Fase 8 (VISUAL): hint pra mira normal — não trava nem marca nada, só responde "tem um
    // inimigo vivo bem na frente da mira agora?" pro HUD colorir o crosshair.
    isAimingAtEnemy(origin, direction) {
      const frame = rail.getFrameAt(0)
      for (const e of enemies.getAlive()) {
        const rel = e.mesh.position.clone().sub(origin)
        const dist = rel.length()
        if (dist > MAX_LOCK_RANGE || dist < MIN_LOCK_RANGE || rel.dot(frame.forward) < PASS_BEHIND) continue
        const angle = Math.acos(THREE.MathUtils.clamp(direction.dot(rel.normalize()), -1, 1))
        if (angle < AIM_HINT_ANGLE) return true
      }
      return false
    },

    // consumido pelo tiro carregado ao soltar: devolve os alvos travados vivos e dentro de
    // `inRange`, e sempre limpa as travas em seguida (mesmo se vazio) — mesmo comportamento de
    // antes, o "carregamento" sempre reseta ao disparar.
    takeLockedTargets(inRange) {
      const targets = lockedEnemies.filter((rec) => !rec.entity.dying && inRange(rec.entity)).map((rec) => rec.entity)
      lockedEnemies = []
      return targets
    },

    clearLockedEnemies() { lockedEnemies = [] },

    getLockedEnemySnapshots: () => lockedEnemies
      .filter((rec) => !rec.entity.dying)
      .map((rec) => ({ id: rec.seq, worldPos: rec.entity.mesh.position.clone().add(rec.offset) })),
  }
}
