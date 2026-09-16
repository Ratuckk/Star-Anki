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
// pedido do usuário: "volte atrás" pras partículas pequenas (a v0.32.1 tinha trocado isso por
// anéis colados na câmera, "círculos feios estranhos" — não era o pedido) — de volta ao burst
// de partículas pequenas voando pra fora, só que agora com textura circular de verdade
// (softCircleTexture, já usada nos wisps de neblina) no lugar de PointsMaterial sem `map`, que
// é o que fazia cada partícula renderizar como quadrado sólido antes.
const EXPLOSION_PARTICLES = 26
const EXPLOSION_DURATION = 0.75
const EXPLOSION_SPEED_MIN = 14
const EXPLOSION_SPEED_MAX = 28
const EXPLOSION_PARTICLE_SIZE = 0.9

// pedido do usuário: além das partículas, explosão de INIMIGO morrendo (não dano na nave, não
// burst de propulsão) ganha 1-2 argolas grandes CINZAS, tamanho aleatório, em ângulo 3D
// aleatório fixo (não coladas na câmera — de propósito, pra lerem como destroço de verdade
// visto de lado, não um círculo plano sempre de frente).
const EXPLOSION_GRAY_RING_COUNT_MIN = 1
const EXPLOSION_GRAY_RING_COUNT_MAX = 3
const EXPLOSION_GRAY_RING_COLOR = 0x999999
const EXPLOSION_GRAY_RING_DURATION = 0.65
const EXPLOSION_GRAY_RING_SCALE_MIN = 1.6
const EXPLOSION_GRAY_RING_SCALE_MAX = 3.4
const EXPLOSION_GRAY_RING_START_SCALE = 0.2
// pedido do usuário: nem toda morte solta as argolas — chance de 45% (chefe: 80%, opts.isBoss)
// em vez de sempre; e a argola em si passa a ser visível só de um lado (FrontSide) em vez dos
// 2 lados do plano (DoubleSide, o padrão de makeRingMesh — só as cinzas mudam, os outros usos
// de makeRingMesh continuam DoubleSide)
const EXPLOSION_GRAY_RING_CHANCE_NORMAL = 0.45
const EXPLOSION_GRAY_RING_CHANCE_BOSS = 0.8

// ============ MUZZLE FLASH ============
const MUZZLE_DURATION = 0.07

// ============ CHARGE GLOW ============
const CHARGE_GLOW_AHEAD = 2.2
// v0.29.6: verde-lima em 4 camadas concêntricas em vez de 1 esfera azul — cada camada tem seu
// próprio tamanho/opacidade min-max, interpolados pela fração de carga. SÃO a referência visual
// de quanto falta carregar agora (a barra de carga no HUD foi removida).
const CHARGE_GLOW_COLOR = 0xaaff33
// pedido do usuário: o brilho de carga fica AZUL ao atingir 100% — mesmo azul do tiro disparado
// nessa condição (ver homingMaxChargeMaterial em combat/projectiles.js), pra virar um aviso
// visual único e consistente de "esse tiro vai causar dano em área".
const CHARGE_GLOW_MAX_COLOR = 0x2b8fff
const CHARGE_GLOW_LAYERS = [
  { scaleMin: 0.30, scaleMax: 0.85, opacityMin: 0.85, opacityMax: 0.40 },
  { scaleMin: 0.55, scaleMax: 1.30, opacityMin: 0.55, opacityMax: 0.28 },
  { scaleMin: 0.85, scaleMax: 1.80, opacityMin: 0.32, opacityMax: 0.18 },
  { scaleMin: 1.20, scaleMax: 2.40, opacityMin: 0.18, opacityMax: 0.10 },
]
// pedido do usuário (correção de um item já entregue antes): cada camada deve SURGIR em
// intervalos ao longo da carga em vez de todas aparecerem juntas desde o início — com 4
// camadas, o threshold de revelação é `i / n` (0, 0.25, 0.5, 0.75), ou seja, ~0s, ~0.75s,
// ~1.5s e ~2.25s de carga (a janela total de carga é de 3s, ver homingChargeMaxMs −
// homingChargeMinMs em player.js). Cada camada cresce daí até o tamanho máximo, todas
// convergindo junto em f=1. Também pedido: pulso "vivo" e -30% de opacidade.
//
// (comentário anterior dizia "0s, 1s, 2s, 3s" — mentia em relação ao código: `threshold = i / n`
// divide a janela em partes IGUAIS entre as camadas, não em passos de 1s.)
const CHARGE_GLOW_PULSE_RATE = 6 // rad/s
const CHARGE_GLOW_PULSE_AMOUNT = 0.12
const CHARGE_GLOW_OPACITY_MULT = 0.7 // -30%

