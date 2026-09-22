import * as THREE from 'three'
import { aiValidator } from './ai-validator.js'
import {
  SPEEDLINES_DEFAULTS,
  SPEEDLINES_PRESETS,
  intensityBand,
  normalizeSpeedlinesState,
  visualCurves,
} from './speedlines-prototype-model.js'

const viewport = document.querySelector('#viewport')
const overlay = document.querySelector('#speedlines')
const overlayCtx = overlay.getContext('2d')
const renderer = new THREE.WebGLRenderer({ canvas: viewport, antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.1

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x000000)
scene.fog = new THREE.FogExp2(0x000000, 0.0034)
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 520)
camera.position.set(0, 7, 24)
camera.lookAt(0, -1, -92)

scene.add(new THREE.HemisphereLight(0x86bfff, 0x09101a, 2.0))
const keyLight = new THREE.DirectionalLight(0xffffff, 3.2)
keyLight.position.set(-22, 35, 18)
scene.add(keyLight)
const rimLight = new THREE.PointLight(0x397dff, 95, 130)
rimLight.position.set(28, 18, -70)
scene.add(rimLight)

const grid = new THREE.GridHelper(310, 42, 0x1b3855, 0x102238)
grid.position.set(0, -8, -105)
scene.add(grid)

function makeShip(color, scale = 1) {
  const ship = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(1.45, 6.8, 4),
    new THREE.MeshStandardMaterial({ color, roughness: .55, metalness: .2, flatShading: true })
  )
  body.rotation.x = -Math.PI / 2
  ship.add(body)
  const wingMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(.68), roughness: .7, flatShading: true })
  const wingGeometry = new THREE.BufferGeometry()
  wingGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, -1, -5.2, -.25, 2.5, -1.0, .15, 2.0,
    0, 0, -1, 5.2, -.25, 2.5, 1.0, .15, 2.0,
  ], 3))
  wingGeometry.computeVertexNormals()
  ship.add(new THREE.Mesh(wingGeometry, wingMaterial))
  const canopy = new THREE.Mesh(new THREE.OctahedronGeometry(.72, 0), new THREE.MeshStandardMaterial({ color: 0x70d6ff, emissive: 0x123b62, emissiveIntensity: 1.5 }))
  canopy.position.set(0, .72, -.4)
  ship.add(canopy)
  const engine = new THREE.Mesh(new THREE.ConeGeometry(.7, 4, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x5ecbff, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false }))
  engine.rotation.x = Math.PI / 2
  engine.position.z = 4.5
  ship.add(engine)
  ship.scale.setScalar(scale)
  return ship
}

const playerShip = makeShip(0xd6531e, 1.25)
playerShip.position.set(-15, -4.2, 6)
playerShip.rotation.z = -.1
scene.add(playerShip)

const allies = [
  [0x168b8b, 10, -1, -46, .7],
  [0x2355a8, -10, 4, -64, .58],
  [0x812080, 4, 6, -79, .62],
].map(([color, x, y, z, scale]) => {
  const ship = makeShip(color, scale)
  ship.position.set(x, y, z)
  scene.add(ship)
  return ship
})

function makeBoss() {
  const boss = new THREE.Group()
  const blue = new THREE.MeshStandardMaterial({ color: 0x4d79ff, emissive: 0x173bd1, emissiveIntensity: .72, roughness: .62, flatShading: true })
  const dark = new THREE.MeshStandardMaterial({ color: 0x17294b, emissive: 0x0a2f6a, emissiveIntensity: 1.2 })
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(5.2, 1), blue)
  head.scale.set(1.12, .95, .78)
  boss.add(head)
  const face = new THREE.Mesh(new THREE.BoxGeometry(6.5, 2.4, .7), dark)
  face.position.set(0, -.2, 4.2)
  boss.add(face)
  const eye = new THREE.Mesh(new THREE.BoxGeometry(3.8, .45, .15), new THREE.MeshBasicMaterial({ color: 0x75eaff }))
  eye.position.set(.3, .2, 4.62)
  boss.add(eye)
  const body = new THREE.Mesh(new THREE.BoxGeometry(5.5, 4.5, 3), blue)
  body.position.y = -6.2
  boss.add(body)
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(1.05, 3.8, 4, 8), blue)
    arm.position.set(side * 4.2, -6.2, 0)
    arm.rotation.z = side * .25
    boss.add(arm)
    const leg = arm.clone()
    leg.position.set(side * 1.8, -10.3, 0)
    leg.rotation.z = side * .08
    boss.add(leg)
  }
  return boss
}

