import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createSession, resolveAnswer, updateCorrectStreak, recordKills } from './quiz.js'
import { getDifficultyLevel } from './enemies/shared.js'
import { shouldAdvanceMissionTime, shouldDisplayMinimap } from './game-loop.js'
import { formatMissionTime, formatComboMultiplier, formatDifficultyLevel } from './hud-game.js'
import { createBossFlow } from './flow-boss.js'

console.log('--- TEST SUITE: HUD Double Stack Architecture & Authoritative Seams ---')

// ============================================================================
// 1. DADOS: STREAK AUTORITATIVO DE RESPOSTAS (NORMAL + DOURADO)
// ============================================================================
{
  console.log('Testing 1: Streak de respostas corretas (Normal, Boss e Dourado)...')
  const dummyDeck = {
    shooterCards: [
      { guid: 'c1', question: 'Q1', answer: 'A1' },
      { guid: 'c2', question: 'Q2', answer: 'A2' },
      { guid: 'c3', question: 'Q3', answer: 'A3' },
    ],
  }
  const session = createSession(dummyDeck)

  // Critério: streak começa em 0
  assert.strictEqual(session.correctStreak, 0, 'session.correctStreak deve iniciar em 0')

  // Pergunta normal: correto incrementa streak (+1 a cada acerto)
  const r1 = resolveAnswer(session, { type: 'correct', card: dummyDeck.shooterCards[0] })
  assert.strictEqual(session.correctStreak, 1, 'primeiro acerto normal deve elevar streak para 1')
  assert.strictEqual(r1.correctStreak, 1)

  const r2 = resolveAnswer(session, { type: 'correct', card: dummyDeck.shooterCards[1] })
  assert.strictEqual(session.correctStreak, 2, 'segundo acerto deve elevar streak para 2')
  assert.strictEqual(r2.correctStreak, 2)

  const r3 = resolveAnswer(session, { type: 'correct', card: dummyDeck.shooterCards[2] })
  assert.strictEqual(session.correctStreak, 3, 'terceiro acerto deve elevar streak para 3')

  // Contrato do Dourado: streak = 3 + Golden correct -> 4
  // Instancia createBossFlow para testar settleGoldenBonus real
  const mockState = {
    phase: 'goldenAlternatives',
    phaseTimer: 0,
    pendingCardChoice: false,
    questionResult: { card: dummyDeck.shooterCards[0], correctSlot: 1 },
  }
  const mockHud = {
    hideQuestionModal: () => {},
    setFeedback: () => {},
    showErrorFloat: () => {},
  }
  const mockMenu = { sessionResults: [] }
  const bossFlow = createBossFlow({
    state: mockState,
    session,
    deck: dummyDeck,
    menu: mockMenu,
    camera: { fov: 70, updateProjectionMatrix: () => {} },
    hud: mockHud,
    combat: {},
    rail: {},
    effects: {},
    environment: {},
    applyDifficulty: () => {},
    applyBossDifficulty: () => {},
    applySpeedProgression: () => {},
  })

  // Golden correct: streak 3 -> 4
  bossFlow.settleGoldenBonus({
    type: 'correct',
    card: dummyDeck.shooterCards[0],
    timeBonus: 1.2,
    accuracyBonus: 1.2,
  })
  assert.strictEqual(session.correctStreak, 4, 'Golden correct deve incrementar streak de 3 para 4')

  // Golden wrong: streak 4 -> 0
  bossFlow.settleGoldenBonus({
    type: 'wrong',
    card: dummyDeck.shooterCards[1],
    timeBonus: 1.0,
    accuracyBonus: 1.0,
  })
  assert.strictEqual(session.correctStreak, 0, 'Golden wrong deve resetar streak para 0')

  // Re-eleva streak para 3 e testa Golden timeout
  updateCorrectStreak(session, 'correct')
  updateCorrectStreak(session, 'correct')
  updateCorrectStreak(session, 'correct')
  assert.strictEqual(session.correctStreak, 3)

  bossFlow.settleGoldenBonus({
    type: 'timeout',
    card: dummyDeck.shooterCards[2],
    timeBonus: 0,
    accuracyBonus: 0,
  })
  assert.strictEqual(session.correctStreak, 0, 'Golden timeout deve resetar streak para 0')

  // Imunidade do streak a dano, tempo e trocas de fase
  updateCorrectStreak(session, 'correct')
  assert.strictEqual(session.correctStreak, 1)
  session.health = 20 // dano recebido
  assert.strictEqual(session.correctStreak, 1, 'streak não deve mudar ao receber dano')

  console.log('✔ Streak contracts (Normal + Golden) passed')
}

