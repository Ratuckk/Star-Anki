import * as THREE from 'three'
import { PASS_BEHIND, spawnPositionForEnemy, enemyInFireRange } from './shared.js'
import { ENEMY_SOUND_CUES, triggerSoundCue } from '../audio-cues.js'
import { createStateMachine, ENEMY_STATES } from './state-machine.js'

// ============ TANQUE (debug) — movimento/tiro genéricos, só HP/escala mudam ============
// Migrado pra FSM (ver blaster.js/state-machine.js) — Tank não tem movimento próprio no trilho
// hoje (fica parado, só gira via lookAt genérico) nem lógica de fuga própria; preserva as duas
// coisas exatamente como eram antes de migrar.
export const TANK_KIND = 'tank'
export const TANK_COLOR = 0xff9100
export const TANK_HIT_RADIUS = 2.57 // 2.34 * 1.10 (+10%)
export const TANK_DEATH_DURATION = 0.2
const TANK_SCALE = 2.29 // 2.08 * 1.10 (+10%)
export const TANK_DEFAULT_HP = 15
// Arquétipo "miniboss" (junto com Fragata/Horda) — escala RÁPIDO, 1.5/nível: é um encontro raro
// e único (spawn de debug/eventos pontuais), não um volume de naves — o pico de ameaça precisa
// ser sentido de verdade nível a nível.
const TANK_HP_PER_LEVEL = 1.5
const TANK_HP_CAP = 27
export function tankStatsForLevel(level = 1) {
  const steps = Math.max(0, (level || 1) - 1)
  return { hp: Math.min(TANK_HP_CAP, Math.round(TANK_DEFAULT_HP + steps * TANK_HP_PER_LEVEL)) }
}
const SPAWN_DISTANCE_MIN = 54 // 45 * 1.2 — pedido do usuário (inimigos 20% mais distantes)
const SPAWN_DISTANCE_MAX = 84 // 70 * 1.2
const BOX_X = 7
const BOX_Y = 5

const TELEGRAPH_DURATION = 0.3
const OUT_OF_RANGE_FIRE_TIMER_FLOOR = 0.45
const ARENA_CHASE_TURN_RATE = 1.6
const ARENA_CHASE_DEFAULT_SPEED_FACTOR = 0.8

const enemyGeometry = new THREE.ConeGeometry(1, 2.2, 4)
enemyGeometry.rotateX(Math.PI / 2)
const material = new THREE.MeshPhongMaterial({
  color: TANK_COLOR,
  emissive: 0x773300,
  emissiveIntensity: 0.75,
  flatShading: true,
})

function updateTankArenaChase(enemy, dt, playerPosition, speedCap) {
  const chaseSpeed = (enemy.speedFactor ?? ARENA_CHASE_DEFAULT_SPEED_FACTOR) * speedCap
  const desiredDir = playerPosition.clone().sub(enemy.mesh.position)
  if (desiredDir.lengthSq() > 1e-4) {
    desiredDir.normalize()
    if (!enemy.moveDir) enemy.moveDir = desiredDir.clone()
    enemy.moveDir.lerp(desiredDir, Math.min(1, ARENA_CHASE_TURN_RATE * dt))
    if (enemy.moveDir.lengthSq() > 1e-6) enemy.moveDir.normalize()
    enemy.mesh.position.addScaledVector(enemy.moveDir, chaseSpeed * dt)
  }
  enemy.mesh.lookAt(playerPosition)
}

function railDespawnCheck(enemy, ctx) {
  const relative = enemy.mesh.position.clone().sub(ctx.frame.position)
  const passedDistance = (enemy.spawnRailDist != null) && (ctx.rail.getDistance() - enemy.spawnRailDist > 180)
  const offScreenAbove = enemy.screenY != null && enemy.screenY > 11.0
  if (relative.dot(ctx.frame.forward) < PASS_BEHIND || passedDistance || offScreenAbove) {
    ctx.removeEnemy(enemy)
    return true
  }
  return false
}

// Tank não tem movimento próprio no trilho — só reorienta pro jogador (padrão genérico de
// qualquer inimigo sem branch de movimento dedicado) e confere o despawn genérico.
function applyRailVisuals(enemy, ctx, { lookAt }) {
  if (lookAt) {
    const relative = enemy.mesh.position.clone().sub(ctx.frame.position)
    if (relative.dot(ctx.frame.forward) > 0) enemy.mesh.lookAt(ctx.playerPosition)
  }
}

function runFireControl(enemy, dt, ctx) {
  const inFireRange = enemyInFireRange(enemy, ctx)
  if (!inFireRange && enemy.fireTimer < OUT_OF_RANGE_FIRE_TIMER_FLOOR) {
    enemy.fireTimer = OUT_OF_RANGE_FIRE_TIMER_FLOOR
  }
  enemy.fireTimer -= dt
  if (enemy.fireTimer <= TELEGRAPH_DURATION && inFireRange) {
    enemy.fsm.transition(ENEMY_STATES.TELEGRAPHING, null, ctx)
  }
}

