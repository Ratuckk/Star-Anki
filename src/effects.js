import * as THREE from 'three'

// PointsMaterial sem `map` renderiza cada ponto como um quadrado sólido virado pra câmera — ok
// pra poeira/faíscas pequenas (o quadrado não se nota), mas os wisps de neblina (Fase 7) são
// grandes o bastante pra ficarem lendo como blocos cinza no meio do ar. Gera uma textura de
// círculo suave (gradiente radial) na hora, sem depender de nenhum asset externo.
function makeSoftCircleTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.4)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

// ============ STARFIELD ============
const STAR_COUNT = 1400
const STAR_INNER_RADIUS = 260
const STAR_OUTER_RADIUS = 640
const STAR_FLATTEN = 0.55
const STAR_SIZE = 1.0

// ============ EXPLOSION ============
const EXPLOSION_PARTICLES = 26
const EXPLOSION_DURATION = 0.75
const EXPLOSION_SPEED_MIN = 14
const EXPLOSION_SPEED_MAX = 28
const EXPLOSION_PARTICLE_SIZE = 0.9

const EXPLOSION_GRAY_RING_COUNT_MIN = 1
const EXPLOSION_GRAY_RING_COUNT_MAX = 3
const EXPLOSION_GRAY_RING_COLOR = 0x999999
const EXPLOSION_GRAY_RING_DURATION = 0.75
const EXPLOSION_GRAY_RING_SCALE_MIN = 2.8
const EXPLOSION_GRAY_RING_SCALE_MAX = 5.8
const EXPLOSION_GRAY_RING_START_SCALE = 0.3
const EXPLOSION_GRAY_RING_CHANCE_NORMAL = 0.45
const EXPLOSION_GRAY_RING_CHANCE_BOSS = 0.85

// ============ MUZZLE FLASH (overhaul v0.85.x) ============
// Efeito em 4 camadas brancas pra ler como "descarga de energia": núcleo rápido (estalo),
// halo (brilho residual), anel de choque perpendicular ao tiro (empurrou o ar) e fagulhas
// (cinético). A soma aditiva no centro satura em branco puro — a leitura de "potência máxima"
// que faltava no cone único azul de antes.
//
// Durações escalonadas (núcleo some antes do halo, fagulhas duram mais que tudo) porque é o
// ESCALONAMENTO que faz parecer flash de verdade — se todas as camadas durassem o mesmo tempo,
// o efeito lia como uma bolha crescendo e sumindo, não como um disparo.
const MUZZLE_CORE_DURATION = 0.05
const MUZZLE_HALO_DURATION = 0.13
const MUZZLE_RING_DURATION = 0.10
const MUZZLE_SPARK_DURATION = 0.16
// Quantas fagulhas por disparo, leque angular (rad) e velocidade de voo — 4 com ±20° é o ponto
// onde o efeito lê como "cuspida" sem virar chuva de partículas.
const MUZZLE_SPARK_COUNT = 4
const MUZZLE_SPARK_SPREAD = 0.35
const MUZZLE_SPARK_SPEED = 22
// Mantido só pro flare dos inimigos (enemyMuzzleFlare) — o muzzle do jogador não usa mais este
// valor, cada camada tem sua própria duração acima.
const MUZZLE_DURATION = 0.11

// ============ CHARGE GLOW ============
const CHARGE_GLOW_AHEAD = 2.2
const CHARGE_GLOW_COLOR = 0xaaff33
const CHARGE_GLOW_MAX_COLOR = 0x2b8fff
const CHARGE_GLOW_LAYERS = [
  { scaleMin: 0.30, scaleMax: 0.85, opacityMin: 0.85, opacityMax: 0.40 },
  { scaleMin: 0.55, scaleMax: 1.30, opacityMin: 0.55, opacityMax: 0.28 },
  { scaleMin: 0.85, scaleMax: 1.80, opacityMin: 0.32, opacityMax: 0.18 },
  { scaleMin: 1.20, scaleMax: 2.40, opacityMin: 0.18, opacityMax: 0.10 },
]
const CHARGE_GLOW_PULSE_RATE = 6
const CHARGE_GLOW_PULSE_AMOUNT = 0.12
const CHARGE_GLOW_OPACITY_MULT = 0.7

// ============ ENGINE FLAME (Fase 7) ============
const ENGINE_FLAME_COLOR = 0x4db8ff
const ENGINE_FLAME_BOOST_COLOR = 0x1f6bff
const ENGINE_FLAME_LENGTH = 1.5
const ENGINE_FLAME_BOOST_LENGTH = 3.4
const ENGINE_FLAME_RADIUS = 0.34
const ENGINE_FLAME_BOOST_RADIUS = 0.55
const ENGINE_FLAME_OPACITY = 0.55
const ENGINE_FLAME_BOOST_OPACITY = 0.85
const ENGINE_FLAME_FLICKER_RATE = 16
const ENGINE_FLAME_FLICKER_AMOUNT = 0.12

// ============ PROPULSION BURST (Fase 7) ============
const PROPULSION_BURST_COLOR = 0x2f8bff
const PROPULSION_BURST_DURATION = 0.35

// ============ IMPULSO ARÍETE (item 12) ============
const RAM_SHIELD_COLOR = 0x4da6ff
const RAM_SHIELD_RADIUS = 2.0
const RAM_SHIELD_SPIN_X = 0.8
const RAM_SHIELD_SPIN_Y = 1.1
const RAM_RING_INTERVAL = 0.12
const RAM_RING_DURATION = 0.5
const RAM_RING_COLOR = 0x4da6ff
const RAM_RING_MAX_SCALE = 3.5
const RAM_AFTERIMAGE_INTERVAL = 0.05
const RAM_AFTERIMAGE_DURATION = 0.35
const RAM_AFTERIMAGE_COLOR = 0x4da6ff

// ============ GIRO REBATEDOR ============
const DEFLECT_RING_COLOR = 0x4da6ff
const DEFLECT_RING_COUNT = 3
const DEFLECT_RING_STAGGER = 0.06
const DEFLECT_RING_DURATION = 0.45

// ============ AFTERIMAGE DO ROLAMENTO ============
const ROLL_AFTERIMAGE_INTERVAL = 0.04
const ROLL_AFTERIMAGE_DURATION = 0.3

// ============ AFTERIMAGE DO DASH LATERAL (propulsão + bank em arena) ============
// Pedido do usuário: dash lateral (impulsão + virar) só tinha o burst pontual de
// `lateralDashVFX` no instante do trigger — sem trilha nem speedlines durante o deslize em si
// (ARENA_DASH_DURATION = 0.22s, ver rail.js). Intervalo mais curto que o do roll (0.04) porque a
// janela é bem menor — precisa de mais afterimages por segundo pra não ficar esparso num
// movimento tão curto.
const DASH_AFTERIMAGE_INTERVAL = 0.025
const DASH_AFTERIMAGE_DURATION = 0.3
const DASH_AFTERIMAGE_COLOR = 0x4db8ff // mesma cor do burst de lateralDashVFX

// ============ RICOCHETE ============
const RICOCHET_ARC_DURATION = 0.18
const ROLL_AFTERIMAGE_COLOR = 0xcfe9ff

// ============ FAÍSCAS DE HIT NÃO-LETAL (item 5 — Docs/# QoL — Documento de Melhorias.md) ============
// Leque cônico de faíscas quando um tiro NORMAL acerta um alvo com HP restante (killed: false) —
// o flashMesh/hitSpark padrão é sutil demais pra ler como "acertou, mas não matou" em alvos
// grandes (chefe). Soma-se ao hitSpark existente, não substitui.
const RICOCHET_SPARK_COUNT_MIN = 10
const RICOCHET_SPARK_COUNT_MAX = 14
const RICOCHET_SPARK_ANGLE = THREE.MathUtils.degToRad(35) // abertura do leque (±35°)
const RICOCHET_SPARK_SPEED_MIN = 25
const RICOCHET_SPARK_SPEED_MAX = 40
const RICOCHET_SPARK_COLOR = 0xffd166 // branca-amarelada — contrasta com o tiro normal (azul)
const RICOCHET_SPARK_DURATION = 0.35
const RICOCHET_SPARK_DECAY_RATE = 6 // decaimento exponencial da velocidade — "rápido" por pedido do doc

// ============ TRAIL DE PROPULSÃO ============
const BOOST_TRAIL_INTERVAL = 0.05
const BOOST_TRAIL_DURATION = 0.9
const BOOST_TRAIL_SPEED = 14
const BOOST_TRAIL_COLOR = 0xffa64d
const BOOST_TRAIL_OPACITY = 0.5

// ============ FOG WISPS ============
const FOG_WISP_COUNT = 85
const FOG_WISP_SIZE_MIN = 5.0
const FOG_WISP_SIZE_MAX = 12.0
const FOG_WISP_OPACITY = 0.24
const FOG_WISP_COLOR = 0x9cbbe0
const FOG_WISP_AREA_CENTER = { x: -30, y: 2, z: -80 }
const FOG_WISP_AREA_HALF_X = 160
const FOG_WISP_AREA_HALF_Y = 22
const FOG_WISP_AREA_HALF_Z = 160
const FOG_WISP_DRIFT_SPEED = 0.8

// ============ HOMING ============
const HOMING_EFFECT_COLOR = 0x2bff88
const SMOKE_RING_DURATION = 0.5
const HOMING_AFTERIMAGE_DURATION = 0.25

// ============ SWIRL BLAST — flash, afterimage, explosão (Docs/# Swirl Blast) ============
// RECALIBRADO — bug reportado pelo usuário: "o disparo é basicamente invisível". Causa raiz: o
// flash reaproveitava `playerMuzzleCoreGeo`/`playerMuzzleRingGeo` (as geometrias TINY do muzzle
// flash normal) e o afterimage reaproveitava `sharedConeGeometry` (0.5×2.5, mesma do rastro do
// homing) — então o Swirl lia como um tiro azul comum. Agora tem geometrias PRÓPRIAS, grandes
// (ver bloco abaixo), anexadas ao mesmo array `muzzleFlashes` (já genérico o bastante pra
// suportar duração/growth/opacidade por instância — nenhum código de update precisou mudar).
const SWIRL_COLOR = 0x2b8fff          // mesma cor de projectiles.js (SWIRL_CORE_COLOR) — duplicado
                                       // de propósito, effects.js não importa cores de combat/
const SWIRL_HOT_COLOR = 0xeaffff      // idem SWIRL_HOT_COLOR em projectiles.js
// Overhaul v2 (pedido do usuário) — tamanhos na escala "Rodada 2" (cheia, 1.0×, mesma lógica de
// projectiles.js: SWIRL_SCALE ali). Durações não são "tamanho", sempre ficaram no valor cheio.
const SWIRL_FLASH_DURATION = 0.55     // era 0.45 — duração total do flash de disparo
const SWIRL_FLASH_RING_SCALE = 8.0 // Rodada 2 (escala cheia) — crescimento do anel de choque principal
const SWIRL_AFTERIMAGE_DURATION = 0.8 // era 0.55 — cada fantasma da trilha vive mais
const SWIRL_EXPLOSION_RADIUS = 7.0 // Rodada 2 (escala cheia) — impacto contra boss/escudo/dourado (dano é sempre 6 fixo)
// Anel de bloqueio (novo, §2 da proposta v2) — aparece brevemente sobre o chefe/dourado no
// instante do disparo, quando o Swirl sai em modo homing. Confirma pro jogador "vai nele".
const SWIRL_LOCK_RETICLE_DURATION = 0.4
const SWIRL_LOCK_RETICLE_RADIUS = 2.2