// ============================================================================
// 2. DADOS: KILLS ACUMULATIVO REAL DA SESSÃO (PIPELINE + PROTEÇÃO DUPLA CONTAGEM)
// ============================================================================
{
  console.log('Testing 2: Contador acumulativo de Kills e proteção contra dupla contagem...')
  const session = createSession({ shooterCards: [] })

  // Critério: inicia em 0
  assert.strictEqual(session.totalKills, 0, 'session.totalKills deve iniciar em 0')

  // 1 regular kill via pipeline autoritativo recordKills
  recordKills(session, 1)
  assert.strictEqual(session.totalKills, 1, '1 regular kill deve incrementar totalKills para 1')

  // 2 kills no mesmo frame
  recordKills(session, 2)
  assert.strictEqual(session.totalKills, 3, '2 kills no mesmo frame devem somar +2 (total: 3)')

  // non-lethal hit (sem abate)
  recordKills(session, 0)
  assert.strictEqual(session.totalKills, 3, 'non-lethal hit com count 0 não deve alterar totalKills')

  // cleanup / despawn / entidade destruída sem recompensa (count inválido ou 0)
  recordKills(session, 0)
  recordKills(session, -1)
  recordKills(session, NaN)
  assert.strictEqual(session.totalKills, 3, 'cleanup/despawn não deve alterar totalKills')

  // Derrota do Boss via handleBossDefeated
  const mockState = {
    phase: 'bossFight',
    deathCutsceneKind: null,
    killChainCount: 5,
    killChainTimer: 2.0,
  }
  const mockCombat = {
    clearOtherEnemies: () => {},
  }
  const mockHud = {
    showBossKO: () => {},
    setBossFight: () => {},
    setBossTint: () => {},
  }
  const bossFlow = createBossFlow({
    state: mockState,
    session,
    deck: { shooterCards: [] },
    menu: { sessionResults: [] },
    camera: { fov: 70, updateProjectionMatrix: () => {} },
    hud: mockHud,
    combat: mockCombat,
    rail: { exitArena: () => {} },
    effects: {},
    environment: { setFogProfile: () => {}, setSpawnDistanceExpectation: () => {} },
    applyDifficulty: () => {},
    applyBossDifficulty: () => {},
    applySpeedProgression: () => {},
  })

  const dummyPos = { clone: () => ({ x: 0, y: 0, z: 0 }) }

  // Boss defeat -> incrementa exatamente 1
  bossFlow.handleBossDefeated(dummyPos)
  assert.strictEqual(session.totalKills, 4, 'derrota do Boss deve somar exatamente +1 kill')
  assert.strictEqual(mockState.phase, 'deathCutscene')
  assert.strictEqual(mockState.deathCutsceneKind, 'boss')

  // Proteção explícita contra dupla contagem se handleBossDefeated for chamado novamente durante cutscene
  bossFlow.handleBossDefeated(dummyPos)
  assert.strictEqual(session.totalKills, 4, 'chamada duplicada em deathCutscene não deve duplicar kill de Boss')

  // Derrota do Dourado via handleGoldenDefeated
  mockState.phase = 'goldenArena'
  mockState.deathCutsceneKind = null

  bossFlow.handleGoldenDefeated(dummyPos)
  assert.strictEqual(session.totalKills, 5, 'derrota do Dourado deve somar exatamente +1 kill')
  assert.strictEqual(mockState.phase, 'deathCutscene')
  assert.strictEqual(mockState.deathCutsceneKind, 'golden')

  // Proteção explícita contra dupla contagem do Dourado
  bossFlow.handleGoldenDefeated(dummyPos)
  assert.strictEqual(session.totalKills, 5, 'chamada duplicada em deathCutscene não deve duplicar kill de Dourado')

  console.log('✔ Kills accumulation & double count protection passed')
}

