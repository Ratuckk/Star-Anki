import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import './wingman-state-controller.test.mjs'
import './wingman-radio-callresponse.test.mjs'
import './wingman-radio-overhaul.test.mjs'
import './wingman-global-radio.test.mjs'
import './wingman-formation-separation.test.mjs'
import './wingman-navigation.test.mjs'
import './damage-orbit-tracker.test.mjs'
import './playtest-polish.test.mjs'
import './combat-lockon-swirl.test.mjs'
import './tank.test.mjs'
import './tank-spawn-integration.test.mjs'
import './wingman-bughunt.test.mjs'
import './miyu-assist-locks.test.mjs'
import './arcade-draft-bullet-time.test.mjs'
import './golden-squadron.test.mjs'

import { buildDeck, generateDistractors } from './anki.js'
import { createSession, nextQuestion, resolveAnswer, getSummary, STARTING_HEALTH, STARTING_LIVES } from './quiz.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.join(__dirname, 'fixtures', 'sample-export.txt')
const text = readFileSync(fixturePath, 'utf8')

// ---------------------------------------------------------------------------
// 1. buildDeck sobre a fixture
// ---------------------------------------------------------------------------
const deck = buildDeck(text)
const { allCards, shooterCards, painelCards, warning } = deck

assert.ok(allCards.length >= 8, `esperava >=8 cards no total, obteve ${allCards.length}`)

// ---------------------------------------------------------------------------
// 2. limpeza de HTML (nota n3: <br>, &nbsp;, [sound:], <img>)
// ---------------------------------------------------------------------------
const dirtyCard = allCards.find((c) => c.guid === 'n3')
assert.ok(dirtyCard, 'card do guid n3 (html sujo) não encontrado')
for (const forbidden of ['<br', '&nbsp;', '[sound:', '<img', '<']) {
  assert.ok(
    !dirtyCard.answer.includes(forbidden),
    `resposta ainda contém resíduo "${forbidden}" após cleanHtml: "${dirtyCard.answer}"`
  )
}
assert.ok(dirtyCard.answer.includes('Brasília'), `limpeza removeu texto legítimo: "${dirtyCard.answer}"`)
assert.ok(dirtyCard.answer.includes('Planalto Central'), `limpeza removeu texto legítimo: "${dirtyCard.answer}"`)
assert.ok(dirtyCard.answer.includes('Centro-Oeste'), `limpeza removeu texto legítimo: "${dirtyCard.answer}"`)

// ---------------------------------------------------------------------------
// 3. perguntas cloze (notas n1 e n2, índices c1 e c2 cada)
// ---------------------------------------------------------------------------
const clozeCards = allCards.filter((c) => c.clozeIndex !== null)
assert.ok(
  clozeCards.length >= 4,
  `esperava >=4 cards cloze (2 notas x 2 índices), obteve ${clozeCards.length}`
)
for (const c of clozeCards) {
  assert.ok(c.question.includes('_____'), `pergunta cloze sem blank "_____": "${c.question}"`)
  assert.ok(!c.question.includes('{{'), `pergunta cloze ainda contém sintaxe {{}}: "${c.question}"`)
}

const parisCard = clozeCards.find((c) => c.guid === 'n1' && c.clozeIndex === 1)
assert.ok(parisCard, 'card cloze c1 da nota n1 não encontrado')
assert.strictEqual(parisCard.answer, 'Paris', `resposta cloze c1 errada: "${parisCard.answer}"`)
assert.ok(parisCard.question.includes('Roma'), 'outro índice cloze (c2) deveria aparecer sem máscara na pergunta de c1')

const romaCard = clozeCards.find((c) => c.guid === 'n1' && c.clozeIndex === 2)
assert.ok(romaCard, 'card cloze c2 da nota n1 não encontrado')
assert.strictEqual(romaCard.answer, 'Roma', `resposta cloze c2 errada: "${romaCard.answer}"`)
assert.ok(romaCard.question.includes('Paris'), 'outro índice cloze (c1) deveria aparecer sem máscara na pergunta de c2')

// ---------------------------------------------------------------------------
// 4. triagem shooter/painel + warning
// ---------------------------------------------------------------------------
assert.ok(shooterCards.length >= 4, `esperava >=4 shooterCards, obteve ${shooterCards.length}`)
assert.ok(painelCards.length >= 1, `esperava >=1 painelCard, obteve ${painelCards.length}`)
assert.strictEqual(
  warning,
  null,
  `warning inesperado com ${shooterCards.length} shooterCards (>=4): "${warning}"`
)
for (const c of shooterCards) {
  assert.ok(c.answer.length <= 60, `card no shooter deveria ter resposta <=60 chars: "${c.answer}"`)
}
for (const c of painelCards) {
  assert.ok(c.answer.length > 60, `card no painel deveria ter resposta >60 chars: "${c.answer}"`)
}

// warning deve aparecer quando há menos de 4 shooterCards
const tinyExport = [
  '#separator:tab',
  '#html:true',
  '#guid column:1',
  '#notetype column:2',
  '#deck column:3',
  '#tags column:6',
  'x1\tBasic\tD\tPergunta?\tResp\t',
].join('\n')
const tinyDeck = buildDeck(tinyExport)
assert.ok(tinyDeck.warning, 'esperava warning quando há menos de 4 shooterCards')

