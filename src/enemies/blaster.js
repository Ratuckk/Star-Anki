import * as THREE from 'three'
import { PASS_BEHIND } from './shared.js'

// ============ BLASTER — vermelho comum atirador ============
// v0.34.0: nome formal da classe (antes só existia como kind:'red', sem identidade própria).
// As 6 variações de cor/movimento entregues na v0.33.0 continuam intactas, só migraram pra cá.
export const BLASTER_KIND = 'blaster'
export const BLASTER_HIT_RADIUS = 1.8
export const BLASTER_DEATH_DURATION = 0.2
export const BLASTER_KILL_BONUS = 30
// pedido do usuário: "a maioria dos inimigos fica tão longe" — reduzido pra engajar mais cedo.
// v0.62.2: pedido do usuário de novo, mas o oposto problema — 60-100 (faixa de 40) fazia TODO
// spawn cair perto da mesma distância, sem sensação real de variação. Alargado pra 50-150
// (faixa de 100): chão (50) continua alto o bastante pra nunca nascer colado (a nave a 22u/s
// ainda tem ~2.3s de reação), teto (150) fica abaixo do valor que o mini-swarm.js já tinha
// testado e rejeitado como "longe demais" (160-240, ver comentário em miniSwarm.js) — mesmo
// Pedido do usuário: combate estilo Star Fox 64 — inimigos surgem na faixa de 45-75u (claramente
// visíveis e identificáveis na tela) e voam dinamicamente em direção ao jogador/câmera.
export const BLASTER_SPAWN_DISTANCE_MIN = 45
export const BLASTER_SPAWN_DISTANCE_MAX = 75
export const BLASTER_BOX_X = 7
export const BLASTER_BOX_Y = 5

const ENEMY_TURN_RATE = 1.6
const ENEMY_ORBIT_RADIUS_MIN = 14
const ENEMY_ORBIT_RADIUS_MAX = 26
const ENEMY_ORBIT_ANGULAR_SPEED = 0.8

// perfis de movimento — mesma classe/hp/tiro, cor do mesh (e do telegraph) muda com o padrão de
// deslocamento sorteado no spawn, pra virar informação de leitura em vez de decoração. Roda em
// arena E em trilho.
export const BLASTER_PROFILES = [
  { id: 'orbit', color: 0xff4d4d }, // padrão: gira em loop (arena: orbita o jogador; trilho: orbita o próprio ponto de spawn)
  { id: 'advance', color: 0xff7a29 }, // avança reto e rápido
  { id: 'slow', color: 0x7a2020 }, // avança bem lento, fica mais tempo em tela
  { id: 'follow', color: 0xff2f8f }, // persegue mantendo distância, evita passar/colidir
  { id: 'circular', color: 0xc61aff }, // espiral: orbita girando mais rápido e fechando o raio
  { id: 'evasive', color: 0xffb347 }, // muda de direção lateral aleatoriamente, tentando desviar
]
export const BLASTER_PROFILE_COLOR = new Map(BLASTER_PROFILES.map((p) => [p.id, p.color]))
const BLASTER_PROFILE_SPEED_RANGE = {
  orbit: [0.45, 0.75],
  advance: [0.85, 1.0],
  slow: [0.15, 0.3],
  follow: [0.5, 0.7],
  circular: [0.5, 0.8],
  evasive: [0.6, 0.9],
}
const ARENA_FOLLOW_STANDOFF = 18
const CIRCULAR_ANGULAR_SPEED = 2.2
const CIRCULAR_SHRINK_RATE = 1.2
const CIRCULAR_MIN_RADIUS = 6
const EVASIVE_JUKE_INTERVAL_MIN = 0.4
const EVASIVE_JUKE_INTERVAL_MAX = 0.9

