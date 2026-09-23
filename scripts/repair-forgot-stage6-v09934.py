from pathlib import Path

path = Path('src/enemy-supercheck.test.mjs')
text = path.read_text(encoding='utf-8')

old_pierce = 'resolvePiercingHit(prevPos, currPos'
new_pierce = 'resolvePiercingProjectileHits(prevPos, currPos'
if old_pierce not in text:
    raise RuntimeError('old piercing test marker not found')
text = text.replace(old_pierce, new_pierce)

old_swirl = "const swirl = block(projectilesSrc, 'if (projectile.isPiercing && projectile.swirlHomingTarget)', '// ============================================================\\n      // MOVIMENTO')"
new_swirl = "const swirl = block(projectilesSrc, 'if (projectile.isPiercing && projectile.swirlHomingTarget)', 'if (projectile.life != null)')"
if old_swirl not in text:
    raise RuntimeError('old swirl test end marker not found')
text = text.replace(old_swirl, new_swirl)

path.write_text(text, encoding='utf-8')
print('enemy supercheck source markers repaired')
