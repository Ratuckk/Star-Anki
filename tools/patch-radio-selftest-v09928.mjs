import fs from 'node:fs'

const file = 'src/selftest.mjs'
const source = fs.readFileSync(file, 'utf8')
const startAnchor = "  const line2 = radio.trySpeak(1, 'ability_guard', 1500)"
const endAnchor = "\n\n  const missingPilot = radio.trySpeak(99, 'kill', 50000)"
const start = source.indexOf(startAnchor)
const end = source.indexOf(endAnchor, start)
if (start < 0 || end < 0) throw new Error('Selftest radio cooldown anchors not found')

const replacement = `  const line2 = radio.trySpeak(1, 'engage_dogfight', 1500)
  assert.ok(typeof line2 === 'string', 'cooldown de Falco não pode bloquear uma fala trivial de Peppy')

  const samePilotBlocked = radio.trySpeak(0, 'kill', 1500)
  assert.strictEqual(samePilotBlocked, null, 'cooldown trivial continua valendo por piloto')

  const abilityDuringCooldown = radio.speakAbility(0, 'ability_ram', 1600)
  assert.ok(typeof abilityDuringCooldown === 'string', 'ability deve falar in-world mesmo durante cooldown trivial do piloto')

  // O cooldown trivial continua aleatório entre 6s e 20s por piloto; usar o MÁXIMO garante que o
  // cooldown de Falco já passou não importa qual valor foi sorteado na fala anterior.
  const line3 = radio.trySpeak(0, 'engage_dogfight', 1000 + GLOBAL_COOLDOWN_MAX_MS)
  assert.ok(typeof line3 === 'string', 'depois do cooldown trivial máximo (20s) passar, o mesmo piloto deve voltar a falar')`

fs.writeFileSync(file, source.slice(0, start) + replacement + source.slice(end))
console.log('patch-radio-selftest-v09928: OK')
