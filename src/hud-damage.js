import { getSettings } from './settings.js'

const AUTHORS = [
  { color: '#f3f6ff', shape: 'burst' },
  { color: '#76ceff', shape: 'slash' },
  { color: '#ffc96e', shape: 'seal' },
  { color: '#a4f57a', shape: 'bubble' },
  { color: '#d795ff', shape: 'burst' },
]
const OFFSETS = [[-55, -60], [-94, 0], [-55, 57], [55, 57], [94, 0]]
const ORBIT_START_ANGLE = -Math.PI / 2
const ANGLES = Array.from({ length: AUTHORS.length }, (_, slot) => ORBIT_START_ANGLE + slot * (Math.PI * 2 / AUTHORS.length))
const MAX_LABELS = 36
export const DAMAGE_NUMBER_SCALE = 0.8
export const ORBIT_DURATION_MS = 1700
export const ORBIT_ARC_SEGMENT = 16
export const ORBIT_ARC_STEP = 20

export function getOrbitAngle(slot, t, reducedMotion = false) {
  const start = ANGLES[Math.max(0, Math.min(ANGLES.length - 1, slot))]
  return start + (reducedMotion ? 0 : Math.PI * 2 * Math.max(0, Math.min(1, t)))
}

export function getOrbitArcDashOffset(slot) {
  return -(Math.max(0, Math.min(AUTHORS.length - 1, slot)) * ORBIT_ARC_STEP + 2)
}

function orbitFrame(slot, t, { calm = false, killed = false } = {}) {
  const angle = getOrbitAngle(slot, t, calm)
  const launch = calm ? 1 : Math.min(1, t / .16)
  const exit = Math.max(0, (t - .72) / .28)
  const collapse = killed && !calm ? Math.max(0, 1 - Math.max(0, (t - .82) / .18)) : 1
  return {
    x: Math.cos(angle) * 97 * launch * collapse,
    y: Math.sin(angle) * 66 * launch * collapse,
    opacity: 1 - exit,
  }
}

function injectStyles() {
  if (document.getElementById('damage-feedback-styles')) return
  const style = document.createElement('style')
  style.id = 'damage-feedback-styles'
  style.textContent = `
    .damage-feedback{position:absolute;z-index:30;pointer-events:none;display:grid;place-items:center;width:96px;height:62px;will-change:transform,opacity;font-family:system-ui,sans-serif;color:var(--damage-color);isolation:isolate;overflow:visible}
    .damage-feedback strong{font-size:${30 * DAMAGE_NUMBER_SCALE}px;font-weight:900;line-height:1;position:relative;text-shadow:0 1px 4px #000}
    .damage-feedback small{font-size:${10 * DAMAGE_NUMBER_SCALE}px;font-weight:800;line-height:1.2;position:relative;white-space:nowrap;color:#f4f7ff;text-shadow:0 1px 3px #000}
    .damage-feedback.charged strong{font-size:${36 * DAMAGE_NUMBER_SCALE}px}
    .damage-feedback.word strong{font-size:${19 * DAMAGE_NUMBER_SCALE}px}
    .damage-feedback.manga{color:#111522;gap:0;padding:9px 0}
    .damage-feedback.manga:before{content:'';position:absolute;inset:0;background:var(--damage-color);z-index:-1;clip-path:polygon(50% 0,60% 17%,80% 3%,79% 27%,100% 27%,88% 47%,100% 62%,79% 66%,85% 90%,60% 83%,50% 100%,38% 82%,15% 95%,20% 70%,0 72%,12% 52%,0 34%,22% 29%,19% 5%,40% 17%)}
    .damage-feedback.manga.slash:before{clip-path:polygon(0 12%,94% 0,100% 87%,6% 100%)}
    .damage-feedback.manga.seal:before{clip-path:ellipse(49% 48%)}
    .damage-feedback.manga.bubble:before{clip-path:ellipse(49% 43%)}
    .damage-feedback.manga strong,.damage-feedback.manga small{color:#111522;text-shadow:none}
    .damage-feedback.orbit{width:96px;height:62px}
    .damage-feedback.orbit strong{text-shadow:0 0 10px var(--damage-color),0 2px 3px #000}
    .damage-feedback-orbit-content{position:absolute;inset:0;display:grid;place-items:center;z-index:2;will-change:transform,opacity}
    .damage-feedback-orbit-ring{position:absolute;left:50%;top:50%;width:194px;height:132px;transform:translate(-50%,-50%) rotate(-90deg);transform-origin:50% 50%;overflow:visible;z-index:1;filter:drop-shadow(0 0 5px var(--damage-color));will-change:opacity}
    .damage-feedback.classic{width:76px;height:40px}
    .damage-feedback.classic strong{font:900 ${18 * DAMAGE_NUMBER_SCALE}px ui-monospace,monospace}
    .damage-feedback.classic small{font-size:${9 * DAMAGE_NUMBER_SCALE}px}
  `
  document.head.appendChild(style)
}

