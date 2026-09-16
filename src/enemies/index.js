import * as THREE from 'three'
import { PASS_BEHIND, FORWARD_AXIS, distanceToSegment, HOMING_EXPLOSION_COLOR } from './shared.js'
import {
  BLASTER_KIND, BLASTER_HIT_RADIUS, BLASTER_DEATH_DURATION, BLASTER_KILL_BONUS,
  BLASTER_SPAWN_DISTANCE_MIN, BLASTER_SPAWN_DISTANCE_MAX, BLASTER_BOX_X, BLASTER_BOX_Y,
  spawnBlaster, updateBlasterArenaMovement, updateBlasterRailMovement, blasterPassBehind, blasterColor, disposeBlaster,
} from './blaster.js'
import { MINI_SWARM_KIND, spawnMiniSwarm as spawnMiniSwarmGroup, updateMiniSwarm, miniSwarmHitRadius, disposeMiniSwarm } from './miniSwarm.js'
import { TANK_KIND, TANK_COLOR, TANK_HIT_RADIUS, TANK_DEATH_DURATION, TANK_DEFAULT_HP, spawnTankEnemy, disposeTank } from './tank.js'
import {
  TIME_KIND, TIME_HIT_RADIUS, TIME_DEATH_DURATION, TIME_REDUCTION_MIN_MS, TIME_REDUCTION_MAX_MS,
  spawnTimeEnemy, spawnTimeEnemyMega, updateTimeSpin, timePassBehind, timeColor, timeFire, disposeTimeEnemy,
} from './timeEnemy.js'
import {
  BOSS_KIND, BOSS_COLOR, BOSS_HIT_RADIUS, BOSS_DEATH_DURATION, BOSS_LASER_HIT_RADIUS,
  bossEnemyGeometry, bossEnemyMaterial, BOSS_SHIELD_COLOR,
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
  spawnSussurro, updateSussurro, sussurroShouldSummon, disposeSussurro,
} from './sussurro.js'

export { TIME_REDUCTION_MIN_MS, TIME_REDUCTION_MAX_MS }

// ============ constantes genéricas (comuns a vários kinds, não específicas de 1 classe) ============
const ENEMY_FIRE_INTERVAL_MIN = 1500
const ENEMY_FIRE_INTERVAL_MAX = 3000
const ENEMY_FIRE_RANGE = 120
const ENEMY_FIRE_MIN_DISTANCE = 14
const ENEMY_PROJECTILE_SPEED = 26
const ENEMY_PROJECTILE_MAX_RANGE = 100
// pedido do usuário: "os tiros deles nunca chegam em você" no all-range — bug real, confirmado.
// Em arena, `inFireRange` deixava atirar de QUALQUER distância (até ENEMY_ARENA_SPAWN_MAX =
// 160), mas o projétil se autodestrói em ENEMY_PROJECTILE_MAX_RANGE (100) — de longe, o tiro
// sempre expirava no meio do caminho. Precisa estar dentro deste raio pra atirar de verdade.
const ENEMY_ARENA_FIRE_MAX_DISTANCE = 85
const ENEMY_PROJECTILE_HIT_RADIUS = 1.6
const ENEMY_AIM_ERROR_DEG = 5

// preview do chefe/dourado no aviso de 5s — pedido do usuário: "sempre faça o inimigo
// dourado/boss inicialmente surgir BEM distante mas visível na tela... antes de trocar para o
// all-range mode" — reto à frente no trilho, escala aumentada pra compensar a distância
const ARENA_PREVIEW_DISTANCE = 220
const ARENA_PREVIEW_SCALE = { boss: BOSS_HIT_RADIUS * 2 * 2.4, golden: 3.2 }

const GOLDEN_MINION_TURN_RATE = 2.5
const GOLDEN_MINION_SPEED = 16

