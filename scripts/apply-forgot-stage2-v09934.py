from pathlib import Path

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(path, old, new):
    text = read(path)
    if old not in text:
        raise RuntimeError(f'marker not found in {path}: {old[:140]!r}')
    write(path, text.replace(old, new, 1))


# ---------------------------------------------------------------------------
# Tank overhaul: heavyweight standoff FSM, three attacks, stagger, armor bands.
# ---------------------------------------------------------------------------
write('src/enemies/tank.js', r'''import * as THREE from 'three'
import { spawnPositionForEnemy, enemyInFireRange, POWER_LEVEL_AREA_DAMAGE, POWER_LEVEL_GUIDED_OR_LARGE } from './shared.js'
import { ENEMY_SOUND_CUES, triggerSoundCue } from '../audio-cues.js'
import { aiValidator } from '../ai-validator.js'
import { createStateMachine, ENEMY_STATES } from './state-machine.js'

export const TANK_KIND = 'tank'
export const TANK_COLOR = 0xff9100
export const TANK_HIT_RADIUS = 2.8
export const TANK_DEATH_DURATION = 0.65
export const TANK_DEFAULT_HP = 15
export const TANK_KILL_BONUS = 75
export const TANK_POPULATION_WEIGHT = 2

const TANK_SCALE = 1.35
const TANK_HP_PER_LEVEL = 1.5
const TANK_HP_CAP = 27
const SPAWN_DISTANCE_MIN = 54
const SPAWN_DISTANCE_MAX = 84
const BOX_X = 7
const BOX_Y = 5

const RAIL_STANDOFF = 44
const RAIL_APPROACH_SPEED = 42
const ARENA_STANDOFF_MIN = 30
const ARENA_STANDOFF_MAX = 40
const ARENA_STANDOFF_TARGET = 35
const ARENA_MOVE_SPEED = 20
const BRACE_TIME = 0.42
const TELEGRAPH_TIME = 0.34
const RECOVERY_TIME = 0.62
const REPOSITION_TIME = 0.82
const STAGGER_TIME = 0.65
const STAGGER_IMMUNITY_TIME = 1.65
const RAM_TIME = 0.78
const RAM_SPEED = 58
const RAIL_CYCLES_BEFORE_LEAVE = 3
const LEAVE_SPEED = 38

export const TANK_ATTACKS = Object.freeze({
  SIEGE: 'siege-shot',
  SUPPRESSION: 'suppression-burst',
  RAM: 'heavy-ram',
})

export function tankStatsForLevel(level = 1) {
  const steps = Math.max(0, (level || 1) - 1)
  return { hp: Math.min(TANK_HP_CAP, Math.round(TANK_DEFAULT_HP + steps * TANK_HP_PER_LEVEL)) }
}

export function tankAttackForCycle(cycle = 0) {
  const attacks = [TANK_ATTACKS.SIEGE, TANK_ATTACKS.SUPPRESSION, TANK_ATTACKS.RAM]
  return attacks[Math.abs(Math.trunc(cycle)) % attacks.length]
}

export function tankArmorBand(hp, maxHp) {
  if (!(maxHp > 0) || !(hp > 0)) return 0
  const ratio = hp / maxHp
  if (ratio > 0.66) return 3
  if (ratio > 0.33) return 2
  return 1
}

export function tankShouldLeaveAfterCycle(cycleCount, inArena) {
  return !inArena && cycleCount >= RAIL_CYCLES_BEFORE_LEAVE
}

const bodyGeo = new THREE.BoxGeometry(2.7, 1.25, 3.8)
const sideGeo = new THREE.BoxGeometry(0.65, 0.75, 3.2)
const noseGeo = new THREE.ConeGeometry(1.25, 2.0, 4)
noseGeo.rotateX(Math.PI / 2)
const turretGeo = new THREE.CylinderGeometry(0.72, 0.92, 0.75, 8)
const barrelGeo = new THREE.CylinderGeometry(0.18, 0.22, 2.5, 8)
barrelGeo.rotateX(Math.PI / 2)
const armorGeo = new THREE.BoxGeometry(0.48, 0.34, 1.15)

const bodyMat = new THREE.MeshPhongMaterial({ color: 0x7a3b00, emissive: 0x3b1700, emissiveIntensity: 0.52, flatShading: true })
const armorMat = new THREE.MeshPhongMaterial({ color: TANK_COLOR, emissive: 0x552100, emissiveIntensity: 0.72, flatShading: true })
const darkMat = new THREE.MeshPhongMaterial({ color: 0x2d1a12, emissive: 0x140700, emissiveIntensity: 0.3, flatShading: true })
const coreMat = new THREE.MeshBasicMaterial({ color: 0xffd27a })

const siegeProjectileGeo = new THREE.IcosahedronGeometry(0.62, 1)
const siegeProjectileMat = new THREE.MeshBasicMaterial({ color: 0xff7a18 })
const suppressionProjectileGeo = new THREE.ConeGeometry(0.27, 1.2, 6)
suppressionProjectileGeo.rotateX(Math.PI / 2)
const suppressionProjectileMat = new THREE.MeshBasicMaterial({ color: 0xffc14d })

const _target = new THREE.Vector3()
const _delta = new THREE.Vector3()
const _rel = new THREE.Vector3()
const _away = new THREE.Vector3()
const _ramDir = new THREE.Vector3()
const _tangent = new THREE.Vector3()

function createTankVisual() {
  const root = new THREE.Group()
  const visualGroup = new THREE.Group()
  root.add(visualGroup)

  const body = new THREE.Mesh(bodyGeo, bodyMat)
  visualGroup.add(body)

  const nose = new THREE.Mesh(noseGeo, armorMat)
  nose.position.z = 2.55
  visualGroup.add(nose)

  const sideL = new THREE.Mesh(sideGeo, darkMat)
  sideL.position.x = -1.65
  const sideR = new THREE.Mesh(sideGeo, darkMat)
  sideR.position.x = 1.65
  visualGroup.add(sideL, sideR)

  const turret = new THREE.Mesh(turretGeo, armorMat)
  turret.position.set(0, 0.92, 0.15)
  const barrel = new THREE.Mesh(barrelGeo, armorMat)
  barrel.position.set(0, 0.92, 1.55)
  visualGroup.add(turret, barrel)

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), coreMat)
  core.position.set(0, 0.15, 2.05)
  visualGroup.add(core)

  const armorPanels = []
  const panelSpecs = [
    [-1.25, 0.58, 0.8, 1], [1.25, 0.58, 0.8, 1],
    [-1.25, 0.58, -0.45, 2], [1.25, 0.58, -0.45, 2],
    [-1.25, 0.58, -1.7, 3], [1.25, 0.58, -1.7, 3],
  ]
  for (const [x, y, z, tier] of panelSpecs) {
    const panel = new THREE.Mesh(armorGeo, armorMat)
    panel.position.set(x, y, z)
    panel.userData.armorTier = tier
    visualGroup.add(panel)
    armorPanels.push(panel)
  }
  root.scale.setScalar(TANK_SCALE)
  return { root, visualGroup, armorPanels, core }
}

function updateArmorVisual(enemy) {
  const band = tankArmorBand(enemy.hp, enemy.maxHp)
  if (band === enemy.armorBand) return
  enemy.armorBand = band
  for (const panel of enemy.armorPanels) panel.visible = panel.userData.armorTier <= band
  if (enemy.coreMesh) {
    enemy.coreMesh.scale.setScalar(band === 1 ? 1.45 : band === 2 ? 1.2 : 1)
  }
  aiValidator.logMechanic('tank-armor', 'band-changed', { enemyId: enemy.id, band, hp: enemy.hp, maxHp: enemy.maxHp })
}

function tickTankVisual(enemy, dt) {
  enemy.staggerCooldown = Math.max(0, (enemy.staggerCooldown || 0) - dt)
  enemy.recoilTimer = Math.max(0, (enemy.recoilTimer || 0) - dt)
  if (enemy.visualGroup) {
    const recoilFrac = Math.min(1, enemy.recoilTimer / 0.22)
    enemy.visualGroup.position.z = -0.5 * recoilFrac
  }
  updateArmorVisual(enemy)
}

function moveToward(enemy, target, speed, dt) {
  _delta.copy(target).sub(enemy.mesh.position)
  const dist = _delta.length()
  if (dist <= 1e-5) return 0
  const step = Math.min(dist, Math.max(0, speed) * dt)
  enemy.mesh.position.addScaledVector(_delta, step / dist)
  return dist
}

function updateRailStandoff(enemy, dt, ctx) {
  _target.copy(ctx.frame.position)
    .addScaledVector(ctx.frame.forward, RAIL_STANDOFF)
    .addScaledVector(ctx.frame.right, enemy.screenX)
    .addScaledVector(ctx.frame.up, enemy.screenY)
  moveToward(enemy, _target, RAIL_APPROACH_SPEED, dt)
  enemy.mesh.lookAt(ctx.playerPosition)
}

function updateArenaStandoff(enemy, dt, ctx) {
  _delta.copy(enemy.mesh.position).sub(ctx.playerPosition)
  let dist = _delta.length()
  if (dist < 1e-4) {
    _delta.copy(ctx.frame.forward).negate()
    dist = 1
  } else _delta.multiplyScalar(1 / dist)

  if (dist < ARENA_STANDOFF_MIN || dist > ARENA_STANDOFF_MAX) {
    _target.copy(ctx.playerPosition).addScaledVector(_delta, ARENA_STANDOFF_TARGET)
    moveToward(enemy, _target, ARENA_MOVE_SPEED, dt)
  } else {
    _tangent.crossVectors(ctx.frame.up, _delta)
    if (_tangent.lengthSq() > 1e-6) {
      _tangent.normalize()
      enemy.mesh.position.addScaledVector(_tangent, enemy.strafeSign * 5 * dt)
    }
  }
  enemy.mesh.lookAt(ctx.playerPosition)
}

function updateStandoff(enemy, dt, ctx) {
  if (ctx.inArena) updateArenaStandoff(enemy, dt, ctx)
  else updateRailStandoff(enemy, dt, ctx)
}

function consumePendingStagger(enemy, ctx) {
  if (!enemy.pendingStaggerReason || enemy.fsm.currentState === ENEMY_STATES.STAGGERED || enemy.fsm.currentState === ENEMY_STATES.DISENGAGING) return false
  const reason = enemy.pendingStaggerReason
  enemy.pendingStaggerReason = null
  enemy.ramAttackActive = false
  enemy.attackShotsRemaining = 0
  enemy.fsm.transition(ENEMY_STATES.STAGGERED, { reason }, ctx)
  return true
}

function setProjectileProfile(enemy, kind) {
  if (kind === TANK_ATTACKS.SIEGE) {
    enemy.projectileOpts = {
      geometry: siegeProjectileGeo, material: siegeProjectileMat,
      damage: 3, speed: 20, hitRadius: 2.15, maxRange: 100,
      powerLevel: POWER_LEVEL_AREA_DAMAGE,
    }
  } else {
    enemy.projectileOpts = {
      geometry: suppressionProjectileGeo, material: suppressionProjectileMat,
      damage: 1, speed: 31, hitRadius: 1.25, maxRange: 90,
      powerLevel: POWER_LEVEL_GUIDED_OR_LARGE,
    }
  }
}

function leaveMovement(enemy, dt, ctx) {
  if (ctx.inArena) {
    _away.copy(enemy.mesh.position).sub(ctx.playerPosition)
    if (_away.lengthSq() < 1e-6) _away.copy(ctx.frame.forward)
    _away.normalize().addScaledVector(ctx.frame.up, 0.45).normalize()
    enemy.mesh.position.addScaledVector(_away, LEAVE_SPEED * dt)
    enemy.mesh.lookAt(enemy.mesh.position.clone().add(_away))
    if (enemy.mesh.position.distanceTo(ctx.playerPosition) > 105) ctx.removeEnemy(enemy)
  } else {
    enemy.mesh.position.addScaledVector(ctx.frame.forward, LEAVE_SPEED * dt)
    enemy.mesh.position.addScaledVector(ctx.frame.up, 12 * dt)
    _rel.copy(enemy.mesh.position).sub(ctx.frame.position)
    if (_rel.dot(ctx.frame.forward) > 175 || _rel.dot(ctx.frame.up) > 22) ctx.removeEnemy(enemy)
  }
}

const TANK_STATES = {
  [ENEMY_STATES.SPAWNING]: {
    update(enemy, dt, ctx) {
      tickTankVisual(enemy, dt)
      enemy.fsm.transition(ENEMY_STATES.ENGAGED, null, ctx)
    },
  },

  [ENEMY_STATES.ENGAGED]: {
    update(enemy, dt, ctx) {
      tickTankVisual(enemy, dt)
      if (consumePendingStagger(enemy, ctx)) return
      updateStandoff(enemy, dt, ctx)
      const inRange = ctx.inArena || enemyInFireRange(enemy, ctx)
      if (!inRange) {
        enemy.fireTimer = Math.max(enemy.fireTimer || 0, 0.45)
        return
      }
      enemy.fireTimer = (enemy.fireTimer ?? 0.8) - dt
      if (enemy.fireTimer <= 0) enemy.fsm.transition(ENEMY_STATES.BRACING, null, ctx)
    },
  },

  [ENEMY_STATES.BRACING]: {
    onEnter(enemy) {
      enemy.currentAttack = tankAttackForCycle(enemy.attackCycle)
      enemy.ramAttackActive = false
    },
    update(enemy, dt, ctx) {
      tickTankVisual(enemy, dt)
      if (consumePendingStagger(enemy, ctx)) return
      updateStandoff(enemy, dt, ctx)
      if (enemy.fsm.timeInState >= BRACE_TIME) enemy.fsm.transition(ENEMY_STATES.TELEGRAPHING, null, ctx)
    },
  },

  [ENEMY_STATES.TELEGRAPHING]: {
    onEnter(enemy, ctx) {
      ctx.effects?.telegraph?.(enemy.mesh.position, TANK_COLOR)
      triggerSoundCue(ENEMY_SOUND_CUES.blaster_telegraph, { enemyId: enemy.id, kind: enemy.kind, worldPos: enemy.mesh.position })
    },
    update(enemy, dt, ctx) {
      tickTankVisual(enemy, dt)
      if (consumePendingStagger(enemy, ctx)) return
      updateStandoff(enemy, dt, ctx)
      if (enemy.fsm.timeInState >= TELEGRAPH_TIME) enemy.fsm.transition(ENEMY_STATES.ATTACKING, null, ctx)
    },
  },

  [ENEMY_STATES.ATTACKING]: {
    onEnter(enemy, ctx) {
      const kind = enemy.currentAttack || tankAttackForCycle(enemy.attackCycle)
      enemy.recoilTimer = 0.22
      enemy.attackShotTimer = 0
      if (kind === TANK_ATTACKS.SIEGE) {
        setProjectileProfile(enemy, kind)
        ctx.fireEnemyProjectile(enemy, ctx.playerPosition)
        enemy.attackShotsRemaining = 0
      } else if (kind === TANK_ATTACKS.SUPPRESSION) {
        setProjectileProfile(enemy, kind)
        enemy.attackShotsRemaining = 4
      } else {
        enemy.ramAttackActive = true
        _ramDir.copy(ctx.playerPosition).sub(enemy.mesh.position)
        if (_ramDir.lengthSq() < 1e-6) _ramDir.copy(ctx.frame.forward).negate()
        enemy.ramDirection.copy(_ramDir.normalize())
      }
      aiValidator.logMechanic('tank-attack', kind, { enemyId: enemy.id, cycle: enemy.attackCycle, inArena: ctx.inArena })
    },
    onExit(enemy) {
      enemy.ramAttackActive = false
      enemy.attackShotsRemaining = 0
    },
    update(enemy, dt, ctx) {
      tickTankVisual(enemy, dt)
      if (consumePendingStagger(enemy, ctx)) return
      const kind = enemy.currentAttack
      if (kind === TANK_ATTACKS.RAM) {
        enemy.mesh.position.addScaledVector(enemy.ramDirection, RAM_SPEED * dt)
        enemy.mesh.lookAt(ctx.playerPosition)
        if (enemy.fsm.timeInState >= RAM_TIME) enemy.fsm.transition(ENEMY_STATES.RECOVERY, null, ctx)
        return
      }
      if (kind === TANK_ATTACKS.SUPPRESSION) {
        enemy.attackShotTimer -= dt
        if (enemy.attackShotsRemaining > 0 && enemy.attackShotTimer <= 0) {
          const spreadIndex = 4 - enemy.attackShotsRemaining
          const spread = [-0.16, -0.055, 0.055, 0.16][spreadIndex]
          ctx.fireEnemyProjectile(enemy, ctx.playerPosition, spread)
          enemy.attackShotsRemaining -= 1
          enemy.attackShotTimer = 0.13
          enemy.recoilTimer = 0.16
        }
        if (enemy.attackShotsRemaining <= 0 && enemy.fsm.timeInState >= 0.5) enemy.fsm.transition(ENEMY_STATES.RECOVERY, null, ctx)
        return
      }
      if (enemy.fsm.timeInState >= 0.12) enemy.fsm.transition(ENEMY_STATES.RECOVERY, null, ctx)
    },
  },

  [ENEMY_STATES.RECOVERY]: {
    update(enemy, dt, ctx) {
      tickTankVisual(enemy, dt)
      if (consumePendingStagger(enemy, ctx)) return
      updateStandoff(enemy, dt, ctx)
      if (enemy.fsm.timeInState >= RECOVERY_TIME) enemy.fsm.transition(ENEMY_STATES.REPOSITIONING, null, ctx)
    },
  },

  [ENEMY_STATES.REPOSITIONING]: {
    onEnter(enemy) {
      enemy.strafeSign *= -1
    },
    update(enemy, dt, ctx) {
      tickTankVisual(enemy, dt)
      if (consumePendingStagger(enemy, ctx)) return
      if (!ctx.inArena) enemy.screenX = THREE.MathUtils.clamp(enemy.screenX + enemy.strafeSign * 4.5 * dt, -7, 7)
      updateStandoff(enemy, dt, ctx)
      if (enemy.fsm.timeInState < REPOSITION_TIME) return
      enemy.cycleCount += 1
      enemy.attackCycle += 1
      if (tankShouldLeaveAfterCycle(enemy.cycleCount, ctx.inArena)) {
        enemy.disengaging = true
        enemy.fsm.transition(ENEMY_STATES.DISENGAGING, null, ctx)
      } else {
        enemy.fireTimer = Math.max(0.75, ctx.randomEnemyFireInterval() * 0.65)
        enemy.fsm.transition(ENEMY_STATES.ENGAGED, null, ctx)
      }
    },
  },

  [ENEMY_STATES.STAGGERED]: {
    onEnter(enemy, ctx, payload) {
      enemy.ramAttackActive = false
      enemy.attackShotsRemaining = 0
      ctx.effects?.shockwave?.(enemy.mesh.position, 0xffc14d, 0.7)
      aiValidator.logMechanic('tank-stagger', 'entered', { enemyId: enemy.id, reason: payload?.reason || 'unknown' })
    },
    update(enemy, dt, ctx) {
      tickTankVisual(enemy, dt)
      enemy.visualGroup.rotation.z = Math.sin(enemy.fsm.timeInState * 38) * 0.06
      if (enemy.fsm.timeInState >= STAGGER_TIME) {
        enemy.visualGroup.rotation.z = 0
        enemy.fsm.transition(ENEMY_STATES.REPOSITIONING, null, ctx)
      }
    },
  },

  [ENEMY_STATES.DISENGAGING]: {
    onEnter(enemy) {
      enemy.ramAttackActive = false
      enemy.fireTimer = Infinity
    },
    update(enemy, dt, ctx) {
      tickTankVisual(enemy, dt)
      leaveMovement(enemy, dt, ctx)
    },
  },
}

export function spawnTankEnemy(scene, rail, id, hp = TANK_DEFAULT_HP) {
  const position = spawnPositionForEnemy(rail, SPAWN_DISTANCE_MIN, SPAWN_DISTANCE_MAX, BOX_X, BOX_Y)
  const { root, visualGroup, armorPanels, core } = createTankVisual()
  root.position.copy(position)
  scene.add(root)

  const frame = rail.getSpawnFrame()
  _rel.copy(position).sub(frame.position)
  const enemy = {
    id,
    mesh: root,
    visualGroup,
    armorPanels,
    coreMesh: core,
    kind: TANK_KIND,
    scale: TANK_SCALE,
    dying: false,
    deathT: 0,
    hp,
    maxHp: hp,
    fireTimer: null,
    shotsFired: 0,
    disengaging: false,
    screenX: THREE.MathUtils.clamp(_rel.dot(frame.right), -7, 7),
    screenY: THREE.MathUtils.clamp(_rel.dot(frame.up), -3, 5),
    attackCycle: 0,
    cycleCount: 0,
    currentAttack: null,
    attackShotsRemaining: 0,
    attackShotTimer: 0,
    ramAttackActive: false,
    ramDirection: new THREE.Vector3(),
    strafeSign: id % 2 === 0 ? 1 : -1,
    recoilTimer: 0,
    staggerCooldown: 0,
    pendingStaggerReason: null,
    armorBand: 3,
  }
  enemy.requestStagger = (reason = 'external') => {
    if (enemy.dying || enemy.disengaging || enemy.staggerCooldown > 0 || enemy.fsm?.currentState === ENEMY_STATES.STAGGERED) return false
    enemy.pendingStaggerReason = reason
    enemy.staggerCooldown = STAGGER_IMMUNITY_TIME
    return true
  }
  enemy.fsm = createStateMachine(enemy, TANK_STATES, ENEMY_STATES.SPAWNING)
  return enemy
}

export function disposeTank() {
  bodyGeo.dispose()
  sideGeo.dispose()
  noseGeo.dispose()
  turretGeo.dispose()
  barrelGeo.dispose()
  armorGeo.dispose()
  siegeProjectileGeo.dispose()
  suppressionProjectileGeo.dispose()
  bodyMat.dispose()
  armorMat.dispose()
  darkMat.dispose()
  coreMat.dispose()
  siegeProjectileMat.dispose()
  suppressionProjectileMat.dispose()
}
''')

