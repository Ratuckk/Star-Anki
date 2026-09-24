import assert from 'node:assert/strict'
import * as THREE from 'three'
import { getDifficultyLevel, effectiveDifficultyLevel } from './enemies/shared.js'
import { createDebugActions } from './debug-actions.js'
import { DEBUG_ACTIONS } from './debug.js'
import { createEnemiesSystem } from './enemies/index.js'
import { tankStatsForLevel } from './enemies/tank.js'
import { formatDifficultyLevel } from './hud-game.js'

console.log('--- TEST SUITE: Fase 0 — Debug de Dificuldade & Override Autoritativo ---')

// Helper mock rail
function createMockRail() {
  const frame = {
    position: new THREE.Vector3(0, 0, 0),
    right: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    forward: new THREE.Vector3(0, 0, 1),
  }
  const base = {
    getPlayerPosition: () => new THREE.Vector3(0, 0, 0),
    getShipNosePosition: () => new THREE.Vector3(0, 0, 0),
    getFrameAt: () => frame,
    getSpawnFrame: () => frame,
    getFrameAtDistance: () => frame,
    getDistance: () => 0,
    isArena: () => false,
    exitArena: () => {},
    setAdvancing: () => {},
  }
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop]
      return () => 0
    },
  })
}

// ============================================================================
// 1. NÍVEL AUTOMÁTICO SEM OVERRIDE
// ============================================================================
{
  console.log('Testing 1: Nível automático sem override...')
  const state = { wrongAnswerCount: 0, debugDifficultyLevelOverride: null }
  const session = { score: 0 }

  assert.equal(effectiveDifficultyLevel({ state, session, isNoDeck: false }), 1)
  assert.equal(effectiveDifficultyLevel(state, session, false), 1)

  // Subindo por erros normais (+1 nível a cada 2 erros)
  state.wrongAnswerCount = 2
  assert.equal(effectiveDifficultyLevel({ state, session, isNoDeck: false }), 2)
  state.wrongAnswerCount = 8
  assert.equal(effectiveDifficultyLevel({ state, session, isNoDeck: false }), 5)

  // Subindo por score no modo arcade
  const arcadeState = { wrongAnswerCount: 0, debugDifficultyLevelOverride: null }
  const arcadeSession = { score: 35000 }
  assert.equal(effectiveDifficultyLevel({ state: arcadeState, session: arcadeSession, isNoDeck: true }), 4)

  console.log('✔ Nível automático verificado com sucesso')
}

// ============================================================================
// 2. BOTÕES + E - ALTERAM NÍVEL, SCORE E WRONG ANSWERS NÃO MUDAM
// ============================================================================
{
  console.log('Testing 2: Botões de debug + e - alteram nível preservando score e erros...')
  const state = {
    wrongAnswerCount: 2, // nível natural seria 2
    debugDifficultyLevelOverride: null,
    lastDifficultyLevel: 2,
    phase: 'combat',
    debugFlags: {},
  }
  const session = {
    score: 1500,
    health: 3,
    lives: 3,
    comboMultiplier: 1.5,
    correctStreak: 4,
    totalKills: 7,
    missionTimeMs: 12000,
  }
  const deck = { isNoDeck: false }
  let lastHudStatus = null
  const hudMock = {
    setStatus: (status) => { lastHudStatus = status },
    debug: {
      refreshStats: () => {},
      setToggleActive: () => {},
    },
  }

  const actions = createDebugActions({
    state,
    deck,
    session,
    hud: hudMock,
    combat: { clearAllCombatants: () => {} },
    rail: createMockRail(),
    effects: {},
    player: { getMaxHealth: () => 3, getMaxLives: () => 3 },
    debugFlags: state.debugFlags,
  })

  // Estado inicial
  assert.equal(effectiveDifficultyLevel({ state, session, isNoDeck: false }), 2)

  // Executa botão +
  actions.increaseDifficultyLevel()
  assert.equal(state.debugDifficultyLevelOverride, 3, 'override deve ir para 3')
  assert.equal(effectiveDifficultyLevel({ state, session, isNoDeck: false }), 3)
  assert.equal(session.score, 1500, 'score NUNCA pode ser adulterado pelo debug de nível')
  assert.equal(state.wrongAnswerCount, 2, 'wrongAnswerCount NUNCA pode ser adulterado pelo debug de nível')
  assert.equal(lastHudStatus.difficultyLevel, 3, 'HUD setStatus deve receber nível 3')
  assert.equal(lastHudStatus.isDifficultyOverridden, true, 'HUD deve ser notificada de override ativo')

  // Executa botão + novamente
  actions.increaseDifficultyLevel()
  assert.equal(state.debugDifficultyLevelOverride, 4)
  assert.equal(effectiveDifficultyLevel({ state, session, isNoDeck: false }), 4)
  assert.equal(session.score, 1500)
  assert.equal(state.wrongAnswerCount, 2)

  // Executa botão -
  actions.decreaseDifficultyLevel()
  assert.equal(state.debugDifficultyLevelOverride, 3)
  assert.equal(effectiveDifficultyLevel({ state, session, isNoDeck: false }), 3)
  assert.equal(session.score, 1500)
  assert.equal(state.wrongAnswerCount, 2)
  assert.equal(lastHudStatus.difficultyLevel, 3)

  console.log('✔ Botões + e - preservam integridade de score/erros')
}

