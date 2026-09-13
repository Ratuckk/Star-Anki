import * as THREE from 'three'

// ============ (duplicadas de combat.js — pequenas, sem estado, seguras de duplicar) ============
// combat.js também usa PASS_BEHIND (pra quizTargets/bonusTargets) e distanceToSegment (pro
// hit-test dos tiros do jogador) — como enemies.js não pode importar combat.js (dependência
// circular: combat.js importa createEnemiesSystem daqui), essas duas ficam com cópia própria.
const PASS_BEHIND = -4
// mesma cor do teleguiado em combat.js (HOMING_EXPLOSION_COLOR) — mantém consistência visual
// da explosão/impacto quando quem acerta o inimigo é o tiro carregado
const HOMING_EXPLOSION_COLOR = 0x2bff88

// v0.29.4 (QoL): temporários de módulo pra distanceToSegment (mesma razão de combat.js — essa
// cópia é chamada por projétil × alvo × frame dentro de resolveProjectileHit).
const _dtsSeg = new THREE.Vector3()
const _dtsSub = new THREE.Vector3()
const _dtsClose = new THREE.Vector3()

function distanceToSegment(point, segStart, segEnd) {
  _dtsSeg.subVectors(segEnd, segStart)
  const lenSq = _dtsSeg.lengthSq()
  if (lenSq < 1e-8) return point.distanceTo(segStart)
  _dtsSub.subVectors(point, segStart)
  const t = THREE.MathUtils.clamp(_dtsSub.dot(_dtsSeg) / lenSq, 0, 1)
  _dtsClose.copy(segStart).addScaledVector(_dtsSeg, t)
  return point.distanceTo(_dtsClose)
}

// ============ INIMIGO VERMELHO COMUM ============
const ENEMY_COLOR = 0xff4d4d
const ENEMY_SPAWN_DISTANCE_MIN = 90
const ENEMY_SPAWN_DISTANCE_MAX = 140
const ENEMY_BOX_X = 7
const ENEMY_BOX_Y = 5
const ENEMY_HIT_RADIUS = 1.8
const ENEMY_DEATH_DURATION = 0.2
const ENEMY_KILL_BONUS = 30
const ENEMY_FIRE_INTERVAL_MIN = 1500
const ENEMY_FIRE_INTERVAL_MAX = 3000
const ENEMY_FIRE_RANGE = 120
const ENEMY_PROJECTILE_SPEED = 26
const ENEMY_PROJECTILE_MAX_RANGE = 100
const ENEMY_PROJECTILE_HIT_RADIUS = 1.6
const ENEMY_AIM_ERROR_DEG = 5

const ENEMY_ARENA_SPAWN_MIN = 70
const ENEMY_ARENA_SPAWN_MAX = 160
const ARENA_SPAWN_ELEVATION_MAX = THREE.MathUtils.degToRad(50)

// velocidade aleatória + movimento mais suave/radial em arena (Fase 4)
const ENEMY_ARENA_SPEED_FACTOR_MIN = 0.35
const ENEMY_ARENA_SPEED_FACTOR_MAX = 1.0
const ENEMY_TURN_RATE = 1.6
const ENEMY_ORBIT_CHANCE = 0.3
const ENEMY_ORBIT_DURATION_MIN = 1.5
const ENEMY_ORBIT_DURATION_MAX = 3.5
const ENEMY_ORBIT_RADIUS_MIN = 14
const ENEMY_ORBIT_RADIUS_MAX = 26
const ENEMY_ORBIT_ANGULAR_SPEED = 0.8

const ENEMY_FIRE_MIN_DISTANCE = 14

// ============ MINI-INIMIGOS (fila/enxame, só modo normal) ============
const MINI_ENEMY_COLOR = 0xff8080 // vermelho claro (o comum é 0xff4d4d)
const MINI_ENEMY_SCALE = 0.7 // 30% menor que o ENEMY_COLOR normal
const MINI_ENEMY_HIT_RADIUS = ENEMY_HIT_RADIUS * MINI_ENEMY_SCALE
const MINI_SWARM_MIN_COUNT = 5
const MINI_SWARM_MAX_COUNT = 10
const MINI_SWARM_SPACING = 2
const MINI_SWARM_PATROL_SPEED = 28
const MINI_SWARM_PATROL_AMPLITUDE = 10
const MINI_SWARM_PATROL_DURATION_MIN = 1.6
const MINI_SWARM_PATROL_DURATION_MAX = 2.8
const MINI_SWARM_DIVE_SPEED = 55
const MINI_SWARM_DIVE_SPREAD = 7
const MINI_SWARM_DIVE_MAX_S = 3

// ============ TANQUE (debug) ============
const TANK_ENEMY_COLOR = 0xff9d4d
const TANK_ENEMY_SCALE = 1.6
const TANK_ENEMY_DEFAULT_HP = 5

