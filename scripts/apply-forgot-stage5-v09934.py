from pathlib import Path

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding='utf-8')


def replace_once(path, old, new):
    text = read(path)
    if old not in text:
        raise RuntimeError(f'marker not found in {path}: {old[:180]!r}')
    write(path, text.replace(old, new, 1))


# ---------------------------------------------------------------------------
# Lock-on priority regression: exercises the real BASE/MIYU architecture, not a copied sorter.
# ---------------------------------------------------------------------------
write('src/lockon-priority.test.mjs', r'''import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createLockOnSystem } from './combat/lockon.js'

function makeHarness(entities, golden = []) {
  const scene = new THREE.Scene()
  for (const entity of [...entities, ...golden]) scene.add(entity.mesh)
  const rail = {
    getFrameAt: () => ({ forward: new THREE.Vector3(0, 0, 1) }),
  }
  const enemies = {
    getAlive: () => entities,
    getGoldenAlive: () => golden,
    getLockableRadius: () => 2,
  }
  return createLockOnSystem(rail, enemies)
}

function target(id, kind, maxHp, z = 45, x = 0) {
  const mesh = new THREE.Object3D()
  mesh.position.set(x, 0, z)
  return { id, kind, hp: maxHp, maxHp, mesh, dying: false, fadingOut: false }
}

const origin = new THREE.Vector3(0, 0, 0)
const direction = new THREE.Vector3(0, 0, 1)

// Boss tem prioridade absoluta mesmo contra alvo comum de HP maior.
{
  const heavy = target(2, 'tank', 999, 42)
  const boss = target(9, 'boss', 12, 48)
  const lockon = makeHarness([heavy, boss])
  lockon.sweepLockOn(origin, direction, 1, 1)
  const groups = lockon.takeLockedTargetGroups(() => true)
  assert.equal(groups.base.length, 1)
  assert.equal(groups.base[0], boss)
}

// Sem Boss, maior maxHp autoritativo vence; empate usa menor entity.id.
{
  const low = target(7, 'blaster', 20, 43)
  const high = target(8, 'tank', 80, 46)
  const lockon = makeHarness([low, high])
  lockon.sweepLockOn(origin, direction, 1, 1)
  assert.equal(lockon.takeLockedTargetGroups(() => true).base[0], high)
}
{
  const laterId = target(10, 'tank', 60, 44)
  const earlierId = target(3, 'tank', 60, 47)
  const lockon = makeHarness([laterId, earlierId])
  lockon.sweepLockOn(origin, direction, 1, 1)
  assert.equal(lockon.takeLockedTargetGroups(() => true).base[0], earlierId)
}

// BASE e MIYU preservam budgets independentes e podem apontar para o mesmo Boss.
{
  const boss = target(1, 'boss', 100, 50)
  const lockon = makeHarness([boss])
  lockon.sweepLockOn(origin, direction, 2, 1)
  const groups = lockon.takeLockedTargetGroups(() => true)
  assert.deepEqual(groups.base, [boss])
  assert.deepEqual(groups.miyu, [boss])
}

// Alvo em fade não participa da prioridade nem fica armazenado.
{
  const fadingBoss = target(1, 'boss', 100, 45)
  fadingBoss.fadingOut = true
  const live = target(2, 'blaster', 10, 45)
  const lockon = makeHarness([fadingBoss, live])
  lockon.sweepLockOn(origin, direction, 1, 1)
  assert.equal(lockon.takeLockedTargetGroups(() => true).base[0], live)
}

console.log('lockon-priority.test.mjs: priority + BASE/MIYU budgets OK')
''')

