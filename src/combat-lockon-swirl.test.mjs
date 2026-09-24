import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'

import { createLockOnSystem, LOCK_SOURCE_BASE, LOCK_SOURCE_MIYU } from './combat/lockon.js'
import { SWIRL_BLAST_BASE_HIT_RADIUS, SWIRL_BLAST_HIT_RADIUS, SWIRL_SCALE } from './combat/projectiles.js'
import { createEnemiesSystem, SWIRL_BOSS_MAX_HP_DAMAGE_RATIO } from './enemies/index.js'
import { BOSS_KIND, BOSS_PHASES } from './enemies/boss.js'
import { GOLDEN_KIND } from './enemies/golden.js'

function makeMockRail() {
  return {
    getFrameAt: () => ({
      position: new THREE.Vector3(0, 0, 0),
      forward: new THREE.Vector3(0, 0, 1),
      up: new THREE.Vector3(0, 1, 0),
      right: new THREE.Vector3(1, 0, 0),
    }),
    isArena: () => true,
    getArenaCenter: () => new THREE.Vector3(0, 0, 0),
    getDistanceAheadPoint: (dist) => new THREE.Vector3(0, 0, dist),
    getDistance: () => 0,
  }
}

function makeMockEnemy({ id = 1, kind = 'blaster', hp = 100, maxHp = 100, pos = [0, 0, 50], dying = false, fadingOut = false, radius = 2 } = {}) {
  const mesh = new THREE.Object3D()
  mesh.position.set(...pos)
  mesh.getWorldPosition = (target) => target.copy(mesh.position)
  return {
    id,
    kind,
    hp,
    maxHp,
    mesh,
    dying,
    fadingOut,
    radius,
  }
}

test('Lock-on: prioriza maior maxHp sobre HP atual (ex: 10/300 vence 100/100)', () => {
  const rail = makeMockRail()
  const enemyA = makeMockEnemy({ id: 1, kind: 'blaster', hp: 100, maxHp: 100, pos: [0, 0, 40] })
  const enemyB = makeMockEnemy({ id: 2, kind: 'tank', hp: 10, maxHp: 300, pos: [5, 0, 40] })

  const enemies = {
    getAlive: () => [enemyA, enemyB],
    getGoldenAlive: () => [],
    getLockableRadius: (e) => e.radius,
  }

  const lockon = createLockOnSystem(rail, enemies)
  lockon.sweepLockOn(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1), 1)

  const locked = lockon.getLockedEntities()
  assert.equal(locked.length, 1)
  assert.equal(locked[0].id, 2, 'Enemy B com 300 maxHp deve vencer mesmo com 10 de HP atual')
})

test('Lock-on: retículo governa a aquisição (alvo forte fora do retículo NÃO rouba lock do fraco dentro da mira)', () => {
  const rail = makeMockRail()
  // enemyWeak está exatamente na direção da mira (0, 0, 1)
  const enemyWeak = makeMockEnemy({ id: 1, kind: 'blaster', hp: 50, maxHp: 50, pos: [0, 0, 30] })
  // enemyStrong está deslocado lateralmente (fora do cone do retículo), mas na frente e no range
  const enemyStrong = makeMockEnemy({ id: 2, kind: 'tank', hp: 200, maxHp: 200, pos: [20, 0, 40] })

  const enemies = {
    getAlive: () => [enemyWeak, enemyStrong],
    getGoldenAlive: () => [],
    getLockableRadius: (e) => e.radius,
  }

  const lockon = createLockOnSystem(rail, enemies)
  // Mira apontando reto para o inimigo fraco
  lockon.sweepLockOn(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1), 1)

  const locked = lockon.getLockedEntities()
  assert.equal(locked.length, 1)
  assert.equal(locked[0].id, 1, 'Inimigo fraco na mira deve receber a trava; forte fora do retículo é ignorado')
})

