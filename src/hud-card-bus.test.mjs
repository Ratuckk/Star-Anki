import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ROGUELIKE_CARDS, CARD_CATEGORY_COLOR } from './roguelike.js'
import { createCardBus, cardBusDensity, CARD_BUS_RAILS } from './hud-card-bus.js'

console.log('--- TEST SUITE: Barramentos por Categoria (cards roguelike) ---')

// ============================================================================
// DOM mínimo (CI só instala `three`; sem jsdom). Cobre só o que o módulo usa.
// ============================================================================
class FakeEl {
  constructor(doc, tag) {
    this.ownerDocument = doc
    this.tagName = tag.toUpperCase()
    this.children = []
    this.parent = null
    this._classes = new Set()
    this._text = ''
    this.hidden = false
    this.dataset = {}
    this.attrs = {}
    this._vars = {}
    this.style = { setProperty: (k, v) => { this._vars[k] = v }, top: '' }
    const self = this
    this.classList = {
      add: (c) => self._classes.add(c),
      remove: (c) => self._classes.delete(c),
      contains: (c) => self._classes.has(c),
    }
    this.offsetWidth = 0
  }
  set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)) }
  get className() { return [...this._classes].join(' ') }
  set textContent(v) {
    for (const c of this.children) c.parent = null
    this.children = []
    this._text = String(v)
  }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join('') }
  appendChild(el) {
    if (el.parent) el.parent.children = el.parent.children.filter((c) => c !== el)
    el.parent = this
    this.children.push(el)
    return el
  }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null }
  setAttribute(k, v) { this.attrs[k] = v; if (k === 'data-density') this.dataset.density = v }
  removeAttribute(k) { delete this.attrs[k]; if (k === 'data-density') delete this.dataset.density }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 } }
  _all(out = []) { for (const c of this.children) { out.push(c); c._all(out) } return out }
  querySelectorAll(sel) {
    const cls = sel.replace(/^\./, '')
    return this._all().filter((e) => e._classes.has(cls))
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null }
}
function makeDoc() {
  const doc = { createElement: (tag) => new FakeEl(doc, tag) }
  doc.root = new FakeEl(doc, 'div')
  return doc
}
function mount(overrides = {}) {
  const doc = makeDoc()
  const bus = createCardBus({
    root: doc.root,
    catalog: ROGUELIKE_CARDS,
    categoryColors: CARD_CATEGORY_COLOR,
    mode: 'orbital',
    doc,
    ...overrides,
  })
  return { doc, bus, root: doc.root }
}
const items = (root) => root.querySelectorAll('.hud-card-bus-item')
const railItems = (root, mod) => root.querySelector(`.hud-card-rail--${mod}`).querySelector('.hud-card-rail-items').children

// ============================================================================
// 1. Catálogo real e ausência do renderer legado
// ============================================================================
{
  console.log('Testing 1: catálogo 32 = 14/11/7 e ausência do legado montado...')
  const byCat = ROGUELIKE_CARDS.reduce((a, c) => ((a[c.category] = (a[c.category] || 0) + 1), a), {})
  assert.deepEqual(byCat, { ofensivo: 14, defensivo: 11, utilitario: 7 })
  assert.equal(ROGUELIKE_CARDS.length, 32)

  const { root, bus } = mount()
  assert.equal(root.querySelector('.hud-cards-tray'), null, 'tray legado não pode existir')
  assert.equal(root.querySelector('.hud-card-chip'), null, 'chip legado não pode existir')
  assert.notEqual(root.querySelector('.hud-card-bus'), null, 'novo bus deve existir')
  bus.update(new Map([[ROGUELIKE_CARDS[0].id, 1]]))
  assert.equal(root.querySelector('.hud-cards-tray'), null)
  assert.equal(root.querySelector('.hud-card-chip'), null)
  bus.destroy()
}

