from pathlib import Path
import re

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')

def replace_once(path, old, new):
    text = read(path)
    if old not in text:
        raise RuntimeError(f'marker not found in {path}: {old[:120]!r}')
    write(path, text.replace(old, new, 1))

def sub_once(path, pattern, replacement, flags=0):
    text = read(path)
    out, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'pattern count {count} in {path}: {pattern[:120]!r}')
    write(path, out)

# ---------------------------------------------------------------------------
# Enemy FSM: states required by the Tank overhaul.
# ---------------------------------------------------------------------------
replace_once('src/enemies/state-machine.js',
"""  ENGAGED: 'ENGAGED',
  TELEGRAPHING: 'TELEGRAPHING',
  ATTACKING: 'ATTACKING',
  RECOVERY: 'RECOVERY',
  CRITICAL_TUMBLE: 'CRITICAL_TUMBLE',
  DISENGAGING: 'DISENGAGING',
""",
"""  ENGAGED: 'ENGAGED',
  BRACING: 'BRACING',
  TELEGRAPHING: 'TELEGRAPHING',
  ATTACKING: 'ATTACKING',
  RECOVERY: 'RECOVERY',
  REPOSITIONING: 'REPOSITIONING',
  STAGGERED: 'STAGGERED',
  CRITICAL_TUMBLE: 'CRITICAL_TUMBLE',
  DISENGAGING: 'DISENGAGING',
""")

# ---------------------------------------------------------------------------
# Sentinel: preserve the two independent damage channels all the way out.
# ---------------------------------------------------------------------------
replace_once('src/enemies/sentinela.js',
"""  return { hit }
}
""",
"""  return {
    hit,
    hullDamage: hit ? (gate.damage ?? GATE_DAMAGE) : 0,
    shieldDamage: hit ? (gate.shieldDamage ?? GATE_SHIELD_DAMAGE) : 0,
  }
}
""")

# ---------------------------------------------------------------------------
# Worm: severing is idempotent. A dead segment may be observed by several hit paths.
# ---------------------------------------------------------------------------
replace_once('src/enemies/verme.js',
"""export function severChainAt(deadSegment, allEnemies, rail) {
  if (deadSegment?.mesh) {
""",
"""export function severChainAt(deadSegment, allEnemies, rail) {
  if (!deadSegment || deadSegment.chainSevered) return false
  deadSegment.chainSevered = true
  if (deadSegment?.mesh) {
""")
replace_once('src/enemies/verme.js',
"""    next.screenY = rel.dot(frame.up)
  }
}
""",
"""    next.screenY = rel.dot(frame.up)
  }
  return true
}
""")

# ---------------------------------------------------------------------------
# Magnet: original calibration was made for the old ~60u/s projectile. Normal shots now fly
# at 260u/s, so the old field was practically invisible.
# ---------------------------------------------------------------------------
replace_once('src/enemies/ima.js',
"""export const IMA_FIELD_RADIUS = 12
// força ~7x maior que antes (era 26): com 26 o desvio total ficava em ~3-4° (imperceptível),
// porque o efeito dura só ~0.3s (tempo de travessia do raio 9 a 60 u/s) e a força é somada à
// velocidade POR FRAME em projectiles.js. 180 dá ~25° de desvio visível — a curva aparece de
// verdade no tiro normal que passa perto. Ver tabela no comentário do projectiles.js.
export const IMA_FIELD_STRENGTH = 180
""",
"""export const IMA_FIELD_RADIUS = 15
// Recalibrado para PROJECTILE_SPEED=260: o tiro cruza o campo muito mais rápido que na versão
// antiga, então a aceleração lateral precisa ser maior para continuar legível sem virar uma
// parede invisível. O falloff ainda zera suavemente na borda e o homing/Swirl ignoram o campo.
export const IMA_FIELD_STRENGTH = 1100
""")

