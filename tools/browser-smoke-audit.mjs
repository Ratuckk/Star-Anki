import { chromium } from 'playwright-core'

const executablePath = process.env.CHROME_BIN
if (!executablePath) throw new Error('CHROME_BIN ausente')

const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
const errors = []
const warnings = []

page.on('pageerror', (err) => errors.push(`pageerror: ${err.stack || err.message}`))
page.on('console', (msg) => {
  const text = msg.text()
  if (msg.type() === 'error') errors.push(`console.error: ${text}`)
  else if (msg.type() === 'warning') warnings.push(`console.warn: ${text}`)
})
page.on('requestfailed', (req) => {
  const failure = req.failure()?.errorText || 'unknown'
  // HTMLAudioElement cancela preloads/one-shots que são substituídos ou encerrados no teardown;
  // o servidor já confirmou HTTP 200 nesses arquivos. Não esconder falhas de script/imagem/XHR.
  if (req.resourceType() === 'media' && failure.includes('ERR_ABORTED')) return
  errors.push(`requestfailed: ${req.resourceType()} ${req.method()} ${req.url()} :: ${failure}`)
})
page.on('response', (res) => {
  if (res.status() >= 400) errors.push(`http ${res.status()}: ${res.url()}`)
})

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(2500)

const state = await page.evaluate(() => ({
  title: document.title,
  readyState: document.readyState,
  bodyText: document.body?.innerText?.slice(0, 4000) || '',
  buttons: [...document.querySelectorAll('button')].filter((b) => !b.disabled).map((b) => ({ id: b.id, text: b.innerText.trim(), visible: !!(b.offsetWidth || b.offsetHeight || b.getClientRects().length) })).filter((b) => b.visible).slice(0, 50),
  inputs: [...document.querySelectorAll('input')].map((i) => ({ id: i.id, type: i.type, visible: !!(i.offsetWidth || i.offsetHeight || i.getClientRects().length) })).filter((i) => i.visible).slice(0, 30),
  canvasCount: document.querySelectorAll('canvas').length,
}))
console.log('BROWSER_STATE', JSON.stringify(state))

// Exercise safe, non-destructive menu controls that are discoverable by text.
const candidates = [/sem baralho/i, /arcade/i, /jogar/i, /iniciar/i, /começar/i, /start/i]
for (const rx of candidates) {
  const button = page.getByRole('button', { name: rx }).first()
  if (await button.count()) {
    try {
      if (await button.isVisible()) {
        console.log(`BROWSER_CLICK ${rx}`)
        await button.click({ timeout: 3000 })
        await page.waitForTimeout(1800)
      }
    } catch (err) {
      warnings.push(`click ${rx}: ${err.message}`)
    }
  }
}

const post = await page.evaluate(() => ({
  bodyText: document.body?.innerText?.slice(0, 4000) || '',
  canvasCount: document.querySelectorAll('canvas').length,
  activeElement: document.activeElement?.id || document.activeElement?.tagName || null,
}))
console.log('BROWSER_POST_STATE', JSON.stringify(post))
for (const w of warnings) console.log(`BROWSER_WARN ${w}`)
for (const e of errors) console.log(`BROWSER_ERROR ${e}`)
console.log(`BROWSER_SUMMARY errors=${errors.length} warnings=${warnings.length}`)
await browser.close()
if (errors.length) process.exitCode = 3