const boss = makeBoss()
boss.position.set(29, 19, -105)
boss.scale.setScalar(1.25)
scene.add(boss)

const asteroidMaterial = new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 1, flatShading: true })
const asteroids = Array.from({ length: 18 }, (_, index) => {
  const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4 + (index % 4) * .45, 0), asteroidMaterial)
  mesh.position.set((Math.random() - .5) * 115, -5 + Math.random() * 40, -25 - Math.random() * 230)
  mesh.userData.spin = .08 + Math.random() * .22
  scene.add(mesh)
  return mesh
})

const projectileGeometry = new THREE.BufferGeometry()
const projectilePositions = new Float32Array(48 * 6)
projectileGeometry.setAttribute('position', new THREE.BufferAttribute(projectilePositions, 3))
const projectileMaterial = new THREE.LineBasicMaterial({ color: 0x57c9ff, transparent: true, opacity: .9, blending: THREE.AdditiveBlending })
const projectiles = new THREE.LineSegments(projectileGeometry, projectileMaterial)
scene.add(projectiles)
const projectileData = Array.from({ length: 48 }, (_, i) => ({
  x: (Math.random() - .5) * 78,
  y: -3 + Math.random() * 35,
  z: -20 - Math.random() * 180,
  speed: 28 + Math.random() * 24,
  enemy: i % 5 === 0,
}))

const STAR_COUNT = 760
const starGeometry = new THREE.BufferGeometry()
const starPositions = new Float32Array(STAR_COUNT * 6)
const starColors = new Float32Array(STAR_COUNT * 6)
const stars = Array.from({ length: STAR_COUNT }, (_, i) => {
  const tone = i % 7 === 0 ? [0.55, .82, 1] : i % 11 === 0 ? [1, .82, .55] : [1, 1, 1]
  for (let end = 0; end < 2; end++) starColors.set(tone, i * 6 + end * 3)
  return {
    x: (Math.random() - .5) * 230,
    y: -12 + Math.random() * 105,
    z: -260 + Math.random() * 285,
    depth: .3 + Math.random() * .7,
  }
})
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3))
const starMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
const starLines = new THREE.LineSegments(starGeometry, starMaterial)
scene.add(starLines)

const ABSTRACT_COUNT = 180
const abstractLines = Array.from({ length: ABSTRACT_COUNT }, (_, i) => ({
  angle: (i / ABSTRACT_COUNT) * Math.PI * 2 + (Math.random() - .5) * .16,
  phase: Math.random(),
  speed: .55 + Math.random() * 1.15,
  width: .55 + Math.random() * 1.5,
  length: .55 + Math.random() * .75,
  hue: Math.random() < .16 ? 202 : 215,
}))

let state = normalizeSpeedlinesState()
let paused = false
let elapsed = 0
let lastTime = performance.now()

function resize() {
  const width = innerWidth
  const height = innerHeight
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height, false)
  const ratio = Math.min(devicePixelRatio, 1.5)
  overlay.width = Math.round(width * ratio)
  overlay.height = Math.round(height * ratio)
  overlay.style.width = `${width}px`
  overlay.style.height = `${height}px`
  overlayCtx.setTransform(ratio, 0, 0, ratio, 0, 0)
}
addEventListener('resize', resize)
resize()

function resetStar(star) {
  star.x = (Math.random() - .5) * 230
  star.y = -12 + Math.random() * 105
  star.z = -255 - Math.random() * 30
}

