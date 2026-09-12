import * as THREE from 'three'

const PROJECTILE_SPEED = 60
const PROJECTILE_MAX_RANGE = 260
const PROJECTILE_LATERAL_SPACING = 1.6
const PASS_BEHIND = -4
const WORLD_UP = new THREE.Vector3(0, 1, 0)
const FORWARD_AXIS = new THREE.Vector3(0, 0, 1)

const HOMING_PROJECTILE_SPEED = 69 // 46 * 1.5 (pedido: +50% de velocidade)
const HOMING_PROJECTILE_DAMAGE = 3
const HOMING_EXPLOSION_COLOR = 0x2bff88 // explosão/impacto verde exclusivo do tiro carregado
const HOMING_AFTERIMAGE_INTERVAL = 0.035 // segundos entre cada cópia fantasma do rastro
const WINGMAN_OFFSETS = [3.2, -3.2]

// tiro normal do jogador: 1 disparo central com 2 de dano (era 2 tiros de 1 dano lado a lado)
const PLAYER_PROJECTILE_DAMAGE = 2
// quão rápido (por segundo) o tiro normal em voo se realinha rumo à direção atual da mira —
// não é homing de verdade (sem alvo travado), só um leve "puxão" pra facilitar acertar
const PLAYER_PROJECTILE_STEER_RATE = 2.2
// cresce visualmente a cada projétil extra ganho por upgrade (relativo ao projectileCount base
// de 1) — combinado com projectileCount vindo das cartas "extra-projectile"
const PLAYER_PROJECTILE_GROWTH_PER_EXTRA = 0.15

export const DEFAULT_FIRE_COOLDOWN = 0.2
export const DEFAULT_AIM_ASSIST_ANGLE = THREE.MathUtils.degToRad(4)

const QUIZ_TARGET_DISTANCE = 150
const QUIZ_HIT_RADIUS = 1.3
const QUIZ_DEATH_DURATION = 0.15
const QUIZ_SLOT_OFFSETS = [
  { x: -3.5, y: 2 },
  { x: 3.5, y: 2 },
  { x: -3.5, y: -2 },
  { x: 3.5, y: -2 },
]
const SHAPE_GEOMETRY = {
  octaedro: () => new THREE.OctahedronGeometry(1.1),
  cubo: () => new THREE.BoxGeometry(1.5, 1.5, 1.5),
  tetraedro: () => new THREE.TetrahedronGeometry(1.3),
  icosaedro: () => new THREE.IcosahedronGeometry(1.1),
}
const SHAPE_COLOR = { azul: 0x4da6ff, 'âmbar': 0xffb84d, magenta: 0xff4dd2, ciano: 0x4dfff2 }

const BOSS_TARGET_ELEVATION_MAX = THREE.MathUtils.degToRad(50)

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

// em modo arena (chefe/dourado/etc), inimigos perseguem o jogador ativamente em vez de ficar
// parados esperando a nave passar por eles (que só funciona no trilho, onde a própria nave
// avança por conta própria)
const ENEMY_CHASE_SPEED = 12
const ENEMY_ARENA_SPAWN_MIN = 70
const ENEMY_ARENA_SPAWN_MAX = 160
const ARENA_SPAWN_ELEVATION_MAX = THREE.MathUtils.degToRad(50)

// ============ FASE 4: velocidade aleatória + movimento mais suave/radial em arena ============
const ENEMY_ARENA_SPEED_FACTOR_MIN = 0.35
const ENEMY_ARENA_SPEED_FACTOR_MAX = 1.0
const ENEMY_TURN_RATE = 1.6
const ENEMY_ORBIT_CHANCE = 0.3
const ENEMY_ORBIT_DURATION_MIN = 1.5
const ENEMY_ORBIT_DURATION_MAX = 3.5
const ENEMY_ORBIT_RADIUS_MIN = 14
const ENEMY_ORBIT_RADIUS_MAX = 26
const ENEMY_ORBIT_ANGULAR_SPEED = 0.8

// pedido literal: "Nunca permita que os inimigos disparem projetos bem perto do jogador"
const ENEMY_FIRE_MIN_DISTANCE = 14

