import * as THREE from 'three'
import { FORWARD_AXIS, distanceToSegment, POWER_LEVEL_BASIC, HOMING_EXPLOSION_COLOR } from './shared.js'
import { ENEMY_SOUND_CUES, triggerSoundCue } from '../audio-cues.js'
import { aiValidator } from '../ai-validator.js'

// ============ OVERHAUL DO ESQUADRÃO DE CAÇAS DO DOURADO (v0.99.36) ============
// Caças subordinados persistentes, destrutíveis e coordenados pelo Dourado.
// Substitui o modelo antigo de 'spawnMinion -> pushProjectile homing'.

export const GOLDEN_FIGHTER_KIND = 'golden_fighter'
export const GOLDEN_FIGHTER_COLOR = 0xffd600
export const GOLDEN_FIGHTER_EMISSIVE = 0xff8f00
export const GOLDEN_FIGHTER_BASE_HP = 6
export const GOLDEN_FIGHTER_KILL_POINTS = 30
export const GOLDEN_FIGHTER_HIT_RADIUS = 1.35
export const GOLDEN_FIGHTER_RAM_RADIUS = 1.8

// Mappings obrigatórios por dificuldade (1 a 9)
// Capacidade máxima do esquadrão: 2 / 2 / 3 / 3 / 4 / 4 / 5 / 5 / 6
export const SQUADRON_CAP_BY_LEVEL = [0, 2, 2, 3, 3, 4, 4, 5, 5, 6]

// Máximo de atacantes ofensivos simultâneos: 1-2 -> 1, 3-6 -> 2, 7-9 -> 3
export const OFFENSIVE_CAP_BY_LEVEL = [0, 1, 1, 2, 2, 2, 2, 3, 3, 3]

// Intervalo de reposição por dificuldade: ~15s (lvl 1) a ~8s (lvl 9)
export const REPLENISH_INTERVAL_BY_LEVEL = [0, 15.0, 14.0, 13.0, 12.0, 11.0, 10.0, 9.5, 8.7, 8.0]

// Estados conceituais dos caças
export const FIGHTER_STATE = {
  FORMATION: 'FORMATION',
  PREPARING: 'PREPARING',
  ATTACKING: 'ATTACKING',
  PASSING: 'PASSING',
  RETURNING: 'RETURNING',
  REGROUPING: 'REGROUPING',
  DISORGANIZED: 'DISORGANIZED',
  DYING: 'DYING',
}

// Ordens táticas do compositor
export const SQUADRON_ORDER = {
  NONE: 'NONE',
  STRAFING_RUN: 'STRAFING_RUN',
  PINCER: 'PINCER',
  LASER_FLANK: 'LASER_FLANK',
  COORDINATED_FIRE: 'COORDINATED_FIRE',
}

// Parâmetros de movimentação e combate
const FORMATION_FOLLOW_SPEED = 22.0
const FORMATION_SLOT_SMOOTHING = 5.0
const ATTACK_SPEED = 30.0
const RETURN_SPEED = 22.0
const PASS_DISTANCE_THRESHOLD = 30.0
const COORDINATED_FIRE_INTERVAL_S = 0.28
const ORDER_COOLDOWN_MIN_S = 3.5
const ORDER_COOLDOWN_MAX_S = 5.5
const FIGHTER_DEATH_DURATION_S = 0.22

// Definição dos slots de formação ao redor do Comandante
// (X = lateral direita/esquerda, Y = elevação superior/inferior, Z = frente/traseira relativa ao avanço)
export const FORMATION_SLOTS = [
  { id: 0, offset: new THREE.Vector3(-9.0, 1.5, -4.0) },  // Ala esquerda
  { id: 1, offset: new THREE.Vector3(9.0, 1.5, -4.0) },   // Ala direita
  { id: 2, offset: new THREE.Vector3(0.0, 5.5, -7.0) },   // Echelon superior traseiro
  { id: 3, offset: new THREE.Vector3(0.0, -4.5, -6.0) },  // Echelon inferior traseiro
  { id: 4, offset: new THREE.Vector3(-15.0, -1.0, -5.0) }, // Flanco largo esquerdo
  { id: 5, offset: new THREE.Vector3(15.0, -1.0, -5.0) },  // Flanco largo direito
]

