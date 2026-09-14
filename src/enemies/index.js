import * as THREE from 'three'
import { PASS_BEHIND, FORWARD_AXIS, distanceToSegment, HOMING_EXPLOSION_COLOR } from './shared.js'
import {
  BLASTER_KIND, BLASTER_HIT_RADIUS, BLASTER_DEATH_DURATION, BLASTER_KILL_BONUS,
  BLASTER_SPAWN_DISTANCE_MIN, BLASTER_SPAWN_DISTANCE_MAX, BLASTER_BOX_X, BLASTER_BOX_Y,
  spawnBlaster, updateBlasterArenaMovement, updateBlasterRailMovement,
  blasterPassBehind, blasterColor, blasterFireConfig, disposeBlaster,
} from './blaster.js'
import { MINI_SWARM_KIND, spawnMiniSwarm as spawnMiniSwarmGroup, updateMiniSwarm, miniSwarmHitRadius, disposeMiniSwarm } from './miniSwarm.js'
import { TANK_KIND, TANK_COLOR, TANK_HIT_RADIUS, TANK_DEATH_DURATION, TANK_DEFAULT_HP, spawnTankEnemy, disposeTank } from './tank.js'
import {
  TIME_KIND, TIME_HIT_RADIUS, TIME_DEATH_DURATION, TIME_REDUCTION_MIN_MS, TIME_REDUCTION_MAX_MS,
  spawnTimeEnemy, spawnTimeEnemyMega, updateTimeSpin, timePassBehind, timeColor, timeFire, disposeTimeEnemy,
} from './timeEnemy.js'
import {
  BOSS_KIND, BOSS_COLOR, BOSS_HIT_RADIUS, BOSS_DEATH_DURATION, BOSS_LASER_HIT_RADIUS,
  bossEnemyGeometry, bossEnemyMaterial,
  spawnBossEnemy, updateBossMovement, randomBossFireInterval, fireBossVolley, updateBossLaser, explodeBoss, disposeBoss,
} from './boss.js'
import { createGoldenSystem, goldenGeometry, goldenMaterial } from './golden.js'
import {
  DETRITO_KIND, DETRITO_COLOR, DETRITO_HIT_RADIUS, DETRITO_DEATH_DURATION, DETRITO_KILL_BONUS,
  spawnDetrito, updateDetritoSpin, detritoHitRadius, disposeDetrito,
} from './detrito.js'
import {
  SENTINELA_KIND, SENTINELA_COLOR, SENTINELA_HIT_RADIUS, SENTINELA_DEATH_DURATION, SENTINELA_FIRE_INTERVAL,
  spawnSentinela, updateSentinelaMovement, sentinelaPassBehind, sentinelaFire, resolveGateHit,
  updateGateAnimation, sentinelaShouldDespawn, disposeSentinela,
} from './sentinela.js'
import {
  REPLICA_KIND, REPLICA_COLOR, REPLICA_HIT_RADIUS, REPLICA_DEATH_DURATION, REPLICA_KILL_BONUS,
  spawnReplica, updateReplicaMovement, replicaPassBehind, disposeReplica,
} from './replica.js'
import {
  FRAGATA_KIND, FRAGATA_BODY_COLOR, FRAGATA_SHIELD_COLOR, FRAGATA_HIT_RADIUS, FRAGATA_DEATH_DURATION, FRAGATA_KILL_BONUS,
  spawnFragata, updateFragataMovement, isFragataShielded, disposeFragata,
} from './fragata.js'
import {
  VERME_KIND, VERME_COLOR, VERME_HIT_RADIUS, VERME_DEATH_DURATION, VERME_KILL_BONUS,
  spawnVerme, updateVermeMovement, severChainAt, disposeVerme,
} from './verme.js'
import {
  IMA_KIND, IMA_COLOR, IMA_HIT_RADIUS, IMA_DEATH_DURATION, IMA_KILL_BONUS, IMA_FIELD_RADIUS, IMA_FIELD_STRENGTH,
  spawnImaSwarm, updateImaSpin, disposeIma,
} from './ima.js'
import {
  SUSSURRO_KIND, SUSSURRO_COLOR, SUSSURRO_HIT_RADIUS, SUSSURRO_DEATH_DURATION, SUSSURRO_KILL_BONUS,
  spawnSussurro, updateSussurro, sussurroShouldSummon, sussurroShouldDespawn, sussurroPassBehind,
  disposeSussurro,
} from './sussurro.js'

export { TIME_REDUCTION_MIN_MS, TIME_REDUCTION_MAX_MS }

// ============ constantes genéricas (comuns a vários kinds, não específicas de 1 classe) ============
const ENEMY_FIRE_INTERVAL_MIN = 1500
const ENEMY_FIRE_INTERVAL_MAX = 3000
const ENEMY_FIRE_RANGE = 120
const ENEMY_FIRE_MIN_DISTANCE = 14
const ENEMY_PROJECTILE_SPEED = 26
const ENEMY_PROJECTILE_MAX_RANGE = 100
const ENEMY_ARENA_FIRE_MAX_DISTANCE = 85
const ENEMY_PROJECTILE_HIT_RADIUS = 1.6
const ENEMY_AIM_ERROR_DEG = 5

const ARENA_PREVIEW_DISTANCE = 220
const ARENA_PREVIEW_SCALE = { boss: BOSS_HIT_RADIUS * 2 * 2.4, golden: 3.2 }

