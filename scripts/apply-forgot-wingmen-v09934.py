from pathlib import Path

ROOT = Path('.')

def read(path): return (ROOT / path).read_text(encoding='utf-8')
def write(path, text): (ROOT / path).write_text(text, encoding='utf-8')
def replace_once(path, old, new):
    text = read(path)
    if old not in text:
        raise RuntimeError(f'marker not found in {path}: {old[:120]!r}')
    write(path, text.replace(old, new, 1))

# ---------------------------------------------------------------------------
# Target readiness: dead/fading/spawn-pending targets can never be owned by wingman AI.
# ---------------------------------------------------------------------------
replace_once('src/combat/wingman-flight-stability.js',
"""export function isWingmanCombatTargetReady(target, readyTargets = null) {
  if (!target || target.dying || target.fadingOut || !target.mesh || !target.mesh.parent) return false
  // Alguns inimigos já possuem mesh durante a apresentação de spawn, mas ainda estão invulneráveis.
  // Para IA de Wingman isso continua sendo "não surgiu": não pode virar alvo até o timer zerar.
  if (Number.isFinite(target.spawnInvincibleTimer) && target.spawnInvincibleTimer > 0) return false
  if (readyTargets && !readyTargets.has(target)) return false
  return true
}
""",
"""export function isWingmanCombatTargetReady(target, readyTargets = null) {
  if (!target || target.dying || target.fadingOut || !target.mesh || !target.mesh.parent) return false
  if (Number.isFinite(target.hp) && target.hp <= 0) return false
  if (Number.isFinite(target.health) && target.health <= 0) return false
  // Qualquer fase de entrada ainda ativa é não-combate, mesmo que o mesh já exista.
  if (target.spawnPhase && target.spawnPhase !== 'active') return false
  if (Number.isFinite(target.spawnInvincibleTimer) && target.spawnInvincibleTimer > 0) return false
  if (readyTargets && !readyTargets.has(target)) return false
  return true
}
""")

# ---------------------------------------------------------------------------
# Rail catch-up hysteresis: end below a lower threshold and clamp the boost.
# ---------------------------------------------------------------------------
replace_once('src/combat/wingman-navigation.js',
"""export const WINGMAN_RAIL_CATCHUP_START_DISTANCE = 32
export const WINGMAN_RAIL_CATCHUP_FULL_DISTANCE = 120
export const WINGMAN_RAIL_CATCHUP_MAX_BONUS = 72
""",
"""export const WINGMAN_RAIL_CATCHUP_START_DISTANCE = 32
export const WINGMAN_RAIL_CATCHUP_RELEASE_DISTANCE = 22
export const WINGMAN_RAIL_CATCHUP_FULL_DISTANCE = 120
export const WINGMAN_RAIL_CATCHUP_MAX_BONUS = 72
""")
replace_once('src/combat/wingman-navigation.js',
"""export function computeRailCatchupBoost(longitudinalLag) {
""",
"""export function updateRailCatchupState(longitudinalLag, wasActive = false) {
  if (!Number.isFinite(longitudinalLag)) return false
  if (wasActive) return longitudinalLag > WINGMAN_RAIL_CATCHUP_RELEASE_DISTANCE
  return longitudinalLag > WINGMAN_RAIL_CATCHUP_START_DISTANCE
}

export function computeRailCatchupBoost(longitudinalLag) {
""")
# Ensure max bonus remains hard-clamped even if formulas change later.
replace_once('src/combat/wingman-navigation.js',
"""  return WINGMAN_RAIL_CATCHUP_MAX_BONUS * smoothstep01(t)
""",
"""  return Math.min(WINGMAN_RAIL_CATCHUP_MAX_BONUS, WINGMAN_RAIL_CATCHUP_MAX_BONUS * smoothstep01(t))
""")

# Stronger but still bounded pair depenetration.
replace_once('src/combat/wingman-formation-separation.js',
"""export const WINGMAN_SEPARATION_PAIR_CORRECTION_CAP = 1.25
""",
"""export const WINGMAN_SEPARATION_PAIR_CORRECTION_CAP = 1.8
""")
replace_once('src/combat/wingman-formation-separation.js',
"""  const correctionMagnitude = Math.min(WINGMAN_SEPARATION_PAIR_CORRECTION_CAP, penetration * 0.5)
""",
"""  const correctionMagnitude = Math.min(WINGMAN_SEPARATION_PAIR_CORRECTION_CAP, penetration * 0.65)
""")

