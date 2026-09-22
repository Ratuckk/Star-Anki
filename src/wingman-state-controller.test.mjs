import assert from 'node:assert/strict'
import {
  WINGMAN_ACTIONS,
  WINGMAN_BEHAVIORS,
  WINGMAN_COOLDOWN_POLICIES,
  WINGMAN_INTERRUPT_EVENTS,
  composeWingmanStat,
  createWingmanStateController,
  initializeWingmanControl,
  validateWingmanInvariants,
} from './combat/wingman-state-controller.js'

function target(id = 1) {
  return { id, kind: 'test', dying: false, mesh: {} }
}

function createWingman({ id = 0, name = 'Test', hp = 4, maxHp = 4, shield = 0, primaryCooldown = 0 } = {}) {
  const w = { profile: { id, name } }
  initializeWingmanControl(w, {
    hp, maxHp, shield, maxShield: 3,
    primaryCooldown, engagementCooldown: 0, lowHpThreshold: 1,
  })
  return w
}

function snapshot(w) {
  return JSON.stringify(w.control, (key, value) => key === 'mesh' ? '[mesh]' : value)
}

const decisions = []
const controller = createWingmanStateController({ onDecision: (_w, d) => decisions.push(d) })

// 1. retreating + focus: intenção global não ressuscita nem força dogfight.
{
  const w = createWingman({ hp: 1 })
  controller.applyDamage(w, { amount: 1 })
  assert.equal(w.state, 'retreating')
  const before = snapshot(w)
  const result = controller.requestBehavior(w, WINGMAN_BEHAVIORS.DOGFIGHT, {
    source: 'squadron-focus', event: 'command-focus', origin: 'focus', targetEnemy: target(),
  })
  assert.equal(result.decision, 'rejected')
  assert.equal(result.reason, 'integrity-retreating')
  assert.equal(snapshot(w), before)
}

// 2. retreating + regroup: inválido e atômico.
{
  const w = createWingman({ hp: 1 })
  controller.applyDamage(w, { amount: 1 })
  const before = snapshot(w)
  const result = controller.requestBehavior(w, WINGMAN_BEHAVIORS.REGROUP, { source: 'distance', reason: 'normal-distance' })
  assert.equal(result.decision, 'rejected')
  assert.equal(snapshot(w), before)
}

// 3. critical + focus: critical é derivado de HP e bloqueia dogfight.
{
  const w = createWingman({ hp: 1 })
  const before = snapshot(w)
  const result = controller.requestBehavior(w, WINGMAN_BEHAVIORS.DOGFIGHT, {
    source: 'squadron-focus', origin: 'focus', targetEnemy: target(),
  })
  assert.equal(w.state, 'damaged-passive')
  assert.equal(result.reason, 'integrity-critical')
  assert.equal(snapshot(w), before)
}

// 4. critical + emergency return + chegada: retorno seguro continua permitido; chegada não cura.
{
  const w = createWingman({ hp: 1 })
  const entered = controller.enterEmergencyRegroup(w)
  assert.equal(entered.decision, 'accepted')
  assert.equal(w.state, 'regroup')
  assert.equal(w.emergencyRegroup, true)
  const arrived = controller.arriveFormation(w)
  assert.equal(arrived.decision, 'accepted')
  assert.equal(w.state, 'damaged-passive')
  assert.equal(w.hp, 1)
}

// 5. critical + repair insuficiente.
{
  const w = createWingman({ hp: 1, maxHp: 5 })
  controller.applyRepair(w, { amount: 0 })
  assert.equal(w.hp, 1)
  assert.equal(w.state, 'damaged-passive')
}

// 6. critical + repair suficiente: fica elegível, sem iniciar ação como efeito colateral.
{
  const w = createWingman({ hp: 1, maxHp: 5 })
  controller.applyRepair(w, { amount: 1 })
  assert.equal(w.hp, 2)
  assert.equal(w.state, 'patrol')
  assert.equal(w.abilityActive, false)
}

// 7. rescue + emergency return: interrompe e aplica cooldown completo.
{
  const w = createWingman({ id: 1, name: 'Peppy' })
  const started = controller.startAction(w, WINGMAN_ACTIONS.RESCUE, { cooldownSeconds: 16, source: 'peppy-rescue' })
  assert.equal(started.decision, 'accepted')
  assert.equal(w.state, 'rescue')
  const emergency = controller.enterEmergencyRegroup(w)
  assert.equal(emergency.decision, 'accepted')
  assert.equal(w.state, 'regroup')
  assert.equal(w.rescueCooldown, 16)
  assert.equal(emergency.interruption.cooldownPolicy, WINGMAN_COOLDOWN_POLICIES.FULL)
}