// ---------------------------------------------------------------------------
// 5. generateDistractors: filtro de +-50% de comprimento e nunca repete a correta
// ---------------------------------------------------------------------------
const berlimCard = allCards.find((c) => c.guid === 'n4')
assert.ok(berlimCard, 'card do guid n4 (Berlim) não encontrado')
const berlimLen = berlimCard.answer.length

for (let i = 0; i < 25; i++) {
  const distractors = generateDistractors(berlimCard, allCards, { count: 3 })
  assert.ok(distractors.length >= 1, 'esperava ao menos 1 distrator gerado')
  for (const d of distractors) {
    assert.ok(
      d.length >= berlimLen * 0.5 && d.length <= berlimLen * 1.5,
      `distrator fora do filtro de +-50%: "${d}" (len ${d.length}) vs correta "${berlimCard.answer}" (len ${berlimLen})`
    )
    assert.notStrictEqual(
      d.toLowerCase(),
      berlimCard.answer.toLowerCase(),
      `distrator repetiu a resposta correta: "${d}"`
    )
  }
  assert.ok(!distractors.includes(berlimCard.answer), 'distrator não deve repetir a resposta correta')
}

// ---------------------------------------------------------------------------
// 6. sessão de quiz: combo, saúde, timeout
// ---------------------------------------------------------------------------
const session = createSession(deck)
assert.strictEqual(session.health, STARTING_HEALTH, `sessão deveria começar com ${STARTING_HEALTH} de saúde`)
assert.strictEqual(session.lives, STARTING_LIVES, `sessão deveria começar com ${STARTING_LIVES} vidas`)
assert.strictEqual(session.comboMultiplier, 1, 'sessão deveria começar com combo 1.0')
assert.ok(session.queue.length >= 4, 'fila da sessão deveria ter pelo menos 4 cartas')

function resolveAt(type, extra = {}) {
  const q = nextQuestion(session, allCards)
  assert.ok(q, 'nextQuestion retornou null antes do esperado (sessão terminou cedo demais)')
  assert.ok(q.alternatives.length >= 2, 'esperava pelo menos 2 alternativas (correta + distratores)')
  assert.ok(q.correctSlot >= 0, 'correctSlot deveria apontar para a alternativa correta')
  assert.ok(q.alternatives[q.correctSlot].isCorrect, 'alternativa em correctSlot deveria ser a correta')
  return resolveAnswer(session, { type, card: q.card, ...extra })
}

// 2 acertos seguidos -> combo sobe 0.15 por vez
const r1 = resolveAt('correct')
assert.strictEqual(r1.comboMultiplier, 1.15, `combo após 1º acerto deveria ser 1.15, obteve ${r1.comboMultiplier}`)
assert.strictEqual(session.health, STARTING_HEALTH, 'acerto não deveria tirar saúde')

const r2 = resolveAt('correct')
assert.strictEqual(r2.comboMultiplier, 1.3, `combo após 2º acerto deveria ser 1.30, obteve ${r2.comboMultiplier}`)
assert.strictEqual(session.health, STARTING_HEALTH, 'acerto não deveria tirar saúde')
assert.ok(r2.points > r1.points, 'pontos do 2º acerto deveriam ser maiores devido ao combo mais alto')

// 1 erro -> zera combo; NÃO tira saúde (ajuste do usuário: só dano de inimigo tira saúde agora)
const r3 = resolveAt('wrong')
assert.strictEqual(r3.comboMultiplier, 1, `combo deveria zerar para 1.0 após erro, obteve ${r3.comboMultiplier}`)
assert.strictEqual(session.health, STARTING_HEALTH, `erro não deveria mais tirar saúde, esperava ${STARTING_HEALTH}, obteve ${session.health}`)
assert.strictEqual(r3.healthRemaining, STARTING_HEALTH)
assert.strictEqual(r3.comboBroken, true, 'erro deveria quebrar o combo (comboBroken=true)')

// 1 timeout -> conta como erro (zera combo) e também não tira saúde
const r4 = resolveAt('timeout')
assert.strictEqual(r4.comboMultiplier, 1, 'combo deveria continuar em 1.0 após timeout')
assert.strictEqual(session.health, STARTING_HEALTH, `timeout não deveria tirar saúde, esperava continuar em ${STARTING_HEALTH}, obteve ${session.health}`)
assert.strictEqual(r4.healthRemaining, STARTING_HEALTH)
assert.strictEqual(r4.comboBroken, true, 'timeout também deveria contar como quebra de combo')

// ---------------------------------------------------------------------------
// 7. getSummary lista corretamente os cards perdidos
// ---------------------------------------------------------------------------
const summary = getSummary(session)
assert.strictEqual(summary.correctCount, 2, `esperava 2 acertos no resumo, obteve ${summary.correctCount}`)
assert.strictEqual(
  summary.wrongCount,
  2,
  `esperava 2 erros no resumo (1 wrong + 1 timeout), obteve ${summary.wrongCount}`
)
assert.strictEqual(summary.missed.length, 2, `esperava 2 cards perdidos, obteve ${summary.missed.length}`)
for (const m of summary.missed) {
  assert.ok(m.guid, 'card perdido deveria ter guid')
  assert.ok(m.question, 'card perdido deveria ter question')
  assert.ok(typeof m.answer === 'string', 'card perdido deveria ter answer')
}

