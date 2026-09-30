import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { computeFocoView, computeSwirlView, createArmamentWidget } from './hud-armament.js'
import { aiValidator } from './ai-validator.js'

console.log('--- TEST SUITE: Display de Armamento (FOCO / SWIRL, Opção B) ---')

// ---- DOM mínimo (CI só instala `three`) ----
class FakeEl {
  constructor(tag) {
    this.tagName = tag.toUpperCase()
    this.children = []
    this.parent = null
    this._c = new Set()
    this._text = ''
    this.attrs = {}
    this.style = {}
    this.offsetWidth = 0
    const self = this
    this.classList = { add: (...c) => c.forEach((x) => self._c.add(x)), remove: (...c) => c.forEach((x) => self._c.delete(x)), contains: (c) => self._c.has(c) }
  }
  set className(v) { this._c = new Set(String(v).split(/\s+/).filter(Boolean)) }
  get className() { return [...this._c].join(' ') }
  set textContent(v) { this._text = String(v); this.children = [] }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join('') }
  appendChild(e) { e.parent = this; this.children.push(e); return e }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null }
  setAttribute(k, v) { this.attrs[k] = v }
  _all(o = []) { for (const c of this.children) { o.push(c); c._all(o) } return o }
  q(cls) { return this._all().find((e) => e._c.has(cls)) }
}
const doc = { createElement: (t) => new FakeEl(t) }

// ============================================================================
// 1. FOCO — estados com os valores REAIS do runtime (não 6s/10s hardcoded)
// ============================================================================
{
  console.log('Testing 1: FOCO READY / ACTIVE / COOLDOWN...')
  const base = { mode: 'free', durationRemaining: 0, durationMax: 6, cooldownRemaining: 0, cooldownMax: 10 }
  const ready = computeFocoView(base)
  assert.deepEqual([ready.state, ready.value, ready.sub, ready.frac], ['ready', 'PRONTO', 'DISPONÍVEL', 1])

  const a6 = computeFocoView({ ...base, mode: 'focus', durationRemaining: 6 })
  assert.deepEqual([a6.state, a6.value, a6.sub, a6.frac], ['active', '6.0s', 'ATIVO', 1])
  const a37 = computeFocoView({ ...base, mode: 'focus', durationRemaining: 3.7 })
  assert.equal(a37.value, '3.7s')
  assert.ok(Math.abs(a37.frac - 3.7 / 6) < 1e-9, 'barra ACTIVE = durationRemaining / durationMax')
  const a05 = computeFocoView({ ...base, mode: 'focus', durationRemaining: 0.5 })
  assert.equal(a05.value, '0.5s')
  assert.ok(a05.frac < a37.frac && a37.frac < a6.frac, 'barra ACTIVE DIMINUI ao longo do tempo')

  const c10 = computeFocoView({ ...base, cooldownRemaining: 10 })
  const c5 = computeFocoView({ ...base, cooldownRemaining: 5 })
  const c1 = computeFocoView({ ...base, cooldownRemaining: 1 })
  assert.deepEqual([c10.state, c10.value, c10.sub, c10.frac], ['cooling', '10s', 'RECARGA', 0])
  assert.deepEqual([c5.value, c5.frac], ['5s', 0.5])
  assert.deepEqual([c1.value, c1.frac], ['1s', 0.9])
  assert.ok(c10.frac < c5.frac && c5.frac < c1.frac, 'barra COOLDOWN ENCHE ao longo do tempo')
  assert.equal(computeFocoView({ ...base, cooldownRemaining: 6.2 }).value, '7s', 'FOCO cooldown arredonda para cima (segundos inteiros)')

  // valores reais diferentes dos padrões: a barra usa durationMax/cooldownMax fornecidos
  const custom = computeFocoView({ ...base, mode: 'focus', durationRemaining: 4, durationMax: 8 })
  assert.equal(custom.frac, 0.5)
  const customCd = computeFocoView({ ...base, cooldownRemaining: 3, cooldownMax: 12 })
  assert.equal(customCd.frac, 0.75)

  // retorno a READY: cooldown zerado
  assert.equal(computeFocoView({ ...base, cooldownRemaining: 0 }).state, 'ready')
  // modo 'focus' sem duração restante não é ACTIVE
  assert.equal(computeFocoView({ ...base, mode: 'focus', durationRemaining: 0 }).state, 'ready')
  // entrada ausente/inválida não quebra e nunca gera frac fora de [0,1]
  assert.equal(computeFocoView(undefined).state, 'ready')
  const weird = computeFocoView({ ...base, cooldownRemaining: 50, cooldownMax: 10 })
  assert.ok(weird.frac >= 0 && weird.frac <= 1)
}

