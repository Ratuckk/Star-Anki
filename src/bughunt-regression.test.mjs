import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

class EventHub {
  constructor() { this.handlers = new Map() }
  addEventListener(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set())
    this.handlers.get(type).add(fn)
  }
  removeEventListener(type, fn) { this.handlers.get(type)?.delete(fn) }
  dispatchEvent(event) {
    for (const fn of this.handlers.get(event.type) || []) fn(event)
    return true
  }
  dispatch(type, init = {}) { return this.dispatchEvent({ type, target: null, ...init }) }
}

const windowHub = new EventHub()
const documentHub = new EventHub()
globalThis.window = windowHub
globalThis.document = Object.assign(documentHub, { hidden: false })
globalThis.navigator = { getGamepads: () => [] }
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) { this.type = type; this.detail = init.detail }
}

let storageMap = new Map()
let throwOnSet = false
let getCount = 0
globalThis.localStorage = {
  getItem(key) { getCount += 1; return storageMap.has(key) ? storageMap.get(key) : null },
  setItem(key, value) { if (throwOnSet) throw new Error('simulated storage failure'); storageMap.set(key, String(value)) },
  removeItem(key) { storageMap.delete(key) },
}

storageMap.set('star-anki-settings', JSON.stringify({
  startingHealth: 'oops', startingWingmen: {}, arenaTurnSensitivity: Infinity,
  audioVolume: -50, shipVisual: 'broken', vitalsHudStyle: 'broken', showEnemyHealthBars: 'yes',
}))
const { getSettings, setSetting } = await import('./settings.js')
getCount = 0
const settings = getSettings()
assert.equal(settings.startingHealth, 10)
assert.equal(settings.startingWingmen, 0)
assert.equal(settings.arenaTurnSensitivity, 1)
assert.equal(settings.audioVolume, 0)
assert.equal(settings.shipVisual, 'default')
assert.equal(settings.vitalsHudStyle, 'classic')
assert.equal(settings.showEnemyHealthBars, false)
getSettings(); getSettings(); getSettings()
assert.equal(getCount, 1, 'getSettings não deve reler localStorage no hot path do game loop')
assert.equal(setSetting('startingHealth', 999).startingHealth, 20, 'setter também precisa respeitar range')

storageMap.set('star-anki-keybindings', JSON.stringify({
  actions: { moveLeft: null, moveRight: 42, fire: 'KeyQ' },
  gamepad: { axisX: 'bad', axisY: 999, invertY: 'false', buttons: { fire: 'bad', pause: [999, -1, 'x'] } },
}))
const keybindings = await import('./keybindings.js')
const { createInputState } = await import('./input.js')
const bindings = keybindings.getBindings()
assert.deepEqual(bindings.actions.moveLeft, ['ArrowLeft'])
assert.deepEqual(bindings.actions.moveRight, ['ArrowRight'])
assert.deepEqual(bindings.actions.fire, ['KeyQ'])
assert.equal(bindings.gamepad.axisX, 0)
assert.equal(bindings.gamepad.axisY, 1)
assert.equal(bindings.gamepad.invertY, true)
assert.deepEqual(bindings.gamepad.buttons.fire, [0, 7])

const input = createInputState()
windowHub.dispatch('keydown', { code: 'Escape', target: { tagName: 'BODY', isContentEditable: false } })
windowHub.dispatch('blur')
assert.equal(input.update().pressed.has('Escape'), false, 'borda pendente não pode atravessar blur')
keybindings.setBinding('pause', 'KeyQ')
windowHub.dispatch('keydown', { code: 'KeyQ', target: { tagName: 'BODY', isContentEditable: false } })
const rebound = input.update()
assert.equal(rebound.pressed.has('pause'), true, 'rebind na pausa precisa chegar ao input já montado')
input.dispose()

const { loadHistory, saveHistory, recordResult } = await import('./storage.js')
storageMap.set('star-anki-history', JSON.stringify({ abc: 'broken', good: { acertos: '2', erros: -3, ultimaVez: 'bad' } }))
const history = loadHistory()
assert.deepEqual({ ...history.abc }, { acertos: 0, erros: 0, ultimaVez: null })
assert.deepEqual({ ...history.good }, { acertos: 2, erros: 0, ultimaVez: null })
recordResult(history, 'abc', true)
assert.equal(history.abc.acertos, 1)
recordResult(history, '__proto__', false)
assert.equal(history.__proto__.erros, 1)
assert.equal(Object.prototype.erros, undefined, 'GUID especial não pode poluir Object.prototype')
throwOnSet = true
assert.equal(saveHistory(history), false, 'falha de storage não pode escapar como exceção')
throwOnSet = false

