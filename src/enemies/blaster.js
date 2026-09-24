import * as THREE from 'three'
import { PASS_BEHIND, enemyInFireRange } from './shared.js'
import { ENEMY_SOUND_CUES, triggerSoundCue } from '../audio-cues.js'
import { createStateMachine, ENEMY_STATES } from './state-machine.js'

// ============ BLASTER — caças estelares genéricos ============
// Modelos unificados em cone 4 faces (+10% maiores), diferenciados por cores saturadas e vibrantes.
// Ao completar 4 ataques, puxam para cima e vão embora voando sem teleguiar.
// Proibidos de empacar ao lado ou atrás do jogador.
// Migrado pra FSM formal (ver state-machine.js e FLUXO_VALIDACAO_IA.md/progresso/PROGRESSO_POS_.70.md
// pra contexto do overhaul) — comportamento idêntico ao pré-FSM, só reestruturado. `enemy.fsm`
// substitui as flags soltas `disengaging`/`wingBroken`/`tumbleSpin` de antes.
export const BLASTER_KIND = 'blaster'
export const BLASTER_HIT_RADIUS = 2.28 // 2.07 * 1.10
export const BLASTER_DEATH_DURATION = 0.2
export const BLASTER_KILL_BONUS = 30

export const BLASTER_SPAWN_DISTANCE_MIN = 54 // 45 * 1.2 — pedido do usuário (inimigos 20% mais distantes)
export const BLASTER_SPAWN_DISTANCE_MAX = 90 // 75 * 1.2
export const BLASTER_BOX_X = 5.2
export const BLASTER_BOX_Y = 3.4

const MAX_SCREEN_X = 5.4
const MAX_SCREEN_Y = 3.5

const ENEMY_TURN_RATE = 1.6
const ENEMY_ORBIT_RADIUS_MIN = 12
const ENEMY_ORBIT_RADIUS_MAX = 22
const ENEMY_ORBIT_ANGULAR_SPEED = 0.8

// 6 variações com cores ultra-vibrantes e componentes emissivos para alta visibilidade no espaço negro
export const BLASTER_PROFILES = [
  { id: 'orbit', color: 0x00e5ff, emissive: 0x005588 },    // Ciano elétrico
  { id: 'advance', color: 0xff1744, emissive: 0x880018 },  // Vermelho puro/escarlate
  { id: 'slow', color: 0x00e676, emissive: 0x006622 },     // Verde neon
  { id: 'follow', color: 0xff9100, emissive: 0x773300 },   // Âmbar dourado
  { id: 'circular', color: 0xffffff, emissive: 0x666666 }, // Branco brilhante
  { id: 'evasive', color: 0xd500f9, emissive: 0x660088 },  // Magenta/roxo elétrico
]
export const BLASTER_PROFILE_COLOR = new Map(BLASTER_PROFILES.map((p) => [p.id, p.color]))
const BLASTER_PROFILE_SPEED_RANGE = {
  orbit: [0.45, 0.70],
  advance: [0.80, 0.95],
  slow: [0.15, 0.30],
  follow: [0.45, 0.65],
  circular: [0.45, 0.70],
  evasive: [0.50, 0.75],
}
const ARENA_FOLLOW_STANDOFF = 18
const CIRCULAR_ANGULAR_SPEED = 1.4
const CIRCULAR_SHRINK_RATE = 0.6
const CIRCULAR_MIN_RADIUS = 1.2
const EVASIVE_JUKE_INTERVAL_MIN = 0.8
const EVASIVE_JUKE_INTERVAL_MAX = 1.6

const RAIL_ORBIT_RADIUS = 2.0
const RAIL_ORBIT_SPEED = 1.0
const RAIL_ADVANCE_SPEED = 12
const RAIL_SLOW_SPEED = 6.0
const RAIL_CIRCULAR_DRIFT_SPEED = 5.2

const TELEGRAPH_DURATION = 0.3
const OUT_OF_RANGE_FIRE_TIMER_FLOOR = 0.45

