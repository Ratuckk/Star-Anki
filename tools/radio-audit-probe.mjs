// SONDA DE AUDITORIA DO RÁDIO DOS WINGMEN — somente leitura/observação (não altera produção).
// Roda o esquadrão REAL (createSquadronSystem) e o scheduler real (createWingmanRadio) para
// confirmar, com números, os caminhos descritos em docs/audits/radio-wingmen-audit.md.
// Não faz parte da CI. Requer `three` (node_modules ou NODE_PATH).
//
//   node tools/radio-audit-probe.mjs
import * as THREE from 'three'
import { createSquadronSystem } from '../src/combat/wingmen.js'
import { createWingmanRadio, ABILITY_EVENT_IDS, SQUAD_TRIVIAL_GAP_MS } from '../src/combat/wingman-radio.js'
import { CALL_RESPONSE_DELAY_MIN_MS, CALL_RESPONSE_DELAY_MAX_MS, CALL_RESPONSE_TTL_AFTER_DUE_MS } from '../src/combat/wingman-radio-callresponse.js'

const out = []
const log = (s = '') => { out.push(s); console.log(s) }

function createMockRail() {
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -100), new THREE.Vector3(0, 0, -500)])
  return {
    curve,
    getPointAt: (t) => curve.getPointAt(t), getTangentAt: (t) => curve.getTangentAt(t),
    getFrameAt: () => ({ forward: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) }),
    getPlayerPosition: () => new THREE.Vector3(0, 0, 0), isFullSpinActive: () => false, isArena: () => false,
  }
}
const frame = { position: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) }

// ---------------------------------------------------------------------------
// P1 — FOCUS no esquadrão REAL: o que é enfileirado / entregue / consumido
// ---------------------------------------------------------------------------
log('== P1: FOCUS ([D]) com 4 aliados (esquadrão real, sem inimigos) ==')
for (const variant of [
  { name: 'sem upgrades', slippyStacks: 0, peppyStacks: 0 },
  { name: 'Slippy morale>0 (ability_focus_upgrade p/ Slippy)', slippyStacks: 1, peppyStacks: 0 },
  { name: 'Peppy aux shield>0 (ability_focus_upgrade p/ Peppy)', slippyStacks: 0, peppyStacks: 1 },
]) {
  const squad = createSquadronSystem(new THREE.Group(), createMockRail(), {}, {})
  for (const id of [0, 1, 2, 3]) squad.spawnMember(id)
  // aquece 1 frame (o primeiro update não deve emitir fala)
  const warm = squad.update(0.016, frame.position, frame, {})
  const res = squad.toggleCommand([], frame.position, variant.slippyStacks, variant.peppyStacks)
  const ev = squad.update(0.016, frame.position, frame, {})
  // segundo frame logo em seguida
  const ev2 = squad.update(0.016, frame.position, frame, {})
  const list = (e) => (e.radioQueue || (e.radioMessage ? [e.radioMessage] : [])).map((m) => `${m.name}:${m.eventId}${m.isAbility ? '[ABILITY]' : ''}`)
  log(`- ${variant.name}`)
  log(`    toggleCommand → ${JSON.stringify(res)}`)
  log(`    frame do toggle  → radioMessage/Queue: ${JSON.stringify(list(ev))}  (queue=${!!ev.radioQueue})`)
  log(`    frame seguinte   → ${JSON.stringify(list(ev2))}`)
  log(`    (warm-up sem fala: ${JSON.stringify(list(warm))})`)
}

