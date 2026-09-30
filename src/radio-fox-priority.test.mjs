// Arbitragem do painel único de rádio com o FOX (jogador) como falante de COMANDO/STATUS:
// prioridade 1) comando do jogador, 2) urgente, 3) chatter, 4) Call & Response. Sempre UM
// controlador/painel; o chatter nunca apaga o Fox; o gate de 6 s continua valendo para chatter.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { createWingmanRadio, SQUAD_TRIVIAL_GAP_MS } from './combat/wingman-radio.js'
import { createRadioDispatcher } from './combat/wingman-radio-dispatcher.js'
import { FOX_SPEAKER, FOX_COMMAND_LINES, WINGMAN_PORTRAITS } from './combat/radio-speakers.js'
import { createSquadronSystem } from './combat/wingmen.js'
import { WINGMAN_SOUND_CUES } from './audio-cues.js'

console.log('--- TEST SUITE: Fox no rádio (FOCO) e arbitragem do painel único ---')

const PROFILES = [0, 1, 2, 3].map((id) => ({ id, name: `P${id}`, accentColor: 0xffffff }))
const buildPayload = (profile, text, eventId, meta = {}) => ({ pilotId: profile.id, speakerType: 'wingman', name: profile.name, text, eventId, ...meta })
function makeDispatcher({ random = () => 0.5 } = {}) {
  let clock = 0
  const radio = createWingmanRadio({ random, enforceSquadSilence: true, squadSilenceGapMs: SQUAD_TRIVIAL_GAP_MS })
  const dispatcher = createRadioDispatcher({ radio, buildPayload, getActivePilotIds: () => [0, 1, 2, 3], now: () => clock })
  return { radio, dispatcher, setNow: (t) => { clock = t } }
}

{
  console.log('Testing 1: speaker real do Fox (nada de pilotId fantasma) e assets/cue existentes...')
  assert.equal(FOX_SPEAKER.speakerId, 'fox')
  assert.equal(FOX_SPEAKER.speakerType, 'player')
  assert.equal(FOX_SPEAKER.pilotId, null)
  assert.equal(FOX_SPEAKER.avatar, 'assets/wingman-radio/fox.png')
  assert.ok(readFileSync(new URL('../' + FOX_SPEAKER.avatar, import.meta.url)).length > 0, 'fox.png existe')
  const cue = WINGMAN_SOUND_CUES[FOX_SPEAKER.voiceCue]
  assert.ok(cue && cue.file === 'sons/fox.mp3', 'cue de voz do Fox registrado em audio-cues.js')
  assert.ok(readFileSync(new URL('../' + cue.file, import.meta.url)).length > 0, 'sons/fox.mp3 existe')
  assert.equal(WINGMAN_PORTRAITS.length, 4)
  assert.deepEqual(Object.keys(FOX_COMMAND_LINES).sort(), ['focus_activated', 'focus_ready'])
}

{
  console.log('Testing 2: comando do Fox interrompe chatter pendente e o chatter não apaga o Fox...')
  const m = makeDispatcher()
  m.setNow(10000)
  const chatter = m.dispatcher.request(PROFILES[0], 'kill')
  assert.ok(chatter && chatter.eventId === 'kill', 'chatter aceito e pendente')
  m.setNow(10050)
  const fox = m.dispatcher.requestPlayerCommand(FOX_SPEAKER, 'focus_activated', FOX_COMMAND_LINES.focus_activated[0])
  assert.ok(fox && fox.speakerId === 'fox' && fox.priority === 'command')
  const delivered = m.dispatcher.take()
  assert.equal(delivered.speakerId, 'fox', 'o painel único recebe o Fox, nunca o chatter substituído')
  assert.equal(m.dispatcher.take(), null, 'nada mais pendente: um único painel')
  // chatter logo depois: recusado pelo gate global de 6 s armado pelo Fox
  for (const dt of [100, 1000, 3000, 5900]) {
    m.setNow(10050 + dt)
    assert.equal(m.dispatcher.request(PROFILES[1], 'kill'), null, `chatter a ${dt} ms do Fox é recusado`)
  }
  m.setNow(10050 + SQUAD_TRIVIAL_GAP_MS + 3000) // depois do gate + silêncio estimado do esquadrão
  assert.ok(m.dispatcher.request(PROFILES[2], 'kill_streak') || m.dispatcher.request(PROFILES[1], 'kill'), 'chatter volta depois do gate')
}

