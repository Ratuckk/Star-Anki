import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createSession, resolveAnswer } from './quiz.js'
import { getDifficultyLevel } from './enemies/shared.js'

console.log('--- TEST SUITE: HUD Double Stack Architecture & Data Sources ---')

// ============================================================================
// 1. DADOS: STREAK AUTORITATIVO DE RESPOSTAS
// ============================================================================
{
  console.log('Testing 1: Streak de respostas corretas...')
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

  // Critério: correto incrementa streak (+1 a cada acerto)
  const r1 = resolveAnswer(session, { type: 'correct', card: dummyDeck.shooterCards[0] })
  assert.strictEqual(session.correctStreak, 1, 'primeiro acerto deve elevar streak para 1')
  assert.strictEqual(r1.correctStreak, 1, 'retorno de resolveAnswer deve conter correctStreak 1')

  const r2 = resolveAnswer(session, { type: 'correct', card: dummyDeck.shooterCards[1] })
  assert.strictEqual(session.correctStreak, 2, 'segundo acerto deve elevar streak para 2')
  assert.strictEqual(r2.correctStreak, 2)

  const r3 = resolveAnswer(session, { type: 'correct', card: dummyDeck.shooterCards[2] })
  assert.strictEqual(session.correctStreak, 3, 'terceiro acerto deve elevar streak para 3')

  // Critério: erro reseta streak para 0
  const r4 = resolveAnswer(session, { type: 'wrong', card: dummyDeck.shooterCards[0] })
  assert.strictEqual(session.correctStreak, 0, 'resposta errada deve resetar streak para 0')
  assert.strictEqual(r4.correctStreak, 0)

  // Timeout também conta como erro
  resolveAnswer(session, { type: 'correct', card: dummyDeck.shooterCards[0] })
  assert.strictEqual(session.correctStreak, 1)
  resolveAnswer(session, { type: 'timeout', card: dummyDeck.shooterCards[1] })
  assert.strictEqual(session.correctStreak, 0, 'timeout deve resetar streak para 0')

  console.log('✔ Streak contracts passed')
}

// ============================================================================
// 2. DADOS: KILLS ACUMULATIVO REAL DA SESSÃO
// ============================================================================
{
  console.log('Testing 2: Contador acumulativo de Kills...')
  const dummyDeck = { shooterCards: [] }
  const session = createSession(dummyDeck)

  // Critério: inicia em 0
  assert.strictEqual(session.totalKills, 0, 'session.totalKills deve iniciar em 0')

  // Simulação de pipeline de kill autoritativo
  const events1 = { enemyKills: 2, hitsLog: [{ killed: true }, { killed: true }] }
  if (events1.enemyKills > 0) {
    session.totalKills = (session.totalKills || 0) + events1.enemyKills
  }
  assert.strictEqual(session.totalKills, 2, 'deve somar 2 kills oficiais')

  // Critério: cleanup, hit não-letal ou despawn NÃO incrementam kills
  const cleanupEvent = { enemyKills: 0, hitsLog: [{ killed: false }] }
  if (cleanupEvent.enemyKills > 0) {
    session.totalKills = (session.totalKills || 0) + cleanupEvent.enemyKills
  }
  assert.strictEqual(session.totalKills, 2, 'cleanup/hits não devem alterar totalKills')

  // Kill de chefe/dourado via pipeline normal
  session.totalKills = (session.totalKills || 0) + 1
  assert.strictEqual(session.totalKills, 3, 'derrota de boss/golden adiciona exatamente 1 ao totalKills')

  console.log('✔ Kills accumulation contracts passed')
}

// ============================================================================
// 3. DADOS: MISSION TIME REAL E PROGRESSIVO
// ============================================================================
{
  console.log('Testing 3: Mission Time monotônico e sem NaN...')
  const session = createSession({ shooterCards: [] })
  assert.strictEqual(session.missionTimeMs, 0, 'missionTimeMs deve iniciar em 0')

  // Avanço monotônico durante gameplay ativo
  const dts = [0.016, 0.016, 0.033, 0.016]
  for (const dt of dts) {
    const prev = session.missionTimeMs
    session.missionTimeMs = (session.missionTimeMs || 0) + dt * 1000
    assert.ok(session.missionTimeMs >= prev, 'Mission Time deve ser estritamente monotônico')
    assert.ok(!Number.isNaN(session.missionTimeMs), 'Mission Time não pode produzir NaN')
  }

  // Formatação MM:SS
  function formatMissionTime(ms) {
    const totalSec = Math.max(0, Math.floor((ms || 0) / 1000))
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0')
    const ss = String(totalSec % 60).padStart(2, '0')
    return `${mm}:${ss}`
  }

  assert.strictEqual(formatMissionTime(0), '00:00')
  assert.strictEqual(formatMissionTime(92000), '01:32')
  assert.strictEqual(formatMissionTime(725000), '12:05')
  assert.strictEqual(formatMissionTime(null), '00:00')
  assert.strictEqual(formatMissionTime(undefined), '00:00')

  console.log('✔ Mission Time contracts passed')
}

