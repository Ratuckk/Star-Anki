import * as THREE from 'three'

// --- starfield ---
const STAR_COUNT = 1400
const STAR_INNER_RADIUS = 260
const STAR_OUTER_RADIUS = 640
const STAR_FLATTEN = 0.55
const STAR_SIZE = 1.0

// --- explosions ---
const EXPLOSION_PARTICLES = 16
const EXPLOSION_DURATION = 0.55
const EXPLOSION_SPEED_MIN = 10
const EXPLOSION_SPEED_MAX = 22
const EXPLOSION_PARTICLE_SIZE = 0.7

// --- muzzle flash ---
const MUZZLE_DURATION = 0.07

// --- glow de carga do tiro teleguiado ---
const CHARGE_GLOW_MIN_SCALE = 0.35
const CHARGE_GLOW_MAX_SCALE = 1.6
const CHARGE_GLOW_AHEAD = 2.2

// --- engine trail ---
const ENGINE_TRAIL_INTERVAL = 0.035
const ENGINE_TRAIL_DURATION = 0.7
const ENGINE_TRAIL_SPEED = 8

// sistema de efeitos visuais: starfield permanente + efeitos transientes (explosão, muzzle flash,
// rastro de motor). Tudo fica aqui pra main.js/combat.js não incharem — eles só chamam os métodos.
// Os transientes são criados sob demanda e descartados quando a vida útil acaba; o starfield é
// único e vive por toda a sessão.
export function createEffectsSystem(scene) {
  // ============ STARFIELD ============
  // estrelas distribuídas numa casca esférica achatada ao redor de todo o trilho. Ficam paradas
  // no espaço do mundo — como o trilho é um loop fechado e nunca sai da região (±190 de origem),
  // as estrelas sempre envolvem a cena e geram paralaxe natural conforme a nave avança.
  // fog:false porque o FogExp2 do cenário engoliria qualquer coisa a 200+ unidades.
  const starGeometry = new THREE.BufferGeometry()
  const starPositions = new Float32Array(STAR_COUNT * 3)
  const starColors = new Float32Array(STAR_COUNT * 3)
  for (let i = 0; i < STAR_COUNT; i++) {
    const r = STAR_INNER_RADIUS + Math.random() * (STAR_OUTER_RADIUS - STAR_INNER_RADIUS)
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    starPositions[i * 3 + 1] = r * Math.cos(phi) * STAR_FLATTEN
    starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)

    // leve variação de cor: maioria branca, algumas azuladas, algumas alaranjadas — dá
    // profundidade sem precisar de texturas
    const roll = Math.random()
    if (roll < 0.15) {
      starColors[i * 3] = 1.0; starColors[i * 3 + 1] = 0.85; starColors[i * 3 + 2] = 0.7
    } else if (roll < 0.35) {
      starColors[i * 3] = 0.75; starColors[i * 3 + 1] = 0.85; starColors[i * 3 + 2] = 1.0
    } else {
      starColors[i * 3] = 1.0; starColors[i * 3 + 1] = 1.0; starColors[i * 3 + 2] = 1.0
    }
  }
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
  starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3))
  const starMaterial = new THREE.PointsMaterial({
    size: STAR_SIZE,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    fog: false,
  })
  const stars = new THREE.Points(starGeometry, starMaterial)
  stars.frustumCulled = false
  scene.add(stars)

  // ============ TRANSIENTES ============
  const bursts = []
  const muzzleFlashes = []
  const trailParticles = []
  let trailTimer = 0

  // ============ GLOW DE CARGA (tiro teleguiado) ============
  // esfera azul translúcida na frente da nave que cresce com o progresso da carga — referência
  // visual clara de "solte agora pra disparar". Mesh único e persistente (só mostra/esconde e
  // escala), não recriado a cada frame.
  const chargeGlowGeometry = new THREE.SphereGeometry(1, 16, 12)
  const chargeGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0x4da6ff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
  const chargeGlow = new THREE.Mesh(chargeGlowGeometry, chargeGlowMaterial)
  chargeGlow.visible = false
  scene.add(chargeGlow)

  function setChargeGlow(active, fraction, position, direction) {
    chargeGlow.visible = active
    if (!active) return
    const scale = CHARGE_GLOW_MIN_SCALE + (CHARGE_GLOW_MAX_SCALE - CHARGE_GLOW_MIN_SCALE) * Math.max(0, Math.min(1, fraction))
    chargeGlow.scale.setScalar(scale)
    chargeGlow.position.copy(position).addScaledVector(direction, CHARGE_GLOW_AHEAD)
  }

  function explosion(position, colorHex, size = 1) {
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(EXPLOSION_PARTICLES * 3)
    const velocities = new Float32Array(EXPLOSION_PARTICLES * 3)

    for (let i = 0; i < EXPLOSION_PARTICLES; i++) {
      positions[i * 3] = position.x
      positions[i * 3 + 1] = position.y
      positions[i * 3 + 2] = position.z

      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const speed = (EXPLOSION_SPEED_MIN + Math.random() * (EXPLOSION_SPEED_MAX - EXPLOSION_SPEED_MIN)) * size
      velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed
      velocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed
      velocities[i * 3 + 2] = Math.cos(phi) * speed
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({
      color: colorHex,
      size: EXPLOSION_PARTICLE_SIZE * size,
      sizeAttenuation: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    scene.add(points)
    bursts.push({ points, velocities, life: 0 })
  }

  function muzzleFlash(position, direction) {
    const geometry = new THREE.SphereGeometry(0.4, 8, 8)
    const material = new THREE.MeshBasicMaterial({
      color: 0xfff2a8,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(position).addScaledVector(direction, 0.6)
    scene.add(mesh)
    muzzleFlashes.push({ mesh, life: 0 })
  }

  function spawnTrailParticle(position, forward) {
    const geometry = new THREE.SphereGeometry(0.22, 6, 6)
    const material = new THREE.MeshBasicMaterial({
      color: 0x8fdcff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(position)
    scene.add(mesh)
    trailParticles.push({
      mesh,
      life: 0,
      velocity: forward.clone().multiplyScalar(-ENGINE_TRAIL_SPEED),
    })
  }

  function update(dt, shipPosition, shipForward, opts = {}) {
    const { boosting = 1, skipTrail = false } = opts

    // rastro do motor: cadência proporcional ao boost (mais rápido = mais partículas)
    if (!skipTrail && shipPosition && shipForward) {
      trailTimer -= dt
      if (trailTimer <= 0) {
        const exhaust = shipPosition.clone().addScaledVector(shipForward, -1.8)
        spawnTrailParticle(exhaust, shipForward)
        trailTimer = ENGINE_TRAIL_INTERVAL / Math.max(0.5, boosting)
      }
    }

    // bursts de explosão: avançam por velocidade própria, com drag pra desacelerar
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i]
      b.life += dt
      const t = b.life / EXPLOSION_DURATION
      if (t >= 1) {
        scene.remove(b.points)
        b.points.geometry.dispose()
        b.points.material.dispose()
        bursts.splice(i, 1)
        continue
      }
      const attr = b.points.geometry.attributes.position
      const arr = attr.array
      const drag = Math.max(0, 1 - dt * 2.5)
      for (let j = 0; j < arr.length; j += 3) {
        arr[j] += b.velocities[j] * dt
        arr[j + 1] += b.velocities[j + 1] * dt
        arr[j + 2] += b.velocities[j + 2] * dt
        b.velocities[j] *= drag
        b.velocities[j + 1] *= drag
        b.velocities[j + 2] *= drag
      }
      attr.needsUpdate = true
      b.points.material.opacity = Math.max(0, 1 - t)
    }

    // muzzle flashes: expandem e somem rápido
    for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
      const m = muzzleFlashes[i]
      m.life += dt
      const t = m.life / MUZZLE_DURATION
      if (t >= 1) {
        scene.remove(m.mesh)
        m.mesh.geometry.dispose()
        m.mesh.material.dispose()
        muzzleFlashes.splice(i, 1)
        continue
      }
      m.mesh.material.opacity = 1 - t
      m.mesh.scale.setScalar(1 + t * 1.5)
    }

    // rastro do motor: partículas individuais que desaceleram e encolhem
    for (let i = trailParticles.length - 1; i >= 0; i--) {
      const p = trailParticles[i]
      p.life += dt
      const t = p.life / ENGINE_TRAIL_DURATION
      if (t >= 1) {
        scene.remove(p.mesh)
        p.mesh.geometry.dispose()
        p.mesh.material.dispose()
        trailParticles.splice(i, 1)
        continue
      }
      p.mesh.position.addScaledVector(p.velocity, dt)
      p.mesh.material.opacity = 0.9 * (1 - t)
      p.mesh.scale.setScalar(1 - t * 0.6)
    }
  }

  function dispose() {
    scene.remove(stars)
    starGeometry.dispose()
    starMaterial.dispose()
    for (const b of bursts) { scene.remove(b.points); b.points.geometry.dispose(); b.points.material.dispose() }
    for (const m of muzzleFlashes) { scene.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.material.dispose() }
    for (const p of trailParticles) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose() }
    bursts.length = 0
    muzzleFlashes.length = 0
    trailParticles.length = 0
    scene.remove(chargeGlow)
    chargeGlowGeometry.dispose()
    chargeGlowMaterial.dispose()
  }

  return { update, explosion, muzzleFlash, setChargeGlow, dispose }
}
