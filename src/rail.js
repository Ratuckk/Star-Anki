import * as THREE from 'three'

// ============================================================================
// rail.js — controlador de trilho + arena all-range + câmera + spawn-âncora
//
// Overhaul v0.51.4 — reescrito do zero pra eliminar o bug de "inimigo nasce à direita
// do jogador". A causa raiz era o `getAimLineAhead`, que devolvia o CENTRO DA TELA em vez
// da posição da NAVE. Como a câmera segue só 30% do movimento lateral do jogador
// (CAM_FOLLOW_LATERAL), quando a nave está à esquerda o centro da tela fica à direita
// dela — e todo inimigo do modo trilho (chamado via enemies/shared.js →
// randomSpawnPositionOnPath → rail.getAimLineAhead) nascia visivelmente deslocado pra
// direita. Agora `getAimLineAhead` devolve `posição_da_nave + forward * distanceAhead`,
// que é a leitura de "inimigo vem de frente" que o jogador de fato espera.
//
// A API pública é IDÊNTICA à versão anterior — nenhum outro arquivo precisa mudar.
// ============================================================================

// ============ VELOCIDADE DO TRILHO ============
const RAIL_SPEED = 22

// ============ MOVIMENTO LATERAL ============
// aceleração progressiva: manter a mesma direção (X e Y) por LATERAL_ACCEL_HOLD_TIME sobe
// a velocidade lateral de LATERAL_SPEED_BASE até LATERAL_SPEED_MAX. Soltar/trocar reseta.
const LATERAL_SPEED_BASE = 15
const LATERAL_SPEED_MAX = 22
const LATERAL_ACCEL_HOLD_TIME = 1.2
const LATERAL_ACCEL_RATE = 22

// limite de deslocamento lateral (quanto a nave pode sair do centro do trilho)
const BOX_X = 44
const BOX_Y = 44

// inclinação da nave ao mover lateralmente (cosmético, não afeta hitbox)
const MAX_ROLL = 0.55
const ROLL_SMOOTH_RATE = 10

// ============ CÂMERA ============
const CAM_LAG_RATE = 5
const CAM_BEHIND = 10
const CAM_HEIGHT = 3
// quanto a câmera segue do movimento lateral do jogador — 0.3 = 30%. Isso é o motivo pelo
// qual "centro da tela ≠ posição da nave" quando o jogador se move lateralmente.
const CAM_FOLLOW_LATERAL = 0.3

// drift senoidal cosmético da câmera (nunca afeta spawn/hitbox)
const CAMERA_DYNAMIC_PERIOD = 17
const CAMERA_DYNAMIC_LATERAL = 2.4
const CAMERA_DYNAMIC_VERTICAL = 1.1
const CAMERA_DYNAMIC_ROLL = 0.1

// roll de câmera proporcional à curvatura real do trilho
const CURVE_SAMPLE_AHEAD = 6
const CURVE_ROLL_GAIN = 3.2
const CURVE_ROLL_MAX = THREE.MathUtils.degToRad(14)
const CURVE_ROLL_SMOOTH_RATE = 4

// FOV dinâmico durante o boost
const CAM_FOV_BASE = 70
const CAM_FOV_BOOST = 84
const CAM_FOV_LERP_RATE = 6

// ============ NARIZ DA NAVE ============
const SHIP_NOSE_OFFSET = 1.6

