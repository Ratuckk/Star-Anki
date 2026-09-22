export const CALL_RESPONSE_DELAY_MIN_MS = 3000
export const CALL_RESPONSE_DELAY_MAX_MS = 4200
export const CALL_RESPONSE_TTL_AFTER_DUE_MS = 2200
export const CALL_RESPONSE_THREAD_COOLDOWN_MS = 10000

const RESPONSE_LINES = Object.freeze({
  ability_ram: {
    1: ["Falco, don't overcommit.", 'Keep an exit vector, Falco.'],
    2: ["Falco, that's way too close!", 'Try not to hit EVERYTHING!'],
    3: ['Impact vector confirmed.', 'Aggressive. Effective.'],
  },
  ability_intercept: {
    1: ['Good catch, Falco.', 'Threat cleared. Stay on the line.'],
    2: ['Whoa! Nice save, Falco!', 'That was way too close!'],
    3: ['Projectile neutralized.', 'Intercept confirmed.'],
  },
  ability_guard: {
    0: ["I've got the offense. Keep that shield up.", 'Good cover, Peppy.'],
    2: ['Nice cover, Peppy!', "Okay, I'll stay behind you!"],
    3: ['Defensive lane confirmed.', 'Guard pattern acknowledged.'],
  },
  ability_rescue: {
    0: ['Get him out clean, Peppy.', "I'll keep the heat off you."],
    2: ["I've got the systems side!", 'Rescue lane looks clear!'],
    3: ['Rescue corridor is clear.', 'Covering the extraction vector.'],
  },
  ability_aux_shield: {
    0: ["I'll use the opening.", 'Keep that wall facing forward.'],
    2: ['Barrier looks solid!', "I'll stay inside the cover!"],
    3: ['Shield geometry confirmed.', 'Barrier coverage acknowledged.'],
  },
  ability_repair: {
    0: ['Good timing, Slippy.', 'That patch better hold.'],
    1: ['Keep those repairs coming.', 'Good work, Slippy.'],
    3: ['Repair package acknowledged.', 'Integrity support confirmed.'],
  },
  ability_assist: {
    0: ["Now that's a firing solution.", 'Keep those locks on me.'],
    1: ['Keep the link stable.', 'Targeting support received.'],
    2: ['Whoa, those locks are clean!', 'Miyu, that sync is awesome!'],
  },
  ability_boombuster: {
    0: ['Okay, that was flashy.', 'Not bad, Miyu.'],
    1: ['Good spread. Keep pressure.', 'Heavy strike confirmed.'],
    2: ['Whoa! That lit up everything!', 'Remind me not to stand in front of that!'],
  },
  state_critical: {
    0: ['I see it. Get clear!', "Don't make me drag you home."],
    1: ["Fall back, I've got the line.", 'Easy now. Protect the hull.'],
    2: ['Hold on! I can help!', 'Stay with us, okay?!'],
    3: ['Damage confirmed. Disengage.', 'Critical telemetry received.'],
  },
  state_recovered: {
    0: ['Back in the fight? Good.', 'There you go.'],
    1: ['Systems look stable. Stay sharp.', 'Good. Keep it together.'],
    2: ["Yes! You're holding together!", 'Okay, readings look better!'],
    3: ['Telemetry stable. Continue.', 'Integrity recovered.'],
  },
  action_interrupted: {
    0: ['Reset and take another angle.', "Tch. We'll get the next one."],
    1: ['Break clean and reset.', 'Abort confirmed. Reset safely.'],
    2: ['You okay? Reset the maneuver!', 'No worries, try again!'],
    3: ['Abort acknowledged.', 'Recomputing the approach.'],
  },
  retreat: {
    0: ["I've got your exit. Go!", 'Get clear, now!'],
    1: ['Fall back. We will hold here.', "You're clear to disengage."],
    2: ['Get out of there! We got this!', 'Please make it back!'],
    3: ['Retreat vector covered.', 'Disengagement acknowledged.'],
  },
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

  // Recovery de kinematics é um failsafe técnico e deve ser invisível ao jogador.
  if (transition.event === 'navigation-recovery') return null

  if (!afterIntegrity.retreating && transition.interruption && before.action && !after.action) {
    return { eventId: 'action_interrupted', urgent: false }
  }

  return null
}

export function createWingmanRadioConversationManager({ random = Math.random } = {}) {
  let pending = null
  let nextThreadAllowedAt = -Infinity
  let nextThreadId = 1
  let stats = { opened: 0, delivered: 0, canceled: 0, lastCancelReason: null }

  function snapshotPending() {
    return pending ? { ...pending } : null
  }

  function cancelPendingResponse(reason = 'canceled') {
    if (!pending) return false
    pending = null
    stats.canceled += 1
    stats.lastCancelReason = reason
    return true
  }

  function openFromEvent({ openerPilotId, triggerEventId, now, activePilotIds = [], force = false }) {
    const byResponder = RESPONSE_LINES[triggerEventId]
    if (!byResponder) return null
    if (pending) {
      if (!force) return null
      cancelPendingResponse('superseded-urgent')
    }
    if (!force && now < nextThreadAllowedAt) return null

    const candidates = activePilotIds.filter((pilotId) =>
      pilotId !== openerPilotId && Array.isArray(byResponder[pilotId]) && byResponder[pilotId].length > 0
    )
    const responderPilotId = pick(random, candidates)
    if (responderPilotId == null) return null
    const text = pick(random, byResponder[responderPilotId])
    if (!text) return null

    const delayMs = CALL_RESPONSE_DELAY_MIN_MS + random() * (CALL_RESPONSE_DELAY_MAX_MS - CALL_RESPONSE_DELAY_MIN_MS)
    pending = {
      threadId: 'wr-' + nextThreadId++,
      openerPilotId,
      responderPilotId,
      triggerEventId,
      text,
      openedAt: now,
      dueAt: now + delayMs,
      expiresAt: now + delayMs + CALL_RESPONSE_TTL_AFTER_DUE_MS,
    }
    nextThreadAllowedAt = now + CALL_RESPONSE_THREAD_COOLDOWN_MS
    stats.opened += 1
    return snapshotPending()
  }

  function takeDueResponse(now, eligibleResponderIds = []) {
    if (!pending) return null
    if (now > pending.expiresAt) {
      cancelPendingResponse('expired')
      return null
    }
    if (now < pending.dueAt) return null
    if (!eligibleResponderIds.includes(pending.responderPilotId)) {
      cancelPendingResponse('responder-unavailable')
      return null
    }

    const delivered = { ...pending, pilotId: pending.responderPilotId }
    pending = null
    stats.delivered += 1
    return delivered
  }

  function getDebugSnapshot() {
    return {
      pending: snapshotPending(),
      nextThreadAllowedAt,
      stats: { ...stats },
    }
  }

  function reset() {
    pending = null
    nextThreadAllowedAt = -Infinity
    nextThreadId = 1
    stats = { opened: 0, delivered: 0, canceled: 0, lastCancelReason: null }
  }

  return {
    openFromEvent,
    takeDueResponse,
    cancelPendingResponse,
    getDebugSnapshot,
    reset,
  }
}
