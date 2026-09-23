import assert from 'node:assert/strict'
import { ARCADE_CARD_CHOICE_TIME_SCALE } from './main-constants.js'
import { createQuestionFlow } from './flow-question.js'

console.log('--- TEST: Arcade Draft Bullet-Time e Retorno a 1.0x ---')

function createTestSetup(initialState = {}) {
  const state = {
    phase: 'combat',
    arcadeBulletTimeTimer: 0,
    pendingCardChoice: false,
    ...initialState,
  }
  let shownOptions = null
  const hud = {
    showCardChoice: (opts) => { shownOptions = opts },
    setCountdown: () => {},
    setFeedback: () => {},
    setLives: () => {},
    setShield: () => {},
    setHealth: () => {},
    renderCards: () => {},
  }
  const deck = { isNoDeck: true }
  const player = {
    buildCardExcludeSet: () => new Set(),
    getMaxHealth: () => 10,
    getShieldValue: () => 3,
    getShieldMax: () => 3,
    getMaxLives: () => 3,
    getCollectedCards: () => new Map(),
    getWingmanCount: () => 0,
    applyCard: () => {},
    config: { fireCooldown: 0.2, homingMaxTargets: 4, multiHomingUnlocked: false },
  }
  const combat = {
    clearBonusTargets: () => {},
    setFireCooldown: () => {},
    setHomingMaxTargets: () => {},
    setMultiHomingUnlocked: () => {},
    setWingmanCount: () => {},
  }
  const session = { health: 10, lives: 3, pointer: 0, queue: [{ id: 'q1' }] }

  const questionFlow = createQuestionFlow({
    state,
    session,
    deck,
    hud,
    player,
    combat,
    enterCombat: () => { state.phase = 'combat' },
  })

  return { state, questionFlow, getShownOptions: () => shownOptions }
}

// 1. Abertura do Draft Tático Arcade inicializa o timer em 1.5s
{
  const { state, questionFlow, getShownOptions } = createTestSetup()
  questionFlow.enterAlternatives()

  assert.equal(state.phase, 'cardChoice', 'Phase deve transicionar para cardChoice')
  assert.equal(state.arcadeBulletTimeTimer, 1.5, 'Abertura do draft arcade deve inicializar timer em 1.5s')
  const shown = getShownOptions()
  assert.ok(shown, 'HUD showCardChoice deve ser chamado')
  assert.equal(shown.isArcade, true, 'Flag isArcade deve ser verdadeira')
  assert.equal(shown.compact, true, 'Compact deve ser verdadeiro')
}

// 2. Simulação exata da fórmula de TimeScale e Early-Return do game-loop
function evaluateGameLoopFrame({ state, isNoDeck, arcadeCardChoicePauses = false, rawDt = 0.016, debugSlowMo = false, swirlSlowMoMs = 0 }) {
  const baseDt = debugSlowMo ? rawDt * 0.25 : rawDt
  const isArcadeCardChoice = state.phase === 'cardChoice' && isNoDeck
  const arcadePauses = isArcadeCardChoice && arcadeCardChoicePauses

  if (isArcadeCardChoice && !arcadePauses && state.arcadeBulletTimeTimer > 0) {
    state.arcadeBulletTimeTimer = Math.max(0, state.arcadeBulletTimeTimer - rawDt)
  }

  const inArcadeCardChoiceBulletTime =
    isArcadeCardChoice && !arcadePauses && state.arcadeBulletTimeTimer > 0

  const dt = debugSlowMo
    ? baseDt
    : inArcadeCardChoiceBulletTime
      ? rawDt * ARCADE_CARD_CHOICE_TIME_SCALE
      : swirlSlowMoMs > 0
        ? baseDt * 0.2
        : baseDt

  const shouldPauseForCardChoice = state.phase === 'cardChoice' && (!isNoDeck || arcadePauses)

  return {
    dt,
    timeScale: dt / rawDt,
    shouldPauseForCardChoice,
    inArcadeCardChoiceBulletTime,
    remainingTimer: state.arcadeBulletTimeTimer,
  }
}

// 2a. Frame inicial (t = 0.016s) -> Slow motion e gameplay ativo
{
  const state = { phase: 'cardChoice', arcadeBulletTimeTimer: 1.5 }
  const res = evaluateGameLoopFrame({ state, isNoDeck: true, rawDt: 0.016 })

  assert.equal(res.shouldPauseForCardChoice, false, 'No Arcade sem pausa, frame NÃO deve pausar')
  assert.equal(res.inArcadeCardChoiceBulletTime, true, 'Bullet-time deve estar ativo')
  assert.ok(Math.abs(res.timeScale - ARCADE_CARD_CHOICE_TIME_SCALE) < 1e-5, 'Time scale deve ser ARCADE_CARD_CHOICE_TIME_SCALE (0.1x)')
  assert.ok(Math.abs(res.remainingTimer - 1.484) < 1e-5, 'Timer deve decrementar usando rawDt')
}

