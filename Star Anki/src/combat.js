import * as THREE from 'three'

const PROJECTILE_SPEED = 60
const PROJECTILE_MAX_RANGE = 260
// tiros paralelos, deslocados lateralmente pelo eixo perpendicular à direção mirada — não é um
// cone. Antes era um ângulo fixo por tiro (5°), mas a 150 unidades (distância do alvo de quiz)
// isso virava ~6.5 unidades de desvio lateral, contra um raio de acerto de 1.3: o "projétil
// extra" do buff na prática fazia o tiro mais externo ERRAR. Paralelos resolvem isso — todos
// voam na direção mirada e só se deslocam de lado a partir do nariz.
const PROJECTILE_LATERAL_SPACING = 1.6
const PASS_BEHIND = -4
const WORLD_UP = new THREE.Vector3(0, 1, 0)

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

// dispersão fixa aplicada UMA vez, no instante do disparo — o tiro continua em linha reta (não persegue),
// mas erra de vez em quando, o que deixa visível que NÃO é teleguiado
const ENEMY_AIM_ERROR_DEG = 5

// alvo bônus SIMPLES (só pontos, sem pergunta) — verde esmeralda, bem distinto do dourado
// especial abaixo (que é um TorusKnot cor de creme). Antes era dourado, o que fazia os dois
// serem confundidos à distância; o verde não colide com nenhuma outra cor do jogo (inimigo é
// vermelho, redutor de tempo é roxo, alvos de pergunta são azul/âmbar/magenta/ciano).
const BONUS_COLOR = 0x2bff6b
const BONUS_SPAWN_DISTANCE_MIN = 90
const BONUS_SPAWN_DISTANCE_MAX = 140
const BONUS_BOX_X = 7
const BONUS_BOX_Y = 5
const BONUS_HIT_RADIUS = 1.6
const BONUS_DEATH_DURATION = 0.2
const BONUS_KILL_BONUS = 50

// inimigo dourado ESPECIAL (pergunta bônus + All-Range) — visual diferente do bônus simples acima:
// geometria de nó de toro (em vez do dodecaedro), emissive mais forte e pulso de escala animado
const GOLDEN_SPECIAL_COLOR = 0xfff2a0
const GOLDEN_SPECIAL_EMISSIVE = 0xffb300
const GOLDEN_SPECIAL_HIT_RADIUS = 2.2
const GOLDEN_SPECIAL_DEATH_DURATION = 0.25
const GOLDEN_SPECIAL_PULSE_SPEED = 4
const GOLDEN_SPECIAL_PULSE_AMOUNT = 0.18

// inimigo normal redutor de tempo — roxo elétrico, silhueta de ampulheta (dois cones ponta a ponta)
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

