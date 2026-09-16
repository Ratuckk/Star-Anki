import * as THREE from 'three'
import { ENVIRONMENT_CONFIG } from './environment-config.js'

// ============ MÓDULO DE AMBIENTE CÓSMICO VIVO (v0.56.0) ============
// Gerencia a atmosfera do jogo:
// - SkyDome procedural com gradientes de nebulosa orgânica
// - Corpos celestes distantes (gigante gasoso com anéis e lua)
// - Starfield multicamadas com cintilação (twinkle) e esticamento (warp streaks) no boost
// - Bolsões de névoa densa no percurso e relâmpagos iônicos difusos esporádicos
// - Meteoros / estrelas cadentes periódicas cortando o céu
// - Grid de solo energizado com pulsos luminosos
//
// 100% modular e reversível através de ENVIRONMENT_CONFIG.

function createNebulaTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#050814'
  ctx.fillRect(0, 0, 1024, 512)

  const clouds = [
    { x: 280, y: 180, r: 260, color: 'rgba(88, 28, 135, 0.42)' },  // roxo cósmico
    { x: 740, y: 190, r: 300, color: 'rgba(14, 116, 144, 0.38)' }, // ciano profundo
    { x: 480, y: 340, r: 230, color: 'rgba(190, 24, 93, 0.32)' },  // magenta estelar
    { x: 160, y: 370, r: 190, color: 'rgba(13, 148, 136, 0.34)' }, // esmeralda cósmico
    { x: 880, y: 360, r: 210, color: 'rgba(180, 83, 9, 0.28)' },   // âmbar espacial
  ]

  for (const c of clouds) {
    const grad = ctx.createRadialGradient(c.x, c.y, 10, c.x, c.y, c.r)
    grad.addColorStop(0, c.color)
    grad.addColorStop(1, 'rgba(5, 8, 20, 0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 1024, 512)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  return texture
}

function createGasGiantTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const ctx = canvas.getContext('2d')

  const bands = 36
  for (let i = 0; i < bands; i++) {
    const y = (i / bands) * 256
    const h = 256 / bands + 1
    const hue = 205 + Math.sin(i * 0.45) * 40
    const sat = 45 + Math.cos(i * 0.6) * 22
    const lum = 38 + Math.sin(i * 0.75) * 24
    ctx.fillStyle = `hsl(${hue}, ${sat}%, ${lum}%)`
    ctx.fillRect(0, y, 512, h)
  }

  const texture = new THREE.CanvasTexture(canvas)
  return texture
}

function createRingTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 1
  const ctx = canvas.getContext('2d')

  for (let x = 0; x < 256; x++) {
    const alpha = Math.sin((x / 256) * Math.PI) * (0.35 + 0.5 * Math.sin(x * 0.35))
    ctx.fillStyle = `rgba(186, 215, 240, ${Math.max(0, Math.min(1, alpha))})`
    ctx.fillRect(x, 0, 1, 1)
  }

  const texture = new THREE.CanvasTexture(canvas)
  return texture
}

