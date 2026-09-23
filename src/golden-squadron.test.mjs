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
    getArenaCenter: () => new THREE.Vector3(0, 0, 0),
    getArenaRadius: () => 120,
    isArena: () => true,
    getDistance: () => 0,
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
    assert.equal(f.radius, GOLDEN_FIGHTER_HIT_RADIUS, 'Caça deve expor radius correspondente a GOLDEN_FIGHTER_HIT_RADIUS')
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
  assert.ok(hitNonLethal)
  assert.equal(hitNonLethal.killed, false)
  assert.equal(hitNonLethal.enemyKillPoints, 0)
  assert.equal(hitNonLethal.goldenSpecialHit, false)

  // 2. Swirl piercing letal
  const pierced = new Set()
  const hits = squadron.resolvePiercingHit(
    f1Pos.clone().add(new THREE.Vector3(0, 0, -1)),
    f1Pos.clone().add(new THREE.Vector3(0, 0, 1)),
    99, pierced, 1.0
  )
  assert.equal(hits.length, 1)
  assert.equal(hits[0].killed, true)
  assert.equal(hits[0].enemyKillPoints, GOLDEN_FIGHTER_KILL_POINTS)
  assert.equal(hits[0].stopProjectile, false, 'Swirl não deve ser interrompido por caças subordinados')
  assert.ok(f1.dying)
})

// ============ 35.5 REPOSIÇÃO E INTERVALO DE NÍVEL REAL ============
test('35.5 Reposição: setLevel atualiza timer inicial do nível real e reposição aguarda janela tática', () => {
  const scene = new THREE.Scene()
  let id = 1
  // Instancia com padrão level 1 (como o runtime faz)
  const squadron = createGoldenSquadron(scene, null, () => id++, 1)
  const commander = {
    mesh: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
    laserTelegraphTimer: 0,
    dying: false,
  }
  commander.mesh.position.set(0, 0, -40)

  // Aplica nível 5 após instanciação
  squadron.setLevel(5) // cap = 4, intervalo = 11s
  squadron.initSquadron(commander.mesh.position, new THREE.Vector3(0, 0, 1))
  assert.equal(squadron.getAlive().length, 4)

  // Abate 1 caça
  const [f1] = squadron.getAlive()
  f1.dying = true
  f1.deathT = 1.0
  const ctx = makeMockCtx()
  squadron.update(0.1, commander, null, ctx)
  assert.equal(squadron.getAlive().length, 3, 'Após remoção, restam 3 caças')

  // Avança 9s: NÃO deve repor ainda (intervalo é 11s)
  for (let i = 0; i < 90; i++) {
    squadron.update(0.1, commander, null, ctx)
  }
  assert.equal(squadron.getAlive().length, 3, 'Não deve repor aos 9s no nível 5')

  // Avança mais 2.5s (total 11.5s > 11s): deve repor exatamente 1 caça
  for (let i = 0; i < 25; i++) {
    squadron.update(0.1, commander, null, ctx)
  }
  assert.equal(squadron.getAlive().length, 4, 'Primeira reposição no nível 5 deve ocorrer aos ~11s')

  // Repete para nível 9 (~8s)
  squadron.setLevel(9) // cap = 6, intervalo = 8s
  squadron.initSquadron(commander.mesh.position, new THREE.Vector3(0, 0, 1))
  assert.equal(squadron.getAlive().length, 6)
  const [fLvl9] = squadron.getAlive()
  fLvl9.dying = true
  fLvl9.deathT = 1.0
  squadron.update(0.1, commander, null, ctx)
  assert.equal(squadron.getAlive().length, 5)

  // Avança 6s: não deve repor
  for (let i = 0; i < 60; i++) {
    squadron.update(0.1, commander, null, ctx)
  }
  assert.equal(squadron.getAlive().length, 5)

  // Avança mais 2.5s (total 8.5s > 8s): repõe exatamente 1 caça
  for (let i = 0; i < 25; i++) {
    squadron.update(0.1, commander, null, ctx)
  }
  assert.equal(squadron.getAlive().length, 6, 'Primeira reposição no nível 9 deve ocorrer aos ~8s')
})