// ============================================================================
// 2. Nº de itens = nº de ids distintos com count > 0 (stack não multiplica)
// ============================================================================
{
  console.log('Testing 2: itens == ids distintos com count > 0...')
  const { root, bus } = mount()
  const [a, b, c] = ROGUELIKE_CARDS
  bus.update(new Map([[a.id, 7], [b.id, 3], [c.id, 0]]))
  assert.equal(items(root).length, 2, 'A x7 + B x3 = 2 itens, não 10; count 0 ignorado')
  bus.update(null)
  assert.equal(items(root).length, 0)
  assert.equal(root.querySelector('.hud-card-bus').hidden, true, 'bus vazio fica oculto')
  bus.destroy()
}

// ============================================================================
// 3. Atualização de stack: mesma célula, mesma ordem, só o contador
// ============================================================================
{
  console.log('Testing 3: x3 -> x4 mantém a mesma célula...')
  const { root, bus } = mount()
  const [a, b, c] = ROGUELIKE_CARDS
  bus.update(new Map([[a.id, 3], [b.id, 2], [c.id, 1]]))
  const before = items(root)
  const orderBefore = before.map((e) => e.dataset.cardId)
  bus.update(new Map([[a.id, 4], [b.id, 2], [c.id, 1]]))
  const after = items(root)
  assert.equal(after.length, before.length)
  after.forEach((el, i) => assert.equal(el, before[i], `célula ${i} deve ser o mesmo nó`))
  assert.deepEqual(after.map((e) => e.dataset.cardId), orderBefore)
  assert.equal(after[0].querySelector('.hud-card-bus-stack').textContent, 'x4')
  assert.equal(after[1].querySelector('.hud-card-bus-stack').textContent, 'x2')
  assert.equal(after[0].querySelector('.hud-card-bus-stack').classList.contains('is-bump'), true, 'só o contador anima')
  assert.equal(after[1].querySelector('.hud-card-bus-stack').classList.contains('is-bump'), false)
  assert.equal(after[0].classList.contains('is-new'), false)
  // adicionar nova carta preserva as células antigas
  bus.update(new Map([[a.id, 4], [b.id, 2], [c.id, 1], [ROGUELIKE_CARDS[3].id, 1]]))
  const grown = items(root)
  assert.equal(grown.length, 4)
  assert.equal(grown.filter((e) => before.includes(e)).length, 3, 'células existentes reaproveitadas')
  bus.destroy()
}

// ============================================================================
// 4. Categoria -> rail; ordem estável do catálogo; categoria vazia oculta
// ============================================================================
{
  console.log('Testing 4: categoria -> O/D/U, ordem do catálogo, rail vazio oculto...')
  const { root, bus } = mount()
  const off = ROGUELIKE_CARDS.filter((c) => c.category === 'ofensivo').slice(0, 3)
  const util = ROGUELIKE_CARDS.find((c) => c.category === 'utilitario')
  // inserção em ordem invertida e stacks decrescentes: a ordem visual segue o catálogo
  const m = new Map([[util.id, 1], [off[2].id, 1], [off[1].id, 5], [off[0].id, 9]])
  bus.update(m)
  assert.deepEqual(railItems(root, 'offensive').map((e) => e.dataset.cardId), off.map((c) => c.id))
  assert.deepEqual(railItems(root, 'utility').map((e) => e.dataset.cardId), [util.id])
  assert.equal(railItems(root, 'defensive').length, 0)
  assert.equal(root.querySelector('.hud-card-rail--offensive').hidden, false)
  assert.equal(root.querySelector('.hud-card-rail--defensive').hidden, true, 'D vazio oculto')
  assert.equal(root.querySelector('.hud-card-rail--utility').hidden, false)
  const labels = CARD_BUS_RAILS.map((r) => r.label)
  assert.deepEqual(labels, ['O', 'D', 'U'])
  bus.destroy()
}