test('Lock-on: Boss ativo tem prioridade absoluta mesmo sobre inimigo comum com maior maxHp', () => {
  const rail = makeMockRail()
  const commonHuge = makeMockEnemy({ id: 1, kind: 'tank', hp: 500, maxHp: 500, pos: [0, 0, 35] })
  const boss = makeMockEnemy({ id: 2, kind: 'boss', hp: 150, maxHp: 150, pos: [5, 0, 45] })

  const enemies = {
    getAlive: () => [commonHuge, boss],
    getGoldenAlive: () => [],
    getLockableRadius: (e) => e.radius,
  }

  const lockon = createLockOnSystem(rail, enemies)
  lockon.sweepLockOn(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1), 1)

  const locked = lockon.getLockedEntities()
  assert.equal(locked.length, 1)
  assert.equal(locked[0].kind, 'boss', 'Boss deve ter prioridade absoluta sobre inimigo de 500 maxHp')
})

test('Lock-on: Boss concentra todos os multi-locks disponíveis', () => {
  const rail = makeMockRail()
  const boss = makeMockEnemy({ id: 1, kind: 'boss', hp: 300, maxHp: 300, pos: [0, 0, 50] })
  const common = makeMockEnemy({ id: 2, kind: 'tank', hp: 200, maxHp: 200, pos: [10, 0, 40] })

  const enemies = {
    getAlive: () => [boss, common],
    getGoldenAlive: () => [],
    getLockableRadius: (e) => e.radius,
  }

  const lockon = createLockOnSystem(rail, enemies)
  lockon.sweepLockOn(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1), 5)

  const locked = lockon.getLockedEntities()
  assert.equal(locked.length, 5)
  for (const target of locked) {
    assert.equal(target.kind, 'boss', 'Todos os 5 locks devem se concentrar no boss')
  }
})

test('Lock-on: Dourado sem boss concentra multi-lock se for a maior prioridade', () => {
  const rail = makeMockRail()
  const golden = makeMockEnemy({ id: 10, kind: 'golden', hp: 300, maxHp: 300, pos: [0, 0, 50] })
  const common = makeMockEnemy({ id: 2, kind: 'blaster', hp: 50, maxHp: 50, pos: [0, 0, 40] })

  const enemies = {
    getAlive: () => [common],
    getGoldenAlive: () => [golden],
    getLockableRadius: (e) => e.radius,
  }

  const lockon = createLockOnSystem(rail, enemies)
  lockon.sweepLockOn(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1), 3)

  const locked = lockon.getLockedEntities()
  assert.equal(locked.length, 3)
  for (const target of locked) {
    assert.equal(target.kind, 'golden', 'Sem boss, Dourado com maior maxHp recebe todas as travas')
  }
})

test('Lock-on: Horda limita-se a no máximo 2 travas e comuns a 1', () => {
  const rail = makeMockRail()
  // Exemplo E do documento:
  // Tank: 300 (max 1), Horda: 250 (max 2), Blaster: 50 (max 1), 4 locks disponíveis
  const tank = makeMockEnemy({ id: 1, kind: 'tank', hp: 300, maxHp: 300, pos: [0, 0, 40] })
  const horda = makeMockEnemy({ id: 2, kind: 'horda', hp: 250, maxHp: 250, pos: [0, 0, 45] })
  const blaster = makeMockEnemy({ id: 3, kind: 'blaster', hp: 50, maxHp: 50, pos: [0, 0, 50] })

  const enemies = {
    getAlive: () => [tank, horda, blaster],
    getGoldenAlive: () => [],
    getLockableRadius: (e) => e.radius,
  }

  const lockon = createLockOnSystem(rail, enemies)
  lockon.sweepLockOn(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1), 4)

  const locked = lockon.getLockedEntities()
  assert.equal(locked.length, 4)
  assert.equal(locked[0].kind, 'tank', '1º lock: Tank (300 maxHp)')
  assert.equal(locked[1].kind, 'horda', '2º lock: Horda (250 maxHp, 1ª trava)')
  assert.equal(locked[2].kind, 'horda', '3º lock: Horda (250 maxHp, 2ª trava)')
  assert.equal(locked[3].kind, 'blaster', '4º lock: Blaster (50 maxHp)')
})

