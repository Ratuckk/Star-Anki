import * as THREE from 'three'
import { distanceToSegment } from '../enemies/shared.js'

// ============ ALVOS NEUTROS — bônus (asteroide) + orbes-pergunta do chefe ============
// Extraído de combat.js (v0.38.0, split por sistema): esses dois tipos de alvo não são
// "inimigos" (não atacam, não perseguem) nem "projéteis" — só ficam parados/flutuando esperando
// o jogador atirar neles. Ficam juntos aqui por serem a mesma categoria: alvo passivo.

const BONUS_COLOR = 0x2bff6b
const BONUS_SPAWN_DISTANCE_MIN = 90
const BONUS_SPAWN_DISTANCE_MAX = 140
const BONUS_BOX_X = 7
const BONUS_BOX_Y = 5
const BONUS_HIT_RADIUS = 1.6
const BONUS_DEATH_DURATION = 0.2
const BONUS_KILL_BONUS = 50
// pedido do usuário: variedade de tamanho — 0.7x a 1.6x, hitbox acompanha a escala real
const BONUS_SCALE_MIN = 0.7
const BONUS_SCALE_MAX = 1.6

const PASS_BEHIND = -4

// v0.29.6: +25% no tiro normal (não no teleguiado) — repassado por quem chama resolve*Hit
const BOSS_ORB_HIT_RADIUS = 2.2
const BOSS_ORB_DEATH_DURATION = 0.2
const BOSS_ORB_COLOR = 0xffd166
const BOSS_TARGET_ELEVATION_MAX = THREE.MathUtils.degToRad(50)

export function createTargetsSystem(scene, rail, effects) {
  const bonusTargets = []
  const bossOrbs = []
  let elapsed = 0

  // pedido do usuário: "adicione mais variedades de tamanho... e um shading pra parecer mais um
  // asteroide" — geometria icosaédrica com os vértices deslocados aleatoriamente ao longo da
  // própria normal (UMA VEZ por sessão — recriada a cada `createTargetsSystem`, então cada
  // partida nova ganha uma forma de pedra diferente), tamanho varia por instância via mesh.scale
  // no spawn. emissive fraco — menos "gema brilhando", mais rocha lida pela luz da cena.
  const bonusGeometry = (() => {
    const geo = new THREE.IcosahedronGeometry(1.1, 1)
    const pos = geo.attributes.position
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i)
      const n = v.clone().normalize()
      v.addScaledVector(n, (Math.random() - 0.5) * 0.4)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    geo.computeVertexNormals()
    return geo
  })()
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

  function projectAheadOnPath(distanceAhead) {
    const frame = rail.getFrameAt(distanceAhead)
    return { position: frame.position.clone(), right: frame.right, up: frame.up }
  }

  function randomSpawnPositionOnPath(distanceMin, distanceMax, boxX, boxY) {
    const distanceAhead = distanceMin + Math.random() * (distanceMax - distanceMin)
    const base = projectAheadOnPath(distanceAhead)
    const lateralX = (Math.random() * 2 - 1) * boxX
    const lateralY = (Math.random() * 2 - 1) * boxY
    return base.position.clone().addScaledVector(base.right, lateralX).addScaledVector(base.up, lateralY)
  }

  function removeBonusTarget(b) {
    scene.remove(b.mesh)
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
      // giro + pulso constantes — só pra ficar claro que é um marcador "vivo" de longe, não um
      // inimigo nem um alvo comum.
      orb.mesh.rotation.y += dt * 0.8
      orb.mesh.children[1].rotation.z += dt * 1.6
      orb.mesh.scale.setScalar(1 + Math.sin(elapsed * 3 + orb.phase) * 0.08)
    }
  }

  return {
    spawnBonusTarget() {
      const position = randomSpawnPositionOnPath(BONUS_SPAWN_DISTANCE_MIN, BONUS_SPAWN_DISTANCE_MAX, BONUS_BOX_X, BONUS_BOX_Y)
      const mesh = new THREE.Mesh(bonusGeometry, bonusMaterial)
      mesh.position.copy(position)
      const scale = BONUS_SCALE_MIN + Math.random() * (BONUS_SCALE_MAX - BONUS_SCALE_MIN)
      mesh.scale.setScalar(scale)
      mesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2)
      scene.add(mesh)
      bonusTargets.push({ mesh, dying: false, deathT: 0, scale })
    },

    clearBonusTargets() {
      for (const bonus of [...bonusTargets]) if (!bonus.dying) removeBonusTarget(bonus)
    },

    // 6 orbes genéricos espalhados pela arena do chefe — nenhum "é" uma pergunta específica até
    // ser atingido; main.js decide qual pergunta mostrar (nextQuestion) na hora.
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

    // chamados pelo projectiles.js por projétil do jogador — cada um resolve E aplica o efeito
    // colateral (some, explode, soma pontos), devolvendo só o que quem chama precisa saber
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
      const bonus = bonusTargets.find((b) => !b.dying && distanceToSegment(b.mesh.position, prevPos, currPos) <= BONUS_HIT_RADIUS + hitBuffer)
      if (!bonus) return null
      bonus.dying = true
      bonus.deathT = 0
      if (effects) effects.explosion(bonus.mesh.position, BONUS_COLOR, 0.9)
      return { points: BONUS_KILL_BONUS }
    },

    getMinimapBlips: () => bossOrbs.filter((o) => !o.dying).map((o) => ({ type: 'bossOrb', worldPos: o.mesh.position })),

    getHitboxTargets: () => [
      ...bonusTargets.filter((b) => !b.dying).map((b) => ({ worldPos: b.mesh.position, radius: BONUS_HIT_RADIUS })),
      ...bossOrbs.filter((o) => !o.dying).map((o) => ({ worldPos: o.mesh.position, radius: BOSS_ORB_HIT_RADIUS })),
    ],

    dispose() {
      for (const b of [...bonusTargets]) removeBonusTarget(b)
      for (const o of [...bossOrbs]) removeBossOrb(o)
      bonusGeometry.dispose()
      bonusMaterial.dispose()
      bossOrbGeometry.dispose()
      bossOrbMaterial.dispose()
      bossOrbRingGeometry.dispose()
      bossOrbRingMaterial.dispose()
    },
  }
}