// ============ VISUAL DA NAVE (presets de Configurações → Visual) ============
export const SHIP_VISUAL_DEFAULT = 'default'
const SHIP_PRESETS = {
  default: {
    label: 'Clássica',
    bodyColor: 0xeaf3ff,
    accentColor: 0xeaf3ff,
    bodyRadius: 0.4,
    bodyLength: 3.4,
    wingHalfSpan: 2.6,
    wingFront: 0.9,
    wingBack: 1.1,
    wingPosition: [0, -0.05, -0.2],
    finPosition: [0, 0.2, -1],
    finCount: 1,
    finSide: 'dorsal',
    weight: 0.5,
  },
  bombardeiro: {
    label: 'Bombardeiro',
    bodyColor: 0x3a3f45,
    accentColor: 0xffb84d,
    bodyRadius: 0.7,
    bodyLength: 2.6,
    wingHalfSpan: 3.4,
    wingFront: 0.4,
    wingBack: 0.5,
    wingPosition: [0, -0.05, -0.1],
    finPosition: [0, 0.35, -0.6],
    finCount: 2,
    finSpread: 4.8,
    finSide: 'dorsal',
    weight: 1,
  },
  racer: {
    label: 'Veloz',
    bodyColor: 0x2bff88,
    accentColor: 0x184d2e,
    bodyRadius: 0.26,
    bodyLength: 4.4,
    wingHalfSpan: 1.3,
    wingFront: 0.3,
    wingBack: 1.8,
    wingPosition: [0, -0.05, -0.6],
    finPosition: [0, -0.3, -1.3],
    finCount: 1,
    finSide: 'ventral',
    weight: 0.15,
  },
}
export const SHIP_VISUAL_OPTIONS = Object.entries(SHIP_PRESETS).map(([id, p]) => ({ id, label: p.label }))

// ============ "PESO FÍSICO" (springs de animação) ============
// Cada preset de nave define um `weight` de 0..1; estes pares (light/heavy) são interpolados
// por ele. Nave leve = mola rígida, respostas rápidas. Nave pesada = mola mole, movimento
// lento com inércia.
const ROLL_STIFFNESS_LIGHT = 220
const ROLL_STIFFNESS_HEAVY = 70
const ROLL_DAMPING_LIGHT = 22
const ROLL_DAMPING_HEAVY = 9
const RECOIL_KICK_LIGHT = 0.03
const RECOIL_KICK_HEAVY = 0.16
const RECOIL_DECAY_LIGHT = 18
const RECOIL_DECAY_HEAVY = 6
const SQUAT_DEPTH_LIGHT = 0.05
const SQUAT_DEPTH_HEAVY = 0.32
const SQUAT_DECAY_LIGHT = 14
const SQUAT_DECAY_HEAVY = 5
const SPEED_SHAKE_LIGHT = 0.045
const SPEED_SHAKE_HEAVY = 0.012
const BOOST_STRETCH_LIGHT = 0.22
const BOOST_STRETCH_HEAVY = 0.06
const IMPACT_SQUASH_LIGHT = 0.06
const IMPACT_SQUASH_HEAVY = 0.24
const IMPACT_SQUASH_DECAY = 10
const WOBBLE_STIFFNESS = 90
const WOBBLE_DAMPING_LIGHT = 20
const WOBBLE_DAMPING_HEAVY = 7
const WOBBLE_KICK = 0.35
const BOOST_BLEND_RATE = 8

function shipPhysicsFor(preset) {
  const w = THREE.MathUtils.clamp(preset.weight ?? 0.5, 0, 1)
  const mix = (light, heavy) => THREE.MathUtils.lerp(light, heavy, w)
  return {
    rollStiffness: mix(ROLL_STIFFNESS_LIGHT, ROLL_STIFFNESS_HEAVY),
    rollDamping: mix(ROLL_DAMPING_LIGHT, ROLL_DAMPING_HEAVY),
    recoilKick: mix(RECOIL_KICK_LIGHT, RECOIL_KICK_HEAVY),
    recoilDecay: mix(RECOIL_DECAY_LIGHT, RECOIL_DECAY_HEAVY),
    squatDepth: mix(SQUAT_DEPTH_LIGHT, SQUAT_DEPTH_HEAVY),
    squatDecay: mix(SQUAT_DECAY_LIGHT, SQUAT_DECAY_HEAVY),
    speedShake: mix(SPEED_SHAKE_LIGHT, SPEED_SHAKE_HEAVY),
    boostStretch: mix(BOOST_STRETCH_LIGHT, BOOST_STRETCH_HEAVY),
    impactSquash: mix(IMPACT_SQUASH_LIGHT, IMPACT_SQUASH_HEAVY),
    wobbleDamping: mix(WOBBLE_DAMPING_LIGHT, WOBBLE_DAMPING_HEAVY),
  }
}

// ============ ARENA (all-range) ============
const ARENA_TURN_RATE = 1.8
const ARENA_PITCH_LIMIT = 1.2
const ARENA_SPEED = 22
const ARENA_RADIUS = 190