# Tank manages its own lifecycle; generic 4-shot disengage must no longer force it out.
replace_once('src/enemies/index.js',
'''      if (enemy.shotsFired >= disengageAtShots && (enemy.kind === BLASTER_KIND || enemy.kind === TANK_KIND || enemy.kind === HORDA_KIND)) {
''',
'''      if (enemy.shotsFired >= disengageAtShots && (enemy.kind === BLASTER_KIND || enemy.kind === HORDA_KIND)) {
''')

# Heavy Ram is intentionally a tier-3 physical impact while ordinary Tank contact stays tier 2.
replace_once('src/enemies/index.js',
'''      case TANK_KIND:
      case TIME_KIND:
      case SENTINELA_KIND:
      case VERME_KIND:
      case HORDA_KIND: return 2
''',
'''      case TANK_KIND: return enemy.ramAttackActive ? 3 : 2
      case TIME_KIND:
      case SENTINELA_KIND:
      case VERME_KIND:
      case HORDA_KIND: return 2
''')

# Preserve generic projectile damage separately from Sentinel's two-channel payload.
replace_once('src/enemies/index.js',
'''      return {
        hits: p.hits + l.hits + g.hits,
        damage: Math.max(p.damage, l.damage, g.damage),
        shieldDamage: g.hits > 0 ? g.shieldDamage : 0,
        hullDamage: g.hits > 0 ? g.hullDamage : 0,
''',
'''      return {
        hits: p.hits + l.hits + g.hits,
        damage: Math.max(p.damage, l.damage, g.damage),
        genericDamage: Math.max(p.hits > 0 ? p.damage : 0, l.hits > 0 ? l.damage : 0),
        shieldDamage: g.hits > 0 ? g.shieldDamage : 0,
        hullDamage: g.hits > 0 ? g.hullDamage : 0,
''')

