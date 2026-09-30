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
    assert.ok(!('abilityLines' in snapshot), 'catálogo não tem linhas de habilidade')
  }
}
const independent = createWingmanRadio({ random: () => 0 })
assert.ok(independent.trySpeak(0, 'engage_dogfight', 0, { activePilotIds: [0, 1] }))
// 1.2: Segundo piloto bloqueado pelo silêncio de 6s do esquadrão no mesmo instante
assert.strictEqual(independent.trySpeak(1, 'engage_dogfight', 0, { activePilotIds: [0, 1] }), null)
// Mas permitido após o silêncio global
assert.ok(independent.trySpeak(1, 'engage_dogfight', 10000, { activePilotIds: [0, 1] }))
// 1.1: Habilidade NUNCA usa rádio (retorna null)
assert.strictEqual(independent.trySpeak(0, 'ability_ram', 12000, { activePilotIds: [0, 1] }), null)
assert.strictEqual(independent.forceSpeak(0, 'ability_ram', 12000, { activePilotIds: [0, 1] }), null)
assert.equal(typeof independent.speakAbility, 'undefined', 'speakAbility deixou de existir')
assert.equal(typeof independent.getLine, 'undefined', 'getLine não faz parte da API do scheduler')
assert.equal(typeof independent.markSpoken, 'undefined', 'markSpoken não faz parte da API do scheduler')
assert.ok(ABILITY_EVENT_IDS.has('ability_focus_upgrade'))

const hudFacade = readFileSync(new URL('./hud.js', import.meta.url), 'utf8')
assert.ok(!hudFacade.includes('createWingmanRadioSlots'), 'grid de quatro blocos não pode voltar ao runtime')
const hudGame = readFileSync(new URL('./hud-game.js', import.meta.url), 'utf8')
for (const required of ['radio_connect', 'radio_disconnect', 'pilot_voice_falco', 'pilot_voice_peppy', 'pilot_voice_slippy', 'pilot_voice_miyu']) {
  assert.ok(hudGame.includes(required), 'rádio lateral precisa preservar áudio ' + required)
}
const worldRadio = readFileSync(new URL('./combat/wingman-world-radio.js', import.meta.url), 'utf8')
assert.match(worldRadio, /WINGMAN_ABILITY_GLOW_DURATION_S\s*=\s*1\.5/)
assert.ok(!worldRadio.includes('showFoxFocus') && !worldRadio.includes('followPlayer'), 'painel world-space do Fox no FOCO foi removido')
assert.ok(!worldRadio.includes('assets/wingman-radio/fox.png'), 'world-radio não carrega mais o avatar do Fox')
const wingmen = readFileSync(new URL('./combat/wingmen.js', import.meta.url), 'utf8')
assert.ok(!wingmen.includes('showFoxFocus'), 'FOCO não cria mais painel acima da nave do jogador')
assert.ok(!wingmen.includes('worldRadio.showWingman('), 'Wingmen não podem mais emitir quote acima da nave')
assert.ok(wingmen.includes('triggerAbilityPilotPortrait'), 'abilities ativam retrato do piloto sobre a nave')
assert.ok(!wingmen.includes('wingmanRadio.speakAbility'), 'wingmen não chama mais speakAbility')
assert.ok(wingmen.includes('worldRadio.triggerAbilityGlow'), 'glow de ability permanece')
console.log('wingman-radio-overhaul.test.mjs: OK')