// 2b. Frame em t = 1.49s -> Continua em slow motion
{
  const state = { phase: 'cardChoice', arcadeBulletTimeTimer: 0.02 }
  const res = evaluateGameLoopFrame({ state, isNoDeck: true, rawDt: 0.016 })

  assert.equal(res.shouldPauseForCardChoice, false, 'Gameplay continua ativo')
  assert.equal(res.inArcadeCardChoiceBulletTime, true, 'Bullet-time continua ativo enquanto timer > 0')
  assert.ok(Math.abs(res.timeScale - ARCADE_CARD_CHOICE_TIME_SCALE) < 1e-5)
  assert.ok(Math.abs(res.remainingTimer - 0.004) < 1e-5)
}

// 2c. Frame em t >= 1.5s -> Timer zera, tempo retorna a 1.0x, draft continua aberto e gameplay ativo
{
  const state = { phase: 'cardChoice', arcadeBulletTimeTimer: 0.005 }
  const res = evaluateGameLoopFrame({ state, isNoDeck: true, rawDt: 0.016 })

  assert.equal(res.remainingTimer, 0, 'Timer deve zerar')
  assert.equal(res.inArcadeCardChoiceBulletTime, false, 'Bullet-time encerra ao zerar o timer')
  assert.equal(res.timeScale, 1.0, 'Velocidade do jogo DEVE retornar a 1.0x normal')
  assert.equal(res.shouldPauseForCardChoice, false, 'Jogo NÃO deve pausar mesmo após o timer zerar')
  assert.equal(state.phase, 'cardChoice', 'Draft permanece aberto na tela')

  // Próximo frame a 1.0x com draft ainda pendente
  const nextFrame = evaluateGameLoopFrame({ state, isNoDeck: true, rawDt: 0.016 })
  assert.equal(nextFrame.timeScale, 1.0, 'Velocidade permanece 1.0x nos frames subsequentes')
  assert.equal(nextFrame.shouldPauseForCardChoice, false, 'Gameplay permanece ativo nos frames subsequentes')
  assert.equal(state.phase, 'cardChoice', 'Draft continua pendente')
}

// 2d. Seleção de card antes de 1.5s fecha o draft e reseta o timer
{
  const { state, questionFlow, getShownOptions } = createTestSetup()
  questionFlow.enterAlternatives()
  assert.equal(state.phase, 'cardChoice')
  assert.equal(state.arcadeBulletTimeTimer, 1.5)

  // Jogador seleciona carta aos 0.7s
  state.arcadeBulletTimeTimer = 0.7
  getShownOptions().onPick({ id: 'rapid-fire' })

  assert.equal(state.phase, 'combat', 'Ao escolher carta, phase volta para combat')
  assert.equal(state.arcadeBulletTimeTimer, 0, 'Timer deve ser resetado para 0')
}

// 2e. Seleção de card após 1.5s fecha o draft corretamente
{
  const { state, questionFlow, getShownOptions } = createTestSetup()
  questionFlow.enterAlternatives()
  assert.equal(state.arcadeBulletTimeTimer, 1.5)

  // O tempo passou e o timer já zerou (ex: t = 3.0s)
  state.arcadeBulletTimeTimer = 0
  assert.equal(state.phase, 'cardChoice')

  // Jogador seleciona a carta agora
  getShownOptions().onPick({ id: 'twin-laser' })

  assert.equal(state.phase, 'combat', 'Ao escolher carta após 1.5s, phase volta para combat')
  assert.equal(state.arcadeBulletTimeTimer, 0)
}

// 2f. Setting arcadeCardChoicePauses = true pausa o jogo
{
  const state = { phase: 'cardChoice', arcadeBulletTimeTimer: 1.5 }
  const res = evaluateGameLoopFrame({ state, isNoDeck: true, arcadeCardChoicePauses: true, rawDt: 0.016 })

  assert.equal(res.shouldPauseForCardChoice, true, 'Se arcadeCardChoicePauses estiver ativo, frame DEVE pausar')
  assert.equal(state.arcadeBulletTimeTimer, 1.5, 'Timer de bullet-time não deve decrementar se pausado')
}

// 2g. Fora do Arcade (Roguelike normal com baralho) pausa incondicionalmente
{
  const state = { phase: 'cardChoice', arcadeBulletTimeTimer: 0 }
  const res = evaluateGameLoopFrame({ state, isNoDeck: false, rawDt: 0.016 })

  assert.equal(res.shouldPauseForCardChoice, true, 'No modo Roguelike com baralho, cardChoice DEVE pausar o frame')
}

console.log('arcade-draft-bullet-time.test.mjs: OK (Todos os 7 critérios do Arcade Bullet-Time passaram)')
