import { createWingmanRadioConversationManager } from './wingman-radio-callresponse.js'
export { CALL_RESPONSE_DELAY_MIN_MS, CALL_RESPONSE_DELAY_MAX_MS, CALL_RESPONSE_TTL_AFTER_DUE_MS, CALL_RESPONSE_THREAD_COOLDOWN_MS, classifyWingmanTransitionForRadio } from './wingman-radio-callresponse.js'

export const ABILITY_EVENT_IDS = new Set([
  'ability_ram', 'ability_intercept',
  'ability_guard', 'ability_rescue', 'ability_aux_shield',
  'ability_repair', 'ability_morale', 'ability_boost_dash',
  'ability_assist', 'ability_boombuster', 'ability_focus_upgrade',
])

export const GLOBAL_COOLDOWN_MIN_MS = 6000
export const GLOBAL_COOLDOWN_MAX_MS = 20000
export const NEW_TRIVIAL_QUOTES_PER_PILOT = 30

export const SQUAD_TRIVIAL_GAP_MS = 6000
export const TRIVIAL_TRANSMISSION_ESTIMATED_MS = 2800
export const EVENT_CATEGORY_DEDUP_WINDOW_MS = 8000

export function getEventCategory(eventId) {
  if (eventId.startsWith('engage_')) return 'engage'
  if (eventId === 'return_formation') return 'formation'
  if (eventId === 'action_interrupted') return 'interrupted'
  if (eventId.startsWith('state_')) return 'state'
  if (eventId === 'boost_used' || eventId === 'charged_shot_used') return 'tactical'
  if (eventId === 'kill' || eventId === 'boss_kill' || eventId === 'golden_kill') return 'kill'
  return eventId
}

