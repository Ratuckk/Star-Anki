import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LOCK_SOURCE_BASE, LOCK_SOURCE_MIYU, computeLockBudgets, sourceCanLockEntity } from './combat/miyu-assist-lock-budget.js'

assert.deepStrictEqual(computeLockBudgets(4, 4), { base: 4, miyu: 0 })
assert.deepStrictEqual(computeLockBudgets(5, 4), { base: 4, miyu: 1 })
assert.deepStrictEqual(computeLockBudgets(8, 4), { base: 4, miyu: 4 })
assert.deepStrictEqual(computeLockBudgets(3, 4), { base: 3, miyu: 0 })
assert.strictEqual(sourceCanLockEntity(LOCK_SOURCE_BASE, 1, 1), false, 'comum: segundo BASE bloqueado')
assert.strictEqual(sourceCanLockEntity(LOCK_SOURCE_BASE, 1, 2), true, 'Horda: segundo BASE permitido')
assert.strictEqual(sourceCanLockEntity(LOCK_SOURCE_MIYU, 1, 1), true, 'Miyu repete em comum')
assert.strictEqual(sourceCanLockEntity(LOCK_SOURCE_MIYU, 20, 1), true, 'Miyu ignora teto por entidade')

const lockon = readFileSync(new URL('./combat/lockon.js', import.meta.url), 'utf8')
assert.ok(lockon.includes('computeLockBudgets(maxAllowed, baseMaxAllowed)'))
assert.ok(lockon.includes('source: LOCK_SOURCE_MIYU'))
assert.ok(lockon.includes('triangular-lock-acquired'))
assert.ok(lockon.includes('takeLockedTargetGroups(inRange)'))

const projectiles = readFileSync(new URL('./combat/projectiles.js', import.meta.url), 'utf8')
assert.ok(projectiles.includes('const locked = lockedGroups.base'))
assert.ok(projectiles.includes('const miyuTargets = lockedGroups.miyu'))
assert.ok(projectiles.includes('player.config.homingMaxTargets'))

const wingmen = readFileSync(new URL('./combat/wingmen.js', import.meta.url), 'utf8')
const assistStart = wingmen.indexOf('function fireMiyuAssistShots')
const assistEnd = wingmen.indexOf('function fireMiyuBoombuster', assistStart)
const assistBlock = wingmen.slice(assistStart, assistEnd)
assert.ok(assistBlock.includes('for (const target of miyuTargets)'))
assert.ok(assistBlock.includes('homingTarget: target'))
assert.ok(assistBlock.includes('MIYU_CHARGED_SHOT_COLOR'))
assert.ok(!assistBlock.includes('slice(Math.max(0, baseMaxTargets))'))

const orchestrator = readFileSync(new URL('./combat/index.js', import.meta.url), 'utf8')
assert.ok(orchestrator.includes('shotResult?.miyuTargets'))
assert.ok(orchestrator.includes('squadron.fireMiyuAssistShots?.(miyuTargets)'))
console.log('miyu-assist-locks.test.mjs: OK')