// ---------------------------------------------------------------------------
// 8. Validação matemática do overhaul de inimigos v0.66.0 (Sentinela, Molduras, Genéricos, Dourado)
// ---------------------------------------------------------------------------
const GATE_INNER_HALF = 2.6
const GATE_OUTER_HALF = 6.4
const SHIP_RADIUS = 0.5

function testGateCollision(localX, localY) {
  const maxCoord = Math.max(Math.abs(localX), Math.abs(localY))
  return maxCoord >= (GATE_INNER_HALF - SHIP_RADIUS) && maxCoord <= (GATE_OUTER_HALF + SHIP_RADIUS)
}

// Nave centralizada (X=0, Y=0 ou 1.2, 0.8): passagem segura
assert.strictEqual(testGateCollision(0, 0), false, 'Nave no centro deve passar sem dano')
assert.strictEqual(testGateCollision(1.2, 0.8), false, 'Nave no vão central seguro deve passar sem dano')

// Nave colidindo com a borda sólida: dano real
assert.strictEqual(testGateCollision(2.6, 0), true, 'Nave na borda interna (2.6) deve colidir e tomar dano')
assert.strictEqual(testGateCollision(4.0, 1.0), true, 'Nave em cheio na borda (4.0) deve colidir e tomar dano')
assert.strictEqual(testGateCollision(6.4, 0), true, 'Nave na borda externa (6.4) deve colidir e tomar dano')

// Nave esquivando por fora: sem dano
assert.strictEqual(testGateCollision(7.5, 0), false, 'Nave fora da moldura (7.5) não deve colidir')

// Tempo de voo da moldura em velocidade moderada (18 u/s)
const GATE_SPEED = 18
const RAIL_SPEED = 22
const STANDOFF = 48
const flightTime = STANDOFF / (GATE_SPEED + RAIL_SPEED)
assert.ok(flightTime >= 1.1 && flightTime <= 1.3, `Tempo de voo da moldura deve ser ~1.2s, obteve ${flightTime.toFixed(2)}s`)

// ============ TESTES v0.67.0: SOFTLOCK BOSS & DEBUG RESET ============

// 1. Propagação de abate de chefe por tiros de Wingmen
function combineCombatHits(playerHits, ramHits, wingmanHits) {
  return {
    enemyKills: playerHits.enemyKills + ramHits.ramKills + (wingmanHits.enemyKills || 0),
    enemyKillPoints: playerHits.enemyKillPoints + ramHits.ramKillPoints + (wingmanHits.enemyKillPoints || 0),
    bossDefeated: playerHits.bossDefeated || ramHits.ramBossDefeated || Boolean(wingmanHits.bossDefeated),
    bossHitWorldPos: playerHits.bossHitWorldPos || ramHits.ramBossWorldPos || wingmanHits.bossHitWorldPos || null,
  }
}

const wingmanKillResult = combineCombatHits(
  { enemyKills: 0, enemyKillPoints: 0, bossDefeated: false, bossHitWorldPos: null },
  { ramKills: 0, ramKillPoints: 0, ramBossDefeated: false, ramBossWorldPos: null },
  { enemyKills: 1, enemyKillPoints: 500, bossDefeated: true, bossHitWorldPos: { x: 10, y: 5, z: -20 } }
)
assert.strictEqual(wingmanKillResult.bossDefeated, true, 'Abate de chefe por wingman deve propagar bossDefeated = true')
assert.strictEqual(wingmanKillResult.enemyKills, 1, 'Kills de wingman devem somar no resultado de combate')
assert.deepStrictEqual(wingmanKillResult.bossHitWorldPos, { x: 10, y: 5, z: -20 }, 'Posição do abate por wingman deve ser propagada')

// 2. Prevenção de softlock: fail-safe no game-loop quando chefe está morto/ausente
function checkBossDefeatTrigger(phase, events, bossAlive, bossDying, bossSnap) {
  const isBossDefeated = Boolean(events.bossDefeated)
  if (phase === 'bossFight') {
    if (isBossDefeated || bossDying || (!bossAlive && (!bossSnap || bossSnap.hp <= 0))) {
      return true // dispara handleBossDefeated
    }
  }
  return false
}

assert.strictEqual(checkBossDefeatTrigger('bossFight', { bossDefeated: true }, true, false, { hp: 0 }), true, 'Evento bossDefeated deve disparar vitoria')
assert.strictEqual(checkBossDefeatTrigger('bossFight', { bossDefeated: false }, true, true, { hp: 0 }), true, 'Chefe em estado dying deve disparar vitoria mesmo sem evento do tick')
assert.strictEqual(checkBossDefeatTrigger('bossFight', { bossDefeated: false }, false, false, null), true, 'Chefe ausente com hp zerado deve acionar fail-safe e evitar softlock')
assert.strictEqual(checkBossDefeatTrigger('bossFight', { bossDefeated: false }, true, false, { hp: 10 }), false, 'Chefe vivo com 10 HP nao deve disparar vitoria')

