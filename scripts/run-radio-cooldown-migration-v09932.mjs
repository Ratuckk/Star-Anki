import { readFileSync, writeFileSync } from 'node:fs'

const sourcePath = 'scripts/apply-radio-cooldown-miyu-v09932.mjs'
const fixedPath = 'scripts/.apply-radio-cooldown-miyu-v09932-fixed.mjs'
let source = readFileSync(sourcePath, 'utf8')
source = source
  .replaceAll('`ability_assist`', "'ability_assist'")
  .replaceAll('`getLockedEnemySnapshots()`', "'getLockedEnemySnapshots()'")
writeFileSync(fixedPath, source)
await import(new URL('../' + fixedPath, import.meta.url))
