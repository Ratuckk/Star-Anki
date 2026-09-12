import * as THREE from 'three'

const RAIL_SPEED = 22
const LATERAL_SPEED = 22
const LATERAL_ACCEL_RATE = 22
const BOX_X = 44
const BOX_Y = 44
const MAX_ROLL = 0.55
const ROLL_SMOOTH_RATE = 10
const CAM_LAG_RATE = 5
const CAM_BEHIND = 10
const CAM_HEIGHT = 3

const CAM_FOLLOW_LATERAL = 0.3

const SHIP_NOSE_OFFSET = 1.6
const SHIP_COLOR = 0xeaf3ff

const ARENA_TURN_RATE = 1.8
const ARENA_PITCH_LIMIT = 1.2
const ARENA_SPEED = 22
const ARENA_RADIUS = 190

const WORLD_UP = new THREE.Vector3(0, 1, 0)

// giro-desvio: segurar Z/C inclina a nave de verdade pro lado (bank forte, não um tilt
// pequeno) e ela FICA inclinada enquanto o botão continuar segurado, voltando ao soltar. Desde
// a Fase 3, esse hold é SÓ cosmético (main.js não concede mais i-frames por ele) — a
// invencibilidade agora vem exclusivamente do giro completo (abaixo).
const DODGE_ROLL_MAX_ANGLE = THREE.MathUtils.degToRad(170)

// giro completo (Fase 3, reintroduzido): 2 toques rápidos na MESMA tecla Z/C disparam uma volta
// de 360° só cosmética por cima da inclinação normal — main.js decide o cooldown de 3s e a
// invencibilidade, aqui só a animação em si (ângulo evoluindo de 0 a 360° em FULL_SPIN_DURATION)
const FULL_SPIN_DURATION = 0.45

