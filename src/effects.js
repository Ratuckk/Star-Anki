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
// QoL: era denso/opaco demais ("sopa de bolhas") — cadência, tamanho, opacidade e duração
// cortados pra manter só a leitura de "estou voando", sem competir com o resto da tela.
const ENGINE_TRAIL_INTERVAL = 0.06 // era 0.035
const ENGINE_TRAIL_DURATION = 0.42 // era 0.7
const ENGINE_TRAIL_SPEED = 8
const ENGINE_TRAIL_SIZE = 0.14 // era 0.22 (embutido direto na SphereGeometry antes)
const ENGINE_TRAIL_OPACITY = 0.45 // era 0.9

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
const FLASH_DURATION = 0.12 // era 0.06 — rápido demais pra perceber a 60fps
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
// QoL: mesmo motivo do rastro normal — cadência e opacidade cortadas
const COMET_TRAIL_INTERVAL = 0.05 // era 0.02
const COMET_TRAIL_DURATION = 0.9
const COMET_TRAIL_SPEED = 14
const COMET_TRAIL_COLOR = 0xffa64d
const COMET_TRAIL_OPACITY = 0.5 // era 0.85

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
// Poeira FIXA em espaço-mundo (não segue o jogador) — o jogador voa ATRAVÉS dela, como
// acontece com o grid. As partículas ficam num volume grande que cobre o trilho e o
// alcance da arena; cada uma tem drift lento e wrap-around por eixo no volume.
const DUST_COUNT = 700
const DUST_SIZE = 0.28
const DUST_COLOR = 0xaaccee
const DUST_AREA_CENTER = { x: -30, y: 0, z: -80 }
const DUST_AREA_HALF_X = 220
const DUST_AREA_HALF_Y = 60
const DUST_AREA_HALF_Z = 220

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