const LINES = {
  "0": {
    "engage_dogfight": [
      "I'm on him, watch this!",
      "You call that flying?"
    ],
    "engage_focus": [
      "On your mark!",
      "Say the word, I'm there!"
    ],
    "engage_boss": [
      "Now THIS is a real fight!",
      "Let's rattle 'em!"
    ],
    "engage_horda": [
      "Swarm's mine, don't crowd me!"
    ],
    "engage_fragata": [
      "That shield won't hold forever!"
    ],
    "ability_ram": [
      "Time to make my move!",
      "Ramming speed!",
      "Outta my way!",
      "Locked on — here I come!",
      "Brace for impact, hotshot!"
    ],
    "ability_intercept": [
      "Not on my watch!",
      "I got your six, Fox!",
      "Yeah, I don't think so!",
      "Ha! Too slow!",
      "Denied!"
    ],
    "kill": [
      "Got him!",
      "Too easy."
    ],
    "boss_kill": [
      "Yeah! Take that, big guy!"
    ],
    "golden_kill": [
      "Special delivery — right in the face!"
    ],
    "boost_used": [
      "Punching it!",
      "Eat my exhaust!"
    ],
    "charged_shot_used": [
      "Charged and fired!",
      "Full power, baby!"
    ],
    "player_take_damage": [
      "Hey, watch it!"
    ],
    "player_low_health": [
      "Hang in there!"
    ],
    "return_formation": [
      "Falling back."
    ],
    "retreat": [
      "I'm hit! Pulling out!",
      "Can't stay in this fight — breaking off!"
    ],
    "alone": [
      "Guess it's just me now."
    ],
    "focus_ready": [
      "Locked and loaded!"
    ],
    "state_critical": [
      "I'm taking a beating!",
      "Systems are getting ugly!"
    ],
    "state_recovered": [
      "That's more like it.",
      "I'm back in business."
    ],
    "action_interrupted": [
      "Tch. Move is off.",
      "Abort that run."
    ]
  },
  "1": {
    "engage_dogfight": [
      "I'll handle this one.",
      "Standing my ground."
    ],
    "engage_focus": [
      "Copy, moving in."
    ],
    "engage_boss": [
      "This one's dangerous — stay sharp!",
      "Focus fire, everyone!"
    ],
    "engage_horda": [
      "Careful, they're swarming!"
    ],
    "engage_fragata": [
      "Watch its blind spot!"
    ],
    "ability_guard": [
      "I'll cover you, Fox!",
      "Standing by to defend!",
      "Shields up!",
      "Defense grid online!",
      "Nothing gets through me!"
    ],
    "ability_rescue": [
      "Hang on, Fox — I'm coming in!",
      "I've got you, steady now.",
      "Stay with me, Fox!",
      "You're not going down today.",
      "Rescue run underway!"
    ],
    "ability_aux_shield": [
      "Shield wall deployed!",
      "Stay behind me, Fox.",
      "I'll take the heat.",
      "Barrier holding.",
      "I've got the incoming fire."
    ],
    "ability_focus_upgrade": [
      "Formation locked. Protecting the lead.",
      "Auxiliary systems ready.",
      "My shield is yours, Fox.",
      "Command received. Defense first.",
      "Cover pattern set."
    ],
    "kill": [
      "Target down."
    ],
    "boss_kill": [
      "Great shot, Fox!"
    ],
    "golden_kill": [
      "That was a clean hit!"
    ],
    "boost_used": [
      "Hang on tight!",
      "I'm right behind you!"
    ],
    "charged_shot_used": [
      "Nice charge shot!",
      "That'll leave a mark!"
    ],
    "player_take_damage": [
      "Fox, you alright?"
    ],
    "player_low_health": [
      "Do a barrel roll!"
    ],
    "return_formation": [
      "Fall back and regroup!"
    ],
    "retreat": [
      "Systems failing! I have to pull out!",
      "I'm burning up — cover yourself!"
    ],
    "alone": [
      "Keep your guard up out there."
    ],
    "focus_ready": [
      "Standing by."
    ],
    "state_critical": [
      "Hull's in bad shape!",
      "I'm taking serious damage!"
    ],
    "state_recovered": [
      "Systems stable again.",
      "I'm holding together."
    ],
    "action_interrupted": [
      "Breaking off the maneuver.",
      "Action canceled. Resetting."
    ]
  },
  "2": {
    "engage_dogfight": [
      "Here goes nothing!"
    ],
    "engage_focus": [
      "O-okay, going in!"
    ],
    "engage_boss": [
      "Th-that thing's huge!!",
      "Here we go, big one!"
    ],
    "engage_horda": [
      "So many of them!!"
    ],
    "engage_fragata": [
      "That armor looks tough..."
    ],
    "ability_repair": [
      "Got a little something for you!",
      "Got you covered, buddy!",
      "Field repair incoming!",
      "Patch kit on the way!",
      "Don't worry, I can fix this!"
    ],
    "ability_morale": [
      "Everybody, hit harder!",
      "Boosting the whole squad!",
      "Morale boost is live!",
      "Let's turn this around!",
      "Damage link optimized!"
    ],
    "ability_boost_dash": [
      "I'm boosting with you!",
      "Turbo sync, go go go!",
      "No one can touch us now!",
      "Hold on, Fox!",
      "Boost trail engaged!"
    ],
    "ability_focus_upgrade": [
      "Morale systems ready!",
      "Everyone gets the boost!",
      "Focus command received!",
      "I can make every shot count!",
      "Squad link charged!"
    ],
    "kill": [
      "Yeah! Got one!"
    ],
    "boss_kill": [
      "We actually did it!!"
    ],
    "golden_kill": [
      "Whoa, nice shot!"
    ],
    "boost_used": [
      "H-here we go!"
    ],
    "charged_shot_used": [
      "Whoa, full charge!",
      "That was awesome!"
    ],
    "player_take_damage": [
      "Fox, look out!"
    ],
    "player_low_health": [
      "You okay out there?!"
    ],
    "return_formation": [
      "Heading back!"
    ],
    "retreat": [
      "I'm hit bad! Retreating!",
      "My ship is on fire! I need to bail out!"
    ],
    "alone": [
      "Where'd everyone go? Help me, Fox!"
    ],
    "focus_ready": [
      "R-ready when you are!"
    ],
    "state_critical": [
      "Uh-oh! My hull's critical!",
      "I-I need some breathing room!"
    ],
    "state_recovered": [
      "Whew! Systems are green again!",
      "Okay! I'm good!"
    ],
    "action_interrupted": [
      "Ah! I have to abort!",
      "Canceling that move!"
    ]
  },
  "3": {
    "engage_dogfight": [
      "Target acquired.",
      "Engaging with precision.",
      "I have the angle."
    ],
    "engage_focus": [
      "Moving to intercept."
    ],
    "engage_boss": [
      "Priority target confirmed.",
      "Engaging primary threat."
    ],
    "engage_horda": [
      "Multiple contacts, staying sharp."
    ],
    "engage_fragata": [
      "Scanning for a weak point."
    ],
    "ability_assist": [
      "Syncing targeting array.",
      "Systems synced.",
      "Uplink stable.",
      "Sharing target solution.",
      "Additional locks available."
    ],
    "ability_boombuster": [
      "Heavy charge pattern armed.",
      "Multiple targets, one solution.",
      "Boombuster volley released.",
      "Charged ordnance away.",
      "Saturation strike confirmed."
    ],
    "kill": [
      "Clean shot."
    ],
    "boss_kill": [
      "Target eliminated."
    ],
    "golden_kill": [
      "Precision strike, confirmed."
    ],
    "boost_used": [
      "Boosting."
    ],
    "charged_shot_used": [
      "Charge released.",
      "Direct hit."
    ],
    "player_take_damage": [
      "Steady, Fox."
    ],
    "player_low_health": [
      "Stay sharp, I've got you."
    ],
    "return_formation": [
      "Regrouping."
    ],
    "retreat": [
      "Critical damage. Disengaging.",
      "Hull compromised. I am leaving combat."
    ],
    "alone": [
      "...Just me and the silence now."
    ],
    "focus_ready": [
      "Awaiting your mark.",
      "Command link ready."
    ],
    "state_critical": [
      "Hull integrity critical.",
      "Damage threshold exceeded."
    ],
    "state_recovered": [
      "Integrity restored.",
      "Systems stable. Resuming."
    ],
    "action_interrupted": [
      "Maneuver aborted.",
      "Action interrupted. Reassessing."
    ]
  }
}