# ---------------------------------------------------------------------------
# Recreate the 10-point wingman bughunt as a regression suite on the reconciled code.
# Structural checks are limited to integration contracts that have no public runtime hook;
# target-readiness/navigation portions are exercised as real functions.
# ---------------------------------------------------------------------------
write('src/wingman-bughunt.test.mjs', r'''import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  isWingmanCombatTargetReady,
} from './combat/wingman-flight-stability.js'
import {
  WINGMAN_RAIL_CATCHUP_MAX_BONUS,
  computeRailCatchupBoost,
  computeRailLongitudinalLag,
  updateRailCatchupState,
  isFiniteWingmanPosition,
} from './combat/wingman-navigation.js'

const wingmen = readFileSync(new URL('./combat/wingmen.js', import.meta.url), 'utf8')
const combat = readFileSync(new URL('./combat/index.js', import.meta.url), 'utf8')
let passed = 0
function check(name, fn) {
  fn()
  passed += 1
  console.log(`  ok ${passed} - ${name}`)
}

check('Bug 1: snapshots de posição não expõem Vector3 mutável', () => {
  assert.match(wingmen, /getWingmanPositions:[\s\S]{0,180}mesh\.position\.clone\(\)/)
  assert.match(wingmen, /getVitalSnapshots:[\s\S]{0,260}worldPos: w\.mesh\.position\.clone\(\)/)
  assert.match(wingmen, /getDamageTargets:[\s\S]{0,260}worldPos: w\.mesh\.position\.clone\(\)/)
})

check('Bug 2: recovery substitui instância stale em retreat', () => {
  assert.match(wingmen, /staleIndex = activeWingmen\.findIndex\(\(w\) => w\.profile\.id === profileId && w\.state === 'retreating'\)/)
  assert.match(wingmen, /retreat-instance-replaced/)
})

check('Bug 3: getWingmanCount ignora retreating', () => {
  assert.match(wingmen, /getWingmanCount: \(\) => activeWingmen\.filter\(\(w\) => w\.state !== 'retreating'\)\.length/)
})

check('Bug 4: markWingmanDown acontece na entrada do retreat', () => {
  assert.match(combat, /if \(hit\?\.enteredRetreat\) player\.markWingmanDown\?\.\(profileId\)/)
})

check('Bug 5: retreat cancela rádio pendente do piloto', () => {
  assert.match(wingmen, /wingmanRadio\.cancelPendingResponse\?\.\('pilot-retreated'\)/)
  assert.match(wingmen, /pendingRadioMessages\[i\]\?\.pilotId === w\.profile\.id/)
})

check('Bug 6: retreat limpa escudo auxiliar e cor crítica', () => {
  assert.match(wingmen, /w\.auxShieldVisual\.visible = false/)
  assert.match(wingmen, /damageMaterials[\s\S]{0,220}color\.copy\(w\.damageColors\[i\]\)/)
})

check('Bug 7: Chain Ram pode usar pool pronto incluindo Dourado', () => {
  assert.match(wingmen, /if \(enemies && enemies\.getGoldenAlive\)/)
  assert.match(wingmen, /for \(const g of enemies\.getGoldenAlive\(\)\) if \(isWingmanCombatTargetReady\(g\)\) alive\.push\(g\)/)
  assert.match(wingmen, /FALCO_CHAIN_RADIUS/)
})

check('Bug 8: readiness rejeita spawn, fade e HP zero', () => {
  const mesh = { parent: {} }
  assert.equal(isWingmanCombatTargetReady({ mesh, hp: 2 }), true)
  assert.equal(isWingmanCombatTargetReady({ mesh, hp: 0 }), false)
  assert.equal(isWingmanCombatTargetReady({ mesh, hp: 2, fadingOut: true }), false)
  assert.equal(isWingmanCombatTargetReady({ mesh, hp: 2, spawnPhase: 'materialize' }), false)
  assert.equal(isWingmanCombatTargetReady({ mesh, hp: 2, spawnInvincibleTimer: 0.2 }), false)
})

check('Bug 9: clearSquadron reseta estado transitório', () => {
  const required = [
    "squadronCommandMode = 'free'",
    'squadronCommandDurationTimer = 0',
    'squadronCommandCooldownTimer = 0',
    'moraleDamageBonus = 0',
    'chargeHeldTimer = 0',
    'playerRollHistory.length = 0',
    'abilityCooldownMultByProfileId.fill(1)',
    'hasPreviousPlayerPosition = false',
  ]
  for (const marker of required) assert.ok(wingmen.includes(marker), `clearSquadron sem reset: ${marker}`)
})

check('Bug 10: navegação protege finitude, clamp e histerese', () => {
  assert.equal(isFiniteWingmanPosition({ x: 1, y: 2, z: 3 }), true)
  assert.equal(isFiniteWingmanPosition({ x: NaN, y: 2, z: 3 }), false)
  assert.equal(computeRailLongitudinalLag({ x: NaN, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { forward: { x: 0, y: 0, z: 1 } }), null)
  assert.equal(updateRailCatchupState(33, false), true)
  assert.equal(updateRailCatchupState(25, true), true)
  assert.equal(updateRailCatchupState(21, true), false)
  assert.equal(computeRailCatchupBoost(10000), WINGMAN_RAIL_CATCHUP_MAX_BONUS)
})

assert.equal(passed, 10)
console.log('wingman-bughunt.test.mjs: 10/10')
''')

