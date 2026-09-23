import * as THREE from 'three'

export const WINGMAN_ABILITY_GLOW_DURATION_S = 1.5
export const WINGMAN_WORLD_RADIO_HOLD_S = 2.15

const WINGMAN_AVATARS = Object.freeze({
  0: 'assets/wingman-radio/falco.png',
  1: 'assets/wingman-radio/peppy.png',
  2: 'assets/wingman-radio/slippy.png',
  3: 'assets/wingman-radio/miyu.png',
})
const FOX_AVATAR = 'assets/wingman-radio/fox.png'
const FOX_COLOR = '#5ec8ff'
const PANEL_WIDTH = 640
const PANEL_HEIGHT = 144

function cssColor(value) {
  if (typeof value === 'string') return value
  const n = Number(value)
  if (!Number.isFinite(n)) return '#ffffff'
  return '#' + Math.max(0, Math.min(0xffffff, n | 0)).toString(16).padStart(6, '0')
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function wrapLine(ctx, text, maxWidth, maxLines = 2) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let current = ''
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate
      continue
    }
    lines.push(current)
    current = word
    if (lines.length >= maxLines - 1) break
  }
  if (lines.length < maxLines && current) lines.push(current)
  if (words.length > 0) {
    const joined = lines.join(' ')
    const source = words.join(' ')
    if (joined.length < source.length && lines.length > 0) {
      let last = lines[lines.length - 1]
      while (last.length > 3 && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1)
      lines[lines.length - 1] = last.replace(/[,.!?;:\s]+$/, '') + '…'
    }
  }
  return lines.slice(0, maxLines)
}

function makeRadioTexture({ name, text, color, avatarUrl }) {
  const canvas = document.createElement('canvas')
  canvas.width = PANEL_WIDTH
  canvas.height = PANEL_HEIGHT
  const ctx = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false

  function draw(avatar = null) {
    ctx.clearRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT)
    const c = cssColor(color)

    ctx.fillStyle = 'rgba(3, 8, 18, 0.94)'
    roundRect(ctx, 2, 2, PANEL_WIDTH - 4, PANEL_HEIGHT - 4, 10)
    ctx.fill()

    ctx.strokeStyle = c
    ctx.lineWidth = 5
    roundRect(ctx, 4, 4, PANEL_WIDTH - 8, PANEL_HEIGHT - 8, 9)
    ctx.stroke()

    ctx.fillStyle = c + '25'
    ctx.fillRect(12, 12, 116, 116)
    ctx.strokeStyle = c
    ctx.lineWidth = 3
    ctx.strokeRect(12, 12, 116, 116)

    if (avatar) {
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(avatar, 14, 14, 112, 112)
    }

    ctx.fillStyle = c
    ctx.font = '700 27px ui-monospace, Consolas, monospace'
    ctx.textBaseline = 'top'
    ctx.fillText(String(name || '').toUpperCase(), 150, 20)

    ctx.fillStyle = '#f8fafc'
    ctx.font = '700 25px ui-monospace, Consolas, monospace'
    const lines = wrapLine(ctx, text, PANEL_WIDTH - 172, 2)
    lines.forEach((line, index) => ctx.fillText(line, 150, 62 + index * 31))

    texture.needsUpdate = true
  }

  draw()
  if (avatarUrl) {
    const image = new Image()
    image.onload = () => draw(image)
    image.src = avatarUrl
  }

  return texture
}

function makePanelSprite(payload) {
  const texture = makeRadioTexture(payload)
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: false,
  })
  const sprite = new THREE.Sprite(material)
  sprite.center.set(0.5, 0)
  sprite.scale.set(0.48, 0.108, 1)
  sprite.renderOrder = 999
  return { sprite, material, texture }
}

function makeGlowTexture(color) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 60)
  gradient.addColorStop(0, cssColor(color) + 'e8')
  gradient.addColorStop(0.35, cssColor(color) + '9a')
  gradient.addColorStop(0.72, cssColor(color) + '35')
  gradient.addColorStop(1, cssColor(color) + '00')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  return texture
}

