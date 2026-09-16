import * as THREE from 'three'
import { PASS_BEHIND, FORWARD_AXIS, randomSpawnPositionOnPath } from './shared.js'

// ============ SENTINELA — inimigo quadrado inédito, só modo trilho ============
// v0.34.0: pedido do usuário — persegue o jogador mantendo distância (nunca passa por ele),
// dispara 4 "molduras" quadradas (borda causa dano, centro vazado é seguro pra atravessar) e
// depois vai embora. Só existe em trilho (guard no spawn, igual ao mini-swarm).
export const SENTINELA_KIND = 'sentinela'
export const SENTINELA_COLOR = 0x3fa9f5
export const SENTINELA_HIT_RADIUS = 2.0
export const SENTINELA_DEATH_DURATION = 0.25
export const SENTINELA_HP = 10
// v0.62.2: alargado de 90-130 (faixa de 40, sempre nascia a uma distância bem parecida) pra
// 70-160 (faixa de 90) — chão um pouco mais baixo que antes mas ainda alto o bastante pra dar
// tempo de reação pra um inimigo deste porte, teto abaixo dos 160-240 que o mini-swarm.js já
// tinha testado e rejeitado como "longe demais" (ver comentário lá). Réplica usa a mesma faixa
// (ver replica.js) por serem visualmente/mecanicamente parecidas, como o pedido original notou.
const SPAWN_DISTANCE_MIN = 70
const SPAWN_DISTANCE_MAX = 160
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
// Pedido do usuário: moldura com bordas finas com opacidade apenas no centro
const GATE_OUTER_HALF = 12.0
const GATE_INNER_HALF = 11.2
const GATE_BORDER_WIDTH = 0.8
const GATE_BAR_THICKNESS = 0.4
const GATE_SPEED = 42
const GATE_DAMAGE = 1
const GATE_SHIELD_DAMAGE = 1
const GATE_COLOR = 0x3fa9f5

// Sentinela em LEAVING voa pra FRENTE (mesmo sentido do jogador, só mais rápido)
const SENTINELA_LEAVE_DESPAWN_AHEAD = 220

// Modelo 3D mais curto (Z=0.4 em vez de 0.7)
const geometry = new THREE.BoxGeometry(2.4, 2.4, 0.4)
const material = new THREE.MeshPhongMaterial({ color: SENTINELA_COLOR, emissive: 0x0a3a5c, emissiveIntensity: 0.6, flatShading: true })

// Moldura: bordas finas brilhantes + centro com opacidade translúcida sutil
const gateBorderTopBottomGeo = new THREE.BoxGeometry(GATE_OUTER_HALF * 2, GATE_BORDER_WIDTH, GATE_BAR_THICKNESS)
const gateBorderSideGeo = new THREE.BoxGeometry(GATE_BORDER_WIDTH, GATE_INNER_HALF * 2, GATE_BAR_THICKNESS)
const gateBorderMaterial = new THREE.MeshBasicMaterial({
  color: 0x70c5ff,
  transparent: true,
  opacity: 0.88,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})

const gateCenterGeo = new THREE.PlaneGeometry(GATE_INNER_HALF * 2, GATE_INNER_HALF * 2)
const gateCenterMaterial = new THREE.MeshBasicMaterial({
  color: GATE_COLOR,
  transparent: true,
  opacity: 0.14,
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
// descritor no array compartilhado do orquestrador. `frame` é o frame do trilho (rail.getFrameAt(0))
// NO INSTANTE do disparo — usado só pra decompor o alvo travado em coordenadas relativas ao
// trilho (ver updateGateFlight abaixo, é lá que a curva é compensada de verdade).
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
  const centerMesh = new THREE.Mesh(gateCenterGeo, gateCenterMaterial)
  const borderOffset = GATE_INNER_HALF + GATE_BORDER_WIDTH / 2
  const top = new THREE.Mesh(gateBorderTopBottomGeo, gateBorderMaterial)
  top.position.set(0, borderOffset, 0)
  const bottom = new THREE.Mesh(gateBorderTopBottomGeo, gateBorderMaterial)
  bottom.position.set(0, -borderOffset, 0)
  const left = new THREE.Mesh(gateBorderSideGeo, gateBorderMaterial)
  left.position.set(-borderOffset, 0, 0)
  const right = new THREE.Mesh(gateBorderSideGeo, gateBorderMaterial)
  right.position.set(borderOffset, 0, 0)
  group.add(centerMesh, top, bottom, left, right)
  group.position.copy(originPos)
  group.quaternion.setFromUnitVectors(FORWARD_AXIS, dir)
  group.scale.set(0.75, 0.75, 1)
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
    innerHalf: GATE_INNER_HALF,
    outerHalf: GATE_OUTER_HALF,
    damage: GATE_DAMAGE,
    shieldDamage: GATE_SHIELD_DAMAGE,
  }
  ctx.pushGate(gate)

  enemy.shotsFired += 1
  if (enemy.shotsFired >= SENTINELA_SHOTS_TOTAL) {
    enemy.state = SENTINELA_STATE_LEAVING
    enemy.fireTimer = Infinity
  }
  return true
}