test('Lock-on: invalidação espacial (alvos atrás ou fora do alcance não são adquiridos)', () => {
  const rail = makeMockRail()
  // Inimigo atrás do jogador (z < -4)
  const behindBoss = makeMockEnemy({ id: 1, kind: 'boss', hp: 100, maxHp: 100, pos: [0, 0, -10] })
  // Inimigo perto demais (dist < 10)
  const tooClose = makeMockEnemy({ id: 2, kind: 'tank', hp: 200, maxHp: 200, pos: [0, 0, 5] })
  // Inimigo longe demais (dist > 90)
  const tooFar = makeMockEnemy({ id: 3, kind: 'tank', hp: 200, maxHp: 200, pos: [0, 0, 120] })
  // Inimigo válido
  const valid = makeMockEnemy({ id: 4, kind: 'blaster', hp: 50, maxHp: 50, pos: [0, 0, 30] })

  const enemies = {
    getAlive: () => [behindBoss, tooClose, tooFar, valid],
    getGoldenAlive: () => [],
    getLockableRadius: (e) => e.radius,
  }

  const lockon = createLockOnSystem(rail, enemies)
  lockon.sweepLockOn(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1), 2)

  const locked = lockon.getLockedEntities()
  assert.equal(locked.length, 1)
  assert.equal(locked[0].id, 4, 'Apenas o alvo espacialmente válido deve ser travado')
})

test('Lock-on: travas já adquiridas não mudam quando surge alvo com mais HP', () => {
  const rail = makeMockRail()
  const enemyA = makeMockEnemy({ id: 1, kind: 'blaster', hp: 50, maxHp: 50, pos: [0, 0, 40] })
  const aliveList = [enemyA]

  const enemies = {
    getAlive: () => aliveList,
    getGoldenAlive: () => [],
    getLockableRadius: (e) => e.radius,
  }

  const lockon = createLockOnSystem(rail, enemies)
  lockon.sweepLockOn(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1), 1)
  assert.equal(lockon.getLockedEntities()[0].id, 1)

  // Agora aparece um boss e maxAllowed sobe para 2
  const boss = makeMockEnemy({ id: 2, kind: 'boss', hp: 500, maxHp: 500, pos: [0, 0, 50] })
  aliveList.push(boss)

  lockon.sweepLockOn(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1), 2)
  const locked = lockon.getLockedEntities()
  assert.equal(locked.length, 2)
  assert.equal(locked[0].id, 1, 'A 1ª trava deve continuar no enemyA')
  assert.equal(locked[1].id, 2, 'A 2ª trava nova deve priorizar o boss')
})

test('Lock-on: Aim Hint (isAimingAtEnemy) é independente do lock-on', () => {
  const rail = makeMockRail()
  // Inimigo no ângulo de 3 graus da mira (dentro de AIM_HINT_ANGLE = 7 deg)
  const centered = makeMockEnemy({ id: 1, kind: 'blaster', hp: 50, maxHp: 50, pos: [1, 0, 30] })
  // Inimigo a 30 graus
  const offAngle = makeMockEnemy({ id: 2, kind: 'tank', hp: 200, maxHp: 200, pos: [20, 0, 30] })

  const enemies = {
    getAlive: () => [centered, offAngle],
    getGoldenAlive: () => [],
    getLockableRadius: (e) => e.radius,
  }

  const lockon = createLockOnSystem(rail, enemies)
  // Mira apontando reto (0, 0, 1)
  const aiming = lockon.isAimingAtEnemy(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1))
  assert.equal(aiming, true, 'isAimingAtEnemy deve ser true para alvo na frente da mira')

  // Mira apontando para cima (0, 1, 0) longe de todos
  const notAiming = lockon.isAimingAtEnemy(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0))
  assert.equal(notAiming, false, 'isAimingAtEnemy deve ser false quando mira não aponta para inimigo')
})

