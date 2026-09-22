from pathlib import Path


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).write_text(text, encoding='utf-8')


def replace(path, old, new, count=1):
    text = read(path)
    if old not in text:
        raise RuntimeError(f'padrao nao encontrado em {path}: {old[:140]!r}')
    write(path, text.replace(old, new, count))


def replace_between(path, start_marker, end_marker, replacement):
    text = read(path)
    start = text.find(start_marker)
    if start < 0:
        raise RuntimeError(f'inicio nao encontrado em {path}: {start_marker!r}')
    end = text.find(end_marker, start)
    if end < 0:
        raise RuntimeError(f'fim nao encontrado em {path}: {end_marker!r}')
    write(path, text[:start] + replacement + text[end:])


# ---------------------------------------------------------------------------
# State controller: REGROUP deixa de ser Behavior. Recovery vira failsafe tecnico.
# ---------------------------------------------------------------------------
replace(
    'src/combat/wingman-state-controller.js',
    "export const WINGMAN_BEHAVIORS = Object.freeze({\n  PATROL: 'patrol',\n  DOGFIGHT: 'dogfight',\n  REGROUP: 'regroup',\n})",
    "export const WINGMAN_BEHAVIORS = Object.freeze({\n  PATROL: 'patrol',\n  DOGFIGHT: 'dogfight',\n})",
)
replace(
    'src/combat/wingman-state-controller.js',
    "  EMERGENCY_RETURN: 'emergency-return',",
    "  NAVIGATION_RECOVERY: 'navigation-recovery',",
)
replace(
    'src/combat/wingman-state-controller.js',
    'WINGMAN_INTERRUPT_EVENTS.EMERGENCY_RETURN',
    'WINGMAN_INTERRUPT_EVENTS.NAVIGATION_RECOVERY',
    count=20,
)
replace(
    'src/combat/wingman-state-controller.js',
    "allowedBehaviors: [WINGMAN_BEHAVIORS.PATROL, WINGMAN_BEHAVIORS.DOGFIGHT, WINGMAN_BEHAVIORS.REGROUP]",
    "allowedBehaviors: [WINGMAN_BEHAVIORS.PATROL, WINGMAN_BEHAVIORS.DOGFIGHT]",
    count=2,
)
replace(
    'src/combat/wingman-state-controller.js',
    "  if (control.behavior.kind === WINGMAN_BEHAVIORS.REGROUP) return 'regroup'\n",
    '',
)
replace(
    'src/combat/wingman-state-controller.js',
    "  if (control.behavior.kind === WINGMAN_BEHAVIORS.REGROUP && control.behavior.reason === 'emergency-distance' && control.action) {\n    errors.push('emergency-regroup-with-action')\n  }\n",
    '',
)
replace(
    'src/combat/wingman-state-controller.js',
    "  getter('emergencyRegroup', () => wingman.control.behavior.kind === WINGMAN_BEHAVIORS.REGROUP && wingman.control.behavior.reason === 'emergency-distance')\n",
    '',
)
replace(
    'src/combat/wingman-state-controller.js',
    "    if (control.behavior.kind === WINGMAN_BEHAVIORS.REGROUP && control.behavior.reason === 'emergency-distance' && kind !== WINGMAN_BEHAVIORS.REGROUP) {\n      return reject(wingman, request, 'emergency-return-lock', before)\n    }\n",
    '',
)
replace(
    'src/combat/wingman-state-controller.js',
    "    if (kind === WINGMAN_BEHAVIORS.REGROUP && reason !== 'emergency-distance' && control.action) {\n      return reject(wingman, request, 'action-committed', before)\n    }\n",
    '',
)
replace(
    'src/combat/wingman-state-controller.js',
    "    if (control.behavior.kind === WINGMAN_BEHAVIORS.REGROUP && control.behavior.reason === 'emergency-distance') {\n      return reject(wingman, request, 'emergency-return-lock', before)\n    }\n",
    '',
)

