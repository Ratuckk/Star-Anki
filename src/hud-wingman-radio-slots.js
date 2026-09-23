const WINGMAN_RADIO_AVATARS = [
  'assets/wingman-radio/falco.png',
  'assets/wingman-radio/peppy.png',
  'assets/wingman-radio/slippy.png',
  'assets/wingman-radio/miyu.png',
]

const PILOTS = [
  { id: 0, name: 'FALCO', color: '#38bdf8' },
  { id: 1, name: 'PEPPY', color: '#fbbf24' },
  { id: 2, name: 'SLIPPY', color: '#fde047' },
  { id: 3, name: 'MIYU', color: '#f43f5e' },
]

const ENTRY_HOLD_MS = 3600
const RESPONSE_HOLD_MS = 4200
const MAX_ENTRIES_PER_SLOT = 3

function injectStyles() {
  if (document.getElementById('star-anki-wingman-radio-slots-style')) return
  const style = document.createElement('style')
  style.id = 'star-anki-wingman-radio-slots-style'
  style.textContent = `
    /* v0.99.28: o painel legado fica montado para compatibilidade, mas o roteamento novo não usa
       mais os dois canais seriais. Trivial vive nos 4 slots abaixo das cartas; ability/focus é
       in-world e não usa DOM lateral. */
    .hud-wingman-radio,
    .hud-wingman-ability-panel {
      display: none !important;
    }

    .hud-wingman-radio-slots {
      position: absolute;
      left: 12px;
      top: var(--wingman-trivial-slots-top, 180px);
      width: min(560px, calc(100vw - 24px));
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      z-index: 45;
      pointer-events: none;
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    }

    .hud-wingman-radio-slot {
      --slot-color: #38bdf8;
      min-height: 62px;
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr);
      gap: 7px;
      padding: 5px 7px 5px 5px;
      border: 1px solid color-mix(in srgb, var(--slot-color) 35%, transparent);
      background: rgba(4, 9, 18, 0.72);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.025);
      opacity: 0.16;
      transform: translateY(-2px);
      transition: opacity 130ms ease-out, transform 160ms ease-out, border-color 160ms ease-out, box-shadow 160ms ease-out;
      overflow: hidden;
    }

    .hud-wingman-radio-slot.active {
      opacity: 1;
      transform: translateY(0);
      border-color: var(--slot-color);
      box-shadow: 0 0 11px color-mix(in srgb, var(--slot-color) 28%, transparent),
                  inset 0 0 0 1px rgba(255,255,255,0.04);
    }

    .hud-wingman-radio-slot-avatar {
      width: 42px;
      height: 42px;
      object-fit: cover;
      image-rendering: pixelated;
      border: 1px solid var(--slot-color);
      background: #07111d;
      margin-top: 1px;
    }

    .hud-wingman-radio-slot-copy {
      min-width: 0;
    }

    .hud-wingman-radio-slot-name {
      display: block;
      color: var(--slot-color);
      font-size: 9px;
      font-weight: 900;
      line-height: 1.15;
      letter-spacing: .08em;
      margin-bottom: 3px;
    }

    .hud-wingman-radio-slot-entries {
      display: grid;
      gap: 2px;
      min-height: 16px;
    }

    .hud-wingman-radio-slot-entry {
      color: #f8fafc;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.24;
      text-shadow: 0 1px 2px rgba(0,0,0,.95);
      overflow-wrap: anywhere;
      animation: wingman-slot-entry-in 150ms ease-out both;
    }

    .hud-wingman-radio-slot-entry.response {
      margin-top: 1px;
      padding-top: 2px;
      border-top: 1px solid color-mix(in srgb, var(--slot-color) 28%, transparent);
      color: #cbd5e1;
      font-size: 9.5px;
      font-weight: 650;
      opacity: .94;
    }

    .hud-wingman-radio-slot-entry .reply-to {
      color: var(--slot-color);
      font-size: 8px;
      font-weight: 900;
      letter-spacing: .05em;
      text-transform: uppercase;
      margin-right: 4px;
    }

    @keyframes wingman-slot-entry-in {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 820px) {
      .hud-wingman-radio-slots {
        width: min(360px, calc(100vw - 24px));
        grid-template-columns: 1fr;
      }
      .hud-wingman-radio-slot {
        min-height: 54px;
      }
    }
  `
  document.head.appendChild(style)
}

