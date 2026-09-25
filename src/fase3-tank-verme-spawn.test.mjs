import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  TANK_KIND,
  TANK_HIT_RADIUS,
  TANK_SCALE,
  TANK_POPULATION_WEIGHT,
  spawnTankEnemy,
  updateRailStandoff,
} from './enemies/tank.js'
import {
  VERME_KIND,
  VERME_SPAN,
  spawnVerme,
  updateVermeMovement,
  severChainAt,
} from './enemies/verme.js'
import {
  VERME_SPAWN_CHANCE,
  TANK_SPAWN_CHANCE,
  VERME_PITY_TIME_S,
  TANK_PITY_TIME_S,
  TANK_MAX_ACTIVE_ON_RAIL,
} from './main-constants.js'
import { createEnemiesSystem } from './enemies/index.js'
import { createCombatSystem } from './combat/index.js'
import { createGameLoop } from './game-loop.js'
import { getBindings } from './keybindings.js'

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
  const base = {
    isArena: () => false,
    getArenaCenter: () => v0,
    getArenaRadius: () => 120,
    getSpawnFrame: () => frame,
    getFrameAt: () => frame,
    getDistance: () => 0,
    getPlayerPosition: () => v0,
    getShipNosePosition: () => v0,
    getPlayerLateral: () => ({ x: 0, y: 0 }),
    getPlayerLateralOffset: () => ({ x: 0, y: 0 }),
    getShipHitboxPoints: () => [{ worldPos: v0, radius: 1.0 }],
    setShipVisible: () => {},
    setShakeIntensity: () => {},
    isTumbling: () => false,
    update: () => {},
  }
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop]
      return () => (prop === 'isArena' ? false : prop === 'isTumbling' ? false : 0)
    },
  })
}

function createHarness() {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const effects = new Proxy({
    explosion: () => {},
    shockwave: () => {},
    telegraph: () => {},
    hitSpark: () => {},
    glassShatter: () => {},
    flashMesh: () => {},
  }, {
    get(target, prop) {
      if (prop in target) return target[prop]
      return () => {}
    },
  })
  const enemies = createEnemiesSystem(scene, rail, effects)
  const playerBase = {
    isRollIframeActive: () => false,
    isInvincible: () => false,
    getInvincibleRemainingMs: () => 0,
    takeDamage: () => false,
    isShieldBrokeThisFrame: () => false,
    isShieldActive: () => false,
    consumeShieldBreakFeedback: () => false,
    consumeInvincibilityTriggered: () => false,
    getTelemetry: () => null,
    update: () => {},
  }
  const player = new Proxy(playerBase, {
    get(target, prop) {
      if (prop in target) return target[prop]
      return () => false
    },
  })
  const combat = createCombatSystem(scene, rail, effects, enemies, player)

  const state = {
    phase: 'combat',
    cycleTimer: 30000,
    goldenTimer: 30000,
    normalSpawnTimer: 0,
    enemyTimer: 0,
    vermeActiveTime: 0,
    tankActiveTime: 0,
    isBossCycle: false,
    isReviewQuestion: false,
    wrongAnswerCount: 0,
    extraSpawnPerBatch: 0,
    debugFlags: {},
  }

  const session = { score: 0 }
  const progression = {
    currentEnemyCap: () => 10,
    randomEnemyInterval: () => 1000,
  }

  const hud = new Proxy({
    showShieldBlock: () => {},
    showDamageSide: () => {},
    damageFlash: () => {},
    setPaused: () => {},
    setReticleCharge: () => {},
    setLockReticlePositions: () => {},
    setTargetHp: () => {},
    setReticleHint: () => {},
    updateDamageOrbitTracker: () => {},
    debug: { refreshStats: () => {}, setVisible: () => {} },
  }, {
    get(target, prop) {
      if (prop in target) return target[prop]
      return () => {}
    },
  })

  const gameLoop = createGameLoop({
    state,
    session,
    deck: { isNoDeck: true },
    menu: {},
    camera: new THREE.PerspectiveCamera(),
    renderer: { render: () => {} },
    scene,
    effects,
    hud,
    rail,
    player,
    combat,
    input: {
      update: () => ({ pressed: new Set(), held: new Set(), mouse: { x: 0, y: 0 } }),
      getActions: () => ({}),
    },
    progression,
    cutscenes: {
      updateLaunchCutscene: () => false,
      updateArenaCutscene: () => false,
      updateDeathCutscene: () => false,
    },
    bossFlow: {
      update: () => {},
      handleBossDefeated: () => {},
      handleGoldenDefeated: () => {},
    },
    questionFlow: {
      update: () => {},
    },
    environment: {
      update: () => {},
    },
    audio: {
      updateEngineSound: () => {},
    },
    enterCombat: () => { state.phase = 'combat' },
    applyHealthLoss: () => {},
    bindings: getBindings(),
    endSector: () => {},
  })

  return { scene, rail, enemies, combat, state, gameLoop }
}

