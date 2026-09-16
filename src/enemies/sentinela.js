import * as THREE from 'three'
import { PASS_BEHIND, randomSpawnPositionOnPath } from './shared.js'

// ============ SENTINELA — inimigo quadrado inédito, só modo trilho ============
// v0.34.0: pedido do usuário — persegue o jogador mantendo distância (nunca passa por ele),
// dispara 4 "molduras" quadradas (borda causa dano, centro vazado é seguro pra atravessar) e
// depois vai embora. Só existe em trilho (guard no spawn, igual ao mini-swarm).
export const SENTINELA_KIND = 'sentinela'
export const SENTINELA_COLOR = 0x3fa9f5
export const SENTINELA_HIT_RADIUS = 2.0
export const SENTINELA_DEATH_DURATION = 0.25
export const SENTINELA_HP = 10
const SPAWN_DISTANCE_MIN = 90
const SPAWN_DISTANCE_MAX = 130
const BOX_X = 6
const BOX_Y = 4

// pedido do usuário: standoff bem maior (fica mais longe do jogador) — 55 era perto demais.
// Com o alvo tão mais distante, a correção discreta antiga (+1/0/-1 * ENGAGE_SPEED=8) nunca
// alcançava: a nave anda a 22u/s e 8 é mais lento até que ISSO, sem contar que virava um
// liga/desliga brusco (jitter) perto do standoff. Trocado por um modelo proporcional —
// corrige mais forte quanto maior a diferença, sem overshoot brusco — com teto ACIMA da
// velocidade da nave, senão ela nunca alcançaria de qualquer jeito.
const ENGAGE_STANDOFF = 180 // distância-alvo à frente da câmera, mantida enquanto ataca
const ENGAGE_SPEED_GAIN = 0.3 // proporcional: quanto maior a diferença pro standoff, mais forte corrige
const ENGAGE_SPEED_MAX = 26 // teto — precisa ser MAIOR que a velocidade da nave (22) pra conseguir alcançar
const LATERAL_TRACK_RATE = 7 // "1/tempo" de resposta lateral — alto o bastante pra travar no jogador
const LEAVE_SPEED = 24 // bem mais rápido que o avanço do Blaster — "vai embora" de vez
export const SENTINELA_SHOTS_TOTAL = 4
export const SENTINELA_FIRE_INTERVAL = 1.8 // intervalo entre os 4 disparos

// estados de verdade (com transição), diferente de "perfil" (escolhido no spawn, fixo pra
// sempre — ver BLASTER_PROFILES em blaster.js). Mesmo padrão de campo que miniSwarm.js usa
// (`swarmState`), só que genérico (`state`) — dá pra reaproveitar em outras classes futuras.
export const SENTINELA_STATE_ENGAGING = 'engaging' // persegue mantendo distância, dispara
export const SENTINELA_STATE_LEAVING = 'leaving' // esgotou os disparos, acelera pra trás e some

// ============ TAMANHO DA MOLDURA ============
// pedido do usuário: "quero que estes quadrados sejam maiores, como enquadramentos ao invés de
// quadrados grandões... que abrem e fecham no meio" — outer=14 (moldura 28x28), inner=11
// (buraco 22x22 — 78% do lado), banda de apenas 3 (fina, lê como BORDA). A moldura é
// literalmente um enquadramento: o jogador vê o buraco desde longe, entende "preciso passar
// por ali" — o abrir/fechar de verdade é outra mecânica, ver `updateGateAnimation` abaixo.
const GATE_OUTER_HALF = 14
const GATE_INNER_HALF = 11
const GATE_BAR_THICKNESS = 0.7 // profundidade Z das barras — mais fina que antes (era 1.1)
// Ajuste backlog (v0.53.9): moldura viaja a 40u/s (antes 80) e abre/fecha devagar (2.8s) pra excelente legibilidade
const GATE_SPEED = 40
const GATE_DAMAGE = 1
const GATE_SHIELD_DAMAGE = 1
const GATE_COLOR = 0x3fa9f5
// pedido do usuário: a moldura tem que abrir e fechar com cadência majestosa e legível (2.8s),
// sem oscilar freneticamente na tela, com centro holográfico seguro pra atravessar.
const GATE_CYCLE_PERIOD = 2.8
const GATE_MIN_INNER_HALF = 0.01