test('Swirl Blast: dano no Boss adiciona 30% do maxHp (6 base + 30% maxHp)', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const enemiesSys = createEnemiesSystem(scene, rail)

  // Boss com 100 de HP
  enemiesSys.spawnBossEnemy(100, 1)
  const [boss] = enemiesSys.getAlive()
  assert.equal(boss.kind, BOSS_KIND)
  assert.equal(boss.maxHp, 100)

  // Colisão perfurante do Swirl Blast com dano base 6
  // Segmento atravessando a posição do boss
  const prevPos = boss.mesh.position.clone().add(new THREE.Vector3(0, 0, -5))
  const currPos = boss.mesh.position.clone().add(new THREE.Vector3(0, 0, 5))

  const hits = enemiesSys.resolvePiercingProjectileHits(prevPos, currPos, {
    damage: 6,
    hitBuffer: SWIRL_BLAST_HIT_RADIUS,
    piercedTargets: new Set(),
  })

  assert.equal(hits.length, 1)
  assert.equal(hits[0].kind, BOSS_KIND)
  assert.equal(hits[0].stopProjectile, true, 'Boss deve parar o Swirl Blast')

  // Dano total esperado: 6 + 100 * 0.30 = 36.
  // Boss começa na fase 0 (threshold da fase 1 = 66 HP).
  // 100 - 36 = 64, mas o piso da transição trava em 66 HP (100 * 0.66).
  // Logo, HP fica em 66, e dano aplicado = 34.
  assert.equal(boss.hp, 66, 'Boss deve parar exatamente no piso da fase 2 (66 HP)')
  assert.equal(hits[0].damage, 34, 'Dano aplicado deve corresponder exatamente ao HP retirado respeitando o piso')
})

test('Swirl Blast: dano no Boss na fase final pode derrotá-lo', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const enemiesSys = createEnemiesSystem(scene, rail)

  enemiesSys.spawnBossEnemy(100, 1)
  const [boss] = enemiesSys.getAlive()
  // Coloca o boss na última fase com 20 de HP
  boss.phase = BOSS_PHASES.length - 1
  boss.phaseConfig = BOSS_PHASES[boss.phase]
  boss.hp = 20

  const prevPos = boss.mesh.position.clone().add(new THREE.Vector3(0, 0, -5))
  const currPos = boss.mesh.position.clone().add(new THREE.Vector3(0, 0, 5))

  const hits = enemiesSys.resolvePiercingProjectileHits(prevPos, currPos, {
    damage: 6,
    hitBuffer: SWIRL_BLAST_HIT_RADIUS,
    piercedTargets: new Set(),
  })

  assert.equal(hits.length, 1)
  assert.equal(hits[0].killed, true)
  assert.equal(hits[0].bossDefeated, true)
  assert.equal(boss.hp, 0)
  assert.equal(hits[0].damage, 20)
})

test('Swirl Blast: Boss com escudo tem escudo quebrado e recebe dano integral de contato', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const enemiesSys = createEnemiesSystem(scene, rail)

  enemiesSys.spawnBossEnemy(100, 1)
  const [boss] = enemiesSys.getAlive()
  boss.isShieldActive = true

  const prevPos = boss.mesh.position.clone().add(new THREE.Vector3(0, 0, -5))
  const currPos = boss.mesh.position.clone().add(new THREE.Vector3(0, 0, 5))

  const hits = enemiesSys.resolvePiercingProjectileHits(prevPos, currPos, {
    damage: 6,
    hitBuffer: SWIRL_BLAST_HIT_RADIUS,
    piercedTargets: new Set(),
  })

  assert.equal(hits.length, 1)
  assert.equal(hits[0].destroyedShield, true, 'Escudo deve ser quebrado pelo Swirl Blast')
  assert.equal(boss.isShieldActive, false, 'Escudo deve ficar inativo')
  assert.equal(hits[0].damage, 34, 'Dano deve ser aplicado mesmo com escudo')
})

