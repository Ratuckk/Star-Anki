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

const cooldownRadio = createWingmanRadioConversationManager({ random: () => 0 })
cooldownRadio.openFromEvent({ openerPilotId: 0, triggerEventId: 'ability_ram', now: 0, activePilotIds: [0, 1] })
cooldownRadio.takeDueResponse(CALL_RESPONSE_DELAY_MIN_MS, [0, 1])
assert.equal(cooldownRadio.openFromEvent({ openerPilotId: 1, triggerEventId: 'ability_guard', now: CALL_RESPONSE_THREAD_COOLDOWN_MS - 1, activePilotIds: [0, 1] }), null)
assert.ok(cooldownRadio.openFromEvent({ openerPilotId: 1, triggerEventId: 'ability_guard', now: CALL_RESPONSE_THREAD_COOLDOWN_MS, activePilotIds: [0, 1] }))

const urgentRadio = createWingmanRadioConversationManager({ random: () => 0 })
urgentRadio.openFromEvent({ openerPilotId: 0, triggerEventId: 'ability_ram', now: 0, activePilotIds: [0, 1, 2, 3] })
const urgent = urgentRadio.openFromEvent({ openerPilotId: 2, triggerEventId: 'state_critical', now: 500, activePilotIds: [0, 1, 2, 3], force: true })
assert.equal(urgent.triggerEventId, 'state_critical')
assert.equal(urgentRadio.getDebugSnapshot().stats.canceled, 1)

const unavailableRadio = createWingmanRadioConversationManager({ random: () => 0 })
unavailableRadio.openFromEvent({ openerPilotId: 0, triggerEventId: 'ability_ram', now: 0, activePilotIds: [0, 1, 2] })
assert.equal(unavailableRadio.takeDueResponse(CALL_RESPONSE_DELAY_MIN_MS, [0, 2]), null)
assert.equal(unavailableRadio.getDebugSnapshot().stats.lastCancelReason, 'responder-unavailable')

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
// Failsafe técnico de navegação é deliberadamente silencioso, mesmo se interromper Action.
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
