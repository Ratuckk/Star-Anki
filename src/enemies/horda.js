import * as THREE from 'three'

// ============ HORDA — atirador genérico grande, fusão de Blaster + Mini-Swarm ============
// Só existe em trilho. Orbita distante do jogador (se aproxima durante o impulso dele), dispara
// um projétil grande/lento-pra-esquivar até 6 vezes e vai embora — igual ao Blaster nesse ponto.
// Ao morrer (por qualquer meio: tiro normal, carregado, splash, aríete), se despedaça num grupo
// de mini-swarms de verdade (kind reaproveitado 100%, ver spawnMiniSwarmFromHorda em
// miniSwarm.js) que passam 4s se afastando antes de entrar no telegraph/mergulho normal.
// HP/dano/quantidade de filhotes escalam com getDifficultyLevel() (ver shared.js) — pedido
// explícito do usuário, mecânica nova sem precedente em nenhum outro inimigo hoje.
export const HORDA_KIND = 'horda'

// Hitbox: "3 naves de largura e 3 naves de altura" (nave = círculo de raio 0.55, ver
// rail.getShipHitboxPoints) — 3 * (0.55*2) / 2 = 1.65 de raio.
export const HORDA_HIT_RADIUS = 1.65
// Maior que o padrão (~0.2-0.3s) por ela ser bem maior — valor não especificado explicitamente,
// escolhido por analogia (Fragata usa 0.3, ela é a segunda maior depois do Chefe).
export const HORDA_DEATH_DURATION = 0.35
export const HORDA_KILL_BONUS = 200
// Cor de identidade (cinza) — usada no telegraph E no tingimento da explosão de morte, mesmo
// dispatch genérico de colorFor() que todo outro inimigo usa. NÃO é a cor do projétil (vermelho,
// só do projétil em si).
export const HORDA_COLOR = 0x6b7280
const HORDA_EMISSIVE = 0x2b2f36
// Folga maior que o padrão (-2.0) pra despawn por ficar atrás — ela é grande e orbita longe.
export const HORDA_PASS_BEHIND = -5.0

const HORDA_PROJECTILE_COLOR = 0xff3b30
// Um pouco mais lenta que o projétil real mais rápido do jogo hoje (Ampulheta-mega, 50u/s) —
// lasers telegrafados do Chefe/Dourado (500-600u/s) não contam, são hitscan/quase-instantâneos,
// não "projéteis que dá pra esquivar".
const HORDA_PROJECTILE_SPEED = 46
const HORDA_PROJECTILE_HIT_RADIUS = 2.6
const HORDA_PROJECTILE_MAX_RANGE = 160

const HORDA_HP_BASE = 15
const HORDA_HP_PER_LEVEL = 1
const HORDA_DAMAGE_BASE = 5
const HORDA_DAMAGE_PER_LEVEL = 1
const HORDA_SPLIT_COUNT_BASE = 5
const HORDA_SPLIT_COUNT_PER_LEVEL = 1

export const HORDA_FIRE_INTERVAL_MS = 3000 // fixo, mas ainda dividido por enemyAggression (ver index.js)
export const HORDA_SHOTS_BEFORE_LEAVE = 6

const HORDA_ORBIT_RADIUS = 12
const HORDA_ORBIT_ANGULAR_SPEED = 0.35
const HORDA_STANDOFF_FAR = 80 // distância-alvo normal (orbita "relativamente longe")
const HORDA_STANDOFF_NEAR = 45 // distância-alvo enquanto o jogador está em impulso
const HORDA_STANDOFF_CORRECTION_RATE = 0.6 // correção proporcional — funciona a qualquer velocidade de trilho

const HORDA_SPIN_SPEED = 0.6 // giro cosmético em torno do próprio eixo, não afeta hitbox/mira

export const HORDA_TURBULENCE_DURATION = 0.6 // "chacoalha" ao levar tiro sem morrer
const HORDA_TURBULENCE_MAGNITUDE = 0.35

const HORDA_SPAWN_DISTANCE_MIN = 75
const HORDA_SPAWN_DISTANCE_MAX = 85
const HORDA_BOX_X = 6
const HORDA_BOX_Y = 4

// Forma nova, ainda não usada por nenhum outro inimigo (pedido do usuário: "escolha uma forma
// aleatória não vista ainda") — um torus grande combina com a ideia de "colmeia" que se parte em
// enxame ao morrer.
const enemyGeometry = new THREE.TorusGeometry(1.3, 0.5, 12, 24)
const enemyMaterial = new THREE.MeshPhongMaterial({
  color: HORDA_COLOR,
  emissive: HORDA_EMISSIVE,
  emissiveIntensity: 0.6,
  flatShading: true,
})

// Projétil próprio — bem maior que o genérico (cone 0.35x1.4) — usa o disparo COMPARTILHADO
// (fireEnemyProjectile em index.js), só passando geometria/material/velocidade/dano/alcance
// customizados via enemy.projectileOpts.
const hordaProjectileGeometry = new THREE.ConeGeometry(0.7, 2.6, 6)
hordaProjectileGeometry.rotateX(Math.PI / 2)
const hordaProjectileMaterial = new THREE.MeshBasicMaterial({ color: HORDA_PROJECTILE_COLOR })

// HP/dano/tamanho do grupo de filhotes travam no valor do nível de dificuldade NO MOMENTO DO
// SPAWN (não recalcula ao vivo — level vem de fora, calculado em game-loop.js via
// getDifficultyLevel(), que só ele tem acesso a wrongAnswerCount/score/isNoDeck).
export function hordaStatsForLevel(level = 1) {
  const steps = Math.max(0, (level || 1) - 1)
  return {
    hp: HORDA_HP_BASE + steps * HORDA_HP_PER_LEVEL,
    damage: HORDA_DAMAGE_BASE + steps * HORDA_DAMAGE_PER_LEVEL,
    splitCount: HORDA_SPLIT_COUNT_BASE + steps * HORDA_SPLIT_COUNT_PER_LEVEL,
  }
}