# ---------------------------------------------------------------------------
# Player: explicit shield-vs-hull damage contract for hazards such as the Sentinel gate.
# ---------------------------------------------------------------------------
replace_once('src/player.js',
"""    takeDamage(amount = 1) {
      if (invincibilityTimer > 0 || amount <= 0) return { hit: false, died: false }
""",
"""    takeDamage(amount = 1) {
      if (invincibilityTimer > 0 || amount <= 0) return { hit: false, died: false }
""")
# Insert a sibling method immediately before heal().
replace_once('src/player.js',
"""    heal(amount = 1) {
""",
"""    // Hazards with different shield/hull payloads (Sentinel gate) must not collapse to one
    // number. If any shield existed at impact, the shield channel is consumed first; only when
    // that impact breaks the shield does the hull channel apply to hull. With no shield at the
    // beginning of the hit, only hullDamage is used.
    takeDamageChannels({ shieldDamage = 0, hullDamage = 0 } = {}) {
      if (invincibilityTimer > 0) return { hit: false, died: false, channel: null }
      const sDamage = Math.max(0, Number(shieldDamage) || 0)
      const hDamage = Math.max(0, Number(hullDamage) || 0)
      if (sDamage <= 0 && hDamage <= 0) return { hit: false, died: false, channel: null }

      const hadShield = temporaryShieldPips > 0 || shield > 0
      if (!hadShield) {
        const result = this.takeDamage(hDamage)
        return { ...result, channel: result.hit ? 'hull' : null }
      }

      let remainingShieldDamage = sDamage
      if (temporaryShieldPips > 0 && remainingShieldDamage > 0) {
        const absorbed = Math.min(temporaryShieldPips, remainingShieldDamage)
        temporaryShieldPips -= absorbed
        remainingShieldDamage -= absorbed
      }
      if (shield > 0 && remainingShieldDamage > 0) {
        const absorbed = Math.min(shield, remainingShieldDamage)
        shield -= absorbed
        remainingShieldDamage -= absorbed
      }
      shieldRegenTimer = SHIELD_REGEN_DELAY
      telemetry?.recordShield?.(shield, shieldMax, 'channel-hit')

      if (temporaryShieldPips > 0 || shield > 0 || remainingShieldDamage <= 0) {
        invincibilityTimer = HIT_INVINCIBILITY_S
        return { hit: true, died: false, channel: 'shield' }
      }

      // Shield broke on this impact. The hull receives the hazard's hull payload, never the
      // leftover shield payload (4 shield / 2 hull stays exactly that contract).
      const previousInv = invincibilityTimer
      invincibilityTimer = 0
      const result = this.takeDamage(hDamage)
      if (!result.hit) invincibilityTimer = previousInv
      return { ...result, channel: result.hit ? 'hull' : 'shield', shieldBroken: true }
    },

    heal(amount = 1) {
""")

# ---------------------------------------------------------------------------
# Golden Swirl collision: swept radius + max-HP boss-class damage.
# ---------------------------------------------------------------------------
replace_once('src/enemies/golden.js',
"""    resolvePiercingHit(prevPos, currPos, damage, piercedTargets) {
      const hits = []
""",
"""    resolvePiercingHit(prevPos, currPos, damage, piercedTargets, options = {}) {
      const hits = []
      const projectileRadius = Math.max(0, options.projectileRadius || 0)
      const bossHpRatio = Math.max(0, options.bossHpRatio || 0)
""")
replace_once('src/enemies/golden.js',
"""        if (distanceToSegment(goldenHit.mesh.position, prevPos, currPos) > GOLDEN_HIT_RADIUS) continue
        piercedTargets.add(goldenHit.id)

        goldenHit.hp -= damage
""",
"""        if (distanceToSegment(goldenHit.mesh.position, prevPos, currPos) > GOLDEN_HIT_RADIUS + projectileRadius) continue
        piercedTargets.add(goldenHit.id)

        const appliedDamage = damage + Math.ceil((goldenHit.maxHp || 0) * bossHpRatio)
        goldenHit.hp -= appliedDamage
""")
replace_once('src/enemies/golden.js',
"""          kind: GOLDEN_KIND, killed, worldPos: goldenHit.mesh.position.clone(), meshRef: goldenHit.mesh,
          enemyKillPoints: 0, timeReductionMs: null, bossDefeated: false, goldenSpecialHit: killed,
          stopProjectile: true,
""",
"""          kind: GOLDEN_KIND, killed, worldPos: goldenHit.mesh.position.clone(), meshRef: goldenHit.mesh,
          enemyKillPoints: 0, timeReductionMs: null, bossDefeated: false, goldenSpecialHit: killed,
          stopProjectile: true, damageApplied: appliedDamage,
""")

# ---------------------------------------------------------------------------
# Enemy orchestrator hardening.
# ---------------------------------------------------------------------------
replace_once('src/enemies/index.js',
"""import { TANK_KIND, TANK_COLOR, TANK_HIT_RADIUS, TANK_DEATH_DURATION, TANK_DEFAULT_HP, spawnTankEnemy, tankStatsForLevel, disposeTank } from './tank.js'
""",
"""import { TANK_KIND, TANK_COLOR, TANK_HIT_RADIUS, TANK_DEATH_DURATION, TANK_DEFAULT_HP, TANK_KILL_BONUS, spawnTankEnemy, tankStatsForLevel, disposeTank } from './tank.js'
""")
replace_once('src/enemies/index.js',
"""const _epStep = new THREE.Vector3()
const _epToPlayer = new THREE.Vector3()
""",
"""const _epStep = new THREE.Vector3()
const _epPrevPos = new THREE.Vector3()
const _epToPlayer = new THREE.Vector3()
""")