// ---------------------------------------------------------------------------
// P2 — o mesmo bloco do Focus contra o scheduler REAL: gate global armado? cooldown por piloto?
// ---------------------------------------------------------------------------
log('\n== P2: bloco do Focus (getLine + markSpoken) vs gate global do scheduler ==')
{
  const radio = createWingmanRadio({ random: () => 0.5 })
  const t0 = 100000
  for (const pilot of [0, 1, 2, 3]) {
    const line = radio.getLine(pilot, 'focus_ready') // exatamente o que wingmen.js faz
    radio.markSpoken(pilot, t0)
    log(`- getLine(${pilot},'focus_ready') = ${JSON.stringify(line)}`)
  }
  log(`  squadTrivialSilenceUntil após 4 "falas" do Focus: ${radio.getSquadTrivialSilenceUntil()}  (gate global ${radio.getSquadTrivialSilenceUntil() === -Infinity ? 'NÃO armado' : 'armado'})`)
  const kill = radio.trySpeak(1, 'kill', t0 + 500, { activePilotIds: [0, 1, 2, 3] })
  log(`  trySpeak(pilot 1,'kill') 0,5 s depois → ${JSON.stringify(kill)}  (bloqueado por cooldown POR PILOTO consumido por markSpoken, não pelo gate)`)
  const other = createWingmanRadio({ random: () => 0.5 })
  const first = other.trySpeak(0, 'engage_dogfight', t0, { activePilotIds: [0, 1, 2, 3] })
  const second = other.trySpeak(1, 'kill', t0 + 500, { activePilotIds: [0, 1, 2, 3] })
  log(`  controle (caminho normal): trySpeak#1=${JSON.stringify(first)}  trySpeak#2 0,5 s depois=${JSON.stringify(second)} (gate global bloqueia)`)
  const nextAllowed = [0, 1, 2, 3].map((p) => radio.trySpeak(p, 'kill', t0 + 6500, { activePilotIds: [0, 1, 2, 3] }))
  log(`  6,5 s após o Focus, trySpeak('kill') dos 4 pilotos → ${JSON.stringify(nextAllowed)}  (todos os pilotos ficam mudos 6–20 s por causa do markSpoken em massa)`)
}

// ---------------------------------------------------------------------------
// P3 — Call & Response: a janela de entrega é compatível com o gate global de 6 s?
// ---------------------------------------------------------------------------
log('\n== P3: Call & Response (retreat → resposta) vs gate global ==')
log(`  constantes: delay ${CALL_RESPONSE_DELAY_MIN_MS}–${CALL_RESPONSE_DELAY_MAX_MS} ms, TTL após vencer ${CALL_RESPONSE_TTL_AFTER_DUE_MS} ms, gate global ${SQUAD_TRIVIAL_GAP_MS} ms`)
{
  const trials = 200
  let delivered = 0
  for (let k = 0; k < trials; k++) {
    // random determinístico: r = (k+0.5)/trials é usado só no 4º sorteio (o delay da resposta, em
    // openFromEvent); os anteriores (linha, respondente, texto) usam 0
    let calls = 0
    const r = (k + 0.5) / trials
    const radio = createWingmanRadio({ random: () => { calls += 1; return calls === 4 ? r : 0 } })
    const t0 = 50000
    const line = radio.forceSpeak(0, 'retreat', t0, { activePilotIds: [0, 1, 2, 3] })
    if (!line) continue
    let got = null
    for (let t = t0; t <= t0 + 12000 && !got; t += 50) got = radio.takeDueResponse(t, [1, 2, 3])
    if (got) delivered += 1
  }
  log(`  respostas entregues: ${delivered}/${trials} (${Math.round((delivered / trials) * 100)}%)`)
}

// ---------------------------------------------------------------------------
// P4 — ability_* nunca chega ao rádio pelos caminhos normais; só via Focus (buildRadioPayload marca isAbility)
// ---------------------------------------------------------------------------
log('\n== P4: ABILITY_EVENT_IDS x scheduler ==')
{
  const radio = createWingmanRadio({ random: () => 0.5 })
  const results = [...ABILITY_EVENT_IDS].map((id) => [id, radio.trySpeak(1, id, 1000, { activePilotIds: [0, 1, 2, 3] }), radio.forceSpeak(1, id, 1000, { activePilotIds: [0, 1, 2, 3] }), radio.getLine(1, id)])
  for (const [id, t, f, g] of results) log(`  ${id}: trySpeak=${JSON.stringify(t)} forceSpeak=${JSON.stringify(f)} getLine=${JSON.stringify(g)}`)
}

console.log('\n[probe concluída — nenhum arquivo de produção foi modificado]')
export { out }
