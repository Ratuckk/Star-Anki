import * as THREE from 'three'
import { spawnPositionForEnemy, enemyInFireRange, POWER_LEVEL_AREA_DAMAGE, POWER_LEVEL_GUIDED_OR_LARGE } from './shared.js'
import { ENEMY_SOUND_CUES, triggerSoundCue } from '../audio-cues.js'
import { aiValidator } from '../ai-validator.js'
import { createStateMachine, ENEMY_STATES } from './state-machine.js'

export const TANK_KIND = 'tank'
export const TANK_COLOR = 0xff9100
// Hitbox autoritativa da Fase 3: 4.48 (2.8 * 1.6)
export const TANK_HIT_RADIUS = 4.48
export const TANK_DEATH_DURATION = 0.65
export const TANK_DEFAULT_HP = 15
export const TANK_KILL_BONUS = 75
export const TANK_POPULATION_WEIGHT = 2

// Bounding box final ~1.60x maior que a silhueta antiga
export const TANK_SCALE = 2.16
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

// ============ GEOMETRIAS DO TANK OVERHAUL (FASE 3) ============
// Silhueta intencional de unidade pesada:
// 1. Casco central largo e inclinado
// 2. Proa blindada angulada
// 3. Painéis laterais assimétricos (bulwark blindado à esquerda, gerador/sponson à direita)
// 4. Torre elevada com anel e canhão pesado reconhecível
// 5. Motores traseiros com tubeira emissiva
// 6. Núcleo de energia e sensores

const bodyGeo = new THREE.CylinderGeometry(1.6, 2.3, 3.8, 6)
bodyGeo.rotateX(Math.PI / 2)

const noseGeo = new THREE.ConeGeometry(1.5, 2.4, 5)
noseGeo.rotateX(Math.PI / 2)

// Painéis laterais assimétricos
const sideLGeo = new THREE.BoxGeometry(0.85, 1.15, 3.6) // Bulwark esquerdo
const sideRGeo = new THREE.CylinderGeometry(0.55, 0.75, 3.4, 5) // Gerador/sponson direito
sideRGeo.rotateX(Math.PI / 2)

// Torre elevada com canhão pesado duplo
const turretGeo = new THREE.CylinderGeometry(0.95, 1.25, 0.85, 8)
const turretRingGeo = new THREE.CylinderGeometry(1.3, 1.35, 0.35, 8)
const barrelGeo = new THREE.CylinderGeometry(0.24, 0.32, 3.2, 8)
barrelGeo.rotateX(Math.PI / 2)
const muzzleGeo = new THREE.CylinderGeometry(0.38, 0.35, 0.65, 8)
muzzleGeo.rotateX(Math.PI / 2)

// Motores e propulsores traseiros
const thrusterGeo = new THREE.CylinderGeometry(0.42, 0.52, 1.1, 8)
thrusterGeo.rotateX(Math.PI / 2)

const armorGeo = new THREE.BoxGeometry(0.65, 0.42, 1.35)

const bodyMat = new THREE.MeshPhongMaterial({ color: 0x7a3b00, emissive: 0x3b1700, emissiveIntensity: 0.52, flatShading: true })
const armorMat = new THREE.MeshPhongMaterial({ color: TANK_COLOR, emissive: 0x552100, emissiveIntensity: 0.72, flatShading: true })
const darkMat = new THREE.MeshPhongMaterial({ color: 0x2d1a12, emissive: 0x140700, emissiveIntensity: 0.3, flatShading: true })
const coreMat = new THREE.MeshBasicMaterial({ color: 0xffd27a })
const thrusterMat = new THREE.MeshPhongMaterial({ color: 0x221105, emissive: 0xff4400, emissiveIntensity: 0.85, flatShading: true })

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
  nose.position.z = 2.4
  visualGroup.add(nose)

  const sideL = new THREE.Mesh(sideLGeo, darkMat)
  sideL.position.set(-1.85, 0.05, 0)
  const sideR = new THREE.Mesh(sideRGeo, darkMat)
  sideR.position.set(1.85, 0.05, 0)
  visualGroup.add(sideL, sideR)

  // Torre elevada com tracking independente
  const turretGroup = new THREE.Group()
  turretGroup.position.set(0, 1.1, 0.2)
  const ring = new THREE.Mesh(turretRingGeo, darkMat)
  ring.position.y = -0.25
  const turret = new THREE.Mesh(turretGeo, armorMat)
  const barrel = new THREE.Mesh(barrelGeo, armorMat)
  barrel.position.set(0, 0.1, 1.7)
  const muzzle = new THREE.Mesh(muzzleGeo, darkMat)
  muzzle.position.set(0, 0.1, 3.1)
  turretGroup.add(ring, turret, barrel, muzzle)
  visualGroup.add(turretGroup)

  // Motores traseiros
  const thrusterL = new THREE.Mesh(thrusterGeo, thrusterMat)
  thrusterL.position.set(-0.85, 0.15, -2.1)
  const thrusterR = new THREE.Mesh(thrusterGeo, thrusterMat)
  thrusterR.position.set(0.85, 0.15, -2.1)
  visualGroup.add(thrusterL, thrusterR)

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.44, 10, 8), coreMat)
  core.position.set(0, 0.2, 1.8)
  visualGroup.add(core)

  const armorPanels = []
  const panelSpecs = [
    [-1.4, 0.65, 1.1, 1], [1.4, 0.65, 1.1, 1],
    [-1.4, 0.65, -0.3, 2], [1.4, 0.65, -0.3, 2],
    [-1.4, 0.65, -1.5, 3], [1.4, 0.65, -1.5, 3],
  ]
  for (const [x, y, z, tier] of panelSpecs) {
    const panel = new THREE.Mesh(armorGeo, armorMat)
    panel.position.set(x, y, z)
    panel.userData.armorTier = tier
    visualGroup.add(panel)
    armorPanels.push(panel)
  }
  root.scale.setScalar(TANK_SCALE)
  return { root, visualGroup, armorPanels, core, turretGroup }
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

