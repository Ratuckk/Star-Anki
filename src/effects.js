import * as THREE from 'three'

// ============ STARFIELD ============
const STAR_COUNT = 1400
const STAR_INNER_RADIUS = 260
const STAR_OUTER_RADIUS = 640
const STAR_FLATTEN = 0.55
const STAR_SIZE = 1.0

// ============ EXPLOSION ============
const EXPLOSION_PARTICLES = 16
const EXPLOSION_DURATION = 0.55
const EXPLOSION_SPEED_MIN = 10
const EXPLOSION_SPEED_MAX = 22
const EXPLOSION_PARTICLE_SIZE = 0.7

// ============ MUZZLE FLASH ============
const MUZZLE_DURATION = 0.07

// ============ CHARGE GLOW ============
const CHARGE_GLOW_MIN_SCALE = 0.35
const CHARGE_GLOW_MAX_SCALE = 1.6
const CHARGE_GLOW_AHEAD = 2.2

// ============ ENGINE TRAIL ============
const ENGINE_TRAIL_INTERVAL = 0.035
const ENGINE_TRAIL_DURATION = 0.7
const ENGINE_TRAIL_SPEED = 8

// ============ HOMING ============
const HOMING_EFFECT_COLOR = 0x2bff88
const SMOKE_RING_DURATION = 0.5
const HOMING_AFTERIMAGE_DURATION = 0.25

// ============ HIT SPARK ============
const HIT_SPARK_PARTICLES = 6
const HIT_SPARK_DURATION = 0.22
const HIT_SPARK_SPEED_MIN = 6
const HIT_SPARK_SPEED_MAX = 14
const HIT_SPARK_SIZE = 0.35

// ============ FLASH MESH ============
const FLASH_DURATION = 0.06
const FLASH_COLOR = 0xffffff

// ============ PROJECTILE TRAIL ============
const PROJECTILE_TRAIL_INTERVAL = 0.03
const PROJECTILE_TRAIL_DURATION = 0.18

// ============ SHOCKWAVE ============
const SHOCKWAVE_DURATION = 0.5
const SHOCKWAVE_MAX_SCALE = 8

// ============ TELEGRAPH ============
const TELEGRAPH_DURATION = 0.35
const TELEGRAPH_MAX_SCALE = 0.9

// ============ COMET TRAIL ============
const COMET_TRAIL_INTERVAL = 0.02
const COMET_TRAIL_DURATION = 0.9
const COMET_TRAIL_SPEED = 14
const COMET_TRAIL_COLOR = 0xffa64d

// ============ GLASS SHATTER ============
const GLASS_SHARD_COUNT = 14
const GLASS_SHARD_DURATION = 0.65
const GLASS_SHARD_SPEED_MIN = 8
const GLASS_SHARD_SPEED_MAX = 18
const GLASS_SHARD_SIZE = 0.18

// ============ BLOOM SPRITE ============
const BLOOM_DURATION = 0.45
const BLOOM_START_SCALE = 0.3
const BLOOM_END_SCALE = 2.5

// ============ AMBIENT DUST ============
const DUST_COUNT = 220
const DUST_RADIUS = 45
const DUST_SIZE = 0.28
const DUST_COLOR = 0xaaccee

// ============ SHIELD BUBBLE ============
// >> CORRIGIDO: a bolha era uma esfera SÓLIDA maior que a própria nave, cobrindo a tela — virou
// uma grade (wireframe) justa ao casco, como um "grid de escudo" de verdade em vez de um orbe <<
const SHIELD_BUBBLE_RADIUS = 1.8
const SHIELD_BUBBLE_COLOR = 0x4da6ff

// ============ CONTRAIL ============
const CONTRAIL_INTERVAL = 0.06
const CONTRAIL_DURATION = 0.4
const CONTRAIL_SIZE = 0.14

// ============ BOSS IMPACT RING ============
const BOSS_IMPACT_DURATION = 0.55
const BOSS_IMPACT_COLOR = 0xff7d3a
const BOSS_IMPACT_MAX_SCALE = 5

// ============ GRID PULSE ============
const GRID_PULSE_DURATION = 0.4

