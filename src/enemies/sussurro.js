import * as THREE from 'three'
import { spawnPositionForEnemy } from './shared.js'

// ============ SUSSURRO — batedor que invoca reforços, só trilho ============
// Overhaul (v0.50.0): a entrega anterior tinha o Sussurro como "objeto quase invisível que
// invoca uma vez e some". O usuário reportou que ele "só existe no jogo" — sem arco, sem
// payoff, sem razão pra o jogador priorizá-lo. Reescrito com um ciclo de vida explícito de
// 8s dividido em 3 fases com visual e comportamento próprios:
//
//   HIDDEN (4s)   quase invisível, avança devagar com drift errático
//   BEACON (2s)   TELEGRAPH — brilha azul-elétrico, pulsa, chargeCircle converge nele.
//                 O jogador tem 2s pra reagir (é a janela de decisão).
//   FADING (2s)   disparou o summon (3 Blasters de uma vez); recua rápido e some.
//
// Recompensa por matar cedo: HP 2→3, bônus 25→50. Matar durante BEACON cancela a wave toda.
// Pass-behind desabilitado — o Sussurro tem vida própria e não é despawnado por passar pra
// trás do jogador (ver sussurroPassBehind).

export const SUSSURRO_KIND = 'sussurro'
export const SUSSURRO_COLOR = 0xc7ccd4          // cinza-frio (fase HIDDEN)
export const SUSSURRO_BEACON_COLOR = 0x4dc7ff   // azul-elétrico (fase BEACON/FADING)
export const SUSSURRO_HIT_RADIUS = 1.6
export const SUSSURRO_DEATH_DURATION = 0.2
export const SUSSURRO_HP = 3                    // era 2
export const SUSSURRO_KILL_BONUS = 50           // era 25

// estados
export const SUSSURRO_STATE_HIDDEN = 'hidden'
export const SUSSURRO_STATE_BEACON = 'beacon'
export const SUSSURRO_STATE_FADING = 'fading'
export const SUSSURRO_STATE_GONE = 'gone'

const SPAWN_DISTANCE_MIN = 100
const SPAWN_DISTANCE_MAX = 150
const BOX_X = 7
const BOX_Y = 5

// ============ TIMING DAS FASES ============
// 4s + 2s + 2s = 8s totais. A duração de HIDDEN dá espaço pra o jogador nem perceber que ele
// existe; os 2s de BEACON são a janela de reação (o telegraph que faltava); FADING é curto
// porque o payoff (o summon) já aconteceu.
const SUSSURRO_HIDDEN_MS = 4000
const SUSSURRO_BEACON_MS = 2000
const SUSSURRO_FADING_MS = 2000

// ============ VELOCIDADE POR FASE ============
// HIDDEN e BEACON avançam devagar (o Sussurro é um batedor, não um kamikaze). FADING recua
// RÁPIDO — o inimigo "foge" com o trabalho feito, o que faz sentido narrativamente e lê bem
// visualmente (a nave ganha distância enquanto desvanece).
const SUSSURRO_HIDDEN_SPEED = 5
const SUSSURRO_BEACON_SPEED = 2
const SUSSURRO_FADE_SPEED = 40

// ============ VISUAL POR FASE ============
const SUSSURRO_HIDDEN_OPACITY = 0.1
const SUSSURRO_BEACON_OPACITY_MIN = 0.5
const SUSSURRO_BEACON_OPACITY_MAX = 0.9
const SUSSURRO_BEACON_PULSE_RATE = 15 // rad/s

// drift lateral errático — dá a sensação de "está tateando" em vez de ir reto como uma flecha.
// Mais forte no BEACON (ele "se planta" pra carregar, com mais movimento lateral).
const DRIFT_SPEED = 0.6
const DRIFT_PHASE_RATE = 2.5

const geometry = new THREE.OctahedronGeometry(1.1, 0)
const baseMaterial = new THREE.MeshBasicMaterial({
  color: SUSSURRO_COLOR, transparent: true, opacity: SUSSURRO_HIDDEN_OPACITY,
})

export function spawnSussurro(scene, rail, id) {
  if (rail.isArena()) return null
  const position = spawnPositionForEnemy(rail, SPAWN_DISTANCE_MIN, SPAWN_DISTANCE_MAX, BOX_X, BOX_Y)
  // material clonado por instância — cada Sussurro tem sua própria opacidade/cor, sem interferir
  // um no outro (mesmo padrão da entrega anterior)
  const mesh = new THREE.Mesh(geometry, baseMaterial.clone())
  mesh.position.copy(position)
  scene.add(mesh)
  return {
    id, mesh, kind: SUSSURRO_KIND, dying: false, deathT: 0,
    hp: SUSSURRO_HP, maxHp: SUSSURRO_HP, fireTimer: Infinity,
    state: SUSSURRO_STATE_HIDDEN,
    ageMs: 0,
    stateAgeMs: 0,
    driftPhase: Math.random() * Math.PI * 2,
    shouldSummon: false,
  }
}

