import * as THREE from 'three'
import { TIME_REDUCTION_MIN_MS, TIME_REDUCTION_MAX_MS } from './enemies.js'

// re-exportado pra não quebrar quem importava essas duas constantes daqui (combat.js era o
// dono antes da Fase 1 da refatoração enemies.js/player.js)
export { TIME_REDUCTION_MIN_MS, TIME_REDUCTION_MAX_MS }

const PROJECTILE_SPEED = 60
const PROJECTILE_MAX_RANGE = 260
const PROJECTILE_LATERAL_SPACING = 1.6
const PASS_BEHIND = -4
const WORLD_UP = new THREE.Vector3(0, 1, 0)
const FORWARD_AXIS = new THREE.Vector3(0, 0, 1)

const HOMING_PROJECTILE_SPEED = 69 // 46 * 1.5 (pedido: +50% de velocidade)
const HOMING_PROJECTILE_DAMAGE = 3
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

// ============ ORBES-PERGUNTA DO CHEFE (Fase 5) ============
// substituem o antigo "atire na alternativa certa entre 4 formas espalhadas" — agora são
// marcadores genéricos e idênticos: acertar QUALQUER um dispara a próxima pergunta da fila
// (main.js decide qual, via nextQuestion), que é respondida numa pausa total (hud modal),
// não atirando em mais nada.
const BOSS_ORB_HIT_RADIUS = 2.2
const BOSS_ORB_DEATH_DURATION = 0.2
const BOSS_ORB_COLOR = 0xffd166

const BONUS_COLOR = 0x2bff6b
const BONUS_SPAWN_DISTANCE_MIN = 90
const BONUS_SPAWN_DISTANCE_MAX = 140
const BONUS_BOX_X = 7
const BONUS_BOX_Y = 5
const BONUS_HIT_RADIUS = 1.6
const BONUS_DEATH_DURATION = 0.2
const BONUS_KILL_BONUS = 50

// tiro carregado: enquanto segura o botão, varrer a mira sobre inimigos os marca (lock-on) —
// ao soltar, o teleguiado mira exatamente nos marcados em vez dos N mais próximos
const ENEMY_LOCK_ANGLE = THREE.MathUtils.degToRad(6)

// distância máxima (unidades de mundo) para um alvo poder ser travado/auto-mirável. Vale tanto
// pra detecção da mira (findLockOnTarget) quanto pro teleguiado (sweepLockOn e a seleção de
// alvos em fireHomingShot). Sem isso, dá pra "magnetizar" tiro em inimigo a centenas de
// unidades de distância. Ajuste pra cima (150+) se quiser voltar ao comportamento antigo, ou
// pra baixo (60) pra exigir aproximação.
const MAX_LOCK_RANGE = 90

// o teleguiado deve "parar de mirar em inimigos que estão extremamente próximos ou passaram
// pelo jogador" — usado em sweepLockOn (não deixa travar/mantém travado um inimigo mais perto
// que isso) e reaproveita PASS_BEHIND (já existente) pra saber se já ficou pra trás
const MIN_LOCK_RANGE = 10