// Geometria clássica unificada do caça (+10% maior: 1.265 raio, 2.783 altura)
const enemyGeometry = new THREE.ConeGeometry(1.265, 2.783, 4)
enemyGeometry.rotateX(Math.PI / 2)

const profileMaterials = new Map(
  BLASTER_PROFILES.map((p) => [
    p.id,
    new THREE.MeshPhongMaterial({
      color: p.color,
      emissive: p.emissive,
      emissiveIntensity: 0.75,
      flatShading: true,
    }),
  ]),
)

function rerollJukeDir(enemy, frame) {
  enemy.jukeTimer = EVASIVE_JUKE_INTERVAL_MIN + Math.random() * (EVASIVE_JUKE_INTERVAL_MAX - EVASIVE_JUKE_INTERVAL_MIN)
  const angle = Math.random() * Math.PI * 2
  enemy.jukeDir.set(0, 0, 0)
    .addScaledVector(frame.right, Math.cos(angle))
    .addScaledVector(frame.up, Math.sin(angle))
}

function projectBlasterToWorld(enemy, rail) {
  const frame = rail.getSpawnFrame()
  enemy.mesh.position.copy(frame.position)
    .addScaledVector(frame.forward, enemy.depth + (enemy.recoilZ || 0))
    .addScaledVector(frame.right, enemy.screenX)
    .addScaledVector(frame.up, enemy.screenY)
}

export function blasterColor(enemy) {
  return BLASTER_PROFILE_COLOR.get(enemy.profile) ?? BLASTER_PROFILES[0].color
}

// ============ movimento (perfil escolhido no spawn) ============
function updateBlasterArenaProfileMovement(enemy, dt, playerPosition, frame, speedCap) {
  const chaseSpeed = (enemy.speedFactor ?? 0.6) * speedCap
  let desiredDir
  if (enemy.profile === 'orbit' || enemy.profile === 'circular') {
    const angularSpeed = enemy.profile === 'circular' ? CIRCULAR_ANGULAR_SPEED : ENEMY_ORBIT_ANGULAR_SPEED
    enemy.orbitAngle += angularSpeed * enemy.orbitDir * dt
    if (enemy.profile === 'circular') {
      enemy.orbitRadius = Math.max(CIRCULAR_MIN_RADIUS, enemy.orbitRadius - CIRCULAR_SHRINK_RATE * dt)
    }
    const orbitPoint = playerPosition.clone()
      .addScaledVector(frame.right, Math.cos(enemy.orbitAngle) * enemy.orbitRadius)
      .addScaledVector(frame.up, Math.sin(enemy.orbitAngle) * enemy.orbitRadius)
    desiredDir = orbitPoint.sub(enemy.mesh.position)
  } else if (enemy.profile === 'follow') {
    const toPlayer = playerPosition.clone().sub(enemy.mesh.position)
    desiredDir = toPlayer.length() > ARENA_FOLLOW_STANDOFF ? toPlayer : toPlayer.multiplyScalar(-1)
  } else if (enemy.profile === 'evasive') {
    if ((enemy.jukeTimer -= dt) <= 0) rerollJukeDir(enemy, frame)
    desiredDir = playerPosition.clone().sub(enemy.mesh.position).normalize().add(enemy.jukeDir)
  } else {
    desiredDir = playerPosition.clone().sub(enemy.mesh.position)
  }

  if (desiredDir.lengthSq() > 1e-4) {
    desiredDir.normalize()
    if (!enemy.moveDir) enemy.moveDir = desiredDir.clone()
    enemy.moveDir.lerp(desiredDir, Math.min(1, ENEMY_TURN_RATE * dt))
    if (enemy.moveDir.lengthSq() > 1e-6) enemy.moveDir.normalize()
    enemy.mesh.position.addScaledVector(enemy.moveDir, chaseSpeed * dt)
  }
  enemy.mesh.lookAt(playerPosition)
}