# Add one-time squadron accounting and use it from removeEnemy.
replace_once('src/enemies/index.js',
"""  function removeEnemy(e) {
    e.dying = true
""",
"""  function accountSquadronExit(e, destroyed = false) {
    if (!e?.squadronId || e.squadronExitAccounted || !activeSquadrons.has(e.squadronId)) {
      return { squadWipe: false, squadWipeBonus: 0 }
    }
    e.squadronExitAccounted = true
    const sq = activeSquadrons.get(e.squadronId)
    sq.remaining = Math.max(0, sq.remaining - 1)
    let squadWipe = false
    let squadWipeBonus = 0
    if (sq.remaining <= 0) {
      activeSquadrons.delete(e.squadronId)
      if (destroyed && !sq.wiped) {
        sq.wiped = true
        squadWipe = true
        squadWipeBonus = 150
        effects?.spawnMicroOrbe?.(e.mesh.position.clone())
      }
    }
    aiValidator.expect('Saída de membro de esquadrão é contabilizada no máximo uma vez',
      () => sq.remaining >= 0,
      { squadronId: e.squadronId, remaining: sq.remaining, destroyed })
    return { squadWipe, squadWipeBonus }
  }

  function removeEnemy(e) {
    e.dying = true
""")
replace_once('src/enemies/index.js',
"""    if (e.squadronId && activeSquadrons.has(e.squadronId)) {
      const sq = activeSquadrons.get(e.squadronId)
      sq.remaining--
      if (sq.remaining <= 0) {
        activeSquadrons.delete(e.squadronId)
      }
    }
""",
"""    accountSquadronExit(e, false)
""")

# Tank score.
sub_once('src/enemies/index.js', r"case TANK_KIND:\s*return BLASTER_KILL_BONUS", "case TANK_KIND: return TANK_KILL_BONUS")

# Boss phase transition is true invulnerability for ram and no normal firing while transitioning.
replace_once('src/enemies/index.js',
"""            if (enemy.kind === BOSS_KIND && enemy.isShieldActive) {
""",
"""            if (enemy.kind === BOSS_KIND && enemy.transitioning) {
              effects?.hitSpark?.(enemy.mesh.position, BOSS_SHIELD_COLOR)
              aiValidator.logMechanic('boss-phase', 'ram-blocked-during-transition', { bossId: enemy.id })
              continue
            }
            if (enemy.kind === BOSS_KIND && enemy.isShieldActive) {
""")
replace_once('src/enemies/index.js',
"""        if (enemy.kind === BOSS_KIND) { fireBossVolley(enemy, playerPosition, projectileCtx); handled = true }
""",
"""        if (enemy.kind === BOSS_KIND) {
          if (!enemy.transitioning) fireBossVolley(enemy, playerPosition, projectileCtx)
          handled = true
        }
""")

# Common projectiles use swept segment collision; Golden minion orientation keeps a unit vector.
replace_once('src/enemies/index.js',
"""            projectile.velocity.copy(_epVelNorm.normalize().multiplyScalar(GOLDEN_MINION_SPEED))
            projectile.mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, _epVelNorm)
""",
"""            _epVelNorm.normalize()
            projectile.velocity.copy(_epVelNorm).multiplyScalar(GOLDEN_MINION_SPEED)
            projectile.mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, _epVelNorm)
""")
replace_once('src/enemies/index.js',
"""      _epStep.copy(projectile.velocity).multiplyScalar(dt)
      projectile.mesh.position.add(_epStep)
""",
"""      _epPrevPos.copy(projectile.mesh.position)
      _epStep.copy(projectile.velocity).multiplyScalar(dt)
      projectile.mesh.position.add(_epStep)
""")
replace_once('src/enemies/index.js',
"""      const wingmanHit = wingmanTargets.find((target) => target.worldPos.distanceTo(projectile.mesh.position) <= hitRadius + target.radius)
""",
"""      const wingmanHit = wingmanTargets.find((target) => distanceToSegment(target.worldPos, _epPrevPos, projectile.mesh.position) <= hitRadius + target.radius)
""")
replace_once('src/enemies/index.js',
"""      const projHit = shipPoints.some((pt) => pt.worldPos.distanceTo(projectile.mesh.position) <= hitRadius + pt.radius)
""",
"""      const projHit = shipPoints.some((pt) => distanceToSegment(pt.worldPos, _epPrevPos, projectile.mesh.position) <= hitRadius + pt.radius)
""")