// ============ CHEFE ============
const BOSS_ENEMY_COLOR = 0xff2d4d
const BOSS_ENEMY_EMISSIVE = 0x5c0018
const BOSS_ENEMY_SCALE = 5
const BOSS_ENEMY_HIT_RADIUS = 7
const BOSS_ENEMY_DEATH_DURATION = 0.6
const BOSS_ENEMY_CHASE_SPEED = 7
const BOSS_ENEMY_FIRE_INTERVAL_MIN = 800
const BOSS_ENEMY_FIRE_INTERVAL_MAX = 1600
const BOSS_ENEMY_SHOTS_PER_VOLLEY = 3

// ============ ESPECIAL DOURADO ============
const GOLDEN_SPECIAL_COLOR = 0xfff2a0
const GOLDEN_SPECIAL_EMISSIVE = 0xffb300
const GOLDEN_SPECIAL_HIT_RADIUS = 2.2
const GOLDEN_SPECIAL_DEATH_DURATION = 0.25
const GOLDEN_SPECIAL_PULSE_SPEED = 4
const GOLDEN_SPECIAL_PULSE_AMOUNT = 0.18
const GOLDEN_SPECIAL_HP = 10
const GOLDEN_CHASE_SPEED = 9
const GOLDEN_FIRE_INTERVAL_MIN = 1200
const GOLDEN_FIRE_INTERVAL_MAX = 2400

// ============ REDUTOR DE TEMPO ============
const TIME_ENEMY_COLOR = 0xb026ff
const TIME_ENEMY_EMISSIVE = 0x4b0082
const TIME_ENEMY_SPAWN_DISTANCE_MIN = 90
const TIME_ENEMY_SPAWN_DISTANCE_MAX = 140
const TIME_ENEMY_BOX_X = 7
const TIME_ENEMY_BOX_Y = 5
const TIME_ENEMY_HIT_RADIUS = 1.8
const TIME_ENEMY_DEATH_DURATION = 0.2
export const TIME_REDUCTION_MIN_MS = 3000
export const TIME_REDUCTION_MAX_MS = 20000

// QoL (v0.29.4): telegraph colorido por tipo de inimigo — antes, tudo saía 0xff5a3d e o
// jogador não distinguia de longe se o aviso era de um vermelho comum (trivial), uma ampulheta
// roxa (perde tempo), um tanque laranja (5hp) ou o chefe (rajada de 3). Cor = mesma cor do mesh
// de cada inimigo, pro aviso já ser reconhecível antes do tiro sair.
const TELEGRAPH_COLOR_BY_KIND = {
  red: 0xff5a3d,
  time: TIME_ENEMY_COLOR,
  tank: TANK_ENEMY_COLOR,
  boss: BOSS_ENEMY_COLOR,
  miniSwarm: MINI_ENEMY_COLOR, // nunca atira, mas mapeado por consistência
}