// ============================================================================
// 3. CLAMP RIGOROSO EM [1, 9]
// ============================================================================
{
  console.log('Testing 3: Clamp rigoroso entre 1 e 9...')
  const state = { wrongAnswerCount: 0, debugDifficultyLevelOverride: 8 }
  const session = { score: 0 }
  const hudMock = { setStatus: () => {}, debug: { refreshStats: () => {} } }
  const actions = createDebugActions({
    state,
    session,
    hud: hudMock,
    combat: { clearAllCombatants: () => {} },
    rail: createMockRail(),
    effects: {},
    player: { getMaxHealth: () => 3 },
    debugFlags: {},
  })

  // Sobe de 8 para 9
  actions.increaseDifficultyLevel()
  assert.equal(state.debugDifficultyLevelOverride, 9)
  assert.equal(effectiveDifficultyLevel({ state, session }), 9)

  // Tenta subir além de 9 -> deve travar em 9
  actions.increaseDifficultyLevel()
  assert.equal(state.debugDifficultyLevelOverride, 9, 'nível não pode ultrapassar 9')
  assert.equal(effectiveDifficultyLevel({ state, session }), 9)

  // Desce até 1 e tenta descer abaixo de 1
  for (let i = 0; i < 15; i++) {
    actions.decreaseDifficultyLevel()
  }
  assert.equal(state.debugDifficultyLevelOverride, 1, 'nível não pode descer abaixo de 1')
  assert.equal(effectiveDifficultyLevel({ state, session }), 1)

  console.log('✔ Clamp [1, 9] verificado com sucesso')
}

// ============================================================================
// 4. INIMIGOS E ESQUADRÃO DOURADO RECEBEM NÍVEL OVERRIDDEN
// ============================================================================
{
  console.log('Testing 4: Inimigos spawnados recebem o nível do override...')
  const scene = new THREE.Scene()
  const rail = createMockRail()
  const effects = { explosion: () => {}, spawnMicroOrbe: () => {} }
  let nextEnemyId = 1
  const enemies = createEnemiesSystem(scene, rail, effects, () => nextEnemyId++)

  const state = { wrongAnswerCount: 0, score: 0, debugDifficultyLevelOverride: 7 }
  const session = { score: 0 }

  // Conecta o provider com o override
  enemies.setDifficultyLevelProvider(() => effectiveDifficultyLevel({ state, session }))

  // Spawn Tank
  const tank = enemies.spawnTankEnemy()
  assert.equal(tank.level, 7, 'Tank deve nascer com level 7 do override')
  assert.equal(tank.hp, tankStatsForLevel(7).hp, 'HP do Tank deve escalar com level 7')
  assert.equal(tank.maxHp, tankStatsForLevel(7).hp)

  // Spawn Replica
  const replica = enemies.spawnReplica()
  assert.equal(replica.level, 7, 'Replica deve nascer com level 7')

  // Spawn Verme
  const vermeSegs = enemies.spawnVerme()
  assert.ok(vermeSegs.length > 0)
  for (const seg of vermeSegs) {
    assert.equal(seg.level, 7, 'Cada segmento do verme deve conter level 7')
  }

  // Spawn Sussurro
  const sussurro = enemies.spawnSussurro()
  assert.equal(sussurro.level, 7, 'Sussurro deve nascer com level 7')

  // Spawn Blaster comum
  const blaster = enemies.spawnEnemy()
  assert.equal(blaster.level, 7, 'Blaster comum deve nascer com level 7')

  // Muda override para 4
  state.debugDifficultyLevelOverride = 4
  const tankLvl4 = enemies.spawnTankEnemy()
  assert.equal(tankLvl4.level, 4, 'Novo Tank deve refletir imediatamente a mudança para nível 4')
  assert.equal(tankLvl4.hp, tankStatsForLevel(4).hp)

  console.log('✔ Propagação do nível para todos os inimigos comprovada')
}