// ============================================================================
// 2. SWIRL — só READY / COOLDOWN; total efetivo vem do player (cartas)
// ============================================================================
{
  console.log('Testing 2: SWIRL READY / COOLDOWN, total efetivo alterado por carta...')
  const ready = computeSwirlView(0, 10000)
  assert.deepEqual([ready.state, ready.value, ready.sub, ready.frac], ['ready', 'PRONTO', 'DISPONÍVEL', 1])
  const start = computeSwirlView(10000, 10000)
  const half = computeSwirlView(5000, 10000)
  const end = computeSwirlView(300, 10000)
  assert.deepEqual([start.state, start.value, start.sub, start.frac], ['cooling', '10.0s', 'RECARGA', 0])
  assert.deepEqual([half.value, half.frac], ['5.0s', 0.5])
  assert.equal(end.value, '0.3s')
  assert.ok(start.frac < half.frac && half.frac < end.frac)
  // carta que reduz o cooldown total (ex.: 7s): a fração usa o total EFETIVO, não 10s
  const carded = computeSwirlView(3500, 7000)
  assert.deepEqual([carded.value, carded.frac], ['3.5s', 0.5])
  // total 0/ausente não gera NaN/Infinity
  const bad = computeSwirlView(1000, 0)
  assert.ok(Number.isFinite(bad.frac) && bad.frac >= 0 && bad.frac <= 1)
  // SWIRL nunca tem estado 'active'
  for (const cd of [0, 1, 4300, 10000]) assert.notEqual(computeSwirlView(cd, 10000).state, 'active')
  assert.equal(computeSwirlView(4300, 10000).value, '4.3s')
}

// ============================================================================
// 3. Widget: DOM estável, classes de estado, microanimações, ciclo completo
// ============================================================================
{
  console.log('Testing 3: widget FOCO (ciclo READY → ACTIVE → COOLDOWN → READY) sem recriar DOM...')
  const timers = new Map()
  let nextId = 1
  const schedule = (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms }); return id }
  const w = createArmamentWidget({ doc, kind: 'foco', tag: 'FOCO', schedule })
  const root = new FakeEl('div'); root.appendChild(w.el)
  const nodesBefore = w.el._all().length
  const value = () => w.el.q('hud-arm-value').textContent
  const sub = () => w.el.q('hud-arm-sub').textContent
  const width = () => w.el.q('hud-arm-fill').style.width

  assert.ok(w.el.classList.contains('is-ready'))
  assert.equal(w.el.q('hud-arm-tag').textContent, 'FOCO')
  assert.equal(width(), '100%')
  assert.equal(w.el.attrs['aria-label'], 'FOCO PRONTO')

  const cmd = { mode: 'free', durationRemaining: 0, durationMax: 6, cooldownRemaining: 0, cooldownMax: 10 }
  const push = (patch) => { Object.assign(cmd, patch); w.update(computeFocoView(cmd)) }
  const anim = (c) => w.el.classList.contains(c)

  // READY → ACTIVE: microanimação local
  push({ mode: 'focus', durationRemaining: 6 })
  assert.ok(w.el.classList.contains('is-active') && !w.el.classList.contains('is-ready'))
  assert.equal(value(), '6.0s'); assert.equal(sub(), 'ATIVO'); assert.equal(width(), '100%')
  assert.ok(anim('is-igniting'), 'READY→ACTIVE dispara o sweep/flash local')
  assert.equal(w.el.attrs['aria-label'], 'FOCO ATIVO')
  const ignite = [...timers.values()].find((t) => t.ms >= 200 && t.ms <= 300)
  assert.ok(ignite, 'animação de ignição dura ~200–300 ms')
  const ids = [...timers.keys()]; timers.get(ids[ids.length - 1]).fn(); timers.delete(ids[ids.length - 1])
  assert.ok(!anim('is-igniting'), 'depois da ignição o widget estabiliza')

  // ACTIVE diminui, sem re-animar
  const widths = []
  for (const d of [4.5, 3.0, 0.5]) { push({ durationRemaining: d }); widths.push(parseFloat(width())) }
  assert.ok(widths[0] > widths[1] && widths[1] > widths[2], 'barra ACTIVE esvazia')
  assert.equal(value(), '0.5s')
  assert.ok(!anim('is-igniting'), 'não pisca continuamente durante o ACTIVE')
  const timersDuringActive = timers.size

  // ACTIVE → COOLDOWN
  push({ mode: 'free', durationRemaining: 0, cooldownRemaining: 10 })
  assert.ok(w.el.classList.contains('is-cooling'))
  assert.equal(value(), '10s'); assert.equal(sub(), 'RECARGA'); assert.equal(width(), '0%')
  assert.ok(!anim('is-ready-flash') && !anim('is-igniting'))
  const cw = []
  for (const c of [8, 5, 1]) { push({ cooldownRemaining: c }); cw.push(parseFloat(width())) }
  assert.ok(cw[0] < cw[1] && cw[1] < cw[2], 'barra COOLDOWN enche')
  assert.equal(value(), '1s')

  // COOLDOWN → READY: flash curto no próprio frame
  push({ cooldownRemaining: 0 })
  assert.ok(w.el.classList.contains('is-ready'))
  assert.equal(value(), 'PRONTO'); assert.equal(sub(), 'DISPONÍVEL'); assert.equal(width(), '100%')
  assert.ok(anim('is-ready-flash'), 'retorno a READY faz flash curto')

  assert.equal(w.el._all().length, nodesBefore, 'nenhum nó DOM criado/destruído durante o ciclo')
  assert.ok(timersDuringActive <= 3, 'poucos timers (só microanimações)')

  // update repetido com o mesmo estado não toca no DOM nem agenda timers
  const before = timers.size
  for (let i = 0; i < 50; i++) push({})
  assert.equal(timers.size, before, 'atualizações idênticas não agendam nada')

  // destroy limpa tudo
  w.destroy()
  assert.equal(root.children.length, 0)
  w.update(computeFocoView({ mode: 'focus', durationRemaining: 3, durationMax: 6 })) // no-op
}