// ============ ENGINE FLAME (Fase 7) ============
// pedido: "o efeito visual de propulsar de movimento normal deve ser apenas uma animação única
// de fogo azul constante ao invés de vários círculos" — substitui o antigo spawn de esferas
// por intervalo (ENGINE_TRAIL_*/cauda-cometa) por UM único mesh persistente (chama), que só
// muda de tamanho/cor/intensidade conforme o boost, em vez de multiplicar cópias.
const ENGINE_FLAME_COLOR = 0x4db8ff
const ENGINE_FLAME_BOOST_COLOR = 0x1f6bff
const ENGINE_FLAME_LENGTH = 1.5
const ENGINE_FLAME_BOOST_LENGTH = 3.4
const ENGINE_FLAME_RADIUS = 0.34
const ENGINE_FLAME_BOOST_RADIUS = 0.55
const ENGINE_FLAME_OPACITY = 0.55
const ENGINE_FLAME_BOOST_OPACITY = 0.85
const ENGINE_FLAME_FLICKER_RATE = 16 // rad/s da oscilação de tamanho ("fogo vivo", sem ser vários círculos)
const ENGINE_FLAME_FLICKER_AMOUNT = 0.12

// ============ PROPULSION BURST (Fase 7) ============
// "explosão azul em formato de fogo" no instante em que a propulsão é ativada — some com o
// mesmo padrão de bloomSprite/explosion já usados no resto do jogo, só com cor/forma de chama.
const PROPULSION_BURST_COLOR = 0x2f8bff
const PROPULSION_BURST_DURATION = 0.35

// ============ IMPULSO ARÍETE (item 12) ============
// pedido do usuário: o impulso ariete (carta "propulsion-ram") não tinha NENHUM efeito visual
// pra indicar que está ativo — verifiquei o código, o dano de verdade acontece (ramDamage
// repassado até enemies.js), só faltava feedback. "Aquele efeito antigo de escudo circular
// azul" é a bolha de escudo (shieldBubble) que existiu em fases antigas e foi removida —
// reconstruída aqui só pro ram (não mais ligada ao escudo normal), e "mais angular" vira um
// icosaedro wireframe (facetado) em vez da esfera-grade original.
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

// ============ GIRO REBATEDOR (carta roguelike "deflect", item 6) ============
// pedido do usuário: "invoque argolas azuis quando realiza o movimento junto de um afterimage
// azul pra indicar o efeito" — burst único (não contínuo, o giro em si é instantâneo) disparado
// só quando a carta deflect está ativa E o giro completo acontece de verdade.
const DEFLECT_RING_COLOR = 0x4da6ff
const DEFLECT_RING_COUNT = 3
const DEFLECT_RING_STAGGER = 0.06
const DEFLECT_RING_DURATION = 0.45

// ============ AFTERIMAGE DO ROLAMENTO (item 3) ============
// pedido do usuário: "não faça mais a nave piscar quando realiza o rolamento e dê a ela um
// efeito de afterimage" — o flicker de invencibilidade é compartilhado com dano/ram (mesmo
// invincibleTimer em player.js), então main.js usa um timer PARALELO (rollIframeTimer) só pra
// saber que a invencibilidade atual é do giro completo, suprime o flicker nessa janela e passa
// rollActive=true aqui em vez disso.
const ROLL_AFTERIMAGE_INTERVAL = 0.04
const ROLL_AFTERIMAGE_DURATION = 0.3

// ============ RICOCHETE E FREIO REVERSO ============
const RICOCHET_ARC_DURATION = 0.18
const REVERSE_BRAKE_LIFETIME = 0.18
const REVERSE_BRAKE_INTERVAL = 0.04
const ROLL_AFTERIMAGE_COLOR = 0xcfe9ff

// ============ TRAIL DE PROPULSÃO (item 12, restaurado) ============
// pedido do usuário: de volta o rastro tipo cometa que existia antes da Fase 7 (removido junto
// com o sistema antigo de partículas do motor), mas agora só aparece durante o IMPULSO em si —
// a chama única (engineFlame, sempre visível) continua cobrindo o voo normal.
const BOOST_TRAIL_INTERVAL = 0.05
const BOOST_TRAIL_DURATION = 0.9
const BOOST_TRAIL_SPEED = 14
const BOOST_TRAIL_COLOR = 0xffa64d
const BOOST_TRAIL_OPACITY = 0.5

