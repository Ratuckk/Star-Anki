import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { createWingmanRadio, ABILITY_EVENT_IDS, SQUAD_TRIVIAL_GAP_MS } from './combat/wingman-radio.js'
import { createRadioDispatcher } from './combat/wingman-radio-dispatcher.js'
import { createSquadronSystem, WINGMAN_PROFILES } from './combat/wingmen.js'

console.log('--- TEST SUITE: Dispatcher único de rádio dos wingmen ---')

const PROFILES = [0, 1, 2, 3].map((id) => ({ id, name: `P${id}`, accentColor: 0xffffff }))
const buildPayload = (profile, text, eventId, meta = {}) => ({ pilotId: profile.id, name: profile.name, text, eventId, ...meta })

function makeDispatcher({ random = () => 0.5 } = {}) {
  let clock = 0
  const radio = createWingmanRadio({ random, enforceSquadSilence: true, squadSilenceGapMs: SQUAD_TRIVIAL_GAP_MS })
  const dispatcher = createRadioDispatcher({ radio, buildPayload, getActivePilotIds: () => [0, 1, 2, 3], now: () => clock })
  return { radio, dispatcher, setNow: (t) => { clock = t } }
}

// ============================================================================
// 1. Habilidade nunca usa rádio (dispatcher + scheduler)
// ============================================================================
{
  console.log('Testing 1: nenhum ABILITY_EVENT_IDS entra no rádio...')
  const { dispatcher, setNow } = makeDispatcher()
  const warn = console.warn
  console.warn = () => {}
  try {
    let t = 0
    for (const eventId of ABILITY_EVENT_IDS) {
      for (const force of [false, true]) {
        setNow((t += 20000))
        assert.strictEqual(dispatcher.request(PROFILES[1], eventId, { force }), null, `${eventId} (force=${force}) deve ser recusado`)
        assert.strictEqual(dispatcher.hasPending(), false)
      }
    }
  } finally {
    console.warn = warn
  }
}

// ============================================================================
// 2. Gate global de 6 s é absoluto (inclusive urgentes)
// ============================================================================
{
  console.log('Testing 2: duas transmissões nunca a menos de 6 s (incluindo urgentes)...')
  const { dispatcher, setNow } = makeDispatcher()
  setNow(1000)
  const first = dispatcher.request(PROFILES[0], 'engage_dogfight')
  assert.ok(first && first.text, 'primeira fala aceita')
  dispatcher.take()
  setNow(1500)
  assert.strictEqual(dispatcher.request(PROFILES[1], 'kill'), null, 'trivial dentro dos 6 s é recusado')
  assert.strictEqual(dispatcher.request(PROFILES[2], 'retreat', { force: true }), null, 'retreat NÃO fura o gate global')
  assert.strictEqual(dispatcher.request(PROFILES[2], 'state_critical', { force: true }), null, 'state_critical NÃO fura o gate global')
  setNow(1000 + SQUAD_TRIVIAL_GAP_MS)
  assert.ok(dispatcher.request(PROFILES[2], 'retreat', { force: true }), 'urgente passa quando o gate libera')

  // estresse determinístico: eventos triviais e urgentes a cada 100 ms por 3 minutos
  const stress = makeDispatcher({ random: (() => { let x = 7; return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) })() })
  const events = ['engage_dogfight', 'kill', 'boost_used', 'return_formation', 'charged_shot_used', 'player_take_damage', 'player_low_health', 'state_recovered', 'action_interrupted']
  const times = []
  for (let t = 0; t <= 180000; t += 100) {
    stress.setNow(t)
    for (const p of PROFILES) {
      const ev = events[(p.id + Math.floor(t / 100)) % events.length]
      if (stress.dispatcher.request(p, ev)) times.push(t)
    }
    if (t % 700 === 0) if (stress.dispatcher.request(PROFILES[t / 700 % 4], 'retreat', { force: true })) times.push(t)
    if (t % 1300 === 0) if (stress.dispatcher.request(PROFILES[t / 1300 % 4], 'state_critical', { force: true })) times.push(t)
    const reply = stress.dispatcher.takeReply([0, 1, 2, 3], (r) => ({ ...r, isCallResponse: true }))
    if (reply) times.push(t)
    stress.dispatcher.take()
  }
  assert.ok(times.length >= 10, `houve transmissões suficientes para medir (${times.length})`)
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i] - times[i - 1] >= SQUAD_TRIVIAL_GAP_MS, `transmissões em ${times[i - 1]} e ${times[i]} ms ficaram a < 6 s`)
  }
}

