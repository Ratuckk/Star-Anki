import assert from 'node:assert/strict'
import {
  createDamageOrbitTracker,
  DAMAGE_ORBIT_MIN_TARGET_MAX_HP,
  DAMAGE_ORBIT_WINDOW_MS,
} from './combat/damage-orbit-tracker.js'

assert.equal(DAMAGE_ORBIT_MIN_TARGET_MAX_HP, 12)
assert.equal(DAMAGE_ORBIT_WINDOW_MS, 1000)

// Jogador sozinho nunca arma a órbita.
{
  const tracker = createDamageOrbitTracker()
  assert.equal(tracker.recordHit({ targetId: 'a', targetMaxHp: 20, now: 0 }).orbit, false)
  assert.equal(tracker.recordHit({ targetId: 'a', targetMaxHp: 20, now: 200 }).orbit, false)
}

// Um co-hit com autoria diferente, envolvendo pelo menos um Wingman, arma a órbita em até 1s.
{
  const tracker = createDamageOrbitTracker()
  tracker.recordHit({ targetId: 'b', targetMaxHp: 20, now: 0 })
  const result = tracker.recordHit({ targetId: 'b', pilotId: 2, targetMaxHp: 20, now: 900 })
  assert.equal(result.triggeredNow, true)
  assert.equal(result.orbit, true)
}

// A ordem também pode ser aliado → jogador: continua sendo cooperação no mesmo alvo.
{
  const tracker = createDamageOrbitTracker()
  tracker.recordHit({ targetId: 'c', pilotId: 1, targetMaxHp: 20, now: 0 })
  const result = tracker.recordHit({ targetId: 'c', targetMaxHp: 20, now: 700 })
  assert.equal(result.orbit, true)
}

// Rajada do MESMO autor não conta como cooperação.
{
  const tracker = createDamageOrbitTracker()
  tracker.recordHit({ targetId: 'd', pilotId: 0, targetMaxHp: 20, now: 0 })
  assert.equal(tracker.recordHit({ targetId: 'd', pilotId: 0, targetMaxHp: 20, now: 100 }).orbit, false)
}

// Fora da janela, não arma.
{
  const tracker = createDamageOrbitTracker()
  tracker.recordHit({ targetId: 'e', targetMaxHp: 20, now: 0 })
  assert.equal(tracker.recordHit({ targetId: 'e', pilotId: 3, targetMaxHp: 20, now: 1001 }).orbit, false)
}

// Alvo com menos de 12 HP máximos nunca participa.
{
  const tracker = createDamageOrbitTracker()
  tracker.recordHit({ targetId: 'f', targetMaxHp: 11, now: 0 })
  const result = tracker.recordHit({ targetId: 'f', pilotId: 2, targetMaxHp: 11, now: 100 })
  assert.equal(result.eligible, false)
  assert.equal(result.orbit, false)
}

// Morte limpa a memória imediatamente; hits antigos não podem ressuscitar a órbita.
{
  const tracker = createDamageOrbitTracker()
  tracker.recordHit({ targetId: 'g', targetMaxHp: 30, now: 0 })
  assert.equal(tracker.recordHit({ targetId: 'g', pilotId: 1, targetMaxHp: 30, now: 100 }).orbit, true)
  const death = tracker.recordHit({ targetId: 'g', pilotId: 1, targetMaxHp: 30, killed: true, now: 150 })
  assert.equal(death.clearTarget, true)
  assert.equal(death.orbit, false)
  assert.equal(tracker.recordHit({ targetId: 'g', targetMaxHp: 30, now: 200 }).orbit, false)
}

console.log('damage-orbit-tracker.test.mjs: OK')
