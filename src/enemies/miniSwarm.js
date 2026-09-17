import * as THREE from 'three'
import { spawnPositionForEnemy } from './shared.js'

// ============ MINI-SWARM — fila/enxame de mini-inimigos (só modo trilho) ============
export const MINI_SWARM_KIND = 'miniSwarm'
const MINI_ENEMY_SCALE = 0.7 // 30% menor que o blaster normal
// v0.51.10: 1.8*0.7=1.26 era pequeno demais combinado com a velocidade do mergulho (55u/s,
// ~0.9 unidade por frame a 60fps) — o alvo "pulava" por cima do raio de contato entre um frame
// e outro sem nunca cair dentro dele, dando a sensação de "quase nunca acerta". Subido pra um
// valor que sobrevive ao salto por frame na velocidade atual.
const MINI_ENEMY_HIT_RADIUS = 2.2
const MINI_SWARM_MIN_COUNT = 5
const MINI_SWARM_MAX_COUNT = 10
const MINI_SWARM_SPACING = 2
const MINI_SWARM_PATROL_SPEED = 28
const MINI_SWARM_PATROL_AMPLITUDE = 10
const MINI_SWARM_PATROL_DURATION_MIN = 1.2
const MINI_SWARM_PATROL_DURATION_MAX = 2.8
// pedido do usuário: "momento de preparação" antes do mergulho — o grupo trava mirando o
// jogador e pulsa visualmente por essa duração antes de disparar de verdade.
const MINI_SWARM_TELEGRAPH_S = 0.45
const MINI_SWARM_DIVE_SPEED = 55
const MINI_SWARM_DIVE_SPREAD = 7
// taxa (por segundo) com que a direção do mergulho vira pra CONTINUAR mirando o jogador em
// movimento — antes era travada uma vez no início e nunca corrigia, então um jogador que
// continuava andando pra frente (o normal, o trilho sempre avança) fazia o mergulho errar por
// tabela quase sempre. Não é homing perfeito (`MINI_SWARM_DIVE_TURN_RATE` baixo o bastante pra
// ainda dar pra desviar de propósito), só o suficiente pra não errar por um alvo desatualizado.
const MINI_SWARM_DIVE_TURN_RATE = 6
const MINI_SWARM_DIVE_MAX_S = 7
// PASS_BEHIND genérico (-4) checa só a PROFUNDIDADE ao longo do trilho — pra um mergulho rápido
// (55u/s) mirando o jogador, é fácil cruzar essa profundidade enquanto ainda está a 5-15
// unidades de distância LATERAL/vertical real (medido: removido a 9.67 de distância de verdade
// por esse motivo). Usa um limite mais tolerante só durante o mergulho, pra dar tempo dele
// convergir de verdade antes de desistir — mas não TÃO tolerante: medido que a convergência de
// verdade acontece ANTES de cruzar a profundidade zero (por volta de -1 a -2), então -8 já
// sobra folga sem deixar ele rondar/atacar por trás do jogador por um tempo longo depois de já
// ter passado (pedido do usuário: "fica te atacando por trás" — era -20 antes, tolerante demais).
const MINI_SWARM_DIVE_PASS_BEHIND = -8
// quanto tempo, DEPOIS de cruzar a profundidade do jogador, ainda vale reajustar a mira antes
// de congelar de vez (ver comentário completo no ponto de uso) — curto o bastante pra não virar
// perseguição-por-trás, longo o bastante pra não cortar acertos de última hora.
const MINI_SWARM_DIVE_BEHIND_GRACE_S = 0.35
// distância (unidades) em que o desvio visual (zigue-zague/hélice) começa a encolher até 0 —
// abaixo disso o inimigo vira uma perseguição pura, garantindo que ele realmente cruza o
// jogador em vez de só balançar por perto pra sempre.
const MINI_SWARM_DIVE_OFFSET_FADE_DIST = 15
// Pedido do usuário: combate estilo Star Fox 64 — esquadrão surge visível (48-75u) e mergulha
// em direção à câmera de forma dinâmica e legível.
const BLASTER_SPAWN_DISTANCE_MIN = 48
const BLASTER_SPAWN_DISTANCE_MAX = 75
const BLASTER_BOX_X = 9
const BLASTER_BOX_Y = 6

 
// v0.34.0: pedido do usuário — 2 padrões de mergulho novos além do reto original, cada um com
// cor própria (o grupo inteiro sorteia 1 variante por spawn, todos os membros usam a mesma —
// lê como "esse enxame ataca em zigue-zague", não "membro individual aleatório").
const MINI_SWARM_VARIANTS = {
  straight: { color: 0xff8080 }, // original, vermelho claro
  zigzag: { color: 0x4de1ff }, // ciano elétrico — zigue-zague lateral contínuo
  spiral: { color: 0x9dff4d }, // verde-limão — hélice rodopiante contínua, avançando em linha
}
const MINI_SWARM_VARIANT_IDS = Object.keys(MINI_SWARM_VARIANTS)
const ZIGZAG_AMPLITUDE = 6
const ZIGZAG_FREQUENCY = 3.2 // rad/s
const SPIRAL_RADIUS = 4.5
const SPIRAL_ANGULAR_SPEED = 5.5 // rad/s

