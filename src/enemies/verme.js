import * as THREE from 'three'
import { FORWARD_AXIS } from './shared.js'
import { ENEMY_SOUND_CUES, triggerSoundCue } from '../audio-cues.js'

// ============ VERME-CORRENTE — OVERHAUL TÁTICO E VISUAL (FASE 3) ============
// Criatura/construct segmentado e destrutível.
// Componentes:
// 1. Cabeça com mandíbula/proa e carapace
// 2. Segmentos intermediários articulados com placas dorsais e juntas visíveis
// 3. Cauda final cônica com estabilizador
// 4. Extensão lateral total (span) de exatamente 8.0 unidades
// 5. Trajetória 3D em arco (sinusoidal lateral + vertical + roll nas curvas)
// 6. Serpenteamento real via histórico de caminho amostrado pelos seguidores

export const VERME_KIND = 'verme'
export const VERME_COLOR = 0x76ff03 // Verde lima neon elétrico vibrante
export const VERME_EMISSIVE = 0x2e7d32
export const VERME_HIT_RADIUS = 1.65
export const VERME_DEATH_DURATION = 0.2
export const VERME_HP = 3 // por elo
export const VERME_KILL_BONUS = 20 // por elo
export const VERME_SPAN = 8.0 // Extensão lateral visível obrigatória

export const SEGMENT_COUNT = 4
export const SEGMENT_SPACING = 3.2
export const HEAD_SPEED = 9.0
const SPAWN_DISTANCE_MIN = 54
const SPAWN_DISTANCE_MAX = 90
const BOX_X = 5
const BOX_Y = 4

// Materiais compartilhados
const chitinMat = new THREE.MeshPhongMaterial({
  color: VERME_COLOR,
  emissive: VERME_EMISSIVE,
  emissiveIntensity: 0.8,
  flatShading: true,
})

const jointMat = new THREE.MeshPhongMaterial({
  color: 0x1b5e20,
  emissive: 0x00e676,
  emissiveIntensity: 0.95,
  flatShading: true,
})

const darkChitinMat = new THREE.MeshPhongMaterial({
  color: 0x0d3311,
  emissive: 0x051a08,
  emissiveIntensity: 0.4,
  flatShading: true,
})

const coreSensorMat = new THREE.MeshBasicMaterial({
  color: 0xccff90,
})

// Geometrias da Cabeça
const headCarapaceGeo = new THREE.ConeGeometry(1.4, 2.8, 5)
headCarapaceGeo.rotateX(Math.PI / 2)
const headMandibleGeo = new THREE.ConeGeometry(0.35, 1.8, 4)
headMandibleGeo.rotateX(Math.PI / 2)
const headFinGeo = new THREE.BoxGeometry(2.4, 0.12, 1.4)

// Geometrias dos Segmentos Intermediários
const segBodyGeo = new THREE.CylinderGeometry(1.2, 1.35, 2.2, 6)
segBodyGeo.rotateX(Math.PI / 2)
const segSpineGeo = new THREE.ConeGeometry(0.45, 1.2, 4)
const segJointGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.65, 8)
segJointGeo.rotateX(Math.PI / 2)
const segRibGeo = new THREE.BoxGeometry(2.4, 0.14, 1.2)

// Geometrias da Cauda
const tailStingerGeo = new THREE.ConeGeometry(1.0, 3.4, 5)
tailStingerGeo.rotateX(-Math.PI / 2)
const tailFinGeo = new THREE.BoxGeometry(2.4, 0.1, 1.6)

