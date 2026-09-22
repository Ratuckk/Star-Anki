export const WINGMAN_BEHAVIORS = Object.freeze({
  PATROL: 'patrol',
  DOGFIGHT: 'dogfight',
  REGROUP: 'regroup',
})

export const WINGMAN_ACTIONS = Object.freeze({
  RAM: 'ram',
  GUARD: 'guard',
  RESCUE: 'rescue',
  ASSIST: 'assist',
  AUX_SHIELD: 'auxShield',
})

export const WINGMAN_ACTION_PHASES = Object.freeze({
  STARTUP: 'startup',
  ACTIVE: 'active',
  RECOVERY: 'recovery',
})

export const WINGMAN_COOLDOWN_POLICIES = Object.freeze({
  FULL: 'full',
  PARTIAL: 'partial',
  PRESERVE: 'preserve',
  NONE: 'none',
})

export const WINGMAN_INTERRUPT_EVENTS = Object.freeze({
  INTEGRITY_CRITICAL: 'integrity-critical',
  INTEGRITY_RETREAT: 'integrity-retreat',
  EMERGENCY_RETURN: 'emergency-return',
  TARGET_INVALIDATED: 'target-invalidated',
})

const ACTION_DEFINITIONS = Object.freeze({
  [WINGMAN_ACTIONS.RAM]: Object.freeze({
    allowedBehaviors: [WINGMAN_BEHAVIORS.DOGFIGHT],
    cooldownKey: 'primary',
    pausesCooldownKeys: ['primary'],
    completionPolicy: WINGMAN_COOLDOWN_POLICIES.FULL,
    interruptions: Object.freeze({
      [WINGMAN_INTERRUPT_EVENTS.INTEGRITY_CRITICAL]: WINGMAN_COOLDOWN_POLICIES.FULL,
      [WINGMAN_INTERRUPT_EVENTS.INTEGRITY_RETREAT]: WINGMAN_COOLDOWN_POLICIES.FULL,
      [WINGMAN_INTERRUPT_EVENTS.EMERGENCY_RETURN]: WINGMAN_COOLDOWN_POLICIES.FULL,
      [WINGMAN_INTERRUPT_EVENTS.TARGET_INVALIDATED]: WINGMAN_COOLDOWN_POLICIES.FULL,
    }),
  }),
  [WINGMAN_ACTIONS.GUARD]: Object.freeze({
    allowedBehaviors: [WINGMAN_BEHAVIORS.PATROL],
    cooldownKey: 'primary',
    pausesCooldownKeys: ['primary'],
    completionPolicy: WINGMAN_COOLDOWN_POLICIES.FULL,
    interruptions: Object.freeze({
      [WINGMAN_INTERRUPT_EVENTS.INTEGRITY_CRITICAL]: WINGMAN_COOLDOWN_POLICIES.FULL,
      [WINGMAN_INTERRUPT_EVENTS.INTEGRITY_RETREAT]: WINGMAN_COOLDOWN_POLICIES.FULL,
      [WINGMAN_INTERRUPT_EVENTS.EMERGENCY_RETURN]: WINGMAN_COOLDOWN_POLICIES.FULL,
    }),
  }),
  [WINGMAN_ACTIONS.RESCUE]: Object.freeze({
    allowedBehaviors: [WINGMAN_BEHAVIORS.PATROL, WINGMAN_BEHAVIORS.DOGFIGHT, WINGMAN_BEHAVIORS.REGROUP],
    cooldownKey: 'rescue',
    // Comportamento legado: qualquer abilityActive pausava o cooldown principal. Agora isso é
    // uma política declarada, não um efeito colateral de um booleano genérico.
    pausesCooldownKeys: ['primary'],
    completionPolicy: WINGMAN_COOLDOWN_POLICIES.FULL,
    interruptions: Object.freeze({
      [WINGMAN_INTERRUPT_EVENTS.INTEGRITY_CRITICAL]: WINGMAN_COOLDOWN_POLICIES.FULL,
      [WINGMAN_INTERRUPT_EVENTS.INTEGRITY_RETREAT]: WINGMAN_COOLDOWN_POLICIES.FULL,
      [WINGMAN_INTERRUPT_EVENTS.EMERGENCY_RETURN]: WINGMAN_COOLDOWN_POLICIES.FULL,
    }),
  }),
  [WINGMAN_ACTIONS.ASSIST]: Object.freeze({
    allowedBehaviors: [WINGMAN_BEHAVIORS.PATROL],
    cooldownKey: 'primary',
    pausesCooldownKeys: ['primary'],
    completionPolicy: WINGMAN_COOLDOWN_POLICIES.FULL,
    interruptions: Object.freeze({
      [WINGMAN_INTERRUPT_EVENTS.INTEGRITY_CRITICAL]: WINGMAN_COOLDOWN_POLICIES.FULL,
      [WINGMAN_INTERRUPT_EVENTS.INTEGRITY_RETREAT]: WINGMAN_COOLDOWN_POLICIES.FULL,
      [WINGMAN_INTERRUPT_EVENTS.EMERGENCY_RETURN]: WINGMAN_COOLDOWN_POLICIES.FULL,
    }),
  }),
  [WINGMAN_ACTIONS.AUX_SHIELD]: Object.freeze({
    allowedBehaviors: [WINGMAN_BEHAVIORS.PATROL, WINGMAN_BEHAVIORS.DOGFIGHT, WINGMAN_BEHAVIORS.REGROUP],
    cooldownKey: null,
    pausesCooldownKeys: ['primary'],
    completionPolicy: WINGMAN_COOLDOWN_POLICIES.NONE,
    interruptions: Object.freeze({
      [WINGMAN_INTERRUPT_EVENTS.INTEGRITY_CRITICAL]: WINGMAN_COOLDOWN_POLICIES.NONE,
      [WINGMAN_INTERRUPT_EVENTS.INTEGRITY_RETREAT]: WINGMAN_COOLDOWN_POLICIES.NONE,
      [WINGMAN_INTERRUPT_EVENTS.EMERGENCY_RETURN]: WINGMAN_COOLDOWN_POLICIES.NONE,
    }),
  }),
})

