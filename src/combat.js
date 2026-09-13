import * as THREE from 'three'
import { TIME_REDUCTION_MIN_MS, TIME_REDUCTION_MAX_MS } from './enemies/index.js'

// re-exportado pra não quebrar quem importava essas duas constantes daqui (combat.js era o
// dono antes da Fase 1 da refatoração enemies.js/player.js)
export { TIME_REDUCTION_MIN_MS, TIME_REDUCTION_MAX_MS }

const PROJECTILE_SPEED = 60
const PROJECTILE_MAX_RANGE = 260
const PROJECTILE_LATERAL_SPACING = 1.6
const PASS_BEHIND = -4
const WORLD_UP = new THREE.Vector3(0, 1, 0)
const FORWARD_AXIS = new THREE.Vector3(0, 0, 1)

// v0.29.4 (QoL): temporários de módulo pra distanceToSegment não alocar 3 Vector3 por chamada.
// A função é chamada por projétil × alvo × frame (centenas de vezes num pico de enxame), então
// cada .clone() era pressão de GC pura. Mesma fórmula, zero alocação.
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

const BOSS_TARGET_ELEVATION_MAX = THREE.MathUtils.degToRad(50)

// v0.29.6: +25% no tiro normal (não no teleguiado) — a colisão é feita contra o SEGMENTO
// percorrido no frame, então "aumentar a hitbox" aqui significa somar essa folga ao raio de
// acerto de cada tipo de alvo, só quando o projétil não é homing (o teleguiado já tem seu
// próprio cone bem maior e é uma mecânica de precisão à parte).
const PROJECTILE_HIT_BUFFER = 0.3

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
// pedido do usuário: variedade de tamanho no alvo bônus verde
const BONUS_SCALE_MIN = 0.7
const BONUS_SCALE_MAX = 1.6

// tiro carregado: enquanto segura o botão, varrer a mira sobre inimigos os marca (lock-on) —
// ao soltar, o teleguiado mira exatamente nos marcados em vez dos N mais próximos
const ENEMY_LOCK_ANGLE = THREE.MathUtils.degToRad(6)

// Fase 8 (VISUAL): ângulo de "tô mirando em algo" pra mira normal (crosshair muda de cor) —
// mais largo que o ENEMY_LOCK_ANGLE do teleguiado porque aqui é só um hint visual, não trava
// nada de verdade nem afeta o disparo.
const AIM_HINT_ANGLE = THREE.MathUtils.degToRad(7)

// distância máxima (unidades de mundo) para um alvo poder ser travado/auto-mirável pelo
// teleguiado (sweepLockOn e a seleção de alvos em fireHomingShot). Sem isso, dá pra
// "magnetizar" tiro em inimigo a centenas de unidades de distância. Ajuste pra cima (150+) se
// quiser voltar ao comportamento antigo, ou pra baixo (60) pra exigir aproximação.
const MAX_LOCK_RANGE = 90

// o teleguiado deve "parar de mirar em inimigos que estão extremamente próximos ou passaram
// pelo jogador" — usado em sweepLockOn (não deixa travar/mantém travado um inimigo mais perto
// que isso) e reaproveita PASS_BEHIND (já existente) pra saber se já ficou pra trás
const MIN_LOCK_RANGE = 10