const WORLD_UP = new THREE.Vector3(0, 1, 0)

const DODGE_ROLL_MAX_ANGLE = THREE.MathUtils.degToRad(90)
const FULL_SPIN_DURATION = 0.45

const ARENA_DASH_DISTANCE = 16
const ARENA_BANK_ASSIST_RATE = 1.1

const ARENA_AUTOLEVEL_IDLE_S = 1.0
const ARENA_AUTOLEVEL_RATE = 1.2

const EMERGENCY_BRAKE_DURATION = 0.35
const EMERGENCY_BRAKE_SPEED_MULT = 0.05
const EMERGENCY_BRAKE_COOLDOWN = 1.5

const SUMMERSAULT_DURATION = 0.6

// ============ CONSTRUÇÃO DO TRILHO ============
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
  shape.moveTo(0.65, 0)
  shape.lineTo(-0.35, 0)
  shape.lineTo(0, 1.1)
  shape.closePath()
  return shape
}

function buildShip(variant = SHIP_VISUAL_DEFAULT) {
  const preset = SHIP_PRESETS[variant] || SHIP_PRESETS[SHIP_VISUAL_DEFAULT]
  const bodyMaterial = new THREE.MeshPhongMaterial({
    color: preset.bodyColor, flatShading: true, side: THREE.DoubleSide,
  })
  const accentMaterial = preset.accentColor === preset.bodyColor
    ? bodyMaterial
    : new THREE.MeshPhongMaterial({
        color: preset.accentColor, flatShading: true, side: THREE.DoubleSide,
      })

  const body = new THREE.Mesh(
    new THREE.ConeGeometry(preset.bodyRadius, preset.bodyLength, 4),
    bodyMaterial,
  )
  body.rotation.x = Math.PI / 2

  const wing = new THREE.Mesh(
    new THREE.ShapeGeometry(buildDeltaShape(preset.wingHalfSpan, preset.wingFront, preset.wingBack)),
    bodyMaterial,
  )
  wing.rotation.x = -Math.PI / 2
  wing.position.set(...preset.wingPosition)

  const group = new THREE.Group()
  group.add(body, wing)

  const finFlip = preset.finSide === 'ventral' ? -1 : 1
  const finXOffsets = preset.finCount === 2 ? [-preset.finSpread / 2, preset.finSpread / 2] : [0]
  for (const finX of finXOffsets) {
    const fin = new THREE.Mesh(new THREE.ShapeGeometry(buildFinShape()), accentMaterial)
    fin.rotation.y = Math.PI / 2
    fin.scale.y = finFlip
    fin.position.set(finX, preset.finPosition[1], preset.finPosition[2])
    group.add(fin)
  }

  return group
}