// ============================================================================
// 3. Urgente recusada pelo gate NÃO destrói mensagem pendente; aceita, substitui
// ============================================================================
{
  console.log('Testing 3: urgente bloqueada preserva a pendente; aceita substitui...')
  const { dispatcher, setNow } = makeDispatcher()
  setNow(0)
  const trivial = dispatcher.request(PROFILES[0], 'engage_dogfight')
  assert.ok(trivial)
  setNow(1000)
  assert.strictEqual(dispatcher.request(PROFILES[1], 'state_critical', { force: true }), null, 'urgente bloqueada pelo gate')
  assert.ok(dispatcher.hasPending(), 'pendente preservada')
  assert.deepEqual(dispatcher.take(), trivial, 'a pendente original é entregue')

  const other = makeDispatcher()
  other.setNow(0)
  assert.ok(other.dispatcher.request(PROFILES[0], 'engage_dogfight'))
  other.setNow(SQUAD_TRIVIAL_GAP_MS + 1)
  const urgent = other.dispatcher.request(PROFILES[1], 'state_critical', { force: true })
  assert.ok(urgent, 'urgente aceita depois do gate')
  assert.deepEqual(other.dispatcher.take(), urgent, 'só a urgente aceita substitui a pendente')
  assert.strictEqual(other.dispatcher.take(), null, 'no máximo uma mensagem por vez')

  // aliado abatido: descarta só a pendente DELE
  const c = makeDispatcher()
  c.setNow(0)
  c.dispatcher.request(PROFILES[2], 'engage_dogfight')
  c.dispatcher.cancelForPilot(0)
  assert.ok(c.dispatcher.hasPending(), 'cancelar outro piloto não mexe na pendente')
  c.dispatcher.cancelForPilot(2)
  assert.strictEqual(c.dispatcher.hasPending(), false)
}

// ============================================================================
// 4. Call & Response tem janela alcançável depois do gate (e nunca antes dele)
// ============================================================================
{
  console.log('Testing 4: Call & Response alcançável após o gate...')
  let delivered = 0
  const trials = 100
  for (let k = 0; k < trials; k++) {
    let calls = 0
    const r = (k + 0.5) / trials
    // o 4º sorteio de openFromEvent é o atraso da resposta; os demais usam 0
    const m = makeDispatcher({ random: () => { calls += 1; return calls === 4 ? r : 0 } })
    m.setNow(50000)
    const opener = m.dispatcher.request(PROFILES[0], 'retreat', { force: true })
    assert.ok(opener, 'retreat abre a conversa')
    m.dispatcher.take()
    let got = null
    for (let t = 50000; t <= 62000 && !got; t += 50) {
      m.setNow(t)
      got = m.dispatcher.takeReply([1, 2, 3], (rep) => ({ ...rep, isCallResponse: true }))
      if (got) assert.ok(t - 50000 >= SQUAD_TRIVIAL_GAP_MS, `resposta em ${t - 50000} ms: nunca antes do gate`)
    }
    if (got) delivered += 1
  }
  assert.equal(delivered, trials, `todas as respostas alcançam a entrega quando o canal está livre (${delivered}/${trials}; antes ≈34%)`)

  // se outro evento válido ocupar o canal, a resposta pode expirar (sem garantia)
  const busy = makeDispatcher({ random: () => 0 })
  busy.setNow(0)
  busy.dispatcher.request(PROFILES[0], 'retreat', { force: true })
  busy.dispatcher.take()
  busy.setNow(SQUAD_TRIVIAL_GAP_MS - 1000) // ainda antes do gate: nada
  assert.strictEqual(busy.dispatcher.takeReply([1, 2, 3], (r) => r), null)
}