export function createCombatSystem(scene, rail, effects, enemies, player) {
  const projectiles = []
  const bonusTargets = []
  const bossOrbs = []

  // +25% de tamanho visual (v0.29.6): 0.168/1.2 → 0.21/1.5
  const projectileGeometry = new THREE.ConeGeometry(0.21, 1.5, 5)
  projectileGeometry.rotateX(Math.PI / 2)
  const projectileMaterial = new THREE.MeshBasicMaterial({ color: 0x3ea6ff })

  const homingProjectileGeometry = new THREE.ConeGeometry(0.528, 3.36, 6)
  homingProjectileGeometry.rotateX(Math.PI / 2)
  const homingProjectileMaterial = new THREE.MeshBasicMaterial({ color: 0x2bff88 })

  const wingmanGeometry = new THREE.ConeGeometry(0.32, 1.1, 3)
  wingmanGeometry.rotateX(-Math.PI / 2)
  const wingmanMaterial = new THREE.MeshPhongMaterial({ color: 0x7fe0ff, flatShading: true })

  // pedido do usuário: "adicione mais variedades de tamanho... e um shading pra parecer mais um
  // asteroide" — geometria icosaédrica com os vértices deslocados aleatoriamente ao longo da
  // própria normal (uma vez só, forma "de pedra" compartilhada por todos os spawns), tamanho
  // varia por instância via mesh.scale no spawn (ver spawnBonusTarget). emissive bem mais fraco
  // que antes — menos "gema brilhando", mais rocha lida pela luz da cena (flatShading mantém as
  // facetas, que já ajudavam a ler como um poliedro irregular).
  const bonusGeometry = (() => {
    const geo = new THREE.IcosahedronGeometry(1.1, 1)
    const pos = geo.attributes.position
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i)
      const n = v.clone().normalize()
      v.addScaledVector(n, (Math.random() - 0.5) * 0.4)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    geo.computeVertexNormals()
    return geo
  })()
  const bonusMaterial = new THREE.MeshPhongMaterial({
    color: BONUS_COLOR,
    flatShading: true,
    emissive: 0x0a6622,
    emissiveIntensity: 0.25,
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
    for (const b of bonusTargets) if (!b.dying) markHitbox(b.mesh.position, BONUS_HIT_RADIUS * (b.scale ?? 1))
    for (const o of bossOrbs) if (!o.dying) markHitbox(o.mesh.position, BOSS_ORB_HIT_RADIUS)
    for (const item of enemies.getHitboxTargets()) markHitbox(item.worldPos, item.radius)
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

  // pedido do usuário: o tiro carregado passa a poder travar o chefe/dourado (antes só
  // inimigos comuns), e um alvo GRANDE (chefe/dourado) pode receber várias travas ao mesmo
  // tempo em vez de só 1 — cada trava vira um tiro teleguiado independente na hora de soltar.
  // Por isso `lockedEnemies` deixou de ser um Set (não dava pra repetir a mesma entidade) e
  // virou array de "lock records" ({ entity, offset, seq }) — offset é o ponto (relativo ao
  // centro do alvo) onde a mira estava no instante da trava, usado só pro marcador verde do
  // HUD aparecer espalhado pelo corpo do alvo em vez de empilhado no centro.
  let lockedEnemies = []
  let nextLockSeq = 1

  function isBigLockTarget(e) {
    return e.kind === 'boss' || e.kind === 'golden'
  }

  // maxAllowed (main.js): quantos alvos podem estar travados NESTE instante do carregamento —
  // 1 no início, +1 a cada HOMING_LOCK_INTERVAL_MS (pedido: travar um alvo novo por vez, não
  // todos de uma vez). Sem isso, qualquer inimigo que passasse pela mira durante a carga toda
  // ficava marcado, sem limite — o teto só valia na hora de disparar, não na marcação visual.
  function sweepLockOn(origin, direction, maxAllowed = Infinity) {
    const frame = rail.getFrameAt(0)
    // solta quem ficou extremamente perto ou já passou pra trás do jogador antes de disparar —
    // libera a vaga pra um alvo válido poder ser travado no lugar
    lockedEnemies = lockedEnemies.filter((rec) => {
      if (rec.entity.dying) return false
      const rel = rec.entity.mesh.position.clone().sub(origin)
      return rel.length() >= MIN_LOCK_RANGE && rel.dot(frame.forward) >= PASS_BEHIND
    })
    if (lockedEnemies.length >= maxAllowed) return
    const candidates = [...enemies.getAlive(), ...enemies.getGoldenAlive()]
    for (const e of candidates) {
      if (lockedEnemies.length >= maxAllowed) break
      // alvo comum já travado não trava de novo (não faz sentido gastar 2 tiros nele); alvo
      // grande pode acumular quantas travas o orçamento (maxAllowed) permitir
      if (!isBigLockTarget(e) && lockedEnemies.some((rec) => rec.entity === e)) continue
      const rel = e.mesh.position.clone().sub(origin)
      const dist = rel.length()
      if (dist > MAX_LOCK_RANGE || dist < MIN_LOCK_RANGE || rel.dot(frame.forward) < PASS_BEHIND) continue
      const toTarget = rel.clone().normalize()
      const angle = Math.acos(THREE.MathUtils.clamp(direction.dot(toTarget), -1, 1))
      if (angle >= ENEMY_LOCK_ANGLE) continue
      // ponto na direção da mira mais próximo do centro do alvo — os quadrados verdes aparecem
      // onde o jogador de fato mirou, não num ponto aleatório. offset = aimPoint - alvo.posição,
      // com aimPoint = origin + direction*t e t = projeção de rel (alvo - origin) na direção.
      const offset = direction.clone().multiplyScalar(rel.dot(direction)).sub(rel)
      lockedEnemies.push({ entity: e, offset, seq: nextLockSeq++ })
    }
  }

  // Fase 8 (VISUAL): hint pra mira normal (não teleguiado) — não trava nem marca nada, só
  // responde "tem um inimigo vivo bem na frente da mira agora?" pro HUD colorir o crosshair.
  function isAimingAtEnemy(origin, direction) {
    const frame = rail.getFrameAt(0)
    for (const e of enemies.getAlive()) {
      const rel = e.mesh.position.clone().sub(origin)
      const dist = rel.length()
      if (dist > MAX_LOCK_RANGE || dist < MIN_LOCK_RANGE || rel.dot(frame.forward) < PASS_BEHIND) continue
      const angle = Math.acos(THREE.MathUtils.clamp(direction.dot(rel.normalize()), -1, 1))
      if (angle < AIM_HINT_ANGLE) return true
    }
    return false
  }

  function removeProjectile(p) {
    scene.remove(p.mesh)
    projectiles.splice(projectiles.indexOf(p), 1)
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

  // QoL (v0.29.4): fireSingle agora carrega PLAYER_PROJECTILE_DAMAGE por padrão — antes, wingman
  // e "giro rebatedor" caíam no `damage ?? 1` de updateProjectiles e causavam METADE do dano do
  // tiro normal, apesar de usarem o mesmo projétil. Mesma fórmula, mesmo comportamento visual,
  // só o número do dano foi corrigido. Quem quiser um tiro fraco de propósito passa o 3º arg.
  function fireSingle(origin, direction, damage = PLAYER_PROJECTILE_DAMAGE) {
    const mesh = new THREE.Mesh(projectileGeometry, projectileMaterial)
    mesh.position.copy(origin)
    scene.add(mesh)
    projectiles.push({ mesh, velocity: direction.clone().multiplyScalar(PROJECTILE_SPEED), traveled: 0, damage })
  }

  function updateProjectiles(dt, aimDirection) {
    let enemyKills = 0
    let enemyKillPoints = 0
    let bonusKillPoints = 0
    let goldenSpecialHit = false
    let goldenSpecialHitIsHoming = false
    let goldenHitWorldPos = null
    let timeReductionMs = null
    let timeReductionWorldPos = null
    let bossDefeated = false
    let bossDefeatedIsHoming = false
    let bossHitWorldPos = null
    let bossOrbHit = false
    // log de acertos (posição, dano, se matou) — usado pelo main.js pra faíscas, flash no
    // mesh atingido e números de dano flutuantes no HUD
    const hitsLog = []

    for (const projectile of [...projectiles]) {
      // QoL (v0.29.4): checa .dying direto em vez de `enemies.getAlive().includes(...)` — aquela
      // versão fazia um filter() do array inteiro POR projétil teleguiado POR frame. O .dying
      // basta porque removeEnemy() em enemies.js agora marca .dying = true antes de tirar da
      // lista (ver mudança correspondente lá).
      if (projectile.homingTarget) {
        if (projectile.homingTarget.dying) {
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

      // QoL (v0.29.4): guard de array vazio — bossOrbs/bonusTargets estão vazios na maior parte
      // do tempo (combate normal, etc.); sem o guard, cada projétil rodava o .find (com callback
      // + distanceToSegment) em array vazio por nada.
      const hitBuffer = projectile.isHoming ? 0 : PROJECTILE_HIT_BUFFER
      const orbHit = bossOrbs.length
        ? bossOrbs.find((o) => !o.dying && distanceToSegment(o.mesh.position, prevPos, projectile.mesh.position) <= BOSS_ORB_HIT_RADIUS + hitBuffer)
        : null
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
        hitBuffer,
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
            if (hit.bossDefeated) {
              bossDefeated = true
              bossDefeatedIsHoming = !!projectile.isHoming
              bossHitWorldPos = hit.worldPos
            } else {
              enemyKills += 1
            }
          }
        } else if (hit.goldenSpecialHit) {
          goldenSpecialHit = true
          goldenSpecialHitIsHoming = !!projectile.isHoming
          goldenHitWorldPos = hit.worldPos
        }
        if (hit.enemyKillPoints) enemyKillPoints += hit.enemyKillPoints
        if (hit.timeReductionMs != null) { timeReductionMs = hit.timeReductionMs; timeReductionWorldPos = hit.worldPos }
        continue
      }

      const bonusHit = bonusTargets.length
        ? bonusTargets.find((b) => !b.dying && distanceToSegment(b.mesh.position, prevPos, projectile.mesh.position) <= BONUS_HIT_RADIUS * (b.scale ?? 1) + hitBuffer)
        : null
      if (bonusHit) {
        bonusHit.dying = true
        bonusHit.deathT = 0
        bonusKillPoints += BONUS_KILL_BONUS
        if (effects) effects.explosion(bonusHit.mesh.position, BONUS_COLOR, 0.9 * (bonusHit.scale ?? 1))
        removeProjectile(projectile)
        continue
      }

      if (projectile.traveled > PROJECTILE_MAX_RANGE) removeProjectile(projectile)
    }

    return {
      enemyKills, enemyKillPoints, bonusKillPoints,
      goldenSpecialHit, goldenSpecialHitIsHoming, goldenHitWorldPos,
      timeReductionMs, timeReductionWorldPos, bossDefeated, bossDefeatedIsHoming, bossHitWorldPos, bossOrbHit, hitsLog,
    }
  }

  function updateBonusTargets(dt) {
    const frame = rail.getFrameAt(0)
    for (const bonus of [...bonusTargets]) {
      if (bonus.dying) {
        bonus.deathT += dt / BONUS_DEATH_DURATION
        bonus.mesh.scale.setScalar(Math.max(0, 1 - bonus.deathT) * (bonus.scale ?? 1))
        if (bonus.deathT >= 1) removeBonusTarget(bonus)
        continue
      }
      // pedido do usuário: "shading pra parecer mais um asteroide" — giro lento e constante,
      // um "tumble" de rocha à deriva em vez de ficar parado no ar
      bonus.mesh.rotation.x += dt * (bonus.spinX ?? 0.3)
      bonus.mesh.rotation.y += dt * (bonus.spinY ?? 0.2)
      const relative = bonus.mesh.position.clone().sub(frame.position)
      if (relative.dot(frame.forward) < PASS_BEHIND) removeBonusTarget(bonus)
    }
  }

  return {
    tryFire(origin, direction) {
      if (cooldown > 0) return
      cooldown = fireCooldownDuration
      fire(origin, direction)
      for (const w of wingmen) fireSingle(w.mesh.position, direction)
    },

    // filtro de distância nos dois caminhos (locked e "N mais próximos")
    fireHomingShot(origin, maxTargets) {
      const inRange = (e) => origin.distanceTo(e.mesh.position) <= MAX_LOCK_RANGE

      // um alvo grande (chefe/dourado) pode aparecer em vários records — isso é o que faz
      // fireHomingShot mandar VÁRIOS teleguiados pra cima dele (1 por record), em vez de 1 só
      const lockedRecs = lockedEnemies.filter((rec) => !rec.entity.dying && inRange(rec.entity))
      let targets
      if (lockedRecs.length > 0) {
        targets = lockedRecs.slice(0, Math.max(0, maxTargets)).map((rec) => rec.entity)
      } else {
        const alive = enemies.getAlive().filter(inRange)
        alive.sort((a, b) => origin.distanceTo(a.mesh.position) - origin.distanceTo(b.mesh.position))
        targets = alive.slice(0, Math.max(0, maxTargets))
      }
      lockedEnemies = []
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
    spawnTimeEnemyMega: () => enemies.spawnTimeEnemyMega(),
    spawnTankEnemy: (hp) => enemies.spawnTankEnemy(hp),
    spawnBossEnemy: (hp) => enemies.spawnBossEnemy(hp),
    spawnGoldenSpecial: (opts) => enemies.spawnGoldenSpecial(opts),
    spawnDetrito: () => enemies.spawnDetrito(),
    spawnSentinela: () => enemies.spawnSentinela(),

    getEnemyCount: () => enemies.getEnemyCount(),
    getEnemySnapshots: () => enemies.getEnemySnapshots(),
    getBossSnapshot: () => enemies.getBossSnapshot(),

    // QoL (v0.29.4): os orbes-pergunta do chefe também aparecem no minimapa — antes, a fase
    // 'bossBuildup' mostrava inimigos comuns mas não mostrava o que o jogador precisa achar,
    // o que derrotava o propósito do minimapa em modo arena.
    getMinimapBlips: () => [
      ...enemies.getMinimapBlips(),
      ...bossOrbs.filter((o) => !o.dying).map((o) => ({ type: 'bossOrb', worldPos: o.mesh.position })),
    ],

    clearEnemies: () => enemies.clearEnemies(),
    clearGoldenTargets: () => enemies.clearGoldenTargets(),
    showArenaPreview: (kind) => enemies.showArenaPreview(kind),
    clearArenaPreview: () => enemies.clearArenaPreview(),
    clearOtherEnemies: () => enemies.clearOtherEnemies(),

    clearAllCombatants() {
      enemies.clearAll()
      for (const projectile of [...projectiles]) removeProjectile(projectile)
      // QoL (v0.29.4): sem isso, o Set de alvos travados sobrevivia a um clear — os marcadores
      // de lock no HUD ficavam pendurados por alguns frames até o próximo sweepLockOn limpar.
      lockedEnemies = []
    },

    spawnBonusTarget() {
      const position = randomSpawnPositionOnPath(BONUS_SPAWN_DISTANCE_MIN, BONUS_SPAWN_DISTANCE_MAX, BONUS_BOX_X, BONUS_BOX_Y)
      const mesh = new THREE.Mesh(bonusGeometry, bonusMaterial)
      mesh.position.copy(position)
      // pedido do usuário: variedade de tamanho — 0.7x a 1.6x, hitbox acompanha a escala real
      const scale = BONUS_SCALE_MIN + Math.random() * (BONUS_SCALE_MAX - BONUS_SCALE_MIN)
      mesh.scale.setScalar(scale)
      mesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2)
      scene.add(mesh)
      const spinX = (Math.random() * 2 - 1) * 0.4
      const spinY = (Math.random() * 2 - 1) * 0.4
      bonusTargets.push({ mesh, dying: false, deathT: 0, scale, spinX, spinY })
    },

    clearBonusTargets() {
      for (const bonus of [...bonusTargets]) {
        if (!bonus.dying) removeBonusTarget(bonus)
      }
    },

    // 6 orbes genéricos espalhados pela arena do chefe (Fase 5) — nenhum "é" uma pergunta
    // específica até ser atingido; main.js decide qual pergunta mostrar (nextQuestion) na hora.
    //
    // QoL (v0.29.4): origem é o CENTRO da arena (rail.getArenaCenter()), não rail.getFrameAt(0)
    // — em modo arena, getFrameAt(0) retorna a posição ATUAL do jogador, então os orbes nasciam
    // todos amontoados na frente dele se ele estivesse perto da borda na transição. O resultado
    // era metade da arena vazia e "ache e atire em todas" virando "atire nos 6 na sua frente".
    spawnBossOrbs(count, opts = {}) {
      const { distanceMin = 45, distanceMax = 95 } = opts
      const origin = rail.getArenaCenter()
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
        group.position.copy(origin.clone().add(offset))
        scene.add(group)
        bossOrbs.push({ mesh: group, dying: false, deathT: 0, phase: Math.random() * Math.PI * 2 })
      }
    },

    clearBossOrbs() {
      for (const orb of [...bossOrbs]) if (!orb.dying) removeBossOrb(orb)
    },

    sweepLockOn,
    isAimingAtEnemy,
    clearLockedEnemies() { lockedEnemies = [] },
    getLockedEnemySnapshots: () => lockedEnemies
      .filter((rec) => !rec.entity.dying)
      .map((rec) => ({ id: rec.seq, worldPos: rec.entity.mesh.position.clone().add(rec.offset) })),

    // continua existindo só pro debug "Tiro infinito" poder zerar o cooldown por fora do stat
    // real do jogador (ver comentário perto de fireCooldownDuration)
    setFireCooldown(seconds) { fireCooldownDuration = seconds },
    setEnemyAggressiveness(multiplier) { enemies.setEnemyAggressiveness(multiplier) },
    setEnemyProjectileSpeedBonus(bonus) { enemies.setEnemyProjectileSpeedBonus(bonus) },
    setShowHitboxes(v) { showHitboxes = v; refreshHitboxes() },

    update(dt, playerPosition, opts = {}) {
      const enemiesActive = opts.enemiesActive !== false
      const aimDirection = opts.aimDirection
      elapsed += dt
      cooldown = Math.max(0, cooldown - dt)

      const {
        enemyKills, enemyKillPoints, bonusKillPoints,
        goldenSpecialHit, goldenSpecialHitIsHoming, goldenHitWorldPos,
        timeReductionMs, timeReductionWorldPos, bossDefeated, bossDefeatedIsHoming, bossHitWorldPos, bossOrbHit, hitsLog,
      } = updateProjectiles(dt, aimDirection)
      updateBonusTargets(dt)
      updateBossOrbs(dt)

      let enemyHits = 0
      // dano-base de cada hit no jogador — a maioria fica em 1; alguns ataques específicos
      // (laser da ampulheta mega, borda da moldura da sentinela) declaram um valor maior no
      // próprio projétil/laser (ver enemies/index.js), e aqui vira o MAIOR valor do frame (não
      // soma — um frame com vários hits simultâneos ainda conta como 1 golpe, mesmo espírito de
      // "1 hit por frame" que já existia)
      let enemyDamage = 1
      let ramKills = 0
      let ramKillPoints = 0
      let ramBossDefeated = false
      let ramBossWorldPos = null
      if (enemiesActive) {
        // golden (que só existe durante a fase 'goldenArena', já uma das fases
        // "enemiesActive") também atualiza aqui dentro, via enemies.update()
        const enemyResult = enemies.update(dt, playerPosition, { ramDamage: opts.ramDamage || 0 })
        enemyHits += enemyResult.hits
        ramKills = enemyResult.ramKills
        ramKillPoints = enemyResult.ramKillPoints
        ramBossDefeated = enemyResult.ramBossDefeated
        ramBossWorldPos = enemyResult.ramBossWorldPos
        const projResult = enemies.updateProjectiles(dt, playerPosition)
        enemyHits += projResult.hits
        if (projResult.hits > 0) enemyDamage = Math.max(enemyDamage, projResult.damage)
      }

      updateWingmen()

      if (showHitboxes) refreshHitboxes()

      return {
        enemyKills: enemyKills + ramKills,
        enemyKillPoints: enemyKillPoints + ramKillPoints,
        bonusKillPoints,
        enemyHits,
        enemyDamage,
        goldenSpecialHit,
        goldenSpecialHitIsHoming,
        goldenHitWorldPos,
        timeReductionMs,
        timeReductionWorldPos,
        bossDefeated: bossDefeated || ramBossDefeated,
        bossDefeatedIsHoming,
        bossHitWorldPos: bossHitWorldPos || ramBossWorldPos || null,
        bossOrbHit,
        hitsLog,
      }
    },

    dispose() {
      for (const p of [...projectiles]) removeProjectile(p)
      for (const b of [...bonusTargets]) removeBonusTarget(b)
      for (const o of [...bossOrbs]) removeBossOrb(o)
      for (const w of [...wingmen]) scene.remove(w.mesh)
      wingmen.length = 0
      // QoL (v0.29.4): idem clearAllCombatants — não deixa Set de lock órfão vazar entre sessões
      lockedEnemies = []
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
