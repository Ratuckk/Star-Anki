import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CALL_RESPONSE_DELAY_MIN_MS,
  CALL_RESPONSE_THREAD_COOLDOWN_MS,
  createWingmanRadioConversationManager,
  classifyWingmanTransitionForRadio,
} from './combat/wingman-radio-callresponse.js'

const radio = createWingmanRadioConversationManager({ random: () => 0 })
const opened = radio.openFromEvent({ openerPilotId: 0, triggerEventId: 'ability_ram', now: 0, activePilotIds: [0, 1, 2, 3] })
assert.ok(opened)
assert.equal(opened.responderPilotId, 1)
assert.equal(radio.takeDueResponse(CALL_RESPONSE_DELAY_MIN_MS - 1, [0, 1, 2, 3]), null)
const reply = radio.takeDueResponse(CALL_RESPONSE_DELAY_MIN_MS, [0, 1, 2, 3])
assert.equal(reply.pilotId, 1)
assert.equal(reply.openerPilotId, 0)
assert.equal(reply.triggerEventId, 'ability_ram')

// v0.99.28: cooldown narrativo é por chamador, não global. Outro piloto pode abrir conversa
// imediatamente e os dois threads coexistem sem bloquear os slots independentes do HUD.
const parallel = createWingmanRadioConversationManager({ random: () => 0 })
const first = parallel.openFromEvent({ openerPilotId: 0, triggerEventId: 'ability_ram', now: 0, activePilotIds: [0, 1, 2, 3] })
const second = parallel.openFromEvent({ openerPilotId: 1, triggerEventId: 'ability_guard', now: 1, activePilotIds: [0, 1, 2, 3] })
assert.ok(first && second)
assert.equal(parallel.getDebugSnapshot().pending.length, 2)
assert.equal(parallel.openFromEvent({ openerPilotId: 0, triggerEventId: 'ability_intercept', now: CALL_RESPONSE_THREAD_COOLDOWN_MS - 1, activePilotIds: [0, 1, 2, 3] }), null)
assert.ok(parallel.openFromEvent({ openerPilotId: 2, triggerEventId: 'ability_repair', now: 2, activePilotIds: [0, 1, 2, 3] }), 'outro opener não pode herdar cooldown de Falco')

// Evento urgente só substitui uma thread antiga do MESMO chamador.
const urgentRadio = createWingmanRadioConversationManager({ random: () => 0 })
urgentRadio.openFromEvent({ openerPilotId: 0, triggerEventId: 'ability_ram', now: 0, activePilotIds: [0, 1, 2, 3] })
urgentRadio.openFromEvent({ openerPilotId: 1, triggerEventId: 'ability_guard', now: 0, activePilotIds: [0, 1, 2, 3] })
const urgent = urgentRadio.openFromEvent({ openerPilotId: 0, triggerEventId: 'state_critical', now: 500, activePilotIds: [0, 1, 2, 3], force: true })
assert.equal(urgent.triggerEventId, 'state_critical')
assert.equal(urgentRadio.getDebugSnapshot().stats.canceled, 1)
assert.equal(urgentRadio.getDebugSnapshot().pending.length, 2)

const unavailableRadio = createWingmanRadioConversationManager({ random: () => 0 })
unavailableRadio.openFromEvent({ openerPilotId: 0, triggerEventId: 'ability_ram', now: 0, activePilotIds: [0, 1, 2] })
assert.equal(unavailableRadio.takeDueResponse(CALL_RESPONSE_DELAY_MIN_MS, [0, 2]), null)
assert.equal(unavailableRadio.getDebugSnapshot().pending.length, 1, 'cooldown/indisponibilidade temporária não cancela a resposta')
assert.equal(unavailableRadio.getDebugSnapshot().stats.lastCancelReason, null)
const delayedReply = unavailableRadio.takeDueResponse(CALL_RESPONSE_DELAY_MIN_MS + 500, [0, 1, 2])
assert.equal(delayedReply.pilotId, 1)

const noPartnerRadio = createWingmanRadioConversationManager({ random: () => 0 })
assert.equal(noPartnerRadio.openFromEvent({ openerPilotId: 0, triggerEventId: 'ability_ram', now: 0, activePilotIds: [0] }), null)

assert.deepEqual(classifyWingmanTransitionForRadio({
  decision: 'accepted',
  before: { integrity: { critical: false, retreating: false }, behavior: { kind: 'patrol', reason: null }, action: null },
  after: { integrity: { critical: true, retreating: false }, behavior: { kind: 'patrol', reason: null }, action: null },
}), { eventId: 'state_critical', urgent: true })

assert.deepEqual(classifyWingmanTransitionForRadio({
  decision: 'accepted',
  before: { integrity: { critical: true, retreating: false }, behavior: { kind: 'patrol', reason: null }, action: null },
  after: { integrity: { critical: false, retreating: false }, behavior: { kind: 'patrol', reason: null }, action: null },
}), { eventId: 'state_recovered', urgent: false })

assert.deepEqual(classifyWingmanTransitionForRadio({
  decision: 'accepted',
  before: { integrity: { critical: false, retreating: false }, behavior: { kind: 'dogfight', reason: null }, action: { kind: 'ram' } },
  after: { integrity: { critical: false, retreating: false }, behavior: { kind: 'patrol', reason: null }, action: null },
  interruption: { cooldownPolicy: 'FULL' },
}), { eventId: 'action_interrupted', urgent: false })

assert.equal(classifyWingmanTransitionForRadio({ decision: 'rejected' }), null)
assert.equal(classifyWingmanTransitionForRadio({
  decision: 'accepted', event: 'navigation-recovery',
  before: { integrity: { critical: false, retreating: false }, behavior: { kind: 'dogfight', reason: null }, action: { kind: 'ram' } },
  after: { integrity: { critical: false, retreating: false }, behavior: { kind: 'patrol', reason: 'invalid-navigation' }, action: null },
  interruption: { cooldownPolicy: 'full' },
}), null)

const wingmenSource = readFileSync(new URL('./combat/wingmen.js', import.meta.url), 'utf8')
for (const required of ['classifyWingmanTransitionForRadio', 'takeDueResponse', 'wingman-radio-call-response', "forceSpeak(w.profile.id, 'retreat'"]) {
  assert.ok(wingmenSource.includes(required), `wingmen.js sem integração obrigatória: ${required}`)
}

console.log('wingman-radio-callresponse.test.mjs: OK')