# Navigation import gets hysteresis helper.
replace_once('src/combat/wingmen.js',
"""  computeRailCatchupBoost,
  computeRailLongitudinalLag,
""",
"""  computeRailCatchupBoost,
  computeRailLongitudinalLag,
  updateRailCatchupState,
""")

# Radio participant pool excludes retreating ships.
replace_once('src/combat/wingmen.js',
"""  function activeRadioPilotIds() {
    return activeWingmen.map((wingman) => wingman.profile.id)
  }
""",
"""  function activeRadioPilotIds() {
    return activeWingmen.filter((wingman) => wingman.state !== 'retreating').map((wingman) => wingman.profile.id)
  }
""")

# Recovering a profile replaces a still-retreating visual instance instead of being blocked by it.
replace_once('src/combat/wingmen.js',
"""  function recoverMember(profileId, hullStacks = 0) {
    const wingman = spawnMember(profileId)
""",
"""  function recoverMember(profileId, hullStacks = 0) {
    const staleIndex = activeWingmen.findIndex((w) => w.profile.id === profileId && w.state === 'retreating')
    if (staleIndex >= 0) {
      const stale = activeWingmen.splice(staleIndex, 1)[0]
      worldRadio.clearPilot?.(profileId)
      scene.remove(stale.mesh)
      disposeWingmanMesh(stale.mesh)
      stale.laserMaterial?.dispose?.()
      aiValidator.logMechanic('wingman-recovery', 'retreat-instance-replaced', { pilotId: profileId })
    }
    const wingman = spawnMember(profileId)
""")

# Retreat transition: cleanup visuals, pending radio and expose one immediate down edge.
replace_once('src/combat/wingmen.js',
"""    const retreating = w.state === 'retreating'
    if (retreating) {
      const text = wingmanRadio.forceSpeak(w.profile.id, 'retreat', performance.now(), { activePilotIds: activeRadioPilotIds() })
      if (text) pendingRadioMessages.push(buildRadioPayload(w.profile, text, 'retreat'))
    }
""",
"""    const retreating = w.state === 'retreating'
    const enteredRetreat = retreating && !w.retreatDownReported
    if (enteredRetreat) {
      w.retreatDownReported = true
      if (w.auxShieldVisual) w.auxShieldVisual.visible = false
      if (w.damageMaterials && w.damageColors) {
        for (let i = 0; i < w.damageMaterials.length; i += 1) {
          if (w.damageColors[i] && w.damageMaterials[i]?.color) w.damageMaterials[i].color.copy(w.damageColors[i])
        }
      }
      worldRadio.clearPilot?.(w.profile.id)
      wingmanRadio.cancelPendingResponse?.('pilot-retreated')
      for (let i = pendingRadioMessages.length - 1; i >= 0; i -= 1) {
        if (pendingRadioMessages[i]?.pilotId === w.profile.id) pendingRadioMessages.splice(i, 1)
      }
      const text = wingmanRadio.forceSpeak(w.profile.id, 'retreat', performance.now(), { activePilotIds: activeRadioPilotIds() })
      if (text) pendingRadioMessages.push(buildRadioPayload(w.profile, text, 'retreat'))
      aiValidator.logMechanic('wingman-integrity', 'down-reported-immediately', { pilotId: profileId })
    }
""")
replace_once('src/combat/wingmen.js',
"""    return { applied: transition.decision === 'accepted', retreating, hp: w.hp, shield: w.shield }
""",
"""    return { applied: transition.decision === 'accepted', retreating, enteredRetreat, hp: w.hp, shield: w.shield }
""")

# Chain Ram includes Golden, validates readiness, and resolves from the actual segment Falco->target.
replace_once('src/combat/wingmen.js',
"""            if (didHit && chainStacks > 0 && w.chainCount < chainStacks && enemies && enemies.getAlive) {
              let nextTarget = null
              let nextDist = FALCO_CHAIN_RADIUS
              for (const candidate of enemies.getAlive()) {
                if (candidate === target || !candidate.mesh) continue
                const d = w.mesh.position.distanceTo(candidate.mesh.position)
                if (d < nextDist) { nextDist = d; nextTarget = candidate }
              }
""",
"""            if (didHit && chainStacks > 0 && w.chainCount < chainStacks && enemies && enemies.getAlive) {
              let nextTarget = null
              let nextDist = FALCO_CHAIN_RADIUS
              const chainCandidates = [
                ...enemies.getAlive(),
                ...(enemies.getGoldenAlive?.() || []),
              ]
              for (const candidate of chainCandidates) {
                if (candidate === target || !isWingmanCombatTargetReady(candidate, readyCombatTargets)) continue
                const d = w.mesh.position.distanceTo(candidate.mesh.position)
                if (d < nextDist) { nextDist = d; nextTarget = candidate }
              }
""")