# Gate damage channels are preserved in the projectile result.
replace_once('src/enemies/index.js',
"""  function updateEnemyGates(dt, playerPosition, opts = {}) {
    let hits = 0
    let damage = 1
    let powerLevel = POWER_LEVEL_BASIC
""",
"""  function updateEnemyGates(dt, playerPosition, opts = {}) {
    let hits = 0
    let damage = 1
    let shieldDamage = 0
    let hullDamage = 0
    let powerLevel = POWER_LEVEL_BASIC
""")
replace_once('src/enemies/index.js',
"""        const { hit } = resolveGateHit(gate, playerPosition, opts)
        if (hit) {
          hits += 1
          damage = Math.max(damage, gate.shieldDamage ?? 1)
          powerLevel = Math.max(powerLevel, gate.powerLevel ?? POWER_LEVEL_BASIC)
        }
""",
"""        const gateHit = resolveGateHit(gate, playerPosition, opts)
        if (gateHit.hit) {
          hits += 1
          shieldDamage = Math.max(shieldDamage, gateHit.shieldDamage || 0)
          hullDamage = Math.max(hullDamage, gateHit.hullDamage || 0)
          damage = Math.max(damage, gateHit.shieldDamage || gateHit.hullDamage || 1)
          powerLevel = Math.max(powerLevel, gate.powerLevel ?? POWER_LEVEL_BASIC)
        }
""")
replace_once('src/enemies/index.js',
"""    return { hits, damage, powerLevel, wingmanHitIds }
  }

  // ============ OVERHAUL DE SPAWN EM 3 FASES""",
"""    return { hits, damage, shieldDamage, hullDamage, powerLevel, wingmanHitIds }
  }

  // ============ OVERHAUL DE SPAWN EM 3 FASES""")
replace_once('src/enemies/index.js',
"""        damage: Math.max(p.damage, l.damage, g.damage),
        powerLevel: Math.max(p.powerLevel, l.powerLevel, g.powerLevel),
""",
"""        damage: Math.max(p.damage, l.damage, g.damage),
        shieldDamage: g.hits > 0 ? g.shieldDamage : 0,
        hullDamage: g.hits > 0 ? g.hullDamage : 0,
        powerLevel: Math.max(p.powerLevel, l.powerLevel, g.powerLevel),
""")

# Magnet stops existing as gameplay field as soon as its source begins fading out.
replace_once('src/enemies/index.js',
"""        if (e.kind === IMA_KIND && !e.dying && !isEnemySpawnPending(e) && e.mesh) {
""",
"""        if (e.kind === IMA_KIND && !e.dying && !e.fadingOut && !isEnemySpawnPending(e) && e.mesh) {
""")

# Visual wobble must be reversible and never accumulate into authoritative position.
replace_once('src/enemies/index.js',
"""    applySpawnWobbles() {
      for (const e of enemies) {
        if (e.wobbleTimer > 0 && e.mesh) {
          const mag = e.wobbleMagnitude * (e.wobbleTimer / SPAWN_WOBBLE_DURATION_S)
          e.mesh.position.x += (Math.random() * 2 - 1) * mag
          e.mesh.position.y += (Math.random() * 2 - 1) * mag
          e.mesh.position.z += (Math.random() * 2 - 1) * mag
        }
      }
    },
""",
"""    restoreSpawnWobbles() {
      for (const e of enemies) {
        if (!e.mesh || !e.renderWobbleOffset) continue
        e.mesh.position.sub(e.renderWobbleOffset)
        e.renderWobbleOffset.set(0, 0, 0)
      }
    },

    applySpawnWobbles() {
      for (const e of enemies) {
        if (e.wobbleTimer > 0 && e.mesh) {
          if (!e.renderWobbleOffset) e.renderWobbleOffset = new THREE.Vector3()
          const mag = e.wobbleMagnitude * (e.wobbleTimer / SPAWN_WOBBLE_DURATION_S)
          e.renderWobbleOffset.set(
            (Math.random() * 2 - 1) * mag,
            (Math.random() * 2 - 1) * mag,
            (Math.random() * 2 - 1) * mag,
          )
          e.mesh.position.add(e.renderWobbleOffset)
        }
      }
    },
""")

