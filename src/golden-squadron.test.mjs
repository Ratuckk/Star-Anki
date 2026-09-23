import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  createGoldenSquadron,
  getSquadronCapForLevel,
  getOffensiveCapForLevel,
  getReplenishIntervalForLevel,
  getFighterHpForLevel,
  GOLDEN_FIGHTER_KIND,
  GOLDEN_FIGHTER_HIT_RADIUS,
  GOLDEN_FIGHTER_KILL_POINTS,
  FIGHTER_STATE,
  SQUADRON_ORDER,
} from './enemies/golden-squadron.js'
import { createGoldenSystem, GOLDEN_KIND, GOLDEN_HIT_RADIUS } from './enemies/golden.js'
import { createEnemiesSystem } from './enemies/index.js'

function makeMockRail() {
  const frame = {
    position: new THREE.Vector3(0, 0, 0),
    forward: new THREE.Vector3(0, 0, -1),
    up: new THREE.Vector3(0, 1, 0),
    right: new THREE.Vector3(1, 0, 0),
  }
  return {
    getFrameAt: () => frame,
    getPlayerPosition: () => new THREE.Vector3(0, 0, 0),
  }
}

function makeMockCtx() {
  const firedProjectiles = []
  const pushedProjectiles = []
  const pushedLasers = []
  return {
    firedProjectiles,
    pushedProjectiles,
    pushedLasers,
    fireEnemyProjectile: (opts, targetPos) => {
      firedProjectiles.push({ opts, targetPos: targetPos?.clone() })
    },
    pushProjectile: (p) => pushedProjectiles.push(p),
    pushLaser: (l) => pushedLasers.push(l),
  }
}

// ============ 35.1 MAPPING DE DIFICULDADE ============
test('35.1 Mapping de Dificuldade: Capacidade do esquadrão e limite ofensivo por nível', () => {
  const expectedSquadCap = [null, 2, 2, 3, 3, 4, 4, 5, 5, 6]
  const expectedOffensiveCap = [null, 1, 1, 2, 2, 2, 2, 3, 3, 3]

  for (let lvl = 1; lvl <= 9; lvl++) {
    assert.equal(getSquadronCapForLevel(lvl), expectedSquadCap[lvl], `Nível ${lvl} deve ter cap de esquadrão ${expectedSquadCap[lvl]}`)
    assert.equal(getOffensiveCapForLevel(lvl), expectedOffensiveCap[lvl], `Nível ${lvl} deve ter ofensivo máximo ${expectedOffensiveCap[lvl]}`)
  }

  // Progressão de reposição: ~15s no nível 1 até ~8s no nível 9
  assert.equal(getReplenishIntervalForLevel(1), 15.0)
  assert.equal(getReplenishIntervalForLevel(5), 11.0)
  assert.equal(getReplenishIntervalForLevel(9), 8.0)
  assert.ok(getReplenishIntervalForLevel(1) > getReplenishIntervalForLevel(5))
  assert.ok(getReplenishIntervalForLevel(5) > getReplenishIntervalForLevel(9))
})

// ============ 35.2 SPAWN INICIAL ============
test('35.2 Spawn Inicial: Quantidade, IDs únicos, HP válido, slots únicos e ausência de NaN', () => {
  const scene = new THREE.Scene()
  let nextIdVal = 100
  const squadron = createGoldenSquadron(scene, null, () => nextIdVal++, 5) // nível 5 -> cap 4
  const commanderPos = new THREE.Vector3(0, 0, -40)
  const forward = new THREE.Vector3(0, 0, 1)

  squadron.initSquadron(commanderPos, forward)
  const fighters = squadron.getAlive()

  assert.equal(fighters.length, 4, 'Nível 5 deve spawnar exatamente 4 caças inicialmente')

  const ids = new Set()
  const slots = new Set()
  for (const f of fighters) {
    assert.ok(f.id, 'Caça deve possuir ID')
    assert.ok(!ids.has(f.id), 'IDs dos caças devem ser únicos')
    ids.add(f.id)

    assert.ok(!slots.has(f.slotIndex), 'Slots de formação devem ser únicos')
    slots.add(f.slotIndex)

    assert.equal(f.hp, getFighterHpForLevel(5), 'HP do caça deve seguir a fórmula de nível')
    assert.equal(f.kind, GOLDEN_FIGHTER_KIND)
    assert.ok(f.mesh && f.mesh.parent === scene, 'Mesh deve estar presente e adicionado à cena')

    assert.ok(Number.isFinite(f.mesh.position.x))
    assert.ok(Number.isFinite(f.mesh.position.y))
    assert.ok(Number.isFinite(f.mesh.position.z))
    assert.ok(!Number.isNaN(f.mesh.position.x))
  }
})

