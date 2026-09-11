import * as THREE from 'three'

const RAIL_SPEED = 18
const LATERAL_SPEED = 32
const LATERAL_ACCEL_RATE = 20
const BOX_X = 12
const BOX_Y = 8
const MAX_ROLL = 0.55
const ROLL_SMOOTH_RATE = 10
const CAM_LAG_RATE = 5
const CAM_BEHIND = 10
const CAM_HEIGHT = 3

// 0.0 = câmera totalmente presa ao trilho (nave anda bastante na tela)
// 1.0 = câmera segue a nave (nave sempre no centro, comportamento do bug)
const CAM_FOLLOW_LATERAL = 0.3

const SHIP_NOSE_OFFSET = 1.6
const SHIP_COLOR = 0xeaf3ff

const ARENA_TURN_RATE = 1.8
const ARENA_PITCH_LIMIT = 1.2
const ARENA_SPEED = 22
const ARENA_RADIUS = 190

const WORLD_UP = new THREE.Vector3(0, 1, 0)

function buildCurve() {
  const points = [
    new THREE.Vector3(0, 3, 0),
    new THREE.Vector3(35, 7, -55),
    new THREE.Vector3(15, 4, -125),
    new THREE.Vector3(-45, 9, -165),
    new THREE.Vector3(-95, 5, -125),
    new THREE.Vector3(-70, 3, -40),
  ]
  return new THREE.CatmullRomCurve3(points, true)
}

function buildDeltaShape(halfSpan, frontLength, backLength) {
  const shape = new THREE.Shape()
  shape.moveTo(0, frontLength)
  shape.lineTo(halfSpan, -backLength * 0.3)
  shape.lineTo(0, -backLength)
  shape.lineTo(-halfSpan, -backLength * 0.3)
  shape.closePath()
  return shape
}

function buildFinShape() {
  const shape = new THREE.Shape()
  shape.moveTo(0.55, 0)
  shape.lineTo(-0.3, 0)
  shape.lineTo(0, 0.85)
  shape.closePath()
  return shape
}

function buildShip() {
  const material = new THREE.MeshPhongMaterial({ color: SHIP_COLOR, flatShading: true, side: THREE.DoubleSide })

  const body = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.9, 4), material)
  body.rotation.x = Math.PI / 2
  body.rotation.y = Math.PI / 4

  const wing = new THREE.Mesh(new THREE.ShapeGeometry(buildDeltaShape(1.9, 0.6, 0.7)), material)
  wing.rotation.x = -Math.PI / 2
  wing.position.set(0, -0.05, -0.2)

  const fin = new THREE.Mesh(new THREE.ShapeGeometry(buildFinShape()), material)
  fin.rotation.y = Math.PI / 2
  fin.position.set(0, 0.2, -1)

  const group = new THREE.Group()
  group.add(body, wing, fin)
  return group
}

