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

// ============ 6 TIERS DE TAMANHO (v0.54.0) ============
// 6 categorias bem distintas: microfragmento (0.7), pequeno (1.4), médio (2.5),
// grande (4.0), enorme (5.8) e mega-asteroide (8.2), com jitter de ±10%.
const DETRITO_SIZE_TIERS = [0.7, 1.4, 2.5, 4.0, 5.8, 8.2]
const DETRITO_TIER_JITTER = 0.1

function rollDetritoScale() {
  const base = DETRITO_SIZE_TIERS[Math.floor(Math.random() * DETRITO_SIZE_TIERS.length)]
  return base * (1 - DETRITO_TIER_JITTER + Math.random() * DETRITO_TIER_JITTER * 2)
}

const geometry = new THREE.IcosahedronGeometry(1.3, 0)
const material = new THREE.MeshPhongMaterial({ color: DETRITO_COLOR, flatShading: true })

export function spawnDetrito(scene, rail, id) {
  const position = spawnPositionForEnemy(rail, SPAWN_DISTANCE_MIN, SPAWN_DISTANCE_MAX, BOX_X, BOX_Y)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(position)
  // tamanho variável por spawn — cada detrito tem seu próprio tamanho entre os 6 tiers
  const scale = rollDetritoScale()
  mesh.scale.setScalar(scale)
  // HP escala proporcionalmente com o tamanho do asteroide
  const hp = Math.max(3, Math.round(3 + scale * 3.2))
  // rotação inicial aleatória — cada detrito nasce virado diferente
  mesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2)
  scene.add(mesh)
  return {
    id, mesh, kind: DETRITO_KIND, dying: false, deathT: 0, hp, maxHp: hp, fireTimer: Infinity,
    scale, // guardado pra hitbox e animação de morte escalarem junto
    spinAxis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
    spinRate: SPIN_RATE_MIN + Math.random() * (SPIN_RATE_MAX - SPIN_RATE_MIN),
  }
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
}