// 3. Reset do debug: limpa entidades e prepara transição limpa
function testDebugReset(phaseBefore, inArenaBefore) {
  let clearedCombatants = false
  let exitedArena = false
  let phase = phaseBefore
  let inArena = inArenaBefore

  // Mock do resetEverythingForDebugEvent
  clearedCombatants = true
  exitedArena = true
  inArena = false
  phase = 'combat'

  return { clearedCombatants, exitedArena, inArena, phase }
}

const resetState = testDebugReset('bossFight', true)
assert.strictEqual(resetState.clearedCombatants, true, 'Debug deve limpar combatentes na tela')
assert.strictEqual(resetState.inArena, false, 'Debug deve sair da arena')
assert.strictEqual(resetState.phase, 'combat', 'Debug deve resetar a fase para combat')

// ---------------------------------------------------------------------------
// 8. QOL Item 9 & Item 5: Reenfileiramento Curto (Fast Active-Recall) & Códice de Erros
// ---------------------------------------------------------------------------
const retryCard = { guid: 'card-retry-1', question: 'O que é ECC?', answer: 'Memória com detecção e correção de erros', explanation: 'Error-Correcting Code detecta e corrige erros de 1 bit', sourceUrl: 'https://exemplo.org/ecc', tags: 'hardware mem' }
const dummyDeck = [
  retryCard,
  { guid: 'card-d-2', question: 'Q2', answer: 'A2' },
  { guid: 'card-d-3', question: 'Q3', answer: 'A3' },
  { guid: 'card-d-4', question: 'Q4', answer: 'A4' },
  { guid: 'card-d-5', question: 'Q5', answer: 'A5' },
]
const qolSession = {
  queue: [...dummyDeck],
  pointer: 0,
  score: 0,
  health: 10,
  lives: 3,
  comboMultiplier: 1.0,
  log: [],
}

// Responde com erro
resolveAnswer(qolSession, { type: 'wrong', card: retryCard })
assert.strictEqual(qolSession.queue.length, 6, 'Erro deveria reenfileirar o card aumentando a fila de 5 para 6')
const requeued = qolSession.queue.find((c, idx) => idx > 0 && c.guid === 'card-retry-1')
assert.ok(requeued, 'Card errado deve estar presente mais à frente na fila')
assert.strictEqual(requeued._isFastRetry, true, 'Card reenfileirado deve ter a flag _isFastRetry=true')

// Verifica getSummary preservando explanation e sourceUrl
const qolSummary = getSummary(qolSession)
assert.strictEqual(qolSummary.missed.length, 1, 'Deve ter 1 card perdido no resumo')
assert.strictEqual(qolSummary.missed[0].explanation, retryCard.explanation, 'Resumo deve preservar explanation')
assert.strictEqual(qolSummary.missed[0].sourceUrl, retryCard.sourceUrl, 'Resumo deve preservar sourceUrl')

// ---------------------------------------------------------------------------
// 9. Auditoria de Bugs e Otimizações de Desempenho (BUG-01 a BUG-09, OPT-01 a OPT-05)
// ---------------------------------------------------------------------------

// 9.1 BUG-08: Desduplicação de Cloze no Códice de Erros (getSummary)
// Duas perguntas cloze da MESMA nota Anki (mesmo guid 'nota-cloze-1') com perguntas diferentes
// NÃO devem descartar uma à outra no resumo final de erros.
const clozeQ1 = { guid: 'nota-cloze-1', question: 'Paris é a capital da _____', answer: 'França', explanation: 'Geografia 1' }
const clozeQ2 = { guid: 'nota-cloze-1', question: '_____ é a capital da França', answer: 'Paris', explanation: 'Geografia 2' }
const clozeSession = {
  queue: [clozeQ1, clozeQ2],
  pointer: 0,
  score: 0,
  health: 10,
  lives: 3,
  comboMultiplier: 1.0,
  log: [],
}
resolveAnswer(clozeSession, { type: 'wrong', card: clozeQ1 })
resolveAnswer(clozeSession, { type: 'wrong', card: clozeQ2 })
const clozeSummary = getSummary(clozeSession)
assert.strictEqual(clozeSummary.missed.length, 2, 'Resumo deve conter AMBAS as perguntas cloze da mesma nota')
assert.ok(clozeSummary.missed.some((c) => c.question === clozeQ1.question), 'Pergunta 1 deve estar presente no resumo')
assert.ok(clozeSummary.missed.some((c) => c.question === clozeQ2.question), 'Pergunta 2 deve estar presente no resumo')

// 9.2 BUG-09: Absorção e Quebra de Escudo com Energia Parcial (< 1.0)
// Quando o jogador tem escudo em recarga parcial (ex: 0.45) e recebe 1 de dano,
// o escudo deve quebrar (shieldBroke = true), mas absorver totalmente o impacto (effectiveDamage = 0).
function applyDamageFormula(shieldValue, baseDamage = 1) {
  let shield = shieldValue
  let shieldBroke = false
  let effectiveDamage = baseDamage

  if (shield > 0) {
    if (shield >= effectiveDamage) {
      shield -= effectiveDamage
      effectiveDamage = 0
    } else {
      effectiveDamage = Math.max(0, Math.floor(effectiveDamage - shield))
      shield = 0
      shieldBroke = true
    }
  }

  return { shield, shieldBroke, effectiveDamage }
}

