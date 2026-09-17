import * as THREE from 'three'
import { PASS_BEHIND } from './shared.js'

// ============ BLASTER — vermelho comum atirador ============
// v0.34.0: nome formal da classe (antes só existia como kind:'red', sem identidade própria).
// As 6 variações de cor/movimento entregues na v0.33.0 continuam intactas, só migraram pra cá.
export const BLASTER_KIND = 'blaster'
export const BLASTER_HIT_RADIUS = 1.8
export const BLASTER_DEATH_DURATION = 0.2
export const BLASTER_KILL_BONUS = 30
// pedido do usuário: "a maioria dos inimigos fica tão longe" — reduzido pra engajar mais cedo.
// v0.62.2: pedido do usuário de novo, mas o oposto problema — 60-100 (faixa de 40) fazia TODO
// spawn cair perto da mesma distância, sem sensação real de variação. Alargado pra 50-150
// (faixa de 100): chão (50) continua alto o bastante pra nunca nascer colado (a nave a 22u/s
// ainda tem ~2.3s de reação), teto (150) fica abaixo do valor que o mini-swarm.js já tinha
// testado e rejeitado como "longe demais" (160-240, ver comentário em miniSwarm.js) — mesmo
// Pedido do usuário: combate estilo Star Fox 64 — inimigos surgem na faixa de 45-75u (claramente
// visíveis e identificáveis na tela) e voam dinamicamente em direção ao jogador/câmera.
export const BLASTER_SPAWN_DISTANCE_MIN = 45
export const BLASTER_SPAWN_DISTANCE_MAX = 75
export const BLASTER_BOX_X = 7
export const BLASTER_BOX_Y = 5

const ENEMY_TURN_RATE = 1.6
const ENEMY_ORBIT_RADIUS_MIN = 14
const ENEMY_ORBIT_RADIUS_MAX = 26
const ENEMY_ORBIT_ANGULAR_SPEED = 0.8

// perfis de movimento — mesma classe/hp/tiro, cor do mesh (e do telegraph) muda com o padrão de
// deslocamento sorteado no spawn, pra virar informação de leitura em vez de decoração. Roda em
// arena E em trilho.
export const BLASTER_PROFILES = [
  { id: 'orbit', color: 0xff4d4d }, // padrão: gira em loop (arena: orbita o jogador; trilho: orbita o próprio ponto de spawn)
  { id: 'advance', color: 0xff7a29 }, // avança reto e rápido
  { id: 'slow', color: 0x7a2020 }, // avança bem lento, fica mais tempo em tela
  { id: 'follow', color: 0xff2f8f }, // persegue mantendo distância, evita passar/colidir
  { id: 'circular', color: 0xc61aff }, // espiral: orbita girando mais rápido e fechando o raio
  { id: 'evasive', color: 0xffb347 }, // muda de direção lateral aleatoriamente, tentando desviar
]
export const BLASTER_PROFILE_COLOR = new Map(BLASTER_PROFILES.map((p) => [p.id, p.color]))
const BLASTER_PROFILE_SPEED_RANGE = {
  orbit: [0.45, 0.75],
  advance: [0.85, 1.0],
  slow: [0.15, 0.3],
  follow: [0.5, 0.7],
  circular: [0.5, 0.8],
  evasive: [0.6, 0.9],
}
const ARENA_FOLLOW_STANDOFF = 18
const CIRCULAR_ANGULAR_SPEED = 2.2
const CIRCULAR_SHRINK_RATE = 1.2
const CIRCULAR_MIN_RADIUS = 6
const EVASIVE_JUKE_INTERVAL_MIN = 0.4
const EVASIVE_JUKE_INTERVAL_MAX = 0.9

const RAIL_ORBIT_RADIUS = 4.5
const RAIL_ORBIT_SPEED = 1.4
const RAIL_ADVANCE_SPEED = 14
const RAIL_SLOW_SPEED = 6
const RAIL_FOLLOW_SPEED = 9
const RAIL_FOLLOW_STANDOFF = 10
export const BLASTER_RAIL_FOLLOW_PASS_BEHIND = PASS_BEHIND * 5 // bem mais tolerante — esse perfil não "passa" fácil
const RAIL_CIRCULAR_DRIFT_SPEED = 5.5
const RAIL_EVASIVE_SPEED = 8

const enemyGeometry = new THREE.ConeGeometry(1, 2.2, 4)
enemyGeometry.rotateX(Math.PI / 2)
const profileMaterials = new Map(
  BLASTER_PROFILES.map((p) => [p.id, new THREE.MeshPhongMaterial({ color: p.color, flatShading: true })]),
)

// gira o "jukeDir" pra um novo ângulo lateral aleatório a cada intervalo — aproximação de
// "tentativa de desvio" (sem ler tiro do jogador de fato, só troca de rumo errático)
function rerollJukeDir(enemy, frame) {
  enemy.jukeTimer = EVASIVE_JUKE_INTERVAL_MIN + Math.random() * (EVASIVE_JUKE_INTERVAL_MAX - EVASIVE_JUKE_INTERVAL_MIN)
  const angle = Math.random() * Math.PI * 2
  enemy.jukeDir.set(0, 0, 0)
    .addScaledVector(frame.right, Math.cos(angle))
    .addScaledVector(frame.up, Math.sin(angle))
}

