import * as THREE from 'three'
import { PASS_BEHIND, FORWARD_AXIS, randomSpawnPositionOnPath } from './shared.js'
import { ENEMY_SOUND_CUES, triggerSoundCue } from '../audio-cues.js'

// ============ SENTINELA — inimigo quadrado inédito, só modo trilho ============
// v0.34.0: pedido do usuário — persegue o jogador mantendo distância (nunca passa por ele),
// dispara 4 "molduras" quadradas (borda causa dano, centro vazado é seguro pra atravessar) e
// depois vai embora. Só existe em trilho (guard no spawn, igual ao mini-swarm).
export const SENTINELA_KIND = 'sentinela'
export const SENTINELA_COLOR = 0x00d4ff
export const SENTINELA_HIT_RADIUS = 2.2 // 10% maior (era 2.0)
export const SENTINELA_DEATH_DURATION = 0.25
export const SENTINELA_HP = 10

// Código morto (nunca lido em lugar nenhum deste arquivo — a posição de spawn real usa
// ENGAGE_STANDOFF abaixo). Não atualizados pelo pedido "20% mais distantes" de propósito: mexer
// em constante sem uso nenhum não muda o jogo, só ficaria enganoso deixar como se fizesse algo.
const SPAWN_DISTANCE_MIN = 45
const SPAWN_DISTANCE_MAX = 70
const BOX_X = 6
const BOX_Y = 4

const ENGAGE_STANDOFF = 62 // 48 * 1.3 — pedido do usuário (inimigos 20% mais distantes; Sentinela +30% à parte, já que este valor é a distância de combate inteira dela, não só o spawn)
const LATERAL_TRACK_RATE = 7 // rastreamento lateral suave do jogador
const LEAVE_SPEED = 32 // velocidade de fuga após o 4º disparo
export const SENTINELA_SHOTS_TOTAL = 4
export const SENTINELA_FIRE_INTERVAL = 1.9 // intervalo entre os 4 disparos

export const SENTINELA_STATE_ENGAGING = 'engaging'
export const SENTINELA_STATE_LEAVING = 'leaving'

// ============ DIMENSÕES E PULSO DA MOLDURA (overhaul v0.69.0) ============
// Conceito do usuário, literal: "atira um quadrado reto em direção ao jogador que fica se
// abrindo e fechando, causando dano caso o jogador esteja dentro quando ele se fecha, com
// tamanho de MOLDURA, não de QUADRADO largo (bordas pequenas mas largo)".
//
// O SILHUETA EXTERNA da moldura (GATE_OUTER_HALF) é constante — é ela que dá o "tamanho largo".
// O que pulsa é só o BURACO interno: aberto (GATE_OPEN_APERTURE_HALF, quase do tamanho da
// moldura inteira → borda fininha) até fechado (0 → a moldura vira um quadrado sólido, toda a
// área dela fica perigosa). A borda "cresce pra dentro" conforme o buraco fecha, em vez de a
// moldura inteira encolher — por isso o tamanho externo nunca muda, só o quanto dela é seguro.
const GATE_OUTER_HALF = 6.4 // silhueta externa fixa — o "tamanho largo" da moldura
const GATE_BORDER_MIN = 0.85 // espessura da borda quando TOTALMENTE ABERTA (fina, não um quadrado grosso)
const GATE_OPEN_APERTURE_HALF = GATE_OUTER_HALF - GATE_BORDER_MIN // buraco bem largo quando aberta
const GATE_CLOSED_APERTURE_HALF = 0 // fechada: buraco zero, moldura inteira vira sólida
const GATE_PULSE_PERIOD = 1.0 // segundos por ciclo completo abre → fecha → abre (pulsa o voo todo)
const GATE_BAR_THICKNESS = 0.4 // espessura no eixo de voo (profundidade visual da barra)
const GATE_SPEED = 18 // velocidade equilibrada e legível (aproximação total ~40 u/s)
const GATE_DAMAGE = 1
const GATE_SHIELD_DAMAGE = 1
const GATE_COLOR = 0x00d4ff

// Sentinela em LEAVING voa para cima e para frente
const SENTINELA_LEAVE_DESPAWN_AHEAD = 160