// Sentinela em LEAVING voa pra FRENTE (mesmo sentido do jogador, só mais rápido), então o
// `pass-behind` normal (que despawna quem ficou ATRÁS) nunca dispara — ela ficava viva pra
// sempre, invisível pela névoa mas ainda no array de inimigos. Despawna por distância à frente.
const SENTINELA_LEAVE_DESPAWN_AHEAD = 220

// Modelo 3D mais curto (Z=0.4 em vez de 0.7)
const geometry = new THREE.BoxGeometry(2.4, 2.4, 0.4)
const material = new THREE.MeshPhongMaterial({ color: SENTINELA_COLOR, emissive: 0x0a3a5c, emissiveIntensity: 0.6, flatShading: true })

// moldura tipo "quadro de janela": holográfica translúcida (AdditiveBlending + depthWrite: false)
// para não parecer sólida nem bloquear z-buffer, com opacidade sutil de 28%.
const GATE_BAND = GATE_OUTER_HALF - GATE_INNER_HALF
const GATE_BAND_CENTER = (GATE_OUTER_HALF + GATE_INNER_HALF) / 2
const gateTopBottomGeometry = new THREE.BoxGeometry(GATE_OUTER_HALF * 2, GATE_BAND, GATE_BAR_THICKNESS)
const gateSideGeometry = new THREE.BoxGeometry(GATE_BAND, GATE_INNER_HALF * 2, GATE_BAR_THICKNESS)
const gateMaterial = new THREE.MeshBasicMaterial({
  color: GATE_COLOR,
  transparent: true,
  opacity: 0.28,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})

export function spawnSentinela(scene, rail, id) {
  if (rail.isArena()) return null
  const position = randomSpawnPositionOnPath(rail, SPAWN_DISTANCE_MIN, SPAWN_DISTANCE_MAX, BOX_X, BOX_Y)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(position)
  scene.add(mesh)
  return {
    id, mesh, kind: SENTINELA_KIND, dying: false, deathT: 0, hp: SENTINELA_HP, maxHp: SENTINELA_HP, fireTimer: SENTINELA_FIRE_INTERVAL,
    shotsFired: 0,
    state: SENTINELA_STATE_ENGAGING,
  }
}

// engajando: corrige a posição pra ficar num "standoff" fixo à frente da câmera (mesmo princípio
// do perfil 'follow' do Blaster) — nunca cruza o jogador. Ao esgotar os 4 disparos, transiciona
// pra "indo embora": acelera pra frente (sentido do avanço do jogador) até sair de cena.
// pedido do usuário: enquanto ataca, ela precisa travar na MESMA lateral do jogador (não só na
// mesma distância à frente) — senão o jogador simplesmente desvia de lado e passa reto por ela
// sem nunca precisar acertar as molduras. `rail.getPlayerLateral()` dá o offset lateral cru do
// jogador em relação ao trilho; persegue esse valor com resposta rápida (não instantânea, pra
// não "teleportar") em vez de deixar a lateral livre.
export function updateSentinelaMovement(enemy, dt, frame, rail) {
  if (enemy.state === SENTINELA_STATE_LEAVING) {
    enemy.mesh.position.addScaledVector(frame.forward, LEAVE_SPEED * dt)
    return
  }
  const along = enemy.mesh.position.clone().sub(frame.position).dot(frame.forward)
  const forwardSpeed = THREE.MathUtils.clamp((ENGAGE_STANDOFF - along) * ENGAGE_SPEED_GAIN, -ENGAGE_SPEED_MAX, ENGAGE_SPEED_MAX)
  enemy.mesh.position.addScaledVector(frame.forward, forwardSpeed * dt)

  const lateral = rail.getPlayerLateral()
  const relative = enemy.mesh.position.clone().sub(frame.position)
  const currentX = relative.dot(frame.right)
  const currentY = relative.dot(frame.up)
  const ease = Math.min(1, LATERAL_TRACK_RATE * dt)
  enemy.mesh.position.addScaledVector(frame.right, (lateral.x - currentX) * ease)
  enemy.mesh.position.addScaledVector(frame.up, (lateral.y - currentY) * ease)
}