function normalizePayload(payload) {
  if (!payload || !Number.isInteger(payload.pilotId)) return null
  if (payload.pilotId < 0 || payload.pilotId > 3) return null
  return payload
}

export function createWingmanRadioSlots() {
  injectStyles()
  const root = document.getElementById('game-screen')
  if (!root) {
    return { show() {}, showMany() {}, dispose() {} }
  }

  const container = document.createElement('div')
  container.className = 'hud-wingman-radio-slots'
  const slots = new Map()
  const timers = new Set()

  for (const pilot of PILOTS) {
    const slot = document.createElement('section')
    slot.className = 'hud-wingman-radio-slot'
    slot.dataset.pilotId = String(pilot.id)
    slot.style.setProperty('--slot-color', pilot.color)
    slot.innerHTML = `
      <img class="hud-wingman-radio-slot-avatar" src="${WINGMAN_RADIO_AVATARS[pilot.id]}" alt="">
      <div class="hud-wingman-radio-slot-copy">
        <b class="hud-wingman-radio-slot-name">${pilot.name}</b>
        <div class="hud-wingman-radio-slot-entries"></div>
      </div>
    `
    container.appendChild(slot)
    slots.set(pilot.id, {
      root: slot,
      entries: slot.querySelector('.hud-wingman-radio-slot-entries'),
      items: [],
    })
  }

  root.appendChild(container)

  function updateAnchor() {
    const cardsTray = root.querySelector('.hud-cards-tray')
    const bottom = cardsTray ? cardsTray.offsetTop + cardsTray.offsetHeight : 156
    root.style.setProperty('--wingman-trivial-slots-top', `${Math.max(170, bottom + 12)}px`)
  }

  updateAnchor()
  const cardsTray = root.querySelector('.hud-cards-tray')
  const resizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(updateAnchor)
    : null
  if (cardsTray) resizeObserver?.observe(cardsTray)

  function removeItem(slot, item) {
    const idx = slot.items.indexOf(item)
    if (idx >= 0) slot.items.splice(idx, 1)
    item.el.remove()
    if (slot.items.length === 0) slot.root.classList.remove('active')
  }

  function show(payload) {
    payload = normalizePayload(payload)
    if (!payload || payload.isAbility || payload.inWorld) return
    const slot = slots.get(payload.pilotId)
    if (!slot) return

    const el = document.createElement('div')
    const isResponse = !!payload.isCallResponse
    el.className = 'hud-wingman-radio-slot-entry' + (isResponse ? ' response' : '')

    if (isResponse) {
      const opener = PILOTS[payload.openerPilotId]
      const replyTo = opener ? `↳ ${opener.name}` : '↳ RESPOSTA'
      const label = document.createElement('span')
      label.className = 'reply-to'
      label.textContent = replyTo
      el.appendChild(label)
      el.appendChild(document.createTextNode(String(payload.text || '')))
    } else {
      el.textContent = String(payload.text || '')
    }

    slot.entries.appendChild(el)
    slot.root.classList.add('active')

    const item = { el, payload }
    slot.items.push(item)
    while (slot.items.length > MAX_ENTRIES_PER_SLOT) {
      const oldest = slot.items.shift()
      oldest?.el.remove()
    }

    const timeout = setTimeout(() => {
      timers.delete(timeout)
      removeItem(slot, item)
    }, isResponse ? RESPONSE_HOLD_MS : ENTRY_HOLD_MS)
    timers.add(timeout)
  }

  function showMany(payloads) {
    if (!Array.isArray(payloads)) return
    for (const payload of payloads) show(payload)
  }

  function dispose() {
    resizeObserver?.disconnect()
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
    container.remove()
  }

  return { show, showMany, dispose }
}