// Modelo 3D 10% maior com emissivo neon vibrante
const geometry = new THREE.BoxGeometry(2.64, 2.64, 0.44)
const material = new THREE.MeshPhongMaterial({
  color: SENTINELA_COLOR,
  emissive: 0x005588,
  emissiveIntensity: 0.8,
  flatShading: true,
})

// Moldura: 4 barras sólidas luminosas (geometria unitária, escalada por instância a cada frame
// pra desenhar a borda no tamanho atual do pulso — mesmo padrão de "geometria compartilhada +
// transform por instância" já usado em detrito.js) + plano central translúcido que encolhe
// junto com o buraco.
const gateBarUnitGeo = new THREE.BoxGeometry(1, 1, 1)
const gateBorderMaterial = new THREE.MeshBasicMaterial({
  color: 0x00f0ff,
  transparent: true,
  opacity: 0.95,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})

const gateCenterUnitGeo = new THREE.PlaneGeometry(2, 2) // meio-tamanho 1 — escalado pela abertura atual
const gateCenterMaterial = new THREE.MeshBasicMaterial({
  color: 0x00b4d8,
  transparent: true,
  opacity: 0.18,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})

// Calcula a abertura (raio do buraco seguro) num instante do pulso, dado o tempo de vida do
// tiro em segundos. Oscilação suave (cosseno) entre TOTALMENTE ABERTA (fase 0, a moldura nasce
// já aberta) e TOTALMENTE FECHADA (meio ciclo depois), repetindo pelo voo inteiro.
function computeApertureHalf(age) {
  const phase = ((age % GATE_PULSE_PERIOD) + GATE_PULSE_PERIOD) % GATE_PULSE_PERIOD / GATE_PULSE_PERIOD
  const opennessFrac = (1 + Math.cos(phase * Math.PI * 2)) / 2 // 1 = aberta, 0 = fechada
  return GATE_CLOSED_APERTURE_HALF + (GATE_OPEN_APERTURE_HALF - GATE_CLOSED_APERTURE_HALF) * opennessFrac
}

// Reposiciona/escala as 4 barras + o plano central pra refletir a abertura atual. A silhueta
// externa (GATE_OUTER_HALF) nunca muda — só a fronteira interna (aperture) anda entre 0 e
// GATE_OPEN_APERTURE_HALF, fazendo a borda "crescer pra dentro" até virar um quadrado sólido.
function applyGateAperture(gate, apertureHalf) {
  gate.apertureHalf = apertureHalf
  const stripCenter = (apertureHalf + GATE_OUTER_HALF) / 2
  const borderThickness = Math.max(0.02, GATE_OUTER_HALF - apertureHalf)

  gate.topBar.scale.set(GATE_OUTER_HALF * 2, borderThickness, GATE_BAR_THICKNESS)
  gate.topBar.position.set(0, stripCenter, 0)
  gate.bottomBar.scale.set(GATE_OUTER_HALF * 2, borderThickness, GATE_BAR_THICKNESS)
  gate.bottomBar.position.set(0, -stripCenter, 0)
  gate.leftBar.scale.set(borderThickness, GATE_OUTER_HALF * 2, GATE_BAR_THICKNESS)
  gate.leftBar.position.set(-stripCenter, 0, 0)
  gate.rightBar.scale.set(borderThickness, GATE_OUTER_HALF * 2, GATE_BAR_THICKNESS)
  gate.rightBar.position.set(stripCenter, 0, 0)

  const centerScale = Math.max(0.001, apertureHalf)
  gate.centerMesh.scale.set(centerScale, centerScale, 1)
}

function projectSentinelaToWorld(enemy, rail) {
  const frame = rail.getSpawnFrame()
  enemy.mesh.position.copy(frame.position)
    .addScaledVector(frame.forward, enemy.depth)
    .addScaledVector(frame.right, enemy.screenX)
    .addScaledVector(frame.up, enemy.screenY)
}

