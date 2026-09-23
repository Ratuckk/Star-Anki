from pathlib import Path
import re


def patch_file(path, replacements):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    for old, new in replacements:
        if new in text:
            continue
        if old not in text:
            raise RuntimeError(f'repair marker missing in {path}: {old[:120]!r}')
        text = text.replace(old, new, 1)
    p.write_text(text, encoding='utf-8')


def regex_patch(path, pattern, replacement):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    out, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f'repair regex missing in {path}: {pattern[:120]!r}')
    p.write_text(out, encoding='utf-8')


# The migration scripts were drafted against an earlier local snapshot. Normalize only their
# textual anchors to the current main; do not change the intended mechanics here.
patch_file('scripts/apply-forgot-core-v09934.py', [
    (
        '''sub_once('src/enemies/index.js', r"case TANK_KIND:\\s*return BLASTER_KILL_BONUS", "case TANK_KIND: return TANK_KILL_BONUS")''',
        '''replace_once('src/enemies/index.js',
"""    if (kind === BLASTER_KIND || kind === TANK_KIND) return BLASTER_KILL_BONUS\n""",
"""    if (kind === TANK_KIND) return TANK_KILL_BONUS\n    if (kind === BLASTER_KIND) return BLASTER_KILL_BONUS\n""")''',
    ),
    (
        '''replace_once('src/combat/projectiles.js',
"""const SWIRL_BLAST_DAMAGE = 6\n""",
"""const SWIRL_BLAST_DAMAGE = 6\nconst SWIRL_PROJECTILE_RADIUS = 3.0\nconst SWIRL_BOSS_HP_RATIO = 0.25\nconst SWIRL_TRAIL_SPACING = 3.2\nconst SWIRL_TRAIL_EMISSIONS_PER_FRAME_CAP = 14\n""")''',
        '''sub_once('src/combat/projectiles.js', r"const SWIRL_BLAST_DAMAGE = 6\\s*//[^\\n]*\\n", "const SWIRL_BLAST_DAMAGE = 6      // dano base por alvo comum\\nconst SWIRL_PROJECTILE_RADIUS = 3.0\\nconst SWIRL_BOSS_HP_RATIO = 0.25\\nconst SWIRL_TRAIL_SPACING = 3.2\\nconst SWIRL_TRAIL_EMISSIONS_PER_FRAME_CAP = 14\\n")''',
    ),
])

# The old player block referenced names from a pre-refactor player implementation. A dedicated
# integration migrator adds the channel-aware method using current shield/session state instead.
regex_patch(
    'scripts/apply-forgot-core-v09934.py',
    r"# ---------------------------------------------------------------------------\n# Player: explicit shield-vs-hull damage contract.*?(?=# ---------------------------------------------------------------------------\n# Golden Swirl collision)",
    "# Player channel-aware damage is applied by apply-forgot-integration-v09934.py.\n\n",
)

patch_file('scripts/apply-forgot-wingmen-v09934.py', [
    (
        '''"""export const WINGMAN_RAIL_CATCHUP_START_DISTANCE = 32\nexport const WINGMAN_RAIL_CATCHUP_FULL_DISTANCE = 120\nexport const WINGMAN_RAIL_CATCHUP_MAX_BONUS = 72\n""",
"""export const WINGMAN_RAIL_CATCHUP_START_DISTANCE = 32\nexport const WINGMAN_RAIL_CATCHUP_RELEASE_DISTANCE = 22\nexport const WINGMAN_RAIL_CATCHUP_FULL_DISTANCE = 120\nexport const WINGMAN_RAIL_CATCHUP_MAX_BONUS = 72\n"""''',
        '''"""export const WINGMAN_RAIL_CATCHUP_START = 32\nexport const WINGMAN_RAIL_CATCHUP_FULL = 120\nexport const WINGMAN_RAIL_CATCHUP_MAX_BONUS = 72\n""",
"""export const WINGMAN_RAIL_CATCHUP_START = 32\nexport const WINGMAN_RAIL_CATCHUP_RELEASE = 22\nexport const WINGMAN_RAIL_CATCHUP_FULL = 120\nexport const WINGMAN_RAIL_CATCHUP_MAX_BONUS = 72\n"""''',
    ),
    (
        'if (wasActive) return longitudinalLag > WINGMAN_RAIL_CATCHUP_RELEASE_DISTANCE\n  return longitudinalLag > WINGMAN_RAIL_CATCHUP_START_DISTANCE',
        'if (wasActive) return longitudinalLag > WINGMAN_RAIL_CATCHUP_RELEASE\n  return longitudinalLag > WINGMAN_RAIL_CATCHUP_START',
    ),
    (
        '''"""  return WINGMAN_RAIL_CATCHUP_MAX_BONUS * smoothstep01(t)\n""",
"""  return Math.min(WINGMAN_RAIL_CATCHUP_MAX_BONUS, WINGMAN_RAIL_CATCHUP_MAX_BONUS * smoothstep01(t))\n""")''',
        '''"""  return WINGMAN_RAIL_CATCHUP_MAX_BONUS * t\n""",
"""  return Math.min(WINGMAN_RAIL_CATCHUP_MAX_BONUS, WINGMAN_RAIL_CATCHUP_MAX_BONUS * t)\n""")''',
    ),
    (
        '''replace_once('src/combat/wingmen.js',
"""        member.mesh.position.add(member.separationCorrection)\n""",
"""        member.mesh.position.add(member.separationCorrection)\n        // Formation attraction yields for this frame while physical depenetration is active.\n        member.separationYield = Math.min(0.65, correctionLength / 2.5)\n""")''',
        '''replace_once('src/combat/wingmen.js',
"""      if (member.separationCorrection.lengthSq() > 0) member.mesh.position.add(member.separationCorrection)\n""",
"""      if (member.separationCorrection.lengthSq() > 0) {\n        member.mesh.position.add(member.separationCorrection)\n        // Formation attraction yields for this frame while physical depenetration is active.\n        member.separationYield = Math.min(0.65, correctionLength / 2.5)\n      }\n""")''',
    ),
    (
        '''"""      activeSeparationPairs.clear()\n      closeSeparationSince.clear()\n      reportedFormationClumps.clear()\n"""''',
        '''"""    activeSeparationPairs.clear()\n    closeSeparationSince.clear()\n    reportedFormationClumps.clear()\n"""''',
    ),
])

print('forgot migrators repaired for current main anchors')