const RAIL_ORBIT_RADIUS = 4.5
const RAIL_ORBIT_SPEED = 1.4
const RAIL_ADVANCE_SPEED = 14
const RAIL_SLOW_SPEED = 6
const RAIL_FOLLOW_SPEED = 9
const RAIL_FOLLOW_STANDOFF = 10
export const BLASTER_RAIL_FOLLOW_PASS_BEHIND = PASS_BEHIND * 5 // bem mais tolerante — esse perfil não "passa" fácil
const RAIL_CIRCULAR_DRIFT_SPEED = 5.5
const RAIL_EVASIVE_SPEED = 8

// ============ CONSTRUTORES DE MODELOS 3D DEDICADOS POR ARQUÉTIPO ============
// Substitui o cone simples antigo por 6 modelos de caças espaciais com silhueta Star Fox 64:
// orbit (Assalto), advance (Supersônico/Dardo), slow (Blindado), follow (Asa Invertida),
// circular (Vórtice Anular) e evasive (Ás em Bumerangue com winglets).

const sharedCockpitGeo = new THREE.BoxGeometry(0.26, 0.22, 0.7)
const sharedThrusterGeo = new THREE.CylinderGeometry(0.14, 0.24, 0.35, 6)
sharedThrusterGeo.rotateX(Math.PI / 2)
const sharedGunGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.7, 5)
sharedGunGeo.rotateX(Math.PI / 2)

// Geometrias do Assalto (orbit)
const assaultBodyGeo = new THREE.ConeGeometry(0.48, 2.6, 4)
assaultBodyGeo.rotateX(-Math.PI / 2)
const assaultWingGeo = new THREE.BoxGeometry(1.6, 0.06, 0.8)
const assaultFinGeo = new THREE.BoxGeometry(0.06, 0.55, 0.6)

// Geometrias do Dardo Supersônico (advance)
const darterBodyGeo = new THREE.CylinderGeometry(0.14, 0.42, 3.2, 5)
darterBodyGeo.rotateX(Math.PI / 2)
const darterWingGeo = new THREE.BoxGeometry(1.8, 0.05, 1.4)
const darterFinGeo = new THREE.BoxGeometry(0.05, 0.45, 0.7)

// Geometrias do Blindado Pesado (slow)
const heavyBodyGeo = new THREE.CylinderGeometry(0.55, 0.65, 2.3, 6)
heavyBodyGeo.rotateX(Math.PI / 2)
const heavyArmorGeo = new THREE.BoxGeometry(1.2, 0.22, 1.4)
const heavyFinGeo = new THREE.BoxGeometry(0.08, 0.6, 0.5)

// Geometrias do Perseguidor de Asa Invertida (follow)
const sweptBodyGeo = new THREE.ConeGeometry(0.42, 2.8, 4)
sweptBodyGeo.rotateX(-Math.PI / 2)
const sweptWingGeo = new THREE.BoxGeometry(1.5, 0.06, 0.9)
const sweptCanardGeo = new THREE.BoxGeometry(0.6, 0.04, 0.3)

// Geometrias do Vórtice Anular (circular)
const vortexRingGeo = new THREE.TorusGeometry(0.65, 0.1, 5, 12)
const vortexCoreGeo = new THREE.ConeGeometry(0.35, 2.2, 5)
vortexCoreGeo.rotateX(-Math.PI / 2)
const vortexWingGeo = new THREE.BoxGeometry(1.4, 0.05, 0.7)

// Geometrias do Ás Evasivo (evasive)
const evasiveBodyGeo = new THREE.BoxGeometry(0.5, 0.18, 2.0)
const evasiveWingGeo = new THREE.BoxGeometry(1.7, 0.06, 1.0)
const evasiveWingletGeo = new THREE.BoxGeometry(0.06, 0.45, 0.5)

// Insígnia do Líder de Esquadrão (Flight Leader Crown)
const leaderInsigniaGeo = new THREE.TorusGeometry(0.32, 0.05, 4, 8)
leaderInsigniaGeo.rotateX(Math.PI / 2)
const leaderInsigniaMat = new THREE.MeshBasicMaterial({ color: 0xffe600, wireframe: true })