// ============================================================================
// 5. Categoria desconhecida: nunca cai em Ofensivo; gera aviso observável
// ============================================================================
{
  console.log('Testing 5: categoria desconhecida não é reclassificada...')
  const weird = { id: 'weird', category: 'raro', label: 'X', icon: '?', description: '' }
  const { root, bus } = mount({ catalog: [...ROGUELIKE_CARDS, weird] })
  const warns = []
  const origWarn = console.warn
  console.warn = (...a) => warns.push(a.join(' '))
  try {
    bus.update(new Map([['weird', 2], [ROGUELIKE_CARDS[0].id, 1]]))
  } finally {
    console.warn = origWarn
  }
  assert.equal(items(root).length, 1, 'carta de categoria desconhecida não é renderizada')
  assert.equal(railItems(root, 'offensive').filter((e) => e.dataset.cardId === 'weird').length, 0)
  assert.ok(warns.some((w) => w.includes('categoria desconhecida')), 'fallback/log observável')
  bus.destroy()
}

// ============================================================================
// 6. Catálogo inteiro (32) com stacks de 2 dígitos
// ============================================================================
{
  console.log('Testing 6: 32 cartas simultâneas, stacks x1..x12...')
  const { root, bus } = mount()
  const stacks = [1, 2, 3, 5, 9, 10, 12]
  const m = new Map(ROGUELIKE_CARDS.map((c, i) => [c.id, stacks[i % stacks.length]]))
  bus.update(m)
  assert.equal(items(root).length, 32)
  assert.equal(railItems(root, 'offensive').length, 14)
  assert.equal(railItems(root, 'defensive').length, 11)
  assert.equal(railItems(root, 'utility').length, 7)
  assert.equal(root.querySelector('.hud-card-bus').dataset.density, 'high')
  const two = items(root).filter((e) => /^x\d\d$/.test(e.querySelector('.hud-card-bus-stack').textContent))
  assert.ok(two.length > 0, 'há stacks de dois dígitos')
  // cada categoria é uma única linha: um único .hud-card-rail-items por rail
  for (const mod of ['offensive', 'defensive', 'utility']) {
    assert.equal(root.querySelector(`.hud-card-rail--${mod}`).querySelectorAll('.hud-card-rail-items').length, 1)
  }
  bus.destroy()
}

// ============================================================================
// 7. Densidade adaptativa (número nunca some; muda só a apresentação)
// ============================================================================
{
  console.log('Testing 7: densidade baixa/média/alta...')
  assert.equal(cardBusDensity(1), 'low')
  assert.equal(cardBusDensity(4), 'low')
  assert.equal(cardBusDensity(5), 'medium')
  assert.equal(cardBusDensity(8), 'medium')
  assert.equal(cardBusDensity(9), 'high')
  assert.equal(cardBusDensity(14), 'high')
  const { root, bus } = mount()
  for (const n of [1, 4, 8, 16, 24, 32]) {
    bus.update(new Map(ROGUELIKE_CARDS.slice(0, n).map((c) => [c.id, 3])))
    assert.equal(items(root).length, n)
    for (const el of items(root)) assert.ok(el.querySelector('.hud-card-bus-stack').textContent.length > 0)
  }
  bus.destroy()
}

// ============================================================================
// 8. Posicionamento: orbital usa o token; clássico mede o cluster de vitais
// ============================================================================
{
  console.log('Testing 8: ancoragem orbital (token) e clássica (medida)...')
  const orb = mount({ mode: 'orbital' })
  orb.bus.update(new Map([[ROGUELIKE_CARDS[0].id, 1]]))
  assert.equal(orb.bus.el.style.top, 'var(--hud-classic-vitals-top)')
  orb.bus.destroy()

  const doc = makeDoc()
  const vitals = new FakeEl(doc, 'div')
  doc.root.appendChild(vitals)
  doc.root.getBoundingClientRect = () => ({ top: 10 })
  vitals.getBoundingClientRect = () => ({ bottom: 210 })
  const cls = createCardBus({ root: doc.root, catalog: ROGUELIKE_CARDS, categoryColors: CARD_CATEGORY_COLOR, mode: 'classic', vitalsEl: vitals, doc })
  cls.reposition()
  assert.equal(cls.el.style.top, '210px', 'top = vitals.bottom - root.top + gap(10)')
  vitals.getBoundingClientRect = () => ({ bottom: 300 })
  cls.reposition()
  assert.equal(cls.el.style.top, '300px')
  cls.destroy()
}