# ---------------------------------------------------------------------------
# Player: pure channel resolver + stateful application for Sentinel 4 shield / 2 hull.
# ---------------------------------------------------------------------------
replace_once('src/player.js',
'''// estado do JOGADOR: vida/vidas, escudo, invencibilidade, boost, cooldowns e os stats que as
// cartas roguelike mutam (projectileCount, fireCooldown, aimAssistAngle, homingMaxTargets...).
// Não inclui posição/movimento (rail.js), nem projéteis/armas de verdade (combat.js) — só o
// estado "de personagem" que main.js consultava direto antes desta refatoração.
export function createPlayerSystem(session) {
''',
'''export function resolveDamageChannels({ temporaryShield = 0, shield = 0, shieldDamage = 0, hullDamage = 0 } = {}) {
  let temp = Math.max(0, Number(temporaryShield) || 0)
  let regular = Math.max(0, Number(shield) || 0)
  let remainingShieldDamage = Math.max(0, Number(shieldDamage) || 0)
  const hullPayload = Math.max(0, Number(hullDamage) || 0)
  const hadShieldChannel = remainingShieldDamage > 0 && (temp > 0 || regular > 0)

  const absorbedTemporary = Math.min(temp, remainingShieldDamage)
  temp -= absorbedTemporary
  remainingShieldDamage -= absorbedTemporary
  const absorbedRegular = Math.min(regular, remainingShieldDamage)
  regular -= absorbedRegular
  remainingShieldDamage -= absorbedRegular

  const shieldBroke = hadShieldChannel && temp + regular <= 0
  const hullDamageApplied = (!hadShieldChannel || shieldBroke) ? hullPayload : 0
  return {
    temporaryShield: temp,
    shield: regular,
    absorbedTemporary,
    absorbedRegular,
    absorbedByShield: absorbedTemporary + absorbedRegular > 0,
    shieldBroke,
    hullDamageApplied,
  }
}

// estado do JOGADOR: vida/vidas, escudo, invencibilidade, boost, cooldowns e os stats que as
// cartas roguelike mutam (projectileCount, fireCooldown, aimAssistAngle, homingMaxTargets...).
// Não inclui posição/movimento (rail.js), nem projéteis/armas de verdade (combat.js) — só o
// estado "de personagem" que main.js consultava direto antes desta refatoração.
export function createPlayerSystem(session) {
''')