const hullMaterials = new Map(
  BLASTER_PROFILES.map((p) => [p.id, new THREE.MeshPhongMaterial({ color: p.color, flatShading: true })]),
)
const darkHullMat = new THREE.MeshPhongMaterial({ color: 0x22252a, flatShading: true })
const cockpitMaterials = new Map([
  ['orbit', new THREE.MeshBasicMaterial({ color: 0x2bff88 })],
  ['advance', new THREE.MeshBasicMaterial({ color: 0xffea00 })],
  ['slow', new THREE.MeshBasicMaterial({ color: 0xff3333 })],
  ['follow', new THREE.MeshBasicMaterial({ color: 0x38ef7d })],
  ['circular', new THREE.MeshBasicMaterial({ color: 0x00f2fe })],
  ['evasive', new THREE.MeshBasicMaterial({ color: 0xff3366 })],
])
const thrusterMat = new THREE.MeshBasicMaterial({ color: 0x44ccff })

function buildBlasterShipMesh(profileId) {
  const group = new THREE.Group()
  const hullMat = hullMaterials.get(profileId) ?? hullMaterials.get('orbit')
  const cockpitMat = cockpitMaterials.get(profileId) ?? cockpitMaterials.get('orbit')

  let wingL = null
  let wingR = null
  const gunMounts = []
  const thrusterMount = new THREE.Vector3(0, 0, -1.2)

  if (profileId === 'orbit') {
    // 1. Assalto Clássico: fuselagem afilada, asas enflechadas e canhões duplos
    const body = new THREE.Mesh(assaultBodyGeo, hullMat)
    group.add(body)

    wingL = new THREE.Mesh(assaultWingGeo, hullMat)
    wingL.position.set(-1.1, 0, -0.2)
    wingL.rotation.y = 0.25
    group.add(wingL)

    wingR = new THREE.Mesh(assaultWingGeo, hullMat)
    wingR.position.set(1.1, 0, -0.2)
    wingR.rotation.y = -0.25
    group.add(wingR)

    const gunL = new THREE.Mesh(sharedGunGeo, darkHullMat)
    gunL.position.set(-1.8, 0, 0.1)
    group.add(gunL)
    const gunR = new THREE.Mesh(sharedGunGeo, darkHullMat)
    gunR.position.set(1.8, 0, 0.1)
    group.add(gunR)
    gunMounts.push(new THREE.Vector3(-1.8, 0, 0.5), new THREE.Vector3(1.8, 0, 0.5))

    const fin = new THREE.Mesh(assaultFinGeo, hullMat)
    fin.position.set(0, 0.35, -0.6)
    group.add(fin)
  } else if (profileId === 'advance') {
    // 2. Dardo Supersônico: longo, asas delta e bocal largo de propulsão
    const body = new THREE.Mesh(darterBodyGeo, hullMat)
    group.add(body)

    wingL = new THREE.Mesh(darterWingGeo, hullMat)
    wingL.position.set(-1.2, 0, -0.3)
    wingL.rotation.z = -0.1
    group.add(wingL)

    wingR = new THREE.Mesh(darterWingGeo, hullMat)
    wingR.position.set(1.2, 0, -0.3)
    wingR.rotation.z = 0.1
    group.add(wingR)

    const finL = new THREE.Mesh(darterFinGeo, hullMat)
    finL.position.set(-0.35, 0.25, -0.8)
    finL.rotation.z = -0.3
    group.add(finL)
    const finR = new THREE.Mesh(darterFinGeo, hullMat)
    finR.position.set(0.35, 0.25, -0.8)
    finR.rotation.z = 0.3
    group.add(finR)

    gunMounts.push(new THREE.Vector3(-0.5, -0.1, 1.4), new THREE.Vector3(0.5, -0.1, 1.4))
    thrusterMount.set(0, 0, -1.6)
  } else if (profileId === 'slow') {
    // 3. Blindado Pesado: casco hexagonal, placas laterais e canhões pesados
    const body = new THREE.Mesh(heavyBodyGeo, hullMat)
    group.add(body)

    wingL = new THREE.Mesh(heavyArmorGeo, darkHullMat)
    wingL.position.set(-1.0, 0, 0)
    group.add(wingL)

    wingR = new THREE.Mesh(heavyArmorGeo, darkHullMat)
    wingR.position.set(1.0, 0, 0)
    group.add(wingR)

    const fin = new THREE.Mesh(heavyFinGeo, hullMat)
    fin.position.set(0, 0.45, -0.5)
    group.add(fin)

    gunMounts.push(new THREE.Vector3(-0.9, -0.15, 0.8), new THREE.Vector3(0.9, -0.15, 0.8))
  } else if (profileId === 'follow') {
    // 4. Perseguidor: asas em flecha invertida (forward-swept) e canards dianteiros
    const body = new THREE.Mesh(sweptBodyGeo, hullMat)
    group.add(body)

    wingL = new THREE.Mesh(sweptWingGeo, hullMat)
    wingL.position.set(-1.0, 0, 0.2)
    wingL.rotation.y = -0.35
    group.add(wingL)

    wingR = new THREE.Mesh(sweptWingGeo, hullMat)
    wingR.position.set(1.0, 0, 0.2)
    wingR.rotation.y = 0.35
    group.add(wingR)

    const canardL = new THREE.Mesh(sweptCanardGeo, darkHullMat)
    canardL.position.set(-0.55, 0.05, 0.8)
    group.add(canardL)
    const canardR = new THREE.Mesh(sweptCanardGeo, darkHullMat)
    canardR.position.set(0.55, 0.05, 0.8)
    group.add(canardR)

    gunMounts.push(new THREE.Vector3(-1.4, 0, 0.6), new THREE.Vector3(1.4, 0, 0.6))
  } else if (profileId === 'circular') {
    // 5. Vórtice: anel central concêntrico com asas circulares
    const ring = new THREE.Mesh(vortexRingGeo, darkHullMat)
    group.add(ring)

    const core = new THREE.Mesh(vortexCoreGeo, hullMat)
    group.add(core)

    wingL = new THREE.Mesh(vortexWingGeo, hullMat)
    wingL.position.set(-1.1, 0, 0)
    group.add(wingL)

    wingR = new THREE.Mesh(vortexWingGeo, hullMat)
    wingR.position.set(1.1, 0, 0)
    group.add(wingR)

    gunMounts.push(new THREE.Vector3(0, 0.5, 0.8), new THREE.Vector3(0, -0.5, 0.8))
  } else {
    // 6. Ás Evasivo: asa voadora em bumerangue com winglets verticais
    const body = new THREE.Mesh(evasiveBodyGeo, hullMat)
    group.add(body)

    wingL = new THREE.Mesh(evasiveWingGeo, hullMat)
    wingL.position.set(-1.1, 0, -0.2)
    wingL.rotation.y = 0.4
    group.add(wingL)

    wingR = new THREE.Mesh(evasiveWingGeo, hullMat)
    wingR.position.set(1.1, 0, -0.2)
    wingR.rotation.y = -0.4
    group.add(wingR)

    const wingletL = new THREE.Mesh(evasiveWingletGeo, darkHullMat)
    wingletL.position.set(-1.8, 0.25, -0.5)
    group.add(wingletL)
    const wingletR = new THREE.Mesh(evasiveWingletGeo, darkHullMat)
    wingletR.position.set(1.8, 0.25, -0.5)
    group.add(wingletR)

    gunMounts.push(new THREE.Vector3(-1.2, 0, 0.4), new THREE.Vector3(1.2, 0, 0.4))
  }

  // Cockpit padrão proporcional a cada modelo
  const cockpit = new THREE.Mesh(sharedCockpitGeo, cockpitMat)
  cockpit.position.set(0, 0.18, 0.3)
  group.add(cockpit)

  // Bocal de turbina traseiro
  const thruster = new THREE.Mesh(sharedThrusterGeo, thrusterMat)
  thruster.position.copy(thrusterMount)
  group.add(thruster)

  // Halo / Insígnia do Líder de Voo
  const leaderCrown = new THREE.Mesh(leaderInsigniaGeo, leaderInsigniaMat)
  leaderCrown.position.set(0, 0.75, 0)
  leaderCrown.visible = false
  group.add(leaderCrown)

  group.userData = {
    wingL,
    wingR,
    gunMounts,
    thrusterMount,
    leaderCrown,
    profileId,
  }

  return group
}