function updateBlasterArenaDisengageMovement(enemy, dt, speedCap) {
  const chaseSpeed = (enemy.speedFactor ?? 0.6) * speedCap
  const escapeDir = (enemy.moveDir || new THREE.Vector3(0, 1, 0)).clone()
  escapeDir.y = Math.max(0.5, escapeDir.y + dt * 1.5)
  escapeDir.normalize()
  enemy.moveDir = escapeDir
  enemy.mesh.position.addScaledVector(escapeDir, chaseSpeed * 1.8 * dt)
}

function updateBlasterRailProfileMovement(enemy, dt, rail) {
  if (enemy.profile === 'orbit') {
    enemy.orbitAngle += RAIL_ORBIT_SPEED * enemy.orbitDir * dt
    enemy.depth -= RAIL_SLOW_SPEED * dt
    enemy.screenX = THREE.MathUtils.clamp(enemy.orbitCenterX + Math.cos(enemy.orbitAngle) * RAIL_ORBIT_RADIUS, -MAX_SCREEN_X, MAX_SCREEN_X)
    enemy.screenY = THREE.MathUtils.clamp(enemy.orbitCenterY + Math.sin(enemy.orbitAngle) * RAIL_ORBIT_RADIUS, -MAX_SCREEN_Y, MAX_SCREEN_Y)
    enemy.mesh.rotation.z = Math.sin(enemy.orbitAngle) * 0.35
  } else if (enemy.profile === 'circular') {
    enemy.orbitAngle += CIRCULAR_ANGULAR_SPEED * enemy.orbitDir * dt
    enemy.orbitRadius = Math.max(CIRCULAR_MIN_RADIUS, enemy.orbitRadius - CIRCULAR_SHRINK_RATE * dt)
    enemy.depth -= RAIL_CIRCULAR_DRIFT_SPEED * dt
    enemy.screenX = THREE.MathUtils.clamp(enemy.orbitCenterX + Math.cos(enemy.orbitAngle) * enemy.orbitRadius, -MAX_SCREEN_X, MAX_SCREEN_X)
    enemy.screenY = THREE.MathUtils.clamp(enemy.orbitCenterY + Math.sin(enemy.orbitAngle) * enemy.orbitRadius, -MAX_SCREEN_Y, MAX_SCREEN_Y)
    enemy.mesh.rotation.z = Math.sin(enemy.orbitAngle) * 0.4
  } else if (enemy.profile === 'advance') {
    enemy.depth -= RAIL_ADVANCE_SPEED * dt
  } else if (enemy.profile === 'slow') {
    enemy.depth -= RAIL_SLOW_SPEED * dt
  } else if (enemy.profile === 'follow') {
    // Proibido de ficar emparelhado: avança sempre para frente, acelerando na passagem
    const passSpeed = enemy.depth < 14 ? RAIL_ADVANCE_SPEED : RAIL_SLOW_SPEED
    enemy.depth -= passSpeed * dt
  } else if (enemy.profile === 'evasive') {
    if ((enemy.jukeTimer -= dt) <= 0) {
      enemy.jukeTimer = EVASIVE_JUKE_INTERVAL_MIN + Math.random() * (EVASIVE_JUKE_INTERVAL_MAX - EVASIVE_JUKE_INTERVAL_MIN)
      enemy.targetScreenX = (Math.random() * 2 - 1) * (MAX_SCREEN_X * 0.75)
      enemy.targetScreenY = (Math.random() * 2 - 1) * (MAX_SCREEN_Y * 0.75)
    }
    enemy.depth -= RAIL_SLOW_SPEED * dt
    const prevX = enemy.screenX
    enemy.screenX = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(enemy.screenX, enemy.targetScreenX, Math.min(1, dt * 2.2)),
      -MAX_SCREEN_X,
      MAX_SCREEN_X,
    )
    enemy.screenY = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(enemy.screenY, enemy.targetScreenY, Math.min(1, dt * 2.2)),
      -MAX_SCREEN_Y,
      MAX_SCREEN_Y,
    )
    enemy.mesh.rotation.z = THREE.MathUtils.clamp((enemy.screenX - prevX) * 4.0, -0.6, 0.6)
  }

  // Garantia absoluta contra ficar preso ao exato lado do jogador:
  // Ao atingir profundidade próxima (< 5.0u), acelera para ultrapassar e sair da tela
  if (enemy.depth < 5.0) {
    enemy.depth -= 14.0 * dt
  }

  projectBlasterToWorld(enemy, rail)
}