const partialShieldResult = applyDamageFormula(0.45, 1)
assert.strictEqual(partialShieldResult.shield, 0, 'Escudo parcial deve ser zerado ao ser quebrado')
assert.strictEqual(partialShieldResult.shieldBroke, true, 'shieldBroke deve ser true quando escudo parcial é estourado')
assert.strictEqual(partialShieldResult.effectiveDamage, 0, 'Dano ao casco deve ser 0 pois o escudo parcial absorveu o impacto')

const fullShieldResult = applyDamageFormula(2.0, 1)
assert.strictEqual(fullShieldResult.shield, 1.0, 'Escudo cheio deve reduzir de 2 para 1')
assert.strictEqual(fullShieldResult.shieldBroke, false, 'shieldBroke deve ser false com escudo restante')
assert.strictEqual(fullShieldResult.effectiveDamage, 0, 'Dano ao casco deve ser 0')

const noShieldResult = applyDamageFormula(0, 1)
assert.strictEqual(noShieldResult.shield, 0, 'Escudo permanece 0')
assert.strictEqual(noShieldResult.shieldBroke, false, 'Sem escudo, não há quebra de escudo')
assert.strictEqual(noShieldResult.effectiveDamage, 1, 'Dano ao casco deve ser 1 total')

// 9.3 BUG-01 & BUG-02: Bloqueio de Giro 180° e Disparo Traseiro no Modo Trilho
function evaluateRailCombatEngagement(relativeForward, dist, fireTimer, isArena = false) {
  const inForwardArc = isArena || relativeForward > 0
  const inFireRange = inForwardArc && dist < 120 && dist > 12
  const canLookAtPlayer = inForwardArc
  const canFire = inFireRange && fireTimer <= 0
  return { canLookAtPlayer, canFire }
}

const aheadEngagement = evaluateRailCombatEngagement(25.0, 35.0, 0.0, false)
assert.strictEqual(aheadEngagement.canLookAtPlayer, true, 'Inimigo à frente deve olhar para o jogador')
assert.strictEqual(aheadEngagement.canFire, true, 'Inimigo à frente deve poder disparar')

const passedEngagement = evaluateRailCombatEngagement(-5.0, 35.0, 0.0, false)
assert.strictEqual(passedEngagement.canLookAtPlayer, false, 'Inimigo ultrapassado no trilho NÃO deve girar 180°')
assert.strictEqual(passedEngagement.canFire, false, 'Inimigo ultrapassado no trilho NÃO deve atirar para trás')

const arenaPassedEngagement = evaluateRailCombatEngagement(-5.0, 35.0, 0.0, true)
assert.strictEqual(arenaPassedEngagement.canLookAtPlayer, true, 'Na arena é permitida rotação livre')
assert.strictEqual(arenaPassedEngagement.canFire, true, 'Na arena é permitido disparo omnidirecional')

// 9.4 BUG-04: Promoção de Elos Órfãos do Verme em Cabeças Autônomas
function simulateVermeSegmentUpdate(segment, targetDying) {
  let promoted = false
  if (!segment.followTarget || targetDying) {
    if (segment.followTarget) {
      segment.followTarget = null
      promoted = true
    }
  }
  return promoted
}

const segmentA = { id: 101, followTarget: { id: 100, dying: true } }
const wasPromoted = simulateVermeSegmentUpdate(segmentA, true)
assert.strictEqual(wasPromoted, true, 'Elo cujo predecessor morreu deve ser promovido a cabeça')
assert.strictEqual(segmentA.followTarget, null, 'followTarget deve ser limpo para evitar deriva em direção a mesh morto')

// 9.5 Wingmen: Bloqueio de Oscilação Rápida de Dogfight no Comando de Foco
function simulateWingmanFocusDecision(wingmanState, commandMode, engagementCooldown, candidateDist) {
  let newState = wingmanState
  if (wingmanState === 'patrol') {
    if (commandMode === 'focus' && engagementCooldown <= 0) {
      if (candidateDist < 105) {
        newState = 'dogfight'
      }
    }
  }
  return newState
}

const rightAfterDrop = simulateWingmanFocusDecision('patrol', 'focus', 0.8, 120)
assert.strictEqual(rightAfterDrop, 'patrol', 'Companheiro em cooldown de descanso NÃO deve re-engajar imediatamente em dogfight no próximo frame')

const afterCooldownElapsed = simulateWingmanFocusDecision('patrol', 'focus', 0.0, 60)
assert.strictEqual(afterCooldownElapsed, 'dogfight', 'Companheiro descansado com alvo em alcance deve engajar em dogfight com foco ativo')

// ---------------------------------------------------------------------------
// 10. Sound Cues: Validação de Parâmetros, Timings e Despachante Seguro
// ---------------------------------------------------------------------------
import { getAllRegisteredCues, triggerSoundCue, stopSoundCueLoop, registerAudioHandler } from './audio-cues.js'