replace_between(
    'src/combat/wingman-state-controller.js',
    "  function enterEmergencyRegroup(wingman,",
    "  function applyDamage(wingman,",
    """  function recoverNavigation(wingman, { source = 'navigation-safety', event = WINGMAN_INTERRUPT_EVENTS.NAVIGATION_RECOVERY } = {}) {
    const before = snapshotWingmanAuthority(wingman, lowHpThreshold)
    const request = { region: 'navigation', requested: 'recovery', event, source }
    if (wingman.control.retreat) return reject(wingman, request, 'integrity-retreating', before)
    if (!wingman.control.action && wingman.control.behavior.kind === WINGMAN_BEHAVIORS.PATROL && wingman.control.behavior.reason === 'invalid-navigation') {
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
      const policy = getWingmanInterruptionPolicy(action.kind, WINGMAN_INTERRUPT_EVENTS.NAVIGATION_RECOVERY, action.phase)
      if (!policy) return reject(wingman, request, 'action-not-interruptible-by-recovery', before)
      const cooldown = applyActionCooldown(wingman, action, policy)
      interruption = { action: action.kind, phase: action.phase, cooldownPolicy: policy, cooldown }
      wingman.control.action = null
    }
    wingman.control.behavior = freshBehavior(WINGMAN_BEHAVIORS.PATROL, {
      origin: `recovery:${source}`,
      reason: 'invalid-navigation',
    })
    return decision(wingman, { ...request, accepted: true, before, meta: { interruption } })
  }

""",
)
replace(
    'src/combat/wingman-state-controller.js',
    "      // regroup (inclusive emergência) é preservado: integridade bloqueia combate, não o retorno seguro.\n",
    "      // Patrol é preservado: integridade bloqueia combate, mas não inventa uma retirada por distância.\n",
)
replace(
    'src/combat/wingman-state-controller.js',
    "    allowDuringEmergency = false,\n",
    '',
)
replace(
    'src/combat/wingman-state-controller.js',
    "    if (!allowDuringEmergency && wingman.control.behavior.kind === WINGMAN_BEHAVIORS.REGROUP && wingman.control.behavior.reason === 'emergency-distance') {\n      return deny('emergency-return-lock')\n    }\n",
    '',
)
replace(
    'src/combat/wingman-state-controller.js',
    "    enterEmergencyRegroup,\n    arriveFormation,\n",
    "    recoverNavigation,\n",
)

# ---------------------------------------------------------------------------
# Runtime: distância do jogador deixa de ser gatilho. Rail usa atraso longitudinal suave.
# ---------------------------------------------------------------------------
replace(
    'src/combat/wingmen.js',
    "} from './wingman-formation-separation.js'\n",
    "} from './wingman-formation-separation.js'\nimport {\n  WINGMAN_NAVIGATION_INTENTS,\n  computeRailCatchupBoost,\n  computeRailLongitudinalLag,\n  isFiniteWingmanPosition,\n  navigationIntentForWingman,\n} from './wingman-navigation.js'\n",
)
replace_between(
    'src/combat/wingmen.js',
    '// ============ REAGRUPAMENTO E LINHAS DE ATAQUE ============',
    'const WINGMAN_ATTACK_LANE_SPACING = 9',
    """// ============ LIBERDADE TÁTICA E LINHAS DE ATAQUE ============
// Formação é uma âncora de navegação quando o piloto está livre, não uma coleira. Distância
// euclidiana do jogador nunca muda Behavior/Action. No All-Range não há catch-up automático;
// no Rail, apenas atraso longitudinal adiciona uma correção suave de velocidade.
""",
)
replace(
    'src/combat/wingmen.js',
    "      separationCorrection: new THREE.Vector3(),\n      auxShieldVisual,",
    "      separationCorrection: new THREE.Vector3(),\n      navigationIntent: WINGMAN_NAVIGATION_INTENTS.FORMATION,\n      railCatchupActive: false,\n      auxShieldVisual,",
)
replace(
    'src/combat/wingmen.js',
    "            stateA: a.state, stateB: b.state, emergencyA: a.emergencyRegroup, emergencyB: b.emergencyRegroup,\n",
    "            stateA: a.state, stateB: b.state, navigationA: a.navigationIntent, navigationB: b.navigationIntent,\n",
)
replace(
    'src/combat/wingmen.js',
    "                stateA: a.state, stateB: b.state, emergencyA: a.emergencyRegroup, emergencyB: b.emergencyRegroup,\n",
    "                stateA: a.state, stateB: b.state, navigationA: a.navigationIntent, navigationB: b.navigationIntent,\n",
)
replace(
    'src/combat/wingmen.js',
    "      const w = activeWingmen[idx]\n      w.fireCooldown -= dt\n",
    "      const w = activeWingmen[idx]\n      let navigationRecoveryThisFrame = false\n      w.fireCooldown -= dt\n",
)
replace(
    'src/combat/wingmen.js',
    "      const distToPlayer = w.mesh.position.distanceTo(playerPos)\n",
    '',
)

