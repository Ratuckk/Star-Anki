import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ABILITY_EVENT_IDS,
  NEW_TRIVIAL_QUOTES_PER_PILOT,
  RADIO_COOLDOWN_MIN_MS,
  RADIO_COOLDOWN_MAX_MS,
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
assert.equal(RADIO_COOLDOWN_MIN_MS, 2000)
assert.equal(RADIO_COOLDOWN_MAX_MS, 10000)
const independent = createWingmanRadio({ random: () => 0 })
assert.ok(independent.trySpeak(0, 'engage_dogfight', 0, { activePilotIds: [0, 1] }))
assert.ok(independent.trySpeak(1, 'engage_dogfight', 0, { activePilotIds: [0, 1] }))
assert.equal(independent.speakAbility(0, 'ability_ram', 1999, { activePilotIds: [0, 1] }), null, 'ability respeita cooldown do piloto')
assert.ok(independent.speakAbility(0, 'ability_ram', 2000, { activePilotIds: [0, 1] }))
const maxCooldown = createWingmanRadio({ random: () => 1 })
assert.ok(maxCooldown.trySpeak(3, 'engage_dogfight', 0, { activePilotIds: [3] }))
assert.equal(maxCooldown.speakAbility(3, 'ability_assist', 9999, { activePilotIds: [3] }), null)
assert.ok(maxCooldown.speakAbility(3, 'ability_assist', 10000, { activePilotIds: [3] }))
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
assert.ok(wingmen.includes('w.miyuAssistRadioPending = true'), 'Miyu deve adiar a fala do Assist até existir lock')
assert.ok(wingmen.includes("announceAbility(w, 'ability_assist', { triggerGlow: false })"), 'fala do Assist deve acontecer apenas no gate de lock visível')
assert.equal((wingmen.match(/announceAbility\(w, 'ability_assist'/g) || []).length, 1, 'Assist não pode anunciar imediatamente na ativação')
assert.ok(wingmen.includes('homingCharging &&\n        homingHasLockedTarget'), 'gate da Miyu exige carga e lock visível')
const gameLoop = readFileSync(new URL('./game-loop.js', import.meta.url), 'utf8')
assert.ok(gameLoop.includes('const homingHasLockedTarget = isCharging && combat.getLockedEnemySnapshots().length > 0'), 'triângulo e Miyu precisam compartilhar a fonte real de lock')
const combatIndex = readFileSync(new URL('./combat/index.js', import.meta.url), 'utf8')
assert.ok(combatIndex.includes('homingHasLockedTarget: opts.homingHasLockedTarget'), 'lock visível precisa chegar ao sistema de Wingmen')
console.log('wingman-radio-overhaul.test.mjs: OK')
