import * as THREE from 'three'

// ============ LOCK-ON do tiro carregado ============
// Extraído de combat.js (v0.38.0, split por sistema). O tiro carregado passa a poder travar o
// chefe/dourado (antes só inimigos comuns), e um alvo GRANDE (chefe/dourado) pode receber várias
// travas ao mesmo tempo em vez de só 1 — cada trava vira um tiro teleguiado independente na hora
// de soltar. Por isso `lockedEnemies` é um array de "lock records" ({ entity, offset, seq }), não
// um Set (não dava pra repetir a mesma entidade).

const PASS_BEHIND = -4
const ENEMY_LOCK_ANGLE = THREE.MathUtils.degToRad(6)
const AIM_HINT_ANGLE = THREE.MathUtils.degToRad(7)
const MAX_LOCK_RANGE = 90
const MIN_LOCK_RANGE = 10
// fallback de "raio" do alvo grande quando a entidade não expõe um — usado só pra limitar o
// quanto o marcador pode se afastar do centro do mesh (ver comentário do sweepLockOn).
const BIG_TARGET_FALLBACK_RADIUS = 6

function isBigLockTarget(e) {
  return e.kind === 'boss' || e.kind === 'golden'
}

// temporário de módulo — evita alocar um Vector3 novo a cada snapshot por frame
const _tmpWorldPos = new THREE.Vector3()

export function createLockOnSystem(rail, enemies) {
  let lockedEnemies = []
  let nextLockSeq = 1

  return {
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
        if (!isBigLockTarget(e) && lockedEnemies.some((rec) => rec.entity === e)) continue
        const rel = e.mesh.position.clone().sub(origin)
        const dist = rel.length()
        if (dist > MAX_LOCK_RANGE || dist < MIN_LOCK_RANGE || rel.dot(frame.forward) < PASS_BEHIND) continue
        const toTarget = rel.clone().normalize()
        const angle = Math.acos(THREE.MathUtils.clamp(direction.dot(toTarget), -1, 1))
        if (angle >= ENEMY_LOCK_ANGLE) continue

        // O offset do código original era `direction * (rel · direction) - rel` — o ponto da
        // LINHA DE MIRA mais próximo do alvo, não o alvo. Como worldPos = mesh.position + offset,
        // o marcador acabava em cima do feixe de tiro, não do inimigo. Pior: o erro cresce com
        // a distância (a 6° e 90u, dava ~9u ≈ 80px em 1080p).
        //
        // Correção: alvo comum → offset ZERO (marcador exatamente em cima do mesh). Alvo grande
        // (chefe/dourado) → offset CLAMPADO ao raio do alvo, só pra espalhar vários marcadores
        // pelo corpo sem vazar pra fora dele.
        const maxOffset = isBigLockTarget(e) ? (e.radius ?? BIG_TARGET_FALLBACK_RADIUS) : 0
        const offset = direction.clone().multiplyScalar(rel.dot(direction)).sub(rel).clampLength(0, maxOffset)
        lockedEnemies.push({ entity: e, offset, seq: nextLockSeq++ })
      }
    },

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

    takeLockedTargets(inRange) {
      const targets = lockedEnemies.filter((rec) => !rec.entity.dying && inRange(rec.entity)).map((rec) => rec.entity)
      lockedEnemies = []
      return targets
    },

    clearLockedEnemies() { lockedEnemies = [] },

    // getWorldPosition em vez de mesh.position: se o mesh do inimigo estiver aninhado dentro
    // de um Group pai (chefe com corpo + anéis + filhos é o caso clássico), `.position` seria
    // LOCAL e o marcador apareceria no lugar errado. getWorldPosition sempre dá a posição real.
    getLockedEnemySnapshots: () => lockedEnemies
      .filter((rec) => !rec.entity.dying)
      .map((rec) => {
        rec.entity.mesh.getWorldPosition(_tmpWorldPos)
        return { id: rec.seq, worldPos: _tmpWorldPos.clone().add(rec.offset) }
      }),
  }
}
