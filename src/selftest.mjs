import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { buildDeck, generateDistractors } from './anki.js'
import { createSession, nextQuestion, resolveAnswer, getSummary } from './quiz.js'

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
// 6. sessão de quiz: combo, escudos, timeout
// ---------------------------------------------------------------------------
const session = createSession(deck)
assert.strictEqual(session.shields, 3, 'sessão deveria começar com 3 escudos')
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
assert.strictEqual(session.shields, 3, 'acerto não deveria tirar escudo')

const r2 = resolveAt('correct')
assert.strictEqual(r2.comboMultiplier, 1.3, `combo após 2º acerto deveria ser 1.30, obteve ${r2.comboMultiplier}`)
assert.strictEqual(session.shields, 3, 'acerto não deveria tirar escudo')
assert.ok(r2.points > r1.points, 'pontos do 2º acerto deveriam ser maiores devido ao combo mais alto')

// 1 erro -> zera combo e tira 1 escudo
const r3 = resolveAt('wrong')
assert.strictEqual(r3.comboMultiplier, 1, `combo deveria zerar para 1.0 após erro, obteve ${r3.comboMultiplier}`)
assert.strictEqual(session.shields, 2, `esperava 2 escudos após 1 erro, obteve ${session.shields}`)
assert.strictEqual(r3.shieldsRemaining, 2)
assert.strictEqual(r3.comboBroken, true, 'erro deveria quebrar o combo (comboBroken=true)')

// 1 timeout -> conta como erro (zera combo) mas NÃO tira escudo
const r4 = resolveAt('timeout')
assert.strictEqual(r4.comboMultiplier, 1, 'combo deveria continuar em 1.0 após timeout')
assert.strictEqual(session.shields, 2, `timeout não deveria tirar escudo, esperava continuar em 2, obteve ${session.shields}`)
assert.strictEqual(r4.shieldsRemaining, 2)
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

console.log('OK: todos os testes de selftest.mjs passaram (anki.js + quiz.js).')