export function updateRailStandoff(enemy, dt, ctx) {
  enemy.moveTimer = (enemy.moveTimer || 0) + dt
  // Deslocamento horizontal amplo entre -10u e +10u, vertical entre -4u e +4u (Fase 3.7)
  const targetX = Math.sin(enemy.moveTimer * 0.95 + (enemy.id || 0) * 1.7) * 9.5
  const targetY = Math.cos(enemy.moveTimer * 0.75 + (enemy.id || 0)) * 3.8
  const lerpAlpha = Math.min(1, dt * 5.0)
  enemy.screenX = THREE.MathUtils.lerp(enemy.screenX, targetX, lerpAlpha)
  enemy.screenY = THREE.MathUtils.lerp(enemy.screenY, targetY, lerpAlpha)

  _target.copy(ctx.frame.position)
    .addScaledVector(ctx.frame.forward, RAIL_STANDOFF)
    .addScaledVector(ctx.frame.right, enemy.screenX)
    .addScaledVector(ctx.frame.up, enemy.screenY)
  moveToward(enemy, _target, RAIL_APPROACH_SPEED, dt)

  // Casco aponta na direção geral com roll suave
  enemy.mesh.lookAt(ctx.playerPosition)
  if (enemy.visualGroup) {
    enemy.visualGroup.rotation.z = -(targetX - enemy.screenX) * 0.05
  }
  // Torre acompanha o jogador de forma independente
  if (enemy.turretGroup) {
    enemy.turretGroup.lookAt(ctx.playerPosition)
  }
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
  if (enemy.turretGroup) {
    enemy.turretGroup.lookAt(ctx.playerPosition)
  }
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
      if (kind === TANK_ATTACKS.RAM) {
        enemy.ramAttackActive = true
        _ramDir.copy(ctx.playerPosition).sub(enemy.mesh.position).normalize()
        if (_ramDir.lengthSq() < 1e-4) _ramDir.copy(ctx.frame.forward).negate()
        enemy.ramDirection.copy(_ramDir)
        enemy.mesh.lookAt(enemy.mesh.position.clone().add(_ramDir))
        triggerSoundCue(ENEMY_SOUND_CUES.tank_ram_charge, { enemyId: enemy.id, kind: enemy.kind, worldPos: enemy.mesh.position })
      } else if (kind === TANK_ATTACKS.SIEGE) {
        setProjectileProfile(enemy, kind)
        enemy.attackShotsRemaining = 1
      } else {
        setProjectileProfile(enemy, kind)
        enemy.attackShotsRemaining = 3
      }
    },
    update(enemy, dt, ctx) {
      tickTankVisual(enemy, dt)
      if (consumePendingStagger(enemy, ctx)) return
      const kind = enemy.currentAttack || tankAttackForCycle(enemy.attackCycle)
      if (kind === TANK_ATTACKS.RAM) {
        enemy.mesh.position.addScaledVector(enemy.ramDirection, RAM_SPEED * dt)
        if (enemy.mesh.position.distanceTo(ctx.playerPosition) < 4.0) {
          enemy.fsm.transition(ENEMY_STATES.RECOVERING, null, ctx)
          return
        }
        if (enemy.fsm.timeInState >= RAM_TIME) {
          enemy.fsm.transition(ENEMY_STATES.RECOVERING, null, ctx)
        }
        return
      }

      updateStandoff(enemy, dt, ctx)
      enemy.attackShotTimer -= dt
      if (enemy.attackShotsRemaining > 0 && enemy.attackShotTimer <= 0) {
        enemy.attackShotsRemaining -= 1
        enemy.attackShotTimer = 0.14
        enemy.recoilTimer = 0.22
        ctx.fireEnemyProjectile(enemy, ctx.playerPosition)
        triggerSoundCue(kind === TANK_ATTACKS.SIEGE ? ENEMY_SOUND_CUES.tank_siege_fire : ENEMY_SOUND_CUES.tank_suppression_fire, {
          enemyId: enemy.id, kind: enemy.kind, worldPos: enemy.mesh.position,
        })
      }
      if (enemy.attackShotsRemaining <= 0 && enemy.fsm.timeInState >= 0.28) {
        enemy.fsm.transition(ENEMY_STATES.RECOVERING, null, ctx)
      }
    },
    onExit(enemy) {
      enemy.ramAttackActive = false
    },
  },

  [ENEMY_STATES.RECOVERING]: {
    onEnter(enemy) {
      enemy.ramAttackActive = false
      enemy.attackShotsRemaining = 0
    },
    update(enemy, dt, ctx) {
      tickTankVisual(enemy, dt)
      if (consumePendingStagger(enemy, ctx)) return
      updateStandoff(enemy, dt, ctx)
      if (enemy.fsm.timeInState >= RECOVERY_TIME) enemy.fsm.transition(ENEMY_STATES.REPOSITIONING, null, ctx)
    },
  },

  [ENEMY_STATES.REPOSITIONING]: {
    onEnter(enemy) {
      enemy.cycleCount = (enemy.cycleCount || 0) + 1
      enemy.attackCycle = (enemy.attackCycle || 0) + 1
      enemy.strafeSign *= -1
    },
    update(enemy, dt, ctx) {
      tickTankVisual(enemy, dt)
      if (consumePendingStagger(enemy, ctx)) return
      updateStandoff(enemy, dt, ctx)
      if (tankShouldLeaveAfterCycle(enemy.cycleCount, ctx.inArena)) {
        enemy.fsm.transition(ENEMY_STATES.DISENGAGING, null, ctx)
        return
      }
      if (enemy.fsm.timeInState >= REPOSITION_TIME) enemy.fsm.transition(ENEMY_STATES.ENGAGED, null, ctx)
    },
  },

  [ENEMY_STATES.STAGGERED]: {
    onEnter(enemy, ctx) {
      enemy.ramAttackActive = false
      enemy.attackShotsRemaining = 0
      enemy.recoilTimer = 0.4
      ctx.effects?.shockwave?.(enemy.mesh.position, TANK_COLOR, 0.8)
      triggerSoundCue(ENEMY_SOUND_CUES.tank_stagger, { enemyId: enemy.id, kind: enemy.kind, worldPos: enemy.mesh.position })
    },
    update(enemy, dt, ctx) {
      tickTankVisual(enemy, dt)
      enemy.mesh.position.addScaledVector(ctx.frame.forward, 8 * dt)
      enemy.mesh.rotation.z += Math.sin(enemy.fsm.timeInState * 16) * 0.05
      if (enemy.fsm.timeInState >= STAGGER_TIME) {
        enemy.mesh.rotation.z = 0
        enemy.fsm.transition(ENEMY_STATES.RECOVERING, null, ctx)
      }
    },
  },

  [ENEMY_STATES.DISENGAGING]: {
    onEnter(enemy) {
      enemy.disengaging = true
      enemy.ramAttackActive = false
      enemy.fireTimer = Infinity
    },
    update(enemy, dt, ctx) {
      tickTankVisual(enemy, dt)
      leaveMovement(enemy, dt, ctx)
    },
  },

  [ENEMY_STATES.DYING]: {
    onEnter(enemy, ctx) {
      enemy.dying = true
      enemy.deathT = 0
      ctx.effects?.explosion?.(enemy.mesh.position, TANK_COLOR, 1.8, { rings: true })
      triggerSoundCue(ENEMY_SOUND_CUES.tank_death, { enemyId: enemy.id, kind: enemy.kind, worldPos: enemy.mesh.position })
    },
    update(enemy, dt) {
      enemy.deathT = Math.min(1, (enemy.deathT || 0) + dt / TANK_DEATH_DURATION)
      enemy.mesh.scale.setScalar(Math.max(0.001, (1 - enemy.deathT) * TANK_SCALE))
    },
  },
}