function projectHordaToWorld(enemy, rail) {
  const frame = rail.getSpawnFrame()
  enemy.mesh.position.copy(frame.position)
    .addScaledVector(frame.forward, enemy.depth)
    .addScaledVector(frame.right, enemy.screenX)
    .addScaledVector(frame.up, enemy.screenY)
}

export function spawnHorda(scene, rail, id, level = 1) {
  if (rail.isArena()) return null // só existe em trilho — nunca deveria ser chamada em arena
  const stats = hordaStatsForLevel(level)
  const distanceAhead = HORDA_SPAWN_DISTANCE_MIN + Math.random() * (HORDA_SPAWN_DISTANCE_MAX - HORDA_SPAWN_DISTANCE_MIN)
  const screenX = (Math.random() * 2 - 1) * HORDA_BOX_X
  const screenY = (Math.random() * 2 - 1) * HORDA_BOX_Y

  const mesh = new THREE.Mesh(enemyGeometry, enemyMaterial)
  scene.add(mesh)

  const enemy = {
    id,
    mesh,
    kind: HORDA_KIND,
    dying: false,
    deathT: 0,
    hp: stats.hp,
    maxHp: stats.hp,
    splitCount: stats.splitCount,
    fireTimer: null,
    shotsFired: 0,
    disengaging: false,
    depth: distanceAhead,
    screenX,
    screenY,
    orbitCenterX: screenX,
    orbitCenterY: screenY,
    orbitAngle: Math.random() * Math.PI * 2,
    turbulenceTimer: 0,
    projectileOpts: {
      geometry: hordaProjectileGeometry,
      material: hordaProjectileMaterial,
      speed: HORDA_PROJECTILE_SPEED,
      hitRadius: HORDA_PROJECTILE_HIT_RADIUS,
      maxRange: HORDA_PROJECTILE_MAX_RANGE,
      damage: stats.damage,
      perfectAim: true, // "precisão perfeita no disparo" — ignora enemyAimErrorDeg
    },
  }
  projectHordaToWorld(enemy, rail)
  return enemy
}

// Movimento em trilho: órbita lateral distante do jogador, com um "controlador" proporcional que
// mantém a profundidade-alvo (mais perto durante o impulso do jogador) — usa correção
// proporcional em vez de decrementar depth numa taxa fixa, então funciona igual não importa a
// velocidade do trilho no momento. Ao desengajar (6 tiros disparados), troca pro mesmo padrão de
// fuga do Blaster (empina e acelera reto pra cima) — essa correção ativa de standoff já cumpre o
// papel da "rede de segurança PASS_BEHIND" (nunca deixa a profundidade relativa cair perto de
// zero em primeiro lugar).
export function updateHordaMovement(enemy, dt, frame, rail, boostActive) {
  if (enemy.disengaging) {
    enemy.screenY += 12.0 * dt
    enemy.depth -= 16.0 * dt
    enemy.mesh.rotation.x = -0.35
    projectHordaToWorld(enemy, rail)
    return
  }

  enemy.orbitAngle += HORDA_ORBIT_ANGULAR_SPEED * dt
  enemy.screenX = enemy.orbitCenterX + Math.cos(enemy.orbitAngle) * HORDA_ORBIT_RADIUS
  enemy.screenY = enemy.orbitCenterY + Math.sin(enemy.orbitAngle) * HORDA_ORBIT_RADIUS * 0.5

  // Correção proporcional direto em cima de `depth` (a própria variável que projectHordaToWorld
  // usa como "distância à frente do frame vivo da câmera") — nada de remedir a posição projetada
  // contra outro frame (ex.: rail.getFrameAt(0)) pra achar o "relativeForward": os dois frames não
  // são garantidamente o mesmo ponto/orientação, e comparar contra o errado gera um erro que se
  // realimenta e diverge (bug real, pego em teste: a Horda saía disparada pra longe em segundos).
  const targetStandoff = boostActive ? HORDA_STANDOFF_NEAR : HORDA_STANDOFF_FAR
  enemy.depth += (targetStandoff - enemy.depth) * HORDA_STANDOFF_CORRECTION_RATE * dt

  projectHordaToWorld(enemy, rail)

  if (enemy.turbulenceTimer > 0) {
    enemy.turbulenceTimer = Math.max(0, enemy.turbulenceTimer - dt)
    const mag = HORDA_TURBULENCE_MAGNITUDE * (enemy.turbulenceTimer / HORDA_TURBULENCE_DURATION)
    enemy.mesh.position
      .addScaledVector(frame.right, (Math.random() * 2 - 1) * mag)
      .addScaledVector(frame.up, (Math.random() * 2 - 1) * mag)
  }
}

// Giro cosmético — chamado DEPOIS do lookAt genérico do loop principal (mesmo padrão de
// updateTimeSpin), senão o lookAt sobrescreveria a rotação a cada frame.
export function updateHordaSpin(enemy, dt) {
  enemy.mesh.rotateZ(HORDA_SPIN_SPEED * dt)
}

// Hit não-letal — "chacoalha" (turbulência), efeito novo sem precedente no jogo.
export function triggerHordaTurbulence(enemy) {
  if (!enemy) return
  enemy.turbulenceTimer = HORDA_TURBULENCE_DURATION
}

export function disposeHorda() {
  enemyGeometry.dispose()
  enemyMaterial.dispose()
  hordaProjectileGeometry.dispose()
  hordaProjectileMaterial.dispose()
}