# ---------------------------------------------------------------------------
# Deterministic state fuzz: thousands of random-but-reproducible states through the pure flight
# contracts. It complements (does not replace) the in-browser aiValidator playtest.
# ---------------------------------------------------------------------------
write('tools/state-fuzz-audit.mjs', r'''import {
  computeWingmanPairSeparation,
  WINGMAN_SEPARATION_PAIR_CORRECTION_CAP,
} from '../src/combat/wingman-formation-separation.js'
import {
  WINGMAN_RAIL_CATCHUP_MAX_BONUS,
  computeRailCatchupBoost,
  computeRailLongitudinalLag,
  updateRailCatchupState,
} from '../src/combat/wingman-navigation.js'
import {
  computeFormationMotionGain,
  computeWingmanArrivalScale,
} from '../src/combat/wingman-flight-stability.js'

let seed = 0x5a17c0de
function rnd() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed / 0x100000000
}
function span(min, max) { return min + (max - min) * rnd() }
function finiteVec(v) { return v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z) }

const failures = []
let checks = 0
function expect(description, condition, context = {}) {
  checks += 1
  if (!condition && failures.length < 100) failures.push({ description, context })
}

const frame = {
  right: { x: 1, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  forward: { x: 0, y: 0, z: 1 },
}
const slots = [
  { side: -11, up: 1, forward: 14 },
  { side: 12.5, up: -0.5, forward: 5 },
  { side: -12.5, up: -0.5, forward: 4 },
  { side: 11, up: 2.2, forward: 16 },
]

for (let i = 0; i < 6000; i += 1) {
  const aId = Math.floor(rnd() * 4)
  let bId = Math.floor(rnd() * 4)
  if (bId === aId) bId = (bId + 1) % 4
  const a = {
    id: aId,
    position: { x: span(-20, 20), y: span(-8, 8), z: span(-20, 20) },
    slot: slots[aId],
    retreating: rnd() < 0.03,
  }
  const b = {
    id: bId,
    position: rnd() < 0.08
      ? { ...a.position }
      : { x: span(-20, 20), y: span(-8, 8), z: span(-20, 20) },
    slot: slots[bId],
    retreating: rnd() < 0.03,
  }
  const sep = computeWingmanPairSeparation(a, b, frame, 7, 48)
  if (sep) {
    expect('pair separation finite', finiteVec(sep.pushA) && finiteVec(sep.pushB) && finiteVec(sep.correctionA) && finiteVec(sep.correctionB), { i, sep })
    expect('pair push symmetric', Math.abs(sep.pushA.x + sep.pushB.x) < 1e-9 && Math.abs(sep.pushA.y + sep.pushB.y) < 1e-9 && Math.abs(sep.pushA.z + sep.pushB.z) < 1e-9, { i, sep })
    const correctionMag = Math.hypot(sep.correctionA.x, sep.correctionA.y, sep.correctionA.z)
    expect('pair correction clamped', correctionMag <= WINGMAN_SEPARATION_PAIR_CORRECTION_CAP + 1e-9, { i, correctionMag })
  }

  const lag = span(-180, 420)
  const wasActive = rnd() < 0.5
  const active = updateRailCatchupState(lag, wasActive)
  const boost = active ? computeRailCatchupBoost(Math.max(lag, 32)) : 0
  expect('catchup boolean', typeof active === 'boolean', { i, lag, wasActive, active })
  expect('catchup boost finite/clamped', Number.isFinite(boost) && boost >= 0 && boost <= WINGMAN_RAIL_CATCHUP_MAX_BONUS, { i, lag, boost })

  const player = { x: span(-100, 100), y: span(-100, 100), z: span(-100, 100) }
  const wingman = { x: span(-100, 100), y: span(-100, 100), z: span(-100, 100) }
  const longitudinal = computeRailLongitudinalLag(wingman, player, frame)
  expect('longitudinal lag finite', Number.isFinite(longitudinal), { i, longitudinal })

  const arrival = computeWingmanArrivalScale(span(-5, 40))
  const motionGain = computeFormationMotionGain(span(-5, 80))
  expect('arrival scale normalized', Number.isFinite(arrival) && arrival >= 0 && arrival <= 1, { i, arrival })
  expect('motion gain normalized', Number.isFinite(motionGain) && motionGain >= 0 && motionGain <= 1, { i, motionGain })
}

const report = {
  seed: '0x5a17c0de',
  iterations: 6000,
  verificacoes: checks,
  falhas: failures.length,
  expectativas_falhas: failures,
}
console.log(JSON.stringify(report, null, 2))
if (failures.length) process.exitCode = 1
''')

