import * as THREE from 'three'

const RAIL_SPEED = 22
// v0.29.6: nave mais calma por padrão, mas ganha uma pequena aceleração ao manter a MESMA
// direção (X e Y) por LATERAL_ACCEL_HOLD_TIME segundos — sobe de LATERAL_SPEED_BASE até
// LATERAL_SPEED_MAX (que é a velocidade lateral de antes desta mudança). Soltar ou trocar de
// direção reseta o ganho na hora.
const LATERAL_SPEED_BASE = 15
const LATERAL_SPEED_MAX = 22
const LATERAL_ACCEL_HOLD_TIME = 1.2
const LATERAL_ACCEL_RATE = 22
const BOX_X = 44
const BOX_Y = 44
const MAX_ROLL = 0.55
const ROLL_SMOOTH_RATE = 10
const CAM_LAG_RATE = 5
const CAM_BEHIND = 10
const CAM_HEIGHT = 3

const CAM_FOLLOW_LATERAL = 0.3

// Fase 6: câmera mais dinâmica no modo normal — um drift lento (senoidal, nunca abrupto) de
// posição lateral/vertical por cima do follow normal, mais um "dutch angle" leve (a câmera
// mesma se inclina, não o mundo) — dá a sensação de ângulos mais diagonais em certos trechos
// sem nunca atrapalhar a leitura do jogo (mira/hitbox não dependem da câmera, só do estado
// real da nave, que fica intocado). Puramente cosmético.
const CAMERA_DYNAMIC_PERIOD = 17 // segundos por ciclo completo do drift
const CAMERA_DYNAMIC_LATERAL = 2.4
const CAMERA_DYNAMIC_VERTICAL = 1.1
const CAMERA_DYNAMIC_ROLL = 0.1 // radianos (~5.7°) de inclinação máxima da câmera

// Fase 8 (VISUAL): roll de câmera proporcional à curvatura real do trilho — em vez de só o
// drift senoidal acima (que ignora a forma da pista), amostra o "forward" um pouco à frente e
// compara com o atual; quanto mais fechada a curva horizontal, mais a câmera inclina, como um
// caça de verdade fazendo a curva. Suavizado pra não tremer entre amostras.
const CURVE_SAMPLE_AHEAD = 6
const CURVE_ROLL_GAIN = 3.2
const CURVE_ROLL_MAX = THREE.MathUtils.degToRad(14)
const CURVE_ROLL_SMOOTH_RATE = 4

// Fase 8 (VISUAL): FOV abre durante o boost (propulsor/repulsor) e volta ao normal — reforça a
// sensação de velocidade junto com as motion lines/distorção que já existem no HUD.
const CAM_FOV_BASE = 70
const CAM_FOV_BOOST = 84
const CAM_FOV_LERP_RATE = 6

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
const DODGE_ROLL_MAX_ANGLE = THREE.MathUtils.degToRad(90)

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

// Fase 9 (ideias all-range):
// item 1 — depois de ficar sem NENHUM input de direção por ARENA_AUTOLEVEL_IDLE_S, o pitch
// acumulado volta suavemente pro nível (o roll já auto-nivela sozinho, porque seu alvo já é
// sempre 0 quando moveX=0 — só o pitch ficava preso onde o jogador deixou, podendo desorientar).
const ARENA_AUTOLEVEL_IDLE_S = 1.0
const ARENA_AUTOLEVEL_RATE = 1.2

// item 3 (guinada assistida rumo ao alvo mais próximo) foi REMOVIDO por pedido do usuário — em
// lutas de chefe/dourado o "mais próximo" quase sempre era o próprio chefe/dourado, então a
// nave ficava sendo puxada pra ele o tempo todo em vez de responder só ao controle manual.
// Voltou a ser controle 100% manual em all-range, como era antes da Fase 9 introduzir isso.

// item 4 — "freio de emergência": duplo toque em repulsão (sem Baixo, que já é a cambalhota)
// trava a velocidade de avanço quase a zero por um instante curto, pra reposicionamento fino
// perto do chefe/dourado. Cooldown PRÓPRIO — não usa a barra compartilhada de propulsor/
// repulsor de player.js, pra não mexer na economia de boost já existente.
const EMERGENCY_BRAKE_DURATION = 0.35
const EMERGENCY_BRAKE_SPEED_MULT = 0.05
const EMERGENCY_BRAKE_COOLDOWN = 1.5