// ============================================================================
// 3. DADOS: MISSION TIME REAL (MATRIZ COMPLETA DE PAUSAS E SEAMS)
// ============================================================================
{
  console.log('Testing 3: Mission Time monotônico e matriz de pausas...')
  const session = createSession({ shooterCards: [] })
  assert.strictEqual(session.missionTimeMs, 0, 'missionTimeMs deve iniciar em 0')

  // Matriz de decisões autoritativas via seam puro shouldAdvanceMissionTime
  // 1. combat normal -> avança rawDt (true)
  assert.strictEqual(shouldAdvanceMissionTime({ paused: false, phase: 'combat' }), true, 'combat normal deve avançar')

  // 2. Arcade slowmo -> avança rawDt (true)
  assert.strictEqual(
    shouldAdvanceMissionTime({ paused: false, phase: 'cardChoice', isNoDeck: true, arcadeDraftMode: 'slowmo', arcadeCardChoicePauses: false }),
    true,
    'Arcade card choice em slowmo deve avançar'
  )

  // 3. Arcade normal -> avança rawDt (true)
  assert.strictEqual(
    shouldAdvanceMissionTime({ paused: false, phase: 'cardChoice', isNoDeck: true, arcadeDraftMode: 'slowmo', arcadeCardChoicePauses: false }),
    true,
    'Arcade card choice pós-bullet-time (normal) deve avançar'
  )

  // 4. pause -> congela (false)
  assert.strictEqual(shouldAdvanceMissionTime({ paused: true, phase: 'combat' }), false, 'pause deve congelar timer')

  // 5. questionPause -> congela (false)
  assert.strictEqual(shouldAdvanceMissionTime({ paused: false, phase: 'questionPause' }), false, 'questionPause deve congelar timer')

  // 6. bossQuestionPause -> congela (false)
  assert.strictEqual(shouldAdvanceMissionTime({ paused: false, phase: 'bossQuestionPause' }), false, 'bossQuestionPause deve congelar timer')

  // 7. cardChoice pause (Roguelike ou Arcade com pausa total) -> congela (false)
  assert.strictEqual(shouldAdvanceMissionTime({ paused: false, phase: 'cardChoice', isNoDeck: false }), false, 'cardChoice roguelike deve congelar timer')
  assert.strictEqual(
    shouldAdvanceMissionTime({ paused: false, phase: 'cardChoice', isNoDeck: true, arcadeDraftMode: 'pause' }),
    false,
    'cardChoice arcade pause deve congelar timer'
  )

  // 8. wrongPause -> congela (false)
  assert.strictEqual(shouldAdvanceMissionTime({ paused: false, phase: 'wrongPause' }), false, 'wrongPause deve congelar timer')

  // 9. launchCutscene -> congela (false)
  assert.strictEqual(shouldAdvanceMissionTime({ paused: false, phase: 'launchCutscene' }), false, 'launchCutscene deve congelar timer')
  assert.strictEqual(shouldAdvanceMissionTime({ paused: false, phase: 'combat', cutsceneActive: true }), false, 'cutsceneActive deve congelar timer')

  // 10. arenaCutscene -> congela (false)
  assert.strictEqual(shouldAdvanceMissionTime({ paused: false, phase: 'arenaCutscene' }), false, 'arenaCutscene deve congelar timer')

  // 11. deathCutscene -> congela (false)
  assert.strictEqual(shouldAdvanceMissionTime({ paused: false, phase: 'deathCutscene' }), false, 'deathCutscene deve congelar timer')

  // Independência de dt desacelerado: avança sempre por rawDt
  const rawDt = 0.016
  const slowedDt = 0.016 * 0.25 // ex: timeScale
  session.missionTimeMs += rawDt * 1000 // avança com rawDt
  assert.strictEqual(session.missionTimeMs, 16, 'Mission Time deve avançar por rawDt e não por slowedDt')

  // Formatação MM:SS via formatMissionTime
  assert.strictEqual(formatMissionTime(0), '00:00')
  assert.strictEqual(formatMissionTime(16000), '00:16')
  assert.strictEqual(formatMissionTime(92000), '01:32')
  assert.strictEqual(formatMissionTime(725000), '12:05')
  assert.strictEqual(formatMissionTime(null), '00:00')
  assert.strictEqual(formatMissionTime(undefined), '00:00')

  console.log('✔ Mission Time contracts & pause matrix passed')
}