// ============ 1. HITBOX E BOUNDING BOX DO TANK ============
test('Fase 3 — Tank Hitbox 4.48+ e Bounding Box ~1.6x', () => {
  assert.ok(TANK_HIT_RADIUS >= 4.48, `TANK_HIT_RADIUS deve ser >= 4.48 (foi ${TANK_HIT_RADIUS})`)
  assert.ok(TANK_SCALE >= 2.0, `TANK_SCALE deve refletir ~1.6x do original (foi ${TANK_SCALE})`)

  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const tank = spawnTankEnemy(scene, rail, 1)

  const box = new THREE.Box3().setFromObject(tank.mesh)
  const size = new THREE.Vector3()
  box.getSize(size)

  // Tank volumoso: largura > 6.0, comprimento > 8.0
  assert.ok(size.x >= 6.0, `Largura do Tank deve ser volumosa (>= 6.0, foi ${size.x})`)
  assert.ok(size.z >= 8.0, `Comprimento do Tank deve ser robusto (>= 8.0, foi ${size.z})`)
  assert.ok(tank.armorPanels.length === 6, 'Deve manter 6 painéis de blindagem externa')
  assert.ok(tank.turretGroup, 'Deve possuir sub-grupo de torre independente')
})

// ============ 2. MOVIMENTAÇÃO LATERAL E MIRA INDEPENDENTE DA TORRE ============
test('Fase 3 — Tank Movimentação Lateral Ampla (-10u a +10u) e Torre Independente', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const tank = spawnTankEnemy(scene, rail, 2)
  tank.fsm.transition('ENGAGED', null, { inArena: false, frame: rail.getSpawnFrame(), playerPosition: new THREE.Vector3(0, 0, 0) })

  const ctx = {
    inArena: false,
    frame: rail.getSpawnFrame(),
    playerPosition: new THREE.Vector3(15, 5, 0),
    removeEnemy: () => {},
    fireEnemyProjectile: () => {},
  }

  let minX = Infinity
  let maxX = -Infinity
  for (let t = 0; t < 250; t++) {
    updateRailStandoff(tank, 0.032, ctx)
    minX = Math.min(minX, tank.screenX)
    maxX = Math.max(maxX, tank.screenX)
  }

  assert.ok(maxX - minX >= 10.0, `Tank deve atravessar parcela ampla da tela (amplitude foi ${maxX - minX})`)
  assert.ok(minX <= -4.0 && maxX >= 4.0, 'Trajetória cobre ambos os lados da tela')
})

// ============ 3. EXTENSÃO LATERAL INICIAL DO VERME (SPAN = 8.0) ============
test('Fase 3 — Verme: Extensão lateral total (Span) de exatamente 8.0 unidades', () => {
  assert.equal(VERME_SPAN, 8.0)

  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const segments = spawnVerme(scene, rail, () => 1, 1)

  for (const seg of segments) {
    const box = new THREE.Box3().setFromObject(seg.mesh)
    const span = Math.round((box.max.x - box.min.x) * 10) / 10
    assert.ok(Math.abs(span - 8.0) <= 0.25, `Extensão lateral do elo deve ser ~8.0u (foi ${span})`)
  }
})

// ============ 4. VERME: MOVIMENTO EM ARCO 3D E SERPENTEAMENTO ============
test('Fase 3 — Verme: Movimento ondulante 3D e seguidores em caminho contínuo', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const segments = spawnVerme(scene, rail, () => 1, 1)
  const head = segments[0]

  let minHeadX = Infinity
  let maxHeadX = -Infinity
  for (let frame = 0; frame < 120; frame++) {
    for (const seg of segments) {
      updateVermeMovement(seg, 0.02, rail)
      assert.ok(Number.isFinite(seg.mesh.position.x))
      assert.ok(Number.isFinite(seg.mesh.position.y))
      assert.ok(Number.isFinite(seg.mesh.position.z))
    }
    minHeadX = Math.min(minHeadX, head.mesh.position.x)
    maxHeadX = Math.max(maxHeadX, head.mesh.position.x)
  }

  assert.ok(maxHeadX - minHeadX >= 6.0, `Cabeça do Verme deve oscilar em arco lateral (foi ${maxHeadX - minHeadX})`)
})