{
  console.log('Testing 4: widget SWIRL (disparo → colapso → retorno)...')
  const timers = []
  const w = createArmamentWidget({ doc, kind: 'swirl', tag: 'SWIRL', schedule: (fn, ms) => { timers.push({ fn, ms }); return timers.length } })
  const value = () => w.el.q('hud-arm-value').textContent
  assert.equal(w.el.q('hud-arm-tag').textContent, 'SWIRL')
  w.update(computeSwirlView(10000, 10000))
  assert.ok(w.el.classList.contains('is-cooling'))
  assert.ok(w.el.classList.contains('is-firing'), 'disparo = pulso curto + colapso da barra')
  assert.ok(timers.some((t) => t.ms >= 180 && t.ms <= 260))
  assert.equal(w.el.q('hud-arm-fill').style.width, '0%')
  w.update(computeSwirlView(5000, 10000)); assert.equal(w.el.q('hud-arm-fill').style.width, '50%'); assert.equal(value(), '5.0s')
  w.update(computeSwirlView(0, 10000))
  assert.ok(w.el.classList.contains('is-ready') && w.el.classList.contains('is-ready-flash'))
  assert.equal(value(), 'PRONTO')
  assert.ok(!w.el.classList.contains('is-active'), 'SWIRL nunca fica ACTIVE')
  w.destroy()
}