function updateEnvironmental(dt, curves) {
  const visibleCount = Math.round(STAR_COUNT * (.32 + .68 * state.density / 100))
  const positions = starGeometry.attributes.position.array
  for (let i = 0; i < STAR_COUNT; i++) {
    const star = stars[i]
    if (!paused) star.z += dt * curves.travelSpeed * (.55 + star.depth)
    if (star.z > 24) resetStar(star)
    const offset = i * 6
    const active = state.environmental && i < visibleCount
    const length = active ? curves.trailLength * (.28 + star.depth * .92) : 0
    positions[offset] = star.x
    positions[offset + 1] = star.y
    positions[offset + 2] = star.z
    positions[offset + 3] = star.x
    positions[offset + 4] = star.y
    positions[offset + 5] = star.z - length
  }
  starGeometry.attributes.position.needsUpdate = true
  starMaterial.opacity = state.environmental ? (.25 + .7 * state.brightness / 100) : 0
}

function updateProjectiles(dt) {
  const positions = projectileGeometry.attributes.position.array
  projectileData.forEach((shot, i) => {
    if (!paused) shot.z += dt * shot.speed
    if (shot.z > 20) {
      shot.z = -190 - Math.random() * 55
      shot.x = (Math.random() - .5) * 78
      shot.y = -3 + Math.random() * 35
    }
    const k = i * 6
    positions[k] = shot.x
    positions[k + 1] = shot.y
    positions[k + 2] = shot.z
    positions[k + 3] = shot.x
    positions[k + 4] = shot.y
    positions[k + 5] = shot.z - (shot.enemy ? 2.5 : 5.5)
  })
  projectileGeometry.attributes.position.needsUpdate = true
}

function drawAbstract(dt, curves) {
  const width = innerWidth
  const height = innerHeight
  overlayCtx.clearRect(0, 0, width, height)
  if (!state.abstract || curves.abstract <= .003) return
  const cx = width * .5
  const cy = height * .47
  const maxRadius = Math.hypot(width, height) * .68
  const innerRadius = Math.min(width, height) * curves.centerClearance
  const count = Math.min(ABSTRACT_COUNT, curves.lineCount)
  overlayCtx.globalCompositeOperation = 'lighter'
  overlayCtx.lineCap = 'round'
  for (let i = 0; i < count; i++) {
    const line = abstractLines[i]
    if (!paused) line.phase = (line.phase + dt * line.speed * (.16 + curves.abstract * 1.7)) % 1
    const eased = line.phase * line.phase
    const startRadius = innerRadius + eased * (maxRadius - innerRadius)
    const lineLength = (18 + 210 * curves.abstract * state.length / 100) * line.length * (.35 + line.phase)
    const endRadius = Math.min(maxRadius * 1.15, startRadius + lineLength)
    const cos = Math.cos(line.angle)
    const sin = Math.sin(line.angle)
    const alpha = curves.abstract * (state.brightness / 100) * Math.sin(line.phase * Math.PI) * .76
    overlayCtx.strokeStyle = `hsla(${line.hue}, 90%, 82%, ${alpha})`
    overlayCtx.lineWidth = (.35 + state.thickness / 100 * 2.6) * line.width
    overlayCtx.beginPath()
    overlayCtx.moveTo(cx + cos * startRadius, cy + sin * startRadius)
    overlayCtx.lineTo(cx + cos * endRadius, cy + sin * endRadius)
    overlayCtx.stroke()
  }
  overlayCtx.globalCompositeOperation = 'source-over'
}

function animate(now) {
  const dt = Math.min(.05, (now - lastTime) / 1000)
  lastTime = now
  if (!paused) elapsed += dt
  const curves = visualCurves(state)
  updateEnvironmental(dt, curves)
  updateProjectiles(dt)
  drawAbstract(dt, curves)
  if (!paused) {
    playerShip.rotation.y = Math.sin(elapsed * .55) * .035
    playerShip.position.y = -4.2 + Math.sin(elapsed * 1.5) * .16
    allies.forEach((ship, i) => {
      ship.position.y += Math.sin(elapsed * (1.1 + i * .08) + i) * .005
      ship.rotation.z = Math.sin(elapsed * .8 + i) * .06
    })
    boss.position.y = 19 + Math.sin(elapsed * .65) * 1.1
    boss.rotation.y = Math.sin(elapsed * .3) * .08
    asteroids.forEach(mesh => {
      mesh.rotation.x += dt * mesh.userData.spin
      mesh.rotation.y += dt * mesh.userData.spin * .7
    })
  }
  boss.visible = state.boss
  document.querySelector('#distance').textContent = String(Math.max(24, Math.round(109 - (elapsed * 3) % 85)))
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}
requestAnimationFrame(animate)

