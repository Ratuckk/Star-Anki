import assert from 'node:assert/strict'
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
