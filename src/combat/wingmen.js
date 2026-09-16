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
    fireInterval: 0.75,
    burstCount: 2,
    burstDelay: 0.12,
    speed: 42,
    modelType: 'interceptor',
  },
  {
    id: 1,
    name: 'Peppy',
    title: 'Defensor Blindado',
    color: 0x059669, // verde esmeralda
    accentColor: 0xfbbf24, // ouro
    laserColor: 0x34d399,
    homeSide: 1, // viés de patrulha: ala direita
    fireInterval: 1.1,
    burstCount: 1,
    burstDelay: 0,
    speed: 36,
    modelType: 'bomber',
  },
  {
    id: 2,
    name: 'Slippy',
    title: 'Batedor Solar',
    color: 0xea580c, // laranja intenso
    accentColor: 0xfde047, // amarelo brilhante
    laserColor: 0xfbbf24,
    homeSide: -1,
    fireInterval: 0.85,
    burstCount: 2,
    burstDelay: 0.14,
    speed: 38,
    modelType: 'scout',
  },
  {
    id: 3,
    name: 'Phantom',
    title: 'Vanguarda Fantasma',
    color: 0x7c3aed, // roxo estelar
    accentColor: 0xf43f5e, // rosa neon
    laserColor: 0xe879f9,
    homeSide: 1,
    fireInterval: 0.8,
    burstCount: 3,
    burstDelay: 0.1,
    speed: 45,
    modelType: 'stealth',
  },
]

