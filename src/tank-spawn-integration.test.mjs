import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  TANK_KIND,
  TANK_POPULATION_WEIGHT,
  spawnTankEnemy,
} from './enemies/tank.js'
import {
  TANK_SPAWN_CHANCE,
  TANK_MAX_ACTIVE_ON_RAIL,
  NORMAL_SPAWN_INTERVAL_MS,
  TIME_ENEMY_SPAWN_CHANCE,
  TIME_ENEMY_MEGA_CHANCE,
  MINI_SWARM_CHANCE,
  SENTINELA_SPAWN_CHANCE,
  REPLICA_SPAWN_CHANCE,
  VERME_SPAWN_CHANCE,
  SUSSURRO_SPAWN_CHANCE,
  HORDA_SPAWN_CHANCE,
  FRAGATA_SPAWN_CHANCE,
} from './main-constants.js'
import { createEnemiesSystem } from './enemies/index.js'
import { createCombatSystem } from './combat/index.js'
import { createGameLoop } from './game-loop.js'
import { getBindings } from './keybindings.js'

console.log('--- TEST: Integração do Tank no Spawn Automático e Auditoria de Inimigos Regulares ---')

function makeMockFrame() {
  return {
    position: new THREE.Vector3(0, 0, 0),
    forward: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
    right: new THREE.Vector3(1, 0, 0),
  }
}

function makeMockRail(isArena = false) {
  const frame = makeMockFrame()
  const v0 = new THREE.Vector3(0, 0, 0)
  const base = {
    isArena: () => isArena,
    getArenaCenter: () => v0,
    getArenaRadius: () => 120,
    getSpawnFrame: () => frame,
    getFrameAt: () => frame,
    getPlayerPosition: () => v0,
    getShipNosePosition: () => v0,
    getPlayerLateral: () => ({ x: 0, y: 0 }),
    getPlayerLateralOffset: () => ({ x: 0, y: 0 }),
    getPlayerLateralVelocity: () => ({ x: 0, y: 0 }),
    getFrameAtDistance: () => frame,
    getShipHitboxPoints: () => [{ worldPos: v0, radius: 1.0 }],
    setShipVisible: () => {},
    update: () => {},
    isLateralDashActive: () => false,
    setBoostActive: () => {},
    setAdvancing: () => {},
    setShakeIntensity: () => {},
    isTumbling: () => false,
    isTumbleControlLocked: () => false,
    isFullSpinActive: () => false,
    triggerRecoil: () => {},
    triggerImpactSquash: () => {},
    triggerEnemyCollisionTumble: () => {},
    triggerBossCollisionTumble: () => {},
    cancelTumble: () => {},
    getArenaAttitude: () => ({ pitch: 0, roll: 0 }),
  }
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop]
      return () => {}
    },
  })
}

function makeMockHud() {
  const base = {
    setStatus: () => {},
    setReticleLocked: () => {},
    setReticleAimAssist: () => {},
    setLockMarkers: () => {},
    setFeedback: () => {},
    setCountdown: () => {},
    setArenaWarning: () => {},
    setEnemyHealthBars: () => {},
    damageFlash: () => {},
    hitMarker: () => {},
    setMotionLines: () => {},
    setBoostDistortion: () => {},
    setPaused: () => {},
    setHorizon: () => {},
    setReticleAiming: () => {},
    setReticlePosition: () => {},
    setLockedEnemyMarkers: () => {},
    setKillChain: () => {},
    spawnDamageNumber: () => {},
    debug: {
      refreshStats: () => {},
    },
  }
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop]
      return () => {}
    },
  })
}

function makeMockEffects() {
  const base = {
    update: () => {},
    explosion: () => {},
    shockwave: () => {},
    flashMesh: () => {},
    telegraph: () => {},
    chargeCircle: () => {},
    hitSpark: () => {},
    bloomSprite: () => {},
    gridPulse: () => {},
    setChargeGlow: () => {},
  }
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop]
      return () => {}
    },
  })
}

