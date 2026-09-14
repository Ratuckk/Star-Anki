import * as THREE from 'three'
import { distanceToSegment, randomSpawnPositionOnPath } from '../enemies/shared.js'

// ============ ALVOS NEUTROS — bônus (asteroide) + orbes-pergunta do chefe ============

const BONUS_COLOR = 0x2bff6b
// Distância TRAVADA (era 90-140). Se a distância varia muito, um asteroide pequeno perto fica
// do mesmo tamanho aparente que um grande longe — a variação de escala se anula na percepção.
// Com 100-115, o tamanho na tela É o scale, praticamente puro.
const BONUS_SPAWN_DISTANCE_MIN = 100
const BONUS_SPAWN_DISTANCE_MAX = 115
const BONUS_BOX_X = 7
const BONUS_BOX_Y = 5
const BONUS_HIT_RADIUS = 1.6
const BONUS_HIT_RADIUS_MIN = 0.75
const BONUS_DEATH_DURATION = 0.2
const BONUS_KILL_BONUS = 50

// ============ TIERS DE TAMANHO ============
// 3 categorias discretas, 1/3 de chance cada. 0.5 / 1.0 / 2.0 com ±10% de jitter dentro de cada
// tier — "pequeno / médio / grande" é óbvio ao olho; a distribuição contínua antiga (0.7-1.6,
// enviesada pro meio) amontoava tudo em ~1.1 e a percepção virava "sempre igual".
const BONUS_SIZE_TIERS = [0.5, 1.0, 2.0]
const BONUS_TIER_JITTER = 0.1

function rollBonusScale() {
  const base = BONUS_SIZE_TIERS[Math.floor(Math.random() * BONUS_SIZE_TIERS.length)]
  return base * (1 - BONUS_TIER_JITTER + Math.random() * BONUS_TIER_JITTER * 2)
}

// ============ GEOMETRIA POR SPAWN ============
// Antes era UMA geometria compartilhada pela sessão inteira (criada uma vez em
// createTargetsSystem) — todos os asteroides tinham o MESMO formato, só mudavam de escala. Isso
// lê como "o mesmo objeto em tamanhos diferentes", não como "asteroides variados". Agora cada
// spawn tem sua PRÓPRIA forma: icosaedro com deslocamento aleatório por vértice. Não é caro —
// são ~20 vértices e no máximo 1-2 asteroides vivos por vez. Precisa ser disposado no
// removeBonusTarget pra não vazar GPU memory.
function makeBonusGeometry() {
  const geo = new THREE.IcosahedronGeometry(1.1, 1)
  const pos = geo.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i)
    const n = v.clone().normalize()
    // deslocamento maior que antes (era 0.4) — dá pra ver claramente que cada pedra é diferente
    v.addScaledVector(n, (Math.random() - 0.5) * 0.7)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  return geo
}

const PASS_BEHIND = -4

const BOSS_ORB_HIT_RADIUS = 2.2
const BOSS_ORB_DEATH_DURATION = 0.2
const BOSS_ORB_COLOR = 0xffd166
const BOSS_TARGET_ELEVATION_MAX = THREE.MathUtils.degToRad(50)

