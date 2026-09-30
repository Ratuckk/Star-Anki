// Validação em navegador real dos Barramentos por Categoria (spec:
// docs/specs/active/roguelike-card-category-bus.md §7). NÃO roda na CI (precisa de Chromium).
// Monta o HUD REAL (createGameHud) num harness, alimenta com catálogo/stress e mede
// getBoundingClientRect() contra o restante da HUD, em 2 modos de vitais × 4 resoluções.
//
//   (precisa de `three` em node_modules ou THREE_MODULE=/caminho/three.module.js)
//   CHROME_BIN=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tools/validate-card-bus.mjs
//   SHOTS_DIR=/tmp/shots  → também salva screenshots (não substituem validação visual do usuário)
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
function loadPlaywright() {
  for (const name of ['playwright-core', 'playwright']) {
    try { return require(name) } catch { /* tenta o próximo */ }
  }
  for (const dir of (process.env.NODE_PATH || '/opt/node22/lib/node_modules').split(':')) {
    for (const name of ['playwright-core', 'playwright']) {
      try { return require(join(dir, name)) } catch { /* segue */ }
    }
  }
  throw new Error('playwright não encontrado (instale playwright-core ou defina NODE_PATH)')
}
const { chromium } = loadPlaywright()

const THREE_MODULE = process.env.THREE_MODULE || join(ROOT, 'node_modules/three/build/three.module.js')
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' }
const HARNESS = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#000}
#game-screen{position:fixed;inset:0;overflow:hidden;background:#0b0d12}
#scene-root{position:absolute;inset:0}
</style>
<script type="importmap">{"imports":{"three":"/__three.js"}}</script></head><body>
<div id="app"><div id="pregame-screen"></div><div id="deck-manager-screen" hidden></div><div id="settings-screen" hidden></div><div id="sector-end-screen" hidden></div><div id="painel-screen" hidden></div></div>
<div id="game-screen" hidden></div>
<script type="module">
  const q = new URLSearchParams(location.search)
  localStorage.setItem('star-anki-settings', JSON.stringify({ vitalsHudStyle: q.get('vitals') || 'classic' }))
  const { createGameHud } = await import('/src/hud-game.js')
  const { ROGUELIKE_CARDS } = await import('/src/roguelike.js')
  window.__hud = createGameHud()
  window.__cards = ROGUELIKE_CARDS
  window.__ready = true
