import * as THREE from 'three'
import { PASS_BEHIND, randomSpawnPositionOnPath } from './shared.js'

// ============ SENTINELA — inimigo quadrado, só modo trilho ============
// Overhaul (v0.50.0): máquina de estados explícita com 4 modos (approaching → engaging →
// retreating → leaving), núcleo visualmente distinto do casco, e reação ao impulso do jogador
// (recua durante o boost, volta LENTAMENTE ao standoff depois). As geometrias e os tempos de
// disparo continuam os mesmos da entrega anterior — o que muda é a ESTRUTURA de comportamento.

export const SENTINELA_KIND = 'sentinela'
export const SENTINELA_COLOR = 0x3fa9f5
export const SENTINELA_CORE_COLOR = 0x00d4ff
export const SENTINELA_HIT_RADIUS = 2.0
export const SENTINELA_DEATH_DURATION = 0.25
export const SENTINELA_HP = 10

// ============ MODOS (máquina de estados) ============
// Cada modo tem comportamento e assinatura visual próprios. O jogador lê o que está
// acontecendo pela combinação "distância + brilho do núcleo", sem precisar de HUD extra.
//
//   APPROACHING  — voando de longe pro standoff, sem atirar, sem rastrear o jogador
//   ENGAGING     — no standoff, mantendo posição, disparando as 4 molduras
//   RETREATING   — jogador usou impulso: recuando devagar (a feature pedida)
//   LEAVING      — esgotou os 4 disparos: acelerando pra frente até sair de cena
export const SENTINELA_MODE_APPROACHING = 'approaching'
export const SENTINELA_MODE_ENGAGING = 'engaging'
export const SENTINELA_MODE_RETREATING = 'retreating'
export const SENTINELA_MODE_LEAVING = 'leaving'

const SPAWN_DISTANCE_MIN = 90
const SPAWN_DISTANCE_MAX = 130
const BOX_X = 6
const BOX_Y = 4

// ============ POSICIONAMENTO ============
// Standoff em 180 (mantido). A novidade é separar os tetos de velocidade por CONTEXTO:
//   APPROACH_SPEED    — velocidade de voo enquanto ainda está chegando (modo APPROACHING)
//   ENGAGE_SPEED_MAX  — teto da correção normal do standoff (tentar manter 180u)
//   RETREAT_SPEED     — teto DURANTE o impulso do jogador (recuo lento, de propósito:
//                       é o que dá ao jogador a janela de aproximação que ele pediu)
//   LEAVE_SPEED       — modo LEAVING (aceleração pra fora de cena, inalterado)
const ENGAGE_STANDOFF = 180
const ENGAGE_SPEED_GAIN = 0.3
const ENGAGE_SPEED_MAX = 26
const RETREAT_SPEED = 6
const APPROACH_SPEED = 24
const LEAVE_SPEED = 24

// janela em que a Sentinela permanece em RETREATING depois que o impulso do jogador acaba.
// Sem isso, o retorno ao standoff começaria no mesmo frame em que o impulso acabou — e o
// efeito visual de "recuo" (que é o que o jogador percebe) sumiria instantaneamente.
const RETREAT_LINGER_S = 1.2

// histerese da transição APPROACHING → ENGAGING: evita piscar entre os dois modos quando a
// distância fica oscilando em cima do threshold.
const APPROACH_ARRIVAL_TOLERANCE = 15

const LATERAL_TRACK_RATE = 7
export const SENTINELA_SHOTS_TOTAL = 4
export const SENTINELA_FIRE_INTERVAL = 1.8

// ============ MOLDURA ============
// Tamanhos da entrega anterior (outer 14, inner 11, banda 3). Os parâmetros do ciclo
// (GATE_CYCLES_PER_FLIGHT, GATE_MIN_CYCLE_PERIOD) continuam garantindo ~3 pulsos por voo.
const GATE_OUTER_HALF = 14
const GATE_INNER_HALF = 11
const GATE_BAR_THICKNESS = 0.7
const GATE_SPEED = 100
const GATE_DAMAGE = 1
const GATE_SHIELD_DAMAGE = 1
const GATE_COLOR = 0x3fa9f5
const GATE_CYCLES_PER_FLIGHT = 3
const GATE_MIN_CYCLE_PERIOD = 0.3
const GATE_MIN_INNER_HALF = 0.01

const SENTINELA_LEAVE_DESPAWN_AHEAD = 220

// ============ VISUAL ============
const SHELL_GEOMETRY_SIZE = 2.4
const SHELL_DEPTH = 0.7
const CORE_RADIUS = 0.55
const CORE_PULSE_SPEED = 4.5
const CORE_PULSE_AMOUNT = 0.18
const CORE_ENGAGE_INTENSITY = 1.0
const CORE_IDLE_INTENSITY = 0.15
const CORE_TELEGRAPH_INTENSITY = 2.2