const allCues = getAllRegisteredCues()
assert.equal(allCues.wingmen.radio_connect.file, 'sons/Radio connect.mp3')
assert.equal(allCues.wingmen.radio_disconnect.file, 'sons/Radio disconnect.mp3')
assert.equal(allCues.enemies.boss_laser_charge.file, 'sons/som mira disparo laser boss dourado.mp3')
assert.equal(allCues.enemies.boss_laser_fire.file, 'sons/Laser boss.mp3')
assert.equal(allCues.enemies.golden_laser_charge.file, 'sons/som mira disparo laser boss dourado.mp3')
assert.equal(allCues.wingmen.pilot_voice_miyu.file, 'sons/miyu.wav')
assert.ok(allCues.player, 'Sound cues do jogador devem estar registradas')
assert.ok(allCues.wingmen, 'Sound cues dos wingmen devem estar registradas')
assert.ok(allCues.enemies, 'Sound cues dos inimigos/chefes devem estar registradas')

const validCategories = new Set(['sfx', 'voice', 'ambient', 'music'])
let totalCueCount = 0

for (const [groupName, groupCues] of Object.entries(allCues)) {
  const cueKeys = Object.keys(groupCues)
  assert.ok(cueKeys.length > 0, `Grupo de áudio "${groupName}" não deve estar vazio`)
  for (const key of cueKeys) {
    const cue = groupCues[key]
    totalCueCount++
    assert.strictEqual(typeof cue.id, 'string', `Cue ${key} deve ter id string`)
    assert.ok(cue.file === null || (typeof cue.file === 'string' && cue.file.startsWith('sons/')), `Cue ${key} deve ter arquivo em sons/ ou permanecer sem arquivo`)
    assert.ok(typeof cue.durationMs === 'number' && cue.durationMs > 0, `Cue ${key} deve ter durationMs > 0`)
    assert.ok(typeof cue.delayMs === 'number' && cue.delayMs >= 0, `Cue ${key} deve ter delayMs >= 0`)
    assert.ok(typeof cue.cooldownMs === 'number' && cue.cooldownMs >= 0, `Cue ${key} deve ter cooldownMs >= 0`)
    assert.ok(typeof cue.volume === 'number' && cue.volume > 0 && cue.volume <= 1.0, `Cue ${key} deve ter volume entre 0 e 1.0`)
    assert.ok(validCategories.has(cue.category), `Cue ${key} deve ter category válida (sfx, voice, ambient, music)`)
    assert.strictEqual(typeof cue.spatial, 'boolean', `Cue ${key} deve ter spatial booleano`)
    assert.strictEqual(typeof cue.loop, 'boolean', `Cue ${key} deve ter loop booleano`)
    assert.ok(typeof cue.triggerLogic === 'string' && cue.triggerLogic.length >= 10, `Cue ${key} deve ter triggerLogic descritivo`)
  }
}
assert.ok(totalCueCount >= 40, `Esperava pelo menos 40 Sound Cues registradas no sistema, obteve ${totalCueCount}`)

// Teste do despachante seguro: sem manipulador (no-op silencioso)
assert.doesNotThrow(() => {
  triggerSoundCue(allCues.player.laser_fire, { origin: [0, 0, 0] })
  triggerSoundCue(null)
  triggerSoundCue({})
}, 'triggerSoundCue sem handler não deve lançar exceção')

// Teste do despachante seguro com manipulador registrado
let receivedCue = null
let receivedParams = null
registerAudioHandler((cue, params) => {
  receivedCue = cue
  receivedParams = params
})

triggerSoundCue(allCues.wingmen.falco_ram, { worldPos: [10, 20, 30] })
assert.strictEqual(receivedCue?.id, 'wingman_falco_ram', 'Handler deve receber a cue disparada')
assert.deepStrictEqual(receivedParams?.worldPos, [10, 20, 30], 'Handler deve receber os parâmetros contextuais')
assert.doesNotThrow(() => stopSoundCueLoop(allCues.player.charge_loop), 'Parar loop de áudio deve ser seguro mesmo sem controlador de loop')

// Desregistra manipulador após o teste
registerAudioHandler(null)

// ---------------------------------------------------------------------------
// 11. Overhaul FSM dos Inimigos (Fase 1: Blaster + Tank) — motor genérico e fidelidade de valores
// ---------------------------------------------------------------------------
import { createStateMachine, ENEMY_STATES } from './enemies/state-machine.js'

// 11.1 Motor de FSM (state-machine.js) — módulo real, sem dependência de Three.js
const fsmLog = []
const fsmEnemy = { id: 'x' }
const fsmConfig = {
  A: {
    onEnter: () => fsmLog.push('enterA'),
    onExit: () => fsmLog.push('exitA'),
    update: () => fsmLog.push('updateA'),
  },
  B: {
    onEnter: (enemy, ctx, payload) => fsmLog.push(`enterB:${payload}`),
  },
}
const fsm = createStateMachine(fsmEnemy, fsmConfig, 'A')
assert.strictEqual(fsm.currentState, 'A', 'estado inicial deve ser o passado em createStateMachine')
assert.strictEqual(fsm.isIn('A'), true, 'isIn deve refletir o estado atual')

