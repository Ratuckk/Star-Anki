import * as THREE from 'three'
import { FORWARD_AXIS, randomSpawnAroundArena, HOMING_EXPLOSION_COLOR, ENEMY_ARENA_SPAWN_MAX } from './shared.js'

// ============ CHEFE — decaedro móvel + laser telegrafado ============
export const BOSS_KIND = 'boss'
export const BOSS_COLOR = 0xff2d4d
const BOSS_EMISSIVE = 0x5c0018
export const BOSS_SCALE = 5
export const BOSS_HIT_RADIUS = 7
export const BOSS_DEATH_DURATION = 0.6
// pedido do usuário: "o boss principal mal se move, é pra ele se mover lentamente em direção ao
// jogador" — 7 era quase estático perto da velocidade padrão de perseguição de inimigo comum em
// arena (rail.getArenaSpeed()*0.5 ≈ 11) e da velocidade da própria nave (ARENA_SPEED=22).
// Continua mais lento que um inimigo comum (ainda "lento", só que perceptível de verdade).
const BOSS_CHASE_SPEED = 14
const BOSS_FIRE_INTERVAL_MIN = 800
const BOSS_FIRE_INTERVAL_MAX = 1600
const BOSS_SHOTS_PER_VOLLEY = 3

// telegrafado por 3s (círculos crescendo, effects.chargeCircle) na posição ATUAL do jogador no
// instante em que o laser "trava o alvo" — dá tempo real de sair de cima antes do disparo
const LASER_INTERVAL_MIN = 6.0
const LASER_INTERVAL_MAX = 10.0
const LASER_TELEGRAPH_S = 3.0
// LASER GRANDE: pedido do usuário — "é pra serem LASERS, [feixes] IMENSOS e rápidos o bastante
// pro jogador só conseguir desviar na hora certa". Era raio 0.55/comprimento 12 (dardo fino),
// depois só raio 2.5/comprimento 24 a 80u/s — ainda cruzava o alcance máximo em 3s inteiros,
// mais torpedo lento que laser. Agora: bem maior (raio 4.5, comprimento 45) e ~7.5x mais rápido
// (cruza o alcance máximo em ~0.4s) — só dá pra desviar reagindo no instante certo, não fugindo
// a qualquer momento durante o voo.
const LASER_RADIUS = 4.5
const LASER_LENGTH = 45
const LASER_SPEED = 600
const LASER_MAX_RANGE = 240
export const BOSS_LASER_HIT_RADIUS = 5.0  // acompanha o raio visual maior
export const BOSS_LASER_COLOR = 0xff2d4d

// dodecaedro (12 faces regulares) é o poliedro pronto mais próximo de "decaedro facetado
// girando" — three.js não tem decaedro nativo. Gira sozinho, independente de olhar pro jogador.
export const bossEnemyGeometry = new THREE.DodecahedronGeometry(1, 0)
export const bossEnemyMaterial = new THREE.MeshPhongMaterial({ color: BOSS_COLOR, emissive: BOSS_EMISSIVE, flatShading: true })

export function spawnBossEnemy(scene, rail, id, hp) {
  const position = randomSpawnAroundArena(rail, ENEMY_ARENA_SPAWN_MAX * 0.6, ENEMY_ARENA_SPAWN_MAX)
  const mesh = new THREE.Mesh(bossEnemyGeometry, bossEnemyMaterial)
  mesh.position.copy(position)
  mesh.scale.setScalar(BOSS_SCALE)
  scene.add(mesh)
  return {
    id, mesh, kind: BOSS_KIND, dying: false, deathT: 0, hp, maxHp: hp, fireTimer: 1,
    laserCooldown: LASER_INTERVAL_MIN + Math.random() * (LASER_INTERVAL_MAX - LASER_INTERVAL_MIN),
    laserTelegraphTimer: 0,
    laserTargetPos: null,
  }
}

export function updateBossMovement(enemy, dt, playerPosition) {
  const toPlayer = playerPosition.clone().sub(enemy.mesh.position)
  if (toPlayer.lengthSq() > 1e-4) {
    toPlayer.normalize()
    enemy.mesh.position.addScaledVector(toPlayer, BOSS_CHASE_SPEED * dt)
    enemy.mesh.lookAt(playerPosition)
  }
  // rotação constante em 2 eixos por cima do lookAt, pra não parecer um poliedro parado
  enemy.mesh.rotateX(dt * 0.6)
  enemy.mesh.rotateY(dt * 0.9)
}