const TRIVIAL_EXPANSION = {
  "0": {
    "engage_dogfight": [
      "Let's see if you can keep up.",
      "I've got the fast one.",
      "Clear my lane, I'm going in.",
      "Found my mark. Don't blink.",
      "This one's mine until it isn't."
    ],
    "engage_boss": [
      "Big target, bigger opening.",
      "Finally, something worth chasing.",
      "Keep it busy. I'll find the weak side."
    ],
    "engage_horda": [
      "Too many? Sounds like a target-rich zone.",
      "I'll carve a lane through the swarm."
    ],
    "engage_fragata": [
      "Heavy hull. Doesn't mean it's untouchable.",
      "I'll get around that broadside."
    ],
    "kill": [
      "Scratch one.",
      "That's another off the scope.",
      "Next target.",
      "Should've turned sooner."
    ],
    "boss_kill": [
      "That's how you drop the big ones.",
      "Big ship, same ending."
    ],
    "golden_kill": [
      "Shiny target, easy to spot.",
      "That one was worth the chase."
    ],
    "boost_used": [
      "Now you're flying.",
      "That's more like it—move!"
    ],
    "charged_shot_used": [
      "Good. Make every volt count.",
      "That charge had some bite."
    ],
    "player_take_damage": [
      "Fox, quit giving them free shots.",
      "Shake it off and keep moving."
    ],
    "player_low_health": [
      "Don't you dare make me finish this alone."
    ],
    "state_critical": [
      "Controls are rough, but I'm still here."
    ],
    "state_recovered": [
      "Systems caught up. Let's go."
    ],
    "action_interrupted": [
      "Fine. New angle, same target."
    ]
  },
  "1": {
    "engage_dogfight": [
      "I'll keep this one occupied.",
      "Taking the safer angle.",
      "Stay behind my line.",
      "I have the intercept.",
      "Steady approach. No need to rush."
    ],
    "engage_boss": [
      "Watch its pattern before you commit.",
      "Big target. Keep your spacing.",
      "We bring it down together."
    ],
    "engage_horda": [
      "Don't let the swarm split us up.",
      "Hold your lanes and pick them apart."
    ],
    "engage_fragata": [
      "Armor that heavy always has a blind side.",
      "Stay clear of the broadside. I'll draw it."
    ],
    "kill": [
      "One less threat.",
      "Clean and controlled.",
      "Target neutralized.",
      "That's the way."
    ],
    "boss_kill": [
      "Good work. Everyone still with me?",
      "That's one for the flight log."
    ],
    "golden_kill": [
      "Excellent shot. Keep the formation loose.",
      "Special target down. Stay alert."
    ],
    "boost_used": [
      "Keep your nose steady through the burn.",
      "I'm with you. Don't oversteer."
    ],
    "charged_shot_used": [
      "Good timing on that charge.",
      "Hold that discipline and we'll be fine."
    ],
    "player_take_damage": [
      "Fox, check your six!",
      "Don't trade hull for a bad angle."
    ],
    "player_low_health": [
      "Stay with us, Fox. Keep it controlled."
    ],
    "state_critical": [
      "I can hold the line a little longer."
    ],
    "state_recovered": [
      "Damage control complete. Back on station."
    ],
    "action_interrupted": [
      "Breaking clean. I'll reset the approach."
    ]
  },
  "2": {
    "engage_dogfight": [
      "Okay, okay—I've got this one!",
      "I see an opening! I think!",
      "I'm going after that one!",
      "Target picked—here I go!",
      "Don't worry, I'm watching the gauges!"
    ],
    "engage_boss": [
      "That thing has WAY too many parts!",
      "I'll scan while we shoot!",
      "Big target means I can't miss, right?"
    ],
    "engage_horda": [
      "There's so many blips on my screen!",
      "I'll take the ones on the edge!"
    ],
    "engage_fragata": [
      "Whoa, that's a lot of armor plating!",
      "I think I found a thinner section!"
    ],
    "kill": [
      "Yes! That counted!",
      "Got it! I definitely got it!",
      "One down! Readings clear!",
      "Ha! My aim's getting better!"
    ],
    "boss_kill": [
      "It's going down! It's really going down!",
      "Yes! All those readings were worth it!"
    ],
    "golden_kill": [
      "Whoa, look at that signature vanish!",
      "Special target is gone! Nice!"
    ],
    "boost_used": [
      "Whoa—okay, matching speed!",
      "I'm keeping up! Mostly!"
    ],
    "charged_shot_used": [
      "That energy spike was huge!",
      "Full charge confirmed! Nice shot!"
    ],
    "player_take_damage": [
      "Fox! Your hull reading just jumped!",
      "Careful! I'm seeing damage!"
    ],
    "player_low_health": [
      "Fox, your readings are really bad!"
    ],
    "state_critical": [
      "Uh, my warning lights are ALL on!"
    ],
    "state_recovered": [
      "Okay! Warning lights are off again!"
    ],
    "action_interrupted": [
      "Abort! Abort—okay, resetting!"
    ]
  },
  "3": {
    "engage_dogfight": [
      "Vector selected. Engaging.",
      "I have a clean pursuit line.",
      "Contact isolated.",
      "Angle acquired. Moving in.",
      "I'll remove this one from the field."
    ],
    "engage_boss": [
      "Large signature. Weak points will emerge.",
      "Primary threat mapped.",
      "Maintaining pressure on the priority target."
    ],
    "engage_horda": [
      "Swarm geometry identified.",
      "I'll reduce the outer cluster first."
    ],
    "engage_fragata": [
      "Armor profile acquired. Adjusting vector.",
      "I'll work around its firing arc."
    ],
    "kill": [
      "Contact erased.",
      "Threat removed.",
      "Shot confirmed.",
      "Vector clear."
    ],
    "boss_kill": [
      "Primary signature collapsing.",
      "Priority threat eliminated. Continue."
    ],
    "golden_kill": [
      "Rare signature terminated.",
      "High-value contact resolved."
    ],
    "boost_used": [
      "Velocity increase acknowledged.",
      "Matching acceleration."
    ],
    "charged_shot_used": [
      "Energy release was efficient.",
      "Charge profile confirmed."
    ],
    "player_take_damage": [
      "Fox, hostile solution reached you.",
      "Adjust course. They're reading your line."
    ],
    "player_low_health": [
      "Fox, survival margin is narrowing."
    ],
    "state_critical": [
      "My margin is thin. I remain operational."
    ],
    "state_recovered": [
      "Integrity margin restored."
    ],
    "action_interrupted": [
      "Vector lost. Recomputing."
    ]
  }
}

