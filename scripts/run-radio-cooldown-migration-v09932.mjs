import { readFileSync, writeFileSync } from 'node:fs'

const sourcePath = 'scripts/apply-radio-cooldown-miyu-v09932.mjs'
const fixedPath = 'scripts/.apply-radio-cooldown-miyu-v09932-fixed.mjs'
let source = readFileSync(sourcePath, 'utf8')
source = source
  .replaceAll('`ability_assist`', "'ability_assist'")
  .replaceAll('`getLockedEnemySnapshots()`', "'getLockedEnemySnapshots()'")
writeFileSync(fixedPath, source)
await import(new URL('../' + fixedPath, import.meta.url))

// O selftest antigo documentava a política v0.99.28, na qual abilities furavam o cooldown.
// v0.99.32 transforma a janela em rate limiter universal por piloto.
const selftestPath = 'src/selftest.mjs'
let selftest = readFileSync(selftestPath, 'utf8')
const before = `  const abilityDuringCooldown = radio.speakAbility(0, 'ability_ram', 1600)\n  assert.ok(typeof abilityDuringCooldown === 'string', 'ability deve falar in-world mesmo durante cooldown trivial do piloto')\n\n  // O cooldown trivial continua aleatório entre 6s e 20s por piloto; usar o MÁXIMO garante que o\n  // cooldown de Falco já passou não importa qual valor foi sorteado na fala anterior.\n  const line3 = radio.trySpeak(0, 'engage_dogfight', 1000 + GLOBAL_COOLDOWN_MAX_MS)\n  assert.ok(typeof line3 === 'string', 'depois do cooldown trivial máximo (20s) passar, o mesmo piloto deve voltar a falar')`
const after = `  const abilityDuringCooldown = radio.speakAbility(0, 'ability_ram', 1600)\n  assert.strictEqual(abilityDuringCooldown, null, 'ability também deve respeitar o cooldown do piloto')\n\n  // v0.99.32: toda transmissão comum/ability usa a mesma janela aleatória de 2s a 10s por piloto.\n  // Usar o MÁXIMO garante que o cooldown já passou independentemente do valor sorteado.\n  const line3 = radio.trySpeak(0, 'engage_dogfight', 1000 + GLOBAL_COOLDOWN_MAX_MS)\n  assert.ok(typeof line3 === 'string', 'depois do cooldown máximo (10s) passar, o mesmo piloto deve voltar a falar')`
if (!selftest.includes(before)) throw new Error('selftest radio cooldown block not found')
selftest = selftest.replace(before, after)
writeFileSync(selftestPath, selftest)