export function spawnSentinela(scene, rail, id) {
  if (rail.isArena()) return null
  const mesh = new THREE.Mesh(geometry, material)
  scene.add(mesh)
  const lateral = rail.getPlayerLateral ? rail.getPlayerLateral() : { x: 0, y: 0 }
  const enemy = {
    id,
    mesh,
    kind: SENTINELA_KIND,
    dying: false,
    deathT: 0,
    hp: SENTINELA_HP,
    maxHp: SENTINELA_HP,
    fireTimer: 1.2,
    shotsFired: 0,
    state: SENTINELA_STATE_ENGAGING,
    depth: ENGAGE_STANDOFF,
    screenX: lateral.x || 0,
    screenY: lateral.y || 0,
  }
  projectSentinelaToWorld(enemy, rail)
  return enemy
}

// Em ENGAGING: profundidade cravada em ENGAGE_STANDOFF (48u) à frente do frame da nave.
// Como avança rigidamente com o frame da pista, NUNCA se aproxima da nave antes de terminar
// os 4 disparos! Ao terminar os 4 ataques, empina para cima e acelera para frente até sumir.
export function updateSentinelaMovement(enemy, dt, frame, rail) {
  if (enemy.state === SENTINELA_STATE_LEAVING) {
    enemy.screenY += 12 * dt
    enemy.depth += LEAVE_SPEED * dt
    projectSentinelaToWorld(enemy, rail)
    return
  }

  // Trava de profundidade absoluta: não aproxima de jeito nenhum antes dos 4 disparos
  enemy.depth = ENGAGE_STANDOFF

  const lateral = rail.getPlayerLateral ? rail.getPlayerLateral() : { x: 0, y: 0 }
  const ease = Math.min(1, LATERAL_TRACK_RATE * dt)
  enemy.screenX = THREE.MathUtils.lerp(enemy.screenX, lateral.x || 0, ease)
  enemy.screenY = THREE.MathUtils.lerp(enemy.screenY, lateral.y || 0, ease)
  projectSentinelaToWorld(enemy, rail)
}

export function sentinelaPassBehind(enemy) {
  return PASS_BEHIND
}

export function sentinelaShouldDespawn(enemy, frame) {
  if (enemy.state !== SENTINELA_STATE_LEAVING) return false
  return (enemy.depth || 0) > SENTINELA_LEAVE_DESPAWN_AHEAD || (enemy.screenY || 0) > 16
}

// Dispara moldura quadrada orientada na direção do jogador.
export function sentinelaFire(scene, enemy, playerPosition, ctx, frame) {
  const targetPos = playerPosition.clone()
  const originPos = enemy.mesh.position.clone()
  const toTarget = targetPos.clone().sub(originPos)
  const targetDistance = toTarget.length()
  const dir = targetDistance > 1e-4 ? toTarget.clone().normalize() : new THREE.Vector3(0, 0, -1)

  const relTarget = targetPos.clone().sub(frame.position)
  const targetLocal = {
    depth: relTarget.dot(frame.forward),
    right: relTarget.dot(frame.right),
    up: relTarget.dot(frame.up),
  }

  const group = new THREE.Group()
  const centerMesh = new THREE.Mesh(gateCenterUnitGeo, gateCenterMaterial)
  const topBar = new THREE.Mesh(gateBarUnitGeo, gateBorderMaterial)
  const bottomBar = new THREE.Mesh(gateBarUnitGeo, gateBorderMaterial)
  const leftBar = new THREE.Mesh(gateBarUnitGeo, gateBorderMaterial)
  const rightBar = new THREE.Mesh(gateBarUnitGeo, gateBorderMaterial)
  group.add(centerMesh, topBar, bottomBar, leftBar, rightBar)
  group.position.copy(originPos)
  group.quaternion.setFromUnitVectors(FORWARD_AXIS, dir)
  group.scale.set(1, 1, 1)
  scene.add(group)

  const gate = {
    mesh: group,
    dir,
    right: new THREE.Vector3(1, 0, 0).applyQuaternion(group.quaternion),
    up: new THREE.Vector3(0, 1, 0).applyQuaternion(group.quaternion),
    originPos,
    targetLocal,
    targetDistance,
    traveled: 0,
    age: 0,
    outerHalf: GATE_OUTER_HALF,
    apertureHalf: GATE_OPEN_APERTURE_HALF,
    centerMesh, topBar, bottomBar, leftBar, rightBar,
    damage: GATE_DAMAGE,
    shieldDamage: GATE_SHIELD_DAMAGE,
  }
  applyGateAperture(gate, computeApertureHalf(0)) // nasce já na fase certa (aberta) do pulso
  ctx.pushGate(gate)
  triggerSoundCue(ENEMY_SOUND_CUES.sentinela_gate_fire, { worldPos: originPos, shotsFired: enemy.shotsFired + 1 })

  enemy.shotsFired += 1
  if (enemy.shotsFired >= SENTINELA_SHOTS_TOTAL) {
    enemy.state = SENTINELA_STATE_LEAVING
    enemy.fireTimer = Infinity
    triggerSoundCue(ENEMY_SOUND_CUES.sentinela_escape, { worldPos: enemy.mesh.position })
  }
  return true
}