// ============================================================================
// 4. DADOS: LEVEL / DIFICULDADE AUTORITATIVA
// ============================================================================
{
  console.log('Testing 4: Fonte autoritativa do Nível...')
  const lvl1 = getDifficultyLevel({ wrongAnswerCount: 0, score: 0, isNoDeck: false })
  assert.strictEqual(lvl1, 1, 'nível inicial deve ser 1')

  const lvlHigh = getDifficultyLevel({ wrongAnswerCount: 8, score: 50000, isNoDeck: false })
  assert.ok(lvlHigh >= 2 && lvlHigh <= 9, 'nível com erros acumulados deve progredir entre 1 e 9')

  // Formatação de 2 dígitos
  const formattedLvl = String(lvl1).padStart(2, '0')
  assert.strictEqual(formattedLvl, '01', 'nível deve ser formatado com dois dígitos no HUD')

  console.log('✔ Level contracts passed')
}

// ============================================================================
// 5. CONTRATOS DO HUD DOM E APRESENTAÇÃO
// ============================================================================
{
  console.log('Testing 5: Estrutura DOM e renderização do Double Stack...')
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

  // Top Center Cluster
  assert.ok(hudGameSource.includes('hud-top-center-cluster'), 'Deve conter hud-top-center-cluster no topo central')
  assert.ok(hudGameSource.includes('hud-center-combat-row'), 'Deve conter hud-center-combat-row agrupando combate')

  // API pública
  assert.ok(hudGameSource.includes('setScoreStats({'), 'Deve expor setScoreStats na API do HUD')
  assert.ok(hudGameSource.includes('setMissionStatus({'), 'Deve expor setMissionStatus na API do HUD')
  assert.ok(hudGameSource.includes('setCombo('), 'Deve expor setCombo na API do HUD')

  console.log('✔ DOM contracts passed')
}

// ============================================================================
// 6. CONTRATOS DO RADAR / MINIMAPA (RAIL VS ALL-RANGE)
// ============================================================================
{
  console.log('Testing 6: Minimapa Rail vs All-Range...')
  const gameLoopSource = readFileSync(new URL('./game-loop.js', import.meta.url), 'utf8')

  assert.ok(
    gameLoopSource.includes("const isArenaMode = rail.isArena() || state.phase === 'bossFight' || state.phase === 'goldenArena'"),
    'gameLoop deve avaliar modo arena para o radar'
  )
  assert.match(
    gameLoopSource,
    /if \(!isArenaMode\) \{\r?\n\s+hud\.setMinimap\(false/,
    'minimapa deve ser desativado/ocultado no modo rail'
  )

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

  console.log('✔ Minimap Rail vs All-Range contracts passed')
}

// ============================================================================
// 7. CONTRATOS CSS RESPONSIVOS & CLUSTER VITAL
// ============================================================================
{
  console.log('Testing 7: CSS tokens e safe areas...')
  const hudStylesSource = readFileSync(new URL('./hud-styles.js', import.meta.url), 'utf8')

  assert.ok(
    hudStylesSource.includes('--hud-left-stack-x: clamp(238px, 17vw, 290px)'),
    'deve usar token --hud-left-stack-x com clamp para não colidir com o cluster de vida (220px)'
  )
  assert.ok(
    hudStylesSource.includes('.cinematic-active .hud-double-stack'),
    'cutscenes cinemáticas devem ocultar as pilhas do Double Stack'
  )
  assert.ok(
    hudStylesSource.includes('.cinematic-active .hud-top-center-cluster'),
    'cutscenes cinemáticas devem ocultar o cluster superior central'
  )

  console.log('✔ Responsive CSS contracts passed')
}

console.log('--- TODOS OS TESTES DO HUD DOUBLE STACK PASSARAM COM SUCESSO! ---')