replace_once('src/player.js',
'''      return { absorbedByShield: absorbedByShield || absorbedByTemporaryShield, absorbedByTemporaryShield, shieldBroke, outOfLives }
    },

    applyHealthLoss,
''',
'''      return { absorbedByShield: absorbedByShield || absorbedByTemporaryShield, absorbedByTemporaryShield, shieldBroke, outOfLives }
    },

    takeDamageChannels({ shieldDamage = 0, hullDamage = 0 } = {}) {
      if (invincibleTimer > 0) {
        return { hit: false, absorbedByShield: false, absorbedByTemporaryShield: false, shieldBroke: false, outOfLives: false, hullDamageApplied: 0 }
      }
      const resolved = resolveDamageChannels({
        temporaryShield: temporaryShieldValue,
        shield: shieldValue,
        shieldDamage,
        hullDamage,
      })
      const shieldWasTouched = resolved.absorbedByShield
      if (shieldWasTouched) shieldRegenDelayTimer = shieldRegenDelayMs + (wrongAnswerCount >= 3 ? 150 : 0)
      temporaryShieldValue = resolved.temporaryShield
      shieldValue = resolved.shield

      aiValidator.expect(
        'Dano por canais preserva escudo temporário/normal dentro dos limites',
        () => temporaryShieldValue >= 0 && temporaryShieldValue <= PEPPY_GUARD_EXTRA_STACKS_CAP && shieldValue >= 0 && shieldValue <= shieldMax,
        { shieldDamage, hullDamage, temporaryShieldValue, shieldValue, shieldMax },
      )

      if (shieldWasTouched) {
        triggerSoundCue(resolved.shieldBroke ? PLAYER_SOUND_CUES.shield_break : PLAYER_SOUND_CUES.shield_absorb, {
          remainingShield: shieldValue, damage: shieldDamage,
        })
      }

      let outOfLives = false
      if (resolved.hullDamageApplied > 0) {
        invincibleTimer = Math.max(invincibleTimer, invincibilityDurationMs)
        session.health = Math.max(0, session.health - resolved.hullDamageApplied)
        outOfLives = applyHealthLoss()
        triggerSoundCue(PLAYER_SOUND_CUES.hull_damage, {
          damage: resolved.hullDamageApplied, health: session.health, lives: session.lives,
        })
        if (session.health <= 0) {
          triggerSoundCue(outOfLives ? PLAYER_SOUND_CUES.game_over : PLAYER_SOUND_CUES.life_lost,
            outOfLives ? { score: session.score || 0 } : { livesRemaining: session.lives })
        }
      }

      const hit = shieldWasTouched || resolved.hullDamageApplied > 0
      telemetry?.recordEvent('damage', `Dano por canais: escudo ${shieldDamage}, casco ${hullDamage}`, {
        shieldDamage, hullDamage, hullDamageApplied: resolved.hullDamageApplied,
        absorbedByShield: shieldWasTouched, shieldBroke: resolved.shieldBroke,
        health: session.health, lives: session.lives,
      })
      aiValidator.logMechanic('sentinela-damage-channels', 'resolved', {
        shieldDamage, hullDamage, hullDamageApplied: resolved.hullDamageApplied,
        shieldBroke: resolved.shieldBroke, remainingShield: shieldValue,
      })
      return {
        hit,
        absorbedByShield: shieldWasTouched,
        absorbedByTemporaryShield: resolved.absorbedTemporary > 0,
        shieldBroke: resolved.shieldBroke,
        outOfLives,
        hullDamageApplied: resolved.hullDamageApplied,
      }
    },

    applyHealthLoss,
''')

