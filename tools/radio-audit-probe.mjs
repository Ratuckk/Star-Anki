// SONDA DO RÁDIO DOS WINGMEN — somente observação (não altera produção).
// Roda o esquadrão REAL (createSquadronSystem) e o scheduler real (createWingmanRadio). Escrita para
// a auditoria (docs/audits/radio-wingmen-audit.md), quando confirmou o bypass do Focus e a taxa de
// ~34% do Call & Response; agora verifica o estado PÓS-CORREÇÃO (dispatcher único): FOCO sem rádio,
// sem getLine/markSpoken/speakAbility na API e Call & Response alcançável.
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
log('== P1: FOCUS ([D]) com 4 aliados (esquadrão real, sem inimigos) — esperado: nenhuma fala ==')
for (const variant of [
  { name: 'sem upgrades', slippyStacks: 0, peppyStacks: 0 },
  { name: 'Slippy morale>0 (antigo ability_focus_upgrade)', slippyStacks: 1, peppyStacks: 0 },
]) {
  const squad = createSquadronSystem(new THREE.Group(), createMockRail(), {}, {})
  for (const id of [0, 1, 2, 3]) squad.spawnMember(id)
  // aquece 1 frame (o primeiro update não deve emitir fala)
  const warm = squad.update(0.016, frame.position, frame, {})
  const res = squad.toggleCommand([], frame.position, variant.slippyStacks)
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
// P2 — API do scheduler: os pontos de bypass deixaram de existir
// ---------------------------------------------------------------------------
log('\n== P2: API pública do scheduler ==')
{
  const radio = createWingmanRadio({ random: () => 0.5 })
  for (const name of ['getLine', 'markSpoken', 'speakAbility']) log(`- radio.${name}: ${typeof radio[name]}  (esperado: undefined)`)
  // FOCO não consome cooldown de piloto algum: logo depois, todos ainda falam (respeitando só o gate)
  const t0 = 100000
  const res = [0, 1, 2, 3].map((p, i) => radio.trySpeak(p, 'kill', t0 + i * 9500, { activePilotIds: [0, 1, 2, 3] }))
  log(`  4 pilotos falando espaçados de 9,5 s (fora do silêncio de 8,8 s) → ${JSON.stringify(res.map((x) => !!x))}`)
}

// ---------------------------------------------------------------------------
// P3 — Call & Response: a janela é compatível com o gate global de 6 s?
// ---------------------------------------------------------------------------
log('\n== P3: Call & Response (retreat → resposta) vs gate global ==')
log(`  constantes: delay ${CALL_RESPONSE_DELAY_MIN_MS}–${CALL_RESPONSE_DELAY_MAX_MS} ms, TTL após vencer ${CALL_RESPONSE_TTL_AFTER_DUE_MS} ms, gate global ${SQUAD_TRIVIAL_GAP_MS} ms (a resposta só vence a partir do gate)`)
{
  const trials = 200
  let delivered = 0
  let earliest = Infinity
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
    for (let t = t0; t <= t0 + 12000 && !got; t += 50) {
      got = radio.takeDueResponse(t, [1, 2, 3])
      if (got) earliest = Math.min(earliest, t - t0)
    }
    if (got) delivered += 1
  }
  log(`  respostas entregues: ${delivered}/${trials} (${Math.round((delivered / trials) * 100)}%); mais cedo: ${earliest} ms após a fala que abriu a conversa`)
}

// ---------------------------------------------------------------------------
// P4 — ability_* nunca chega ao rádio pelos caminhos normais; só via Focus (buildRadioPayload marca isAbility)
// ---------------------------------------------------------------------------
log('\n== P4: ABILITY_EVENT_IDS x scheduler ==')
{
  const radio = createWingmanRadio({ random: () => 0.5 })
  const results = [...ABILITY_EVENT_IDS].map((id) => [id, radio.trySpeak(1, id, 1000, { activePilotIds: [0, 1, 2, 3] }), radio.forceSpeak(1, id, 1000, { activePilotIds: [0, 1, 2, 3] })])
  for (const [id, t, f] of results) log(`  ${id}: trySpeak=${JSON.stringify(t)} forceSpeak=${JSON.stringify(f)}`)
}

console.log('\n[probe concluída — nenhum arquivo de produção foi modificado]')
export { out }