for (const [pilotId, pools] of Object.entries(TRIVIAL_EXPANSION)) {
  const target = LINES[pilotId]
  for (const [eventId, extraLines] of Object.entries(pools)) {
    if (ABILITY_EVENT_IDS.has(eventId)) throw new Error('TRIVIAL_EXPANSION não pode conter ability: ' + eventId)
    if (!Array.isArray(target[eventId])) target[eventId] = []
    target[eventId].push(...extraLines)
  }
}

function pick(random, values) {
  if (!values || values.length === 0) return null
  const index = Math.min(values.length - 1, Math.floor(random() * values.length))
  return values[index]
}

export function getNewTrivialQuoteCount(pilotId) {
  return Object.values(TRIVIAL_EXPANSION[pilotId] || {}).reduce((total, pool) => total + pool.length, 0)
}

export function getWingmanRadioLineStats(pilotId) {
  const pools = LINES[pilotId] || {}
  let total = 0
  let ability = 0
  let trivial = 0
  for (const [eventId, pool] of Object.entries(pools)) {
    const count = Array.isArray(pool) ? pool.length : 0
    total += count
    if (ABILITY_EVENT_IDS.has(eventId)) ability += count
    else trivial += count
  }
  return { total, ability, trivial, newTrivial: getNewTrivialQuoteCount(pilotId) }
}

