import * as THREE from 'three'

// ============ ESQUADRÃO STAR FOX (WINGMEN IA) ============
// Sistema de companheiros de equipe autônomos e úteis (v0.54.0).
// Até 4 membros permanentes com naves, modelos 3D, cores, personalidades e IA distintas.

export const WINGMAN_PROFILES = [
  {
    id: 0,
    name: 'Falco',
    title: 'Ás Interceptor',
    color: 0x1d4ed8, // azul cobalto
    accentColor: 0x38bdf8, // ciano elétrico
    laserColor: 0x38bdf8,
    offset: { right: -4.8, up: 0.3, forward: 1.4 },
    fireInterval: 0.8,
    burstCount: 2,
    burstDelay: 0.12,
    speed: 40,
    modelType: 'interceptor',
  },
  {
    id: 1,
    name: 'Peppy',
    title: 'Defensor Blindado',
    color: 0x059669, // verde esmeralda
    accentColor: 0xfbbf24, // ouro
    laserColor: 0x34d399,
    offset: { right: 4.8, up: 0.3, forward: 1.4 },
    fireInterval: 1.15,
    burstCount: 1,
    burstDelay: 0,
    speed: 34,
    modelType: 'bomber',
  },
  {
    id: 2,
    name: 'Slippy',
    title: 'Batedor Solar',
    color: 0xea580c, // laranja intenso
    accentColor: 0xfde047, // amarelo brilhante
    laserColor: 0xfbbf24,
    offset: { right: -3.8, up: -0.6, forward: -3.0 },
    fireInterval: 0.9,
    burstCount: 2,
    burstDelay: 0.14,
    speed: 36,
    modelType: 'scout',
  },
  {
    id: 3,
    name: 'Phantom',
    title: 'Vanguarda Fantasma',
    color: 0x7c3aed, // roxo estelar
    accentColor: 0xf43f5e, // rosa neon
    laserColor: 0xe879f9,
    offset: { right: 3.8, up: -0.6, forward: -3.0 },
    fireInterval: 0.85,
    burstCount: 3,
    burstDelay: 0.1,
    speed: 42,
    modelType: 'stealth',
  },
]

const WINGMAN_LASER_SPEED = 120
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

// ============ SISTEMA PRINCIPAL DO ESQUADRÃO ============

