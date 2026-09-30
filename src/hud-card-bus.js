// Barramentos por Categoria — HUD dos cards roguelike coletados.
// Spec canônica: docs/specs/ready/roguelike-card-category-bus.md. Substitui por completo o renderer
// legado de bandeja/chips; nada daquele renderer é reaproveitado aqui.
import { aiValidator } from './ai-validator.js'

// categoria do catálogo (src/roguelike.js) → rail. A ordem daqui é a ordem vertical dos rails.
export const CARD_BUS_RAILS = [
  { category: 'ofensivo', modifier: 'offensive', label: 'O' },
  { category: 'defensivo', modifier: 'defensive', label: 'D' },
  { category: 'utilitario', modifier: 'utility', label: 'U' },
]

// densidade pelo maior rail: baixa = [ícone xN], média = ícone N, alta = célula compacta em coluna
export const CARD_BUS_DENSITY_MEDIUM_MIN = 5
export const CARD_BUS_DENSITY_HIGH_MIN = 9
export const CARD_BUS_GAP_PX = 10
const NEW_CARD_FLASH_MS = 320
const STACK_BUMP_MS = 240

export function cardBusDensity(maxRailCount) {
  if (maxRailCount >= CARD_BUS_DENSITY_HIGH_MIN) return 'high'
  if (maxRailCount >= CARD_BUS_DENSITY_MEDIUM_MIN) return 'medium'
  return 'low'
}

