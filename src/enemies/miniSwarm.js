import * as THREE from 'three'
import { spawnPositionForEnemy } from './shared.js'
import { ENEMY_SOUND_CUES, triggerSoundCue } from '../audio-cues.js'

// ============ MINI-SWARM — fila/enxame de mini-inimigos (só modo trilho) ============
export const MINI_SWARM_KIND = 'miniSwarm'
const MINI_ENEMY_SCALE = 0.77 // +10% maior (era 0.7)
const MINI_ENEMY_HIT_RADIUS = 2.42 // 2.2 * 1.10 (+10%)
const MINI_SWARM_MIN_COUNT = 5
const MINI_SWARM_MAX_COUNT = 10
const MINI_SWARM_SPACING = 2
// Fase "spreadOut" — só usada pelos filhotes que a Horda solta ao morrer (spawnMiniSwarmFromHorda
// abaixo). Substitui a fase PATROL normal inteira (não é um estado adicional antes dela): em vez
// de balançar em formação atrás de um líder, cada filhote nasce no ponto exato onde a Horda
// morreu e se afasta radialmente dos outros por HORDA_SPLIT_SPREAD_DURATION_S antes de entrar no
// TELEGRAPH/DIVE normal — daí em diante é 100% o mesmo comportamento do mini-swarm comum.
export const HORDA_SPLIT_SPREAD_DURATION_S = 4
// CORRIGIDO — grace period de invencibilidade logo após o split (a Horda morre no meio de um
// tiro/splash que já tinha acerto "em voo"; sem isso, um projétil ainda vivo no frame do split
// podia matar um filhote recém-nascido antes mesmo do jogador perceber ele na tela). Só os
// filhotes soltos pela Horda usam — mini-swarm comum nasce sem essa graça (spawnInvincibleS: 0).
export const MINI_SWARM_SPAWN_INVINCIBLE_S = 0.4
const MINI_SWARM_PATROL_SPEED = 28
const MINI_SWARM_PATROL_AMPLITUDE = 10
const MINI_SWARM_PATROL_DURATION_MIN = 1.2
const MINI_SWARM_PATROL_DURATION_MAX = 2.8
const MINI_SWARM_TELEGRAPH_S = 0.45
const MINI_SWARM_DIVE_SPEED = 55
const MINI_SWARM_DIVE_SPREAD = 7
const MINI_SWARM_DIVE_TURN_RATE = 6
// 7 → 10: filhotes da Horda agora podem começar o mergulho de até SPREAD_MIN_TARGET_DEPTH (200u,
// bem mais que a distância normal de mergulho, 58-90u) — 7s não bastava pra cruzar isso na
// velocidade de mergulho padrão sem ser culled por tempo antes de chegar perto do jogador.
const MINI_SWARM_DIVE_MAX_S = 10
// Proibição de ficar atrás: ultrapassou a profundidade -2.0, é imediatamente removido
const MINI_SWARM_DIVE_PASS_BEHIND = -2.0
const MINI_SWARM_DIVE_BEHIND_GRACE_S = 0.15
const MINI_SWARM_DIVE_OFFSET_FADE_DIST = 15
// Pedido do usuário: combate estilo Star Fox 64 — esquadrão surge visível (48-75u) e mergulha
// em direção à câmera de forma dinâmica e legível. (atualizado +20%, ver pedido "inimigos no
// mínimo 20% mais distantes")
const BLASTER_SPAWN_DISTANCE_MIN = 58 // 48 * 1.2 = 57.6, arredondado pra cima
const BLASTER_SPAWN_DISTANCE_MAX = 90 // 75 * 1.2
const BLASTER_BOX_X = 9
const BLASTER_BOX_Y = 6

// Variantes com cores ultra-vibrantes e componentes emissivos
const MINI_SWARM_VARIANTS = {
  straight: { color: 0xff1744, emissive: 0x880018 }, // vermelho elétrico
  zigzag: { color: 0x00e5ff, emissive: 0x005588 },   // ciano elétrico
  spiral: { color: 0x76ff03, emissive: 0x2e7d32 },   // verde-limão neon
}
const MINI_SWARM_VARIANT_IDS = Object.keys(MINI_SWARM_VARIANTS)
const ZIGZAG_AMPLITUDE = 6
const ZIGZAG_FREQUENCY = 3.2 // rad/s
const SPIRAL_RADIUS = 4.5
const SPIRAL_ANGULAR_SPEED = 5.5 // rad/s

