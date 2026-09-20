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
// P2 (SF64 Camera_UpdateArwingOnRails): mira da câmera também acompanha o deslocamento da nave
const CAM_LOOK_AHEAD = 35
const CAM_LOOK_BIAS_LATERAL = 0.15
const CAM_LOOK_BIAS_VERTICAL = 0.08

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

// visual da nave (Configurações → Visual): presets de dimensões/cor por variante, todos
// construídos com as mesmas 2 formas (buildDeltaShape/buildFinShape) — fácil de ajustar ou
// adicionar mais no futuro, só mexendo nesta tabela.
// - default: a interceptadora original (corpo fino, asa delta dominante, 1 barbatana dorsal).
// - bombardeiro: corpo largo/curto, asa mais retangular, 2 barbatanas nas pontas da asa (bicauda).
// - racer: corpo bem alongado/fino, asa pequena bem varrida pra trás, 1 barbatana ventral.
// `weight` (0 = leve/ágil, 1 = pesada/robusta) alimenta as animações de "peso físico" abaixo
// (shipPhysicsFor) — cada nave já tinha identidade visual própria, isso estende a mesma
// identidade pro MOVIMENTO (a Bombardeiro deve "sentir" pesada, não só parecer).
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
// pra popular o seletor em Configurações sem duplicar os nomes aqui
export const SHIP_VISUAL_OPTIONS = Object.entries(SHIP_PRESETS).map(([id, p]) => ({ id, label: p.label }))

// ============ ANIMAÇÕES DE "PESO FÍSICO" (por preset, via `weight` acima) ============
// pedido do usuário: 6 animações que fazem a Bombardeiro "sentir" pesada e a Veloz "sentir" ágil
// (a Clássica fica no meio) — cada par abaixo é o valor em weight=0 (mais leve) e weight=1 (mais
// pesada); shipPhysicsFor interpola. Onde o efeito é mais forte no leve (treme mais, estica mais
// no boost), o valor "LIGHT" já é o maior dos dois — a interpolação cuida do sentido certo.
const ROLL_STIFFNESS_LIGHT = 220 // maior = responde mais rápido ao comando de banking
const ROLL_STIFFNESS_HEAVY = 70
const ROLL_DAMPING_LIGHT = 22 // alto = crítico, quase sem "sobra" de movimento
const ROLL_DAMPING_HEAVY = 9 // baixo = sub-amortecido, balança um pouco antes de assentar
const RECOIL_KICK_LIGHT = 0.03 // deslocamento (unidades) do coice ao atirar
const RECOIL_KICK_HEAVY = 0.16
const RECOIL_DECAY_LIGHT = 18 // maior = recuo curto e seco
const RECOIL_DECAY_HEAVY = 6 // menor = recuo mais lento/prolongado
const SQUAT_DEPTH_LIGHT = 0.05 // o quanto a traseira "agacha" ao ligar o boost
const SQUAT_DEPTH_HEAVY = 0.32
const SQUAT_DECAY_LIGHT = 14 // maior = volta rápido da agachada
const SQUAT_DECAY_HEAVY = 5
const SPEED_SHAKE_LIGHT = 0.045 // trepidação contínua durante boost — leve treme MAIS
const SPEED_SHAKE_HEAVY = 0.012
const BOOST_STRETCH_LIGHT = 0.22 // estica no eixo do corpo durante boost — leve estica MAIS
const BOOST_STRETCH_HEAVY = 0.06
const IMPACT_SQUASH_LIGHT = 0.06 // achata ao levar dano — pesada achata MAIS
const IMPACT_SQUASH_HEAVY = 0.24
const IMPACT_SQUASH_DECAY = 10 // igual pras 3 (só a profundidade varia)
const WOBBLE_STIFFNESS = 90 // igual pras 3 — só a damping muda o quanto "sobra" balanço
const WOBBLE_DAMPING_LIGHT = 20 // assenta quase na hora depois de giro/cambalhota
const WOBBLE_DAMPING_HEAVY = 7 // continua balançando um pouco antes de estabilizar
const WOBBLE_KICK = 0.35 // impulso de roll aplicado ao completar giro completo/cambalhota
const BOOST_BLEND_RATE = 8 // suavização do liga/desliga do boost usada pelo stretch/trepidação

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

// all-range: distância total do deslize lateral do combo "segurar propulsor + Z/C" e taxa
// de guinada extra que segurar Z/C sozinho (sem o combo) já dá de graça, "facilitando o
// movimento pro lado" enquanto inclina — pedido explícito do usuário, mais fraca que o giro
// normal (ARENA_TURN_RATE) pra não duplicar o controle de vôo já existente, só complementar.
// A distância é percorrida em ARENA_DASH_DURATION (ver updateLateralDash) — era um snap
// instantâneo de posição (addScaledVector direto), o que lia como teleporte/bug de
// reposicionamento; agora desliza suave pro lado, igual em espírito à cambalhota abaixo.
const ARENA_DASH_DISTANCE = 16
const ARENA_DASH_DURATION = 0.22
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