# Navigation suite: make the hysteresis contract explicit alongside existing clamp tests.
replace_once(
    'src/wingman-navigation.test.mjs',
    "  computeRailLongitudinalLag,\n  isFiniteWingmanPosition,\n",
    "  computeRailLongitudinalLag,\n  updateRailCatchupState,\n  WINGMAN_RAIL_CATCHUP_RELEASE,\n  isFiniteWingmanPosition,\n",
)
replace_once(
    'src/wingman-navigation.test.mjs',
    "assert.equal(computeRailCatchupBoost(999), WINGMAN_RAIL_CATCHUP_MAX_BONUS)\n\n",
    "assert.equal(computeRailCatchupBoost(999), WINGMAN_RAIL_CATCHUP_MAX_BONUS)\n"
    "assert.equal(updateRailCatchupState(WINGMAN_RAIL_CATCHUP_START + 1, false), true, 'catch-up deve iniciar acima do threshold de entrada')\n"
    "assert.equal(updateRailCatchupState(WINGMAN_RAIL_CATCHUP_RELEASE + 1, true), true, 'histerese deve manter catch-up entre release e start')\n"
    "assert.equal(updateRailCatchupState(WINGMAN_RAIL_CATCHUP_RELEASE - 1, true), false, 'catch-up deve soltar só abaixo do threshold de release')\n\n",
)

# All forgotten regression suites become part of the canonical selftest, not only CI sidecars.
replace_once(
    'src/selftest.mjs',
    "import './tank.test.mjs'\nimport './forgot-stage2.test.mjs'\n",
    "import './tank.test.mjs'\n"
    "import './forgot-stage2.test.mjs'\n"
    "import './forgot-stage3.test.mjs'\n"
    "import './forgot-stage4.test.mjs'\n"
    "import './lockon-priority.test.mjs'\n"
    "import './wingman-bughunt.test.mjs'\n",
)

print('forgot stage 5 validation migration applied')