test('Swirl Blast: Dourado NÃO recebe o bônus de 30% de maxHp', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const enemiesSys = createEnemiesSystem(scene, rail)

  enemiesSys.spawnGoldenSpecial({ distanceMin: 30, distanceMax: 30, level: 1 })
  const goldenAlive = enemiesSys.getGoldenAlive()
  assert.equal(goldenAlive.length, 1)
  const golden = goldenAlive[0]
  const initialHp = golden.hp

  const prevPos = golden.mesh.position.clone().add(new THREE.Vector3(0, 0, -5))
  const currPos = golden.mesh.position.clone().add(new THREE.Vector3(0, 0, 5))

  const hits = enemiesSys.resolvePiercingProjectileHits(prevPos, currPos, {
    damage: 6,
    hitBuffer: SWIRL_BLAST_HIT_RADIUS,
    piercedTargets: new Set(),
    goldenPiercedTargets: new Set(),
  })

  assert.equal(hits.length, 1)
  assert.equal(hits[0].kind, GOLDEN_KIND)
  assert.equal(hits[0].stopProjectile, true)
  assert.equal(golden.hp, initialHp - 6, 'Dourado deve perder apenas 6 de dano base (sem 30% de maxHp)')
})

test('Swirl Blast: Hitbox própria permite acerto por raspão volumétrico e swept collision', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const enemiesSys = createEnemiesSystem(scene, rail)

  // Inimigo Tank (raio 2.2)
  const tank = enemiesSys.spawnTankEnemy(50)
  tank.spawnPhase = null
  const tankPos = tank.mesh.position

  // Segmento passando lateralmente a uma distância de (tankRadius + 2.5)
  // Sem hitBuffer (hitBuffer = 0), a distância seria maior que o raio do tank -> erraria.
  // Com SWIRL_BLAST_HIT_RADIUS = 3.0, distância (2.2 + 2.5 = 4.7) <= (2.2 + 3.0 = 5.2) -> conecta!
  const offset = 2.2 + 2.5 // 4.7u do centro
  const prevPos = new THREE.Vector3(tankPos.x + offset, tankPos.y, tankPos.z - 10)
  const currPos = new THREE.Vector3(tankPos.x + offset, tankPos.y, tankPos.z + 10)

  const hits = enemiesSys.resolvePiercingProjectileHits(prevPos, currPos, {
    damage: 6,
    hitBuffer: SWIRL_BLAST_HIT_RADIUS,
    piercedTargets: new Set(),
  })

  assert.equal(hits.length, 1, 'Raspão volumétrico deve registrar contato com a nova hitbox')
  assert.equal(hits[0].kind, 'tank')

  // Passagem claramente fora (distância de 2.2 + 3.8 = 6.0u > 5.2u)
  const farOffset = 2.2 + 3.8
  const farPrev = new THREE.Vector3(tankPos.x + farOffset, tankPos.y, tankPos.z - 10)
  const farCurr = new THREE.Vector3(tankPos.x + farOffset, tankPos.y, tankPos.z + 10)

  const farHits = enemiesSys.resolvePiercingProjectileHits(farPrev, farCurr, {
    damage: 6,
    hitBuffer: SWIRL_BLAST_HIT_RADIUS,
    piercedTargets: new Set(),
  })

  assert.equal(farHits.length, 0, 'Passagem fora da hitbox não deve registrar contato')
})

test('Swirl Blast: Detrito é destruído instantaneamente e projétil continua voando', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const enemiesSys = createEnemiesSystem(scene, rail)

  const [detrito] = enemiesSys.spawnDetrito(1)
  detrito.spawnPhase = null
  assert.equal(detrito.kind, 'detrito')

  const prevPos = detrito.mesh.position.clone().add(new THREE.Vector3(0, 0, -5))
  const currPos = detrito.mesh.position.clone().add(new THREE.Vector3(0, 0, 5))

  const hits = enemiesSys.resolvePiercingProjectileHits(prevPos, currPos, {
    damage: 6,
    hitBuffer: SWIRL_BLAST_HIT_RADIUS,
    piercedTargets: new Set(),
  })

  assert.equal(hits.length, 1)
  assert.equal(hits[0].killed, true)
  assert.equal(hits[0].stopProjectile, false, 'Swirl Blast NÃO para em detrito, continua perfurando')
})