const shellGeometry = new THREE.BoxGeometry(SHELL_GEOMETRY_SIZE, SHELL_GEOMETRY_SIZE, SHELL_DEPTH)
const shellMaterial = new THREE.MeshPhongMaterial({
  color: SENTINELA_COLOR, emissive: 0x0a3a5c, emissiveIntensity: 0.6, flatShading: true,
})
const coreGeometry = new THREE.SphereGeometry(CORE_RADIUS, 12, 10)
const coreMaterial = new THREE.MeshBasicMaterial({
  color: SENTINELA_CORE_COLOR, transparent: true, opacity: 0.95,
})

// geometrias das molduras (inalteradas)
const GATE_BAND = GATE_OUTER_HALF - GATE_INNER_HALF
const GATE_BAND_CENTER = (GATE_OUTER_HALF + GATE_INNER_HALF) / 2
const gateTopBottomGeometry = new THREE.BoxGeometry(GATE_OUTER_HALF * 2, GATE_BAND, GATE_BAR_THICKNESS)
const gateSideGeometry = new THREE.BoxGeometry(GATE_BAND, GATE_INNER_HALF * 2, GATE_BAR_THICKNESS)
const gateMaterial = new THREE.MeshBasicMaterial({
  color: GATE_COLOR, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
})

// ============ SPAWN ============
export function spawnSentinela(scene, rail, id) {
  if (rail.isArena()) return null
  const position = randomSpawnPositionOnPath(rail, SPAWN_DISTANCE_MIN, SPAWN_DISTANCE_MAX, BOX_X, BOX_Y)

  // Grupo: casca + núcleo. O grupo nunca rotaciona (o modelo não tem frente/trás — é uma
  // sentinela estática). A hitbox continua sendo um ponto (mesh.position) com raio fixo,
  // igual a todos os inimigos do jogo — separar em dois meshes aqui é puramente visual.
  const group = new THREE.Group()
  group.add(new THREE.Mesh(shellGeometry, shellMaterial))
  // núcleo ligeiramente à frente da face frontal do casco (SHELL_DEPTH/2 = 0.35; -0.15 pra
  // não coplanar com o casco)
  const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial.clone())
  coreMesh.position.z = SHELL_DEPTH * 0.5 + 0.15
  group.add(coreMesh)
  group.position.copy(position)
  scene.add(group)

  return {
    id,
    mesh: group,
    coreMesh,
    kind: SENTINELA_KIND, dying: false, deathT: 0,
    hp: SENTINELA_HP, maxHp: SENTINELA_HP,
    fireTimer: SENTINELA_FIRE_INTERVAL,
    shotsFired: 0,
    mode: SENTINELA_MODE_APPROACHING,
    // acumulador de tempo em RETREATING — a transição de volta pra ENGAGING depende dele
    // (ver RETREAT_LINGER_S)
    retreatTimer: 0,
    // relógio próprio do pulso do núcleo — dessincroniza várias Sentinelas na tela
    coreClock: Math.random() * 10,
  }
}