export function randomBossFireInterval() {
  return (BOSS_FIRE_INTERVAL_MIN + Math.random() * (BOSS_FIRE_INTERVAL_MAX - BOSS_FIRE_INTERVAL_MIN)) / 1000
}

export function fireBossVolley(enemy, playerPosition, ctx) {
  for (let i = 0; i < BOSS_SHOTS_PER_VOLLEY; i += 1) ctx.fireEnemyProjectile(enemy, playerPosition)
}

function fireBossLaser(scene, ctx, enemy, targetPos) {
  const startPos = enemy.mesh.position.clone()
  const direction = targetPos.clone().sub(startPos).normalize()

  const geo = new THREE.ConeGeometry(LASER_RADIUS, LASER_LENGTH, 8)
  geo.rotateX(Math.PI / 2)
  const mat = new THREE.MeshBasicMaterial({
    color: BOSS_LASER_COLOR, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.copy(startPos)
  mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, direction)
  scene.add(mesh)
  ctx.pushLaser({ mesh, geo, mat, velocity: direction.multiplyScalar(LASER_SPEED), traveled: 0, maxRange: LASER_MAX_RANGE, hitRadius: BOSS_LASER_HIT_RADIUS, shieldDamage: 1 })
}

// telegrafado 3s, dispara na posição travada — chamado a cada tick do chefe (à parte do tiro
// normal/rajada, que segue o fireTimer genérico)
export function updateBossLaser(scene, enemy, dt, playerPosition, effects, ctx) {
  if (enemy.laserTelegraphTimer > 0) {
    // pedido do usuário: antes travava a posição do jogador só no INÍCIO do telegraph e disparava
    // ali mesmo 3s depois — dava pra sair de cima a qualquer momento durante o aviso e nunca
    // precisar de fato reagir na hora do disparo. Agora continua "mirando" a posição ATUAL do
    // jogador o tempo todo (o marcador visual acompanha via closure em `chargeCircle`), só o
    // instante exato do disparo é que conta de verdade.
    enemy.laserTargetPos = playerPosition.clone()
    enemy.laserTelegraphTimer -= dt
    if (enemy.laserTelegraphTimer <= 0) {
      if (enemy.laserTargetPos) fireBossLaser(scene, ctx, enemy, enemy.laserTargetPos)
      enemy.laserTargetPos = null
      enemy.laserCooldown = LASER_INTERVAL_MIN + Math.random() * (LASER_INTERVAL_MAX - LASER_INTERVAL_MIN)
    }
  } else {
    enemy.laserCooldown -= dt
    if (enemy.laserCooldown <= 0) {
      enemy.laserTargetPos = playerPosition.clone()
      enemy.laserTelegraphTimer = LASER_TELEGRAPH_S
      if (effects) effects.chargeCircle(() => enemy.laserTargetPos, LASER_TELEGRAPH_S, BOSS_LASER_COLOR)
    }
  }
}

// explosão de kill do chefe — bem maior/espalhafatosa que a de um inimigo comum, com 2 camadas
// extras defasadas (setTimeout) e uma onda de choque. `position` é clonado porque o mesh que
// morreu pode já ter sido removido da cena pelo tempo que os timeouts disparam.
export function explodeBoss(effects, position, isHoming = false) {
  const pos = position.clone()
  const mainColor = isHoming ? HOMING_EXPLOSION_COLOR : BOSS_COLOR
  effects.explosion(pos, mainColor, 5.0, { rings: true, isBoss: true })
  effects.shockwave(pos, BOSS_COLOR, 1.6)
  setTimeout(() => effects.explosion(pos, 0xffaa33, 3.2, { rings: true, isBoss: true }), 110)
  setTimeout(() => effects.explosion(pos, mainColor, 3.8, { rings: true, isBoss: true }), 240)
}

export function disposeBoss() {
  bossEnemyGeometry.dispose()
  bossEnemyMaterial.dispose()
}