const COOLDOWN_KEYS = Object.freeze(['primary', 'intercept', 'rescue', 'boombuster'])
const LEGACY_ACTION_STATE = Object.freeze({
  [WINGMAN_ACTIONS.RAM]: 'ram',
  [WINGMAN_ACTIONS.RESCUE]: 'rescue',
  [WINGMAN_ACTIONS.GUARD]: 'escort',
  [WINGMAN_ACTIONS.ASSIST]: 'escort',
  [WINGMAN_ACTIONS.AUX_SHIELD]: 'escort',
})

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function freshBehavior(kind, { origin = 'system', reason = null, targetEnemy = null } = {}) {
  return { kind, elapsed: 0, origin, reason, targetEnemy }
}

function getActionDefinition(kind) {
  return ACTION_DEFINITIONS[kind] || null
}

function actionPausesCooldown(control, key) {
  if (!control.action) return false
  const def = getActionDefinition(control.action.kind)
  return !!def?.pausesCooldownKeys?.includes(key)
}

function cooldownResult(current, full, policy, fraction = 0.5) {
  if (policy === WINGMAN_COOLDOWN_POLICIES.NONE) return current
  if (policy === WINGMAN_COOLDOWN_POLICIES.PRESERVE) return current
  if (policy === WINGMAN_COOLDOWN_POLICIES.PARTIAL) return Math.max(current, full * clamp(fraction, 0, 1))
  return Math.max(current, full)
}

function summarizeAction(action) {
  if (!action) return null
  return {
    kind: action.kind,
    phase: action.phase,
    elapsed: action.elapsed,
    phaseElapsed: action.phaseElapsed,
    cooldownKey: action.cooldownKey,
    cooldownSeconds: action.cooldownSeconds,
    targetId: action.data?.targetEnemy?.id ?? null,
  }
}

export function isWingmanCritical(wingman, lowHpThreshold = 1) {
  const hp = wingman?.control?.resources?.hp ?? 0
  return hp > 0 && hp <= lowHpThreshold
}

export function getWingmanLegacyState(wingman, lowHpThreshold = 1) {
  const control = wingman.control
  if (control.retreat) return 'retreating'
  if (control.action) return LEGACY_ACTION_STATE[control.action.kind] || control.behavior.kind
  if (control.behavior.kind === WINGMAN_BEHAVIORS.REGROUP) return 'regroup'
  if (isWingmanCritical(wingman, lowHpThreshold)) return 'damaged-passive'
  return control.behavior.kind
}