// ============ 35.3 FORMAÇÃO E SEGUIMENTO SUAVE ============
test('35.3 Formação: Caças acompanham o comandante suavemente sem snap ou teleporte', () => {
  const scene = new THREE.Scene()
  let id = 1
  const squadron = createGoldenSquadron(scene, null, () => id++, 3) // nível 3 -> cap 3
  const commander = {
    mesh: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
    laserTelegraphTimer: 0,
    dying: false,
  }
  commander.mesh.position.set(0, 0, -50)
  squadron.initSquadron(commander.mesh.position, new THREE.Vector3(0, 0, 1))

  const ctx = makeMockCtx()
  const playerPos = new THREE.Vector3(0, 0, 0)

  // Move o comandante lateralmente e para a frente
  const initialFighterPos = squadron.getAlive()[0].mesh.position.clone()

  for (let frame = 0; frame < 60; frame++) {
    commander.mesh.position.x += 0.2
    commander.mesh.position.z += 0.1
    squadron.update(1 / 60, commander, playerPos, ctx)
  }

  const updatedFighterPos = squadron.getAlive()[0].mesh.position.clone()
  assert.ok(updatedFighterPos.distanceTo(initialFighterPos) > 1.0, 'Caças devem acompanhar o movimento do comandante')

  for (const f of squadron.getAlive()) {
    assert.ok(Number.isFinite(f.mesh.position.x))
    assert.ok(Number.isFinite(f.mesh.position.y))
    assert.ok(Number.isFinite(f.mesh.position.z))
    assert.ok(f.mesh.position.distanceTo(commander.mesh.position) < 30.0, 'Caças devem permanecer em formação ao redor do comandante')
  }
})

// ============ 35.4 DANO, HIT DETECTION E MORTE ============
test('35.4 Dano e Morte: Normal shot, Swirl piercing e registro de abate único', () => {
  const scene = new THREE.Scene()
  let id = 1
  const squadron = createGoldenSquadron(scene, null, () => id++, 1) // nível 1 -> cap 2
  const commanderPos = new THREE.Vector3(0, 0, -40)
  squadron.initSquadron(commanderPos, new THREE.Vector3(0, 0, 1))

  const [f1, f2] = squadron.getAlive()
  const f1Pos = f1.mesh.position.clone()

  // 1. Tiro normal não-letal
  const hitNonLethal = squadron.resolveHit(
    f1Pos.clone().add(new THREE.Vector3(0, 0, -1)),
    f1Pos.clone().add(new THREE.Vector3(0, 0, 1)),
    2, false, 1.0, null
  )
  assert.ok(hitNonLethal, 'Tiro no trajeto deve acertar o caça')
  assert.equal(hitNonLethal.kind, GOLDEN_FIGHTER_KIND)
  assert.equal(hitNonLethal.killed, false)
  assert.equal(hitNonLethal.goldenSpecialHit, false, 'Caça nunca deve disparar cutscene de boss')
  assert.equal(f1.hp, f1.maxHp - 2)

  // 2. Tiro letal subsequente
  const hitLethal = squadron.resolveHit(
    f1Pos.clone().add(new THREE.Vector3(0, 0, -1)),
    f1Pos.clone().add(new THREE.Vector3(0, 0, 1)),
    10, false, 1.0, null
  )
  assert.ok(hitLethal)
  assert.equal(hitLethal.killed, true)
  assert.equal(hitLethal.enemyKillPoints, GOLDEN_FIGHTER_KILL_POINTS)
  assert.equal(hitLethal.goldenSpecialHit, false)
  assert.equal(f1.dying, true)

  // 3. Swirl Piercing Hit
  const f2Pos = f2.mesh.position.clone()
  const piercedTargets = new Set()
  const swirlHits = squadron.resolvePiercingHit(
    f2Pos.clone().add(new THREE.Vector3(0, 0, -2)),
    f2Pos.clone().add(new THREE.Vector3(0, 0, 2)),
    10, piercedTargets, 1.0
  )
  assert.equal(swirlHits.length, 1)
  assert.equal(swirlHits[0].stopProjectile, false, 'Swirl deve perfurar caça sem parar')
  assert.equal(swirlHits[0].killed, true)
  assert.equal(swirlHits[0].enemyKillPoints, GOLDEN_FIGHTER_KILL_POINTS)
})