export function createSquadronSystem(scene, rail, effects, enemies) {
  const activeWingmen = []
  const activeLasers = []
  let elapsed = 0

  // Geometria compartilhada dos tiros laser dos companheiros
  const laserGeometry = new THREE.CylinderGeometry(0.09, 0.09, 1.4, 6)
  laserGeometry.rotateX(Math.PI / 2)

  function spawnMember(profileId) {
    const profile = WINGMAN_PROFILES[profileId]
    if (!profile) return null
    if (activeWingmen.some((w) => w.profile.id === profile.id)) return null

    const { mesh, thrusters } = buildWingmanShip(profile)
    const playerPos = rail.getPlayerPosition()
    const frame = rail.getFrameAt(0)
    mesh.position.copy(playerPos).addScaledVector(frame.right, profile.offset.right)
    scene.add(mesh)

    const laserMaterial = new THREE.MeshBasicMaterial({ color: profile.laserColor })

    const wingman = {
      profile,
      mesh,
      thrusters,
      laserMaterial,
      state: 'formation', // 'formation' | 'engaging' | 'returning'
      stateTimer: 0,
      targetEnemy: null,
      cooldownTimer: 0.5 + Math.random() * 0.8,
      burstRemaining: 0,
      burstTimer: 0,
      currentVel: new THREE.Vector3(),
      smoothRoll: 0,
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
    // adiciona os que faltam na ordem 0..3
    for (let i = 0; i < targetCount; i += 1) {
      if (!activeWingmen.some((w) => w.profile.id === i)) {
        spawnMember(i)
      }
    }
    // remove os excedentes do final
    while (activeWingmen.length > targetCount) {
      const last = activeWingmen[activeWingmen.length - 1]
      removeMember(last.profile.id)
    }
  }

  function clearSquadron() {
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

  // ============ TICK DE ATUALIZAÇÃO DA IA ============

  function update(dt, playerPos, frame, opts = {}) {
    elapsed += dt
    const boostActive = !!opts.boostActive
    const inArena = rail.isArena()

    // 1. Atualiza cada companheiro de equipe
    for (const w of activeWingmen) {
      w.stateTimer += dt
      w.cooldownTimer -= dt

      // Efeito de propulsor / pós-combustor pulsante
      for (const t of w.thrusters) {
        const boostScale = boostActive ? 2.4 : 1.0 + Math.sin(elapsed * 18 + w.profile.id) * 0.2
        t.scale.set(boostActive ? 1.4 : 1.0, boostActive ? 1.4 : 1.0, boostScale)
      }

      // Posição base de formação com micro-drift orgânico
      const driftX = Math.sin(elapsed * 1.7 + w.profile.id * 1.6) * 0.45
      const driftY = Math.cos(elapsed * 2.1 + w.profile.id * 1.3) * 0.35
      const forwardPush = boostActive ? 2.5 : 0
      const formationTarget = playerPos.clone()
        .addScaledVector(frame.right, w.profile.offset.right + driftX)
        .addScaledVector(frame.up, w.profile.offset.up + driftY)
        .addScaledVector(frame.forward, w.profile.offset.forward + forwardPush)

      // ============ DECISÃO DA IA ============
      if (w.state === 'formation') {
        // Segue suavemente para a formação
        w.mesh.position.lerp(formationTarget, 1 - Math.exp(-6.5 * dt))

        // Alinha bico e roll suave
        const lookTarget = w.mesh.position.clone().add(frame.forward)
        w.mesh.lookAt(lookTarget)
        const lateralRoll = THREE.MathUtils.clamp(-driftX * 0.8, -0.4, 0.4)
        w.mesh.rotateZ(lateralRoll)

        // Tenta engajar inimigo se o cooldown estiver livre
        if (w.cooldownTimer <= 0 && enemies && enemies.getAlive) {
          const alive = enemies.getAlive().filter((e) => !e.dying && e.mesh)
          if (alive.length > 0) {
            // Escolhe o inimigo mais acessível à frente
            const candidates = alive.filter((e) => {
              const rel = e.mesh.position.clone().sub(w.mesh.position)
              const dotForward = rel.clone().normalize().dot(frame.forward)
              return inArena ? rel.length() < 90 : (dotForward > 0.25 && rel.length() < 130)
            })
            if (candidates.length > 0) {
              // Menor distância ao slot do companheiro
              candidates.sort((a, b) => w.mesh.position.distanceTo(a.mesh.position) - w.mesh.position.distanceTo(b.mesh.position))
              w.targetEnemy = candidates[0]
              w.state = 'engaging'
              w.stateTimer = 0
              w.burstRemaining = w.profile.burstCount
              w.burstTimer = 0
            }
          }
        }
      } else if (w.state === 'engaging') {
        // Checa se o alvo ainda é válido
        const enemyLost = !w.targetEnemy || w.targetEnemy.dying || !w.targetEnemy.mesh ||
          w.mesh.position.distanceTo(w.targetEnemy.mesh.position) > 160 ||
          w.stateTimer > 2.6

        if (enemyLost) {
          w.state = 'returning'
          w.stateTimer = 0
          w.targetEnemy = null
          w.cooldownTimer = w.profile.fireInterval + Math.random() * 0.4
        } else {
          // Manobra de ataque (strafe run): aproxima-se do inimigo e alinha mira
          const toEnemy = w.targetEnemy.mesh.position.clone().sub(w.mesh.position)
          const dist = toEnemy.length()
          const aimDir = toEnemy.clone().normalize()

          // Desloca em arco mantendo standoff de combate (~18u)
          const desiredPos = w.targetEnemy.mesh.position.clone().addScaledVector(aimDir, -18)
          w.mesh.position.lerp(desiredPos, 1 - Math.exp(-4.2 * dt))
          w.mesh.lookAt(w.targetEnemy.mesh.position)

          // Disparo da rajada
          w.burstTimer -= dt
          if (w.burstTimer <= 0 && w.burstRemaining > 0 && dist < 120) {
            w.burstRemaining -= 1
            w.burstTimer = w.profile.burstDelay || 0.15
            const muzzleOffset = w.mesh.position.clone().addScaledVector(aimDir, 1.2)
            fireWingmanLaser(w, muzzleOffset, aimDir)
          }

          if (w.burstRemaining <= 0) {
            w.state = 'returning'
            w.stateTimer = 0
            w.cooldownTimer = w.profile.fireInterval + Math.random() * 0.5
          }
        }
      } else if (w.state === 'returning') {
        // Retorno suave à formação
        w.mesh.position.lerp(formationTarget, 1 - Math.exp(-5.0 * dt))
        w.mesh.lookAt(w.mesh.position.clone().add(frame.forward))
        if (w.mesh.position.distanceTo(formationTarget) < 2.0 || w.stateTimer > 2.0) {
          w.state = 'formation'
          w.stateTimer = 0
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

  // Disparo manual sincronizado (quando o jogador atira, os wingmen que estão em formação dão suporte)
  function tryFireSupport(direction) {
    for (const w of activeWingmen) {
      if (w.state === 'formation') {
        const muzzlePos = w.mesh.position.clone().addScaledVector(direction, 1.2)
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
    getWingmanPositions: () => activeWingmen.map((w) => w.mesh.position.clone()),
    getWingmanCount: () => activeWingmen.length,
    getActiveMembers: () => activeWingmen.map((w) => ({ id: w.profile.id, name: w.profile.name, title: w.profile.title, color: w.profile.color })),
    dispose,
  }
}