const enemyGeometry = new THREE.ConeGeometry(1, 2.2, 4)
enemyGeometry.rotateX(Math.PI / 2)
const variantMaterials = new Map(
  MINI_SWARM_VARIANT_IDS.map((id) => [id, new THREE.MeshPhongMaterial({ color: MINI_SWARM_VARIANTS[id].color, flatShading: true })]),
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
  if (enemy.swarmState === 'patrol') {
    enemy.patrolTimer -= dt
    const wobble = Math.sin(elapsed * 2 + enemy.patrolPhase) * MINI_SWARM_PATROL_AMPLITUDE
    const pos = enemy.patrolBase.clone().addScaledVector(frame.right, enemy.formationOffset + wobble)
    enemy.mesh.position.lerp(pos, Math.min(1, MINI_SWARM_PATROL_SPEED * dt * 0.3))
    enemy.mesh.lookAt(playerPosition)
    if (enemy.patrolTimer <= 0) {
      enemy.swarmState = 'telegraph'
      enemy.telegraphTimer = MINI_SWARM_TELEGRAPH_S
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
    }
    return
  }

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
  const behindDot = enemy.diveCorePos.clone().sub(frame.position).dot(frame.forward)
  if (behindDot < 0) enemy.behindTimer += dt
  const toPlayer = playerPosition.clone().sub(enemy.diveCorePos)
  const distToPlayer = toPlayer.length()
  if (enemy.behindTimer < MINI_SWARM_DIVE_BEHIND_GRACE_S && distToPlayer > 1e-4) {
    toPlayer.normalize()
    enemy.diveDir.lerp(toPlayer, Math.min(1, MINI_SWARM_DIVE_TURN_RATE * dt)).normalize()
  }
  enemy.diveCorePos.addScaledVector(enemy.diveDir, MINI_SWARM_DIVE_SPEED * dt)

  // desvio visual (zigue-zague/hélice) — some conforme se aproxima do jogador (fade linear nos
  // últimos MINI_SWARM_DIVE_OFFSET_FADE_DIST), senão o "erro" de propósito quase nunca cruza
  // zero bem na hora exata do impacto e o enxame nunca acerta de verdade. Assim ele ainda
  // serpenteia na aproximação (mais difícil de prever/abater), mas compromete o golpe no final.
  const fade = THREE.MathUtils.clamp(distToPlayer / MINI_SWARM_DIVE_OFFSET_FADE_DIST, 0, 1)
  const offset = new THREE.Vector3()
  if (enemy.variant === 'zigzag') {
    const lateral = Math.sin(enemy.diveAnglePhase + elapsed * ZIGZAG_FREQUENCY) * ZIGZAG_AMPLITUDE * fade
    offset.addScaledVector(frame.right, lateral)
  } else if (enemy.variant === 'spiral') {
    enemy.diveAnglePhase += SPIRAL_ANGULAR_SPEED * dt
    offset.addScaledVector(frame.right, Math.cos(enemy.diveAnglePhase) * SPIRAL_RADIUS * fade)
    offset.addScaledVector(frame.up, Math.sin(enemy.diveAnglePhase) * SPIRAL_RADIUS * fade)
  }
  const prevPos = enemy.mesh.position.clone()
  enemy.mesh.position.copy(enemy.diveCorePos).add(offset)
  const facing = enemy.mesh.position.clone().sub(prevPos)
  if (facing.lengthSq() > 1e-6) enemy.mesh.lookAt(enemy.mesh.position.clone().add(facing))

  const relative = enemy.mesh.position.clone().sub(frame.position)
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