const enemyGeometry = new THREE.ConeGeometry(1.1, 2.42, 4) // +10% maior (era 1, 2.2)
enemyGeometry.rotateX(Math.PI / 2)
const variantMaterials = new Map(
  Object.entries(MINI_SWARM_VARIANTS).map(([k, v]) => [
    k,
    new THREE.MeshPhongMaterial({
      color: v.color,
      emissive: v.emissive,
      emissiveIntensity: 0.75,
      flatShading: true,
    }),
  ]),
)

// retorna um ARRAY de inimigos (o enxame inteiro) — quem chama (index.js) empurra cada um no
// array compartilhado de inimigos
export function spawnMiniSwarm(scene, rail, nextId) {
  if (rail.isArena()) return []
  const variant = MINI_SWARM_VARIANT_IDS[Math.floor(Math.random() * MINI_SWARM_VARIANT_IDS.length)]
  const count = MINI_SWARM_MIN_COUNT + Math.floor(Math.random() * (MINI_SWARM_MAX_COUNT - MINI_SWARM_MIN_COUNT + 1))
  const base = spawnPositionForEnemy(rail, BLASTER_SPAWN_DISTANCE_MIN, BLASTER_SPAWN_DISTANCE_MAX, BLASTER_BOX_X, BLASTER_BOX_Y)
  const frame = rail.getFrameAt(0)
  const patrolDuration = MINI_SWARM_PATROL_DURATION_MIN + Math.random() * (MINI_SWARM_PATROL_DURATION_MAX - MINI_SWARM_PATROL_DURATION_MIN)
  const patrolPhase = Math.random() * Math.PI * 2
  const group = []
  for (let i = 0; i < count; i += 1) {
    const formationOffset = (i - (count - 1) / 2) * MINI_SWARM_SPACING
    const position = base.clone().addScaledVector(frame.right, formationOffset)
    const mesh = new THREE.Mesh(enemyGeometry, variantMaterials.get(variant))
    mesh.position.copy(position)
    mesh.scale.setScalar(MINI_ENEMY_SCALE)
    scene.add(mesh)
    group.push({
      id: nextId(), mesh, kind: MINI_SWARM_KIND, dying: false, deathT: 0, hp: 1, maxHp: 1, fireTimer: Infinity,
      variant,
      swarmState: 'patrol',
      formationOffset,
      patrolBase: base.clone(),
      patrolPhase,
      patrolTimer: patrolDuration,
      telegraphTimer: 0,
      diveDir: null,
      diveCorePos: null,
      diveElapsed: 0,
      diveAnglePhase: Math.random() * Math.PI * 2,
      spawnInvincibleTimer: 0,
    })
  }
  return group
}

