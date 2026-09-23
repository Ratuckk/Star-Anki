from pathlib import Path

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(path, old, new):
    text = read(path)
    if old not in text:
        raise RuntimeError(f'marker not found in {path}: {old[:180]!r}')
    write(path, text.replace(old, new, 1))


# ---------------------------------------------------------------------------
# Fog bank -> spawn bridge. The bank model remains visual-only; this helper simply samples the
# same periodic field at the enemy's forward spawn position, so condensation appears where a
# visible bank actually exists instead of around every spawn in empty space.
# ---------------------------------------------------------------------------
replace_once(
    'src/fog-visual-model.js',
    "export function nextFogBankOffsets(distance, count = 3) {\n",
    "export function fogSpawnStrengthAtOffset(distance, forwardOffset = 0) {\n"
    "  const ahead = Math.max(0, Number.isFinite(forwardOffset) ? forwardOffset : 0)\n"
    "  return fogPocketVisualStrength((Number.isFinite(distance) ? distance : 0) + ahead)\n"
    "}\n\n"
    "export function nextFogBankOffsets(distance, count = 3) {\n",
)

replace_once(
    'src/enemies/index.js',
    "import { aiValidator } from '../ai-validator.js'\n",
    "import { aiValidator } from '../ai-validator.js'\nimport { fogSpawnStrengthAtOffset } from '../fog-visual-model.js'\n",
)

replace_once(
    'src/enemies/index.js',
    "  const SPAWN_WOBBLE_DURATION_S = 0.2\n  const SPAWN_WOBBLE_MAGNITUDE = 0.15\n",
    "  const SPAWN_WOBBLE_DURATION_S = 0.2\n  const SPAWN_WOBBLE_MAGNITUDE = 0.15\n"
    "  const SPAWN_FOG_INTEGRATION_THRESHOLD = 0.12\n"
    "  const SPAWN_FOG_WISP_THRESHOLD = 0.55\n",
)

replace_once(
    'src/enemies/index.js',
    "  function getSpawnDurations(enemy) {\n",
    r'''  function spawnFogVisualStrengthFor(enemy) {
    if (!enemy?.mesh || rail.isArena()) return 0
    const frame = rail.getFrameAt(0)
    _enemyRel.copy(enemy.mesh.position).sub(frame.position)
    const forwardOffset = Math.max(0, _enemyRel.dot(frame.forward))
    return fogSpawnStrengthAtOffset(rail.getDistance(), forwardOffset)
  }

  function triggerFogSpawnMaterialization(enemy) {
    const strength = Math.max(0, Math.min(1, enemy?.spawnFogVisualStrength || 0))
    if (!effects || strength < SPAWN_FOG_INTEGRATION_THRESHOLD || enemy?.spawnedInDenseFog) return false
    const radius = hitRadiusFor(enemy)
    effects.fogCondensationInward?.(enemy.mesh.position, colorFor(enemy), radius)
    if (strength >= SPAWN_FOG_WISP_THRESHOLD) {
      effects.fogWispCondensation?.(enemy.mesh.position, colorFor(enemy))
    }
    if (!enemy.spawnFogIntegrationLogged) {
      enemy.spawnFogIntegrationLogged = true
      aiValidator.expect(
        'Spawn integrado ao fog usa força visual normalizada e posição finita',
        () => strength >= 0 && strength <= 1 && [enemy.mesh.position.x, enemy.mesh.position.y, enemy.mesh.position.z].every(Number.isFinite),
        { enemyId: enemy.id, kind: enemy.kind, strength },
      )
      aiValidator.logMechanic('fog-spawn', 'materialize-from-visible-bank', {
        enemyId: enemy.id, kind: enemy.kind, strength,
      })
    }
    return true
  }

  function getSpawnDurations(enemy) {
''',
)