# Wingman homing/laser targets invalidate immediately when target leaves gameplay.
text = read('src/combat/wingmen.js')
text = text.replace("if (!laser.homingTarget || laser.homingTarget.dying || !laser.homingTarget.mesh)",
                    "if (!laser.homingTarget || !isWingmanCombatTargetReady(laser.homingTarget))")
write('src/combat/wingmen.js', text)

# Catch-up hysteresis replaces threshold chatter.
replace_once('src/combat/wingmen.js',
"""        const catchupBoost = computeRailCatchupBoost(longitudinalLag)
        if (catchupBoost > 0) _wmDesiredVelocity.addScaledVector(frame.forward, catchupBoost)
        const catchupNow = catchupBoost > 0.01
""",
"""        const catchupNow = updateRailCatchupState(longitudinalLag, w.railCatchupActive)
        const catchupBoost = catchupNow ? computeRailCatchupBoost(Math.max(longitudinalLag, 32)) : 0
        if (catchupBoost > 0) _wmDesiredVelocity.addScaledVector(frame.forward, catchupBoost)
""")

# Avoid formation authority fighting separation while deeply clumped: separation correction wins.
replace_once('src/combat/wingmen.js',
"""      const correctionLength = member.separationCorrection.length()
""",
"""      const correctionLength = member.separationCorrection.length()
""")
# The line above is intentionally a semantic anchor; actual behavior is added after correction application.
replace_once('src/combat/wingmen.js',
"""        member.mesh.position.add(member.separationCorrection)
""",
"""        member.mesh.position.add(member.separationCorrection)
        // Formation attraction yields for this frame while physical depenetration is active.
        member.separationYield = Math.min(0.65, correctionLength / 2.5)
""")
# Reset yield every frame with separation vectors.
replace_once('src/combat/wingmen.js',
"""      member.separationPush.set(0, 0, 0)
      member.separationCorrection.set(0, 0, 0)
""",
"""      member.separationPush.set(0, 0, 0)
      member.separationCorrection.set(0, 0, 0)
      member.separationYield = 0
""")
# Apply yield to formation velocity after target velocity is formed; broad anchor around separation steering.
text = read('src/combat/wingmen.js')
text = text.replace(
"_wmDesiredVelocity.add(w.separationPush)",
"_wmDesiredVelocity.multiplyScalar(1 - (w.separationYield || 0) * 0.35)\n      _wmDesiredVelocity.add(w.separationPush)",
1)
write('src/combat/wingmen.js', text)

# Defensive snapshots: consumers may project/mutate vectors without touching real ship transforms.
text = read('src/combat/wingmen.js')
text = text.replace("worldPos: w.mesh.position, hp: w.hp", "worldPos: w.mesh.position.clone(), hp: w.hp")
text = text.replace("worldPos: w.mesh.position, radius:", "worldPos: w.mesh.position.clone(), radius:")
write('src/combat/wingmen.js', text)

# Public count ignores retreating instances.
replace_once('src/combat/wingmen.js',
"""    getWingmanCount: () => activeWingmen.length,
""",
"""    getWingmanCount: () => activeWingmen.filter((w) => w.state !== 'retreating').length,
""")

# clearSquadron is a real session reset, not just mesh cleanup.
replace_once('src/combat/wingmen.js',
"""      activeSeparationPairs.clear()
      closeSeparationSince.clear()
      reportedFormationClumps.clear()
""",
"""      activeSeparationPairs.clear()
      closeSeparationSince.clear()
      reportedFormationClumps.clear()
      squadronCommandMode = 'free'
      squadronFocusTargets = []
      squadronCommandDurationTimer = 0
      squadronCommandCooldownTimer = 0
      moraleDamageBonus = 0
      chargeHeldTimer = 0
      wasPlayerLowHealth = false
      wasBoostActive = false
      wasHomingCharging = false
      playerRollHistory.length = 0
      abilityCooldownMultByProfileId.fill(1)
      hasPreviousPlayerPosition = false
      previousPlayerPosition.set(0, 0, 0)
""")

print('forgot wingmen migration applied')