export function getWingmanRadioLineCount(pilotId) {
  return getWingmanRadioLineStats(pilotId).total
}

export function getWingmanRadioValidationSnapshot(pilotId) {
  const pools = LINES[pilotId] || {}
  const trivialLines = []
  const abilityLines = []
  for (const [eventId, pool] of Object.entries(pools)) {
    if (!Array.isArray(pool)) continue
    if (ABILITY_EVENT_IDS.has(eventId)) abilityLines.push(...pool)
    else trivialLines.push(...pool)
  }
  return {
    trivialLines: [...trivialLines],
    abilityLines: [...abilityLines],
    newTrivialLines: Object.values(TRIVIAL_EXPANSION[pilotId] || {}).flat(),
  }
}

export function createWingmanRadio({
  random = Math.random,
  enforceSquadSilence = true,
  squadSilenceGapMs = SQUAD_TRIVIAL_GAP_MS,
  categoryDedupWindowMs = EVENT_CATEGORY_DEDUP_WINDOW_MS,
} = {}) {
  const nextAllowedAtByPilot = new Map()
  const lastCategoryEmittedAt = new Map()
  let squadTrivialSilenceUntil = -Infinity
  let lastGlobalTrivialSpokenAt = -Infinity
  let hasSaidAlone = false
  const conversations = createWingmanRadioConversationManager({ random })

  function scheduleNextNormalLine(pilotId, now) {
    nextAllowedAtByPilot.set(
      pilotId,
      now + GLOBAL_COOLDOWN_MIN_MS + random() * (GLOBAL_COOLDOWN_MAX_MS - GLOBAL_COOLDOWN_MIN_MS),
    )
  }

  function emit(pilotId, eventId, now, context = {}, force = false, bypassCooldown = false) {
    const isAbility = ABILITY_EVENT_IDS.has(eventId)
    // 1.1 Rádio dos aliados: somente trivial — habilidade NUNCA usa rádio
    if (isAbility) return null

    // 1.2 Cooldown global real de fala: no máximo 1 fala trivial a cada 6s no esquadrão inteiro
    if (now - lastGlobalTrivialSpokenAt < squadSilenceGapMs) return null

    const isUrgent = force || eventId === 'retreat' || eventId === 'state_critical'

    if (!isUrgent) {
      if (now < squadTrivialSilenceUntil) return null
      const category = getEventCategory(eventId)
      const lastCatAt = lastCategoryEmittedAt.get(category) ?? -Infinity
      if (now - lastCatAt < categoryDedupWindowMs) return null
    }

    const nextAllowedAt = nextAllowedAtByPilot.get(pilotId) ?? -Infinity
    if (!force && !bypassCooldown && now < nextAllowedAt) return null
    const pool = LINES[pilotId]?.[eventId]
    if (!pool || pool.length === 0) return null

    const line = pick(random, pool)

    lastGlobalTrivialSpokenAt = now
    squadTrivialSilenceUntil = now + TRIVIAL_TRANSMISSION_ESTIMATED_MS + squadSilenceGapMs

    if (isUrgent) {
      conversations.cancelPendingResponse('urgent-preempt')
    } else {
      if (!bypassCooldown) scheduleNextNormalLine(pilotId, now)
      const category = getEventCategory(eventId)
      lastCategoryEmittedAt.set(category, now)
    }

    conversations.openFromEvent({
      openerPilotId: pilotId,
      triggerEventId: eventId,
      now,
      activePilotIds: context.activePilotIds || [],
      force,
    })
    return line
  }

  return {
    markSpoken(pilotId, now = performance.now()) {
      scheduleNextNormalLine(pilotId, now)
    },
    trySpeak(pilotId, eventId, now = performance.now(), context = {}) {
      return emit(pilotId, eventId, now, context, false, false)
    },
    forceSpeak(pilotId, eventId, now = performance.now(), context = {}) {
      return emit(pilotId, eventId, now, context, true, false)
    },
    // Habilidade não usa rádio (retorna sempre null)
    speakAbility(_pilotId, _eventId, _now = performance.now(), _context = {}) {
      return null
    },
    trySpeakAlone(pilotId, now = performance.now()) {
      if (hasSaidAlone) return null
      const line = emit(pilotId, 'alone', now, {}, false, false)
      if (line) hasSaidAlone = true
      return line
    },
    getLine(pilotId, eventId) {
      return pick(random, LINES[pilotId]?.[eventId])
    },
    takeDueResponse(now = performance.now(), eligibleResponderIds = []) {
      if (now - lastGlobalTrivialSpokenAt < squadSilenceGapMs) return null
      const reply = conversations.takeDueResponse(now, eligibleResponderIds)
      if (reply) {
        lastGlobalTrivialSpokenAt = now
        squadTrivialSilenceUntil = now + TRIVIAL_TRANSMISSION_ESTIMATED_MS + squadSilenceGapMs
      }
      return reply
    },
    cancelPendingResponse(reason) {
      return conversations.cancelPendingResponse(reason)
    },
    cancelConversationForPilot(pilotId, reason) {
      return conversations.cancelConversationForPilot(pilotId, reason)
    },
    getConversationDebug() {
      return conversations.getDebugSnapshot()
    },
    getSquadTrivialSilenceUntil() {
      return squadTrivialSilenceUntil
    },
    reset() {
      nextAllowedAtByPilot.clear()
      lastCategoryEmittedAt.clear()
      squadTrivialSilenceUntil = -Infinity
      lastGlobalTrivialSpokenAt = -Infinity
      hasSaidAlone = false
      conversations.reset()
    },
  }
}