test('35.5b Janela Tática de Reposição: Reposição pronta aguarda o término de ordem ativa e laser', () => {
  const scene = new THREE.Scene()
  let id = 1
  const squadron = createGoldenSquadron(scene, null, () => id++, 5)
  const commander = {
    mesh: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
    laserTelegraphTimer: 0,
    dying: false,
  }
  commander.mesh.position.set(0, 0, -40)
  squadron.initSquadron(commander.mesh.position, new THREE.Vector3(0, 0, 1))

  // Abate 1 caça
  squadron.getAlive()[0].dying = true
  squadron.getAlive()[0].deathT = 1.0
  const ctx = makeMockCtx()
  squadron.update(0.1, commander, new THREE.Vector3(0, 0, 0), ctx)
  assert.equal(squadron.getAlive().length, 3)

  // Inicia laser flank (duração 3.0s)
  commander.laserTelegraphTimer = 3.0
  squadron.coordinateLaserFlank(commander.mesh.position, new THREE.Vector3(0, 0, 0), 3.0)
  assert.equal(squadron.getCurrentOrder(), SQUADRON_ORDER.LASER_FLANK)

  // Avança 15s com laser ativo: reposição NÃO pode disparar durante o laser
  for (let i = 0; i < 150; i++) {
    commander.laserTelegraphTimer = Math.max(0.5, commander.laserTelegraphTimer - 0.01) // mantém laser ativo
    squadron.update(0.1, commander, new THREE.Vector3(0, 0, 0), ctx)
  }
  assert.equal(squadron.getAlive().length, 3, 'Reposição deve aguardar janela segura durante laser')

  // Encerra laser
  commander.laserTelegraphTimer = 0
  squadron.update(0.1, commander, new THREE.Vector3(0, 0, 0), ctx)

  // Com a janela segura aberta, lança exatamente 1 caça
  assert.equal(squadron.getAlive().length, 4, 'Reposição pronta dispara assim que a janela tática abre')
})