export function createRailController(camera, scene) {
  const curve = buildCurve()
  const length = curve.getLength()

  let distance = 0
  let playerX = 0
  let playerY = 0
  let velX = 0
  let velY = 0
  let roll = 0
  let speedMultiplier = 1
  let advancing = true
  let lastFrame = frameAtArcLength(0)
  let lastPlayerPos = lastFrame.position.clone()

  let mode = 'rail'
  let arenaCenter = new THREE.Vector3()
  let arenaPos = new THREE.Vector3()
  let arenaYaw = 0
  let arenaPitch = 0
  let arenaRoll = 0

  const ship = buildShip()
  ship.position.copy(lastFrame.position)
  scene.add(ship)

  camera.fov = 70
  camera.position.copy(lastFrame.position)
  camera.updateProjectionMatrix()

  // log de depuração do movimento lateral — ligue (true) só ao investigar algum problema
  // específico de input/posição; desligado por padrão pra não inundar o console em partida real
  const DEBUG = false

  function frameAtArcLength(s) {
    const u = (((s / length) % 1) + 1) % 1
    const position = curve.getPointAt(u)
    const forward = curve.getTangentAt(u).normalize()
    const right = new THREE.Vector3().crossVectors(forward, WORLD_UP).normalize()
    const up = new THREE.Vector3().crossVectors(right, forward).normalize()
    return { position, forward, right, up }
  }

  function forwardFromYawPitch(yaw, pitch) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'))
    return new THREE.Vector3(0, 0, -1).applyQuaternion(q)
  }

  function enterArena() {
    mode = 'arena'
    arenaCenter.copy(lastPlayerPos)
    arenaPos.copy(lastPlayerPos)

    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), lastFrame.forward)
    const euler = new THREE.Euler().setFromQuaternion(q, 'YXZ')
    arenaYaw = euler.y
    arenaPitch = THREE.MathUtils.clamp(euler.x, -ARENA_PITCH_LIMIT, ARENA_PITCH_LIMIT)
    arenaRoll = 0

    updateArena(0, { moveX: 0, moveY: 0 })
  }

  function exitArena() {
    mode = 'rail'
  }

  function updateArena(dt, input) {
    arenaYaw -= input.moveX * ARENA_TURN_RATE * dt
    arenaPitch = THREE.MathUtils.clamp(arenaPitch + input.moveY * ARENA_TURN_RATE * dt, -ARENA_PITCH_LIMIT, ARENA_PITCH_LIMIT)
    const targetRoll = THREE.MathUtils.clamp(-input.moveX, -1, 1) * MAX_ROLL
    arenaRoll += (targetRoll - arenaRoll) * (1 - Math.exp(-ROLL_SMOOTH_RATE * dt))

    const forward = forwardFromYawPitch(arenaYaw, arenaPitch)
    arenaPos.addScaledVector(forward, ARENA_SPEED * dt)

    const offset = arenaPos.clone().sub(arenaCenter)
    if (offset.length() > ARENA_RADIUS) arenaPos.copy(arenaCenter).addScaledVector(offset.normalize(), ARENA_RADIUS)

    const right = new THREE.Vector3().crossVectors(forward, WORLD_UP).normalize()
    const up = new THREE.Vector3().crossVectors(right, forward).normalize()

    ship.position.copy(arenaPos)
    ship.up.copy(up)
    ship.lookAt(arenaPos.clone().add(forward))
    ship.rotateZ(arenaRoll)

    const camTarget = arenaPos.clone()
      .addScaledVector(forward, -CAM_BEHIND)
      .addScaledVector(up, CAM_HEIGHT)

    camera.position.lerp(camTarget, dt === 0 ? 1 : 1 - Math.exp(-CAM_LAG_RATE * dt))
    camera.up.copy(up)
    camera.lookAt(camera.position.clone().add(forward))

    lastFrame = { position: arenaPos.clone(), forward, right, up }
    lastPlayerPos = arenaPos.clone()
  }

  function update(dt, input) {
    if (mode === 'arena') {
      updateArena(dt, input)
      return
    }

    if (advancing) distance += RAIL_SPEED * speedMultiplier * dt

    const targetVelX = input.moveX * LATERAL_SPEED
    const targetVelY = input.moveY * LATERAL_SPEED
    const accelBlend = 1 - Math.exp(-LATERAL_ACCEL_RATE * dt)
    velX += (targetVelX - velX) * accelBlend
    velY += (targetVelY - velY) * accelBlend

    playerX += velX * dt
    playerY += velY * dt

    if (playerX > BOX_X) { playerX = BOX_X; velX = 0 }
    else if (playerX < -BOX_X) { playerX = -BOX_X; velX = 0 }
    if (playerY > BOX_Y) { playerY = BOX_Y; velY = 0 }
    else if (playerY < -BOX_Y) { playerY = -BOX_Y; velY = 0 }

    if (DEBUG && (input.moveX !== 0 || Math.abs(playerX) > 0.05)) {
      console.log(
        `moveX=${input.moveX.toFixed(2)} playerX=${playerX.toFixed(2)} velX=${velX.toFixed(2)} mode=${mode}`
      )
    }

    const frame = frameAtArcLength(distance)

    const targetRoll = THREE.MathUtils.clamp(-input.moveX, -1, 1) * MAX_ROLL
    roll += (targetRoll - roll) * (1 - Math.exp(-ROLL_SMOOTH_RATE * dt))

    const playerPos = frame.position.clone()
      .addScaledVector(frame.right, playerX)
      .addScaledVector(frame.up, playerY)

    ship.position.copy(playerPos)
    ship.up.copy(frame.up)
    ship.lookAt(playerPos.clone().add(frame.forward))
    ship.rotateZ(roll)

    // Câmera ancorada ao TRILHO, não à nave. Só segue CAM_FOLLOW_LATERAL do deslocamento
    // lateral do jogador — assim a nave se move visivelmente na tela.
    const camTarget = frame.position.clone()
      .addScaledVector(frame.right, playerX * CAM_FOLLOW_LATERAL)
      .addScaledVector(frame.up, playerY * CAM_FOLLOW_LATERAL + CAM_HEIGHT)
      .addScaledVector(frame.forward, -CAM_BEHIND)

    camera.position.lerp(camTarget, 1 - Math.exp(-CAM_LAG_RATE * dt))
    camera.up.copy(frame.up)
    camera.lookAt(camera.position.clone().add(frame.forward))

    lastFrame = frame
    lastPlayerPos = playerPos
  }

  function getFrameAt(extraDistance = 0) {
    if (mode === 'arena' || extraDistance === 0) return lastFrame
    return frameAtArcLength(distance + extraDistance)
  }

  return {
    update,
    getPlayerPosition: () => lastPlayerPos.clone(),
    getShipNosePosition: () => lastPlayerPos.clone().addScaledVector(lastFrame.forward, SHIP_NOSE_OFFSET),
    getFrameAt,
    setSpeedMultiplier: (m) => { speedMultiplier = m },
    setAdvancing: (v) => { advancing = v },
    setShipVisible: (v) => { ship.visible = v },
    enterArena,
    exitArena,
  }
}