// ============ FASE 4: mini-inimigos vermelhos (fila/enxame, só modo normal) ============
const MINI_ENEMY_SCALE = 0.7 // 30% menor que o ENEMY_COLOR normal
const MINI_ENEMY_HIT_RADIUS = ENEMY_HIT_RADIUS * MINI_ENEMY_SCALE
const MINI_SWARM_MIN_COUNT = 5
const MINI_SWARM_MAX_COUNT = 10
const MINI_SWARM_SPACING = 2 // espaço lateral entre cada um na formação em fila
const MINI_SWARM_PATROL_SPEED = 10 // velocidade da fila "passeando" antes de mergulhar
const MINI_SWARM_PATROL_AMPLITUDE = 10 // quão longe a fila anda de um lado a outro
const MINI_SWARM_PATROL_DURATION_MIN = 1.6
const MINI_SWARM_PATROL_DURATION_MAX = 2.8
const MINI_SWARM_DIVE_SPEED = 22 // bem mais rápido que o inimigo comum ao se jogar no jogador
const MINI_SWARM_DIVE_SPREAD = 7 // dispersão lateral aleatória de cada um ao mergulhar
const MINI_SWARM_DIVE_MAX_S = 3 // tempo máximo mergulhando antes de sumir sozinho (segurança)

const TANK_ENEMY_COLOR = 0xff9d4d
const TANK_ENEMY_SCALE = 1.6
const TANK_ENEMY_DEFAULT_HP = 5

const BOSS_ENEMY_COLOR = 0xff2d4d
const BOSS_ENEMY_EMISSIVE = 0x5c0018
const BOSS_ENEMY_SCALE = 5
const BOSS_ENEMY_HIT_RADIUS = 7
const BOSS_ENEMY_DEATH_DURATION = 0.6
const BOSS_ENEMY_CHASE_SPEED = 7
const BOSS_ENEMY_FIRE_INTERVAL_MIN = 800
const BOSS_ENEMY_FIRE_INTERVAL_MAX = 1600
const BOSS_ENEMY_SHOTS_PER_VOLLEY = 3

const BONUS_COLOR = 0x2bff6b
const BONUS_SPAWN_DISTANCE_MIN = 90
const BONUS_SPAWN_DISTANCE_MAX = 140
const BONUS_BOX_X = 7
const BONUS_BOX_Y = 5
const BONUS_HIT_RADIUS = 1.6
const BONUS_DEATH_DURATION = 0.2
const BONUS_KILL_BONUS = 50

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

// tiro carregado: enquanto segura o botão, varrer a mira sobre inimigos os marca (lock-on) —
// ao soltar, o teleguiado mira exatamente nos marcados em vez dos N mais próximos
const ENEMY_LOCK_ANGLE = THREE.MathUtils.degToRad(6)

// >> NOVO: distância máxima (unidades de mundo) para um alvo poder ser travado/auto-mirável.
// Vale tanto pra detecção da mira (findLockOnTarget) quanto pro teleguiado (sweepLockOn e a
// seleção de alvos em fireHomingShot). Sem isso, dá pra "magnetizar" tiro em inimigo a
// centenas de unidades de distância. Ajuste pra cima (150+) se quiser voltar ao comportamento
// antigo, ou pra baixo (60) pra exigir aproximação. <<
const MAX_LOCK_RANGE = 90

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

