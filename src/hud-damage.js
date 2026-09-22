import { getSettings } from './settings.js'

const AUTHORS = [
  { color: '#f3f6ff', shape: 'burst' },
  { color: '#76ceff', shape: 'slash' },
  { color: '#ffc96e', shape: 'seal' },
  { color: '#a4f57a', shape: 'bubble' },
  { color: '#d795ff', shape: 'burst' },
]
const OFFSETS = [[-55, -60], [-94, 0], [-55, 57], [55, 57], [94, 0]]
const ANGLES = [-2.1, -3.1, 2.15, .95, -.22]
const MAX_LABELS = 36

function injectStyles() {
  if (document.getElementById('damage-feedback-styles')) return
  const style = document.createElement('style')
  style.id = 'damage-feedback-styles'
  style.textContent = `
    .damage-feedback{position:absolute;z-index:30;pointer-events:none;display:grid;place-items:center;width:96px;height:62px;will-change:transform,opacity;font-family:system-ui,sans-serif;color:var(--damage-color);isolation:isolate}
    .damage-feedback strong{font-size:30px;font-weight:900;line-height:1;position:relative;text-shadow:0 1px 4px #000}
    .damage-feedback small{font-size:10px;font-weight:800;line-height:1.2;position:relative;white-space:nowrap;color:#f4f7ff;text-shadow:0 1px 3px #000}
    .damage-feedback.charged strong{font-size:36px}
    .damage-feedback.word strong{font-size:19px}
    .damage-feedback.manga{color:#111522;gap:0;padding:9px 0}
    .damage-feedback.manga:before{content:'';position:absolute;inset:0;background:var(--damage-color);z-index:-1;clip-path:polygon(50% 0,60% 17%,80% 3%,79% 27%,100% 27%,88% 47%,100% 62%,79% 66%,85% 90%,60% 83%,50% 100%,38% 82%,15% 95%,20% 70%,0 72%,12% 52%,0 34%,22% 29%,19% 5%,40% 17%)}
    .damage-feedback.manga.slash:before{clip-path:polygon(0 12%,94% 0,100% 87%,6% 100%)}
    .damage-feedback.manga.seal:before{clip-path:ellipse(49% 48%)}
    .damage-feedback.manga.bubble:before{clip-path:ellipse(49% 43%)}
    .damage-feedback.manga strong,.damage-feedback.manga small{color:#111522;text-shadow:none}
    .damage-feedback.orbit strong{text-shadow:0 0 10px var(--damage-color),0 2px 3px #000}
    .damage-feedback.orbit:before{content:'';position:absolute;width:48px;height:16px;border-top:2px solid var(--damage-color);border-radius:50%;transform:translate(-21px,15px) rotate(-25deg);opacity:.7}
    .damage-feedback.classic{width:76px;height:40px}
    .damage-feedback.classic strong{font:900 18px ui-monospace,monospace}
    .damage-feedback.classic small{font-size:9px}
  `
  document.head.appendChild(style)
}

// Animações limitadas; recursos cancelados ao desmontar o HUD.
export function createDamageNumbers(root) {
  injectStyles()
  const active = new Set()
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  function remove(entry) {
    clearTimeout(entry.timeout)
    entry.animation?.cancel()
    entry.el.remove()
    active.delete(entry)
  }
  function animate(entry) {
    entry.animation?.cancel()
    const { el, style, slot, killed } = entry
    const calm = reduced?.matches
    const duration = style === 'orbit' ? 1450 : 1100
    const frames = []
    for (let i = 0; i <= 24; i++) {
      const t = i / 24
      let x = 0, y = -22, scale = 1, rotation = 0
      const exit = Math.max(0, (t - .7) / .3)
      if (style === 'manga') {
        ;[x, y] = OFFSETS[slot]
        if (!calm) {
          scale = t < .15 ? .35 + (t / .15) * .85 : 1 + .2 * Math.exp(-(t - .15) * 16) * Math.cos((t - .15) * 35)
          rotation = (slot % 2 ? 5 : -5) * (1 - exit)
          x += (slot % 2 ? -1 : 1) * exit * 28
          y -= exit * 22
        }
      } else if (style === 'orbit') {
        const angle = ANGLES[slot] + (calm ? .53 : .53 * (1 - (1 - Math.min(1, t / .55)) ** 3))
        const launch = calm ? 1 : Math.min(1, t / .17)
        const collapse = killed && !calm ? 1 - exit : 1
        x = Math.cos(angle) * 97 * launch * collapse
        y = Math.sin(angle) * 66 * launch * collapse
      } else if (!calm) y = -16 - t * 48
      frames.push({ offset: t, opacity: 1 - exit, transform: `translate(calc(-50% + ${x}px),calc(-50% + ${y}px)) rotate(${rotation}deg) scale(${scale})` })
    }
    entry.animation = el.animate(frames, { duration, fill: 'forwards' })
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
      el.append(number, label)
      // Reservar a excursão completa da animação para não cortar números nas bordas.
      const width = root.clientWidth, height = root.clientHeight
      const mx = Math.min(154, width / 2), my = Math.min(106, height / 2)
      el.style.left = `${Math.min(width - mx, Math.max(mx, xFrac * width))}px`
      el.style.top = `${Math.min(height - my, Math.max(my, yFrac * height))}px`
      root.appendChild(el)
      const entry = { el, value, hits: 1, style, slot, targetId: opts.targetId, started: now, killed: !!opts.killed }
      active.add(entry)
      animate(entry)
    },
    dispose() { for (const entry of active) remove(entry) },
  }
}