// 8. ram + alvo destruído: target pertence à Action e é limpo atomicamente com cooldown completo.
{
  const w = createWingman({ name: 'Falco' })
  const enemy = target(42)
  controller.requestBehavior(w, WINGMAN_BEHAVIORS.DOGFIGHT, { targetEnemy: enemy, origin: 'autonomous' })
  controller.startAction(w, WINGMAN_ACTIONS.RAM, { cooldownSeconds: 14, data: { targetEnemy: enemy, chainCount: 0 } })
  enemy.dying = true
  const ended = controller.finishAction(w, { event: WINGMAN_INTERRUPT_EVENTS.TARGET_INVALIDATED, outcome: 'target-invalidated', engagementCooldown: 4.5 })
  assert.equal(ended.decision, 'accepted')
  assert.equal(w.state, 'patrol')
  assert.equal(w.targetEnemy, null)
  assert.equal(w.abilityCooldown, 14)
}

// 9. habilidade interrompida não pode reativar no frame seguinte quando o chamador respeita cooldown.
{
  const w = createWingman({ name: 'Falco' })
  const enemy = target(5)
  controller.requestBehavior(w, WINGMAN_BEHAVIORS.DOGFIGHT, { targetEnemy: enemy })
  controller.startAction(w, WINGMAN_ACTIONS.RAM, { cooldownSeconds: 14, data: { targetEnemy: enemy } })
  controller.enterEmergencyRegroup(w)
  assert.equal(w.abilityCooldown, 14)
  controller.arriveFormation(w)
  controller.tick(w, 1 / 60)
  assert.ok(w.abilityCooldown > 13.9)
  // O gate de condição de ativação vê o cooldown não-zero; não há loophole de abilityActive=false.
  assert.notEqual(w.abilityCooldown, 0)
}

// 10. Focus ON/OFF durante ação não cancelável: a Action permanece intacta.
{
  const w = createWingman({ id: 3, name: 'Miyu' })
  controller.startAction(w, WINGMAN_ACTIONS.ASSIST, { cooldownSeconds: 16, source: 'assist' })
  const actionBefore = w.control.action
  const focus = controller.requestBehavior(w, WINGMAN_BEHAVIORS.DOGFIGHT, {
    source: 'squadron-focus', origin: 'focus', targetEnemy: target(),
  })
  assert.equal(focus.reason, 'action-committed')
  controller.onCommandIntentChanged(w, 'free')
  assert.equal(w.control.action, actionBefore)
  assert.equal(w.state, 'escort')
}

// Emergency regroup repetido é idempotente e não polui telemetry/validator com no-ops por frame.
{
  const w = createWingman()
  const beforeDecisions = decisions.length
  controller.enterEmergencyRegroup(w)
  assert.equal(decisions.length, beforeDecisions + 1)
  const repeated = controller.enterEmergencyRegroup(w)
  assert.equal(repeated.noop, true)
  assert.equal(decisions.length, beforeDecisions + 1)
  assert.equal(w.state, 'regroup')
  assert.equal(w.emergencyRegroup, true)
}

// Focus OFF só encerra dogfight originado pelo Focus; autônomo continua.
{
  const w = createWingman()
  controller.requestBehavior(w, WINGMAN_BEHAVIORS.DOGFIGHT, { targetEnemy: target(), origin: 'focus' })
  controller.onCommandIntentChanged(w, 'free')
  assert.equal(w.state, 'patrol')

  controller.requestBehavior(w, WINGMAN_BEHAVIORS.DOGFIGHT, { targetEnemy: target(2), origin: 'autonomous' })
  controller.onCommandIntentChanged(w, 'free')
  assert.equal(w.state, 'dogfight')
}

// Normal regroup não vence Action; emergency return vence.
{
  const w = createWingman({ id: 3, name: 'Miyu' })
  controller.startAction(w, WINGMAN_ACTIONS.ASSIST, { cooldownSeconds: 16 })
  const normal = controller.requestBehavior(w, WINGMAN_BEHAVIORS.REGROUP, { reason: 'normal-distance' })
  assert.equal(normal.reason, 'action-committed')
  assert.equal(w.state, 'escort')
  controller.enterEmergencyRegroup(w)
  assert.equal(w.state, 'regroup')
  assert.equal(w.abilityCooldown, 16)
}

// Instant actions: Integrity e emergency return bloqueiam; coexistência com Action é configurável.
{
  const w = createWingman({ name: 'Falco' })
  let auth = controller.authorizeInstantAction(w, 'intercept', { cooldownKey: 'intercept', allowDuringAction: true })
  assert.equal(auth.decision, 'accepted')
  controller.commitInstantAction(w, 'intercept', { cooldownKey: 'intercept', cooldownSeconds: 5 })
  auth = controller.authorizeInstantAction(w, 'intercept', { cooldownKey: 'intercept' })
  assert.equal(auth.reason, 'cooldown-active')

  const critical = createWingman({ hp: 1 })
  auth = controller.authorizeInstantAction(critical, 'boombuster', { cooldownKey: 'boombuster' })
  assert.equal(auth.reason, 'integrity-critical')
}

