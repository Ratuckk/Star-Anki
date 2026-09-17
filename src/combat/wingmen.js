import * as THREE from 'three'

// ============ ESQUADRÃO STAR FOX (WINGMEN IA DE VOO LIVRE) ============
// Sistema de companheiros de equipe autônomos, vivos e úteis (v0.54.1).
// Até 4 membros permanentes com naves, modelos 3D, cores, personalidades e IA distintas.
// Modelo de Voo Livre (Free-Flight Patrol): voam livremente pelo espaço do trilho e da arena,
// cortam a tela em fly-bys cinematográficos, fazem dogfights independentes com roll dinâmico
// (banking nas curvas) e atacam inimigos sem ficarem colados como satélites na nave do jogador.

export const WINGMAN_PROFILES = [
  {
    id: 0,
    name: 'Falco',
    title: 'Ás Interceptor',
    color: 0x1d4ed8, // azul cobalto
    accentColor: 0x38bdf8, // ciano elétrico
    laserColor: 0x38bdf8,
    homeSide: -1, // viés de patrulha: ala esquerda
    fireInterval: 1.7,
    burstCount: 2,
    burstDelay: 0.14,
    speed: 42,
    modelType: 'interceptor',
    abilityId: 'ram',
    abilityLabel: 'Investida Aríete',
    abilityCooldownBase: 14,
    abilityCooldownFloor: 7,
  },
  {
    id: 1,
    name: 'Peppy',
    title: 'Defensor Blindado',
    color: 0x059669, // verde esmeralda
    accentColor: 0xfbbf24, // ouro
    laserColor: 0x34d399,
    homeSide: 1, // viés de patrulha: ala direita
    fireInterval: 2.4,
    burstCount: 1,
    burstDelay: 0,
    speed: 36,
    modelType: 'bomber',
    abilityId: 'guard',
    abilityLabel: 'Guarda',
    abilityCooldownBase: 20,
    abilityCooldownFloor: 10,
  },
  {
    id: 2,
    name: 'Slippy',
    title: 'Batedor Solar',
    color: 0xea580c, // laranja intenso
    accentColor: 0xfde047, // amarelo brilhante
    laserColor: 0xfbbf24,
    homeSide: -1,
    fireInterval: 1.9,
    burstCount: 2,
    burstDelay: 0.16,
    speed: 38,
    modelType: 'scout',
    abilityId: 'repair',
    abilityLabel: 'Reparo de Campo',
    abilityCooldownBase: 18,
    abilityCooldownFloor: 9,
  },
  {
    id: 3,
    name: 'Phantom',
    title: 'Vanguarda Fantasma',
    color: 0x7c3aed, // roxo estelar
    accentColor: 0xf43f5e, // rosa neon
    laserColor: 0xe879f9,
    homeSide: 1,
    fireInterval: 1.8,
    burstCount: 2,
    burstDelay: 0.12,
    speed: 45,
    modelType: 'stealth',
    abilityId: 'assist',
    abilityLabel: 'Carga Compartilhada',
    abilityCooldownBase: 16,
    abilityCooldownFloor: 8,
  },
]

// Chance de entrar em dogfight quando um alvo está ao alcance (evita a "perfeição" robótica de
// engajar todo inimigo elegível na primeira oportunidade). Espalhamento de mira dá tiros imperfeitos.
const ENGAGEMENT_CHANCE = 0.45
const AIM_SPREAD_RAD = 0.085

// Taxa MÁXIMA de giro (rad/s) usada por quaternion.rotateTowards — pedido do usuário: as naves
// estavam fazendo "piruetas" (giro instantâneo no próprio eixo) sempre que o alvo/waypoint mudava
// de direção. Um passo angular capado por frame faz uma reversão de rumo virar curva larga (leva
// mais tempo pra virar mais), não um giro rápido de corpo inteiro — bem mais próximo de como um
// piloto de verdade manobra.
const CRUISE_TURN_RATE = 2.0 // ~115°/s — patrulha/escolta/regroup/flyby
const AIM_TURN_RATE = 3.0 // ~172°/s — dogfight/investida (mais responsivo, ainda não instantâneo)

const WINGMAN_LASER_SPEED = 125
const WINGMAN_LASER_LIFETIME = 1.8
const WINGMAN_LASER_DAMAGE = 1
const FORWARD_AXIS = new THREE.Vector3(0, 0, 1)

// ============ HABILIDADES ÚNICAS DO ESQUADRÃO ============
// Uma ação autônoma por piloto (ver PLANO_HABILIDADES_ESQUADRAO.md), cada uma com cooldown
// próprio (abilityCooldownBase, reduzido por carta até abilityCooldownFloor — ver
// applyAbilityCooldownCard). Falco investe em aríete, Peppy dá guarda (escudo), Slippy solta
// orbe de reparo ao acertar um tiro, Phantom acopla pra acelerar o tiro carregado do jogador.
const RAM_MIN_RANGE = 20
const RAM_MAX_RANGE = 45
const RAM_HIT_RADIUS = 2.2
const RAM_DAMAGE = 6
const RAM_DAMAGE_VS_BOSS = 2
const RAM_TIMEOUT_S = 2.5

const GUARD_ESCORT_S = 4.0
const GUARD_TRIGGER_RANGE = 9

const ASSIST_MIN_HOLD_S = 0.35
const ASSIST_MAX_S = 3.0
const ASSIST_CHARGE_MULT = 1.5
const ASSIST_EXTRA_TARGETS = 1

const ESCORT_SIDE_OFFSET = 3.0
const ESCORT_UP_OFFSET = 0.6
const ESCORT_FORWARD_OFFSET = 2.5

// ============ CONSTRUTORES DE MODELOS 3D ÚNICOS ============

function createThrusterLight(color) {
  const geo = new THREE.CylinderGeometry(0.12, 0.18, 0.45, 8)
  geo.rotateX(Math.PI / 2)
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
  return new THREE.Mesh(geo, mat)
}