// ============================================================================
// 9. Ciclo de vida: destroy limpa tudo e não deixa timers
// ============================================================================
{
  console.log('Testing 9: destroy()/remontagem...')
  const { doc, root, bus } = mount()
  bus.update(new Map([[ROGUELIKE_CARDS[0].id, 1]]))
  bus.update(new Map([[ROGUELIKE_CARDS[0].id, 2], [ROGUELIKE_CARDS[1].id, 1]])) // agenda pulse
  bus.destroy()
  assert.equal(root.querySelector('.hud-card-bus'), null, 'bus removido do DOM')
  bus.update(new Map([[ROGUELIKE_CARDS[0].id, 5]])) // no-op após destroy
  assert.equal(items(root).length, 0)
  const again = createCardBus({ root, catalog: ROGUELIKE_CARDS, categoryColors: CARD_CATEGORY_COLOR, mode: 'orbital', doc })
  again.update(new Map([[ROGUELIKE_CARDS[0].id, 1]]))
  assert.equal(root.querySelectorAll('.hud-card-bus').length, 1, 'remontar não duplica')
  assert.equal(items(root).length, 1)
  again.destroy()
}

// ============================================================================
// 10. Código de produção: sem renderer legado, sem wrap/scroll no bus, sem hover geométrico
// ============================================================================
{
  console.log('Testing 10: código de produção sem legado e CSS do bus sem wrap/scroll...')
  const hudGame = readFileSync(new URL('./hud-game.js', import.meta.url), 'utf8')
  const hudStyles = readFileSync(new URL('./hud-styles.js', import.meta.url), 'utf8')
  const busSrc = readFileSync(new URL('./hud-card-bus.js', import.meta.url), 'utf8')
  for (const [name, src] of [['hud-game', hudGame], ['hud-styles', hudStyles], ['hud-card-bus', busSrc]]) {
    assert.ok(!/hud-cards-tray|hud-card-chip|hud-card-icon\b|hud-card-count\b/.test(src), `${name}: sem renderer legado`)
  }
  assert.ok(/createCardBus\(/.test(hudGame), 'hud-game monta o bus')
  assert.ok(/cardBus\.destroy\(\)/.test(hudGame), 'unmount destrói o bus')
  assert.ok(/--hud-classic-vitals-top/.test(hudStyles), 'token compartilhado do slot clássico')

  const start = hudStyles.indexOf('BARRAMENTOS POR CATEGORIA')
  const end = hudStyles.indexOf('MODAL DE PERGUNTA COM PAUSA TOTAL')
  const busCss = hudStyles.slice(start, end)
  assert.ok(start > 0 && end > start)
  assert.ok(!/flex-wrap:\s*wrap/.test(busCss), 'bus sem flex-wrap: wrap')
  assert.ok(!/overflow(-x|-y)?:\s*(auto|scroll)/.test(busCss), 'bus sem scroll')
  // só o hover da própria célula conta (o tooltip é absoluto e fora do fluxo, aparece só em pausa)
  const cellHover = busCss.match(/\.hud-card-bus-item:hover\s*\{[^}]*\}/)
  assert.ok(cellHover, 'regra de hover da célula existe')
  assert.ok(!/(scale\(|width:|height:|padding:|margin:)/.test(cellHover[0]), 'hover da célula não altera geometria')
}

console.log('✔ hud-card-bus.test.mjs: todos os testes passaram')