// ============ 35.5 REPOSIÇÃO GRADUAL ============
test('35.5 Reposição: Uma nave por ciclo, respeitando cap da dificuldade e tempo', () => {
  const scene = new THREE.Scene()
  let id = 1
  const squadron = createGoldenSquadron(scene, null, () => id++, 1) // nível 1 -> cap 2, intervalo 15s
  const commander = {
    mesh: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
    laserTelegraphTimer: 0,
    dying: false,
  }
  commander.mesh.position.set(0, 0, -40)
  squadron.initSquadron(commander.mesh.position, new THREE.Vector3(0, 0, 1))

  assert.equal(squadron.getAlive().length, 2)

  // Abate um caça
  const [f1] = squadron.getAlive()
  f1.dying = true
  f1.deathT = 1.0 // forçará remoção no próximo update

  const ctx = makeMockCtx()
  squadron.update(0.1, commander, new THREE.Vector3(0, 0, 0), ctx)
  assert.equal(squadron.getAlive().length, 1, 'Após remoção, resta 1 caça')

  // Passa 5 segundos: ainda NÃO deve ter reposto (intervalo é 15s)
  for (let i = 0; i < 50; i++) {
    squadron.update(0.1, commander, new THREE.Vector3(0, 0, 0), ctx)
  }
  assert.equal(squadron.getAlive().length, 1, 'Não deve repor antes do intervalo')

  // Passa mais 11 segundos (total > 15s): deve repor exatamente 1 caça
  for (let i = 0; i < 110; i++) {
    squadron.update(0.1, commander, new THREE.Vector3(0, 0, 0), ctx)
  }
  assert.equal(squadron.getAlive().length, 2, 'Deve repor exatamente 1 caça atingindo o cap')

  // Passa mais 20 segundos com cap cheio: NUNCA deve exceder 2
  for (let i = 0; i < 200; i++) {
    squadron.update(0.1, commander, new THREE.Vector3(0, 0, 0), ctx)
  }
  assert.equal(squadron.getAlive().length, 2, 'Cap da dificuldade 1 (2) nunca deve ser excedido')
})

// ============ 35.6 LIMITE OFENSIVO ============
test('35.6 Limite Ofensivo: activeAttackers nunca excede offensiveCap em nenhum frame', () => {
  const scene = new THREE.Scene()
  let id = 1
  const squadron = createGoldenSquadron(scene, null, () => id++, 5) // nível 5 -> cap 4, ofensivo 2
  const commander = {
    mesh: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
    laserTelegraphTimer: 0,
    dying: false,
  }
  commander.mesh.position.set(0, 0, -45)
  squadron.initSquadron(commander.mesh.position, new THREE.Vector3(0, 0, 1))

  const ctx = makeMockCtx()
  const playerPos = new THREE.Vector3(0, 0, 0)
  const offensiveCap = getOffensiveCapForLevel(5) // 2

  // Simula 300 frames com ordens disparando
  for (let frame = 0; frame < 300; frame++) {
    squadron.update(1 / 60, commander, playerPos, ctx)
    const attackingCount = squadron.getAlive().filter((f) => f.state === FIGHTER_STATE.ATTACKING).length
    assert.ok(attackingCount <= offensiveCap, `Atacantes ativos (${attackingCount}) não podem exceder o cap ofensivo (${offensiveCap})`)
  }
})

// ============ 35.7 STRAFING RUN ============
test('35.7 Ordem 1 — Strafing Run: Ciclo completo e transições válidas', () => {
  const scene = new THREE.Scene()
  let id = 1
  const squadron = createGoldenSquadron(scene, null, () => id++, 1)
  const commander = {
    mesh: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
    laserTelegraphTimer: 0,
    dying: false,
  }
  commander.mesh.position.set(0, 0, -50)
  squadron.initSquadron(commander.mesh.position, new THREE.Vector3(0, 0, 1))

  const ctx = makeMockCtx()
  const playerPos = new THREE.Vector3(0, 0, 0)

  // Simula encontro até que uma ordem seja ativada
  let witnessedAttacking = false
  let witnessedPassingOrReturning = false

  for (let frame = 0; frame < 400; frame++) {
    squadron.update(1 / 30, commander, playerPos, ctx)
    const states = squadron.getAlive().map((f) => f.state)
    if (states.includes(FIGHTER_STATE.ATTACKING)) witnessedAttacking = true
    if (states.includes(FIGHTER_STATE.PASSING) || states.includes(FIGHTER_STATE.RETURNING)) witnessedPassingOrReturning = true
  }

  assert.ok(witnessedAttacking, 'Strafing/Ordem deve atingir estado ATTACKING')
  assert.ok(witnessedPassingOrReturning, 'Caça deve ultrapassar e retornar sem ser suicida')
})

