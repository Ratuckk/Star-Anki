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

// Retreat + Focus continua atômico: comando global não ressuscita piloto.
{
  const w = createWingman({ hp: 1 })
  controller.applyDamage(w, { amount: 1 })
  const before = snapshot(w)
  const result = controller.requestBehavior(w, WINGMAN_BEHAVIORS.DOGFIGHT, {
    source: 'squadron-focus', event: 'command-focus', origin: 'focus', targetEnemy: target(),
  })
  assert.equal(result.reason, 'integrity-retreating')
  assert.equal(snapshot(w), before)
}

// REGROUP não é mais Behavior. String legada é rejeitada sem mutação.
{
  assert.equal(WINGMAN_BEHAVIORS.REGROUP, undefined)
  const w = createWingman()
  const before = snapshot(w)
  const result = controller.requestBehavior(w, 'regroup', { source: 'legacy-distance' })
  assert.equal(result.decision, 'rejected')
  assert.equal(result.reason, 'unknown-behavior')
  assert.equal(snapshot(w), before)
}

// Critical + Focus continua bloqueado por integridade derivada do HP.
{
  const w = createWingman({ hp: 1 })
  const before = snapshot(w)
  const result = controller.requestBehavior(w, WINGMAN_BEHAVIORS.DOGFIGHT, { targetEnemy: target() })
  assert.equal(result.reason, 'integrity-critical')
  assert.equal(w.state, 'damaged-passive')
  assert.equal(snapshot(w), before)
}

// Recovery técnico é permitido em critical, mas não cura nem cria estado visual de regroup.
{
  const w = createWingman({ hp: 1 })
  const recovered = controller.recoverNavigation(w)
  assert.equal(recovered.decision, 'accepted')
  assert.equal(w.state, 'damaged-passive')
  assert.equal(w.hp, 1)
  assert.equal(w.control.behavior.kind, WINGMAN_BEHAVIORS.PATROL)
  assert.equal(w.control.behavior.reason, 'invalid-navigation')
}

// Reparo insuficiente/suficiente continua derivando critical exclusivamente do HP.
{
  const w = createWingman({ hp: 1, maxHp: 5 })
  controller.applyRepair(w, { amount: 0 })
  assert.equal(w.state, 'damaged-passive')
  controller.applyRepair(w, { amount: 1 })
  assert.equal(w.state, 'patrol')
  assert.equal(w.abilityActive, false)
}

// Rescue interrompido pelo failsafe técnico recebe cooldown completo.
{
  const w = createWingman({ id: 1, name: 'Peppy' })
  controller.startAction(w, WINGMAN_ACTIONS.RESCUE, { cooldownSeconds: 16 })
  const recovery = controller.recoverNavigation(w)
  assert.equal(recovery.decision, 'accepted')
  assert.equal(w.state, 'patrol')
  assert.equal(w.rescueCooldown, 16)
  assert.equal(recovery.interruption.cooldownPolicy, WINGMAN_COOLDOWN_POLICIES.FULL)
}

// Ram + alvo destruído mantém limpeza/cooldown atômicos.
{
  const w = createWingman({ name: 'Falco' })
  const enemy = target(42)
  controller.requestBehavior(w, WINGMAN_BEHAVIORS.DOGFIGHT, { targetEnemy: enemy })
  controller.startAction(w, WINGMAN_ACTIONS.RAM, { cooldownSeconds: 14, data: { targetEnemy: enemy } })
  enemy.dying = true
  controller.finishAction(w, { event: WINGMAN_INTERRUPT_EVENTS.TARGET_INVALIDATED, outcome: 'target-invalidated' })
  assert.equal(w.state, 'patrol')
  assert.equal(w.targetEnemy, null)
  assert.equal(w.abilityCooldown, 14)
}

// Recovery técnico não cria loophole de reativação no frame seguinte.
{
  const w = createWingman({ name: 'Falco' })
  const enemy = target(5)
  controller.requestBehavior(w, WINGMAN_BEHAVIORS.DOGFIGHT, { targetEnemy: enemy })
  controller.startAction(w, WINGMAN_ACTIONS.RAM, { cooldownSeconds: 14, data: { targetEnemy: enemy } })
  controller.recoverNavigation(w)
  controller.tick(w, 1 / 60)
  assert.ok(w.abilityCooldown > 13.9)
}

// Focus ON/OFF durante Action comprometida não a cancela.
{
  const w = createWingman({ id: 3, name: 'Miyu' })
  controller.startAction(w, WINGMAN_ACTIONS.ASSIST, { cooldownSeconds: 6 })
  const actionBefore = w.control.action
  const focus = controller.requestBehavior(w, WINGMAN_BEHAVIORS.DOGFIGHT, { origin: 'focus', targetEnemy: target() })
  assert.equal(focus.reason, 'action-committed')
  controller.onCommandIntentChanged(w, 'free')
  assert.equal(w.control.action, actionBefore)
}

