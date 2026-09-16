import * as THREE from 'three'
import { spawnPositionForEnemy } from './shared.js'
import { BLASTER_KILL_BONUS } from './blaster.js'

// ============ DETRITO — obstáculo cinza destrutível ============
// v0.34.0: pedido do usuário — "obstáculo" que fica surgindo aleatoriamente pelo mapa SEM seguir
// as regras de pausa/limite que os outros inimigos recebem (o timer próprio mora em main.js).
// Aqui dentro ele é só mais um `kind` normal: sem movimento nem tiro, recebe kamikaze e tiro do
// jogador pelo mesmo caminho genérico de todo mundo.
export const DETRITO_KIND = 'detrito'
export const DETRITO_COLOR = 0x888888
// hit radius base — escala junto com o tamanho do mesh (ver detritoHitRadius abaixo). Antes era
// fixo, então detrito pequeno/grande tinha o mesmo alcance de colisão, o que ficava esquisito
// depois que a variação de tamanho entrou.
const DETRITO_BASE_HIT_RADIUS = 1.9
export const DETRITO_HIT_RADIUS = DETRITO_BASE_HIT_RADIUS // mantido pra compat (index.js ainda exporta)
export const DETRITO_DEATH_DURATION = 0.2
export const DETRITO_HP = 9
export const DETRITO_KILL_BONUS = BLASTER_KILL_BONUS / 2 // bônus menor, não é alvo de combate de verdade

// pedido do usuário (v0.54.0): bounds de spawn mais amplos para comportar até 10 detritos
const SPAWN_DISTANCE_MIN = 50
const SPAWN_DISTANCE_MAX = 160
const BOX_X = 11
const BOX_Y = 8
const SPIN_RATE_MIN = 0.12
const SPIN_RATE_MAX = 0.55

// ============ 6 TIERS DE TAMANHO (v0.54.0) + TIERS TITÂNICOS (v0.57.0) ============
// 6 categorias normais: microfragmento (0.7), pequeno (1.4), médio (2.5),
// grande (4.0), enorme (5.8) e mega-asteroide (8.2), com jitter de ±10%.
// Categoria Titânica para tempestades de detritos: colossos de 11.0 a 15.0!
const DETRITO_SIZE_TIERS = [0.7, 1.4, 2.5, 4.0, 5.8, 8.2]
const TITANIC_SIZE_TIERS = [11.0, 13.2, 15.0]
const DETRITO_TIER_JITTER = 0.1

function rollDetritoScale(isTitanic = false) {
  const tiers = isTitanic ? TITANIC_SIZE_TIERS : DETRITO_SIZE_TIERS
  const base = tiers[Math.floor(Math.random() * tiers.length)]
  return base * (1 - DETRITO_TIER_JITTER + Math.random() * DETRITO_TIER_JITTER * 2)
}

const geometry = new THREE.IcosahedronGeometry(1.3, 0)
const material = new THREE.MeshPhongMaterial({ color: DETRITO_COLOR, flatShading: true })
const titanicMaterial = new THREE.MeshPhongMaterial({ color: 0x6e615a, flatShading: true, shininess: 6 })

export function spawnDetrito(scene, rail, id, opts = {}) {
  const isTitanic = !!opts.titanic
  const boxX = isTitanic ? BOX_X * 1.4 : BOX_X
  const boxY = isTitanic ? BOX_Y * 1.4 : BOX_Y
  const position = opts.position || spawnPositionForEnemy(rail, SPAWN_DISTANCE_MIN, SPAWN_DISTANCE_MAX, boxX, boxY)
  const mesh = new THREE.Mesh(geometry, isTitanic ? titanicMaterial : material)
  mesh.position.copy(position)
  // tamanho variável por spawn — cada detrito tem seu próprio tamanho entre os tiers
  const scale = opts.scale || rollDetritoScale(isTitanic)
  mesh.scale.setScalar(scale)
  // HP escala proporcionalmente com o tamanho do asteroide
  const hp = isTitanic
    ? Math.round(38 + scale * 2.4) // ~64 a ~74 HP para titânicos
    : Math.max(3, Math.round(3 + scale * 3.2))
  // rotação inicial aleatória — cada detrito nasce virado diferente
  mesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2)
  scene.add(mesh)

  // Velocidade de deriva (física de chuva/tempestade)
  let driftVel = null
  if (opts.driftVel) {
    driftVel = opts.driftVel.clone()
  } else if (opts.drift) {
    const forward = rail.getFrameAt(0).forward
    const right = rail.getFrameAt(0).right
    const up = rail.getFrameAt(0).up
    driftVel = right.clone().multiplyScalar((Math.random() - 0.5) * 16)
      .addScaledVector(up, (Math.random() - 0.5) * 12)
      .addScaledVector(forward, isTitanic ? -5 : (Math.random() - 0.5) * 10)
  }

  return {
    id, mesh, kind: DETRITO_KIND, dying: false, deathT: 0, hp, maxHp: hp, fireTimer: Infinity,
    scale, // guardado pra hitbox e animação de morte escalarem junto
    isTitanic,
    driftVel,
    spinAxis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
    spinRate: (SPIN_RATE_MIN + Math.random() * (SPIN_RATE_MAX - SPIN_RATE_MIN)) * (isTitanic ? 0.4 : 1.0),
  }
}

export function spawnTitanicDetrito(scene, rail, id, opts = {}) {
  return spawnDetrito(scene, rail, id, { ...opts, titanic: true })
}

// hitbox acompanha o tamanho real do mesh (escala multiplica o raio base)
export function detritoHitRadius(enemy) {
  return DETRITO_BASE_HIT_RADIUS * (enemy.scale ?? 1)
}

// giro lento e constante só por vida visual — sem lookAt (não "encara" o jogador, é um objeto
// inerte flutuando, não uma nave)
export function updateDetritoSpin(enemy, dt) {
  enemy.mesh.rotateOnAxis(enemy.spinAxis, enemy.spinRate * dt)
}

export function disposeDetrito() {
  geometry.dispose()
  material.dispose()
  titanicMaterial.dispose()
}
