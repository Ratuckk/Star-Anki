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

const ENGAGE_STANDOFF = 55 // distância-alvo à frente da câmera, mantida enquanto ataca
const ENGAGE_SPEED = 8
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
// quadrados grandões... que abrem e fecham no meio". Antes: outer=9, inner=4 → moldura 18x18
// com buraco 8x8 (buraco ocupava só 44% do lado, banda de 5 — lia como "bloco sólido com
// buraco pequeno", não como janela). A "abre e fecha no meio" era perspectiva: o buraco
// pequeno parecia abrir conforme a moldura se aproximava e fechar ao passar.
//
// Agora: outer=14 (moldura 28x28, 56% maior), inner=11 (buraco 22x22 — 78% do lado), banda de
// apenas 3 (fina, lê como BORDA). A moldura agora é literalmente um enquadramento: o jogador
// vê o buraco desde longe, entende "preciso passar por ali", sem ilusão de abertura/fechamento.
const GATE_OUTER_HALF = 14
const GATE_INNER_HALF = 11
const GATE_BAR_THICKNESS = 0.7 // profundidade Z das barras — mais fina que antes (era 1.1)
const GATE_SPEED = 34
const GATE_DAMAGE = 1
const GATE_SHIELD_DAMAGE = 1
const GATE_COLOR = 0x3fa9f5

// Sentinela em LEAVING voa pra FRENTE (mesmo sentido do jogador, só mais rápido), então o
// `pass-behind` normal (que despawna quem ficou ATRÁS) nunca dispara — ela ficava viva pra
// sempre, invisível pela névoa mas ainda no array de inimigos. Despawna por distância à frente.
const SENTINELA_LEAVE_DESPAWN_AHEAD = 220

const geometry = new THREE.BoxGeometry(2.4, 2.4, 0.7)
const material = new THREE.MeshPhongMaterial({ color: SENTINELA_COLOR, emissive: 0x0a3a5c, emissiveIntensity: 0.6, flatShading: true })

// moldura tipo "quadro de janela": as 4 barras preenchem de verdade a faixa entre o buraco
// interno e a borda externa (não só um aro fino na borda) — o visual precisa bater com a área
// que resolveGateHit trata como perigosa, senão o jogador toma dano num espaço que parecia vazio
const GATE_BAND = GATE_OUTER_HALF - GATE_INNER_HALF
const GATE_BAND_CENTER = (GATE_OUTER_HALF + GATE_INNER_HALF) / 2
const gateTopBottomGeometry = new THREE.BoxGeometry(GATE_OUTER_HALF * 2, GATE_BAND, GATE_BAR_THICKNESS)
const gateSideGeometry = new THREE.BoxGeometry(GATE_BAND, GATE_INNER_HALF * 2, GATE_BAR_THICKNESS)
const gateMaterial = new THREE.MeshBasicMaterial({ color: GATE_COLOR, transparent: true, opacity: 0.9, side: THREE.DoubleSide })

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
export function updateSentinelaMovement(enemy, dt, frame) {
  if (enemy.state === SENTINELA_STATE_LEAVING) {
    enemy.mesh.position.addScaledVector(frame.forward, LEAVE_SPEED * dt)
    return
  }
  const along = enemy.mesh.position.clone().sub(frame.position).dot(frame.forward)
  const correction = along > ENGAGE_STANDOFF ? -1 : along < ENGAGE_STANDOFF * 0.6 ? 1 : 0
  enemy.mesh.position.addScaledVector(frame.forward, correction * ENGAGE_SPEED * dt)
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
  scene.add(group)

  ctx.pushGate({
    mesh: group,
    dir,
    right: new THREE.Vector3(1, 0, 0).applyQuaternion(group.quaternion),
    up: new THREE.Vector3(0, 1, 0).applyQuaternion(group.quaternion),
    targetPos,
    targetDistance,
    traveled: 0,
    velocity: dir.clone().multiplyScalar(GATE_SPEED),
    innerHalf: GATE_INNER_HALF,
    outerHalf: GATE_OUTER_HALF,
    damage: GATE_DAMAGE,
    shieldDamage: GATE_SHIELD_DAMAGE,
  })

  enemy.shotsFired += 1
  if (enemy.shotsFired >= SENTINELA_SHOTS_TOTAL) {
    enemy.state = SENTINELA_STATE_LEAVING
    enemy.fireTimer = Infinity
  }
  return true
}

// chamado quando a moldura chega na distância travada — projeta a posição ATUAL do jogador (que
// pode ter se movido pra desviar, é o ponto da mecânica) nos eixos locais da moldura (fixados no
// disparo). Dentro do buraco ou além da borda externa = seguro; na faixa entre os dois = dano.
export function resolveGateHit(gate, playerPosition) {
  const rel = playerPosition.clone().sub(gate.mesh.position)
  const localX = rel.dot(gate.right)
  const localY = rel.dot(gate.up)
  const dist = Math.max(Math.abs(localX), Math.abs(localY))
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