function buildInterceptorShip(profile) {
  const group = new THREE.Group()
  const hullMat = new THREE.MeshPhongMaterial({ color: profile.color, flatShading: true })
  const accentMat = new THREE.MeshPhongMaterial({ color: profile.accentColor, flatShading: true })
  const cockpitMat = new THREE.MeshBasicMaterial({ color: profile.accentColor })

  // Fuselagem esguia pontiaguda
  const bodyGeo = new THREE.ConeGeometry(0.35, 2.4, 4)
  bodyGeo.rotateX(-Math.PI / 2)
  const body = new THREE.Mesh(bodyGeo, hullMat)
  group.add(body)

  // Asas em flecha invertida / interceptor
  const wingGeo = new THREE.BoxGeometry(3.4, 0.06, 0.9)
  const wings = new THREE.Mesh(wingGeo, hullMat)
  wings.position.set(0, 0, -0.2)
  group.add(wings)

  // Canards dianteiros
  const canardGeo = new THREE.BoxGeometry(1.2, 0.05, 0.35)
  const canards = new THREE.Mesh(canardGeo, accentMat)
  canards.position.set(0, 0.04, 0.65)
  group.add(canards)

  // Cockpit
  const cockpitGeo = new THREE.BoxGeometry(0.24, 0.22, 0.7)
  const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat)
  cockpit.position.set(0, 0.15, 0.2)
  group.add(cockpit)

  // Estabilizadores verticais duplos
  const finGeo = new THREE.BoxGeometry(0.05, 0.45, 0.5)
  const finL = new THREE.Mesh(finGeo, accentMat)
  finL.position.set(-0.5, 0.25, -0.7)
  finL.rotation.z = -0.2
  const finR = new THREE.Mesh(finGeo, accentMat)
  finR.position.set(0.5, 0.25, -0.7)
  finR.rotation.z = 0.2
  group.add(finL, finR)

  // Propulsores duplos
  const thrusterL = createThrusterLight(profile.accentColor)
  thrusterL.position.set(-0.35, 0, -1.2)
  const thrusterR = createThrusterLight(profile.accentColor)
  thrusterR.position.set(0.35, 0, -1.2)
  group.add(thrusterL, thrusterR)

  group.scale.setScalar(1.0)
  return { mesh: group, thrusters: [thrusterL, thrusterR] }
}

function buildBomberShip(profile) {
  const group = new THREE.Group()
  const hullMat = new THREE.MeshPhongMaterial({ color: profile.color, flatShading: true })
  const accentMat = new THREE.MeshPhongMaterial({ color: profile.accentColor, flatShading: true })
  const cockpitMat = new THREE.MeshBasicMaterial({ color: profile.accentColor })

  // Fuselagem robusta e chanfrada
  const bodyGeo = new THREE.BoxGeometry(0.85, 0.5, 2.1)
  const body = new THREE.Mesh(bodyGeo, hullMat)
  group.add(body)

  // Blindagem dianteira
  const noseGeo = new THREE.ConeGeometry(0.55, 0.8, 4)
  noseGeo.rotateX(-Math.PI / 2)
  const nose = new THREE.Mesh(noseGeo, accentMat)
  nose.position.set(0, 0, 1.25)
  group.add(nose)

  // Asas largas e pesadas
  const wingGeo = new THREE.BoxGeometry(4.2, 0.16, 1.3)
  const wings = new THREE.Mesh(wingGeo, hullMat)
  wings.position.set(0, 0, -0.15)
  group.add(wings)

  // Pods de canhões pesados nas asas
  const cannonGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.3, 8)
  cannonGeo.rotateX(Math.PI / 2)
  const cannonL = new THREE.Mesh(cannonGeo, accentMat)
  cannonL.position.set(-1.8, -0.05, 0.1)
  const cannonR = new THREE.Mesh(cannonGeo, accentMat)
  cannonR.position.set(1.8, -0.05, 0.1)
  group.add(cannonL, cannonR)

  // Cockpit
  const cockpitGeo = new THREE.BoxGeometry(0.38, 0.28, 0.6)
  const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat)
  cockpit.position.set(0, 0.28, 0.15)
  group.add(cockpit)

  // Propulsor pesado
  const thrusterL = createThrusterLight(profile.laserColor)
  thrusterL.position.set(-0.25, 0, -1.15)
  const thrusterR = createThrusterLight(profile.laserColor)
  thrusterR.position.set(0.25, 0, -1.15)
  group.add(thrusterL, thrusterR)

  group.scale.setScalar(0.95)
  return { mesh: group, thrusters: [thrusterL, thrusterR] }
}

function buildScoutShip(profile) {
  const group = new THREE.Group()
  const hullMat = new THREE.MeshPhongMaterial({ color: profile.color, flatShading: true })
  const accentMat = new THREE.MeshPhongMaterial({ color: profile.accentColor, flatShading: true })
  const cockpitMat = new THREE.MeshBasicMaterial({ color: profile.accentColor })

  // Fuselagem compacta e arredondada
  const bodyGeo = new THREE.CylinderGeometry(0.4, 0.45, 1.8, 6)
  bodyGeo.rotateX(Math.PI / 2)
  const body = new THREE.Mesh(bodyGeo, hullMat)
  group.add(body)

  // Bico com sensor
  const noseGeo = new THREE.ConeGeometry(0.4, 0.7, 6)
  noseGeo.rotateX(-Math.PI / 2)
  const nose = new THREE.Mesh(noseGeo, accentMat)
  nose.position.set(0, 0, 1.15)
  group.add(nose)

  // Asas em V (diedro positivo)
  const wingGeo = new THREE.BoxGeometry(1.6, 0.08, 0.8)
  const wingL = new THREE.Mesh(wingGeo, hullMat)
  wingL.position.set(-0.95, 0.18, -0.2)
  wingL.rotation.z = 0.22
  const wingR = new THREE.Mesh(wingGeo, hullMat)
  wingR.position.set(0.95, 0.18, -0.2)
  wingR.rotation.z = -0.22
  group.add(wingL, wingR)

  // Cockpit abobadado
  const cockpitGeo = new THREE.SphereGeometry(0.3, 8, 8)
  const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat)
  cockpit.position.set(0, 0.22, 0.25)
  group.add(cockpit)

  // Propulsor central
  const thruster = createThrusterLight(profile.laserColor)
  thruster.position.set(0, 0, -1.0)
  group.add(thruster)

  group.scale.setScalar(0.92)
  return { mesh: group, thrusters: [thruster] }
}