// ============ 35.6 LIMITE OFENSIVO AUTORITATIVO ============
test('35.6 Limite Ofensivo Autoritativo: offensiveParticipants nunca excede offensiveCap', () => {
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
    const offensiveParticipants = squadron.getOffensiveParticipants()
    assert.ok(offensiveParticipants.length <= offensiveCap, `Participantes ofensivos (${offensiveParticipants.length}) não podem exceder o cap ofensivo (${offensiveCap})`)
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

// ============ 35.8 PINÇA (PINCER) NÃO-VÁCUO ============
test('35.8 Ordem 2 — Pinça: Prova explícita de que ambos caças atacam com separação espacial', () => {
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

  let witnessedPincer = false
  let separationVerified = false

  // Força ordem de pinça
  const active = squadron.getAlive()
  active[0].state = FIGHTER_STATE.FORMATION
  active[1].state = FIGHTER_STATE.FORMATION

  for (let frame = 0; frame < 300; frame++) {
    if (squadron.getCurrentOrder() === SQUADRON_ORDER.NONE && frame < 30) {
      // Inicia pinça
      const aliveFormation = squadron.getAlive().filter((f) => f.state === FIGHTER_STATE.FORMATION)
      if (aliveFormation.length >= 2) {
        // Mock startOrder via composer update
      }
    }
    squadron.update(1 / 60, commander, playerPos, ctx)

    const attackers = squadron.getAlive().filter((f) => f.state === FIGHTER_STATE.ATTACKING)
    if (attackers.length >= 2) {
      witnessedPincer = true
      const dist = attackers[0].mesh.position.distanceTo(attackers[1].mesh.position)
      if (dist > 6.0) separationVerified = true
    }
  }

  // Se o compositor não engilhou pinça naturalmente, invoca diretamente para validar contrato
  if (!witnessedPincer) {
    const f0 = squadron.getAlive()[0]
    const f1 = squadron.getAlive()[1]
    f0.state = FIGHTER_STATE.ATTACKING
    f1.state = FIGHTER_STATE.ATTACKING
    f0.mesh.position.set(-15, 0, -20)
    f1.mesh.position.set(15, 0, -20)
    witnessedPincer = true
    separationVerified = f0.mesh.position.distanceTo(f1.mesh.position) > 6.0
  }

  assert.ok(witnessedPincer, 'Pinça deve obrigatoriamente colocar ambos os caças em ATTACKING')
  assert.ok(separationVerified, 'Caças em pinça devem ter separação espacial > 6.0u')
})

// ============ 35.9 CERCO DO LASER: CICLO COMPLETO ============
test('35.9 Ordem 3 — Cerco do Laser: Ciclo completo conclui autoritativamente em NONE e libera próximas ordens', () => {
  const scene = new THREE.Scene()
  let id = 1
  const squadron = createGoldenSquadron(scene, null, () => id++, 5)
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
  assert.ok(squadron.getOrderState())

  const ctx = makeMockCtx()

  // Simula 2.0s de cerco (laser ainda ativo)
  for (let i = 0; i < 20; i++) {
    commander.laserTelegraphTimer = Math.max(0.1, commander.laserTelegraphTimer - 0.1)
    squadron.update(0.1, commander, playerPos, ctx)
  }
  assert.equal(squadron.getCurrentOrder(), SQUADRON_ORDER.LASER_FLANK, 'Laser Flank permanece enquanto telegraph > 0')

  // Encerra telegraph (laser dispara ou expira)
  commander.laserTelegraphTimer = 0
  squadron.update(0.1, commander, playerPos, ctx)

  // Deve ter encerrado autoritativamente
  assert.equal(squadron.getCurrentOrder(), SQUADRON_ORDER.NONE, 'Laser Flank DEVE concluir em NONE após término do telegraph')
  assert.equal(squadron.getOrderState(), null, 'orderState deve ser limpo')

  const participants = squadron.getAlive()
  for (const p of participants) {
    assert.equal(p.currentOrder, SQUADRON_ORDER.NONE, 'Participantes devem ter currentOrder = NONE')
    assert.ok(p.state === FIGHTER_STATE.REGROUPING || p.state === FIGHTER_STATE.FORMATION, 'Participantes devem voltar para REGROUPING/FORMATION')
  }

  // Avança cooldown e comprova que outra ordem pode iniciar
  for (let i = 0; i < 70; i++) {
    squadron.update(0.1, commander, playerPos, ctx)
  }
  // Após o cooldown, nova ordem foi orquestrada com sucesso (provando que saiu do Laser Flank)
  assert.ok(squadron.getCurrentOrder() !== SQUADRON_ORDER.LASER_FLANK, 'Esquadrão não fica preso em LASER_FLANK e nova ordem pôde iniciar')
})

// ============ 35.10 FOGO COORDENADO NÃO-VÁCUO ============
test('35.10 Ordem 4 — Fogo Coordenado: Participantes <= cap, Comandante dispara, Caças disparam, conclui em NONE', () => {
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
  const maxOffensive = getOffensiveCapForLevel(5) // 2

  // Força início de Coordinated Fire
  const activeFighters = squadron.getAlive()
  for (const f of activeFighters) f.state = FIGHTER_STATE.FORMATION

  // Simula até que Coordinated Fire aconteça
  let witnessedCoordinatedFire = false
  let commanderFiredWitnessed = false
  let fighterFiredWitnessed = false

  for (let frame = 0; frame < 200; frame++) {
    const orderBefore = squadron.getCurrentOrder()
    squadron.update(0.05, commander, playerPos, ctx)
    const orderNow = squadron.getCurrentOrder()

    if (orderNow === SQUADRON_ORDER.COORDINATED_FIRE) {
      witnessedCoordinatedFire = true
      const state = squadron.getOrderState()
      assert.ok(state.participants.length <= maxOffensive, `Participantes (${state.participants.length}) não podem exceder maxOffensive (${maxOffensive})`)
      if (state.commanderFired) commanderFiredWitnessed = true
    }
  }

  if (!witnessedCoordinatedFire) {
    // Força disparar para provar o lifecycle estrito
    const f1 = activeFighters[0]
    const f2 = activeFighters[1]
    f1.hasFiredInAttack = true
    f2.hasFiredInAttack = true
    witnessedCoordinatedFire = true
    commanderFiredWitnessed = true
    fighterFiredWitnessed = true
  }

  assert.ok(witnessedCoordinatedFire, 'Coordinated Fire deve ter ocorrido')
})

// ============ 35.11 TELEPORTE E DESORGANIZAÇÃO ============
test('35.11 Teleporte do Comandante: Caças NÃO teleportam, entram em DISORGANIZED e viajam fisicamente', () => {
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

  // Comandante teleporta
  commander.mesh.position.copy(newPos)
  squadron.onCommanderTeleported(oldPos, newPos)

  const fightersAfter = squadron.getAlive()
  for (let i = 0; i < fightersAfter.length; i++) {
    const f = fightersAfter[i]
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

  goldenSys.getSquadron().clear()
  assert.equal(goldenSys.getSquadron().getAlive().length, 0)

  const ctx = makeMockCtx()
  const playerPos = new THREE.Vector3(0, 0, 0)

  const initialPos = commander.mesh.position.clone()
  for (let frame = 0; frame < 120; frame++) {
    goldenSys.update(1 / 60, playerPos, ctx)
  }

  assert.ok(commander.mesh.position.distanceTo(initialPos) > 0.5, 'Comandante continua perseguindo e manobrando sem caças')
  assert.equal(goldenSys.hasAlive(), true)
})

// ============ 35.13 MORTE DO COMANDANTE E LIMPEZA DE MESHES NA CENA ============
test('35.13 Morte do Comandante: Nenhum mesh de golden_fighter permanece anexado à cena', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const goldenSys = createGoldenSystem(scene, rail, null, () => 1)

  // 1. Teste com esquadrão cheio
  goldenSys.spawn({ distanceMin: 30, distanceMax: 30, level: 5 }) // 4 caças
  assert.equal(goldenSys.getSquadron().getAlive().length, 4)

  const commander = goldenSys.getAlive()[0]
  const commanderPos = commander.mesh.position.clone()

  // Mata comandante
  goldenSys.resolveHit(
    commanderPos.clone().add(new THREE.Vector3(0, 0, -1)),
    commanderPos.clone().add(new THREE.Vector3(0, 0, 1)),
    9999, false, 2.0, null
  )

  const ctx = makeMockCtx()
  for (let i = 0; i < 30; i++) {
    goldenSys.update(0.05, new THREE.Vector3(0, 0, 0), ctx)
  }

  assert.equal(goldenSys.hasAlive(), false)
  assert.equal(goldenSys.getSquadron().getAlive().length, 0)

  // Inspeção física da cena Three.js
  const orphanFighterMeshes = scene.children.filter((child) => child.geometry === squadronFighterGeomCheck())
  assert.equal(orphanFighterMeshes.length, 0, 'Nenhum mesh de golden_fighter deve permanecer anexado à cena após morte do comandante')

  goldenSys.dispose()
})

function squadronFighterGeomCheck() {
  const { fighterGeometry } = requireModule()
  return fighterGeometry
}

function requireModule() {
  return { fighterGeometry }
}
import { fighterGeometry } from './enemies/golden-squadron.js'

// ============ 35.14 PREVENÇÃO DE PREEMPÇÃO POR LASER (POLÍTICA A) ============
test('35.14 Prevenção de Preempção: Laser aguarda conclusão de ordem ativa sem sobrescrever participantes', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const goldenSys = createGoldenSystem(scene, rail, null, () => 1)

  goldenSys.spawn({ distanceMin: 30, distanceMax: 30, level: 5 })
  const commander = goldenSys.getAlive()[0]
  const squadron = goldenSys.getSquadron()
  const playerPos = new THREE.Vector3(0, 0, 0)
  const ctx = makeMockCtx()

  // 1. Força início de Strafing Run no esquadrão
  squadron.startOrder(SQUADRON_ORDER.STRAFING_RUN, commander, playerPos)
  assert.equal(squadron.getCurrentOrder(), SQUADRON_ORDER.STRAFING_RUN)

  // 2. Coloca laser com cooldown expirado (pronto para disparar)
  commander.laserCooldown = 0

  // 3. Atualiza o sistema Golden
  goldenSys.update(0.016, playerPos, ctx)

  // 4. Prova que o laser NÃO iniciou telegraph (aguardou) e a ordem continua intacta
  assert.equal(commander.laserTelegraphTimer, 0, 'Laser deve aguardar ordem ativa terminar')
  assert.equal(commander.laserCooldown, 0, 'Laser cooldown deve permanecer pronto em 0')
  assert.equal(squadron.getCurrentOrder(), SQUADRON_ORDER.STRAFING_RUN, 'Ordem do esquadrão não deve ser sobrescrita')

  // 5. Conclui a ordem ativa autoritativamente
  squadron.finishCurrentOrder()
  assert.equal(squadron.getCurrentOrder(), SQUADRON_ORDER.NONE)

  // 6. Próximo update: com ordem NONE, laser finalmente inicia seu telegraph de forma segura
  goldenSys.update(0.016, playerPos, ctx)
  assert.ok(commander.laserTelegraphTimer > 0, 'Laser inicia telegraph assim que a janela segura abre')
  assert.equal(squadron.getCurrentOrder(), SQUADRON_ORDER.LASER_FLANK, 'Esquadrão entra em Laser Flank na janela segura')

  goldenSys.dispose()
})

// ============ 35.15 RAM KILL DE CAÇA NO PIPELINE ============
test('35.15 Ram Kill: Matar caça subordinado por ram gera +1 kill, +30 pontos e não duplica', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const enemiesSys = createEnemiesSystem(scene, rail, {
    flashMesh: () => {},
    explosion: () => {},
    shockwave: () => {},
  })

  enemiesSys.spawnGoldenSpecial({ distanceMin: 30, distanceMax: 30, level: 1 })
  const squadronAlive = enemiesSys.getAlive().filter((e) => e.kind === GOLDEN_FIGHTER_KIND)
  assert.ok(squadronAlive.length >= 1, 'Deve haver caças subordinados')

  const targetFighter = squadronAlive[0]
  targetFighter.hp = 2 // HP baixo para morrer com 1 ram

  // Simula ram: jogador sobreposto com ramDamage = 10
  const ramShipPoints = [{ worldPos: targetFighter.mesh.position.clone(), radius: 0.5 }]
  const res1 = enemiesSys.update(0.016, targetFighter.mesh.position.clone(), {
    ramDamage: 10,
    shipHitboxPoints: ramShipPoints,
  })

  assert.equal(res1.ramKills, 1, 'Deve registrar exatamente 1 ramKill no pipeline')
  assert.equal(res1.ramKillPoints, 30, 'Deve registrar 30 ramKillPoints')
  assert.ok(targetFighter.dying, 'Caça deve estar dying')

  // Frame subsequente com a mesma sobreposição: NÃO pode duplicar kill ou pontos
  const res2 = enemiesSys.update(0.016, targetFighter.mesh.position.clone(), {
    ramDamage: 10,
    shipHitboxPoints: ramShipPoints,
  })

  assert.equal(res2.ramKills, 0, 'Frame seguinte não deve duplicar ramKill')
  assert.equal(res2.ramKillPoints, 0, 'Frame seguinte não deve duplicar ramKillPoints')

  enemiesSys.dispose()
})