# True boss-transition invulnerability in area/direct/piercing paths.
replace_once('src/enemies/index.js',
"""        if (e.spawnInvincibleTimer > 0) continue
        if (e.mesh.position.distanceTo(center) > radius) continue
        if (e.kind === BOSS_KIND && e.isShieldActive) continue
""",
"""        if (e.spawnInvincibleTimer > 0) continue
        if (e.kind === BOSS_KIND && e.transitioning) continue
        if (e.mesh.position.distanceTo(center) > radius) continue
        if (e.kind === BOSS_KIND && e.isShieldActive) continue
""")
replace_once('src/enemies/index.js',
"""      if (enemyHit) {
        // Chefe: escudo refletor azul""",
"""      if (enemyHit) {
        if (enemyHit.kind === BOSS_KIND && enemyHit.transitioning) {
          effects?.hitSpark?.(enemyHit.mesh.position, BOSS_SHIELD_COLOR)
          return {
            kind: enemyHit.kind, killed: false, blocked: true, transitionBlocked: true,
            worldPos: enemyHit.mesh.position.clone(), meshRef: enemyHit.mesh,
            enemyKillPoints: 0, timeReductionMs: null, bossDefeated: false, goldenSpecialHit: false,
          }
        }
        // Chefe: escudo refletor azul""")

# Replace both manual squadron-decrement blocks with one-time accounting.
manual_sq = """            if (enemyHit.squadronId && activeSquadrons.has(enemyHit.squadronId)) {
              const sq = activeSquadrons.get(enemyHit.squadronId)
              sq.remaining--
              if (sq.remaining <= 0 && !sq.wiped) {
                sq.wiped = true
                activeSquadrons.delete(enemyHit.squadronId)
                squadWipe = true
                squadWipeBonus = 150
                enemyKillPoints += squadWipeBonus
                if (effects && effects.spawnMicroOrbe) {
                  effects.spawnMicroOrbe(enemyHit.mesh.position.clone())
                }
              }
            }
"""
manual_sq_compact = """            if (enemyHit.squadronId && activeSquadrons.has(enemyHit.squadronId)) {
              const sq = activeSquadrons.get(enemyHit.squadronId)
              sq.remaining--
              if (sq.remaining <= 0 && !sq.wiped) {
                sq.wiped = true
                activeSquadrons.delete(enemyHit.squadronId)
                squadWipe = true
                squadWipeBonus = 150
                enemyKillPoints += squadWipeBonus
                if (effects && effects.spawnMicroOrbe) effects.spawnMicroOrbe(enemyHit.mesh.position.clone())
              }
            }
"""
replacement_sq = """            const squadResult = accountSquadronExit(enemyHit, true)
            if (squadResult.squadWipe) {
              squadWipe = true
              squadWipeBonus = squadResult.squadWipeBonus
              enemyKillPoints += squadWipeBonus
            }
"""
text = read('src/enemies/index.js')
if manual_sq not in text or manual_sq_compact not in text:
    raise RuntimeError('squadron kill accounting markers not found')
text = text.replace(manual_sq, replacement_sq, 1).replace(manual_sq_compact, replacement_sq, 1)
write('src/enemies/index.js', text)

