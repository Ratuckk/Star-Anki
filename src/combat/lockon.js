import * as THREE from 'three'

// ============ LOCK-ON do tiro carregado ============
// Extraído de combat.js (v0.38.0, split por sistema). O tiro carregado passa a poder travar o
// chefe/dourado (antes só inimigos comuns), e um alvo GRANDE (chefe/dourado) pode receber várias
// travas ao mesmo tempo em vez de só 1 — cada trava vira um tiro teleguiado independente na hora
// de soltar. Por isso `lockedEnemies` é um array de "lock records" ({ entity, offset, seq }), não
// um Set (não dava pra repetir a mesma entidade) — offset é o ponto (relativo ao centro do alvo)
// onde o marcador verde do HUD deve aparecer.

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

// espalhamento dos marcadores quando um alvo GRANDE já travado recebe uma trava ADICIONAL. Sem
// isso, cada trava extra no mesmo alvo empilharia no mesmo pixel. O raio de espalhamento é
// CLAMPADO ao raio do alvo (ver BIG_TARGET_FALLBACK_RADIUS) — o marcador espalha pelo corpo do
// chefe/dourado, nunca pra fora dele.
const MULTI_LOCK_SPREAD_RADIUS = 5
// fallback do "raio" do alvo grande quando a entidade não expõe um (o boss tem BOSS_HIT_RADIUS
// = 7 em boss.js, mas isso não é um campo do objeto — é uma constante de módulo)
const BIG_TARGET_FALLBACK_RADIUS = 6

function isBigLockTarget(e) {
  return e.kind === 'boss' || e.kind === 'golden'
}

// temporário de módulo — evita alocar Vector3 novo a cada snapshot por frame
const _tmpWorldPos = new THREE.Vector3()

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
        const alreadyLocked = lockedEnemies.some((rec) => rec.entity === e)
        // alvo comum já travado não trava de novo; alvo grande pode acumular quantas travas o
        // orçamento (maxAllowed) permitir
        if (!isBigLockTarget(e) && alreadyLocked) continue
        const rel = e.mesh.position.clone().sub(origin)
        const dist = rel.length()
        if (dist > MAX_LOCK_RANGE || dist < MIN_LOCK_RANGE || rel.dot(frame.forward) < PASS_BEHIND) continue
        const toTarget = rel.clone().normalize()
        const angle = Math.acos(THREE.MathUtils.clamp(direction.dot(toTarget), -1, 1))
        if (angle >= ENEMY_LOCK_ANGLE) continue

        // offset do marcador no HUD (relativo ao centro do mesh do alvo):
        //
        // BUG corrigido: a versão antiga calculava `direction * (rel·direction) - rel` pra
        // TODA trava, incluindo a primeira. Isso é o vetor do centro do alvo até o ponto da
        // LINHA DE MIRA mais próximo dele — magnitude `|rel| * sin(ângulo)`. A 90u de distância
        // e 6° de desvio (limite do cone), o offset era ~9.4u, contra um raio de inimigo comum
        // de ~1.8u: o marcador caía 5x fora do corpo, deslocado perpendicularmente à mira (lê
        // como "à esquerda/direita do inimigo" na tela).
        //
        // Correção: alvo comum → offset ZERO, marcador exatamente sobre o centro do mesh.
        // Alvo grande (chefe/dourado) → offset ALEATÓRIO clampado ao raio do alvo, só pra
        // espalhar visualmente vários marcadores pelo corpo sem vazar pra fora dele.
        let offset
        if (isBigLockTarget(e)) {
          const radius = e.radius ?? BIG_TARGET_FALLBACK_RADIUS
          offset = new THREE.Vector3(
            (Math.random() * 2 - 1) * radius,
            (Math.random() * 2 - 1) * radius,
            (Math.random() * 2 - 1) * radius,
          )
        } else {
          offset = new THREE.Vector3(0, 0, 0)
        }
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

    // getWorldPosition em vez de mesh.position: se o mesh do inimigo estiver aninhado dentro
    // de um Group pai (chefe com corpo + anéis + filhos é o caso clássico), `.position` seria
    // LOCAL e o marcador apareceria no lugar errado. getWorldPosition sempre dá a posição
    // real. `offset` é somado depois — zero pra alvo comum (marcador exatamente em cima),
    // clampado ao raio pra alvo grande (espalhado pelo corpo).
    getLockedEnemySnapshots: () => lockedEnemies
      .filter((rec) => !rec.entity.dying)
      .map((rec) => {
        rec.entity.mesh.getWorldPosition(_tmpWorldPos)
        return { id: rec.seq, worldPos: _tmpWorldPos.clone().add(rec.offset) }
      }),
  }
}