test('Lock-on: Boss surgindo durante carga mantém travas antigas e novas travas vão para o boss', () => {
  const rail = makeMockRail()
  const tank = makeMockEnemy({ id: 10, kind: 'tank', hp: 300, maxHp: 300, pos: [0, 0, 40] })
  const sentry = makeMockEnemy({ id: 11, kind: 'sentry', hp: 150, maxHp: 150, pos: [5, 0, 45] })
  let boss = null

  const enemies = {
    getAlive: () => (boss ? [tank, sentry, boss] : [tank, sentry]),
    getGoldenAlive: () => [],
    getLockableRadius: (e) => e.radius,
  }

  const lockon = createLockOnSystem(rail, enemies)
  const origin = new THREE.Vector3(0, 0, 0)
  const forward = new THREE.Vector3(0, 0, 1)

  // Carga inicial com 1 trava -> escolhe tank (300 maxHp)
  lockon.sweepLockOn(origin, forward, 1)
  let locks = lockon.getLockedEntities()
  assert.equal(locks.length, 1)
  assert.equal(locks[0].id, 10)

  // Agora boss surge durante o carregamento
  boss = makeMockEnemy({ id: 99, kind: BOSS_KIND, hp: 500, maxHp: 500, pos: [0, 0, 60] })

  // Carga aumenta para 3 travas
  lockon.sweepLockOn(origin, forward, 3)
  locks = lockon.getLockedEntities()
  assert.equal(locks.length, 3)
  // Primeira trava continuou no tank (não pulou!)
  assert.equal(locks[0].id, 10)
  // Próximas duas travas foram para o Boss
  assert.equal(locks[1].id, 99)
  assert.equal(locks[2].id, 99)
})

test('Lock-on: Boss morrendo invalida suas travas e próximas aquisições voltam ao maior maxHp', () => {
  const rail = makeMockRail()
  const boss = makeMockEnemy({ id: 99, kind: BOSS_KIND, hp: 500, maxHp: 500, pos: [0, 0, 60] })
  const tank = makeMockEnemy({ id: 10, kind: 'tank', hp: 300, maxHp: 300, pos: [0, 0, 40] })

  const enemies = {
    getAlive: () => [boss, tank],
    getGoldenAlive: () => [],
    getLockableRadius: (e) => e.radius,
  }

  const lockon = createLockOnSystem(rail, enemies)
  const origin = new THREE.Vector3(0, 0, 0)
  const forward = new THREE.Vector3(0, 0, 1)

  lockon.sweepLockOn(origin, forward, 2)
  let locks = lockon.getLockedEntities()
  assert.equal(locks.length, 2)
  assert.equal(locks[0].id, 99)
  assert.equal(locks[1].id, 99)

  // Boss morre
  boss.dying = true
  boss.hp = 0

  // Atualiza com 2 travas permitidas
  lockon.sweepLockOn(origin, forward, 2)
  locks = lockon.getLockedEntities()
  // As travas do boss foram removidas e a vaga foi preenchida pelo tank (maior maxHp vivo)
  assert.equal(locks.length, 1)
  assert.equal(locks[0].id, 10)
})

test('Lock-on: Empate de maxHp desempata de forma estável por menor ID', () => {
  const rail = makeMockRail()
  const tankB = makeMockEnemy({ id: 25, kind: 'tank', hp: 200, maxHp: 200, pos: [5, 0, 40] })
  const tankA = makeMockEnemy({ id: 12, kind: 'tank', hp: 200, maxHp: 200, pos: [-5, 0, 40] })

  const enemies = {
    getAlive: () => [tankB, tankA],
    getGoldenAlive: () => [],
    getLockableRadius: (e) => e.radius,
  }

  const lockon = createLockOnSystem(rail, enemies)
  const origin = new THREE.Vector3(0, 0, 0)
  const forward = new THREE.Vector3(0, 0, 1)

  lockon.sweepLockOn(origin, forward, 1)
  const locks = lockon.getLockedEntities()
  assert.equal(locks.length, 1)
  assert.equal(locks[0].id, 12, 'Determinismo estável: menor ID vence em caso de empate')
})