// Política explícita de pausa: Rescue pausa cooldown principal; após interrupção ele volta a contar.
{
  const w = createWingman({ id: 1, primaryCooldown: 8 })
  controller.startAction(w, WINGMAN_ACTIONS.RESCUE, { cooldownSeconds: 20 })
  controller.tick(w, 1)
  assert.equal(w.abilityCooldown, 8)
  controller.enterEmergencyRegroup(w)
  controller.tick(w, 1)
  assert.equal(w.abilityCooldown, 7)
}

// Composição de modificadores: upgrade antes de override explícito; maior prioridade vence; clamp por último.
{
  const result = composeWingmanStat({
    base: 0.55,
    upgrades: [{ id: 'doutrina', add: 0.48 }],
    overrides: [
      { id: 'high-combo', priority: 50, value: 0.70 },
      { id: 'low-health', priority: 100, value: 0.85 },
    ],
    min: 0,
    max: 0.92,
  })
  assert.equal(result.value, 0.85)
  assert.equal(result.override.id, 'low-health')

  const clamped = composeWingmanStat({ base: 0.9, upgrades: [{ add: 0.4 }], min: 0, max: 0.92 })
  assert.equal(clamped.value, 0.92)
}

// Read-only: direct writes nos campos legados explodem em ES modules (strict mode).
{
  const w = createWingman()
  assert.throws(() => { w.state = 'dogfight' }, TypeError)
  assert.throws(() => { w.abilityActive = true }, TypeError)
  assert.throws(() => { w.hp = 0 }, TypeError)
}

// Invariantes e telemetria de decisão.
{
  const w = createWingman()
  assert.deepEqual(validateWingmanInvariants(w), { ok: true, errors: [] })
  controller.requestBehavior(w, WINGMAN_BEHAVIORS.DOGFIGHT, { source: 'test', event: 'focus', targetEnemy: null })
  const last = decisions.at(-1)
  assert.equal(last.decision, 'rejected')
  assert.equal(last.reason, 'invalid-target')
  assert.ok(last.before)
  assert.ok(last.after)
}


// Proteção arquitetural: o runtime do esquadrão não pode reconstruir writers diretos nos
// antigos campos autoritativos; todas as mutações devem passar pelo state controller.
{
  const { existsSync, readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const { dirname, join } = await import('node:path')
  const here = dirname(fileURLToPath(import.meta.url))
  const wingmenPath = join(here, 'combat', 'wingmen.js')
  if (existsSync(wingmenPath)) {
    const wingmenSource = readFileSync(wingmenPath, 'utf8')
    const forbidden = [
    /\b(?:w|wingman|owner|miyu)\.state\s*=(?!=)/g,
    /\b(?:w|wingman|owner|miyu)\.stateTimer\s*=(?!=)/g,
    /\b(?:w|wingman|owner|miyu)\.targetEnemy\s*=(?!=)/g,
    /\b(?:w|wingman|owner|miyu)\.abilityActive\s*=(?!=)/g,
    /\b(?:w|wingman|owner|miyu)\.abilityTimer\s*=(?!=)/g,
    /\b(?:w|wingman|owner|miyu)\.abilityApplied\s*=(?!=)/g,
    /\b(?:w|wingman|owner|miyu)\.escortKind\s*=(?!=)/g,
    /\b(?:w|wingman|owner|miyu)\.emergencyRegroup\s*=(?!=)/g,
    /\b(?:w|wingman|owner|miyu)\.chainCount\s*=(?!=)/g,
    /\b(?:w|wingman|owner|miyu)\.(?:abilityCooldown|interceptCooldown|rescueCooldown|boombusterCooldown|engagementCooldown)\s*=(?!=)/g,
    /\b(?:w|wingman|owner|miyu)\.(?:hp|maxHp|shield|shieldMax|shieldRegenDelay)\s*=(?!=)/g,
    /\.control\.(?:resources|behavior|action|retreat|cooldowns|engagementCooldown)(?:\.[A-Za-z_$][\w$]*)*\s*=(?!=)/g,
  ]
    for (const pattern of forbidden) {
      const match = pattern.exec(wingmenSource)
      assert.equal(match, null, `writer direto proibido em wingmen.js: ${match?.[0] || pattern}`)
    }
  }
}

console.log('wingman-state-controller.test.mjs: OK')