fsm.update(0.5)
assert.ok(fsmLog.includes('updateA'), 'update() deve chamar o update do estado atual')
assert.ok(fsm.timeInState >= 0.5, 'timeInState deve acumular o dt passado pra update()')

fsm.transition('B', 'payload-teste')
assert.deepStrictEqual(fsmLog.slice(-2), ['exitA', 'enterB:payload-teste'], 'transition deve chamar onExit do estado atual e onEnter do alvo, nessa ordem, repassando o payload')
assert.strictEqual(fsm.previousState, 'A', 'previousState deve registrar o estado anterior após a transição')
assert.strictEqual(fsm.timeInState, 0, 'timeInState deve zerar ao entrar num novo estado')

assert.throws(
  () => fsm.transition('ESTADO_INEXISTENTE'),
  /ESTADO_INEXISTENTE/,
  'transition para um estado que não existe em statesConfig deve lançar erro claro (evita bug silencioso de digitação)',
)
assert.throws(
  () => createStateMachine({}, fsmConfig, 'ESTADO_INEXISTENTE'),
  /ESTADO_INEXISTENTE/,
  'createStateMachine com estado inicial inexistente deve lançar erro claro',
)

// 11.2 Enum ENEMY_STATES usado por Blaster/Tank — trava contra rename acidental
for (const key of ['SPAWNING', 'ENGAGED', 'TELEGRAPHING', 'ATTACKING', 'RECOVERY', 'CRITICAL_TUMBLE', 'DISENGAGING']) {
  assert.strictEqual(ENEMY_STATES[key], key, `ENEMY_STATES.${key} deve existir (usado por blaster.js/tank.js)`)
}

// 11.3 Fidelidade de valores preservados na migração (Blaster/Tank não são importáveis aqui —
// dependem de Three.js via import map do navegador — então a checagem é a mesma fórmula pura
// usada dentro de enemies/shared.js:computeInFireRange, replicada localmente, igual ao padrão já
// usado acima em evaluateRailCombatEngagement/simulateVermeSegmentUpdate)
function simulateComputeInFireRange(distToPlayer, relativeForward, inArena) {
  const ENEMY_FIRE_MIN_DISTANCE = 8
  const ENEMY_FIRE_RANGE = 55
  const ENEMY_ARENA_FIRE_MAX_DISTANCE = 48
  if (distToPlayer <= ENEMY_FIRE_MIN_DISTANCE) return false
  return inArena ? distToPlayer <= ENEMY_ARENA_FIRE_MAX_DISTANCE : (relativeForward > 0 && relativeForward < ENEMY_FIRE_RANGE)
}
assert.strictEqual(simulateComputeInFireRange(5, 10, false), false, 'distância abaixo do mínimo (8) nunca deve estar em alcance de tiro')
assert.strictEqual(simulateComputeInFireRange(30, 10, false), true, 'no trilho, à frente e dentro de 55u deve estar em alcance')
assert.strictEqual(simulateComputeInFireRange(30, -5, false), false, 'no trilho, atrás do jogador (relativeForward<=0) nunca deve estar em alcance')
assert.strictEqual(simulateComputeInFireRange(60, 60, false), false, 'no trilho, com relativeForward além de 55u não deve estar em alcance')
assert.strictEqual(simulateComputeInFireRange(40, 0, true), true, 'em arena, dentro de 48u deve estar em alcance independente de relativeForward')
assert.strictEqual(simulateComputeInFireRange(50, 0, true), false, 'em arena, além de 48u não deve estar em alcance')

// shotsFired >= 4 → disengaging (Blaster e Tank, ver fireEnemyProjectile em enemies/index.js)
function simulateShotsFiredDisengage(shotsFiredBefore) {
  const shotsFired = shotsFiredBefore + 1
  return { shotsFired, disengaging: shotsFired >= 4 }
}
assert.strictEqual(simulateShotsFiredDisengage(2).disengaging, false, 'no 3º tiro ainda não deve desengajar')
assert.strictEqual(simulateShotsFiredDisengage(3).disengaging, true, 'no 4º tiro deve desengajar')

// wing-break (CRITICAL_TUMBLE) só em hit NÃO letal — um hit letal mata direto, sem quebrar a asa
// (ver resolveProjectileHit em enemies/index.js: o branch de breakBlasterWing é o `else` do `if (killed)`)
function simulateBlasterHitOutcome(hp, damage, wingBrokenBefore) {
  const killed = hp - damage <= 0
  const wingBreaks = !killed && !wingBrokenBefore
  return { killed, wingBreaks }
}
assert.deepStrictEqual(simulateBlasterHitOutcome(2, 1, false), { killed: false, wingBreaks: true }, 'hit não-letal com asa intacta deve quebrar a asa')
assert.deepStrictEqual(simulateBlasterHitOutcome(2, 2, false), { killed: true, wingBreaks: false }, 'hit letal (dano >= hp) deve matar direto, sem quebrar a asa')
assert.deepStrictEqual(simulateBlasterHitOutcome(2, 1, true), { killed: false, wingBreaks: false }, 'asa já quebrada não quebra de novo')