// ============ HIT SPARK ============
const HIT_SPARK_PARTICLES = 6
const HIT_SPARK_DURATION = 0.22
const HIT_SPARK_SPEED_MIN = 6
const HIT_SPARK_SPEED_MAX = 14
const HIT_SPARK_SIZE = 0.35

// ============ FLASH MESH ============
const FLASH_DURATION = 0.12
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

// ============ GLASS SHATTER ============
const GLASS_SHARD_COUNT = 14
const GLASS_SHARD_DURATION = 0.65
const GLASS_SHARD_SPEED_MIN = 8
const GLASS_SHARD_SPEED_MAX = 18
const GLASS_SHARD_SIZE = 0.18

// vetor de velocidade aleatório uniformemente distribuído numa esfera, magnitude entre
// minSpeed/maxSpeed — compartilhado entre glassShatter e swirlBlastExplosion (ambos espalham
// fragmentos num leque hemisférico/esférico ao redor de um ponto de impacto)
function randomSphereVelocity(minSpeed, maxSpeed) {
  const theta = Math.random() * Math.PI * 2
  const phi = Math.acos(2 * Math.random() - 1)
  const speed = minSpeed + Math.random() * (maxSpeed - minSpeed)
  return new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi),
  ).multiplyScalar(speed)
}

// ============ BLOOM SPRITE ============
const BLOOM_DURATION = 0.45
const BLOOM_START_SCALE = 0.3
const BLOOM_END_SCALE = 2.5

// ============ AMBIENT DUST ============
const DUST_COUNT = 300
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

// ============ SPIN WIND ============
const SPIN_WIND_DURATION = 0.5
const SPIN_WIND_START_SCALE = 0.5
const SPIN_WIND_MAX_SCALE = 4.5
const SPIN_WIND_COLOR = 0xb4e4ff
const SPIN_WIND_SPIN_RATE = 8