# ---------------------------------------------------------------------------
# Combat orchestration: channel payload, immediate wingman-down, real-time Swirl dt, wobble restore.
# ---------------------------------------------------------------------------
replace_once('src/combat/index.js',
'''    applySpawnWobbles: () => enemies.applySpawnWobbles(),
''',
'''    applySpawnWobbles: () => enemies.applySpawnWobbles(),
    restoreSpawnWobbles: () => enemies.restoreSpawnWobbles?.(),
''')

replace_once('src/combat/index.js',
'''        hitSparkColor: (squadron.getMoraleDamageBonus?.() || 0) > 0 ? 0x39ff6a : undefined,
      })
''',
'''        hitSparkColor: (squadron.getMoraleDamageBonus?.() || 0) > 0 ? 0x39ff6a : undefined,
        swirlDt: opts.swirlProjectileDt,
      })
''')

replace_once('src/combat/index.js',
'''      let enemyDamage = 1
      // Nível de poder do maior hit de PROJÉTIL/laser/moldura no frame (ver PROJECTILE_POWER_LEVEL
''',
'''      let enemyDamage = 1
      let enemyGenericDamage = 0
      let enemyShieldDamage = 0
      let enemyHullDamage = 0
      // Nível de poder do maior hit de PROJÉTIL/laser/moldura no frame (ver PROJECTILE_POWER_LEVEL
''')