// ============ MOVIMENTO NO TRILHO: MODELO PROFUNDIDADE + TELA ============
// v0.51.11: a versão anterior acumulava a posição direto em coordenadas de MUNDO usando
// `frame.right/up/forward` da CURVA (rail.getFrameAt) — e essa base gira sozinho conforme a
// pista curva, mesmo parado lateralmente (só de avançar). Perfis que reconsultavam esse frame
// por vários frames seguidos (orbit/circular/follow/evasive) iam divergindo — medido em teste:
// `circular` chegava a "explodir" pra +4472px/-1897px da tela antes de ser removido.
//
// Pesquisa no código-fonte decompilado de Star Fox 64 (`Camera_UpdateArwingOnRails`,
// github.com/HarbourMasters/Starship) mostrou que mesmo lá a câmera não segue 100% a nave — só
// que a MIRA da câmera TAMBÉM se desloca com a lateral do jogador (o nosso `rail.js` só desloca
// o OLHO, a mira fica sempre olhando pra frente da curva). Copiar isso ajudaria a NAVE a ficar
// mais centralizada, mas não resolve pra objetos posicionados em coordenada de mundo — este
// jogo tem cosmética de câmera extra (drift senoidal, roll de curva) que o SF64 não tinha, e
// qualquer uma delas reintroduz o mesmo tipo de divergência.
//
// Modelo novo (mais robusto que o do próprio SF64 pra esse caso): cada inimigo guarda
// profundidade (`depth`, distância à frente da câmera) + posição de tela (`screenX`/`screenY`,
// deslocamento lateral/vertical em unidades de mundo no plano perpendicular à mira). Os perfis
// de movimento só mexem nesses 3 números — matemática 2D pura, sem vetor de mundo acumulando.
// `projectBlasterToWorld` é o ÚNICO lugar que converte isso em posição de mundo, e SEMPRE usa a
// base ATUAL da câmera (`rail.getSpawnFrame()`) — não importa quanto a câmera girou/deslocou
// entre um frame e outro, o inimigo sempre aparece exatamente onde os 3 números dizem que ele
// deveria estar na tela. Verificado: NDC.x médio ~0.00 em qualquer estado do jogador, todos os
// 6 perfis estáveis (circular caiu de +4472px pra ~100px de erro).
function projectBlasterToWorld(enemy, rail) {
  const frame = rail.getSpawnFrame()
  enemy.mesh.position.copy(frame.position)
    .addScaledVector(frame.forward, enemy.depth)
    .addScaledVector(frame.right, enemy.screenX)
    .addScaledVector(frame.up, enemy.screenY)
}

export function spawnBlaster(scene, rail, id) {
  const distanceAhead = BLASTER_SPAWN_DISTANCE_MIN + Math.random() * (BLASTER_SPAWN_DISTANCE_MAX - BLASTER_SPAWN_DISTANCE_MIN)
  const screenX = (Math.random() * 2 - 1) * BLASTER_BOX_X
  const screenY = (Math.random() * 2 - 1) * BLASTER_BOX_Y
  const profile = BLASTER_PROFILES[Math.floor(Math.random() * BLASTER_PROFILES.length)]
  const mesh = new THREE.Mesh(enemyGeometry, profileMaterials.get(profile.id))
  scene.add(mesh)
  const [speedMin, speedMax] = BLASTER_PROFILE_SPEED_RANGE[profile.id]
  const enemy = {
    id, mesh, kind: BLASTER_KIND, dying: false, deathT: 0, hp: 2, maxHp: 2, fireTimer: null,
    profile: profile.id,
    speedFactor: speedMin + Math.random() * (speedMax - speedMin),
    depth: distanceAhead,
    screenX, screenY,
    orbitCenterX: screenX, orbitCenterY: screenY,
    orbitRadius: ENEMY_ORBIT_RADIUS_MIN + Math.random() * (ENEMY_ORBIT_RADIUS_MAX - ENEMY_ORBIT_RADIUS_MIN),
    orbitAngle: Math.random() * Math.PI * 2,
    orbitDir: Math.random() < 0.5 ? 1 : -1,
    jukeTimer: 0,
    jukeAngle: Math.random() * Math.PI * 2,
    jukeDir: new THREE.Vector3(), // usado só pelo movimento em ARENA (updateBlasterArenaMovement)
    moveDir: null,
  }
  projectBlasterToWorld(enemy, rail)
  return enemy
}

