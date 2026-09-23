import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ABILITY_EVENT_IDS,
  NEW_TRIVIAL_QUOTES_PER_PILOT,
  createWingmanRadio,
  getNewTrivialQuoteCount,
  getWingmanRadioLineStats,
  getWingmanRadioValidationSnapshot,
} from './combat/wingman-radio.js'
import {
  CALL_RESPONSE_DELAY_MIN_MS,
  createWingmanRadioConversationManager,
} from './combat/wingman-radio-callresponse.js'

assert.equal(NEW_TRIVIAL_QUOTES_PER_PILOT, 30)
for (const pilotId of [0, 1, 2, 3]) {
  assert.equal(getNewTrivialQuoteCount(pilotId), 30, `piloto ${pilotId} precisa ter exatamente 30 quotes triviais novos`)
  const snapshot = getWingmanRadioValidationSnapshot(pilotId)
  assert.equal(snapshot.newTrivialLines.length, 30)
  assert.equal(new Set(snapshot.newTrivialLines).size, 30, `piloto ${pilotId} não pode ter quote novo duplicado`)
  for (const line of snapshot.newTrivialLines) {
    assert.ok(snapshot.trivialLines.includes(line), `quote novo do piloto ${pilotId} precisa estar integrado a pool trivial`)
    assert.ok(!snapshot.abilityLines.includes(line), `quote novo do piloto ${pilotId} não pode contar como ability`)
  }
  const stats = getWingmanRadioLineStats(pilotId)
  assert.ok(stats.trivial >= 30, `piloto ${pilotId} precisa preservar pelo menos 30 triviais`)
}

const independent = createWingmanRadio({ random: () => 0 })
assert.ok(independent.trySpeak(0, 'engage_dogfight', 0, { activePilotIds: [0, 1, 2, 3] }))
assert.ok(independent.trySpeak(1, 'engage_dogfight', 0, { activePilotIds: [0, 1, 2, 3] }), 'cooldown de Falco não pode bloquear Peppy')
assert.equal(independent.trySpeak(0, 'kill', 1, { activePilotIds: [0, 1, 2, 3] }), null, 'cooldown continua valendo por piloto')
assert.ok(independent.speakAbility(0, 'ability_ram', 1, { activePilotIds: [0, 1, 2, 3] }), 'ability precisa ignorar cooldown trivial')
assert.equal(independent.speakAbility(0, 'kill', 2, { activePilotIds: [0, 1] }), null, 'speakAbility não aceita evento trivial')

for (const id of ['ability_ram', 'ability_intercept', 'ability_guard', 'ability_rescue', 'ability_aux_shield', 'ability_repair', 'ability_morale', 'ability_boost_dash', 'ability_assist', 'ability_boombuster']) {
  assert.ok(ABILITY_EVENT_IDS.has(id), `${id} precisa continuar classificado como ability`)
}

const conversations = createWingmanRadioConversationManager({ random: () => 0 })
const a = conversations.openFromEvent({ openerPilotId: 0, triggerEventId: 'ability_ram', now: 0, activePilotIds: [0, 1, 2, 3] })
const b = conversations.openFromEvent({ openerPilotId: 1, triggerEventId: 'ability_guard', now: 10, activePilotIds: [0, 1, 2, 3] })
assert.ok(a && b, 'dois chamadores diferentes precisam conseguir manter threads simultâneas')
assert.equal(conversations.getDebugSnapshot().pending.length, 2)
assert.ok(conversations.takeDueResponse(CALL_RESPONSE_DELAY_MIN_MS, [0, 1, 2, 3]))
assert.equal(conversations.getDebugSnapshot().pending.length, 1, 'entregar uma resposta não pode apagar outra thread')
assert.ok(conversations.takeDueResponse(CALL_RESPONSE_DELAY_MIN_MS + 10, [0, 1, 2, 3]))
assert.equal(conversations.getDebugSnapshot().pending.length, 0)

const hudFacade = readFileSync(new URL('./hud.js', import.meta.url), 'utf8')
assert.ok(hudFacade.includes('createWingmanRadioSlots'), 'hud.js precisa instalar os quatro slots triviais')
assert.ok(hudFacade.includes('payload.isAbility || payload.inWorld'), 'ability/in-world não pode cair no rádio lateral')
assert.ok(hudFacade.includes('wingmanSlots.showMany(payloads)'), 'fila legada precisa virar distribuição simultânea, não serial')

const worldRadioSource = readFileSync(new URL('./combat/wingman-world-radio.js', import.meta.url), 'utf8')
assert.match(worldRadioSource, /WINGMAN_ABILITY_GLOW_DURATION_S\s*=\s*1\.5/, 'efeito visual de habilidade precisa durar exatamente 1.5s')
assert.ok(worldRadioSource.includes("assets/wingman-radio/fox.png"), 'rádio in-world precisa usar o retrato separado do Fox')

const wingmenSource = readFileSync(new URL('./combat/wingmen.js', import.meta.url), 'utf8')
for (const required of [
  'createWingmanWorldRadio',
  'worldRadio.showFoxFocus',
  'announceAbility',
  'worldRadio.triggerAbilityGlow',
  'WINGMAN_ABILITY_GLOW_DURATION_S',
]) {
  assert.ok(wingmenSource.includes(required), `wingmen.js sem integração do rádio in-world: ${required}`)
}
assert.ok(!wingmenSource.includes("pendingRadioQueue = readyQueue"), 'Focus não pode voltar para fila lateral')
assert.ok(wingmenSource.includes("engageEventFor(w.targetEnemy.kind, 'engage_focus')") && wingmenSource.includes('announceWorld'), 'fala de reengajamento durante Focus também precisa continuar in-world')

console.log('wingman-radio-overhaul.test.mjs: OK')