// ============================================================================
// 4b. Contrato "100% runtime": sem 6/10 sintéticos; wiring inválido é DETECTADO, não mascarado
// ============================================================================
{
  console.log('Testing 4b: sem fallbacks 6/10; max inválido não gera NaN/Infinity e é reportado...')
  const src = readFileSync(new URL('./hud-armament.js', import.meta.url), 'utf8')
  assert.ok(!/FALLBACK/i.test(src), 'não pode haver constantes de fallback de FOCO')
  assert.ok(!/(durationMax|cooldownMax|DURATION|COOLDOWN)\w*\s*[:=]\s*(6|10)\b/.test(src), 'nenhum 6/10 como duração/cooldown')
  assert.ok(!/(durationMax|cooldownMax)\s*=\s*\d/.test(src), 'nenhum default numérico para durationMax/cooldownMax')

  // 1) valores customizados reais continuam sendo usados
  const act8 = computeFocoView({ mode: 'focus', durationRemaining: 4, durationMax: 8, cooldownRemaining: 0, cooldownMax: 10 })
  assert.equal(act8.frac, 0.5, 'duração 8 s, restante 4 s = 50%')
  assert.deepEqual(act8.wiring, [])
  const cd12 = computeFocoView({ mode: 'free', durationRemaining: 0, durationMax: 6, cooldownRemaining: 3, cooldownMax: 12 })
  assert.equal(cd12.frac, 0.75, 'cooldown 12 s, restante 3 s = 75% preenchido')
  assert.deepEqual(cd12.wiring, [])

  // 3) durationMax inválido durante ACTIVE
  for (const bad of [undefined, null, 0, -3, NaN, Infinity, '6']) {
    const v = computeFocoView({ mode: 'focus', durationRemaining: 3.7, durationMax: bad, cooldownRemaining: 0, cooldownMax: 10 })
    assert.equal(v.state, 'active')
    assert.equal(v.value, '3.7s', `texto usa o tempo real mesmo com durationMax=${String(bad)}`)
    assert.ok(Number.isFinite(v.frac) && v.frac >= 0 && v.frac <= 1, `frac finita com durationMax=${String(bad)}`)
    assert.ok(v.wiring.includes('durationMax'), `durationMax=${String(bad)} deve ser sinalizado`)
    assert.ok(!v.value.includes('NaN') && !v.value.includes('Infinity'))
  }
  // 4) cooldownMax inválido durante COOLDOWN
  for (const bad of [undefined, null, 0, -1, NaN, Infinity]) {
    const v = computeFocoView({ mode: 'free', durationRemaining: 0, durationMax: 6, cooldownRemaining: 4, cooldownMax: bad })
    assert.equal(v.state, 'cooling')
    assert.equal(v.value, '4s')
    assert.ok(Number.isFinite(v.frac) && v.frac >= 0 && v.frac <= 1, `frac finita com cooldownMax=${String(bad)}`)
    assert.ok(v.wiring.includes('cooldownMax'), `cooldownMax=${String(bad)} deve ser sinalizado`)
  }
  // remaining não-finito não vira texto "NaN"
  const nanRem = computeFocoView({ mode: 'focus', durationRemaining: NaN, durationMax: 6, cooldownRemaining: 0, cooldownMax: 10 })
  assert.equal(nanRem.state, 'ready')
  assert.ok(nanRem.wiring.includes('durationRemaining'))
  // SWIRL: total inválido também é sinalizado, sem NaN
  for (const bad of [undefined, 0, NaN, -5]) {
    const v = computeSwirlView(2500, bad)
    assert.ok(Number.isFinite(v.frac) && v.value === '2.5s' && v.wiring.includes('totalMs'))
  }
  // 6) READY continua normal, sem wiring
  const ready = computeFocoView({ mode: 'free', durationRemaining: 0, cooldownRemaining: 0 })
  assert.deepEqual([ready.state, ready.value, ready.sub, ready.frac, ready.wiring.length], ['ready', 'PRONTO', 'DISPONÍVEL', 1, 0])
  assert.equal(computeFocoView({ mode: 'free', durationRemaining: 0, durationMax: 6, cooldownRemaining: 0, cooldownMax: 10 }).wiring.length, 0)

  // 5) o problema é REPORTADO pelo aiValidator (uma vez por combinação; READY/válido não reporta)
  const warn = console.warn
  console.warn = () => {}
  try {
    aiValidator.reset()
    const w = createArmamentWidget({ doc, kind: 'foco', tag: 'FOCO', schedule: () => 1 })
    const failures = () => aiValidator.buildReport().expectativas_falhas.filter((f) => f.description.includes('duração/cooldown válidos'))
    w.update(computeFocoView({ mode: 'free', durationRemaining: 0, cooldownRemaining: 0 }))
    assert.equal(failures().length, 0, 'READY normal não reporta nada')
    w.update(computeFocoView({ mode: 'focus', durationRemaining: 5, durationMax: 6, cooldownRemaining: 0, cooldownMax: 10 }))
    assert.equal(failures().length, 0, 'wiring válido não reporta')
    for (let i = 0; i < 30; i++) w.update(computeFocoView({ mode: 'focus', durationRemaining: 5 - i * 0.01 }))
    assert.equal(failures().length, 1, 'wiring quebrado reportado UMA vez (sem spam por frame)')
    assert.deepEqual(failures()[0].context.invalid, ['durationMax'])
    assert.equal(w.el.q('hud-arm-value').textContent.includes('NaN'), false)
    w.update(computeFocoView({ mode: 'focus', durationRemaining: 4, durationMax: 6, cooldownRemaining: 0, cooldownMax: 10 }))
    w.update(computeFocoView({ mode: 'free', durationRemaining: 0, durationMax: 6, cooldownRemaining: 5, cooldownMax: undefined }))
    assert.equal(failures().length, 2, 'novo problema (cooldownMax) é reportado')
    assert.deepEqual(failures()[1].context.invalid, ['cooldownMax'])
    w.destroy()
  } finally {
    console.warn = warn
    aiValidator.reset()
  }
}