// ============ 35.8 PINÇA (PINCER) ============
test('35.8 Ordem 2 — Pinça: Dois caças com vetores distintos e sem sobreposição', () => {
  const scene = new THREE.Scene()
  let id = 1
  const squadron = createGoldenSquadron(scene, null, () => id++, 3) // nível 3 -> cap 3
  const commander = {
    mesh: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
    laserTelegraphTimer: 0,
    dying: false,
  }
  commander.mesh.position.set(0, 0, -45)
  squadron.initSquadron(commander.mesh.position, new THREE.Vector3(0, 0, 1))

  const [fLeft, fRight] = squadron.getAlive()
  const ctx = makeMockCtx()
  const playerPos = new THREE.Vector3(0, 0, 0)

  // Força ordem de pinça
  fLeft.state = FIGHTER_STATE.FORMATION
  fRight.state = FIGHTER_STATE.FORMATION

  for (let i = 0; i < 180; i++) {
    squadron.update(1 / 60, commander, playerPos, ctx)
    // Se ambos estão em manobra, a distância entre eles deve ser significativa
    if (fLeft.state === FIGHTER_STATE.ATTACKING && fRight.state === FIGHTER_STATE.ATTACKING) {
      const distBetween = fLeft.mesh.position.distanceTo(fRight.mesh.position)
      assert.ok(distBetween > 6.0, 'Caças em pinça devem ter separação espacial distinta')
    }
  }
})

// ============ 35.9 CERCO DO LASER ============
test('35.9 Ordem 3 — Cerco do Laser: Flancos coordenados sem quebrar o laser', () => {
  const scene = new THREE.Scene()
  let id = 1
  const squadron = createGoldenSquadron(scene, null, () => id++, 5) // nível 5 -> cap 4
  const commander = {
    mesh: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
    laserTelegraphTimer: 2.5,
    dying: false,
  }
  commander.mesh.position.set(0, 0, -50)
  squadron.initSquadron(commander.mesh.position, new THREE.Vector3(0, 0, 1))

  const playerPos = new THREE.Vector3(0, 0, 0)
  squadron.coordinateLaserFlank(commander.mesh.position, playerPos, 2.5)

  assert.equal(squadron.getCurrentOrder(), SQUADRON_ORDER.LASER_FLANK)

  const ctx = makeMockCtx()
  squadron.update(0.5, commander, playerPos, ctx)

  // Caças devem estar em flanco (PREPARING)
  const flankers = squadron.getAlive().filter((f) => f.currentOrder === SQUADRON_ORDER.LASER_FLANK)
  assert.ok(flankers.length > 0, 'Caças devem participar do cerco do laser')

  // Morte de um caça durante o cerco não quebra o estado
  flankers[0].dying = true
  squadron.update(0.5, commander, playerPos, ctx)
  assert.equal(squadron.getCurrentOrder(), SQUADRON_ORDER.LASER_FLANK, 'Laser flank continua com sobreviventes')
})

// ============ 35.10 FOGO COORDENADO ============
test('35.10 Ordem 4 — Fogo Coordenado: Disparos escalonados no tempo, sem burst no mesmo frame', () => {
  const scene = new THREE.Scene()
  let id = 1
  const squadron = createGoldenSquadron(scene, null, () => id++, 3)
  const commander = {
    mesh: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
    laserTelegraphTimer: 0,
    dying: false,
  }
  commander.mesh.position.set(0, 0, -45)
  squadron.initSquadron(commander.mesh.position, new THREE.Vector3(0, 0, 1))

  const ctx = makeMockCtx()
  const playerPos = new THREE.Vector3(0, 0, 0)

  // Simula update frame a frame para registrar disparos de projéteis
  const shotsPerFrame = []
  for (let frame = 0; frame < 120; frame++) {
    const beforeCount = ctx.firedProjectiles.length
    squadron.update(0.05, commander, playerPos, ctx)
    const afterCount = ctx.firedProjectiles.length
    shotsPerFrame.push(afterCount - beforeCount)
  }

  // Verifica que em nenhum frame houve mais de 1 disparo (escalonamento temporal estrito)
  for (let i = 0; i < shotsPerFrame.length; i++) {
    assert.ok(shotsPerFrame[i] <= 1, `Frame ${i} disparou ${shotsPerFrame[i]} tiros simultâneos; máximo permitido é 1`)
  }
})