replace_once('src/combat/index.js',
'''        for (const profileId of projResult.wingmanHitIds || []) {
          const hit = squadron.applyDamageToWingman?.(profileId)
          if (hit?.applied) effects?.hitSpark?.(wingmanTargets.find((target) => target.id === profileId)?.worldPos || playerPosition, 0xff5a24)
        }
''',
'''        for (const profileId of projResult.wingmanHitIds || []) {
          const hit = squadron.applyDamageToWingman?.(profileId)
          if (hit?.applied) effects?.hitSpark?.(wingmanTargets.find((target) => target.id === profileId)?.worldPos || playerPosition, 0xff5a24)
          if (hit?.enteredRetreat) player.markWingmanDown?.(profileId)
        }
''')

replace_once('src/combat/index.js',
'''        if (projResult.hits > 0) {
          enemyDamage = Math.max(enemyDamage, projResult.damage)
          enemyHitPowerLevel = Math.max(enemyHitPowerLevel, projResult.powerLevel)
        }
''',
'''        if (projResult.hits > 0) {
          enemyDamage = Math.max(enemyDamage, projResult.damage)
          enemyGenericDamage = Math.max(enemyGenericDamage, projResult.genericDamage || 0)
          enemyShieldDamage = Math.max(enemyShieldDamage, projResult.shieldDamage || 0)
          enemyHullDamage = Math.max(enemyHullDamage, projResult.hullDamage || 0)
          enemyHitPowerLevel = Math.max(enemyHitPowerLevel, projResult.powerLevel)
        }
''')