export function snapshotWingmanAuthority(wingman, lowHpThreshold = 1) {
  const control = wingman.control
  return {
    integrity: {
      hp: control.resources.hp,
      maxHp: control.resources.maxHp,
      shield: control.resources.shield,
      maxShield: control.resources.maxShield,
      critical: isWingmanCritical(wingman, lowHpThreshold),
      retreating: !!control.retreat,
    },
    behavior: {
      kind: control.behavior.kind,
      origin: control.behavior.origin,
      reason: control.behavior.reason,
      targetId: control.behavior.targetEnemy?.id ?? null,
    },
    action: summarizeAction(control.action),
    cooldowns: { ...control.cooldowns },
  }
}

export function validateWingmanInvariants(wingman, lowHpThreshold = 1) {
  const control = wingman.control
  const errors = []
  const r = control.resources
  if (!Number.isFinite(r.hp) || r.hp < 0 || r.hp > r.maxHp) errors.push('hp-out-of-bounds')
  if (!Number.isFinite(r.shield) || r.shield < 0 || r.shield > r.maxShield) errors.push('shield-out-of-bounds')
  if (r.hp === 0 && !control.retreat) errors.push('zero-hp-without-retreat')
  if (control.retreat && control.action) errors.push('retreat-with-action')
  if (isWingmanCritical(wingman, lowHpThreshold) && control.action) errors.push('critical-with-action')
  if (control.behavior.kind === WINGMAN_BEHAVIORS.REGROUP && control.behavior.reason === 'emergency-distance' && control.action) {
    errors.push('emergency-regroup-with-action')
  }
  if (control.behavior.kind === WINGMAN_BEHAVIORS.DOGFIGHT && !control.behavior.targetEnemy) errors.push('dogfight-without-target')
  if (control.action?.kind === WINGMAN_ACTIONS.RAM && !control.action.data?.targetEnemy) errors.push('ram-without-target')
  for (const key of COOLDOWN_KEYS) {
    const value = control.cooldowns[key]
    if (!Number.isFinite(value) || value < 0) errors.push(`invalid-cooldown:${key}`)
  }
  return { ok: errors.length === 0, errors }
}

export function getWingmanInterruptionPolicy(actionKind, event, phase = WINGMAN_ACTION_PHASES.ACTIVE) {
  void phase // reservado para políticas diferentes por fase sem quebrar a API.
  return getActionDefinition(actionKind)?.interruptions?.[event] ?? null
}

export function composeWingmanStat({
  base = 0,
  personality = [],
  upgrades = [],
  reactive = [],
  commands = [],
  overrides = [],
  min = -Infinity,
  max = Infinity,
} = {}) {
  let value = base
  const applied = []
  const applyMods = (bucket, label) => {
    for (const mod of bucket || []) {
      if (!mod) continue
      if (Number.isFinite(mod.add)) value += mod.add
      if (Number.isFinite(mod.multiply)) value *= mod.multiply
      applied.push({ stage: label, id: mod.id || null, add: mod.add ?? 0, multiply: mod.multiply ?? 1 })
    }
  }
  applyMods(personality, 'personality')
  applyMods(upgrades, 'upgrades')
  applyMods(reactive, 'reactive')
  applyMods(commands, 'commands')

  let winningOverride = null
  for (const candidate of overrides || []) {
    if (!candidate || !Number.isFinite(candidate.value)) continue
    if (!winningOverride || (candidate.priority || 0) > (winningOverride.priority || 0)) winningOverride = candidate
  }
  if (winningOverride) value = winningOverride.value
  value = clamp(value, min, max)
  return { value, applied, override: winningOverride ? { ...winningOverride } : null }
}