</script></body></html>`

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname === '/__three.js') {
    // `three` é importado transitivamente pelo HUD (speedlines); resolve do npm local ou de THREE_MODULE
    try {
      const data = await readFile(THREE_MODULE)
      res.writeHead(200, { 'content-type': 'text/javascript' })
      return res.end(data)
    } catch { res.writeHead(404); return res.end() }
  }
  if (url.pathname === '/__harness.html') {
    res.writeHead(200, { 'content-type': 'text/html' })
    return res.end(HARNESS)
  }
  const file = normalize(join(ROOT, decodeURIComponent(url.pathname)))
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end() }
  try {
    const data = await readFile(file)
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
    res.end(data)
  } catch { res.writeHead(404); res.end() }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port

const executablePath = process.env.CHROME_BIN || undefined
const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] })

const RESOLUTIONS = [[1280, 720], [1366, 768], [1600, 900], [1920, 1080]]
const MODES = ['classic', 'orbital']
const STACKS = [1, 2, 3, 5, 9, 10, 12]

function scenarios(cards) {
  const byCat = (c) => cards.filter((x) => x.category === c)
  const mk = (list, fn) => new Map(list.map((c, i) => [c.id, fn(i)]))
  return {
    '0': new Map(),
    '1': mk(cards.slice(0, 1), () => 1),
    '4': mk(cards.slice(0, 4), () => 3),
    '8': mk(cards.slice(0, 8), (i) => STACKS[i % STACKS.length]),
    '16': mk(cards.slice(0, 16), (i) => STACKS[i % STACKS.length]),
    '24': mk(cards.slice(0, 24), (i) => STACKS[i % STACKS.length]),
    '32': mk(cards, (i) => STACKS[i % STACKS.length]),
    'stress 14/11/7 x10+': mk([...byCat('ofensivo'), ...byCat('defensivo'), ...byCat('utilitario')], (i) => 10 + (i % 3)),
    '3 off + 0 def + 1 util': mk([...byCat('ofensivo').slice(0, 3), ...byCat('utilitario').slice(0, 1)], () => 2),
  }
}

const failures = []
let checks = 0
function check(cond, msg) { checks++; if (!cond) failures.push(msg) }
const overlaps = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)

for (const mode of MODES) {
  for (const [w, h] of RESOLUTIONS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } })
    const page = await ctx.newPage()
    const pageErrors = []
    page.on('pageerror', (e) => { pageErrors.push(e.message); if (process.env.DEBUG_BUS) console.log('pageerror:', e.message) })
    page.on('console', (m) => { if (m.type() === 'error' && process.env.DEBUG_BUS) console.log('console.error:', m.text()) })
    page.on('requestfailed', (r) => { if (process.env.DEBUG_BUS) console.log('requestfailed:', r.url()) })
    await page.goto(`http://127.0.0.1:${port}/__harness.html?vitals=${mode}`)
    await page.waitForFunction('window.__ready === true', null, { timeout: 15000 })
    const names = Object.keys(scenarios([{ id: 'a', category: 'ofensivo' }]))

    for (const name of names) {
      const tag = `[${mode} ${w}x${h} | ${name}]`
      const m = await page.evaluate(({ name, STACKS }) => {
        const cards = window.__cards
        const byCat = (c) => cards.filter((x) => x.category === c)
        const mk = (list, fn) => new Map(list.map((c, i) => [c.id, fn(i)]))
        const S = {
          '0': new Map(),
          '1': mk(cards.slice(0, 1), () => 1),
          '4': mk(cards.slice(0, 4), () => 3),
          '8': mk(cards.slice(0, 8), (i) => STACKS[i % STACKS.length]),
          '16': mk(cards.slice(0, 16), (i) => STACKS[i % STACKS.length]),
          '24': mk(cards.slice(0, 24), (i) => STACKS[i % STACKS.length]),
          '32': mk(cards, (i) => STACKS[i % STACKS.length]),
          'stress 14/11/7 x10+': mk([...byCat('ofensivo'), ...byCat('defensivo'), ...byCat('utilitario')], (i) => 10 + (i % 3)),
          '3 off + 0 def + 1 util': mk([...byCat('ofensivo').slice(0, 3), ...byCat('utilitario').slice(0, 1)], () => 2),
        }
        window.__hud.updateCollectedCards(S[name])
        const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } }
        const vis = (el) => el && !el.hidden && el.getBoundingClientRect().width > 0
        const bus = document.querySelector('.hud-card-bus')
        const radio = document.querySelector('.hud-wingman-radio')
        // mede o rádio ATIVO (visível) sem depender de fala real
        let radioRect = null
        if (radio) {
          const wasHidden = radio.hidden
          radio.hidden = false
          radio.classList.add('active')
          radioRect = R(radio)
          radio.classList.remove('active')
          radio.hidden = wasHidden
        }
        const railInfo = [...document.querySelectorAll('.hud-card-rail')].map((rail) => {
          const its = [...rail.querySelectorAll('.hud-card-bus-item')]
          const list = rail.querySelector('.hud-card-rail-items')
          const tops = new Set(its.map((i) => Math.round(i.getBoundingClientRect().top)))
          return {
            mod: rail.className.match(/hud-card-rail--(\\w+)/)?.[1],
            hidden: rail.hidden,
            count: its.length,
            rows: tops.size,
            railRect: R(rail),
            itemsClientW: list.clientWidth,
            itemsScrollW: list.scrollWidth,
            itemOverflow: its.filter((i) => i.scrollWidth > i.clientWidth + 1).length,
            itemRects: its.map(R),
            stacks: its.map((i) => i.querySelector('.hud-card-bus-stack').textContent),
          }
        })
        return {
          expected: [...S[name].values()].filter((v) => v > 0).length,
          busHidden: bus.hidden,
          density: bus.dataset.density || null,
          bus: R(bus),
          itemCount: document.querySelectorAll('.hud-card-bus-item').length,
          legacy: !!document.querySelector('.hud-cards-tray, .hud-card-chip'),
          rails: railInfo,
          docScroll: [document.documentElement.scrollWidth > innerWidth, document.documentElement.scrollHeight > innerHeight],
          stats: R(document.querySelector('.hud-left-stats')),
          resources: R(document.querySelector('.hud-left-resources')),
          actions: R(document.querySelector('.hud-left-actions')),
          vitalsClassic: vis(document.querySelector('.hud-left-vitals')) ? R(document.querySelector('.hud-left-vitals')) : null,
          timerStack: R(document.querySelector('.hud-stack-right')),
          radio: radioRect,
          vw: innerWidth, vh: innerHeight,
        }
      }, { name, STACKS })

      check(m.itemCount === m.expected, `${tag} itens ${m.itemCount} != ${m.expected}`)
      check(!m.legacy, `${tag} renderer legado presente no DOM`)
      check(m.busHidden === (m.expected === 0), `${tag} bus hidden=${m.busHidden} com ${m.expected} cartas`)
      for (const r of m.rails) {
        check(r.rows <= 1, `${tag} rail ${r.mod} quebrou em ${r.rows} linhas`)
        check(r.itemsScrollW <= r.itemsClientW + 1, `${tag} rail ${r.mod} com scroll/overflow horizontal (${r.itemsScrollW}>${r.itemsClientW})`)
        check(r.itemOverflow === 0, `${tag} rail ${r.mod}: ${r.itemOverflow} célula(s) com conteúdo estourando`)
        check(r.hidden === (r.count === 0), `${tag} rail ${r.mod} hidden=${r.hidden} count=${r.count}`)
        for (const s of r.stacks) check(/^x\d+$/.test(s), `${tag} stack inválido "${s}"`)
      }
      if (!m.busHidden) {
        const b = m.bus
        check(b.left >= 0 && b.right <= m.vw && b.top >= 0 && b.bottom <= m.vh, `${tag} bus fora da viewport ${JSON.stringify(b)}`)
        check(b.width >= 220 && b.width <= 310, `${tag} largura ${b.width} fora de 220–310`)
        check(m.docScroll.every((x) => !x), `${tag} página com scroll`)
        for (const [n, r] of [['stats', m.stats], ['resources', m.resources], ['actions', m.actions], ['vitais clássicos', m.vitalsClassic], ['timer/nível', m.timerStack], ['rádio', m.radio]]) {
          if (r && r.width > 0) check(!overlaps(b, r), `${tag} bus sobrepõe ${n}: bus=${JSON.stringify(b)} ${n}=${JSON.stringify(r)}`)
        }
        // rádio real: HUD fixa inferior-central (não projetada a partir da nave)
        if (m.radio && m.radio.width > 0) {
          check(Math.abs((m.radio.left + m.radio.right) / 2 - m.vw / 2) <= 2, `${tag} rádio fora do centro horizontal (${(m.radio.left + m.radio.right) / 2} vs ${m.vw / 2})`)
          check(m.radio.top >= m.vh * 0.6 && m.radio.bottom <= m.vh, `${tag} rádio fora da região inferior (${JSON.stringify(m.radio)})`)
        } else {
          check(false, `${tag} rádio sem retângulo medível`)
        }
        // centro reservado de gameplay: 30%–70% da largura; e alinhado à coluna esquerda (mesmo eixo X do Score)
        check(b.right <= m.vw * 0.30, `${tag} bus invade o centro (right=${b.right}, 30%=${m.vw * 0.30})`)
        check(Math.abs(b.left - m.stats.left) <= 1, `${tag} bus desalinhado da coluna esquerda (${b.left} vs ${m.stats.left})`)
        if (mode === 'classic') {
          check(m.vitalsClassic && b.top >= m.vitalsClassic.bottom, `${tag} clássico: bus deve ficar abaixo dos vitais`)
        } else {
          check(!m.vitalsClassic, `${tag} orbital não deve exibir vitais clássicos`)
          check(b.top >= m.actions.bottom, `${tag} orbital: bus deve ficar abaixo de FOCO/SWIRL/CADEIA`)
        }
        if (name === 'stress 14/11/7 x10+' || name === '32') {
          check(b.height >= 50 && b.height <= 90, `${tag} altura ${b.height} fora de ~57–78 (tolerância 50–90)`)
        }
      }
      if (process.env.SHOTS_DIR && ['32', 'stress 14/11/7 x10+', '4'].includes(name)) {
        const { mkdirSync } = await import('node:fs')
        mkdirSync(process.env.SHOTS_DIR, { recursive: true })
        await page.screenshot({ path: join(process.env.SHOTS_DIR, `bus_${mode}_${w}x${h}_${name.replace(/[^a-z0-9]+/gi, '_')}.png`) })
      }
    }
    check(pageErrors.length === 0, `[${mode} ${w}x${h}] erros de página: ${pageErrors.join(' | ')}`)

    // Rádio ativo não move o bus; unmount limpa
    const busTop1 = await page.evaluate(() => document.querySelector('.hud-card-bus').getBoundingClientRect().top)
    await page.evaluate(() => { const r = document.querySelector('.hud-wingman-radio'); r.hidden = false; r.classList.add('active') })
    const busTop2 = await page.evaluate(() => document.querySelector('.hud-card-bus').getBoundingClientRect().top)
    check(busTop1 === busTop2, `[${mode} ${w}x${h}] rádio ativo moveu o bus`)
    // resize: reposiciona sem quebrar
    await page.setViewportSize({ width: w - 120, height: h - 60 })
    await page.waitForTimeout(150)
    const afterResize = await page.evaluate(() => {
      const b = document.querySelector('.hud-card-bus').getBoundingClientRect()
      const v = document.querySelector('.hud-left-vitals')?.getBoundingClientRect()
      return { top: b.top, vitalsBottom: v ? v.bottom : null, right: b.right, iw: innerWidth }
    })
    if (mode === 'classic') check(afterResize.top >= afterResize.vitalsBottom, `[${mode} ${w}x${h}] após resize bus ficou sobre os vitais`)
    check(afterResize.right <= afterResize.iw, `[${mode} ${w}x${h}] após resize bus cortado`)
    await page.evaluate(() => window.__hud.unmount())
    const left = await page.evaluate(() => document.querySelectorAll('.hud-card-bus').length)
    check(left === 0, `[${mode} ${w}x${h}] unmount deixou ${left} bus no DOM`)
    await ctx.close()
  }
}

await browser.close()
server.close()
console.log(`[CARD BUS] ${checks} verificações, ${failures.length} falha(s)`)
for (const f of failures) console.log('  ✗ ' + f)
console.log('VALIDADO EM RUNTIME (Chromium headless, HUD real): ' + (failures.length ? 'NÃO — há falhas' : 'SIM'))
console.log('VALIDADO VISUALMENTE: NÃO — NÃO FOI POSSÍVEL VALIDAR VISUALMENTE.')
process.exit(failures.length ? 1 : 0)