# Piercing: radius, boss transition guard, shield-only consumption, boss max-HP damage and Tank stagger.
replace_once('src/enemies/index.js',
"""      const damage = meta.damage ?? 1
      const hitBuffer = meta.hitBuffer || 0
""",
"""      const damage = meta.damage ?? 1
      const hitBuffer = meta.hitBuffer || 0
      const projectileRadius = Math.max(0, meta.projectileRadius || 0)
      const bossHpRatio = Math.max(0, meta.bossHpRatio || 0)
""")
replace_once('src/enemies/index.js',
"""        if (distanceToSegment(enemyHit.mesh.position, prevPos, currPos) > hitRadiusFor(enemyHit) + hitBuffer) continue
        piercedTargets.add(enemyHit.id)
""",
"""        if (distanceToSegment(enemyHit.mesh.position, prevPos, currPos) > hitRadiusFor(enemyHit) + hitBuffer + projectileRadius) continue
        piercedTargets.add(enemyHit.id)
        if (enemyHit.kind === BOSS_KIND && enemyHit.transitioning) {
          effects?.hitSpark?.(enemyHit.mesh.position, BOSS_SHIELD_COLOR)
          hits.push({
            kind: enemyHit.kind, killed: false, blocked: true, transitionBlocked: true,
            worldPos: enemyHit.mesh.position.clone(), meshRef: enemyHit.mesh,
            enemyKillPoints: 0, timeReductionMs: null, bossDefeated: false,
            squadWipe: false, squadWipeBonus: 0, stopProjectile: true, damageApplied: 0,
          })
          continue
        }
""")
replace_once('src/enemies/index.js',
"""        if (enemyHit.kind === BOSS_KIND && enemyHit.isShieldActive) {
          destroyedShield = true
          enemyHit.isShieldActive = false
          if (enemyHit.shieldMesh) enemyHit.shieldMesh.visible = false
          if (effects) {
            effects.hitSpark(enemyHit.mesh.position, BOSS_SHIELD_COLOR)
            effects.shockwave(enemyHit.mesh.position, BOSS_SHIELD_COLOR, 0.8)
          }
        }

        enemyHit.hp -= damage
        telemetry.recordEvent(enemyHit.id, enemyHit.kind, 'damage', `Recebeu ${damage} de dano perfurante (HP restante: ${Math.max(0, enemyHit.hp)})`, { damage, hp: enemyHit.hp })
""",
"""        if (enemyHit.kind === BOSS_KIND && enemyHit.isShieldActive) {
          destroyedShield = true
          enemyHit.isShieldActive = false
          if (enemyHit.shieldMesh) enemyHit.shieldMesh.visible = false
          if (effects) {
            effects.hitSpark(enemyHit.mesh.position, BOSS_SHIELD_COLOR)
            effects.shockwave(enemyHit.mesh.position, BOSS_SHIELD_COLOR, 0.8)
          }
          // Swirl consumes the defensive phase, but cannot delete shield and hull in one contact.
          hits.push({
            kind: enemyHit.kind, killed: false, blocked: true, worldPos: enemyHit.mesh.position.clone(), meshRef: enemyHit.mesh,
            enemyKillPoints: 0, timeReductionMs: null, bossDefeated: false, squadWipe: false, squadWipeBonus: 0,
            stopProjectile: true, destroyedShield: true, damageApplied: 0,
          })
          continue
        }

        const appliedDamage = enemyHit.kind === BOSS_KIND
          ? damage + Math.ceil((enemyHit.maxHp || 0) * bossHpRatio)
          : damage
        enemyHit.hp -= appliedDamage
        if (enemyHit.kind === TANK_KIND) enemyHit.requestStagger?.('swirl')
        telemetry.recordEvent(enemyHit.id, enemyHit.kind, 'damage', `Recebeu ${appliedDamage} de dano perfurante (HP restante: ${Math.max(0, enemyHit.hp)})`, { damage: appliedDamage, hp: enemyHit.hp })
""")
replace_once('src/enemies/index.js',
"""          stopProjectile: stopsProjectile, destroyedShield,
""",
"""          stopProjectile: stopsProjectile, destroyedShield, damageApplied: appliedDamage,
""")
replace_once('src/enemies/index.js',
"""      hits.push(...golden.resolvePiercingHit(prevPos, currPos, damage, goldenPierced))
""",
"""      hits.push(...golden.resolvePiercingHit(prevPos, currPos, damage, goldenPierced, { projectileRadius, bossHpRatio }))
""")

# Tank population weight 2, in addition to Horda weight 3.
replace_once('src/enemies/index.js',
"""        return n + (e.kind === HORDA_KIND ? 3 : 1)
""",
"""        return n + (e.kind === HORDA_KIND ? 3 : e.kind === TANK_KIND ? 2 : 1)
""")

