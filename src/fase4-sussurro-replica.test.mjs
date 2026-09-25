import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  SUSSURRO_KIND,
  SUSSURRO_STATES,
  SUSSURRO_HIT_RADIUS,
  OPACITY_CLOAKED,
  OPACITY_REVEALED,
  OPACITY_DENSE_FOG_MIN,
  TELEGRAPH_DURATION,
  spawnSussurro,
  updateSussurro,
  sussurroShouldSummon,
} from './enemies/sussurro.js'
import {
  REPLICA_KIND,
  REPLICA_BURST_COUNT,
  REPLICA_BURST_INTERVAL,
  REPLICA_TELEGRAPH_DURATION,
  REPLICA_COOLDOWN_MIN,
  REPLICA_COOLDOWN_MAX,
  REPLICA_HIT_RADIUS,
  spawnReplica,
  updateReplicaMovement,
} from './enemies/replica.js'

function makeMockFrame() {
  return {
    position: new THREE.Vector3(0, 0, 0),
    forward: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
    right: new THREE.Vector3(1, 0, 0),
  }
}

function makeMockRail() {
  const frame = makeMockFrame()
  const v0 = new THREE.Vector3(0, 0, 0)
  let latX = 0
  let latY = 0
  return {
    isArena: () => false,
    getSpawnFrame: () => frame,
    getFrameAt: () => frame,
    getPlayerPosition: () => v0,
    getPlayerLateral: () => ({ x: latX, y: latY }),
    setPlayerLateral: (x, y) => { latX = x; latY = y },
    getPlayerVelocity: () => new THREE.Vector2(5, 0),
    getDistance: () => 0,
  }
}

// ============================================================================
// SUSSURRO: TESTES DA FASE 4
// ============================================================================

test('Fase 4 — Sussurro: Silhueta e visibilidade no cloak sem invisibilidade prática (>= 0.22 em dense fog, >= 0.38 normal)', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const sussurro = spawnSussurro(scene, rail, 1)

  assert.equal(sussurro.kind, SUSSURRO_KIND)
  assert.ok(sussurro.hitRadius >= 2.0, `Hit radius deve ser >= 2.0 (foi ${sussurro.hitRadius})`)
  assert.ok(sussurro.coreMesh, 'Deve possuir núcleo interno')
  assert.ok(sussurro.rimMesh, 'Deve possuir rim/halo de distorção')

  // Estado inicial é CLOAKED_APPROACH
  assert.equal(sussurro.state, SUSSURRO_STATES.CLOAKED_APPROACH)

  // Em espaço normal: opacidade inicial deve ser >= 0.38
  assert.ok(sussurro.hullMat.opacity >= OPACITY_CLOAKED, `Opacidade normal cloaked deve ser >= 0.38 (foi ${sussurro.hullMat.opacity})`)

  // Em dense fog: opacidade não cai para 0.05! Deve ser >= 0.22
  const ctx = { rail, effects: {}, playerPosition: new THREE.Vector3() }
  updateSussurro(sussurro, 0.05, ctx, true)
  assert.ok(sussurro.hullMat.opacity >= OPACITY_DENSE_FOG_MIN, `Opacidade em dense fog deve ser >= 0.22 (foi ${sussurro.hullMat.opacity})`)
})