// ============================================================================
// 5. Regressão: feedback legado de FOCO (acima da nave) removido do código de produção
// ============================================================================
{
  console.log('Testing 5: ausência do aviso legado e do painel world-space do Fox...')
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
  const prod = {
    'hud-game.js': read('./hud-game.js'),
    'hud-styles.js': read('./hud-styles.js'),
    'game-loop.js': read('./game-loop.js'),
    'combat/wingmen.js': read('./combat/wingmen.js'),
    'combat/wingman-world-radio.js': read('./combat/wingman-world-radio.js'),
    'hud-armament.js': read('./hud-armament.js'),
  }
  const forbidden = [
    'showSquadronNotice', 'updateSquadronNoticePosition', 'hud-squadron-notice', 'squadronNotice',
    'showFoxFocus', 'followPlayer', 'shipAbove',
    'hud-squad-command-widget', 'hud-cmd-', 'hud-swirl-widget',
  ]
  for (const [file, src] of Object.entries(prod)) {
    for (const word of forbidden) assert.ok(!src.includes(word), `${file} não pode conter "${word}"`)
  }
  // o comando de esquadrão continua funcionando, sem UI acima da nave
  assert.ok(prod['game-loop.js'].includes('combat.toggleSquadronCommand(playerPos)'))
  assert.ok(prod['game-loop.js'].includes('hud.setSquadronCommandState'), 'widget recebe o estado real a cada frame')
  assert.ok(prod['game-loop.js'].includes('hud.setSwirlCooldown'))
  // sistema de glow das abilities dos aliados preservado
  assert.ok(prod['combat/wingman-world-radio.js'].includes('triggerAbilityGlow'))
  assert.ok(prod['combat/wingmen.js'].includes('worldRadio.triggerAbilityGlow'))
  // rádio fixo inferior-central permanece
  assert.ok(!prod['game-loop.js'].includes('updateRadioPosition'))
  // o HUD monta os widgets novos e os destrói no unmount
  assert.ok(/createArmamentWidget\(\{[^}]*kind: 'foco'/.test(prod['hud-game.js']))
  assert.ok(/createArmamentWidget\(\{[^}]*kind: 'swirl'/.test(prod['hud-game.js']))
  assert.ok(prod['hud-game.js'].includes('focoWidget.destroy()') && prod['hud-game.js'].includes('swirlWidget.destroy()'))
}

// ============================================================================
// 6. CSS: geometria da Opção B, reduced-motion e sem glow permanente
// ============================================================================
{
  console.log('Testing 6: CSS 76×46, reduced-motion, sem glow permanente...')
  const css = readFileSync(new URL('./hud-styles.js', import.meta.url), 'utf8')
  const start = css.indexOf('DISPLAY DE ARMAMENTO')
  const end = css.indexOf('CADEIA DE ABATES')
  assert.ok(start > 0 && end > start)
  const block = css.slice(start, end)
  assert.ok(/width:\s*76px/.test(block) && /height:\s*46px/.test(block), 'caixa 76×46')
  assert.ok(/prefers-reduced-motion:\s*reduce/.test(block), 'reduced-motion')
  assert.ok(!/box-shadow:[^;]*\b(0 0 \d+px)/.test(block), 'sem glow permanente (box-shadow com blur)')
  // hachura (ACTIVE) e listrado (COOLDOWN) além de cor
  assert.ok(/is-active \.hud-arm-fill[\s\S]*?repeating-linear-gradient\(135deg/.test(block))
  assert.ok(/is-cooling \.hud-arm-fill[\s\S]*?repeating-linear-gradient\(90deg/.test(block))
}

console.log('✔ hud-armament.test.mjs: todos os testes passaram')