// ============ FOG WISPS (Fase 7 / item antigo do Fase C) ============
// "asset/efeito que deixe a neblina reconhecível como neblina" — antes só o FogExp2 (sem
// nenhuma pista visual direta). Nuvens grandes, suaves e esparsas, no mesmo padrão de volume
// fixo em espaço-mundo da poeira ambiente (o jogador atravessa, não persegue a câmera).
const FOG_WISP_COUNT = 46
const FOG_WISP_SIZE_MIN = 3.5
const FOG_WISP_SIZE_MAX = 7
const FOG_WISP_OPACITY = 0.1
const FOG_WISP_COLOR = 0xc7d6e8
const FOG_WISP_AREA_CENTER = { x: -30, y: 2, z: -80 }
const FOG_WISP_AREA_HALF_X = 140
const FOG_WISP_AREA_HALF_Y = 18
const FOG_WISP_AREA_HALF_Z = 140
const FOG_WISP_DRIFT_SPEED = 0.6

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

// ============ SPIN WIND (giro completo) ============
// anel que "varre o ar" no plano do roll, acompanhando o giro de 360° — não é uma explosão,
// é mais um sopro circular. Perpendicular ao forward da nave (mesma técnica do smokeRing).
const SPIN_WIND_DURATION = 0.5
const SPIN_WIND_START_SCALE = 0.5
const SPIN_WIND_MAX_SCALE = 4.5
const SPIN_WIND_COLOR = 0xb4e4ff
const SPIN_WIND_SPIN_RATE = 8 // rad/s, sentido igual ao giro (direction)