replace_once('src/combat/index.js',
'''        enemyDamage,
        enemyHitPowerLevel,
''',
'''        enemyDamage,
        enemyGenericDamage,
        enemyShieldDamage,
        enemyHullDamage,
        enemyHitPowerLevel,
''')

# ---------------------------------------------------------------------------
# Game loop: Swirl ignores its own cinematic time scale; Sentinel keeps 4/2 channels; wobble is
# strictly render-only and is restored immediately after renderer.render().
# ---------------------------------------------------------------------------
replace_once('src/game-loop.js',
'''    const baseDt = state.debugFlags.slowMoActive ? rawDt * 0.25 : rawDt
''',
'''    const baseDt = state.debugFlags.slowMoActive ? rawDt * 0.25 : rawDt
    const swirlCinematicActive = state.swirlSlowMoMs > 0
''')

replace_once('src/game-loop.js',
'''      isDenseFog,
    })
''',
'''      isDenseFog,
      // O mundo desacelera no super-ataque, mas o projétil Swirl conserva velocidade em tempo
      // real. O slow-mo de DEBUG continua vencendo para manter a ferramenta previsível.
      swirlProjectileDt: state.debugFlags.slowMoActive ? dt : (swirlCinematicActive ? rawDt : dt),
    })
''')

replace_once('src/game-loop.js',
'''      const result = player.takeDamage(Math.max(state.enemyDamageValue, events.enemyDamage || 1))
''',
'''      const hasChannelDamage = (events.enemyShieldDamage || 0) > 0 || (events.enemyHullDamage || 0) > 0
      const result = hasChannelDamage && player.takeDamageChannels
        ? player.takeDamageChannels({
            shieldDamage: events.enemyShieldDamage || 0,
            hullDamage: events.enemyHullDamage || 0,
          })
        : player.takeDamage(Math.max(state.enemyDamageValue, events.enemyDamage || 1))
''')

replace_once('src/game-loop.js',
'''    combat.applySpawnWobbles?.()
    renderer.render(scene, camera)
''',
'''    combat.applySpawnWobbles?.()
    try {
      renderer.render(scene, camera)
    } finally {
      combat.restoreSpawnWobbles?.()
    }
''')