// filhotes soltos pela Horda ao morrer (não é um spawn "normal" de fila — nasce um grupo inteiro
// no ponto exato da morte dela, count decidido por quem chama). Cada um sorteia seu próprio
// ângulo/raio de afastamento (raio calculado pra manter ~1 nave de distância entre vizinhos no
// círculo, igual pedido do usuário) — ver a fase 'spreadOut' em updateMiniSwarm acima.
// "1 nave de distância" (envergadura real, ver SHIP_PRESETS.default em rail.js: wingHalfSpan*2 =
// 5.2) — CORRIGIDO, media contra o raio do ponto de colisão (0.55) igual ao erro de escala que a
// própria Horda teve (ver histórico em progresso/), ficava um aglomerado colado e ilegível.
const HORDA_CHILD_NEIGHBOR_SPACING = 5.2
// Profundidade mínima (à frente do frame VIVO do jogador) que o ponto de espalhamento deve
// alcançar até o fim da fase spreadOut — dá um "corredor" de mergulho decente mesmo quando a
// Horda morre perto (ela orbita a só 28-50u). Combinado com DIVE_MAX_S maior (ver abaixo) pra dar
// tempo de cruzar essa distância sem ser culled por tempo antes de chegar perto do jogador.
const SPREAD_MIN_TARGET_DEPTH = 200
export function spawnMiniSwarmFromHorda(scene, rail, nextId, originPos, count) {
  const spreadRadius = count > 1
    ? HORDA_CHILD_NEIGHBOR_SPACING / (2 * Math.sin(Math.PI / count))
    : 0
  // Decompõe o ponto de morte da Horda (mundo absoluto) em coordenadas RELATIVAS ao frame vivo
  // atual (rail.getFrameAt(0) — o mesmo "agora" usado pelo loop principal, não um frame travado
  // tipo rail.getFrameAt(distânciaFixa)). CORRIGIDO — a versão antiga guardava spreadOrigin como
  // um Vector3 absoluto de mundo, congelado no instante da morte; o jogador avança dezenas de
  // unidades durante os 4s de spreadOut (trilho sempre anda), então o aglomerado ficava pra trás
  // e o cull de "ficou atrás" (relativeForward < pass-behind) disparava assim que a fase seguinte
  // media a posição contra o frame atual. Reancorando por depth/lateral (recalculados a cada tick
  // em updateMiniSwarm a partir do frame ATUAL), o ponto de espalhamento "anda junto" do jogador.
  const frame = rail.getFrameAt(0)
  const toOrigin = originPos.clone().sub(frame.position)
  const originDepth = toOrigin.dot(frame.forward)
  const originRight = toOrigin.dot(frame.right)
  const originUp = toOrigin.dot(frame.up)
  const spreadOriginDepthTarget = Math.max(originDepth, SPREAD_MIN_TARGET_DEPTH)
  const group = []
  for (let i = 0; i < count; i += 1) {
    const variant = MINI_SWARM_VARIANT_IDS[Math.floor(Math.random() * MINI_SWARM_VARIANT_IDS.length)]
    const mesh = new THREE.Mesh(enemyGeometry, variantMaterials.get(variant))
    mesh.position.copy(originPos)
    mesh.scale.setScalar(MINI_ENEMY_SCALE)
    scene.add(mesh)
    group.push({
      id: nextId(), mesh, kind: MINI_SWARM_KIND, dying: false, deathT: 0, hp: 1, maxHp: 1, fireTimer: Infinity,
      variant,
      swarmState: 'spreadOut',
      spreadOriginDepthStart: originDepth,
      spreadOriginDepthTarget,
      spreadOriginRight: originRight,
      spreadOriginUp: originUp,
      spreadAngle: (i / count) * Math.PI * 2 + Math.random() * 0.3,
      spreadRadius,
      spreadTimer: HORDA_SPLIT_SPREAD_DURATION_S,
      telegraphTimer: 0,
      diveDir: null,
      diveCorePos: null,
      diveElapsed: 0,
      diveAnglePhase: Math.random() * Math.PI * 2,
      spawnInvincibleTimer: MINI_SWARM_SPAWN_INVINCIBLE_S,
    })
  }
  return group
}