function updateBlasterRailTumbleMovement(enemy, dt, rail) {
  enemy.mesh.rotation.z += enemy.tumbleRollSpeed * dt
  enemy.depth -= RAIL_ADVANCE_SPEED * dt
  enemy.screenX = THREE.MathUtils.clamp(enemy.screenX + (enemy.tumbleRollSpeed > 0 ? 0.6 : -0.6) * dt, -MAX_SCREEN_X, MAX_SCREEN_X)
  projectBlasterToWorld(enemy, rail)
}

function updateBlasterRailDisengageMovement(enemy, dt, rail) {
  enemy.screenY += 12.0 * dt
  enemy.depth -= 16.0 * dt
  enemy.mesh.rotation.x = -0.35 // empinado para cima
  projectBlasterToWorld(enemy, rail)
}

// lookAt genérico + preservação de rolamento (rotation.z) + rastro do propulsor — em modo trilho,
// pra qualquer estado que ainda deva olhar pro jogador (ENGAGED/TELEGRAPHING/CRITICAL_TUMBLE; não
// DISENGAGING, que empina pra cima de propósito e não trava mira).
function applyRailVisuals(enemy, dt, ctx, { lookAt }) {
  if (enemy.recoilZ < 0) {
    enemy.recoilZ = Math.min(0, enemy.recoilZ + dt * 4.0)
  }
  if (lookAt) {
    const relative = enemy.mesh.position.clone().sub(ctx.frame.position)
    if (relative.dot(ctx.frame.forward) > 0) {
      const rollZ = enemy.mesh.rotation.z
      enemy.mesh.lookAt(ctx.playerPosition)
      enemy.mesh.rotateZ(rollZ)
    }
  }
  if (ctx.effects && ctx.effects.enemyThrusterTrail) {
    enemy.trailTimer -= dt
    if (enemy.trailTimer <= 0) {
      enemy.trailTimer = 0.05
      ctx.effects.enemyThrusterTrail(enemy.mesh.position, blasterColor(enemy))
    }
  }
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

// ============ disparo/telegraph — compartilhado por ENGAGED e CRITICAL_TUMBLE (asa quebrada NÃO
// impede o Blaster de continuar telegrafando/atirando normalmente, igual ao comportamento antigo) ============
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

// Único lugar que decide "pra onde volta depois de um ciclo de tiro" — usado tanto pelo bail-out
// do TELEGRAPHING (alvo saiu de alcance) quanto pelo RECOVERY (terminou de atirar). Igual ao
// comportamento antigo (updateBlasterRailMovement checava tumbleSpin ANTES de disengaging e ambos
// davam `return` — asa quebrada sempre vencia): uma vez que a asa quebra, o Blaster nunca mais
// "recupera" pra ENGAGED/DISENGAGING normal, só continua girando descontrolado (CRITICAL_TUMBLE)
// pelo resto da vida dele, mesmo que também tenha atingido o limite de 4 tiros nesse meio tempo.
function returnFromFireCycle(enemy, ctx) {
  if (enemy.wingBroken) {
    enemy.fsm.transition(ENEMY_STATES.CRITICAL_TUMBLE, null, ctx)
  } else if (enemy.disengaging) {
    enemy.fsm.transition(ENEMY_STATES.DISENGAGING, null, ctx)
  } else {
    enemy.fsm.transition(ENEMY_STATES.ENGAGED, null, ctx)
  }
}

const BLASTER_STATES = {
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
        updateBlasterArenaProfileMovement(enemy, dt, ctx.playerPosition, ctx.frame, ctx.rail.getArenaSpeed() * 0.7)
      } else {
        updateBlasterRailProfileMovement(enemy, dt, ctx.rail)
        applyRailVisuals(enemy, dt, ctx, { lookAt: true })
        if (railDespawnCheck(enemy, ctx)) return
      }
      runFireControl(enemy, dt, ctx)
    },
  },

  [ENEMY_STATES.TELEGRAPHING]: {
    onEnter(enemy, ctx) {
      const tPos = enemy.mesh.position
      if (ctx?.effects) ctx.effects.telegraph(tPos, blasterColor(enemy))
      triggerSoundCue(ENEMY_SOUND_CUES.blaster_telegraph, { enemyId: enemy.id, kind: enemy.kind, worldPos: tPos })
    },
    update(enemy, dt, ctx) {
      // movimento continua normalmente durante o telegraph (igual ao comportamento antigo: o
      // telegraph nunca pausou o movimento, era só um aviso visual/sonoro sobreposto)
      if (ctx.inArena) {
        updateBlasterArenaProfileMovement(enemy, dt, ctx.playerPosition, ctx.frame, ctx.rail.getArenaSpeed() * 0.7)
      } else {
        updateBlasterRailProfileMovement(enemy, dt, ctx.rail)
        applyRailVisuals(enemy, dt, ctx, { lookAt: true })
        if (railDespawnCheck(enemy, ctx)) return
      }

      if (!enemyInFireRange(enemy, ctx)) {
        // alvo escapou da janela de disparo durante o telegraph: cancela e volta pro estado normal
        // (o antigo timer contínuo também nunca disparava fora de alcance nesse ponto) — mesma
        // regra de precedência de returnFromFireCycle (asa quebrada nunca "cancela" o tumble)
        returnFromFireCycle(enemy, ctx)
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
      enemy.fireTimer = ctx.randomEnemyFireInterval()
      returnFromFireCycle(enemy, ctx)
    },
  },

  // Disparado só por breakBlasterWing() num hit não-letal. Preservado de propósito (pedido
  // explícito do usuário): NÃO bloqueia o disparo normal (fire control roda igual ao ENGAGED) e
  // SÓ existe visualmente em modo trilho — em arena o comportamento é idêntico ao ENGAGED normal
  // (a versão pré-FSM nunca checava tumbleSpin no movimento de arena).
  [ENEMY_STATES.CRITICAL_TUMBLE]: {
    update(enemy, dt, ctx) {
      if (ctx.inArena) {
        updateBlasterArenaProfileMovement(enemy, dt, ctx.playerPosition, ctx.frame, ctx.rail.getArenaSpeed() * 0.7)
      } else {
        updateBlasterRailTumbleMovement(enemy, dt, ctx.rail)
        applyRailVisuals(enemy, dt, ctx, { lookAt: true })
        if (railDespawnCheck(enemy, ctx)) return
      }
      runFireControl(enemy, dt, ctx)
    },
  },

  [ENEMY_STATES.DISENGAGING]: {
    onEnter(enemy) {
      enemy.mesh.rotation.x = -0.35
    },
    update(enemy, dt, ctx) {
      if (ctx.inArena) {
        updateBlasterArenaDisengageMovement(enemy, dt, ctx.rail.getArenaSpeed() * 0.7)
        const distToPlayer = enemy.mesh.position.distanceTo(ctx.playerPosition)
        if (distToPlayer > 85) ctx.removeEnemy(enemy)
      } else {
        updateBlasterRailDisengageMovement(enemy, dt, ctx.rail)
        applyRailVisuals(enemy, dt, ctx, { lookAt: false })
        railDespawnCheck(enemy, ctx)
      }
    },
  },
}