// gira o "jukeDir" pra um novo ângulo lateral aleatório a cada intervalo
function rerollJukeDir(enemy, frame) {
  enemy.jukeTimer = EVASIVE_JUKE_INTERVAL_MIN + Math.random() * (EVASIVE_JUKE_INTERVAL_MAX - EVASIVE_JUKE_INTERVAL_MIN)
  const angle = Math.random() * Math.PI * 2
  enemy.jukeDir.set(0, 0, 0)
    .addScaledVector(frame.right, Math.cos(angle))
    .addScaledVector(frame.up, Math.sin(angle))
}

// ============ MOVIMENTO NO TRILHO: MODELO PROFUNDIDADE + TELA ============
function projectBlasterToWorld(enemy, rail) {
  const frame = rail.getSpawnFrame()
  const pos = frame.position.clone()
    .addScaledVector(frame.forward, enemy.depth + (enemy.recoilZ || 0))
    .addScaledVector(frame.right, enemy.screenX)
    .addScaledVector(frame.up, enemy.screenY)
  enemy.mesh.position.copy(pos)
}

export function spawnBlaster(scene, rail, id, opts = {}) {
  const distanceAhead = opts.depth ?? (BLASTER_SPAWN_DISTANCE_MIN + Math.random() * (BLASTER_SPAWN_DISTANCE_MAX - BLASTER_SPAWN_DISTANCE_MIN))
  const screenX = opts.screenX ?? ((Math.random() * 2 - 1) * BLASTER_BOX_X)
  const screenY = opts.screenY ?? ((Math.random() * 2 - 1) * BLASTER_BOX_Y)
  const profileId = opts.profile ?? BLASTER_PROFILES[Math.floor(Math.random() * BLASTER_PROFILES.length)].id
  const profile = BLASTER_PROFILES.find((p) => p.id === profileId) ?? BLASTER_PROFILES[0]

  const mesh = buildBlasterShipMesh(profile.id)
  scene.add(mesh)

  const [speedMin, speedMax] = BLASTER_PROFILE_SPEED_RANGE[profile.id]
  const enemy = {
    id,
    mesh,
    kind: BLASTER_KIND,
    dying: false,
    deathT: 0,
    hp: 2,
    maxHp: 2,
    fireTimer: null,
    profile: profile.id,
    speedFactor: speedMin + Math.random() * (speedMax - speedMin),
    depth: distanceAhead,
    screenX,
    screenY,
    orbitCenterX: screenX,
    orbitCenterY: screenY,
    orbitRadius: ENEMY_ORBIT_RADIUS_MIN + Math.random() * (ENEMY_ORBIT_RADIUS_MAX - ENEMY_ORBIT_RADIUS_MIN),
    orbitAngle: Math.random() * Math.PI * 2,
    orbitDir: Math.random() < 0.5 ? 1 : -1,
    jukeTimer: 0,
    jukeAngle: Math.random() * Math.PI * 2,
    jukeDir: new THREE.Vector3(),
    moveDir: null,
    recoilZ: 0,
    wingBroken: false,
    tumbleSpin: false,
    tumbleRollSpeed: 0,
    isLeader: !!opts.isLeader,
    squadronId: opts.squadronId ?? null,
    flyByTriggered: false,
    flyByVel: null,
  }

  if (enemy.isLeader && mesh.userData.leaderCrown) {
    mesh.userData.leaderCrown.visible = true
  }

  projectBlasterToWorld(enemy, rail)
  return enemy
}