replace_between(
    'src/combat/wingmen.js',
    '      // 1. Regroup se ficou longe demais do jogador.',
    "      } else if (w.state === 'damaged-passive') {",
    """      // Recovery técnico: distância NUNCA entra aqui. Só dados de navegação inválidos
      // (NaN/Infinity) podem resetar uma nave, e nesse caso ela já não tem posição renderizável.
      const invalidPosition = !isFiniteWingmanPosition(w.mesh.position)
      const invalidVelocity = !isFiniteWingmanPosition(w.velocity)
      if (invalidPosition || invalidVelocity) {
        const stateBeforeRecovery = w.state
        const transition = stateController.recoverNavigation(w, {
          source: 'invalid-kinematics', event: WINGMAN_INTERRUPT_EVENTS.NAVIGATION_RECOVERY,
        })
        if (transition.decision === 'accepted') {
          navigationRecoveryThisFrame = true
          w.mesh.position.copy(_wmSlotPos)
          w.patrolTarget.copy(_wmSlotPos)
          w.velocity.copy(frame.forward).multiplyScalar(w.profile.flightProfile.cruiseSpeed)
          w.obstacleAvoidanceId = null
          w.obstacleAvoidanceSide = 0
          aiValidator.expect(
            'Recovery técnico restaura posição e velocidade finitas sem depender de distância ao jogador',
            () => isFiniteWingmanPosition(w.mesh.position) && isFiniteWingmanPosition(w.velocity),
            { pilotId: w.profile.id, invalidPosition, invalidVelocity, stateBeforeRecovery },
          )
          aiValidator.logMechanic('wingman-navigation-recovery', 'invalid-kinematics-reset', {
            pilotId: w.profile.id, invalidPosition, invalidVelocity, stateBeforeRecovery,
            interruptedAction: transition.interruption?.action || null,
          })
        }
      }

      if (w.state === 'damaged-passive') {""",
)

replace(
    'src/combat/wingmen.js',
    "      // ============ FÍSICA DE VOO DISCIPLINADA E SUAVE ============\n",
    "      // Navigation Intent é derivada do estado de gameplay, mas não o controla. Um piloto\n      // pode estar longe no All-Range sem qualquer transição ou cancelamento.\n      w.navigationIntent = navigationRecoveryThisFrame\n        ? WINGMAN_NAVIGATION_INTENTS.RECOVERY\n        : navigationIntentForWingman({ state: w.state, escortKind: w.escortKind })\n\n      // ============ FÍSICA DE VOO DISCIPLINADA E SUAVE ============\n",
)
replace(
    'src/combat/wingmen.js',
    "      let cruiseSpeed = w.profile.flightProfile.cruiseSpeed\n      if (w.state === 'regroup') {\n        // Recuperação proporcional à distância restante, com teto: retorna rápido o suficiente\n        // para não ficar perdido fora da tela, sem teleporte ou mudança brusca de direção.\n        cruiseSpeed += Math.min(WINGMAN_REGROUP_SPEED_CAP, targetDist * 1.25)\n      }\n",
    "      let cruiseSpeed = w.profile.flightProfile.cruiseSpeed\n",
)
replace(
    'src/combat/wingmen.js',
    "      _wmDesiredVelocity.copy(_wmAimDir).multiplyScalar(cruiseSpeed)\n\n      // O desvio é aditivo",
    """      _wmDesiredVelocity.copy(_wmAimDir).multiplyScalar(cruiseSpeed)

      // Catch-up existe SOMENTE no Rail e mede atraso longitudinal no frame do trilho. Ficar
      // longe lateral/verticalmente não conta; Behavior/Action não são tocados. No All-Range,
      // nem este vetor existe: liberdade espacial total dentro das regras normais de combate.
      if (!inArena) {
        const longitudinalLag = computeRailLongitudinalLag(w.mesh.position, playerPos, frame)
        const catchupBoost = computeRailCatchupBoost(longitudinalLag)
        if (catchupBoost > 0) _wmDesiredVelocity.addScaledVector(frame.forward, catchupBoost)
        const catchupNow = catchupBoost > 0.01
        if (catchupNow !== w.railCatchupActive) {
          w.railCatchupActive = catchupNow
          aiValidator.logMechanic('wingman-rail-catchup', catchupNow ? 'catchup-started' : 'catchup-ended', {
            pilotId: w.profile.id, longitudinalLag, catchupBoost, state: w.state, navigationIntent: w.navigationIntent,
          })
        }
      } else if (w.railCatchupActive) {
        w.railCatchupActive = false
        aiValidator.logMechanic('wingman-rail-catchup', 'catchup-ended-all-range', { pilotId: w.profile.id })
      }

      // O desvio é aditivo""",
)