// ============ TIRO CARREGADO MÁXIMO (item 9) ============
// pedido do usuário: marco visual ao atingir 100% de carga + argolas ovais curtas disparadas junto
const MAX_CHARGE_RING_COLOR = 0x2b8fff
const MAX_CHARGE_RING_DURATION = 0.38
const MAX_CHARGE_RING_SPEED = 58
const MAX_CHARGE_RING_COUNT = 3

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

  // ============ FOG WISPS (Fase 7) ============
  // nuvens grandes e esparsas, mesmo padrão de volume fixo da poeira ambiente (acima) — dá uma
  // pista visual direta de "neblina" além do FogExp2 puro (que sozinho não tem nenhuma forma
  // reconhecível, só escurece a distância).
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
  // PointsMaterial não suporta tamanho por vértice sem shader customizado — todo wisp usa o
  // mesmo tamanho médio (mantém o mesmo padrão simples do resto do arquivo). `map` com a
  // textura de círculo suave é o que faz ler como nuvem, não como quadrado cinza sólido.
  const softCircleTexture = makeSoftCircleTexture()
  const fogWispMaterial = new THREE.PointsMaterial({
    color: FOG_WISP_COLOR, size: (FOG_WISP_SIZE_MIN + FOG_WISP_SIZE_MAX) / 2, sizeAttenuation: true,
    map: softCircleTexture, transparent: true, opacity: FOG_WISP_OPACITY, depthWrite: false, fog: false,
  })
  const fogWispPoints = new THREE.Points(fogWispGeometry, fogWispMaterial)
  fogWispPoints.frustumCulled = false
  scene.add(fogWispPoints)

  // (bolha de escudo removida — o escudo continua funcionando mecanicamente, só não é mais
  // desenhado como esfera ao redor da nave)

  // ============ CHARGE GLOW (v0.29.6: 4 esferas verde-lima) ============
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

  // ============ ENGINE FLAME (Fase 7, persistente — ver comentário da constante) ============
  const engineFlameGeometry = new THREE.ConeGeometry(ENGINE_FLAME_RADIUS, ENGINE_FLAME_LENGTH, 10)
  engineFlameGeometry.rotateX(-Math.PI / 2) // ponta aponta pra -Z local, alinhada com o eixo (0,0,-1) usado no update()
  const engineFlameMaterial = new THREE.MeshBasicMaterial({
    color: ENGINE_FLAME_COLOR, transparent: true, opacity: ENGINE_FLAME_OPACITY,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  })
  const engineFlameMesh = new THREE.Mesh(engineFlameGeometry, engineFlameMaterial)
  engineFlameMesh.visible = false
  scene.add(engineFlameMesh)

  // ============ ESCUDO DO IMPULSO ARÍETE (item 12, persistente) ============
  // icosaedro wireframe (facetado/"anguloso") em vez da esfera-grade original — só visível
  // enquanto o impulso ariete está de fato ativo (ramActive), ver update().
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
  const hitSparks = []
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
  const deflectRings = []
  const maxChargeRingsList = []
  const ricochetArcs = []
  const reverseBrakeJetsList = []
  let contrailTimer = 0
  let ramRingTimer = 0
  let ramAfterimageTimer = 0
  let boostTrailTimer = 0
  let rollAfterimageTimer = 0
  let reverseBrakeTimer = 0

  // ============ GEOMETRIAS COMPARTILHADAS (VBO POOLING & ZERO-ALLOC) ============
  // Em vez de instanciar e destruir geometrias na VRAM a cada tiro/shockwave/bloom,
  // reutilizamos geometrias canônicas unitárias e ajustamos via mesh.scale.
  const sharedSphereGeometry = new THREE.SphereGeometry(1, 8, 8)
  const sharedRingGeometry = new THREE.RingGeometry(0.85, 1.0, 24)
  const sharedTorusGeometry = new THREE.TorusGeometry(1, 0.15, 8, 20)
  const sharedConeGeometry = new THREE.ConeGeometry(0.5, 2.5, 6)
  sharedConeGeometry.rotateX(Math.PI / 2)

  const _FORWARD_AXIS = new THREE.Vector3(0, 0, 1)
  const _BACKWARD_AXIS = new THREE.Vector3(0, 0, -1)
  const _GRID_PULSE_COLOR = new THREE.Color(0xff8844)
  const _tmpExhaust = new THREE.Vector3()
  const _tmpNorm = new THREE.Vector3()
  const _tmpQuat = new THREE.Quaternion()

  // ============ SHOCKWAVE / RING HELPERS ============
  function makeRingMesh(colorHex) {
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.85,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false,
    })
    const mesh = new THREE.Mesh(sharedRingGeometry, mat)
    mesh.frustumCulled = false
    return mesh
  }

  // ============ EFEITOS EXISTENTES ============
  function setChargeGlow(active, fraction, position, direction) {
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
      // progresso PRÓPRIO da camada — começa em 0 assim que ela é revelada (pequena) e converge
      // pro tamanho máximo em f=1 junto com as outras, não importa quando cada uma apareceu
      const localT = threshold >= 1 ? 1 : Math.min(1, (f - threshold) / (1 - threshold))
      // pulso "vivo", com fase diferente por camada pra não pulsarem todas em uníssono
      const pulse = 1 + Math.sin(now * 0.001 * CHARGE_GLOW_PULSE_RATE + i * 1.7) * CHARGE_GLOW_PULSE_AMOUNT
      layer.mesh.scale.setScalar((scaleMin + (scaleMax - scaleMin) * localT) * pulse)
      layer.mat.opacity = (opacityMin + (opacityMax - opacityMin) * localT) * CHARGE_GLOW_OPACITY_MULT
      layer.mesh.position.copy(position).addScaledVector(direction, CHARGE_GLOW_AHEAD)
    })
  }

  // opts.rings: só as explosões de INIMIGO sendo destruído (chefe/dourado/comum) pedem as
  // argolas cinzas grandes extras — dano na nave e o burst de propulsão continuam só com as
  // partículas pequenas (pedido do usuário, escopo explícito: "as explosões de inimigos").
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

    // flash central que expande rápido — dá o "punch" que faltava nas explosões menores
    bloomSprite(position, colorHex, size * 0.8)

    // argolas cinzas grandes, tamanho e ângulo 3D aleatórios (fixo — não colam na câmera, pra
    // lerem como destroço de verdade visto de um ângulo qualquer, não um círculo sempre de frente)
    const ringChance = opts.isBoss ? EXPLOSION_GRAY_RING_CHANCE_BOSS : EXPLOSION_GRAY_RING_CHANCE_NORMAL
    if (opts.rings && Math.random() < ringChance) {
      const count = EXPLOSION_GRAY_RING_COUNT_MIN + Math.floor(Math.random() * (EXPLOSION_GRAY_RING_COUNT_MAX - EXPLOSION_GRAY_RING_COUNT_MIN + 1))
      for (let i = 0; i < count; i += 1) {
        const mesh = makeRingMesh(EXPLOSION_GRAY_RING_COLOR, 0.16 + Math.random() * 0.14)
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

  function muzzleFlash(position, direction) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xfff2a8, transparent: true, opacity: 1,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    })
    const mesh = new THREE.Mesh(sharedSphereGeometry, material)
    mesh.scale.setScalar(0.4)
    mesh.position.copy(position).addScaledVector(direction, 0.6)
    scene.add(mesh)
    muzzleFlashes.push({ mesh, life: 0 })
  }

  // "explosão azul em formato de fogo" no instante em que a propulsão é ativada (Fase 7) —
  // reaproveita o explosion() já existente (partículas + bloomSprite de punch), só na cor de
  // chama e na saída do motor (atrás da nave) em vez de na ponta.
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
    // v0.29.6: a argola viaja pra frente (mesma direção do disparo) em vez de ficar parada
    // na origem — combina melhor com o tiro carregado saindo voando
    smokeRings.push({ mesh, life: 0, velocity: _tmpNorm.clone().multiplyScalar(22) })
  }

  // marco visual ao atingir 100% de carga (item 9)
  function maxChargeReady(position, direction) {
    const cuePos = position.clone().addScaledVector(direction, 2.0)
    bloomSprite(cuePos, 0x2b8fff, 2.2)
    shockwave(cuePos, 0x2b8fff, 1.0)
    hitSpark(cuePos, 0xffffff)
  }

  // anéis circulares de velocidade Mach emitidos na frente do tiro carregado em alta velocidade (pedido do usuário)
  function machSpeedRing(position, direction) {
    _tmpNorm.copy(direction).normalize()
    _tmpQuat.setFromUnitVectors(_FORWARD_AXIS, _tmpNorm)
    const material = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
    const mesh = new THREE.Mesh(sharedTorusGeometry, material)
    mesh.position.copy(position)
    mesh.quaternion.copy(_tmpQuat)
    mesh.scale.setScalar(0.7)
    scene.add(mesh)
    maxChargeRingsList.push({
      mesh,
      life: 0,
      duration: 0.28,
      baseScale: 0.7,
      maxScale: 2.2,
    })
  }

  function maxChargeRings(position, direction) {
    const normDir = direction.clone().normalize()
    machSpeedRing(position.clone().addScaledVector(normDir, 1.2), normDir)
    machSpeedRing(position.clone().addScaledVector(normDir, 2.6), normDir)
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

  // argola perpendicular ao forward, ao redor do jogador — pedido do usuário, item 12 ("invoque
  // argolas ao redor do jogador durante o impulso"), mesma técnica de spinWind/smokeRing
  function ramRing(position, forward) {
    const mesh = makeRingMesh(RAM_RING_COLOR, 0.14)
    mesh.position.copy(position)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward.clone().normalize())
    mesh.scale.setScalar(0.6)
    scene.add(mesh)
    ramRings.push({ mesh, life: 0 })
  }

  // afterimage da nave durante o impulso ariete (item 12) — silhueta simplificada (cone), mesmo
  // padrão de homingAfterimage abaixo, só maior e azul (tema do ram) em vez de verde.
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

  // afterimage do giro completo (item 3) — mesma silhueta simplificada, cor neutra (não é tema
  // de nenhuma carta específica, só marca "a nave passou por aqui girando")
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

  // burst único de argolas azuis + 1 afterimage — disparado só quando a carta "giro rebatedor"
  // de fato deflete projéteis (item 6), pra marcar visualmente que esse giro fez algo a mais
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
    ramAfterimage(position, forward) // mesmo azul (RAM_AFTERIMAGE_COLOR), reaproveitado de propósito
  }

  // trail tipo cometa durante o impulso (qualquer propulsão, não só ram) — pedido do usuário,
  // item 12 último pedido: "traga devolta esse trail de propulsar apenas quando o jogador
  // realiza um impulso". Mesma técnica do antigo cometTrailParticle (removido na Fase 7).
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
  //
  // v0.51.0 — `materialRef` rastreia QUAL material foi clonado pra essa entrada. Se o mesh
  // trocar de material por fora (chefe mudando de fase faz `enemy.mesh.material =
  // bossPhaseMaterials[phase]`), o clone vira órfão: no update, uma entrada com
  // `materialRef !== mesh.material` é descartada em vez de tentar restaurar cores num material
  // que já não é o do mesh — restaurar clobberaria o material NOVO (que é COMPARTILHADO entre
  // instâncias do mesmo tipo). Sem isso, o flash ficava pendurado lendo `__origColor` do
  // clone antigo, e o mesh novo (recém-trocado) ficava travado em branco até o timeout expirar.
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
      // material trocado desde que a entrada foi criada — descarta a antiga e cria nova em
      // cima do material atual
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

  // ============ CHARGE CIRCLE (laser do chefe, v0.29.6) ============
  // 3 anéis concêntricos que crescem ao longo de `durationSec`, marcando onde um laser vai
  // chegar — o jogador tem esse tempo todo pra sair de cima. Perto do fim (90%+) ficam sólidos,
  // sinal de "agora vai".
  // `positionOrFn`: um THREE.Vector3 fixo (comportamento original) OU uma função `() => Vector3`
  // chamada a cada frame — pedido do usuário: o telegraph do laser do chefe/dourado precisa
  // continuar "mirando" a posição atual do jogador durante todo o aviso, não travar num ponto
  // fixo no instante em que começou a marcar.
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
    // billboard pra câmera a cada frame no update() — igual shockwave/bossImpactRing — pra
    // ficar sempre de frente pro jogador, não importa de onde o laser vem
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

  // feixe elétrico entre alvos atingidos pelo tiro Ricochete
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
      color: 0x55ffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.copy(mid)
    mesh.quaternion.copy(quat)
    scene.add(mesh)
    ricochetArcs.push({ mesh, life: 0 })

    hitSpark(from, 0x55ffff)
    hitSpark(to, 0x55ffff)
  }

  function spawnReverseBrakeJetParticle(pos, vel) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x7fe0ff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    })
    const mesh = new THREE.Mesh(sharedSphereGeometry, mat)
    mesh.scale.setScalar(0.22)
    mesh.position.copy(pos)
    scene.add(mesh)
    reverseBrakeJetsList.push({ mesh, velocity: vel, life: 0 })
  }

  function reverseBrakeJets(position, forward, right) {
    const fwd = forward ? forward.clone().normalize() : new THREE.Vector3(0, 0, -1)
    const rgt = right ? right.clone().normalize() : new THREE.Vector3(1, 0, 0)

    const leftJetOrigin = position.clone().addScaledVector(rgt, -1.1).addScaledVector(fwd, 0.4)
    const rightJetOrigin = position.clone().addScaledVector(rgt, 1.1).addScaledVector(fwd, 0.4)

    const leftDir = fwd.clone().multiplyScalar(18).addScaledVector(rgt, -4)
    const rightDir = fwd.clone().multiplyScalar(18).addScaledVector(rgt, 4)

    spawnReverseBrakeJetParticle(leftJetOrigin, leftDir)
    spawnReverseBrakeJetParticle(rightJetOrigin, rightDir)
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

  // ============ CONDENSAÇÃO DE INIMIGO NA NEBLINA ============
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

  // ============ CLARÕES DE BATALHA DISTANTES NO FUNDO ============
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

  // ============ SILHUETAS DE NAVES DISTANTES NO CENÁRIO ============
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

  // ============ MANOBRAS ESPECIAIS DE ARENA (ALL-RANGE) ============
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

  function emergencyBrakeVFX(position, forward, right) {
    reverseBrakeJets(position, forward, right)
    shockwave(position, 0xffffff, 1.0)
    shockwave(position, 0x7fe0ff, 1.6)
    hitSpark(position, 0xffffff)
  }

  // ============ CURA / VIDA EXTRA E WINGMAN SPAWN ============
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

  // ============ IMPACTO DO TIRO CARREGADO NO MÁXIMO (Seção 7 do backlog) ============
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

  // ============ DASH EVASIVO DO INIMIGO DOURADO (Seções 5 e 7 do backlog) ============
  function goldenDashVFX(position, direction) {
    shockwave(position, 0xffe066, 1.3)
    bloomSprite(position, 0xffd700, 1.8)
    const norm = direction ? direction.clone().normalize() : new THREE.Vector3(1, 0, 0)
    for (let i = 0; i < 4; i++) {
      const p = position.clone().addScaledVector(norm, i * 1.5)
      hitSpark(p, 0xffe066)
    }
  }

  // ============ RASTRO DE FLANQUEAMENTO NA ENTRADA (Seção 2.3 do backlog) ============
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
    const { skipTrail = false, boostActive = false, ramActive = false, rollActive = false, repulsionActive = false, shipRight = null } = opts
    const now = performance.now()
    const cam = opts.camera

    // ENGINE FLAME (Fase 7) — chama única e persistente em vez de partículas spawnadas por
    // intervalo: só muda tamanho/cor/opacidade conforme o boost, nunca multiplica cópias.
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

    // IMPULSO ARÍETE (item 12) — escudo angular + argolas + afterimage, só enquanto ramActive
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

    // TRAIL DE PROPULSÃO (item 12) — só durante o impulso de verdade, qualquer propulsão
    if (boostActive && shipPosition && shipForward) {
      boostTrailTimer -= dt
      if (boostTrailTimer <= 0) {
        boostTrailTimer = BOOST_TRAIL_INTERVAL
        const exhaust = shipPosition.clone().addScaledVector(shipForward, -2.4)
        boostTrailParticle(exhaust, shipForward)
      }
    }

    // AFTERIMAGE DO ROLAMENTO (item 3) — só durante a janela de i-frames do giro completo
    if (rollActive && shipPosition && shipForward) {
      rollAfterimageTimer -= dt
      if (rollAfterimageTimer <= 0) {
        rollAfterimageTimer = ROLL_AFTERIMAGE_INTERVAL
        rollAfterimage(shipPosition, shipForward)
      }
    }

    // JATOS DE FREIO REVERSO (repulsor ativo)
    if (repulsionActive && shipPosition && shipForward) {
      reverseBrakeTimer -= dt
      if (reverseBrakeTimer <= 0) {
        reverseBrakeTimer = REVERSE_BRAKE_INTERVAL
        reverseBrakeJets(shipPosition, shipForward, shipRight)
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

    // FOG WISPS (Fase 7) — mesmo padrão de drift+wrap da poeira ambiente acima, só que num
    // volume menor/mais próximo e com nuvens bem maiores e mais suaves.
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

    // EXPLOSION BURSTS — partículas pequenas voando pra fora com atrito, revertido ao estilo de
    // antes da v0.32.1 (pedido do usuário) — agora com textura circular de verdade, não mais
    // PointsMaterial sem `map` (que renderizava cada partícula como quadrado sólido).
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

    // ARGOLAS CINZAS GRANDES (só explosão de inimigo, ver opts.rings) — ângulo fixo (setado na
    // criação, NÃO billboard) pra ler como destroço de verdade visto de um ângulo qualquer.
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
      r.mesh.scale.setScalar(scale)
      r.mesh.material.opacity = 0.8 * (1 - t)
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
        scene.remove(m.mesh); m.mesh.material.dispose()
        muzzleFlashes.splice(i, 1); continue
      }
      m.mesh.material.opacity = 1 - t
      m.mesh.scale.setScalar(1 + t * 1.5)
    }

    // SMOKE RINGS
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

    // MAX CHARGE MACH SPEED RINGS (anéis circulares que expandem e desvanecem no trajeto)
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

    // SPIN WINDS (giro completo)
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

    // RAM RINGS (item 12)
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

    // RAM AFTERIMAGES (item 12)
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

    // ROLL AFTERIMAGES (item 3)
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

    // DEFLECT RINGS (giro rebatedor, item 6)
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

    // BOOST TRAIL (item 12, tipo cometa — só durante o impulso)
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

    // HOMING AFTERIMAGES
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

    // BOSS IMPACT RINGS
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

    // CHARGE CIRCLES (laser do chefe) — 3 anéis, cada um cresce numa velocidade diferente
    // (o mais interno mais rápido) pra dar sensação de "convergindo por dentro"; nos últimos
    // 10% ficam quase sólidos, sinalizando "vai disparar"
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

    // TELEGRAPHS
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
        scene.remove(b.mesh); b.mesh.material.dispose()
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
        scene.remove(c.mesh); c.mesh.material.dispose()
        contrails.splice(i, 1); continue
      }
      c.mesh.material.opacity = 0.7 * (1 - t)
      c.mesh.scale.setScalar(1 - t * 0.7)
    }

    // RICOCHET ARCS
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

    // REVERSE BRAKE JETS
    for (let i = reverseBrakeJetsList.length - 1; i >= 0; i--) {
      const p = reverseBrakeJetsList[i]
      p.life += dt
      const t = p.life / REVERSE_BRAKE_LIFETIME
      if (t >= 1) {
        scene.remove(p.mesh)
        p.mesh.material.dispose()
        reverseBrakeJetsList.splice(i, 1)
        continue
      }
      p.mesh.position.addScaledVector(p.velocity, dt)
      p.mesh.material.opacity = (1 - t) * 0.85
      p.mesh.scale.setScalar(1 + t * 1.5)
    }

    // CLARÕES DISTANTES NO FUNDO CÓSMICO
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

    // SILHUETAS DISTANTES NAVEGANDO NO HORIZONTE
    for (const s of distantSilhouettes) {
      s.mesh.position.addScaledVector(s.velocity, dt)
      if (shipPosition) {
        if (s.mesh.position.x - shipPosition.x > 220) s.mesh.position.x -= 440
        else if (s.mesh.position.x - shipPosition.x < -220) s.mesh.position.x += 440
      }
    }

    // ACTIVE FLASHES (mesh branco)
    //
    // v0.51.0 — checa `materialRef` antes de tudo: se o mesh trocou de material por fora desde
    // que a entrada foi criada (chefe mudando de fase é o único caso hoje), descarta sem tentar
    // restaurar cores. Restaurar clobberaria o material NOVO do mesh, que é COMPARTILHADO por
    // todas as instâncias do mesmo tipo (ex: todos os bosses futuros na fase 2 usam o MESMO
    // `bossPhaseMaterials[1]`) — um restore errado aqui tingiria todos eles de branco pra sempre.
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

    // GRID PULSE
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

  // permite que o main.js agende um contrail dos wingmen manualmente
  //
  // v0.51.0 — recebe `dt` do chamador (main.js) em vez de assumir passo fixo de 1/60. Antes
  // disso, a 30fps o contrail spawnava METADE das partículas esperadas (contrailTimer
  // decrementava 2× mais devagar que o dt real), e a 144fps spawnava quase o dobro — a taxa
  // dependia do FPS do jogador. Todos os outros temporizadores do arquivo já respeitavam dt;
  // este era o único ponto que tinha assumido 60fps hardcoded.
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
    for (const r of deflectRings) { scene.remove(r.mesh); r.mesh.material.dispose() }
    for (const r of maxChargeRingsList) { scene.remove(r.mesh); r.mesh.material.dispose() }
    for (const c of boostTrails) { scene.remove(c.mesh); c.mesh.material.dispose() }
    for (const b of bursts) { scene.remove(b.points); b.points.geometry.dispose(); b.points.material.dispose() }
    for (const r of grayRings) { scene.remove(r.mesh); r.mesh.material.dispose() }
    for (const s of hitSparks) { scene.remove(s.points); s.points.geometry.dispose(); s.points.material.dispose() }
    for (const m of muzzleFlashes) { scene.remove(m.mesh); m.mesh.material.dispose() }
    for (const s of smokeRings) { scene.remove(s.mesh); s.mesh.material.dispose() }
    for (const a of homingAfterimages) { scene.remove(a.mesh); a.mesh.material.dispose() }
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
    for (const j of reverseBrakeJetsList) { scene.remove(j.mesh); j.mesh.material.dispose() }
    for (const f of distantFlashes) { scene.remove(f.mesh); f.mesh.material.dispose() }
    for (const s of distantSilhouettes) { scene.remove(s.mesh); }
    silhouetteGeometry.dispose()
    silhouetteMaterial.dispose()
    sharedSphereGeometry.dispose()
    sharedRingGeometry.dispose()
    sharedTorusGeometry.dispose()
    sharedConeGeometry.dispose()
    ricochetArcs.length = 0
    reverseBrakeJetsList.length = 0
    distantFlashes.length = 0
    distantSilhouettes.length = 0
    bursts.length = 0; grayRings.length = 0; hitSparks.length = 0; muzzleFlashes.length = 0
    smokeRings.length = 0; homingAfterimages.length = 0
    projectileTrails.length = 0; shockwaves.length = 0; bossImpactRings.length = 0
    telegraphs.length = 0; glassShards.length = 0
    bloomSprites.length = 0; contrails.length = 0; activeFlashes.length = 0
    spinWinds.length = 0
    ramRings.length = 0; ramAfterimages.length = 0; boostTrails.length = 0; rollAfterimages.length = 0
    deflectRings.length = 0
    for (const layer of chargeGlowLayers) { scene.remove(layer.mesh); layer.geo.dispose(); layer.mat.dispose() }
  }

  return {
    update, explosion, muzzleFlash, setChargeGlow, smokeRing, homingAfterimage,
    hitSpark, flashMesh, projectileTrail, shockwave, telegraph, chargeCircle,
    propulsionBurst, glassShatter, bloomSprite, contrailParticle, bossImpactRing,
    gridPulse, spawnContrailTick, spinWind, deflectBurst,
    maxChargeReady, maxChargeRings, machSpeedRing,
    ricochetArc, reverseBrakeJets, cardAcquiredPulse, respawnBurst, hullDamageBurst,
    fogWispCondensation,
    lateralDashVFX, summersaultVFX, emergencyBrakeVFX, extraLifeHeal, wingmanSpawn,
    maxChargeImpact, goldenDashVFX, flankSpawnTrail,
    dispose,
  }
}