old_transition = r'''        // Materialização começa AGORA (peek já cobriu a antecipação) — condensação inward
        // dispara na entrada da fase, não no spawn original.
        const hordaSplitDenseFog = enemy.spawnedInDenseFog
        if (effects && !hordaSplitDenseFog) {
          if (enemy.kind === MINI_SWARM_KIND && effects.flankSpawnTrail) {
            effects.flankSpawnTrail(enemy.mesh.position, null, colorFor(enemy))
          } else if (effects.fogCondensationInward) {
            effects.fogCondensationInward(enemy.mesh.position, colorFor(enemy), hitRadiusFor(enemy))
          }
        }
'''
new_transition = r'''        // Materialização começa AGORA (peek já cobriu a antecipação). O trail de mini-swarm
        // continua sendo identidade própria; a condensação de fog só aparece quando o ponto de
        // spawn está dentro do MESMO banco visual que o ambiente desenha.
        const hordaSplitDenseFog = enemy.spawnedInDenseFog
        if (effects && !hordaSplitDenseFog && enemy.kind === MINI_SWARM_KIND && effects.flankSpawnTrail) {
          effects.flankSpawnTrail(enemy.mesh.position, null, colorFor(enemy))
        }
        triggerFogSpawnMaterialization(enemy)
'''
replace_once('src/enemies/index.js', old_transition, new_transition)

replace_once(
    'src/enemies/index.js',
    "        enemy.spawnOpacityWasTransparent = false\n        enemy.settleFlashFired = false\n",
    "        enemy.spawnOpacityWasTransparent = false\n        enemy.settleFlashFired = false\n"
    "        enemy.spawnFogVisualStrength = null\n"
    "        enemy.spawnFogIntegrationLogged = false\n",
)

replace_once(
    'src/enemies/index.js',
    "      enemy.spawnDurations = durations\n      const hasPeek = durations.peek > 0\n",
    "      enemy.spawnDurations = durations\n"
    "      enemy.spawnFogVisualStrength = spawnFogVisualStrengthFor(enemy)\n"
    "      enemy.spawnFogIntegrationLogged = false\n"
    "      const hasPeek = durations.peek > 0\n",
)

old_no_peek = r'''      // Fog tático (Overhaul 4, pilar 3) — filhote de Horda nascido em fog denso pula toda
      // condensação visual (nasce "literalmente invisível", ver spawnedInDenseFog/fadeInMaterial
      // em miniSwarm.js) — a única leitura de que ele existe é o fade-in de opacidade + o som.
      // Materialização dispara já aqui quando NÃO há peek (senão dispara ao entrar na fase).
      if (effects && !hordaSplitDenseFog && !hasPeek) {
        if (enemy.kind === MINI_SWARM_KIND && effects.flankSpawnTrail) {
          effects.flankSpawnTrail(enemy.mesh.position, null, colorFor(enemy))
        } else if (effects.fogCondensationInward) {
          effects.fogCondensationInward(enemy.mesh.position, colorFor(enemy), hitRadiusFor(enemy))
        }
      }
'''
new_no_peek = r'''      // Filhote de Horda nascido em fog denso preserva a regra de invisibilidade. Nos demais
      // spawns sem peek, o trail próprio do mini-swarm continua; a condensação adicional só é
      // emitida se o spawn caiu espacialmente dentro de um banco de fog visível.
      if (effects && !hordaSplitDenseFog && !hasPeek && enemy.kind === MINI_SWARM_KIND && effects.flankSpawnTrail) {
        effects.flankSpawnTrail(enemy.mesh.position, null, colorFor(enemy))
      }
      if (!hasPeek) triggerFogSpawnMaterialization(enemy)
'''
replace_once('src/enemies/index.js', old_no_peek, new_no_peek)

# ---------------------------------------------------------------------------
# Swirl boss-class impact identity. Fragata keeps the existing blue stop explosion; Boss and
# Golden get an extra unmistakable identity burst/ring on top of it. This is feedback only.
# ---------------------------------------------------------------------------
replace_once(
    'src/effects.js',
    "  function swirlBlastExplosion(position) {\n    explosion(position, SWIRL_COLOR, SWIRL_EXPLOSION_RADIUS, { rings: true })\n",
    "  function swirlBlastExplosion(position, direction = null, opts = {}) {\n"
    "    explosion(position, SWIRL_COLOR, SWIRL_EXPLOSION_RADIUS, { rings: true })\n",
)

