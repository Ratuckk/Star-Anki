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


write('src/enemy-supercheck.test.mjs', r'''import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { resolveGateHit } from './enemies/sentinela.js'
import { tankShouldLeaveAfterCycle } from './enemies/tank.js'
import { severChainAt, VERME_KIND } from './enemies/verme.js'
import { IMA_FIELD_RADIUS, IMA_FIELD_STRENGTH } from './enemies/ima.js'

const enemiesSrc = readFileSync(new URL('./enemies/index.js', import.meta.url), 'utf8')
const projectilesSrc = readFileSync(new URL('./combat/projectiles.js', import.meta.url), 'utf8')
const gameLoopSrc = readFileSync(new URL('./game-loop.js', import.meta.url), 'utf8')
const goldenSrc = readFileSync(new URL('./enemies/golden.js', import.meta.url), 'utf8')
const tankSrc = readFileSync(new URL('./enemies/tank.js', import.meta.url), 'utf8')
const vermeSrc = readFileSync(new URL('./enemies/verme.js', import.meta.url), 'utf8')
const imaSrc = readFileSync(new URL('./enemies/ima.js', import.meta.url), 'utf8')

function block(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  assert.ok(start >= 0, `marker inicial ausente: ${startMarker}`)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.ok(end > start, `marker final ausente: ${endMarker}`)
  return source.slice(start, end)
}

let passed = 0
function check(name, fn) {
  fn()
  passed += 1
  console.log(`  ok ${passed} - ${name}`)
}

check('#1 Boss bloqueia dano na origem durante transition', () => {
  const area = block(enemiesSrc, 'applyAreaDamage(center, radius, damage)', '// colisão dos tiros do JOGADOR')
  assert.ok(area.indexOf('if (e.kind === BOSS_KIND && e.transitioning) continue') < area.indexOf('e.hp -= damage'))

  const direct = block(enemiesSrc, 'resolveProjectileHit(prevPos, currPos', 'resolvePiercingHit(prevPos, currPos')
  assert.ok(direct.indexOf('enemyHit.kind === BOSS_KIND && enemyHit.transitioning') < direct.indexOf('enemyHit.hp -= damage'))

  const piercing = block(enemiesSrc, 'resolvePiercingHit(prevPos, currPos', 'getEnemyCount()')
  assert.ok(piercing.indexOf('enemyHit.kind === BOSS_KIND && enemyHit.transitioning') < piercing.indexOf('enemyHit.hp -= appliedDamage'))

  const ram = block(enemiesSrc, 'function updateEnemies(', 'function updateEnemyProjectiles(')
  assert.ok(ram.indexOf('enemy.kind === BOSS_KIND && enemy.transitioning') < ram.indexOf('enemy.hp -= ramDamage'))
})

check('#2 Squadron.remaining tem guarda idempotente central', () => {
  const accounting = block(enemiesSrc, 'function accountSquadronExit(', 'function removeEnemy(')
  assert.ok(accounting.includes('e.squadronExitAccounted'))
  assert.ok(accounting.indexOf('e.squadronExitAccounted = true') < accounting.indexOf('sq.remaining = Math.max(0, sq.remaining - 1)'))
  const removal = block(enemiesSrc, 'function removeEnemy(', '// ============ DESPAWN COM FADE-OUT')
  assert.ok(removal.includes('accountSquadronExit(e, false)'))
})

check('#3 spawn pendente não participa de gameplay', () => {
  const update = block(enemiesSrc, 'function updateEnemies(', 'function updateEnemyProjectiles(')
  assert.ok(update.includes('updateSpawnAnimation(enemy, dt)'))
  assert.ok(update.includes('if (isEnemySpawnPending(enemy)) continue'))
  assert.ok(enemiesSrc.includes('!isEnemySpawnPending(e)'))
})

check('#4 material de spawn é isolado e liberado', () => {
  assert.ok(enemiesSrc.includes('isolateSpawnMaterial'))
  assert.ok(enemiesSrc.includes('releaseSpawnMaterial(e)'))
  assert.ok(enemiesSrc.includes('releaseSpawnMaterial(enemy)'))
})

check('#5 Sentinela preserva 2 casco / 4 escudo até a resolução', () => {
  const gate = {
    mesh: { position: new THREE.Vector3(0, 0, 0) },
    right: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    apertureHalf: 0,
    outerHalf: 6.4,
    damage: 2,
    shieldDamage: 4,
  }
  const result = resolveGateHit(gate, new THREE.Vector3(0, 0, 0))
  assert.deepEqual(result, { hit: true, hullDamage: 2, shieldDamage: 4 })
  const channel = block(enemiesSrc, 'function updateEnemyGates(', '// ============ OVERHAUL DE SPAWN')
  assert.ok(channel.includes('shieldDamage = Math.max(shieldDamage, gateHit.shieldDamage || 0)'))
  assert.ok(channel.includes('hullDamage = Math.max(hullDamage, gateHit.hullDamage || 0)'))
})

check('#6 Sussurro usa dificuldade atual + registerSpawn', () => {
  const update = block(enemiesSrc, 'if (enemy.kind === SUSSURRO_KIND)', 'const relative = _enemyRel.copy')
  assert.ok(update.includes('const summonLevel = currentDifficultyLevel()'))
  assert.ok(update.includes('spawnBlaster(scene, rail, nextEnemyId++, { level: summonLevel })'))
  assert.ok(update.includes('registerSpawn(reinforcement)'))
})

check('#7 homing e Swirl abandonam alvo em fadingOut', () => {
  const homing = block(projectilesSrc, 'if (projectile.homingTarget)', '} else if (aimDirection')
  assert.ok(homing.includes('projectile.homingTarget.fadingOut'))
  assert.ok(homing.includes('projectile.homingTarget = null'))
  const swirl = block(projectilesSrc, 'if (projectile.isPiercing && projectile.swirlHomingTarget)', '// ============================================================\n      // MOVIMENTO')
  assert.ok(swirl.includes('projectile.swirlHomingTarget.fadingOut'))
  assert.ok(swirl.includes('projectile.swirlHomingTarget = null'))
})

check('#8 Enxame-Ímã não mantém campo durante fade', () => {
  const magnet = block(enemiesSrc, 'getMagnetSources: () =>', 'spawnBossEnemy(')
  assert.ok(magnet.includes('!e.fadingOut'))
  assert.ok(magnet.includes('!isEnemySpawnPending(e)'))
})

check('#9 wobble é render-only e restaurado em finally', () => {
  const renderTail = block(gameLoopSrc, 'combat.applySpawnWobbles?.()', 'function tick(now)')
  assert.ok(renderTail.includes('try {'))
  assert.ok(renderTail.includes('renderer.render(scene, camera)'))
  assert.ok(renderTail.includes('finally {'))
  assert.ok(renderTail.includes('combat.restoreSpawnWobbles?.()'))
  const restore = block(enemiesSrc, 'restoreSpawnWobbles()', 'applySpawnWobbles()')
  assert.ok(restore.includes('e.mesh.position.sub(e.renderWobbleOffset)'))
})

check('#10 mini-naves do Dourado orientam quaternion por direção unitária', () => {
  const projectileUpdate = block(enemiesSrc, 'function updateEnemyProjectiles(', 'function updateEnemyLasers(')
  assert.ok(projectileUpdate.includes('_epVelNorm.normalize()'))
  assert.ok(projectileUpdate.includes('projectile.velocity.copy(_epVelNorm).multiplyScalar(GOLDEN_MINION_SPEED)'))
  assert.ok(projectileUpdate.includes('projectile.mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, _epVelNorm)'))
})

check('#11 projéteis inimigos usam swept collision', () => {
  const projectileUpdate = block(enemiesSrc, 'function updateEnemyProjectiles(', 'function updateEnemyLasers(')
  assert.ok(projectileUpdate.includes('_epPrevPos.copy(projectile.mesh.position)'))
  assert.ok(projectileUpdate.includes('distanceToSegment(target.worldPos, _epPrevPos, projectile.mesh.position)'))
  assert.ok(projectileUpdate.includes('distanceToSegment(pt.worldPos, _epPrevPos, projectile.mesh.position)'))
})

check('#12 Enxame-Ímã está recalibrado para tiro atual', () => {
  assert.ok(projectilesSrc.includes('const PROJECTILE_SPEED = 260'))
  assert.equal(IMA_FIELD_RADIUS, 15)
  assert.equal(IMA_FIELD_STRENGTH, 1100)
  assert.match(imaSrc, /velocidade atual do tiro normal \(260u\/s\)/)
})

check('#13 Boss não dispara volley normal durante transition', () => {
  const firing = block(enemiesSrc, 'if (enemy.fireTimer <= 0 && inFireRange)', 'if (enemy.kind === BOSS_KIND) updateBossLaser')
  assert.ok(firing.includes('if (!enemy.transitioning) fireBossVolley(enemy, playerPosition, projectileCtx)'))
})

check('#14 Tank não entra em disengage por ciclo na arena e, se entrar, afasta', () => {
  assert.equal(tankShouldLeaveAfterCycle(999, true), false)
  assert.equal(tankShouldLeaveAfterCycle(3, false), true)
  const disengage = block(tankSrc, '[ENEMY_STATES.DISENGAGING]:', 'export function spawnTankEnemy')
  assert.ok(disengage.includes('leaveMovement(enemy, dt, ctx)'))
  const leave = block(tankSrc, 'function leaveMovement(', 'const TANK_STATES')
  assert.ok(leave.includes('if (ctx.inArena)'))
  assert.ok(leave.includes('_away.copy(enemy.mesh.position).sub(ctx.playerPosition)'))
})

check('#15 severChainAt é idempotente', () => {
  const dead = { kind: VERME_KIND, chainSevered: false, mesh: null }
  const next = {
    kind: VERME_KIND,
    dying: false,
    followTarget: dead,
    mesh: { position: new THREE.Vector3(3, 2, 8) },
  }
  const rail = {
    getSpawnFrame: () => ({
      position: new THREE.Vector3(0, 0, 0),
      right: new THREE.Vector3(1, 0, 0),
      up: new THREE.Vector3(0, 1, 0),
      forward: new THREE.Vector3(0, 0, 1),
    }),
  }
  assert.equal(severChainAt(dead, [dead, next], rail), true)
  assert.equal(next.followTarget, null)
  assert.equal(severChainAt(dead, [dead, next], rail), false)
  assert.match(vermeSrc, /deadSegment\.chainSevered/)
})

assert.equal(passed, 15)
console.log('enemy-supercheck.test.mjs: 15/15 contracts covered')
''')

replace_once(
    'src/selftest.mjs',
    "import './wingman-bughunt.test.mjs'\n",
    "import './wingman-bughunt.test.mjs'\nimport './enemy-supercheck.test.mjs'\n",
)

print('enemy supercheck regression suite applied')