export function createVermeSegmentMesh(segmentIndex) {
  const group = new THREE.Group()

  if (segmentIndex === 0) {
    // 1. CABEÇA: Carapace, mandíbulas, aletas laterais e sensor ocular
    const carapace = new THREE.Mesh(headCarapaceGeo, chitinMat)
    carapace.position.z = 0.5
    group.add(carapace)

    const mandibleL = new THREE.Mesh(headMandibleGeo, darkChitinMat)
    mandibleL.position.set(-0.85, -0.2, 1.8)
    mandibleL.rotation.y = 0.15
    const mandibleR = new THREE.Mesh(headMandibleGeo, darkChitinMat)
    mandibleR.position.set(0.85, -0.2, 1.8)
    mandibleR.rotation.y = -0.15
    group.add(mandibleL, mandibleR)

    // Aletas laterais estendendo a largura total para exatamente 8.0 unidades
    const finL = new THREE.Mesh(headFinGeo, chitinMat)
    finL.position.set(-2.8, 0.1, 0)
    finL.rotation.z = 0.18
    const finR = new THREE.Mesh(headFinGeo, chitinMat)
    finR.position.set(2.8, 0.1, 0)
    finR.rotation.z = -0.18
    group.add(finL, finR)

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), coreSensorMat)
    eye.position.set(0, 0.45, 1.2)
    group.add(eye)
  } else if (segmentIndex === SEGMENT_COUNT - 1) {
    // 3. CAUDA FINAL: Ferrão cônico afunilado e estabilizadores laterais
    const stinger = new THREE.Mesh(tailStingerGeo, chitinMat)
    stinger.position.z = -0.6
    group.add(stinger)

    const joint = new THREE.Mesh(segJointGeo, jointMat)
    joint.position.z = 1.1
    group.add(joint)

    // Estabilizadores traseiros estendendo para span de 8.0 unidades
    const tailFinL = new THREE.Mesh(tailFinGeo, darkChitinMat)
    tailFinL.position.set(-2.8, 0, -0.3)
    tailFinL.rotation.z = -0.12
    const tailFinR = new THREE.Mesh(tailFinGeo, darkChitinMat)
    tailFinR.position.set(2.8, 0, -0.3)
    tailFinR.rotation.z = 0.12
    group.add(tailFinL, tailFinR)
  } else {
    // 2. SEGMENTOS INTERMEDIÁRIOS: Casco articulado, placas dorsais, junta e costelas
    const body = new THREE.Mesh(segBodyGeo, chitinMat)
    group.add(body)

    const spine = new THREE.Mesh(segSpineGeo, darkChitinMat)
    spine.position.set(0, 1.1, 0.2)
    group.add(spine)

    const joint = new THREE.Mesh(segJointGeo, jointMat)
    joint.position.z = 1.05
    group.add(joint)

    // Costelas laterais que atingem span de 8.0 unidades
    const ribL = new THREE.Mesh(segRibGeo, chitinMat)
    ribL.position.set(-2.8, 0.05, 0)
    ribL.rotation.z = 0.14
    const ribR = new THREE.Mesh(segRibGeo, chitinMat)
    ribR.position.set(2.8, 0.05, 0)
    ribR.rotation.z = -0.14
    group.add(ribL, ribR)
  }

  return group
}

function projectVermeHeadToWorld(enemy, rail) {
  const frame = rail.getSpawnFrame ? rail.getSpawnFrame() : rail.getFrameAt(0)
  enemy.mesh.position.copy(frame.position)
    .addScaledVector(frame.forward, enemy.depth)
    .addScaledVector(frame.right, enemy.screenX)
    .addScaledVector(frame.up, enemy.screenY)
}

const VERME_HP_PER_LEVEL = 1
const VERME_HP_CAP = 6
export function vermeStatsForLevel(level = 1) {
  const steps = Math.max(0, (level || 1) - 1)
  return { hp: Math.min(VERME_HP_CAP, VERME_HP + steps * VERME_HP_PER_LEVEL) }
}

export function spawnVerme(scene, rail, makeId, level = 1) {
  if (rail.isArena && rail.isArena()) return []
  const stats = vermeStatsForLevel(level)
  const distanceAhead = SPAWN_DISTANCE_MIN + Math.random() * (SPAWN_DISTANCE_MAX - SPAWN_DISTANCE_MIN)
  const baseScreenX = (Math.random() * 2 - 1) * BOX_X
  const baseScreenY = (Math.random() * 2 - 1) * BOX_Y
  const headPhase = Math.random() * Math.PI * 2

  const segments = []
  for (let i = 0; i < SEGMENT_COUNT; i += 1) {
    const mesh = createVermeSegmentMesh(i)
    scene.add(mesh)
    const enemy = {
      id: makeId(),
      mesh,
      kind: VERME_KIND,
      segmentIndex: i,
      dying: false,
      deathT: 0,
      hp: stats.hp,
      maxHp: stats.hp,
      fireTimer: Infinity,
      followTarget: null,
      isHead: i === 0,
      headPhase,
      flightTime: 0,
      totalTraveled: 0,
      baseScreenX,
      baseScreenY,
      screenX: baseScreenX,
      screenY: baseScreenY,
      depth: distanceAhead - i * SEGMENT_SPACING,
      pathHistory: [],
    }
    projectVermeHeadToWorld(enemy, rail)
    segments.push(enemy)
  }

  for (let i = 1; i < segments.length; i += 1) {
    segments[i].followTarget = segments[i - 1]
    segments[i].headLeader = segments[0]
  }

  return segments
}

const _vermeRel = new THREE.Vector3()
const _tangentDir = new THREE.Vector3()