# ---------------------------------------------------------------------------
# Radio: remove narrativa de "voltar porque ficou longe". Recovery tecnico fica silencioso.
# ---------------------------------------------------------------------------
replace_between(
    'src/combat/wingman-radio-callresponse.js',
    "  state_emergency_return: {",
    "  state_recovered: {",
    "  state_recovered: {",
)
replace(
    'src/combat/wingman-radio-callresponse.js',
    "    1: ['Break clean and reform.', 'Abort confirmed. Regroup safely.'],",
    "    1: ['Break clean and reset.', 'Abort confirmed. Reset safely.'],",
)
replace(
    'src/combat/wingman-radio-callresponse.js',
    "  const beforeBehavior = before.behavior || {}\n  const afterBehavior = after.behavior || {}\n\n",
    '',
)
replace_between(
    'src/combat/wingman-radio-callresponse.js',
    "  const wasEmergency = beforeBehavior.kind === 'regroup'",
    "  if (beforeIntegrity.critical && !afterIntegrity.critical) {",
    "  if (beforeIntegrity.critical && !afterIntegrity.critical) {",
)
replace(
    'src/combat/wingman-radio-callresponse.js',
    "  if (!afterIntegrity.retreating && transition.interruption && before.action && !after.action) {\n",
    "  // Recovery de kinematics é um failsafe técnico e deve ser invisível ao jogador.\n  if (transition.event === 'navigation-recovery') return null\n\n  if (!afterIntegrity.retreating && transition.interruption && before.action && !after.action) {\n",
)
for line in [
    "    state_emergency_return: ['Too far out — circling back.', 'Breaking off. Rejoining formation.'],\n",
    "    state_emergency_return: [\"I'm outside the line — regrouping.\", 'Returning to formation.'],\n",
    "    state_emergency_return: [\"I'm too far out! Coming back!\", 'Rejoining you now!'],\n",
    "    state_emergency_return: ['Formation distance exceeded. Correcting.', 'Returning to formation vector.'],\n",
]:
    replace('src/combat/wingman-radio.js', line, '')

# ---------------------------------------------------------------------------
# Tests: novo contrato sem regroup por distância.
# ---------------------------------------------------------------------------
STATE_TEST = r'''import assert from 'node:assert/strict'
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
'''
write('src/wingman-state-controller.test.mjs', STATE_TEST)

RADIO_TEST = read('src/wingman-radio-callresponse.test.mjs')
old_emergency = """assert.deepEqual(classifyWingmanTransitionForRadio({
  decision: 'accepted',
  before: { integrity: { critical: false, retreating: false }, behavior: { kind: 'dogfight', reason: null }, action: { kind: 'ram' } },
  after: { integrity: { critical: false, retreating: false }, behavior: { kind: 'regroup', reason: 'emergency-distance' }, action: null },
  interruption: { cooldownPolicy: 'FULL' },
}), { eventId: 'state_emergency_return', urgent: true })

"""
if old_emergency not in RADIO_TEST:
    raise RuntimeError('bloco emergency do radio test nao encontrado')
RADIO_TEST = RADIO_TEST.replace(old_emergency, '')
old_tail = """assert.equal(classifyWingmanTransitionForRadio({ decision: 'rejected' }), null)
assert.equal(classifyWingmanTransitionForRadio({
  decision: 'accepted',
  before: { integrity: { critical: false, retreating: false }, behavior: { kind: 'regroup', reason: 'emergency-distance' }, action: null },
  after: { integrity: { critical: false, retreating: false }, behavior: { kind: 'regroup', reason: 'emergency-distance' }, action: null },
}), null)
"""
new_tail = """assert.equal(classifyWingmanTransitionForRadio({ decision: 'rejected' }), null)
// Failsafe técnico de navegação é deliberadamente silencioso, mesmo se interromper Action.
assert.equal(classifyWingmanTransitionForRadio({
  decision: 'accepted', event: 'navigation-recovery',
  before: { integrity: { critical: false, retreating: false }, behavior: { kind: 'dogfight', reason: null }, action: { kind: 'ram' } },
  after: { integrity: { critical: false, retreating: false }, behavior: { kind: 'patrol', reason: 'invalid-navigation' }, action: null },
  interruption: { cooldownPolicy: 'full' },
}), null)
"""
if old_tail not in RADIO_TEST:
    raise RuntimeError('tail antigo do radio test nao encontrado')
write('src/wingman-radio-callresponse.test.mjs', RADIO_TEST.replace(old_tail, new_tail))