test('Fase 4 — Sussurro: Ciclo FSM completo (CLOAKED_APPROACH -> REVEAL_TELEGRAPH -> ATTACK/SUMMON -> EVADE)', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const sussurro = spawnSussurro(scene, rail, 1)
  sussurro.depth = 65 // em alcance
  sussurro.approachDuration = 0.5 // acelera aproximação para o teste

  const shotsFired = []
  const telegraphs = []
  const ctx = {
    rail,
    effects: {
      telegraph: (pos, col) => telegraphs.push({ pos: pos.clone(), col }),
      shockwave: () => {},
    },
    playerPosition: new THREE.Vector3(0, 0, 0),
    fireEnemyProjectile: (enemy, target) => shotsFired.push({ enemy, target: target.clone() }),
  }

  // 1. Avança em CLOAKED_APPROACH
  for (let i = 0; i < 15; i++) updateSussurro(sussurro, 0.04, ctx)
  assert.equal(sussurro.state, SUSSURRO_STATES.REVEAL_TELEGRAPH, 'Deve transicionar para REVEAL_TELEGRAPH')
  assert.ok(telegraphs.length >= 1, 'Deve disparar telegraph visual no início do reveal')

  // 2. Transição após ~0.7s de telegraph para SUMMON (cooldown inicial pronto)
  sussurro.summonCooldown = 0
  for (let i = 0; i < 20; i++) updateSussurro(sussurro, 0.04, ctx) // 0.8s
  assert.ok(sussurroShouldSummon(sussurro), 'Deve sinalizar que summon está devido')
  assert.equal(sussurro.state, SUSSURRO_STATES.EVADE, 'Após summon deve entrar em EVADE')

  // 3. Evade por ~1.2s -> volta ao CLOAKED_APPROACH
  for (let i = 0; i < 35; i++) updateSussurro(sussurro, 0.04, ctx) // 1.4s
  assert.equal(sussurro.state, SUSSURRO_STATES.CLOAKED_APPROACH, 'Após evade deve retornar ao CLOAKED_APPROACH')

  // 4. Segundo ciclo: com summon em cooldown, deve executar ATTACK (rajada espectral de 2 tiros)
  sussurro.depth = 60
  sussurro.approachDuration = 0.1
  while (sussurro.state === SUSSURRO_STATES.CLOAKED_APPROACH) {
    updateSussurro(sussurro, 0.04, ctx)
  }
  assert.equal(sussurro.state, SUSSURRO_STATES.REVEAL_TELEGRAPH)

  // Completa telegraph e entra em ATTACK
  while (sussurro.state === SUSSURRO_STATES.REVEAL_TELEGRAPH) {
    updateSussurro(sussurro, 0.04, ctx)
  }
  assert.equal(sussurro.state, SUSSURRO_STATES.ATTACK, 'Com summon em cooldown, deve escolher ATTACK')
  assert.ok(shotsFired.length >= 1, 'Primeiro tiro sai de imediato no ATTACK')

  // Conclui rajada de 2 tiros e transiciona para EVADE
  while (sussurro.state === SUSSURRO_STATES.ATTACK) {
    updateSussurro(sussurro, 0.04, ctx)
  }
  assert.equal(shotsFired.length, 2, 'Deve ter disparado exatamente 2 projéteis espectrais')
  assert.equal(sussurro.state, SUSSURRO_STATES.EVADE, 'Após rajada deve entrar em EVADE')
})

// ============================================================================
// RÉPLICA: TESTES DA FASE 4
// ============================================================================

test('Fase 4 — Réplica: Visual de cópia corrompida (fuselagem, asas, motores, 2 canhões, ghost echo) e hitbox', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const replica = spawnReplica(scene, rail, 1)

  assert.equal(replica.kind, REPLICA_KIND)
  assert.ok(replica.hitRadius >= 2.0, `Hit radius da réplica deve ser >= 2.0 (foi ${replica.hitRadius})`)
  assert.ok(replica.echoGroup, 'Deve possuir casca de eco espectral duplicada')

  const children = replica.visualGroup.children
  assert.ok(children.length >= 5, 'Deve conter fuselagem, asas, motores e canhões')
})