export function spawnTankEnemy(scene, rail, id, hp = TANK_DEFAULT_HP) {
  const { root, visualGroup, armorPanels, core, turretGroup } = createTankVisual()
  scene.add(root)
  const position = spawnPositionForEnemy(rail, SPAWN_DISTANCE_MIN, SPAWN_DISTANCE_MAX, BOX_X, BOX_Y)
  root.position.copy(position)
  const frame = rail.getSpawnFrame ? rail.getSpawnFrame() : (rail.getFrameAt ? rail.getFrameAt(0) : {
    position: new THREE.Vector3(),
    forward: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
    right: new THREE.Vector3(1, 0, 0),
  })
  _rel.copy(position).sub(frame.position)
  const enemy = {
    id,
    mesh: root,
    visualGroup,
    armorPanels,
    coreMesh: core,
    turretGroup,
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
    moveTimer: 0,
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
  noseGeo.dispose()
  sideLGeo.dispose()
  sideRGeo.dispose()
  turretGeo.dispose()
  turretRingGeo.dispose()
  barrelGeo.dispose()
  muzzleGeo.dispose()
  thrusterGeo.dispose()
  armorGeo.dispose()
  siegeProjectileGeo.dispose()
  suppressionProjectileGeo.dispose()
  bodyMat.dispose()
  armorMat.dispose()
  darkMat.dispose()
  coreMat.dispose()
  thrusterMat.dispose()
  siegeProjectileMat.dispose()
  suppressionProjectileMat.dispose()
}
