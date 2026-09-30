export const CALL_RESPONSE_DELAY_MIN_MS = 3000
export const CALL_RESPONSE_DELAY_MAX_MS = 4200
export const CALL_RESPONSE_TTL_AFTER_DUE_MS = 2200
export const CALL_RESPONSE_THREAD_COOLDOWN_MS = 10000

const RESPONSE_LINES = Object.freeze({
  "state_critical": {
    "0": [
      "I see it. Get clear!",
      "Don't make me drag you home."
    ],
    "1": [
      "Fall back, I've got the line.",
      "Easy now. Protect the hull."
    ],
    "2": [
      "Hold on! I can help!",
      "Stay with us, okay?!"
    ],
    "3": [
      "Damage confirmed. Disengage.",
      "Critical telemetry received."
    ]
  },
  "state_recovered": {
    "0": [
      "Back in the fight? Good.",
      "There you go."
    ],
    "1": [
      "Systems look stable. Stay sharp.",
      "Good. Keep it together."
    ],
    "2": [
      "Yes! You're holding together!",
      "Okay, readings look better!"
    ],
    "3": [
      "Telemetry stable. Continue.",
      "Integrity recovered."
    ]
  },
  "action_interrupted": {
    "0": [
      "Reset and take another angle.",
      "Tch. We'll get the next one."
    ],
    "1": [
      "Break clean and reset.",
      "Abort confirmed. Reset safely."
    ],
    "2": [
      "You okay? Reset the maneuver!",
      "No worries, try again!"
    ],
    "3": [
      "Abort acknowledged.",
      "Recomputing the approach."
    ]
  },
  "retreat": {
    "0": [
      "I've got your exit. Go!",
      "Get clear, now!"
    ],
    "1": [
      "Fall back. We will hold here.",
      "You're clear to disengage."
    ],
    "2": [
      "Get out of there! We got this!",
      "Please make it back!"
    ],
    "3": [
      "Retreat vector covered.",
      "Disengagement acknowledged."
    ]
  }
})

function pick(random, values) {
  if (!values || values.length === 0) return null
  const index = Math.min(values.length - 1, Math.floor(random() * values.length))
  return values[index]
}

export function classifyWingmanTransitionForRadio(transition) {
  if (!transition || transition.decision !== 'accepted') return null
  const before = transition.before || {}
  const after = transition.after || {}
  const beforeIntegrity = before.integrity || {}
  const afterIntegrity = after.integrity || {}
  if (!beforeIntegrity.critical && afterIntegrity.critical && !afterIntegrity.retreating) {
    return { eventId: 'state_critical', urgent: true }
  }
  if (beforeIntegrity.critical && !afterIntegrity.critical) {
    return { eventId: 'state_recovered', urgent: false }
  }
  if (transition.event === 'navigation-recovery') return null
  if (!afterIntegrity.retreating && transition.interruption && before.action && !after.action) {
    return { eventId: 'action_interrupted', urgent: false }
  }
  return null
}

export function createWingmanRadioConversationManager({ random = Math.random } = {}) {
  let pending = []
  const nextThreadAllowedAtByOpener = new Map()
  let nextThreadId = 1
  let stats = { opened: 0, delivered: 0, canceled: 0, lastCancelReason: null }

  function snapshotPending() {
    return pending.map((thread) => ({ ...thread }))
  }

  function cancelWhere(predicate, reason) {
    const kept = []
    let canceled = 0
    for (const thread of pending) {
      if (predicate(thread)) canceled += 1
      else kept.push(thread)
    }
    pending = kept
    if (canceled > 0) {
      stats.canceled += canceled
      stats.lastCancelReason = reason
    }
    return canceled
  }

  function cancelPendingResponse(reason = 'canceled') {
    return cancelWhere(() => true, reason) > 0
  }

  function cancelConversationForPilot(pilotId, reason = 'pilot-left') {
    return cancelWhere((thread) => thread.openerPilotId === pilotId || thread.responderPilotId === pilotId, reason) > 0
  }

  // minDeliveryDelayMs: atraso mínimo até a resposta poder vencer. O rádio passa o gate global (6 s):
  // assim `dueAt` nunca cai antes de a resposta poder ser transmitida (antes ~2/3 morriam por TTL).
  function openFromEvent({ openerPilotId, triggerEventId, now, activePilotIds = [], force = false, minDeliveryDelayMs = 0 }) {
    const byResponder = RESPONSE_LINES[triggerEventId]
    if (!byResponder) return null

    const existingForOpener = pending.find((thread) => thread.openerPilotId === openerPilotId)
    if (existingForOpener) {
      if (!force) return null
      cancelWhere((thread) => thread.openerPilotId === openerPilotId, 'superseded-urgent')
    }

    const nextAllowedAt = nextThreadAllowedAtByOpener.get(openerPilotId) ?? -Infinity
    if (!force && now < nextAllowedAt) return null

    const candidates = activePilotIds.filter((pilotId) =>
      pilotId !== openerPilotId && Array.isArray(byResponder[pilotId]) && byResponder[pilotId].length > 0
    )
    const responderPilotId = pick(random, candidates)
    if (responderPilotId == null) return null
    const text = pick(random, byResponder[responderPilotId])
    if (!text) return null

    const delayMs = Math.max(CALL_RESPONSE_DELAY_MIN_MS, minDeliveryDelayMs) +
      random() * (CALL_RESPONSE_DELAY_MAX_MS - CALL_RESPONSE_DELAY_MIN_MS)
    const thread = {
      threadId: 'wr-' + nextThreadId++,
      openerPilotId,
      responderPilotId,
      triggerEventId,
      text,
      openedAt: now,
      dueAt: now + delayMs,
      expiresAt: now + delayMs + CALL_RESPONSE_TTL_AFTER_DUE_MS,
    }
    pending.push(thread)
    pending.sort((a, b) => a.dueAt - b.dueAt)
    nextThreadAllowedAtByOpener.set(openerPilotId, now + CALL_RESPONSE_THREAD_COOLDOWN_MS)
    stats.opened += 1
    return { ...thread }
  }

  function takeDueResponse(now, eligibleResponderIds = []) {
    if (pending.length === 0) return null

    for (let i = pending.length - 1; i >= 0; i -= 1) {
      if (now > pending[i].expiresAt) {
        pending.splice(i, 1)
        stats.canceled += 1
        stats.lastCancelReason = 'expired'
      }
    }

    const index = pending.findIndex((thread) => now >= thread.dueAt)
    if (index < 0) return null
    const thread = pending[index]
    if (!eligibleResponderIds.includes(thread.responderPilotId)) {
      pending.splice(index, 1)
      stats.canceled += 1
      stats.lastCancelReason = 'responder-unavailable'
      return null
    }

    pending.splice(index, 1)
    stats.delivered += 1
    return { ...thread, pilotId: thread.responderPilotId }
  }

  function getDebugSnapshot() {
    return {
      pending: snapshotPending(),
      nextThreadAllowedAtByOpener: Object.fromEntries(nextThreadAllowedAtByOpener),
      stats: { ...stats },
    }
  }

  function reset() {
    pending = []
    nextThreadAllowedAtByOpener.clear()
    nextThreadId = 1
    stats = { opened: 0, delivered: 0, canceled: 0, lastCancelReason: null }
  }

  return {
    openFromEvent,
    takeDueResponse,
    cancelPendingResponse,
    cancelConversationForPilot,
    getDebugSnapshot,
    reset,
  }
}