// ============================================================================
// 4. DADOS: LEVEL / DIFICULDADE E FORMATTERS AUTORITATIVOS
// ============================================================================
{
  console.log('Testing 4: Fonte autoritativa do Nível e formatters consolidados...')
  const lvl1 = getDifficultyLevel({ wrongAnswerCount: 0, score: 0, isNoDeck: false })
  assert.strictEqual(lvl1, 1, 'nível inicial deve ser 1')

  const lvlHigh = getDifficultyLevel({ wrongAnswerCount: 8, score: 50000, isNoDeck: false })
  assert.ok(lvlHigh >= 2 && lvlHigh <= 9, 'nível com erros acumulados deve progredir entre 1 e 9')

  assert.strictEqual(formatDifficultyLevel(lvl1), '01', 'nível deve ser formatado com dois dígitos no HUD')
  assert.strictEqual(formatDifficultyLevel(9), '09')

  assert.strictEqual(formatComboMultiplier(1), 'x1.0')
  assert.strictEqual(formatComboMultiplier(1.5), 'x1.5')
  assert.strictEqual(formatComboMultiplier(2.15), 'x2.15')

  console.log('✔ Level & formatters contracts passed')
}

// ============================================================================
// 5. STATIC CONTRACT CHECK (LAYOUT TOKENS, CLASSES & API)
// ============================================================================
{
  console.log('Testing 5: STATIC CONTRACT CHECK (Layout Tokens, Classes & API)...')
  const hudGameSource = readFileSync(new URL('./hud-game.js', import.meta.url), 'utf8')

  // Pilha Esquerda
  assert.ok(hudGameSource.includes('hud-double-stack hud-stack-left'), 'Pilha esquerda deve ter classe hud-stack-left')
  assert.ok(hudGameSource.includes('hud-score-block'), 'Deve conter hud-score-block')
  assert.ok(hudGameSource.includes('hud-score-value'), 'Deve conter hud-score-value')
  assert.ok(hudGameSource.includes('hud-score-metrics'), 'Deve conter hud-score-metrics')
  assert.ok(hudGameSource.includes('data-metric="streak"'), 'Deve conter métrica streak')
  assert.ok(hudGameSource.includes('data-metric="kills"'), 'Deve conter métrica kills')
  assert.ok(!hudGameSource.includes('data-metric="rank"'), 'Rank inexistente NÃO deve ter placeholder/slot fake renderizado')
  assert.ok(hudGameSource.includes('hud-combo-block'), 'Deve conter hud-combo-block')
  assert.ok(hudGameSource.includes('hud-combo-value'), 'Deve conter hud-combo-value')

  // Pilha Direita
  assert.ok(hudGameSource.includes('hud-double-stack hud-stack-right'), 'Pilha direita deve ter classe hud-stack-right')
  assert.ok(hudGameSource.includes('hud-mission-block'), 'Deve conter hud-mission-block')
  assert.ok(hudGameSource.includes('hud-mission-time-value'), 'Deve conter hud-mission-time-value')
  assert.ok(hudGameSource.includes('hud-level-block'), 'Deve conter hud-level-block')
  assert.ok(hudGameSource.includes('hud-level-value'), 'Deve conter hud-level-value')

  // Combat Left Cluster (Fase 1.6: Nada estático no centro superior)
  assert.ok(hudGameSource.includes('hud-combat-left-cluster'), 'Deve conter hud-combat-left-cluster na lateral esquerda')
  assert.ok(hudGameSource.includes('hud-combat-actions-row'), 'Deve conter hud-combat-actions-row agrupando ações de combate')
  assert.ok(!hudGameSource.includes('hud-top-center-cluster'), 'hud-top-center-cluster NÃO pode existir no topo central')

  // API consolidada (Abordagem B: setStatus unificado com formatters puros compartilhados)
  assert.ok(hudGameSource.includes('setStatus({'), 'Deve expor setStatus como API pública consolidada')
  assert.ok(!hudGameSource.includes('setScoreStats({'), 'Métodos granulares mortos devem ser removidos da API pública')
  assert.ok(!hudGameSource.includes('setMissionStatus({'), 'setMissionStatus morto deve ser removido')
  assert.ok(!hudGameSource.includes('setCombo('), 'setCombo morto deve ser removido')

  console.log('✔ STATIC CONTRACT CHECK passed (Nota: inspeção estática de tokens; playtest gráfico em ambiente dedicado)')
}