{
  console.log('Testing 3: urgente não fura o gate depois do Fox e não gera dois painéis...')
  const m = makeDispatcher()
  m.setNow(20000)
  m.dispatcher.requestPlayerCommand(FOX_SPEAKER, 'focus_activated', 'Foco!')
  m.setNow(21000)
  assert.equal(m.dispatcher.request(PROFILES[0], 'retreat', { force: true }), null, 'retreat (urgente) respeita o gate global armado pelo Fox')
  assert.equal(m.dispatcher.take().speakerId, 'fox', 'a pendente do Fox permanece intacta')
  // dois comandos colados (mesmo evento em < 0,25 s) não geram duas transmissões
  m.setNow(30000)
  assert.ok(m.dispatcher.requestPlayerCommand(FOX_SPEAKER, 'focus_ready', 'Pronto'))
  m.setNow(30100)
  assert.equal(m.dispatcher.requestPlayerCommand(FOX_SPEAKER, 'focus_ready', 'Pronto'), null)
  // abilities continuam proibidas no rádio
  assert.equal(m.dispatcher.requestPlayerCommand(FOX_SPEAKER, 'ability_ram', 'x'), null)
}

{
  console.log('Testing 4: Call & Response não sobrevive à fala do Fox (nenhuma resposta colada)...')
  const m = makeDispatcher({ random: () => 0 })
  m.setNow(50000)
  m.dispatcher.request(PROFILES[0], 'retreat', { force: true })
  m.dispatcher.take()
  m.setNow(51000)
  m.dispatcher.requestPlayerCommand(FOX_SPEAKER, 'focus_activated', 'Foco!')
  m.dispatcher.take()
  let reply = null
  for (let t = 51000; t <= 70000 && !reply; t += 100) { m.setNow(t); reply = m.dispatcher.takeReply([1, 2, 3], (r) => r) }
  assert.equal(reply, null, 'a resposta pendente foi cancelada pelo comando do jogador (sem conversa em cadeia)')
}

// ============================================================================
// Esquadrão REAL: KeyD → 1 fala do Fox; READY → exatamente 1 fala do Fox (edge trigger)
// ============================================================================
function createMockRail() {
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -100), new THREE.Vector3(0, 0, -500)])
  return {
    curve, getPointAt: (t) => curve.getPointAt(t), getTangentAt: (t) => curve.getTangentAt(t),
    getFrameAt: () => ({ forward: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) }),
    getPlayerPosition: () => new THREE.Vector3(0, 0, 0), isFullSpinActive: () => false, isArena: () => false,
  }
}
const frame = { position: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) }
const makeSquad = () => { const s = createSquadronSystem(new THREE.Group(), createMockRail(), {}, {}); for (const id of [0, 1, 2, 3]) s.spawnMember(id); return s }