// ============================================================================
// 5. Esquadrão REAL (createSquadronSystem): FOCO = zero rádio, zero cooldown consumido
// ============================================================================
function createMockRail() {
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -100), new THREE.Vector3(0, 0, -500)])
  return {
    curve,
    getPointAt: (t) => curve.getPointAt(t),
    getTangentAt: (t) => curve.getTangentAt(t),
    getFrameAt: () => ({ forward: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) }),
    getPlayerPosition: () => new THREE.Vector3(0, 0, 0),
    isFullSpinActive: () => false,
    isArena: () => false,
  }
}
const frame = { position: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) }
function makeSquad() {
  const squad = createSquadronSystem(new THREE.Group(), createMockRail(), {}, {})
  for (const id of [0, 1, 2, 3]) squad.spawnMember(id)
  return squad
}

{
  console.log('Testing 5: FOCO com 4 wingmen gera zero rádio e não queima cooldowns...')
  assert.equal(WINGMAN_PROFILES.length >= 4, true)
  for (const variant of [
    { name: 'sem upgrades', slippy: 0 },
    { name: 'Slippy com morale (antigo ability_focus_upgrade)', slippy: 2 },
  ]) {
    const squad = makeSquad()
    squad.update(0.016, frame.position, frame, {})
    const res = squad.toggleCommand([], frame.position, variant.slippy)
    assert.equal(res.mode, 'focus', `${variant.name}: FOCO ativa`)
    const seen = []
    for (let i = 0; i < 20; i++) {
      const ev = squad.update(0.016, frame.position, frame, {})
      if (ev.radioMessage) seen.push(ev.radioMessage)
      assert.equal('radioQueue' in ev, false, 'radioQueue deixou de existir')
    }
    assert.equal(seen.length, 0, `${variant.name}: FOCO não gera nenhuma transmissão (${JSON.stringify(seen.map((m) => m.eventId))})`)

    // cooldowns intactos: logo depois do FOCO um evento trivial normal ainda fala
    squad.triggerPlayerTookDamage()
    const after = squad.update(0.016, frame.position, frame, {})
    assert.ok(after.radioMessage, `${variant.name}: nenhum piloto teve o cooldown de fala consumido pelo FOCO`)
    assert.equal(after.radioMessage.eventId, 'player_take_damage')
    assert.ok(!ABILITY_EVENT_IDS.has(after.radioMessage.eventId))
    assert.notEqual(after.radioMessage.eventId, 'focus_ready')

    // desativar o FOCO também é silencioso
    const off = squad.toggleCommand([], frame.position, variant.slippy)
    assert.equal(off.mode, 'free')
    assert.equal(squad.update(0.016, frame.position, frame, {}).radioMessage, null)
  }
}

{
  console.log('Testing 6: ability ativa só feedback visual; nenhuma chega ao rádio; rajada ≤ 1...')
  const squad = makeSquad()
  const miyu = squad.getActiveMembers().find((m) => m.id === 3)
  assert.ok(miyu)
  let icons = 0
  const messages = []
  for (let i = 0; i < 200; i++) {
    const ev = squad.update(0.05, frame.position, frame, { homingCharging: true, homingHasLockedTarget: true, playerBoostStarted: i === 10 })
    icons = Math.max(icons, squad.getActiveAbilityIcons().length)
    if (ev.radioMessage) messages.push(ev.radioMessage)
  }
  assert.ok(icons > 0, 'a ability aparece como ícone sobre o aliado')
  for (const m of messages) {
    assert.ok(!ABILITY_EVENT_IDS.has(m.eventId), `nenhum evento de ability no rádio (${m.eventId})`)
    assert.ok(!('isAbility' in m), 'payload não carrega mais flag isAbility')
  }

  // rajada de eventos no mesmo instante real: no máximo 1 transmissão sai
  const burst = makeSquad()
  const out = []
  for (let i = 0; i < 12; i++) {
    burst.triggerPlayerTookDamage()
    const ev = burst.update(0.016, frame.position, frame, {})
    if (ev.radioMessage) out.push(ev.radioMessage)
  }
  assert.ok(out.length <= 1, `rajada de eventos gera no máximo 1 fala (${out.length})`)
}

