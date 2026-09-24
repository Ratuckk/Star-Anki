import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { DAMAGE_NUMBER_SCALE, MANGA_VISUAL_SCALE, ORBIT_RADIUS, getOrbitAngle } from './hud-damage.js'
import { PLAYER_SOUND_CUES } from './audio-cues.js'
import { getLoopTailRestartTime } from './audio.js'
import { createWingmanRadioConversationManager } from './combat/wingman-radio-callresponse.js'
import { createWingmanStateController, initializeWingmanControl } from './combat/wingman-state-controller.js'

assert.strictEqual(DAMAGE_NUMBER_SCALE, 0.8, 'números de dano precisam estar 20% menores')
const fullTurn = getOrbitAngle(2, 1) - getOrbitAngle(2, 0)
assert.ok(Math.abs(fullTurn - Math.PI * 2) < 1e-9, 'órbita precisa completar uma volta horária por ciclo')
assert.strictEqual(MANGA_VISUAL_SCALE, 0.5, 'Mangá precisa ficar 50% menor')
assert.strictEqual(ORBIT_RADIUS, 64, 'Buraco Negro usa uma geometria circular compartilhada')

const chargeCue = PLAYER_SOUND_CUES.charge_loop
assert.strictEqual(chargeCue.volume, 0.5525, 'carga deve ficar 15% abaixo do volume antigo 0.65')
assert.strictEqual(chargeCue.startAfterChargeMs, 180, 'áudio de carga deve entrar um pouco depois do limiar visual')
assert.strictEqual(chargeCue.loopTailMs, 360, 'loop da carga deve repetir apenas a cauda final')
assert.ok(Math.abs(getLoopTailRestartTime(1.2, chargeCue.loopTailMs, chargeCue.durationMs) - 0.84) < 1e-9, 'loop final deve reiniciar perto do fim, não em 0s')

const shielded = { profile: { id: 9, name: 'Shield test' } }
initializeWingmanControl(shielded, { hp: 4, maxHp: 4, shield: 2, maxShield: 2, lowHpThreshold: 1 })
const controller = createWingmanStateController({ lowHpThreshold: 1 })
controller.applyDamage(shielded, { amount: 1, shieldRegenDelay: 1.5 })
assert.strictEqual(shielded.control.resources.hp, 4, 'hit absorvido pelo escudo não pode reduzir HP')
assert.strictEqual(shielded.control.resources.shield, 1, 'escudo deve absorver o hit')
assert.strictEqual(shielded.control.retreat, null, 'perder escudo não pode iniciar retreat')
assert.strictEqual(shielded.state, 'patrol', 'perder escudo não pode iniciar regroup/retreat')

const radio = createWingmanRadioConversationManager({ random: () => 0 })
const interceptThread = radio.openFromEvent({ openerPilotId: 0, triggerEventId: 'ability_intercept', now: 0, activePilotIds: [0, 1, 2, 3] })
assert.ok(interceptThread && interceptThread.responderPilotId !== 0, 'Intercept precisa poder abrir Call & Response')

const wingmenSource = readFileSync(new URL('./combat/wingmen.js', import.meta.url), 'utf8')
assert.match(wingmenSource, /abilityLabel: 'Carga Compartilhada',[\s\S]{0,100}abilityCooldownBase: 9,[\s\S]{0,80}abilityCooldownFloor: 3/, 'Carga Compartilhada deve ter cooldown base de 9s')
assert.ok(!wingmenSource.includes('enterEmergencyRegroup') && !wingmenSource.includes('WINGMAN_MAX_DISTANCE_ARENA'), 'distância não pode mais acionar regroup/reset')
assert.ok(wingmenSource.includes('computeRailLongitudinalLag') && wingmenSource.includes('computeRailCatchupBoost'), 'Rail deve usar catch-up longitudinal suave')
assert.ok(wingmenSource.includes('isCallResponse: true') && wingmenSource.includes('openerPilotId: reply.openerPilotId'), 'resposta Call & Response precisa preservar vínculo com o chamador')

console.log('playtest-polish.test.mjs: OK')