export function createEnemiesSystem(scene, rail, effects = null) {
  const enemies = []
  const enemyProjectiles = []
  const enemyLasers = []
  const enemyGates = []
  let nextEnemyId = 1
  let elapsed = 0
  let enemyAggression = 1
  let arenaPreviewMesh = null
  // "+1 na velocidade dos disparos dos inimigos por pergunta errada" — soma direto na
  // velocidade base do projétil comum (também usado pela rajada do chefe)
  let enemyProjectileSpeedBonus = 0
  let enemyAimErrorDeg = ENEMY_AIM_ERROR_DEG

  const golden = createGoldenSystem(scene, rail, effects, () => nextEnemyId++)

  // material/geometria do projétil comum — compartilhado por blaster/tank/time-normal/chefe
  const enemyProjectileGeometry = new THREE.ConeGeometry(0.35, 1.4, 6)
  enemyProjectileGeometry.rotateX(Math.PI / 2)
  const enemyProjectileMaterial = new THREE.MeshBasicMaterial({ color: 0xff5a3d })
  const reflectedProjectileMaterial = new THREE.MeshBasicMaterial({ color: BOSS_SHIELD_COLOR })

  function clearArenaPreview() {
    if (!arenaPreviewMesh) return
    scene.remove(arenaPreviewMesh)
    arenaPreviewMesh = null
  }

  // mesh decorativo só (sem hp/IA/colisão) pro aviso de 5s
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
    if (l.outerMat) l.outerMat.dispose()
    if (l.innerMat) l.innerMat.dispose()
    if (l.mesh && l.mesh.traverse) {
      l.mesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose()
        if (child.material) child.material.dispose()
      })
    }
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

  // ============ dispatch por kind (cada classe expõe seu pedaço, ver arquivo próprio) ============
  function hitRadiusFor(enemy) {
    switch (enemy.kind) {
      case BOSS_KIND: return BOSS_HIT_RADIUS
      case TIME_KIND: return TIME_HIT_RADIUS
      case MINI_SWARM_KIND: return miniSwarmHitRadius()
      case TANK_KIND: return TANK_HIT_RADIUS
      case DETRITO_KIND: return detritoHitRadius(enemy)
      case SENTINELA_KIND: return SENTINELA_HIT_RADIUS
      case REPLICA_KIND: return REPLICA_HIT_RADIUS
      case FRAGATA_KIND: return FRAGATA_HIT_RADIUS
      case VERME_KIND: return VERME_HIT_RADIUS
      case IMA_KIND: return IMA_HIT_RADIUS
      case SUSSURRO_KIND: return SUSSURRO_HIT_RADIUS
      default: return BLASTER_HIT_RADIUS
    }
  }

  function deathDurationFor(enemy) {
    switch (enemy.kind) {
      case BOSS_KIND: return BOSS_DEATH_DURATION
      case TIME_KIND: return TIME_DEATH_DURATION
      case TANK_KIND: return TANK_DEATH_DURATION
      case DETRITO_KIND: return DETRITO_DEATH_DURATION
      case SENTINELA_KIND: return SENTINELA_DEATH_DURATION
      case REPLICA_KIND: return REPLICA_DEATH_DURATION
      case FRAGATA_KIND: return FRAGATA_DEATH_DURATION
      case VERME_KIND: return VERME_DEATH_DURATION
      case IMA_KIND: return IMA_DEATH_DURATION
      case SUSSURRO_KIND: return SUSSURRO_DEATH_DURATION
      default: return BLASTER_DEATH_DURATION
    }
  }

  // usada tanto pro telegraph de aviso quanto pro tingimento da explosão de kill — cada classe
  // já tem sua própria cor de mesh, reaproveitar aqui é o que dá a leitura "cor = identidade"
  function colorFor(enemy) {
    switch (enemy.kind) {
      case BLASTER_KIND: return blasterColor(enemy)
      case TIME_KIND: return timeColor(enemy)
      case TANK_KIND: return TANK_COLOR
      case BOSS_KIND: return BOSS_COLOR
      case DETRITO_KIND: return DETRITO_COLOR
      case SENTINELA_KIND: return SENTINELA_COLOR
      case REPLICA_KIND: return REPLICA_COLOR
      case FRAGATA_KIND: return FRAGATA_BODY_COLOR
      case VERME_KIND: return VERME_COLOR
      case IMA_KIND: return IMA_COLOR
      case SUSSURRO_KIND: return SUSSURRO_COLOR
      default: return 0xff5a3d
    }
  }

  function killPointsFor(kind) {
    if (kind === DETRITO_KIND) return DETRITO_KILL_BONUS
    if (kind === REPLICA_KIND) return REPLICA_KILL_BONUS
    if (kind === FRAGATA_KIND) return FRAGATA_KILL_BONUS
    if (kind === VERME_KIND) return VERME_KILL_BONUS
    if (kind === IMA_KIND) return IMA_KILL_BONUS
    if (kind === SUSSURRO_KIND) return SUSSURRO_KILL_BONUS
    return BLASTER_KILL_BONUS
  }

  function passBehindFor(enemy) {
    if (enemy.kind === BLASTER_KIND) return blasterPassBehind(enemy)
    if (enemy.kind === TIME_KIND) return timePassBehind(enemy)
    if (enemy.kind === SENTINELA_KIND) return sentinelaPassBehind(enemy)
    if (enemy.kind === REPLICA_KIND) return replicaPassBehind()
    return PASS_BEHIND
  }

  // ============ disparo genérico (blaster/tank/time-normal/rajada do chefe/dourado) ============
  function fireEnemyProjectile(enemy, playerPosition) {
    const mesh = new THREE.Mesh(enemyProjectileGeometry, enemyProjectileMaterial)
    mesh.position.copy(enemy.mesh.position)

    const direction = playerPosition.clone().sub(enemy.mesh.position).normalize()

    const errAngle = THREE.MathUtils.degToRad((Math.random() * 2 - 1) * enemyAimErrorDeg)
    const errAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
    direction.applyAxisAngle(errAxis, errAngle)
    mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, direction)

    scene.add(mesh)
    enemyProjectiles.push({ mesh, velocity: direction.multiplyScalar(ENEMY_PROJECTILE_SPEED + enemyProjectileSpeedBonus), traveled: 0 })
  }

  const bossLaserCtx = { pushLaser: (l) => enemyLasers.push(l) }
  const timeLaserCtx = { pushLaser: (l) => enemyLasers.push(l) }
  const projectileCtx = { fireEnemyProjectile }
  const goldenUpdateCtx = { fireEnemyProjectile, pushProjectile: (p) => enemyProjectiles.push(p), pushLaser: (l) => enemyLasers.push(l) }

  // ============ IA principal ============
  // ramDamage > 0: carta roguelike "impulso aríete" ativa durante o impulso de propulsão —
  // colisão vira dano de verdade (inclusive no CHEFE) em vez do kamikaze padrão
  function updateEnemies(dt, playerPosition, ramDamage = 0) {
    const inArena = rail.isArena()
    const frame = rail.getFrameAt(0)
    let hits = 0
    let ramKills = 0
    let ramKillPoints = 0
    let ramBossDefeated = false
    let ramBossWorldPos = null
    for (const enemy of [...enemies]) {
      const hitRadius = hitRadiusFor(enemy)
      const deathDuration = deathDurationFor(enemy)
      const baseScale = enemy.mesh.scale.x || 1
      if (enemy.dying) {
        enemy.deathT += dt / deathDuration
        const t = Math.max(0, 1 - enemy.deathT)
        enemy.mesh.scale.setScalar((enemy.deathScale ?? baseScale) * t)
        if (enemy.deathT >= 1) removeEnemy(enemy)
        continue
      }
      enemy.deathScale = baseScale

      const collisionRadius = hitRadius + (ramDamage > 0 ? 5.5 : 0)
      if (playerPosition.distanceTo(enemy.mesh.position) <= collisionRadius) {
        hits += 1
        if (ramDamage > 0) {
          // BUG corrigido: aplicava `ramDamage` A CADA FRAME de sobreposição — pro chefe (hp
          // alto, fica vários frames dentro do raio) isso multiplicava o dano de verdade muito
          // além do pretendido. `ramHitActive` só deixa bater na BORDA DE SUBIDA (entrando no
          // raio vindo de fora) — um hit por encostada. Continua congelado (sem mover) enquanto
          // durar a sobreposição; o flag reseta assim que sai do raio.
          if (!enemy.ramHitActive) {
            enemy.ramHitActive = true
            if (enemy.kind === BOSS_KIND && enemy.isShieldActive) {
              if (effects) {
                effects.hitSpark(enemy.mesh.position, BOSS_SHIELD_COLOR)
                effects.shockwave(enemy.mesh.position, BOSS_SHIELD_COLOR, 0.8)
              }
              continue
            }
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
                ramKillPoints += killPointsFor(enemy.kind)
                if (enemy.kind === VERME_KIND) severChainAt(enemy, enemies, rail)
                if (effects) effects.explosion(enemy.mesh.position, colorFor(enemy), 1.6, { rings: true })
              }
            }
          }
          continue
        }
        enemy.ramHitActive = false
        if (enemy.kind !== BOSS_KIND) {
          if (enemy.kind === VERME_KIND) severChainAt(enemy, enemies, rail)
          removeEnemy(enemy)
          continue
        }
      } else {
        enemy.ramHitActive = false
      }

      if (enemy.spawnAge != null && enemy.spawnAge < enemy.spawnDuration) {
        enemy.spawnAge += dt
        const t = Math.min(1, enemy.spawnAge / enemy.spawnDuration)
        const scale = THREE.MathUtils.lerp(0.2, 1.0, Math.sin(t * Math.PI * 0.5))
        enemy.mesh.scale.setScalar(scale)
      }

      // fila de mini-inimigos: patrulha + mergulho (reto/zigue-zague/espiral) — nunca atira, se
      // remove sozinha (não usa o pass-behind genérico abaixo)
      if (enemy.kind === MINI_SWARM_KIND) {
        updateMiniSwarm(enemy, dt, { playerPosition, frame, elapsed, removeEnemy })
        continue
      }

      const isDetrito = enemy.kind === DETRITO_KIND
      const isIma = enemy.kind === IMA_KIND
      if (enemy.kind === BOSS_KIND) {
        updateBossMovement(enemy, dt, playerPosition)
      } else if (isDetrito || isIma) {
        // obstáculo estático: sem chase, só gira por vida visual. Em trilho ainda passa pra trás
        // e some (senão acumularia pra sempre); em arena, persiste até morrer, igual todo outro
        // kind lá. Enxame-ímã reaproveita 100% esse comportamento — só muda o giro visual.
        if (isDetrito) updateDetritoSpin(enemy, dt)
        else updateImaSpin(enemy, dt)
        if (!inArena) {
          const relative = enemy.mesh.position.clone().sub(frame.position)
          const passedDistance = (enemy.spawnRailDist != null) && (rail.getDistance() - enemy.spawnRailDist > 180)
          if (relative.dot(frame.forward) < PASS_BEHIND || passedDistance) { removeEnemy(enemy); continue }
        }
      } else if (inArena) {
        // pedido do usuário: inimigos comuns muito lentos em arena — *0.5 limitava a metade da
        // velocidade do jogador, subido pra *0.7. Fragata mantém *0.5 de propósito (ela é uma
        // "parede móvel" que só precisa alcançar o standoff, não perseguir agressivamente).
        if (enemy.kind === BLASTER_KIND) {
          updateBlasterArenaMovement(enemy, dt, playerPosition, frame, rail.getArenaSpeed() * 0.7)
        } else if (enemy.kind === FRAGATA_KIND) {
          updateFragataMovement(enemy, dt, playerPosition, rail.getArenaSpeed() * 0.5)
        } else {
          // tank/time (genérico): chase reto ou órbita, mesma lógica de sempre — default do
          // speedFactor subiu de 0.6 pra 0.8 junto com o teto acima
          const speedCap = rail.getArenaSpeed() * 0.7
          const chaseSpeed = (enemy.speedFactor ?? 0.8) * speedCap
          const desiredDir = playerPosition.clone().sub(enemy.mesh.position)
          if (desiredDir.lengthSq() > 1e-4) {
            desiredDir.normalize()
            if (!enemy.moveDir) enemy.moveDir = desiredDir.clone()
            enemy.moveDir.lerp(desiredDir, Math.min(1, 1.6 * dt))
            if (enemy.moveDir.lengthSq() > 1e-6) enemy.moveDir.normalize()
            enemy.mesh.position.addScaledVector(enemy.moveDir, chaseSpeed * dt)
          }
          enemy.mesh.lookAt(playerPosition)
        }
      } else {
        // modo trilho
        if (enemy.kind === BLASTER_KIND) updateBlasterRailMovement(enemy, dt, rail)
        else if (enemy.kind === SENTINELA_KIND) {
          updateSentinelaMovement(enemy, dt, frame, rail)
          // BUG FIX: Sentinela em LEAVING voa pra FRENTE (mais rápido que o jogador), então o
          // pass-behind normal abaixo (que despawna quem ficou ATRÁS) nunca dispara nela — ela
          // ficava viva pra sempre, invisível pela névoa mas ainda no array de inimigos (ainda
          // podia ser travada pelo tiro teleguiado). Despawna por distância à frente.
          if (sentinelaShouldDespawn(enemy, frame)) { removeEnemy(enemy); continue }
        }
        else if (enemy.kind === REPLICA_KIND) updateReplicaMovement(enemy, dt, rail, frame)
        else if (enemy.kind === VERME_KIND) updateVermeMovement(enemy, dt, rail)
        else if (enemy.kind === SUSSURRO_KIND) {
          updateSussurro(enemy, dt, rail)
          if (sussurroShouldSummon(enemy)) {
            const count = 2 + Math.floor(Math.random() * 2)
            for (let i = 0; i < count; i += 1) {
              const reinforcement = spawnBlaster(scene, rail, nextEnemyId++)
              reinforcement.fireTimer = randomEnemyFireInterval()
              enemies.push(reinforcement)
            }
          }
        }
        // Réplica/Verme não olham pro jogador (não faz sentido pro conceito de cada um) — os
        // outros continuam com a ponta virada pro jogador, comportamento de sempre.
        if (enemy.kind !== REPLICA_KIND && enemy.kind !== VERME_KIND) enemy.mesh.lookAt(playerPosition)
        if (enemy.kind === TIME_KIND) updateTimeSpin(enemy, dt)

        const relative = enemy.mesh.position.clone().sub(frame.position)
        const passBehind = passBehindFor(enemy)
        const passedDistance = (enemy.spawnRailDist != null) && (rail.getDistance() - enemy.spawnRailDist > 180)
        if (relative.dot(frame.forward) < passBehind || passedDistance) { removeEnemy(enemy); continue }
      }

      // telegraph colorido por classe + deslocado pra fora do mesh do chefe (senão nasce
      // invisível dentro do corpo dele)
      if (enemy.fireTimer > 0.3 && enemy.fireTimer - dt <= 0.3 && effects) {
        let tPos = enemy.mesh.position
        if (enemy.kind === BOSS_KIND) {
          const toPlayerDir = playerPosition.clone().sub(enemy.mesh.position)
          if (toPlayerDir.lengthSq() > 1e-4) tPos = enemy.mesh.position.clone().addScaledVector(toPlayerDir.normalize(), BOSS_HIT_RADIUS)
        }
        effects.telegraph(tPos, colorFor(enemy))
      }
      enemy.fireTimer -= dt
      const relativeForward = enemy.mesh.position.clone().sub(frame.position).dot(frame.forward)
      const distToPlayer = enemy.mesh.position.distanceTo(playerPosition)
      const inFireRange = distToPlayer > ENEMY_FIRE_MIN_DISTANCE && (
        inArena ? distToPlayer <= ENEMY_ARENA_FIRE_MAX_DISTANCE
          : enemy.kind === BOSS_KIND || relativeForward < ENEMY_FIRE_RANGE
      )
      if (enemy.fireTimer <= 0 && inFireRange) {
        let handled = false
        if (enemy.kind === BOSS_KIND) { fireBossVolley(enemy, playerPosition, projectileCtx); handled = true }
        else if (enemy.kind === TIME_KIND) handled = timeFire(scene, enemy, playerPosition, timeLaserCtx)
        else if (enemy.kind === SENTINELA_KIND) handled = sentinelaFire(scene, enemy, playerPosition, { pushGate: (g) => enemyGates.push(g) })
        if (!handled) fireEnemyProjectile(enemy, playerPosition)
        enemy.fireTimer = enemy.kind === BOSS_KIND
          ? randomBossFireInterval()
          : enemy.kind === SENTINELA_KIND ? SENTINELA_FIRE_INTERVAL : randomEnemyFireInterval()
      }

      if (enemy.kind === BOSS_KIND) updateBossLaser(scene, enemy, dt, playerPosition, effects, bossLaserCtx)
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

      // Taper visual: começa largo e afunila/encolhe suavemente conforme viaja
      const maxR = laser.maxRange ?? 220
      const prog = THREE.MathUtils.clamp(laser.traveled / maxR, 0, 1)
      const pulse = 1 + Math.sin(laser.traveled * 0.4) * 0.15
      const beamScale = Math.max(0.18, 1.3 - prog * 0.9) * pulse
      laser.mesh.scale.set(beamScale, beamScale, 1.0)
      if (laser.outerMat) laser.outerMat.opacity = Math.max(0.2, (1 - prog * 0.6) * 0.85)

      const hitRadius = (laser.hitRadius ?? BOSS_LASER_HIT_RADIUS) * Math.max(0.5, beamScale)
      if (distanceToSegment(playerPosition, prevPos, laser.mesh.position) <= hitRadius) {
        hits += 1
        damage = Math.max(damage, laser.shieldDamage ?? 1)
        removeEnemyLaser(laser)
        continue
      }
      if (laser.traveled > maxR) removeEnemyLaser(laser)
    }
    return { hits, damage }
  }

  // ao chegar na distância travada, resolve uma vez (borda machuca, buraco/fora do alcance é
  // seguro) e remove — sem colisão contínua por segmento como projétil/laser normais
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

  function registerSpawn(enemy) {
    if (!enemy) return null
    enemy.spawnRailDist = rail.getDistance()
    if (!rail.isArena() && enemy.mesh && enemy.kind !== BOSS_KIND) {
      enemy.spawnAge = 0
      enemy.spawnDuration = 0.35
      enemy.mesh.scale.setScalar(0.2)
      if (effects) {
        if (enemy.kind === MINI_SWARM_KIND && effects.flankSpawnTrail) {
          effects.flankSpawnTrail(enemy.mesh.position, null, colorFor(enemy))
        } else if (effects.fogWispCondensation) {
          effects.fogWispCondensation(enemy.mesh.position, colorFor(enemy))
        }
      }
    }
    enemies.push(enemy)
    return enemy
  }

  function registerSpawnGroup(group) {
    if (!group) return
    for (const e of group) registerSpawn(e)
  }

  return {
    spawnEnemy() {
      const enemy = spawnBlaster(scene, rail, nextEnemyId++)
      enemy.fireTimer = randomEnemyFireInterval()
      registerSpawn(enemy)
    },

    spawnMiniSwarm() {
      const group = spawnMiniSwarmGroup(scene, rail, () => nextEnemyId++)
      registerSpawnGroup(group)
    },

    spawnTimeEnemy() {
      const enemy = spawnTimeEnemy(scene, rail, nextEnemyId++)
      enemy.fireTimer = randomEnemyFireInterval()
      registerSpawn(enemy)
    },

    spawnTimeEnemyMega() {
      const enemy = spawnTimeEnemyMega(scene, rail, nextEnemyId++)
      enemy.fireTimer = randomEnemyFireInterval()
      registerSpawn(enemy)
    },

    spawnTankEnemy(hp = TANK_DEFAULT_HP) {
      const enemy = spawnTankEnemy(scene, rail, nextEnemyId++, hp)
      enemy.fireTimer = randomEnemyFireInterval()
      registerSpawn(enemy)
    },

    spawnDetrito(count = 1) {
      const n = Math.max(1, Math.min(12, count))
      for (let i = 0; i < n; i++) {
        const enemy = spawnDetrito(scene, rail, nextEnemyId++)
        registerSpawn(enemy)
      }
    },

    spawnSentinela() {
      const enemy = spawnSentinela(scene, rail, nextEnemyId++)
      registerSpawn(enemy)
    },

    spawnReplica() {
      const enemy = spawnReplica(scene, rail, nextEnemyId++)
      registerSpawn(enemy)
    },

    spawnFragata() {
      const enemy = spawnFragata(scene, rail, nextEnemyId++)
      registerSpawn(enemy)
    },

    spawnVerme() {
      const segments = spawnVerme(scene, rail, () => nextEnemyId++)
      registerSpawnGroup(segments)
    },

    spawnImaSwarm() {
      const group = spawnImaSwarm(scene, rail, () => nextEnemyId++)
      registerSpawnGroup(group)
    },

    spawnSussurro() {
      const enemy = spawnSussurro(scene, rail, nextEnemyId++)
      registerSpawn(enemy)
    },

    // Fase de ideias de inimigos: fonte do campo magnético do Enxame-Ímã, consumida direto por
    // combat/projectiles.js (só o tiro NORMAL reage — o teleguiado ignora, ver comentário lá)
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

    // Explosão em área do tiro carregado no MÁXIMO (pedido do usuário): dano circular (raio
    // fixo, sem direção) num ponto do mundo — usado no impacto do teleguiado carregado ao
    // máximo, ALÉM do dano direto que ele já aplica no alvo travado. `dying` já filtra o alvo
    // que acabou de ser atingido (marcado dying ANTES desta função ser chamada), então não
    // duplica dano nele.
    applyAreaDamage(center, radius, damage) {
      let enemyKills = 0
      let enemyKillPoints = 0
      let bossDefeated = false
      let bossHitWorldPos = null
      const hitsLog = []
      for (const e of enemies) {
        if (e.dying) continue
        if (e.mesh.position.distanceTo(center) > radius) continue
        if (e.kind === BOSS_KIND && e.isShieldActive) continue
        e.hp -= damage
        const killed = e.hp <= 0
        hitsLog.push({ worldPos: e.mesh.position.clone(), damage, killed, isHoming: true, meshRef: e.mesh })
        if (killed) {
          e.dying = true
          e.deathT = 0
          if (e.kind === BOSS_KIND) {
            bossDefeated = true
            bossHitWorldPos = e.mesh.position.clone()
            e.isShieldActive = false
            if (e.shieldMesh) e.shieldMesh.visible = false
            if (effects) explodeBoss(effects, e.mesh.position, true)
          } else {
            enemyKillPoints += killPointsFor(e.kind)
            if (e.kind === VERME_KIND) severChainAt(e, enemies, rail)
            if (effects) effects.explosion(e.mesh.position, colorFor(e), 1.6, { rings: true })
            enemyKills += 1
          }
        } else if (effects) {
          effects.hitSpark(e.mesh.position, HOMING_EXPLOSION_COLOR)
        }
      }
      return { enemyKills, enemyKillPoints, bossDefeated, bossHitWorldPos, hitsLog }
    },

    // colisão dos tiros do JOGADOR contra inimigos e o especial dourado — checa inimigo
    // primeiro (mesma prioridade de antes), depois dourado. Retorna null se não achou nada.
    resolveProjectileHit(prevPos, currPos, projectileMeta = {}) {
      const damage = projectileMeta.damage ?? 1
      const isHoming = !!projectileMeta.isHoming
      const hitBuffer = projectileMeta.hitBuffer || 0

      const enemyHit = enemies.find((e) => !e.dying && distanceToSegment(e.mesh.position, prevPos, currPos) <= hitRadiusFor(e) + hitBuffer)
      if (enemyHit) {
        // Chefe: escudo refletor azul — a cada 7s ergue escudo por 3s que reflete tiros
        if (enemyHit.kind === BOSS_KIND && enemyHit.isShieldActive) {
          if (effects) {
            effects.hitSpark(prevPos, BOSS_SHIELD_COLOR)
            effects.shockwave(prevPos, BOSS_SHIELD_COLOR, 0.6)
          }
          const bounceDir = prevPos.clone().sub(currPos).normalize()
          if (bounceDir.lengthSq() < 1e-4) bounceDir.copy(FORWARD_AXIS).negate()
          const refMesh = new THREE.Mesh(enemyProjectileGeometry, reflectedProjectileMaterial)
          refMesh.position.copy(prevPos)
          refMesh.quaternion.setFromUnitVectors(FORWARD_AXIS, bounceDir)
          scene.add(refMesh)
          enemyProjectiles.push({
            mesh: refMesh,
            velocity: bounceDir.multiplyScalar(ENEMY_PROJECTILE_SPEED * 1.5 + enemyProjectileSpeedBonus),
            traveled: 0,
            hitRadius: ENEMY_PROJECTILE_HIT_RADIUS,
            maxRange: ENEMY_PROJECTILE_MAX_RANGE,
            shieldDamage: 1,
          })
          return {
            kind: enemyHit.kind, killed: false, blocked: true, reflected: true, worldPos: enemyHit.mesh.position.clone(), meshRef: enemyHit.mesh,
            enemyKillPoints: 0, timeReductionMs: null, bossDefeated: false, goldenSpecialHit: false,
          }
        }
        // Fragata-Escudo: bloqueia dano vindo do lado que a blindagem cobre AGORA — o projétil
        // ainda "bate" (spark âmbar), mas não desconta hp nem conta como acerto de verdade.
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
            enemyHit.isShieldActive = false
            if (enemyHit.shieldMesh) enemyHit.shieldMesh.visible = false
            if (effects) explodeBoss(effects, enemyHit.mesh.position, isHoming)
          } else {
            enemyKillPoints = killPointsFor(enemyHit.kind)
            if (enemyHit.kind === TIME_KIND) timeReductionMs = TIME_REDUCTION_MIN_MS + Math.random() * (TIME_REDUCTION_MAX_MS - TIME_REDUCTION_MIN_MS)
            if (enemyHit.kind === VERME_KIND) severChainAt(enemyHit, enemies, rail)
            const killColor = isHoming ? HOMING_EXPLOSION_COLOR : colorFor(enemyHit)
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
      for (const e of enemies) if (!e.dying) list.push({ worldPos: e.mesh.position, radius: hitRadiusFor(e) })
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
    setEnemyAimError(deg) { enemyAimErrorDeg = Math.max(1, deg) },

    clearEnemies() {
      for (const enemy of [...enemies]) removeEnemy(enemy)
      for (const projectile of [...enemyProjectiles]) removeEnemyProjectile(projectile)
      for (const l of [...enemyLasers]) removeEnemyLaser(l)
      for (const g of [...enemyGates]) removeEnemyGate(g)
    },

    clearGoldenTargets() {
      golden.clear()
    },

    // "quando um boss/inimigo dourado morre, todos inimigos e projéteis inimigos em tela devem
    // ser destruídos imediatamente também" — só poupa quem já está `dying:true`
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
      reflectedProjectileMaterial.dispose()
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