export function createCombatSystem(scene, rail, effects, enemies, player) {
  const projectiles = []
  const quizTargets = []
  const bonusTargets = []
  const bossOrbs = []

  const projectileGeometry = new THREE.ConeGeometry(0.168, 1.2, 5)
  projectileGeometry.rotateX(Math.PI / 2)
  const projectileMaterial = new THREE.MeshBasicMaterial({ color: 0x3ea6ff })

  const homingProjectileGeometry = new THREE.ConeGeometry(0.528, 3.36, 6)
  homingProjectileGeometry.rotateX(Math.PI / 2)
  const homingProjectileMaterial = new THREE.MeshBasicMaterial({ color: 0x2bff88 })

  const wingmanGeometry = new THREE.ConeGeometry(0.32, 1.1, 3)
  wingmanGeometry.rotateX(-Math.PI / 2)
  const wingmanMaterial = new THREE.MeshPhongMaterial({ color: 0x7fe0ff, flatShading: true })

  const bonusGeometry = new THREE.DodecahedronGeometry(1.1)
  const bonusMaterial = new THREE.MeshPhongMaterial({
    color: BONUS_COLOR,
    flatShading: true,
    emissive: 0x0a6622,
    emissiveIntensity: 0.7,
  })

  const bossOrbGeometry = new THREE.IcosahedronGeometry(1.6, 0)
  const bossOrbMaterial = new THREE.MeshPhongMaterial({
    color: BOSS_ORB_COLOR,
    flatShading: true,
    emissive: 0x664400,
    emissiveIntensity: 0.85,
    transparent: true,
    opacity: 0.92,
  })
  const bossOrbRingGeometry = new THREE.TorusGeometry(2.3, 0.09, 8, 24)
  const bossOrbRingMaterial = new THREE.MeshBasicMaterial({ color: BOSS_ORB_COLOR, transparent: true, opacity: 0.55 })

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
    for (const b of bonusTargets) if (!b.dying) markHitbox(b.mesh.position, BONUS_HIT_RADIUS)
    for (const o of bossOrbs) if (!o.dying) markHitbox(o.mesh.position, BOSS_ORB_HIT_RADIUS)
    for (const item of enemies.getHitboxTargets()) markHitbox(item.worldPos, item.radius)
  }

  function makeQuizTargetMesh(alt) {
    return new THREE.Mesh(SHAPE_GEOMETRY[alt.shape](), new THREE.MeshPhongMaterial({ color: SHAPE_COLOR[alt.color], flatShading: true }))
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

  // Fase 3: projectileCount/aimAssistAngle não têm mais cópia própria aqui — lidos direto de
  // player.config a cada uso. fireCooldownDuration continua LOCAL (não delegado) porque o
  // debug "Tiro infinito" precisa poder zerá-lo por fora do stat real do jogador; combat.js
  // ainda tem setFireCooldown() só por causa disso.
  let cooldown = 0
  let fireCooldownDuration = DEFAULT_FIRE_COOLDOWN
  let quizRoomActive = false
  let quizShotsFired = 0
  let elapsed = 0

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

  // maxAllowed (main.js): quantos alvos podem estar travados NESTE instante do carregamento —
  // 1 no início, +1 a cada HOMING_LOCK_INTERVAL_MS (pedido: travar um alvo novo por vez, não
  // todos de uma vez). Sem isso, qualquer inimigo que passasse pela mira durante a carga toda
  // ficava marcado, sem limite — o teto só valia na hora de disparar, não na marcação visual.
  function sweepLockOn(origin, direction, maxAllowed = Infinity) {
    const frame = rail.getFrameAt(0)
    // solta quem ficou extremamente perto ou já passou pra trás do jogador antes de disparar —
    // libera a vaga pra um alvo válido poder ser travado no lugar
    for (const e of [...lockedEnemies]) {
      if (e.dying) { lockedEnemies.delete(e); continue }
      const rel = e.mesh.position.clone().sub(origin)
      if (rel.length() < MIN_LOCK_RANGE || rel.dot(frame.forward) < PASS_BEHIND) lockedEnemies.delete(e)
    }
    if (lockedEnemies.size >= maxAllowed) return
    for (const e of enemies.getAlive()) {
      if (lockedEnemies.size >= maxAllowed) break
      if (lockedEnemies.has(e)) continue
      const rel = e.mesh.position.clone().sub(origin)
      const dist = rel.length()
      if (dist > MAX_LOCK_RANGE || dist < MIN_LOCK_RANGE || rel.dot(frame.forward) < PASS_BEHIND) continue
      const toTarget = rel.clone().normalize()
      const angle = Math.acos(THREE.MathUtils.clamp(direction.dot(toTarget), -1, 1))
      if (angle < ENEMY_LOCK_ANGLE) lockedEnemies.add(e)
    }
  }

  function removeProjectile(p) {
    scene.remove(p.mesh)
    projectiles.splice(projectiles.indexOf(p), 1)
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

  function removeBossOrb(o) {
    scene.remove(o.mesh)
    bossOrbs.splice(bossOrbs.indexOf(o), 1)
  }

  function updateBossOrbs(dt) {
    for (const orb of [...bossOrbs]) {
      if (orb.dying) {
        orb.deathT += dt / BOSS_ORB_DEATH_DURATION
        orb.mesh.scale.setScalar(Math.max(0, 1 - orb.deathT))
        if (orb.deathT >= 1) removeBossOrb(orb)
        continue
      }
      // giro + pulso constantes — só pra ficar claro que é um marcador "vivo" de longe, não um
      // inimigo nem um alvo comum. Polimento visual maior fica pra Fase 7.
      orb.mesh.rotation.y += dt * 0.8
      orb.mesh.children[1].rotation.z += dt * 1.6
      orb.mesh.scale.setScalar(1 + Math.sin(elapsed * 3 + orb.phase) * 0.08)
    }
  }

  function distanceToSegment(point, segStart, segEnd) {
    const seg = segEnd.clone().sub(segStart)
    const lenSq = seg.lengthSq()
    if (lenSq < 1e-8) return point.distanceTo(segStart)
    const t = THREE.MathUtils.clamp(point.clone().sub(segStart).dot(seg) / lenSq, 0, 1)
    const closest = segStart.clone().addScaledVector(seg, t)
    return point.distanceTo(closest)
  }

  // filtro de distância — só trava alvo de pergunta dentro de MAX_LOCK_RANGE
  function findLockOnTarget(origin, direction) {
    let best = null
    let bestAngle = player.config.aimAssistAngle
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

    const projectileCount = player.config.projectileCount
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

  function updateProjectiles(dt, aimDirection) {
    let hitEvent = null
    let enemyKills = 0
    let enemyKillPoints = 0
    let bonusKillPoints = 0
    let goldenSpecialHit = false
    let timeReductionMs = null
    let bossDefeated = false
    let bossOrbHit = false
    // log de acertos (posição, dano, se matou) — usado pelo main.js pra faíscas, flash no
    // mesh atingido e números de dano flutuantes no HUD
    const hitsLog = []

    for (const projectile of [...projectiles]) {
      if (projectile.homingTarget) {
        if (projectile.homingTarget.dying || !enemies.getAlive().includes(projectile.homingTarget)) {
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

      const orbHit = bossOrbs.find((o) => !o.dying && distanceToSegment(o.mesh.position, prevPos, projectile.mesh.position) <= BOSS_ORB_HIT_RADIUS)
      if (orbHit) {
        orbHit.dying = true
        orbHit.deathT = 0
        bossOrbHit = true
        if (effects) effects.explosion(orbHit.mesh.position, BOSS_ORB_COLOR, 1.1)
        removeProjectile(projectile)
        continue
      }

      const hit = enemies.resolveProjectileHit(prevPos, projectile.mesh.position, {
        damage: projectile.damage ?? 1,
        isHoming: !!projectile.isHoming,
      })
      if (hit) {
        removeProjectile(projectile)
        if (hit.kind !== 'golden') {
          hitsLog.push({
            worldPos: hit.worldPos,
            damage: projectile.damage ?? 1,
            killed: hit.killed,
            isHoming: !!projectile.isHoming,
            meshRef: hit.meshRef,
          })
          if (hit.killed) {
            if (hit.bossDefeated) bossDefeated = true
            else enemyKills += 1
          }
        } else if (hit.goldenSpecialHit) {
          goldenSpecialHit = true
        }
        if (hit.enemyKillPoints) enemyKillPoints += hit.enemyKillPoints
        if (hit.timeReductionMs != null) timeReductionMs = hit.timeReductionMs
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

      if (projectile.traveled > PROJECTILE_MAX_RANGE) removeProjectile(projectile)
    }

    return { hitEvent, enemyKills, enemyKillPoints, bonusKillPoints, goldenSpecialHit, timeReductionMs, bossDefeated, bossOrbHit, hitsLog }
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

  return {
    tryFire(origin, direction) {
      if (cooldown > 0) return
      cooldown = fireCooldownDuration
      if (quizRoomActive) quizShotsFired += 1
      fire(origin, direction)
      for (const w of wingmen) fireSingle(w.mesh.position, direction)
    },

    // filtro de distância nos dois caminhos (locked e "N mais próximos")
    fireHomingShot(origin, maxTargets) {
      const inRange = (e) => origin.distanceTo(e.mesh.position) <= MAX_LOCK_RANGE

      const locked = [...lockedEnemies].filter((e) => !e.dying && inRange(e))
      let targets
      if (locked.length > 0) {
        targets = locked.slice(0, Math.max(0, maxTargets))
      } else {
        const alive = enemies.getAlive().filter(inRange)
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

    // carta utilitária "giro rebatedor": projéteis inimigos dentro do raio, perto do jogador,
    // são destruídos e viram tiros do próprio jogador mirando no inimigo vivo mais próximo.
    // enemyProjectiles mora em enemies.js agora — pede pra ele remover e devolver as posições.
    deflectNearbyProjectiles(playerPos, radius) {
      const removedPositions = enemies.removeProjectilesNear(playerPos, radius)
      if (removedPositions.length === 0) return 0
      const alive = enemies.getAlive()
      for (const _pos of removedPositions) {
        if (alive.length === 0) continue
        let nearest = alive[0]
        let nearestDist = playerPos.distanceTo(nearest.mesh.position)
        for (const e of alive) {
          const d = playerPos.distanceTo(e.mesh.position)
          if (d < nearestDist) { nearest = e; nearestDist = d }
        }
        fireSingle(playerPos, nearest.mesh.position.clone().sub(playerPos).normalize())
      }
      return removedPositions.length
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

    getWingmanPositions: () => wingmen.map((w) => w.mesh.position.clone()),

    spawnEnemy: () => enemies.spawnEnemy(),
    spawnMiniSwarm: () => enemies.spawnMiniSwarm(),
    spawnTimeEnemy: () => enemies.spawnTimeEnemy(),
    spawnTankEnemy: (hp) => enemies.spawnTankEnemy(hp),
    spawnBossEnemy: (hp) => enemies.spawnBossEnemy(hp),
    spawnGoldenSpecial: (opts) => enemies.spawnGoldenSpecial(opts),

    getEnemyCount: () => enemies.getEnemyCount(),
    getEnemySnapshots: () => enemies.getEnemySnapshots(),
    getBossSnapshot: () => enemies.getBossSnapshot(),
    getMinimapBlips: () => enemies.getMinimapBlips(),

    clearEnemies: () => enemies.clearEnemies(),
    clearGoldenTargets: () => enemies.clearGoldenTargets(),

    clearAllCombatants() {
      enemies.clearAll()
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

    // 6 orbes genéricos espalhados pela arena do chefe (Fase 5) — nenhum "é" uma pergunta
    // específica até ser atingido; main.js decide qual pergunta mostrar (nextQuestion) na hora
    spawnBossOrbs(count, opts = {}) {
      const { distanceMin = 45, distanceMax = 95 } = opts
      const frame = rail.getFrameAt(0)
      for (let i = 0; i < count; i += 1) {
        const azimuth = Math.random() * Math.PI * 2
        const elevation = (Math.random() * 2 - 1) * BOSS_TARGET_ELEVATION_MAX
        const distance = distanceMin + Math.random() * (distanceMax - distanceMin)
        const offset = new THREE.Vector3(
          Math.sin(azimuth) * Math.cos(elevation),
          Math.sin(elevation),
          Math.cos(azimuth) * Math.cos(elevation),
        ).multiplyScalar(distance)

        const group = new THREE.Group()
        group.add(new THREE.Mesh(bossOrbGeometry, bossOrbMaterial))
        const ring = new THREE.Mesh(bossOrbRingGeometry, bossOrbRingMaterial)
        ring.rotation.x = Math.PI / 2
        group.add(ring)
        group.position.copy(frame.position.clone().add(offset))
        scene.add(group)
        bossOrbs.push({ mesh: group, dying: false, deathT: 0, phase: Math.random() * Math.PI * 2 })
      }
    },

    clearBossOrbs() {
      for (const orb of [...bossOrbs]) if (!orb.dying) removeBossOrb(orb)
    },

    clearQuizTargets() {
      quizRoomActive = false
      for (const target of [...quizTargets]) {
        if (!target.dying) removeQuizTarget(target)
      }
      for (const projectile of [...projectiles]) removeProjectile(projectile)
    },

    getQuizShotsFired: () => quizShotsFired,

    sweepLockOn,
    clearLockedEnemies() { lockedEnemies.clear() },
    getLockedEnemySnapshots: () => [...lockedEnemies]
      .filter((e) => !e.dying)
      .map((e) => ({ id: e.id, worldPos: e.mesh.position.clone() })),

    getLockOnTarget: () => (currentLockOn && !currentLockOn.dying ? currentLockOn : null),

    // continua existindo só pro debug "Tiro infinito" poder zerar o cooldown por fora do stat
    // real do jogador (ver comentário perto de fireCooldownDuration)
    setFireCooldown(seconds) { fireCooldownDuration = seconds },
    setEnemyAggressiveness(multiplier) { enemies.setEnemyAggressiveness(multiplier) },
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

      const { hitEvent, enemyKills, enemyKillPoints, bonusKillPoints, goldenSpecialHit, timeReductionMs, bossDefeated, bossOrbHit, hitsLog } = updateProjectiles(dt, aimDirection)
      updateQuizTargets(dt)
      updateBonusTargets(dt)
      updateBossOrbs(dt)

      let enemyHits = 0
      let ramKills = 0
      let ramKillPoints = 0
      let ramBossDefeated = false
      if (enemiesActive) {
        // golden (que só existe durante a fase 'goldenArena', já uma das fases
        // "enemiesActive") também atualiza aqui dentro, via enemies.update()
        const enemyResult = enemies.update(dt, playerPosition, { ramDamage: opts.ramDamage || 0 })
        enemyHits += enemyResult.hits
        ramKills = enemyResult.ramKills
        ramKillPoints = enemyResult.ramKillPoints
        ramBossDefeated = enemyResult.ramBossDefeated
        enemyHits += enemies.updateProjectiles(dt, playerPosition)
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
        bossOrbHit,
        hitsLog,
      }
    },

    dispose() {
      for (const p of [...projectiles]) removeProjectile(p)
      for (const t of [...quizTargets]) removeQuizTarget(t)
      for (const b of [...bonusTargets]) removeBonusTarget(b)
      for (const o of [...bossOrbs]) removeBossOrb(o)
      for (const w of [...wingmen]) scene.remove(w.mesh)
      wingmen.length = 0
      enemies.dispose()
      projectileGeometry.dispose()
      projectileMaterial.dispose()
      homingProjectileGeometry.dispose()
      homingProjectileMaterial.dispose()
      wingmanGeometry.dispose()
      wingmanMaterial.dispose()
      bonusGeometry.dispose()
      bonusMaterial.dispose()
      bossOrbGeometry.dispose()
      bossOrbMaterial.dispose()
      bossOrbRingGeometry.dispose()
      bossOrbRingMaterial.dispose()
      while (hitboxGroup.children.length) hitboxGroup.remove(hitboxGroup.children[0])
      scene.remove(hitboxGroup)
      hitboxGeometry.dispose()
      hitboxMaterial.dispose()
    },
  }
}