export function initializeWingmanControl(wingman, {
  hp,
  maxHp,
  shield,
  maxShield,
  shieldRegenDelay = 0,
  primaryCooldown = 0,
  interceptCooldown = 0,
  rescueCooldown = 0,
  boombusterCooldown = 0,
  engagementCooldown = 0,
  lowHpThreshold = 1,
} = {}) {
  if (!wingman || wingman.control) throw new Error('Wingman control já inicializado ou wingman inválido')
  wingman.control = {
    resources: { hp, maxHp, shield, maxShield, shieldRegenDelay },
    behavior: freshBehavior(WINGMAN_BEHAVIORS.PATROL, { origin: 'spawn' }),
    action: null,
    retreat: null,
    cooldowns: {
      primary: Math.max(0, primaryCooldown),
      intercept: Math.max(0, interceptCooldown),
      rescue: Math.max(0, rescueCooldown),
      boombuster: Math.max(0, boombusterCooldown),
    },
    engagementCooldown: Math.max(0, engagementCooldown),
    lowHpThreshold,
  }

  const getter = (name, get) => Object.defineProperty(wingman, name, {
    configurable: false,
    enumerable: true,
    get,
  })
  getter('state', () => getWingmanLegacyState(wingman, lowHpThreshold))
  getter('stateTimer', () => wingman.control.retreat?.elapsed ?? wingman.control.action?.elapsed ?? wingman.control.behavior.elapsed)
  getter('targetEnemy', () => wingman.control.action?.data?.targetEnemy || wingman.control.behavior.targetEnemy || null)
  getter('abilityActive', () => !!wingman.control.action)
  getter('abilityTimer', () => wingman.control.action?.elapsed || 0)
  getter('abilityApplied', () => !!wingman.control.action?.data?.applied)
  getter('escortKind', () => {
    const kind = wingman.control.action?.kind
    return kind === WINGMAN_ACTIONS.GUARD || kind === WINGMAN_ACTIONS.ASSIST || kind === WINGMAN_ACTIONS.AUX_SHIELD ? kind : null
  })
  getter('emergencyRegroup', () => wingman.control.behavior.kind === WINGMAN_BEHAVIORS.REGROUP && wingman.control.behavior.reason === 'emergency-distance')
  getter('chainCount', () => wingman.control.action?.kind === WINGMAN_ACTIONS.RAM ? (wingman.control.action.data.chainCount || 0) : 0)
  getter('abilityCooldown', () => wingman.control.cooldowns.primary)
  getter('interceptCooldown', () => wingman.control.cooldowns.intercept)
  getter('rescueCooldown', () => wingman.control.cooldowns.rescue)
  getter('boombusterCooldown', () => wingman.control.cooldowns.boombuster)
  getter('engagementCooldown', () => wingman.control.engagementCooldown)
  getter('hp', () => wingman.control.resources.hp)
  getter('maxHp', () => wingman.control.resources.maxHp)
  getter('shield', () => wingman.control.resources.shield)
  getter('shieldMax', () => wingman.control.resources.maxShield)
  getter('shieldRegenDelay', () => wingman.control.resources.shieldRegenDelay)
  return wingman.control
}

