from pathlib import Path


def patch_file(path, replacements):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    for old, new in replacements:
        if old not in text:
            raise RuntimeError(f'repair marker missing in {path}: {old[:100]!r}')
        text = text.replace(old, new, 1)
    p.write_text(text, encoding='utf-8')

patch_file('scripts/apply-forgot-core-v09934.py', [
    (
        "sub_once('src/enemies/index.js', r\"case TANK_KIND:\\\\s*return BLASTER_KILL_BONUS\", \"case TANK_KIND: return TANK_KILL_BONUS\")",
        "replace_once('src/enemies/index.js',\n\"\"\"    if (kind === BLASTER_KIND || kind === TANK_KIND) return BLASTER_KILL_BONUS\n\"\"\",\n\"\"\"    if (kind === TANK_KIND) return TANK_KILL_BONUS\n    if (kind === BLASTER_KIND) return BLASTER_KILL_BONUS\n\"\"\")"
    ),
    (
        "replace_once('src/combat/projectiles.js',\n\"\"\"const SWIRL_BLAST_DAMAGE = 6\n\"\"\",\n\"\"\"const SWIRL_BLAST_DAMAGE = 6\nconst SWIRL_PROJECTILE_RADIUS = 3.0\nconst SWIRL_BOSS_HP_RATIO = 0.25\nconst SWIRL_TRAIL_SPACING = 3.2\nconst SWIRL_TRAIL_EMISSIONS_PER_FRAME_CAP = 14\n\"\"\")",
        "sub_once('src/combat/projectiles.js', r\"const SWIRL_BLAST_DAMAGE = 6\\s*//[^\\n]*\\n\", \"const SWIRL_BLAST_DAMAGE = 6      // dano base por alvo comum\\nconst SWIRL_PROJECTILE_RADIUS = 3.0\\nconst SWIRL_BOSS_HP_RATIO = 0.25\\nconst SWIRL_TRAIL_SPACING = 3.2\\nconst SWIRL_TRAIL_EMISSIONS_PER_FRAME_CAP = 14\\n\")"
    ),
])

patch_file('scripts/apply-forgot-wingmen-v09934.py', [
    (
        "\"\"\"export const WINGMAN_RAIL_CATCHUP_START_DISTANCE = 32\nexport const WINGMAN_RAIL_CATCHUP_FULL_DISTANCE = 120\nexport const WINGMAN_RAIL_CATCHUP_MAX_BONUS = 72\n\"\"\",\n\"\"\"export const WINGMAN_RAIL_CATCHUP_START_DISTANCE = 32\nexport const WINGMAN_RAIL_CATCHUP_RELEASE_DISTANCE = 22\nexport const WINGMAN_RAIL_CATCHUP_FULL_DISTANCE = 120\nexport const WINGMAN_RAIL_CATCHUP_MAX_BONUS = 72\n\"\"\"",
        "\"\"\"export const WINGMAN_RAIL_CATCHUP_START = 32\nexport const WINGMAN_RAIL_CATCHUP_FULL = 120\nexport const WINGMAN_RAIL_CATCHUP_MAX_BONUS = 72\n\"\"\",\n\"\"\"export const WINGMAN_RAIL_CATCHUP_START = 32\nexport const WINGMAN_RAIL_CATCHUP_RELEASE = 22\nexport const WINGMAN_RAIL_CATCHUP_FULL = 120\nexport const WINGMAN_RAIL_CATCHUP_MAX_BONUS = 72\n\"\"\""
    ),
    (
        "if (wasActive) return longitudinalLag > WINGMAN_RAIL_CATCHUP_RELEASE_DISTANCE\n  return longitudinalLag > WINGMAN_RAIL_CATCHUP_START_DISTANCE",
        "if (wasActive) return longitudinalLag > WINGMAN_RAIL_CATCHUP_RELEASE\n  return longitudinalLag > WINGMAN_RAIL_CATCHUP_START"
    ),
    (
        "\"\"\"  return WINGMAN_RAIL_CATCHUP_MAX_BONUS * smoothstep01(t)\n\"\"\",\n\"\"\"  return Math.min(WINGMAN_RAIL_CATCHUP_MAX_BONUS, WINGMAN_RAIL_CATCHUP_MAX_BONUS * smoothstep01(t))\n\"\"\")",
        "\"\"\"  return WINGMAN_RAIL_CATCHUP_MAX_BONUS * t\n\"\"\",\n\"\"\"  return Math.min(WINGMAN_RAIL_CATCHUP_MAX_BONUS, WINGMAN_RAIL_CATCHUP_MAX_BONUS * t)\n\"\"\")"
    ),
])

print('forgot migrators repaired for current main anchors')