const GOLDEN_MINION_TURN_RATE = 2.5
const GOLDEN_MINION_SPEED = 16

// eixo vertical do MUNDO — reusado no desvio sistemático do aimOffsetDeg (perfil `circular` do
// blaster) e no fan do chefe. Ver comentário em fireEnemyProjectile.
const _worldUp = new THREE.Vector3(0, 1, 0)

// helper de perseguição genérica (tank/time): em arena faz chase suave rumo ao jogador; em
// rail não se move (só encara o jogador). Extraído porque 2 kinds usam exatamente o mesmo
// comportamento, e futuros inimigos "comuns" também vão querer.
function genericArenaChaseOrLookAt(e, dt, ctx) {
  if (ctx.inArena) {
    const speedCap = ctx.rail.getArenaSpeed() * 0.7
    const chaseSpeed = (e.speedFactor ?? 0.8) * speedCap
    const desiredDir = ctx.playerPosition.clone().sub(e.mesh.position)
    if (desiredDir.lengthSq() > 1e-4) {
      desiredDir.normalize()
      if (!e.moveDir) e.moveDir = desiredDir.clone()
      e.moveDir.lerp(desiredDir, Math.min(1, 1.6 * dt))
      if (e.moveDir.lengthSq() > 1e-6) e.moveDir.normalize()
      e.mesh.position.addScaledVector(e.moveDir, chaseSpeed * dt)
    }
  }
  e.mesh.lookAt(ctx.playerPosition)
}

