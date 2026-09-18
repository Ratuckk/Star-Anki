import * as THREE from 'three'
import { ENEMY_SOUND_CUES, triggerSoundCue } from '../audio-cues.js'

// ============ VERME-CORRENTE — cadeia de elos, só trilho ============
// pedido do usuário: inimigo segmentado tipo cobra, cada elo atingível separadamente; destruir
// um elo do MEIO faz tudo que seguia ele virar uma cadeia independente (o elo seguinte assume
// como "cabeça" e passa a avançar sozinho). Cada elo é uma entrada COMUM no array de inimigos
// (mesmo hp/hit/morte genéricos de sempre) — a única coisa nova é o campo `followTarget`
// (referência a outro elo) e a função de resolver o corte, chamada pelo orquestrador na morte
// de qualquer elo.
export const VERME_KIND = 'verme'
export const VERME_COLOR = 0x76ff03 // Verde lima neon elétrico vibrante
export const VERME_HIT_RADIUS = 1.54 // 1.4 * 1.10 (+10%)
export const VERME_DEATH_DURATION = 0.2
export const VERME_HP = 3 // por elo
export const VERME_KILL_BONUS = 20 // por elo

const SEGMENT_COUNT = 4
const SEGMENT_SPACING = 2.86 // 2.6 * 1.10
const HEAD_SPEED = 7
const FOLLOW_LAG = 0.15 // segundos "de corrente puxando" — cada elo converge pro espaçamento nesse ritmo
// Pedido do usuário: estilo Star Fox 64 — surge visível a 45-75u (atualizado +20%, ver pedido
// "inimigos no mínimo 20% mais distantes")
const SPAWN_DISTANCE_MIN = 54 // 45 * 1.2
const SPAWN_DISTANCE_MAX = 90 // 75 * 1.2
const BOX_X = 5
const BOX_Y = 4

// Esfera +10% maior (raio 1.1)
const geometry = new THREE.SphereGeometry(1.1, 8, 6)
const material = new THREE.MeshPhongMaterial({
  color: VERME_COLOR,
  flatShading: true,
  emissive: 0x2e7d32,
  emissiveIntensity: 0.75,
})

// v0.51.11: só a CABEÇA (elo sem followTarget) precisa do modelo profundidade+tela — ela é a
// única que avança sozinha ao longo de `frame.forward`, e acumular isso por vários segundos
// sobre o frame da CURVA (que gira com o trilho) causava deriva lateral, igual blaster/sussurro.
// Os elos que SEGUEM outro elo (a maioria) já perseguem uma posição de mundo real (o elo da
// frente), então não precisam disso — ficam como sempre foram.
function projectVermeHeadToWorld(enemy, rail) {
  const frame = rail.getSpawnFrame()
  enemy.mesh.position.copy(frame.position)
    .addScaledVector(frame.forward, enemy.depth)
    .addScaledVector(frame.right, enemy.screenX)
    .addScaledVector(frame.up, enemy.screenY)
}

// spawna a cadeia inteira já como entradas independentes e comuns — hit/dano/morte reaproveitam
// 100% o pipeline padrão de inimigo, sem nenhum caso especial no hit-test
export function spawnVerme(scene, rail, makeId) {
  if (rail.isArena()) return []
  const distanceAhead = SPAWN_DISTANCE_MIN + Math.random() * (SPAWN_DISTANCE_MAX - SPAWN_DISTANCE_MIN)
  const screenX = (Math.random() * 2 - 1) * BOX_X
  const screenY = (Math.random() * 2 - 1) * BOX_Y
  const segments = []
  for (let i = 0; i < SEGMENT_COUNT; i += 1) {
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)
    const enemy = {
      id: makeId(), mesh, kind: VERME_KIND, dying: false, deathT: 0, hp: VERME_HP, maxHp: VERME_HP, fireTimer: Infinity,
      followTarget: null,
      // profundidade decrescente por elo (i=0 é o mais à frente/cabeça) — mesmo screenX/screenY
      // pra todos, já que nascem alinhados na mesma linha reta
      depth: distanceAhead - i * SEGMENT_SPACING, screenX, screenY,
    }
    projectVermeHeadToWorld(enemy, rail)
    segments.push(enemy)
  }
  for (let i = 1; i < segments.length; i += 1) segments[i].followTarget = segments[i - 1]
  return segments
}

const _vermeRel = new THREE.Vector3()

export function updateVermeMovement(enemy, dt, rail) {
  if (!enemy.followTarget || enemy.followTarget.dying || !enemy.followTarget.mesh) {
    // cabeça de verdade, ou virou cabeça de uma sub-cadeia nova após um corte no meio
    if (enemy.followTarget) {
      enemy.followTarget = null
      const frame = rail.getSpawnFrame()
      const rel = _vermeRel.copy(enemy.mesh.position).sub(frame.position)
      enemy.depth = rel.dot(frame.forward)
      enemy.screenX = rel.dot(frame.right)
      enemy.screenY = rel.dot(frame.up)
    }
    enemy.depth -= HEAD_SPEED * dt
    projectVermeHeadToWorld(enemy, rail)
    return
  }
  const target = enemy.followTarget.mesh.position
  _vermeRel.copy(target).sub(enemy.mesh.position)
  const dist = _vermeRel.length()
  if (dist > SEGMENT_SPACING) {
    enemy.mesh.position.addScaledVector(_vermeRel.normalize(), (dist - SEGMENT_SPACING) * Math.min(1, dt / FOLLOW_LAG))
  }
}

// chamado pelo orquestrador sempre que QUALQUER elo morre (cabeça ou meio) — o elo que seguia o
// destruído passa a avançar sozinho (`followTarget = null`), virando cabeça de uma cadeia nova e
// independente. Elos à frente do destruído (que ele mesmo seguia) não mudam em nada.
//
// `depth`/`screenX`/`screenY` desse elo são de quando a cadeia INTEIRA nasceu — se ele virar
// cabeça agora sem atualizar isso, `projectVermeHeadToWorld` (chamado no próximo
// updateVermeMovement) ia usar esses valores velhos e TELEPORTAR ele de volta pra posição de
// spawn. Recalcula os 3 números a partir da posição ATUAL dele, projetada na base da câmera
// deste instante — vira cabeça exatamente de onde já estava, sem pulo.
export function severChainAt(deadSegment, allEnemies, rail) {
  if (deadSegment?.mesh) {
    triggerSoundCue(ENEMY_SOUND_CUES.verme_segment_break, { worldPos: deadSegment.mesh.position.clone() })
  }
  const next = allEnemies.find((e) => e.kind === VERME_KIND && !e.dying && e.followTarget === deadSegment)
  if (next) {
    next.followTarget = null
    const frame = rail.getSpawnFrame()
    const rel = _vermeRel.copy(next.mesh.position).sub(frame.position)
    next.depth = rel.dot(frame.forward)
    next.screenX = rel.dot(frame.right)
    next.screenY = rel.dot(frame.up)
  }
}

export function disposeVerme() {
  geometry.dispose()
  material.dispose()
}