export function createEnemiesSystem(scene, rail, effects = null) {
  const enemies = []
  const enemyProjectiles = []
  const goldenTargets = []
  let nextEnemyId = 1
  let elapsed = 0
  let enemyAggression = 1

  // ============ geometrias e materiais ============
  // geometria do inimigo comum: a ponta do cone aponta pro +Z local (eixo do lookAt) — o giro
  // é "assado" aqui pra que chamar lookAt(playerPosition) faça a ponta apontar pro jogador
  const enemyGeometry = new THREE.ConeGeometry(1, 2.2, 4)
  enemyGeometry.rotateX(Math.PI / 2)
  const enemyMaterial = new THREE.MeshPhongMaterial({ color: ENEMY_COLOR, flatShading: true })
  // material próprio dos mini-inimigos, vermelho mais CLARO — distingue do inimigo comum
  const miniEnemyMaterial = new THREE.MeshPhongMaterial({ color: MINI_ENEMY_COLOR, flatShading: true })
  const enemyProjectileGeometry = new THREE.SphereGeometry(0.35, 8, 8)
  const enemyProjectileMaterial = new THREE.MeshBasicMaterial({ color: 0xff5a3d })
  const goldenGeometry = new THREE.TorusKnotGeometry(1.1, 0.4, 80, 12)
  const goldenMaterial = new THREE.MeshPhongMaterial({
    color: GOLDEN_SPECIAL_COLOR,
    emissive: GOLDEN_SPECIAL_EMISSIVE,
    emissiveIntensity: 0.9,
    flatShading: true,
  })
  const timeEnemyGeometry = new THREE.ConeGeometry(0.9, 1.3, 4)
  const timeEnemyMaterial = new THREE.MeshPhongMaterial({ color: TIME_ENEMY_COLOR, emissive: TIME_ENEMY_EMISSIVE, flatShading: true })
  const tankEnemyMaterial = new THREE.MeshPhongMaterial({ color: TANK_ENEMY_COLOR, flatShading: true })
  const bossEnemyMaterial = new THREE.MeshPhongMaterial({ color: BOSS_ENEMY_COLOR, emissive: BOSS_ENEMY_EMISSIVE, flatShading: true })

  function buildTimeEnemyMesh() {
    const top = new THREE.Mesh(timeEnemyGeometry, timeEnemyMaterial)
    top.position.y = 0.65
    top.rotation.x = Math.PI
    const bottom = new THREE.Mesh(timeEnemyGeometry, timeEnemyMaterial)
    bottom.position.y = -0.65
    const group = new THREE.Group()
    group.add(top, bottom)
    return group
  }

  // ============ posicionamento de spawn ============
  // cópia local do trecho "não-arena" de randomSpawnPositionOnPath/projectAheadOnPath — em
  // combat.js essas funções também servem pro alvo bônus (que fica lá), então não migram
  // inteiras; aqui só a parte que os inimigos realmente precisam.
  function randomSpawnPositionOnPath(distanceMin, distanceMax, boxX, boxY) {
    const distanceAhead = distanceMin + Math.random() * (distanceMax - distanceMin)
    const frame = rail.getFrameAt(distanceAhead)
    const lateralX = (Math.random() * 2 - 1) * boxX
    const lateralY = (Math.random() * 2 - 1) * boxY
    return frame.position.clone().addScaledVector(frame.right, lateralX).addScaledVector(frame.up, lateralY)
  }

  // spawn "no mapa" em modo arena: ponto aleatório numa casca esférica ao redor do CENTRO da
  // arena (não do jogador!) — espalha os inimigos pelo mapa em vez de colar do lado da nave
  function randomSpawnAroundArena(distanceMin, distanceMax) {
    const center = rail.getArenaCenter()
    const azimuth = Math.random() * Math.PI * 2
    const elevation = (Math.random() * 2 - 1) * ARENA_SPAWN_ELEVATION_MAX
    const distance = distanceMin + Math.random() * (distanceMax - distanceMin)
    const offset = new THREE.Vector3(
      Math.sin(azimuth) * Math.cos(elevation),
      Math.sin(elevation),
      Math.cos(azimuth) * Math.cos(elevation),
    ).multiplyScalar(distance)
    return center.add(offset)
  }

  function spawnPositionForEnemy(distanceMin, distanceMax, boxX, boxY) {
    return rail.isArena()
      ? randomSpawnAroundArena(ENEMY_ARENA_SPAWN_MIN, ENEMY_ARENA_SPAWN_MAX)
      : randomSpawnPositionOnPath(distanceMin, distanceMax, boxX, boxY)
  }

  // ============ helpers de remoção ============
  // QoL (v0.29.4): marca .dying = true ANTES de tirar do array — sem isso, quem tinha uma
  // referência direta ao inimigo (projectile.homingTarget em combat.js) não tinha como saber
  // que ele morreu sem fazer enemies.getAlive().includes(...) a cada frame, que era O(n) por
  // projétil teleguiado por frame.
  function removeEnemy(e) {
    e.dying = true
    scene.remove(e.mesh)
    enemies.splice(enemies.indexOf(e), 1)
  }

  function removeEnemyProjectile(p) {
    scene.remove(p.mesh)
    enemyProjectiles.splice(enemyProjectiles.indexOf(p), 1)
  }

  function removeGoldenTarget(g) {
    g.dying = true
    scene.remove(g.mesh)
    goldenTargets.splice(goldenTargets.indexOf(g), 1)
  }

  // ============ intervalos aleatórios de tiro ============
  function randomEnemyFireInterval() {
    const ms = ENEMY_FIRE_INTERVAL_MIN + Math.random() * (ENEMY_FIRE_INTERVAL_MAX - ENEMY_FIRE_INTERVAL_MIN)
    return ms / enemyAggression / 1000
  }

  function randomBossFireInterval() {
    return (BOSS_ENEMY_FIRE_INTERVAL_MIN + Math.random() * (BOSS_ENEMY_FIRE_INTERVAL_MAX - BOSS_ENEMY_FIRE_INTERVAL_MIN)) / 1000
  }

  function randomGoldenFireInterval() {
    return (GOLDEN_FIRE_INTERVAL_MIN + Math.random() * (GOLDEN_FIRE_INTERVAL_MAX - GOLDEN_FIRE_INTERVAL_MIN)) / 1000
  }

  function hitRadiusFor(enemy) {
    if (enemy.kind === 'boss') return BOSS_ENEMY_HIT_RADIUS
    if (enemy.kind === 'time') return TIME_ENEMY_HIT_RADIUS
    if (enemy.kind === 'miniSwarm') return MINI_ENEMY_HIT_RADIUS
    return ENEMY_HIT_RADIUS
  }

  function deathDurationFor(enemy) {
    if (enemy.kind === 'boss') return BOSS_ENEMY_DEATH_DURATION
    if (enemy.kind === 'time') return TIME_ENEMY_DEATH_DURATION
    return ENEMY_DEATH_DURATION
  }

  // ============ disparo dos inimigos ============
  function fireEnemyProjectile(enemy, playerPosition) {
    const mesh = new THREE.Mesh(enemyProjectileGeometry, enemyProjectileMaterial)
    mesh.position.copy(enemy.mesh.position)

    const direction = playerPosition.clone().sub(enemy.mesh.position).normalize()

    const errAngle = THREE.MathUtils.degToRad((Math.random() * 2 - 1) * ENEMY_AIM_ERROR_DEG)
    const errAxis = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5,
    ).normalize()
    direction.applyAxisAngle(errAxis, errAngle)

    scene.add(mesh)
    enemyProjectiles.push({ mesh, velocity: direction.multiplyScalar(ENEMY_PROJECTILE_SPEED), traveled: 0 })
  }

  function fireBossVolley(enemy, playerPosition) {
    for (let i = 0; i < BOSS_ENEMY_SHOTS_PER_VOLLEY; i += 1) fireEnemyProjectile(enemy, playerPosition)
  }

  // ============ IA do especial dourado ============
  function updateGoldenTargets(dt, playerPosition) {
    const pulse = 1 + Math.sin(elapsed * GOLDEN_SPECIAL_PULSE_SPEED) * GOLDEN_SPECIAL_PULSE_AMOUNT
    for (const g of [...goldenTargets]) {
      if (g.dying) {
        g.deathT += dt / GOLDEN_SPECIAL_DEATH_DURATION
        g.mesh.scale.setScalar(Math.max(0, pulse * (1 - g.deathT)))
        if (g.deathT >= 1) removeGoldenTarget(g)
        continue
      }
      g.mesh.scale.setScalar(pulse)
      g.mesh.rotation.y += dt * 0.6
      g.mesh.rotation.x += dt * 0.3

      if (playerPosition) {
        const toPlayer = playerPosition.clone().sub(g.mesh.position)
        if (toPlayer.lengthSq() > 1e-4) {
          g.mesh.position.addScaledVector(toPlayer.normalize(), GOLDEN_CHASE_SPEED * dt)
        }
        // QoL (v0.29.4): telegraph ~0.3s antes do tiro, igual inimigos comuns/chefe — antes o
        // dourado era o único que atirava "do nada", mesmo perseguindo em cadência curta
        if (g.fireTimer > 0.3 && g.fireTimer - dt <= 0.3 && effects) {
          effects.telegraph(g.mesh.position, GOLDEN_SPECIAL_COLOR)
        }
        g.fireTimer -= dt
        if (g.fireTimer <= 0) {
          fireEnemyProjectile({ mesh: g.mesh }, playerPosition)
          g.fireTimer = randomGoldenFireInterval()
        }
      }
    }
  }

  // ============ IA dos inimigos comuns/mini/tanque/chefe ============
  // ramDamage > 0: carta roguelike "impulso aríete" ativa durante o impulso de propulsão —
  // colisão vira dano de verdade (inclusive no CHEFE, que normalmente só morre a tiro) em vez
  // do "kamikaze" padrão (encostar mata o inimigo comum na hora, sem dano nem pontuação)
  function updateEnemies(dt, playerPosition, ramDamage = 0) {
    const inArena = rail.isArena()
    const frame = rail.getFrameAt(0)
    let hits = 0
    let ramKills = 0
    let ramKillPoints = 0
    let ramBossDefeated = false
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

      if (playerPosition.distanceTo(enemy.mesh.position) <= hitRadius) {
        hits += 1
        if (ramDamage > 0) {
          enemy.hp -= ramDamage
          if (enemy.hp <= 0) {
            enemy.dying = true
            enemy.deathT = 0
            if (enemy.kind === 'boss') {
              ramBossDefeated = true
              if (effects) effects.explosion(enemy.mesh.position, BOSS_ENEMY_COLOR, 3)
            } else {
              ramKills += 1
              ramKillPoints += ENEMY_KILL_BONUS
              if (effects) effects.explosion(enemy.mesh.position, enemy.kind === 'time' ? TIME_ENEMY_COLOR : ENEMY_COLOR, 1.1)
            }
          }
          continue
        }
        if (enemy.kind !== 'boss') {
          removeEnemy(enemy)
          continue
        }
      }

      // fila de mini-inimigos: patrulha balançando de um lado a outro por um tempo, depois
      // mergulha reto em direção a um ponto perto do jogador (com desvio pra se espalhar).
      // Nunca atira — a "ameaça" deles é o mergulho em grupo, não projétil.
      if (enemy.kind === 'miniSwarm') {
        if (enemy.swarmState === 'patrol') {
          enemy.patrolTimer -= dt
          const wobble = Math.sin(elapsed * 2 + enemy.patrolPhase) * MINI_SWARM_PATROL_AMPLITUDE
          const pos = enemy.patrolBase.clone()
            .addScaledVector(frame.right, enemy.formationOffset + wobble)
          enemy.mesh.position.lerp(pos, Math.min(1, MINI_SWARM_PATROL_SPEED * dt * 0.3))
          // mini-inimigos sempre encaram o jogador, mesmo patrulhando
          enemy.mesh.lookAt(playerPosition)
          if (enemy.patrolTimer <= 0) {
            enemy.swarmState = 'dive'
            const spread = (Math.random() * 2 - 1) * MINI_SWARM_DIVE_SPREAD
            enemy.diveTarget = playerPosition.clone().addScaledVector(frame.right, spread)
          }
        } else {
          enemy.diveElapsed += dt
          const toTarget = enemy.diveTarget.clone().sub(enemy.mesh.position)
          if (toTarget.lengthSq() > 1e-4) {
            toTarget.normalize()
            enemy.mesh.position.addScaledVector(toTarget, MINI_SWARM_DIVE_SPEED * dt)
            enemy.mesh.lookAt(enemy.mesh.position.clone().add(toTarget))
          }
          const relative = enemy.mesh.position.clone().sub(frame.position)
          if (enemy.diveElapsed > MINI_SWARM_DIVE_MAX_S || relative.dot(frame.forward) < PASS_BEHIND) {
            removeEnemy(enemy)
            continue
          }
        }
        continue
      }

      if (inArena && enemy.kind !== 'boss') {
        const speedCap = rail.getArenaSpeed() * 0.5
        const chaseSpeed = (enemy.speedFactor ?? 0.6) * speedCap

        let desiredDir
        if (enemy.orbiting && enemy.orbitTimer > 0) {
          enemy.orbitTimer -= dt
          enemy.orbitAngle += enemy.orbitDir * ENEMY_ORBIT_ANGULAR_SPEED * dt
          const orbitPoint = playerPosition.clone()
            .addScaledVector(frame.right, Math.cos(enemy.orbitAngle) * enemy.orbitRadius)
            .addScaledVector(frame.up, Math.sin(enemy.orbitAngle) * enemy.orbitRadius)
          desiredDir = orbitPoint.sub(enemy.mesh.position)
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
        // encara o jogador de verdade, não a direção de deslocamento (que diverge durante a
        // órbita)
        enemy.mesh.lookAt(playerPosition)
      } else if (enemy.kind === 'boss') {
        const toPlayer = playerPosition.clone().sub(enemy.mesh.position)
        if (toPlayer.lengthSq() > 1e-4) {
          toPlayer.normalize()
          enemy.mesh.position.addScaledVector(toPlayer, BOSS_ENEMY_CHASE_SPEED * dt)
          enemy.mesh.lookAt(playerPosition)
        }
      } else {
        // modo trilho: inimigo comum/time/tanque sempre com a ponta virada pro jogador
        enemy.mesh.lookAt(playerPosition)

        const relative = enemy.mesh.position.clone().sub(frame.position)
        if (relative.dot(frame.forward) < PASS_BEHIND) {
          removeEnemy(enemy)
          continue
        }
      }

      // QoL (v0.29.4): telegraph colorido por tipo + deslocado pra fora do mesh do chefe.
      // O chefe tem scale 5 e hitRadius 7 — sem o offset, o telegraph nascia DENTRO do corpo
      // dele e ficava invisível até o tiro sair. Cor vem de TELEGRAPH_COLOR_BY_KIND.
      if (enemy.fireTimer > 0.3 && enemy.fireTimer - dt <= 0.3 && effects) {
        const color = TELEGRAPH_COLOR_BY_KIND[enemy.kind] ?? 0xff5a3d
        let tPos = enemy.mesh.position
        if (enemy.kind === 'boss') {
          const toPlayerDir = playerPosition.clone().sub(enemy.mesh.position)
          if (toPlayerDir.lengthSq() > 1e-4) {
            tPos = enemy.mesh.position.clone().addScaledVector(toPlayerDir.normalize(), BOSS_ENEMY_HIT_RADIUS)
          }
        }
        effects.telegraph(tPos, color)
      }
      enemy.fireTimer -= dt
      const relativeForward = enemy.mesh.position.clone().sub(frame.position).dot(frame.forward)
      const distToPlayer = enemy.mesh.position.distanceTo(playerPosition)
      const inFireRange = (inArena || enemy.kind === 'boss' || relativeForward < ENEMY_FIRE_RANGE) && distToPlayer > ENEMY_FIRE_MIN_DISTANCE
      if (enemy.fireTimer <= 0 && inFireRange) {
        if (enemy.kind === 'boss') fireBossVolley(enemy, playerPosition)
        else fireEnemyProjectile(enemy, playerPosition)
        enemy.fireTimer = enemy.kind === 'boss' ? randomBossFireInterval() : randomEnemyFireInterval()
      }
    }
    return { hits, ramKills, ramKillPoints, ramBossDefeated }
  }

  function updateEnemyProjectiles(dt, playerPosition) {
    let hits = 0
    for (const projectile of [...enemyProjectiles]) {
      const step = projectile.velocity.clone().multiplyScalar(dt)
      projectile.mesh.position.add(step)
      projectile.traveled += step.length()

      if (playerPosition.distanceTo(projectile.mesh.position) <= ENEMY_PROJECTILE_HIT_RADIUS) {
        hits += 1
        removeEnemyProjectile(projectile)
        continue
      }
      if (projectile.traveled > ENEMY_PROJECTILE_MAX_RANGE) removeEnemyProjectile(projectile)
    }
    return hits
  }

  return {
    spawnEnemy() {
      const position = spawnPositionForEnemy(ENEMY_SPAWN_DISTANCE_MIN, ENEMY_SPAWN_DISTANCE_MAX, ENEMY_BOX_X, ENEMY_BOX_Y)
      const mesh = new THREE.Mesh(enemyGeometry, enemyMaterial)
      mesh.position.copy(position)
      scene.add(mesh)
      const orbiting = Math.random() < ENEMY_ORBIT_CHANCE
      enemies.push({
        id: nextEnemyId++, mesh, kind: 'red', dying: false, deathT: 0, hp: 2, maxHp: 2, fireTimer: randomEnemyFireInterval(),
        speedFactor: ENEMY_ARENA_SPEED_FACTOR_MIN + Math.random() * (ENEMY_ARENA_SPEED_FACTOR_MAX - ENEMY_ARENA_SPEED_FACTOR_MIN),
        orbiting,
        orbitTimer: orbiting ? ENEMY_ORBIT_DURATION_MIN + Math.random() * (ENEMY_ORBIT_DURATION_MAX - ENEMY_ORBIT_DURATION_MIN) : 0,
        orbitRadius: ENEMY_ORBIT_RADIUS_MIN + Math.random() * (ENEMY_ORBIT_RADIUS_MAX - ENEMY_ORBIT_RADIUS_MIN),
        orbitAngle: Math.random() * Math.PI * 2,
        orbitDir: Math.random() < 0.5 ? 1 : -1,
        moveDir: null,
      })
    },

    spawnMiniSwarm() {
      if (rail.isArena()) return
      const count = MINI_SWARM_MIN_COUNT + Math.floor(Math.random() * (MINI_SWARM_MAX_COUNT - MINI_SWARM_MIN_COUNT + 1))
      const base = spawnPositionForEnemy(ENEMY_SPAWN_DISTANCE_MIN, ENEMY_SPAWN_DISTANCE_MAX, ENEMY_BOX_X, ENEMY_BOX_Y)
      const frame = rail.getFrameAt(0)
      const patrolDuration = MINI_SWARM_PATROL_DURATION_MIN + Math.random() * (MINI_SWARM_PATROL_DURATION_MAX - MINI_SWARM_PATROL_DURATION_MIN)
      const patrolPhase = Math.random() * Math.PI * 2
      for (let i = 0; i < count; i += 1) {
        const formationOffset = (i - (count - 1) / 2) * MINI_SWARM_SPACING
        const position = base.clone().addScaledVector(frame.right, formationOffset)
        const mesh = new THREE.Mesh(enemyGeometry, miniEnemyMaterial)
        mesh.position.copy(position)
        mesh.scale.setScalar(MINI_ENEMY_SCALE)
        scene.add(mesh)
        enemies.push({
          id: nextEnemyId++, mesh, kind: 'miniSwarm', dying: false, deathT: 0, hp: 1, maxHp: 1, fireTimer: Infinity,
          swarmState: 'patrol',
          formationOffset,
          patrolBase: base.clone(),
          patrolPhase,
          patrolTimer: patrolDuration,
          diveTarget: null,
          diveElapsed: 0,
        })
      }
    },

    spawnTimeEnemy() {
      const position = spawnPositionForEnemy(TIME_ENEMY_SPAWN_DISTANCE_MIN, TIME_ENEMY_SPAWN_DISTANCE_MAX, TIME_ENEMY_BOX_X, TIME_ENEMY_BOX_Y)
      const mesh = buildTimeEnemyMesh()
      mesh.position.copy(position)
      scene.add(mesh)
      enemies.push({ id: nextEnemyId++, mesh, kind: 'time', dying: false, deathT: 0, hp: 1, maxHp: 1, fireTimer: randomEnemyFireInterval() })
    },

    spawnTankEnemy(hp = TANK_ENEMY_DEFAULT_HP) {
      const position = spawnPositionForEnemy(ENEMY_SPAWN_DISTANCE_MIN, ENEMY_SPAWN_DISTANCE_MAX, ENEMY_BOX_X, ENEMY_BOX_Y)
      const mesh = new THREE.Mesh(enemyGeometry, tankEnemyMaterial)
      mesh.position.copy(position)
      mesh.scale.setScalar(TANK_ENEMY_SCALE)
      scene.add(mesh)
      enemies.push({ id: nextEnemyId++, mesh, kind: 'tank', dying: false, deathT: 0, hp, maxHp: hp, fireTimer: randomEnemyFireInterval() })
    },

    spawnBossEnemy(hp) {
      const position = randomSpawnAroundArena(ENEMY_ARENA_SPAWN_MAX * 0.6, ENEMY_ARENA_SPAWN_MAX)
      const mesh = new THREE.Mesh(enemyGeometry, bossEnemyMaterial)
      mesh.position.copy(position)
      mesh.scale.setScalar(BOSS_ENEMY_SCALE)
      scene.add(mesh)
      enemies.push({ id: nextEnemyId++, mesh, kind: 'boss', dying: false, deathT: 0, hp, maxHp: hp, fireTimer: 1 })
    },

    spawnGoldenSpecial(opts = {}) {
      const { distanceMin = 40, distanceMax = 90 } = opts
      const frame = rail.getFrameAt(0)
      const azimuth = Math.random() * Math.PI * 2
      const elevation = (Math.random() * 2 - 1) * THREE.MathUtils.degToRad(50)
      const distance = distanceMin + Math.random() * (distanceMax - distanceMin)
      const offset = new THREE.Vector3(
        Math.sin(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        Math.cos(azimuth) * Math.cos(elevation),
      ).multiplyScalar(distance)

      const mesh = new THREE.Mesh(goldenGeometry, goldenMaterial)
      mesh.position.copy(frame.position.clone().add(offset))
      scene.add(mesh)
      goldenTargets.push({
        id: nextEnemyId++,
        mesh,
        dying: false,
        deathT: 0,
        hp: GOLDEN_SPECIAL_HP,
        maxHp: GOLDEN_SPECIAL_HP,
        fireTimer: randomGoldenFireInterval(),
      })
    },

    // tick principal: golden (sempre ativo enquanto existir — só existe durante a fase
    // 'goldenArena', que já é uma das fases "enemiesActive" do main.js, então esse gate
    // continua se comportando exatamente igual) + inimigos comuns/mini/tanque/chefe
    update(dt, playerPosition, opts = {}) {
      elapsed += dt
      updateGoldenTargets(dt, playerPosition)
      return updateEnemies(dt, playerPosition, opts.ramDamage || 0)
    },

    updateProjectiles(dt, playerPosition) {
      return updateEnemyProjectiles(dt, playerPosition)
    },

    // colisão dos tiros do JOGADOR contra inimigos e o especial dourado — checa inimigo
    // primeiro (mesma prioridade de antes), depois dourado. Retorna null se não achou nada.
    resolveProjectileHit(prevPos, currPos, projectileMeta = {}) {
      const damage = projectileMeta.damage ?? 1
      const isHoming = !!projectileMeta.isHoming

      const enemyHit = enemies.find((e) => !e.dying && distanceToSegment(e.mesh.position, prevPos, currPos) <= hitRadiusFor(e))
      if (enemyHit) {
        enemyHit.hp -= damage
        if (isHoming && effects) effects.explosion(enemyHit.mesh.position, HOMING_EXPLOSION_COLOR, 0.5)
        // todo hit no chefe (não só o que mata) ganha anel de impacto + bloom
        if (enemyHit.kind === 'boss' && effects) {
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
          if (enemyHit.kind === 'boss') {
            bossDefeated = true
            if (effects) effects.explosion(enemyHit.mesh.position, isHoming ? HOMING_EXPLOSION_COLOR : BOSS_ENEMY_COLOR, 3)
          } else {
            enemyKillPoints = ENEMY_KILL_BONUS
            if (enemyHit.kind === 'time') timeReductionMs = TIME_REDUCTION_MIN_MS + Math.random() * (TIME_REDUCTION_MAX_MS - TIME_REDUCTION_MIN_MS)
            const killColor = isHoming ? HOMING_EXPLOSION_COLOR : (enemyHit.kind === 'time' ? TIME_ENEMY_COLOR : ENEMY_COLOR)
            if (effects) effects.explosion(enemyHit.mesh.position, killColor, 1.1)
          }
        }
        return {
          kind: enemyHit.kind,
          killed,
          worldPos: enemyHit.mesh.position.clone(),
          meshRef: enemyHit.mesh,
          enemyKillPoints,
          timeReductionMs,
          bossDefeated,
          goldenSpecialHit: false,
        }
      }

      const goldenHit = goldenTargets.find((g) => !g.dying && distanceToSegment(g.mesh.position, prevPos, currPos) <= GOLDEN_SPECIAL_HIT_RADIUS)
      if (goldenHit) {
        goldenHit.hp -= damage
        if (isHoming && effects) effects.explosion(goldenHit.mesh.position, HOMING_EXPLOSION_COLOR, 0.5)
        const killed = goldenHit.hp <= 0
        if (killed) {
          goldenHit.dying = true
          goldenHit.deathT = 0
          if (effects) effects.explosion(goldenHit.mesh.position, isHoming ? HOMING_EXPLOSION_COLOR : GOLDEN_SPECIAL_COLOR, 1.8)
        }
        return {
          kind: 'golden',
          killed,
          worldPos: goldenHit.mesh.position.clone(),
          meshRef: goldenHit.mesh,
          enemyKillPoints: 0,
          timeReductionMs: null,
          bossDefeated: false,
          goldenSpecialHit: killed,
        }
      }

      return null
    },

    getEnemyCount() {
      return enemies.reduce((n, e) => n + (e.kind === 'red' ? 1 : 0), 0)
    },

    // QoL (v0.29.4): inclui mini-inimigos no pool de barras de vida (maxHp 1 < 2) — antes eles
    // ficavam de fora do `maxHp > 1` mesmo sendo a ameaça mais visual do lote (mergulho em fila).
    // Continua filtrando os "1 hit sem barra" que não interessam — o filtro é só sobre maxHp,
    // mas com exceção explícita pra miniSwarm.
    getEnemySnapshots: () => [...enemies, ...goldenTargets]
      .filter((e) => !e.dying && (e.maxHp > 1 || e.kind === 'miniSwarm'))
      .map((e) => ({ id: e.id, worldPos: e.mesh.position.clone(), hp: e.hp, maxHp: e.maxHp })),

    getBossSnapshot: () => {
      const boss = enemies.find((e) => e.kind === 'boss' && !e.dying)
      return boss ? { hp: boss.hp, maxHp: boss.maxHp } : null
    },

    getMinimapBlips: () => {
      const blips = []
      for (const e of enemies) {
        if (e.dying) continue
        blips.push({ type: e.kind === 'boss' ? 'boss' : 'enemy', worldPos: e.mesh.position })
      }
      for (const g of goldenTargets) {
        if (g.dying) continue
        blips.push({ type: 'golden', worldPos: g.mesh.position })
      }
      return blips
    },

    // pra debug/hitbox visualization em combat.js, que continua desenhando (não duplicamos o
    // pool de meshes de wireframe — só devolvemos posição+raio de tudo que é "nosso")
    getHitboxTargets: () => {
      const list = []
      for (const e of enemies) if (!e.dying) list.push({ worldPos: e.mesh.position, radius: hitRadiusFor(e) })
      for (const p of enemyProjectiles) list.push({ worldPos: p.mesh.position, radius: ENEMY_PROJECTILE_HIT_RADIUS })
      for (const g of goldenTargets) if (!g.dying) list.push({ worldPos: g.mesh.position, radius: GOLDEN_SPECIAL_HIT_RADIUS })
      return list
    },

    getAlive: () => enemies.filter((e) => !e.dying),

    // usado pela carta roguelike "giro rebatedor" (mecânica do jogador, fica em combat.js):
    // remove projéteis inimigos dentro do raio e devolve a posição de cada um removido, pra
    // combat.js decidir pra onde mirar o rebote (não expomos o array enemyProjectiles cru)
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

    clearEnemies() {
      for (const enemy of [...enemies]) removeEnemy(enemy)
      for (const projectile of [...enemyProjectiles]) removeEnemyProjectile(projectile)
    },

    clearGoldenTargets() {
      for (const g of [...goldenTargets]) removeGoldenTarget(g)
    },

    clearAll() {
      for (const enemy of [...enemies]) removeEnemy(enemy)
      for (const projectile of [...enemyProjectiles]) removeEnemyProjectile(projectile)
      for (const g of [...goldenTargets]) removeGoldenTarget(g)
    },

    dispose() {
      for (const e of [...enemies]) removeEnemy(e)
      for (const p of [...enemyProjectiles]) removeEnemyProjectile(p)
      for (const g of [...goldenTargets]) removeGoldenTarget(g)
      enemyGeometry.dispose()
      enemyMaterial.dispose()
      miniEnemyMaterial.dispose()
      enemyProjectileGeometry.dispose()
      enemyProjectileMaterial.dispose()
      goldenGeometry.dispose()
      goldenMaterial.dispose()
      timeEnemyGeometry.dispose()
      timeEnemyMaterial.dispose()
      tankEnemyMaterial.dispose()
      bossEnemyMaterial.dispose()
    },
  }
}
