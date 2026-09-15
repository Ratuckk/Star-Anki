import * as THREE from 'three'

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

// ============ LAYOUT DE MULTI-LOCK ============
// raio do anel de marcadores quando há >1 trava no MESMO alvo grande. Não é o raio de colisão:
// é o raio VISUAL onde os quadradinhos ficam distribuídos. Escolhido pra ficar perceptivelmente
// dentro do corpo do chefe (raio de colisão 7) sem colar uns nos outros.
const BIG_TARGET_RING_RADIUS = 4
// raio de fallback quando a entidade não expõe um `radius` — chefe/dourado hoje não expõem,
// então usamos os hit radius deles como referência (BOSS_HIT_RADIUS=7, GOLDEN_HIT_RADIUS=2.2).
// Hardcoded aqui pra não criar dependência de lockon.js → enemies/*.js (uma seta que não
// existiria em nenhum outro lugar do projeto). Se algum dia a entidade passar a expor
// `radius`, o `?? ` já cobre.
const BIG_TARGET_FALLBACK_RADIUS = 5

function isBigLockTarget(e) {
  return e.kind === 'boss' || e.kind === 'golden'
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
    sweepLockOn(origin, direction, maxAllowed = Infinity) {
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

      // 2) AQUISIÇÃO — tenta adicionar novos até bater o orçamento. Critério de ENTRADA usa o
      // cone estreito.
      if (lockedEnemies.length >= maxAllowed) return
      const candidates = [...enemies.getAlive(), ...enemies.getGoldenAlive()]
      for (const e of candidates) {
        if (lockedEnemies.length >= maxAllowed) break
        const alreadyLocked = lockedEnemies.some((rec) => rec.entity === e)
        // alvo comum já travado não trava de novo; alvo grande pode acumular quantas travas o
        // orçamento (maxAllowed) permitir (o layout em anel cuida de espalhar visualmente)
        if (!isBigLockTarget(e) && alreadyLocked) continue

        const rel = e.mesh.position.clone().sub(origin)
        const dist = rel.length()
        if (dist > MAX_LOCK_RANGE || dist < MIN_LOCK_RANGE) continue
        if (rel.dot(frame.forward) < PASS_BEHIND) continue
        const toTarget = rel.clone().normalize()
        const angle = Math.acos(THREE.MathUtils.clamp(direction.dot(toTarget), -1, 1))
        if (angle >= LOCK_ACQUIRE_ANGLE) continue

        lockedEnemies.push({ entity: e, seq: nextLockSeq++ })
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
    // `inRange`, e sempre limpa as travas em seguida (mesmo se vazio) — o "carregamento"
    // sempre reseta ao disparar. Importante: se o alvo grande recebeu N travas, devolve a
    // MESMA entity N vezes — o chamador (fireHomingShot) já sabe lidar com isso (cada trava =
    // 1 tiro teleguiado independente).
    takeLockedTargets(inRange) {
      const targets = lockedEnemies
        .filter((rec) => !rec.entity.dying && inRange(rec.entity))
        .map((rec) => rec.entity)
      lockedEnemies = []
      return targets
    },

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

        // trava única (o caso 99% das vezes — inimigo comum): marcador exatamente na âncora.
        // Sem offset, sem espalhamento, sem ruído.
        if (group.length === 1) {
          result.push({ id: group[0].seq, worldPos: _tmpWorldPos.clone() })
          continue
        }

        // multi-lock no mesmo alvo (só chefe/dourado chegam aqui): distribui em anel no plano
        // horizontal (XZ, mundo). Não é o plano perpendicular à visão (precisaria da câmera,
        // que o HUD tem mas o lockon não) — o plano XZ lê bem porque os alvos grandes são
        // vistos quase sempre de frente/longe, e um anel "deitado" ao redor deles parece
        // natural.
        const radius = Math.min(
          BIG_TARGET_RING_RADIUS,
          entity.radius ?? BIG_TARGET_FALLBACK_RADIUS,
        )
        for (let i = 0; i < group.length; i += 1) {
          const angle = (i / group.length) * Math.PI * 2
          _tmpOffset.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
          result.push({ id: group[i].seq, worldPos: _tmpWorldPos.clone().add(_tmpOffset) })
        }
      }
      return result
    },
  }
}
