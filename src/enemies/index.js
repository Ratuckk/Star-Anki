import * as THREE from 'three'
import {
  PASS_BEHIND, FORWARD_AXIS, distanceToSegment, HOMING_EXPLOSION_COLOR,
  ENEMY_FIRE_RANGE, ENEMY_FIRE_MIN_DISTANCE, ENEMY_ARENA_FIRE_MAX_DISTANCE,
  POWER_LEVEL_BASIC,
} from './shared.js'
import { createEnemyTelemetry } from './enemy-telemetry.js'
import { aiValidator } from '../ai-validator.js'
import { ENEMY_SOUND_CUES, triggerSoundCue } from '../audio-cues.js'
import {
  BLASTER_KIND, BLASTER_HIT_RADIUS, BLASTER_DEATH_DURATION, BLASTER_KILL_BONUS,
  BLASTER_SPAWN_DISTANCE_MIN, BLASTER_SPAWN_DISTANCE_MAX, BLASTER_BOX_X, BLASTER_BOX_Y,
  BLASTER_PROFILES,
  spawnBlaster, blasterColor, disposeBlaster,
  triggerBlasterRecoil, breakBlasterWing,
} from './blaster.js'
import {
  MINI_SWARM_KIND, spawnMiniSwarm as spawnMiniSwarmGroup, spawnMiniSwarmFromHorda, updateMiniSwarm, miniSwarmHitRadius, disposeMiniSwarm,
} from './miniSwarm.js'
import { TANK_KIND, TANK_COLOR, TANK_HIT_RADIUS, TANK_DEATH_DURATION, TANK_DEFAULT_HP, spawnTankEnemy, tankStatsForLevel, disposeTank } from './tank.js'
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
  spawnDetrito, spawnTitanicDetrito, updateDetritoSpin, detritoHitRadius, disposeDetrito,
} from './detrito.js'
import {
  SENTINELA_KIND, SENTINELA_COLOR, SENTINELA_HIT_RADIUS, SENTINELA_DEATH_DURATION, SENTINELA_FIRE_INTERVAL,
  spawnSentinela, updateSentinelaMovement, sentinelaPassBehind, sentinelaFire, resolveGateHit,
  updateGateFlight, updateGateAnimation, sentinelaShouldDespawn, disposeSentinela,
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
import {
  HORDA_KIND, HORDA_COLOR, HORDA_HIT_RADIUS, HORDA_DEATH_DURATION, HORDA_KILL_BONUS, HORDA_PASS_BEHIND,
  HORDA_FIRE_INTERVAL_MS, HORDA_SHOTS_BEFORE_LEAVE,
  spawnHorda as spawnHordaEnemy, updateHordaMovement, updateHordaSpin, triggerHordaTurbulence, disposeHorda,
} from './horda.js'

export { TIME_REDUCTION_MIN_MS, TIME_REDUCTION_MAX_MS }

const ENEMY_FIRE_INTERVAL_MIN = 1500
const ENEMY_FIRE_INTERVAL_MAX = 3000
// Pedido do usuário: combate estilo Star Fox 64 — inimigos não atiram de 120u de distância (onde
// mal são visíveis na tela). Eles se aproximam até a faixa de 55u para abrir fogo, com aviso
// visual (telegraph) claro antes de cada disparo. (ENEMY_FIRE_RANGE/MIN_DISTANCE/ARENA_MAX agora
// moram em shared.js — reaproveitados pelo cálculo de inFireRange do Blaster/Tank já migrados.)
const ENEMY_PROJECTILE_SPEED = 24
const ENEMY_PROJECTILE_MAX_RANGE = 65
const ENEMY_PROJECTILE_HIT_RADIUS = 1.6
const ENEMY_AIM_ERROR_DEG = 5

// preview do chefe/dourado no aviso de 5s — pedido do usuário: "sempre faça o inimigo
// dourado/boss inicialmente surgir BEM distante mas visível na tela... antes de trocar para o
// all-range mode" — reto à frente no trilho, escala aumentada pra compensar a distância
const ARENA_PREVIEW_DISTANCE = 220
const ARENA_PREVIEW_SCALE = { boss: BOSS_HIT_RADIUS * 2 * 2.4, golden: 3.2 }

const GOLDEN_MINION_TURN_RATE = 1.8
const GOLDEN_MINION_SPEED = 12

// Temporários reutilizáveis de módulo para evitar GC spikes em per-frame loops
const _enemyRel = new THREE.Vector3()
const _epStep = new THREE.Vector3()
const _epToPlayer = new THREE.Vector3()
const _epVelNorm = new THREE.Vector3()
const _elStep = new THREE.Vector3()
const _elPrevPos = new THREE.Vector3()
const _egRel = new THREE.Vector3()

export function createEnemiesSystem(scene, rail, effects = null) {
  const enemies = []
  const enemyProjectiles = []
  const enemyLasers = []
  const enemyGates = []
  let nextEnemyId = 1
  let nextSquadronId = 1
  const activeSquadrons = new Map()
  let elapsed = 0
  let enemyAggression = 1
  // Fog tático (Overhaul 4, pilar 3) — atualizado 1x por frame em update() (só ele recebe
  // opts), lido por triggerHordaSplitIfNeeded (chamado de resolveProjectileHit/applyAreaDamage/
  // ram, fora do fluxo normal de update() com acesso a opts).
  let currentIsDenseFog = false
  let arenaPreviewMesh = null
  // "+1 na velocidade dos disparos dos inimigos por pergunta errada" — soma direto na
  // velocidade base do projétil comum (também usado pela rajada do chefe)
  let enemyProjectileSpeedBonus = 0
  let enemyAimErrorDeg = ENEMY_AIM_ERROR_DEG
  let bossDefeatedPending = false
  let bossDefeatedWorldPos = null
  // ============ NÍVEL DE DIFICULDADE (1-9) POR INIMIGO ============
  // Opção B do planejamento: em vez de plumbar wrongAnswerCount/session.score/isNoDeck até cada
  // um dos ~15 call sites de spawnX() (state/session não estão no escopo deste arquivo), quem
  // monta o jogo (mount-game.js, que TEM esse escopo) registra um provider uma vez no boot. Cada
  // spawnX() abaixo chama currentDifficultyLevel() internamente. Sem provider registrado (ex.:
  // debug/teste isolado), cai em nível 1 — mesmo comportamento de antes desta mudança.
  let difficultyLevelProvider = null
  function currentDifficultyLevel() {
    if (!difficultyLevelProvider) return 1
    const lvl = Math.round(difficultyLevelProvider())
    return Number.isFinite(lvl) ? Math.max(1, Math.min(9, lvl)) : 1
  }

  const golden = createGoldenSystem(scene, rail, effects, () => nextEnemyId++)
  const telemetry = createEnemyTelemetry()

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
    telemetry.recordEvent(e.id, e.kind, 'despawn', `Inimigo ${e.kind} #${e.id} removido da cena`, { reason: e.deathT >= 1 ? 'destruído' : 'despawn' })
    if (e.squadronId && activeSquadrons.has(e.squadronId)) {
      const sq = activeSquadrons.get(e.squadronId)
      sq.remaining--
      if (sq.remaining <= 0) {
        activeSquadrons.delete(e.squadronId)
      }
    }
    if (e.kind === VERME_KIND) severChainAt(e, enemies, rail)
    if (e.kind === SUSSURRO_KIND && e.mesh && e.mesh.material) {
      e.mesh.material.dispose()
    }
    // Fog tático (Overhaul 4, pilar 3) — filhote de Horda morto ANTES do fade-in terminar ainda
    // está com o material clonado ativo (ver updateMiniSwarm) — libera aqui pra não vazar.
    if (e.fadeInMaterial) {
      e.fadeInMaterial.dispose()
      e.fadeInMaterial = null
    }
    if (e.mesh) scene.remove(e.mesh)
    const idx = enemies.indexOf(e)
    if (idx !== -1) enemies.splice(idx, 1)
  }

  // ============ DESPAWN COM FADE-OUT (Ideia 8) ============
  // Despawn NATURAL (saiu de vista, ficou tempo demais em cena, desengajando longe demais) não
  // some de golpe — encolhe suavemente por DESPAWN_FADE_DURATION_S antes do removeEnemy de
  // verdade. NÃO se aplica a: morte por HP<=0 (já tem sua própria animação via `dying`/
  // explosão), nem a limpezas totais (clearAllCombatants/clearEnemies — desmonte precisa ser
  // instantâneo ali). Só os 2 pontos de culling genérico do trilho/arena em updateEnemies usam
  // isso por ora — railDespawnCheck do Blaster/Tank (auto-contidos via enemy.fsm) e o timeout de
  // mergulho do mini-swarm ficam de fora nesta entrega (fora do orquestrador central).
  const DESPAWN_FADE_DURATION_S = 0.4

  function beginFadeOut(enemy) {
    if (enemy.fadingOut || enemy.dying) return
    enemy.fadingOut = true
    enemy.fadeTimer = 0
    enemy.fadeTargetScale = enemy.mesh?.scale?.x || enemy.targetScale || 1.0
    enemy.disengaging = true
    enemy.fireTimer = Infinity
    enemy.ramHitActive = true // impede toque/aríete durante o fade
  }

  function processFadeOuts(dt) {
    for (const enemy of [...enemies]) {
      if (!enemy.fadingOut) continue
      enemy.fadeTimer += dt
      const t = Math.min(1, enemy.fadeTimer / DESPAWN_FADE_DURATION_S)
      if (enemy.mesh) enemy.mesh.scale.setScalar(enemy.fadeTargetScale * (1 - t))
      if (t >= 1) removeEnemy(enemy)
    }
  }

  function removeEnemyProjectile(p) {
    if (p.mesh) scene.remove(p.mesh)
    const idx = enemyProjectiles.indexOf(p)
    if (idx !== -1) enemyProjectiles.splice(idx, 1)
  }

  function removeEnemyLaser(l) {
    if (l.mesh) scene.remove(l.mesh)
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
    const idx = enemyLasers.indexOf(l)
    if (idx !== -1) enemyLasers.splice(idx, 1)
  }

  function removeEnemyGate(g) {
    if (g.mesh) scene.remove(g.mesh)
    const idx = enemyGates.indexOf(g)
    if (idx !== -1) enemyGates.splice(idx, 1)
  }

  function randomEnemyFireInterval() {
    const ms = ENEMY_FIRE_INTERVAL_MIN + Math.random() * (ENEMY_FIRE_INTERVAL_MAX - ENEMY_FIRE_INTERVAL_MIN)
    return ms / enemyAggression / 1000
  }

  // ============ dispatch por kind (cada classe expõe seu pedaço, ver arquivo próprio) ============
  function hitRadiusFor(enemy) {
    switch (enemy.kind) {
      case BLASTER_KIND: return BLASTER_HIT_RADIUS
      case BOSS_KIND: return BOSS_HIT_RADIUS
      case TIME_KIND: return TIME_HIT_RADIUS
      case MINI_SWARM_KIND: return miniSwarmHitRadius(enemy)
      case TANK_KIND: return TANK_HIT_RADIUS
      case DETRITO_KIND: return detritoHitRadius(enemy)
      case SENTINELA_KIND: return SENTINELA_HIT_RADIUS
      case REPLICA_KIND: return REPLICA_HIT_RADIUS
      case FRAGATA_KIND: return FRAGATA_HIT_RADIUS
      case VERME_KIND: return VERME_HIT_RADIUS
      case IMA_KIND: return IMA_HIT_RADIUS
      case SUSSURRO_KIND: return SUSSURRO_HIT_RADIUS
      case HORDA_KIND: return HORDA_HIT_RADIUS
      default: return BLASTER_HIT_RADIUS
    }
  }

  function deathDurationFor(enemy) {
    switch (enemy.kind) {
      case BLASTER_KIND: return BLASTER_DEATH_DURATION
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
      case HORDA_KIND: return HORDA_DEATH_DURATION
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
      case HORDA_KIND: return HORDA_COLOR
      default: return 0xff5a3d
    }
  }

  function killPointsFor(kind) {
    if (kind === BLASTER_KIND || kind === TANK_KIND) return BLASTER_KILL_BONUS
    if (kind === DETRITO_KIND) return DETRITO_KILL_BONUS
    if (kind === REPLICA_KIND) return REPLICA_KILL_BONUS
    if (kind === FRAGATA_KIND) return FRAGATA_KILL_BONUS
    if (kind === VERME_KIND) return VERME_KILL_BONUS
    if (kind === IMA_KIND) return IMA_KILL_BONUS
    if (kind === SUSSURRO_KIND) return SUSSURRO_KILL_BONUS
    if (kind === HORDA_KIND) return HORDA_KILL_BONUS
    return BLASTER_KILL_BONUS
  }

  // Blaster e Tank não chegam mais aqui (auto-contidos via enemy.fsm — ver o branch logo após o
  // do MiniSwarm em updateEnemies).
  function passBehindFor(enemy) {
    if (enemy.kind === TIME_KIND) return timePassBehind(enemy)
    if (enemy.kind === SENTINELA_KIND) return sentinelaPassBehind(enemy)
    if (enemy.kind === REPLICA_KIND) return replicaPassBehind()
    if (enemy.kind === HORDA_KIND) return HORDA_PASS_BEHIND
    return PASS_BEHIND
  }

  // Horda morreu (por qualquer via — tiro normal/carregado, splash, aríete): solta o grupo de
  // mini-swarms de verdade (spawnMiniSwarmFromHorda, ver miniSwarm.js) no ponto exato da morte.
  function triggerHordaSplitIfNeeded(enemy) {
    if (!enemy || enemy.kind !== HORDA_KIND) return
    const expectedCount = enemy.splitCount || 5
    const group = spawnMiniSwarmFromHorda(scene, rail, () => nextEnemyId++, enemy.mesh.position, expectedCount, currentIsDenseFog)
    aiValidator.expect(
      'Horda solta exatamente splitCount mini-swarms ao morrer, todos vivos e no ponto da morte',
      () => group.length === expectedCount && group.every((g) => g.hp === 1 && g.mesh.position.distanceTo(enemy.mesh.position) < 0.01),
      { expectedCount, actualCount: group.length, hordaId: enemy.id },
    )
    registerSpawnGroup(group)
  }

  function hordaFireInterval() {
    return (HORDA_FIRE_INTERVAL_MS / enemyAggression) / 1000
  }

  // ============ disparo genérico (blaster/tank/time-normal/rajada do chefe/dourado) ============
  const WORLD_UP_AXIS = new THREE.Vector3(0, 1, 0)
  function fireEnemyProjectile(enemy, playerPosition, extraAngleRad = 0) {
    const po = enemy?.projectileOpts
    const mesh = new THREE.Mesh(po?.geometry || enemyProjectileGeometry, po?.material || enemyProjectileMaterial)
    mesh.position.copy(enemy.mesh.position)

    const direction = playerPosition.clone().sub(enemy.mesh.position).normalize()

    if (extraAngleRad !== 0) {
      direction.applyAxisAngle(WORLD_UP_AXIS, extraAngleRad)
    }

    const aimErrorDeg = po?.perfectAim ? 0 : enemyAimErrorDeg
    const errAngle = THREE.MathUtils.degToRad((Math.random() * 2 - 1) * aimErrorDeg)
    const errAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
    direction.applyAxisAngle(errAxis, errAngle)
    mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, direction)

    scene.add(mesh)
    const speed = (po?.speed ?? ENEMY_PROJECTILE_SPEED) + enemyProjectileSpeedBonus
    enemyProjectiles.push({
      mesh, velocity: direction.multiplyScalar(speed), traveled: 0,
      hitRadius: po?.hitRadius,
      maxRange: po?.maxRange,
      shieldDamage: po?.damage,
      powerLevel: po?.powerLevel ?? POWER_LEVEL_BASIC,
    })
    triggerSoundCue(ENEMY_SOUND_CUES.blaster_fire, { enemyId: enemy?.id, kind: enemy?.kind, worldPos: enemy?.mesh?.position })

    if (enemy) {
      enemy.shotsFired = (enemy.shotsFired || 0) + 1
      // Inimigos genéricos puxam para cima e vão embora voando após atacarem N vezes (4 pro
      // Blaster/Tank, 6 pra Horda — pedido explícito do usuário)
      const disengageAtShots = enemy.kind === HORDA_KIND ? HORDA_SHOTS_BEFORE_LEAVE : 4
      if (enemy.shotsFired >= disengageAtShots && (enemy.kind === BLASTER_KIND || enemy.kind === TANK_KIND || enemy.kind === HORDA_KIND)) {
        enemy.disengaging = true
        enemy.fireTimer = Infinity
      }
    }

    if (enemy && enemy.kind === BLASTER_KIND) {
      triggerBlasterRecoil(enemy)
      if (effects && effects.enemyMuzzleFlare) {
        effects.enemyMuzzleFlare(enemy.mesh.position, colorFor(enemy))
      }
    }
  }

  const bossLaserCtx = { pushLaser: (l) => enemyLasers.push(l) }
  const timeLaserCtx = { pushLaser: (l) => enemyLasers.push(l) }
  const projectileCtx = { fireEnemyProjectile }
  const goldenUpdateCtx = { fireEnemyProjectile, pushProjectile: (p) => enemyProjectiles.push(p), pushLaser: (l) => enemyLasers.push(l) }

  // ============ IA principal ============
  // ramDamage > 0: carta roguelike "impulso aríete" ativa durante o impulso de propulsão —
  // colisão vira dano de verdade (inclusive no CHEFE) em vez do kamikaze padrão
  function updateEnemies(dt, playerPosition, ramDamage = 0, opts = {}) {
    const inArena = rail.isArena()
    const frame = rail.getFrameAt(0)
    // Fog como mecânica (Overhaul 4, pilar 3) — computado uma vez por frame em game-loop.js
    // (único lugar com acesso a environment.getFogDensity()) e repassado por opts. Sussurro/
    // Detrito/Horda-split reagem quando true.
    const isDenseFog = !!opts.isDenseFog
    processFadeOuts(dt)
    let hits = 0
    let ramKills = 0
    let ramKillPoints = 0
    let ramBossDefeated = false
    let ramBossWorldPos = null
    let bossCollisionWorldPos = null
    const shipPoints = (opts && opts.shipHitboxPoints) || (playerPosition ? [{ worldPos: playerPosition, radius: 0.5 }] : [])
    for (const enemy of [...enemies]) {
      const hitRadius = hitRadiusFor(enemy)
      const deathDuration = deathDurationFor(enemy)
      const baseScale = enemy.mesh.scale.x || 1
      // grace period de invencibilidade pós-spawn (hoje só os filhotes da Horda usam, ver
      // MINI_SWARM_SPAWN_INVINCIBLE_S em miniSwarm.js) — decai uma vez por frame aqui, checado
      // no toque simples/aríete abaixo e em resolveProjectileHit/applyAreaDamage mais adiante.
      if (enemy.spawnInvincibleTimer > 0) enemy.spawnInvincibleTimer = Math.max(0, enemy.spawnInvincibleTimer - dt)
      if (enemy.wobbleTimer > 0) enemy.wobbleTimer = Math.max(0, enemy.wobbleTimer - dt)
      if (enemy.dying) {
        enemy.deathT += dt / deathDuration
        const t = Math.max(0, 1 - enemy.deathT)
        enemy.mesh.scale.setScalar((enemy.deathScale ?? baseScale) * t)
        if (enemy.deathT >= 1) removeEnemy(enemy)
        continue
      }
      // Despawn com fade-out (Ideia 8) — animação de escala e remoção final ficam em
      // processFadeOuts (chamado 1x por frame, fora deste loop); aqui só pula o resto do
      // processamento normal (movimento/tiro/colisão), igual já é feito com `dying`.
      if (enemy.fadingOut) continue
      enemy.deathScale = baseScale

      const ramExtra = ramDamage > 0 ? 5.0 : 0
      const isColliding = !(enemy.spawnInvincibleTimer > 0)
        && shipPoints.some((pt) => pt.worldPos.distanceTo(enemy.mesh.position) <= hitRadius + pt.radius + ramExtra)
      if (isColliding) {
        hits += 1
        // Arremesso por colisão física (Chefe/Dourado/Detrito): registra o ponto de impacto UMA
        // VEZ por contato (thrownActive) pra que a nave seja arremessada pelo impulso — sem isso,
        // contato prolongado reenviaria o evento a cada frame e reiniciaria o tumble antes do
        // impulso fazer efeito (mesmo bug do teleporte, versão "tremelique no lugar"). O reset
        // acontece no else (não-colidindo), então encostar de novo depois conta como novo arremesso.
        if ((enemy.kind === BOSS_KIND || enemy.kind === DETRITO_KIND) && !enemy.thrownActive) {
          enemy.thrownActive = true
          bossCollisionWorldPos = enemy.mesh.position.clone()
        }
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
                bossDefeatedPending = true
                bossDefeatedWorldPos = enemy.mesh.position.clone()
                enemy.isShieldActive = false
                if (enemy.shieldMesh) enemy.shieldMesh.visible = false
                if (effects) explodeBoss(effects, enemy.mesh.position, false)
              } else {
                ramKills += 1
                ramKillPoints += killPointsFor(enemy.kind)
                if (enemy.kind === VERME_KIND) severChainAt(enemy, enemies, rail)
                triggerHordaSplitIfNeeded(enemy)
                if (effects) effects.explosion(enemy.mesh.position, colorFor(enemy), 1.6, { rings: true })
              }
            }
          }
          continue
        }
        enemy.ramHitActive = false
        // pedido do usuário: toque simples (sem carta aríete) só mata de verdade o Mini-Swarm —
        // todo outro inimigo (Chefe/Dourado já eram assim; agora Blaster/Tank/Detrito/etc. também)
        // é imune a toque simples, precisa de dano de aríete de verdade pra sofrer qualquer coisa.
        aiValidator.expect(
          'Toque simples (sem carta aríete) só remove o Mini-Swarm — todo outro inimigo é imune',
          () => enemy.kind === MINI_SWARM_KIND || !enemy.dying,
          { kind: enemy.kind, ramDamage },
        )
        if (enemy.kind === MINI_SWARM_KIND) {
          removeEnemy(enemy)
          continue
        }
      } else {
        enemy.ramHitActive = false
        enemy.thrownActive = false
      }

      // ============ SPAWN EM 3 FASES (peek/materialize/settle) ============
      if (enemy.spawnPhase) {
        enemy.spawnPhaseTimer += dt
        const phaseDuration = enemy.spawnDurations[enemy.spawnPhase] || 0.1
        const localT = Math.min(1, enemy.spawnPhaseTimer / phaseDuration)
        const targetScale = enemy.targetScale ?? 1.0

        if (enemy.spawnPhase === 'peek') {
          if (localT >= 1) {
            enemy.spawnPhase = 'materialize'
            enemy.spawnPhaseTimer = 0
            const mat = enemy.mesh.material
            if (mat && !Array.isArray(mat)) {
              const baseEmissive = mat.emissiveIntensity || 0
              if (baseEmissive > 0.5) {
                enemy.spawnOriginalEmissive = baseEmissive
                enemy.spawnAnimationChannel = 'emissive'
                mat.emissiveIntensity = 0
              } else {
                enemy.spawnAnimationChannel = 'opacity'
                enemy.spawnOpacityWasTransparent = !!mat.transparent
                mat.transparent = true
                mat.opacity = 0
              }
            }
            enemy.mesh.scale.setScalar(targetScale * 0.1)
            // Materialização começa AGORA (peek já cobriu a antecipação) — condensação inward
            // dispara na entrada da fase, não no spawn original.
            const hordaSplitDenseFog = enemy.spawnedInDenseFog
            if (effects && !hordaSplitDenseFog) {
              if (enemy.kind === MINI_SWARM_KIND && effects.flankSpawnTrail) {
                effects.flankSpawnTrail(enemy.mesh.position, null, colorFor(enemy))
              } else if (effects.fogCondensationInward) {
                effects.fogCondensationInward(enemy.mesh.position, colorFor(enemy), hitRadiusFor(enemy))
              }
            }
          }
        } else if (enemy.spawnPhase === 'materialize') {
          const eased = THREE.MathUtils.smoothstep(localT, 0, 1)
          const scale = THREE.MathUtils.lerp(targetScale * 0.1, targetScale * 1.05, eased)
          enemy.mesh.scale.setScalar(scale)
          const mat = enemy.mesh.material
          if (mat && !Array.isArray(mat)) {
            if (enemy.spawnAnimationChannel === 'emissive') {
              mat.emissiveIntensity = (enemy.spawnOriginalEmissive || 0) * eased
            } else if (enemy.spawnAnimationChannel === 'opacity') {
              mat.opacity = eased
            }
          }
          if (localT >= 1) {
            enemy.spawnPhase = 'settle'
            enemy.spawnPhaseTimer = 0
            enemy.settleFlashFired = false
          }
        } else if (enemy.spawnPhase === 'settle') {
          const settleEased = 1 - (1 - localT) * (1 - localT)
          const scale = THREE.MathUtils.lerp(targetScale * 1.05, targetScale, settleEased)
          enemy.mesh.scale.setScalar(scale)
          if (!enemy.settleFlashFired) {
            enemy.settleFlashFired = true
            if (effects && effects.hitSpark) effects.hitSpark(enemy.mesh.position, colorFor(enemy))
          }
          if (localT >= 1) {
            const mat = enemy.mesh.material
            if (mat && !Array.isArray(mat)) {
              if (enemy.spawnAnimationChannel === 'emissive') {
                mat.emissiveIntensity = enemy.spawnOriginalEmissive || 0
              } else if (enemy.spawnAnimationChannel === 'opacity') {
                mat.opacity = 1
                mat.transparent = enemy.spawnOpacityWasTransparent
              }
            }
            enemy.mesh.scale.setScalar(targetScale)
            enemy.spawnPhase = null
            enemy.spawnDurations = null
            enemy.spawnOriginalEmissive = null
            enemy.spawnAnimationChannel = null
            enemy.spawnOpacityWasTransparent = false
            enemy.settleFlashFired = false
            // Wobble pós-spawn (aplicado no último instante antes do render — ver applySpawnWobbles)
            enemy.wobbleTimer = SPAWN_WOBBLE_DURATION_S
            enemy.wobbleMagnitude = SPAWN_WOBBLE_MAGNITUDE
          }
        }
      }

      // fila de mini-inimigos: patrulha + mergulho (reto/zigue-zague/espiral) — nunca atira, se
      // remove sozinha (não usa o pass-behind genérico abaixo)
      if (enemy.kind === MINI_SWARM_KIND) {
        updateMiniSwarm(enemy, dt, { playerPosition, frame, elapsed, removeEnemy, isDenseFog })
        continue
      }

      // Blaster e Tank migraram pra FSM formal (ver enemies/state-machine.js e blaster.js/tank.js)
      // — cada um cuida do próprio movimento, telegraph/disparo e despawn, igual ao MiniSwarm acima.
      if (enemy.fsm) {
        enemy.fsm.update(dt, { dt, playerPosition, frame, inArena, effects, rail, scene, fireEnemyProjectile, randomEnemyFireInterval, removeEnemy })
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
        if (isDetrito) {
          updateDetritoSpin(enemy, dt, isDenseFog)
          if (enemy.driftVel) {
            enemy.mesh.position.addScaledVector(enemy.driftVel, dt)
          }
        } else updateImaSpin(enemy, dt)
        if (!inArena) {
          const relative = enemy.mesh.position.clone().sub(frame.position)
          const passedDistance = (enemy.spawnRailDist != null) && (rail.getDistance() - enemy.spawnRailDist > 180)
          if (relative.dot(frame.forward) < PASS_BEHIND || passedDistance) { removeEnemy(enemy); continue }
        }
      } else if (inArena) {
        // pedido do usuário: inimigos comuns muito lentos em arena — *0.5 limitava a metade da
        // velocidade do jogador, subido pra *0.7. Fragata mantém *0.5 de propósito (ela é uma
        // "parede móvel" que só precisa alcançar o standoff, não perseguir agressivamente).
        if (enemy.kind === FRAGATA_KIND) {
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
        if (enemy.kind === SENTINELA_KIND) {
          updateSentinelaMovement(enemy, dt, frame, rail)
          // BUG FIX: Sentinela em LEAVING voa pra FRENTE (mais rápido que o jogador), então o
          // pass-behind normal abaixo (que despawna quem ficou ATRÁS) nunca dispara nela — ela
          // ficava viva pra sempre, invisível pela névoa mas ainda no array de inimigos (ainda
          // podia ser travada pelo tiro teleguiado). Despawna por distância à frente.
          if (sentinelaShouldDespawn(enemy, frame)) { removeEnemy(enemy); continue }
        }
        else if (enemy.kind === REPLICA_KIND) updateReplicaMovement(enemy, dt, rail, frame)
        else if (enemy.kind === VERME_KIND) updateVermeMovement(enemy, dt, rail)
        else if (enemy.kind === HORDA_KIND) updateHordaMovement(enemy, dt, frame, rail, opts.boostActive)
        else if (enemy.kind === SUSSURRO_KIND) {
          updateSussurro(enemy, dt, rail, isDenseFog)
          if (sussurroShouldSummon(enemy)) {
            const count = 2 + Math.floor(Math.random() * 2)
            for (let i = 0; i < count; i += 1) {
              const reinforcement = spawnBlaster(scene, rail, nextEnemyId++)
              reinforcement.fireTimer = randomEnemyFireInterval()
              enemies.push(reinforcement)
            }
          }
        }
        const relative = _enemyRel.copy(enemy.mesh.position).sub(frame.position)
        const relativeForward = relative.dot(frame.forward)

        // Réplica/Verme e inimigos em fuga/desengajamento não olham pro jogador (sem teleguiar).
        // Star Fox 64: Inimigos que já ultrapassaram o jogador no trilho (relativeForward <= 0) não giram 180° para trás!
        if (enemy.kind !== REPLICA_KIND && enemy.kind !== VERME_KIND && !enemy.disengaging) {
          if (relativeForward > 0) {
            enemy.mesh.lookAt(playerPosition)
          }
        }
        if (enemy.kind === TIME_KIND) updateTimeSpin(enemy, dt)
        if (enemy.kind === HORDA_KIND && !enemy.disengaging) updateHordaSpin(enemy, dt)

        const passBehind = passBehindFor(enemy)
        // Horda é isenta do teto genérico de 180u percorridas: ela se engaja de propósito por bem
        // mais tempo que um Blaster (órbita segurando standoff + até 6 disparos a ~3s cada, ~18s+
        // de engajamento) — sem essa isenção, o próprio avanço do trilho a despawnava por "tempo
        // demais em cena" bem antes de completar o ciclo de tiros (bug real, pego em teste: sumia
        // com só 2-3 tiros disparados). O standoff/PASS_BEHIND/offScreenAbove dela já bastam como
        // rede de segurança.
        const passedDistance = enemy.kind !== HORDA_KIND
          && (enemy.spawnRailDist != null) && (rail.getDistance() - enemy.spawnRailDist > 180)
        const offScreenAbove = enemy.screenY != null && enemy.screenY > 11.0
        if (relativeForward < passBehind || passedDistance || offScreenAbove) { beginFadeOut(enemy); continue }
      }

      if (inArena && enemy.disengaging) {
        const distToPlayer = enemy.mesh.position.distanceTo(playerPosition)
        if (distToPlayer > 85) { beginFadeOut(enemy); continue }
      }

      const relativeForward = inArena ? 0 : _enemyRel.copy(enemy.mesh.position).sub(frame.position).dot(frame.forward)
      const distToPlayer = enemy.mesh.position.distanceTo(playerPosition)
      const inFireRange = distToPlayer > ENEMY_FIRE_MIN_DISTANCE && (
        inArena ? distToPlayer <= ENEMY_ARENA_FIRE_MAX_DISTANCE
          // Horda orbita bem além de ENEMY_FIRE_RANGE (55u) de propósito — "alcance o maior
          // possível", mesma isenção que o Chefe já tem.
          : enemy.kind === BOSS_KIND || enemy.kind === HORDA_KIND || (relativeForward > 0 && relativeForward < ENEMY_FIRE_RANGE)
      )

      // Estilo Star Fox 64: inimigos fora da zona visível de combate não queimam seu timer
      // até disparar no vácuo ou entrar atirando no susto. Segura em 0.45s até que se aproximem,
      // garantindo que sempre executem o telegraph visual (0.3s) antes do primeiro disparo.
      if (!inFireRange && enemy.kind !== BOSS_KIND && enemy.kind !== HORDA_KIND) {
        if (enemy.fireTimer < 0.45) enemy.fireTimer = 0.45
      }

      // telegraph colorido por classe + deslocado pra fora do mesh do chefe (senão nasce
      // invisível dentro do corpo dele)
      if (enemy.fireTimer > 0.3 && enemy.fireTimer - dt <= 0.3 && effects && inFireRange) {
        let tPos = enemy.mesh.position
        if (enemy.kind === BOSS_KIND) {
          const toPlayerDir = playerPosition.clone().sub(enemy.mesh.position)
          if (toPlayerDir.lengthSq() > 1e-4) tPos = enemy.mesh.position.clone().addScaledVector(toPlayerDir.normalize(), BOSS_HIT_RADIUS)
        }
        effects.telegraph(tPos, colorFor(enemy))
        triggerSoundCue(ENEMY_SOUND_CUES.blaster_telegraph, { enemyId: enemy.id, kind: enemy.kind, worldPos: tPos })
      }
      enemy.fireTimer -= dt
      if (enemy.fireTimer <= 0 && inFireRange) {
        let handled = false
        if (enemy.kind === BOSS_KIND) { fireBossVolley(enemy, playerPosition, projectileCtx); handled = true }
        else if (enemy.kind === TIME_KIND) handled = timeFire(scene, enemy, playerPosition, timeLaserCtx)
        else if (enemy.kind === SENTINELA_KIND) handled = sentinelaFire(scene, enemy, playerPosition, { pushGate: (g) => enemyGates.push(g) }, frame)
        if (!handled) fireEnemyProjectile(enemy, playerPosition)
        enemy.fireTimer = enemy.kind === BOSS_KIND
          ? randomBossFireInterval()
          : enemy.kind === SENTINELA_KIND ? SENTINELA_FIRE_INTERVAL
            : enemy.kind === HORDA_KIND ? hordaFireInterval() : randomEnemyFireInterval()
      }

      if (enemy.kind === BOSS_KIND) updateBossLaser(scene, enemy, dt, playerPosition, effects, bossLaserCtx)
    }
    return { hits, ramKills, ramKillPoints, ramBossDefeated, ramBossWorldPos, bossCollisionWorldPos }
  }

  function updateEnemyProjectiles(dt, playerPosition, opts = {}) {
    let hits = 0
    let damage = 1
    let powerLevel = POWER_LEVEL_BASIC
    for (const projectile of [...enemyProjectiles]) {
      if (projectile.homing) {
        _epToPlayer.copy(playerPosition).sub(projectile.mesh.position)
        const dist = _epToPlayer.length()
        _epVelNorm.copy(projectile.velocity).normalize()
        const dotHeading = _epToPlayer.clone().normalize().dot(_epVelNorm)

        // As mini-naves do Dourado avançam suavemente: ao chegar perto (< 14u),
        // cruzar pelo jogador (dotHeading < 0.2) ou voar por tempo suficiente,
        // param de teleguiar e vão embora em linha reta sem grudar no jogador!
        if (dist < 14 || dotHeading < 0.2 || (projectile.traveled || 0) > 55) {
          projectile.homing = false
        } else {
          _epToPlayer.normalize()
          _epVelNorm.lerp(_epToPlayer, Math.min(1, GOLDEN_MINION_TURN_RATE * dt))
          if (_epVelNorm.lengthSq() > 1e-6) {
            projectile.velocity.copy(_epVelNorm.normalize().multiplyScalar(GOLDEN_MINION_SPEED))
            projectile.mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, _epVelNorm)
            const rollBank = Math.sin((projectile.traveled || 0) * 0.25) * 0.4
            projectile.mesh.rotateZ(rollBank)
          }
        }
      }

      _epStep.copy(projectile.velocity).multiplyScalar(dt)
      projectile.mesh.position.add(_epStep)
      projectile.traveled += _epStep.length()

      const hitRadius = projectile.hitRadius ?? ENEMY_PROJECTILE_HIT_RADIUS
      const maxRange = projectile.maxRange ?? ENEMY_PROJECTILE_MAX_RANGE
      const shipPoints = (opts && opts.shipHitboxPoints) || (playerPosition ? [{ worldPos: playerPosition, radius: 0.45 }] : [])

      const projHit = shipPoints.some((pt) => pt.worldPos.distanceTo(projectile.mesh.position) <= hitRadius + pt.radius)
      if (projHit) {
        hits += 1
        damage = Math.max(damage, projectile.shieldDamage ?? 1)
        powerLevel = Math.max(powerLevel, projectile.powerLevel ?? POWER_LEVEL_BASIC)
        removeEnemyProjectile(projectile)
        continue
      }
      if (projectile.traveled > maxRange) removeEnemyProjectile(projectile)
    }
    return { hits, damage, powerLevel }
  }

  function updateEnemyLasers(dt, playerPosition, opts = {}) {
    let hits = 0
    let damage = 1
    let powerLevel = POWER_LEVEL_BASIC
    const shipPoints = (opts && opts.shipHitboxPoints) || (playerPosition ? [{ worldPos: playerPosition, radius: 0.45 }] : [])
    for (const laser of [...enemyLasers]) {
      _elStep.copy(laser.velocity).multiplyScalar(dt)
      _elPrevPos.copy(laser.mesh.position)
      laser.mesh.position.add(_elStep)
      laser.traveled += _elStep.length()

      // Taper visual: começa largo e afunila/encolhe suavemente conforme viaja
      const maxR = laser.maxRange ?? 220
      const prog = THREE.MathUtils.clamp(laser.traveled / maxR, 0, 1)
      const pulse = 1 + Math.sin(laser.traveled * 0.4) * 0.15
      const beamScale = Math.max(0.18, 1.3 - prog * 0.9) * pulse
      laser.mesh.scale.set(beamScale, beamScale, 1.0)
      if (laser.outerMat) laser.outerMat.opacity = Math.max(0.2, (1 - prog * 0.6) * 0.85)

      const hitRadius = (laser.hitRadius ?? BOSS_LASER_HIT_RADIUS) * Math.max(0.5, beamScale)
      const laserHit = shipPoints.some((pt) => distanceToSegment(pt.worldPos, _elPrevPos, laser.mesh.position) <= hitRadius + pt.radius)
      if (laserHit) {
        hits += 1
        damage = Math.max(damage, laser.shieldDamage ?? 1)
        powerLevel = Math.max(powerLevel, laser.powerLevel ?? POWER_LEVEL_BASIC)
        removeEnemyLaser(laser)
        continue
      }
      if (laser.traveled > maxR) removeEnemyLaser(laser)
    }
    return { hits, damage, powerLevel }
  }

  // ao cruzar o plano do jogador resolve o dano uma única vez, mas deixa a moldura continuar voando
  // e ultrapassar a nave/câmera por completo antes do despawn (não sumir na cara do jogador).
  function updateEnemyGates(dt, playerPosition, opts = {}) {
    let hits = 0
    let damage = 1
    let powerLevel = POWER_LEVEL_BASIC
    for (const gate of [...enemyGates]) {
      updateGateFlight(gate, dt, rail)
      updateGateAnimation(gate)

      const alongDir = _egRel.copy(playerPosition).sub(gate.mesh.position).dot(gate.dir)

      // Resolve colisão no instante da passagem pelo plano do jogador (uma única vez)
      if (alongDir <= 0 && !gate.hitResolved) {
        gate.hitResolved = true
        const { hit } = resolveGateHit(gate, playerPosition, opts)
        if (hit) {
          hits += 1
          damage = Math.max(damage, gate.shieldDamage ?? 1)
          powerLevel = Math.max(powerLevel, gate.powerLevel ?? POWER_LEVEL_BASIC)
        }
      }

      // Despawn apenas após ultrapassar com folga segura o jogador e a câmera
      if (alongDir <= -25 || gate.traveled >= gate.targetDistance + 45) {
        removeEnemyGate(gate)
      }
    }
    return { hits, damage, powerLevel }
  }

  // ============ OVERHAUL DE SPAWN EM 3 FASES (peek/materialize/settle) ============
  // Duração TOTAL por tipo — cada arquétipo "conta sua natureza pelo timing": enxame rápido e
  // nervoso, peso-pesado lento e denso. Chefe/Dourado ficam de FORA por ora (cutscene própria
  // já cobre a entrada deles; integrar as 3 fases exigiria coreografar em cima da cutscene, que
  // é uma mudança maior — próxima entrega, não esta).
  const SPAWN_DURATION_BY_KIND = {
    [MINI_SWARM_KIND]: 0.20,
    [IMA_KIND]: 0.20,
    [SUSSURRO_KIND]: 0.25,
    [BLASTER_KIND]: 0.35,
    [REPLICA_KIND]: 0.35,
    [TIME_KIND]: 0.35,
    [TANK_KIND]: 0.50,
    [DETRITO_KIND]: 0.50,
    [VERME_KIND]: 0.40,
    [SENTINELA_KIND]: 0.65,
    [FRAGATA_KIND]: 0.65,
    [HORDA_KIND]: 0.65,
  }
  const SPAWN_PEEK_MIN_HIT_RADIUS = 1.5
  // Wobble pós-spawn (Ideia 6) — vibração curta de POSIÇÃO aplicada só no último instante antes
  // do render (applySpawnWobbles, chamada por game-loop.js), nunca dentro do update() normal —
  // hit-test/lock-on/IA leem enemy.mesh.position o frame inteiro, então jitter aplicado cedo
  // demais "rebolaria" a hitbox de verdade. Amplitude pequena (0.15u) e simétrica ao redor da
  // posição real — desvio médio estatisticamente nulo, não precisa desfazer no frame seguinte.
  const SPAWN_WOBBLE_DURATION_S = 0.2
  const SPAWN_WOBBLE_MAGNITUDE = 0.15
  // Ideia 4 do documento (orientação de aproximação — mesh nasce com offset de rotação e
  // converge pra orientação correta) NÃO implementada nesta entrega: a maioria dos inimigos já
  // recalcula orientação a cada frame no próprio update de movimento (lookAt ou similar), que
  // roda DEPOIS do bloco de spawn no mesmo frame — um slerp aqui seria sobrescrito
  // imediatamente na maior parte dos casos, ou competiria com o lookAt de forma imprevisível
  // nos outros. Precisaria de auditoria caso a caso por tipo de inimigo — fora de escopo agora.
  // Mini-swarm/Ima nunca ganham peek mesmo tendo hitRadius acima do limiar — são enxame, o peek
  // "poluiria" a tela quando vários nascem juntos (tabela §2.2 do documento).
  const SPAWN_NO_PEEK_KINDS = new Set([MINI_SWARM_KIND, IMA_KIND])

  function getSpawnDurations(enemy) {
    const hitRadius = hitRadiusFor(enemy)
    const total = SPAWN_DURATION_BY_KIND[enemy.kind] ?? (hitRadius < 2 ? 0.30 : hitRadius < 4 ? 0.45 : 0.65)
    const hasPeek = hitRadius >= SPAWN_PEEK_MIN_HIT_RADIUS && !SPAWN_NO_PEEK_KINDS.has(enemy.kind)
    const peekRatio = hasPeek ? 0.2 : 0
    const materializeRatio = hasPeek ? 0.6 : 0.7
    const settleRatio = hasPeek ? 0.2 : 0.3
    return {
      peek: hasPeek ? total * peekRatio : 0,
      materialize: total * materializeRatio,
      settle: total * settleRatio,
    }
  }

  function registerSpawn(enemy) {
    if (!enemy) return null
    enemy.spawnRailDist = rail.getDistance()
    // Chefe fora do sistema de 3 fases de propósito (cutscene própria já cobre a entrada, ver
    // comentário em SPAWN_DURATION_BY_KIND acima) — mantém o pop-in instantâneo de sempre.
    if (enemy.mesh && enemy.kind !== BOSS_KIND) {
      enemy.targetScale = enemy.scale || enemy.mesh.scale.x || 1.0
      const durations = getSpawnDurations(enemy)
      enemy.spawnDurations = durations
      const hasPeek = durations.peek > 0
      enemy.spawnPhase = hasPeek ? 'peek' : 'materialize'
      enemy.spawnPhaseTimer = 0
      enemy.settleFlashFired = false
      // Fase peek: mesh ainda não "existe" de verdade — escala zero, só o anel de antecipação
      // marca o ponto. Sem peek (inimigo pequeno demais), pula direto pra materialize com a
      // escala mínima de sempre.
      enemy.mesh.scale.setScalar(hasPeek ? 0 : enemy.targetScale * 0.1)
      const hordaSplitDenseFog = enemy.spawnedInDenseFog // ver miniSwarm.js — Horda-split em fog denso
      if (hasPeek && effects?.spawnAnticipation && !hordaSplitDenseFog) {
        effects.spawnAnticipation(enemy.mesh.position, colorFor(enemy), hitRadiusFor(enemy) * 0.6, durations.peek)
      }
      // Fog tático (Overhaul 4, pilar 3) — filhote de Horda nascido em fog denso pula toda
      // condensação visual (nasce "literalmente invisível", ver spawnedInDenseFog/fadeInMaterial
      // em miniSwarm.js) — a única leitura de que ele existe é o fade-in de opacidade + o som.
      // Materialização dispara já aqui quando NÃO há peek (senão dispara ao entrar na fase).
      if (effects && !hordaSplitDenseFog && !hasPeek) {
        if (enemy.kind === MINI_SWARM_KIND && effects.flankSpawnTrail) {
          effects.flankSpawnTrail(enemy.mesh.position, null, colorFor(enemy))
        } else if (effects.fogCondensationInward) {
          effects.fogCondensationInward(enemy.mesh.position, colorFor(enemy), hitRadiusFor(enemy))
        }
      }
    }
    enemies.push(enemy)
    telemetry.recordEvent(enemy.id, enemy.kind, 'spawn', `Inimigo ${enemy.kind} #${enemy.id} surgiu em cena`, {
      pos: { x: enemy.mesh?.position?.x || 0, y: enemy.mesh?.position?.y || 0, z: enemy.mesh?.position?.z || 0 },
      hp: enemy.hp,
    })
    return enemy
  }

  function registerSpawnGroup(group) {
    if (!group) return
    for (const e of group) registerSpawn(e)
  }

  return {
    spawnEnemy() {
      const enemy = spawnBlaster(scene, rail, nextEnemyId++, { level: currentDifficultyLevel() })
      enemy.fireTimer = randomEnemyFireInterval()
      registerSpawn(enemy)
    },

    spawnSquadron(formationType = null) {
      const sId = nextSquadronId++
      const types = ['vFormation', 'sweepLine', 'trailColumn', 'pincer']
      const formation = formationType || types[Math.floor(Math.random() * types.length)]
      const archetype = BLASTER_PROFILES[Math.floor(Math.random() * BLASTER_PROFILES.length)].id
      const baseDepth = 55 + Math.random() * 15
      const level = currentDifficultyLevel()
      const group = []

      if (formation === 'vFormation') {
        const leader = spawnBlaster(scene, rail, nextEnemyId++, {
          profile: archetype, depth: baseDepth, screenX: 0, screenY: 1.5,
          isLeader: true, squadronId: sId, level,
        })
        leader.fireTimer = randomEnemyFireInterval()
        group.push(leader)
        const offsets = [
          { x: -2.0, y: 0.8, d: 8 },
          { x: 2.0, y: 0.8, d: 8 },
          { x: -3.8, y: 0.2, d: 16 },
          { x: 3.8, y: 0.2, d: 16 },
        ]
        for (const off of offsets) {
          const wingman = spawnBlaster(scene, rail, nextEnemyId++, {
            profile: archetype, depth: baseDepth + off.d, screenX: off.x, screenY: off.y,
            isLeader: false, squadronId: sId, level,
          })
          wingman.fireTimer = randomEnemyFireInterval()
          group.push(wingman)
        }
      } else if (formation === 'sweepLine') {
        const xs = [-3.6, -1.2, 1.2, 3.6]
        for (let i = 0; i < xs.length; i++) {
          const ship = spawnBlaster(scene, rail, nextEnemyId++, {
            profile: archetype, depth: baseDepth + i * 2, screenX: xs[i], screenY: 1.2,
            isLeader: i === 1, squadronId: sId, level,
          })
          ship.fireTimer = randomEnemyFireInterval()
          group.push(ship)
        }
      } else if (formation === 'trailColumn') {
        const depths = [baseDepth, baseDepth + 10, baseDepth + 20]
        for (let i = 0; i < depths.length; i++) {
          const ship = spawnBlaster(scene, rail, nextEnemyId++, {
            profile: archetype, depth: depths[i], screenX: (i % 2 === 0 ? -1.2 : 1.2), screenY: 1.2 - i * 0.4,
            isLeader: i === 0, squadronId: sId, level,
          })
          ship.fireTimer = randomEnemyFireInterval()
          group.push(ship)
        }
      } else {
        const pincerOffsets = [
          { x: -3.8, y: 1.6, d: 0 },
          { x: -2.4, y: 0.4, d: 8 },
          { x: 3.8, y: 1.6, d: 0 },
          { x: 2.4, y: 0.4, d: 8 },
        ]
        for (let i = 0; i < pincerOffsets.length; i++) {
          const off = pincerOffsets[i]
          const ship = spawnBlaster(scene, rail, nextEnemyId++, {
            profile: archetype, depth: baseDepth + off.d, screenX: off.x, screenY: off.y,
            isLeader: i === 0, squadronId: sId, level,
          })
          ship.fireTimer = randomEnemyFireInterval()
          group.push(ship)
        }
      }

      const leaderShip = group.find((s) => s.isLeader)
      activeSquadrons.set(sId, {
        total: group.length,
        remaining: group.length,
        leaderId: leaderShip ? leaderShip.id : null,
        archetype,
        wiped: false,
        startTime: elapsed,
      })

      registerSpawnGroup(group)
      return group
    },

    spawnMiniSwarm() {
      const group = spawnMiniSwarmGroup(scene, rail, () => nextEnemyId++)
      registerSpawnGroup(group)
    },

    spawnTimeEnemy() {
      const enemy = spawnTimeEnemy(scene, rail, nextEnemyId++, currentDifficultyLevel())
      enemy.fireTimer = randomEnemyFireInterval()
      registerSpawn(enemy)
    },

    spawnTimeEnemyMega() {
      const enemy = spawnTimeEnemyMega(scene, rail, nextEnemyId++, currentDifficultyLevel())
      enemy.fireTimer = randomEnemyFireInterval()
      registerSpawn(enemy)
    },

    spawnTankEnemy(hp = null) {
      const resolvedHp = hp ?? tankStatsForLevel(currentDifficultyLevel()).hp
      const enemy = spawnTankEnemy(scene, rail, nextEnemyId++, resolvedHp)
      enemy.fireTimer = randomEnemyFireInterval()
      registerSpawn(enemy)
    },

    spawnTitanicDetrito(opts = {}) {
      const activeGiants = enemies.filter((e) => e.kind === DETRITO_KIND && e.isGiant && !e.dying).length
      const withLevel = { level: currentDifficultyLevel(), ...opts }
      if (activeGiants >= 2) {
        // Teto de 2 gigantes ativos respeitado: gera detrito comum menor no lugar
        const regular = spawnDetrito(scene, rail, nextEnemyId++, { ...withLevel, allowGiant: false })
        registerSpawn(regular)
        return regular
      }
      const enemy = spawnTitanicDetrito(scene, rail, nextEnemyId++, withLevel)
      registerSpawn(enemy)
      return enemy
    },

    spawnDetrito(count = 1, opts = {}) {
      const activeGiants = enemies.filter((e) => e.kind === DETRITO_KIND && e.isGiant && !e.dying).length
      let giantsAllowed = Math.max(0, 2 - activeGiants)
      const n = Math.max(1, Math.min(15, count))
      const level = currentDifficultyLevel()
      const spawned = []
      for (let i = 0; i < n; i++) {
        const canBeGiant = giantsAllowed > 0 && opts.allowGiant !== false
        const enemy = spawnDetrito(scene, rail, nextEnemyId++, { level, ...opts, allowGiant: canBeGiant })
        if (enemy.isGiant) {
          giantsAllowed--
        }
        registerSpawn(enemy)
        spawned.push(enemy)
      }
      return spawned
    },

    spawnSentinela() {
      const enemy = spawnSentinela(scene, rail, nextEnemyId++, currentDifficultyLevel())
      registerSpawn(enemy)
    },

    spawnReplica() {
      const enemy = spawnReplica(scene, rail, nextEnemyId++, currentDifficultyLevel())
      registerSpawn(enemy)
    },

    spawnFragata() {
      const enemy = spawnFragata(scene, rail, nextEnemyId++, currentDifficultyLevel())
      registerSpawn(enemy)
    },

    spawnVerme() {
      const segments = spawnVerme(scene, rail, () => nextEnemyId++, currentDifficultyLevel())
      registerSpawnGroup(segments)
    },

    spawnImaSwarm() {
      const group = spawnImaSwarm(scene, rail, () => nextEnemyId++, currentDifficultyLevel())
      registerSpawnGroup(group)
    },

    spawnSussurro() {
      const enemy = spawnSussurro(scene, rail, nextEnemyId++, currentDifficultyLevel())
      registerSpawn(enemy)
    },

    setDifficultyLevelProvider(fn) {
      difficultyLevelProvider = fn
    },

    spawnHorda() {
      const level = currentDifficultyLevel()
      const enemy = spawnHordaEnemy(scene, rail, nextEnemyId++, level)
      if (!enemy) return
      enemy.fireTimer = hordaFireInterval()
      aiValidator.expect(
        'Horda nasce com HP/dano/splitCount escalados corretamente pro nível de dificuldade recebido',
        () => enemy.hp > 0 && enemy.hp === enemy.maxHp && enemy.projectileOpts.damage >= 5 && enemy.splitCount >= 5 && level >= 1 && level <= 9,
        { level, hp: enemy.hp, damage: enemy.projectileOpts.damage, splitCount: enemy.splitCount },
      )
      registerSpawn(enemy)
    },

    // Fase de ideias de inimigos: fonte do campo magnético do Enxame-Ímã, consumida direto por
    // combat/projectiles.js (só o tiro NORMAL reage — o teleguiado ignora, ver comentário lá)
    getMagnetSources: () => {
      const sources = []
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i]
        if (e.kind === IMA_KIND && !e.dying && e.mesh) {
          sources.push({ position: e.mesh.position, radius: IMA_FIELD_RADIUS, strength: IMA_FIELD_STRENGTH })
        }
      }
      return sources
    },

    spawnBossEnemy(hp, level = 1) {
      const boss = spawnBossEnemy(scene, rail, nextEnemyId++, hp, level)
      enemies.push(boss)
      telemetry.recordEvent(boss.id, boss.kind, 'spawn', `CHEFE entrou em combate com ${boss.hp} HP!`, { hp: boss.hp, maxHp: boss.maxHp })
    },

    spawnGoldenSpecial(opts = {}) {
      golden.spawn(opts)
    },

    showArenaPreview,
    clearArenaPreview,

    // Wobble pós-spawn (Ideia 6) — chamada por game-loop.js NO ÚLTIMO INSTANTE antes do
    // renderer.render(), nunca dentro de update() normal. Ver comentário em SPAWN_WOBBLE_*.
    applySpawnWobbles() {
      for (const e of enemies) {
        if (e.wobbleTimer > 0 && e.mesh) {
          const mag = e.wobbleMagnitude * (e.wobbleTimer / SPAWN_WOBBLE_DURATION_S)
          e.mesh.position.x += (Math.random() * 2 - 1) * mag
          e.mesh.position.y += (Math.random() * 2 - 1) * mag
          e.mesh.position.z += (Math.random() * 2 - 1) * mag
        }
      }
    },

    update(dt, playerPosition, opts = {}) {
      elapsed += dt
      currentIsDenseFog = !!opts.isDenseFog
      if (arenaPreviewMesh) arenaPreviewMesh.rotation.y += dt * 0.4
      const ramDamage = opts.ramDamage || 0
      const goldenRamResult = golden.update(dt, playerPosition, goldenUpdateCtx, ramDamage, opts)
      const result = updateEnemies(dt, playerPosition, ramDamage, opts)
      const bossCollisionWorldPos = result.bossCollisionWorldPos || goldenRamResult?.bossCollisionWorldPos || null

      telemetry.update({
        enemies,
        enemyProjectiles,
        enemyLasers,
        enemyGates,
        golden,
        playerPos: playerPosition,
        frame: rail.getFrameAt(0),
        elapsed,
      })

      return {
        ...result,
        hits: result.hits + (goldenRamResult?.goldenHits || 0),
        ramGoldenDefeated: goldenRamResult?.ramGoldenDefeated || false,
        ramGoldenWorldPos: goldenRamResult?.ramGoldenWorldPos || null,
        bossCollisionWorldPos,
      }
    },

    updateProjectiles(dt, playerPosition, opts = {}) {
      const p = updateEnemyProjectiles(dt, playerPosition, opts)
      const l = updateEnemyLasers(dt, playerPosition, opts)
      const g = updateEnemyGates(dt, playerPosition, opts)
      return {
        hits: p.hits + l.hits + g.hits,
        damage: Math.max(p.damage, l.damage, g.damage),
        powerLevel: Math.max(p.powerLevel, l.powerLevel, g.powerLevel),
      }
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
        if (e.fadingOut) continue
        if (e.spawnInvincibleTimer > 0) continue
        if (e.mesh.position.distanceTo(center) > radius) continue
        if (e.kind === BOSS_KIND && e.isShieldActive) continue
        e.hp -= damage
        const killed = e.hp <= 0
        const points = (killed && e.kind !== BOSS_KIND) ? killPointsFor(e.kind) : 0
        hitsLog.push({ worldPos: e.mesh.position.clone(), damage, killed, isHoming: true, meshRef: e.mesh, points })
        if (killed) {
          e.dying = true
          e.deathT = 0
          if (e.kind === BOSS_KIND) {
            bossDefeated = true
            bossDefeatedPending = true
            bossDefeatedWorldPos = e.mesh.position.clone()
            e.isShieldActive = false
            if (e.shieldMesh) e.shieldMesh.visible = false
            if (effects) explodeBoss(effects, e.mesh.position, false)
          } else {
            enemyKillPoints += points
            if (e.kind === VERME_KIND) severChainAt(e, enemies, rail)
            triggerHordaSplitIfNeeded(e)
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

      const enemyHit = enemies.find((e) => !e.dying && !e.fadingOut && !(e.spawnInvincibleTimer > 0) && distanceToSegment(e.mesh.position, prevPos, currPos) <= hitRadiusFor(e) + hitBuffer)
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
        telemetry.recordEvent(enemyHit.id, enemyHit.kind, 'damage', `Recebeu ${damage} de dano (HP restante: ${Math.max(0, enemyHit.hp)})`, { damage, hp: enemyHit.hp })
        if (isHoming && effects) effects.explosion(enemyHit.mesh.position, HOMING_EXPLOSION_COLOR, 0.5)
        if (enemyHit.kind === BOSS_KIND && effects) {
          effects.bossImpactRing(enemyHit.mesh.position, 1)
          effects.bloomSprite(enemyHit.mesh.position, 0xff7d3a, 1.5)
        }
        const killed = enemyHit.hp <= 0
        let enemyKillPoints = 0
        let timeReductionMs = null
        let bossDefeated = false
        let squadWipe = false
        let squadWipeBonus = 0

        if (killed) {
          enemyHit.dying = true
          enemyHit.deathT = 0
          telemetry.recordEvent(enemyHit.id, enemyHit.kind, 'death', `Inimigo ${enemyHit.kind} #${enemyHit.id} abatido!`, { hp: 0 })
          if (enemyHit.kind === BOSS_KIND) {
            bossDefeated = true
            bossDefeatedPending = true
            bossDefeatedWorldPos = enemyHit.mesh.position.clone()
            enemyHit.isShieldActive = false
            if (enemyHit.shieldMesh) enemyHit.shieldMesh.visible = false
            if (effects) explodeBoss(effects, enemyHit.mesh.position, isHoming)
          } else {
            enemyKillPoints = killPointsFor(enemyHit.kind)
            if (enemyHit.kind === TIME_KIND) {
              timeReductionMs = TIME_REDUCTION_MIN_MS + Math.random() * (TIME_REDUCTION_MAX_MS - TIME_REDUCTION_MIN_MS)
              triggerSoundCue(ENEMY_SOUND_CUES.time_enemy_rewind_snap, { worldPos: enemyHit.mesh.position.clone(), timeReductionMs })
            } else if (enemyHit.kind === DETRITO_KIND) {
              if (enemyHit.isGiant) {
                triggerSoundCue(ENEMY_SOUND_CUES.debris_titanic_shatter, { worldPos: enemyHit.mesh.position.clone() })
              } else {
                triggerSoundCue(ENEMY_SOUND_CUES.debris_shatter, { worldPos: enemyHit.mesh.position.clone() })
              }
            } else if (enemyHit.kind !== VERME_KIND) {
              triggerSoundCue(ENEMY_SOUND_CUES.generic_death, { enemyId: enemyHit.id, kind: enemyHit.kind, worldPos: enemyHit.mesh.position.clone() })
            }
            if (enemyHit.kind === VERME_KIND) severChainAt(enemyHit, enemies, rail)
            triggerHordaSplitIfNeeded(enemyHit)
            const killColor = isHoming ? HOMING_EXPLOSION_COLOR : colorFor(enemyHit)
            if (effects) effects.explosion(enemyHit.mesh.position, killColor, 1.6, { rings: true })

            // Rastreamento de abates de esquadrão
            if (enemyHit.squadronId && activeSquadrons.has(enemyHit.squadronId)) {
              const sq = activeSquadrons.get(enemyHit.squadronId)
              sq.remaining--
              if (sq.remaining <= 0 && !sq.wiped) {
                sq.wiped = true
                activeSquadrons.delete(enemyHit.squadronId)
                squadWipe = true
                squadWipeBonus = 150
                enemyKillPoints += squadWipeBonus
                if (effects && effects.spawnMicroOrbe) {
                  effects.spawnMicroOrbe(enemyHit.mesh.position.clone())
                }
              }
            }
          }
        } else if (enemyHit.kind === BLASTER_KIND && !enemyHit.wingBroken) {
          breakBlasterWing(enemyHit)
        } else if (enemyHit.kind === HORDA_KIND) {
          triggerHordaTurbulence(enemyHit)
        }
        return {
          kind: enemyHit.kind, killed, worldPos: enemyHit.mesh.position.clone(), meshRef: enemyHit.mesh,
          enemyKillPoints, timeReductionMs, bossDefeated, goldenSpecialHit: false,
          squadWipe, squadWipeBonus,
        }
      }

      const goldenHit = golden.resolveHit(prevPos, currPos, damage, isHoming, hitBuffer, effects)
      if (goldenHit) return goldenHit

      return null
    },

    // Swirl Blast (Docs/# Swirl Blast — Design & Plano de I.md) — colisão MULTI-HIT: ao
    // contrário de resolveProjectileHit (para no primeiro achado), aqui o projétil atravessa,
    // então iteramos TODOS os inimigos vivos e devolvemos um hit por alvo ainda não perfurado
    // (piercedTargets, mantido pelo chamador em projectiles.js, 1 Set por projétil).
    //
    // Etapa 3 (regras especiais, §3.2.1/§3.2.3/§3.2.4):
    //   - Detrito: kill DIRETO, ignora HP e o dano numérico de `damage` (uma broca de energia
    //     atravessa pedra) — e o Swirl CONTINUA (detrito não é "sólido" pro Swirl).
    //   - Chefe/Fragata: sempre marcam `stopProjectile:true` (o chamador remove o projétil).
    //     Chefe com escudo ativo: o escudo é DESTRUÍDO em vez de bloquear (`destroyedShield`),
    //     não existe o conceito de escudo pra Fragata aqui — a "placa" dela nem é checada
    //     (diferente de resolveProjectileHit, que respeita `isFragataShielded`).
    //   - Demais inimigos: dano fixo, sem parar (comportamento genérico da etapa 2, inalterado).
    //
    // Lógica de morte (telemetria, som, kill points, split da Horda, corte do Verme, wipe de
    // esquadrão) é a MESMA de resolveProjectileHit — mantida idêntica de propósito.
    resolvePiercingProjectileHits(prevPos, currPos, meta = {}) {
      const damage = meta.damage ?? 1
      const hitBuffer = meta.hitBuffer || 0
      const piercedTargets = meta.piercedTargets || new Set()
      const hits = []

      for (const enemyHit of enemies) {
        if (enemyHit.dying || enemyHit.fadingOut || enemyHit.spawnInvincibleTimer > 0) continue
        if (piercedTargets.has(enemyHit.id)) continue
        if (distanceToSegment(enemyHit.mesh.position, prevPos, currPos) > hitRadiusFor(enemyHit) + hitBuffer) continue
        piercedTargets.add(enemyHit.id)

        // §3.2.1 — detrito sempre morre, o dano numérico não se aplica; o Swirl continua voando.
        if (enemyHit.kind === DETRITO_KIND) {
          enemyHit.dying = true
          enemyHit.deathT = 0
          const enemyKillPoints = killPointsFor(enemyHit.kind)
          telemetry.recordEvent(enemyHit.id, enemyHit.kind, 'death', `Inimigo ${enemyHit.kind} #${enemyHit.id} atravessado e destruído (Swirl Blast)!`, { hp: 0 })
          triggerSoundCue(enemyHit.isGiant ? ENEMY_SOUND_CUES.debris_titanic_shatter : ENEMY_SOUND_CUES.debris_shatter, { worldPos: enemyHit.mesh.position.clone() })
          if (effects) effects.explosion(enemyHit.mesh.position, colorFor(enemyHit), 1.6, { rings: true })
          hits.push({
            kind: enemyHit.kind, killed: true, worldPos: enemyHit.mesh.position.clone(), meshRef: enemyHit.mesh,
            enemyKillPoints, timeReductionMs: null, bossDefeated: false, squadWipe: false, squadWipeBonus: 0,
          })
          continue
        }

        // §3.2.3/§3.2.4 — chefe e fragata sempre param o Swirl. Escudo do chefe é destruído em
        // vez de refletir (a fragata não tem esse conceito de escudo destrutível — a placa dela
        // simplesmente não é checada, o Swirl a ignora por completo).
        const stopsProjectile = enemyHit.kind === BOSS_KIND || enemyHit.kind === FRAGATA_KIND
        let destroyedShield = false
        if (enemyHit.kind === BOSS_KIND && enemyHit.isShieldActive) {
          destroyedShield = true
          enemyHit.isShieldActive = false
          if (enemyHit.shieldMesh) enemyHit.shieldMesh.visible = false
          if (effects) {
            effects.hitSpark(enemyHit.mesh.position, BOSS_SHIELD_COLOR)
            effects.shockwave(enemyHit.mesh.position, BOSS_SHIELD_COLOR, 0.8)
          }
        }

        enemyHit.hp -= damage
        telemetry.recordEvent(enemyHit.id, enemyHit.kind, 'damage', `Recebeu ${damage} de dano perfurante (HP restante: ${Math.max(0, enemyHit.hp)})`, { damage, hp: enemyHit.hp })
        const killed = enemyHit.hp <= 0
        let enemyKillPoints = 0
        let timeReductionMs = null
        let bossDefeated = false
        let squadWipe = false
        let squadWipeBonus = 0

        if (killed) {
          enemyHit.dying = true
          enemyHit.deathT = 0
          telemetry.recordEvent(enemyHit.id, enemyHit.kind, 'death', `Inimigo ${enemyHit.kind} #${enemyHit.id} abatido (Swirl Blast)!`, { hp: 0 })
          if (enemyHit.kind === BOSS_KIND) {
            bossDefeated = true
            bossDefeatedPending = true
            bossDefeatedWorldPos = enemyHit.mesh.position.clone()
            enemyHit.isShieldActive = false
            if (enemyHit.shieldMesh) enemyHit.shieldMesh.visible = false
            if (effects) explodeBoss(effects, enemyHit.mesh.position, false)
          } else {
            enemyKillPoints = killPointsFor(enemyHit.kind)
            if (enemyHit.kind === TIME_KIND) {
              timeReductionMs = TIME_REDUCTION_MIN_MS + Math.random() * (TIME_REDUCTION_MAX_MS - TIME_REDUCTION_MIN_MS)
              triggerSoundCue(ENEMY_SOUND_CUES.time_enemy_rewind_snap, { worldPos: enemyHit.mesh.position.clone(), timeReductionMs })
            } else if (enemyHit.kind === DETRITO_KIND) {
              triggerSoundCue(enemyHit.isGiant ? ENEMY_SOUND_CUES.debris_titanic_shatter : ENEMY_SOUND_CUES.debris_shatter, { worldPos: enemyHit.mesh.position.clone() })
            } else if (enemyHit.kind !== VERME_KIND) {
              triggerSoundCue(ENEMY_SOUND_CUES.generic_death, { enemyId: enemyHit.id, kind: enemyHit.kind, worldPos: enemyHit.mesh.position.clone() })
            }
            if (enemyHit.kind === VERME_KIND) severChainAt(enemyHit, enemies, rail)
            triggerHordaSplitIfNeeded(enemyHit)
            if (effects) effects.explosion(enemyHit.mesh.position, colorFor(enemyHit), 1.6, { rings: true })

            if (enemyHit.squadronId && activeSquadrons.has(enemyHit.squadronId)) {
              const sq = activeSquadrons.get(enemyHit.squadronId)
              sq.remaining--
              if (sq.remaining <= 0 && !sq.wiped) {
                sq.wiped = true
                activeSquadrons.delete(enemyHit.squadronId)
                squadWipe = true
                squadWipeBonus = 150
                enemyKillPoints += squadWipeBonus
                if (effects && effects.spawnMicroOrbe) effects.spawnMicroOrbe(enemyHit.mesh.position.clone())
              }
            }
          }
        } else if (enemyHit.kind === BLASTER_KIND && !enemyHit.wingBroken) {
          breakBlasterWing(enemyHit)
        } else if (enemyHit.kind === HORDA_KIND) {
          triggerHordaTurbulence(enemyHit)
        }

        hits.push({
          kind: enemyHit.kind, killed, worldPos: enemyHit.mesh.position.clone(), meshRef: enemyHit.mesh,
          enemyKillPoints, timeReductionMs, bossDefeated, squadWipe, squadWipeBonus,
          stopProjectile: stopsProjectile, destroyedShield,
        })
      }

      // Dourado vive em golden.js (array/estado próprio) — mesmo pipeline multi-hit, Set
      // separado do de cima por encapsulamento (golden.js não precisa saber do Set genérico).
      const goldenPierced = meta.goldenPiercedTargets || new Set()
      hits.push(...golden.resolvePiercingHit(prevPos, currPos, damage, goldenPierced))

      return hits
    },

    getEnemyCount() {
      // Horda conta como 3 vagas do teto (pedido do usuário — ela é grande/forte o bastante pra
      // "valer" por 3 inimigos comuns, e só spawna se sobrarem pelo menos 3 vagas livres)
      return enemies.reduce((n, e) => {
        if (e.dying || e.fadingOut || e.kind === DETRITO_KIND || e.kind === IMA_KIND) return n
        return n + (e.kind === HORDA_KIND ? 3 : 1)
      }, 0)
    },

    getEnemySnapshots: () => enemies
      .filter((e) => !e.dying && (e.maxHp > 1 || e.kind === MINI_SWARM_KIND))
      .map((e) => ({ id: e.id, worldPos: e.mesh.position.clone(), hp: e.hp, maxHp: e.maxHp }))
      .concat(golden.getSnapshots()),

    getBossSnapshot: () => {
      const boss = enemies.find((e) => e.kind === BOSS_KIND && !e.dying)
      return boss ? { hp: boss.hp, maxHp: boss.maxHp } : null
    },

    getGoldenSnapshot: () => {
      const snaps = golden.getSnapshots()
      return snaps.length > 0 ? { hp: snaps[0].hp, maxHp: snaps[0].maxHp } : null
    },

    getMinimapBlips: () => {
      const blips = []
      for (const e of enemies) {
        if (e.dying) continue
        // `kind` viaja junto pro Radar Tático (overhaul do minimapa escolhido pelo usuário)
        // escolher o FORMATO do blip por tipo de ameaça, não só a cor
        blips.push({ type: e.kind === BOSS_KIND ? 'boss' : 'enemy', kind: e.kind, worldPos: e.mesh.position })
      }
      return blips.concat(golden.getMinimapBlips())
    },

    getHitboxTargets: () => {
      const list = []
      for (const e of enemies) if (!e.dying) list.push({ worldPos: e.mesh.position, radius: hitRadiusFor(e) })
      for (const p of enemyProjectiles) list.push({ worldPos: p.mesh.position, radius: ENEMY_PROJECTILE_HIT_RADIUS })
      return list.concat(golden.getHitboxTargets())
    },

    getAlive: () => enemies.filter((e) => !e.dying && !e.fadingOut),
    getGoldenAlive: () => golden.getAlive(),
    // raio "de trava" pro lock-on/HUD (QoL #2) — golden já expõe `.radius` próprio, o resto usa
    // o mesmo hitRadius da colisão (hitRadiusFor), incluindo o chefe (que não tinha radius
    // próprio e caía no fallback hardcoded de lockon.js antes desta função existir)
    getLockableRadius: (entity) => entity.radius ?? hitRadiusFor(entity),

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
      bossDefeatedPending = false
      bossDefeatedWorldPos = null
      activeSquadrons.clear()
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
      activeSquadrons.clear()
      for (const enemy of [...enemies]) if (!enemy.dying) removeEnemy(enemy)
      golden.clear()
      for (const projectile of [...enemyProjectiles]) removeEnemyProjectile(projectile)
      for (const l of [...enemyLasers]) removeEnemyLaser(l)
      for (const g of [...enemyGates]) removeEnemyGate(g)
    },

    clearAll() {
      bossDefeatedPending = false
      bossDefeatedWorldPos = null
      activeSquadrons.clear()
      for (const enemy of [...enemies]) removeEnemy(enemy)
      for (const projectile of [...enemyProjectiles]) removeEnemyProjectile(projectile)
      for (const l of [...enemyLasers]) removeEnemyLaser(l)
      for (const g of [...enemyGates]) removeEnemyGate(g)
      golden.clear()
    },

    consumeBossDefeated: () => {
      if (bossDefeatedPending) {
        bossDefeatedPending = false
        return { defeated: true, worldPos: bossDefeatedWorldPos ? bossDefeatedWorldPos.clone() : null }
      }
      return null
    },
    hasAliveBoss: () => enemies.some((e) => e.kind === BOSS_KIND && !e.dying),
    isBossDying: () => enemies.some((e) => e.kind === BOSS_KIND && e.dying),
    getBossWorldPos: () => {
      const b = enemies.find((e) => e.kind === BOSS_KIND)
      return b ? b.mesh.position.clone() : null
    },

    getTelemetry: () => telemetry.getSnapshot(),
    getCombatLog: (limit) => telemetry.getCombatLog(limit),
    getTelemetryText: () => telemetry.getFormattedText(),
    dumpTelemetry: () => telemetry.dumpToConsole(),
    copyCombatLog: () => telemetry.copyToClipboard(),
    clearCombatLog: () => telemetry.clearLog(),
    recordTelemetryEvent: (id, kind, cat, msg, meta) => telemetry.recordEvent(id, kind, cat, msg, meta),

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
      disposeHorda()
    },
  }
}