export function createWingmanStateController({ lowHpThreshold = 1, onDecision = null, onInvariantFailure = null } = {}) {
  function decision(wingman, { region, requested, event, source = 'system', accepted, reason = null, before, meta = {} }) {
    const after = snapshotWingmanAuthority(wingman, lowHpThreshold)
    const result = {
      pilotId: wingman.profile?.id ?? null,
      pilot: wingman.profile?.name ?? null,
      region,
      requested,
      event,
      source,
      decision: accepted ? 'accepted' : 'rejected',
      reason,
      before,
      after,
      ...meta,
    }
    onDecision?.(wingman, result)
    if (accepted) {
      const invariantResult = validateWingmanInvariants(wingman, lowHpThreshold)
      if (!invariantResult.ok) onInvariantFailure?.(wingman, invariantResult, result)
    }
    return result
  }

  function reject(wingman, request, reason, before = snapshotWingmanAuthority(wingman, lowHpThreshold)) {
    return decision(wingman, { ...request, accepted: false, reason, before })
  }

  function setCooldown(wingman, key, seconds) {
    if (!COOLDOWN_KEYS.includes(key)) throw new Error(`Cooldown de Wingman desconhecido: ${key}`)
    wingman.control.cooldowns[key] = Math.max(0, Number(seconds) || 0)
  }

  function setEngagementCooldown(wingman, seconds) {
    wingman.control.engagementCooldown = Math.max(0, Number(seconds) || 0)
  }

  function setMaxHp(wingman, maxHp, { refill = false } = {}) {
    const r = wingman.control.resources
    r.maxHp = Math.max(1, Number(maxHp) || 1)
    r.hp = refill ? r.maxHp : Math.min(r.hp, r.maxHp)
  }

  function refillIntegrity(wingman) {
    const r = wingman.control.resources
    r.hp = r.maxHp
    r.shield = r.maxShield
    r.shieldRegenDelay = 0
    wingman.control.retreat = null
    wingman.control.action = null
    wingman.control.behavior = freshBehavior(WINGMAN_BEHAVIORS.PATROL, { origin: 'recovery' })
  }

  function tick(wingman, dt, { maxHp = null, shieldRegenPerSecond = 0 } = {}) {
    const control = wingman.control
    if (Number.isFinite(maxHp) && maxHp !== control.resources.maxHp) setMaxHp(wingman, maxHp)
    if (control.retreat) control.retreat.elapsed += dt
    else if (control.action) {
      control.action.elapsed += dt
      control.action.phaseElapsed += dt
    } else {
      control.behavior.elapsed += dt
    }
    control.engagementCooldown = Math.max(0, control.engagementCooldown - dt)
    for (const key of COOLDOWN_KEYS) {
      if (!actionPausesCooldown(control, key)) control.cooldowns[key] = Math.max(0, control.cooldowns[key] - dt)
    }
    if (control.resources.shieldRegenDelay > 0) {
      control.resources.shieldRegenDelay = Math.max(0, control.resources.shieldRegenDelay - dt)
    } else if (control.resources.shield < control.resources.maxShield && shieldRegenPerSecond > 0) {
      control.resources.shield = Math.min(control.resources.maxShield, control.resources.shield + shieldRegenPerSecond * dt)
    }
  }

  function requestBehavior(wingman, kind, {
    source = 'system', event = 'behavior-requested', reason = null, origin = source, targetEnemy = null,
  } = {}) {
    const before = snapshotWingmanAuthority(wingman, lowHpThreshold)
    const request = { region: 'behavior', requested: kind, event, source }
    const control = wingman.control
    if (control.retreat) return reject(wingman, request, 'integrity-retreating', before)
    if (control.action) return reject(wingman, request, 'action-committed', before)
    if (control.behavior.kind === WINGMAN_BEHAVIORS.REGROUP && control.behavior.reason === 'emergency-distance' && kind !== WINGMAN_BEHAVIORS.REGROUP) {
      return reject(wingman, request, 'emergency-return-lock', before)
    }
    if (kind === WINGMAN_BEHAVIORS.DOGFIGHT) {
      if (isWingmanCritical(wingman, lowHpThreshold)) return reject(wingman, request, 'integrity-critical', before)
      if (!targetEnemy || targetEnemy.dying || !targetEnemy.mesh) return reject(wingman, request, 'invalid-target', before)
    }
    if (kind === WINGMAN_BEHAVIORS.REGROUP && reason !== 'emergency-distance' && control.action) {
      return reject(wingman, request, 'action-committed', before)
    }
    if (!Object.values(WINGMAN_BEHAVIORS).includes(kind)) return reject(wingman, request, 'unknown-behavior', before)
    control.behavior = freshBehavior(kind, { origin, reason, targetEnemy: kind === WINGMAN_BEHAVIORS.DOGFIGHT ? targetEnemy : null })
    return decision(wingman, { ...request, accepted: true, before })
  }

  function onCommandIntentChanged(wingman, mode) {
    if (mode !== 'free') return null
    if (wingman.control.behavior.kind !== WINGMAN_BEHAVIORS.DOGFIGHT || wingman.control.behavior.origin !== 'focus') return null
    return requestBehavior(wingman, WINGMAN_BEHAVIORS.PATROL, {
      source: 'squadron-command', event: 'command-withdrawn', origin: 'command-withdrawn',
    })
  }

  function startAction(wingman, kind, {
    source = 'system', event = 'action-requested', phase = WINGMAN_ACTION_PHASES.ACTIVE,
    cooldownSeconds = 0, data = {},
  } = {}) {
    const before = snapshotWingmanAuthority(wingman, lowHpThreshold)
    const request = { region: 'action', requested: kind, event, source }
    const control = wingman.control
    const def = getActionDefinition(kind)
    if (!def) return reject(wingman, request, 'unknown-action', before)
    if (control.retreat) return reject(wingman, request, 'integrity-retreating', before)
    if (isWingmanCritical(wingman, lowHpThreshold)) return reject(wingman, request, 'integrity-critical', before)
    if (control.action) return reject(wingman, request, 'action-already-active', before)
    if (control.behavior.kind === WINGMAN_BEHAVIORS.REGROUP && control.behavior.reason === 'emergency-distance') {
      return reject(wingman, request, 'emergency-return-lock', before)
    }
    if (!def.allowedBehaviors.includes(control.behavior.kind)) return reject(wingman, request, 'behavior-incompatible', before)
    if (def.cooldownKey && control.cooldowns[def.cooldownKey] > 0) return reject(wingman, request, 'cooldown-active', before)
    if (kind === WINGMAN_ACTIONS.RAM && (!data.targetEnemy || data.targetEnemy.dying || !data.targetEnemy.mesh)) {
      return reject(wingman, request, 'invalid-target', before)
    }
    control.action = {
      kind,
      phase,
      elapsed: 0,
      phaseElapsed: 0,
      cooldownKey: def.cooldownKey,
      cooldownSeconds: Math.max(0, cooldownSeconds),
      data: { ...data },
    }
    // A Action passa a ser dona de seus dados. O Behavior subjacente é neutralizado para impedir
    // target duplicado ou retorno implícito a um dogfight que a Action já substituiu.
    control.behavior = freshBehavior(WINGMAN_BEHAVIORS.PATROL, { origin: `action:${kind}` })
    return decision(wingman, { ...request, accepted: true, before, meta: { phase, cooldownKey: def.cooldownKey } })
  }

  function setActionPhase(wingman, phase, { source = 'system', event = 'action-phase-changed' } = {}) {
    const before = snapshotWingmanAuthority(wingman, lowHpThreshold)
    const request = { region: 'action', requested: phase, event, source }
    if (!wingman.control.action) return reject(wingman, request, 'no-active-action', before)
    if (!Object.values(WINGMAN_ACTION_PHASES).includes(phase)) return reject(wingman, request, 'unknown-phase', before)
    wingman.control.action.phase = phase
    wingman.control.action.phaseElapsed = 0
    return decision(wingman, { ...request, accepted: true, before })
  }

  function setActionData(wingman, patch) {
    if (!wingman.control.action) return false
    Object.assign(wingman.control.action.data, patch)
    return true
  }

  function retargetAction(wingman, targetEnemy) {
    if (wingman.control.action?.kind !== WINGMAN_ACTIONS.RAM || !targetEnemy || targetEnemy.dying || !targetEnemy.mesh) return false
    wingman.control.action.data.targetEnemy = targetEnemy
    wingman.control.action.elapsed = 0
    wingman.control.action.phaseElapsed = 0
    return true
  }

  function applyActionCooldown(wingman, action, policy, partialFraction = 0.5) {
    if (!action?.cooldownKey || !COOLDOWN_KEYS.includes(action.cooldownKey)) return { key: null, before: 0, after: 0, policy }
    const before = wingman.control.cooldowns[action.cooldownKey]
    const after = cooldownResult(before, action.cooldownSeconds, policy, partialFraction)
    wingman.control.cooldowns[action.cooldownKey] = after
    return { key: action.cooldownKey, before, after, policy }
  }

  function finishAction(wingman, {
    source = 'system', event = 'action-completed', outcome = 'completed',
    cooldownPolicy = null, partialFraction = 0.5, engagementCooldown = null,
  } = {}) {
    const before = snapshotWingmanAuthority(wingman, lowHpThreshold)
    const action = wingman.control.action
    const request = { region: 'action', requested: 'none', event, source }
    if (!action) return reject(wingman, request, 'no-active-action', before)
    const def = getActionDefinition(action.kind)
    const policy = cooldownPolicy || def?.completionPolicy || WINGMAN_COOLDOWN_POLICIES.NONE
    const cooldown = applyActionCooldown(wingman, action, policy, partialFraction)
    wingman.control.action = null
    wingman.control.behavior = freshBehavior(WINGMAN_BEHAVIORS.PATROL, { origin: `action-${outcome}:${action.kind}` })
    if (Number.isFinite(engagementCooldown)) setEngagementCooldown(wingman, engagementCooldown)
    return decision(wingman, {
      ...request, accepted: true, before,
      meta: { action: action.kind, phase: action.phase, outcome, cooldownPolicy: policy, cooldown },
    })
  }

  function interruptAction(wingman, interruptEvent, {
    source = 'system', partialFraction = 0.5, nextBehavior = WINGMAN_BEHAVIORS.PATROL,
    behaviorReason = null, engagementCooldown = null,
  } = {}) {
    const before = snapshotWingmanAuthority(wingman, lowHpThreshold)
    const action = wingman.control.action
    const request = { region: 'action', requested: 'interrupt', event: interruptEvent, source }
    if (!action) return reject(wingman, request, 'no-active-action', before)
    const policy = getWingmanInterruptionPolicy(action.kind, interruptEvent, action.phase)
    if (!policy) return reject(wingman, request, 'interruption-not-allowed', before)
    const cooldown = applyActionCooldown(wingman, action, policy, partialFraction)
    wingman.control.action = null
    wingman.control.behavior = freshBehavior(nextBehavior, { origin: `interrupt:${interruptEvent}`, reason: behaviorReason })
    if (Number.isFinite(engagementCooldown)) setEngagementCooldown(wingman, engagementCooldown)
    return decision(wingman, {
      ...request, accepted: true, before,
      meta: { action: action.kind, phase: action.phase, cooldownPolicy: policy, cooldown },
    })
  }

  function enterEmergencyRegroup(wingman, { source = 'distance-safety', event = WINGMAN_INTERRUPT_EVENTS.EMERGENCY_RETURN } = {}) {
    const before = snapshotWingmanAuthority(wingman, lowHpThreshold)
    const request = { region: 'behavior', requested: WINGMAN_BEHAVIORS.REGROUP, event, source }
    if (wingman.control.retreat) return reject(wingman, request, 'integrity-retreating', before)
    if (!wingman.control.action && wingman.control.behavior.kind === WINGMAN_BEHAVIORS.REGROUP && wingman.control.behavior.reason === 'emergency-distance') {
      return {
        pilotId: wingman.profile?.id ?? null,
        pilot: wingman.profile?.name ?? null,
        ...request,
        decision: 'accepted',
        reason: null,
        before,
        after: before,
        interruption: null,
        noop: true,
      }
    }
    let interruption = null
    if (wingman.control.action) {
      const action = wingman.control.action
      const policy = getWingmanInterruptionPolicy(action.kind, WINGMAN_INTERRUPT_EVENTS.EMERGENCY_RETURN, action.phase)
      if (!policy) return reject(wingman, request, 'action-not-interruptible-by-emergency', before)
      const cooldown = applyActionCooldown(wingman, action, policy)
      interruption = { action: action.kind, phase: action.phase, cooldownPolicy: policy, cooldown }
      wingman.control.action = null
    }
    wingman.control.behavior = freshBehavior(WINGMAN_BEHAVIORS.REGROUP, {
      origin: source,
      reason: 'emergency-distance',
    })
    return decision(wingman, { ...request, accepted: true, before, meta: { interruption } })
  }

  function arriveFormation(wingman, { source = 'formation', event = 'formation-reached' } = {}) {
    const before = snapshotWingmanAuthority(wingman, lowHpThreshold)
    const request = { region: 'behavior', requested: WINGMAN_BEHAVIORS.PATROL, event, source }
    if (wingman.control.retreat) return reject(wingman, request, 'integrity-retreating', before)
    if (wingman.control.action) return reject(wingman, request, 'action-committed', before)
    if (wingman.control.behavior.kind !== WINGMAN_BEHAVIORS.REGROUP) return reject(wingman, request, 'not-regrouping', before)
    wingman.control.behavior = freshBehavior(WINGMAN_BEHAVIORS.PATROL, { origin: 'formation-reached' })
    return decision(wingman, { ...request, accepted: true, before })
  }

  function applyDamage(wingman, { amount = 1, shieldRegenDelay = 0, source = 'combat', event = 'damage-received' } = {}) {
    const before = snapshotWingmanAuthority(wingman, lowHpThreshold)
    const request = { region: 'integrity', requested: 'damage', event, source }
    const control = wingman.control
    if (control.retreat) return reject(wingman, request, 'integrity-retreating', before)
    const r = control.resources
    r.shieldRegenDelay = Math.max(r.shieldRegenDelay, shieldRegenDelay)
    let remaining = Math.max(0, amount)
    // Preserva o contrato atual: qualquer fração positiva de escudo absorve o hit inteiro; o
    // excedente não atravessa para o casco no mesmo impacto.
    if (r.shield > 0 && remaining > 0) {
      r.shield = Math.max(0, r.shield - remaining)
      remaining = 0
    }
    if (remaining > 0) r.hp = Math.max(0, r.hp - remaining)

    let interruption = null
    if (r.hp <= 0) {
      if (control.action) {
        const action = control.action
        const policy = getWingmanInterruptionPolicy(action.kind, WINGMAN_INTERRUPT_EVENTS.INTEGRITY_RETREAT, action.phase)
        const cooldown = policy ? applyActionCooldown(wingman, action, policy) : null
        interruption = { action: action.kind, phase: action.phase, cooldownPolicy: policy, cooldown }
      }
      control.action = null
      control.behavior = freshBehavior(WINGMAN_BEHAVIORS.PATROL, { origin: 'integrity-retreat' })
      control.retreat = { elapsed: 0, reason: 'hp-zero' }
    } else if (isWingmanCritical(wingman, lowHpThreshold)) {
      if (control.action) {
        const action = control.action
        const policy = getWingmanInterruptionPolicy(action.kind, WINGMAN_INTERRUPT_EVENTS.INTEGRITY_CRITICAL, action.phase)
        const cooldown = policy ? applyActionCooldown(wingman, action, policy) : null
        interruption = { action: action.kind, phase: action.phase, cooldownPolicy: policy, cooldown }
        control.action = null
      }
      if (control.behavior.kind === WINGMAN_BEHAVIORS.DOGFIGHT) {
        control.behavior = freshBehavior(WINGMAN_BEHAVIORS.PATROL, { origin: 'integrity-critical' })
      }
      // regroup (inclusive emergência) é preservado: integridade bloqueia combate, não o retorno seguro.
    }
    return decision(wingman, {
      ...request, accepted: true, before,
      meta: { hp: r.hp, shield: r.shield, critical: isWingmanCritical(wingman, lowHpThreshold), retreating: !!control.retreat, interruption },
    })
  }

  function applyRepair(wingman, { amount = 1, source = 'repair', event = 'repair-received' } = {}) {
    const before = snapshotWingmanAuthority(wingman, lowHpThreshold)
    const request = { region: 'integrity', requested: 'repair', event, source }
    if (wingman.control.retreat) return reject(wingman, request, 'integrity-retreating', before)
    const r = wingman.control.resources
    const hpBefore = r.hp
    r.hp = Math.min(r.maxHp, r.hp + Math.max(0, amount))
    return decision(wingman, {
      ...request, accepted: true, before,
      meta: { repaired: r.hp - hpBefore, hp: r.hp, critical: isWingmanCritical(wingman, lowHpThreshold) },
    })
  }

  function authorizeInstantAction(wingman, kind, {
    cooldownKey = null,
    allowDuringAction = true,
    allowDuringEmergency = false,
    source = 'system',
    event = 'instant-action-requested',
    recordDecision = true,
  } = {}) {
    const before = snapshotWingmanAuthority(wingman, lowHpThreshold)
    const request = { region: 'instant-action', requested: kind, event, source }
    const silentResult = (accepted, reason = null) => ({
      pilotId: wingman.profile?.id ?? null,
      pilot: wingman.profile?.name ?? null,
      ...request,
      decision: accepted ? 'accepted' : 'rejected',
      reason,
      before,
      after: snapshotWingmanAuthority(wingman, lowHpThreshold),
    })
    const deny = (reason) => recordDecision ? reject(wingman, request, reason, before) : silentResult(false, reason)
    if (wingman.control.retreat) return deny('integrity-retreating')
    if (isWingmanCritical(wingman, lowHpThreshold)) return deny('integrity-critical')
    if (!allowDuringAction && wingman.control.action) return deny('action-committed')
    if (!allowDuringEmergency && wingman.control.behavior.kind === WINGMAN_BEHAVIORS.REGROUP && wingman.control.behavior.reason === 'emergency-distance') {
      return deny('emergency-return-lock')
    }
    if (cooldownKey && wingman.control.cooldowns[cooldownKey] > 0) return deny('cooldown-active')
    if (!recordDecision) return silentResult(true)
    return decision(wingman, { ...request, accepted: true, before })
  }

  function commitInstantAction(wingman, kind, {
    cooldownKey = null, cooldownSeconds = 0, source = 'system', event = 'instant-action-committed',
  } = {}) {
    const before = snapshotWingmanAuthority(wingman, lowHpThreshold)
    if (cooldownKey) setCooldown(wingman, cooldownKey, cooldownSeconds)
    return decision(wingman, {
      region: 'instant-action', requested: kind, event, source, accepted: true, before,
      meta: { cooldownKey, cooldownSeconds: cooldownKey ? wingman.control.cooldowns[cooldownKey] : 0 },
    })
  }

  return {
    tick,
    requestBehavior,
    onCommandIntentChanged,
    startAction,
    setActionPhase,
    setActionData,
    retargetAction,
    finishAction,
    interruptAction,
    enterEmergencyRegroup,
    arriveFormation,
    applyDamage,
    applyRepair,
    authorizeInstantAction,
    commitInstantAction,
    setCooldown,
    setEngagementCooldown,
    setMaxHp,
    refillIntegrity,
  }
}