// ============ 35.11 TELEPORTE E DESORGANIZAÇÃO ============
test('35.11 Teleporte do Comandante: Caças NÃO teleportam e entram em DISORGANIZED', () => {
  const scene = new THREE.Scene()
  let id = 1
  const squadron = createGoldenSquadron(scene, null, () => id++, 3)
  const oldPos = new THREE.Vector3(0, 0, -40)
  const newPos = new THREE.Vector3(80, 20, 50)
  const commander = {
    mesh: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
    laserTelegraphTimer: 0,
    dying: false,
  }
  commander.mesh.position.copy(oldPos)
  squadron.initSquadron(oldPos, new THREE.Vector3(0, 0, 1))

  const fighterPositionsBefore = squadron.getAlive().map((f) => f.mesh.position.clone())

  // Comandante teleporta
  commander.mesh.position.copy(newPos)
  squadron.onCommanderTeleported(oldPos, newPos)

  const fightersAfter = squadron.getAlive()
  for (let i = 0; i < fightersAfter.length; i++) {
    const f = fightersAfter[i]
    // A posição NÃO pode ter saltado para perto de newPos
    assert.ok(f.mesh.position.distanceTo(newPos) > 40.0, 'Caças não podem teleportar junto com o comandante')
    assert.equal(f.state, FIGHTER_STATE.DISORGANIZED, 'Caças devem entrar em estado DISORGANIZED')
  }

  // Com o tempo, caças viajam fisicamente até o novo comandante
  const ctx = makeMockCtx()
  for (let frame = 0; frame < 200; frame++) {
    squadron.update(0.05, commander, new THREE.Vector3(0, 0, 0), ctx)
  }

  for (const f of squadron.getAlive()) {
    assert.ok(f.mesh.position.distanceTo(newPos) < 25.0, 'Caças devem ter voado fisicamente até o novo comandante')
  }
})

// ============ 35.12 DOURADO SEM CAÇAS ============
test('35.12 Dourado sem caças: Comandante preserva todos os comportamentos com zero caças', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const goldenSys = createGoldenSystem(scene, rail, null, () => 1)

  goldenSys.spawn({ distanceMin: 30, distanceMax: 30, level: 1 })
  const commander = goldenSys.getAlive()[0]
  assert.ok(commander, 'Comandante deve existir')

  // Limpa todos os caças subordinados
  goldenSys.getSquadron().clear()
  assert.equal(goldenSys.getSquadron().getAlive().length, 0)

  const ctx = makeMockCtx()
  const playerPos = new THREE.Vector3(0, 0, 0)

  // Simula frames: chase, weaving, dash, tiro continuam operacionais
  const initialPos = commander.mesh.position.clone()
  for (let frame = 0; frame < 120; frame++) {
    goldenSys.update(1 / 60, playerPos, ctx)
  }

  assert.ok(commander.mesh.position.distanceTo(initialPos) > 0.5, 'Comandante continua perseguindo e manobrando sem caças')
  assert.equal(goldenSys.hasAlive(), true)
})

// ============ 35.13 MORTE DO COMANDANTE ============
test('35.13 Morte do Comandante: Limpeza limpa sem deixar entidades órfãs', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const goldenSys = createGoldenSystem(scene, rail, null, () => 1)

  goldenSys.spawn({ distanceMin: 30, distanceMax: 30, level: 5 }) // 4 caças
  assert.equal(goldenSys.getSquadron().getAlive().length, 4)

  const commander = goldenSys.getAlive()[0]
  const commanderPos = commander.mesh.position.clone()

  // Mata o comandante com tiro de dano alto
  const hit = goldenSys.resolveHit(
    commanderPos.clone().add(new THREE.Vector3(0, 0, -1)),
    commanderPos.clone().add(new THREE.Vector3(0, 0, 1)),
    9999, false, 2.0, null
  )

  assert.ok(hit)
  assert.equal(hit.goldenSpecialHit, true, 'Morte do comandante deve marcar goldenSpecialHit')

  const ctx = makeMockCtx()
  // Atualiza tempo de morte
  for (let i = 0; i < 30; i++) {
    goldenSys.update(0.05, new THREE.Vector3(0, 0, 0), ctx)
  }

  assert.equal(goldenSys.hasAlive(), false, 'Não deve haver comandante vivo')
  assert.equal(goldenSys.getSquadron().getAlive().length, 0, 'Não devem restar caças subordinados órfãos após morte do comandante')

  goldenSys.dispose()
})