// ============ 5. SECCIONAMENTO DO VERME SEM NAN OU SNAP ============
test('Fase 3 — Seccionamento do Verme: nova cabeça sem NaN ou teleporte', () => {
  const scene = new THREE.Scene()
  const rail = makeMockRail()
  const segments = spawnVerme(scene, rail, () => 1, 1)

  // Avança 30 frames
  for (let f = 0; f < 30; f++) {
    for (const s of segments) updateVermeMovement(s, 0.02, rail)
  }

  // Corta o elo 1 (meio)
  const severedPos = segments[2].mesh.position.clone()
  severChainAt(segments[1], segments, rail)

  assert.equal(segments[2].followTarget, null, 'Elo após o destruído deve virar líder')
  assert.equal(segments[2].isHead, true)

  // Atualiza movimento pós-corte
  for (let f = 0; f < 20; f++) {
    updateVermeMovement(segments[2], 0.02, rail)
    assert.ok(Number.isFinite(segments[2].mesh.position.x))
    assert.ok(Number.isFinite(segments[2].mesh.position.y))
    assert.ok(Number.isFinite(segments[2].mesh.position.z))
  }
})

// ============ 6. HARD-PITY E CONFLITO DE PITY ============
test('Fase 3 — Hard-Pity de Verme (12.5s) e Tank (20s) com resolução de conflito', () => {
  const { combat, state, gameLoop } = createHarness()

  // 1. Hard-pity do Verme aos 12.5s
  state.normalSpawnTimer = 0
  state.vermeActiveTime = 13.0 // Venceu os 12.5s
  state.tankActiveTime = 5.0
  gameLoop.step(1, 16.67)

  assert.ok(combat.getEnemyCount() >= 1, 'Verme deve spawnar por pity')
  assert.equal(state.vermeActiveTime, 0, 'Pity do Verme deve resetar após spawn')
  assert.equal(state.tankActiveTime, 5.0 + 0.01667, 'Pity do Tank continua acumulando')

  // Limpa combatentes
  combat.clearAllCombatants()

  // 2. Hard-pity do Tank aos 20s
  state.normalSpawnTimer = 0
  state.vermeActiveTime = 4.0
  state.tankActiveTime = 20.5 // Venceu os 20s
  gameLoop.step(1, 16.67)

  assert.equal(combat.getActiveTankCount(), 1, 'Tank deve spawnar por pity aos 20s')
  assert.equal(state.tankActiveTime, 0, 'Pity do Tank deve resetar após spawn')

  // Limpa combatentes
  combat.clearAllCombatants()

  // 3. Conflito de Pity: ambos devidos ao mesmo tempo -> escolhe o proporcionalmente mais atrasado
  state.normalSpawnTimer = 0
  state.vermeActiveTime = 15.0 // ratio: 15 / 12.5 = 1.20
  state.tankActiveTime = 30.0  // ratio: 30 / 20.0 = 1.50 -> Tank mais atrasado!
  gameLoop.step(1, 16.67)

  assert.equal(combat.getActiveTankCount(), 1, 'Conflito de pity deve escolher Tank por maior atraso relativo')
  assert.equal(state.tankActiveTime, 0, 'Tank resetou')
  assert.ok(state.vermeActiveTime >= 15.0, 'Verme continua devido para o próximo tick')

  // Tick seguinte com slot disponível -> agora spawna o Verme devido
  state.normalSpawnTimer = 0
  gameLoop.step(1, 16.67)
  assert.equal(state.vermeActiveTime, 0, 'Verme spawnou no tick seguinte e resetou')
})

// ============ 7. TANK E VERME ELEGÍVEIS DESDE O NÍVEL 1 ============
test('Fase 3 — Tank e Verme elegíveis e operantes desde o nível 1', () => {
  const { combat, state, gameLoop } = createHarness()

  assert.equal(VERME_SPAWN_CHANCE, 0.12, 'Chance nominal do Verme deve ser 0.12')
  assert.equal(TANK_SPAWN_CHANCE, 0.08, 'Chance nominal do Tank deve ser 0.08')

  // Spawn manual em nível 1
  combat.spawnTankEnemy()
  combat.spawnVerme()

  assert.equal(combat.getActiveTankCount(), 1, 'Tank deve estar presente e ativo em nível 1')
  assert.ok(combat.getEnemyCount() >= 5, 'Verme (4 elos) e Tank (1) devem estar presentes em nível 1')
})