// ============================================================================
// 6. Caminhos mortos e bypass estruturalmente ausentes
// ============================================================================
{
  console.log('Testing 7: código morto removido e bypass impossível...')
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
  const wingmen = read('./combat/wingmen.js')
  const radioSrc = read('./combat/wingman-radio.js')
  const conv = read('./combat/wingman-radio-callresponse.js')
  const world = read('./combat/wingman-world-radio.js')
  const hudGame = read('./hud-game.js')
  const loop = read('./game-loop.js')
  const combatIndex = read('./combat/index.js')

  // (a) wingmen.js não escolhe linhas nem fala direto: só o dispatcher
  for (const forbidden of ['getLine', 'markSpoken', 'pendingRadioMessages', 'speakAbility', 'radioQueue', 'isAbility', 'clearPilot', 'focus_ready', 'ability_focus_upgrade', 'focusResponse']) {
    assert.ok(!wingmen.includes(forbidden), `wingmen.js não pode conter "${forbidden}"`)
  }
  for (const direct of ['wingmanRadio.trySpeak', 'wingmanRadio.forceSpeak', 'wingmanRadio.trySpeakAlone', 'wingmanRadio.takeDueResponse']) {
    assert.ok(!wingmen.includes(direct), `wingmen.js só fala via dispatcher (proibido "${direct}")`)
  }
  assert.ok(wingmen.includes('radioDispatcher.request('), 'wingmen.js usa o dispatcher único')

  // (b) API do scheduler sem os pontos de bypass
  const radio = createWingmanRadio()
  for (const gone of ['getLine', 'markSpoken', 'speakAbility']) assert.equal(typeof radio[gone], 'undefined', `scheduler não exporta ${gone}`)
  for (const src of [radioSrc, conv]) {
    assert.ok(!/"ability_[a-z_]+"\s*:/.test(src), 'catálogo/respostas sem linhas ability_*')
    assert.ok(!/"focus_ready"\s*:/.test(src), 'catálogo sem focus_ready')
  }

  // (c) código morto do HUD / fila / world-space
  for (const gone of ['showQueue', 'clearQueue', 'showWingmanRadioQueue', 'isAbility']) assert.ok(!hudGame.includes(gone), `hud-game.js não pode conter "${gone}"`)
  assert.ok(!loop.includes('radioQueue') && !combatIndex.includes('radioQueue'), 'radioQueue removido do game-loop e do combate')
  for (const gone of ['showWingman', 'showMessage', 'makePanelSprite', 'WINGMAN_AVATARS', 'followPlayer', 'clearPilot']) assert.ok(!world.includes(gone), `wingman-world-radio.js não pode conter "${gone}"`)

  // (d) o feedback visual legítimo de ability permanece
  assert.ok(world.includes('triggerAbilityGlow') && wingmen.includes('worldRadio.triggerAbilityGlow'))
  assert.ok(wingmen.includes('triggerAbilityWorldIcon'))

  // (e) rádio continua fixo inferior-central (sem projeção a partir da nave)
  assert.ok(!loop.includes('updateRadioPosition') && !loop.includes('shipBelow'))
}

console.log('✔ wingman-radio-dispatcher.test.mjs: todos os testes passaram')