// item 6 — cambalhota (Baixo + repulsor) virou uma animação de verdade (flip completo no eixo
// de pitch enquanto o yaw gira suavemente) em vez do snap instantâneo de 180° de antes, igual
// ao U-turn do Star Fox 64. Congela o controle manual de yaw/pitch/roll por essa duração.
const SUMMERSAULT_DURATION = 0.6

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

// Fase 7 (VISUAL): "deixe o design da nave mais triangular" — corpo mais fino e sem o giro de
// 45° que antes apresentava uma face de losango/quadrado pra frente (lia como "caixinha" na
// cabine); a asa delta cresceu bem mais que o corpo pra dominar a silhueta (triângulo lido de
// cima, que é o ângulo mais comum de câmera do jogo) e a barbatana ficou mais alta/afiada.
function buildShip() {
  const material = new THREE.MeshPhongMaterial({ color: SHIP_COLOR, flatShading: true, side: THREE.DoubleSide })

  const body = new THREE.Mesh(new THREE.ConeGeometry(0.4, 3.4, 4), material)
  body.rotation.x = Math.PI / 2

  const wing = new THREE.Mesh(new THREE.ShapeGeometry(buildDeltaShape(2.6, 0.9, 1.1)), material)
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
  // v0.29.6: momentum de direção mantida — reseta assim que o sinal de X ou Y muda (ou pára)
  let lastMoveXSign = 0
  let lastMoveYSign = 0
  let lateralAccelTimer = 0
  let roll = 0
  let speedMultiplier = 1
  let advancing = true
  let camDynamicT = 0 // Fase 6: acumulador do drift senoidal da câmera (modo normal)
  let curveRollSmoothed = 0 // Fase 8: roll por curvatura, suavizado entre frames
  let boostActive = false // Fase 8: liga o FOV de velocidade enquanto propulsor/repulsor ativos

  // Fase 9 (ideias all-range)
  let arenaIdleTimer = 0 // item 1: segundos desde o último input de direção real no all-range
  let emergencyBrakeTimer = 0 // item 4
  let emergencyBrakeCooldownTimer = 0 // item 4
  let summersaultT = 1 // item 6: >=1 = inativo, 0..1 = animação em andamento
  let summersaultStartYaw = 0 // item 6
  let turnSensitivity = 1 // item 5: multiplicador configurável em Configurações
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

  // Fase 8 (VISUAL): compara o forward atual com o forward um pouco à frente (só no plano
  // horizontal, XZ) pra saber o quanto/pra que lado o trilho está curvando ali — usado só pelo
  // roll de câmera cosmético, não afeta o pathing real da nave.
  function pathTurnRate(distance) {
    const forwardNow = frameAtArcLength(distance).forward
    const forwardAhead = frameAtArcLength(distance + CURVE_SAMPLE_AHEAD).forward
    const a = forwardNow.x === 0 && forwardNow.z === 0 ? forwardNow : new THREE.Vector3(forwardNow.x, 0, forwardNow.z).normalize()
    const b = forwardAhead.x === 0 && forwardAhead.z === 0 ? forwardAhead : new THREE.Vector3(forwardAhead.x, 0, forwardAhead.z).normalize()
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

  // all-range: cambalhota (combo "Baixo + repulsor") — meia-volta de reposicionamento, igual
  // ao U-turn do Star Fox 64. Fase 9 (ideia 6): agora é uma animação de verdade (updateSummersault
  // abaixo cuida do yaw progressivo + flip visual) em vez de um snap instantâneo de 180°.
  function triggerArenaSummersault() {
    if (mode !== 'arena' || summersaultT < 1) return
    summersaultStartYaw = arenaYaw
    summersaultT = 0
  }

  // avança a animação da cambalhota e devolve o ângulo de flip visual (0→2π, aplicado como
  // rotateX extra no mesh) — o yaw de verdade (arenaYaw) já é atualizado aqui dentro também,
  // com ease-out (rápido no início, suave no fim), pra sensação de impulso natural.
  function updateSummersault(dt) {
    if (summersaultT >= 1) return 0
    summersaultT = Math.min(1, summersaultT + dt / SUMMERSAULT_DURATION)
    const eased = 1 - Math.pow(1 - summersaultT, 3)
    arenaYaw = summersaultStartYaw + Math.PI * eased
    return summersaultT * Math.PI * 2
  }

  // Fase 9 (ideia all-range 4): freio de emergência — cooldown próprio, independente da barra
  // compartilhada de propulsor/repulsor. Devolve false se ainda em cooldown (chamador ignora).
  function triggerEmergencyBrake() {
    if (mode !== 'arena' || emergencyBrakeCooldownTimer > 0) return false
    emergencyBrakeTimer = EMERGENCY_BRAKE_DURATION
    emergencyBrakeCooldownTimer = EMERGENCY_BRAKE_COOLDOWN
    return true
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
    const summersaultFlip = updateSummersault(dt)
    const inSummersault = summersaultT < 1

    if (emergencyBrakeTimer > 0) emergencyBrakeTimer = Math.max(0, emergencyBrakeTimer - dt)
    if (emergencyBrakeCooldownTimer > 0) emergencyBrakeCooldownTimer = Math.max(0, emergencyBrakeCooldownTimer - dt)

    if (!inSummersault) {
      // segurar Z/C sozinho (sem o combo de propulsor) já ajuda a guinar pro lado, "facilitando
      // o movimento" além da inclinação cosmética — mais fraco que o giro normal (input.moveX)
      // pra só complementar, não substituir o controle de vôo
      arenaYaw -= (input.moveX * ARENA_TURN_RATE * turnSensitivity + (input.bank || 0) * ARENA_BANK_ASSIST_RATE * turnSensitivity) * dt
      arenaPitch = THREE.MathUtils.clamp(arenaPitch + input.moveY * ARENA_TURN_RATE * turnSensitivity * dt, -ARENA_PITCH_LIMIT, ARENA_PITCH_LIMIT)
      const targetRoll = THREE.MathUtils.clamp(-input.moveX, -1, 1) * MAX_ROLL
      arenaRoll += (targetRoll - arenaRoll) * (1 - Math.exp(-ROLL_SMOOTH_RATE * dt))

      // Fase 9 (ideia 1): auto-nivelamento do pitch depois de ficar parado (sem input de
      // direção nenhum) por ARENA_AUTOLEVEL_IDLE_S — o roll já volta sozinho (alvo 0 quando
      // moveX=0), só o pitch persistia onde o jogador deixou.
      const hasSteerInput = input.moveX !== 0 || input.moveY !== 0 || !!input.bank
      arenaIdleTimer = hasSteerInput ? 0 : arenaIdleTimer + dt
      if (arenaIdleTimer > ARENA_AUTOLEVEL_IDLE_S) {
        arenaPitch += (0 - arenaPitch) * (1 - Math.exp(-ARENA_AUTOLEVEL_RATE * dt))
      }

      // guinada assistida rumo ao alvo mais próximo (Fase 9, ideia 3) REMOVIDA por pedido do
      // usuário — controle 100% manual em all-range de novo, ver comentário da constante acima.
    }

    const forward = forwardFromYawPitch(arenaYaw, arenaPitch)
    // speedMultiplier (propulsor/repulsor da Fase 3) também vale no all-range, igual ao trilho;
    // o freio de emergência (Fase 9, ideia 4) trava isso quase a zero por um instante curto
    const brakeFactor = emergencyBrakeTimer > 0 ? EMERGENCY_BRAKE_SPEED_MULT : 1
    arenaPos.addScaledVector(forward, ARENA_SPEED * speedMultiplier * brakeFactor * dt)

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
    if (summersaultFlip) ship.rotateX(summersaultFlip)
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

    // se algo fora daqui (ex: o punch de FOV na entrada da luta do chefe, em main.js) deixou o
    // FOV bem longe da base e não estamos boostando, não briga com esse efeito — só retoma o
    // controle quando ele já estiver perto de novo (evita "puxar de volta" no meio do punch)
    const targetFov = boostActive ? CAM_FOV_BOOST : CAM_FOV_BASE
    if (boostActive || Math.abs(camera.fov - CAM_FOV_BASE) <= 10) {
      camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-CAM_FOV_LERP_RATE * dt))
      camera.updateProjectionMatrix()
    }

    if (mode === 'arena') {
      updateArena(dt, input, fullSpinAngle)
      return
    }

    if (advancing) distance += RAIL_SPEED * speedMultiplier * dt

    // v0.29.6: momentum — mantendo a mesma direção (X e Y) o suficiente, a velocidade lateral
    // sobe de LATERAL_SPEED_BASE até LATERAL_SPEED_MAX; qualquer mudança de sinal (ou soltar)
    // zera o ganho na hora, voltando pro base
    const curXSign = Math.sign(input.moveX)
    const curYSign = Math.sign(input.moveY)
    const sameDir = (curXSign !== 0 || curYSign !== 0) && curXSign === lastMoveXSign && curYSign === lastMoveYSign
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

    // Fase 6: drift senoidal lento por cima do follow normal — nunca abrupto, só um "respirar"
    // de câmera que some e volta ao longo de CAMERA_DYNAMIC_PERIOD segundos. As 3 ondas usam
    // fases diferentes (offset + frequência levemente distintas) pra não ficarem sincronizadas
    // e parecerem mecânicas.
    camDynamicT += dt
    const cyclePhase = (camDynamicT / CAMERA_DYNAMIC_PERIOD) * Math.PI * 2
    const dynLateral = Math.sin(cyclePhase) * CAMERA_DYNAMIC_LATERAL
    const dynVertical = Math.sin(cyclePhase * 0.7 + 1.3) * CAMERA_DYNAMIC_VERTICAL
    const dynRoll = Math.sin(cyclePhase * 0.5 + 2.1) * CAMERA_DYNAMIC_ROLL

    // Fase 8: roll extra proporcional à curvatura real do trilho ali na frente — some com o
    // dutch angle senoidal acima em vez de substituí-lo, suavizado pra não tremer entre amostras
    const targetCurveRoll = THREE.MathUtils.clamp(pathTurnRate(distance) * CURVE_ROLL_GAIN, -CURVE_ROLL_MAX, CURVE_ROLL_MAX)
    curveRollSmoothed += (targetCurveRoll - curveRollSmoothed) * (1 - Math.exp(-CURVE_ROLL_SMOOTH_RATE * dt))

    const camTarget = frame.position.clone()
      .addScaledVector(frame.right, playerX * CAM_FOLLOW_LATERAL + dynLateral)
      .addScaledVector(frame.up, playerY * CAM_FOLLOW_LATERAL + CAM_HEIGHT + dynVertical)
      .addScaledVector(frame.forward, -CAM_BEHIND)

    camera.position.lerp(camTarget, 1 - Math.exp(-CAM_LAG_RATE * dt))
    // "dutch angle" leve: inclina o UP da câmera em torno do forward antes do lookAt — a nave
    // e a mira não são afetadas, só o enquadramento
    camera.up.copy(frame.up).applyAxisAngle(frame.forward, dynRoll + curveRollSmoothed)
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
    // Fase 9 (ideia all-range 2): pitch/roll atuais pro horizonte artificial do HUD
    getArenaAttitude: () => ({ pitch: arenaPitch, roll: arenaRoll }),
    setSpeedMultiplier: (m) => { speedMultiplier = m },
    setBoostActive: (v) => { boostActive = !!v },
    setAdvancing: (v) => { advancing = v },
    setShipVisible: (v) => { ship.visible = v },
    setShakeIntensity: (m) => { shakeMagnitude = m },
    // Fase 9 (ideia all-range 5): multiplicador configurável em Configurações (0.5-2.0)
    setTurnSensitivity: (m) => { turnSensitivity = m },
    // só pra debug: força o bank pra um lado por um tempo fixo, simulando o botão segurado
    // (não dá pra "segurar" de verdade num clique de botão de debug)
    debugForceBank: (direction, durationMs) => {
      dodgeDebugOverrideDir = direction
      dodgeDebugOverrideUntil = performance.now() + durationMs
    },
    triggerFullSpin,
    triggerArenaLateralDash,
    triggerArenaSummersault,
    triggerEmergencyBrake,
    enterArena,
    exitArena,
  }
}