export function updateBlasterArenaMovement(enemy, dt, playerPosition, frame, speedCap) {
  const chaseSpeed = (enemy.speedFactor ?? 0.6) * speedCap
  let desiredDir

  if (enemy.profile === 'orbit' || enemy.profile === 'circular') {
    const angularSpeed = enemy.profile === 'circular' ? CIRCULAR_ANGULAR_SPEED : ENEMY_ORBIT_ANGULAR_SPEED
    enemy.orbitAngle += angularSpeed * enemy.orbitDir * dt
    if (enemy.profile === 'circular') {
      enemy.orbitRadius = Math.max(CIRCULAR_MIN_RADIUS, enemy.orbitRadius - CIRCULAR_SHRINK_RATE * dt)
    }
    const orbitPoint = playerPosition.clone()
      .addScaledVector(frame.right, Math.cos(enemy.orbitAngle) * enemy.orbitRadius)
      .addScaledVector(frame.up, Math.sin(enemy.orbitAngle) * enemy.orbitRadius)
    desiredDir = orbitPoint.sub(enemy.mesh.position)
  } else if (enemy.profile === 'follow') {
    const toPlayer = playerPosition.clone().sub(enemy.mesh.position)
    desiredDir = toPlayer.length() > ARENA_FOLLOW_STANDOFF ? toPlayer : toPlayer.multiplyScalar(-1)
  } else if (enemy.profile === 'evasive') {
    if ((enemy.jukeTimer -= dt) <= 0) rerollJukeDir(enemy, frame)
    desiredDir = playerPosition.clone().sub(enemy.mesh.position).normalize().add(enemy.jukeDir)
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
  enemy.mesh.lookAt(playerPosition)
}

export function triggerBlasterRecoil(enemy) {
  if (!enemy) return
  enemy.recoilZ = -0.4
}

export function breakBlasterWing(enemy, side = 'left') {
  if (!enemy || enemy.wingBroken || !enemy.mesh || !enemy.mesh.userData) return null
  enemy.wingBroken = true
  enemy.tumbleSpin = true
  enemy.tumbleRollSpeed = (side === 'left' ? 1 : -1) * (9 + Math.random() * 4)
  const wingMesh = side === 'left' ? enemy.mesh.userData.wingL : enemy.mesh.userData.wingR
  if (wingMesh) {
    wingMesh.visible = false
    const worldPos = new THREE.Vector3()
    wingMesh.getWorldPosition(worldPos)
    return { worldPos, color: blasterColor(enemy) }
  }
  return null
}

export function updateBlasterRailMovement(enemy, dt, rail) {
  // Recuo elástico de disparo
  if (enemy.recoilZ < 0) {
    enemy.recoilZ = Math.min(0, enemy.recoilZ + dt * 4.5)
  }

  // Tumble spin após quebra de asa
  if (enemy.tumbleSpin) {
    enemy.mesh.rotation.z += enemy.tumbleRollSpeed * dt
    enemy.mesh.rotation.x += 2.2 * dt
    enemy.screenX += (enemy.tumbleRollSpeed > 0 ? 1 : -1) * 4.0 * dt
    enemy.screenY -= 3.0 * dt
    enemy.depth -= RAIL_SLOW_SPEED * dt
    projectBlasterToWorld(enemy, rail)
    return
  }

  // Manobra de Fuga Fly-By ao se aproximar demais do jogador sem ser destruído
  if (!enemy.flyByTriggered && enemy.depth < 14 && enemy.profile !== 'follow') {
    enemy.flyByTriggered = true
    const roll = Math.random()
    if (roll < 0.5) {
      enemy.flyByVel = new THREE.Vector3(0, 16, -18) // pull-up vertical
    } else {
      const sign = enemy.screenX >= 0 ? 1 : -1
      enemy.flyByVel = new THREE.Vector3(sign * 18, 4, -18) // banking roll rasante
    }
  }

  if (enemy.flyByTriggered && enemy.flyByVel) {
    enemy.screenX += enemy.flyByVel.x * dt
    enemy.screenY += enemy.flyByVel.y * dt
    enemy.depth += enemy.flyByVel.z * dt
    enemy.mesh.rotation.z += (enemy.flyByVel.x >= 0 ? -1 : 1) * 5.5 * dt
    projectBlasterToWorld(enemy, rail)
    return
  }

  if (enemy.profile === 'orbit') {
    enemy.orbitAngle += RAIL_ORBIT_SPEED * enemy.orbitDir * dt
    enemy.depth -= RAIL_SLOW_SPEED * dt
    enemy.screenX = enemy.orbitCenterX + Math.cos(enemy.orbitAngle) * RAIL_ORBIT_RADIUS
    enemy.screenY = enemy.orbitCenterY + Math.sin(enemy.orbitAngle) * RAIL_ORBIT_RADIUS
  } else if (enemy.profile === 'circular') {
    enemy.orbitAngle += CIRCULAR_ANGULAR_SPEED * enemy.orbitDir * dt
    enemy.orbitRadius = Math.max(CIRCULAR_MIN_RADIUS, enemy.orbitRadius - CIRCULAR_SHRINK_RATE * dt)
    enemy.depth -= RAIL_CIRCULAR_DRIFT_SPEED * dt
    enemy.screenX = enemy.orbitCenterX + Math.cos(enemy.orbitAngle) * enemy.orbitRadius
    enemy.screenY = enemy.orbitCenterY + Math.sin(enemy.orbitAngle) * enemy.orbitRadius
  } else if (enemy.profile === 'advance') {
    enemy.depth -= RAIL_ADVANCE_SPEED * dt
  } else if (enemy.profile === 'slow') {
    enemy.depth -= RAIL_SLOW_SPEED * dt
  } else if (enemy.profile === 'follow') {
    const correction = enemy.depth > RAIL_FOLLOW_STANDOFF ? -1 : enemy.depth < RAIL_FOLLOW_STANDOFF * 0.5 ? 1 : 0
    enemy.depth += correction * RAIL_FOLLOW_SPEED * dt
  } else if (enemy.profile === 'evasive') {
    if ((enemy.jukeTimer -= dt) <= 0) {
      enemy.jukeTimer = EVASIVE_JUKE_INTERVAL_MIN + Math.random() * (EVASIVE_JUKE_INTERVAL_MAX - EVASIVE_JUKE_INTERVAL_MIN)
      enemy.jukeAngle = Math.random() * Math.PI * 2
    }
    enemy.depth -= RAIL_SLOW_SPEED * dt
    enemy.screenX += Math.cos(enemy.jukeAngle) * RAIL_EVASIVE_SPEED * dt
    enemy.screenY += Math.sin(enemy.jukeAngle) * RAIL_EVASIVE_SPEED * dt
  }
  projectBlasterToWorld(enemy, rail)
}

export function blasterPassBehind(enemy) {
  return enemy.profile === 'follow' ? BLASTER_RAIL_FOLLOW_PASS_BEHIND : PASS_BEHIND
}

export function blasterColor(enemy) {
  return BLASTER_PROFILE_COLOR.get(enemy.profile) ?? BLASTER_PROFILES[0].color
}

export function disposeBlaster() {
  sharedCockpitGeo.dispose()
  sharedThrusterGeo.dispose()
  sharedGunGeo.dispose()
  assaultBodyGeo.dispose()
  assaultWingGeo.dispose()
  assaultFinGeo.dispose()
  darterBodyGeo.dispose()
  darterWingGeo.dispose()
  darterFinGeo.dispose()
  heavyBodyGeo.dispose()
  heavyArmorGeo.dispose()
  heavyFinGeo.dispose()
  sweptBodyGeo.dispose()
  sweptWingGeo.dispose()
  sweptCanardGeo.dispose()
  vortexRingGeo.dispose()
  vortexCoreGeo.dispose()
  vortexWingGeo.dispose()
  evasiveBodyGeo.dispose()
  evasiveWingGeo.dispose()
  evasiveWingletGeo.dispose()
  leaderInsigniaGeo.dispose()
  leaderInsigniaMat.dispose()
  thrusterMat.dispose()
  darkHullMat.dispose()
  for (const m of hullMaterials.values()) m.dispose()
  for (const m of cockpitMaterials.values()) m.dispose()
}