export function updateBlasterArenaMovement(enemy, dt, playerPosition, frame, speedCap) {
  const chaseSpeed = (enemy.speedFactor ?? 0.6) * speedCap
  let desiredDir

  if (enemy.profile === 'orbit' || enemy.profile === 'circular') {
    const angularSpeed = enemy.profile === 'circular' ? CIRCULAR_ANGULAR_SPEED : ENEMY_ORBIT_ANGULAR_SPEED
    enemy.orbitAngle += angularSpeed * enemy.orbitDir * dt
    if (enemy.profile === 'circular') {
      enemy.orbitRadius = Math.max(CIRCULAR_MIN_RADIUS, enemy.orbitRadius - CIRCULAR_SHRINK_RATE * dt)
    }
    const orbitPoint = playerPosition.clone()
      .addScaledVector(frame.right, Math.cos(enemy.orbitAngle) * enemy.orbitRadius)
      .addScaledVector(frame.up, Math.sin(enemy.orbitAngle) * enemy.orbitRadius)
    desiredDir = orbitPoint.sub(enemy.mesh.position)
  } else if (enemy.profile === 'follow') {
    const toPlayer = playerPosition.clone().sub(enemy.mesh.position)
    desiredDir = toPlayer.length() > ARENA_FOLLOW_STANDOFF ? toPlayer : toPlayer.multiplyScalar(-1)
  } else if (enemy.profile === 'evasive') {
    if ((enemy.jukeTimer -= dt) <= 0) rerollJukeDir(enemy, frame)
    desiredDir = playerPosition.clone().sub(enemy.mesh.position).normalize().add(enemy.jukeDir)
  } else {
    desiredDir = playerPosition.clone().sub(enemy.mesh.position)
  }

  if (desiredDir.lengthSq() > 1e-4) {
    desiredDir.normalize()
    if (!enemy.moveDir) enemy.moveDir = desiredDir.clone()
    enemy.moveDir.lerp(desiredDir, Math.min(1, ENEMY_TURN_RATE * dt))
    if (enemy.moveDir.lengthSq() > 1e-6) enemy.moveDir.normalize()
    enemy.mesh.position.addScaledVector(enemy.moveDir, chaseSpeed * dt)
  }
  enemy.mesh.lookAt(playerPosition)
}

export function updateBlasterRailMovement(enemy, dt, rail) {
  if (enemy.profile === 'orbit') {
    enemy.orbitAngle += RAIL_ORBIT_SPEED * enemy.orbitDir * dt
    enemy.depth -= RAIL_SLOW_SPEED * dt
    enemy.screenX = enemy.orbitCenterX + Math.cos(enemy.orbitAngle) * RAIL_ORBIT_RADIUS
    enemy.screenY = enemy.orbitCenterY + Math.sin(enemy.orbitAngle) * RAIL_ORBIT_RADIUS
  } else if (enemy.profile === 'circular') {
    enemy.orbitAngle += CIRCULAR_ANGULAR_SPEED * enemy.orbitDir * dt
    enemy.orbitRadius = Math.max(CIRCULAR_MIN_RADIUS, enemy.orbitRadius - CIRCULAR_SHRINK_RATE * dt)
    enemy.depth -= RAIL_CIRCULAR_DRIFT_SPEED * dt
    enemy.screenX = enemy.orbitCenterX + Math.cos(enemy.orbitAngle) * enemy.orbitRadius
    enemy.screenY = enemy.orbitCenterY + Math.sin(enemy.orbitAngle) * enemy.orbitRadius
  } else if (enemy.profile === 'advance') {
    enemy.depth -= RAIL_ADVANCE_SPEED * dt
  } else if (enemy.profile === 'slow') {
    enemy.depth -= RAIL_SLOW_SPEED * dt
  } else if (enemy.profile === 'follow') {
    const correction = enemy.depth > RAIL_FOLLOW_STANDOFF ? -1 : enemy.depth < RAIL_FOLLOW_STANDOFF * 0.5 ? 1 : 0
    enemy.depth += correction * RAIL_FOLLOW_SPEED * dt
  } else if (enemy.profile === 'evasive') {
    if ((enemy.jukeTimer -= dt) <= 0) {
      enemy.jukeTimer = EVASIVE_JUKE_INTERVAL_MIN + Math.random() * (EVASIVE_JUKE_INTERVAL_MAX - EVASIVE_JUKE_INTERVAL_MIN)
      enemy.jukeAngle = Math.random() * Math.PI * 2
    }
    enemy.depth -= RAIL_SLOW_SPEED * dt
    enemy.screenX += Math.cos(enemy.jukeAngle) * RAIL_EVASIVE_SPEED * dt
    enemy.screenY += Math.sin(enemy.jukeAngle) * RAIL_EVASIVE_SPEED * dt
  }
  projectBlasterToWorld(enemy, rail)
}

export function blasterPassBehind(enemy) {
  return enemy.profile === 'follow' ? BLASTER_RAIL_FOLLOW_PASS_BEHIND : PASS_BEHIND
}

export function blasterColor(enemy) {
  return BLASTER_PROFILE_COLOR.get(enemy.profile) ?? BLASTER_PROFILES[0].color
}

export function disposeBlaster() {
  enemyGeometry.dispose()
  for (const m of profileMaterials.values()) m.dispose()
}