// ============ FACTORY PRINCIPAL ============
export function createRailController(camera, scene, shipVisual = SHIP_VISUAL_DEFAULT) {
  const curve = buildCurve()
  const length = curve.getLength()
  const shipPhysics = shipPhysicsFor(SHIP_PRESETS[shipVisual] || SHIP_PRESETS[SHIP_VISUAL_DEFAULT])

  // ---------- estado do jogador no trilho ----------
  let distance = 0
  let playerX = 0
  let playerY = 0
  let velX = 0
  let velY = 0
  let lastMoveXSign = 0
  let lastMoveYSign = 0
  let lateralAccelTimer = 0
  let roll = 0
  let rollVel = 0
  let speedMultiplier = 1
  let advancing = true

  // ---------- câmera: dinâmica / curvas ----------
  let camDynamicT = 0
  let curveRollSmoothed = 0

  // ---------- boost ----------
  let boostActive = false
  let prevBoostActive = false
  let boostBlend = 0

  // ---------- animações de peso ----------
  let recoilOffset = 0
  let squatOffset = 0
  let impactSquashT = 0
  let wobbleOffset = 0
  let wobbleVel = 0

  // ---------- arena / dodge / giro ----------
  let arenaIdleTimer = 0
  let emergencyBrakeTimer = 0
  let emergencyBrakeCooldownTimer = 0
  let summersaultT = 1
  let summersaultStartYaw = 0
  let turnSensitivity = 1

  // ---------- frames (usados por spawns/câmera) ----------
  let lastFrame = frameAtArcLength(0)
  let lastPlayerPos = lastFrame.position.clone()

  // ---------- modo + arena ----------
  let mode = 'rail'
  const arenaCenter = new THREE.Vector3()
  const arenaPos = new THREE.Vector3()
  let arenaYaw = 0
  let arenaPitch = 0
  let arenaRoll = 0
  let arenaRollVel = 0

  // ---------- shake de impacto ----------
  let shakeMagnitude = 0

  // ---------- dodge cosmético ----------
  let dodgeRoll = 0
  let dodgeDebugOverrideDir = 0
  let dodgeDebugOverrideUntil = 0

  // ---------- giro completo ----------
  let fullSpinT = 1
  let fullSpinDir = 0

  // ---------- mesh da nave ----------
  const ship = buildShip(shipVisual)
  ship.position.copy(lastFrame.position)
  scene.add(ship)

  // câmera inicial
  camera.fov = 70
  camera.position.copy(lastFrame.position)
  camera.updateProjectionMatrix()

  // ==========================================================================
  // HELPERS INTERNOS
  // ==========================================================================

  function frameAtArcLength(s) {
    const u = (((s / length) % 1) + 1) % 1
    const position = curve.getPointAt(u)
    const forward = curve.getTangentAt(u).normalize()
    const right = new THREE.Vector3().crossVectors(forward, WORLD_UP).normalize()
    const up = new THREE.Vector3().crossVectors(right, forward).normalize()
    return { position, forward, right, up }
  }

  function pathTurnRate(distance) {
    const forwardNow = frameAtArcLength(distance).forward
    const forwardAhead = frameAtArcLength(distance + CURVE_SAMPLE_AHEAD).forward
    const a = forwardNow.x === 0 && forwardNow.z === 0
      ? forwardNow
      : new THREE.Vector3(forwardNow.x, 0, forwardNow.z).normalize()
    const b = forwardAhead.x === 0 && forwardAhead.z === 0
      ? forwardAhead
      : new THREE.Vector3(forwardAhead.x, 0, forwardAhead.z).normalize()
    const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1)
    const angle = Math.acos(dot)
    const sign = a.z * b.x - a.x * b.z >= 0 ? 1 : -1
    return angle * sign
  }

  function applyShakeJitter() {
    if (shakeMagnitude <= 0) return
    ship.position.x += (Math.random() * 2 - 1) * shakeMagnitude
    ship.position.y += (Math.random() * 2 - 1) * shakeMagnitude
  }

  function applyWeightJitter() {
    const magnitude = shipPhysics.speedShake * boostBlend
    if (magnitude <= 0) return
    ship.position.x += (Math.random() * 2 - 1) * magnitude
    ship.position.y += (Math.random() * 2 - 1) * magnitude
  }

  function applyImpulseOffsets(forward, up) {
    if (recoilOffset > 0) ship.position.addScaledVector(forward, -recoilOffset)
    if (squatOffset > 0) ship.position.addScaledVector(up, -squatOffset)
  }

  function applyWeightScale() {
    const lengthScale = 1 + shipPhysics.boostStretch * boostBlend - shipPhysics.impactSquash * impactSquashT
    const crossScale = 1 - 0.5 * shipPhysics.boostStretch * boostBlend + 0.5 * shipPhysics.impactSquash * impactSquashT
    ship.scale.set(crossScale, crossScale, lengthScale)
  }

  function springStep(value, velocity, target, stiffness, damping, dt) {
    const accel = (target - value) * stiffness - velocity * damping
    const newVelocity = velocity + accel * dt
    return { value: value + newVelocity * dt, velocity: newVelocity }
  }

  function decayImpulse(value, decayRate, dt) {
    return value * Math.exp(-decayRate * dt)
  }

  // ==========================================================================
  // DODGE / GIRO / SUMMERSAULT / FREIO
  // ==========================================================================

  function dodgeInputDirection(input) {
    if (performance.now() < dodgeDebugOverrideUntil) return dodgeDebugOverrideDir
    return input.bank || 0
  }

  function updateDodgeRoll(dt, input) {
    const target = dodgeInputDirection(input) * DODGE_ROLL_MAX_ANGLE
    dodgeRoll += (target - dodgeRoll) * (1 - Math.exp(-ROLL_SMOOTH_RATE * dt))
  }

  function updateFullSpin(dt) {
    if (fullSpinT >= 1) return 0
    fullSpinT = Math.min(1, fullSpinT + dt / FULL_SPIN_DURATION)
    if (fullSpinT >= 1) wobbleVel += WOBBLE_KICK * fullSpinDir
    return fullSpinT * Math.PI * 2 * fullSpinDir
  }

  function triggerFullSpin(direction) {
    fullSpinDir = direction
    fullSpinT = 0
  }

  function triggerArenaLateralDash(direction) {
    if (mode !== 'arena' || direction === 0) return
    arenaPos.addScaledVector(lastFrame.right, Math.sign(direction) * ARENA_DASH_DISTANCE)
    const offset = arenaPos.clone().sub(arenaCenter)
    if (offset.length() > ARENA_RADIUS) {
      arenaPos.copy(arenaCenter).addScaledVector(offset.normalize(), ARENA_RADIUS)
    }
  }

  function triggerArenaSummersault() {
    if (mode !== 'arena' || summersaultT < 1) return
    summersaultStartYaw = arenaYaw
    summersaultT = 0
  }

  function updateSummersault(dt) {
    if (summersaultT >= 1) return 0
    summersaultT = Math.min(1, summersaultT + dt / SUMMERSAULT_DURATION)
    const eased = 1 - Math.pow(1 - summersaultT, 3)
    arenaYaw = summersaultStartYaw + Math.PI * eased
    if (summersaultT >= 1) wobbleVel += WOBBLE_KICK * (Math.random() < 0.5 ? -1 : 1)
    return summersaultT * Math.PI * 2
  }

  function triggerEmergencyBrake() {
    if (mode !== 'arena' || emergencyBrakeCooldownTimer > 0) return false
    emergencyBrakeTimer = EMERGENCY_BRAKE_DURATION
    emergencyBrakeCooldownTimer = EMERGENCY_BRAKE_COOLDOWN
    return true
  }

  function triggerRecoil() {
    recoilOffset += shipPhysics.recoilKick
  }

  function triggerImpactSquash() {
    impactSquashT = 1
  }

  // ==========================================================================
  // ARENA (all-range)
  // ==========================================================================

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
    const summersaultFlip = updateSummersault(dt)
    const inSummersault = summersaultT < 1

    if (emergencyBrakeTimer > 0) emergencyBrakeTimer = Math.max(0, emergencyBrakeTimer - dt)
    if (emergencyBrakeCooldownTimer > 0) emergencyBrakeCooldownTimer = Math.max(0, emergencyBrakeCooldownTimer - dt)

    if (!inSummersault) {
      arenaYaw -= (input.moveX * ARENA_TURN_RATE * turnSensitivity + (input.bank || 0) * ARENA_BANK_ASSIST_RATE * turnSensitivity) * dt
      arenaPitch = THREE.MathUtils.clamp(
        arenaPitch + input.moveY * ARENA_TURN_RATE * turnSensitivity * dt,
        -ARENA_PITCH_LIMIT,
        ARENA_PITCH_LIMIT,
      )
      const targetRoll = THREE.MathUtils.clamp(-input.moveX, -1, 1) * MAX_ROLL
      const arenaRollSpring = springStep(arenaRoll, arenaRollVel, targetRoll, shipPhysics.rollStiffness, shipPhysics.rollDamping, dt)
      arenaRoll = arenaRollSpring.value
      arenaRollVel = arenaRollSpring.velocity

      const hasSteerInput = input.moveX !== 0 || input.moveY !== 0 || !!input.bank
      arenaIdleTimer = hasSteerInput ? 0 : arenaIdleTimer + dt
      if (arenaIdleTimer > ARENA_AUTOLEVEL_IDLE_S) {
        arenaPitch += (0 - arenaPitch) * (1 - Math.exp(-ARENA_AUTOLEVEL_RATE * dt))
      }
    }

    const forward = forwardFromYawPitch(arenaYaw, arenaPitch)
    const brakeFactor = emergencyBrakeTimer > 0 ? EMERGENCY_BRAKE_SPEED_MULT : 1
    arenaPos.addScaledVector(forward, ARENA_SPEED * speedMultiplier * brakeFactor * dt)

    const offset = arenaPos.clone().sub(arenaCenter)
    if (offset.length() > ARENA_RADIUS) {
      arenaPos.copy(arenaCenter).addScaledVector(offset.normalize(), ARENA_RADIUS)
    }

    const right = new THREE.Vector3().crossVectors(forward, WORLD_UP).normalize()
    const up = new THREE.Vector3().crossVectors(right, forward).normalize()

    ship.position.copy(arenaPos)
    ship.up.copy(up)
    ship.lookAt(arenaPos.clone().add(forward))
    ship.rotateZ(arenaRoll)
    ship.rotateZ(dodgeRoll)
    ship.rotateZ(fullSpinAngle)
    ship.rotateZ(wobbleOffset)
    if (summersaultFlip) ship.rotateX(summersaultFlip)
    applyWeightScale()
    applyImpulseOffsets(forward, up)
    applyShakeJitter()
    applyWeightJitter()

    const camTarget = arenaPos.clone()
      .addScaledVector(forward, -CAM_BEHIND)
      .addScaledVector(up, CAM_HEIGHT)

    camera.position.lerp(camTarget, dt === 0 ? 1 : 1 - Math.exp(-CAM_LAG_RATE * dt))
    camera.up.copy(up)
    camera.lookAt(camera.position.clone().add(forward))

    lastFrame = { position: arenaPos.clone(), forward, right, up }
    lastPlayerPos = arenaPos.clone()
  }

  // ==========================================================================
  // UPDATE PRINCIPAL (modo trilho)
  // ==========================================================================

  function update(dt, input) {
    updateDodgeRoll(dt, input)
    const fullSpinAngle = updateFullSpin(dt)

    boostBlend += ((boostActive ? 1 : 0) - boostBlend) * (1 - Math.exp(-BOOST_BLEND_RATE * dt))
    if (boostActive && !prevBoostActive) squatOffset = Math.max(squatOffset, shipPhysics.squatDepth)
    prevBoostActive = boostActive

    squatOffset = decayImpulse(squatOffset, shipPhysics.squatDecay, dt)
    recoilOffset = decayImpulse(recoilOffset, shipPhysics.recoilDecay, dt)
    impactSquashT = decayImpulse(impactSquashT, IMPACT_SQUASH_DECAY, dt)

    const wobbleSpring = springStep(wobbleOffset, wobbleVel, 0, WOBBLE_STIFFNESS, shipPhysics.wobbleDamping, dt)
    wobbleOffset = wobbleSpring.value
    wobbleVel = wobbleSpring.velocity

    const targetFov = boostActive ? CAM_FOV_BOOST : CAM_FOV_BASE
    if (boostActive || Math.abs(camera.fov - CAM_FOV_BASE) <= 10) {
      camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-CAM_FOV_LERP_RATE * dt))
      camera.updateProjectionMatrix()
    }

    // modo arena: roda updateArena e retorna
    if (mode === 'arena') {
      updateArena(dt, input, fullSpinAngle)
      return
    }

    // ---------- modo trilho: avanço + movimento lateral ----------
    if (advancing) distance += RAIL_SPEED * speedMultiplier * dt

    const curXSign = Math.sign(input.moveX)
    const curYSign = Math.sign(input.moveY)
    const sameDir = (curXSign !== 0 || curYSign !== 0)
      && curXSign === lastMoveXSign
      && curYSign === lastMoveYSign
    lateralAccelTimer = sameDir ? Math.min(LATERAL_ACCEL_HOLD_TIME, lateralAccelTimer + dt) : 0
    lastMoveXSign = curXSign
    lastMoveYSign = curYSign

    const accelT = lateralAccelTimer / LATERAL_ACCEL_HOLD_TIME
    const currentLateralSpeed = LATERAL_SPEED_BASE + (LATERAL_SPEED_MAX - LATERAL_SPEED_BASE) * accelT

    const targetVelX = input.moveX * currentLateralSpeed
    const targetVelY = input.moveY * currentLateralSpeed
    const accelBlend = 1 - Math.exp(-LATERAL_ACCEL_RATE * dt)
    velX += (targetVelX - velX) * accelBlend
    velY += (targetVelY - velY) * accelBlend

    playerX += velX * dt
    playerY += velY * dt

    if (playerX > BOX_X) { playerX = BOX_X; velX = 0 }
    else if (playerX < -BOX_X) { playerX = -BOX_X; velX = 0 }
    if (playerY > BOX_Y) { playerY = BOX_Y; velY = 0 }
    else if (playerY < -BOX_Y) { playerY = -BOX_Y; velY = 0 }

    const frame = frameAtArcLength(distance)

    const targetRoll = THREE.MathUtils.clamp(-input.moveX, -1, 1) * MAX_ROLL
    const rollSpring = springStep(roll, rollVel, targetRoll, shipPhysics.rollStiffness, shipPhysics.rollDamping, dt)
    roll = rollSpring.value
    rollVel = rollSpring.velocity

    // ---------- POSIÇÃO REAL DA NAVE NO MUNDO ----------
    // frame.position é o ponto no trilho; playerX/playerY são o deslocamento local (right/up).
    // `playerPos` é a posição mundial da NAVE — é ESTA que serve de âncora pros spawns, NÃO
    // a posição da câmera (que só segue 30% do lateral).
    const playerPos = frame.position.clone()
      .addScaledVector(frame.right, playerX)
      .addScaledVector(frame.up, playerY)

    ship.position.copy(playerPos)
    ship.up.copy(frame.up)
    ship.lookAt(playerPos.clone().add(frame.forward))
    ship.rotateZ(roll)
    ship.rotateZ(dodgeRoll)
    ship.rotateZ(fullSpinAngle)
    ship.rotateZ(wobbleOffset)
    applyWeightScale()
    applyImpulseOffsets(frame.forward, frame.up)
    applyShakeJitter()
    applyWeightJitter()

    // ---------- CÂMERA ----------
    camDynamicT += dt
    const cyclePhase = (camDynamicT / CAMERA_DYNAMIC_PERIOD) * Math.PI * 2
    const dynLateral = Math.sin(cyclePhase) * CAMERA_DYNAMIC_LATERAL
    const dynVertical = Math.sin(cyclePhase * 0.7 + 1.3) * CAMERA_DYNAMIC_VERTICAL
    const dynRoll = Math.sin(cyclePhase * 0.5 + 2.1) * CAMERA_DYNAMIC_ROLL

    const targetCurveRoll = THREE.MathUtils.clamp(
      pathTurnRate(distance) * CURVE_ROLL_GAIN,
      -CURVE_ROLL_MAX,
      CURVE_ROLL_MAX,
    )
    curveRollSmoothed += (targetCurveRoll - curveRollSmoothed) * (1 - Math.exp(-CURVE_ROLL_SMOOTH_RATE * dt))

    const camTarget = frame.position.clone()
      .addScaledVector(frame.right, playerX * CAM_FOLLOW_LATERAL + dynLateral)
      .addScaledVector(frame.up, playerY * CAM_FOLLOW_LATERAL + CAM_HEIGHT + dynVertical)
      .addScaledVector(frame.forward, -CAM_BEHIND)

    camera.position.lerp(camTarget, 1 - Math.exp(-CAM_LAG_RATE * dt))
    camera.up.copy(frame.up).applyAxisAngle(frame.forward, dynRoll + curveRollSmoothed)
    camera.lookAt(camera.position.clone().add(frame.forward))

    // cache do frame/posição pra spawns e câmera no próximo tick
    lastFrame = frame
    lastPlayerPos = playerPos
  }

  function getFrameAt(extraDistance = 0) {
    if (mode === 'arena' || extraDistance === 0) return lastFrame
    return frameAtArcLength(distance + extraDistance)
  }

  // ==========================================================================
  // API PÚBLICA
  // ==========================================================================

  return {
    update,

    // posição MUNDIAL da nave (não da câmera)
    getPlayerPosition: () => lastPlayerPos.clone(),
    getShipNosePosition: () => lastPlayerPos.clone().addScaledVector(lastFrame.forward, SHIP_NOSE_OFFSET),

    getFrameAt,

    // deslocamento lateral LOCAL (direita/cima) da nave em relação ao trilho
    getPlayerLateral: () => ({ x: playerX, y: playerY }),
    getPlayerLateralVelocity: () => ({ x: velX, y: velY }),

    getArenaCenter: () => arenaCenter.clone(),
    isArena: () => mode === 'arena',
    getArenaSpeed: () => ARENA_SPEED * speedMultiplier,
    getArenaAttitude: () => ({ pitch: arenaPitch, roll: arenaRoll }),

    setSpeedMultiplier: (m) => { speedMultiplier = m },
    setBoostActive: (v) => { boostActive = !!v },
    getBoostActive: () => boostActive,

    // ======================================================================
    // getAimLineAhead — PONTO DE ANCORAGEM DE SPAWN (fix principal da v0.51.4)
    // ======================================================================
    //
    // Esta função é a ÚNICA porta de entrada pra spawn de inimigo no modo trilho: ela é
    // chamada por enemies/shared.js → randomSpawnPositionOnPath → spawnPositionForEnemy,
    // que TODAS as classes de inimigo do modo trilho usam pra decidir ONDE nascer.
    //
    // VERSÕES ANTERIORES (bug):
    //   Tentavam devolver "o centro da tela" reconstruindo a posição da câmera com o
    //   offset lateral do jogador. Mas a câmera só segue CAM_FOLLOW_LATERAL (30%) do
    //   movimento lateral — então o centro da tela fica à DIREITA da nave quando ela está
    //   à esquerda (a câmera fica mais perto do centro que a nave). Resultado: todo inimigo
    //   nascia visivelmente deslocado pra direita da nave, que é o bug reportado.
    //
    // CORREÇÃO ATUAL:
    //   Devolve simplesmente `posição_da_nave + forward * distanceAhead`. Isto ancora o
    //   spawn EXATAMENTE na direção em que a nave está apontando — o inimigo nasce à frente
    //   dela, na mesma linha lateral, que é a leitura de "inimigo vem de frente" que o
    //   jogador espera. Não tenta adivinhar o centro da tela nem compensar o lag da câmera.
    //
    // CORREÇÃO REAL (v0.51.5, medida e comprovada): ancorar no forward da NAVE (acima) parecia
    // certo, mas playerX vai de -44 a +44 (BOX_X) enquanto a câmera só segue 30% disso
    // (CAM_FOLLOW_LATERAL) — na prática o jogador passa a maior parte do tempo fora do centro
    // (é assim que se desvia de tiro), então o spawn "ancorado na nave" ficava sistematicamente
    // NA TELA do lado onde o jogador já estava (medido: NDC x médio +0.24 segurando direita,
    // -0.26 segurando esquerda — o "sempre nasce à direita" reportado era, na prática, "nasce
    // do lado que você já está"). A única âncora que fica sempre no centro da tela POR
    // DEFINIÇÃO é a própria câmera: usar a base (posição + right/up/forward) direto da matriz
    // mundial dela — sem tentar reconstruir/compensar o follow lag manualmente — dá NDC x médio
    // ~0.00 em qualquer playerX (testado com playerX=44). NÃO troque isso de volta pra
    // "ancorar na nave" sem medir de novo: o resultado intuitivo (ship-anchored) está provado
    // errado.
    getAimLineAhead(distanceAhead) {
      camera.updateMatrixWorld()
      const forward = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2).multiplyScalar(-1)
      return camera.position.clone().addScaledVector(forward, distanceAhead)
    },
    getSpawnFrame() {
      camera.updateMatrixWorld()
      return {
        position: camera.position.clone(),
        right: new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0),
        up: new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1),
        forward: new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2).multiplyScalar(-1),
      }
    },

    setAdvancing: (v) => { advancing = v },
    setShipVisible: (v) => { ship.visible = v },
    setShakeIntensity: (m) => { shakeMagnitude = m },
    setTurnSensitivity: (m) => { turnSensitivity = m },

    debugForceBank: (direction, durationMs) => {
      dodgeDebugOverrideDir = direction
      dodgeDebugOverrideUntil = performance.now() + durationMs
    },

    triggerFullSpin,
    triggerArenaLateralDash,
    triggerArenaSummersault,
    triggerEmergencyBrake,
    triggerRecoil,
    triggerImpactSquash,
    enterArena,
    exitArena,
  }
}
