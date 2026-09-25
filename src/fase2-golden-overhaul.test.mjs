import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  createGoldenSquadron,
  getSquadronCapForLevel,
  getOffensiveCapForLevel,
  FORMATION_SLOTS,
  GOLDEN_FIGHTER_KIND,
  GOLDEN_FIGHTER_HIT_RADIUS,
  GOLDEN_FIGHTER_KILL_POINTS,
  FIGHTER_STATE,
  SQUADRON_ORDER,
} from './enemies/golden-squadron.js'
import {
  createGoldenSystem,
  GOLDEN_KIND,
  GOLDEN_BEAM_HIT_RADIUS,
  GOLDEN_BEAM_DURATION_S,
} from './enemies/golden.js'
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
  return {
    firedProjectiles,
    fireEnemyProjectile: (opts, targetPos) => {
      firedProjectiles.push({ opts, targetPos: targetPos?.clone() })
    },
  }
}

// ============ TESTE 1: MATRIZ DE DIFICULDADE (1, 5, 9) X ALIADOS (0, 2, 4) ============
test('Fase 2 — Matriz de Caças e Limite Ofensivo por Nível e Aliados', () => {
  const matrix = [
    // [level, allies, expectedFighters, expectedOffensiveCap]
    [1, 0, 2, 1],
    [1, 2, 4, 2],
    [1, 4, 6, 3],
    [5, 0, 4, 2],
    [5, 2, 6, 3],
    [5, 4, 8, 4],
    [9, 0, 6, 3],
    [9, 2, 8, 4],
    [9, 4, 10, 5],
  ]

  for (const [lvl, allies, expFighters, expOffensive] of matrix) {
    const cap = getSquadronCapForLevel(lvl, allies)
    const offCap = getOffensiveCapForLevel(lvl, allies)
    assert.equal(cap, expFighters, `Nível ${lvl} com ${allies} aliados deve ter ${expFighters} caças (teve ${cap})`)
    assert.equal(offCap, expOffensive, `Nível ${lvl} com ${allies} aliados deve ter offensiveCap ${expOffensive} (teve ${offCap})`)

    // Testa no esquadrão real instanciado
    const scene = new THREE.Scene()
    let nextId = 1
    const squad = createGoldenSquadron(scene, null, () => nextId++, lvl, { allyBonus: allies })
    squad.initSquadron(new THREE.Vector3(0, 0, -50), new THREE.Vector3(0, 0, 1), { allyBonus: allies })
    assert.equal(squad.getAlive().length, expFighters, `initSquadron deve instanciar ${expFighters} caças`)
  }

  // Cap técnico máximo rigoroso: 10
  assert.equal(getSquadronCapForLevel(9, 10), 10, 'Cap nunca pode exceder 10 mesmo com aliados fictícios')
})

// ============ TESTE 2: SLOTS ÚNICOS E SEM SOBREPOSIÇÃO ============
test('Fase 2 — 10 Slots de formação distintos e legíveis', () => {
  assert.equal(FORMATION_SLOTS.length, 10, 'Devem existir exatamente 10 slots definidos')
  for (let i = 0; i < FORMATION_SLOTS.length; i++) {
    for (let j = i + 1; j < FORMATION_SLOTS.length; j++) {
      const dist = FORMATION_SLOTS[i].offset.distanceTo(FORMATION_SLOTS[j].offset)
      assert.ok(dist >= 5.0, `Slots ${i} e ${j} devem estar espacialmente separados (distância: ${dist})`)
    }
  }
})

// ============ TESTE 3: TODAS AS ORDENS E RESILIÊNCIA A MORTES ============
test('Fase 2 — Ordens táticas e resiliência a mortes durante execução', () => {
  const scene = new THREE.Scene()
  let nextId = 1
  const squad = createGoldenSquadron(scene, null, () => nextId++, 9, { allyBonus: 4 }) // 10 caças
  const cmdPos = new THREE.Vector3(0, 0, -40)
  squad.initSquadron(cmdPos, new THREE.Vector3(0, 0, 1), { allyBonus: 4 })

  const commander = {
    mesh: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
    laserTelegraphTimer: 0,
    laserFiring: false,
    dying: false,
  }
  commander.mesh.position.copy(cmdPos)
  const ctx = makeMockCtx()
  const playerPos = new THREE.Vector3(0, 0, 0)

  // 1. Strafing Run
  const okStrafe = squad.startOrder(SQUADRON_ORDER.STRAFING_RUN, cmdPos, playerPos)
  assert.ok(okStrafe, 'Deve iniciar Strafing Run')
  assert.equal(squad.getCurrentOrder(), SQUADRON_ORDER.STRAFING_RUN)
  // Mata um participante durante a corrida
  const strafeFighters = squad.getAlive().filter((f) => f.currentOrder === SQUADRON_ORDER.STRAFING_RUN)
  assert.ok(strafeFighters.length > 0)
  squad.killFighter(strafeFighters[0])
  // Avança frames
  for (let i = 0; i < 60; i++) squad.update(0.016, commander, playerPos, ctx)
  assert.ok(!strafeFighters[0].dying || strafeFighters[0].deathT >= 0)

  // 2. Coordinated Fire
  squad.clear()
  squad.initSquadron(cmdPos, new THREE.Vector3(0, 0, 1), { allyBonus: 4 })
  const okCoord = squad.startOrder(SQUADRON_ORDER.COORDINATED_FIRE, cmdPos, playerPos)
  assert.ok(okCoord, 'Deve iniciar Coordinated Fire')
  const coordFighters = squad.getAlive().filter((f) => f.currentOrder === SQUADRON_ORDER.COORDINATED_FIRE)
  if (coordFighters.length > 0) squad.killFighter(coordFighters[0])
  for (let i = 0; i < 100; i++) squad.update(0.016, commander, playerPos, ctx)
  assert.equal(squad.getCurrentOrder(), SQUADRON_ORDER.NONE, 'Coordinated Fire deve concluir em NONE')
})