export function updateVermeMovement(enemy, dt, rail) {
  if (enemy.dying) return

  // CASO 1: CABEÇA (Ou nova cabeça após seccionamento)
  if (!enemy.followTarget || enemy.followTarget.dying || !enemy.followTarget.mesh) {
    if (enemy.followTarget) {
      // Promoção a líder de sub-cadeia
      enemy.followTarget = null
      enemy.isHead = true
      const frame = rail.getSpawnFrame ? rail.getSpawnFrame() : rail.getFrameAt(0)
      const rel = _vermeRel.copy(enemy.mesh.position).sub(frame.position)
      enemy.depth = rel.dot(frame.forward)
      enemy.baseScreenX = rel.dot(frame.right)
      enemy.baseScreenY = rel.dot(frame.up)
      enemy.pathHistory = []
    }

    enemy.flightTime += dt
    const lateralOsc = Math.sin(enemy.flightTime * 1.55 + enemy.headPhase) * 6.5
    const verticalOsc = Math.cos(enemy.flightTime * 1.05 + enemy.headPhase) * 3.2

    enemy.screenX = enemy.baseScreenX + lateralOsc
    enemy.screenY = enemy.baseScreenY + verticalOsc
    enemy.depth -= HEAD_SPEED * dt
    enemy.totalTraveled += HEAD_SPEED * dt

    const frame = rail.getSpawnFrame ? rail.getSpawnFrame() : rail.getFrameAt(0)
    projectVermeHeadToWorld(enemy, rail)

    // Tangente do movimento para orientação de yaw/pitch e roll nas curvas
    const dx = 6.5 * 1.55 * Math.cos(enemy.flightTime * 1.55 + enemy.headPhase)
    const dy = -3.2 * 1.05 * Math.sin(enemy.flightTime * 1.05 + enemy.headPhase)
    const dz = -HEAD_SPEED

    _tangentDir.copy(frame.forward).multiplyScalar(dz)
      .addScaledVector(frame.right, dx)
      .addScaledVector(frame.up, dy)
      .normalize()

    if (_tangentDir.lengthSq() > 0.001) {
      enemy.mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, _tangentDir)
      const roll = -Math.cos(enemy.flightTime * 1.55 + enemy.headPhase) * 0.35
      enemy.mesh.rotateZ(roll)
    }

    // Grava histórico de caminho para os elos seguidores
    if (!enemy.pathHistory) enemy.pathHistory = []
    enemy.pathHistory.unshift({
      pos: enemy.mesh.position.clone(),
      quat: enemy.mesh.quaternion.clone(),
      dist: enemy.totalTraveled,
    })

    if (enemy.pathHistory.length > 150) {
      enemy.pathHistory.pop()
    }
    return
  }

  // CASO 2: ELO SEGUIDOR
  // Lê ponto atrasado da curva percorrida pela cabeça para serpenteamento verdadeiro
  const leader = enemy.followTarget.isHead ? enemy.followTarget : (enemy.headLeader || enemy.followTarget)
  const history = leader?.pathHistory

  if (history && history.length >= 2) {
    const targetDist = Math.max(0, leader.totalTraveled - enemy.segmentIndex * SEGMENT_SPACING)
    let s0 = history[0]
    let s1 = history[1]

    for (let i = 0; i < history.length - 1; i++) {
      if (history[i].dist >= targetDist && history[i + 1].dist <= targetDist) {
        s0 = history[i]
        s1 = history[i + 1]
        break
      }
    }

    const span = Math.max(1e-5, s0.dist - s1.dist)
    const frac = THREE.MathUtils.clamp((s0.dist - targetDist) / span, 0, 1)

    enemy.mesh.position.lerpVectors(s0.pos, s1.pos, frac)
    enemy.mesh.quaternion.slerpQuaternions(s0.quat, s1.quat, frac)
  } else {
    // Fallback elástico seguro durante os primeiros frames antes de preencher o histórico
    const target = enemy.followTarget.mesh.position
    _vermeRel.copy(target).sub(enemy.mesh.position)
    const dist = _vermeRel.length()
    if (dist > SEGMENT_SPACING) {
      enemy.mesh.position.addScaledVector(_vermeRel.normalize(), (dist - SEGMENT_SPACING) * Math.min(1, dt * 10))
    }
    if (_vermeRel.lengthSq() > 0.001) {
      enemy.mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, _vermeRel.normalize())
    }
  }
}

export function severChainAt(deadSegment, allEnemies, rail) {
  if (!deadSegment || deadSegment.chainSevered) return false
  deadSegment.chainSevered = true
  if (deadSegment?.mesh) {
    triggerSoundCue(ENEMY_SOUND_CUES.verme_segment_break, { worldPos: deadSegment.mesh.position.clone() })
  }
  const next = allEnemies.find((e) => e.kind === VERME_KIND && !e.dying && e.followTarget === deadSegment)
  if (next) {
    next.followTarget = null
    next.isHead = true
    next.headPhase = deadSegment.headPhase || 0
    next.flightTime = deadSegment.flightTime || 0
    next.totalTraveled = (deadSegment.totalTraveled || 0)
    next.pathHistory = []
    const frame = rail.getSpawnFrame ? rail.getSpawnFrame() : rail.getFrameAt(0)
    const rel = _vermeRel.copy(next.mesh.position).sub(frame.position)
    next.depth = rel.dot(frame.forward)
    next.baseScreenX = rel.dot(frame.right)
    next.baseScreenY = rel.dot(frame.up)
    next.screenX = next.baseScreenX
    next.screenY = next.baseScreenY
  }
  return true
}

export function disposeVerme() {
  headCarapaceGeo.dispose()
  headMandibleGeo.dispose()
  headFinGeo.dispose()
  segBodyGeo.dispose()
  segSpineGeo.dispose()
  segJointGeo.dispose()
  segRibGeo.dispose()
  tailStingerGeo.dispose()
  tailFinGeo.dispose()
  chitinMat.dispose()
  jointMat.dispose()
  darkChitinMat.dispose()
  coreSensorMat.dispose()
}