export function updateSussurro(enemy, dt, frame, rail, effects) {
  enemy.ageMs += dt * 1000
  enemy.stateAgeMs += dt * 1000
  enemy.driftPhase += dt * DRIFT_PHASE_RATE

  // ============ TRANSIÇÕES DE ESTADO ============
  if (enemy.state === SUSSURRO_STATE_HIDDEN && enemy.ageMs >= SUSSURRO_HIDDEN_MS) {
    enemy.state = SUSSURRO_STATE_BEACON
    enemy.stateAgeMs = 0
    // chargeCircle (mesmo efeito do laser do chefe) acompanha a posição do Sussurro via
    // closure — o anel de telegraph fica em cima dele durante os 2s inteiros, mesmo com o
    // drift lateral. Reaproveitado pra não inventar um efeito novo.
    if (effects) {
      effects.chargeCircle(() => enemy.mesh.position, SUSSURRO_BEACON_MS / 1000, SUSSURRO_BEACON_COLOR)
    }
  } else if (enemy.state === SUSSURRO_STATE_BEACON && enemy.stateAgeMs >= SUSSURRO_BEACON_MS) {
    enemy.state = SUSSURRO_STATE_FADING
    enemy.stateAgeMs = 0
    enemy.shouldSummon = true // consumido por sussurroShouldSummon no próximo tick do orquestrador
    if (effects) {
      // o payoff visual: shockwave grande + burst no ponto exato onde o summon acontece
      effects.shockwave(enemy.mesh.position.clone(), SUSSURRO_BEACON_COLOR, 1.5)
      effects.explosion(enemy.mesh.position.clone(), SUSSURRO_BEACON_COLOR, 1.0)
    }
  } else if (enemy.state === SUSSURRO_STATE_FADING && enemy.stateAgeMs >= SUSSURRO_FADING_MS) {
    enemy.state = SUSSURRO_STATE_GONE
  }

  // ============ MOVIMENTO POR ESTADO ============
  const driftX = Math.sin(enemy.driftPhase) * DRIFT_SPEED
  const driftY = Math.cos(enemy.driftPhase * 1.3) * DRIFT_SPEED * 0.6

  if (enemy.state === SUSSURRO_STATE_HIDDEN) {
    enemy.mesh.position.addScaledVector(frame.forward, -SUSSURRO_HIDDEN_SPEED * dt)
    enemy.mesh.position.addScaledVector(frame.right, driftX * dt)
    enemy.mesh.position.addScaledVector(frame.up, driftY * dt)
  } else if (enemy.state === SUSSURRO_STATE_BEACON) {
    // avanço quase parado + drift mais forte: ele está "se plantando" pra carregar o summon
    enemy.mesh.position.addScaledVector(frame.forward, -SUSSURRO_BEACON_SPEED * dt)
    enemy.mesh.position.addScaledVector(frame.right, driftX * 1.8 * dt)
    enemy.mesh.position.addScaledVector(frame.up, driftY * 1.8 * dt)
  } else if (enemy.state === SUSSURRO_STATE_FADING) {
    // recua reto pra frente (sem drift) — leitura limpa de "fugindo com o trabalho feito"
    enemy.mesh.position.addScaledVector(frame.forward, SUSSURRO_FADE_SPEED * dt)
  }

  // ============ VISUAL POR ESTADO ============
  const mat = enemy.mesh.material
  if (enemy.state === SUSSURRO_STATE_HIDDEN) {
    mat.opacity = SUSSURRO_HIDDEN_OPACITY
    mat.color.set(SUSSURRO_COLOR)
  } else if (enemy.state === SUSSURRO_STATE_BEACON) {
    // pulso rápido entre MIN e MAX — a "batida" do beacon
    const pulseT = 0.5 + 0.5 * Math.sin(enemy.stateAgeMs * 0.001 * SUSSURRO_BEACON_PULSE_RATE)
    mat.opacity = SUSSURRO_BEACON_OPACITY_MIN
      + (SUSSURRO_BEACON_OPACITY_MAX - SUSSURRO_BEACON_OPACITY_MIN) * pulseT
    mat.color.set(SUSSURRO_BEACON_COLOR)
  } else if (enemy.state === SUSSURRO_STATE_FADING) {
    const t = enemy.stateAgeMs / SUSSURRO_FADING_MS
    mat.opacity = SUSSURRO_BEACON_OPACITY_MAX * (1 - t)
    mat.color.set(SUSSURRO_BEACON_COLOR)
  }

  // rotação constante por vida visual (mesmo padrão dos outros inimigos sem frente/trás)
  enemy.mesh.rotation.y += dt * 1.2
  enemy.mesh.rotation.x += dt * 0.5
}

// true só na exata transição BEACON→FADING (o orquestrador spawna a wave e o flag é consumido)
export function sussurroShouldSummon(enemy) {
  if (!enemy.shouldSummon) return false
  enemy.shouldSummon = false
  return true
}

// true quando o Sussurro já cumpriu o ciclo completo (summon + fade) — o orquestrador remove
// ele do array. IMPORTANTE: isto é diferente de "morreu" — a remoção por aqui não dispara
// animação de morte, o Sussurro simplesmente "some" (já está com opacidade ~0 nesse ponto).
export function sussurroShouldDespawn(enemy) {
  return enemy.state === SUSSURRO_STATE_GONE
}

// Pass-behind desabilitado: o Sussurro tem um ciclo de vida fixo de 8s e não deve ser
// despawnado por "passar pra trás do jogador" no meio dele (isso aconteceria se o jogador
// estivesse usando impulso, e cancelaria o summon sem aviso). Ele só termina por fim de estado.
export function sussurroPassBehind() {
  return -9999
}

export function disposeSussurro() {
  geometry.dispose()
  baseMaterial.dispose()
}