export function createWingmanWorldRadio(scene) {
  const messages = []
  const glows = new Map()

  function disposeMessage(entry) {
    scene.remove(entry.sprite)
    entry.material.dispose()
    entry.texture.dispose()
  }

  function showMessage({ targetMesh = null, followPlayer = false, name, text, color, avatarUrl, holdS = WINGMAN_WORLD_RADIO_HOLD_S }) {
    if (!text) return null
    const visual = makePanelSprite({ name, text, color, avatarUrl })
    scene.add(visual.sprite)
    const entry = {
      ...visual,
      targetMesh,
      followPlayer,
      life: holdS,
      maxLife: holdS,
    }
    messages.push(entry)
    return entry
  }

  function showWingman(targetMesh, { pilotId, name, text, color, holdS } = {}) {
    return showMessage({
      targetMesh,
      name,
      text,
      color,
      avatarUrl: WINGMAN_AVATARS[pilotId],
      holdS,
    })
  }

  function showFoxFocus(playerPos, { text = 'All units, focus fire!', targetCount = 0, hasLocked = false } = {}) {
    const entry = showMessage({
      followPlayer: true,
      name: 'Fox',
      text,
      color: FOX_COLOR,
      avatarUrl: FOX_AVATAR,
      holdS: 2.25,
    })
    if (entry && playerPos) entry.sprite.position.copy(playerPos)
    return { entry, targetCount, hasLocked }
  }

  function triggerAbilityGlow(targetMesh, color, durationS = WINGMAN_ABILITY_GLOW_DURATION_S) {
    if (!targetMesh) return null
    const key = targetMesh.uuid
    let entry = glows.get(key)
    if (!entry) {
      const texture = makeGlowTexture(color)
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      })
      const sprite = new THREE.Sprite(material)
      sprite.renderOrder = 998
      scene.add(sprite)
      entry = { sprite, material, texture, targetMesh, life: durationS, maxLife: durationS }
      glows.set(key, entry)
    } else {
      entry.life = durationS
      entry.maxLife = durationS
      entry.targetMesh = targetMesh
    }
    return entry
  }

  function update(dt, playerPos, frame) {
    const up = frame?.up
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const entry = messages[i]
      entry.life -= dt
      if (entry.life <= 0 || (!entry.followPlayer && (!entry.targetMesh || !entry.targetMesh.parent))) {
        disposeMessage(entry)
        messages.splice(i, 1)
        continue
      }

      const anchor = entry.followPlayer ? playerPos : entry.targetMesh.position
      if (anchor) {
        entry.sprite.position.copy(anchor)
        if (up) entry.sprite.position.addScaledVector(up, entry.followPlayer ? 3.4 : 3.0)
        else entry.sprite.position.y += entry.followPlayer ? 3.4 : 3.0
      }

      const fadeWindow = 0.32
      entry.material.opacity = entry.life < fadeWindow ? Math.max(0, entry.life / fadeWindow) : 1
    }

    for (const [key, entry] of glows) {
      entry.life -= dt
      if (entry.life <= 0 || !entry.targetMesh || !entry.targetMesh.parent) {
        scene.remove(entry.sprite)
        entry.material.dispose()
        entry.texture.dispose()
        glows.delete(key)
        continue
      }
      entry.sprite.position.copy(entry.targetMesh.position)
      const t = 1 - entry.life / entry.maxLife
      const pulse = 1 + Math.sin(t * Math.PI * 6) * 0.08
      const size = (4.6 + t * 2.4) * pulse
      entry.sprite.scale.set(size, size, 1)
      const envelope = Math.sin(Math.min(1, t * 1.5) * Math.PI * 0.5) * Math.min(1, entry.life / 0.25)
      entry.material.opacity = Math.max(0, 0.86 * envelope)
    }
  }

  function clear() {
    while (messages.length > 0) disposeMessage(messages.pop())
    for (const entry of glows.values()) {
      scene.remove(entry.sprite)
      entry.material.dispose()
      entry.texture.dispose()
    }
    glows.clear()
  }

  return {
    showWingman,
    showFoxFocus,
    triggerAbilityGlow,
    update,
    clear,
    dispose: clear,
  }
}