// item 6 — cambalhota (Baixo + repulsor): pedido do usuário pra ficar mais fiel ao U-turn do
// Star Fox 64 — em vez de só girar o yaw 180° com um flip cosmético de pitch por cima (mesh
// gira, mas a TRAJETÓRIA continuava reta/plana), agora o pitch usado no cálculo do vetor
// forward da própria arena arqueia pra cima e desce de novo (seno, pico na metade da manobra)
// AO MESMO TEMPO que o yaw gira 180° — a nave literalmente sobe, faz a volta por cima e desce
// de novo já de bico pro lado oposto, então o `ship.lookAt(forward)` que já existia acompanha
// o arco sozinho, sem precisar de rotateX cosmético extra. Congela o controle manual de
// yaw/pitch/roll por essa duração (arenaPitch em si não muda, só o offset do voo durante o arco).
const SUMMERSAULT_DURATION = 0.6
const SUMMERSAULT_ARC_PITCH = THREE.MathUtils.degToRad(55)

function buildCurve() {
  const points = [
    new THREE.Vector3(0, 3, 0),         // 0: Ponto inicial / Pista de decolagem
    new THREE.Vector3(0, 3, -75),       // 1: Reta de aceleração de decolagem
    new THREE.Vector3(35, 7, -155),     // 2: Curva alta à direita
    new THREE.Vector3(15, 4, -235),     // 3: Vale sinuoso
    new THREE.Vector3(-55, 9, -245),    // 4: Curva fechada à esquerda
    new THREE.Vector3(-95, 5, -165),    // 5: Reta lateral
    new THREE.Vector3(-60, 3, -70),     // 6: Entrada de retorno
    new THREE.Vector3(0, 3, 35),        // 7: Alinhamento reto final de volta à largada
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
// Customização de visual: monta qualquer preset de SHIP_PRESETS a partir das mesmas 2 peças
// (corpo cônico + asa delta) mais 1 ou 2 barbatanas, dorsais ou ventrais (finSide/finCount).
function buildShip(variant = SHIP_VISUAL_DEFAULT) {
  const preset = SHIP_PRESETS[variant] || SHIP_PRESETS[SHIP_VISUAL_DEFAULT]
  const bodyMaterial = new THREE.MeshPhongMaterial({ color: preset.bodyColor, flatShading: true, side: THREE.DoubleSide })
  const accentMaterial = preset.accentColor === preset.bodyColor
    ? bodyMaterial
    : new THREE.MeshPhongMaterial({ color: preset.accentColor, flatShading: true, side: THREE.DoubleSide })

  const body = new THREE.Mesh(new THREE.ConeGeometry(preset.bodyRadius, preset.bodyLength, 4), bodyMaterial)
  body.rotation.x = Math.PI / 2

  const wing = new THREE.Mesh(new THREE.ShapeGeometry(buildDeltaShape(preset.wingHalfSpan, preset.wingFront, preset.wingBack)), bodyMaterial)
  wing.rotation.x = -Math.PI / 2
  wing.position.set(...preset.wingPosition)

  const group = new THREE.Group()
  group.add(body, wing)

  // ventral = barbatana(s) apontando pra BAIXO em vez de pra cima (mesma forma, espelhada em Y)
  const finFlip = preset.finSide === 'ventral' ? -1 : 1
  const finXOffsets = preset.finCount === 2 ? [-preset.finSpread / 2, preset.finSpread / 2] : [0]
  for (const finX of finXOffsets) {
    const fin = new THREE.Mesh(new THREE.ShapeGeometry(buildFinShape()), accentMaterial)
    fin.rotation.y = Math.PI / 2
    fin.scale.y = finFlip
    fin.position.set(finX, preset.finPosition[1], preset.finPosition[2])
    group.add(fin)
  }

  return { group, bodyMaterial, accentMaterial }
}

export function createRailController(camera, scene, shipVisual = SHIP_VISUAL_DEFAULT) {
  const curve = buildCurve()
  const length = curve.getLength()
  // física de "peso" da nave escolhida (turn inertia, recuo, agachada de boost, etc.) —
  // calculada uma vez, não muda durante a partida
  const shipPhysics = shipPhysicsFor(SHIP_PRESETS[shipVisual] || SHIP_PRESETS[SHIP_VISUAL_DEFAULT])

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
  let rollVel = 0 // spring-damper (turn inertia) — ver springStep
  let speedMultiplier = 1
  let advancing = true
  let camDynamicT = 0 // Fase 6: acumulador do drift senoidal da câmera (modo normal)
  let curveRollSmoothed = 0 // Fase 8: roll por curvatura, suavizado entre frames
  let boostActive = false // Fase 8: liga o FOV de velocidade enquanto propulsor/repulsor ativos
  let prevBoostActive = false // borda de subida (boost ligou agora) — dispara a agachada
  let boostBlend = 0 // 0..1 suavizado — usado pelo estica-no-boost e pela trepidação em alta velocidade

  // animações de "peso físico" (pedido do usuário) — cada uma é um impulso que decai sozinho,
  // menos o wobble pós-manobra, que usa o mesmo spring-damper do roll
  let recoilOffset = 0 // recuo ao atirar — deslocamento ao longo do -forward local
  let squatOffset = 0 // agachada ao ligar o boost — deslocamento ao longo do -up local
  let impactSquashT = 0 // achatada ao levar dano — 0 = sem efeito, decai até 0
  let wobbleOffset = 0 // balanço de roll extra pós giro-completo/cambalhota
  let wobbleVel = 0

  // Fase 9 (ideias all-range)
  let arenaIdleTimer = 0 // item 1: segundos desde o último input de direção real no all-range
  let emergencyBrakeTimer = 0 // item 4
  let emergencyBrakeCooldownTimer = 0 // item 4
  let summersaultT = 1 // item 6: >=1 = inativo, 0..1 = animação em andamento
  let summersaultStartYaw = 0 // item 6
  // deslize lateral (combo propulsor+Z/C) — progress 0..1 percorrido em ARENA_DASH_DURATION,
  // aplicado como DELTA por frame (não posição absoluta) pra compor certo com o avanço normal
  // pra frente que também mexe em arenaPos no mesmo update; eixo fica travado no valor de
  // lastFrame.right do instante do trigger, senão a guinada em andamento mudaria a direção
  // do deslize no meio do caminho
  let lateralDashT = 1 // >=1 = inativo, 0..1 = animação em andamento
  let lateralDashDir = 0
  const lateralDashAxis = new THREE.Vector3()
  let turnSensitivity = 1 // item 5: multiplicador configurável em Configurações
  let lastFrame = frameAtArcLength(0)
  let lastPlayerPos = lastFrame.position.clone()

  let mode = 'rail'
  let arenaCenter = new THREE.Vector3()
  let arenaPos = new THREE.Vector3()
  let arenaYaw = 0
  let arenaPitch = 0
  let arenaRoll = 0
  let arenaRollVel = 0 // spring-damper do arenaRoll (mesmo princípio do rollVel do trilho)

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

  // Perda de controle por colisão com boss / dourado (Star Fox tumble spin)
  const TUMBLE_DURATION = 0.85
  let tumbleTimer = 0
  let tumbleDuration = TUMBLE_DURATION
  let tumbleAngle = 0
  let tumbleDir = 1
  let tumbleKnockbackVel = new THREE.Vector3()

  // ============ PERDA DE CONTROLE POR HIT DE PROJÉTIL DE ALTO-IMPACTO (nível 4 — ver ============
  // ============ PROJECTILE_POWER_LEVEL em enemies/shared.js: Chefe/Dourado/Horda) ============
  // Pedido explícito do usuário — números bem acima do código de propósito, pra ser fácil de
  // ajustar. Reaproveita o MESMO motor de giro/wobble do tumble de colisão física acima (ver
  // startTumble), só com duração/velocidade de giro PRÓPRIAS (mais longa e mais lenta — é uma
  // "punição" de ser atingido por um tiro grande, não o baque seco de esbarrar no corpo do
  // chefe) e um flash vermelho piscando na nave enquanto dura.
  const HIGH_IMPACT_TUMBLE_DURATION_S = 2.0 // duração total "perdendo o controle", em segundos
  const HIGH_IMPACT_TUMBLE_SPIN_SPEED = Math.PI * 3.2 // rad/s no pico — bem mais lento que o giro de colisão física (9.5), pra não virar liquidificador por 2s inteiros
  const HIGH_IMPACT_RED_FLASH_INTERVAL_S = 0.12 // segundos entre cada alternância liga/desliga do pisca vermelho
  const HIGH_IMPACT_RED_FLASH_COLOR = 0xff0000
  const HIGH_IMPACT_RED_FLASH_INTENSITY = 1.4
  let tumbleIsHighImpact = false
  let redFlashTimer = 0
  let redFlashOn = false

  const { group: ship, bodyMaterial: shipBodyMaterial, accentMaterial: shipAccentMaterial } = buildShip(shipVisual)
  ship.position.copy(lastFrame.position)
  ship.up.copy(lastFrame.up)
  ship.lookAt(lastFrame.position.clone().add(lastFrame.forward))
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

  // trepidação em alta velocidade (pedido do usuário): jitter contínuo separado do shake de
  // dano acima — amplitude por nave (shipPhysics.speedShake), só ativo durante boost, suavizado
  // por boostBlend pra não "ligar/desligar" seco
  function applyWeightJitter() {
    const magnitude = shipPhysics.speedShake * boostBlend
    if (magnitude <= 0) return
    ship.position.x += (Math.random() * 2 - 1) * magnitude
    ship.position.y += (Math.random() * 2 - 1) * magnitude
  }

  // recuo do tiro + agachada do boost (pedido do usuário): deslocam a nave ao longo de eixos do
  // FRAME atual (forward/up), não do local da nave — aplicado depois do lookAt/rotateZ, igual o
  // shake de dano acima
  function applyImpulseOffsets(forward, up) {
    if (recoilOffset > 0) ship.position.addScaledVector(forward, -recoilOffset)
    if (squatOffset > 0) ship.position.addScaledVector(up, -squatOffset)
  }

  // estica no boost / achata no impacto (pedido do usuário) — escala não-uniforme: o eixo do
  // comprimento (Z local, alinhado ao forward depois do lookAt) estica ou encolhe, a seção
  // transversal (X/Y) compensa no sentido oposto pra dar uma leve ilusão de volume constante
  function applyWeightScale() {
    const lengthScale = 1 + shipPhysics.boostStretch * boostBlend - shipPhysics.impactSquash * impactSquashT
    const crossScale = 1 - 0.5 * shipPhysics.boostStretch * boostBlend + 0.5 * shipPhysics.impactSquash * impactSquashT
    ship.scale.set(crossScale, crossScale, lengthScale)
  }

  // spring-damper genérico (Euler semi-implícito, estável) — usado tanto pro roll de verdade
  // (turn inertia: nave pesada responde mais devagar E "sobra" um pouco antes de assentar)
  // quanto pro wobble pós-manobra (mesma física, só o alvo é sempre 0).
  function springStep(value, velocity, target, stiffness, damping, dt) {
    const accel = (target - value) * stiffness - velocity * damping
    const newVelocity = velocity + accel * dt
    return { value: value + newVelocity * dt, velocity: newVelocity }
  }

  // impulso que só decai (recuo do tiro, agachada do boost, achatada de impacto) — sobe na hora
  // do trigger, esse helper só cuida da parte "voltando pro zero" a cada frame
  function decayImpulse(value, decayRate, dt) {
    return value * Math.exp(-decayRate * dt)
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
    // amortecimento pós-manobra (pedido do usuário): ao completar o giro AGORA (não em frames
    // já >=1), dá um impulso de roll que o spring-damper do roll absorve sozinho, balançando
    // mais ou menos conforme o peso da nave
    if (fullSpinT >= 1) wobbleVel += WOBBLE_KICK * fullSpinDir
    return fullSpinT * Math.PI * 2 * fullSpinDir
  }

  function triggerFullSpin(direction) {
    fullSpinDir = direction
    fullSpinT = 0
  }

  // all-range: desliza a nave pro lado (combo "segurar propulsor + Z/C") — pedido do usuário:
  // antes era um snap instantâneo de posição (addScaledVector direto), que lia como bug de
  // teleporte; agora é animado por updateLateralDash (abaixo), igual em espírito à cambalhota.
  // O raio final já é resolvido aqui na largada (não frame a frame), reaproveitando o clamp de
  // raio da arena que já existe pro movimento normal.
  function triggerArenaLateralDash(direction) {
    if (mode !== 'arena' || direction === 0 || lateralDashT < 1) return
    lateralDashAxis.copy(lastFrame.right)
    lateralDashDir = Math.sign(direction)
    lateralDashT = 0
  }

  // avança o deslize lateral: em vez de mover pra uma posição absoluta (o que brigaria com o
  // avanço pra frente que também mexe em arenaPos no mesmo update), aplica só a FATIA de
  // distância que corresponde ao progresso deste frame (delta do ease-out) — a soma de todas as
  // fatias ao longo de ARENA_DASH_DURATION fecha em ARENA_DASH_DISTANCE exatos.
  function updateLateralDash(dt) {
    if (lateralDashT >= 1) return
    const easeOutQuad = (t) => 1 - (1 - t) * (1 - t)
    const prevEased = easeOutQuad(lateralDashT)
    lateralDashT = Math.min(1, lateralDashT + dt / ARENA_DASH_DURATION)
    const deltaEased = easeOutQuad(lateralDashT) - prevEased
    arenaPos.addScaledVector(lateralDashAxis, lateralDashDir * ARENA_DASH_DISTANCE * deltaEased)
    if (lateralDashT >= 1) wobbleVel += WOBBLE_KICK * lateralDashDir
  }

  // all-range: cambalhota (combo "Baixo + repulsor") — meia-volta de reposicionamento, igual
  // ao U-turn do Star Fox 64. Fase 9 (ideia 6) trocou o snap instantâneo de 180° por uma
  // animação; pedido do usuário deixou essa animação mais fiel ao original (ver updateSummersault).
  function triggerArenaSummersault() {
    if (mode !== 'arena' || summersaultT < 1) return
    summersaultStartYaw = arenaYaw
    summersaultT = 0
  }

  // avança a animação da cambalhota e devolve o OFFSET de pitch (em radianos, positivo = sobe)
  // a somar em cima do arenaPitch só pro cálculo do forward deste frame — não no arenaPitch de
  // verdade, que fica congelado e retoma sozinho quando a manobra termina. O offset segue um
  // seno com pico na METADE do progresso (mesmo `eased` do yaw, pra o topo do arco coincidir com
  // a nave já de perfil, ~90° guinada) — nave sobe, vira por cima e desce já de bico invertido,
  // e o ship.lookAt(forward) que já existia acompanha o arco sozinho (sem rotateX cosmético).
  function updateSummersault(dt) {
    if (summersaultT >= 1) return 0
    summersaultT = Math.min(1, summersaultT + dt / SUMMERSAULT_DURATION)
    const eased = 1 - Math.pow(1 - summersaultT, 3)
    arenaYaw = summersaultStartYaw + Math.PI * eased
    // mesmo amortecimento pós-manobra do giro completo, ao terminar a cambalhota
    if (summersaultT >= 1) wobbleVel += WOBBLE_KICK * (Math.random() < 0.5 ? -1 : 1)
    return Math.sin(Math.PI * eased) * SUMMERSAULT_ARC_PITCH
  }

  // Fase 9 (ideia all-range 4): freio de emergência — cooldown próprio, independente da barra
  // compartilhada de propulsor/repulsor. Devolve false se ainda em cooldown (chamador ignora).
  function triggerEmergencyBrake() {
    if (mode !== 'arena' || emergencyBrakeCooldownTimer > 0) return false
    emergencyBrakeTimer = EMERGENCY_BRAKE_DURATION
    emergencyBrakeCooldownTimer = EMERGENCY_BRAKE_COOLDOWN
    return true
  }

  // recuo do tiro (pedido do usuário) — chamado por main.js a cada disparo bem-sucedido
  function triggerRecoil() {
    recoilOffset += shipPhysics.recoilKick
  }

  // achatada ao levar dano (pedido do usuário) — chamado por main.js quando o jogador é atingido
  function triggerImpactSquash() {
    impactSquashT = 1
  }

  // Motor compartilhado de "perda de controle" — usado tanto pela colisão física direta com o
  // corpo do chefe/dourado (duração/velocidade curtas, sem flash) quanto pelo hit de projétil de
  // alto-impacto nível 4 (duração longa + flash vermelho, ver bloco de constantes acima).
  function startTumble(duration, impactOrigin, { highImpact = false } = {}) {
    tumbleTimer = duration
    tumbleDuration = duration
    tumbleAngle = 0
    tumbleDir = Math.random() < 0.5 ? -1 : 1
    tumbleIsHighImpact = highImpact
    redFlashTimer = 0
    redFlashOn = false
    triggerImpactSquash()

    if (mode === 'arena') {
      const repelDir = impactOrigin ? arenaPos.clone().sub(impactOrigin) : new THREE.Vector3()
      if (repelDir.lengthSq() < 0.001) {
        repelDir.copy(lastFrame.forward).negate()
      }
      repelDir.normalize()
      repelDir.y = Math.max(0.2, repelDir.y)
      repelDir.normalize()
      arenaPos.addScaledVector(repelDir, 16)
      const off = arenaPos.clone().sub(arenaCenter)
      if (off.length() > ARENA_RADIUS) arenaPos.copy(arenaCenter).addScaledVector(off.normalize(), ARENA_RADIUS)
      tumbleKnockbackVel.copy(repelDir).multiplyScalar(35)
    } else {
      const pushX = Math.sign(playerX || (Math.random() < 0.5 ? -1 : 1)) * 14
      playerX = THREE.MathUtils.clamp(playerX + pushX, -BOX_X, BOX_X)
      velX = pushX * 2.4
      velY = 16
      recoilOffset += 7.5
    }
  }

  // Colisão violenta com boss / dourado (Star Fox knockback + tumble spin)
  function triggerBossCollisionTumble(impactOrigin) {
    startTumble(TUMBLE_DURATION, impactOrigin, { highImpact: false })
  }

  // Hit de projétil nível 4 (Chefe/Dourado/Horda) — ver bloco de constantes HIGH_IMPACT_* acima.
  function triggerHighImpactTumble(impactOrigin) {
    startTumble(HIGH_IMPACT_TUMBLE_DURATION_S, impactOrigin, { highImpact: true })
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

  function updateArena(dt, input, fullSpinAngle = 0, tumbleState = null) {
    const summersaultArcPitch = updateSummersault(dt)
    const inSummersault = summersaultT < 1
    updateLateralDash(dt)

    if (emergencyBrakeTimer > 0) emergencyBrakeTimer = Math.max(0, emergencyBrakeTimer - dt)
    if (emergencyBrakeCooldownTimer > 0) emergencyBrakeCooldownTimer = Math.max(0, emergencyBrakeCooldownTimer - dt)

    if (!inSummersault) {
      // segurar Z/C sozinho (sem o combo de propulsor) já ajuda a guinar pro lado, "facilitando
      // o movimento" além da inclinação cosmética — mais fraco que o giro normal (input.moveX)
      // pra só complementar, não substituir o controle de vôo
      arenaYaw -= (input.moveX * ARENA_TURN_RATE * turnSensitivity + (input.bank || 0) * ARENA_BANK_ASSIST_RATE * turnSensitivity) * dt
      arenaPitch = THREE.MathUtils.clamp(arenaPitch + input.moveY * ARENA_TURN_RATE * turnSensitivity * dt, -ARENA_PITCH_LIMIT, ARENA_PITCH_LIMIT)
      const targetRoll = THREE.MathUtils.clamp(-input.moveX, -1, 1) * MAX_ROLL
      // turn inertia (pedido do usuário): spring-damper em vez de suavização exponencial simples
      // — nave pesada (Bombardeiro) responde mais devagar E balança um pouco além do alvo antes
      // de assentar; a Veloz responde quase seca, sem sobra perceptível
      const arenaRollSpring = springStep(arenaRoll, arenaRollVel, targetRoll, shipPhysics.rollStiffness, shipPhysics.rollDamping, dt)
      arenaRoll = arenaRollSpring.value
      arenaRollVel = arenaRollSpring.velocity

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

    const forward = forwardFromYawPitch(arenaYaw, arenaPitch + summersaultArcPitch)
    // speedMultiplier (propulsor/repulsor da Fase 3) também vale no all-range, igual ao trilho;
    // o freio de emergência (Fase 9, ideia 4) trava isso quase a zero por um instante curto
    const brakeFactor = emergencyBrakeTimer > 0 ? EMERGENCY_BRAKE_SPEED_MULT : 1
    arenaPos.addScaledVector(forward, ARENA_SPEED * speedMultiplier * brakeFactor * dt)

    if (tumbleKnockbackVel.lengthSq() > 0.01) {
      arenaPos.addScaledVector(tumbleKnockbackVel, dt)
      tumbleKnockbackVel.multiplyScalar(Math.exp(-4.2 * dt))
    }

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
    ship.rotateZ(wobbleOffset)
    if (tumbleState) {
      ship.rotateZ(tumbleState.spin)
      if (tumbleState.pitch) ship.rotateX(tumbleState.pitch)
      if (tumbleState.yaw) ship.rotateY(tumbleState.yaw)
    }
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

  function update(dt, input) {
    updateDodgeRoll(dt, input)
    const fullSpinAngle = updateFullSpin(dt)

    // animações de "peso físico": rodam uma vez por frame, independente do modo (trilho/arena)
    boostBlend += ((boostActive ? 1 : 0) - boostBlend) * (1 - Math.exp(-BOOST_BLEND_RATE * dt))
    if (boostActive && !prevBoostActive) squatOffset = Math.max(squatOffset, shipPhysics.squatDepth)
    prevBoostActive = boostActive
    squatOffset = decayImpulse(squatOffset, shipPhysics.squatDecay, dt)
    recoilOffset = decayImpulse(recoilOffset, shipPhysics.recoilDecay, dt)
    impactSquashT = decayImpulse(impactSquashT, IMPACT_SQUASH_DECAY, dt)
    const wobbleSpring = springStep(wobbleOffset, wobbleVel, 0, WOBBLE_STIFFNESS, shipPhysics.wobbleDamping, dt)
    wobbleOffset = wobbleSpring.value
    wobbleVel = wobbleSpring.velocity

    // se algo fora daqui (ex: o punch de FOV na entrada da luta do chefe, em main.js) deixou o
    // FOV bem longe da base e não estamos boostando, não briga com esse efeito — só retoma o
    // controle quando ele já estiver perto de novo (evita "puxar de volta" no meio do punch)
    const targetFov = boostActive ? CAM_FOV_BOOST : CAM_FOV_BASE
    if (boostActive || Math.abs(camera.fov - CAM_FOV_BASE) <= 10) {
      camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-CAM_FOV_LERP_RATE * dt))
      camera.updateProjectionMatrix()
    }

    let tumbleSpin = 0
    let tumblePitchWobble = 0
    let tumbleYawWobble = 0
    if (tumbleTimer > 0) {
      const tNorm = tumbleTimer / tumbleDuration
      const spinSpeedPeak = tumbleIsHighImpact ? HIGH_IMPACT_TUMBLE_SPIN_SPEED : Math.PI * 9.5
      const spinSpeed = spinSpeedPeak * tNorm * tumbleDir
      tumbleAngle += spinSpeed * dt
      tumbleSpin = tumbleAngle
      tumblePitchWobble = Math.sin((1 - tNorm) * Math.PI * 4) * 0.35
      tumbleYawWobble = Math.cos((1 - tNorm) * Math.PI * 3) * 0.25

      // Pisca vermelho na nave (nível 4 só) — alterna o emissive do material do corpo/acento
      // num intervalo fixo, sem precisar de material clonado por instância (a nave é única).
      if (tumbleIsHighImpact) {
        redFlashTimer += dt
        if (redFlashTimer >= HIGH_IMPACT_RED_FLASH_INTERVAL_S) {
          redFlashTimer = 0
          redFlashOn = !redFlashOn
          const hex = redFlashOn ? HIGH_IMPACT_RED_FLASH_COLOR : 0x000000
          const intensity = redFlashOn ? HIGH_IMPACT_RED_FLASH_INTENSITY : 0
          shipBodyMaterial.emissive.setHex(hex)
          shipBodyMaterial.emissiveIntensity = intensity
          if (shipAccentMaterial !== shipBodyMaterial) {
            shipAccentMaterial.emissive.setHex(hex)
            shipAccentMaterial.emissiveIntensity = intensity
          }
        }
      }

      tumbleTimer -= dt
      if (tumbleTimer <= 0) {
        wobbleVel += WOBBLE_KICK * 2.2 * tumbleDir
        if (tumbleIsHighImpact) {
          tumbleIsHighImpact = false
          shipBodyMaterial.emissive.setHex(0x000000)
          shipBodyMaterial.emissiveIntensity = 0
          if (shipAccentMaterial !== shipBodyMaterial) {
            shipAccentMaterial.emissive.setHex(0x000000)
            shipAccentMaterial.emissiveIntensity = 0
          }
        }
      }
    }
    const tumbleState = { spin: tumbleSpin, pitch: tumblePitchWobble, yaw: tumbleYawWobble }

    if (mode === 'arena') {
      updateArena(dt, input, fullSpinAngle, tumbleState)
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
    // turn inertia (pedido do usuário) — mesmo spring-damper do arenaRoll acima
    const rollSpring = springStep(roll, rollVel, targetRoll, shipPhysics.rollStiffness, shipPhysics.rollDamping, dt)
    roll = rollSpring.value
    rollVel = rollSpring.velocity

    // avanço da nave adiante no trilho durante impulso (pedido do usuário): projeta a nave
    // +14 unidades à frente em direção aos inimigos, permitindo abalroar com o aríete
    const boostAdvance = boostBlend * 14
    const playerPos = frame.position.clone()
      .addScaledVector(frame.right, playerX)
      .addScaledVector(frame.up, playerY)
      .addScaledVector(frame.forward, boostAdvance)

    ship.position.copy(playerPos)
    ship.up.copy(frame.up)
    ship.lookAt(playerPos.clone().add(frame.forward))
    ship.rotateZ(roll)
    ship.rotateZ(dodgeRoll)
    ship.rotateZ(fullSpinAngle)
    ship.rotateZ(wobbleOffset)
    if (tumbleState.spin) ship.rotateZ(tumbleState.spin)
    if (tumbleState.pitch) ship.rotateX(tumbleState.pitch)
    if (tumbleState.yaw) ship.rotateY(tumbleState.yaw)
    applyWeightScale()
    applyImpulseOffsets(frame.forward, frame.up)
    applyShakeJitter()
    applyWeightJitter()

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
    // P2: viés no lookAt proporcional à posição do jogador (SF64)
    const camLookTarget = camera.position.clone()
      .addScaledVector(frame.forward, CAM_LOOK_AHEAD)
      .addScaledVector(frame.right, playerX * CAM_LOOK_BIAS_LATERAL)
      .addScaledVector(frame.up, playerY * CAM_LOOK_BIAS_VERTICAL)
    camera.lookAt(camLookTarget)

    lastFrame = frame
    lastPlayerPos = playerPos
  }

  function getFrameAt(extraDistance = 0) {
    if (mode === 'arena' || extraDistance === 0) return lastFrame
    return frameAtArcLength(distance + extraDistance)
  }

  // ============ BASE DE SPAWN/MOVIMENTO = BASE REAL DA CÂMERA ============
  // v0.51.11 — usada por inimigos cujo posicionamento/movimento precisa SEMPRE ler certo na
  // tela, não importa quanto a câmera cosmética (drift senoidal, roll de curva) tenha girado
  // ou deslocado o olho. Ao contrário de `getFrameAt` (frame da CURVA/nave, correto pra coisas
  // que precisam bater com a posição FÍSICA real do jogador no trilho, como a Sentinela
  // travando na lateral dele), isto lê direto da matriz mundial da câmera — right/up/forward
  // daqui SÃO literalmente esquerda/direita/frente na tela, sempre, por definição.
  const _cachedSpawnFrame = {
    position: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    forward: new THREE.Vector3(),
  }

  function getSpawnFrame() {
    camera.updateMatrixWorld()
    _cachedSpawnFrame.position.copy(camera.position)
    _cachedSpawnFrame.right.setFromMatrixColumn(camera.matrixWorld, 0)
    _cachedSpawnFrame.up.setFromMatrixColumn(camera.matrixWorld, 1)
    _cachedSpawnFrame.forward.setFromMatrixColumn(camera.matrixWorld, 2).multiplyScalar(-1)
    return _cachedSpawnFrame
  }

  return {
    update,
    getDistance: () => distance,
    setDistance: (d) => {
      distance = d
      lastFrame = frameAtArcLength(distance)
      const frame = lastFrame
      const playerPos = frame.position.clone()
        .addScaledVector(frame.right, playerX)
        .addScaledVector(frame.up, playerY)
      ship.position.copy(playerPos)
      ship.up.copy(frame.up)
      ship.lookAt(playerPos.clone().add(frame.forward))
      lastPlayerPos = playerPos.clone()
    },
    getPlayerPosition: () => lastPlayerPos.clone(),
    // Medido contra a geometria REAL da nave (variante default: ConeGeometry(bodyRadius=0.4,
    // bodyLength=3.4) + asa delta): o corpo afina até virar um PONTO no bico (raio 0 na ponta,
    // 0.4 só na traseira) — um raio de 0.4 a 1.1 de distância do centro (65% do caminho até a
    // ponta) sobrava ~5.7x o raio real do cone ali (~0.07), sem a asa pra compensar (a asa não
    // chega tão à frente). "cabine" (0.55) já faz sentido: a asa é bem mais larga que isso no
    // mesmo Z (~2.3 de meia-largura real) e o corpo é fino/chato por design (nave achatada),
    // então alguma folga vertical ali é esperada, não sobra fantasma. "bico" estava
    // desproporcional — reduzido de 0.4 pra 0.28 (ainda folgado o bastante pra não ficar
    // minúsculo/injusto, mas bem mais perto do cone real naquele ponto: raio real ~0.07).
    // "asa esquerda/direita": com o offset antigo de -0.3 na direção de voo, o ponto caía numa
    // fatia da asa (Z local ≈ -0.3, medido a partir do vértice frontal do delta em Z=-1.1 até o
    // mais largo em Z=+0.13) onde a meia-largura real é só ~1.69 — MENOR que o alcance da esfera
    // (offset 1.6 + raio 0.38 = 1.98), sobrando ~0.29 de margem fantasma lateral (a esfera furava
    // pra fora da asa). Removido o offset de profundidade (fica em Z=0, junto da cabine, onde a
    // meia-largura real medida é ~2.33) — mesmos raio/offset lateral, mas agora dentro da asa.
    getShipHitboxPoints: () => {
      const p = lastPlayerPos
      return [
        { worldPos: p.clone(), radius: 0.55 }, // Círculo central único (estilo clássico Star Fox)
      ]
    },
    getShipNosePosition: () => lastPlayerPos.clone().addScaledVector(lastFrame.forward, SHIP_NOSE_OFFSET),
    getFrameAt,
    getSpawnFrame,
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
    getShipMesh: () => ship,
    getRollAngle: () => roll,
    getDodgeRoll: () => dodgeRoll,
    getFullSpinAngle: () => fullSpinAngle,
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
    triggerBossCollisionTumble,
    triggerHighImpactTumble,
    // animações de "peso físico" (pedido do usuário) — chamadas por main.js nos eventos certos
    triggerRecoil,
    triggerImpactSquash,
    enterArena,
    exitArena,
  }
}
