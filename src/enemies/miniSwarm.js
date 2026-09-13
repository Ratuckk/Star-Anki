import * as THREE from 'three'
import { PASS_BEHIND, spawnPositionForEnemy } from './shared.js'

// ============ MINI-SWARM — fila/enxame de mini-inimigos (só modo trilho) ============
export const MINI_SWARM_KIND = 'miniSwarm'
const MINI_ENEMY_SCALE = 0.7 // 30% menor que o blaster normal
const MINI_ENEMY_HIT_RADIUS = 1.8 * MINI_ENEMY_SCALE
const MINI_SWARM_MIN_COUNT = 5
const MINI_SWARM_MAX_COUNT = 10
const MINI_SWARM_SPACING = 2
const MINI_SWARM_PATROL_SPEED = 28
const MINI_SWARM_PATROL_AMPLITUDE = 10
const MINI_SWARM_PATROL_DURATION_MIN = 1.6
const MINI_SWARM_PATROL_DURATION_MAX = 2.8
const MINI_SWARM_DIVE_SPEED = 55
const MINI_SWARM_DIVE_SPREAD = 7
const MINI_SWARM_DIVE_MAX_S = 3
const BLASTER_SPAWN_DISTANCE_MIN = 90
const BLASTER_SPAWN_DISTANCE_MAX = 140
const BLASTER_BOX_X = 7
const BLASTER_BOX_Y = 5

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
      diveTarget: null,
      diveElapsed: 0,
      diveAnglePhase: Math.random() * Math.PI * 2,
    })
  }
  return group
}

// patrulha balançando de um lado a outro por um tempo, depois mergulha em direção a um ponto
// perto do jogador — reto (straight), em zigue-zague (zigzag) ou em hélice (spiral), conforme a
// variante sorteada no spawn. Nunca atira. Remove sozinho (não usa o pass-behind genérico do
// loop principal porque tem seu próprio teto de tempo de mergulho).
export function updateMiniSwarm(enemy, dt, ctx) {
  const { playerPosition, frame, elapsed, removeEnemy } = ctx
  if (enemy.swarmState === 'patrol') {
    enemy.patrolTimer -= dt
    const wobble = Math.sin(elapsed * 2 + enemy.patrolPhase) * MINI_SWARM_PATROL_AMPLITUDE
    const pos = enemy.patrolBase.clone().addScaledVector(frame.right, enemy.formationOffset + wobble)
    enemy.mesh.position.lerp(pos, Math.min(1, MINI_SWARM_PATROL_SPEED * dt * 0.3))
    enemy.mesh.lookAt(playerPosition)
    if (enemy.patrolTimer <= 0) {
      enemy.swarmState = 'dive'
      const spread = (Math.random() * 2 - 1) * MINI_SWARM_DIVE_SPREAD
      enemy.diveTarget = playerPosition.clone().addScaledVector(frame.right, spread)
    }
    return
  }

  enemy.diveElapsed += dt
  const toTarget = enemy.diveTarget.clone().sub(enemy.mesh.position)
  if (toTarget.lengthSq() > 1e-4) {
    toTarget.normalize()
    if (enemy.variant === 'zigzag') {
      const lateral = Math.sin(enemy.diveAnglePhase + elapsed * ZIGZAG_FREQUENCY) * ZIGZAG_AMPLITUDE
      toTarget.addScaledVector(frame.right, lateral * dt)
    } else if (enemy.variant === 'spiral') {
      enemy.diveAnglePhase += SPIRAL_ANGULAR_SPEED * dt
      const spiralOffset = new THREE.Vector3()
        .addScaledVector(frame.right, Math.cos(enemy.diveAnglePhase) * SPIRAL_RADIUS)
        .addScaledVector(frame.up, Math.sin(enemy.diveAnglePhase) * SPIRAL_RADIUS)
      toTarget.add(spiralOffset.multiplyScalar(dt))
    }
    toTarget.normalize()
    enemy.mesh.position.addScaledVector(toTarget, MINI_SWARM_DIVE_SPEED * dt)
    enemy.mesh.lookAt(enemy.mesh.position.clone().add(toTarget))
  }
  const relative = enemy.mesh.position.clone().sub(frame.position)
  if (enemy.diveElapsed > MINI_SWARM_DIVE_MAX_S || relative.dot(frame.forward) < PASS_BEHIND) {
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