// root: elemento posicionado (o #game-screen). catalog: Array de { id, category, icon, label, ... }.
// mode 'classic': `vitalsEl` é o cluster de vitais clássicos; o top vem do getBoundingClientRect()
// real dele. mode 'orbital': o top usa o token compartilhado --hud-classic-vitals-top (o mesmo
// que o CSS dos vitais clássicos consome), nunca a posição dos vitais orbitais/nave.
export function createCardBus({
  root,
  catalog,
  categoryColors = {},
  mode = 'classic',
  vitalsEl = null,
  doc = root.ownerDocument,
}) {
  const cardById = new Map(catalog.map((c) => [c.id, c]))
  const catalogOrder = new Map(catalog.map((c, i) => [c.id, i]))

  const bus = doc.createElement('div')
  bus.className = 'hud-card-bus'
  bus.hidden = true
  root.appendChild(bus)

  const rails = new Map()
  for (const def of CARD_BUS_RAILS) {
    const rail = doc.createElement('div')
    rail.className = `hud-card-rail hud-card-rail--${def.modifier}`
    rail.hidden = true
    const label = doc.createElement('span')
    label.className = 'hud-card-rail-label'
    label.textContent = def.label
    const items = doc.createElement('div')
    items.className = 'hud-card-rail-items'
    rail.appendChild(label)
    rail.appendChild(items)
    bus.appendChild(rail)
    rails.set(def.category, { rail, items, def })
  }

  const cellById = new Map() // cardId → { el, stackEl, count }
  const timers = new Set()
  let signature = ''
  let observer = null
  let destroyed = false

  function schedule(fn, ms) {
    const t = setTimeout(() => {
      timers.delete(t)
      fn()
    }, ms)
    timers.add(t)
  }

  function pulse(el, className, ms) {
    el.classList.remove(className)
    void el.offsetWidth // reinicia a animação CSS
    el.classList.add(className)
    schedule(() => el.classList.remove(className), ms)
  }

  function buildCell(card, count, catColor) {
    const el = doc.createElement('div')
    el.className = 'hud-card-bus-item'
    el.dataset.cardId = card.id
    el.style.setProperty('--card-color', catColor)
    const icon = doc.createElement('span')
    icon.className = 'hud-card-bus-icon'
    icon.textContent = card.icon || '📦'
    const stackEl = doc.createElement('span')
    stackEl.className = 'hud-card-bus-stack'
    stackEl.textContent = `x${count}`
    el.appendChild(icon)
    el.appendChild(stackEl)
    el.appendChild(buildTooltip(card, count))
    return { el, stackEl, count, tooltipStackEl: el.querySelector('.hud-card-tooltip-stacks') }
  }

  // Tooltip só aparece em pausa (CSS); a HUD de gameplay nunca depende dele.
  function buildTooltip(card, count) {
    const tip = doc.createElement('div')
    tip.className = 'hud-card-tooltip'
    const header = doc.createElement('div')
    header.className = 'hud-card-tooltip-header'
    const title = doc.createElement('span')
    title.className = 'hud-card-tooltip-title'
    title.textContent = card.label
    const body = doc.createElement('div')
    body.className = 'hud-card-tooltip-body'
    body.textContent = card.description || ''
    const stacks = doc.createElement('div')
    stacks.className = 'hud-card-tooltip-stacks'
    stacks.textContent = `Nível acumulado: x${count}`
    header.appendChild(title)
    tip.appendChild(header)
    tip.appendChild(body)
    tip.appendChild(stacks)
    return tip
  }

  function clear() {
    for (const { items, rail } of rails.values()) {
      items.textContent = ''
      rail.hidden = true
    }
    cellById.clear()
    bus.hidden = true
    bus.removeAttribute('data-density')
    signature = ''
  }

  // Map<cardId,count> → DOM. Só recria o conjunto de células quando o CONJUNTO de ids muda;
  // mudança apenas de count reaproveita a mesma célula e atualiza só o contador.
  function update(cardsMap) {
    if (destroyed) return
    if (!cardsMap) {
      clear()
      return
    }
    const entries = []
    for (const [id, count] of cardsMap.entries()) {
      if (!(count > 0)) continue
      if (!cardById.has(id)) {
        console.warn(`[card-bus] carta sem definição no catálogo: ${id}`)
        continue
      }
      entries.push([id, count])
    }
    const sig = entries.map(([id, count]) => `${id}:${count}`).sort().join(';')
    if (sig === signature) return
    signature = sig

    const idSetChanged =
      entries.length !== cellById.size || entries.some(([id]) => !cellById.has(id))

    if (idSetChanged) {
      const hadCells = cellById.size > 0
      const previousIds = new Set(cellById.keys())
      for (const { items } of rails.values()) items.textContent = ''
      const nextCells = new Map()

      // ordem do catálogo, nunca a de inserção do Map nem por stack
      entries.sort((a, b) => catalogOrder.get(a[0]) - catalogOrder.get(b[0]))
      const perRail = new Map(CARD_BUS_RAILS.map((r) => [r.category, 0]))

      for (const [id, count] of entries) {
        const card = cardById.get(id)
        const railRef = rails.get(card.category)
        if (!railRef) {
          // categoria desconhecida: nunca reclassificar em silêncio (ex.: em Ofensivo)
          aiValidator.expect(
            'card-bus: categoria da carta é ofensivo/defensivo/utilitario',
            () => false,
            { cardId: id, category: card.category }
          )
          console.warn(`[card-bus] categoria desconhecida "${card.category}" (carta ${id}); não exibida`)
          continue
        }
        const cell = cellById.get(id) || buildCell(card, count, catColorFor(card))
        cell.count = count
        cell.stackEl.textContent = `x${count}`
        if (cell.tooltipStackEl) cell.tooltipStackEl.textContent = `Nível acumulado: x${count}`
        railRef.items.appendChild(cell.el)
        nextCells.set(id, cell)
        perRail.set(card.category, perRail.get(card.category) + 1)
        if (hadCells && !previousIds.has(id)) pulse(cell.el, 'is-new', NEW_CARD_FLASH_MS)
      }

      cellById.clear()
      for (const [id, cell] of nextCells) cellById.set(id, cell)

      let maxRail = 0
      for (const [category, n] of perRail) {
        rails.get(category).rail.hidden = n === 0
        if (n > maxRail) maxRail = n
      }
      bus.hidden = cellById.size === 0
      if (maxRail > 0) bus.dataset.density = cardBusDensity(maxRail)
      else bus.removeAttribute('data-density')
    } else {
      // mesmo conjunto de cartas: só contadores mudaram
      for (const [id, count] of entries) {
        const cell = cellById.get(id)
        if (cell.count === count) continue
        cell.count = count
        cell.stackEl.textContent = `x${count}`
        if (cell.tooltipStackEl) cell.tooltipStackEl.textContent = `Nível acumulado: x${count}`
        pulse(cell.stackEl, 'is-bump', STACK_BUMP_MS)
      }
    }

    aiValidator.expect(
      'card-bus: nº de células == nº de cartas distintas com count > 0',
      () => bus.querySelectorAll('.hud-card-bus-item').length === entries.length,
      { cells: cellById.size, entries: entries.length }
    )
    reposition()
  }

  function catColorFor(card) {
    return categoryColors[card.category] || '#3ea6ff'
  }

  // Medição real do cluster de vitais (clássico) ou token compartilhado (orbital). Chamado só em
  // montagem, resize/mudança estrutural e mudança do conjunto de cartas — nunca por frame.
  function reposition() {
    if (destroyed) return
    if (mode === 'orbital' || !vitalsEl) {
      bus.style.top = 'var(--hud-classic-vitals-top)'
      return
    }
    const rootRect = root.getBoundingClientRect()
    const vitalsRect = vitalsEl.getBoundingClientRect()
    bus.style.top = `${Math.round(vitalsRect.bottom - rootRect.top + CARD_BUS_GAP_PX)}px`
  }

  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => reposition())
    observer.observe(root)
    if (mode === 'classic' && vitalsEl) observer.observe(vitalsEl)
  }

  function destroy() {
    destroyed = true
    observer?.disconnect()
    observer = null
    for (const t of timers) clearTimeout(t)
    timers.clear()
    cellById.clear()
    rails.clear()
    signature = ''
    bus.remove()
  }

  return { el: bus, update, reposition, destroy }
}