export function createCombatSystem(scene, rail, effects = null) {
  const projectiles = []
  const quizTargets = []
  const enemies = []
  const enemyProjectiles = []
  const bonusTargets = []
  const goldenTargets = []

  const projectileGeometry = new THREE.ConeGeometry(0.168, 1.2, 5)
  projectileGeometry.rotateX(Math.PI / 2)
  const projectileMaterial = new THREE.MeshBasicMaterial({ color: 0x3ea6ff })

  const homingProjectileGeometry = new THREE.ConeGeometry(0.528, 3.36, 6)
  homingProjectileGeometry.rotateX(Math.PI / 2)
  const homingProjectileMaterial = new THREE.MeshBasicMaterial({ color: 0x2bff88 })

  const wingmanGeometry = new THREE.ConeGeometry(0.32, 1.1, 3)
  wingmanGeometry.rotateX(-Math.PI / 2)
  const wingmanMaterial = new THREE.MeshPhongMaterial({ color: 0x7fe0ff, flatShading: true })

  const enemyGeometry = new THREE.ConeGeometry(1, 2.2, 4)
  const enemyMaterial = new THREE.MeshPhongMaterial({ color: ENEMY_COLOR, flatShading: true })
  const enemyProjectileGeometry = new THREE.SphereGeometry(0.35, 8, 8)
  const enemyProjectileMaterial = new THREE.MeshBasicMaterial({ color: 0xff5a3d })
  const bonusGeometry = new THREE.DodecahedronGeometry(1.1)
  const bonusMaterial = new THREE.MeshPhongMaterial({
    color: BONUS_COLOR,
    flatShading: true,
    emissive: 0x0a6622,
    emissiveIntensity: 0.7,
  })
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

  let showHitboxes = false
  const hitboxGeometry = new THREE.SphereGeometry(1, 8, 6)
  const hitboxMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, depthTest: false })
  const hitboxGroup = new THREE.Group()
  scene.add(hitboxGroup)

  function markHitbox(position, radius) {
    const mesh = new THREE.Mesh(hitboxGeometry, hitboxMaterial)
    mesh.position.copy(position)
    mesh.scale.setScalar(radius)
    hitboxGroup.add(mesh)
  }

  function refreshHitboxes() {
    while (hitboxGroup.children.length) hitboxGroup.remove(hitboxGroup.children[0])
    if (!showHitboxes) return
    for (const t of quizTargets) if (!t.dying) markHitbox(t.mesh.position, QUIZ_HIT_RADIUS)
    for (const e of enemies) if (!e.dying) markHitbox(e.mesh.position, hitRadiusFor(e))
    for (const p of enemyProjectiles) markHitbox(p.mesh.position, ENEMY_PROJECTILE_HIT_RADIUS)
    for (const b of bonusTargets) if (!b.dying) markHitbox(b.mesh.position, BONUS_HIT_RADIUS)
    for (const g of goldenTargets) if (!g.dying) markHitbox(g.mesh.position, GOLDEN_SPECIAL_HIT_RADIUS)
  }

  function makeQuizTargetMesh(alt) {
    return new THREE.Mesh(SHAPE_GEOMETRY[alt.shape](), new THREE.MeshPhongMaterial({ color: SHAPE_COLOR[alt.color], flatShading: true }))
  }

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

  function projectAhead(distance) {
    const frame = rail.getFrameAt(0)
    const position = frame.position.clone().addScaledVector(frame.forward, distance)
    return { position, right: frame.right, up: frame.up }
  }

  function projectAheadOnPath(distanceAhead) {
    const frame = rail.getFrameAt(distanceAhead)
    return { position: frame.position.clone(), right: frame.right, up: frame.up }
  }

  function randomSpawnPositionOnPath(distanceMin, distanceMax, boxX, boxY) {
    const distanceAhead = distanceMin + Math.random() * (distanceMax - distanceMin)
    const base = projectAheadOnPath(distanceAhead)
    const lateralX = (Math.random() * 2 - 1) * boxX
    const lateralY = (Math.random() * 2 - 1) * boxY
    return base.position.clone().addScaledVector(base.right, lateralX).addScaledVector(base.up, lateralY)
  }

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

  let cooldown = 0
  let fireCooldownDuration = DEFAULT_FIRE_COOLDOWN
  let aimAssistAngle = DEFAULT_AIM_ASSIST_ANGLE
  let projectileCount = 1
  let enemyAggression = 1
  let quizRoomActive = false
  let quizShotsFired = 0
  let elapsed = 0
  let nextEnemyId = 1

  const wingmen = []

  function updateWingmen() {
    if (wingmen.length === 0) return
    const playerPos = rail.getPlayerPosition()
    const frame = rail.getFrameAt(0)
    wingmen.forEach((w, i) => {
      const lateral = WINGMAN_OFFSETS[i] ?? 0
      const pos = playerPos.clone().addScaledVector(frame.right, lateral).addScaledVector(frame.up, -0.4)
      w.mesh.position.copy(pos)
      w.mesh.up.copy(frame.up)
      w.mesh.lookAt(pos.clone().add(frame.forward))
    })
  }

  let currentLockOn = null

  const lockedEnemies = new Set()

  // >> AJUSTADO: filtro de distância — só trava/marca inimigo dentro de MAX_LOCK_RANGE <<
  function sweepLockOn(origin, direction) {
    for (const e of enemies) {
      if (e.dying || lockedEnemies.has(e)) continue
      if (origin.distanceTo(e.mesh.position) > MAX_LOCK_RANGE) continue
      const toTarget = e.mesh.position.clone().sub(origin).normalize()
      const angle = Math.acos(THREE.MathUtils.clamp(direction.dot(toTarget), -1, 1))
      if (angle < ENEMY_LOCK_ANGLE) lockedEnemies.add(e)
    }
  }

  function removeProjectile(p) {
    scene.remove(p.mesh)
    projectiles.splice(projectiles.indexOf(p), 1)
  }

  function removeEnemy(e) {
    scene.remove(e.mesh)
    enemies.splice(enemies.indexOf(e), 1)
  }

  function removeEnemyProjectile(p) {
    scene.remove(p.mesh)
    enemyProjectiles.splice(enemyProjectiles.indexOf(p), 1)
  }

  function removeQuizTarget(t) {
    scene.remove(t.mesh)
    t.mesh.geometry.dispose()
    t.mesh.material.dispose()
    quizTargets.splice(quizTargets.indexOf(t), 1)
  }

  function removeBonusTarget(b) {
    scene.remove(b.mesh)
    bonusTargets.splice(bonusTargets.indexOf(b), 1)
  }

  function removeGoldenTarget(g) {
    scene.remove(g.mesh)
    goldenTargets.splice(goldenTargets.indexOf(g), 1)
  }

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

  function distanceToSegment(point, segStart, segEnd) {
    const seg = segEnd.clone().sub(segStart)
    const lenSq = seg.lengthSq()
    if (lenSq < 1e-8) return point.distanceTo(segStart)
    const t = THREE.MathUtils.clamp(point.clone().sub(segStart).dot(seg) / lenSq, 0, 1)
    const closest = segStart.clone().addScaledVector(seg, t)
    return point.distanceTo(closest)
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

  // >> AJUSTADO: filtro de distância — só trava alvo de pergunta dentro de MAX_LOCK_RANGE <<
  function findLockOnTarget(origin, direction) {
    let best = null
    let bestAngle = aimAssistAngle
    for (const target of quizTargets) {
      if (target.dying) continue
      if (origin.distanceTo(target.mesh.position) > MAX_LOCK_RANGE) continue
      const toTarget = target.mesh.position.clone().sub(origin).normalize()
      const angle = Math.acos(THREE.MathUtils.clamp(direction.dot(toTarget), -1, 1))
      if (angle < bestAngle) {
        bestAngle = angle
        best = target
      }
    }
    return best
  }

  function fire(origin, direction) {
    const shotDirection = direction.clone()

    const lateralAxis = new THREE.Vector3().crossVectors(shotDirection, WORLD_UP)
    if (lateralAxis.lengthSq() < 1e-4) lateralAxis.set(1, 0, 0)
    lateralAxis.normalize()

    const mid = (projectileCount - 1) / 2
    const visualScale = 1 + (projectileCount - 1) * PLAYER_PROJECTILE_GROWTH_PER_EXTRA
    for (let i = 0; i < projectileCount; i += 1) {
      const lateralOffset = (i - mid) * PROJECTILE_LATERAL_SPACING
      const mesh = new THREE.Mesh(projectileGeometry, projectileMaterial)
      mesh.position.copy(origin).addScaledVector(lateralAxis, lateralOffset)
      mesh.scale.setScalar(visualScale)
      scene.add(mesh)
      projectiles.push({
        mesh,
        velocity: shotDirection.clone().multiplyScalar(PROJECTILE_SPEED),
        traveled: 0,
        damage: PLAYER_PROJECTILE_DAMAGE,
      })
    }

    if (effects) effects.muzzleFlash(origin, shotDirection)
  }

  function fireSingle(origin, direction) {
    const mesh = new THREE.Mesh(projectileGeometry, projectileMaterial)
    mesh.position.copy(origin)
    scene.add(mesh)
    projectiles.push({ mesh, velocity: direction.clone().multiplyScalar(PROJECTILE_SPEED), traveled: 0 })
  }

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

  function updateProjectiles(dt, aimDirection) {
    let hitEvent = null
    let enemyKills = 0
    let enemyKillPoints = 0
    let bonusKillPoints = 0
    let goldenSpecialHit = false
    let timeReductionMs = null
    let bossDefeated = false

    for (const projectile of [...projectiles]) {
      if (projectile.homingTarget) {
        if (projectile.homingTarget.dying || !enemies.includes(projectile.homingTarget)) {
          projectile.homingTarget = null
        } else {
          const desired = projectile.homingTarget.mesh.position.clone().sub(projectile.mesh.position).normalize()
          projectile.velocity.copy(desired.multiplyScalar(HOMING_PROJECTILE_SPEED))
        }
      } else if (aimDirection && !projectile.isHoming) {
        const speed = projectile.velocity.length()
        const currentDir = projectile.velocity.clone().normalize()
        const steerT = Math.min(1, PLAYER_PROJECTILE_STEER_RATE * dt)
        const steeredDir = currentDir.lerp(aimDirection, steerT)
        if (steeredDir.lengthSq() > 1e-6) projectile.velocity.copy(steeredDir.normalize().multiplyScalar(speed))
      }

      const prevPos = projectile.mesh.position.clone()
      const step = projectile.velocity.clone().multiplyScalar(dt)
      projectile.mesh.position.add(step)
      projectile.traveled += step.length()
      if (projectile.velocity.lengthSq() > 1e-6) {
        projectile.mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, projectile.velocity.clone().normalize())
      }

      if (projectile.isHoming && effects) {
        projectile.afterimageTimer -= dt
        if (projectile.afterimageTimer <= 0) {
          projectile.afterimageTimer = HOMING_AFTERIMAGE_INTERVAL
          effects.homingAfterimage(projectile.mesh.position, projectile.mesh.quaternion)
        }
      }

      const targetHit = quizTargets.find((t) => !t.dying && distanceToSegment(t.mesh.position, prevPos, projectile.mesh.position) <= QUIZ_HIT_RADIUS)
      if (targetHit) {
        targetHit.dying = true
        targetHit.deathT = 0
        if (!hitEvent) hitEvent = { slot: targetHit.slot, isCorrect: targetHit.isCorrect }
        if (effects) effects.explosion(targetHit.mesh.position, targetHit.colorHex ?? 0xffffff, 0.9)
        removeProjectile(projectile)
        continue
      }

      const enemyHit = enemies.find((e) => !e.dying && distanceToSegment(e.mesh.position, prevPos, projectile.mesh.position) <= hitRadiusFor(e))
      if (enemyHit) {
        enemyHit.hp -= projectile.damage ?? 1
        removeProjectile(projectile)
        if (projectile.isHoming && effects) effects.explosion(enemyHit.mesh.position, HOMING_EXPLOSION_COLOR, 0.5)
        if (enemyHit.hp > 0) continue
        enemyHit.dying = true
        enemyHit.deathT = 0
        if (enemyHit.kind === 'boss') {
          bossDefeated = true
          if (effects) effects.explosion(enemyHit.mesh.position, projectile.isHoming ? HOMING_EXPLOSION_COLOR : BOSS_ENEMY_COLOR, 3)
        } else {
          enemyKills += 1
          enemyKillPoints += ENEMY_KILL_BONUS
          if (enemyHit.kind === 'time') timeReductionMs = TIME_REDUCTION_MIN_MS + Math.random() * (TIME_REDUCTION_MAX_MS - TIME_REDUCTION_MIN_MS)
          const killColor = projectile.isHoming ? HOMING_EXPLOSION_COLOR : (enemyHit.kind === 'time' ? TIME_ENEMY_COLOR : ENEMY_COLOR)
          if (effects) effects.explosion(enemyHit.mesh.position, killColor, 1.1)
        }
        continue
      }

      const bonusHit = bonusTargets.find((b) => !b.dying && distanceToSegment(b.mesh.position, prevPos, projectile.mesh.position) <= BONUS_HIT_RADIUS)
      if (bonusHit) {
        bonusHit.dying = true
        bonusHit.deathT = 0
        bonusKillPoints += BONUS_KILL_BONUS
        if (effects) effects.explosion(bonusHit.mesh.position, BONUS_COLOR, 0.9)
        removeProjectile(projectile)
        continue
      }

      const goldenHit = goldenTargets.find((g) => !g.dying && distanceToSegment(g.mesh.position, prevPos, projectile.mesh.position) <= GOLDEN_SPECIAL_HIT_RADIUS)
      if (goldenHit) {
        goldenHit.hp -= projectile.damage ?? 1
        removeProjectile(projectile)
        if (projectile.isHoming && effects) effects.explosion(goldenHit.mesh.position, HOMING_EXPLOSION_COLOR, 0.5)
        if (goldenHit.hp > 0) continue
        goldenHit.dying = true
        goldenHit.deathT = 0
        goldenSpecialHit = true
        if (effects) effects.explosion(goldenHit.mesh.position, projectile.isHoming ? HOMING_EXPLOSION_COLOR : GOLDEN_SPECIAL_COLOR, 1.8)
        continue
      }

      if (projectile.traveled > PROJECTILE_MAX_RANGE) removeProjectile(projectile)
    }

    return { hitEvent, enemyKills, enemyKillPoints, bonusKillPoints, goldenSpecialHit, timeReductionMs, bossDefeated }
  }

  function updateQuizTargets(dt) {
    const frame = rail.getFrameAt(0)
    for (const target of [...quizTargets]) {
      if (target.dying) {
        target.deathT += dt / QUIZ_DEATH_DURATION
        target.mesh.scale.setScalar(Math.max(0, 1 - target.deathT))
        if (target.deathT >= 1) removeQuizTarget(target)
        continue
      }
      if (target.noCull) continue
      const relative = target.mesh.position.clone().sub(frame.position)
      if (relative.dot(frame.forward) < PASS_BEHIND) removeQuizTarget(target)
    }
  }

  function updateBonusTargets(dt) {
    const frame = rail.getFrameAt(0)
    for (const bonus of [...bonusTargets]) {
      if (bonus.dying) {
        bonus.deathT += dt / BONUS_DEATH_DURATION
        bonus.mesh.scale.setScalar(Math.max(0, 1 - bonus.deathT))
        if (bonus.deathT >= 1) removeBonusTarget(bonus)
        continue
      }
      const relative = bonus.mesh.position.clone().sub(frame.position)
      if (relative.dot(frame.forward) < PASS_BEHIND) removeBonusTarget(bonus)
    }
  }

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
        g.fireTimer -= dt
        if (g.fireTimer <= 0) {
          fireEnemyProjectile({ mesh: g.mesh }, playerPosition)
          g.fireTimer = randomGoldenFireInterval()
        }
      }
    }
  }

  function fireBossVolley(enemy, playerPosition) {
    for (let i = 0; i < BOSS_ENEMY_SHOTS_PER_VOLLEY; i += 1) fireEnemyProjectile(enemy, playerPosition)
  }

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

      if (enemy.kind === 'miniSwarm') {
        if (enemy.swarmState === 'patrol') {
          enemy.patrolTimer -= dt
          const wobble = Math.sin(elapsed * 2 + enemy.patrolPhase) * MINI_SWARM_PATROL_AMPLITUDE
          const pos = enemy.patrolBase.clone()
            .addScaledVector(frame.right, enemy.formationOffset + wobble)
          enemy.mesh.position.lerp(pos, Math.min(1, MINI_SWARM_PATROL_SPEED * dt * 0.3))
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
          enemy.mesh.lookAt(enemy.mesh.position.clone().add(enemy.moveDir))
        }
      } else if (enemy.kind === 'boss') {
        const toPlayer = playerPosition.clone().sub(enemy.mesh.position)
        if (toPlayer.lengthSq() > 1e-4) {
          toPlayer.normalize()
          enemy.mesh.position.addScaledVector(toPlayer, BOSS_ENEMY_CHASE_SPEED * dt)
          enemy.mesh.lookAt(enemy.mesh.position.clone().add(toPlayer))
        }
      } else {
        const relative = enemy.mesh.position.clone().sub(frame.position)
        if (relative.dot(frame.forward) < PASS_BEHIND) {
          removeEnemy(enemy)
          continue
        }
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
    tryFire(origin, direction) {
      if (cooldown > 0) return
      cooldown = fireCooldownDuration
      if (quizRoomActive) quizShotsFired += 1
      fire(origin, direction)
      for (const w of wingmen) fireSingle(w.mesh.position, direction)
    },

    // >> AJUSTADO: filtro de distância nos dois caminhos (locked e "N mais próximos") <<
    fireHomingShot(origin, maxTargets) {
      const inRange = (e) => origin.distanceTo(e.mesh.position) <= MAX_LOCK_RANGE

      const locked = [...lockedEnemies].filter((e) => !e.dying && inRange(e))
      let targets
      if (locked.length > 0) {
        targets = locked.slice(0, Math.max(0, maxTargets))
      } else {
        const alive = [...enemies].filter((e) => !e.dying && inRange(e))
        alive.sort((a, b) => origin.distanceTo(a.mesh.position) - origin.distanceTo(b.mesh.position))
        targets = alive.slice(0, Math.max(0, maxTargets))
      }
      lockedEnemies.clear()
      for (const target of targets) {
        const direction = target.mesh.position.clone().sub(origin).normalize()
        const mesh = new THREE.Mesh(homingProjectileGeometry, homingProjectileMaterial)
        mesh.position.copy(origin)
        scene.add(mesh)
        projectiles.push({
          mesh,
          velocity: direction.multiplyScalar(HOMING_PROJECTILE_SPEED),
          traveled: 0,
          homingTarget: target,
          damage: HOMING_PROJECTILE_DAMAGE,
          isHoming: true,
          afterimageTimer: 0,
        })
      }
      const firstDir = targets[0] ? targets[0].mesh.position.clone().sub(origin).normalize() : new THREE.Vector3(0, 0, -1)
      if (effects) {
        effects.muzzleFlash(origin, firstDir)
        effects.smokeRing(origin, firstDir)
      }
      return targets.length
    },

    deflectNearbyProjectiles(playerPos, radius) {
      const alive = [...enemies].filter((e) => !e.dying)
      let deflected = 0
      for (const p of [...enemyProjectiles]) {
        if (playerPos.distanceTo(p.mesh.position) > radius) continue
        removeEnemyProjectile(p)
        deflected += 1
        if (alive.length === 0) continue

        let nearest = alive[0]
        let nearestDist = playerPos.distanceTo(nearest.mesh.position)
        for (const e of alive) {
          const d = playerPos.distanceTo(e.mesh.position)
          if (d < nearestDist) { nearest = e; nearestDist = d }
        }
        fireSingle(playerPos, nearest.mesh.position.clone().sub(playerPos).normalize())
      }
      return deflected
    },

    setWingmanCount(n) {
      n = Math.max(0, Math.min(WINGMAN_OFFSETS.length, n))
      while (wingmen.length < n) {
        const mesh = new THREE.Mesh(wingmanGeometry, wingmanMaterial)
        scene.add(mesh)
        wingmen.push({ mesh })
      }
      while (wingmen.length > n) {
        const w = wingmen.pop()
        scene.remove(w.mesh)
      }
    },

    spawnEnemy() {
      const position = spawnPositionForEnemy(ENEMY_SPAWN_DISTANCE_MIN, ENEMY_SPAWN_DISTANCE_MAX, ENEMY_BOX_X, ENEMY_BOX_Y)
      const mesh = new THREE.Mesh(enemyGeometry, enemyMaterial)
      mesh.position.copy(position)
      mesh.rotation.x = Math.PI / 2
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

    getEnemyCount() {
      return enemies.reduce((n, e) => n + (e.kind === 'red' ? 1 : 0), 0)
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
        const mesh = new THREE.Mesh(enemyGeometry, enemyMaterial)
        mesh.position.copy(position)
        mesh.rotation.x = Math.PI / 2
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
      mesh.rotation.x = Math.PI / 2
      mesh.scale.setScalar(TANK_ENEMY_SCALE)
      scene.add(mesh)
      enemies.push({ id: nextEnemyId++, mesh, kind: 'tank', dying: false, deathT: 0, hp, maxHp: hp, fireTimer: randomEnemyFireInterval() })
    },

    spawnBossEnemy(hp) {
      const position = randomSpawnAroundArena(ENEMY_ARENA_SPAWN_MAX * 0.6, ENEMY_ARENA_SPAWN_MAX)
      const mesh = new THREE.Mesh(enemyGeometry, bossEnemyMaterial)
      mesh.position.copy(position)
      mesh.rotation.x = Math.PI / 2
      mesh.scale.setScalar(BOSS_ENEMY_SCALE)
      scene.add(mesh)
      enemies.push({ id: nextEnemyId++, mesh, kind: 'boss', dying: false, deathT: 0, hp, maxHp: hp, fireTimer: 1 })
    },

    clearEnemies() {
      for (const enemy of [...enemies]) removeEnemy(enemy)
      for (const projectile of [...enemyProjectiles]) removeEnemyProjectile(projectile)
    },

    clearAllCombatants() {
      for (const enemy of [...enemies]) removeEnemy(enemy)
      for (const projectile of [...enemyProjectiles]) removeEnemyProjectile(projectile)
      for (const projectile of [...projectiles]) removeProjectile(projectile)
    },

    spawnBonusTarget() {
      const position = randomSpawnPositionOnPath(BONUS_SPAWN_DISTANCE_MIN, BONUS_SPAWN_DISTANCE_MAX, BONUS_BOX_X, BONUS_BOX_Y)
      const mesh = new THREE.Mesh(bonusGeometry, bonusMaterial)
      mesh.position.copy(position)
      scene.add(mesh)
      bonusTargets.push({ mesh, dying: false, deathT: 0 })
    },

    clearBonusTargets() {
      for (const bonus of [...bonusTargets]) {
        if (!bonus.dying) removeBonusTarget(bonus)
      }
    },

    spawnGoldenSpecial(opts = {}) {
      const { distanceMin = 40, distanceMax = 90 } = opts
      const frame = rail.getFrameAt(0)
      const azimuth = Math.random() * Math.PI * 2
      const elevation = (Math.random() * 2 - 1) * BOSS_TARGET_ELEVATION_MAX
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

    clearGoldenTargets() {
      for (const g of [...goldenTargets]) removeGoldenTarget(g)
    },

    spawnQuizTargets(alternatives) {
      quizRoomActive = true
      quizShotsFired = 0
      const base = projectAhead(QUIZ_TARGET_DISTANCE)
      for (const alt of alternatives) {
        const offset = QUIZ_SLOT_OFFSETS[alt.slot]
        const position = base.position.clone()
          .addScaledVector(base.right, offset.x)
          .addScaledVector(base.up, offset.y)

        const mesh = makeQuizTargetMesh(alt)
        mesh.position.copy(position)
        scene.add(mesh)
        quizTargets.push({
          mesh,
          slot: alt.slot,
          isCorrect: alt.isCorrect,
          dying: false,
          deathT: 0,
          colorHex: SHAPE_COLOR[alt.color] ?? 0xffffff,
        })
      }
    },

    spawnBossTargets(alternatives, opts = {}) {
      quizRoomActive = true
      quizShotsFired = 0
      const { distanceMin = 45, distanceMax = 95 } = opts
      const frame = rail.getFrameAt(0)
      for (const alt of alternatives) {
        const azimuth = Math.random() * Math.PI * 2
        const elevation = (Math.random() * 2 - 1) * BOSS_TARGET_ELEVATION_MAX
        const distance = distanceMin + Math.random() * (distanceMax - distanceMin)
        const offset = new THREE.Vector3(
          Math.sin(azimuth) * Math.cos(elevation),
          Math.sin(elevation),
          Math.cos(azimuth) * Math.cos(elevation),
        ).multiplyScalar(distance)

        const mesh = makeQuizTargetMesh(alt)
        mesh.position.copy(frame.position.clone().add(offset))
        scene.add(mesh)
        quizTargets.push({
          mesh,
          slot: alt.slot,
          isCorrect: alt.isCorrect,
          dying: false,
          deathT: 0,
          noCull: true,
          colorHex: SHAPE_COLOR[alt.color] ?? 0xffffff,
        })
      }
    },

    clearQuizTargets() {
      quizRoomActive = false
      for (const target of [...quizTargets]) {
        if (!target.dying) removeQuizTarget(target)
      }
      for (const projectile of [...projectiles]) removeProjectile(projectile)
    },

    getQuizShotsFired: () => quizShotsFired,

    getEnemySnapshots: () => [...enemies, ...goldenTargets]
      .filter((e) => !e.dying && e.maxHp > 1)
      .map((e) => ({ id: e.id, worldPos: e.mesh.position.clone(), hp: e.hp, maxHp: e.maxHp })),

    sweepLockOn,
    clearLockedEnemies() { lockedEnemies.clear() },
    getLockedEnemySnapshots: () => [...lockedEnemies]
      .filter((e) => !e.dying)
      .map((e) => ({ id: e.id, worldPos: e.mesh.position.clone() })),

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

    getLockOnTarget: () => (currentLockOn && !currentLockOn.dying ? currentLockOn : null),

    setFireCooldown(seconds) { fireCooldownDuration = seconds },
    setAimAssistAngle(radians) { aimAssistAngle = radians },
    setProjectileCount(n) { projectileCount = n },
    setEnemyAggressiveness(multiplier) { enemyAggression = multiplier },
    setShowHitboxes(v) { showHitboxes = v; refreshHitboxes() },

    update(dt, playerPosition, opts = {}) {
      const enemiesActive = opts.enemiesActive !== false
      const aimOrigin = opts.aimOrigin
      const aimDirection = opts.aimDirection
      elapsed += dt
      cooldown = Math.max(0, cooldown - dt)

      if (aimOrigin && aimDirection) {
        currentLockOn = findLockOnTarget(aimOrigin, aimDirection)
      } else {
        currentLockOn = null
      }

      const { hitEvent, enemyKills, enemyKillPoints, bonusKillPoints, goldenSpecialHit, timeReductionMs, bossDefeated } = updateProjectiles(dt, aimDirection)
      updateQuizTargets(dt)
      updateBonusTargets(dt)
      updateGoldenTargets(dt, playerPosition)

      let enemyHits = 0
      let ramKills = 0
      let ramKillPoints = 0
      let ramBossDefeated = false
      if (enemiesActive) {
        const enemyResult = updateEnemies(dt, playerPosition, opts.ramDamage || 0)
        enemyHits += enemyResult.hits
        ramKills = enemyResult.ramKills
        ramKillPoints = enemyResult.ramKillPoints
        ramBossDefeated = enemyResult.ramBossDefeated
        enemyHits += updateEnemyProjectiles(dt, playerPosition)
      }

      updateWingmen()

      if (showHitboxes) refreshHitboxes()

      return {
        targetHit: hitEvent,
        enemyKills: enemyKills + ramKills,
        enemyKillPoints: enemyKillPoints + ramKillPoints,
        bonusKillPoints,
        enemyHits,
        goldenSpecialHit,
        timeReductionMs,
        bossDefeated: bossDefeated || ramBossDefeated,
      }
    },

    dispose() {
      for (const p of [...projectiles]) removeProjectile(p)
      for (const p of [...enemyProjectiles]) removeEnemyProjectile(p)
      for (const e of [...enemies]) removeEnemy(e)
      for (const t of [...quizTargets]) removeQuizTarget(t)
      for (const b of [...bonusTargets]) removeBonusTarget(b)
      for (const g of [...goldenTargets]) removeGoldenTarget(g)
      for (const w of [...wingmen]) scene.remove(w.mesh)
      wingmen.length = 0
      projectileGeometry.dispose()
      projectileMaterial.dispose()
      homingProjectileGeometry.dispose()
      homingProjectileMaterial.dispose()
      wingmanGeometry.dispose()
      wingmanMaterial.dispose()
      enemyGeometry.dispose()
      enemyMaterial.dispose()
      enemyProjectileGeometry.dispose()
      enemyProjectileMaterial.dispose()
      bonusGeometry.dispose()
      bonusMaterial.dispose()
      goldenGeometry.dispose()
      goldenMaterial.dispose()
      timeEnemyGeometry.dispose()
      timeEnemyMaterial.dispose()
      tankEnemyMaterial.dispose()
      bossEnemyMaterial.dispose()
      while (hitboxGroup.children.length) hitboxGroup.remove(hitboxGroup.children[0])
      scene.remove(hitboxGroup)
      hitboxGeometry.dispose()
      hitboxMaterial.dispose()
    },
  }
}