// ============ TIRO CARREGADO MÁXIMO ============
const MAX_CHARGE_RING_COLOR = 0x2b8fff
const MAX_CHARGE_RING_DURATION = 0.38
const MAX_CHARGE_RING_SPEED = 58
const MAX_CHARGE_RING_COUNT = 3

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
  const dustGeometry = new THREE.BufferGeometry()
  const dustPositions = new Float32Array(DUST_COUNT * 3)
  const dustVelocities = new Float32Array(DUST_COUNT * 3)
  for (let i = 0; i < DUST_COUNT; i++) {
    dustPositions[i*3]   = DUST_AREA_CENTER.x + (Math.random() * 2 - 1) * DUST_AREA_HALF_X
    dustPositions[i*3+1] = DUST_AREA_CENTER.y + (Math.random() * 2 - 1) * DUST_AREA_HALF_Y
    dustPositions[i*3+2] = DUST_AREA_CENTER.z + (Math.random() * 2 - 1) * DUST_AREA_HALF_Z
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

  // ============ FOG WISPS (Fase 7) ============
  const fogWispGeometry = new THREE.BufferGeometry()
  const fogWispPositions = new Float32Array(FOG_WISP_COUNT * 3)
  const fogWispVelocities = new Float32Array(FOG_WISP_COUNT * 3)
  for (let i = 0; i < FOG_WISP_COUNT; i++) {
    fogWispPositions[i*3]   = FOG_WISP_AREA_CENTER.x + (Math.random() * 2 - 1) * FOG_WISP_AREA_HALF_X
    fogWispPositions[i*3+1] = FOG_WISP_AREA_CENTER.y + (Math.random() * 2 - 1) * FOG_WISP_AREA_HALF_Y
    fogWispPositions[i*3+2] = FOG_WISP_AREA_CENTER.z + (Math.random() * 2 - 1) * FOG_WISP_AREA_HALF_Z
    fogWispVelocities[i*3]   = (Math.random() - 0.5) * FOG_WISP_DRIFT_SPEED
    fogWispVelocities[i*3+1] = (Math.random() - 0.5) * FOG_WISP_DRIFT_SPEED * 0.3
    fogWispVelocities[i*3+2] = (Math.random() - 0.5) * FOG_WISP_DRIFT_SPEED
  }
  fogWispGeometry.setAttribute('position', new THREE.BufferAttribute(fogWispPositions, 3))
  const softCircleTexture = makeSoftCircleTexture()
  const fogWispMaterial = new THREE.PointsMaterial({
    color: FOG_WISP_COLOR, size: (FOG_WISP_SIZE_MIN + FOG_WISP_SIZE_MAX) / 2, sizeAttenuation: true,
    map: softCircleTexture, transparent: true, opacity: FOG_WISP_OPACITY, depthWrite: false, fog: false,
  })
  const fogWispPoints = new THREE.Points(fogWispGeometry, fogWispMaterial)
  fogWispPoints.frustumCulled = false
  scene.add(fogWispPoints)

  // ============ CHARGE GLOW ============
  const chargeGlowLayers = CHARGE_GLOW_LAYERS.map((cfg) => {
    const geo = new THREE.SphereGeometry(1, 20, 14)
    const mat = new THREE.MeshBasicMaterial({
      color: CHARGE_GLOW_COLOR, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.visible = false
    scene.add(mesh)
    return { mesh, geo, mat, cfg }
  })

  // ============ ENGINE FLAME ============
  const engineFlameGeometry = new THREE.ConeGeometry(ENGINE_FLAME_RADIUS, ENGINE_FLAME_LENGTH, 10)
  engineFlameGeometry.rotateX(-Math.PI / 2)
  const engineFlameMaterial = new THREE.MeshBasicMaterial({
    color: ENGINE_FLAME_COLOR, transparent: true, opacity: ENGINE_FLAME_OPACITY,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  })
  const engineFlameMesh = new THREE.Mesh(engineFlameGeometry, engineFlameMaterial)
  engineFlameMesh.visible = false
  scene.add(engineFlameMesh)

  // ============ ESCUDO DO IMPULSO ARÍETE ============
  const ramShieldGeometry = new THREE.IcosahedronGeometry(1, 0)
  const ramShieldMaterial = new THREE.MeshBasicMaterial({
    color: RAM_SHIELD_COLOR, wireframe: true, transparent: true, opacity: 0.55,
    depthWrite: false, fog: false,
  })
  const ramShieldMesh = new THREE.Mesh(ramShieldGeometry, ramShieldMaterial)
  ramShieldMesh.visible = false
  scene.add(ramShieldMesh)

  // ============ LISTAS DE TRANSIENTES ============
  const bursts = []
  const grayRings = []
  const muzzleFlashes = []
  const smokeRings = []
  const homingAfterimages = []
  const swirlAfterimages = []
  const hitSparks = []
  const condensationInwards = []
  const spawnAnticipations = []
  const activeFlashes = []
  const projectileTrails = []
  const shockwaves = []
  const telegraphs = []
  const glassShards = []
  const bloomSprites = []
  const contrails = []
  const bossImpactRings = []
  const chargeCircles = []
  const spinWinds = []
  const ramRings = []
  const ramAfterimages = []
  const boostTrails = []
  const rollAfterimages = []
  const dashAfterimages = []
  const deflectRings = []
  const maxChargeRingsList = []
  const ricochetArcs = []
  const ricochetSparkBursts = []
  const enemyTrails = []
  const microOrbes = []
  let microOrbesCollectedThisFrame = 0
  const ENEMY_TRAIL_DURATION = 0.35
  const microOrbeCoreGeo = new THREE.OctahedronGeometry(0.4, 0)
  const microOrbeRingGeo = new THREE.TorusGeometry(0.6, 0.05, 4, 12)
  const microOrbeCoreMat = new THREE.MeshBasicMaterial({
    color: 0x00f2fe, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, fog: false,
  })
  const microOrbeRingMat = new THREE.MeshBasicMaterial({
    color: 0xffe600, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, fog: false,
  })
  const microOrbeHealCoreMat = new THREE.MeshBasicMaterial({
    color: 0x4ade80, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, fog: false,
  })
  const microOrbeHealRingMat = new THREE.MeshBasicMaterial({
    color: 0xbbf7d0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, fog: false,
  })
  let healOrbesCollectedThisFrame = 0
  let healOrbeCollectionPositions = []
  let contrailTimer = 0
  let ramRingTimer = 0
  let ramAfterimageTimer = 0
  let boostTrailTimer = 0
  let rollAfterimageTimer = 0
  let dashAfterimageTimer = 0

  // ============ GEOMETRIAS COMPARTILHADAS ============
  const sharedSphereGeometry = new THREE.SphereGeometry(1, 8, 8)
  const sharedRingGeometry = new THREE.RingGeometry(0.85, 1.0, 24)
  const sharedWideRingGeometry = new THREE.RingGeometry(0.55, 1.0, 32)
  const sharedTorusGeometry = new THREE.TorusGeometry(1, 0.15, 8, 20)
  const sharedConeGeometry = new THREE.ConeGeometry(0.5, 2.5, 6)
  sharedConeGeometry.rotateX(Math.PI / 2)

  // ============ MUZZLE FLASH — 4 geometrias compartilhadas ============
  // Todas apontando pro +Z local (rotateX(-π/2) nos cones, RingGeometry já está no plano XY) —
  // viram na direção do tiro via quaternion.setFromUnitVectors(FORWARD_AXIS, direction), o mesmo
  // padrão usado no resto do arquivo pra orientar tiros.
  //
  // CORE — cone pequeno e fino. Fica sempre apontado pro lado do tiro, então a silhueta de
  // "descarga" vem só do alinhamento com o canhão.
  const playerMuzzleCoreGeo = new THREE.ConeGeometry(0.22, 0.9, 6)
  playerMuzzleCoreGeo.rotateX(-Math.PI / 2)
  // HALO — cone maior e mais curto que o antigo, forma "gorda" em vez de alongada (compensa a
  // silhueta fina do core, dá volume ao flash sem esticar a ponto de virar um raio).
  const playerMuzzleHaloGeo = new THREE.ConeGeometry(0.4, 1.5, 8)
  playerMuzzleHaloGeo.rotateX(-Math.PI / 2)
  // RING — anel achatado. Fica perpendicular ao tiro (setFromUnitVectors no Z do Ring com a
  // direção) pra ler como "o ar foi empurrado pra fora pelo disparo".
  const playerMuzzleRingGeo = new THREE.RingGeometry(0.25, 0.45, 20)
  // SPARK — cone mini e esticado, 4 por disparo, atirados num leque estreito. Velocidade própria
  // por instância (velocity no entry do muzzleFlashes) — é o único componente do muzzle flash
  // que se move, e é isso que vende "cinético".
  const playerMuzzleSparkGeo = new THREE.ConeGeometry(0.06, 0.9, 4)
  playerMuzzleSparkGeo.rotateX(-Math.PI / 2)

  // ============ SWIRL BLAST — geometrias próprias do flash/afterimage (ver bloco de constantes
  // SWIRL_* acima) — antes reusavam as geometrias TINY do muzzle flash normal e do rastro do
  // homing, o que fazia o "super ataque" ler como um tiro comum.
  // 3 segmentos radiais (pirâmide triangular, não cone redondo) — mesma silhueta do corpo real
  // e do afterimage (swirlAfterimageCoreGeo abaixo), senão o flash de disparo lê como um formato
  // diferente do projétil por um frame antes de cortar pro corpo triangular de verdade.
  const swirlFlashConeGeo = new THREE.ConeGeometry(1.3, 5.0, 3)
  swirlFlashConeGeo.rotateX(-Math.PI / 2)
  const swirlFlashRingGeo = new THREE.RingGeometry(0.9, 1.9, 24)
  // Overhaul v2 — o corpo real agora é uma pirâmide de 3 lados (SWIRL_CORE_RADIUS=1.8,
  // SWIRL_CORE_LENGTH=6.0 em projectiles.js — duplicado aqui de propósito, mesmo padrão de
  // SWIRL_COLOR acima). O afterimage precisa da MESMA silhueta triangular, senão a trilha lê
  // como um formato diferente do projétil de verdade.
  const swirlAfterimageCoreGeo = new THREE.ConeGeometry(3.0, 10.0, 3) // Rodada 2 (escala cheia)
  swirlAfterimageCoreGeo.rotateX(Math.PI / 2)
  // Anel de lock (novo, homing contra chefe/dourado) — aro fino, some rápido.
  const swirlLockReticleGeo = new THREE.RingGeometry(SWIRL_LOCK_RETICLE_RADIUS * 0.85, SWIRL_LOCK_RETICLE_RADIUS, 32)
  // Fragmentos triangulares da explosão de impacto (novo, §6 da proposta v2) — tetraedros
  // pequenos que voam em leque hemisférico, reforça a leitura "triangular" também no impacto.
  const swirlFragmentGeo = new THREE.TetrahedronGeometry(0.5, 0) // Rodada 2 (escala cheia)

  const _FORWARD_AXIS = new THREE.Vector3(0, 0, 1)
  const _BACKWARD_AXIS = new THREE.Vector3(0, 0, -1)
  const _GRID_PULSE_COLOR = new THREE.Color(0xff8844)
  const _tmpExhaust = new THREE.Vector3()
  const _tmpNorm = new THREE.Vector3()
  const _tmpQuat = new THREE.Quaternion()
  // temporários do muzzle flash — evitam alocar Vector3/Quaternion a cada tiro (o flash dispara
  // ~6-7×/s no tiro normal, e cada disparo agora spawna 7 meshes em vez de 1)
  const _muzzleSparkDir = new THREE.Vector3()
  const _muzzleSparkAxis = new THREE.Vector3()
  const _muzzleSparkPos = new THREE.Vector3()

  // ============ SHOCKWAVE / RING HELPERS ============
  function makeRingMesh(colorHex, isWide = false) {
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.85,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false,
    })
    const mesh = new THREE.Mesh(isWide ? sharedWideRingGeometry : sharedRingGeometry, mat)
    mesh.frustumCulled = false
    return mesh
  }

  // ============ EFEITOS EXISTENTES ============
  // ============ CHARGE GLOW — BOOST DA MIYU ============
  // Só a última camada cresce durante a Carga Compartilhada, preservando a leitura da mira.
  const CHARGE_GLOW_MIYU_BOOST_MULT = 1.25
  function setChargeGlow(active, fraction, position, direction, opts = {}) {
    const f = Math.max(0, Math.min(1, fraction || 0))
    const atMaxCharge = f >= 1
    const now = performance.now()
    const n = chargeGlowLayers.length
    chargeGlowLayers.forEach((layer, i) => {
      const threshold = i / n
      const revealed = active && f >= threshold
      layer.mesh.visible = revealed
      if (!revealed) return
      layer.mat.color.setHex(atMaxCharge ? CHARGE_GLOW_MAX_COLOR : CHARGE_GLOW_COLOR)
      const { scaleMin, scaleMax, opacityMin, opacityMax } = layer.cfg
      const localT = threshold >= 1 ? 1 : Math.min(1, (f - threshold) / (1 - threshold))
      const pulse = 1 + Math.sin(now * 0.001 * CHARGE_GLOW_PULSE_RATE + i * 1.7) * CHARGE_GLOW_PULSE_AMOUNT
      const miyuBoost = opts.miyuAssistActive && i === n - 1 ? CHARGE_GLOW_MIYU_BOOST_MULT : 1
      layer.mesh.scale.setScalar((scaleMin + (scaleMax - scaleMin) * localT) * pulse * miyuBoost)
      layer.mat.opacity = (opacityMin + (opacityMax - opacityMin) * localT) * CHARGE_GLOW_OPACITY_MULT
      layer.mesh.position.copy(position).addScaledVector(direction, CHARGE_GLOW_AHEAD)
    })
  }

  function explosion(position, colorHex, size = 1, opts = {}) {
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
      map: softCircleTexture, transparent: true, opacity: 1, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    })
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    scene.add(points)
    bursts.push({ points, velocities, life: 0 })

    bloomSprite(position, colorHex, size * 0.8)

    if (opts.rings) {
      shockwave(position, colorHex, size * 0.65)
      glassShatter(position, colorHex)
    }

    const ringChance = opts.isBoss ? EXPLOSION_GRAY_RING_CHANCE_BOSS : EXPLOSION_GRAY_RING_CHANCE_NORMAL
    if (opts.rings && Math.random() < ringChance) {
      const count = EXPLOSION_GRAY_RING_COUNT_MIN + Math.floor(Math.random() * (EXPLOSION_GRAY_RING_COUNT_MAX - EXPLOSION_GRAY_RING_COUNT_MIN + 1))
      for (let i = 0; i < count; i += 1) {
        const mesh = makeRingMesh(EXPLOSION_GRAY_RING_COLOR, true)
        mesh.material.side = THREE.FrontSide
        mesh.position.copy(position)
        mesh.quaternion.setFromEuler(new THREE.Euler(
          Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2,
        ))
        mesh.scale.setScalar(EXPLOSION_GRAY_RING_START_SCALE)
        mesh.material.opacity = 0
        scene.add(mesh)
        grayRings.push({
          mesh, life: -Math.random() * 0.1,
          maxScale: (EXPLOSION_GRAY_RING_SCALE_MIN + Math.random() * (EXPLOSION_GRAY_RING_SCALE_MAX - EXPLOSION_GRAY_RING_SCALE_MIN)) * size,
        })
      }
    }
  }

  // ============ MUZZLE FLASH (overhaul v0.85.x) ============
  // 4 camadas brancas com timings escalonados — ver comentário das constantes no topo do
  // arquivo pro raciocínio completo. Todas brancas (0xffffff) com opacidades diferentes: a soma
  // aditiva satura em branco puro no centro (o "instante zero") e desvanece pra zero na borda,
  // que é o ponto do branco — comunicar descarga máxima de energia sem virar um sol ilegível.
  //
  // O entry do muzzleFlashes agora carrega duração/growth/opacidade INICIAIS POR INSTÂNCIA (o
  // array é compartilhado com enemyMuzzleFlare, que mantém o comportamento antigo do flare
  // esférico dos inimigos — mesmo array, formatos de entrada diferentes por campo).
  function muzzleFlash(position, direction) {
    // --- CORE: nasce colado ao canhão, aponta pro lado do tiro, mínimo e brilhante ---
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const coreMesh = new THREE.Mesh(playerMuzzleCoreGeo, coreMat)
    coreMesh.scale.setScalar(1.0)
    coreMesh.position.copy(position).addScaledVector(direction, 0.35)
    coreMesh.quaternion.setFromUnitVectors(_FORWARD_AXIS, direction)
    scene.add(coreMesh)
    muzzleFlashes.push({
      mesh: coreMesh, life: 0,
      duration: MUZZLE_CORE_DURATION,
      initialScale: 1.0, growth: 0.15, startOpacity: 0.95,
    })

    // --- HALO: fora do core, mais largo e mais curto, cresce durante a vida ---
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const haloMesh = new THREE.Mesh(playerMuzzleHaloGeo, haloMat)
    haloMesh.scale.setScalar(1.0)
    haloMesh.position.copy(position).addScaledVector(direction, 0.45)
    haloMesh.quaternion.setFromUnitVectors(_FORWARD_AXIS, direction)
    scene.add(haloMesh)
    muzzleFlashes.push({
      mesh: haloMesh, life: 0,
      duration: MUZZLE_HALO_DURATION,
      initialScale: 1.0, growth: 0.5, startOpacity: 0.55,
    })

    // --- RING: perpendicular ao tiro, expande bastante durante a vida (é o "empurrou o ar") ---
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.7,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const ringMesh = new THREE.Mesh(playerMuzzleRingGeo, ringMat)
    ringMesh.scale.setScalar(1.0)
    ringMesh.position.copy(position).addScaledVector(direction, 0.5)
    // RingGeometry tem normal +Z — setFromUnitVectors alinha essa normal com a direção do tiro,
    // deixando o anel perpendicular a ele. É isso que faz o ring "abrir pra fora" na direção
    // certa em vez de ficar billboard pra câmera.
    ringMesh.quaternion.setFromUnitVectors(_FORWARD_AXIS, direction)
    scene.add(ringMesh)
    muzzleFlashes.push({
      mesh: ringMesh, life: 0,
      duration: MUZZLE_RING_DURATION,
      initialScale: 1.0, growth: 1.8, startOpacity: 0.7,
    })

    // --- SPARKS: mini-cones esticados num leque estreito, ângulos sorteados por disparo ---
    // A randomização por disparo é o que evita que tiros em sequência pareçam o mesmo frame
    // congelado — sem isso, o padrão repetitivo fica óbvio em 2s de tiro automático.
    for (let i = 0; i < MUZZLE_SPARK_COUNT; i++) {
      // Direção da fagulha = direção do tiro girada por um ângulo aleatório num eixo aleatório
      // → distribuição uniforme dentro de um cone estreito ao redor do eixo do disparo
      _muzzleSparkAxis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
      const angle = (Math.random() - 0.5) * MUZZLE_SPARK_SPREAD * 2
      _muzzleSparkDir.copy(direction).applyAxisAngle(_muzzleSparkAxis, angle).normalize()

      const sparkMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.9,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      })
      const sparkMesh = new THREE.Mesh(playerMuzzleSparkGeo, sparkMat)
      // posição inicial = proa + offset do tiro + pequeno desvio lateral aleatório, senão as 4
      // fagulhas nascem todas exatamente no mesmo ponto (leitura de "feixe" em vez de "spray")
      _muzzleSparkPos.copy(position)
        .addScaledVector(direction, 0.6)
        .addScaledVector(_muzzleSparkAxis, (Math.random() - 0.5) * 0.15)
      sparkMesh.position.copy(_muzzleSparkPos)
      sparkMesh.quaternion.setFromUnitVectors(_FORWARD_AXIS, _muzzleSparkDir)
      // escala inicial por instância (0.7 a 1.3) — fagulhas de tamanhos diferentes, dá pra ver
      // o "spray" sem cada uma ficar idêntica
      sparkMesh.scale.setScalar(0.7 + Math.random() * 0.6)
      scene.add(sparkMesh)
      muzzleFlashes.push({
        mesh: sparkMesh, life: 0,
        duration: MUZZLE_SPARK_DURATION,
        initialScale: sparkMesh.scale.x, growth: 0.3, startOpacity: 0.9,
        // velocidade própria — o único componente do flash que se MOVE no espaço, é o que
        // vende "cinético" (sem isso, tudo aqui fica parado no lugar, só crescendo e sumindo)
        velocity: _muzzleSparkDir.clone().multiplyScalar(MUZZLE_SPARK_SPEED),
      })
    }
  }

  // Flare dos inimigos: comportamento preservado — esfera pequena que cresce um pouco e desvanece.
  // Formato de entrada no muzzleFlashes por campos explícitos (não usa os defaults do player).
  function enemyMuzzleFlare(position, colorHex = 0xff5a3d) {
    const material = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(sharedSphereGeometry, material)
    mesh.scale.setScalar(0.35)
    mesh.position.copy(position)
    scene.add(mesh)
    muzzleFlashes.push({
      mesh, life: 0,
      duration: MUZZLE_DURATION,
      initialScale: 0.35, growth: 0.35, startOpacity: 0.95,
    })
  }

  function propulsionBurst(position, direction) {
    const exhaust = position.clone().addScaledVector(direction, -1.8)
    explosion(exhaust, PROPULSION_BURST_COLOR, 1.1)
  }

  function smokeRing(position, direction) {
    const material = new THREE.MeshBasicMaterial({
      color: HOMING_EFFECT_COLOR, transparent: true, opacity: 0.6,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(sharedTorusGeometry, material)
    mesh.position.copy(position)
    _tmpNorm.copy(direction).normalize()
    mesh.quaternion.setFromUnitVectors(_FORWARD_AXIS, _tmpNorm)
    mesh.scale.setScalar(0.4)
    scene.add(mesh)
    smokeRings.push({ mesh, life: 0, velocity: _tmpNorm.clone().multiplyScalar(22) })
  }

  function maxChargeReady(position, direction) {
    const cuePos = position.clone().addScaledVector(direction, 2.0)
    bloomSprite(cuePos, 0x2b8fff, 2.2)
    shockwave(cuePos, 0x2b8fff, 1.0)
    hitSpark(cuePos, 0xffffff)
  }

  function machSpeedRing(position, direction) {
    _tmpNorm.copy(direction).normalize()
    _tmpQuat.setFromUnitVectors(_FORWARD_AXIS, _tmpNorm)
    const material = new THREE.MeshBasicMaterial({
      color: 0x38bdf8, transparent: true, opacity: 0.88,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(sharedTorusGeometry, material)
    mesh.position.copy(position)
    mesh.quaternion.copy(_tmpQuat)
    mesh.scale.setScalar(0.7)
    scene.add(mesh)
    maxChargeRingsList.push({ mesh, life: 0, duration: 0.28, baseScale: 0.7, maxScale: 2.2 })
  }

  function maxChargeRings(position, direction) {
    const normDir = direction.clone().normalize()
    machSpeedRing(position.clone().addScaledVector(normDir, 1.2), normDir)
    machSpeedRing(position.clone().addScaledVector(normDir, 2.6), normDir)
  }

  function spinWind(position, forward, spinDirection = 1) {
    const mesh = makeRingMesh(SPIN_WIND_COLOR, 0.12)
    mesh.position.copy(position)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward.clone().normalize())
    mesh.scale.setScalar(SPIN_WIND_START_SCALE)
    scene.add(mesh)
    spinWinds.push({ mesh, life: 0, spinDirection })
  }

  function ramRing(position, forward) {
    const mesh = makeRingMesh(RAM_RING_COLOR, 0.14)
    mesh.position.copy(position)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward.clone().normalize())
    mesh.scale.setScalar(0.6)
    scene.add(mesh)
    ramRings.push({ mesh, life: 0 })
  }

  function ramAfterimage(position, forward) {
    const geometry = new THREE.ConeGeometry(0.7, 3.6, 4)
    geometry.rotateX(Math.PI / 2)
    const material = new THREE.MeshBasicMaterial({
      color: RAM_AFTERIMAGE_COLOR, transparent: true, opacity: 0.4,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(position)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward.clone().normalize())
    scene.add(mesh)
    ramAfterimages.push({ mesh, life: 0 })
  }

  function rollAfterimage(position, forward) {
    const geometry = new THREE.ConeGeometry(0.7, 3.6, 4)
    geometry.rotateX(Math.PI / 2)
    const material = new THREE.MeshBasicMaterial({
      color: ROLL_AFTERIMAGE_COLOR, transparent: true, opacity: 0.4,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(position)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward.clone().normalize())
    scene.add(mesh)
    rollAfterimages.push({ mesh, life: 0 })
  }

  function dashAfterimage(position, forward) {
    const geometry = new THREE.ConeGeometry(0.7, 3.6, 4)
    geometry.rotateX(Math.PI / 2)
    const material = new THREE.MeshBasicMaterial({
      color: DASH_AFTERIMAGE_COLOR, transparent: true, opacity: 0.45,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(position)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward.clone().normalize())
    scene.add(mesh)
    dashAfterimages.push({ mesh, life: 0 })
  }

  function deflectBurst(position, forward) {
    _tmpNorm.copy(forward).normalize()
    for (let i = 0; i < DEFLECT_RING_COUNT; i += 1) {
      const mesh = makeRingMesh(DEFLECT_RING_COLOR)
      mesh.position.copy(position)
      mesh.quaternion.setFromUnitVectors(_FORWARD_AXIS, _tmpNorm)
      mesh.scale.setScalar(0.3)
      mesh.material.opacity = 0
      scene.add(mesh)
      deflectRings.push({ mesh, life: -i * DEFLECT_RING_STAGGER, maxScale: 2.4 + i * 1.0 })
    }
    ramAfterimage(position, forward)
  }

  function boostTrailParticle(position, forward) {
    const material = new THREE.MeshBasicMaterial({
      color: BOOST_TRAIL_COLOR, transparent: true, opacity: BOOST_TRAIL_OPACITY,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(sharedSphereGeometry, material)
    mesh.scale.setScalar(0.35)
    mesh.position.copy(position)
    scene.add(mesh)
    boostTrails.push({ mesh, life: 0, velocity: forward.clone().multiplyScalar(-BOOST_TRAIL_SPEED) })
  }

  function homingAfterimage(position, quaternion) {
    const material = new THREE.MeshBasicMaterial({
      color: HOMING_EFFECT_COLOR, transparent: true, opacity: 0.45,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(sharedConeGeometry, material)
    mesh.position.copy(position)
    mesh.quaternion.copy(quaternion)
    scene.add(mesh)
    homingAfterimages.push({ mesh, life: 0 })
  }

  // ============ SWIRL BLAST — habilidade base (Docs/# Swirl Blast — Design & Plano de I.md) ============
  // Etapa 5 (§4.3/§4.4/§3.2.3): flash de disparo distinto, trilha de afterimages, explosão de
  // impacto contra chefe/dourado/fragata/escudo.

  // Flash de disparo (§4.3) — "disparo de super ataque": geometrias PRÓPRIAS (swirlFlashConeGeo/
  // swirlFlashRingGeo), grandes, empilhadas em 4 camadas no array `muzzleFlashes` (seu loop de
  // update já é genérico: duração/growth/opacidade por instância, sem depender do player):
  //   1) cone azul grande na saída do canhão (silhueta da explosão)
  //   2) anel de choque expandindo perpendicular ao tiro, SWIRL_FLASH_RING_SCALE×
  //   3) segundo anel (branco, mais lento) — reforça o peso do disparo
  //   4) bloom branco saturado no bico — o "instante zero" da descarga
  function swirlBlastFlash(position, direction, isHoming = false) {
    const normDir = direction.clone().normalize()
    // overhaul v2 — disparo em modo homing (chefe/dourado travado) fica visivelmente mais
    // intenso, reforça "isto vai travar em algo" já no instante do disparo
    const flashOpacity = isHoming ? 1.0 : 0.9

    // 1) cone azul grande
    const coreMat = new THREE.MeshBasicMaterial({
      color: SWIRL_COLOR, transparent: true, opacity: flashOpacity,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const coreMesh = new THREE.Mesh(swirlFlashConeGeo, coreMat)
    coreMesh.position.copy(position).addScaledVector(normDir, 1.8)
    coreMesh.quaternion.setFromUnitVectors(_FORWARD_AXIS, normDir)
    scene.add(coreMesh)
    muzzleFlashes.push({
      mesh: coreMesh, life: 0, duration: SWIRL_FLASH_DURATION,
      initialScale: 1.0, growth: 0.6, startOpacity: flashOpacity,
    })

    // 2) anel de choque principal (azul), expandindo perpendicular ao tiro
    const ringMat = new THREE.MeshBasicMaterial({
      color: SWIRL_COLOR, transparent: true, opacity: 0.85,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const ringMesh = new THREE.Mesh(swirlFlashRingGeo, ringMat)
    ringMesh.position.copy(position).addScaledVector(normDir, 1.0)
    ringMesh.quaternion.setFromUnitVectors(_FORWARD_AXIS, normDir)
    scene.add(ringMesh)
    muzzleFlashes.push({
      mesh: ringMesh, life: 0, duration: SWIRL_FLASH_DURATION,
      initialScale: 1.0, growth: SWIRL_FLASH_RING_SCALE, startOpacity: 0.85,
    })

    // 3) segundo anel (branco, mais lento) — dá peso extra ao disparo
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.7,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const ring2Mesh = new THREE.Mesh(swirlFlashRingGeo, ring2Mat)
    ring2Mesh.position.copy(position).addScaledVector(normDir, 2.0)
    ring2Mesh.quaternion.setFromUnitVectors(_FORWARD_AXIS, normDir)
    scene.add(ring2Mesh)
    muzzleFlashes.push({
      mesh: ring2Mesh, life: 0, duration: SWIRL_FLASH_DURATION * 0.7,
      initialScale: 0.7, growth: 3.5, startOpacity: 0.7,
    })

    // 4) bloom branco saturado no bico
    const bloomMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const bloomMesh = new THREE.Mesh(sharedSphereGeometry, bloomMat)
    bloomMesh.position.copy(position).addScaledVector(normDir, 1.5)
    bloomMesh.scale.setScalar(2.2)
    scene.add(bloomMesh)
    muzzleFlashes.push({
      mesh: bloomMesh, life: 0, duration: 0.22,
      initialScale: 2.2, growth: 1.8, startOpacity: 0.95,
    })
  }

  // Anel de lock (novo, §2 da proposta v2) — aparece brevemente SOBRE o chefe/dourado travado,
  // no instante do disparo, quando o Swirl sai em modo homing. Confirma pro jogador qual alvo.
  // `fireDirection` orienta o anel de frente pra quem disparou (normal = -fireDirection) — sem
  // isso o anel ficaria de perfil pra câmera na maioria dos ângulos (RingGeometry nasce com
  // normal fixa em +Z; este arquivo não tem acesso à câmera pra fazer billboard de verdade).
  function swirlLockReticle(targetPosition, fireDirection) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 1.0,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(swirlLockReticleGeo, material)
    mesh.position.copy(targetPosition)
    if (fireDirection) mesh.quaternion.setFromUnitVectors(_FORWARD_AXIS, fireDirection.clone().normalize().negate())
    scene.add(mesh)
    muzzleFlashes.push({
      mesh, life: 0, duration: SWIRL_LOCK_RETICLE_DURATION,
      initialScale: 1.0, growth: 0.3, startOpacity: 1.0,
    })
  }

  // Afterimage da trilha (§4.4) — geometria própria grande (swirlAfterimageCoreGeo, 3.0×10.0),
  // antes reusava `sharedConeGeometry` (0.5×2.5, mesma do rastro do homing) e lia como um
  // pontinho fino.
  function swirlAfterimage(position, quaternion) {
    const material = new THREE.MeshBasicMaterial({
      color: SWIRL_COLOR, transparent: true, opacity: 0.65,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(swirlAfterimageCoreGeo, material)
    mesh.position.copy(position)
    mesh.quaternion.copy(quaternion)
    scene.add(mesh)
    swirlAfterimages.push({ mesh, life: 0 })
  }

  // Explosão de impacto (§3.2.3) — só acontece contra chefe/dourado/fragata/escudo (regra de
  // negócio mora em combat/projectiles.js, essa função só desenha). SWIRL_EXPLOSION_RADIUS
  // recalibrado pra 4.5 (era 2.5) + shockwave branco extra — leitura de "acabei de quebrar o
  // escudo dele".
  function swirlBlastExplosion(position) {
    explosion(position, SWIRL_COLOR, SWIRL_EXPLOSION_RADIUS, { rings: true })
    shockwave(position, SWIRL_COLOR, SWIRL_EXPLOSION_RADIUS * 1.1)
    shockwave(position, 0xffffff, SWIRL_EXPLOSION_RADIUS * 0.7)

    // Overhaul v2 (§6) — onda de fragmentos triangulares: 8 tetraedros pequenos girando pra fora
    // em leque hemisférico, reforça a leitura "triangular" também no impacto, não só em voo.
    for (let i = 0; i < 8; i += 1) {
      const velocity = randomSphereVelocity(8, 18)
      const material = new THREE.MeshBasicMaterial({
        color: SWIRL_COLOR, transparent: true, opacity: 0.9,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      })
      const mesh = new THREE.Mesh(swirlFragmentGeo, material)
      mesh.position.copy(position)
      mesh.quaternion.setFromEuler(new THREE.Euler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2))
      scene.add(mesh)
      muzzleFlashes.push({
        mesh, life: 0, duration: 0.9,
        initialScale: 1.0, growth: 0.4, startOpacity: 0.9,
        velocity,
      })
    }
  }

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

  function flashMesh(mesh, durationSec = FLASH_DURATION) {
    if (!mesh) return
    if (!mesh.material) {
      if (Array.isArray(mesh.children)) {
        for (const child of mesh.children) flashMesh(child, durationSec)
      }
      return
    }
    let entry = activeFlashes.find((f) => f.mesh === mesh)
    if (entry && entry.materialRef !== mesh.material) {
      activeFlashes.splice(activeFlashes.indexOf(entry), 1)
      entry = null
    }
    if (!entry) {
      if (!mesh.material.__origColorSaved) {
        mesh.material = mesh.material.clone()
        mesh.material.__origColorSaved = true
        mesh.material.__origColor = mesh.material.color.clone()
        mesh.material.__origEmissive = mesh.material.emissive ? mesh.material.emissive.clone() : null
        mesh.material.__origEmissiveIntensity = mesh.material.emissiveIntensity
      }
      entry = { mesh, materialRef: mesh.material, untilMs: 0 }
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
    const material = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(sharedSphereGeometry, material)
    mesh.position.copy(position)
    mesh.scale.setScalar(0.15)
    scene.add(mesh)
    telegraphs.push({ mesh, life: 0 })
  }

  function chargeCircle(positionOrFn, durationSec = 3.0, colorHex = 0xff4d4d) {
    const group = new THREE.Group()
    for (let i = 0; i < 3; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex, transparent: true, opacity: 0.75,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false,
      })
      group.add(new THREE.Mesh(sharedRingGeometry, mat))
    }
    const followFn = typeof positionOrFn === 'function' ? positionOrFn : null
    if (!followFn) group.position.copy(positionOrFn)
    scene.add(group)
    chargeCircles.push({ group, life: 0, duration: durationSec, followFn })
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
      const vel = randomSphereVelocity(GLASS_SHARD_SPEED_MIN, GLASS_SHARD_SPEED_MAX)
      scene.add(mesh)
      shards.push({ mesh, velocity: vel })
    }
    glassShards.push({ shards, life: 0 })
  }

  function bloomSprite(position, colorHex, size = 1) {
    const material = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.6,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(sharedSphereGeometry, material)
    mesh.position.copy(position)
    mesh.scale.setScalar(BLOOM_START_SCALE * size)
    scene.add(mesh)
    bloomSprites.push({ mesh, life: 0, size })
  }

  function contrailParticle(position, colorHex = 0x7fe0ff) {
    const material = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.7,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(sharedSphereGeometry, material)
    mesh.scale.setScalar(CONTRAIL_SIZE)
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

  function ricochetArc(fromPos, toPos) {
    const from = fromPos instanceof THREE.Vector3 ? fromPos : new THREE.Vector3(fromPos.x, fromPos.y, fromPos.z)
    const to = toPos instanceof THREE.Vector3 ? toPos : new THREE.Vector3(toPos.x, toPos.y, toPos.z)
    const dist = from.distanceTo(to)
    if (dist < 1e-3) return

    const mid = from.clone().add(to).multiplyScalar(0.5)
    const dir = to.clone().sub(from).normalize()
    const up = new THREE.Vector3(0, 1, 0)
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir)

    const geo = new THREE.CylinderGeometry(0.12, 0.12, dist, 6)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x55ffff, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.copy(mid)
    mesh.quaternion.copy(quat)
    scene.add(mesh)
    ricochetArcs.push({ mesh, life: 0 })

    hitSpark(from, 0x55ffff)
    hitSpark(to, 0x55ffff)
  }

  // Item 5 (QoL): faíscas em leque quando um tiro acerta mas NÃO mata — `normal` é a direção
  // contrária à do tiro (ver chamador em game-loop.js). Cada faísca é uma esfera compartilhada
  // ESTICADA ao longo da própria velocidade (scale não-uniforme + quaternion alinhado à direção
  // de voo dela), pra ler como um traço fino em vez de um pontinho.
  function ricochetSparks(position, normal, color = RICOCHET_SPARK_COLOR) {
    const norm = normal && normal.lengthSq() > 1e-6 ? normal.clone().normalize() : new THREE.Vector3(0, 0, 1)
    const count = RICOCHET_SPARK_COUNT_MIN + Math.floor(Math.random() * (RICOCHET_SPARK_COUNT_MAX - RICOCHET_SPARK_COUNT_MIN + 1))
    for (let i = 0; i < count; i += 1) {
      const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0)
      axis.normalize()
      const dir = norm.clone().applyAxisAngle(axis, Math.random() * RICOCHET_SPARK_ANGLE).normalize()
      const speed = RICOCHET_SPARK_SPEED_MIN + Math.random() * (RICOCHET_SPARK_SPEED_MAX - RICOCHET_SPARK_SPEED_MIN)

      const material = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.95,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      })
      const mesh = new THREE.Mesh(sharedSphereGeometry, material)
      mesh.position.copy(position)
      mesh.quaternion.setFromUnitVectors(_FORWARD_AXIS, dir)
      mesh.scale.set(0.08, 0.08, 0.5)
      scene.add(mesh)
      ricochetSparkBursts.push({ mesh, velocity: dir.multiplyScalar(speed), life: 0 })
    }
  }

  function enemyThrusterTrail(position, colorHex = 0xff5a3d) {
    if (enemyTrails.length > 90) return
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.8,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(sharedSphereGeometry, mat)
    mesh.scale.setScalar(0.24)
    mesh.position.copy(position)
    scene.add(mesh)
    enemyTrails.push({ mesh, life: 0 })
  }

  function spawnMicroOrbe(position, opts = {}) {
    const kind = opts.kind === 'heal' ? 'heal' : 'frenzy'
    const group = new THREE.Group()
    const core = new THREE.Mesh(microOrbeCoreGeo, kind === 'heal' ? microOrbeHealCoreMat : microOrbeCoreMat)
    const ring = new THREE.Mesh(microOrbeRingGeo, kind === 'heal' ? microOrbeHealRingMat : microOrbeRingMat)
    group.add(core)
    group.add(ring)
    group.position.copy(position)
    scene.add(group)
    microOrbes.push({ group, core, ring, life: 0, kind })
  }

  function updateMicroOrbes(dt, playerPos) {
    microOrbesCollectedThisFrame = 0
    healOrbesCollectedThisFrame = 0
    healOrbeCollectionPositions = []
    if (!playerPos) return
    for (let i = microOrbes.length - 1; i >= 0; i--) {
      const orb = microOrbes[i]
      orb.life += dt
      orb.core.rotation.y += dt * 3.5
      orb.ring.rotation.x += dt * 4.0
      orb.ring.rotation.z += dt * 2.0

      const dist = orb.group.position.distanceTo(playerPos)
      if (dist < 8.5) {
        const pull = playerPos.clone().sub(orb.group.position).normalize().multiplyScalar(24 * dt)
        orb.group.position.add(pull)
      }
      if (dist < 1.7) {
        if (orb.kind === 'heal') {
          healOrbesCollectedThisFrame++
          healOrbeCollectionPositions.push(orb.group.position.clone())
        }
        else microOrbesCollectedThisFrame++
        cardAcquiredPulse(playerPos, orb.kind === 'heal' ? 'defensivo' : 'especial')
        bloomSprite(orb.group.position, orb.kind === 'heal' ? 0x4ade80 : 0x00f2fe, 1.4)
        scene.remove(orb.group)
        microOrbes.splice(i, 1)
        continue
      }

      if (orb.life > 14) {
        scene.remove(orb.group)
        microOrbes.splice(i, 1)
      }
    }
  }

  function cardAcquiredPulse(position, category = 'ofensivo') {
    const colorHex = category === 'ofensivo' ? 0xff4d6d : (category === 'defensivo' ? 0x3ea6ff : 0xffd700)
    shockwave(position, colorHex, 2.2)
    bloomSprite(position, colorHex, 2.5)
    hitSpark(position, colorHex)
  }

  function respawnBurst(position) {
    shockwave(position, 0x55ffff, 2.8)
    shockwave(position, 0xffffff, 1.8)
    bloomSprite(position, 0x55ffff, 3.2)
    hitSpark(position, 0x55ffff)
    hitSpark(position, 0xffffff)
  }

  function hullDamageBurst(position) {
    shockwave(position, 0xff2222, 1.4)
    hitSpark(position, 0xff4422)
    glassShatter(position, 0xff3333)
  }

  function fogWispCondensation(position, colorHex = 0x7fe0ff) {
    const geometry = new THREE.BufferGeometry()
    const count = 5
    const positions = new Float32Array(count * 3)
    const velocities = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x + (Math.random() - 0.5) * 1.6
      positions[i * 3 + 1] = position.y + (Math.random() - 0.5) * 1.6
      positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 1.6
      const theta = Math.random() * Math.PI * 2
      const speed = 1.5 + Math.random() * 2.5
      velocities[i * 3] = Math.cos(theta) * speed
      velocities[i * 3 + 1] = Math.sin(theta) * speed
      velocities[i * 3 + 2] = (Math.random() - 0.5) * speed
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({
      color: colorHex, size: 2.4, sizeAttenuation: true,
      map: softCircleTexture, transparent: true, opacity: 0.65, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    scene.add(points)
    hitSparks.push({ points, velocities, life: 0 })
  }

  function fogCondensationInward(position, colorHex = 0x7fe0ff, hitRadius = 2.0) {
    const count = Math.min(20, Math.max(8, Math.round(hitRadius * 3)))
    const startRadius = hitRadius * 1.5
    const duration = 0.4
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(count * 3)
    const directions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const dx = Math.sin(phi) * Math.cos(theta)
      const dy = Math.sin(phi) * Math.sin(theta)
      const dz = Math.cos(phi)
      positions[i * 3] = position.x + dx * startRadius
      positions[i * 3 + 1] = position.y + dy * startRadius
      positions[i * 3 + 2] = position.z + dz * startRadius
      directions[i * 3] = -dx
      directions[i * 3 + 1] = -dy
      directions[i * 3 + 2] = -dz
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({
      color: colorHex, size: hitRadius * 0.4, sizeAttenuation: true,
      map: softCircleTexture, transparent: true, opacity: 0.85, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: true,
    })
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    scene.add(points)
    condensationInwards.push({ points, directions, startRadius, duration, life: 0 })
  }

  function spawnAnticipation(position, colorHex, radius = 1.0, durationSec = 0.1) {
    const geo = new THREE.RingGeometry(radius * 0.9, radius, 24)
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.6, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.copy(position)
    scene.add(mesh)
    spawnAnticipations.push({ mesh, geo, mat, life: 0, duration: durationSec, radius })
  }

  const distantFlashes = []
  let distantFlashTimer = 3.0
  const DISTANT_FLASH_COLORS = [0x3ea6ff, 0xffaa33, 0xd444ff, 0x55ffff]

  function spawnDistantFlash(centerPos) {
    const angle = Math.random() * Math.PI * 2
    const elevation = (Math.random() - 0.5) * 0.8
    const dist = 260 + Math.random() * 80
    const offset = new THREE.Vector3(
      Math.cos(angle) * Math.cos(elevation) * dist,
      Math.sin(elevation) * dist + 15,
      Math.sin(angle) * Math.cos(elevation) * dist,
    )
    const pos = centerPos ? centerPos.clone().add(offset) : offset
    const color = DISTANT_FLASH_COLORS[Math.floor(Math.random() * DISTANT_FLASH_COLORS.length)]

    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    })
    const mesh = new THREE.Mesh(sharedSphereGeometry, mat)
    mesh.position.copy(pos)
    mesh.scale.setScalar(6)
    scene.add(mesh)
    distantFlashes.push({ mesh, life: 0, maxScale: 14 + Math.random() * 10, maxOpacity: 0.45 + Math.random() * 0.25 })
  }

  const distantSilhouettes = []
  const silhouetteGeometry = new THREE.ConeGeometry(1.2, 5, 4)
  silhouetteGeometry.rotateX(Math.PI / 2)
  const silhouetteMaterial = new THREE.MeshBasicMaterial({
    color: 0x142033, transparent: true, opacity: 0.45,
    depthWrite: false, fog: false,
  })

  function initDistantSilhouettes() {
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(silhouetteGeometry, silhouetteMaterial)
      const x = (Math.random() - 0.5) * 280
      const y = 30 + Math.random() * 70
      const z = -180 - Math.random() * 140
      mesh.position.set(x, y, z)
      mesh.scale.setScalar(1.5 + Math.random() * 1.5)
      const speed = 4 + Math.random() * 6
      const dir = new THREE.Vector3(Math.random() > 0.5 ? 1 : -1, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.3).normalize()
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
      scene.add(mesh)
      distantSilhouettes.push({ mesh, velocity: dir.multiplyScalar(speed) })
    }
  }
  initDistantSilhouettes()

  function lateralDashVFX(position, rightDir, bankDirection) {
    const dir = rightDir.clone().multiplyScalar(Math.sign(bankDirection || 1))
    shockwave(position, 0x4db8ff, 1.2)
    hitSpark(position, 0x7fe0ff)
    for (let i = 0; i < 2; i++) {
      const offsetPos = position.clone().addScaledVector(dir, -(i + 1) * 1.8)
      contrailParticle(offsetPos, 0x3ea6ff)
    }
  }

  function summersaultVFX(position, forward) {
    spinWind(position, forward, 1)
    shockwave(position, 0x7fe0ff, 1.4)
    bloomSprite(position, 0x3ea6ff, 2.0)
  }

  function extraLifeHeal(position) {
    shockwave(position, 0xffd700, 2.0)
    shockwave(position, 0x44ff88, 1.5)
    bloomSprite(position, 0xffd700, 2.6)
    hitSpark(position, 0xffea77)
    hitSpark(position, 0x55ff99)
  }

  function wingmanSpawn(position) {
    shockwave(position, 0x3ea6ff, 1.3)
    bloomSprite(position, 0x7fe0ff, 2.2)
    hitSpark(position, 0x3ea6ff)
  }

  function maxChargeImpact(position, radius = 6) {
    shockwave(position, 0x3ea6ff, radius * 0.4)
    shockwave(position, 0x7fe0ff, radius * 0.25)
    shockwave(position, 0xffffff, radius * 0.15)
    bloomSprite(position, 0x3ea6ff, radius * 0.6)
    bloomSprite(position, 0xffffff, radius * 0.3)
    explosion(position, 0x3ea6ff, radius, { rings: true })
    hitSpark(position, 0x7fe0ff)
    hitSpark(position, 0xffffff)
  }

  function goldenDashVFX(position, direction) {
    shockwave(position, 0xffe066, 1.3)
    bloomSprite(position, 0xffd700, 1.8)
    const norm = direction ? direction.clone().normalize() : new THREE.Vector3(1, 0, 0)
    for (let i = 0; i < 4; i++) {
      const p = position.clone().addScaledVector(norm, i * 1.5)
      hitSpark(p, 0xffe066)
    }
  }

  function flankSpawnTrail(position, velocity, colorHex = 0x7fe0ff) {
    fogWispCondensation(position, colorHex)
    const geometry = new THREE.BufferGeometry()
    const count = 4
    const positions = new Float32Array(count * 3)
    const vels = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x
      positions[i * 3 + 1] = position.y
      positions[i * 3 + 2] = position.z
      vels[i * 3] = (velocity ? velocity.x : 0) * 0.2 + (Math.random() - 0.5) * 4
      vels[i * 3 + 1] = (velocity ? velocity.y : 0) * 0.2 + (Math.random() - 0.5) * 4
      vels[i * 3 + 2] = (velocity ? velocity.z : 0) * 0.2 + (Math.random() - 0.5) * 4
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({
      color: colorHex, size: 2.0, sizeAttenuation: true,
      map: softCircleTexture, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    scene.add(points)
    hitSparks.push({ points, velocities: vels, life: 0 })
  }

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

  function update(dt, shipPosition, shipForward, opts = {}) {
    const { skipTrail = false, boostActive = false, ramActive = false, rollActive = false, dashActive = false } = opts
    const now = performance.now()
    const cam = opts.camera

    if (!skipTrail && shipPosition && shipForward) {
      engineFlameMesh.visible = true
      _tmpExhaust.copy(shipPosition).addScaledVector(shipForward, -1.8)
      engineFlameMesh.position.copy(_tmpExhaust)
      _tmpNorm.copy(shipForward).normalize()
      engineFlameMesh.quaternion.setFromUnitVectors(_BACKWARD_AXIS, _tmpNorm)
      const flicker = 1 + Math.sin(now * 0.001 * ENGINE_FLAME_FLICKER_RATE) * ENGINE_FLAME_FLICKER_AMOUNT
      const boostT = boostActive ? 1 : 0
      const radius = THREE.MathUtils.lerp(ENGINE_FLAME_RADIUS, ENGINE_FLAME_BOOST_RADIUS, boostT)
      const length = THREE.MathUtils.lerp(ENGINE_FLAME_LENGTH, ENGINE_FLAME_BOOST_LENGTH, boostT)
      engineFlameMesh.scale.set(
        (radius / ENGINE_FLAME_RADIUS) * flicker,
        (radius / ENGINE_FLAME_RADIUS) * flicker,
        (length / ENGINE_FLAME_LENGTH) * flicker,
      )
      engineFlameMaterial.color.set(boostActive ? ENGINE_FLAME_BOOST_COLOR : ENGINE_FLAME_COLOR)
      engineFlameMaterial.opacity = THREE.MathUtils.lerp(ENGINE_FLAME_OPACITY, ENGINE_FLAME_BOOST_OPACITY, boostT)
    } else {
      engineFlameMesh.visible = false
    }

    if (ramActive && shipPosition && shipForward) {
      ramShieldMesh.visible = true
      ramShieldMesh.position.copy(shipPosition)
      ramShieldMesh.scale.setScalar(RAM_SHIELD_RADIUS)
      ramShieldMesh.rotation.x += dt * RAM_SHIELD_SPIN_X
      ramShieldMesh.rotation.y += dt * RAM_SHIELD_SPIN_Y

      ramRingTimer -= dt
      if (ramRingTimer <= 0) {
        ramRingTimer = RAM_RING_INTERVAL
        ramRing(shipPosition, shipForward)
      }
      ramAfterimageTimer -= dt
      if (ramAfterimageTimer <= 0) {
        ramAfterimageTimer = RAM_AFTERIMAGE_INTERVAL
        ramAfterimage(shipPosition, shipForward)
      }
    } else {
      ramShieldMesh.visible = false
    }

    if (boostActive && shipPosition && shipForward) {
      boostTrailTimer -= dt
      if (boostTrailTimer <= 0) {
        boostTrailTimer = BOOST_TRAIL_INTERVAL
        const exhaust = shipPosition.clone().addScaledVector(shipForward, -2.4)
        boostTrailParticle(exhaust, shipForward)
      }
    }

    if (rollActive && shipPosition && shipForward) {
      rollAfterimageTimer -= dt
      if (rollAfterimageTimer <= 0) {
        rollAfterimageTimer = ROLL_AFTERIMAGE_INTERVAL
        rollAfterimage(shipPosition, shipForward)
      }
    }

    if (dashActive && shipPosition && shipForward) {
      dashAfterimageTimer -= dt
      if (dashAfterimageTimer <= 0) {
        dashAfterimageTimer = DASH_AFTERIMAGE_INTERVAL
        dashAfterimage(shipPosition, shipForward)
      }
    } else {
      dashAfterimageTimer = 0 // dispara imediato no próximo dash, sem esperar sobra do timer anterior
    }

    {
      const attr = dustGeometry.attributes.position
      const arr = attr.array
      for (let i = 0; i < DUST_COUNT; i++) {
        const i3 = i * 3
        arr[i3]   += dustVelocities[i3]   * dt
        arr[i3+1] += dustVelocities[i3+1] * dt
        arr[i3+2] += dustVelocities[i3+2] * dt

        if (arr[i3] > DUST_AREA_CENTER.x + DUST_AREA_HALF_X) arr[i3] -= DUST_AREA_HALF_X * 2
        else if (arr[i3] < DUST_AREA_CENTER.x - DUST_AREA_HALF_X) arr[i3] += DUST_AREA_HALF_X * 2
        if (arr[i3+1] > DUST_AREA_CENTER.y + DUST_AREA_HALF_Y) arr[i3+1] -= DUST_AREA_HALF_Y * 2
        else if (arr[i3+1] < DUST_AREA_CENTER.y - DUST_AREA_HALF_Y) arr[i3+1] += DUST_AREA_HALF_Y * 2
        if (arr[i3+2] > DUST_AREA_CENTER.z + DUST_AREA_HALF_Z) arr[i3+2] -= DUST_AREA_HALF_Z * 2
        else if (arr[i3+2] < DUST_AREA_CENTER.z - DUST_AREA_HALF_Z) arr[i3+2] += DUST_AREA_HALF_Z * 2
      }
      attr.needsUpdate = true
    }

    {
      const attr = fogWispGeometry.attributes.position
      const arr = attr.array
      for (let i = 0; i < FOG_WISP_COUNT; i++) {
        const i3 = i * 3
        arr[i3]   += fogWispVelocities[i3]   * dt
        arr[i3+1] += fogWispVelocities[i3+1] * dt
        arr[i3+2] += fogWispVelocities[i3+2] * dt

        if (arr[i3] > FOG_WISP_AREA_CENTER.x + FOG_WISP_AREA_HALF_X) arr[i3] -= FOG_WISP_AREA_HALF_X * 2
        else if (arr[i3] < FOG_WISP_AREA_CENTER.x - FOG_WISP_AREA_HALF_X) arr[i3] += FOG_WISP_AREA_HALF_X * 2
        if (arr[i3+1] > FOG_WISP_AREA_CENTER.y + FOG_WISP_AREA_HALF_Y) arr[i3+1] -= FOG_WISP_AREA_HALF_Y * 2
        else if (arr[i3+1] < FOG_WISP_AREA_CENTER.y - FOG_WISP_AREA_HALF_Y) arr[i3+1] += FOG_WISP_AREA_HALF_Y * 2
        if (arr[i3+2] > FOG_WISP_AREA_CENTER.z + FOG_WISP_AREA_HALF_Z) arr[i3+2] -= FOG_WISP_AREA_HALF_Z * 2
        else if (arr[i3+2] < FOG_WISP_AREA_CENTER.z - FOG_WISP_AREA_HALF_Z) arr[i3+2] += FOG_WISP_AREA_HALF_Z * 2
      }
      attr.needsUpdate = true
    }

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

    for (let i = grayRings.length - 1; i >= 0; i--) {
      const r = grayRings[i]
      r.life += dt
      if (r.life < 0) continue
      const t = r.life / EXPLOSION_GRAY_RING_DURATION
      if (t >= 1) {
        scene.remove(r.mesh); r.mesh.material.dispose()
        grayRings.splice(i, 1); continue
      }
      const scale = EXPLOSION_GRAY_RING_START_SCALE + (r.maxScale - EXPLOSION_GRAY_RING_START_SCALE) * Math.sqrt(t)
      const majorScale = scale * (1 + t * 1.05)
      r.mesh.scale.set(majorScale, scale, 1)
      r.mesh.material.opacity = 0.85 * (1 - t)
    }

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

    for (let i = condensationInwards.length - 1; i >= 0; i--) {
      const c = condensationInwards[i]
      c.life += dt
      const t = c.life / c.duration
      if (t >= 1) {
        scene.remove(c.points); c.points.geometry.dispose(); c.points.material.dispose()
        condensationInwards.splice(i, 1); continue
      }
      const attr = c.points.geometry.attributes.position
      const arr = attr.array
      const speed = c.startRadius / c.duration
      for (let j = 0; j < arr.length; j += 3) {
        arr[j] += c.directions[j] * speed * dt
        arr[j + 1] += c.directions[j + 1] * speed * dt
        arr[j + 2] += c.directions[j + 2] * speed * dt
      }
      attr.needsUpdate = true
      c.points.material.opacity = 0.85 * (1 - t * t)
    }

    for (let i = spawnAnticipations.length - 1; i >= 0; i--) {
      const a = spawnAnticipations[i]
      a.life += dt
      const t = a.life / a.duration
      if (t >= 1) {
        scene.remove(a.mesh); a.geo.dispose(); a.mat.dispose()
        spawnAnticipations.splice(i, 1); continue
      }
      const scale = 1 + (1 - t) * 0.4
      a.mesh.scale.setScalar(scale)
      a.mesh.material.opacity = 0.6 * (1 - t)
    }

    // MUZZLE FLASHES — loop reescrito: cada entry carrega a própria duração/growth/opacidade
    // inicial (player usa 4 camadas com timings diferentes; enemy flare mantém o comportamento
    // antigo). Fagulhas têm velocity própria — é o único componente que se move.
    for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
      const m = muzzleFlashes[i]
      m.life += dt
      const t = m.life / m.duration
      if (t >= 1) {
        scene.remove(m.mesh); m.mesh.material.dispose()
        muzzleFlashes.splice(i, 1); continue
      }
      if (m.velocity) m.mesh.position.addScaledVector(m.velocity, dt)
      m.mesh.material.opacity = Math.max(0, m.startOpacity * (1 - t))
      const s = m.initialScale * (1 + t * m.growth)
      m.mesh.scale.setScalar(s)
    }

    for (let i = smokeRings.length - 1; i >= 0; i--) {
      const s = smokeRings[i]
      s.life += dt
      const t = s.life / SMOKE_RING_DURATION
      if (t >= 1) {
        scene.remove(s.mesh); s.mesh.material.dispose()
        smokeRings.splice(i, 1); continue
      }
      s.mesh.position.addScaledVector(s.velocity, dt)
      s.mesh.scale.setScalar(0.4 + t * 4.5)
      s.mesh.material.opacity = 0.6 * (1 - t)
    }

    for (let i = maxChargeRingsList.length - 1; i >= 0; i--) {
      const r = maxChargeRingsList[i]
      r.life += dt
      if (r.life < 0) continue
      const t = r.life / (r.duration || 0.28)
      if (t >= 1) {
        scene.remove(r.mesh); r.mesh.material.dispose()
        maxChargeRingsList.splice(i, 1); continue
      }
      const grow = r.baseScale + (r.maxScale - r.baseScale) * Math.sin(t * Math.PI * 0.5)
      r.mesh.scale.setScalar(grow)
      r.mesh.material.opacity = 0.88 * (1 - t)
    }

    for (let i = spinWinds.length - 1; i >= 0; i--) {
      const w = spinWinds[i]
      w.life += dt
      const t = w.life / SPIN_WIND_DURATION
      if (t >= 1) {
        scene.remove(w.mesh); w.mesh.material.dispose()
        spinWinds.splice(i, 1); continue
      }
      const scale = SPIN_WIND_START_SCALE + (SPIN_WIND_MAX_SCALE - SPIN_WIND_START_SCALE) * Math.sqrt(t)
      w.mesh.scale.setScalar(scale)
      w.mesh.material.opacity = 0.75 * (1 - t)
      w.mesh.rotateZ(dt * SPIN_WIND_SPIN_RATE * w.spinDirection)
    }

    for (let i = ramRings.length - 1; i >= 0; i--) {
      const r = ramRings[i]
      r.life += dt
      const t = r.life / RAM_RING_DURATION
      if (t >= 1) {
        scene.remove(r.mesh); r.mesh.material.dispose()
        ramRings.splice(i, 1); continue
      }
      const scale = 0.6 + (RAM_RING_MAX_SCALE - 0.6) * Math.sqrt(t)
      r.mesh.scale.setScalar(scale)
      r.mesh.material.opacity = 0.8 * (1 - t)
    }

    for (let i = ramAfterimages.length - 1; i >= 0; i--) {
      const a = ramAfterimages[i]
      a.life += dt
      const t = a.life / RAM_AFTERIMAGE_DURATION
      if (t >= 1) {
        scene.remove(a.mesh); a.mesh.geometry.dispose(); a.mesh.material.dispose()
        ramAfterimages.splice(i, 1); continue
      }
      a.mesh.material.opacity = 0.4 * (1 - t)
      a.mesh.scale.setScalar(1 - t * 0.3)
    }

    for (let i = rollAfterimages.length - 1; i >= 0; i--) {
      const a = rollAfterimages[i]
      a.life += dt
      const t = a.life / ROLL_AFTERIMAGE_DURATION
      if (t >= 1) {
        scene.remove(a.mesh); a.mesh.geometry.dispose(); a.mesh.material.dispose()
        rollAfterimages.splice(i, 1); continue
      }
      a.mesh.material.opacity = 0.4 * (1 - t)
      a.mesh.scale.setScalar(1 - t * 0.3)
    }

    for (let i = dashAfterimages.length - 1; i >= 0; i--) {
      const a = dashAfterimages[i]
      a.life += dt
      const t = a.life / DASH_AFTERIMAGE_DURATION
      if (t >= 1) {
        scene.remove(a.mesh); a.mesh.geometry.dispose(); a.mesh.material.dispose()
        dashAfterimages.splice(i, 1); continue
      }
      a.mesh.material.opacity = 0.45 * (1 - t)
      a.mesh.scale.setScalar(1 - t * 0.3)
    }

    for (let i = deflectRings.length - 1; i >= 0; i--) {
      const r = deflectRings[i]
      r.life += dt
      if (r.life < 0) continue
      const t = r.life / DEFLECT_RING_DURATION
      if (t >= 1) {
        scene.remove(r.mesh); r.mesh.material.dispose()
        deflectRings.splice(i, 1); continue
      }
      const scale = 0.3 + (r.maxScale - 0.3) * Math.sqrt(t)
      r.mesh.scale.setScalar(scale)
      r.mesh.material.opacity = 0.8 * (1 - t)
    }

    for (let i = boostTrails.length - 1; i >= 0; i--) {
      const c = boostTrails[i]
      c.life += dt
      const t = c.life / BOOST_TRAIL_DURATION
      if (t >= 1) {
        scene.remove(c.mesh); c.mesh.material.dispose()
        boostTrails.splice(i, 1); continue
      }
      c.mesh.position.addScaledVector(c.velocity, dt)
      c.mesh.material.opacity = BOOST_TRAIL_OPACITY * (1 - t)
      c.mesh.scale.setScalar(1 - t * 0.3)
    }

    for (let i = homingAfterimages.length - 1; i >= 0; i--) {
      const a = homingAfterimages[i]
      a.life += dt
      const t = a.life / HOMING_AFTERIMAGE_DURATION
      if (t >= 1) {
        scene.remove(a.mesh); a.mesh.material.dispose()
        homingAfterimages.splice(i, 1); continue
      }
      a.mesh.material.opacity = 0.45 * (1 - t)
      a.mesh.scale.setScalar(1 - t * 0.4)
    }

    // Swirl Blast — mesma ideia do loop de cima, timing/escala próprios (§4.4: 1.0 → 0.85)
    for (let i = swirlAfterimages.length - 1; i >= 0; i--) {
      const a = swirlAfterimages[i]
      a.life += dt
      const t = a.life / SWIRL_AFTERIMAGE_DURATION
      if (t >= 1) {
        scene.remove(a.mesh); a.mesh.material.dispose()
        swirlAfterimages.splice(i, 1); continue
      }
      a.mesh.material.opacity = 0.5 * (1 - t)
      a.mesh.scale.setScalar(1 - t * 0.15)
    }

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

    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const s = shockwaves[i]
      s.life += dt
      const t = s.life / SHOCKWAVE_DURATION
      if (t >= 1) {
        scene.remove(s.mesh); s.mesh.material.dispose()
        shockwaves.splice(i, 1); continue
      }
      const scale = 0.3 + (s.maxScale - 0.3) * Math.sqrt(t)
      s.mesh.scale.setScalar(scale)
      s.mesh.material.opacity = 0.85 * (1 - t)
      if (cam) s.mesh.quaternion.copy(cam.quaternion)
    }

    for (let i = bossImpactRings.length - 1; i >= 0; i--) {
      const s = bossImpactRings[i]
      s.life += dt
      const t = s.life / BOSS_IMPACT_DURATION
      if (t >= 1) {
        scene.remove(s.mesh); s.mesh.material.dispose()
        bossImpactRings.splice(i, 1); continue
      }
      const scale = 0.4 + (s.maxScale - 0.4) * Math.sqrt(t)
      s.mesh.scale.setScalar(scale)
      s.mesh.material.opacity = 0.9 * (1 - t)
      if (cam) s.mesh.quaternion.copy(cam.quaternion)
    }

    for (let i = chargeCircles.length - 1; i >= 0; i--) {
      const c = chargeCircles[i]
      c.life += dt
      const t = c.life / c.duration
      if (t >= 1) {
        scene.remove(c.group)
        for (const child of c.group.children) { child.material.dispose() }
        chargeCircles.splice(i, 1); continue
      }
      if (c.followFn) {
        const p = c.followFn()
        if (p) c.group.position.copy(p)
      }
      if (cam) c.group.quaternion.copy(cam.quaternion)
      c.group.children.forEach((child, idx) => {
        const speed = 1.0 + idx * 0.6
        child.scale.setScalar(1.0 + t * 4.0 * speed)
        child.material.opacity = t > 0.9 ? 1.0 : 0.75 * (1 - t * 0.4)
      })
    }

    for (let i = telegraphs.length - 1; i >= 0; i--) {
      const tg = telegraphs[i]
      tg.life += dt
      const t = tg.life / TELEGRAPH_DURATION
      if (t >= 1) {
        scene.remove(tg.mesh); tg.mesh.material.dispose()
        telegraphs.splice(i, 1); continue
      }
      const s = 0.15 + (TELEGRAPH_MAX_SCALE - 0.15) * t
      tg.mesh.scale.setScalar(s)
      tg.mesh.material.opacity = 0.5 + 0.5 * Math.sin(t * Math.PI * 4)
    }

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

    for (let i = bloomSprites.length - 1; i >= 0; i--) {
      const b = bloomSprites[i]
      b.life += dt
      const t = b.life / BLOOM_DURATION
      if (t >= 1) {
        scene.remove(b.mesh); b.mesh.material.dispose()
        bloomSprites.splice(i, 1); continue
      }
      const scale = BLOOM_START_SCALE + (BLOOM_END_SCALE - BLOOM_START_SCALE) * Math.sqrt(t)
      b.mesh.scale.setScalar(scale * b.size)
      b.mesh.material.opacity = 0.6 * (1 - t)
    }

    for (let i = contrails.length - 1; i >= 0; i--) {
      const c = contrails[i]
      c.life += dt
      const t = c.life / CONTRAIL_DURATION
      if (t >= 1) {
        scene.remove(c.mesh); c.mesh.material.dispose()
        contrails.splice(i, 1); continue
      }
      c.mesh.material.opacity = 0.7 * (1 - t)
      c.mesh.scale.setScalar(1 - t * 0.7)
    }

    for (let i = enemyTrails.length - 1; i >= 0; i--) {
      const et = enemyTrails[i]
      et.life += dt
      const t = et.life / ENEMY_TRAIL_DURATION
      if (t >= 1) {
        scene.remove(et.mesh)
        et.mesh.material.dispose()
        enemyTrails.splice(i, 1)
        continue
      }
      et.mesh.material.opacity = 0.8 * (1 - t)
      et.mesh.scale.setScalar(0.24 * (1 - t * 0.6))
    }

    updateMicroOrbes(dt, shipPosition || opts.playerPosition)

    for (let i = ricochetArcs.length - 1; i >= 0; i--) {
      const arc = ricochetArcs[i]
      arc.life += dt
      const t = arc.life / RICOCHET_ARC_DURATION
      if (t >= 1) {
        scene.remove(arc.mesh)
        arc.mesh.geometry.dispose()
        arc.mesh.material.dispose()
        ricochetArcs.splice(i, 1)
        continue
      }
      arc.mesh.material.opacity = (1 - t) * 0.95
    }

    for (let i = ricochetSparkBursts.length - 1; i >= 0; i--) {
      const p = ricochetSparkBursts[i]
      p.life += dt
      const t = p.life / RICOCHET_SPARK_DURATION
      if (t >= 1) {
        scene.remove(p.mesh)
        p.mesh.material.dispose()
        ricochetSparkBursts.splice(i, 1)
        continue
      }
      p.mesh.position.addScaledVector(p.velocity, dt)
      p.velocity.multiplyScalar(Math.max(0, 1 - dt * RICOCHET_SPARK_DECAY_RATE))
      p.mesh.material.opacity = 0.95 * (1 - t)
    }

    distantFlashTimer -= dt
    if (distantFlashTimer <= 0) {
      distantFlashTimer = 2.5 + Math.random() * 3.5
      spawnDistantFlash(shipPosition)
    }
    for (let i = distantFlashes.length - 1; i >= 0; i--) {
      const f = distantFlashes[i]
      f.life += dt
      const t = f.life / 0.55
      if (t >= 1) {
        scene.remove(f.mesh)
        f.mesh.material.dispose()
        distantFlashes.splice(i, 1)
        continue
      }
      const curve = Math.sin(t * Math.PI)
      f.mesh.scale.setScalar(6 + (f.maxScale - 6) * t)
      f.mesh.material.opacity = f.maxOpacity * curve
    }

    for (const s of distantSilhouettes) {
      s.mesh.position.addScaledVector(s.velocity, dt)
      if (shipPosition) {
        if (s.mesh.position.x - shipPosition.x > 220) s.mesh.position.x -= 440
        else if (s.mesh.position.x - shipPosition.x < -220) s.mesh.position.x += 440
      }
    }

    for (let i = activeFlashes.length - 1; i >= 0; i--) {
      const f = activeFlashes[i]
      if (f.mesh.material !== f.materialRef) {
        activeFlashes.splice(i, 1); continue
      }
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

    if (gridPulseTimer > 0 && gridRef && gridRef.material) {
      gridPulseTimer = Math.max(0, gridPulseTimer - dt)
      const t = 1 - gridPulseTimer / GRID_PULSE_DURATION
      const intensity = Math.sin(t * Math.PI)
      if (gridRef.material.color && gridRef.material.__origColor) {
        gridRef.material.color.copy(gridRef.material.__origColor).lerp(_GRID_PULSE_COLOR, intensity * 0.8)
      }
    } else if (gridRef && gridRef.material && gridRef.material.__origColor) {
      gridRef.material.color.copy(gridRef.material.__origColor)
    }
  }

  function spawnContrailTick(wingmenPositions, dt) {
    contrailTimer -= dt
    if (contrailTimer <= 0) {
      contrailTimer = CONTRAIL_INTERVAL
      for (const p of wingmenPositions) contrailParticle(p)
    }
  }

  function dispose() {
    scene.remove(stars); starGeometry.dispose(); starMaterial.dispose()
    scene.remove(dustPoints); dustGeometry.dispose(); dustMaterial.dispose()
    scene.remove(fogWispPoints); fogWispGeometry.dispose(); fogWispMaterial.dispose(); softCircleTexture.dispose()
    scene.remove(engineFlameMesh); engineFlameGeometry.dispose(); engineFlameMaterial.dispose()
    scene.remove(ramShieldMesh); ramShieldGeometry.dispose(); ramShieldMaterial.dispose()
    for (const r of ramRings) { scene.remove(r.mesh); r.mesh.material.dispose() }
    for (const a of ramAfterimages) { scene.remove(a.mesh); a.mesh.geometry.dispose(); a.mesh.material.dispose() }
    for (const a of rollAfterimages) { scene.remove(a.mesh); a.mesh.geometry.dispose(); a.mesh.material.dispose() }
    for (const a of dashAfterimages) { scene.remove(a.mesh); a.mesh.geometry.dispose(); a.mesh.material.dispose() }
    for (const r of deflectRings) { scene.remove(r.mesh); r.mesh.material.dispose() }
    for (const r of maxChargeRingsList) { scene.remove(r.mesh); r.mesh.material.dispose() }
    for (const c of boostTrails) { scene.remove(c.mesh); c.mesh.material.dispose() }
    for (const b of bursts) { scene.remove(b.points); b.points.geometry.dispose(); b.points.material.dispose() }
    for (const r of grayRings) { scene.remove(r.mesh); r.mesh.material.dispose() }
    for (const s of hitSparks) { scene.remove(s.points); s.points.geometry.dispose(); s.points.material.dispose() }
    for (const c of condensationInwards) { scene.remove(c.points); c.points.geometry.dispose(); c.points.material.dispose() }
    for (const a of spawnAnticipations) { scene.remove(a.mesh); a.geo.dispose(); a.mat.dispose() }
    for (const m of muzzleFlashes) { scene.remove(m.mesh); m.mesh.material.dispose() }
    for (const s of smokeRings) { scene.remove(s.mesh); s.mesh.material.dispose() }
    for (const a of homingAfterimages) { scene.remove(a.mesh); a.mesh.material.dispose() }
    for (const a of swirlAfterimages) { scene.remove(a.mesh); a.mesh.material.dispose() }
    for (const p of projectileTrails) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose() }
    for (const s of shockwaves) { scene.remove(s.mesh); s.mesh.material.dispose() }
    for (const s of bossImpactRings) { scene.remove(s.mesh); s.mesh.material.dispose() }
    for (const c of chargeCircles) {
      scene.remove(c.group)
      for (const child of c.group.children) { child.material.dispose() }
    }
    chargeCircles.length = 0
    for (const t of telegraphs) { scene.remove(t.mesh); t.mesh.material.dispose() }
    for (const g of glassShards) { for (const s of g.shards) { scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose() } }
    for (const b of bloomSprites) { scene.remove(b.mesh); b.mesh.material.dispose() }
    for (const c of contrails) { scene.remove(c.mesh); c.mesh.material.dispose() }
    for (const w of spinWinds) { scene.remove(w.mesh); w.mesh.material.dispose() }
    for (const a of ricochetArcs) { scene.remove(a.mesh); a.mesh.geometry.dispose(); a.mesh.material.dispose() }
    for (const p of ricochetSparkBursts) { scene.remove(p.mesh); p.mesh.material.dispose() }
    for (const et of enemyTrails) { scene.remove(et.mesh); et.mesh.material.dispose() }
    for (const o of microOrbes) { scene.remove(o.group) }
    for (const f of distantFlashes) { scene.remove(f.mesh); f.mesh.material.dispose() }
    for (const s of distantSilhouettes) { scene.remove(s.mesh); }
    silhouetteGeometry.dispose()
    silhouetteMaterial.dispose()
    sharedSphereGeometry.dispose()
    sharedRingGeometry.dispose()
    sharedWideRingGeometry.dispose()
    sharedTorusGeometry.dispose()
    sharedConeGeometry.dispose()
    // Geometrias do muzzle flash (overhaul v0.85.x — 4 no lugar de 1)
    playerMuzzleCoreGeo.dispose()
    playerMuzzleHaloGeo.dispose()
    playerMuzzleRingGeo.dispose()
    playerMuzzleSparkGeo.dispose()
    // Geometrias do Swirl Blast (overhaul visual — ver bloco de constantes SWIRL_* no topo do arquivo)
    swirlFlashConeGeo.dispose()
    swirlFlashRingGeo.dispose()
    swirlAfterimageCoreGeo.dispose()
    swirlLockReticleGeo.dispose()
    swirlFragmentGeo.dispose()
    microOrbeCoreGeo.dispose()
    microOrbeRingGeo.dispose()
    microOrbeCoreMat.dispose()
    microOrbeRingMat.dispose()
    microOrbeHealCoreMat.dispose()
    microOrbeHealRingMat.dispose()
    enemyTrails.length = 0
    microOrbes.length = 0
    ricochetArcs.length = 0
    ricochetSparkBursts.length = 0
    distantFlashes.length = 0
    distantSilhouettes.length = 0
    bursts.length = 0; grayRings.length = 0; hitSparks.length = 0; muzzleFlashes.length = 0
    condensationInwards.length = 0; spawnAnticipations.length = 0
    smokeRings.length = 0; homingAfterimages.length = 0
    projectileTrails.length = 0; shockwaves.length = 0; bossImpactRings.length = 0
    telegraphs.length = 0; glassShards.length = 0
    bloomSprites.length = 0; contrails.length = 0; activeFlashes.length = 0
    spinWinds.length = 0
    ramRings.length = 0; ramAfterimages.length = 0; boostTrails.length = 0; rollAfterimages.length = 0
    dashAfterimages.length = 0
    deflectRings.length = 0
    for (const layer of chargeGlowLayers) { scene.remove(layer.mesh); layer.geo.dispose(); layer.mat.dispose() }
  }

  return {
    update, updateMicroOrbes, explosion, muzzleFlash, enemyMuzzleFlare, enemyThrusterTrail, spawnMicroOrbe,
    getMicroOrbesCollected: () => microOrbesCollectedThisFrame,
    getHealOrbesCollected: () => healOrbesCollectedThisFrame,
    getHealOrbeCollectionPositions: () => healOrbeCollectionPositions,
    setChargeGlow, smokeRing, homingAfterimage,
    swirlBlastFlash, swirlAfterimage, swirlBlastExplosion, swirlLockReticle,
    hitSpark, flashMesh, projectileTrail, shockwave, telegraph, chargeCircle,
    propulsionBurst, glassShatter, bloomSprite, contrailParticle, bossImpactRing,
    gridPulse, spawnContrailTick, spinWind, deflectBurst,
    maxChargeReady, maxChargeRings, machSpeedRing,
    ricochetArc, ricochetSparks, cardAcquiredPulse, respawnBurst, hullDamageBurst,
    fogWispCondensation, fogCondensationInward, spawnAnticipation,
    lateralDashVFX, summersaultVFX, extraLifeHeal, wingmanSpawn,
    maxChargeImpact, goldenDashVFX, flankSpawnTrail,
    dispose,
  }
}
