import { readFileSync, writeFileSync } from 'node:fs'

function patch(path, from, to, label) {
  const src = readFileSync(path, 'utf8')
  if (src.includes(to)) return
  if (!src.includes(from)) throw new Error(`${path}: trecho ausente (${label})`)
  writeFileSync(path, src.replace(from, to))
}

patch(
  'src/combat/wingman-flight-stability.js',
  `export function isWingmanCombatTargetReady(target, readyTargets = null) {\n  if (!target || target.dying || target.fadingOut || !target.mesh || !target.mesh.parent) return false\n  if (readyTargets && !readyTargets.has(target)) return false\n  return true\n}\n`,
  `export function isWingmanCombatTargetReady(target, readyTargets = null) {\n  if (!target || target.dying || target.fadingOut || !target.mesh || !target.mesh.parent) return false\n  // Alguns inimigos já possuem mesh durante a apresentação de spawn, mas ainda estão invulneráveis.\n  // Para IA de Wingman isso continua sendo "não surgiu": não pode virar alvo até o timer zerar.\n  if (Number.isFinite(target.spawnInvincibleTimer) && target.spawnInvincibleTimer > 0) return false\n  if (readyTargets && !readyTargets.has(target)) return false\n  return true\n}\n`,
  'spawn invincibility',
)

patch(
  'src/combat/wingmen.js',
  `  function getAliveEnemies() {\n    const alive = []\n    if (enemies && enemies.getAlive) {\n      for (const e of enemies.getAlive()) if (!e.dying && e.mesh) alive.push(e)\n    }\n    if (enemies && enemies.getGoldenAlive) {\n      for (const g of enemies.getGoldenAlive()) if (!g.dying && g.mesh) alive.push(g)\n    }\n    return alive\n  }\n`,
  `  function getAliveEnemies() {\n    const alive = []\n    if (enemies && enemies.getAlive) {\n      for (const e of enemies.getAlive()) if (isWingmanCombatTargetReady(e)) alive.push(e)\n    }\n    if (enemies && enemies.getGoldenAlive) {\n      for (const g of enemies.getGoldenAlive()) if (isWingmanCombatTargetReady(g)) alive.push(g)\n    }\n    return alive\n  }\n`,
  'getAliveEnemies gameplay-ready',
)

patch(
  'src/combat/wingmen.js',
  `            squadronFocusTargets = squadronFocusTargets.filter((t) => t && !t.dying && t.mesh)\n`,
  `            squadronFocusTargets = squadronFocusTargets.filter((t) => isWingmanCombatTargetReady(t, readyCombatTargets))\n`,
  'focus target cleanup',
)

patch(
  'src/wingman-flight-stability.test.mjs',
  `assert.equal(isWingmanCombatTargetReady({ ...ready, fadingOut: true }, null), false)\nassert.equal(isWingmanCombatTargetReady({ ...ready, mesh: { parent: null } }, null), false)\n`,
  `assert.equal(isWingmanCombatTargetReady({ ...ready, fadingOut: true }, null), false)\nassert.equal(isWingmanCombatTargetReady({ ...ready, spawnInvincibleTimer: .2 }, null), false, 'spawn ainda invulnerável não pode virar alvo')\nassert.equal(isWingmanCombatTargetReady({ ...ready, mesh: { parent: null } }, null), false)\n`,
  'target spawn test',
)

console.log('apply-post-merge-v09930-followup.mjs: OK')
