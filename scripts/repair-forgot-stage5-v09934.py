from pathlib import Path

# Runtime fix for Bug 1: HUD projection must never mutate the authoritative ship position.
wingmen_path = Path('src/combat/wingmen.js')
wingmen = wingmen_path.read_text(encoding='utf-8')
old_runtime = "      id: w.profile.id, name: w.profile.name, color: w.profile.color, worldPos: w.mesh.position,\n"
new_runtime = "      id: w.profile.id, name: w.profile.name, color: w.profile.color, worldPos: w.mesh.position.clone(),\n"
if old_runtime not in wingmen:
    if new_runtime not in wingmen:
        raise RuntimeError('getVitalSnapshots worldPos anchor not found')
else:
    wingmen_path.write_text(wingmen.replace(old_runtime, new_runtime, 1), encoding='utf-8')

# Generated regression test: scope source assertions to their API blocks instead of arbitrary
# character limits, so formatting/comments do not create false negatives.
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
print('forgot stage 5 runtime + assertion anchors repaired')