// all-range: distância do deslocamento instantâneo do combo "segurar propulsor + Z/C" e taxa
// de guinada extra que segurar Z/C sozinho (sem o combo) já dá de graça, "facilitando o
// movimento pro lado" enquanto inclina — pedido explícito do usuário, mais fraca que o giro
// normal (ARENA_TURN_RATE) pra não duplicar o controle de vôo já existente, só complementar
const ARENA_DASH_DISTANCE = 16
const ARENA_BANK_ASSIST_RATE = 1.1

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

  // chacoalhar visual da nave ao levar hit — main.js decide a intensidade/decaimento a cada
  // frame; aqui só aplicamos um jitter na posição RENDERIZADA (depois de já ter orientado a
  // nave), então não afeta playerX/playerY/lastPlayerPos usados pra colisão/mira
  let shakeMagnitude = 0

  // giro-desvio (Z/C): puramente cosmético — uma rotação extra em cima da orientação normal,
  // seguindo continuamente o quanto o botão está segurado (input.bank, de -1 a 1). main.js só
  // concede i-frames e lê o estado; aqui é onde o ângulo de verdade é calculado e suavizado.
  let dodgeRoll = 0
  let dodgeDebugOverrideDir = 0
  let dodgeDebugOverrideUntil = 0

  // giro completo: fullSpinT vai de 0 a 1 durante a animação (>=1 = inativo/concluído);
  // fullSpinDir é o sentido (-1/1) travado no instante do disparo
  let fullSpinT = 1
  let fullSpinDir = 0

  const ship = buildShip()
  ship.position.copy(lastFrame.position)
  scene.add(ship)

  camera.fov = 70
  camera.position.copy(lastFrame.position)
  camera.updateProjectionMatrix()

  const DEBUG = false

  function frameAtArcLength(s) {
    const u = (((s / length) % 1) + 1) % 1
    const position = curve.getPointAt(u)
    const forward = curve.getTangentAt(u).normalize()
    const right = new THREE.Vector3().crossVectors(forward, WORLD_UP).normalize()
    const up = new THREE.Vector3().crossVectors(right, forward).normalize()
    return { position, forward, right, up }
  }

  function applyShakeJitter() {
    if (shakeMagnitude <= 0) return
    ship.position.x += (Math.random() * 2 - 1) * shakeMagnitude
    ship.position.y += (Math.random() * 2 - 1) * shakeMagnitude
  }

  function dodgeInputDirection(input) {
    if (performance.now() < dodgeDebugOverrideUntil) return dodgeDebugOverrideDir
    return input.bank || 0
  }

  function updateDodgeRoll(dt, input) {
    const target = dodgeInputDirection(input) * DODGE_ROLL_MAX_ANGLE
    dodgeRoll += (target - dodgeRoll) * (1 - Math.exp(-ROLL_SMOOTH_RATE * dt))
  }

  // giro completo: avança fullSpinT até 1 (fim da animação) e devolve o ângulo extra (0 a 360°,
  // no sentido travado em fullSpinDir) pra somar em cima do dodgeRoll — puramente cosmético
  function updateFullSpin(dt) {
    if (fullSpinT >= 1) return 0
    fullSpinT = Math.min(1, fullSpinT + dt / FULL_SPIN_DURATION)
    return fullSpinT * Math.PI * 2 * fullSpinDir
  }

  function triggerFullSpin(direction) {
    fullSpinDir = direction
    fullSpinT = 0
  }

  // all-range: desloca a posição da nave instantaneamente pro lado (combo "segurar propulsor +
  // Z/C") — reaproveita o clamp de raio da arena que já existe pro movimento normal
  function triggerArenaLateralDash(direction) {
    if (mode !== 'arena' || direction === 0) return
    arenaPos.addScaledVector(lastFrame.right, Math.sign(direction) * ARENA_DASH_DISTANCE)
    const offset = arenaPos.clone().sub(arenaCenter)
    if (offset.length() > ARENA_RADIUS) arenaPos.copy(arenaCenter).addScaledVector(offset.normalize(), ARENA_RADIUS)
  }

  // all-range: cambalhota (combo "Baixo + repulsor") — meia-volta rápida de reposicionamento,
  // igual ao U-turn do Star Fox 64. Só gira o rumo (yaw); pitch/roll não mudam.
  function triggerArenaSummersault() {
    if (mode !== 'arena') return
    arenaYaw += Math.PI
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

  function updateArena(dt, input, fullSpinAngle = 0) {
    // segurar Z/C sozinho (sem o combo de propulsor) já ajuda a guinar pro lado, "facilitando o
    // movimento" além da inclinação cosmética — mais fraco que o giro normal (input.moveX) pra
    // só complementar, não substituir o controle de vôo
    arenaYaw -= (input.moveX * ARENA_TURN_RATE + (input.bank || 0) * ARENA_BANK_ASSIST_RATE) * dt
    arenaPitch = THREE.MathUtils.clamp(arenaPitch + input.moveY * ARENA_TURN_RATE * dt, -ARENA_PITCH_LIMIT, ARENA_PITCH_LIMIT)
    const targetRoll = THREE.MathUtils.clamp(-input.moveX, -1, 1) * MAX_ROLL
    arenaRoll += (targetRoll - arenaRoll) * (1 - Math.exp(-ROLL_SMOOTH_RATE * dt))

    const forward = forwardFromYawPitch(arenaYaw, arenaPitch)
    // speedMultiplier (propulsor/repulsor da Fase 3) também vale no all-range, igual ao trilho
    arenaPos.addScaledVector(forward, ARENA_SPEED * speedMultiplier * dt)

    const offset = arenaPos.clone().sub(arenaCenter)
    if (offset.length() > ARENA_RADIUS) arenaPos.copy(arenaCenter).addScaledVector(offset.normalize(), ARENA_RADIUS)

    const right = new THREE.Vector3().crossVectors(forward, WORLD_UP).normalize()
    const up = new THREE.Vector3().crossVectors(right, forward).normalize()

    ship.position.copy(arenaPos)
    ship.up.copy(up)
    ship.lookAt(arenaPos.clone().add(forward))
    ship.rotateZ(arenaRoll)
    ship.rotateZ(dodgeRoll)
    ship.rotateZ(fullSpinAngle)
    applyShakeJitter()

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
    updateDodgeRoll(dt, input)
    const fullSpinAngle = updateFullSpin(dt)

    if (mode === 'arena') {
      updateArena(dt, input, fullSpinAngle)
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
    ship.rotateZ(dodgeRoll)
    ship.rotateZ(fullSpinAngle)
    applyShakeJitter()

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
    // offset lateral CRU da nave (antes de qualquer projeção em curva) — usado pela mira, que
    // agora acompanha a nave (mesmo espaço) em vez de ter física própria independente
    getPlayerLateral: () => ({ x: playerX, y: playerY }),
    // velocidade lateral crua — usada pela mira pra saber o quanto "ir mais longe" durante o
    // movimento (proporcional à velocidade) antes de se corrigir e voltar pro bico da nave
    getPlayerLateralVelocity: () => ({ x: velX, y: velY }),
    getArenaCenter: () => arenaCenter.clone(),
    isArena: () => mode === 'arena',
    // velocidade real atual do jogador no all-range (já incluindo propulsor/repulsor ativos) —
    // usada pra limitar a velocidade dos inimigos em arena a no máximo metade disso (Fase 4)
    getArenaSpeed: () => ARENA_SPEED * speedMultiplier,
    setSpeedMultiplier: (m) => { speedMultiplier = m },
    setAdvancing: (v) => { advancing = v },
    setShipVisible: (v) => { ship.visible = v },
    setShakeIntensity: (m) => { shakeMagnitude = m },
    // só pra debug: força o bank pra um lado por um tempo fixo, simulando o botão segurado
    // (não dá pra "segurar" de verdade num clique de botão de debug)
    debugForceBank: (direction, durationMs) => {
      dodgeDebugOverrideDir = direction
      dodgeDebugOverrideUntil = performance.now() + durationMs
    },
    triggerFullSpin,
    triggerArenaLateralDash,
    triggerArenaSummersault,
    enterArena,
    exitArena,
  }
}