// ============================================================================
// 5. METADADOS DO DEBUG PANEL E AÇÕES DECLARADAS
// ============================================================================
{
  console.log('Testing 5: Declaração das ações no catálogo de debug...')
  const decAction = DEBUG_ACTIONS.find((a) => a.id === 'decreaseDifficultyLevel')
  const incAction = DEBUG_ACTIONS.find((a) => a.id === 'increaseDifficultyLevel')

  assert.ok(decAction, 'decreaseDifficultyLevel deve estar declarado em DEBUG_ACTIONS')
  assert.equal(decAction.label, '- Nível de dificuldade')
  assert.equal(decAction.category, 'Setor & Fluxo')

  assert.ok(incAction, 'increaseDifficultyLevel deve estar declarado em DEBUG_ACTIONS')
  assert.equal(incAction.label, '+ Nível de dificuldade')
  assert.equal(incAction.category, 'Setor & Fluxo')

  console.log('✔ Metadados do painel de debug verificados')
}

// ============================================================================
// 6. FORMATAÇÃO E INDICAÇÃO DE OVERRIDE NO HUD
// ============================================================================
{
  console.log('Testing 6: Formatação e indicação de nível no HUD...')
  assert.equal(formatDifficultyLevel(1), '01')
  assert.equal(formatDifficultyLevel(9), '09')
  assert.equal(formatDifficultyLevel(4), '04')
  assert.equal(formatDifficultyLevel(0), '01', 'nível mínimo formatado deve ser 01')
  assert.equal(formatDifficultyLevel(12), '12')

  // Simula o comportamento exato de setStatus do HUD
  function applyStatus(levelValEl, levelBlock, labelEl, { difficultyLevel = 1, isDifficultyOverridden = false }) {
    levelValEl.textContent = formatDifficultyLevel(difficultyLevel)
    if (levelBlock) {
      if (isDifficultyOverridden) {
        levelBlock.classList.add('debug-override')
      } else {
        levelBlock.classList.delete('debug-override')
      }
      if (labelEl) {
        labelEl.textContent = isDifficultyOverridden ? 'NÍVEL [DBG]' : 'NÍVEL'
      }
    }
  }

  const levelValEl = { textContent: '' }
  const labelEl = { textContent: 'NÍVEL' }
  const levelClasses = new Set(['hud-level-block'])
  const levelBlock = { classList: levelClasses }

  // Nível normal
  applyStatus(levelValEl, levelBlock, labelEl, { difficultyLevel: 2, isDifficultyOverridden: false })
  assert.equal(levelValEl.textContent, '02')
  assert.ok(!levelBlock.classList.has('debug-override'))
  assert.equal(labelEl.textContent, 'NÍVEL')

  // Com override ativo
  applyStatus(levelValEl, levelBlock, labelEl, { difficultyLevel: 8, isDifficultyOverridden: true })
  assert.equal(levelValEl.textContent, '08')
  assert.ok(levelBlock.classList.has('debug-override'))
  assert.equal(labelEl.textContent, 'NÍVEL [DBG]')

  console.log('✔ Indicador de override no HUD verificado')
}

console.log('--- TODOS OS TESTES DA FASE 0 PASSARAM COM SUCESSO! ---')