// ============ TESTE 4: TELEPORTE DURANTE REGROUP NÃO TELEPORTA CAÇAS ============
test('Fase 2 — Teleporte do Comandante: caças viajam fisicamente', () => {
  const scene = new THREE.Scene()
  let nextId = 1
  const squad = createGoldenSquadron(scene, null, () => nextId++, 5, { allyBonus: 2 })
  const oldPos = new THREE.Vector3(0, 0, -40)
  const newPos = new THREE.Vector3(50, 20, -100)
  squad.initSquadron(oldPos, new THREE.Vector3(0, 0, 1))

  const initialPositions = squad.getAlive().map((f) => f.mesh.position.clone())
  squad.onCommanderTeleported(oldPos, newPos)

  const postTeleportPositions = squad.getAlive().map((f) => f.mesh.position.clone())
  for (let i = 0; i < initialPositions.length; i++) {
    const dist = initialPositions[i].distanceTo(postTeleportPositions[i])
    assert.ok(dist < 0.1, 'Caça NÃO pode teleportar junto com o comandante')
  }

  // Todos entram em DISORGANIZED
  for (const f of squad.getAlive()) {
    assert.equal(f.state, FIGHTER_STATE.DISORGANIZED)
  }
})

// ============ TESTE 5: LASER SUSTENTADO (SEM CONE VOADOR) E HIT TRACKING ============
test('Fase 2 — Mega Laser Sustentado do Dourado: telegraph, feixe e hit único', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  let nextId = 1
  const goldenSys = createGoldenSystem(scene, rail, null, () => nextId++)
  goldenSys.spawn({ distanceMin: 40, distanceMax: 40, level: 5, allyCount: 4 })

  const cmd = goldenSys.getAlive()[0]
  assert.ok(cmd, 'Comandante instanciado')

  // Força início do telegraph do laser
  cmd.laserCooldown = 0
  cmd.laserTelegraphTimer = 2.5
  cmd.laserTargetPos = new THREE.Vector3(0, 0, 0)

  const playerPos = new THREE.Vector3(0, 0, 0)
  const ctx = makeMockCtx()

  // 1. Durante os primeiros 2.0s de telegraph: sem dano, sem feixe principal
  for (let i = 0; i < 100; i++) {
    goldenSys.update(0.02, playerPos, ctx)
    const laserRes = goldenSys.updateLaser(0.02, playerPos, { shipHitboxPoints: [{ worldPos: playerPos, radius: 0.5 }] })
    assert.equal(laserRes.hits, 0, 'Telegraph não causa dano')
  }

  // 2. Nos últimos 0.35s do telegraph: feixe guia presente
  assert.ok(cmd.laserTelegraphTimer <= 0.5)

  // 3. Fim do telegraph: ativa feixe sustentado
  for (let i = 0; i < 30; i++) {
    goldenSys.update(0.02, playerPos, ctx)
  }
  assert.ok(cmd.laserFiring, 'Laser sustentado deve estar disparando após telegraph')
  assert.ok(cmd.laserBeamMesh, 'Grupo de malhas do laser sustentado deve existir na cena')

  // 4. Teste de dano sustentado: atinge o jogador uma única vez ao longo de todo o disparo
  let totalPlayerHits = 0
  for (let i = 0; i < 35; i++) {
    goldenSys.update(0.02, playerPos, ctx)
    const laserRes = goldenSys.updateLaser(0.02, playerPos, { shipHitboxPoints: [{ worldPos: playerPos, radius: 0.5 }] })
    if (laserRes.hits > 0) totalPlayerHits += laserRes.hits
  }
  assert.equal(totalPlayerHits, 1, 'Laser sustentado deve aplicar dano exatamente 1 vez por ciclo')

  // 5. Após 0.6s de disparo: feixe dissipa
  assert.equal(cmd.laserFiring, false, 'Laser deve finalizar após duração')
  assert.equal(cmd.laserBeamMesh, null, 'Malha do feixe deve ser limpa após dissipação')

  goldenSys.dispose()
})

// ============ TESTE 6: FUZZ DETERMINÍSTICO LONGO (1000 FRAMES) ============
test('Fase 2 — Fuzz determinístico longo (1000 frames) com 4 aliados', () => {
  function createPrng(seed = 4242) {
    let s = seed >>> 0
    return function () {
      s = (s + 0x6D2B79F5) | 0
      let t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const sys = createGoldenSystem(scene, rail, null, () => 1, { rng: createPrng(4242) })
  sys.spawn({ distanceMin: 40, distanceMax: 50, level: 9, allyCount: 4 })

  const ctx = makeMockCtx()
  const playerPos = new THREE.Vector3(0, 0, 0)

  for (let frame = 0; frame < 1000; frame++) {
    playerPos.x = Math.sin(frame * 0.04) * 12
    playerPos.y = Math.cos(frame * 0.03) * 8
    sys.update(0.016, playerPos, ctx)
    sys.updateLaser(0.016, playerPos, { shipHitboxPoints: [{ worldPos: playerPos, radius: 0.5 }] })

    // Valida integridade em todo frame
    for (const f of sys.getSquadron().getAlive()) {
      assert.ok(Number.isFinite(f.mesh.position.x))
      assert.ok(Number.isFinite(f.mesh.position.y))
      assert.ok(Number.isFinite(f.mesh.position.z))
    }
  }

  sys.dispose()
})