export function sentinelaPassBehind(enemy) {
  return enemy.state === SENTINELA_STATE_LEAVING ? PASS_BEHIND : PASS_BEHIND * 8
}

// true quando a Sentinela em LEAVING já foi longe demais à frente da nave pra continuar
// existindo — ver comentário em SENTINELA_LEAVE_DESPAWN_AHEAD. `index.js` chama isso no
// branch de trilho pra despawnar de verdade (chamada é barata: só um dot de vetor).
export function sentinelaShouldDespawn(enemy, frame) {
  if (enemy.state !== SENTINELA_STATE_LEAVING) return false
  const ahead = enemy.mesh.position.clone().sub(frame.position).dot(frame.forward)
  return ahead > SENTINELA_LEAVE_DESPAWN_AHEAD
}

// dispara uma moldura quadrada travada na posição ATUAL do jogador (mesmo truque do laser do
// chefe) — some após o 4º disparo e entra em modo "indo embora". `ctx.pushGate` empurra o
// descritor no array compartilhado do orquestrador.
export function sentinelaFire(scene, enemy, playerPosition, ctx) {
  const targetPos = playerPosition.clone()
  const originPos = enemy.mesh.position.clone()
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
  group.scale.set(0.7, 0.7, 1)
  scene.add(group)

  // período de ciclo fixo, calmo e previsível de 2.8s para passagem legível
  const cyclePeriod = GATE_CYCLE_PERIOD

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
    enemy.state = SENTINELA_STATE_LEAVING
    enemy.fireTimer = Infinity
  }
  return true
}

// redimensiona as 4 barras (compartilham geometria entre todas as molduras, só a escala/posição
// de cada instância muda) pra o buraco visual bater com `gate.innerHalf` no instante atual —
// banda cresce conforme o buraco encolhe, até cobrir o quadro inteiro (fechado = sem passagem).
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

// pedido do usuário: a moldura abre e fecha de verdade enquanto viaja até o jogador (cosseno —
// começa TOTALMENTE ABERTA no disparo, dá tempo de reação, depois alterna) e cresce em escala
// ao longo da trajetória até o jogador.
export function updateGateAnimation(gate, dt) {
  gate.phase += dt
  const t = 0.5 + 0.5 * Math.cos((2 * Math.PI * gate.phase) / gate.cyclePeriod)
  gate.innerHalf = GATE_INNER_HALF * t

  // cresce em escala ao longo da trajetória (de 0.7x até 1.25x na chegada)
  const flightProgress = THREE.MathUtils.clamp(gate.traveled / Math.max(1, gate.targetDistance), 0, 1)
  const growthScale = THREE.MathUtils.lerp(0.7, 1.25, flightProgress)
  gate.mesh.scale.set(growthScale, growthScale, 1)

  applyGateVisual(gate)
}

// chamado quando a moldura chega na distância travada — projeta a posição ATUAL do jogador (que
// pode ter se movido pra desviar, é o ponto da mecânica) nos eixos locais da moldura (fixados no
// disparo). Dentro do buraco ou além da borda externa = seguro; na faixa entre os dois = dano.
// como a moldura cresceu, a distância é normalizada pela escala atual do mesh.
export function resolveGateHit(gate, playerPosition) {
  const rel = playerPosition.clone().sub(gate.mesh.position)
  const localX = rel.dot(gate.right)
  const localY = rel.dot(gate.up)
  const currentScale = gate.mesh.scale.x || 1
  const dist = Math.max(Math.abs(localX), Math.abs(localY)) / currentScale
  const hit = dist > gate.innerHalf && dist <= gate.outerHalf
  return { hit }
}

export function disposeSentinela() {
  geometry.dispose()
  material.dispose()
  gateTopBottomGeometry.dispose()
  gateSideGeometry.dispose()
  gateMaterial.dispose()
}