export function createTargetsSystem(scene, rail, effects) {
  const bonusTargets = []
  const bossOrbs = []
  let elapsed = 0

  const bonusMaterial = new THREE.MeshPhongMaterial({
    color: BONUS_COLOR, flatShading: true, emissive: 0x0a6622, emissiveIntensity: 0.25,
  })

  const bossOrbGeometry = new THREE.IcosahedronGeometry(1.6, 0)
  const bossOrbMaterial = new THREE.MeshPhongMaterial({
    color: BOSS_ORB_COLOR, flatShading: true, emissive: 0x664400, emissiveIntensity: 0.85,
    transparent: true, opacity: 0.92,
  })
  const bossOrbRingGeometry = new THREE.TorusGeometry(2.3, 0.09, 8, 24)
  const bossOrbRingMaterial = new THREE.MeshBasicMaterial({ color: BOSS_ORB_COLOR, transparent: true, opacity: 0.55 })

  function removeBonusTarget(b) {
    scene.remove(b.mesh)
    // geometria é POR SPAWN agora (ver makeBonusGeometry) — precisa disposar aqui, senão vaza
    b.mesh.geometry.dispose()
    bonusTargets.splice(bonusTargets.indexOf(b), 1)
  }

  function removeBossOrb(o) {
    scene.remove(o.mesh)
    bossOrbs.splice(bossOrbs.indexOf(o), 1)
  }

  function updateBonusTargets(dt) {
    const frame = rail.getFrameAt(0)
    for (const bonus of [...bonusTargets]) {
      if (bonus.dying) {
        bonus.deathT += dt / BONUS_DEATH_DURATION
        bonus.mesh.scale.setScalar(Math.max(0, bonus.scale * (1 - bonus.deathT)))
        if (bonus.deathT >= 1) removeBonusTarget(bonus)
        continue
      }
      const relative = bonus.mesh.position.clone().sub(frame.position)
      if (relative.dot(frame.forward) < PASS_BEHIND) removeBonusTarget(bonus)
    }
  }

  function updateBossOrbs(dt) {
    for (const orb of [...bossOrbs]) {
      if (orb.dying) {
        orb.deathT += dt / BOSS_ORB_DEATH_DURATION
        orb.mesh.scale.setScalar(Math.max(0, 1 - orb.deathT))
        if (orb.deathT >= 1) removeBossOrb(orb)
        continue
      }
      orb.mesh.rotation.y += dt * 0.8
      orb.mesh.children[1].rotation.z += dt * 1.6
      orb.mesh.scale.setScalar(1 + Math.sin(elapsed * 3 + orb.phase) * 0.08)
    }
  }

  // hitbox acompanha a escala real (bug antigo: hitbox fixa de 1.6 pra todo asteroide, o
  // comentário prometia "acompanha a escala real" mas o código usava constante)
  function bonusHitRadiusFor(bonus) {
    return Math.max(BONUS_HIT_RADIUS_MIN, BONUS_HIT_RADIUS * (bonus.scale ?? 1))
  }

  return {
    spawnBonusTarget() {
      // Antes era uma cópia local de randomSpawnPositionOnPath que projetava na centerline
      // futura do trilho — mesmo bug de curvatura dos inimigos (spawn desviava pra fora do
      // eixo da câmera em curva). Agora reaproveita a versão corrigida de enemies/shared.js,
      // que ancora no jogador + forward ATUAL — o asteroide sempre nasce na frente dele.
      const position = randomSpawnPositionOnPath(rail, BONUS_SPAWN_DISTANCE_MIN, BONUS_SPAWN_DISTANCE_MAX, BONUS_BOX_X, BONUS_BOX_Y)
      const mesh = new THREE.Mesh(makeBonusGeometry(), bonusMaterial)
      mesh.position.copy(position)
      const scale = rollBonusScale()
      mesh.scale.setScalar(scale)
      mesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2)
      scene.add(mesh)
      bonusTargets.push({ mesh, dying: false, deathT: 0, scale })
    },

    clearBonusTargets() {
      for (const bonus of [...bonusTargets]) if (!bonus.dying) removeBonusTarget(bonus)
    },

    spawnBossOrbs(count, opts = {}) {
      const { distanceMin = 45, distanceMax = 95 } = opts
      const origin = rail.getArenaCenter()
      for (let i = 0; i < count; i += 1) {
        const azimuth = Math.random() * Math.PI * 2
        const elevation = (Math.random() * 2 - 1) * BOSS_TARGET_ELEVATION_MAX
        const distance = distanceMin + Math.random() * (distanceMax - distanceMin)
        const offset = new THREE.Vector3(
          Math.sin(azimuth) * Math.cos(elevation),
          Math.sin(elevation),
          Math.cos(azimuth) * Math.cos(elevation),
        ).multiplyScalar(distance)

        const group = new THREE.Group()
        group.add(new THREE.Mesh(bossOrbGeometry, bossOrbMaterial))
        const ring = new THREE.Mesh(bossOrbRingGeometry, bossOrbRingMaterial)
        ring.rotation.x = Math.PI / 2
        group.add(ring)
        group.position.copy(origin.clone().add(offset))
        scene.add(group)
        bossOrbs.push({ mesh: group, dying: false, deathT: 0, phase: Math.random() * Math.PI * 2 })
      }
    },

    clearBossOrbs() {
      for (const orb of [...bossOrbs]) if (!orb.dying) removeBossOrb(orb)
    },

    update(dt) {
      elapsed += dt
      updateBonusTargets(dt)
      updateBossOrbs(dt)
    },

    resolveBossOrbHit(prevPos, currPos, hitBuffer) {
      if (!bossOrbs.length) return null
      const orb = bossOrbs.find((o) => !o.dying && distanceToSegment(o.mesh.position, prevPos, currPos) <= BOSS_ORB_HIT_RADIUS + hitBuffer)
      if (!orb) return null
      orb.dying = true
      orb.deathT = 0
      if (effects) effects.explosion(orb.mesh.position, BOSS_ORB_COLOR, 1.1)
      return { hit: true }
    },

    resolveBonusHit(prevPos, currPos, hitBuffer) {
      if (!bonusTargets.length) return null
      const bonus = bonusTargets.find((b) => !b.dying && distanceToSegment(b.mesh.position, prevPos, currPos) <= bonusHitRadiusFor(b) + hitBuffer)
      if (!bonus) return null
      bonus.dying = true
      bonus.deathT = 0
      if (effects) effects.explosion(bonus.mesh.position, BONUS_COLOR, 0.9 * bonus.scale)
      return { points: BONUS_KILL_BONUS }
    },

    getMinimapBlips: () => bossOrbs.filter((o) => !o.dying).map((o) => ({ type: 'bossOrb', worldPos: o.mesh.position })),

    getHitboxTargets: () => [
      ...bonusTargets.filter((b) => !b.dying).map((b) => ({ worldPos: b.mesh.position, radius: bonusHitRadiusFor(b) })),
      ...bossOrbs.filter((o) => !o.dying).map((o) => ({ worldPos: o.mesh.position, radius: BOSS_ORB_HIT_RADIUS })),
    ],

    dispose() {
      for (const b of [...bonusTargets]) removeBonusTarget(b)
      for (const o of [...bossOrbs]) removeBossOrb(o)
      // bônus: geometria é por spawn, já disposta em removeBonusTarget. Só o material é
      // compartilhado.
      bonusMaterial.dispose()
      bossOrbGeometry.dispose()
      bossOrbMaterial.dispose()
      bossOrbRingGeometry.dispose()
      bossOrbRingMaterial.dispose()
    },
  }
}