// ============ REGISTRY DE INIMIGOS (v0.51.0) ============
// Cada kind tem UMA entrada aqui, com tudo que o updateEnemies precisa saber sobre ele:
//
//   hitRadius(enemy) → number       (obrigatório)
//   deathDuration(enemy) → number   (obrigatório)
//   color(enemy) → hex              (obrigatório)
//   killPoints(enemy) → number      (obrigatório)
//   passBehind(enemy) → number      (obrigatório)
//
//   update(enemy, dt, ctx)          (opcional; default = nada)
//     Retorna:
//       undefined      → fluxo normal segue (pass-behind em rail, telegraph, fire, postUpdate)
//       'remove'       → o próprio update decidiu que o inimigo sai de cena
//       'skipPipeline' → o update cuidou de TUDO; o loop pula o resto do pipeline (miniSwarm)
//
//   fire(enemy, playerPosition, ctx) → boolean   (opcional; false/ausente = fireEnemyProjectile)
//   fireInterval(enemy) → number                 (opcional; ausente = randomEnemyFireInterval)
//   postUpdate(enemy, dt, playerPosition, ctx)   (opcional; chefe usa pro updateBossLaser)
//   noFire: true                                 (pula telegraph+fire inteiro; enemies sem ataque)
//
// ctx (construído por updateEnemies a cada frame) expõe: inArena, frame, playerPosition, rail,
// elapsed, effects, scene, enemies, enemyGates, nextId(), randomEnemyFireInterval(),
// projectileCtx, timeLaserCtx, bossLaserCtx.
//
// Adicionar um inimigo novo = escrever o arquivo dele (spawn/update helpers) + adicionar UMA
// entrada aqui. Não tem mais "esqueci de adicionar no switch de cor" — cada campo é obrigatório
// e o editor reclama se faltar.
const KIND_HANDLERS = {
  [BLASTER_KIND]: {
    hitRadius: () => BLASTER_HIT_RADIUS,
    deathDuration: () => BLASTER_DEATH_DURATION,
    color: blasterColor,
    killPoints: () => BLASTER_KILL_BONUS,
    passBehind: blasterPassBehind,
    update(e, dt, ctx) {
      if (ctx.inArena) {
        updateBlasterArenaMovement(e, dt, ctx.playerPosition, ctx.frame, ctx.rail.getArenaSpeed() * 0.7)
      } else {
        updateBlasterRailMovement(e, dt, ctx.frame)
        e.mesh.lookAt(ctx.playerPosition)
      }
    },
  },

  [MINI_SWARM_KIND]: {
    hitRadius: () => miniSwarmHitRadius(),
    deathDuration: () => BLASTER_DEATH_DURATION,
    color: () => 0xff5a3d,
    killPoints: () => BLASTER_KILL_BONUS,
    passBehind: () => PASS_BEHIND,
    noFire: true,
    update(e, dt, ctx) {
      // miniSwarm cuida de TUDO: patrulha/mergulho, lookAt próprio, e remove a si mesmo quando
      // o mergulho termina ou passa pra trás. Por isso 'skipPipeline' — não deixa o loop
      // aplicar pass-behind/fire genéricos em cima.
      updateMiniSwarm(e, dt, {
        playerPosition: ctx.playerPosition,
        frame: ctx.frame,
        elapsed: ctx.elapsed,
        removeEnemy: ctx.removeEnemy,
      })
      return 'skipPipeline'
    },
  },

  [TANK_KIND]: {
    hitRadius: () => TANK_HIT_RADIUS,
    deathDuration: () => TANK_DEATH_DURATION,
    color: () => TANK_COLOR,
    killPoints: () => BLASTER_KILL_BONUS,
    passBehind: () => PASS_BEHIND,
    update(e, dt, ctx) {
      genericArenaChaseOrLookAt(e, dt, ctx)
    },
  },

  [TIME_KIND]: {
    hitRadius: () => TIME_HIT_RADIUS,
    deathDuration: () => TIME_DEATH_DURATION,
    color: timeColor,
    killPoints: () => BLASTER_KILL_BONUS,
    passBehind: timePassBehind,
    update(e, dt, ctx) {
      genericArenaChaseOrLookAt(e, dt, ctx)
      // em rail, gira em cima do próprio eixo além de encarar o jogador (o lookAt do helper
      // não substitui o rotateY do spin — os dois convivem, o spin é sobre o eixo local)
      if (!ctx.inArena) updateTimeSpin(e, dt)
    },
    fire: (e, pp, ctx) => timeFire(ctx.scene, e, pp, ctx.timeLaserCtx),
  },

  [BOSS_KIND]: {
    hitRadius: () => BOSS_HIT_RADIUS,
    deathDuration: () => BOSS_DEATH_DURATION,
    color: () => BOSS_COLOR,
    killPoints: () => BLASTER_KILL_BONUS,
    passBehind: () => PASS_BEHIND,
    update(e, dt, ctx) {
      updateBossMovement(e, dt, ctx.playerPosition)
    },
    fire: (e, pp, ctx) => { fireBossVolley(e, pp, ctx.projectileCtx); return true },
    fireInterval: () => randomBossFireInterval(),
    postUpdate: (e, dt, pp, ctx) => updateBossLaser(ctx.scene, e, dt, pp, ctx.effects, ctx.bossLaserCtx),
  },

  [DETRITO_KIND]: {
    hitRadius: detritoHitRadius,
    deathDuration: () => DETRITO_DEATH_DURATION,
    color: () => DETRITO_COLOR,
    killPoints: () => DETRITO_KILL_BONUS,
    passBehind: () => PASS_BEHIND,
    noFire: true,
    update(e, dt) {
      updateDetritoSpin(e, dt)
      // sem lookAt: obstáculo inerte, gira por vida visual e não "encara"
    },
  },

  [SENTINELA_KIND]: {
    hitRadius: () => SENTINELA_HIT_RADIUS,
    deathDuration: () => SENTINELA_DEATH_DURATION,
    color: () => SENTINELA_COLOR,
    killPoints: () => BLASTER_KILL_BONUS,
    passBehind: sentinelaPassBehind,
    update(e, dt, ctx) {
      updateSentinelaMovement(e, dt, ctx.frame, ctx.rail)
      if (sentinelaShouldDespawn(e, ctx.frame)) return 'remove'
      e.mesh.lookAt(ctx.playerPosition)
    },
    fire: (e, pp, ctx) => sentinelaFire(ctx.scene, e, pp, { pushGate: (g) => ctx.enemyGates.push(g) }),
    fireInterval: () => SENTINELA_FIRE_INTERVAL,
  },

  [REPLICA_KIND]: {
    hitRadius: () => REPLICA_HIT_RADIUS,
    deathDuration: () => REPLICA_DEATH_DURATION,
    color: () => REPLICA_COLOR,
    killPoints: () => REPLICA_KILL_BONUS,
    passBehind: () => replicaPassBehind(),
    noFire: true,
    update(e, dt, ctx) {
      updateReplicaMovement(e, dt, ctx.rail, ctx.frame)
      // sem lookAt: a réplica "espelha" o movimento lateral do jogador, não encara ele
    },
  },

  [FRAGATA_KIND]: {
    hitRadius: () => FRAGATA_HIT_RADIUS,
    deathDuration: () => FRAGATA_DEATH_DURATION,
    color: () => FRAGATA_BODY_COLOR,
    killPoints: () => FRAGATA_KILL_BONUS,
    passBehind: () => PASS_BEHIND,
    noFire: true,
    update(e, dt, ctx) {
      updateFragataMovement(e, dt, ctx.playerPosition, ctx.rail.getArenaSpeed() * 0.5)
      // sem lookAt: o grupo NUNCA rotaciona por design (é assim que a posição local da placa
      // vira a direção mundial sem conversão — ver comentário em fragata.js)
    },
  },

  [VERME_KIND]: {
    hitRadius: () => VERME_HIT_RADIUS,
    deathDuration: () => VERME_DEATH_DURATION,
    color: () => VERME_COLOR,
    killPoints: () => VERME_KILL_BONUS,
    passBehind: () => PASS_BEHIND,
    noFire: true,
    update(e, dt, ctx) {
      updateVermeMovement(e, dt, ctx.frame)
      // sem lookAt: os elos formam uma corrente, não têm frente própria
    },
  },

  [IMA_KIND]: {
    hitRadius: () => IMA_HIT_RADIUS,
    deathDuration: () => IMA_DEATH_DURATION,
    color: () => IMA_COLOR,
    killPoints: () => IMA_KILL_BONUS,
    passBehind: () => PASS_BEHIND,
    noFire: true,
    update(e, dt) {
      updateImaSpin(e, dt)
      // sem lookAt: enxame estático girando por vida visual
    },
  },

  [SUSSURRO_KIND]: {
    hitRadius: () => SUSSURRO_HIT_RADIUS,
    deathDuration: () => SUSSURRO_DEATH_DURATION,
    color: () => SUSSURRO_COLOR,
    killPoints: () => SUSSURRO_KILL_BONUS,
    passBehind: () => sussurroPassBehind(),
    noFire: true,
    update(e, dt, ctx) {
      updateSussurro(e, dt, ctx.frame, ctx.rail, ctx.effects)
      if (sussurroShouldSummon(e)) {
        // 3 Blasters sempre (era 2-3 aleatório) — o payoff visual tem que ser grande pra
        // justificar o investimento de atenção do jogador.
        for (let i = 0; i < 3; i += 1) {
          const reinforcement = spawnBlaster(ctx.scene, ctx.rail, ctx.nextId())
          reinforcement.fireTimer = ctx.randomEnemyFireInterval()
          ctx.enemies.push(reinforcement)
        }
      }
      // despawn por fim de ciclo (FADING terminou) — o sussurro "some" sem animação de morte,
      // já está com opacidade ~0 nesse ponto. Pass-behind desabilitado (sussurroPassBehind =
      // -9999), então essa é a ÚNICA saída dele além de morrer.
      if (sussurroShouldDespawn(e)) return 'remove'
      e.mesh.lookAt(ctx.playerPosition)
    },
  },
}