test('Fase 4 — Réplica: Perseguição com atraso histórico (~0.4s) quando jogador muda de direção', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const frame = rail.getSpawnFrame()
  const replica = spawnReplica(scene, rail, 1)

  // Jogador no centro nos primeiros 0.5s
  rail.setPlayerLateral(0, 0)
  for (let i = 0; i < 15; i++) updateReplicaMovement(replica, 0.033, rail, frame)

  // Jogador dá guinada brusca para x = 8
  rail.setPlayerLateral(8, 0)

  // Logo após a guinada (apenas 0.1s depois), a Réplica NÃO deve estar em x=8
  // Ela deve continuar seguindo o histórico anterior de ~0.4s atrás!
  updateReplicaMovement(replica, 0.1, rail, frame)
  assert.ok(replica.mesh.position.x < 3.0, `Réplica deve ter atraso característico (estava em ${replica.mesh.position.x}, jogador foi para 8)`)

  // Após passar 0.45s da guinada, agora a Réplica alcança a posição do jogador
  for (let i = 0; i < 15; i++) updateReplicaMovement(replica, 0.033, rail, frame)
  assert.ok(replica.mesh.position.x > 6.0, `Réplica agora deve reproduzir a posição do histórico (está em ${replica.mesh.position.x})`)
})

test('Fase 4 — Réplica: Comportamento ofensivo (fire timer finito, telegraph ~0.35s, rajada de 3 tiros, mira preditiva)', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const frame = rail.getSpawnFrame()
  const replica = spawnReplica(scene, rail, 1)

  assert.ok(Number.isFinite(replica.fireTimer), 'Fire timer da réplica deve ser finito (nunca Infinity)')
  assert.ok(replica.fireTimer >= REPLICA_COOLDOWN_MIN, `Cooldown deve ser no mínimo ${REPLICA_COOLDOWN_MIN}s`)

  const shotsFired = []
  const telegraphs = []
  const playerPos = new THREE.Vector3(0, 0, 0)
  const ctx = {
    rail,
    frame,
    playerPosition: playerPos,
    effects: {
      telegraph: (pos, col) => telegraphs.push({ pos: pos.clone(), col }),
    },
    fireEnemyProjectile: (enemy, target) => shotsFired.push({ enemy, target: target.clone() }),
  }

  // Avança até a janela de telegraph (últimos 0.35s)
  replica.alongDistance = 45 // em alcance
  replica.fireTimer = 0.34
  updateReplicaMovement(replica, 0.02, rail, frame, ctx)
  assert.ok(telegraphs.length >= 1, 'Deve disparar telegraph ~0.35s antes do disparo')

  // Zera o timer para iniciar a rajada de 3 tiros
  replica.fireTimer = 0
  updateReplicaMovement(replica, 0.01, rail, frame, ctx)
  assert.equal(shotsFired.length, 1, 'Primeiro tiro da rajada deve sair de imediato')

  // Tiro 2 (após ~0.12s)
  updateReplicaMovement(replica, REPLICA_BURST_INTERVAL + 0.01, rail, frame, ctx)
  assert.equal(shotsFired.length, 2, 'Segundo tiro deve sair no intervalo estipulado')

  // Tiro 3 (após mais ~0.12s)
  updateReplicaMovement(replica, REPLICA_BURST_INTERVAL + 0.01, rail, frame, ctx)
  assert.equal(shotsFired.length, 3, 'Terceiro tiro conclui a rajada de 3 tiros')

  // Verifica mira preditiva (jogador tem velocidade playerVel.x = 5)
  // O alvo do tiro deve estar adiantado na direção de movimento do jogador (x > 0)
  for (const shot of shotsFired) {
    assert.ok(shot.target.x > 1.0, `Mira deve ser preditiva à frente do movimento do jogador (target.x foi ${shot.target.x})`)
  }

  // Cooldown recarregado após a rajada
  assert.ok(replica.fireTimer >= REPLICA_COOLDOWN_MIN && replica.fireTimer <= REPLICA_COOLDOWN_MAX,
    `Cooldown após rajada deve estar entre [${REPLICA_COOLDOWN_MIN}, ${REPLICA_COOLDOWN_MAX}] (foi ${replica.fireTimer})`)
})