test('Swirl Blast: dano no Boss com bônus global de dano soma 6 base + globalBonus + 30% maxHp', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const enemiesSys = createEnemiesSystem(scene, rail)

  enemiesSys.spawnBossEnemy(100, 1)
  const [boss] = enemiesSys.getAlive()

  // Colocamos o boss na fase final (phase 2) para testar sem clamp de piso de transição
  boss.phase = 2
  boss.phaseConfig = BOSS_PHASES[2]
  boss.hp = 50

  // Base 6 + bonus 3 = 9. Mais 30% de 100 = 30 -> dano total 39
  const prevPos = boss.mesh.position.clone().add(new THREE.Vector3(0, 0, -5))
  const currPos = boss.mesh.position.clone().add(new THREE.Vector3(0, 0, 5))

  const hits = enemiesSys.resolvePiercingProjectileHits(prevPos, currPos, {
    damage: 6 + 3, // simula dano do projétil somado ao bônus global
    hitBuffer: SWIRL_BLAST_HIT_RADIUS,
    piercedTargets: new Set(),
  })

  assert.equal(hits.length, 1)
  assert.equal(hits[0].damage, 39, 'Dano final deve ser 6 base + 3 bonus + 30% de 100 = 39')
  assert.equal(boss.hp, 11, 'HP deve reduzir de 50 para 11 (50 - 39 = 11)')
})


test('Swirl Blast: piercedTargets impede dano duplo no mesmo alvo em frames consecutivos', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const enemiesSys = createEnemiesSystem(scene, rail)

  enemiesSys.spawnBossEnemy(100, 1)
  const [boss] = enemiesSys.getAlive()

  const pierced = new Set()
  const p1 = boss.mesh.position.clone().add(new THREE.Vector3(0, 0, -5))
  const p2 = boss.mesh.position.clone().add(new THREE.Vector3(0, 0, 5))

  // Frame 1
  const hits1 = enemiesSys.resolvePiercingProjectileHits(p1, p2, {
    damage: 6,
    hitBuffer: SWIRL_BLAST_HIT_RADIUS,
    piercedTargets: pierced,
  })
  assert.equal(hits1.length, 1)
  assert.equal(pierced.has(boss.id), true)

  // Frame 2 (projétil continuaria ou pararia)
  const p3 = boss.mesh.position.clone().add(new THREE.Vector3(0, 0, 6))
  const hits2 = enemiesSys.resolvePiercingProjectileHits(p2, p3, {
    damage: 6,
    hitBuffer: SWIRL_BLAST_HIT_RADIUS,
    piercedTargets: pierced,
  })
  assert.equal(hits2.length, 0, 'Alvo já contido em piercedTargets não recebe segundo hit')
})

test('Swirl Blast: Morte do Boss Dourado gera goldenSpecialHit e ativa consumeGoldenDefeated', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const enemiesSys = createEnemiesSystem(scene, rail)

  enemiesSys.spawnGoldenSpecial({ distanceMin: 30, distanceMax: 30, level: 1 })
  const [golden] = enemiesSys.getGoldenAlive()
  golden.hp = 6 // deixa com 6 de HP para morrer com 1 hit de Swirl Blast

  const prevPos = golden.mesh.position.clone().add(new THREE.Vector3(0, 0, -5))
  const currPos = golden.mesh.position.clone().add(new THREE.Vector3(0, 0, 5))

  const hits = enemiesSys.resolvePiercingProjectileHits(prevPos, currPos, {
    damage: 6,
    hitBuffer: SWIRL_BLAST_HIT_RADIUS,
    piercedTargets: new Set(),
    goldenPiercedTargets: new Set(),
  })

  assert.equal(hits.length, 1)
  assert.equal(hits[0].kind, GOLDEN_KIND)
  assert.equal(hits[0].killed, true)
  assert.equal(hits[0].goldenSpecialHit, true)
  assert.equal(golden.hp, 0)
  assert.equal(golden.dying, true)
  assert.equal(enemiesSys.isGoldenDying(), true)

  const defeated = enemiesSys.consumeGoldenDefeated()
  assert.ok(defeated, 'consumeGoldenDefeated deve retornar resultado de derrota')
  assert.equal(defeated.defeated, true)
  assert.ok(defeated.worldPos, 'deve carregar worldPos do Dourado')
  assert.equal(enemiesSys.consumeGoldenDefeated(), null, 'consumo subsequente deve ser nulo (idempotente)')
})