const TANK_STATES = {
  [ENEMY_STATES.SPAWNING]: {
    update(enemy, dt, ctx) {
      if (enemy.spawnAge == null || enemy.spawnAge >= enemy.spawnDuration) {
        enemy.fsm.transition(ENEMY_STATES.ENGAGED, null, ctx)
      }
    },
  },

  [ENEMY_STATES.ENGAGED]: {
    update(enemy, dt, ctx) {
      if (ctx.inArena) {
        updateTankArenaChase(enemy, dt, ctx.playerPosition, ctx.rail.getArenaSpeed() * 0.7)
      } else {
        applyRailVisuals(enemy, ctx, { lookAt: true })
        if (railDespawnCheck(enemy, ctx)) return
      }
      runFireControl(enemy, dt, ctx)
    },
  },

  [ENEMY_STATES.TELEGRAPHING]: {
    onEnter(enemy, ctx) {
      const tPos = enemy.mesh.position
      if (ctx?.effects) ctx.effects.telegraph(tPos, TANK_COLOR)
      triggerSoundCue(ENEMY_SOUND_CUES.blaster_telegraph, { enemyId: enemy.id, kind: enemy.kind, worldPos: tPos })
    },
    update(enemy, dt, ctx) {
      if (ctx.inArena) {
        updateTankArenaChase(enemy, dt, ctx.playerPosition, ctx.rail.getArenaSpeed() * 0.7)
      } else {
        applyRailVisuals(enemy, ctx, { lookAt: true })
        if (railDespawnCheck(enemy, ctx)) return
      }
      if (!enemyInFireRange(enemy, ctx)) {
        enemy.fsm.transition(ENEMY_STATES.ENGAGED, null, ctx)
        return
      }
      enemy.fireTimer -= dt
      if (enemy.fireTimer <= 0) {
        enemy.fsm.transition(ENEMY_STATES.ATTACKING, null, ctx)
      }
    },
  },

  [ENEMY_STATES.ATTACKING]: {
    onEnter(enemy, ctx) {
      ctx.fireEnemyProjectile(enemy, ctx.playerPosition)
      enemy.fsm.transition(ENEMY_STATES.RECOVERY, null, ctx)
    },
  },

  [ENEMY_STATES.RECOVERY]: {
    onEnter(enemy, ctx) {
      if (enemy.disengaging) {
        enemy.fsm.transition(ENEMY_STATES.DISENGAGING, null, ctx)
      } else {
        enemy.fireTimer = ctx.randomEnemyFireInterval()
        enemy.fsm.transition(ENEMY_STATES.ENGAGED, null, ctx)
      }
    },
  },

  // Tank não tem fuga própria: no trilho só para de reorientar pro jogador (mesma exceção
  // `!enemy.disengaging` do lookAt genérico de antes) até ser varrido pelo despawn por distância
  // percorrida; na arena continua perseguindo igual ENGAGED (o "chase genérico" antigo nunca
  // checava `disengaging`) — preservado de propósito, é o comportamento atual.
  [ENEMY_STATES.DISENGAGING]: {
    update(enemy, dt, ctx) {
      if (ctx.inArena) {
        updateTankArenaChase(enemy, dt, ctx.playerPosition, ctx.rail.getArenaSpeed() * 0.7)
        const distToPlayer = enemy.mesh.position.distanceTo(ctx.playerPosition)
        if (distToPlayer > 85) ctx.removeEnemy(enemy)
      } else {
        applyRailVisuals(enemy, ctx, { lookAt: false })
        railDespawnCheck(enemy, ctx)
      }
    },
  },
}

export function spawnTankEnemy(scene, rail, id, hp = TANK_DEFAULT_HP) {
  const position = spawnPositionForEnemy(rail, SPAWN_DISTANCE_MIN, SPAWN_DISTANCE_MAX, BOX_X, BOX_Y)
  const mesh = new THREE.Mesh(enemyGeometry, material)
  mesh.position.copy(position)
  mesh.scale.setScalar(TANK_SCALE)
  scene.add(mesh)
  const enemy = {
    id,
    mesh,
    kind: TANK_KIND,
    dying: false,
    deathT: 0,
    hp,
    maxHp: hp,
    fireTimer: null,
    shotsFired: 0,
    disengaging: false,
  }
  enemy.fsm = createStateMachine(enemy, TANK_STATES, ENEMY_STATES.SPAWNING)
  return enemy
}

export function disposeTank() {
  enemyGeometry.dispose()
  material.dispose()
}