replace(
    'src/wingman-formation-separation.test.mjs',
    "// 6. Proteção estrutural: a integração deve calcular cada par uma vez (j = i + 1), somar\n//    impulsos opostos e não limpar overlapWith em todo tick de emergency regroup.\n",
    "// 6. Proteção estrutural: a integração calcula cada par uma vez e mantém a separação como\n//    proteção local, não como remendo de um estado global de regroup.\n",
)
replace(
    'src/wingman-formation-separation.test.mjs',
    "assert.ok(!/if \\(transition\\.decision === 'accepted'\\)[\\s\\S]{0,220}w\\.overlapWith\\.clear\\(\\)/.test(wingmenSource), 'emergency regroup não pode apagar memória de overlap a cada frame')\n",
    "assert.ok(!wingmenSource.includes('emergencyRegroup'), 'separação não pode depender de emergency regroup')\n",
)
replace(
    'src/playtest-polish.test.mjs',
    "assert.match(wingmenSource, /w\\.patrolTarget\\.copy\\(_wmSlotPos\\)[\\s\\S]{0,180}if \\(!wasEmergency\\) \\{[\\s\\S]{0,260}w\\.velocity\\.copy/, 'kick de emergency regroup deve ocorrer apenas na entrada')\n",
    "assert.ok(!wingmenSource.includes('enterEmergencyRegroup') && !wingmenSource.includes('WINGMAN_MAX_DISTANCE_ARENA'), 'distância não pode mais acionar regroup/reset')\nassert.ok(wingmenSource.includes('computeRailLongitudinalLag') && wingmenSource.includes('computeRailCatchupBoost'), 'Rail deve usar catch-up longitudinal suave')\n",
)
replace(
    'src/selftest.mjs',
    "import './wingman-formation-separation.test.mjs'\n",
    "import './wingman-formation-separation.test.mjs'\nimport './wingman-navigation.test.mjs'\n",
)
replace('src/version.js', "export const GAME_VERSION = 'v0.99.26'", "export const GAME_VERSION = 'v0.99.27'")

progress = read('progresso/PROGRESSO_POS_.90.md')
marker = '## Histórico de Entregas pós-v0.90.0\n\n'
if marker not in progress:
    raise RuntimeError('marcador de progresso nao encontrado')
entry = """### v0.99.27 — Tactical Freedom: formação sem coleira e recovery técnico

- **Regroup por distância removido:** `regroup` deixa de existir como Behavior autoritativo. Distância euclidiana do jogador não muda estado, não cancela Action e não força retorno à formação.
- **All-Range livre:** no modo arena não há qualquer catch-up ou recovery por distância. Wingmen podem operar longe do jogador enquanto seu Behavior/Action continuar válido.
- **Rail por progresso:** o trilho usa somente atraso longitudinal no `frame.forward`; após 32u de atraso entra um boost suave de catch-up, saturando em +72u/s aos 120u. Distância lateral/vertical é ignorada e nenhuma transição de gameplay ocorre.
- **Navigation Intent:** formação, attack-lane, support-player e recovery passam a descrever o destino de navegação sem disputar autoridade com Behavior/Action.
- **Recovery raro e técnico:** somente posição/velocidade não finitas (NaN/Infinity) podem acionar reset para uma vaga válida. O failsafe é silencioso no rádio e mantém a política de cooldown caso precise interromper uma Action.
- **Deconflição local preservada:** separação simétrica e correção física continuam como proteção contra contato ocasional, mas não precisam mais desfazer convergência criada por emergency regroup.
- **Rádio:** removidas falas de “você está longe, volte”; a distância deixou de ser evento narrativo.

**Validado:** suíte de navegação, state controller, Call & Response, separação, polimento, selftest completo, sintaxe e git diff --check.

"""
write('progresso/PROGRESSO_POS_.90.md', progress.replace(marker, marker + entry, 1))

# Guardas finais do migrador antes de entregar ao CI.
controller = read('src/combat/wingman-state-controller.js')
wingmen = read('src/combat/wingmen.js')
for forbidden in ["REGROUP: 'regroup'", 'enterEmergencyRegroup', 'arriveFormation', 'emergency-distance']:
    if forbidden in controller:
        raise RuntimeError(f'controller ainda contem legado de regroup: {forbidden}')
for forbidden in ['WINGMAN_MAX_DISTANCE_RAIL', 'WINGMAN_MAX_DISTANCE_ARENA', 'WINGMAN_EMERGENCY_REGROUP_SPEED', 'regroup-distance-exceeded', "w.state === 'regroup'"]:
    if forbidden in wingmen:
        raise RuntimeError(f'wingmen runtime ainda contem regroup por distancia: {forbidden}')
print('migration v0.99.27 applied')
