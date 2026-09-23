from pathlib import Path

path = Path('src/enemy-supercheck.test.mjs')
text = path.read_text(encoding='utf-8')
old = 'resolvePiercingHit(prevPos, currPos'
new = 'resolvePiercingProjectileHits(prevPos, currPos'
if old not in text:
    raise RuntimeError('old piercing test marker not found')
path.write_text(text.replace(old, new), encoding='utf-8')
print('enemy supercheck piercing marker repaired')