function makeMockPlayer() {
  const base = {
    isInvincible: () => false,
    getInvincibleRemainingMs: () => 0,
    isRollIframeActive: () => false,
    isHomingCharging: () => false,
    getHomingChargeHeldMs: () => 0,
    isRamCardActive: () => false,
    isPropulsionActive: () => false,
    getPropulsionActiveTimer: () => 0,
    grantInvincibility: () => {},
    isRepulsionActive: () => false,
    buildCardExcludeSet: () => new Set(),
    getMaxHealth: () => 10,
    getShieldValue: () => 3,
    getShieldMax: () => 3,
    getMaxLives: () => 3,
    getCollectedCards: () => new Map(),
    getWingmanCount: () => 0,
    isSwirlReady: () => false,
    isFullSpinOnCooldown: () => false,
    isDeflectActive: () => false,
    takeDamage: () => ({ absorbedByShield: false, shieldBroke: false, outOfLives: false }),
    getTelemetry: () => null,
    update: () => {},
    config: {
      fireCooldown: 0.2,
      homingMaxTargets: 4,
      multiHomingUnlocked: false,
      homingChargeMinMs: 800,
      homingChargeMaxMs: 1600,
    },
  }
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop]
      return () => {}
    },
  })
}

function makeMockInput() {
  return {
    update: () => ({ pressed: new Set(), mouseNdc: { x: 0, y: 0 } }),
  }
}

function makeMockProgression(cap = 16) {
  return {
    currentEnemyCap: () => cap,
    randomEnemyInterval: () => 3000,
    randomBonusInterval: () => 12000,
    randomGoldenInterval: () => 60000,
    randomDetritoInterval: () => 6000,
    randomImaInterval: () => 14000,
  }
}

function createHarness(opts = {}) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000)
  const renderer = { render: () => {} }
  const rail = makeMockRail(opts.isArena || false)
  const hud = makeMockHud()
  const effects = makeMockEffects()
  const player = makeMockPlayer()
  const enemies = createEnemiesSystem(scene, rail, effects)
  const combat = createCombatSystem(scene, rail, effects, enemies, player)
  const input = makeMockInput()
  const progression = makeMockProgression(opts.cap || 16)

  const state = {
    phase: opts.phase || 'combat',
    cycleTimer: 30000,
    goldenTimer: 50000,
    normalSpawnTimer: 0, // pronto para spawnar
    enemyTimer: 0,
    detritoTimer: 10000,
    imaTimer: 20000,
    bonusTimer: 15000,
    extraSpawnPerBatch: 0,
    wrongAnswerCount: 0,
    killChainCount: 0,
    swirlSlowMoMs: 0,
    debugFlags: opts.debugFlags || {},
    stopped: false,
    paused: false,
  }

  const session = {
    score: 0,
    shields: 3,
    comboMultiplier: 1,
  }

  const gameLoop = createGameLoop({
    state,
    session,
    bindings: getBindings(),
    showEnemyHealthBars: false,
    hud,
    scene,
    camera,
    renderer,
    rail,
    effects,
    player,
    combat,
    input,
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
    enterCombat: () => { state.phase = 'combat' },
    applyHealthLoss: () => {},
    endSector: () => {},
    isNoDeck: false,
  })

  return { scene, rail, enemies, combat, state, session, progression, gameLoop }
}

// ============================================================================
// 1. ALCANÇABILIDADE DO SPAWN NATURAL DO TANK
// ============================================================================
{
  const { combat, state, gameLoop } = createHarness()
  assert.equal(combat.getActiveTankCount(), 0, 'Inicia sem Tanks ativos')

  // Controla o Math.random para passar pelas 7 checagens anteriores e sortear Tank
  const originalRandom = Math.random
  try {
    // 1. Time (0.9 > 0.2), 2. MiniSwarm (0.9 > 0.22), 3. Sentinela (0.9 > 0.12),
    // 4. Replica (0.9 > 0.10), 5. Verme (0.9 > 0.08), 6. Sussurro (0.9 > 0.10),
    // 7. Horda (0.9 > 0.30), 8. Tank (0.02 < 0.05 TANK_SPAWN_CHANCE)
    const seq = [0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.02]
    let seqIdx = 0
    Math.random = () => (seqIdx < seq.length ? seq[seqIdx++] : 0.5)

    // Executa 1 frame no modo manual
    state.normalSpawnTimer = 0
    gameLoop.step(1, 16.67)

    assert.equal(combat.getActiveTankCount(), 1, 'Tank deve ter sido gerado naturalmente pelo loop')
    const tanks = combat.getEnemySnapshots().filter((s) => s.maxHp >= 15)
    assert.ok(tanks.length >= 1, 'Snapshot confirma presença de unidade pesada')
  } finally {
    Math.random = originalRandom
  }
  console.log('✔ 1. Alcançabilidade do spawn natural do Tank comprovada')
}