const rangeKeys = ['intensity', 'density', 'length', 'thickness', 'brightness', 'peripheralBias']
const booleanKeys = ['environmental', 'abstract', 'boss']

function renderControls() {
  state = normalizeSpeedlinesState(state)
  for (const key of rangeKeys) {
    const input = document.querySelector(`#${key}`)
    input.value = state[key]
    input.closest('.control').querySelector('output').textContent = `${Math.round(state[key])}%`
  }
  for (const key of booleanKeys) document.querySelector(`#${key}`).checked = state[key]
  document.querySelector('#meter').textContent = Math.round(state.intensity)
  document.querySelector('#band').textContent = intensityBand(state.intensity)
  const layers = [state.environmental && 'AMBIENTAIS', state.abstract && 'ABSTRATAS'].filter(Boolean)
  document.querySelector('#status').textContent = layers.length
    ? `${layers.join(' + ')} // CENTRO PROTEGIDO`
    : 'CAMADAS DESATIVADAS // CENA BASE'
}

function validateState(action) {
  const snapshot = { ...state, band: intensityBand(state.intensity) }
  aiValidator.logMechanic('speedlines-prototype', action, snapshot)
  aiValidator.expect(
    'Controles do protótipo permanecem dentro de 0–100%',
    () => rangeKeys.every(key => Number.isFinite(state[key]) && state[key] >= 0 && state[key] <= 100),
    snapshot
  )
  const curves = visualCurves(state)
  aiValidator.expect(
    'O centro protegido cresce quando o bias periférico está alto',
    () => state.peripheralBias < 70 || curves.centerClearance >= .365,
    { peripheralBias: state.peripheralBias, centerClearance: curves.centerClearance }
  )
}

for (const key of rangeKeys) {
  const input = document.querySelector(`#${key}`)
  input.addEventListener('input', () => {
    state[key] = Number(input.value)
    renderControls()
  })
  input.addEventListener('change', () => validateState(`ajuste-${key}`))
}
for (const key of booleanKeys) {
  document.querySelector(`#${key}`).addEventListener('change', event => {
    state[key] = event.target.checked
    renderControls()
    validateState(`toggle-${key}`)
  })
}
document.querySelectorAll('[data-preset]').forEach(button => {
  button.addEventListener('click', () => {
    const name = button.dataset.preset
    state = normalizeSpeedlinesState({ ...state, ...SPEEDLINES_PRESETS[name] })
    renderControls()
    validateState(`preset-${name}`)
  })
})
document.querySelector('#reset').addEventListener('click', () => {
  state = normalizeSpeedlinesState(SPEEDLINES_DEFAULTS)
  renderControls()
  validateState('reset')
})
document.querySelector('#pause').addEventListener('click', event => {
  paused = !paused
  event.currentTarget.textContent = paused ? 'Retomar cena' : 'Pausar cena'
  event.currentTarget.classList.toggle('active', paused)
  validateState(paused ? 'pause' : 'resume')
})
addEventListener('keydown', event => {
  if (event.code === 'Space') {
    event.preventDefault()
    document.querySelector('#pause').click()
  }
  const preset = { Digit1: 'neutral', Digit2: 'high', Digit3: 'extreme' }[event.code]
  if (preset) document.querySelector(`[data-preset="${preset}"]`).click()
})

window.__speedlinesLab = {
  getState: () => ({ ...state, curves: visualCurves(state), paused }),
  getValidationReport: () => aiValidator.buildReport(),
  setIntensity(value) {
    state.intensity = Number(value)
    renderControls()
    validateState('api-set-intensity')
  },
}

renderControls()
validateState('inicializacao')
