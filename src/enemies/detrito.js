import * as THREE from 'three'
import { spawnPositionForEnemy } from './shared.js'
import { BLASTER_KILL_BONUS } from './blaster.js'

// ============ DETRITO — obstáculo cinza destrutível ============
// v0.34.0: pedido do usuário — "obstáculo" que fica surgindo aleatoriamente pelo mapa SEM seguir
// as regras de pausa/limite que os outros inimigos recebem (o timer próprio mora em main.js).
// Aqui dentro ele é só mais um `kind` normal: sem movimento nem tiro, recebe kamikaze e tiro do
// jogador pelo mesmo caminho genérico de todo mundo.
export const DETRITO_KIND = 'detrito'
export const DETRITO_COLOR = 0x9fa8da
const DETRITO_BASE_HIT_RADIUS = 1.21 // 1.10 * 1.10 (+10%)
export const DETRITO_HIT_RADIUS = DETRITO_BASE_HIT_RADIUS // mantido pra compat (index.js ainda exporta)
export const DETRITO_DEATH_DURATION = 0.2
export const DETRITO_HP = 9
export const DETRITO_KILL_BONUS = BLASTER_KILL_BONUS / 2 // bônus menor, não é alvo de combate de verdade

// bounds de spawn estilo Star Fox 64: visíveis e legíveis na pista
const SPAWN_DISTANCE_MIN = 54 // 45 * 1.2 — pedido do usuário (inimigos 20% mais distantes)
const SPAWN_DISTANCE_MAX = 96 // 80 * 1.2
const BOX_X = 11
const BOX_Y = 8
const SPIN_RATE_MIN = 0.12
const SPIN_RATE_MAX = 0.55

// ============ TIERS DE TAMANHO ============
const DETRITO_SIZE_TIERS = [0.7, 1.4, 2.5, 3.8, 5.2, 7.5]
const TITANIC_SIZE_TIERS = [10.5, 12.5, 14.0]
const DETRITO_TIER_JITTER = 0.1

function rollDetritoScale(isTitanic = false, allowGiant = true) {
  let tiers = isTitanic ? TITANIC_SIZE_TIERS : DETRITO_SIZE_TIERS
  if (!allowGiant) {
    tiers = [0.7, 1.4, 2.2, 3.2]
  }
  const base = tiers[Math.floor(Math.random() * tiers.length)]
  return base * (1 - DETRITO_TIER_JITTER + Math.random() * DETRITO_TIER_JITTER * 2)
}

const geometry = new THREE.IcosahedronGeometry(1.43, 0) // +10% maior (era 1.3)
const material = new THREE.MeshPhongMaterial({
  color: DETRITO_COLOR,
  flatShading: true,
  emissive: 0x282c34,
  emissiveIntensity: 0.35,
})
const titanicMaterial = new THREE.MeshPhongMaterial({ color: 0x8d7b72, flatShading: true, shininess: 6 })

// Não é um arquétipo enxame/atirador/miniboss limpo (obstáculo destrutível, não IA de combate) —
// escala linear como um "atirador", mas só nos não-titânicos (ver uso abaixo).
const DETRITO_HP_PER_LEVEL = 1
const DETRITO_LEVEL_HP_CAP = 15

export function spawnDetrito(scene, rail, id, opts = {}) {
  const isTitanic = !!opts.titanic
  const boxX = isTitanic ? BOX_X * 1.4 : BOX_X
  const boxY = isTitanic ? BOX_Y * 1.4 : BOX_Y
  const position = opts.position || spawnPositionForEnemy(rail, SPAWN_DISTANCE_MIN, SPAWN_DISTANCE_MAX, boxX, boxY)
  const mesh = new THREE.Mesh(geometry, isTitanic ? titanicMaterial : material)
  mesh.position.copy(position)
  // tamanho variável por spawn — respeita teto de gigantes
  const scale = opts.scale || rollDetritoScale(isTitanic, opts.allowGiant !== false)
  mesh.scale.setScalar(scale)
  // HP escala proporcionalmente com o tamanho do asteroide, mais um bônus de nível de
  // dificuldade — só pros NÃO-titânicos (pedido do plano: os titânicos já são o teto de
  // ameaça do tipo, +HP por nível ficaria redundante em cima do tamanho). Teto 15 pro total.
  const levelSteps = Math.max(0, (opts.level || 1) - 1)
  const hp = isTitanic
    ? Math.round(38 + scale * 2.4)
    : Math.min(DETRITO_LEVEL_HP_CAP, Math.max(3, Math.round(3 + scale * 3.2)) + levelSteps * DETRITO_HP_PER_LEVEL)
  // rotação inicial aleatória
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

  const isGiant = isTitanic || scale >= 4.5

  return {
    id, mesh, kind: DETRITO_KIND, dying: false, deathT: 0, hp, maxHp: hp, fireTimer: Infinity,
    scale,
    isTitanic,
    isGiant,
    driftVel,
    spinAxis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
    spinRate: (SPIN_RATE_MIN + Math.random() * (SPIN_RATE_MAX - SPIN_RATE_MIN)) * (isTitanic ? 0.4 : 1.0),
  }
}

export function spawnTitanicDetrito(scene, rail, id, opts = {}) {
  return spawnDetrito(scene, rail, id, { ...opts, titanic: true })
}

// hitbox acompanha o tamanho real do mesh (escala multiplica o raio base preciso)
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