const fixture = readFileSync(new URL('./fixtures/sample-export.txt', import.meta.url), 'utf8')
const { listDecks, addDeck } = await import('./decks.js')
storageMap.set('star-anki-decks-v1', JSON.stringify([null, { id: 'bad', name: 'Sem texto' }, { id: 17, text: 42 }]))
assert.doesNotThrow(() => listDecks())
assert.equal(listDecks().length, 0)
throwOnSet = true
const failedDeckSave = addDeck('Teste', fixture)
assert.ok(failedDeckSave.error, 'UI não pode receber falso sucesso quando localStorage falha')
throwOnSet = false

const { selectMissedPracticeCards } = await import('./quiz.js')
const clozeCards = [
  { guid: 'same', question: 'A _____ B', answer: 'um' },
  { guid: 'same', question: 'A X _____', answer: 'dois' },
]
const selected = selectMissedPracticeCards(clozeCards, [clozeCards[0]])
assert.equal(selected.length, 1)
assert.equal(selected[0].question, clozeCards[0].question, 'prática deve revisar só a lacuna Cloze errada')

const { exportTagsTsv } = await import('./anki.js')
const tagFixture = [
  '#separator:tab',
  '#html:false',
  '#guid column:1',
  '#notetype column:2',
  '#deck column:3',
  '#tags column:6',
  'g1\tBasic\tD\tPergunta\tResposta\ttag-antiga',
].join('\n')
const exported = exportTagsTsv(tagFixture, [
  { guid: 'g1', correct: true },
  { guid: 'g1', correct: false },
  { guid: 'g1', correct: true },
  { guid: 'desconhecido', correct: true },
])
const exportedData = exported.split('\n').filter((line) => line && !line.startsWith('#'))
assert.equal(exportedData.length, 1, 'uma nota Anki não pode ser exportada em linhas conflitantes')
assert.match(exportedData[0], /jogo::errei/)
assert.doesNotMatch(exportedData[0], /jogo::acertei/)

const railSource = readFileSync(new URL('./rail.js', import.meta.url), 'utf8')
assert.doesNotMatch(railSource, /getFullSpinAngle:\s*\(\)\s*=>\s*fullSpinAngle\b/, 'getter não pode ler identificador inexistente')
const menuSource = readFileSync(new URL('./game-menu.js', import.meta.url), 'utf8')
assert.match(menuSource, /handlePlayDeck\(currentDeckIds, currentTagFilter\)/, 'replay precisa preservar filtro de tags')
const audioSource = readFileSync(new URL('./audio.js', import.meta.url), 'utf8')
assert.match(audioSource, /addEventListener\('error', cleanupOneShot\)/)
assert.match(audioSource, /addEventListener\('abort', cleanupOneShot\)/)
const gameLoopSource = readFileSync(new URL('./game-loop.js', import.meta.url), 'utf8')
assert.match(gameLoopSource, /const liveSettings = getSettings\(\)/, 'game loop deve usar snapshot de settings por frame')
assert.match(gameLoopSource, /const ghostBlipsEnabled = liveSettings\.minimapGhostBlips/, 'radar deve respeitar settings live sem nova leitura')
assert.match(gameLoopSource, /if \(liveSettings\.showEnemyHealthBars\)/, 'barra de HP deve reagir à opção da pausa')
assert.match(gameLoopSource, /rail\.setTurnSensitivity\(liveSettings\.arenaTurnSensitivity\)/, 'sensibilidade deve reagir à opção da pausa')
const cutsceneSource = readFileSync(new URL('./cutscenes.js', import.meta.url), 'utf8')
assert.match(cutsceneSource, /arenaCutsceneKind === 'boss' \|\| state\.arenaCutsceneKind === 'bossSummon'/, 'primeira transição do chefe também deve receber apresentação de chefe')

console.log('bughunt-regression.test.mjs: OK')