export function updateGateFlight(gate, dt, rail) {
  // Antes de cruzar o jogador, alinha a direção ao alvo em voo.
  // Após cruzar (hitResolved === true), mantém a direção cravada para ultrapassar
  // a nave e a câmera em linha reta contínua sem inverter rumo.
  if (!gate.hitResolved) {
    const frame = rail.getFrameAt(0)
    const targetNow = frame.position.clone()
      .addScaledVector(frame.forward, gate.targetLocal.depth)
      .addScaledVector(frame.right, gate.targetLocal.right)
      .addScaledVector(frame.up, gate.targetLocal.up)
    const toTarget = targetNow.sub(gate.originPos)
    if (toTarget.lengthSq() > 1e-6) {
      gate.dir = toTarget.normalize()
      gate.mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, gate.dir)
      gate.right.set(1, 0, 0).applyQuaternion(gate.mesh.quaternion)
      gate.up.set(0, 1, 0).applyQuaternion(gate.mesh.quaternion)
    }
  }
  gate.traveled += GATE_SPEED * dt
  gate.age += dt
  gate.mesh.position.copy(gate.originPos).addScaledVector(gate.dir, gate.traveled)
}

// Pulso contínuo abre/fecha durante todo o voo — ver computeApertureHalf/applyGateAperture.
export function updateGateAnimation(gate) {
  applyGateAperture(gate, computeApertureHalf(gate.age))
}

// Resolução de colisão no instante exato da passagem pelo plano do jogador — usa a abertura
// VIVA do pulso naquele instante (gate.apertureHalf, atualizada por updateGateAnimation logo
// antes desta chamada, ver updateEnemyGates em enemies/index.js):
// - Fora da moldura inteira (> outer + radius): esquiva completa, sem dano, não importa a fase.
// - Dentro do buraco atual (< aperture - radius): seguro — a moldura estava aberta bem ali.
// - Caso contrário: DANO REAL. Se a moldura estava quase toda aberta na passagem, é só a borda
//   fininha; se estava fechando/fechada, praticamente a área inteira conta como "quase toda a
//   moldura" — exatamente o pedido: "causa dano caso o jogador esteja dentro quando ela se fecha".
export function resolveGateHit(gate, playerPosition, opts = {}) {
  const shipPoints = (opts && opts.shipHitboxPoints) || (playerPosition ? [{ worldPos: playerPosition, radius: 0.5 }] : [])
  const aperture = gate.apertureHalf ?? 0
  const outer = gate.outerHalf

  let hit = false
  for (const pt of shipPoints) {
    const rel = pt.worldPos.clone().sub(gate.mesh.position)
    const localX = Math.abs(rel.dot(gate.right))
    const localY = Math.abs(rel.dot(gate.up))
    const maxCoord = Math.max(localX, localY)

    if (maxCoord > outer + pt.radius) continue // fora da moldura inteira
    if (maxCoord < aperture - pt.radius) continue // dentro do buraco aberto naquele instante
    hit = true
    triggerSoundCue(ENEMY_SOUND_CUES.sentinela_crush, { worldPos: gate.mesh.position })
    break
  }
  return { hit }
}

export function disposeSentinela() {
  geometry.dispose()
  material.dispose()
  gateBarUnitGeo.dispose()
  gateBorderMaterial.dispose()
  gateCenterUnitGeo.dispose()
  gateCenterMaterial.dispose()
}