// >> CORRIGIDO: PointsMaterial sem `map` desenha cada partícula como um QUADRADO sólido — de
// longe (starfield) isso não incomoda, mas perto da nave (poeira ambiente) ficava parecendo uma
// "constelação" de quadradinhos estranha. Esse sprite circular (gerado uma vez, num canvas)
// deixa a poeira redonda e suave, como um ponto de luz de verdade. <<
function makeCircleSprite() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.55)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  return texture
}

// sistema de efeitos visuais: starfield + poeira ambiente + efeitos transientes.
// Todos os transientes são criados sob demanda e descartados quando a vida útil acaba.
// opts.grid (opcional) = referência ao GridHelper da cena, usada pelo gridPulse.
export function createEffectsSystem(scene, opts = {}) {
  const gridRef = opts.grid || null

  // ============ STARFIELD ============
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

    const roll = Math.random()
    if (roll < 0.15) { starColors[i*3] = 1.0; starColors[i*3+1] = 0.85; starColors[i*3+2] = 0.7 }
    else if (roll < 0.35) { starColors[i*3] = 0.75; starColors[i*3+1] = 0.85; starColors[i*3+2] = 1.0 }
    else { starColors[i*3] = 1.0; starColors[i*3+1] = 1.0; starColors[i*3+2] = 1.0 }
  }
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
  starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3))
  const starMaterial = new THREE.PointsMaterial({
    size: STAR_SIZE, sizeAttenuation: true, vertexColors: true,
    transparent: true, opacity: 0.95, depthWrite: false, fog: false,
  })
  const stars = new THREE.Points(starGeometry, starMaterial)
  stars.frustumCulled = false
  scene.add(stars)

  // ============ AMBIENT DUST ============
  // poeira espacial flutuando perto da nave — profundidade de campo sem custo alto.
  // As posições são "locais" ao centro atual do jogador; o Points inteiro é reposicionado
  // a cada frame pra seguir a nave, então a poeira sempre parece estar ao redor do jogador.
  const dustGeometry = new THREE.BufferGeometry()
  const dustPositions = new Float32Array(DUST_COUNT * 3)
  const dustVelocities = new Float32Array(DUST_COUNT * 3)
  for (let i = 0; i < DUST_COUNT; i++) {
    const r = DUST_RADIUS * Math.cbrt(Math.random())
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    dustPositions[i*3] = r * Math.sin(phi) * Math.cos(theta)
    dustPositions[i*3+1] = r * Math.cos(phi)
    dustPositions[i*3+2] = r * Math.sin(phi) * Math.sin(theta)
    dustVelocities[i*3] = (Math.random() - 0.5) * 0.6
    dustVelocities[i*3+1] = (Math.random() - 0.5) * 0.6
    dustVelocities[i*3+2] = (Math.random() - 0.5) * 0.6
  }
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3))
  const dustMaterial = new THREE.PointsMaterial({
    color: DUST_COLOR, size: DUST_SIZE, sizeAttenuation: true,
    map: makeCircleSprite(), transparent: true, opacity: 0.4, depthWrite: false, fog: false,
  })
  const dustPoints = new THREE.Points(dustGeometry, dustMaterial)
  dustPoints.frustumCulled = false
  scene.add(dustPoints)

  // ============ SHIELD BUBBLE ============
  // wireframe (poucos segmentos) em vez de esfera sólida — parece um grid de energia justo ao
  // casco, não um orbe grande cobrindo a nave
  // blending normal (não aditivo) — aditivo somava o brilho de cada linha que se cruza e
  // deixava a grade parecendo acesa/brilhante demais mesmo com opacidade baixa
  const shieldBubbleGeometry = new THREE.SphereGeometry(SHIELD_BUBBLE_RADIUS, 9, 6)
  const shieldBubbleMaterial = new THREE.MeshBasicMaterial({
    color: SHIELD_BUBBLE_COLOR, wireframe: true, transparent: true, opacity: 0.22,
    depthWrite: false, fog: false,
  })
  const shieldBubble = new THREE.Mesh(shieldBubbleGeometry, shieldBubbleMaterial)
  shieldBubble.visible = false
  scene.add(shieldBubble)
  let shieldPulseTimer = 0

  // ============ CHARGE GLOW ============
  const chargeGlowGeometry = new THREE.SphereGeometry(1, 16, 12)
  const chargeGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0x4da6ff, transparent: true, opacity: 0.55,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  })
  const chargeGlow = new THREE.Mesh(chargeGlowGeometry, chargeGlowMaterial)
  chargeGlow.visible = false
  scene.add(chargeGlow)

  // ============ LISTAS DE TRANSIENTES ============
  const bursts = []
  const muzzleFlashes = []
  const trailParticles = []
  const smokeRings = []
  const homingAfterimages = []
  const hitSparks = []           // faíscas curtas de hit
  const activeFlashes = []       // meshes em flash branco
  const projectileTrails = []    // afterimage dos tiros normais
  const shockwaves = []          // anéis expansivos
  const telegraphs = []          // aviso de tiro inimigo
  const cometTrails = []         // cauda quente durante boost
  const glassShards = []         // estilhaços de escudo
  const bloomSprites = []        // esferas translúcidas pra fake bloom
  const contrails = []           // rastro dos wingmen
  const bossImpactRings = []     // onda de impacto no chefe
  let trailTimer = 0
  let cometTimer = 0
  let contrailTimer = 0

  // ============ SHOCKWAVE / RING HELPERS ============
  function makeRingMesh(colorHex, thickness = 0.15) {
    const geo = new THREE.RingGeometry(1 - thickness, 1, 32)
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.85,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.frustumCulled = false
    return mesh
  }

  // ============ EFEITOS EXISTENTES ============
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
      positions[i*3] = position.x; positions[i*3+1] = position.y; positions[i*3+2] = position.z
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const speed = (EXPLOSION_SPEED_MIN + Math.random() * (EXPLOSION_SPEED_MAX - EXPLOSION_SPEED_MIN)) * size
      velocities[i*3] = Math.sin(phi) * Math.cos(theta) * speed
      velocities[i*3+1] = Math.sin(phi) * Math.sin(theta) * speed
      velocities[i*3+2] = Math.cos(phi) * speed
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({
      color: colorHex, size: EXPLOSION_PARTICLE_SIZE * size, sizeAttenuation: true,
      transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    scene.add(points)
    bursts.push({ points, velocities, life: 0 })
  }

  function muzzleFlash(position, direction) {
    const geometry = new THREE.SphereGeometry(0.4, 8, 8)
    const material = new THREE.MeshBasicMaterial({
      color: 0xfff2a8, transparent: true, opacity: 1,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(position).addScaledVector(direction, 0.6)
    scene.add(mesh)
    muzzleFlashes.push({ mesh, life: 0 })
  }

  function spawnTrailParticle(position, forward, boosting) {
    const geometry = new THREE.SphereGeometry(0.22, 6, 6)
    const material = new THREE.MeshBasicMaterial({
      color: boosting > 1 ? 0xffb066 : 0x8fdcff,
      transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(position)
    scene.add(mesh)
    trailParticles.push({
      mesh, life: 0,
      velocity: forward.clone().multiplyScalar(-ENGINE_TRAIL_SPEED * (boosting > 1 ? 1.6 : 1)),
      scale: boosting > 1 ? 1.35 : 1,
    })
  }

  function smokeRing(position, direction) {
    const geometry = new THREE.TorusGeometry(1, 0.22, 8, 20)
    const material = new THREE.MeshBasicMaterial({
      color: HOMING_EFFECT_COLOR, transparent: true, opacity: 0.6,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(position)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.clone().normalize())
    mesh.scale.setScalar(0.4)
    scene.add(mesh)
    smokeRings.push({ mesh, life: 0 })
  }

  function homingAfterimage(position, quaternion) {
    const geometry = new THREE.ConeGeometry(0.5, 3, 6)
    geometry.rotateX(Math.PI / 2)
    const material = new THREE.MeshBasicMaterial({
      color: HOMING_EFFECT_COLOR, transparent: true, opacity: 0.45,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(position)
    mesh.quaternion.copy(quaternion)
    scene.add(mesh)
    homingAfterimages.push({ mesh, life: 0 })
  }

  // ============ NOVOS EFEITOS ============

  // faíscas curtas — chamado quando um tiro acerta sem necessariamente matar
  function hitSpark(position, colorHex = 0xffffff) {
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(HIT_SPARK_PARTICLES * 3)
    const velocities = new Float32Array(HIT_SPARK_PARTICLES * 3)
    for (let i = 0; i < HIT_SPARK_PARTICLES; i++) {
      positions[i*3] = position.x; positions[i*3+1] = position.y; positions[i*3+2] = position.z
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const speed = HIT_SPARK_SPEED_MIN + Math.random() * (HIT_SPARK_SPEED_MAX - HIT_SPARK_SPEED_MIN)
      velocities[i*3] = Math.sin(phi) * Math.cos(theta) * speed
      velocities[i*3+1] = Math.sin(phi) * Math.sin(theta) * speed
      velocities[i*3+2] = Math.cos(phi) * speed
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({
      color: colorHex, size: HIT_SPARK_SIZE, sizeAttenuation: true,
      transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    scene.add(points)
    hitSparks.push({ points, velocities, life: 0 })
  }

  // flash branco no mesh atingido (efeito "levou dano"). Clona o material na primeira vez
  // que o mesh pisca, pra não afetar todos os inimigos que compartilham material.
  function flashMesh(mesh, durationSec = FLASH_DURATION) {
    if (!mesh || !mesh.material) return
    let entry = activeFlashes.find((f) => f.mesh === mesh)
    if (!entry) {
      if (!mesh.material.__origColorSaved) {
        mesh.material = mesh.material.clone()
        mesh.material.__origColorSaved = true
        mesh.material.__origColor = mesh.material.color.clone()
        mesh.material.__origEmissive = mesh.material.emissive ? mesh.material.emissive.clone() : null
        mesh.material.__origEmissiveIntensity = mesh.material.emissiveIntensity
      }
      entry = { mesh, untilMs: 0 }
      activeFlashes.push(entry)
    }
    entry.untilMs = performance.now() + durationSec * 1000
  }

  // afterimage dos tiros normais — mesmo padrão do homingAfterimage, azul e menor
  function projectileTrail(position, quaternion) {
    const geometry = new THREE.ConeGeometry(0.16, 1.0, 5)
    geometry.rotateX(Math.PI / 2)
    const material = new THREE.MeshBasicMaterial({
      color: 0x6fc4ff, transparent: true, opacity: 0.4,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(position)
    mesh.quaternion.copy(quaternion)
    scene.add(mesh)
    projectileTrails.push({ mesh, life: 0 })
  }

  // onda de choque — anel billboard (sempre de frente pra câmera) que expande
  function shockwave(position, colorHex = 0xffaa55, scale = 1) {
    const mesh = makeRingMesh(colorHex, 0.18)
    mesh.position.copy(position)
    mesh.scale.setScalar(0.3)
    scene.add(mesh)
    shockwaves.push({ mesh, life: 0, maxScale: SHOCKWAVE_MAX_SCALE * scale })
  }

  // pequena esfera pulsante pra telegrafar que um inimigo vai atirar
  function telegraph(position, colorHex = 0xff5a3d) {
    const geometry = new THREE.SphereGeometry(1, 8, 8)
    const material = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(position)
    mesh.scale.setScalar(0.15)
    scene.add(mesh)
    telegraphs.push({ mesh, life: 0 })
  }

  // cauda "cometa" durante o boost máximo
  function cometTrailParticle(position, forward) {
    const geometry = new THREE.SphereGeometry(0.35, 6, 6)
    const material = new THREE.MeshBasicMaterial({
      color: COMET_TRAIL_COLOR, transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(position)
    scene.add(mesh)
    cometTrails.push({
      mesh, life: 0,
      velocity: forward.clone().multiplyScalar(-COMET_TRAIL_SPEED),
    })
  }

  // estilhaços triangulares ao perder o escudo
  function glassShatter(position, colorHex = SHIELD_BUBBLE_COLOR) {
    const geometry = new THREE.TetrahedronGeometry(GLASS_SHARD_SIZE)
    const material = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const shards = []
    for (let i = 0; i < GLASS_SHARD_COUNT; i++) {
      const mesh = new THREE.Mesh(geometry, material.clone())
      mesh.position.copy(position)
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const speed = GLASS_SHARD_SPEED_MIN + Math.random() * (GLASS_SHARD_SPEED_MAX - GLASS_SHARD_SPEED_MIN)
      const vel = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.sin(phi) * Math.sin(theta) * speed,
        Math.cos(phi) * speed,
      )
      scene.add(mesh)
      shards.push({ mesh, velocity: vel })
    }
    glassShards.push({ shards, life: 0 })
  }

  // esfera translúcida "fake bloom" — só uma cor acesa atrás do objeto
  function bloomSprite(position, colorHex, size = 1) {
    const geometry = new THREE.SphereGeometry(1, 10, 8)
    const material = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.6,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(position)
    mesh.scale.setScalar(BLOOM_START_SCALE * size)
    scene.add(mesh)
    bloomSprites.push({ mesh, life: 0, size })
  }

  // contrail dos wingmen (partículas pequenas, sem velocidade própria — só encolhem)
  function contrailParticle(position, colorHex = 0x7fe0ff) {
    const geometry = new THREE.SphereGeometry(CONTRAIL_SIZE, 5, 5)
    const material = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.7,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(position)
    scene.add(mesh)
    contrails.push({ mesh, life: 0 })
  }

  // anel de impacto no chefe — expansão rápida, cor quente
  function bossImpactRing(position, scale = 1) {
    const mesh = makeRingMesh(BOSS_IMPACT_COLOR, 0.12)
    mesh.position.copy(position)
    mesh.scale.setScalar(0.4)
    scene.add(mesh)
    bossImpactRings.push({ mesh, life: 0, maxScale: BOSS_IMPACT_MAX_SCALE * scale })
  }

  // pulso no grid do chão — emite uma ondulação de cor no GridHelper
  let gridPulseTimer = 0
  function gridPulse() {
    if (!gridRef || !gridRef.material) return
    if (!gridRef.material.__origColorSaved) {
      gridRef.material = gridRef.material.clone()
      gridRef.material.__origColorSaved = true
      gridRef.material.__origColor = gridRef.material.color ? gridRef.material.color.clone() : null
    }
    gridPulseTimer = GRID_PULSE_DURATION
  }

  // ============ UPDATE ============
  function update(dt, shipPosition, shipForward, opts = {}) {
    const { boosting = 1, skipTrail = false, boostActive = false } = opts
    const now = performance.now()

    // rastro do motor
    if (!skipTrail && shipPosition && shipForward) {
      trailTimer -= dt
      if (trailTimer <= 0) {
        const exhaust = shipPosition.clone().addScaledVector(shipForward, -1.8)
        spawnTrailParticle(exhaust, shipForward, boosting)
        trailTimer = ENGINE_TRAIL_INTERVAL / Math.max(0.5, boosting)
      }

      // cauda cometa durante boost
      if (boostActive) {
        cometTimer -= dt
        if (cometTimer <= 0) {
          const exhaust = shipPosition.clone().addScaledVector(shipForward, -2.4)
          cometTrailParticle(exhaust, shipForward)
          cometTimer = COMET_TRAIL_INTERVAL
        }
      }

      // posiciona a poeira ao redor da nave
      dustPoints.position.copy(shipPosition)
    }

    // poeira ambiente — drift + wrap-around dentro da casca
    {
      const attr = dustGeometry.attributes.position
      const arr = attr.array
      for (let i = 0; i < DUST_COUNT; i++) {
        const i3 = i * 3
        arr[i3]   += dustVelocities[i3]   * dt
        arr[i3+1] += dustVelocities[i3+1] * dt
        arr[i3+2] += dustVelocities[i3+2] * dt
        // wrap: se saiu da casca, "teleporta" pro lado oposto (imperceptível)
        const dx = arr[i3], dy = arr[i3+1], dz = arr[i3+2]
        const d2 = dx*dx + dy*dy + dz*dz
        if (d2 > DUST_RADIUS * DUST_RADIUS) {
          arr[i3] = -dx; arr[i3+1] = -dy; arr[i3+2] = -dz
        }
      }
      attr.needsUpdate = true
    }

    // shield bubble
    if (opts.shieldValue != null && opts.shieldMax != null && shipPosition) {
      const frac = Math.max(0, Math.min(1, opts.shieldValue / opts.shieldMax))
      shieldBubble.visible = frac > 0.02
      if (shieldBubble.visible) {
        shieldBubble.position.copy(shipPosition)
        shieldPulseTimer += dt
        const pulse = 1 + Math.sin(shieldPulseTimer * 3) * 0.03
        shieldBubble.scale.setScalar(pulse)
        // wireframe cobre bem menos área que uma esfera sólida, por isso a opacidade base é
        // mais alta aqui do que era antes — senão o grid quase some
        shieldBubbleMaterial.opacity = 0.12 + frac * 0.18
      }
    }

    // EXPLOSION BURSTS
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i]
      b.life += dt
      const t = b.life / EXPLOSION_DURATION
      if (t >= 1) {
        scene.remove(b.points); b.points.geometry.dispose(); b.points.material.dispose()
        bursts.splice(i, 1); continue
      }
      const attr = b.points.geometry.attributes.position
      const arr = attr.array
      const drag = Math.max(0, 1 - dt * 2.5)
      for (let j = 0; j < arr.length; j += 3) {
        arr[j] += b.velocities[j] * dt
        arr[j+1] += b.velocities[j+1] * dt
        arr[j+2] += b.velocities[j+2] * dt
        b.velocities[j] *= drag; b.velocities[j+1] *= drag; b.velocities[j+2] *= drag
      }
      attr.needsUpdate = true
      b.points.material.opacity = Math.max(0, 1 - t)
    }

    // HIT SPARKS
    for (let i = hitSparks.length - 1; i >= 0; i--) {
      const s = hitSparks[i]
      s.life += dt
      const t = s.life / HIT_SPARK_DURATION
      if (t >= 1) {
        scene.remove(s.points); s.points.geometry.dispose(); s.points.material.dispose()
        hitSparks.splice(i, 1); continue
      }
      const attr = s.points.geometry.attributes.position
      const arr = attr.array
      const drag = Math.max(0, 1 - dt * 4)
      for (let j = 0; j < arr.length; j += 3) {
        arr[j] += s.velocities[j] * dt
        arr[j+1] += s.velocities[j+1] * dt
        arr[j+2] += s.velocities[j+2] * dt
        s.velocities[j] *= drag; s.velocities[j+1] *= drag; s.velocities[j+2] *= drag
      }
      attr.needsUpdate = true
      s.points.material.opacity = Math.max(0, 1 - t)
    }

    // MUZZLE FLASHES
    for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
      const m = muzzleFlashes[i]
      m.life += dt
      const t = m.life / MUZZLE_DURATION
      if (t >= 1) {
        scene.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.material.dispose()
        muzzleFlashes.splice(i, 1); continue
      }
      m.mesh.material.opacity = 1 - t
      m.mesh.scale.setScalar(1 + t * 1.5)
    }

    // TRAIL PARTICLES
    for (let i = trailParticles.length - 1; i >= 0; i--) {
      const p = trailParticles[i]
      p.life += dt
      const t = p.life / ENGINE_TRAIL_DURATION
      if (t >= 1) {
        scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose()
        trailParticles.splice(i, 1); continue
      }
      p.mesh.position.addScaledVector(p.velocity, dt)
      p.mesh.material.opacity = 0.9 * (1 - t)
      p.mesh.scale.setScalar(p.scale * (1 - t * 0.6))
    }

    // SMOKE RINGS
    for (let i = smokeRings.length - 1; i >= 0; i--) {
      const s = smokeRings[i]
      s.life += dt
      const t = s.life / SMOKE_RING_DURATION
      if (t >= 1) {
        scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose()
        smokeRings.splice(i, 1); continue
      }
      s.mesh.scale.setScalar(0.4 + t * 4.5)
      s.mesh.material.opacity = 0.6 * (1 - t)
    }

    // HOMING AFTERIMAGES
    for (let i = homingAfterimages.length - 1; i >= 0; i--) {
      const a = homingAfterimages[i]
      a.life += dt
      const t = a.life / HOMING_AFTERIMAGE_DURATION
      if (t >= 1) {
        scene.remove(a.mesh); a.mesh.geometry.dispose(); a.mesh.material.dispose()
        homingAfterimages.splice(i, 1); continue
      }
      a.mesh.material.opacity = 0.45 * (1 - t)
      a.mesh.scale.setScalar(1 - t * 0.4)
    }

    // PROJECTILE TRAILS (tiros normais)
    for (let i = projectileTrails.length - 1; i >= 0; i--) {
      const p = projectileTrails[i]
      p.life += dt
      const t = p.life / PROJECTILE_TRAIL_DURATION
      if (t >= 1) {
        scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose()
        projectileTrails.splice(i, 1); continue
      }
      p.mesh.material.opacity = 0.4 * (1 - t)
      p.mesh.scale.setScalar(1 - t * 0.5)
    }

    // SHOCKWAVES (billboard)
    const cam = opts.camera
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const s = shockwaves[i]
      s.life += dt
      const t = s.life / SHOCKWAVE_DURATION
      if (t >= 1) {
        scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose()
        shockwaves.splice(i, 1); continue
      }
      const scale = 0.3 + (s.maxScale - 0.3) * Math.sqrt(t)
      s.mesh.scale.setScalar(scale)
      s.mesh.material.opacity = 0.85 * (1 - t)
      if (cam) s.mesh.quaternion.copy(cam.quaternion)
    }

    // BOSS IMPACT RINGS
    for (let i = bossImpactRings.length - 1; i >= 0; i--) {
      const s = bossImpactRings[i]
      s.life += dt
      const t = s.life / BOSS_IMPACT_DURATION
      if (t >= 1) {
        scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose()
        bossImpactRings.splice(i, 1); continue
      }
      const scale = 0.4 + (s.maxScale - 0.4) * Math.sqrt(t)
      s.mesh.scale.setScalar(scale)
      s.mesh.material.opacity = 0.9 * (1 - t)
      if (cam) s.mesh.quaternion.copy(cam.quaternion)
    }

    // TELEGRAPHS
    for (let i = telegraphs.length - 1; i >= 0; i--) {
      const tg = telegraphs[i]
      tg.life += dt
      const t = tg.life / TELEGRAPH_DURATION
      if (t >= 1) {
        scene.remove(tg.mesh); tg.mesh.geometry.dispose(); tg.mesh.material.dispose()
        telegraphs.splice(i, 1); continue
      }
      const s = 0.15 + (TELEGRAPH_MAX_SCALE - 0.15) * t
      tg.mesh.scale.setScalar(s)
      tg.mesh.material.opacity = 0.5 + 0.5 * Math.sin(t * Math.PI * 4)
    }

    // COMET TRAILS
    for (let i = cometTrails.length - 1; i >= 0; i--) {
      const c = cometTrails[i]
      c.life += dt
      const t = c.life / COMET_TRAIL_DURATION
      if (t >= 1) {
        scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh.material.dispose()
        cometTrails.splice(i, 1); continue
      }
      c.mesh.position.addScaledVector(c.velocity, dt)
      c.mesh.material.opacity = 0.85 * (1 - t)
      c.mesh.scale.setScalar(1 - t * 0.3)
    }

    // GLASS SHARDS
    for (let i = glassShards.length - 1; i >= 0; i--) {
      const g = glassShards[i]
      g.life += dt
      const t = g.life / GLASS_SHARD_DURATION
      if (t >= 1) {
        for (const s of g.shards) {
          scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose()
        }
        glassShards.splice(i, 1); continue
      }
      const drag = Math.max(0, 1 - dt * 3)
      for (const s of g.shards) {
        s.mesh.position.addScaledVector(s.velocity, dt)
        s.velocity.multiplyScalar(drag)
        s.mesh.material.opacity = 0.95 * (1 - t)
        s.mesh.rotation.x += dt * 8
        s.mesh.rotation.y += dt * 6
      }
    }

    // BLOOM SPRITES
    for (let i = bloomSprites.length - 1; i >= 0; i--) {
      const b = bloomSprites[i]
      b.life += dt
      const t = b.life / BLOOM_DURATION
      if (t >= 1) {
        scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose()
        bloomSprites.splice(i, 1); continue
      }
      const scale = BLOOM_START_SCALE + (BLOOM_END_SCALE - BLOOM_START_SCALE) * Math.sqrt(t)
      b.mesh.scale.setScalar(scale * b.size)
      b.mesh.material.opacity = 0.6 * (1 - t)
    }

    // CONTRAILS
    for (let i = contrails.length - 1; i >= 0; i--) {
      const c = contrails[i]
      c.life += dt
      const t = c.life / CONTRAIL_DURATION
      if (t >= 1) {
        scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh.material.dispose()
        contrails.splice(i, 1); continue
      }
      c.mesh.material.opacity = 0.7 * (1 - t)
      c.mesh.scale.setScalar(1 - t * 0.7)
    }

    // ACTIVE FLASHES (mesh branco)
    for (let i = activeFlashes.length - 1; i >= 0; i--) {
      const f = activeFlashes[i]
      if (!f.mesh.material || now > f.untilMs) {
        if (f.mesh.material && f.mesh.material.__origColor) {
          f.mesh.material.color.copy(f.mesh.material.__origColor)
          if (f.mesh.material.emissive && f.mesh.material.__origEmissive) {
            f.mesh.material.emissive.copy(f.mesh.material.__origEmissive)
            if (f.mesh.material.__origEmissiveIntensity != null) {
              f.mesh.material.emissiveIntensity = f.mesh.material.__origEmissiveIntensity
            }
          }
        }
        activeFlashes.splice(i, 1); continue
      }
      f.mesh.material.color.set(FLASH_COLOR)
      if (f.mesh.material.emissive) f.mesh.material.emissive.set(FLASH_COLOR)
    }

    // GRID PULSE
    if (gridPulseTimer > 0 && gridRef && gridRef.material) {
      gridPulseTimer = Math.max(0, gridPulseTimer - dt)
      const t = 1 - gridPulseTimer / GRID_PULSE_DURATION
      const intensity = Math.sin(t * Math.PI)
      if (gridRef.material.color && gridRef.material.__origColor) {
        gridRef.material.color.copy(gridRef.material.__origColor).lerp(new THREE.Color(0xff8844), intensity * 0.8)
      }
    } else if (gridRef && gridRef.material && gridRef.material.__origColor) {
      gridRef.material.color.copy(gridRef.material.__origColor)
    }
  }

  // permite que o main.js agende um contrail dos wingmen manualmente
  function spawnContrailTick(wingmenPositions) {
    contrailTimer -= 1/60
    if (contrailTimer <= 0) {
      contrailTimer = CONTRAIL_INTERVAL
      for (const p of wingmenPositions) contrailParticle(p)
    }
  }

  function dispose() {
    scene.remove(stars); starGeometry.dispose(); starMaterial.dispose()
    scene.remove(dustPoints); dustGeometry.dispose(); dustMaterial.map?.dispose(); dustMaterial.dispose()
    scene.remove(shieldBubble); shieldBubbleGeometry.dispose(); shieldBubbleMaterial.dispose()
    for (const b of bursts) { scene.remove(b.points); b.points.geometry.dispose(); b.points.material.dispose() }
    for (const s of hitSparks) { scene.remove(s.points); s.points.geometry.dispose(); s.points.material.dispose() }
    for (const m of muzzleFlashes) { scene.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.material.dispose() }
    for (const p of trailParticles) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose() }
    for (const s of smokeRings) { scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose() }
    for (const a of homingAfterimages) { scene.remove(a.mesh); a.mesh.geometry.dispose(); a.mesh.material.dispose() }
    for (const p of projectileTrails) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose() }
    for (const s of shockwaves) { scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose() }
    for (const s of bossImpactRings) { scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose() }
    for (const t of telegraphs) { scene.remove(t.mesh); t.mesh.geometry.dispose(); t.mesh.material.dispose() }
    for (const c of cometTrails) { scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh.material.dispose() }
    for (const g of glassShards) { for (const s of g.shards) { scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose() } }
    for (const b of bloomSprites) { scene.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose() }
    for (const c of contrails) { scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh.material.dispose() }
    bursts.length = 0; hitSparks.length = 0; muzzleFlashes.length = 0
    trailParticles.length = 0; smokeRings.length = 0; homingAfterimages.length = 0
    projectileTrails.length = 0; shockwaves.length = 0; bossImpactRings.length = 0
    telegraphs.length = 0; cometTrails.length = 0; glassShards.length = 0
    bloomSprites.length = 0; contrails.length = 0; activeFlashes.length = 0
    scene.remove(chargeGlow); chargeGlowGeometry.dispose(); chargeGlowMaterial.dispose()
  }

  return {
    update, explosion, muzzleFlash, setChargeGlow, smokeRing, homingAfterimage,
    hitSpark, flashMesh, projectileTrail, shockwave, telegraph,
    cometTrailParticle, glassShatter, bloomSprite, contrailParticle, bossImpactRing,
    gridPulse, spawnContrailTick,
    dispose,
  }
}