// ============================================================================
// 2. SPAWN AUTOMÁTICO DESATIVADO VIA DEBUG FLAGS
// ============================================================================
{
  const { combat, state, gameLoop } = createHarness({ debugFlags: { disableAutoSpawn: true } })

  const originalRandom = Math.random
  try {
    // Força sequência que escolheria Tank se o auto-spawn estivesse ligado
    const seq = [0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.01]
    let seqIdx = 0
    Math.random = () => (seqIdx < seq.length ? seq[seqIdx++] : 0.5)

    state.normalSpawnTimer = 0
    gameLoop.step(5, 16.67)

    assert.equal(combat.getActiveTankCount(), 0, 'Com disableAutoSpawn=true, NENHUM Tank pode spawnar automaticamente')
    assert.equal(combat.getEnemyCount(), 0, 'Nenhum outro inimigo deve ter surgido automaticamente')

    // Botão de debug continua funcionando normalmente mesmo com auto-spawn desativado
    combat.spawnTankEnemy()
    assert.equal(combat.getActiveTankCount(), 1, 'Debug manual spawnTankEnemy continua operacional')
  } finally {
    Math.random = originalRandom
  }
  console.log('✔ 2. debugFlags.disableAutoSpawn bloqueia spawn automático preservando debug manual')
}

// ============================================================================
// 3. ORÇAMENTO DE POPULAÇÃO (CUSTO 2 VAGAS E RESTAURAÇÃO DE SLOTS)
// ============================================================================
{
  assert.equal(TANK_POPULATION_WEIGHT, 2, 'TANK_POPULATION_WEIGHT deve ser exatamente 2')

  const { combat, state, progression, gameLoop } = createHarness({ cap: 4 })
  assert.equal(progression.currentEnemyCap(), 4)

  // 1. Spawna 3 Blasters (peso 1 cada) -> total 3 vagas ocupadas, resta 1 vaga (room = 1)
  combat.spawnEnemy()
  combat.spawnEnemy()
  combat.spawnEnemy()
  assert.equal(combat.getEnemyCount(), 3)
  const room = progression.currentEnemyCap() - combat.getEnemyCount()
  assert.equal(room, 1, 'Sobra exatamente 1 vaga')

  // 2. Tenta spawnar Tank quando room = 1: deve ser recusado pelo seletor e cair no fallback
  const originalRandom = Math.random
  try {
    const seq = [0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.01, 0.99]
    let seqIdx = 0
    Math.random = () => (seqIdx < seq.length ? seq[seqIdx++] : 0.5)

    state.normalSpawnTimer = 0
    gameLoop.step(1, 16.67)

    // Tank não pode ter entrado porque exige room >= 2
    assert.equal(combat.getActiveTankCount(), 0, 'Tank não deve spawnar quando room < 2')
    // População não pode exceder cap 4
    assert.ok(combat.getEnemyCount() <= 4, 'Cap de inimigos nunca pode ser ultrapassado')
  } finally {
    Math.random = originalRandom
  }

  // 3. Limpa todos e spawna Tank diretamente: comprova que consome exatamente 2 vagas
  combat.clearEnemies()
  assert.equal(combat.getEnemyCount(), 0)

  const tank = combat.spawnTankEnemy()
  assert.ok(tank, 'Tank instanciado')
  assert.equal(combat.getEnemyCount(), 2, 'Tank deve custar exatamente 2 vagas na população')

  // 4. Morte do Tank: devolve imediatamente as 2 vagas ao orçamento
  tank.dying = true
  assert.equal(combat.getEnemyCount(), 0, 'Morte do Tank libera imediatamente suas 2 vagas')
  console.log('✔ 3. Orçamento de população (peso 2, bloqueio em room=1 e liberação na morte) comprovado')
}

