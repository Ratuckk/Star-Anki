import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ABILITY_EVENT_IDS,
  NEW_TRIVIAL_QUOTES_PER_PILOT,
  createWingmanRadio,
  getNewTrivialQuoteCount,
  getWingmanRadioValidationSnapshot,
} from './combat/wingman-radio.js'

assert.equal(NEW_TRIVIAL_QUOTES_PER_PILOT, 30)
for (const pilotId of [0, 1, 2, 3]) {
  assert.equal(getNewTrivialQuoteCount(pilotId), 30)
  const snapshot = getWingmanRadioValidationSnapshot(pilotId)
  assert.equal(new Set(snapshot.newTrivialLines).size, 30)
  for (const line of snapshot.newTrivialLines) {
    assert.ok(snapshot.trivialLines.includes(line))
    assert.ok(!snapshot.abilityLines.includes(line))
  }
}
const independent = createWingmanRadio({ random: () => 0 })
assert.ok(independent.trySpeak(0, 'engage_dogfight', 0, { activePilotIds: [0, 1] }))
assert.ok(independent.trySpeak(1, 'engage_dogfight', 0, { activePilotIds: [0, 1] }))
assert.ok(independent.speakAbility(0, 'ability_ram', 1, { activePilotIds: [0, 1] }))
assert.ok(ABILITY_EVENT_IDS.has('ability_focus_upgrade'))

const hudFacade = readFileSync(new URL('./hud.js', import.meta.url), 'utf8')
assert.ok(!hudFacade.includes('createWingmanRadioSlots'), 'grid de quatro blocos não pode voltar ao runtime')
const hudGame = readFileSync(new URL('./hud-game.js', import.meta.url), 'utf8')
for (const required of ['radio_connect', 'radio_disconnect', 'pilot_voice_falco', 'pilot_voice_peppy', 'pilot_voice_slippy', 'pilot_voice_miyu']) {
  assert.ok(hudGame.includes(required), 'rádio lateral precisa preservar áudio ' + required)
}
const worldRadio = readFileSync(new URL('./combat/wingman-world-radio.js', import.meta.url), 'utf8')
assert.match(worldRadio, /WINGMAN_ABILITY_GLOW_DURATION_S\s*=\s*1\.5/)
assert.ok(worldRadio.includes("assets/wingman-radio/fox.png"))
const wingmen = readFileSync(new URL('./combat/wingmen.js', import.meta.url), 'utf8')
assert.ok(wingmen.includes('worldRadio.showFoxFocus'), 'Fox continua acima da nave do jogador')
assert.ok(!wingmen.includes('worldRadio.showWingman('), 'Wingmen não podem mais emitir quote acima da nave')
assert.ok(wingmen.includes("pendingRadioMessages.push(buildRadioPayload(wingman.profile, text, eventId))"), 'abilities voltam ao painel lateral')
assert.ok(wingmen.includes('Focus gera confirmação lateral para todo Wingman ativo'))
assert.ok(wingmen.includes('focusResponders = activeWingmen.filter'))
assert.ok(wingmen.includes('worldRadio.triggerAbilityGlow'), 'glow de ability permanece')
console.log('wingman-radio-overhaul.test.mjs: OK')