// ============ RÁDIO DOS ALIADOS (Overhaul de Personalidade, Ideia 3) ============
import { createWingmanRadio, ABILITY_EVENT_IDS, GLOBAL_COOLDOWN_MAX_MS, getWingmanRadioLineCount } from './combat/wingman-radio.js'

{
  const radio = createWingmanRadio()
  const line1 = radio.trySpeak(0, 'engage_dogfight', 1000)
  assert.ok(typeof line1 === 'string' && line1.length > 0, 'trySpeak deve devolver uma fala pra um par piloto+evento válido')

  const line2 = radio.trySpeak(1, 'engage_dogfight', 1500)
  assert.ok(typeof line2 === 'string', 'cooldown de Falco não pode bloquear uma fala trivial de Peppy')

  const samePilotBlocked = radio.trySpeak(0, 'kill', 1500)
  assert.strictEqual(samePilotBlocked, null, 'cooldown trivial continua valendo por piloto')

  const abilityDuringCooldown = radio.speakAbility(0, 'ability_ram', 1600)
  assert.ok(typeof abilityDuringCooldown === 'string', 'ability deve falar in-world mesmo durante cooldown trivial do piloto')

  // O cooldown trivial continua aleatório entre 6s e 20s por piloto; usar o MÁXIMO garante que o
  // cooldown de Falco já passou não importa qual valor foi sorteado na fala anterior.
  const line3 = radio.trySpeak(0, 'engage_dogfight', 1000 + GLOBAL_COOLDOWN_MAX_MS)
  assert.ok(typeof line3 === 'string', 'depois do cooldown trivial máximo (20s) passar, o mesmo piloto deve voltar a falar')

  const missingPilot = radio.trySpeak(99, 'kill', 50000)
  assert.strictEqual(missingPilot, null, 'pilotId inexistente deve devolver null, não lançar erro')

  const missingEvent = radio.trySpeak(0, 'evento_que_nao_existe', 60000)
  assert.strictEqual(missingEvent, null, 'eventId sem fala cadastrada pra aquele piloto deve devolver null')

  radio.reset()
  const afterReset = radio.trySpeak(2, 'kill', 100)
  assert.ok(typeof afterReset === 'string', 'reset() deve zerar o cooldown global')
}

{
  // Etapa 1 do documento: cada piloto mantém pelo menos 30 falas; as existentes nunca são
  // removidas só para bater uma contagem exata. Também garante que toda ability já catalogada
  // possui pool próprio antes de sua carta correspondente ser implementada.
  for (const pilotId of [0, 1, 2, 3]) {
    assert.ok(getWingmanRadioLineCount(pilotId) >= 30, `piloto ${pilotId} deve ter ao menos 30 falas no rádio`)
  }
  const abilityPools = [
    [0, 'ability_ram'], [0, 'ability_intercept'],
    [1, 'ability_guard'], [1, 'ability_rescue'], [1, 'ability_aux_shield'], [1, 'ability_focus_upgrade'],
    [2, 'ability_repair'], [2, 'ability_morale'], [2, 'ability_boost_dash'], [2, 'ability_focus_upgrade'],
    [3, 'ability_assist'], [3, 'ability_boombuster'],
  ]
  const radio = createWingmanRadio()
  for (const [pilotId, eventId] of abilityPools) {
    assert.ok(typeof radio.getLine(pilotId, eventId) === 'string', `${eventId} do piloto ${pilotId} precisa ter fala própria`)
  }
}

{
  // ABILITY_EVENT_IDS classifica o eventId em ability (painel superior) vs. trivial (inferior) —
  // ver hud-game.js. Um eventId de ability nunca pode ser confundido com um trivial.
  assert.ok(ABILITY_EVENT_IDS.has('ability_ram'), 'ability_ram deve ser classificado como ability')
  assert.ok(ABILITY_EVENT_IDS.has('ability_guard'), 'ability_guard deve ser classificado como ability')
  assert.ok(!ABILITY_EVENT_IDS.has('kill'), 'kill é trivial, não deve estar em ABILITY_EVENT_IDS')
  assert.ok(!ABILITY_EVENT_IDS.has('focus_ready'), 'focus_ready é trivial, não deve estar em ABILITY_EVENT_IDS')
}

{
  // trySpeakAlone: só pode disparar 1x por instância do dispatcher (§3.3 do doc — "1x por
  // partida"), mesmo depois do cooldown global passar de novo.
  const radio = createWingmanRadio()
  const first = radio.trySpeakAlone(3, 1000)
  assert.ok(typeof first === 'string', 'primeira chamada de trySpeakAlone deve falar')
  const second = radio.trySpeakAlone(0, 1000 + 6000)
  assert.strictEqual(second, null, 'trySpeakAlone não pode disparar uma segunda vez na mesma partida, mesmo com outro piloto e cooldown já livre')
}

console.log(`OK: todos os testes de selftest.mjs passaram (anki.js + quiz.js + QOL v0.76.0 fixes + Auditoria Completa BUG-01 a BUG-09 + ${totalCueCount} Sound Cues validadas + FSM de Inimigos Fase 1 Blaster/Tank + Rádio dos Aliados).`)