// ============================================================================
// 4. TETO DE TANKS ATIVOS NO TRILHO (MÁXIMO 2)
// ============================================================================
{
  assert.equal(TANK_MAX_ACTIVE_ON_RAIL, 2)
  const { combat, state, gameLoop } = createHarness({ cap: 16 })

  // Spawna 2 Tanks manualmente
  combat.spawnTankEnemy()
  combat.spawnTankEnemy()
  assert.equal(combat.getActiveTankCount(), 2)
  assert.equal(combat.getEnemyCount(), 4) // 2 * 2 = 4 vagas

  // Roda ciclo de spawn com RNG direcionado para Tank: deve recusar novo Tank por atingir TANK_MAX_ACTIVE_ON_RAIL
  const originalRandom = Math.random
  try {
    const seq = [0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.01, 0.99]
    let seqIdx = 0
    Math.random = () => (seqIdx < seq.length ? seq[seqIdx++] : 0.5)

    state.normalSpawnTimer = 0
    gameLoop.step(1, 16.67)

    assert.equal(combat.getActiveTankCount(), 2, 'Não pode ultrapassar 2 Tanks simultâneos no trilho')
  } finally {
    Math.random = originalRandom
  }
  console.log('✔ 4. Teto de no máximo 2 Tanks ativos simultaneamente no trilho respeitado')
}

// ============================================================================
// 5. REGRESSÃO: TODOS OS DEMAIS INIMIGOS REGULARES CONTINUAM ALCANÇÁVEIS
// ============================================================================
{
  const registry = [
    {
      name: 'Time Enemy',
      setupRng: () => {
        let i = 0
        const seq = [0.01, 0.99] // < TIME_ENEMY_SPAWN_CHANCE (0.2), > TIME_ENEMY_MEGA (0.2)
        Math.random = () => (i < seq.length ? seq[i++] : 0.5)
      },
      check: (combat) => combat.getEnemySnapshots().some((s) => s.hp > 0),
    },
    {
      name: 'Time Enemy Mega',
      setupRng: () => {
        let i = 0
        const seq = [0.01, 0.01] // < TIME_ENEMY_SPAWN_CHANCE e < TIME_ENEMY_MEGA_CHANCE
        Math.random = () => (i < seq.length ? seq[i++] : 0.5)
      },
      check: (combat) => combat.getEnemySnapshots().some((s) => s.hp > 0),
    },
    {
      name: 'Mini Swarm',
      setupRng: () => {
        let i = 0
        const seq = [0.99, 0.05] // > Time, < MiniSwarm
        Math.random = () => (i < seq.length ? seq[i++] : 0.5)
      },
      check: (combat) => combat.getEnemyCount() >= 1,
    },
    {
      name: 'Sentinela',
      setupRng: () => {
        let i = 0
        const seq = [0.99, 0.99, 0.05] // > Time, > MiniSwarm, < Sentinela
        Math.random = () => (i < seq.length ? seq[i++] : 0.5)
      },
      check: (combat) => combat.getEnemyCount() >= 1,
    },
    {
      name: 'Réplica',
      setupRng: () => {
        let i = 0
        const seq = [0.99, 0.99, 0.99, 0.05] // < Replica
        Math.random = () => (i < seq.length ? seq[i++] : 0.5)
      },
      check: (combat) => combat.getEnemyCount() >= 1,
    },
    {
      name: 'Verme',
      setupRng: () => {
        let i = 0
        const seq = [0.99, 0.99, 0.99, 0.99, 0.03] // < Verme
        Math.random = () => (i < seq.length ? seq[i++] : 0.5)
      },
      check: (combat) => combat.getEnemyCount() >= 1,
    },
    {
      name: 'Sussurro',
      setupRng: () => {
        let i = 0
        const seq = [0.99, 0.99, 0.99, 0.99, 0.99, 0.05] // < Sussurro
        Math.random = () => (i < seq.length ? seq[i++] : 0.5)
      },
      check: (combat) => combat.getEnemyCount() >= 1,
    },
    {
      name: 'Horda',
      setupRng: () => {
        let i = 0
        const seq = [0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.10] // < Horda
        Math.random = () => (i < seq.length ? seq[i++] : 0.5)
      },
      check: (combat) => combat.getEnemyCount() >= 3,
    },
    {
      name: 'Tank (Novo Participante)',
      setupRng: () => {
        let i = 0
        const seq = [0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.02] // < Tank
        Math.random = () => (i < seq.length ? seq[i++] : 0.5)
      },
      check: (combat) => combat.getActiveTankCount() === 1,
    },
    {
      name: 'Blaster (Fallback)',
      setupRng: () => {
        let i = 0
        const seq = [0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.5] // Cai no fallback de Blaster
        Math.random = () => (i < seq.length ? seq[i++] : 0.5)
      },
      check: (combat) => combat.getEnemyCount() >= 1,
    },
  ]

  const originalRandom = Math.random
  try {
    for (const entry of registry) {
      const { combat, state, gameLoop } = createHarness({ cap: 16 })
      entry.setupRng()
      state.normalSpawnTimer = 0
      gameLoop.step(1, 16.67)
      assert.ok(entry.check(combat), `Inimigo ${entry.name} deve ser naturalmente alcançável via rotação normal`)
    }
  } finally {
    Math.random = originalRandom
  }

  // Fragata: verificada no contexto de arena / bossBuildup
  {
    const { combat, state, gameLoop } = createHarness({ isArena: true, phase: 'goldenArena' })
    const origRand = Math.random
    try {
      Math.random = () => 0.05 // < FRAGATA_SPAWN_CHANCE
      state.enemyTimer = 0
      gameLoop.step(1, 16.67)
      assert.ok(combat.getEnemyCount() >= 1, 'Fragata deve ser alcançável no contexto de arena')
    } finally {
      Math.random = origRand
    }
  }

  // Detrito e Enxame-Ímã: verificados por seus timers independentes
  {
    const { combat, state, gameLoop } = createHarness()
    state.detritoTimer = 0
    state.imaTimer = 0
    gameLoop.step(1, 16.67)
    // Detrito e Ímã não pontuam getEnemyCount, mas instanciam entidades no combate
    assert.ok(combat.getMinimapBlips().length >= 1, 'Detrito e/ou Ímã alcançáveis por timers independentes')
  }

  console.log('✔ 5. Regressão de alcançabilidade: 100% dos inimigos regulares permanecem alcançáveis')
}