export function createCombatSystem(scene, rail) {
  const projectiles = []
  const quizTargets = []
  const enemies = []
  const enemyProjectiles = []
  const bonusTargets = []
  const goldenTargets = []

  const projectileGeometry = new THREE.SphereGeometry(0.25, 8, 8)
  const projectileMaterial = new THREE.MeshBasicMaterial({ color: 0xfff2a8 })
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

  // segue a curva de verdade (frame no arco futuro), em vez de extrapolar em linha reta a partir da
  // tangente atual — o trilho curva bastante (~60° a cada 70-90 unidades), então um alvo que precisa
  // continuar alcançável por um bom tempo enquanto o trilho avança (inimigo, bônus) tem que nascer
  // onde a nave vai de fato passar, não onde a tangente de agora aponta. Alvos de quiz não usam isso:
  // eles nascem com o trilho pausado (distance congelada) bem na frente da câmera fixa, então a
  // extrapolação em linha reta de projectAhead() continua certa pra eles.
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

  let cooldown = 0
  let fireCooldownDuration = DEFAULT_FIRE_COOLDOWN
  let aimAssistAngle = DEFAULT_AIM_ASSIST_ANGLE
  // 2 por padrão (canhões duplos estilo Arwing do Star Fox 64); sobe até 4 com o buff de acerto
  let projectileCount = 2
  let enemyAggression = 1
  let quizRoomActive = false
  let quizShotsFired = 0
  let elapsed = 0

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

  function fire(origin, direction) {
    let shotDirection = direction.clone()
    let closestAngle = aimAssistAngle
    let lockedTarget = null

    for (const target of quizTargets) {
      if (target.dying) continue
      const toTarget = target.mesh.position.clone().sub(origin).normalize()
      const angle = Math.acos(THREE.MathUtils.clamp(shotDirection.dot(toTarget), -1, 1))
      if (angle < closestAngle) {
        closestAngle = angle
        lockedTarget = target
      }
    }

    if (lockedTarget) shotDirection = lockedTarget.mesh.position.clone().sub(origin).normalize()

    // eixo perpendicular à direção do tiro, no plano horizontal — é ao longo dele que os tiros
    // paralelos são deslocados (o "eixo lateral" entre os canhões da nave)
    const lateralAxis = new THREE.Vector3().crossVectors(shotDirection, WORLD_UP)
    if (lateralAxis.lengthSq() < 1e-4) lateralAxis.set(1, 0, 0)
    lateralAxis.normalize()

    const mid = (projectileCount - 1) / 2
    for (let i = 0; i < projectileCount; i += 1) {
      const lateralOffset = (i - mid) * PROJECTILE_LATERAL_SPACING
      const mesh = new THREE.Mesh(projectileGeometry, projectileMaterial)
      mesh.position.copy(origin).addScaledVector(lateralAxis, lateralOffset)
      scene.add(mesh)
      projectiles.push({ mesh, velocity: shotDirection.clone().multiplyScalar(PROJECTILE_SPEED), traveled: 0 })
    }
  }

  // mira só no instante do disparo, não persegue depois — um tiro que se realinha a cada frame com a posição
  // atual do jogador é impossível de desviar de verdade; disparado em linha reta, o jogador pode sair da rota.
  // além disso, aplica um erro angular fixo no disparo (ENEMY_AIM_ERROR_DEG) pra o tiro errar de vez em
  // quando e deixar explícito que é reto, não teleguiado
  function fireEnemyProjectile(enemy, playerPosition) {
    const mesh = new THREE.Mesh(enemyProjectileGeometry, enemyProjectileMaterial)
    mesh.position.copy(enemy.mesh.position)

    const direction = playerPosition.clone().sub(enemy.mesh.position).normalize()

    // dispersão aplicada uma única vez aqui; depois a velocidade é constante e o projétil só anda em linha reta
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

  function updateProjectiles(dt) {
    let hitEvent = null
    let enemyKills = 0
    let enemyKillPoints = 0
    let bonusKillPoints = 0
    let goldenSpecialHit = false
    let timeReductionMs = null

    for (const projectile of [...projectiles]) {
      const step = projectile.velocity.clone().multiplyScalar(dt)
      projectile.mesh.position.add(step)
      projectile.traveled += step.length()

      const targetHit = quizTargets.find((t) => !t.dying && projectile.mesh.position.distanceTo(t.mesh.position) <= QUIZ_HIT_RADIUS)
      if (targetHit) {
        targetHit.dying = true
        targetHit.deathT = 0
        if (!hitEvent) hitEvent = { slot: targetHit.slot, isCorrect: targetHit.isCorrect }
        removeProjectile(projectile)
        continue
      }

      const enemyHit = enemies.find((e) => {
        if (e.dying) return false
        const radius = e.kind === 'time' ? TIME_ENEMY_HIT_RADIUS : ENEMY_HIT_RADIUS
        return projectile.mesh.position.distanceTo(e.mesh.position) <= radius
      })
      if (enemyHit) {
        enemyHit.dying = true
        enemyHit.deathT = 0
        enemyKills += 1
        enemyKillPoints += ENEMY_KILL_BONUS
        if (enemyHit.kind === 'time') timeReductionMs = TIME_REDUCTION_MIN_MS + Math.random() * (TIME_REDUCTION_MAX_MS - TIME_REDUCTION_MIN_MS)
        removeProjectile(projectile)
        continue
      }

      const bonusHit = bonusTargets.find((b) => !b.dying && projectile.mesh.position.distanceTo(b.mesh.position) <= BONUS_HIT_RADIUS)
      if (bonusHit) {
        bonusHit.dying = true
        bonusHit.deathT = 0
        bonusKillPoints += BONUS_KILL_BONUS
        removeProjectile(projectile)
        continue
      }

      const goldenHit = goldenTargets.find((g) => !g.dying && projectile.mesh.position.distanceTo(g.mesh.position) <= GOLDEN_SPECIAL_HIT_RADIUS)
      if (goldenHit) {
        goldenHit.dying = true
        goldenHit.deathT = 0
        goldenSpecialHit = true
        removeProjectile(projectile)
        continue
      }

      if (projectile.traveled > PROJECTILE_MAX_RANGE) removeProjectile(projectile)
    }

    return { hitEvent, enemyKills, enemyKillPoints, bonusKillPoints, goldenSpecialHit, timeReductionMs }
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
      // alvos de chefe não somem por "passar de trás" — na arena livre o jogador vira em qualquer direção pra procurar
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

  // sem culling por "passar de trás": o dourado especial só existe dentro da arena livre, onde o jogador vira em qualquer direção
  function updateGoldenTargets(dt) {
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
    }
  }

  function updateEnemies(dt, playerPosition) {
    const frame = rail.getFrameAt(0)
    let hits = 0
    for (const enemy of [...enemies]) {
      const hitRadius = enemy.kind === 'time' ? TIME_ENEMY_HIT_RADIUS : ENEMY_HIT_RADIUS
      const deathDuration = enemy.kind === 'time' ? TIME_ENEMY_DEATH_DURATION : ENEMY_DEATH_DURATION
      if (enemy.dying) {
        enemy.deathT += dt / deathDuration
        enemy.mesh.scale.setScalar(Math.max(0, 1 - enemy.deathT))
        if (enemy.deathT >= 1) removeEnemy(enemy)
        continue
      }

      if (playerPosition.distanceTo(enemy.mesh.position) <= hitRadius) {
        hits += 1
        removeEnemy(enemy)
        continue
      }

      const relative = enemy.mesh.position.clone().sub(frame.position)
      if (relative.dot(frame.forward) < PASS_BEHIND) {
        removeEnemy(enemy)
        continue
      }

      enemy.fireTimer -= dt
      if (enemy.fireTimer <= 0 && relative.dot(frame.forward) < ENEMY_FIRE_RANGE) {
        fireEnemyProjectile(enemy, playerPosition)
        enemy.fireTimer = randomEnemyFireInterval()
      }
    }
    return hits
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
    },

    spawnEnemy() {
      const position = randomSpawnPositionOnPath(ENEMY_SPAWN_DISTANCE_MIN, ENEMY_SPAWN_DISTANCE_MAX, ENEMY_BOX_X, ENEMY_BOX_Y)
      const mesh = new THREE.Mesh(enemyGeometry, enemyMaterial)
      mesh.position.copy(position)
      mesh.rotation.x = Math.PI / 2
      scene.add(mesh)
      enemies.push({ mesh, kind: 'red', dying: false, deathT: 0, fireTimer: randomEnemyFireInterval() })
    },

    spawnTimeEnemy() {
      const position = randomSpawnPositionOnPath(TIME_ENEMY_SPAWN_DISTANCE_MIN, TIME_ENEMY_SPAWN_DISTANCE_MAX, TIME_ENEMY_BOX_X, TIME_ENEMY_BOX_Y)
      const mesh = buildTimeEnemyMesh()
      mesh.position.copy(position)
      scene.add(mesh)
      enemies.push({ mesh, kind: 'time', dying: false, deathT: 0, fireTimer: randomEnemyFireInterval() })
    },

    clearEnemies() {
      for (const enemy of [...enemies]) removeEnemy(enemy)
      for (const projectile of [...enemyProjectiles]) removeEnemyProjectile(projectile)
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

    // reaproveita a mesma distribuição esférica de spawnBossTargets — o dourado especial força All-Range igual ao chefe
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
      goldenTargets.push({ mesh, dying: false, deathT: 0 })
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
        quizTargets.push({ mesh, slot: alt.slot, isCorrect: alt.isCorrect, dying: false, deathT: 0 })
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
        quizTargets.push({ mesh, slot: alt.slot, isCorrect: alt.isCorrect, dying: false, deathT: 0, noCull: true })
      }
    },

    // deixa alvos já em animação de morte terminarem sozinhos via updateQuizTargets; só remove os que ainda não foram atingidos
    clearQuizTargets() {
      quizRoomActive = false
      for (const target of [...quizTargets]) {
        if (!target.dying) removeQuizTarget(target)
      }
      for (const projectile of [...projectiles]) removeProjectile(projectile)
    },

    getQuizShotsFired: () => quizShotsFired,

    setFireCooldown(seconds) { fireCooldownDuration = seconds },
    setAimAssistAngle(radians) { aimAssistAngle = radians },
    setProjectileCount(n) { projectileCount = n },
    setEnemyAggressiveness(multiplier) { enemyAggression = multiplier },

    update(dt, playerPosition, opts = {}) {
      const enemiesActive = opts.enemiesActive !== false
      elapsed += dt
      cooldown = Math.max(0, cooldown - dt)
      const { hitEvent, enemyKills, enemyKillPoints, bonusKillPoints, goldenSpecialHit, timeReductionMs } = updateProjectiles(dt)
      updateQuizTargets(dt)
      updateBonusTargets(dt)
      updateGoldenTargets(dt)

      let enemyHits = 0
      if (enemiesActive) {
        enemyHits += updateEnemies(dt, playerPosition)
        enemyHits += updateEnemyProjectiles(dt, playerPosition)
      }

      return { targetHit: hitEvent, enemyKills, enemyKillPoints, bonusKillPoints, enemyHits, goldenSpecialHit, timeReductionMs }
    },

    dispose() {
      for (const p of [...projectiles]) removeProjectile(p)
      for (const p of [...enemyProjectiles]) removeEnemyProjectile(p)
      for (const e of [...enemies]) removeEnemy(e)
      for (const t of [...quizTargets]) removeQuizTarget(t)
      for (const b of [...bonusTargets]) removeBonusTarget(b)
      for (const g of [...goldenTargets]) removeGoldenTarget(g)
      projectileGeometry.dispose()
      projectileMaterial.dispose()
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
    },
  }
}