// fallback universal pra qualquer kind desconhecido — mantém o comportamento dos switches
// antigos, que retornavam valores de blaster quando o kind não batia com nenhum case
const DEFAULT_HANDLER = KIND_HANDLERS[BLASTER_KIND]

function handlerFor(enemy) {
  return KIND_HANDLERS[enemy.kind] ?? DEFAULT_HANDLER
}

export function createEnemiesSystem(scene, rail, effects = null) {
  const enemies = []
  const enemyProjectiles = []
  const enemyLasers = []
  const enemyGates = []
  let nextEnemyId = 1
  let elapsed = 0
  let enemyAggression = 1
  let arenaPreviewMesh = null
  let enemyProjectileSpeedBonus = 0

  const golden = createGoldenSystem(scene, rail, effects, () => nextEnemyId++)

  const enemyProjectileGeometry = new THREE.ConeGeometry(0.35, 1.4, 6)
  enemyProjectileGeometry.rotateX(Math.PI / 2)
  const enemyProjectileMaterial = new THREE.MeshBasicMaterial({ color: 0xff5a3d })

  function clearArenaPreview() {
    if (!arenaPreviewMesh) return
    scene.remove(arenaPreviewMesh)
    arenaPreviewMesh = null
  }

  function showArenaPreview(kind) {
    clearArenaPreview()
    const mesh = kind === 'boss'
      ? new THREE.Mesh(bossEnemyGeometry, bossEnemyMaterial)
      : kind === 'golden'
        ? new THREE.Mesh(goldenGeometry, goldenMaterial)
        : null
    if (!mesh) return
    const frame = rail.getFrameAt(ARENA_PREVIEW_DISTANCE)
    mesh.position.copy(frame.position)
    mesh.scale.setScalar(ARENA_PREVIEW_SCALE[kind] ?? 1)
    scene.add(mesh)
    arenaPreviewMesh = mesh
  }

  function removeEnemy(e) {
    e.dying = true
    scene.remove(e.mesh)
    enemies.splice(enemies.indexOf(e), 1)
  }

  function removeEnemyProjectile(p) {
    scene.remove(p.mesh)
    enemyProjectiles.splice(enemyProjectiles.indexOf(p), 1)
  }

  function removeEnemyLaser(l) {
    scene.remove(l.mesh)
    if (l.geo) l.geo.dispose()
    if (l.mat) l.mat.dispose()
    enemyLasers.splice(enemyLasers.indexOf(l), 1)
  }

  function removeEnemyGate(g) {
    scene.remove(g.mesh)
    enemyGates.splice(enemyGates.indexOf(g), 1)
  }

  function randomEnemyFireInterval() {
    const ms = ENEMY_FIRE_INTERVAL_MIN + Math.random() * (ENEMY_FIRE_INTERVAL_MAX - ENEMY_FIRE_INTERVAL_MIN)
    return ms / enemyAggression / 1000
  }

  // ============ disparo genérico ============
  // v0.51.0 — 3º parâmetro `extraAngleRad` (opcional, default 0): desvio angular SISTEMÁTICO
  // somado à direção base. Ver comentário abaixo e em boss.js.
  function fireEnemyProjectile(enemy, playerPosition, extraAngleRad = 0) {
    const isBlaster = enemy.kind === BLASTER_KIND
    const cfg = isBlaster
      ? blasterFireConfig(enemy)
      : { count: 1, spreadDeg: 0, aimErrorDeg: ENEMY_AIM_ERROR_DEG, speedMult: 1.0, aimOffsetDeg: 0 }

    const baseDir = playerPosition.clone().sub(enemy.mesh.position).normalize()

    if (cfg.aimOffsetDeg) {
      baseDir.applyAxisAngle(_worldUp, THREE.MathUtils.degToRad(cfg.aimOffsetDeg))
    }
    if (extraAngleRad) {
      baseDir.applyAxisAngle(_worldUp, extraAngleRad)
    }

    const lateralAxis = new THREE.Vector3().crossVectors(baseDir, FORWARD_AXIS)
    if (lateralAxis.lengthSq() < 1e-4) lateralAxis.set(1, 0, 0)
    lateralAxis.normalize()

    const halfSpreadRad = THREE.MathUtils.degToRad(cfg.spreadDeg) / 2

    for (let i = 0; i < cfg.count; i += 1) {
      const direction = baseDir.clone()
      if (cfg.count > 1) {
        const t = i / (cfg.count - 1)
        const angle = -halfSpreadRad + t * (cfg.spreadDeg ? halfSpreadRad * 2 : 0)
        direction.applyAxisAngle(lateralAxis, angle)
      }
      if (cfg.aimErrorDeg > 0) {
        const errAngle = THREE.MathUtils.degToRad((Math.random() * 2 - 1) * cfg.aimErrorDeg)
        const errAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
        direction.applyAxisAngle(errAxis, errAngle)
      }
      const speed = ENEMY_PROJECTILE_SPEED * cfg.speedMult + enemyProjectileSpeedBonus
      const mesh = new THREE.Mesh(enemyProjectileGeometry, enemyProjectileMaterial)
      mesh.position.copy(enemy.mesh.position)
      mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, direction)
      scene.add(mesh)
      enemyProjectiles.push({ mesh, velocity: direction.multiplyScalar(speed), traveled: 0 })
    }
  }

  const bossLaserCtx = { pushLaser: (l) => enemyLasers.push(l) }
  const timeLaserCtx = { pushLaser: (l) => enemyLasers.push(l) }
  const projectileCtx = { fireEnemyProjectile }
  const goldenUpdateCtx = { fireEnemyProjectile, pushProjectile: (p) => enemyProjectiles.push(p), pushLaser: (l) => enemyLasers.push(l) }

  // ============ IA principal ============
  // ramDamage > 0: carta roguelike "impulso aríete" ativa durante o impulso de propulsão —
  // colisão vira dano de verdade (inclusive no CHEFE) em vez do kamikaze padrão.
  //
  // Fluxo por inimigo (v0.51.0 — dispatch 100% via KIND_HANDLERS, zero if-chains por kind
  // fora dos casos genuinamente especiais: ram no chefe e kill de verme):
  //   1. animação de morte (se dying)
  //   2. colisão corpo-a-corpo / ram
  //   3. update do handler (arena/rail decidido DENTRO do handler — cada kind sabe o que faz
  //      em cada modo, ou usa o helper genericArenaChaseOrLookAt)
  //   4. pass-behind em rail (a menos que o handler tenha retornado 'skipPipeline')
  //   5. telegraph + fire (a menos que handler.noFire)
  //   6. postUpdate (opcional; só o chefe usa hoje, pro updateBossLaser)
  function updateEnemies(dt, playerPosition, ramDamage = 0) {
    const inArena = rail.isArena()
    const frame = rail.getFrameAt(0)
    let hits = 0
    let ramKills = 0
    let ramKillPoints = 0
    let ramBossDefeated = false
    let ramBossWorldPos = null

    // ctx compartilhado por todos os handlers neste frame. É construído uma vez por chamada,
    // não por inimigo — os handlers só leem dele.
    const ctx = {
      inArena, frame, playerPosition, rail, elapsed, effects, scene, enemies, enemyGates,
      removeEnemy,
      nextId: () => nextEnemyId++,
      randomEnemyFireInterval,
      projectileCtx, timeLaserCtx, bossLaserCtx,
    }

    for (const enemy of [...enemies]) {
      const handler = handlerFor(enemy)
      const hitRadius = handler.hitRadius(enemy)
      const deathDuration = handler.deathDuration(enemy)
      const baseScale = enemy.mesh.scale.x || 1

      if (enemy.dying) {
        enemy.deathT += dt / deathDuration
        const t = Math.max(0, 1 - enemy.deathT)
        enemy.mesh.scale.setScalar((enemy.deathScale ?? baseScale) * t)
        if (enemy.deathT >= 1) removeEnemy(enemy)
        continue
      }
      enemy.deathScale = baseScale

      // ============ COLISÃO CORPO-A-CORPO / RAM ============
      if (playerPosition.distanceTo(enemy.mesh.position) <= hitRadius) {
        hits += 1
        if (ramDamage > 0) {
          // BUG corrigido: aplicava `ramDamage` A CADA FRAME de sobreposição — pro chefe (hp
          // alto, fica vários frames dentro do raio) isso multiplicava o dano de verdade muito
          // além do pretendido. `ramHitActive` só deixa bater na BORDA DE SUBIDA.
          if (!enemy.ramHitActive) {
            enemy.ramHitActive = true
            enemy.hp -= ramDamage
            if (enemy.hp <= 0) {
              enemy.dying = true
              enemy.deathT = 0
              if (enemy.kind === BOSS_KIND) {
                ramBossDefeated = true
                ramBossWorldPos = enemy.mesh.position.clone()
                if (effects) explodeBoss(effects, enemy.mesh.position)
              } else {
                ramKills += 1
                ramKillPoints += handler.killPoints(enemy)
                if (enemy.kind === VERME_KIND) severChainAt(enemy, enemies)
                if (effects) effects.explosion(enemy.mesh.position, handler.color(enemy), 1.6, { rings: true })
              }
            }
          }
          continue
        }
        enemy.ramHitActive = false
        if (enemy.kind !== BOSS_KIND) {
          if (enemy.kind === VERME_KIND) severChainAt(enemy, enemies)
          removeEnemy(enemy)
          continue
        }
      } else {
        enemy.ramHitActive = false
      }

      // ============ UPDATE (movimento + lookAt + despawn próprio) ============
      const updateResult = handler.update ? handler.update(enemy, dt, ctx) : null
      if (updateResult === 'remove') { removeEnemy(enemy); continue }
      if (updateResult === 'skipPipeline') continue

      // ============ PASS-BEHIND (só rail) ============
      // o loop de arena deixa inimigo vivo até morrer ou o modo terminar; em rail, quem ficou
      // pra trás do jogador sai de cena (com a tolerância que o próprio kind declarar via
      // handler.passBehind — replica/follow/sussurro têm valores custom).
      if (!inArena) {
        const relative = enemy.mesh.position.clone().sub(frame.position)
        if (relative.dot(frame.forward) < handler.passBehind(enemy)) { removeEnemy(enemy); continue }
      }

      // ============ TELEGRAPH + FIRE ============
      if (!handler.noFire) {
        if (enemy.fireTimer > 0.3 && enemy.fireTimer - dt <= 0.3 && effects) {
          let tPos = enemy.mesh.position
          // chefe: telegraph deslocado pra fora do corpo (senão nasce invisível dentro dele)
          if (enemy.kind === BOSS_KIND) {
            const toPlayerDir = playerPosition.clone().sub(enemy.mesh.position)
            if (toPlayerDir.lengthSq() > 1e-4) tPos = enemy.mesh.position.clone().addScaledVector(toPlayerDir.normalize(), BOSS_HIT_RADIUS)
          }
          effects.telegraph(tPos, handler.color(enemy))
        }
        enemy.fireTimer -= dt
        const relativeForward = enemy.mesh.position.clone().sub(frame.position).dot(frame.forward)
        const distToPlayer = enemy.mesh.position.distanceTo(playerPosition)
        const inFireRange = distToPlayer > ENEMY_FIRE_MIN_DISTANCE && (
          inArena ? distToPlayer <= ENEMY_ARENA_FIRE_MAX_DISTANCE
            : enemy.kind === BOSS_KIND || relativeForward < ENEMY_FIRE_RANGE
        )
        if (enemy.fireTimer <= 0 && inFireRange) {
          const handled = handler.fire ? handler.fire(enemy, playerPosition, ctx) : false
          if (!handled) fireEnemyProjectile(enemy, playerPosition)
          enemy.fireTimer = handler.fireInterval ? handler.fireInterval(enemy) : randomEnemyFireInterval()
        }
      }

      // ============ POST-UPDATE (boss: updateBossLaser) ============
      if (handler.postUpdate) handler.postUpdate(enemy, dt, playerPosition, ctx)
    }

    return { hits, ramKills, ramKillPoints, ramBossDefeated, ramBossWorldPos }
  }

  function updateEnemyProjectiles(dt, playerPosition) {
    let hits = 0
    let damage = 1
    for (const projectile of [...enemyProjectiles]) {
      if (projectile.homing) {
        const desired = playerPosition.clone().sub(projectile.mesh.position).normalize()
        const current = projectile.velocity.clone().normalize()
        current.lerp(desired, Math.min(1, GOLDEN_MINION_TURN_RATE * dt))
        if (current.lengthSq() > 1e-6) {
          projectile.velocity.copy(current.normalize().multiplyScalar(GOLDEN_MINION_SPEED))
          projectile.mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, current)
        }
      }
      const step = projectile.velocity.clone().multiplyScalar(dt)
      projectile.mesh.position.add(step)
      projectile.traveled += step.length()
      const hitRadius = projectile.hitRadius ?? ENEMY_PROJECTILE_HIT_RADIUS
      const maxRange = projectile.maxRange ?? ENEMY_PROJECTILE_MAX_RANGE
      if (playerPosition.distanceTo(projectile.mesh.position) <= hitRadius) {
        hits += 1
        damage = Math.max(damage, projectile.shieldDamage ?? 1)
        removeEnemyProjectile(projectile)
        continue
      }
      if (projectile.traveled > maxRange) removeEnemyProjectile(projectile)
    }
    return { hits, damage }
  }

  function updateEnemyLasers(dt, playerPosition) {
    let hits = 0
    let damage = 1
    for (const laser of [...enemyLasers]) {
      const step = laser.velocity.clone().multiplyScalar(dt)
      const prevPos = laser.mesh.position.clone()
      laser.mesh.position.add(step)
      laser.traveled += step.length()
      const hitRadius = laser.hitRadius ?? BOSS_LASER_HIT_RADIUS
      if (distanceToSegment(playerPosition, prevPos, laser.mesh.position) <= hitRadius) {
        hits += 1
        damage = Math.max(damage, laser.shieldDamage ?? 1)
        removeEnemyLaser(laser)
        continue
      }
      if (laser.traveled > (laser.maxRange ?? 220)) removeEnemyLaser(laser)
    }
    return { hits, damage }
  }

  function updateEnemyGates(dt, playerPosition) {
    let hits = 0
    let damage = 1
    for (const gate of [...enemyGates]) {
      updateGateAnimation(gate, dt)
      const step = gate.velocity.clone().multiplyScalar(dt)
      gate.mesh.position.add(step)
      gate.traveled += step.length()
      if (gate.traveled >= gate.targetDistance) {
        const { hit } = resolveGateHit(gate, playerPosition)
        if (hit) { hits += 1; damage = Math.max(damage, gate.shieldDamage ?? 1) }
        removeEnemyGate(gate)
      }
    }
    return { hits, damage }
  }

  return {
    spawnEnemy() {
      const enemy = spawnBlaster(scene, rail, nextEnemyId++)
      enemy.fireTimer = randomEnemyFireInterval()
      enemies.push(enemy)
    },

    spawnMiniSwarm() {
      const group = spawnMiniSwarmGroup(scene, rail, () => nextEnemyId++)
      for (const e of group) enemies.push(e)
    },

    spawnTimeEnemy() {
      const enemy = spawnTimeEnemy(scene, rail, nextEnemyId++)
      enemy.fireTimer = randomEnemyFireInterval()
      enemies.push(enemy)
    },

    spawnTimeEnemyMega() {
      const enemy = spawnTimeEnemyMega(scene, rail, nextEnemyId++)
      enemy.fireTimer = randomEnemyFireInterval()
      enemies.push(enemy)
    },

    spawnTankEnemy(hp = TANK_DEFAULT_HP) {
      const enemy = spawnTankEnemy(scene, rail, nextEnemyId++, hp)
      enemy.fireTimer = randomEnemyFireInterval()
      enemies.push(enemy)
    },

    spawnDetrito() {
      enemies.push(spawnDetrito(scene, rail, nextEnemyId++))
    },

    spawnSentinela() {
      const enemy = spawnSentinela(scene, rail, nextEnemyId++)
      if (enemy) enemies.push(enemy)
    },

    spawnReplica() {
      const enemy = spawnReplica(scene, rail, nextEnemyId++)
      if (enemy) enemies.push(enemy)
    },

    spawnFragata() {
      const enemy = spawnFragata(scene, rail, nextEnemyId++)
      if (enemy) enemies.push(enemy)
    },

    spawnVerme() {
      const segments = spawnVerme(scene, rail, () => nextEnemyId++)
      for (const e of segments) enemies.push(e)
    },

    spawnImaSwarm() {
      const group = spawnImaSwarm(scene, rail, () => nextEnemyId++)
      for (const e of group) enemies.push(e)
    },

    spawnSussurro() {
      const enemy = spawnSussurro(scene, rail, nextEnemyId++)
      if (enemy) enemies.push(enemy)
    },

    getMagnetSources: () => enemies
      .filter((e) => e.kind === IMA_KIND && !e.dying)
      .map((e) => ({ position: e.mesh.position.clone(), radius: IMA_FIELD_RADIUS, strength: IMA_FIELD_STRENGTH })),

    spawnBossEnemy(hp) {
      enemies.push(spawnBossEnemy(scene, rail, nextEnemyId++, hp))
    },

    spawnGoldenSpecial(opts = {}) {
      golden.spawn(opts)
    },

    showArenaPreview,
    clearArenaPreview,

    update(dt, playerPosition, opts = {}) {
      elapsed += dt
      if (arenaPreviewMesh) arenaPreviewMesh.rotation.y += dt * 0.4
      const ramDamage = opts.ramDamage || 0
      const goldenRamResult = golden.update(dt, playerPosition, goldenUpdateCtx, ramDamage)
      const result = updateEnemies(dt, playerPosition, ramDamage)
      return {
        ...result,
        ramGoldenDefeated: goldenRamResult?.ramGoldenDefeated || false,
        ramGoldenWorldPos: goldenRamResult?.ramGoldenWorldPos || null,
      }
    },

    updateProjectiles(dt, playerPosition) {
      const p = updateEnemyProjectiles(dt, playerPosition)
      const l = updateEnemyLasers(dt, playerPosition)
      const g = updateEnemyGates(dt, playerPosition)
      return { hits: p.hits + l.hits + g.hits, damage: Math.max(p.damage, l.damage, g.damage) }
    },

    resolveProjectileHit(prevPos, currPos, projectileMeta = {}) {
      const damage = projectileMeta.damage ?? 1
      const isHoming = !!projectileMeta.isHoming
      const hitBuffer = projectileMeta.hitBuffer || 0

      const enemyHit = enemies.find((e) => {
        if (e.dying) return false
        const handler = handlerFor(e)
        return distanceToSegment(e.mesh.position, prevPos, currPos) <= handler.hitRadius(e) + hitBuffer
      })
      if (enemyHit) {
        const handler = handlerFor(enemyHit)
        if (enemyHit.kind === FRAGATA_KIND && isFragataShielded(enemyHit, prevPos)) {
          if (effects) effects.hitSpark(enemyHit.mesh.position, FRAGATA_SHIELD_COLOR)
          return {
            kind: enemyHit.kind, killed: false, blocked: true, worldPos: enemyHit.mesh.position.clone(), meshRef: enemyHit.mesh,
            enemyKillPoints: 0, timeReductionMs: null, bossDefeated: false, goldenSpecialHit: false,
          }
        }
        enemyHit.hp -= damage
        if (isHoming && effects) effects.explosion(enemyHit.mesh.position, HOMING_EXPLOSION_COLOR, 0.5)
        if (enemyHit.kind === BOSS_KIND && effects) {
          effects.bossImpactRing(enemyHit.mesh.position, 1)
          effects.bloomSprite(enemyHit.mesh.position, 0xff7d3a, 1.5)
        }
        const killed = enemyHit.hp <= 0
        let enemyKillPoints = 0
        let timeReductionMs = null
        let bossDefeated = false
        if (killed) {
          enemyHit.dying = true
          enemyHit.deathT = 0
          if (enemyHit.kind === BOSS_KIND) {
            bossDefeated = true
            if (effects) explodeBoss(effects, enemyHit.mesh.position, isHoming)
          } else {
            enemyKillPoints = handler.killPoints(enemyHit)
            if (enemyHit.kind === TIME_KIND) timeReductionMs = TIME_REDUCTION_MIN_MS + Math.random() * (TIME_REDUCTION_MAX_MS - TIME_REDUCTION_MIN_MS)
            if (enemyHit.kind === VERME_KIND) severChainAt(enemyHit, enemies)
            const killColor = isHoming ? HOMING_EXPLOSION_COLOR : handler.color(enemyHit)
            if (effects) effects.explosion(enemyHit.mesh.position, killColor, 1.6, { rings: true })
          }
        }
        return {
          kind: enemyHit.kind, killed, worldPos: enemyHit.mesh.position.clone(), meshRef: enemyHit.mesh,
          enemyKillPoints, timeReductionMs, bossDefeated, goldenSpecialHit: false,
        }
      }

      const goldenHit = golden.resolveHit(prevPos, currPos, damage, isHoming, hitBuffer, effects)
      if (goldenHit) return goldenHit

      return null
    },

    getEnemyCount() {
      return enemies.reduce((n, e) => n + (e.kind === BLASTER_KIND ? 1 : 0), 0)
    },

    getEnemySnapshots: () => enemies
      .filter((e) => !e.dying && (e.maxHp > 1 || e.kind === MINI_SWARM_KIND))
      .map((e) => ({ id: e.id, worldPos: e.mesh.position.clone(), hp: e.hp, maxHp: e.maxHp }))
      .concat(golden.getSnapshots()),

    getBossSnapshot: () => {
      const boss = enemies.find((e) => e.kind === BOSS_KIND && !e.dying)
      return boss ? { hp: boss.hp, maxHp: boss.maxHp } : null
    },

    getMinimapBlips: () => {
      const blips = []
      for (const e of enemies) {
        if (e.dying) continue
        blips.push({ type: e.kind === BOSS_KIND ? 'boss' : 'enemy', worldPos: e.mesh.position })
      }
      return blips.concat(golden.getMinimapBlips())
    },

    getHitboxTargets: () => {
      const list = []
      for (const e of enemies) if (!e.dying) list.push({ worldPos: e.mesh.position, radius: handlerFor(e).hitRadius(e) })
      for (const p of enemyProjectiles) list.push({ worldPos: p.mesh.position, radius: ENEMY_PROJECTILE_HIT_RADIUS })
      return list.concat(golden.getHitboxTargets())
    },

    getAlive: () => enemies.filter((e) => !e.dying),
    getGoldenAlive: () => golden.getAlive(),

    removeProjectilesNear(position, radius) {
      const removed = []
      for (const p of [...enemyProjectiles]) {
        if (position.distanceTo(p.mesh.position) > radius) continue
        removed.push(p.mesh.position.clone())
        removeEnemyProjectile(p)
      }
      return removed
    },

    setEnemyAggressiveness(multiplier) { enemyAggression = multiplier },
    setEnemyProjectileSpeedBonus(bonus) { enemyProjectileSpeedBonus = bonus },

    clearEnemies() {
      for (const enemy of [...enemies]) removeEnemy(enemy)
      for (const projectile of [...enemyProjectiles]) removeEnemyProjectile(projectile)
      for (const l of [...enemyLasers]) removeEnemyLaser(l)
      for (const g of [...enemyGates]) removeEnemyGate(g)
    },

    clearGoldenTargets() {
      golden.clear()
    },

    clearOtherEnemies() {
      for (const enemy of [...enemies]) if (!enemy.dying) removeEnemy(enemy)
      golden.clear()
      for (const projectile of [...enemyProjectiles]) removeEnemyProjectile(projectile)
      for (const l of [...enemyLasers]) removeEnemyLaser(l)
      for (const g of [...enemyGates]) removeEnemyGate(g)
    },

    clearAll() {
      for (const enemy of [...enemies]) removeEnemy(enemy)
      for (const projectile of [...enemyProjectiles]) removeEnemyProjectile(projectile)
      for (const l of [...enemyLasers]) removeEnemyLaser(l)
      for (const g of [...enemyGates]) removeEnemyGate(g)
      golden.clear()
    },

    dispose() {
      for (const e of [...enemies]) removeEnemy(e)
      for (const p of [...enemyProjectiles]) removeEnemyProjectile(p)
      for (const l of [...enemyLasers]) removeEnemyLaser(l)
      for (const g of [...enemyGates]) removeEnemyGate(g)
      golden.dispose()
      clearArenaPreview()
      enemyProjectileGeometry.dispose()
      enemyProjectileMaterial.dispose()
      disposeBlaster()
      disposeMiniSwarm()
      disposeTank()
      disposeTimeEnemy()
      disposeBoss()
      disposeDetrito()
      disposeSentinela()
      disposeReplica()
      disposeFragata()
      disposeVerme()
      disposeIma()
      disposeSussurro()
    },
  }
}