// Compartilhamento único de recursos de renderização para evitar GC spikes
export const fighterGeometry = new THREE.ConeGeometry(0.35, 1.25, 4)
fighterGeometry.rotateX(Math.PI / 2)
export const fighterMaterial = new THREE.MeshPhongMaterial({
  color: GOLDEN_FIGHTER_COLOR,
  emissive: GOLDEN_FIGHTER_EMISSIVE,
  emissiveIntensity: 0.95,
  flatShading: true,
})

// Temporários de módulo para evitar alocações por frame
const _vForward = new THREE.Vector3()
const _vUp = new THREE.Vector3()
const _vRight = new THREE.Vector3()
const _vSlotTarget = new THREE.Vector3()
const _vDesiredVel = new THREE.Vector3()
const _vToTarget = new THREE.Vector3()

export function getSquadronCapForLevel(level) {
  const lvl = Math.max(1, Math.min(9, Math.round(level || 1)))
  return SQUADRON_CAP_BY_LEVEL[lvl] || 2
}

export function getOffensiveCapForLevel(level) {
  const lvl = Math.max(1, Math.min(9, Math.round(level || 1)))
  return OFFENSIVE_CAP_BY_LEVEL[lvl] || 1
}

export function getReplenishIntervalForLevel(level) {
  const lvl = Math.max(1, Math.min(9, Math.round(level || 1)))
  return REPLENISH_INTERVAL_BY_LEVEL[lvl] || 11.0
}

export function getFighterHpForLevel(level) {
  const lvl = Math.max(1, Math.min(9, Math.round(level || 1)))
  return GOLDEN_FIGHTER_BASE_HP + Math.floor((lvl - 1) * 0.5)
}