// patrulha balançando de um lado a outro por um tempo, depois trava mira (telegraph, pedido do
// usuário) e mergulha em direção ao jogador — reto (straight), em zigue-zague (zigzag) ou em
// hélice (spiral), conforme a variante sorteada no spawn. Nunca atira. Remove sozinho (não usa
// o pass-behind genérico do loop principal porque tem seu próprio teto de tempo de mergulho).
export function updateMiniSwarm(enemy, dt, ctx) {
  const { playerPosition, frame, elapsed, removeEnemy } = ctx
  if (enemy.swarmState === 'spreadOut') {
    enemy.spreadTimer -= dt
    const t = THREE.MathUtils.clamp(1 - Math.max(0, enemy.spreadTimer) / HORDA_SPLIT_SPREAD_DURATION_S, 0, 1)
    // Reancora a origem do espalhamento no frame VIVO de CADA tick (em vez de um Vector3 de
    // mundo congelado no spawn) — a profundidade também rampeia até spreadOriginDepthTarget,
    // dando um corredor de mergulho decente. Ver comentário em spawnMiniSwarmFromHorda.
    const depthNow = THREE.MathUtils.lerp(enemy.spreadOriginDepthStart, enemy.spreadOriginDepthTarget, t)
    const originNow = frame.position.clone()
      .addScaledVector(frame.forward, depthNow)
      .addScaledVector(frame.right, enemy.spreadOriginRight)
      .addScaledVector(frame.up, enemy.spreadOriginUp)
    const target = originNow.clone()
      .addScaledVector(frame.right, Math.cos(enemy.spreadAngle) * enemy.spreadRadius)
      .addScaledVector(frame.up, Math.sin(enemy.spreadAngle) * enemy.spreadRadius)
    enemy.mesh.position.lerpVectors(originNow, target, t)
    enemy.mesh.lookAt(playerPosition)
    if (enemy.spreadTimer <= 0) {
      enemy.swarmState = 'telegraph'
      enemy.telegraphTimer = MINI_SWARM_TELEGRAPH_S
      triggerSoundCue(ENEMY_SOUND_CUES.mini_swarm_dive_telegraph, { worldPos: enemy.mesh.position, variant: enemy.variant })
    }
    return
  }
  if (enemy.swarmState === 'patrol') {
    enemy.patrolTimer -= dt
    const wobble = Math.sin(elapsed * 2 + enemy.patrolPhase) * MINI_SWARM_PATROL_AMPLITUDE
    const pos = enemy.patrolBase.clone().addScaledVector(frame.right, enemy.formationOffset + wobble)
    enemy.mesh.position.lerp(pos, Math.min(1, MINI_SWARM_PATROL_SPEED * dt * 0.3))
    enemy.mesh.lookAt(playerPosition)
    if (enemy.patrolTimer <= 0) {
      enemy.swarmState = 'telegraph'
      enemy.telegraphTimer = MINI_SWARM_TELEGRAPH_S
      triggerSoundCue(ENEMY_SOUND_CUES.mini_swarm_dive_telegraph, { worldPos: enemy.mesh.position, variant: enemy.variant })
    }
    return
  }

  // ============ TELEGRAPH (momento de preparação) ============
  // trava mirando o jogador e "pulsa" (escala oscilando) por MINI_SWARM_TELEGRAPH_S antes do
  // mergulho de verdade começar — dá um aviso visual claro de "lá vem" em vez do mergulho sair
  // instantâneo, sem sinal nenhum.
  if (enemy.swarmState === 'telegraph') {
    enemy.telegraphTimer -= dt
    enemy.mesh.lookAt(playerPosition)
    const pulse = 1 + Math.sin(elapsed * 18) * 0.18
    enemy.mesh.scale.setScalar(MINI_ENEMY_SCALE * pulse)
    if (enemy.telegraphTimer <= 0) {
      enemy.mesh.scale.setScalar(MINI_ENEMY_SCALE)
      enemy.swarmState = 'dive'
      const spread = (Math.random() * 2 - 1) * MINI_SWARM_DIVE_SPREAD
      const diveTarget = playerPosition.clone().addScaledVector(frame.right, spread)
      const toTarget = diveTarget.clone().sub(enemy.mesh.position)
      enemy.diveDir = toTarget.lengthSq() > 1e-4 ? toTarget.normalize() : frame.forward.clone().negate()
      enemy.diveCorePos = enemy.mesh.position.clone()
      triggerSoundCue(ENEMY_SOUND_CUES.mini_swarm_whoosh, { worldPos: enemy.mesh.position, variant: enemy.variant })
    }
    return
  }

const _swarmBehind = new THREE.Vector3()
const _swarmToPlayer = new THREE.Vector3()
const _swarmOffset = new THREE.Vector3()
const _swarmPrevPos = new THREE.Vector3()
const _swarmFacing = new THREE.Vector3()
const _swarmRel = new THREE.Vector3()

  // base do mergulho anda na direção travada, mas essa direção CONTINUA virando levemente pra
  // seguir o jogador (MINI_SWARM_DIVE_TURN_RATE) — sem isso, o alvo travado no instante do
  // telegraph ficava desatualizado assim que o jogador (que está sempre avançando no trilho)
  // se movia, e o mergulho errava por tabela quase sempre. zigue-zague/hélice continuam sendo
  // um OFFSET lateral em cima dessa direção, não uma curva nela — só assim o desvio (±6 no
  // zigue-zague, raio 4.5 na hélice) fica visível de verdade.
  enemy.diveElapsed += dt
  // "núcleo" = posição de perseguição pura (sem o desvio visual) — precisa existir separado da
  // posição renderizada porque o offset abaixo é um valor ABSOLUTO recalculado a cada frame, não
  // uma velocidade; somar ele direto na posição (sem descontar o offset do frame anterior) vira
  // uma ACUMULAÇÃO sem fim, não uma oscilação (bug real, já pego em teste: zigue-zague chegava a
  // errar por 30-50 unidades por causa disso).
  if (!enemy.diveCorePos) enemy.diveCorePos = enemy.mesh.position.clone()
  // pedido do usuário: "fica te atacando por trás" — reperseguir um alvo que também avança
  // (o normal, o trilho sempre anda) fazia o inimigo "empatar" logo atrás do jogador por >1.5s
  // antes de finalmente cruzar a folga de PASS_BEHIND, lendo como "vindo de trás" persistente.
  // Congelar a mira NA HORA que cruza a profundidade do jogador resolvia isso, mas cortava
  // conversões que só terminavam de convergir um instante DEPOIS de cruzar (taxa de acerto caiu
  // de ~100% pra ~45%) — por isso um período de graça curto: continua reajustando por até
  // MINI_SWARM_DIVE_BEHIND_GRACE_S depois de cruzar (dá tempo do golpe final), só congela de
  // verdade passado isso.
  if (enemy.behindTimer == null) enemy.behindTimer = 0
  const behindDot = _swarmBehind.copy(enemy.diveCorePos).sub(frame.position).dot(frame.forward)
  if (behindDot < 0) enemy.behindTimer += dt
  _swarmToPlayer.copy(playerPosition).sub(enemy.diveCorePos)
  const distToPlayer = _swarmToPlayer.length()
  if (enemy.behindTimer < MINI_SWARM_DIVE_BEHIND_GRACE_S && distToPlayer > 1e-4) {
    _swarmToPlayer.normalize()
    enemy.diveDir.lerp(_swarmToPlayer, Math.min(1, MINI_SWARM_DIVE_TURN_RATE * dt)).normalize()
  }
  enemy.diveCorePos.addScaledVector(enemy.diveDir, MINI_SWARM_DIVE_SPEED * dt)

  // desvio visual (zigue-zague/hélice) — some conforme se aproxima do jogador (fade linear nos
  // últimos MINI_SWARM_DIVE_OFFSET_FADE_DIST), senão o "erro" de propósito quase nunca cruza
  // zero bem na hora exata do impacto e o enxame nunca acerta de verdade. Assim ele ainda
  // serpenteia na aproximação (mais difícil de prever/abater), mas compromete o golpe no final.
  const fade = THREE.MathUtils.clamp(distToPlayer / MINI_SWARM_DIVE_OFFSET_FADE_DIST, 0, 1)
  _swarmOffset.set(0, 0, 0)
  if (enemy.variant === 'zigzag') {
    const lateral = Math.sin(enemy.diveAnglePhase + elapsed * ZIGZAG_FREQUENCY) * ZIGZAG_AMPLITUDE * fade
    _swarmOffset.addScaledVector(frame.right, lateral)
  } else if (enemy.variant === 'spiral') {
    enemy.diveAnglePhase += SPIRAL_ANGULAR_SPEED * dt
    _swarmOffset.addScaledVector(frame.right, Math.cos(enemy.diveAnglePhase) * SPIRAL_RADIUS * fade)
    _swarmOffset.addScaledVector(frame.up, Math.sin(enemy.diveAnglePhase) * SPIRAL_RADIUS * fade)
  }
  _swarmPrevPos.copy(enemy.mesh.position)
  enemy.mesh.position.copy(enemy.diveCorePos).add(_swarmOffset)
  _swarmFacing.copy(enemy.mesh.position).sub(_swarmPrevPos)
  if (_swarmFacing.lengthSq() > 1e-6) {
    _swarmFacing.add(enemy.mesh.position)
    enemy.mesh.lookAt(_swarmFacing)
  }

  const relative = _swarmRel.copy(enemy.mesh.position).sub(frame.position)
  if (enemy.diveElapsed > MINI_SWARM_DIVE_MAX_S || relative.dot(frame.forward) < MINI_SWARM_DIVE_PASS_BEHIND) {
    removeEnemy(enemy)
  }
}

export function miniSwarmHitRadius() {
  return MINI_ENEMY_HIT_RADIUS
}

export function disposeMiniSwarm() {
  enemyGeometry.dispose()
  for (const m of variantMaterials.values()) m.dispose()
}