# ---------------------------------------------------------------------------
# Projectile system: live-target validation, real-time Swirl movement under slow-mo, volumetric
# swept collision, distance-based readable trail and target-specific damage feedback.
# ---------------------------------------------------------------------------
replace_once('src/combat/projectiles.js',
"""const SWIRL_BLAST_DAMAGE = 6
""",
"""const SWIRL_BLAST_DAMAGE = 6
const SWIRL_PROJECTILE_RADIUS = 3.0
const SWIRL_BOSS_HP_RATIO = 0.25
const SWIRL_TRAIL_SPACING = 3.2
const SWIRL_TRAIL_EMISSIONS_PER_FRAME_CAP = 14
""")
# If the constant line differs, fallback handled by assertion above in CI.
replace_once('src/combat/projectiles.js',
"""    for (let pIdx = projectiles.length - 1; pIdx >= 0; pIdx--) {
      const projectile = projectiles[pIdx]
""",
"""    for (let pIdx = projectiles.length - 1; pIdx >= 0; pIdx--) {
      const projectile = projectiles[pIdx]
      const projectileDt = projectile.isPiercing && Number.isFinite(opts.swirlDt) ? Math.max(0, opts.swirlDt) : dt
""")
replace_once('src/combat/projectiles.js',
"""      if (projectile.homingTarget) {
        if (projectile.homingTarget.dying) {
""",
"""      if (projectile.homingTarget) {
        if (projectile.homingTarget.dying || projectile.homingTarget.fadingOut || !projectile.homingTarget.mesh
          || (Number.isFinite(projectile.homingTarget.hp) && projectile.homingTarget.hp <= 0)
          || (Number.isFinite(projectile.homingTarget.health) && projectile.homingTarget.health <= 0)) {
""")
replace_once('src/combat/projectiles.js',
"""        if (projectile.swirlHomingTarget.dying) {
""",
"""        if (projectile.swirlHomingTarget.dying || projectile.swirlHomingTarget.fadingOut || !projectile.swirlHomingTarget.mesh
          || (Number.isFinite(projectile.swirlHomingTarget.hp) && projectile.swirlHomingTarget.hp <= 0)
          || (Number.isFinite(projectile.swirlHomingTarget.health) && projectile.swirlHomingTarget.health <= 0)) {
""")
replace_once('src/combat/projectiles.js',
"""            steerDirectionTowardTarget(_projDir, _projDesired, SWIRL_HOMING_TURN_RATE * dt, _projAxis)
""",
"""            steerDirectionTowardTarget(_projDir, _projDesired, SWIRL_HOMING_TURN_RATE * projectileDt, _projAxis)
""")
replace_once('src/combat/projectiles.js',
"""        projectile.life -= dt
""",
"""        projectile.life -= projectileDt
""")
replace_once('src/combat/projectiles.js',
"""      _projStep.copy(projectile.velocity).multiplyScalar(dt)
""",
"""      _projStep.copy(projectile.velocity).multiplyScalar(projectileDt)
""")
replace_once('src/combat/projectiles.js',
"""        projectile.spinAngle += SWIRL_SPIN_RATE * dt
        projectile.mesh.rotateZ(projectile.spinAngle)
        updateSwirlDynamicShell(projectile, dt)
        if (effects && effects.swirlAfterimage) {
          projectile.afterimageTimer -= dt
          if (projectile.afterimageTimer <= 0) {
            projectile.afterimageTimer = SWIRL_AFTERIMAGE_INTERVAL
            effects.swirlAfterimage(projectile.mesh.position, projectile.mesh.quaternion)
          }
        }
""",
"""        projectile.spinAngle += SWIRL_SPIN_RATE * projectileDt
        projectile.mesh.rotateZ(projectile.spinAngle)
        updateSwirlDynamicShell(projectile, projectileDt)
        if (effects && effects.swirlAfterimage) {
          projectile.trailDistance = (projectile.trailDistance || 0) + _projStep.length()
          let emitted = 0
          while (projectile.trailDistance >= SWIRL_TRAIL_SPACING && emitted < SWIRL_TRAIL_EMISSIONS_PER_FRAME_CAP) {
            projectile.trailDistance -= SWIRL_TRAIL_SPACING
            const traveledIntoStep = _projStep.length() > 1e-6
              ? THREE.MathUtils.clamp(1 - projectile.trailDistance / _projStep.length(), 0, 1)
              : 1
            _projRingPos.copy(_projPrevPos).lerp(projectile.mesh.position, traveledIntoStep)
            effects.swirlAfterimage(_projRingPos, projectile.mesh.quaternion)
            emitted += 1
          }
        }
""")
replace_once('src/combat/projectiles.js',
"""            damage: projectile.damage + globalDamageBonus,
          piercedTargets: projectile.piercedTargets,
          goldenPiercedTargets: projectile.goldenPiercedTargets,
""",
"""          damage: projectile.damage + globalDamageBonus,
          piercedTargets: projectile.piercedTargets,
          goldenPiercedTargets: projectile.goldenPiercedTargets,
          projectileRadius: SWIRL_PROJECTILE_RADIUS,
          bossHpRatio: SWIRL_BOSS_HP_RATIO,
""")
replace_once('src/combat/projectiles.js',
"""          const feedback = createDamageFeedback(h, projectile.damage + globalDamageBonus, { instant: h.kind === 'detrito' })
""",
"""          const appliedDamage = Number.isFinite(h.damageApplied) ? h.damageApplied : projectile.damage + globalDamageBonus
          const feedback = createDamageFeedback(h, appliedDamage, { instant: h.kind === 'detrito' })
""")
replace_once('src/combat/projectiles.js',
"""              worldPos: h.worldPos, damage: projectile.damage + globalDamageBonus, killed: h.killed,
""",
"""              worldPos: h.worldPos, damage: appliedDamage, killed: h.killed,
""")
replace_once('src/combat/projectiles.js',
"""          if (h.stopProjectile) {
            stopped = true
            if (effects && effects.swirlBlastExplosion) effects.swirlBlastExplosion(h.worldPos, _projDir)
          }
""",
"""          if (effects && !h.blocked && !h.stopProjectile) {
            effects.hitSpark?.(h.worldPos, h.kind === 'detrito' ? 0xffb366 : 0x7bc8ff)
            effects.shockwave?.(h.worldPos, 0x2b8fff, 0.32)
          }
          if (h.stopProjectile) {
            stopped = true
            if (effects && effects.swirlBlastExplosion) effects.swirlBlastExplosion(h.worldPos, _projDir)
          }
""")
replace_once('src/combat/projectiles.js',
"""        damage: SWIRL_BLAST_DAMAGE, life: SWIRL_BLAST_LIFETIME, spinAngle: 0, afterimageTimer: 0,
""",
"""        damage: SWIRL_BLAST_DAMAGE, life: SWIRL_BLAST_LIFETIME, spinAngle: 0, afterimageTimer: 0, trailDistance: 0,
""")