export function createGoldenSquadron(scene, effects, nextId, initialLevel = 1) {
  let level = initialLevel
  let fighters = []
  let elapsed = 0
  let replenishTimer = getReplenishIntervalForLevel(level)
  let orderCooldownTimer = 2.5
  let currentOrder = SQUADRON_ORDER.NONE
  let lastOrder = SQUADRON_ORDER.NONE
  let orderState = null

  function getAvailableSlot() {
    const occupiedSlots = new Set(fighters.filter((f) => !f.dying).map((f) => f.slotIndex))
    const maxSquad = getSquadronCapForLevel(level)
    for (let i = 0; i < maxSquad; i++) {
      if (!occupiedSlots.has(i)) return i
    }
    return -1
  }

  function spawnFighter(spawnPos, initialVelocity = null, preferredSlot = -1) {
    const maxSquad = getSquadronCapForLevel(level)
    const activeCount = fighters.filter((f) => !f.dying).length
    if (activeCount >= maxSquad) return null

    const slotIndex = preferredSlot >= 0 ? preferredSlot : getAvailableSlot()
    if (slotIndex < 0) return null

    const hp = getFighterHpForLevel(level)
    const mesh = new THREE.Mesh(fighterGeometry, fighterMaterial)
    mesh.position.copy(spawnPos)
    scene.add(mesh)

    const fighter = {
      id: nextId(),
      kind: GOLDEN_FIGHTER_KIND,
      mesh,
      hp,
      maxHp: hp,
      slotIndex,
      state: FIGHTER_STATE.REGROUPING,
      currentOrder: SQUADRON_ORDER.NONE,
      velocity: initialVelocity ? initialVelocity.clone() : new THREE.Vector3(0, 0, 0),
      stateTimer: 0,
      attackContext: null,
      dying: false,
      deathT: 0,
      hasFiredInAttack: false,
      disorganizedTimer: 0,
    }

    fighters.push(fighter)
    triggerSoundCue(ENEMY_SOUND_CUES.golden_drone_launch, { worldPos: spawnPos })

    aiValidator.expect('Golden squadron size does not exceed difficulty cap',
      () => fighters.filter((f) => !f.dying).length <= maxSquad,
      { count: fighters.filter((f) => !f.dying).length, maxSquad, level },
    )

    return fighter
  }

  function removeFighterMesh(f) {
    if (f.mesh && f.mesh.parent) {
      scene.remove(f.mesh)
    }
  }

  function killFighter(f, killerSource = 'combat') {
    if (f.dying) return
    f.dying = true
    f.deathT = 0
    f.state = FIGHTER_STATE.DYING

    triggerSoundCue(ENEMY_SOUND_CUES.generic_death, { enemyId: f.id, kind: GOLDEN_FIGHTER_KIND, worldPos: f.mesh.position.clone() })
    if (effects) {
      effects.explosion(f.mesh.position, GOLDEN_FIGHTER_COLOR, 1.3, { rings: true })
      effects.shockwave(f.mesh.position, GOLDEN_FIGHTER_COLOR, 0.6)
    }

    // Degradação graciosa de ordens se o caça participava de uma
    if (orderState && orderState.participants && orderState.participants.some((p) => p.id === f.id)) {
      orderState.participants = orderState.participants.filter((p) => p.id !== f.id)
      if (currentOrder === SQUADRON_ORDER.PINCER && orderState.participants.length < 1) {
        currentOrder = SQUADRON_ORDER.NONE
        orderState = null
      } else if (currentOrder === SQUADRON_ORDER.COORDINATED_FIRE) {
        if (orderState.participants.length === 0 && !orderState.commanderFired) {
          // Apenas o comandante restará
        }
      }
    }
  }

  // Inicializa o esquadrão completo para a dificuldade atual
  function initSquadron(commanderPos, forwardDir) {
    fighters = []
    const cap = getSquadronCapForLevel(level)
    for (let i = 0; i < cap; i++) {
      const slotDef = FORMATION_SLOTS[i % FORMATION_SLOTS.length]
      const spawnOffset = new THREE.Vector3(slotDef.offset.x, slotDef.offset.y, slotDef.offset.z)
      const spawnPos = commanderPos.clone().add(spawnOffset)
      const f = spawnFighter(spawnPos, null, i)
      if (f) f.state = FIGHTER_STATE.FORMATION
    }
  }

  // Compositor de ordens: inicia uma ordem contextual
  function startOrder(orderType, commander, playerPosition) {
    const activeFighters = fighters.filter((f) => !f.dying && f.state === FIGHTER_STATE.FORMATION)
    const maxOffensive = getOffensiveCapForLevel(level)

    if (orderType === SQUADRON_ORDER.STRAFING_RUN) {
      const eligible = activeFighters.slice(0, maxOffensive)
      if (eligible.length === 0) return false

      currentOrder = SQUADRON_ORDER.STRAFING_RUN
      lastOrder = SQUADRON_ORDER.STRAFING_RUN
      orderState = {
        type: SQUADRON_ORDER.STRAFING_RUN,
        participants: eligible,
        timer: 0,
      }

      for (const f of eligible) {
        f.state = FIGHTER_STATE.PREPARING
        f.currentOrder = SQUADRON_ORDER.STRAFING_RUN
        f.stateTimer = 0.5 + Math.random() * 0.2
        f.hasFiredInAttack = false
        f.attackContext = {
          targetPos: playerPosition.clone(),
          diveVector: playerPosition.clone().sub(f.mesh.position).normalize(),
        }
      }
      return true
    }

    if (orderType === SQUADRON_ORDER.PINCER) {
      if (activeFighters.length < 2 || maxOffensive < 2) return false
      const participants = activeFighters.slice(0, 2)

      currentOrder = SQUADRON_ORDER.PINCER
      lastOrder = SQUADRON_ORDER.PINCER
      orderState = {
        type: SQUADRON_ORDER.PINCER,
        participants,
        timer: 0,
      }

      // Caça 0 abre para a esquerda, Caça 1 para a direita com assimetria
      const fLeft = participants[0]
      const fRight = participants[1]

      fLeft.state = FIGHTER_STATE.PREPARING
      fLeft.currentOrder = SQUADRON_ORDER.PINCER
      fLeft.stateTimer = 0.6
      fLeft.hasFiredInAttack = false
      fLeft.attackContext = {
        flankSide: -1,
        flankOffset: -20 + (Math.random() * 4 - 2),
        elevationOffset: 3 + Math.random() * 2,
        targetPos: playerPosition.clone(),
      }

      fRight.state = FIGHTER_STATE.PREPARING
      fRight.currentOrder = SQUADRON_ORDER.PINCER
      fRight.stateTimer = 0.75 // Pequeno stagger para evitar geometria idêntica espelhada
      fRight.hasFiredInAttack = false
      fRight.attackContext = {
        flankSide: 1,
        flankOffset: 22 + (Math.random() * 4 - 2),
        elevationOffset: -2 + Math.random() * 2,
        targetPos: playerPosition.clone(),
      }
      return true
    }

    if (orderType === SQUADRON_ORDER.COORDINATED_FIRE) {
      const eligible = activeFighters.slice(0, Math.min(activeFighters.length, maxOffensive + 1))
      if (eligible.length === 0) return false

      currentOrder = SQUADRON_ORDER.COORDINATED_FIRE
      lastOrder = SQUADRON_ORDER.COORDINATED_FIRE
      orderState = {
        type: SQUADRON_ORDER.COORDINATED_FIRE,
        participants: eligible,
        stepIndex: 0,
        stepTimer: 0.15,
        commanderFired: false,
        totalSteps: eligible.length + 1, // Participantes + Comandante no meio
      }

      for (const f of eligible) {
        f.state = FIGHTER_STATE.PREPARING
        f.currentOrder = SQUADRON_ORDER.COORDINATED_FIRE
        f.stateTimer = 0
        f.hasFiredInAttack = false
        f.attackContext = { targetPos: playerPosition.clone() }
      }
      return true
    }

    return false
  }

  // Cerco do Laser: invocado quando o comandante entra no telegraph do laser
  function coordinateLaserFlank(commanderPos, playerPosition, durationS) {
    const activeFighters = fighters.filter((f) => !f.dying && (f.state === FIGHTER_STATE.FORMATION || f.state === FIGHTER_STATE.REGROUPING))
    const maxOffensive = getOffensiveCapForLevel(level)
    const participants = activeFighters.slice(0, maxOffensive)
    if (participants.length === 0) return

    currentOrder = SQUADRON_ORDER.LASER_FLANK
    orderState = {
      type: SQUADRON_ORDER.LASER_FLANK,
      participants,
      duration: durationS,
      timer: 0,
    }

    // Distribui caças em flancos sem fechar todas as rotas de fuga
    participants.forEach((f, idx) => {
      f.state = FIGHTER_STATE.PREPARING
      f.currentOrder = SQUADRON_ORDER.LASER_FLANK
      f.stateTimer = durationS
      const side = idx % 2 === 0 ? -1 : 1
      f.attackContext = {
        flankSide: side,
        flankDist: 16.0 + idx * 4.0,
        heightOffset: (idx === 0 ? 3.0 : -3.0),
      }
    })
  }

  function onCommanderTeleported(oldCommanderPos, newCommanderPos) {
    // REGRA DE OURO: Os caças NÃO teleportam!
    // Entram em DISORGANIZED e viajam fisicamente até o novo comandante.
    for (const f of fighters) {
      if (f.dying) continue
      // Se estava em formação ou preparando, a formação foi invalidada
      if (f.state === FIGHTER_STATE.FORMATION || f.state === FIGHTER_STATE.PREPARING) {
        f.state = FIGHTER_STATE.DISORGANIZED
        f.disorganizedTimer = 0.5 + Math.random() * 0.4
        f.currentOrder = SQUADRON_ORDER.NONE
      } else if (f.state === FIGHTER_STATE.ATTACKING || f.state === FIGHTER_STATE.PASSING) {
        // Deixa completar a passagem e depois regressar fisicamente à nova posição
        f.currentOrder = SQUADRON_ORDER.NONE
      } else if (f.state === FIGHTER_STATE.RETURNING || f.state === FIGHTER_STATE.REGROUPING) {
        f.state = FIGHTER_STATE.DISORGANIZED
        f.disorganizedTimer = 0.4
      }
    }

    // Cancela ordens ativas dependentes de formação
    if (currentOrder !== SQUADRON_ORDER.NONE) {
      currentOrder = SQUADRON_ORDER.NONE
      orderState = null
      orderCooldownTimer = 3.0
    }

    aiValidator.expect('Fighters do not teleport with commander',
      () => fighters.every((f) => f.dying || f.mesh.position.distanceTo(newCommanderPos) > 1.0),
      { fighterCount: fighters.length },
    )
  }

  function update(dt, commander, playerPosition, ctx, opts = {}) {
    elapsed += dt
    orderCooldownTimer = Math.max(0, orderCooldownTimer - dt)
    const commanderPos = commander.mesh.position
    const maxSquad = getSquadronCapForLevel(level)
    const maxOffensive = getOffensiveCapForLevel(level)

    // 1. Orientação da formação a partir do vetor comandante -> jogador
    if (playerPosition) {
      _vForward.copy(playerPosition).sub(commanderPos).normalize()
      if (_vForward.lengthSq() < 0.001) _vForward.set(0, 0, -1)
    } else {
      _vForward.set(0, 0, -1)
    }
    _vUp.set(0, 1, 0)
    _vRight.crossVectors(_vForward, _vUp).normalize()
    if (_vRight.lengthSq() < 0.001) _vRight.set(1, 0, 0)
    _vUp.crossVectors(_vRight, _vForward).normalize()

    // 2. Reposição gradual: uma nave por ciclo, visual e com cue de áudio
    const aliveFighters = fighters.filter((f) => !f.dying)
    if (aliveFighters.length < maxSquad && !commander.dying && commander.laserTelegraphTimer <= 0) {
      replenishTimer -= dt
      if (replenishTimer <= 0) {
        const spawnOffset = _vRight.clone().multiplyScalar((Math.random() < 0.5 ? -1 : 1) * 3.5).addScaledVector(_vForward, -4.0)
        const spawnPos = commanderPos.clone().add(spawnOffset)
        spawnFighter(spawnPos)
        replenishTimer = getReplenishIntervalForLevel(level)
      }
    }

    // 3. Orquestração de ordens táticas pelo Comandante
    const organizedFighters = fighters.filter((f) => !f.dying && f.state === FIGHTER_STATE.FORMATION)
    if (currentOrder === SQUADRON_ORDER.NONE && orderCooldownTimer <= 0 && playerPosition && !commander.dying) {
      const distToPlayer = commanderPos.distanceTo(playerPosition)
      // Seleção contextual sem loop fixo e sem repetição estrita
      if (organizedFighters.length >= 2 && maxOffensive >= 2 && lastOrder !== SQUADRON_ORDER.PINCER && Math.random() < 0.5) {
        startOrder(SQUADRON_ORDER.PINCER, commander, playerPosition)
      } else if (organizedFighters.length >= 1 && lastOrder !== SQUADRON_ORDER.STRAFING_RUN && (distToPlayer > 55 || Math.random() < 0.5)) {
        startOrder(SQUADRON_ORDER.STRAFING_RUN, commander, playerPosition)
      } else if (organizedFighters.length >= 1 && lastOrder !== SQUADRON_ORDER.COORDINATED_FIRE) {
        startOrder(SQUADRON_ORDER.COORDINATED_FIRE, commander, playerPosition)
      }
    }

    // 4. Execução e avanço da ordem ativa
    if (currentOrder === SQUADRON_ORDER.COORDINATED_FIRE && orderState) {
      orderState.stepTimer -= dt
      if (orderState.stepTimer <= 0) {
        const participants = orderState.participants.filter((p) => !p.dying)
        const commanderStep = Math.floor(participants.length / 2) // Comandante dispara no meio

        if (orderState.stepIndex === commanderStep && !orderState.commanderFired) {
          orderState.commanderFired = true
          triggerSoundCue(ENEMY_SOUND_CUES.golden_straight_volley, { worldPos: commanderPos })
          ctx.fireEnemyProjectile({ mesh: commander.mesh, projectileOpts: { powerLevel: POWER_LEVEL_BASIC } }, playerPosition)
          if (effects) effects.telegraph(commanderPos, GOLDEN_FIGHTER_COLOR)
          orderState.stepTimer = COORDINATED_FIRE_INTERVAL_S
          orderState.stepIndex++
        } else {
          const participantIndex = orderState.stepIndex > commanderStep ? orderState.stepIndex - 1 : orderState.stepIndex
          if (participantIndex < participants.length) {
            const f = participants[participantIndex]
            if (f && !f.dying && f.mesh) {
              f.hasFiredInAttack = true
              ctx.fireEnemyProjectile({ mesh: f.mesh, projectileOpts: { powerLevel: POWER_LEVEL_BASIC } }, playerPosition)
              if (effects) effects.hitSpark(f.mesh.position, GOLDEN_FIGHTER_COLOR)
            }
            orderState.stepTimer = COORDINATED_FIRE_INTERVAL_S
            orderState.stepIndex++
          } else {
            // Ordem concluída: participantes retornam à formação
            for (const f of participants) {
              f.state = FIGHTER_STATE.REGROUPING
              f.currentOrder = SQUADRON_ORDER.NONE
            }
            currentOrder = SQUADRON_ORDER.NONE
            orderState = null
            orderCooldownTimer = ORDER_COOLDOWN_MIN_S + Math.random() * (ORDER_COOLDOWN_MAX_S - ORDER_COOLDOWN_MIN_S)
          }
        }
      }
    }

    // 5. Atualização individual de cada caça
    let activeAttackers = 0
    for (let i = fighters.length - 1; i >= 0; i--) {
      const f = fighters[i]

      // Estado DYING: animação de escala e remoção
      if (f.dying) {
        f.deathT += dt / FIGHTER_DEATH_DURATION_S
        f.mesh.scale.setScalar(Math.max(0, 1 - f.deathT))
        if (f.deathT >= 1) {
          removeFighterMesh(f)
          fighters.splice(i, 1)
        }
        continue
      }

      // Validação de finitude
      aiValidator.expect('Golden fighter coordinates are finite',
        () => Number.isFinite(f.mesh.position.x) && Number.isFinite(f.mesh.position.y) && Number.isFinite(f.mesh.position.z),
        { fighterId: f.id },
      )

      if (f.state === FIGHTER_STATE.ATTACKING) activeAttackers++

      // FSM Interna do Caça
      switch (f.state) {
        case FIGHTER_STATE.FORMATION: {
          // Segue o slot atribuído com amortecimento suave
          const slotDef = FORMATION_SLOTS[f.slotIndex % FORMATION_SLOTS.length]
          _vSlotTarget.copy(commanderPos)
            .addScaledVector(_vRight, slotDef.offset.x)
            .addScaledVector(_vUp, slotDef.offset.y)
            .addScaledVector(_vForward, slotDef.offset.z)

          // Micro-oscilação viva
          _vSlotTarget.x += Math.sin(elapsed * 2.4 + f.id) * 0.45
          _vSlotTarget.y += Math.cos(elapsed * 2.0 + f.id) * 0.35

          _vToTarget.copy(_vSlotTarget).sub(f.mesh.position)
          const dist = _vToTarget.length()
          const speed = Math.min(FORMATION_FOLLOW_SPEED, Math.max(4.0, dist * 3.5))
          _vDesiredVel.copy(_vToTarget).normalize().multiplyScalar(speed)
          f.velocity.lerp(_vDesiredVel, dt * FORMATION_SLOT_SMOOTHING)
          f.mesh.position.addScaledVector(f.velocity, dt)

          // Alinha orientação com o vetor de avanço
          if (_vForward.lengthSq() > 0.01) {
            f.mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, _vForward)
          }
          break
        }

        case FIGHTER_STATE.DISORGANIZED: {
          // Desorientação após teleporte do comandante
          f.disorganizedTimer -= dt
          f.mesh.position.addScaledVector(f.velocity, dt * 0.4)
          f.velocity.multiplyScalar(0.92)
          f.mesh.rotation.y += dt * 3.0
          if (f.disorganizedTimer <= 0) {
            f.state = FIGHTER_STATE.REGROUPING
          }
          break
        }

        case FIGHTER_STATE.REGROUPING: {
          // Desloca-se fisicamente até o slot do Comandante
          const slotDef = FORMATION_SLOTS[f.slotIndex % FORMATION_SLOTS.length]
          _vSlotTarget.copy(commanderPos)
            .addScaledVector(_vRight, slotDef.offset.x)
            .addScaledVector(_vUp, slotDef.offset.y)
            .addScaledVector(_vForward, slotDef.offset.z)

          _vToTarget.copy(_vSlotTarget).sub(f.mesh.position)
          const dist = _vToTarget.length()
          if (dist < 2.5) {
            f.state = FIGHTER_STATE.FORMATION
            f.currentOrder = SQUADRON_ORDER.NONE
          } else {
            const speed = dist > 25.0 ? Math.min(45.0, RETURN_SPEED + (dist - 25.0) * 0.5) : RETURN_SPEED
            _vDesiredVel.copy(_vToTarget).normalize().multiplyScalar(speed)
            f.velocity.lerp(_vDesiredVel, dt * 4.5)
            f.mesh.position.addScaledVector(f.velocity, dt)
            if (f.velocity.lengthSq() > 0.01) {
              f.mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, f.velocity.clone().normalize())
            }
          }
          break
        }

        case FIGHTER_STATE.PREPARING: {
          f.stateTimer -= dt
          if (f.currentOrder === SQUADRON_ORDER.LASER_FLANK) {
            // Assume posição nos flancos do laser
            const ctxFlank = f.attackContext || {}
            const side = ctxFlank.flankSide || 1
            const flankDist = ctxFlank.flankDist || 18.0
            const height = ctxFlank.heightOffset || 0
            _vSlotTarget.copy(commanderPos)
              .addScaledVector(_vRight, side * flankDist)
              .addScaledVector(_vUp, height)
              .addScaledVector(_vForward, 8.0)

            _vToTarget.copy(_vSlotTarget).sub(f.mesh.position)
            f.velocity.lerp(_vToTarget.normalize().multiplyScalar(FORMATION_FOLLOW_SPEED), dt * 4.0)
            f.mesh.position.addScaledVector(f.velocity, dt)
            if (_vForward.lengthSq() > 0.01) f.mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, _vForward)

            if (commander.laserTelegraphTimer <= 0) {
              f.state = FIGHTER_STATE.REGROUPING
              f.currentOrder = SQUADRON_ORDER.NONE
            }
          } else if (f.currentOrder === SQUADRON_ORDER.COORDINATED_FIRE) {
            // Mantém posição e mira no jogador
            if (_vForward.lengthSq() > 0.01) f.mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, _vForward)
          } else {
            // Strafing ou Pincer: manobra preparatória de abertura
            const flankSide = f.attackContext?.flankSide || (Math.random() < 0.5 ? -1 : 1)
            _vDesiredVel.copy(_vRight).multiplyScalar(flankSide * 12.0).addScaledVector(_vForward, -4.0)
            f.velocity.lerp(_vDesiredVel, dt * 4.0)
            f.mesh.position.addScaledVector(f.velocity, dt)
            if (_vForward.lengthSq() > 0.01) f.mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, _vForward)

            if (f.stateTimer <= 0) {
              f.state = FIGHTER_STATE.ATTACKING
              f.stateTimer = 1.4
            }
          }
          break
        }

        case FIGHTER_STATE.ATTACKING: {
          f.stateTimer -= dt
          const target = (f.attackContext && f.attackContext.targetPos) || playerPosition
          if (target) {
            _vToTarget.copy(target).sub(f.mesh.position)
            const dist = _vToTarget.length()

            // Disparo único durante a descida de ataque
            if (!f.hasFiredInAttack && dist < 45.0 && ctx.fireEnemyProjectile) {
              f.hasFiredInAttack = true
              ctx.fireEnemyProjectile({ mesh: f.mesh, projectileOpts: { powerLevel: POWER_LEVEL_BASIC } }, playerPosition)
              if (effects) effects.hitSpark(f.mesh.position, GOLDEN_FIGHTER_COLOR)
            }

            _vDesiredVel.copy(_vToTarget).normalize().multiplyScalar(ATTACK_SPEED)
            f.velocity.lerp(_vDesiredVel, dt * 4.5)
            f.mesh.position.addScaledVector(f.velocity, dt)
            if (f.velocity.lengthSq() > 0.01) {
              f.mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, f.velocity.clone().normalize())
            }

            // Ultrapassou o jogador ou timer expirou -> PASSING
            if (dist < 6.0 || f.stateTimer <= 0 || _vToTarget.dot(_vForward) < -2.0) {
              f.state = FIGHTER_STATE.PASSING
              f.stateTimer = 0.65
            }
          } else {
            f.state = FIGHTER_STATE.RETURNING
          }
          break
        }

        case FIGHTER_STATE.PASSING: {
          // Ultrapassa suavemente em vez de explodir contra o jogador
          f.stateTimer -= dt
          f.mesh.position.addScaledVector(f.velocity, dt)
          if (f.stateTimer <= 0) {
            f.state = FIGHTER_STATE.RETURNING
            f.stateTimer = 2.0
          }
          break
        }

        case FIGHTER_STATE.RETURNING: {
          // Curva de retorno para o Comandante
          f.stateTimer -= dt
          _vToTarget.copy(commanderPos).sub(f.mesh.position)
          const dist = _vToTarget.length()

          if (dist < 18.0 || f.stateTimer <= 0) {
            f.state = FIGHTER_STATE.REGROUPING
            f.currentOrder = SQUADRON_ORDER.NONE
          } else {
            _vDesiredVel.copy(_vToTarget).normalize().multiplyScalar(RETURN_SPEED)
            f.velocity.lerp(_vDesiredVel, dt * 3.0)
            f.mesh.position.addScaledVector(f.velocity, dt)
            if (f.velocity.lengthSq() > 0.01) {
              f.mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, f.velocity.clone().normalize())
            }
          }
          break
        }
      }
    }

    aiValidator.expect('Golden active attackers do not exceed offensive cap',
      () => activeAttackers <= maxOffensive,
      { activeAttackers, maxOffensive, level },
    )

    // Finaliza strafing/pincer se todos os participantes retornaram
    if ((currentOrder === SQUADRON_ORDER.STRAFING_RUN || currentOrder === SQUADRON_ORDER.PINCER) && orderState) {
      const activeOrderParticipants = orderState.participants.filter((p) => !p.dying && (p.state === FIGHTER_STATE.ATTACKING || p.state === FIGHTER_STATE.PREPARING || p.state === FIGHTER_STATE.PASSING))
      if (activeOrderParticipants.length === 0) {
        currentOrder = SQUADRON_ORDER.NONE
        orderState = null
        orderCooldownTimer = ORDER_COOLDOWN_MIN_S + Math.random() * (ORDER_COOLDOWN_MAX_S - ORDER_COOLDOWN_MIN_S)
      }
    }
  }

  function resolveHit(prevPos, currPos, damage, isHoming, hitBuffer, fx) {
    for (const f of fighters) {
      if (f.dying) continue
      if (distanceToSegment(f.mesh.position, prevPos, currPos) <= GOLDEN_FIGHTER_HIT_RADIUS + hitBuffer) {
        f.hp -= damage
        if (fx) fx.flashMesh(f.mesh)
        if (isHoming && fx) fx.explosion(f.mesh.position, HOMING_EXPLOSION_COLOR, 0.5)

        const killed = f.hp <= 0
        if (killed) {
          killFighter(f, 'projectile')
        }
        return {
          kind: GOLDEN_FIGHTER_KIND,
          killed,
          worldPos: f.mesh.position.clone(),
          meshRef: f.mesh,
          targetMaxHp: f.maxHp,
          enemyKillPoints: killed ? GOLDEN_FIGHTER_KILL_POINTS : 0,
          timeReductionMs: null,
          bossDefeated: false,
          goldenSpecialHit: false, // Caças NUNCA disparam a cutscene de morte do chefe
        }
      }
    }
    return null
  }

  function resolvePiercingHit(prevPos, currPos, damage, piercedTargets, hitBuffer = 0) {
    const hits = []
    for (const f of fighters) {
      if (f.dying) continue
      if (piercedTargets.has(f.id)) continue
      if (distanceToSegment(f.mesh.position, prevPos, currPos) > GOLDEN_FIGHTER_HIT_RADIUS + hitBuffer) continue

      piercedTargets.add(f.id)
      f.hp -= damage
      if (effects) effects.flashMesh(f.mesh)
      const killed = f.hp <= 0
      if (killed) {
        killFighter(f, 'piercing')
      }
      hits.push({
        kind: GOLDEN_FIGHTER_KIND,
        killed,
        worldPos: f.mesh.position.clone(),
        meshRef: f.mesh,
        damage,
        enemyKillPoints: killed ? GOLDEN_FIGHTER_KILL_POINTS : 0,
        timeReductionMs: null,
        bossDefeated: false,
        goldenSpecialHit: false,
        stopProjectile: false, // Swirl perfura caças subordinados sem ser interrompido
      })
    }
    return hits
  }

  function onCommanderDying() {
    // Quando o comandante morre, elimina subordinados sem deixar órfãos
    for (const f of [...fighters]) {
      if (!f.dying) killFighter(f, 'commander_death')
    }
  }

  function clear() {
    for (const f of fighters) removeFighterMesh(f)
    fighters = []
    currentOrder = SQUADRON_ORDER.NONE
    orderState = null
    replenishTimer = getReplenishIntervalForLevel(level)
  }

  function dispose() {
    clear()
  }

  return {
    setLevel(lvl) { level = lvl },
    getLevel: () => level,
    initSquadron,
    spawnFighter,
    update,
    onCommanderTeleported,
    coordinateLaserFlank,
    onCommanderDying,
    resolveHit,
    resolvePiercingHit,
    getAlive: () => fighters.filter((f) => !f.dying),
    getAll: () => fighters,
    getHitboxTargets: () => fighters.filter((f) => !f.dying).map((f) => ({ worldPos: f.mesh.position, radius: GOLDEN_FIGHTER_HIT_RADIUS })),
    getMinimapBlips: () => fighters.filter((f) => !f.dying).map((f) => ({ type: 'enemy', kind: GOLDEN_FIGHTER_KIND, worldPos: f.mesh.position })),
    getSnapshots: () => fighters.filter((f) => !f.dying).map((f) => ({ id: f.id, worldPos: f.mesh.position.clone(), hp: f.hp, maxHp: f.maxHp })),
    getCurrentOrder: () => currentOrder,
    clear,
    dispose,
  }
}