function buildStealthShip(profile) {
  const group = new THREE.Group()
  const hullMat = new THREE.MeshPhongMaterial({ color: profile.color, flatShading: true })
  const accentMat = new THREE.MeshPhongMaterial({ color: profile.accentColor, flatShading: true })
  const cockpitMat = new THREE.MeshBasicMaterial({ color: profile.accentColor })

  // Fuselagem angular em facetas de diamante
  const bodyGeo = new THREE.ConeGeometry(0.5, 2.2, 4)
  bodyGeo.rotateX(-Math.PI / 2)
  bodyGeo.rotateZ(Math.PI / 4)
  const body = new THREE.Mesh(bodyGeo, hullMat)
  group.add(body)

  // Asas enflechadas em delta furtivo
  const wingGeo = new THREE.BoxGeometry(3.8, 0.06, 1.4)
  const wings = new THREE.Mesh(wingGeo, hullMat)
  wings.position.set(0, -0.05, -0.3)
  group.add(wings)

  // Pontas de asa anguladas para baixo
  const tipGeo = new THREE.BoxGeometry(0.6, 0.05, 0.8)
  const tipL = new THREE.Mesh(tipGeo, accentMat)
  tipL.position.set(-1.95, -0.15, -0.35)
  tipL.rotation.z = -0.45
  const tipR = new THREE.Mesh(tipGeo, accentMat)
  tipR.position.set(1.95, -0.15, -0.35)
  tipR.rotation.z = 0.45
  group.add(tipL, tipR)

  // Cockpit em fenda
  const cockpitGeo = new THREE.BoxGeometry(0.18, 0.16, 0.8)
  const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat)
  cockpit.position.set(0, 0.2, 0.1)
  group.add(cockpit)

  // Propulsor furtivo
  const thrusterL = createThrusterLight(profile.laserColor)
  thrusterL.position.set(-0.25, 0, -1.15)
  const thrusterR = createThrusterLight(profile.laserColor)
  thrusterR.position.set(0.25, 0, -1.15)
  group.add(thrusterL, thrusterR)

  group.scale.setScalar(0.96)
  return { mesh: group, thrusters: [thrusterL, thrusterR] }
}

function buildWingmanShip(profile) {
  switch (profile.modelType) {
    case 'interceptor': return buildInterceptorShip(profile)
    case 'bomber': return buildBomberShip(profile)
    case 'scout': return buildScoutShip(profile)
    case 'stealth': return buildStealthShip(profile)
    default: return buildInterceptorShip(profile)
  }
}

// ============ SISTEMA PRINCIPAL DO ESQUADRÃO LIVRE ============