# ---------------------------------------------------------------------------
# Damage feedback: zero-damage environmental contacts are not "confirmed damage" failures.
# ---------------------------------------------------------------------------
write('src/combat/damage-feedback.js', r'''import { aiValidator } from '../ai-validator.js'

// Canal exclusivamente visual. Não participa de pontos, combo, kills ou IA.
export function createDamageFeedback(hit, damage, { pilotId = null, charged = false, instant = false, sourceKind = null } = {}) {
  if (!hit || hit.blocked) return null
  const resolvedSourceKind = sourceKind || hit.sourceKind || (pilotId == null ? (hit.kind === 'detrito' ? 'environment' : 'player') : 'wingman')
  if (!Number.isFinite(damage) || damage <= 0) {
    aiValidator.logMechanic('damage-feedback', 'ignored-non-damage', {
      damage, pilotId, kind: hit.kind ?? null, sourceKind: resolvedSourceKind,
    })
    return null
  }
  const valid = !!hit.worldPos && [hit.worldPos.x, hit.worldPos.y, hit.worldPos.z].every(Number.isFinite)
    && (pilotId === null || (Number.isInteger(pilotId) && pilotId >= 0 && pilotId <= 3))
    && typeof resolvedSourceKind === 'string' && resolvedSourceKind.length > 0
  aiValidator.expect('Feedback de dano confirmado tem valor, posição e origem válidos', () => valid,
    { damage, pilotId, kind: hit.kind, sourceKind: resolvedSourceKind })
  if (!valid) return null
  const targetPosition = hit.meshRef?.position
  const targetPositionValid = targetPosition && [targetPosition.x, targetPosition.y, targetPosition.z].every(Number.isFinite)
  return {
    worldPos: hit.worldPos.clone(),
    targetWorldPos: targetPositionValid && typeof targetPosition.clone === 'function' ? targetPosition.clone() : hit.worldPos.clone(),
    targetId: hit.meshRef?.uuid ?? null, kind: hit.kind ?? null,
    targetMaxHp: Number.isFinite(hit.targetMaxHp) ? hit.targetMaxHp : null,
    damage, pilotId, sourceKind: resolvedSourceKind, charged, instant, killed: !!hit.killed,
    points: hit.enemyKillPoints || hit.points || 0,
  }
}
''')

# ---------------------------------------------------------------------------
# Focused regression tests for stage 2.
# ---------------------------------------------------------------------------
write('src/tank.test.mjs', r'''import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  TANK_ATTACKS, TANK_DEATH_DURATION, TANK_HIT_RADIUS, TANK_KILL_BONUS, TANK_POPULATION_WEIGHT,
  spawnTankEnemy, tankArmorBand, tankAttackForCycle, tankShouldLeaveAfterCycle, tankStatsForLevel,
} from './enemies/tank.js'

assert.equal(TANK_HIT_RADIUS, 2.8)
assert.equal(TANK_DEATH_DURATION, 0.65)
assert.equal(TANK_KILL_BONUS, 75)
assert.equal(TANK_POPULATION_WEIGHT, 2)
assert.deepEqual([tankAttackForCycle(0), tankAttackForCycle(1), tankAttackForCycle(2)], [TANK_ATTACKS.SIEGE, TANK_ATTACKS.SUPPRESSION, TANK_ATTACKS.RAM])
assert.equal(tankAttackForCycle(3), TANK_ATTACKS.SIEGE)
assert.deepEqual(tankStatsForLevel(1), { hp: 15 })
assert.deepEqual(tankStatsForLevel(9), { hp: 27 })
assert.equal(tankArmorBand(15, 15), 3)
assert.equal(tankArmorBand(8, 15), 2)
assert.equal(tankArmorBand(2, 15), 1)
assert.equal(tankShouldLeaveAfterCycle(3, false), true)
assert.equal(tankShouldLeaveAfterCycle(99, true), false)

const scene = new THREE.Scene()
const frame = {
  position: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, 1),
  right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0),
}
const rail = {
  isArena: () => false,
  getSpawnFrame: () => frame,
  getFrameAt: () => frame,
  getPlayerPosition: () => new THREE.Vector3(),
}
const tank = spawnTankEnemy(scene, rail, 7, 15)
assert.ok(tank.visualGroup?.isGroup && tank.armorPanels.length === 6)
assert.equal(tank.requestStagger('swirl'), true)
assert.equal(tank.requestStagger('swirl-again'), false, 'anti stun-lock blocks a second stagger inside immunity')
console.log('tank.test.mjs: 15 assertions passed')
''')

write('src/forgot-stage2.test.mjs', r'''import assert from 'node:assert/strict'
import { resolveDamageChannels } from './player.js'
import { createDamageFeedback } from './combat/damage-feedback.js'
import * as THREE from 'three'

let r = resolveDamageChannels({ shield: 5, shieldDamage: 4, hullDamage: 2 })
assert.equal(r.shield, 1)
assert.equal(r.hullDamageApplied, 0)
assert.equal(r.shieldBroke, false)

r = resolveDamageChannels({ temporaryShield: 1, shield: 2, shieldDamage: 4, hullDamage: 2 })
assert.equal(r.temporaryShield, 0)
assert.equal(r.shield, 0)
assert.equal(r.shieldBroke, true)
assert.equal(r.hullDamageApplied, 2)

r = resolveDamageChannels({ shield: 0, shieldDamage: 4, hullDamage: 2 })
assert.equal(r.hullDamageApplied, 2)

const worldPos = new THREE.Vector3(1, 2, 3)
assert.equal(createDamageFeedback({ worldPos, kind: 'detrito', sourceKind: 'environment' }, 0), null)
const feedback = createDamageFeedback({ worldPos, kind: 'tank' }, 3)
assert.equal(feedback.damage, 3)
assert.equal(feedback.sourceKind, 'player')
console.log('forgot-stage2.test.mjs: damage-channel and feedback regressions passed')
''')

# Keep the focused tests inside the canonical selftest as well.
replace_once('src/selftest.mjs',
'''import './miyu-assist-locks.test.mjs'
''',
'''import './miyu-assist-locks.test.mjs'
import './tank.test.mjs'
import './forgot-stage2.test.mjs'
''')

print('forgot stage 2 migration applied')