{
  console.log('Testing 5: esquadrão real — ciclo FOCO (ativação, expira, recarga, READY) fala exatamente 2 vezes...')
  const squad = makeSquad()
  const spoken = []
  const tick = (dt) => { const ev = squad.update(dt, frame.position, frame, {}); if (ev.radioMessage) spoken.push(ev.radioMessage) }
  // montar o HUD/iniciar partida não fala: 3 s em FOCO livre sem nenhum evento de comando
  for (let i = 0; i < 180; i++) tick(1 / 60)
  assert.equal(spoken.filter((m) => m.speakerId === 'fox').length, 0, 'sem comando do jogador, o Fox não fala (nada ao montar o HUD / por frame)')
  assert.equal(squad.toggleCommand([], frame.position, 0).mode, 'focus')
  for (let i = 0; i < 60 * 20; i++) tick(1 / 60) // 6 s de janela + 10 s de recarga + folga
  const fox = spoken.filter((m) => m.speakerId === 'fox')
  assert.deepEqual(fox.map((m) => m.eventId), ['focus_activated', 'focus_ready'], `Fox fala na ativação e no retorno a READY, uma vez cada (${spoken.map((m) => m.speakerId + ':' + m.eventId)})`)
  assert.ok(fox.every((m) => m.avatar === 'assets/wingman-radio/fox.png' && m.voiceCue === 'pilot_voice_fox' && m.speakerType === 'player' && m.pilotId === null))
  // nenhuma rajada de pilotos no FOCO: só o Fox + no máximo chatter normal depois do gate de 6 s
  const all = spoken.map((m) => ({ id: m.speakerId, e: m.eventId }))
  assert.ok(all.filter((x) => x.e.startsWith('engage')).length <= 1, `sem rajada de confirmações dos pilotos (${JSON.stringify(all)})`)
  // READY não repete por frame depois
  const before = spoken.length
  for (let i = 0; i < 600; i++) tick(1 / 60)
  assert.equal(spoken.slice(before).filter((m) => m.eventId === 'focus_ready').length, 0, 'focus_ready não repete')
}

{
  console.log('Testing 6: cancelar o FOCO manualmente também volta a READY com uma fala...')
  const squad = makeSquad()
  const spoken = []
  const tick = (dt) => { const ev = squad.update(dt, frame.position, frame, {}); if (ev.radioMessage) spoken.push(ev.radioMessage) }
  squad.toggleCommand([], frame.position, 0)
  for (let i = 0; i < 60 * 2; i++) tick(1 / 60)
  assert.equal(squad.toggleCommand([], frame.position, 0).mode, 'free')
  for (let i = 0; i < 60 * 12; i++) tick(1 / 60)
  assert.equal(spoken.filter((m) => m.eventId === 'focus_ready').length, 1)
}

{
  console.log('Testing 7: painel e CSS — âncora fixa, retrato por payload, sem glifo...')
  const css = readFileSync(new URL('./hud-styles.js', import.meta.url), 'utf8')
  const anchor = css.match(/\.hud-wingman-radio \{[^}]*\}/)[0]
  assert.ok(anchor.includes('left: 50%') && anchor.includes('translateX(-50%)'))
  assert.ok(!/animation/.test(anchor), 'a âncora não tem animation')
  assert.ok(/\.hud-wingman-radio\.entering \.hud-wingman-radio-shell \{\s*animation/.test(css), 'glitch de entrada anima o shell interno')
  assert.ok(/\.hud-wingman-radio\.leaving \.hud-wingman-radio-shell \{\s*animation/.test(css), 'flicker de saída anima o shell interno')
  assert.ok(!/\.hud-wingman-radio\.(entering|leaving) \{/.test(css), 'nenhuma animação direta na âncora')
  assert.ok(/\.hud-ability-pilot-portrait/.test(css) && !/hud-wingman-ability-world-icon/.test(css))
  const hud = readFileSync(new URL('./hud-game.js', import.meta.url), 'utf8')
  assert.ok(hud.includes('class="hud-wingman-radio-shell"'))
  assert.ok(hud.includes("avatar || WINGMAN_RADIO_AVATARS[pilotId]"), 'retrato vem do payload (Fox/wingmen), não só de WINGMAN_RADIO_AVATARS[pilotId]')
  assert.ok(!hud.includes('item.icon') && !hud.includes('el.textContent = item.'), 'retrato de habilidade sem glifo')
  const loop = readFileSync(new URL('./game-loop.js', import.meta.url), 'utf8')
  assert.ok(!loop.includes('showFoxFocus') && !loop.includes('hud-squadron-notice'), 'painel world-space/pill do FOCO não voltou')
}

console.log('✔ radio-fox-priority.test.mjs: todos os testes passaram')
