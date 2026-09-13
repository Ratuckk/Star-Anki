import * as THREE from 'three'
import { spawnPositionForEnemy } from './shared.js'

// ============ VERME-CORRENTE — cadeia de elos, só trilho ============
// pedido do usuário: inimigo segmentado tipo cobra, cada elo atingível separadamente; destruir
// um elo do MEIO faz tudo que seguia ele virar uma cadeia independente (o elo seguinte assume
// como "cabeça" e passa a avançar sozinho). Cada elo é uma entrada COMUM no array de inimigos
// (mesmo hp/hit/morte genéricos de sempre) — a única coisa nova é o campo `followTarget`
// (referência a outro elo) e a função de resolver o corte, chamada pelo orquestrador na morte
// de qualquer elo.
export const VERME_KIND = 'verme'
export const VERME_COLOR = 0x7a9c3f
export const VERME_HIT_RADIUS = 1.4
export const VERME_DEATH_DURATION = 0.2
export const VERME_HP = 3 // por elo
export const VERME_KILL_BONUS = 20 // por elo

const SEGMENT_COUNT = 4
const SEGMENT_SPACING = 2.6
const HEAD_SPEED = 7
const FOLLOW_LAG = 0.15 // segundos "de corrente puxando" — cada elo converge pro espaçamento nesse ritmo
const SPAWN_DISTANCE_MIN = 100
const SPAWN_DISTANCE_MAX = 140
const BOX_X = 5
const BOX_Y = 4

const geometry = new THREE.SphereGeometry(1, 8, 6)
const material = new THREE.MeshPhongMaterial({ color: VERME_COLOR, flatShading: true, emissive: 0x1a2e08, emissiveIntensity: 0.5 })

// spawna a cadeia inteira já como entradas independentes e comuns — hit/dano/morte reaproveitam
// 100% o pipeline padrão de inimigo, sem nenhum caso especial no hit-test
export function spawnVerme(scene, rail, makeId) {
  if (rail.isArena()) return []
  const basePos = spawnPositionForEnemy(rail, SPAWN_DISTANCE_MIN, SPAWN_DISTANCE_MAX, BOX_X, BOX_Y)
  const frame = rail.getFrameAt(0)
  const segments = []
  for (let i = 0; i < SEGMENT_COUNT; i += 1) {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(basePos).addScaledVector(frame.forward, i * SEGMENT_SPACING)
    scene.add(mesh)
    segments.push({
      id: makeId(), mesh, kind: VERME_KIND, dying: false, deathT: 0, hp: VERME_HP, maxHp: VERME_HP, fireTimer: Infinity,
      followTarget: null,
    })
  }
  for (let i = 1; i < segments.length; i += 1) segments[i].followTarget = segments[i - 1]
  return segments
}

export function updateVermeMovement(enemy, dt, frame) {
  if (!enemy.followTarget) {
    // cabeça de verdade, ou virou cabeça de uma sub-cadeia nova após um corte no meio
    enemy.mesh.position.addScaledVector(frame.forward, -HEAD_SPEED * dt)
    return
  }
  const target = enemy.followTarget.mesh.position
  const toTarget = target.clone().sub(enemy.mesh.position)
  const dist = toTarget.length()
  if (dist > SEGMENT_SPACING) {
    enemy.mesh.position.addScaledVector(toTarget.normalize(), (dist - SEGMENT_SPACING) * Math.min(1, dt / FOLLOW_LAG))
  }
}

// chamado pelo orquestrador sempre que QUALQUER elo morre (cabeça ou meio) — o elo que seguia o
// destruído passa a avançar sozinho (`followTarget = null`), virando cabeça de uma cadeia nova e
// independente. Elos à frente do destruído (que ele mesmo seguia) não mudam em nada.
export function severChainAt(deadSegment, allEnemies) {
  const next = allEnemies.find((e) => e.kind === VERME_KIND && !e.dying && e.followTarget === deadSegment)
  if (next) next.followTarget = null
}

export function disposeVerme() {
  geometry.dispose()
  material.dispose()
}
