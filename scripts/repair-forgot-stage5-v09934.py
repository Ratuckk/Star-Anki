from pathlib import Path

path = Path('src/wingman-bughunt.test.mjs')
text = path.read_text(encoding='utf-8')
old = r'''check('Bug 1: snapshots de posição não expõem Vector3 mutável', () => {
  assert.match(wingmen, /getWingmanPositions:[\s\S]{0,180}mesh\.position\.clone\(\)/)
  assert.match(wingmen, /getVitalSnapshots:[\s\S]{0,260}worldPos: w\.mesh\.position\.clone\(\)/)
  assert.match(wingmen, /getDamageTargets:[\s\S]{0,260}worldPos: w\.mesh\.position\.clone\(\)/)
})
'''
new = r'''check('Bug 1: snapshots de posição não expõem Vector3 mutável', () => {
  const positionsStart = wingmen.indexOf('getWingmanPositions:')
  const damageTargetsStart = wingmen.indexOf('getDamageTargets:', positionsStart)
  const vitalsStart = wingmen.indexOf('getVitalSnapshots:', damageTargetsStart)
  const damageApplyStart = wingmen.indexOf('applyDamageToWingman,', vitalsStart)
  assert.ok(positionsStart >= 0 && damageTargetsStart > positionsStart && vitalsStart > damageTargetsStart && damageApplyStart > vitalsStart)
  const positionsBlock = wingmen.slice(positionsStart, damageTargetsStart)
  const damageTargetsBlock = wingmen.slice(damageTargetsStart, vitalsStart)
  const vitalsBlock = wingmen.slice(vitalsStart, damageApplyStart)
  assert.ok(positionsBlock.includes('w.mesh.position.clone()'), 'getWingmanPositions precisa clonar posição')
  assert.ok(damageTargetsBlock.includes('worldPos: w.mesh.position.clone()'), 'getDamageTargets precisa clonar posição')
  assert.ok(vitalsBlock.includes('worldPos: w.mesh.position.clone()'), 'getVitalSnapshots precisa clonar posição')
})
'''
if old not in text:
    raise RuntimeError('old Bug 1 block not found after stage5 migration')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('forgot stage 5 brittle anchors repaired')
