import assert from 'node:assert/strict'

class EventHub {
  constructor() { this.handlers = new Map() }
  addEventListener(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set())
    this.handlers.get(type).add(fn)
  }
  removeEventListener(type, fn) { this.handlers.get(type)?.delete(fn) }
  dispatch(type, event = {}) {
    for (const fn of this.handlers.get(type) || []) fn({ type, target: null, ...event })
  }
}

const windowHub = new EventHub()
const documentHub = new EventHub()
globalThis.window = windowHub
globalThis.document = Object.assign(documentHub, { hidden: false })
globalThis.navigator = { getGamepads: () => [] }
if (!globalThis.performance) globalThis.performance = { now: () => Date.now() }

let storageMap = new Map()
let throwOnSet = false
globalThis.localStorage = {
  getItem(key) { return storageMap.has(key) ? storageMap.get(key) : null },
  setItem(key, value) { if (throwOnSet) throw new Error('simulated quota/security failure'); storageMap.set(key, String(value)) },
  removeItem(key) { storageMap.delete(key) },
}

const { getSettings } = await import('../src/settings.js')
const { getBindings } = await import('../src/keybindings.js')
const { createInputState } = await import('../src/input.js')
const { loadHistory, saveHistory, recordResult } = await import('../src/storage.js')
const { listDecks } = await import('../src/decks.js')

const findings = []
function probe(name, fn) {
  try {
    const result = fn()
    console.log(`FUZZ_OK ${name}`, result ?? '')
  } catch (err) {
    findings.push({ name, error: err?.stack || String(err) })
    console.log(`FUZZ_FAIL ${name}: ${err?.message || err}`)
  }
}

storageMap = new Map([['star-anki-settings', JSON.stringify({
  startingHealth: 'not-a-number', startingWingmen: {}, arenaTurnSensitivity: 'NaN',
  shipVisual: '__invalid__', vitalsHudStyle: '__invalid__', showEnemyHealthBars: 'yes',
})]])
probe('settings-corrupt-schema', () => {
  const s = getSettings()
  assert.equal(Number.isFinite(s.startingHealth), true, `startingHealth=${s.startingHealth}`)
  assert.equal(Number.isFinite(s.startingWingmen), true, `startingWingmen=${s.startingWingmen}`)
  assert.equal(Number.isFinite(s.arenaTurnSensitivity), true, `arenaTurnSensitivity=${s.arenaTurnSensitivity}`)
  assert.ok(['default', 'bombardeiro', 'racer'].includes(s.shipVisual), `shipVisual=${s.shipVisual}`)
  assert.ok(['classic', 'orbital'].includes(s.vitalsHudStyle), `vitalsHudStyle=${s.vitalsHudStyle}`)
  assert.equal(typeof s.showEnemyHealthBars, 'boolean')
})

storageMap = new Map([['star-anki-keybindings', JSON.stringify({
  actions: { moveLeft: null, moveRight: 42, fire: 'KeyQ' },
  gamepad: { axisX: 'oops', axisY: 999, invertY: 'false', buttons: { fire: 'bad', pause: [999, -2, 'x'] } },
})]])
probe('keybindings-corrupt-schema', () => {
  const b = getBindings()
  assert.ok(Array.isArray(b.actions.moveLeft))
  assert.ok(Array.isArray(b.actions.moveRight))
  assert.ok(Array.isArray(b.actions.fire))
  assert.ok(Array.isArray(b.gamepad.buttons.fire))
  assert.equal(Number.isInteger(b.gamepad.axisX), true)
  assert.equal(Number.isInteger(b.gamepad.axisY), true)
  const input = createInputState()
  input.dispose()
})

storageMap = new Map()
throwOnSet = true
probe('history-storage-write-failure', () => saveHistory({ x: { acertos: 1, erros: 0 } }))
throwOnSet = false

storageMap = new Map([['star-anki-history', JSON.stringify({ abc: 'broken-entry' })]])
probe('history-corrupt-entry-record', () => {
  const history = loadHistory()
  recordResult(history, 'abc', true)
  assert.equal(history.abc.acertos, 1)
  assert.equal(history.abc.erros, 0)
})

storageMap = new Map([['star-anki-decks-v1', JSON.stringify([
  { id: 'broken-1', name: 'Sem texto', savedAt: 1 },
  null,
  { id: 17, name: {}, text: 42, savedAt: 'yesterday' },
])]])
probe('decks-corrupt-schema-list', () => listDecks())

// Edge presses must not survive a focus loss. Otherwise a pause/command pressed immediately
// before Alt+Tab can fire after returning to the game even though the key is no longer held.
storageMap = new Map()
probe('input-blur-clears-pending-edge', () => {
  const input = createInputState()
  windowHub.dispatch('keydown', { code: 'Escape', target: { tagName: 'BODY', isContentEditable: false } })
  windowHub.dispatch('blur')
  const state = input.update()
  assert.equal(state.pressed.has('Escape'), false, 'Escape edge leaked across blur')
  input.dispose()
})

console.log(`FUZZ_SUMMARY failures=${findings.length}`)
for (const f of findings) console.log(`FUZZ_FINDING ${f.name}\n${f.error}`)
if (findings.length) process.exitCode = 2