// ============ SPIN WIND (giro completo) ============
// anel que "varre o ar" no plano do roll, acompanhando o giro de 360° — não é uma explosão,
// é mais um sopro circular. Perpendicular ao forward da nave (mesma técnica do smokeRing).
const SPIN_WIND_DURATION = 0.5
const SPIN_WIND_START_SCALE = 0.5
const SPIN_WIND_MAX_SCALE = 4.5
const SPIN_WIND_COLOR = 0xb4e4ff
const SPIN_WIND_SPIN_RATE = 8 // rad/s, sentido igual ao giro (direction)

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
  // poeira espacial fixa em espaço-mundo — o jogador voa através dela como acontece com o
  // grid. Cada partícula fica numa caixa grande (cobrindo o trilho e a arena) e faz wrap
  // por eixo quando sai do volume.
  const dustGeometry = new THREE.BufferGeometry()
  const dustPositions = new Float32Array(DUST_COUNT * 3)
  const dustVelocities = new Float32Array(DUST_COUNT * 3)
  for (let i = 0; i < DUST_COUNT; i++) {
    // distribuição uniforme dentro de uma caixa grande em espaço-mundo
    dustPositions[i*3]   = DUST_AREA_CENTER.x + (Math.random() * 2 - 1) * DUST_AREA_HALF_X
    dustPositions[i*3+1] = DUST_AREA_CENTER.y + (Math.random() * 2 - 1) * DUST_AREA_HALF_Y
    dustPositions[i*3+2] = DUST_AREA_CENTER.z + (Math.random() * 2 - 1) * DUST_AREA_HALF_Z
    // drift lento — como o jogador voa a 22+ u/s, isso é quase imperceptível em jogo, mas
    // dá vida ao fundo quando o jogador está quase parado
    dustVelocities[i*3]   = (Math.random() - 0.5) * 0.4
    dustVelocities[i*3+1] = (Math.random() - 0.5) * 0.4
    dustVelocities[i*3+2] = (Math.random() - 0.5) * 0.4
  }
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3))
  const dustMaterial = new THREE.PointsMaterial({
    color: DUST_COLOR, size: DUST_SIZE, sizeAttenuation: true,
    transparent: true, opacity: 0.5, depthWrite: false, fog: false,
  })
  const dustPoints = new THREE.Points(dustGeometry, dustMaterial)
  dustPoints.frustumCulled = false
  scene.add(dustPoints)

  // (bolha de escudo removida — o escudo continua funcionando mecanicamente, só não é mais
  // desenhado como esfera ao redor da nave)

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
  const hitSparks = []
  const activeFlashes = []
  const projectileTrails = []
  const shockwaves = []
  const telegraphs = []
  const cometTrails = []
  const glassShards = []
  const bloomSprites = []
  const contrails = []
  const bossImpactRings = []
  const spinWinds = []
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
    const geometry = new THREE.SphereGeometry(ENGINE_TRAIL_SIZE, 6, 6)
    const material = new THREE.MeshBasicMaterial({
      color: boosting > 1 ? 0xffb066 : 0x8fdcff,
      transparent: true, opacity: ENGINE_TRAIL_OPACITY,
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

  // giro completo (Z/C, 2 toques): anel de vento no plano do roll (perpendicular ao forward
  // da nave), expandindo e girando no sentido do giro. `spinDirection` é -1 (esquerda) ou 1
  // (direita) — só define o sentido do giro visual do anel, sem relação com o dano/deflect.
  function spinWind(position, forward, spinDirection = 1) {
    const mesh = makeRingMesh(SPIN_WIND_COLOR, 0.12)
    mesh.position.copy(position)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward.clone().normalize())
    mesh.scale.setScalar(SPIN_WIND_START_SCALE)
    scene.add(mesh)
    spinWinds.push({ mesh, life: 0, spinDirection })
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

  // QoL: alguns inimigos (redutor de tempo) são um THREE.Group com vários meshes filhos, sem
  // `.material` próprio — antes disso, esses eram os ÚNICOS inimigos que nunca piscavam ao
  // levar dano, porque a função retornava direto no guard. Agora desce recursivamente e pisca
  // cada filho com material (cada um vira sua própria entrada em activeFlashes).
  function flashMesh(mesh, durationSec = FLASH_DURATION) {
    if (!mesh) return
    if (!mesh.material) {
      if (Array.isArray(mesh.children)) {
        for (const child of mesh.children) flashMesh(child, durationSec)
      }
      return
    }
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

  function shockwave(position, colorHex = 0xffaa55, scale = 1) {
    const mesh = makeRingMesh(colorHex, 0.18)
    mesh.position.copy(position)
    mesh.scale.setScalar(0.3)
    scene.add(mesh)
    shockwaves.push({ mesh, life: 0, maxScale: SHOCKWAVE_MAX_SCALE * scale })
  }

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

  function cometTrailParticle(position, forward) {
    const geometry = new THREE.SphereGeometry(0.35, 6, 6)
    const material = new THREE.MeshBasicMaterial({
      color: COMET_TRAIL_COLOR, transparent: true, opacity: COMET_TRAIL_OPACITY,
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

  function glassShatter(position, colorHex = 0x4da6ff) {
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
    }

    // poeira ambiente — drift lento + wrap por eixo dentro do volume em espaço-mundo.
    // NÃO reposiciona o Points: as partículas ficam fixas onde estão e o jogador voa através
    // delas, igual acontece com o grid.
    {
      const attr = dustGeometry.attributes.position
      const arr = attr.array
      for (let i = 0; i < DUST_COUNT; i++) {
        const i3 = i * 3
        arr[i3]   += dustVelocities[i3]   * dt
        arr[i3+1] += dustVelocities[i3+1] * dt
        arr[i3+2] += dustVelocities[i3+2] * dt

        // wrap por eixo — se saiu de um lado da caixa, teleporta pro lado oposto
        if (arr[i3] > DUST_AREA_CENTER.x + DUST_AREA_HALF_X) arr[i3] -= DUST_AREA_HALF_X * 2
        else if (arr[i3] < DUST_AREA_CENTER.x - DUST_AREA_HALF_X) arr[i3] += DUST_AREA_HALF_X * 2
        if (arr[i3+1] > DUST_AREA_CENTER.y + DUST_AREA_HALF_Y) arr[i3+1] -= DUST_AREA_HALF_Y * 2
        else if (arr[i3+1] < DUST_AREA_CENTER.y - DUST_AREA_HALF_Y) arr[i3+1] += DUST_AREA_HALF_Y * 2
        if (arr[i3+2] > DUST_AREA_CENTER.z + DUST_AREA_HALF_Z) arr[i3+2] -= DUST_AREA_HALF_Z * 2
        else if (arr[i3+2] < DUST_AREA_CENTER.z - DUST_AREA_HALF_Z) arr[i3+2] += DUST_AREA_HALF_Z * 2
      }
      attr.needsUpdate = true
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
      p.mesh.material.opacity = ENGINE_TRAIL_OPACITY * (1 - t)
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

    // SPIN WINDS (giro completo)
    for (let i = spinWinds.length - 1; i >= 0; i--) {
      const w = spinWinds[i]
      w.life += dt
      const t = w.life / SPIN_WIND_DURATION
      if (t >= 1) {
        scene.remove(w.mesh); w.mesh.geometry.dispose(); w.mesh.material.dispose()
        spinWinds.splice(i, 1); continue
      }
      const scale = SPIN_WIND_START_SCALE + (SPIN_WIND_MAX_SCALE - SPIN_WIND_START_SCALE) * Math.sqrt(t)
      w.mesh.scale.setScalar(scale)
      w.mesh.material.opacity = 0.75 * (1 - t)
      w.mesh.rotateZ(dt * SPIN_WIND_SPIN_RATE * w.spinDirection)
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
      c.mesh.material.opacity = COMET_TRAIL_OPACITY * (1 - t)
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
    scene.remove(dustPoints); dustGeometry.dispose(); dustMaterial.dispose()
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
    for (const w of spinWinds) { scene.remove(w.mesh); w.mesh.geometry.dispose(); w.mesh.material.dispose() }
    bursts.length = 0; hitSparks.length = 0; muzzleFlashes.length = 0
    trailParticles.length = 0; smokeRings.length = 0; homingAfterimages.length = 0
    projectileTrails.length = 0; shockwaves.length = 0; bossImpactRings.length = 0
    telegraphs.length = 0; cometTrails.length = 0; glassShards.length = 0
    bloomSprites.length = 0; contrails.length = 0; activeFlashes.length = 0
    spinWinds.length = 0
    scene.remove(chargeGlow); chargeGlowGeometry.dispose(); chargeGlowMaterial.dispose()
  }

  return {
    update, explosion, muzzleFlash, setChargeGlow, smokeRing, homingAfterimage,
    hitSpark, flashMesh, projectileTrail, shockwave, telegraph,
    cometTrailParticle, glassShatter, bloomSprite, contrailParticle, bossImpactRing,
    gridPulse, spawnContrailTick, spinWind,
    dispose,
  }
}