function createOrbitRing(slot, color) {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.classList.add('damage-feedback-orbit-ring')
  svg.setAttribute('viewBox', '0 0 200 136')
  svg.setAttribute('aria-hidden', 'true')
  const ellipse = document.createElementNS(ns, 'ellipse')
  ellipse.setAttribute('cx', '100')
  ellipse.setAttribute('cy', '68')
  ellipse.setAttribute('rx', '97')
  ellipse.setAttribute('ry', '66')
  ellipse.setAttribute('pathLength', '100')
  ellipse.setAttribute('fill', 'none')
  ellipse.setAttribute('stroke', color)
  ellipse.setAttribute('stroke-width', '2.4')
  ellipse.setAttribute('stroke-linecap', 'round')
  ellipse.setAttribute('stroke-dasharray', `${ORBIT_ARC_SEGMENT} ${100 - ORBIT_ARC_SEGMENT}`)
  ellipse.setAttribute('stroke-dashoffset', String(getOrbitArcDashOffset(slot)))
  svg.appendChild(ellipse)
  return svg
}

// Animações limitadas; recursos cancelados ao desmontar o HUD.
export function createDamageNumbers(root) {
  injectStyles()
  const active = new Set()
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  function remove(entry) {
    clearTimeout(entry.timeout)
    entry.animation?.cancel()
    entry.ringAnimation?.cancel()
    entry.el.remove()
    active.delete(entry)
  }
  function animate(entry) {
    entry.animation?.cancel()
    entry.ringAnimation?.cancel()
    const { el, style, slot, killed } = entry
    const calm = reduced?.matches
    const duration = style === 'orbit' ? ORBIT_DURATION_MS : 1100
    const frames = []
    for (let i = 0; i <= 32; i++) {
      const t = i / 32
      let x = 0, y = -22, scale = 1, rotation = 0
      const exit = Math.max(0, (t - .7) / .3)
      let opacity = 1 - exit
      if (style === 'manga') {
        ;[x, y] = OFFSETS[slot]
        if (!calm) {
          scale = t < .15 ? .35 + (t / .15) * .85 : 1 + .2 * Math.exp(-(t - .15) * 16) * Math.cos((t - .15) * 35)
          rotation = (slot % 2 ? 5 : -5) * (1 - exit)
          x += (slot % 2 ? -1 : 1) * exit * 28
          y -= exit * 22
        }
      } else if (style === 'orbit') {
        const orbit = orbitFrame(slot, t, { calm, killed })
        x = orbit.x
        y = orbit.y
        opacity = orbit.opacity
      } else if (!calm) y = -16 - t * 48
      frames.push({ offset: t, opacity, transform: `translate(calc(-50% + ${x}px),calc(-50% + ${y}px)) rotate(${rotation}deg) scale(${scale})` })
    }
    const motionEl = entry.motionEl || el
    entry.animation = motionEl.animate(frames, { duration, fill: 'forwards' })
    if (entry.ringEl) {
      entry.ringAnimation = entry.ringEl.animate([
        { offset: 0, opacity: 0 },
        { offset: .10, opacity: .72 },
        { offset: .72, opacity: .72 },
        { offset: 1, opacity: 0 },
      ], { duration, fill: 'forwards' })
    }
    clearTimeout(entry.timeout)
    entry.timeout = setTimeout(() => remove(entry), duration)
  }
  return {
    spawn(xFrac, yFrac, value, opts = {}) {
      const style = getSettings().damageNumberStyle
      const slot = Number.isInteger(opts.pilotId) && opts.pilotId >= 0 && opts.pilotId <= 3 ? opts.pilotId + 1 : 0
      const author = AUTHORS[slot]
      const now = performance.now()
      // Mesmo alvo/autor em uma rajada curta vira uma soma, sem misturar pilotos.
      const existing = opts.targetId && typeof value === 'number' && [...active].find(e =>
        e.targetId === opts.targetId && e.slot === slot && e.style === style && typeof e.value === 'number' && now - e.started < 120)
      if (existing) {
        existing.value += value
        existing.hits++
        existing.killed ||= !!opts.killed
        existing.el.classList.toggle('charged', existing.el.classList.contains('charged') || !!opts.homing)
        existing.el.querySelector('strong').textContent = String(Math.round(existing.value * 100) / 100)
        existing.el.querySelector('small').textContent = `${existing.hits} hits`
        animate(existing)
        return
      }
      if (active.size >= MAX_LABELS) remove(active.values().next().value)
      const el = document.createElement('div')
      el.className = `damage-feedback ${style} ${author.shape}${opts.homing ? ' charged' : ''}${typeof value === 'string' ? ' word' : ''}`
      el.style.setProperty('--damage-color', author.color)
      const number = document.createElement('strong')
      number.textContent = typeof value === 'number' ? String(Math.round(value * 100) / 100) : value
      const label = document.createElement('small')
      label.textContent = ''
      let motionEl = el
      let ringEl = null
      if (style === 'orbit') {
        ringEl = createOrbitRing(slot, author.color)
        const content = document.createElement('span')
        content.className = 'damage-feedback-orbit-content'
        content.append(number, label)
        el.append(ringEl, content)
        motionEl = content
      } else {
        el.append(number, label)
      }
      // Reservar a excursão completa da animação para não cortar números nas bordas.
      const width = root.clientWidth, height = root.clientHeight
      const mx = Math.min(154, width / 2), my = Math.min(106, height / 2)
      el.style.left = `${Math.min(width - mx, Math.max(mx, xFrac * width))}px`
      el.style.top = `${Math.min(height - my, Math.max(my, yFrac * height))}px`
      root.appendChild(el)
      const entry = { el, motionEl, ringEl, value, hits: 1, style, slot, targetId: opts.targetId, started: now, killed: !!opts.killed }
      active.add(entry)
      animate(entry)
    },
    dispose() { for (const entry of active) remove(entry) },
  }
}