replace_once(
    'src/effects.js',
    "    shockwave(position, 0xffffff, SWIRL_EXPLOSION_RADIUS * 0.7)\n\n    // Overhaul v2 (§6) — onda de fragmentos triangulares: 8 tetraedros pequenos girando pra fora\n",
    r'''    shockwave(position, 0xffffff, SWIRL_EXPLOSION_RADIUS * 0.7)

    // Boss-class ganha uma segunda assinatura cromática/escala. Fragata continua com o impacto
    // azul acima; Boss lê quente/vermelho e Dourado lê ouro, sem alterar dano ou colisão.
    if (opts.bossClass) {
      const identityColor = opts.kind === 'golden' ? 0xffd24a : 0xff684a
      shockwave(position, identityColor, SWIRL_EXPLOSION_RADIUS * 1.55)
      shockwave(position, 0xffffff, SWIRL_EXPLOSION_RADIUS * 1.05)
      bloomSprite(position, identityColor, 4.4)
      hitSpark(position, identityColor)
      hitSpark(position, 0xffffff)
    }

    // Overhaul v2 (§6) — onda de fragmentos triangulares: 8 tetraedros pequenos girando pra fora
''',
)

replace_once(
    'src/combat/projectiles.js',
    "          if (h.stopProjectile) {\n            stopped = true\n            if (effects && effects.swirlBlastExplosion) effects.swirlBlastExplosion(h.worldPos, _projDir)\n          }\n",
    r'''          if (h.stopProjectile) {
            stopped = true
            const bossClassImpact = h.kind === BOSS_KIND || h.kind === GOLDEN_KIND
            if (effects && effects.swirlBlastExplosion) {
              effects.swirlBlastExplosion(h.worldPos, _projDir, { kind: h.kind, bossClass: bossClassImpact })
            }
            if (bossClassImpact) {
              aiValidator.logMechanic('swirl-impact', 'boss-class-impact', {
                kind: h.kind, damageApplied: appliedDamage, destroyedShield: !!h.destroyedShield,
              })
            }
          }
''',
)

# ---------------------------------------------------------------------------
# Stage 4 focused guards.
# ---------------------------------------------------------------------------
write('src/forgot-stage4.test.mjs', r'''import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fogSpawnStrengthAtOffset, FOG_BANK_PERIOD } from './fog-visual-model.js'

const centerDistance = 47.5
assert.ok(fogSpawnStrengthAtOffset(centerDistance, 0) > 0.99)
assert.ok(fogSpawnStrengthAtOffset(centerDistance - 40, 40) > 0.99, 'forward spawn should sample the visible bank ahead')
assert.equal(
  fogSpawnStrengthAtOffset(centerDistance, -999),
  fogSpawnStrengthAtOffset(centerDistance, 0),
  'negative spawn offsets must clamp to the player rail distance',
)
assert.ok(fogSpawnStrengthAtOffset(centerDistance + FOG_BANK_PERIOD, 0) > 0.99)

const enemies = fs.readFileSync(new URL('./enemies/index.js', import.meta.url), 'utf8')
const effects = fs.readFileSync(new URL('./effects.js', import.meta.url), 'utf8')
const projectiles = fs.readFileSync(new URL('./combat/projectiles.js', import.meta.url), 'utf8')

assert.match(enemies, /spawnFogVisualStrengthFor/)
assert.match(enemies, /materialize-from-visible-bank/)
assert.match(enemies, /triggerFogSpawnMaterialization\(enemy\)/)
assert.match(enemies, /SPAWN_FOG_INTEGRATION_THRESHOLD/)
assert.match(effects, /opts\.bossClass/)
assert.match(effects, /opts\.kind === 'golden'/)
assert.match(projectiles, /bossClassImpact = h\.kind === BOSS_KIND \|\| h\.kind === GOLDEN_KIND/)
assert.match(projectiles, /SWIRL_TRAIL_SPACING = 3\.2/)
assert.match(projectiles, /trailDistance/)
assert.match(effects, /SWIRL_AFTERIMAGE_DURATION = 0\.8/)

console.log('forgot stage 4 tests: ok')
''')

print('forgot stage 4 migration applied')