// Recovery repetido é idempotente e não polui telemetry com no-op por frame.
{
  const w = createWingman()
  const before = decisions.length
  controller.recoverNavigation(w)
  assert.equal(decisions.length, before + 1)
  const repeated = controller.recoverNavigation(w)
  assert.equal(repeated.noop, true)
  assert.equal(decisions.length, before + 1)
  assert.equal(w.state, 'patrol')
}

// Focus OFF só encerra dogfight originado pelo Focus.
{
  const w = createWingman()
  controller.requestBehavior(w, WINGMAN_BEHAVIORS.DOGFIGHT, { targetEnemy: target(), origin: 'focus' })
  controller.onCommandIntentChanged(w, 'free')
  assert.equal(w.state, 'patrol')
  controller.requestBehavior(w, WINGMAN_BEHAVIORS.DOGFIGHT, { targetEnemy: target(2), origin: 'autonomous' })
  controller.onCommandIntentChanged(w, 'free')
  assert.equal(w.state, 'dogfight')
}

// Instant actions dependem de integridade/cooldown, não de distância do jogador.
{
  const w = createWingman({ name: 'Falco' })
  assert.equal(controller.authorizeInstantAction(w, 'intercept', { cooldownKey: 'intercept' }).decision, 'accepted')
  controller.commitInstantAction(w, 'intercept', { cooldownKey: 'intercept', cooldownSeconds: 5 })
  assert.equal(controller.authorizeInstantAction(w, 'intercept', { cooldownKey: 'intercept' }).reason, 'cooldown-active')
  const critical = createWingman({ hp: 1 })
  assert.equal(controller.authorizeInstantAction(critical, 'boombuster', { cooldownKey: 'boombuster' }).reason, 'integrity-critical')
}

// Rescue pausa cooldown principal; depois de recovery técnico ele volta a contar.
{
  const w = createWingman({ id: 1, primaryCooldown: 8 })
  controller.startAction(w, WINGMAN_ACTIONS.RESCUE, { cooldownSeconds: 20 })
  controller.tick(w, 1)
  assert.equal(w.abilityCooldown, 8)
  controller.recoverNavigation(w)
  controller.tick(w, 1)
  assert.equal(w.abilityCooldown, 7)
}

// Modificadores mantêm precedência declarada.
{
  const result = composeWingmanStat({
    base: 0.55,
    upgrades: [{ id: 'doutrina', add: 0.48 }],
    overrides: [
      { id: 'high-combo', priority: 50, value: 0.70 },
      { id: 'low-health', priority: 100, value: 0.85 },
    ],
    min: 0, max: 0.92,
  })
  assert.equal(result.value, 0.85)
  assert.equal(result.override.id, 'low-health')
}

// Campos legados continuam somente-leitura.
{
  const w = createWingman()
  assert.throws(() => { w.state = 'dogfight' }, TypeError)
  assert.throws(() => { w.abilityActive = true }, TypeError)
  assert.throws(() => { w.hp = 0 }, TypeError)
}

// Invariantes e rejeição estruturada.
{
  const w = createWingman()
  assert.deepEqual(validateWingmanInvariants(w), { ok: true, errors: [] })
  controller.requestBehavior(w, WINGMAN_BEHAVIORS.DOGFIGHT, { source: 'test', targetEnemy: null })
  const last = decisions.at(-1)
  assert.equal(last.reason, 'invalid-target')
  assert.ok(last.before && last.after)
}

// Proteção arquitetural: runtime não pode reconstruir writers diretos nos campos autoritativos.
{
  const { readFileSync } = await import('node:fs')
  const wingmenSource = readFileSync(new URL('./combat/wingmen.js', import.meta.url), 'utf8')
  const forbidden = [
    /\b(?:w|wingman|owner|miyu)\.state\s*=(?!=)/g,
    /\b(?:w|wingman|owner|miyu)\.stateTimer\s*=(?!=)/g,
    /\b(?:w|wingman|owner|miyu)\.targetEnemy\s*=(?!=)/g,
    /\b(?:w|wingman|owner|miyu)\.abilityActive\s*=(?!=)/g,
    /\b(?:w|wingman|owner|miyu)\.abilityTimer\s*=(?!=)/g,
    /\b(?:w|wingman|owner|miyu)\.abilityApplied\s*=(?!=)/g,
    /\b(?:w|wingman|owner|miyu)\.escortKind\s*=(?!=)/g,
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

console.log('wingman-state-controller.test.mjs: OK')