# ---------------------------------------------------------------------------
# Lock-on priority and validity hardening while preserving BASE-vs-MIYU ownership.
# ---------------------------------------------------------------------------
replace_once('src/combat/lockon.js',
"""function maxLocksForEntity(e) {
  if (isBigLockTarget(e)) return Infinity
  if (e.kind === 'horda') return 2
  return 1
}
""",
"""function maxLocksForEntity(e) {
  if (isBigLockTarget(e)) return Infinity
  if (e.kind === 'horda') return 2
  return 1
}

function isLiveLockTarget(e) {
  return !!e?.mesh && !e.dying && !e.fadingOut
    && !(Number.isFinite(e.hp) && e.hp <= 0)
    && !(Number.isFinite(e.health) && e.health <= 0)
    && !(e.spawnPhase && e.spawnPhase !== 'active')
}

function compareLockPriority(a, b) {
  const aBoss = a.kind === 'boss' ? 1 : 0
  const bBoss = b.kind === 'boss' ? 1 : 0
  if (aBoss !== bBoss) return bBoss - aBoss
  const hpDiff = (Number(b.maxHp) || 0) - (Number(a.maxHp) || 0)
  if (hpDiff !== 0) return hpDiff
  return (Number(a.id) || 0) - (Number(b.id) || 0)
}
""")
replace_once('src/combat/lockon.js',
"""        if (rec.entity.dying) return false
""",
"""        if (!isLiveLockTarget(rec.entity)) return false
""")
replace_once('src/combat/lockon.js',
"""      const candidates = [...enemies.getAlive(), ...enemies.getGoldenAlive()]
""",
"""      const candidates = [...enemies.getAlive(), ...enemies.getGoldenAlive()].filter(isLiveLockTarget).sort(compareLockPriority)
""")
replace_once('src/combat/lockon.js',
"""      const candidateIsAimedAndValid = (e) => {
        const rel = e.mesh.position.clone().sub(origin)
""",
"""      const candidateIsAimedAndValid = (e) => {
        if (!isLiveLockTarget(e)) return false
        const rel = e.mesh.position.clone().sub(origin)
""")
# Replace common validity snippets in aim/fallback/take/groups/snapshots.
text = read('src/combat/lockon.js')
text = text.replace("if (!e || e.dying || !e.mesh) continue", "if (!isLiveLockTarget(e)) continue")
text = text.replace("if (rec.entity.dying || !inRange(rec.entity)) continue", "if (!isLiveLockTarget(rec.entity) || !inRange(rec.entity)) continue")
text = text.replace(".filter((rec) => !rec.entity.dying && inRange(rec.entity))", ".filter((rec) => isLiveLockTarget(rec.entity) && inRange(rec.entity))")
text = text.replace("getLockedEntities: () => lockedEnemies.filter((rec) => !rec.entity.dying).map((rec) => rec.entity)", "getLockedEntities: () => lockedEnemies.filter((rec) => isLiveLockTarget(rec.entity)).map((rec) => rec.entity)")
text = text.replace("const alive = lockedEnemies.filter((rec) => !rec.entity.dying)", "const alive = lockedEnemies.filter((rec) => isLiveLockTarget(rec.entity))")
write('src/combat/lockon.js', text)

print('forgot core migration applied')