export function createSquadronSystem(scene, rail, effects, enemies) {
  const activeWingmen = []
  const activeLasers = []
  let elapsed = 0
  let chargeHeldTimer = 0

  const laserGeometry = new THREE.CylinderGeometry(0.09, 0.09, 1.4, 6)
  laserGeometry.rotateX(Math.PI / 2)

  // Multiplicador de cooldown por piloto (id 0-3), reduzido pelas cartas "Vínculo" — mora no
  // sistema (não na instância do wingman) pra sobreviver a remoção/respawn via debug.
  const abilityCooldownMultByProfileId = [1, 1, 1, 1]

  function applyAbilityCooldownCard(profileId) {
    const profile = WINGMAN_PROFILES[profileId]
    if (!profile) return
    const floorRatio = profile.abilityCooldownFloor / profile.abilityCooldownBase
    abilityCooldownMultByProfileId[profileId] = Math.max(floorRatio, abilityCooldownMultByProfileId[profileId] * 0.75)
  }

  function abilityCooldownFor(profile) {
    return profile.abilityCooldownBase * abilityCooldownMultByProfileId[profile.id]
  }

  function getAbilityStates() {
    return WINGMAN_PROFILES.map((profile) => {
      const cooldownTotal = abilityCooldownFor(profile)
      const w = activeWingmen.find((x) => x.profile.id === profile.id)
      if (!w) {
        return {
          id: profile.id, abilityId: profile.abilityId, name: profile.name, color: profile.accentColor,
          recruited: false, ready: false, active: false, cooldownRemaining: cooldownTotal, cooldownTotal,
        }
      }
      return {
        id: profile.id, abilityId: profile.abilityId, name: profile.name, color: profile.accentColor,
        recruited: true,
        ready: !w.abilityActive && w.abilityCooldown <= 0,
        active: w.abilityActive,
        cooldownRemaining: Math.max(0, w.abilityCooldown),
        cooldownTotal,
      }
    })
  }

  function getAssistChargeMult() {
    return activeWingmen.some((w) => w.abilityActive && w.escortKind === 'assist') ? ASSIST_CHARGE_MULT : 1
  }

  // Quantos alvos extras de trava do tiro teleguiado a Carga Compartilhada do Phantom concede
  // enquanto acoplado — empilha com a carta 'more-homing-targets', o teto (HOMING_MAX_TARGETS_CAP)
  // é respeitado do lado de fora (game-loop.js), aqui é só o bônus bruto.
  function getAssistExtraTargets() {
    return activeWingmen.some((w) => w.abilityActive && w.escortKind === 'assist') ? ASSIST_EXTRA_TARGETS : 0
  }

  function spawnMember(profileId) {
    const profile = WINGMAN_PROFILES[profileId]
    if (!profile) return null
    if (activeWingmen.some((w) => w.profile.id === profile.id)) return null

    const { mesh, thrusters } = buildWingmanShip(profile)
    const playerPos = rail.getPlayerPosition()
    const frame = rail.getFrameAt(0)
    
    // Posição inicial no espaço
    const spawnPos = playerPos.clone()
      .addScaledVector(frame.right, profile.homeSide * (8 + Math.random() * 6))
      .addScaledVector(frame.up, (Math.random() * 2 - 1) * 3)
      .addScaledVector(frame.forward, 10 + Math.random() * 15)
    mesh.position.copy(spawnPos)
    mesh.lookAt(spawnPos.clone().add(frame.forward))
    scene.add(mesh)

    const laserMaterial = new THREE.MeshBasicMaterial({ color: profile.laserColor })

    const wingman = {
      profile,
      mesh,
      thrusters,
      laserMaterial,
      state: 'patrol', // 'patrol' | 'flyby' | 'dogfight' | 'regroup'
      stateTimer: 0,
      velocity: frame.forward.clone().multiplyScalar(profile.speed),
      smoothRoll: 0,
      patrolTarget: spawnPos.clone(),
      nextWaypointTimer: 0.6 + Math.random() * 1.2,
      flybyCooldown: 6.0 + Math.random() * 6.0,
      targetEnemy: null,
      fireCooldown: 1.8 + Math.random() * 1.6,
      burstRemaining: 0,
      burstTimer: 0,
      breakTurnAngle: (Math.random() > 0.5 ? 1 : -1) * (0.8 + Math.random() * 0.5),
      weavePhase: Math.random() * Math.PI * 2,
      weaveFreq: 0.11 + Math.random() * 0.07,
      weaveAmp: 2.6 + Math.random() * 1.8,
      // habilidade única (ver seção "HABILIDADES ÚNICAS DO ESQUADRÃO" acima): começa na metade
      // do cooldown, não pronta de cara no primeiro segundo de jogo.
      abilityCooldown: abilityCooldownFor(profile) * 0.5,
      abilityActive: false,
      abilityTimer: 0,
      abilityApplied: false,
      escortKind: null, // 'guard' | 'assist' — só usado quando state === 'escort'
    }

    activeWingmen.push(wingman)
    if (effects && effects.wingmanSpawn) {
      effects.wingmanSpawn(mesh.position)
    }
    return wingman
  }

  function removeMember(profileId) {
    const index = activeWingmen.findIndex((w) => w.profile.id === profileId)
    if (index === -1) return
    const w = activeWingmen.splice(index, 1)[0]
    scene.remove(w.mesh)
    w.laserMaterial.dispose()
  }

  function setWingmanCount(n) {
    const targetCount = Math.max(0, Math.min(4, n))
    for (let i = 0; i < targetCount; i += 1) {
      if (!activeWingmen.some((w) => w.profile.id === i)) {
        spawnMember(i)
      }
    }
    while (activeWingmen.length > targetCount) {
      const last = activeWingmen[activeWingmen.length - 1]
      removeMember(last.profile.id)
    }
  }

  let squadronCommandMode = 'free' // 'free' | 'focus'
  let squadronFocusTargets = []

  function getAliveEnemies() {
    const alive = []
    if (enemies && enemies.getAlive) {
      for (const e of enemies.getAlive()) if (!e.dying && e.mesh) alive.push(e)
    }
    if (enemies && enemies.getGoldenAlive) {
      for (const g of enemies.getGoldenAlive()) if (!g.dying && g.mesh) alive.push(g)
    }
    return alive
  }

  function toggleCommand(lockedTargets = [], playerPos) {
    if (squadronCommandMode === 'free') {
      squadronCommandMode = 'focus'
      const validLocked = Array.isArray(lockedTargets) ? lockedTargets.filter((e) => e && !e.dying && e.mesh) : []

      if (validLocked.length > 0) {
        squadronFocusTargets = validLocked
      } else {
        const alive = getAliveEnemies()
        if (alive.length > 0 && playerPos) {
          alive.sort((a, b) => playerPos.distanceTo(a.mesh.position) - playerPos.distanceTo(b.mesh.position))
          squadronFocusTargets = [alive[0]]
        } else {
          squadronFocusTargets = []
        }
      }

      // Atribui alvos imediatamente para todos os caças ativos — exceto quem estiver no meio de
      // uma habilidade única (investida/escolta): puxar o state pra 'dogfight' à força deixaria
      // abilityActive travado em true pra sempre (nada mais o desligaria), soft-lock permanente
      // daquele piloto. Deixa a habilidade terminar sozinha, o comando de foco pega ele depois.
      for (let i = 0; i < activeWingmen.length; i++) {
        const w = activeWingmen[i]
        if (w.abilityActive) continue
        if (squadronFocusTargets.length > 0) {
          const chosen = squadronFocusTargets.length === 1
            ? squadronFocusTargets[0]
            : squadronFocusTargets[Math.floor(Math.random() * squadronFocusTargets.length)]
          w.targetEnemy = chosen
          w.state = 'dogfight'
          w.stateTimer = 0
          w.burstRemaining = w.profile.burstCount * 2
          w.burstTimer = 0
          w.fireCooldown = 0
        }
      }

      return {
        mode: 'focus',
        targetCount: squadronFocusTargets.length,
        hasLocked: validLocked.length > 0,
      }
    } else {
      squadronCommandMode = 'free'
      squadronFocusTargets = []
      for (const w of activeWingmen) {
        if (w.abilityActive) continue // mesmo cuidado do bloco de foco acima
        w.state = 'patrol'
        w.stateTimer = 0
        w.targetEnemy = null
        w.nextWaypointTimer = 0.4
      }
      return { mode: 'free' }
    }
  }

  function clearSquadron() {
    squadronFocusTargets = []
    while (activeWingmen.length > 0) {
      const w = activeWingmen.pop()
      scene.remove(w.mesh)
      w.laserMaterial.dispose()
    }
  }

  function fireWingmanLaser(wingman, origin, direction) {
    const mesh = new THREE.Mesh(laserGeometry, wingman.laserMaterial)
    mesh.position.copy(origin)
    mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, direction.clone().normalize())
    scene.add(mesh)

    activeLasers.push({
      mesh,
      velocity: direction.clone().normalize().multiplyScalar(WINGMAN_LASER_SPEED),
      traveled: 0,
      life: WINGMAN_LASER_LIFETIME,
      color: wingman.profile.laserColor,
      damage: WINGMAN_LASER_DAMAGE,
      owner: wingman, // usado pelo proc do Reparo de Campo (Slippy) na resolução de acerto
    })

    if (effects && effects.muzzleFlash) {
      effects.muzzleFlash(origin, direction)
    }
  }

  // ============ TICK DE ATUALIZAÇÃO DA IA DE VOO LIVRE ============

  function update(dt, playerPos, frame, opts = {}) {
    elapsed += dt
    const boostActive = !!opts.boostActive
    const homingCharging = !!opts.homingCharging
    const shieldNotFull = !!opts.shieldNotFull
    const inArena = rail.isArena()

    chargeHeldTimer = homingCharging ? chargeHeldTimer + dt : 0

    // acumuladores das habilidades (declarados aqui, não só depois do loop de wingmen, porque
    // a investida do Falco resolve o acerto DENTRO do próprio loop de estados)
    let enemyKills = 0
    let enemyKillPoints = 0
    let bossDefeated = false
    let bossHitWorldPos = null
    let goldenSpecialHit = false
    let goldenHitWorldPos = null
    let shieldGrants = 0
    const healOrbSpawns = []

    for (let idx = 0; idx < activeWingmen.length; idx++) {
      const w = activeWingmen[idx]
      w.stateTimer += dt
      w.fireCooldown -= dt
      w.flybyCooldown -= dt
      if (!w.abilityActive) w.abilityCooldown = Math.max(0, w.abilityCooldown - dt)

      // Fogo das turbinas reage a boost ou manobras fly-by
      const isThrusting = boostActive || w.state === 'flyby' || w.state === 'dogfight'
      for (const t of w.thrusters) {
        const boostScale = isThrusting ? 2.5 : 1.0 + Math.sin(elapsed * 16 + w.profile.id) * 0.25
        t.scale.set(isThrusting ? 1.4 : 1.0, isThrusting ? 1.4 : 1.0, boostScale)
      }

      const distToPlayer = w.mesh.position.distanceTo(playerPos)

      // ============ MÁQUINA DE ESTADOS DA IA LIVRE ============

      // 1. Regroup se ficou longe demais do jogador
      const maxDistance = inArena ? 160 : 90
      if (distToPlayer > maxDistance && w.state !== 'regroup') {
        w.state = 'regroup'
        w.stateTimer = 0
        w.targetEnemy = null
      }

      if (w.state === 'regroup') {
        // Retorna suavemente em curva para o volume de patrulha visível
        const targetSide = w.profile.homeSide * (7 + Math.random() * 5)
        w.patrolTarget.copy(playerPos)
          .addScaledVector(frame.right, targetSide)
          .addScaledVector(frame.up, 2)
          .addScaledVector(frame.forward, inArena ? 25 : 20)

        if (distToPlayer < (inArena ? 60 : 40) || w.stateTimer > 3.0) {
          w.state = 'patrol'
          w.stateTimer = 0
          w.nextWaypointTimer = 0
        }
      } else if (w.state === 'patrol') {
        // Habilidades únicas de Peppy (Guarda) e Phantom (Carga Compartilhada): saem da patrulha
        // pra uma posição de escolta junto ao jogador quando prontas e a condição de cada uma bate.
        if (!w.abilityActive && w.abilityCooldown <= 0) {
          if (w.profile.abilityId === 'guard' && shieldNotFull) {
            w.state = 'escort'
            w.escortKind = 'guard'
            w.stateTimer = 0
            w.abilityActive = true
            w.abilityTimer = 0
            w.abilityApplied = false
          } else if (w.profile.abilityId === 'assist' && homingCharging && chargeHeldTimer >= ASSIST_MIN_HOLD_S) {
            w.state = 'escort'
            w.escortKind = 'assist'
            w.stateTimer = 0
            w.abilityActive = true
            w.abilityTimer = 0
          }
        }

        // Se a habilidade acabou de assumir (state virou 'escort' acima), o resto do corpo da
        // patrulha não roda neste frame — só entra aqui se continuar em 'patrol'.
        if (w.state === 'patrol') {
        // Se estiver em modo foco, prioriza os alvos táticos imediatamente
        if (squadronCommandMode === 'focus') {
          squadronFocusTargets = squadronFocusTargets.filter((t) => t && !t.dying && t.mesh)
          if (squadronFocusTargets.length === 0) {
            const alive = getAliveEnemies()
            if (alive.length > 0 && playerPos) {
              alive.sort((a, b) => playerPos.distanceTo(a.mesh.position) - playerPos.distanceTo(b.mesh.position))
              squadronFocusTargets = [alive[0]]
            }
          }
          if (squadronFocusTargets.length > 0) {
            w.targetEnemy = squadronFocusTargets.length === 1
              ? squadronFocusTargets[0]
              : squadronFocusTargets[Math.floor(Math.random() * squadronFocusTargets.length)]
            w.state = 'dogfight'
            w.stateTimer = 0
            w.burstRemaining = w.profile.burstCount * 2
            w.burstTimer = 0
          }
        }

        // ============ VOO LIVRE E PATRULHA (fluida e cinematográfica, sem saltos aleatórios) ============
        w.nextWaypointTimer -= dt

        // FLY-BY periódico rasante na frente da câmera: dispara direto quando o cooldown zera
        // (sem sorteio por frame — evita o gatilho quase-instantâneo que lia como erro/estranho)
        if (!inArena && squadronCommandMode === 'free' && w.flybyCooldown <= 0) {
          w.state = 'flyby'
          w.stateTimer = 0
          w.flybyCooldown = 9.0 + Math.random() * 7.0
          // Corta diagonalmente a tela SEM teleport (parte da posição atual acelerando pro lado oposto)
          const destSide = -w.profile.homeSide * 18
          w.patrolTarget.copy(playerPos)
            .addScaledVector(frame.right, destSide)
            .addScaledVector(frame.up, (Math.random() * 2 - 1) * 3 + 3)
            .addScaledVector(frame.forward, 36)
        } else if (w.nextWaypointTimer <= 0) {
          // Novo waypoint por deslocamento LIMITADO a partir do alvo anterior (não um sorteio livre
          // no volume inteiro) — produz trajetórias fluidas em curva, sem reversões bruscas de rumo.
          if (!inArena) {
            const prevSide = THREE.MathUtils.clamp(w.patrolTarget.clone().sub(playerPos).dot(frame.right), -16, 16)
            const prevVert = THREE.MathUtils.clamp(w.patrolTarget.clone().sub(playerPos).dot(frame.up), -4, 9)
            const side = THREE.MathUtils.clamp(prevSide + (Math.random() * 2 - 1) * 9, -16, 16)
            const vert = THREE.MathUtils.clamp(prevVert + (Math.random() * 2 - 1) * 4, -4, 9)
            const ahead = 14 + Math.random() * 28
            w.patrolTarget.copy(playerPos)
              .addScaledVector(frame.right, side)
              .addScaledVector(frame.up, vert)
              .addScaledVector(frame.forward, ahead)
            w.nextWaypointTimer = 4.5 + Math.random() * 3.0
          } else {
            // No modo all-range: continua o arco de voo em vez de teleportar pra um ângulo aleatório novo
            const center = rail.getArenaCenter()
            const relPrev = w.patrolTarget.clone().sub(center)
            const prevAngle = Math.atan2(relPrev.z, relPrev.x)
            const angle = prevAngle + (Math.random() * 2 - 1) * (Math.PI * 0.45)
            const radius = 35 + Math.random() * 60
            const height = (Math.random() * 2 - 1) * 16
            w.patrolTarget.set(
              center.x + Math.cos(angle) * radius,
              center.y + height,
              center.z + Math.sin(angle) * radius
            )
            w.nextWaypointTimer = 4.5 + Math.random() * 3.0
          }
        }

        // Checa se há inimigos para atacar (DOGFIGHT) — alcance menor e chance de engajar,
        // pra não perseguir/abater tudo que aparece no radar com precisão robótica.
        if (w.fireCooldown <= 0) {
          const alive = getAliveEnemies()
          if (alive.length > 0 && Math.random() < ENGAGEMENT_CHANCE) {
            const candidates = alive.filter((e) => {
              const rel = e.mesh.position.clone().sub(w.mesh.position)
              const dotForward = rel.clone().normalize().dot(frame.forward)
              return inArena ? rel.length() < 65 : (dotForward > 0.25 && rel.length() < 70)
            })
            if (candidates.length > 0) {
              // Escolhe o alvo mais próximo do caça
              candidates.sort((a, b) => w.mesh.position.distanceTo(a.mesh.position) - w.mesh.position.distanceTo(b.mesh.position))
              w.targetEnemy = candidates[0]
              w.state = 'dogfight'
              w.stateTimer = 0
              w.burstRemaining = w.profile.burstCount
              w.burstTimer = 0
            } else {
              w.fireCooldown = 0.6 + Math.random() * 0.6
            }
          } else {
            w.fireCooldown = 0.6 + Math.random() * 0.6
          }
        }
        }
      } else if (w.state === 'flyby') {
        // Rasante rápido cortando a tela
        if (w.stateTimer > 1.9 || w.mesh.position.distanceTo(w.patrolTarget) < 6.0) {
          w.state = 'patrol'
          w.stateTimer = 0
          w.nextWaypointTimer = 0
        }
      } else if (w.state === 'dogfight') {
        // ============ PERSEGUIÇÃO E DOGFIGHT ============
        const enemyLost = !w.targetEnemy || w.targetEnemy.dying || !w.targetEnemy.mesh ||
          w.mesh.position.distanceTo(w.targetEnemy.mesh.position) > 150 ||
          w.stateTimer > 2.8

        if (enemyLost) {
          w.state = 'patrol'
          w.stateTimer = 0
          w.targetEnemy = null
          w.fireCooldown = squadronCommandMode === 'focus' ? 0.2 : w.profile.fireInterval + Math.random() * 0.4
          w.nextWaypointTimer = 0
          if (squadronCommandMode === 'focus') {
            squadronFocusTargets = squadronFocusTargets.filter((t) => t && !t.dying && t.mesh)
          }
        } else {
          // Persegue o inimigo em curva de interceptação
          const toEnemy = w.targetEnemy.mesh.position.clone().sub(w.mesh.position)
          const dist = toEnemy.length()
          const aimDir = toEnemy.clone().normalize()

          // Falco: converte esse engajamento numa investida em aríete quando a habilidade está
          // pronta e a distância dá espaço pra uma corrida de aproximação limpa.
          if (w.profile.abilityId === 'ram' && !w.abilityActive && w.abilityCooldown <= 0 &&
              dist >= RAM_MIN_RANGE && dist <= RAM_MAX_RANGE) {
            w.state = 'ram'
            w.stateTimer = 0
            w.abilityActive = true
            w.abilityTimer = 0
          } else {
          // Mira e aproxima-se mantendo standoff de combate
          w.patrolTarget.copy(w.targetEnemy.mesh.position).addScaledVector(aimDir, -16)

          // Disparo da rajada, com leve espalhamento de mira (tiros imperfeitos, não robóticos)
          w.burstTimer -= dt
          if (w.burstTimer <= 0 && w.burstRemaining > 0 && dist < 90) {
            w.burstRemaining -= 1
            w.burstTimer = w.profile.burstDelay || 0.14
            const spreadDir = aimDir.clone()
              .addScaledVector(frame.right, (Math.random() * 2 - 1) * AIM_SPREAD_RAD)
              .addScaledVector(frame.up, (Math.random() * 2 - 1) * AIM_SPREAD_RAD)
              .normalize()
            const muzzleOffset = w.mesh.position.clone().addScaledVector(spreadDir, 1.3)
            fireWingmanLaser(w, muzzleOffset, spreadDir)
          }

          if (w.burstRemaining <= 0) {
            // Retorna suavemente à patrulha mantendo o voo planado estável
            w.state = 'patrol'
            w.stateTimer = 0
            w.fireCooldown = squadronCommandMode === 'focus' ? 0.3 : w.profile.fireInterval + Math.random() * 0.5
            w.nextWaypointTimer = squadronCommandMode === 'focus' ? 0.4 : 1.6
          }
          }
        }
      } else if (w.state === 'ram') {
        // ============ INVESTIDA ARÍETE (Falco) ============
        w.abilityTimer += dt
        const target = w.targetEnemy
        const targetLost = !target || target.dying || !target.mesh
        if (targetLost) {
          w.abilityActive = false
          w.abilityCooldown = abilityCooldownFor(w.profile)
          w.state = 'patrol'
          w.stateTimer = 0
          w.targetEnemy = null
          w.nextWaypointTimer = 0
        } else {
          w.patrolTarget.copy(target.mesh.position)
          const distNow = w.mesh.position.distanceTo(target.mesh.position)
          if (distNow < RAM_HIT_RADIUS || w.abilityTimer > RAM_TIMEOUT_S) {
            if (distNow < RAM_HIT_RADIUS && enemies && enemies.resolveProjectileHit) {
              const isBig = target.kind === 'boss' || target.kind === 'golden'
              const hit = enemies.resolveProjectileHit(w.mesh.position, target.mesh.position, {
                damage: isBig ? RAM_DAMAGE_VS_BOSS : RAM_DAMAGE,
                isHoming: false,
                hitBuffer: RAM_HIT_RADIUS,
              })
              if (hit) {
                if (effects && effects.hitSpark) effects.hitSpark(target.mesh.position, w.profile.laserColor)
                if (effects && effects.shockwave) effects.shockwave(target.mesh.position, w.profile.laserColor, 0.6)
                if (hit.killed) {
                  enemyKills++
                  enemyKillPoints += (hit.enemyKillPoints || 0)
                }
                if (hit.bossDefeated) {
                  bossDefeated = true
                  bossHitWorldPos = hit.worldPos ? hit.worldPos.clone() : target.mesh.position.clone()
                }
                if (hit.goldenSpecialHit) {
                  goldenSpecialHit = true
                  goldenHitWorldPos = hit.worldPos ? hit.worldPos.clone() : target.mesh.position.clone()
                }
              }
            }
            w.abilityActive = false
            w.abilityCooldown = abilityCooldownFor(w.profile)
            w.state = 'patrol'
            w.stateTimer = 0
            w.targetEnemy = null
            w.nextWaypointTimer = 0
          }
        }
      } else if (w.state === 'escort') {
        // ============ ESCOLTA (Peppy: Guarda / Phantom: Carga Compartilhada) ============
        w.abilityTimer += dt
        const side = w.profile.homeSide * ESCORT_SIDE_OFFSET
        w.patrolTarget.copy(playerPos)
          .addScaledVector(frame.right, side)
          .addScaledVector(frame.up, ESCORT_UP_OFFSET)
          .addScaledVector(frame.forward, ESCORT_FORWARD_OFFSET)

        if (w.escortKind === 'guard') {
          if (!w.abilityApplied && w.mesh.position.distanceTo(playerPos) < GUARD_TRIGGER_RANGE) {
            w.abilityApplied = true
            shieldGrants += 1
          }
          if (w.abilityTimer > GUARD_ESCORT_S) {
            w.abilityActive = false
            w.abilityApplied = false
            w.abilityCooldown = abilityCooldownFor(w.profile)
            w.state = 'patrol'
            w.stateTimer = 0
            w.nextWaypointTimer = 0
          }
        } else if (w.escortKind === 'assist') {
          if (!homingCharging || w.abilityTimer > ASSIST_MAX_S) {
            w.abilityActive = false
            w.abilityCooldown = abilityCooldownFor(w.profile)
            w.state = 'patrol'
            w.stateTimer = 0
            w.nextWaypointTimer = 0
          }
        }
      }

      // ============ FÍSICA DE VOO COM ACELERAÇÃO E ROLL (BANKING) ============

      // Vetor de direção até o alvo atual, com um leve ondular contínuo (weave) só na patrulha
      // livre — dá vida cinematográfica ao voo entre waypoints em vez de retas mecânicas.
      const effectiveTarget = w.patrolTarget.clone()
      if (w.state === 'patrol') {
        const weave = Math.sin(elapsed * w.weaveFreq * Math.PI * 2 + w.weavePhase) * w.weaveAmp
        effectiveTarget.addScaledVector(frame.right, weave * 0.6)
        effectiveTarget.addScaledVector(frame.up, weave * 0.35)
      }
      const toTarget = effectiveTarget.sub(w.mesh.position)
      const targetDist = toTarget.length()
      const targetDir = targetDist > 1e-4 ? toTarget.clone().normalize() : frame.forward.clone()

      // Velocidade de cruzeiro modulada pelo estado e por boost
      let cruiseSpeed = w.profile.speed
      if (!inArena) {
        // No rail, compensa a velocidade de avanço do mundo (+48u/s) e acelera se ficar para trás
        // do JOGADOR — não aplica durante 'ram': ali o alvo é um INIMIGO (não o jogador), então
        // "distToPlayer > 35" não tem relação nenhuma com a corrida de investida, e empilhado com
        // o *2.2 da investida (abaixo) dava velocidades de até ~268u/s — fechava os 45u máximos de
        // alcance em ~0.17s, um teleporte, não uma investida com peso.
        cruiseSpeed += 48
        if (w.state !== 'ram' && (w.state === 'regroup' || distToPlayer > 35)) cruiseSpeed += 32
      }
      if (boostActive || w.state === 'flyby') cruiseSpeed *= 1.65
      else if (w.state === 'ram') cruiseSpeed *= 2.2
      else if (w.state === 'dogfight') cruiseSpeed *= 1.2
      else if (w.state === 'escort') cruiseSpeed *= 1.3

      const desiredVelocity = targetDir.multiplyScalar(cruiseSpeed)

      // Repulsão suave entre os companheiros para nunca se sobreporem
      for (let otherIdx = 0; otherIdx < activeWingmen.length; otherIdx++) {
        if (otherIdx === idx) continue
        const other = activeWingmen[otherIdx]
        const diff = w.mesh.position.clone().sub(other.mesh.position)
        const distBetween = diff.length()
        if (distBetween > 0.01 && distBetween < 6.0) {
          const push = diff.normalize().multiplyScalar((6.0 - distBetween) * 12)
          desiredVelocity.add(push)
        }
      }

      // Aceleração com inércia suave
      const accelRate = w.state === 'flyby' || w.state === 'ram' ? 6.0 : (w.state === 'dogfight' ? 2.3 : 2.5)
      w.velocity.lerp(desiredVelocity, 1 - Math.exp(-accelRate * dt))
      w.mesh.position.addScaledVector(w.velocity, dt)

      // Orientação: no dogfight/investida mira firme no alvo; na patrulha plana suavemente com roll sutil.
      // IMPORTANTE: usa rotateTowards (passo angular máximo por frame), não slerp por decaimento
      // exponencial — slerp com taxa fixa reorienta em ~0.5-0.8s INDEPENDENTE do ângulo, então uma
      // reversão de rumo grande (waypoint novo, saída de dogfight, troca de estado) virava um giro
      // rápido no próprio eixo ("pirueta") em vez de uma curva. Com passo angular capado, um giro de
      // 180° leva proporcionalmente mais tempo (curva larga) — igual um piloto de verdade vira.
      if ((w.state === 'dogfight' || w.state === 'ram') && w.targetEnemy && w.targetEnemy.mesh && !w.targetEnemy.dying) {
        const toEnemy = w.targetEnemy.mesh.position.clone().sub(w.mesh.position)
        if (toEnemy.lengthSq() > 1e-4) {
          const aimQuat = new THREE.Quaternion().setFromUnitVectors(FORWARD_AXIS, toEnemy.normalize())
          w.mesh.quaternion.rotateTowards(aimQuat, AIM_TURN_RATE * dt)
        }
        w.smoothRoll += (0 - w.smoothRoll) * (1 - Math.exp(-6.0 * dt))
        w.mesh.rotateZ(w.smoothRoll)
      } else {
        const currentSpeed = w.velocity.length()
        if (currentSpeed > 1.0) {
          const moveDir = w.velocity.clone().normalize()
          const moveQuat = new THREE.Quaternion().setFromUnitVectors(FORWARD_AXIS, moveDir)
          w.mesh.quaternion.rotateTowards(moveQuat, CRUISE_TURN_RATE * dt)

          // Banking suave / planado em curvas (inclinando suavemente no máximo ~18° em vez de piruetas)
          const lateralMove = w.velocity.dot(frame.right)
          const targetRoll = THREE.MathUtils.clamp(-lateralMove * 0.015, -0.32, 0.32)
          w.smoothRoll += (targetRoll - w.smoothRoll) * (1 - Math.exp(-3.5 * dt))
          w.mesh.rotateZ(w.smoothRoll)
        }
      }
    }

    // 2. Atualiza os lasers disparados pelos companheiros
    for (let i = activeLasers.length - 1; i >= 0; i--) {
      const laser = activeLasers[i]
      laser.life -= dt
      if (laser.life <= 0) {
        scene.remove(laser.mesh)
        activeLasers.splice(i, 1)
        continue
      }

      const prevPos = laser.mesh.position.clone()
      const step = laser.velocity.clone().multiplyScalar(dt)
      laser.mesh.position.add(step)
      laser.traveled += step.length()

      // Checa colisão com inimigos
      if (enemies && enemies.resolveProjectileHit) {
        const hit = enemies.resolveProjectileHit(prevPos, laser.mesh.position, {
          damage: laser.damage,
          isHoming: false,
          hitBuffer: 0.8,
        })
        if (hit) {
          if (effects && effects.hitSpark) {
            effects.hitSpark(laser.mesh.position, laser.color)
          }
          if (hit.killed) {
            enemyKills++
            enemyKillPoints += (hit.enemyKillPoints || 0)
          }
          if (hit.bossDefeated) {
            bossDefeated = true
            bossHitWorldPos = hit.worldPos ? hit.worldPos.clone() : laser.mesh.position.clone()
          }
          if (hit.goldenSpecialHit) {
            goldenSpecialHit = true
            goldenHitWorldPos = hit.worldPos ? hit.worldPos.clone() : laser.mesh.position.clone()
          }
          // Slippy: o próximo tiro que acertar (mata ou não) depois do cooldown pronto solta um
          // orbe de reparo no ponto do impacto — proc no acerto, não em cada disparo.
          const owner = laser.owner
          if (owner && owner.profile.abilityId === 'repair' && !owner.abilityActive && owner.abilityCooldown <= 0) {
            healOrbSpawns.push(hit.worldPos ? hit.worldPos.clone() : laser.mesh.position.clone())
            owner.abilityCooldown = abilityCooldownFor(owner.profile)
          }
          scene.remove(laser.mesh)
          activeLasers.splice(i, 1)
          continue
        }
      }
    }

    return {
      enemyKills,
      enemyKillPoints,
      bossDefeated,
      bossHitWorldPos,
      goldenSpecialHit,
      goldenHitWorldPos,
      shieldGrants,
      healOrbSpawns,
    }
  }

  // Disparo manual sincronizado de suporte
  function tryFireSupport(direction) {
    for (const w of activeWingmen) {
      if (w.state === 'patrol' || w.state === 'flyby') {
        const muzzlePos = w.mesh.position.clone().addScaledVector(direction, 1.3)
        fireWingmanLaser(w, muzzlePos, direction)
      }
    }
  }

  function clearLasers() {
    for (let i = activeLasers.length - 1; i >= 0; i--) {
      scene.remove(activeLasers[i].mesh)
    }
    activeLasers.length = 0
  }

  function dispose() {
    clearSquadron()
    clearLasers()
    laserGeometry.dispose()
  }

  return {
    update,
    tryFireSupport,
    setWingmanCount,
    spawnMember,
    removeMember,
    clearSquadron,
    clearLasers,
    toggleCommand,
    getCommandMode: () => squadronCommandMode,
    getWingmanPositions: () => activeWingmen.map((w) => w.mesh.position.clone()),
    getWingmanCount: () => activeWingmen.length,
    getActiveMembers: () => activeWingmen.map((w) => ({ id: w.profile.id, name: w.profile.name, title: w.profile.title, color: w.profile.color })),
    getAbilityStates,
    applyAbilityCooldownCard,
    getAssistChargeMult,
    getAssistExtraTargets,
    dispose,
  }
}