const WINGMAN_LASER_SPEED = 125
const WINGMAN_LASER_LIFETIME = 1.8
const WINGMAN_LASER_DAMAGE = 1
const FORWARD_AXIS = new THREE.Vector3(0, 0, 1)

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

  const laserGeometry = new THREE.CylinderGeometry(0.09, 0.09, 1.4, 6)
  laserGeometry.rotateX(Math.PI / 2)

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
      nextWaypointTimer: 0.2 + Math.random() * 0.8,
      flybyCooldown: 4.0 + Math.random() * 5.0,
      targetEnemy: null,
      fireCooldown: 0.5 + Math.random() * 0.5,
      burstRemaining: 0,
      burstTimer: 0,
      breakTurnAngle: (Math.random() > 0.5 ? 1 : -1) * (0.8 + Math.random() * 0.5),
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

      // Atribui alvos imediatamente para todos os caças ativos
      for (let i = 0; i < activeWingmen.length; i++) {
        const w = activeWingmen[i]
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
    })

    if (effects && effects.muzzleFlash) {
      effects.muzzleFlash(origin, direction)
    }
  }

  // ============ TICK DE ATUALIZAÇÃO DA IA DE VOO LIVRE ============

  function update(dt, playerPos, frame, opts = {}) {
    elapsed += dt
    const boostActive = !!opts.boostActive
    const inArena = rail.isArena()

    for (let idx = 0; idx < activeWingmen.length; idx++) {
      const w = activeWingmen[idx]
      w.stateTimer += dt
      w.fireCooldown -= dt
      w.flybyCooldown -= dt

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

        // ============ VOO LIVRE E PATRULHA ============
        w.nextWaypointTimer -= dt

        // Chance periódica de FLY-BY rasante na frente da câmera (somente se não estiver em comando de foco)
        if (!inArena && squadronCommandMode === 'free' && w.flybyCooldown <= 0 && Math.random() < 0.25) {
          w.state = 'flyby'
          w.stateTimer = 0
          w.flybyCooldown = 7.0 + Math.random() * 6.0
          // Corta diagonalmente a tela SEM teleport (parte da posição atual acelerando pro lado oposto)
          const destSide = -w.profile.homeSide * 18
          w.patrolTarget.copy(playerPos)
            .addScaledVector(frame.right, destSide)
            .addScaledVector(frame.up, (Math.random() * 2 - 1) * 3 + 3)
            .addScaledVector(frame.forward, 36)
        } else if (w.nextWaypointTimer <= 0) {
          // Novo waypoint autônomo na zona de patrulha
          if (!inArena) {
            // No modo rail: navega em um volume amplo à frente da nave (-16 a +16 lateral, -4 a +9 vertical, +12 a +42 frente)
            const side = (Math.random() * 2 - 1) * 16
            const vert = (Math.random() * 2 - 1) * 6.5 + 2.5
            const ahead = 14 + Math.random() * 28
            w.patrolTarget.copy(playerPos)
              .addScaledVector(frame.right, side)
              .addScaledVector(frame.up, vert)
              .addScaledVector(frame.forward, ahead)
            w.nextWaypointTimer = 2.4 + Math.random() * 2.2
          } else {
            // No modo all-range: voo 100% livre e independente pela arena
            const center = rail.getArenaCenter()
            const angle = Math.random() * Math.PI * 2
            const radius = 35 + Math.random() * 60
            const height = (Math.random() * 2 - 1) * 16
            w.patrolTarget.set(
              center.x + Math.cos(angle) * radius,
              center.y + height,
              center.z + Math.sin(angle) * radius
            )
            w.nextWaypointTimer = 3.0 + Math.random() * 2.5
          }
        }

        // Checa se há inimigos para atacar (DOGFIGHT)
        if (w.fireCooldown <= 0) {
          const alive = getAliveEnemies()
          if (alive.length > 0) {
            const candidates = alive.filter((e) => {
              const rel = e.mesh.position.clone().sub(w.mesh.position)
              const dotForward = rel.clone().normalize().dot(frame.forward)
              return inArena ? rel.length() < 100 : (dotForward > 0.15 && rel.length() < 120)
            })
            if (candidates.length > 0) {
              // Escolhe o alvo mais próximo do caça
              candidates.sort((a, b) => w.mesh.position.distanceTo(a.mesh.position) - w.mesh.position.distanceTo(b.mesh.position))
              w.targetEnemy = candidates[0]
              w.state = 'dogfight'
              w.stateTimer = 0
              w.burstRemaining = w.profile.burstCount
              w.burstTimer = 0
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

          // Mira e aproxima-se mantendo standoff de combate
          w.patrolTarget.copy(w.targetEnemy.mesh.position).addScaledVector(aimDir, -16)

          // Disparo da rajada
          w.burstTimer -= dt
          if (w.burstTimer <= 0 && w.burstRemaining > 0 && dist < 120) {
            w.burstRemaining -= 1
            w.burstTimer = w.profile.burstDelay || 0.14
            const muzzleOffset = w.mesh.position.clone().addScaledVector(aimDir, 1.3)
            fireWingmanLaser(w, muzzleOffset, aimDir)
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

      // ============ FÍSICA DE VOO COM ACELERAÇÃO E ROLL (BANKING) ============

      // Vetor de direção até o alvo atual
      const toTarget = w.patrolTarget.clone().sub(w.mesh.position)
      const targetDist = toTarget.length()
      const targetDir = targetDist > 1e-4 ? toTarget.clone().normalize() : frame.forward.clone()

      // Velocidade de cruzeiro modulada pelo estado e por boost
      let cruiseSpeed = w.profile.speed
      if (!inArena) {
        // No rail, compensa a velocidade de avanço do mundo (+48u/s) e acelera se ficar para trás
        cruiseSpeed += 48
        if (w.state === 'regroup' || distToPlayer > 35) cruiseSpeed += 32
      }
      if (boostActive || w.state === 'flyby') cruiseSpeed *= 1.65
      else if (w.state === 'dogfight') cruiseSpeed *= 1.2

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
      const accelRate = w.state === 'flyby' ? 6.0 : (w.state === 'dogfight' ? 3.0 : 2.5)
      w.velocity.lerp(desiredVelocity, 1 - Math.exp(-accelRate * dt))
      w.mesh.position.addScaledVector(w.velocity, dt)

      // Orientação: no dogfight mira firme no inimigo; na patrulha plana suavemente com roll sutil
      if (w.state === 'dogfight' && w.targetEnemy && w.targetEnemy.mesh && !w.targetEnemy.dying) {
        const toEnemy = w.targetEnemy.mesh.position.clone().sub(w.mesh.position)
        if (toEnemy.lengthSq() > 1e-4) {
          const aimQuat = new THREE.Quaternion().setFromUnitVectors(FORWARD_AXIS, toEnemy.normalize())
          w.mesh.quaternion.slerp(aimQuat, 1 - Math.exp(-8.5 * dt))
        }
        w.smoothRoll += (0 - w.smoothRoll) * (1 - Math.exp(-6.0 * dt))
        w.mesh.rotateZ(w.smoothRoll)
      } else {
        const currentSpeed = w.velocity.length()
        if (currentSpeed > 1.0) {
          const moveDir = w.velocity.clone().normalize()
          const moveQuat = new THREE.Quaternion().setFromUnitVectors(FORWARD_AXIS, moveDir)
          w.mesh.quaternion.slerp(moveQuat, 1 - Math.exp(-5.0 * dt))

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
          scene.remove(laser.mesh)
          activeLasers.splice(i, 1)
          continue
        }
      }
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

  function dispose() {
    clearSquadron()
    laserGeometry.dispose()
    for (let i = activeLasers.length - 1; i >= 0; i--) {
      scene.remove(activeLasers[i].mesh)
    }
    activeLasers.length = 0
  }

  return {
    update,
    tryFireSupport,
    setWingmanCount,
    spawnMember,
    removeMember,
    clearSquadron,
    toggleCommand,
    getCommandMode: () => squadronCommandMode,
    getWingmanPositions: () => activeWingmen.map((w) => w.mesh.position.clone()),
    getWingmanCount: () => activeWingmen.length,
    getActiveMembers: () => activeWingmen.map((w) => ({ id: w.profile.id, name: w.profile.name, title: w.profile.title, color: w.profile.color })),
    dispose,
  }
}