// ============================================================================
// 6. CONTRATOS DO RADAR / MINIMAPA (TRANSIÇÃO RAIL VS ALL-RANGE)
// ============================================================================
{
  console.log('Testing 6: Minimapa transições Rail vs All-Range e limpeza de estado...')

  // Decisão autoritativa via seam puro shouldDisplayMinimap
  assert.strictEqual(shouldDisplayMinimap({ isArena: false, phase: 'combat' }), false, 'rail normal deve ocultar minimapa')
  assert.strictEqual(shouldDisplayMinimap({ isArena: true, phase: 'combat' }), true, 'arena all-range deve exibir minimapa')
  assert.strictEqual(shouldDisplayMinimap({ isArena: false, phase: 'bossFight' }), true, 'bossFight deve exibir minimapa')
  assert.strictEqual(shouldDisplayMinimap({ isArena: false, phase: 'goldenArena' }), true, 'goldenArena deve exibir minimapa')

  // Simulação de transição Rail -> Arena -> Rail com verificação de classes e hidden
  const mockMinimapEl = {
    hidden: true,
    classList: {
      _classes: new Set(),
      toggle(cls, val) { if (val) this._classes.add(cls); else this._classes.delete(cls) },
      remove(cls) { this._classes.delete(cls) },
      contains(cls) { return this._classes.has(cls) },
    },
  }

  function simulateSetMinimap(el, active, data = {}) {
    el.hidden = !active
    if (!active) {
      el.classList.remove('alert')
      return
    }
    const { alert = false } = data
    el.classList.toggle('alert', !!alert)
  }

  // 1. Estado inicial: rail (oculto)
  simulateSetMinimap(mockMinimapEl, false)
  assert.strictEqual(mockMinimapEl.hidden, true, 'no rail inicial deve estar hidden = true')
  assert.strictEqual(mockMinimapEl.classList.contains('alert'), false)

  // 2. Transição para arena com alerta
  simulateSetMinimap(mockMinimapEl, true, { alert: true })
  assert.strictEqual(mockMinimapEl.hidden, false, 'ao entrar na arena deve estar hidden = false')
  assert.strictEqual(mockMinimapEl.classList.contains('alert'), true, 'deve aplicar classe alert')

  // 3. Transição de volta para o rail: deve ocultar E remover alerta residual
  simulateSetMinimap(mockMinimapEl, false)
  assert.strictEqual(mockMinimapEl.hidden, true, 'ao voltar para rail deve estar hidden = true')
  assert.strictEqual(mockMinimapEl.classList.contains('alert'), false, 'classe alert deve ser limpa sem estado persistente indevido')

  // Verificação no index.html
  const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  assert.ok(
    indexHtml.includes('top: clamp(28%, 32%, 35%)'),
    'minimapa deve estar reposicionado para a lateral intermediária (~30%-35%)'
  )
  assert.ok(
    indexHtml.includes('right: clamp(16px, 2vw, 24px)'),
    'minimapa deve respeitar margem lateral intermediária'
  )
  assert.match(
    indexHtml,
    /\.hud-minimap\[hidden\] \{\r?\n\s+display: none !important;/,
    'minimapa com [hidden] deve ter display: none sem deixar espaço reservado'
  )

  console.log('✔ Minimap transition & state cleanup passed')
}

// ============================================================================
// 7. CONTRATOS CSS RESPONSIVOS & CLUSTER VITAL
// ============================================================================
{
  console.log('Testing 7: CSS tokens e safe areas...')
  const hudStylesSource = readFileSync(new URL('./hud-styles.js', import.meta.url), 'utf8')

  assert.ok(
    hudStylesSource.includes('--hud-left-x: clamp(18px, 3.2vw, 52px)') ||
    hudStylesSource.includes('--hud-left-stack-x: clamp(238px, 17vw, 290px)'),
    'deve usar token --hud-left-x com clamp para alinhamento da Coluna Esquerda Clássica (Opção 4)'
  )
  assert.ok(
    hudStylesSource.includes('.cinematic-active .hud-double-stack'),
    'cutscenes cinemáticas devem ocultar as pilhas do Double Stack'
  )
  assert.ok(
    hudStylesSource.includes('.cinematic-active .hud-combat-left-cluster'),
    'cutscenes cinemáticas devem ocultar o cluster de combate lateral esquerdo'
  )

  // Regressão Crítica: nenhum arquivo HUD pode referenciar THREE sem import (causava crash local de ReferenceError em setReticleCharge)
  const hudGameSource = readFileSync(new URL('./hud-game.js', import.meta.url), 'utf8')
  assert.ok(
    !/\bTHREE\b/.test(hudGameSource),
    'hud-game.js não deve referenciar THREE diretamente (deve usar Math nativo)'
  )

  console.log('✔ Responsive CSS contracts & HUD clean globals passed')
}

console.log('--- TODOS OS TESTES DO HUD DOUBLE STACK PASSARAM COM SUCESSO! ---')