// BUG corrigido (moldura "incoesa"): a moldura viajava em linha reta com velocidade FIXA em
// coordenadas de MUNDO, travada no instante do disparo. Só que o jogador, mesmo sem esquivar
// (sem nenhum input lateral), continua avançando pelo trilho CURVO — e como o disparo dura
// ~1-3s+ (GATE_SPEED=42 numa distância típica de ~150-190), a curva da pista durante esse tempo
// fazia o alvo "escorregar" pra fora da linha reta original. Medido em teste sintético com o
// rail.js real: um jogador 100% parado (sem esquivar) terminava até 39 unidades fora do centro
// da moldura na hora do cruzamento, sempre que a pista curvava durante o voo — dando hit/miss
// dependendo de ONDE na pista o tiro saiu, não de o jogador ter se desviado de verdade.
// Fix (mesmo princípio de projectBlasterToWorld em blaster.js): o alvo travado (`targetLocal`)
// fica em coordenadas RELATIVAS ao frame do trilho (profundidade + lateral/vertical), e a cada
// frame a direção de voo é recalculada projetando esse alvo através do frame ATUAL — assim o
// alvo "acompanha" a curva exatamente como o próprio jogador (que também é só frame.position +
// lateral) acompanharia se não desviasse. A origem (`originPos`) continua fixa: é de onde o
// tiro realmente saiu, um fato histórico que não faz sentido "andar" com a curva.
export function updateGateFlight(gate, dt, rail) {
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
  gate.traveled += GATE_SPEED * dt
  gate.mesh.position.copy(gate.originPos).addScaledVector(gate.dir, gate.traveled)
}

// escala (SEM recomputar posição/direção — isso é updateGateFlight, chamado ANTES desta) —
// separado porque só depende de `gate.traveled`, já atualizado pra este frame. Precisa rodar
// DEPOIS do traveled ser incrementado (index.js respeita essa ordem), senão a escala usada na
// resolução do hit fica um frame atrasada em relação à posição real.
export function updateGateAnimation(gate) {
  // Cresce suavemente em escala ao longo da trajetória (de 0.75x até 1.18x na chegada)
  const flightProgress = THREE.MathUtils.clamp(gate.traveled / Math.max(1, gate.targetDistance), 0, 1)
  const growthScale = THREE.MathUtils.lerp(0.75, 1.18, flightProgress)
  gate.mesh.scale.set(growthScale, growthScale, 1)
}

// Resolução coesa e justa da colisão com a moldura:
// - O centro translúcido é passagem livre: jogador dentro do centro NÃO toma dano.
// - O espaço além da moldura externa é livre (desvio lateral).
// - Apenas a colisão real com as bordas finas causa dano.
export function resolveGateHit(gate, playerPosition, opts = {}) {
  const shipPoints = (opts && opts.shipHitboxPoints) || (playerPosition ? [{ worldPos: playerPosition, radius: 0.45 }] : [])
  const currentScale = gate.mesh.scale.x || 1
  const inner = gate.innerHalf * currentScale
  const outer = gate.outerHalf * currentScale

  let hit = false
  for (const pt of shipPoints) {
    const rel = pt.worldPos.clone().sub(gate.mesh.position)
    const localX = Math.abs(rel.dot(gate.right))
    const localY = Math.abs(rel.dot(gate.up))
    const maxCoord = Math.max(localX, localY)

    // Se qualquer ponto colide com a faixa estreita da borda
    const hitBorder = maxCoord >= (inner - pt.radius) && maxCoord <= (outer + pt.radius)
    if (hitBorder) {
      hit = true
      break
    }
  }
  return { hit }
}

export function disposeSentinela() {
  geometry.dispose()
  material.dispose()
  gateBorderTopBottomGeo.dispose()
  gateBorderSideGeo.dispose()
  gateBorderMaterial.dispose()
  gateCenterGeo.dispose()
  gateCenterMaterial.dispose()
}