// Arquétipo "enxame" (junto com Mini-Swarm/Réplica/Ima/Sussurro) — escala DEVAGAR: o volume de
// naves (squadron) já é a dificuldade, não precisa cada uma virar um tanque também. Passo 0.5/
// nível, mesmo teto (6) que uma escala linear completa bateria, só mais gradual.
const BLASTER_HP_BASE = 2
const BLASTER_HP_PER_LEVEL = 0.5
const BLASTER_HP_CAP = 6
export function blasterStatsForLevel(level = 1) {
  const steps = Math.max(0, (level || 1) - 1)
  return { hp: Math.min(BLASTER_HP_CAP, Math.round(BLASTER_HP_BASE + steps * BLASTER_HP_PER_LEVEL)) }
}

export function spawnBlaster(scene, rail, id, opts = {}) {
  const stats = blasterStatsForLevel(opts.level)
  const distanceAhead = opts.depth ?? (BLASTER_SPAWN_DISTANCE_MIN + Math.random() * (BLASTER_SPAWN_DISTANCE_MAX - BLASTER_SPAWN_DISTANCE_MIN))
  const screenX = opts.screenX ?? ((Math.random() * 2 - 1) * BLASTER_BOX_X)
  const screenY = opts.screenY ?? ((Math.random() * 2 - 1) * BLASTER_BOX_Y)
  const profileId = opts.profile ?? BLASTER_PROFILES[Math.floor(Math.random() * BLASTER_PROFILES.length)].id
  const profile = BLASTER_PROFILES.find((p) => p.id === profileId) ?? BLASTER_PROFILES[0]

  const mesh = new THREE.Mesh(enemyGeometry, profileMaterials.get(profile.id))
  scene.add(mesh)

  const [speedMin, speedMax] = BLASTER_PROFILE_SPEED_RANGE[profile.id]
  const enemy = {
    id,
    mesh,
    kind: BLASTER_KIND,
    dying: false,
    deathT: 0,
    hp: stats.hp,
    maxHp: stats.hp,
    fireTimer: null,
    shotsFired: 0,
    disengaging: false,
    profile: profile.id,
    speedFactor: speedMin + Math.random() * (speedMax - speedMin),
    depth: distanceAhead,
    screenX,
    screenY,
    orbitCenterX: screenX,
    orbitCenterY: screenY,
    orbitRadius: ENEMY_ORBIT_RADIUS_MIN + Math.random() * (ENEMY_ORBIT_RADIUS_MAX - ENEMY_ORBIT_RADIUS_MIN),
    orbitAngle: Math.random() * Math.PI * 2,
    orbitDir: Math.random() < 0.5 ? 1 : -1,
    jukeTimer: 0,
    jukeAngle: Math.random() * Math.PI * 2,
    jukeDir: new THREE.Vector3(),
    targetScreenX: screenX,
    targetScreenY: screenY,
    moveDir: null,
    recoilZ: 0,
    trailTimer: 0,
    wingBroken: false,
    tumbleRollSpeed: 0,
    isLeader: !!opts.isLeader,
    squadronId: opts.squadronId ?? null,
    level: opts.level ?? 1,
  }
  enemy.fsm = createStateMachine(enemy, BLASTER_STATES, ENEMY_STATES.SPAWNING)

  projectBlasterToWorld(enemy, rail)
  return enemy
}

// chamado por resolveProjectileHit quando um hit NÃO letal acerta um Blaster ainda com a asa
// intacta — preserva exatamente o efeito de antes (giro descontrolado), só troca a flag solta
// `tumbleSpin` pela transição de FSM equivalente.
export function breakBlasterWing(enemy) {
  if (!enemy || enemy.wingBroken) return null
  enemy.wingBroken = true
  enemy.tumbleRollSpeed = (Math.random() < 0.5 ? 1 : -1) * (3.5 + Math.random() * 2)
  triggerSoundCue(ENEMY_SOUND_CUES.blaster_spin_damage, { worldPos: enemy.mesh.position.clone() })
  enemy.fsm.transition(ENEMY_STATES.CRITICAL_TUMBLE)
  return { worldPos: enemy.mesh.position.clone(), color: blasterColor(enemy) }
}

export function triggerBlasterRecoil(enemy) {
  if (!enemy) return
  enemy.recoilZ = -0.3
}

export function disposeBlaster() {
  enemyGeometry.dispose()
  for (const m of profileMaterials.values()) m.dispose()
}