export function createEnvironmentSystem(scene, camera, rail, deps = {}) {
  const environmentGroup = new THREE.Group()
  scene.add(environmentGroup)

  let elapsed = 0
  let ionFlashTimer = 0
  let ionFlashDuration = 0
  let nextIonStormTime = 16 + Math.random() * 15
  let baseFogDensity = scene.fog ? scene.fog.density : 0.004

  // Temporários reutilizáveis para eliminar alocações por frame no loop de renderização
  const _tmpScaleOne = new THREE.Vector3(1, 1, 1)
  const _tmpTailVec = new THREE.Vector3()
  const _tmpVelNorm = new THREE.Vector3()
  const _tmpFlashColor = new THREE.Color(0x38bdf8)
  const _tmpAppliedFlash = new THREE.Color()

  // ============ 1. SKYDOME PROCEDURAL ============
  const skyTexture = createNebulaTexture()
  const skyGeo = new THREE.SphereGeometry(380, 32, 18)
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTexture,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    transparent: true,
    opacity: 0.95,
  })
  const skyDome = new THREE.Mesh(skyGeo, skyMat)
  environmentGroup.add(skyDome)

  // ============ 2. CORPOS CELESTES NO HORIZONTE ============
  const planetGroup = new THREE.Group()

  // Gigante gasoso com anéis
  const planetTexture = createGasGiantTexture()
  const planetGeo = new THREE.SphereGeometry(26, 32, 24)
  const planetMat = new THREE.MeshPhongMaterial({
    map: planetTexture,
    shininess: 15,
    flatShading: false,
    fog: false,
  })
  const gasGiant = new THREE.Mesh(planetGeo, planetMat)
  gasGiant.position.set(140, 95, -290)
  gasGiant.rotation.z = 0.35
  planetGroup.add(gasGiant)

  // Halo atmosférico (rim glow)
  const rimGeo = new THREE.SphereGeometry(27.8, 24, 18)
  const rimMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.28,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  })
  const planetRim = new THREE.Mesh(rimGeo, rimMat)
  gasGiant.add(planetRim)

  // Sistema de anéis
  const ringTexture = createRingTexture()
  const ringGeo = new THREE.RingGeometry(34, 56, 48)
  ringGeo.rotateX(Math.PI / 2.2)
  const ringMat = new THREE.MeshBasicMaterial({
    map: ringTexture,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    fog: false,
  })
  const planetRings = new THREE.Mesh(ringGeo, ringMat)
  gasGiant.add(planetRings)

  // Lua orbital
  const moonGeo = new THREE.SphereGeometry(6.5, 16, 12)
  const moonMat = new THREE.MeshPhongMaterial({
    color: 0xcfd8dc,
    shininess: 5,
    flatShading: true,
    fog: false,
  })
  const moon = new THREE.Mesh(moonGeo, moonMat)
  moon.position.set(70, 60, -270)
  planetGroup.add(moon)

  environmentGroup.add(planetGroup)

  // ============ 3. STARFIELD MULTICAMADAS COM TWINKLE ============
  const DEEP_STAR_COUNT = 900
  const deepStarGeo = new THREE.BufferGeometry()
  const deepStarPos = new Float32Array(DEEP_STAR_COUNT * 3)
  const deepStarColors = new Float32Array(DEEP_STAR_COUNT * 3)
  const deepStarPhases = new Float32Array(DEEP_STAR_COUNT)

  for (let i = 0; i < DEEP_STAR_COUNT; i++) {
    const r = 260 + Math.random() * 100
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    deepStarPos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    deepStarPos[i * 3 + 1] = r * Math.cos(phi) * 0.75
    deepStarPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)

    deepStarPhases[i] = Math.random() * Math.PI * 2

    const roll = Math.random()
    if (roll < 0.2) {
      deepStarColors[i * 3] = 0.65; deepStarColors[i * 3 + 1] = 0.85; deepStarColors[i * 3 + 2] = 1.0
    } else if (roll < 0.4) {
      deepStarColors[i * 3] = 1.0; deepStarColors[i * 3 + 1] = 0.88; deepStarColors[i * 3 + 2] = 0.7
    } else {
      deepStarColors[i * 3] = 1.0; deepStarColors[i * 3 + 1] = 1.0; deepStarColors[i * 3 + 2] = 1.0
    }
  }

  deepStarGeo.setAttribute('position', new THREE.BufferAttribute(deepStarPos, 3))
  deepStarGeo.setAttribute('color', new THREE.BufferAttribute(deepStarColors, 3))
  const deepStarMat = new THREE.PointsMaterial({
    size: 1.5,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    fog: false,
  })
  const deepStars = new THREE.Points(deepStarGeo, deepStarMat)
  environmentGroup.add(deepStars)

  // ============ 4. ESTRELAS CADENTES / METEOROS ============
  const METEOR_COUNT = 3
  const meteors = []
  const meteorMat = new THREE.LineBasicMaterial({
    color: 0x93c5fd,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  })

  for (let i = 0; i < METEOR_COUNT; i++) {
    const geo = new THREE.BufferGeometry()
    const pts = new Float32Array(6) // 2 pontos: cabeça e cauda
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3))
    const line = new THREE.Line(geo, meteorMat)
    line.visible = false
    environmentGroup.add(line)
    meteors.push({
      line,
      active: false,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      length: 22,
      life: 0,
      maxLife: 0.6,
      timer: 4 + Math.random() * 8,
    })
  }

  // ============ 5. GRID DE SOLO ENERGIZADO ============
  let energizedPulseZ = 0
  const gridLineMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  })
  const gridPulseGeo = new THREE.BoxGeometry(380, 0.4, 2.5)
  const gridPulseMesh = new THREE.Mesh(gridPulseGeo, gridLineMat)
  gridPulseMesh.position.set(-27, -11.8, -85)
  environmentGroup.add(gridPulseMesh)

  // ============ TICK DE ATUALIZAÇÃO DO AMBIENTE ============
  function update(dt, playerPos, opts = {}) {
    elapsed += dt
    const boostActive = !!opts.boostActive
    const inArena = rail.isArena()

    // Sincroniza visibilidade conforme ENVIRONMENT_CONFIG
    skyDome.visible = ENVIRONMENT_CONFIG.enableSkyDome
    planetGroup.visible = ENVIRONMENT_CONFIG.enableCelestialBodies
    deepStars.visible = ENVIRONMENT_CONFIG.enableMultiLayerStars
    gridPulseMesh.visible = ENVIRONMENT_CONFIG.enableEnergizedGrid

    // 1. SkyDome & Corpos celestes acompanham a câmera para infinito
    if (camera) {
      skyDome.position.copy(camera.position)
      planetGroup.position.copy(camera.position).multiplyScalar(0.08) // paralaxe sutil
    }

    skyDome.visible = !!ENVIRONMENT_CONFIG.enableSkyDome
    planetGroup.visible = !!ENVIRONMENT_CONFIG.enableCelestialBodies

    if (ENVIRONMENT_CONFIG.enableSkyDome) {
      skyDome.rotation.y += dt * 0.008
      skyDome.position.copy(camera ? camera.position : rail.getPlayerPosition())
      // Respiração cósmica do brilho
      skyMat.opacity = 0.88 + Math.sin(elapsed * 0.2) * 0.08
    }

    if (ENVIRONMENT_CONFIG.enableCelestialBodies) {
      gasGiant.rotation.y += dt * 0.015
      planetRings.rotation.z += dt * 0.008
      moon.position.x = 70 + Math.sin(elapsed * 0.05) * 14
      moon.position.z = -270 + Math.cos(elapsed * 0.05) * 14
    }

    // 2. Twinkle e Warp Streaks no Starfield
    if (ENVIRONMENT_CONFIG.enableMultiLayerStars) {
      // Pulso suave de cintilação
      deepStarMat.size = 1.4 + Math.sin(elapsed * 2.5) * 0.35

      // Efeito dobra / Warp Streaks durante o boost
      if (ENVIRONMENT_CONFIG.enableWarpStreaks && boostActive) {
        deepStars.scale.set(1.0, 1.0, 2.2)
        deepStarMat.size = 2.4
      } else {
        deepStars.scale.lerp(_tmpScaleOne, 1 - Math.exp(-6 * dt))
      }
    }

    // 3. Meteoros / Estrelas Cadentes
    if (ENVIRONMENT_CONFIG.enableShootingStars) {
      for (const m of meteors) {
        if (!m.active) {
          m.timer -= dt
          if (m.timer <= 0 && camera) {
            m.active = true
            m.life = m.maxLife
            m.timer = 7 + Math.random() * 12
            // Origem no quadrante superior
            const forward = rail.getFrameAt(0).forward
            const right = rail.getFrameAt(0).right
            const up = rail.getFrameAt(0).up
            const startX = (Math.random() * 2 - 1) * 160
            const startY = 80 + Math.random() * 60
            const startZ = -140 - Math.random() * 80

            m.pos.copy(camera.position)
              .addScaledVector(right, startX)
              .addScaledVector(up, startY)
              .addScaledVector(forward, startZ)

            const dir = right.clone().multiplyScalar((Math.random() - 0.5) * 2)
              .addScaledVector(up, -1.2)
              .addScaledVector(forward, (Math.random() - 0.5) * 1.5)
              .normalize()
            m.vel.copy(dir).multiplyScalar(220)
            m.line.visible = true
          }
        } else {
          m.life -= dt
          m.pos.addScaledVector(m.vel, dt)
          _tmpVelNorm.copy(m.vel).normalize()
          _tmpTailVec.copy(m.pos).addScaledVector(_tmpVelNorm, -m.length)
          const posAttr = m.line.geometry.attributes.position
          posAttr.setXYZ(0, m.pos.x, m.pos.y, m.pos.z)
          posAttr.setXYZ(1, _tmpTailVec.x, _tmpTailVec.y, _tmpTailVec.z)
          posAttr.needsUpdate = true

          const fade = Math.max(0, m.life / m.maxLife)
          m.line.material.opacity = fade * 0.85
          if (m.life <= 0) {
            m.active = false
            m.line.visible = false
          }
        }
      }
    }

    // 4. Bolsões de Névoa Atmosférica & Relâmpagos Iônicos
    if (scene.fog && !inArena) {
      if (ENVIRONMENT_CONFIG.enableNebulaPockets) {
        const dist = rail.getDistance()
        // Bolsões periódicos de gás cósmico a cada 320u
        const inPocket = (dist % 340) < 95
        const targetDensity = inPocket ? 0.0085 : baseFogDensity
        scene.fog.density += (targetDensity - scene.fog.density) * (1 - Math.exp(-2.0 * dt))
      } else {
        scene.fog.density = baseFogDensity
      }

      if (ENVIRONMENT_CONFIG.enableIonStorms) {
        nextIonStormTime -= dt
        if (nextIonStormTime <= 0) {
          ionFlashTimer = 0.09 // 90ms de clarão iônico
          ionFlashDuration = 0.09
          nextIonStormTime = 18 + Math.random() * 22
        }

        if (ionFlashTimer > 0) {
          ionFlashTimer -= dt
          const flashIntensity = Math.sin((ionFlashTimer / ionFlashDuration) * Math.PI)
          _tmpAppliedFlash.copy(_tmpFlashColor).multiplyScalar(flashIntensity * 0.35)
          scene.fog.color.add(_tmpAppliedFlash)
        }
      }
    }

    // 5. Grid de Solo Energizado
    if (gridPulseMesh) {
      gridPulseMesh.visible = !!ENVIRONMENT_CONFIG.enableEnergizedGrid && !inArena
    }
    if (ENVIRONMENT_CONFIG.enableEnergizedGrid && !inArena) {
      energizedPulseZ -= dt * 65
      if (energizedPulseZ < -160) energizedPulseZ = 40
      gridPulseMesh.position.z = -85 + energizedPulseZ
      const alpha = Math.sin(((energizedPulseZ + 160) / 200) * Math.PI)
      gridLineMat.opacity = Math.max(0.1, alpha * 0.55)
    }
  }

  function dispose() {
    scene.remove(environmentGroup)
    skyGeo.dispose()
    skyMat.dispose()
    skyTexture.dispose()
    planetGeo.dispose()
    planetMat.dispose()
    planetTexture.dispose()
    rimGeo.dispose()
    rimMat.dispose()
    ringGeo.dispose()
    ringMat.dispose()
    ringTexture.dispose()
    moonGeo.dispose()
    moonMat.dispose()
    deepStarGeo.dispose()
    deepStarMat.dispose()
    meteorMat.dispose()
    for (const m of meteors) m.line.geometry.dispose()
    gridPulseGeo.dispose()
    gridLineMat.dispose()
  }

  return {
    update,
    dispose,
    toggleFeature: (name) => {
      if (name in ENVIRONMENT_CONFIG) {
        ENVIRONMENT_CONFIG[name] = !ENVIRONMENT_CONFIG[name]
        return ENVIRONMENT_CONFIG[name]
      }
      return false
    },
    setFeature: (name, val) => {
      if (name in ENVIRONMENT_CONFIG) ENVIRONMENT_CONFIG[name] = !!val
    },
    getConfig: () => ({ ...ENVIRONMENT_CONFIG }),
  }
}
