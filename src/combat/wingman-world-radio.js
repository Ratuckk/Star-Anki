import * as THREE from 'three'

// Feedback visual de habilidade dos aliados: brilho (glow) sobre a nave do aliado. Este módulo NÃO
// exibe fala nem painel: o rádio é o painel fixo inferior-central da HUD (hud-game.js) e habilidade
// nunca usa rádio. (Os painéis world-space de mensagem foram removidos junto do dispatcher único.)
export const WINGMAN_ABILITY_GLOW_DURATION_S = 1.5

function cssColor(value) {
  if (typeof value === 'string') return value
  const n = Number(value)
  if (!Number.isFinite(n)) return '#ffffff'
  return '#' + Math.max(0, Math.min(0xffffff, n | 0)).toString(16).padStart(6, '0')
}

function makeGlowTexture(color) {
  if (typeof document === 'undefined') return new THREE.Texture()
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
  const glows = new Map()

  function disposeGlow(entry) {
    scene.remove(entry.sprite)
    entry.material.dispose()
    entry.texture.dispose()
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

  function update(dt) {
    for (const [key, entry] of glows) {
      entry.life -= dt
      if (entry.life <= 0 || !entry.targetMesh || !entry.targetMesh.parent) {
        disposeGlow(entry)
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
    for (const entry of glows.values()) disposeGlow(entry)
    glows.clear()
  }

  return {
    triggerAbilityGlow,
    update,
    clear,
    dispose: clear,
  }
}