// ============ MOVIMENTO ============
// Assinatura igual à da entrega anterior: (enemy, dt, frame, rail). Rail expõe
// `getBoostActive()` (getter novo, uma linha em rail.js) pra Sentinela saber se o jogador
// está em impulso.
export function updateSentinelaMovement(enemy, dt, frame, rail) {
  enemy.coreClock += dt

  const along = enemy.mesh.position.clone().sub(frame.position).dot(frame.forward)

  // ============ MODO LEAVING ============
  // Sai pela porta da frente: aceleração constante, sem rastrear nada. O despawn é decidido
  // por sentinelaShouldDespawn (mesma lógica da entrega anterior).
  if (enemy.mode === SENTINELA_MODE_LEAVING) {
    enemy.mesh.position.addScaledVector(frame.forward, LEAVE_SPEED * dt)
    updateSentinelaVisual(enemy)
    return
  }

  const playerBoosting = rail.getBoostActive ? rail.getBoostActive() : false

  // ============ TRANSIÇÕES ============
  // ENTRADA em RETREATING: sempre que o jogador ativa o impulso, em qualquer modo anterior
  // (APPROACHING ou ENGAGING). Cobre o caso do impulso durante a chegada.
  if (playerBoosting && enemy.mode !== SENTINELA_MODE_RETREATING) {
    enemy.mode = SENTINELA_MODE_RETREATING
    enemy.retreatTimer = 0
  }

  // SAÍDA de RETREATING: o impulso do jogador já acabou E já passou RETREAT_LINGER_S.
  if (enemy.mode === SENTINELA_MODE_RETREATING) {
    if (!playerBoosting) enemy.retreatTimer += dt
    if (enemy.retreatTimer >= RETREAT_LINGER_S) {
      enemy.mode = SENTINELA_MODE_ENGAGING
      enemy.retreatTimer = 0
    }
  }

  // SAÍDA de APPROACHING: chegou perto o bastante do standoff. `Math.abs` porque também pode
  // vir de trás (raro, depois de uma curva muito fechada) — a intenção "estou no standoff"
  // vale pros dois lados.
  if (enemy.mode === SENTINELA_MODE_APPROACHING && Math.abs(along - ENGAGE_STANDOFF) <= APPROACH_ARRIVAL_TOLERANCE) {
    enemy.mode = SENTINELA_MODE_ENGAGING
  }

  // ============ VELOCIDADE POR MODO ============
  let forwardSpeed
  if (enemy.mode === SENTINELA_MODE_APPROACHING) {
    // Voa reto pro standoff — sem "liga/desliga" do proporcional. Mais simples de ler, e a
    // silhueta de "vindo em direção ao jogador" fica bem distinta do ENGAGING (parada).
    forwardSpeed = along < ENGAGE_STANDOFF ? APPROACH_SPEED : -APPROACH_SPEED
  } else if (enemy.mode === SENTINELA_MODE_RETREATING) {
    // Recuo LENTO pra frente (aumentando a distância do jogador que está avançando).
    // Enquanto o jogador impulsiona a ~41.8 u/s e a Sentinela recua a 6 u/s, o gap encurta
    // ~35u durante um boost inteiro (900ms). É esta a feature pedida.
    forwardSpeed = RETREAT_SPEED
  } else {
    // ENGAGING — fórmula proporcional da entrega anterior.
    forwardSpeed = THREE.MathUtils.clamp(
      (ENGAGE_STANDOFF - along) * ENGAGE_SPEED_GAIN,
      -ENGAGE_SPEED_MAX,
      ENGAGE_SPEED_MAX,
    )
  }
  enemy.mesh.position.addScaledVector(frame.forward, forwardSpeed * dt)

  // ============ TRAVAMENTO LATERAL ============
  // Só em ENGAGING: em APPROACHING ela ainda está chegando; em RETREATING ela recua pra
  // frente e a lateral não é o foco. Travar o jogador aqui criaria o efeito estranho de "ela
  // segue o jogador enquanto recua", que não casa com a leitura de "recuando".
  if (enemy.mode === SENTINELA_MODE_ENGAGING) {
    const lateral = rail.getPlayerLateral()
    const relative = enemy.mesh.position.clone().sub(frame.position)
    const currentX = relative.dot(frame.right)
    const currentY = relative.dot(frame.up)
    const ease = Math.min(1, LATERAL_TRACK_RATE * dt)
    enemy.mesh.position.addScaledVector(frame.right, (lateral.x - currentX) * ease)
    enemy.mesh.position.addScaledVector(frame.up, (lateral.y - currentY) * ease)
  }

  updateSentinelaVisual(enemy)
}

// ============ VISUAL ============
// Pulso do núcleo + telegraph. Chamada por updateSentinelaMovement (todos os modos) e pelo
// early-return de LEAVING — assim o núcleo nunca fica "congelado" mesmo indo embora.
function updateSentinelaVisual(enemy) {
  if (!enemy.coreMesh) return
  const pulse = 1 + Math.sin(enemy.coreClock * CORE_PULSE_SPEED) * CORE_PULSE_AMOUNT

  let intensity
  if (enemy.mode === SENTINELA_MODE_ENGAGING) intensity = CORE_ENGAGE_INTENSITY
  else if (enemy.mode === SENTINELA_MODE_LEAVING) intensity = CORE_ENGAGE_INTENSITY * 0.6
  else intensity = CORE_IDLE_INTENSITY

  // telegraph: o `fireTimer` é decrementado em enemies/index.js (não aqui). Se estamos nos
  // últimos 0.3s, o núcleo pisca — mesma convenção de tempo que os outros inimigos usam pra
  // telegraph, só que com uma animação própria em vez de esfera estática.
  if (enemy.fireTimer > 0 && enemy.fireTimer <= 0.3) {
    intensity = CORE_TELEGRAPH_INTENSITY * (0.5 + 0.5 * Math.sin(enemy.coreClock * 25))
  }

  enemy.coreMesh.material.opacity = Math.min(1, intensity)
  enemy.coreMesh.scale.setScalar(pulse)
}