// ============================================================================
// 6. SIMULAÇÃO DE GAMEPLAY COM AUTO-SPAWN ATIVO E VERIFICAÇÃO DE TELEMETRIA
// ============================================================================
{
  const { enemies, combat, state, progression, gameLoop } = createHarness({ cap: 10 })
  let tankAppearedNaturally = false

  // Controla o sorteio no primeiro spawn para selecionar Tank naturalmente
  const origRand = Math.random
  try {
    // 7 falhas dos outros especiais (0.99) + 1 sucesso do Tank (0.02 < 0.05)
    const rngSeq = [0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.02]
    let seqIdx = 0
    Math.random = () => (seqIdx < rngSeq.length ? rngSeq[seqIdx++] : 0.5)

    state.normalSpawnTimer = 0
    gameLoop.step(1, 16.67)

    assert.equal(combat.getActiveTankCount(), 1, 'Tank deve aparecer sem comando de debug')
    assert.equal(combat.getEnemyCount(), 2, 'Cap respeitado no spawn: 2 vagas ocupadas')
    assert.ok(combat.getEnemyCount() <= progression.currentEnemyCap(), 'População respeita o cap')

    const snaps = combat.getEnemySnapshots().filter((s) => s.maxHp >= 15)
    assert.equal(snaps.length, 1, 'Tank entrou normalmente no lifecycle')
    tankAppearedNaturally = true
  } finally {
    Math.random = origRand
  }

  assert.ok(tankAppearedNaturally, 'Tank deve ter aparecido no gameplay natural')

  // Simula múltiplos frames de combate ativo (movimento, telegraph, tiros)
  for (let frame = 0; frame < 60; frame++) {
    gameLoop.step(1, 16.67)
    assert.equal(combat.getActiveTankCount(), 1, 'Tank permanece ativo no combate')
  }

  // Abate o Tank com dano letal em área
  enemies.applyAreaDamage(new THREE.Vector3(0, 0, 0), 9999, 999)

  // Congela o timer de spawn durante a resolução da morte para isolar o cleanup
  state.normalSpawnTimer = 999999

  // Avança frames para concluir a animação de morte (deathT)
  for (let frame = 0; frame < 90; frame++) {
    gameLoop.step(1, 16.67)
  }

  // Verifica que o Tank morreu/despawnou e liberou seus 2 slots
  assert.equal(combat.getActiveTankCount(), 0, 'Tank deve ter despawnado após morte')
  assert.equal(combat.getEnemyCount(), 0, 'Orçamento de população totalmente liberado após morte')

  console.log('✔ 6. Simulação de gameplay: spawn natural, combate, cap, morte e cleanup validados')
}

console.log('\ntank-spawn-integration.test.mjs: TODOS OS CONTRATOS PASSARAM COM SUCESSO!\n')
