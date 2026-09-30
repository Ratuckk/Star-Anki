// Validação em navegador REAL do Display de Armamento (FOCO / SWIRL, Opção B) usando o jogo de
// verdade: entra no modo Arcade, pressiona a tecla real do comando (KeyD, caminho
// input → game-loop → combat.toggleSquadronCommand) e confere READY → ACTIVE → COOLDOWN → READY,
// a ausência do aviso legado acima da nave e a ausência de qualquer THREE.Sprite novo (painel
// world-space do Fox). Também mede layout (HUD real) em 4 resoluções × 2 modos de vitais.
// NÃO roda na CI (Chromium + ~20 s de tempo real).
//
//   CHROME_BIN=... THREE_MODULE=/caminho/three.module.js node tools/validate-armament.mjs
//   SHOTS_DIR=/tmp/shots  → salva screenshots (não substituem validação visual do usuário)
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
function loadPlaywright() {
  for (const name of ['playwright-core', 'playwright']) {
    try { return require(name) } catch { /* segue */ }
  }
  for (const dir of (process.env.NODE_PATH || '/opt/node22/lib/node_modules').split(':')) {
    for (const name of ['playwright-core', 'playwright']) {
      try { return require(join(dir, name)) } catch { /* segue */ }
    }
  }
  throw new Error('playwright não encontrado')
}
const { chromium } = loadPlaywright()
const THREE_MODULE = process.env.THREE_MODULE || join(ROOT, 'node_modules/three/build/three.module.js')
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' }

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  try {
    if (url.pathname === '/__three_real.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' })
      return res.end(await readFile(THREE_MODULE))
    }
    if (url.pathname === '/__three.js') {
      // shim: reexporta o three real e conta cada THREE.Sprite criado (painéis/glows world-space)
      res.writeHead(200, { 'content-type': 'text/javascript' })
      return res.end(`import { Sprite as RealSprite } from '/__three_real.js'
export * from '/__three_real.js'
export class Sprite extends RealSprite { constructor(...a) { super(...a); window.__spriteCount = (window.__spriteCount || 0) + 1 } }`)
    }
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname
    const file = normalize(join(ROOT, decodeURIComponent(pathname)))
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end() }
    let data = await readFile(file)
    if (pathname === '/index.html') {
      data = Buffer.from(data.toString('utf8').replace(/"three":\s*"https:\/\/[^"]+"/, '"three": "/__three.js"'))
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
    res.end(data)
  } catch { res.writeHead(404); res.end() }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}/`

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const failures = []
let checks = 0
const check = (c, m) => { checks++; if (!c) failures.push(m) }
const overlaps = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
const shots = process.env.SHOTS_DIR
if (shots) mkdirSync(shots, { recursive: true })

async function startGame(page, vitals) {
  await page.addInitScript((v) => { try { localStorage.setItem('star-anki-settings', JSON.stringify({ vitalsHudStyle: v })) } catch { /* ignora */ } }, vitals)
  await page.goto(base)
  await page.waitForSelector('#btn-pregame-play-arcade', { timeout: 20000 })
  await page.click('#btn-pregame-play-arcade')
  await page.waitForTimeout(600)
  for (let i = 0; i < 3; i++) { await page.keyboard.press(' '); await page.waitForTimeout(400) }
  await page.waitForSelector('.hud-armament--foco', { timeout: 20000 })
  await page.waitForTimeout(1500)
}
const state = (page) => page.evaluate(() => {
  const g = (k) => { const e = document.querySelector(`.hud-armament--${k}`); return e ? { cls: e.className, value: e.querySelector('.hud-arm-value').textContent, sub: e.querySelector('.hud-arm-sub').textContent, width: e.querySelector('.hud-arm-fill').style.width } : null }
  return { foco: g('foco'), swirl: g('swirl'), notice: document.querySelectorAll('.hud-squadron-notice').length, sprites: window.__spriteCount || 0 }
})

// ---------------- 1. input real: KeyD → ACTIVE → COOLDOWN → READY (vitais clássicos) ----------------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: Number(process.env.SHOT_SCALE) || 1 })
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await startGame(page, 'classic')
  // autoteste do contador: um Sprite criado pelo módulo `three` da página DEVE ser contado
  const c0 = await page.evaluate(() => window.__spriteCount || 0)
  await page.evaluate(async () => { const T = await import('three'); new T.Sprite() })
  const c1 = await page.evaluate(() => window.__spriteCount || 0)
  check(c1 === c0 + 1, `contador de THREE.Sprite não está funcionando (${c0} → ${c1})`)
  const s0 = await state(page)
  check(s0.foco && s0.foco.cls.includes('is-ready') && s0.foco.value === 'PRONTO', `FOCO deveria iniciar READY: ${JSON.stringify(s0.foco)}`)
  check(s0.swirl && s0.swirl.cls.includes('is-ready'), 'SWIRL deveria iniciar READY')
  check(s0.notice === 0, 'DOM .hud-squadron-notice não pode existir')
  // espera por condição (o tempo de jogo pode andar mais devagar que o relógio em GL por software)
  const waitFor = async (pred, timeoutMs) => {
    const t0 = Date.now()
    for (;;) {
      const st = await state(page)
      if (pred(st)) return st
      if (Date.now() - t0 > timeoutMs) return st
      await page.waitForTimeout(150)
    }
  }
  await page.keyboard.press('KeyD')
  const s1 = await waitFor((st) => st.foco.cls.includes('is-active'), 3000)
  check(s1.foco.cls.includes('is-active'), `KeyD real não levou FOCO a ACTIVE: ${JSON.stringify(s1.foco)}`)
  check(/^\d\.\ds$/.test(s1.foco.value) && s1.foco.sub === 'ATIVO', `ACTIVE deve mostrar tempo restante: ${JSON.stringify(s1.foco)}`)
  check(s1.notice === 0, 'nenhum .hud-squadron-notice após pressionar FOCO')
  check(s1.sprites === s0.sprites, `nenhum THREE.Sprite novo ao acionar FOCO (${s0.sprites} → ${s1.sprites})`)
  if (shots) await page.screenshot({ path: join(shots, 'armament_active_1280x720.png'), ...(process.env.SHOT_SCALE ? { clip: { x: 30, y: 185, width: 300, height: 70 } } : {}) })
  const s2 = await waitFor((st) => st.foco.cls.includes('is-active') && parseFloat(st.foco.value) < parseFloat(s1.foco.value) - 0.5, 4000)
  check(parseFloat(s2.foco.value) < parseFloat(s1.foco.value), `tempo ACTIVE deve diminuir (${s1.foco.value} → ${s2.foco.value})`)
  check(parseFloat(s2.foco.width) < parseFloat(s1.foco.width), `barra ACTIVE deve esvaziar (${s1.foco.width} → ${s2.foco.width})`)
  const s3 = await waitFor((st) => st.foco.cls.includes('is-cooling'), 30000)
  check(s3.foco.cls.includes('is-cooling') && s3.foco.sub === 'RECARGA', `FOCO deve entrar em RECARGA ao fim da janela: ${JSON.stringify(s3.foco)}`)
  const s4 = await waitFor((st) => st.foco.cls.includes('is-cooling') && parseFloat(st.foco.width) > parseFloat(s3.foco.width) + 5, 15000)
  check(parseFloat(s4.foco.width) > parseFloat(s3.foco.width), `barra COOLDOWN deve encher (${s3.foco.width} → ${s4.foco.width})`)
  if (shots) await page.screenshot({ path: join(shots, 'armament_cooldown_1280x720.png'), ...(process.env.SHOT_SCALE ? { clip: { x: 30, y: 185, width: 300, height: 70 } } : {}) })
  const s5 = await waitFor((st) => st.foco.cls.includes('is-ready'), 60000)
  check(s5.foco.cls.includes('is-ready') && s5.foco.value === 'PRONTO', `FOCO deve voltar a READY: ${JSON.stringify(s5.foco)}`)
  check(s5.notice === 0 && s5.sprites === s0.sprites, 'sem aviso legado nem sprites novos ao longo do ciclo inteiro')
  check(errs.length === 0, `erros de página: ${errs.join(' | ')}`)
  await page.close()
}

// ---------------- 2. layout no HUD real: 4 resoluções × 2 modos de vitais ----------------
for (const vitals of ['classic', 'orbital']) {
  for (const [w, h] of [[1280, 720], [1366, 768], [1600, 900], [1920, 1080]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } })
    await startGame(page, vitals)
    const m = await page.evaluate(() => {
      const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } }
      const vis = (e) => (e && e.getBoundingClientRect().width > 0 ? e : null)
      return {
        foco: R(document.querySelector('.hud-armament--foco')), swirl: R(document.querySelector('.hud-armament--swirl')),
        chain: R(document.querySelector('.hud-kill-chain')), row: R(document.querySelector('.hud-combat-actions-row')),
        stats: R(document.querySelector('.hud-left-stats')), resources: R(document.querySelector('.hud-left-resources')),
        vitals: R(vis(document.querySelector('.hud-left-vitals'))), bus: R(vis(document.querySelector('.hud-card-bus'))),
        timer: R(document.querySelector('.hud-stack-right')), vw: innerWidth, vh: innerHeight,
      }
    })
    const tag = `[${vitals} ${w}x${h}]`
    check(Math.round(m.foco.width) === 76 && Math.round(m.foco.height) === 46, `${tag} FOCO ${m.foco.width}×${m.foco.height} ≠ 76×46`)
    check(Math.round(m.swirl.width) === 76 && Math.round(m.swirl.height) === 46, `${tag} SWIRL ${m.swirl.width}×${m.swirl.height} ≠ 76×46`)
    for (const [n, r] of [['stats', m.stats], ['recursos', m.resources], ['vitais', m.vitals], ['card-bus', m.bus], ['timer', m.timer]]) {
      if (r) for (const [wn, wr] of [['FOCO', m.foco], ['SWIRL', m.swirl]]) check(!overlaps(wr, r), `${tag} ${wn} sobrepõe ${n}`)
    }
    check(!overlaps(m.foco, m.chain) && !overlaps(m.swirl, m.chain) && !overlaps(m.foco, m.swirl), `${tag} FOCO/SWIRL/CADEIA se sobrepõem`)
    check(m.row.right <= m.vw * 0.30, `${tag} linha de ações invade o centro (${m.row.right})`)
    check(m.row.width <= 290.5, `${tag} linha de ações ${m.row.width}px > 290`)
    if (m.vitals) check(m.row.bottom <= m.vitals.top, `${tag} linha de ações desce sobre os vitais`)
    const radio = await page.evaluate(() => { const r = document.querySelector('.hud-wingman-radio'); if (!r) return null; r.classList.add('active'); const b = r.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom } })
    if (radio) for (const r of [m.foco, m.swirl]) check(!overlaps(r, radio), `${tag} widget sobrepõe o rádio`)
    if (shots) await page.screenshot({ path: join(shots, `armament_${vitals}_${w}x${h}.png`) })
    await page.close()
  }
}

await browser.close()
server.close()
console.log(`[ARMAMENT] ${checks} verificações, ${failures.length} falha(s)`)
for (const f of failures) console.log('  ✗ ' + f)
console.log('VALIDADO EM RUNTIME (Chromium headless, jogo real, tecla KeyD real): ' + (failures.length ? 'NÃO — há falhas' : 'SIM'))
console.log('VALIDADO VISUALMENTE: NÃO — NÃO FOI POSSÍVEL VALIDAR VISUALMENTE.')
process.exit(failures.length ? 1 : 0)