// ============ DISPARO ============
// Assinatura igual à da entrega anterior: (scene, enemy, playerPosition, ctx). Muda só:
//   1) origem das molduras é o NÚCLEO (world position), não o centro do casco — a moldura
//      sai do "canhão" visível, não do meio do corpo
//   2) se disparar com o jogador impulsionando, entra em RETREATING igual — a regra de
//      movimento e a de disparo são consistentes
//   3) pós-4º-disparo, força LEAVING (mesma intenção da entrega anterior)
export function sentinelaFire(scene, enemy, playerPosition, ctx) {
  const targetPos = playerPosition.clone()
  const originPos = new THREE.Vector3()
  enemy.coreMesh.getWorldPosition(originPos)

  const toTarget = targetPos.clone().sub(originPos)
  const targetDistance = toTarget.length()
  const dir = targetDistance > 1e-4 ? toTarget.clone().normalize() : new THREE.Vector3(0, 0, -1)

  const group = new THREE.Group()
  const top = new THREE.Mesh(gateTopBottomGeometry, gateMaterial)
  top.position.set(0, GATE_BAND_CENTER, 0)
  const bottom = new THREE.Mesh(gateTopBottomGeometry, gateMaterial)
  bottom.position.set(0, -GATE_BAND_CENTER, 0)
  const left = new THREE.Mesh(gateSideGeometry, gateMaterial)
  left.position.set(-GATE_BAND_CENTER, 0, 0)
  const right = new THREE.Mesh(gateSideGeometry, gateMaterial)
  right.position.set(GATE_BAND_CENTER, 0, 0)
  group.add(top, bottom, left, right)
  group.position.copy(originPos)
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
  scene.add(group)

  const flightTime = targetDistance / GATE_SPEED
  const cyclePeriod = Math.max(GATE_MIN_CYCLE_PERIOD, flightTime / GATE_CYCLES_PER_FLIGHT)

  const gate = {
    mesh: group,
    bars: { top, bottom, left, right },
    dir,
    right: new THREE.Vector3(1, 0, 0).applyQuaternion(group.quaternion),
    up: new THREE.Vector3(0, 1, 0).applyQuaternion(group.quaternion),
    targetPos,
    targetDistance,
    traveled: 0,
    velocity: dir.clone().multiplyScalar(GATE_SPEED),
    phase: 0,
    cyclePeriod,
    innerHalf: GATE_INNER_HALF,
    outerHalf: GATE_OUTER_HALF,
    damage: GATE_DAMAGE,
    shieldDamage: GATE_SHIELD_DAMAGE,
  }
  applyGateVisual(gate)
  ctx.pushGate(gate)

  enemy.shotsFired += 1
  if (enemy.shotsFired >= SENTINELA_SHOTS_TOTAL) {
    enemy.mode = SENTINELA_MODE_LEAVING
    enemy.fireTimer = Infinity
  }
  return true
}

// ============ MOLDURAS (inalterado) ============
function applyGateVisual(gate) {
  const innerHalf = gate.innerHalf
  const band = Math.max(GATE_MIN_INNER_HALF, GATE_OUTER_HALF - innerHalf)
  const bandCenter = (GATE_OUTER_HALF + innerHalf) / 2
  const bandScale = band / GATE_BAND
  const holeScale = Math.max(GATE_MIN_INNER_HALF, innerHalf) / GATE_INNER_HALF
  const { top, bottom, left, right } = gate.bars
  top.scale.y = bandScale
  top.position.y = bandCenter
  bottom.scale.y = bandScale
  bottom.position.y = -bandCenter
  left.scale.set(bandScale, holeScale, 1)
  left.position.x = -bandCenter
  right.scale.set(bandScale, holeScale, 1)
  right.position.x = bandCenter
}

export function updateGateAnimation(gate, dt) {
  gate.phase += dt
  const t = 0.5 + 0.5 * Math.cos((2 * Math.PI * gate.phase) / gate.cyclePeriod)
  gate.innerHalf = GATE_INNER_HALF * t
  applyGateVisual(gate)
}

export function resolveGateHit(gate, playerPosition) {
  const rel = playerPosition.clone().sub(gate.mesh.position)
  const localX = rel.dot(gate.right)
  const localY = rel.dot(gate.up)
  const dist = Math.max(Math.abs(localX), Math.abs(localY))
  const hit = dist > gate.innerHalf && dist <= gate.outerHalf
  return { hit }
}

export function sentinelaPassBehind(enemy) {
  return enemy.mode === SENTINELA_MODE_LEAVING ? PASS_BEHIND : PASS_BEHIND * 8
}

export function sentinelaShouldDespawn(enemy, frame) {
  if (enemy.mode !== SENTINELA_MODE_LEAVING) return false
  const ahead = enemy.mesh.position.clone().sub(frame.position).dot(frame.forward)
  return ahead > SENTINELA_LEAVE_DESPAWN_AHEAD
}

export function disposeSentinela() {
  shellGeometry.dispose()
  shellMaterial.dispose()
  coreGeometry.dispose()
  coreMaterial.dispose()
  gateTopBottomGeometry.dispose()
  gateSideGeometry.dispose()
  gateMaterial.dispose()
}
