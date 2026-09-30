// Infraestrutura comum dos validators em Chromium real (NÃO roda na CI): servidor estático do
// repositório (com `three` redirecionado para THREE_MODULE e um shim que conta THREE.Sprite),
// Chromium headless via playwright global e início de partida Arcade real.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

export const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const require = createRequire(import.meta.url)
function loadPlaywright() {
  for (const name of ['playwright-core', 'playwright']) { try { return require(name) } catch { /* segue */ } }
  for (const dir of (process.env.NODE_PATH || '/opt/node22/lib/node_modules').split(':')) {
    for (const name of ['playwright-core', 'playwright']) { try { return require(join(dir, name)) } catch { /* segue */ } }
  }
  throw new Error('playwright não encontrado')
}
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' }

export async function startHarness() {
  const { chromium } = loadPlaywright()
  const THREE_MODULE = process.env.THREE_MODULE || join(ROOT, 'node_modules/three/build/three.module.js')
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    try {
      if (url.pathname === '/__three_real.js') {
        const data = await readFile(THREE_MODULE)
        res.writeHead(200, { 'content-type': 'text/javascript' })
        return res.end(data)
      }
      if (url.pathname === '/__three.js') {
        res.writeHead(200, { 'content-type': 'text/javascript' })
        return res.end(`import { Sprite as RealSprite } from '/__three_real.js'
export * from '/__three_real.js'
export class Sprite extends RealSprite { constructor(...a) { super(...a); window.__spriteCount = (window.__spriteCount || 0) + 1 } }`)
      }
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname
      const file = normalize(join(ROOT, decodeURIComponent(pathname)))
      if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end() }
      let data = await readFile(file)
      if (pathname === '/index.html') data = Buffer.from(data.toString('utf8').replace(/"three":\s*"https:\/\/[^"]+"/, '"three": "/__three.js"'))
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
      res.end(data)
    } catch { res.writeHead(404); res.end() }
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}/`
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
  const failures = []
  let checks = 0
  return {
    browser, base, failures,
    check: (c, m) => { checks++; if (!c) failures.push(m) },
    get checks() { return checks },
    async startGame(page, { vitals = 'classic', settings = {} } = {}) {
      await page.addInitScript((s) => { try { localStorage.setItem('star-anki-settings', JSON.stringify(s)) } catch { /* ignora */ } }, { vitalsHudStyle: vitals, ...settings })
      await page.goto(base)
      await page.waitForSelector('#btn-pregame-play-arcade', { timeout: 20000 })
      await page.click('#btn-pregame-play-arcade')
      await page.waitForTimeout(600)
      for (let i = 0; i < 3; i++) { await page.keyboard.press(' '); await page.waitForTimeout(400) }
      await page.waitForSelector('.hud-armament--foco', { timeout: 20000 })
      await page.waitForTimeout(1500)
    },
    async finish(label, extra = []) {
      await browser.close()
      server.close()
      console.log(`[${label}] ${checks} verificações, ${failures.length} falha(s)`)
      for (const f of failures) console.log('  ✗ ' + f)
      for (const l of extra) console.log(l)
      console.log(`VALIDADO EM RUNTIME (Chromium headless, jogo real): ${failures.length ? 'NÃO — há falhas' : 'SIM'}`)
      console.log('VALIDADO VISUALMENTE: NÃO — NÃO FOI POSSÍVEL VALIDAR VISUALMENTE.')
      process.exit(failures.length ? 1 : 0)
    },
  }
}
