import { spawn } from 'node:child_process'
import { rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

export async function launchBrowser({ width = 1280, height = 720, port = 9222 } = {}) {
  const userData = join(process.env.TEMP, `edge-cdp-${Date.now()}-${Math.floor(Math.random() * 1000)}`)
  try { rmSync(userData, { recursive: true, force: true }) } catch {}
  mkdirSync(userData, { recursive: true })

  const proc = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userData}`,
    `--window-size=${width},${height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    'about:blank',
  ], { stdio: 'ignore' })

  // Espera a porta abrir
  let version = null
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (res.ok) {
        version = await res.json()
        break
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 150))
  }
  if (!version) {
    proc.kill()
    throw new Error('Falha ao conectar no Chrome DevTools Protocol do Edge')
  }

  // Lista abas e pega a primeira
  const listRes = await fetch(`http://127.0.0.1:${port}/json/list`)
  const list = await listRes.json()
  const targetPage = list.find((p) => p.type === 'page') || list[0]
  if (!targetPage || !targetPage.webSocketDebuggerUrl) {
    proc.kill()
    throw new Error('Nenhuma página disponível no CDP')
  }

  const ws = new WebSocket(targetPage.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })

  let msgId = 1
  const pending = new Map()
  const consoleMessages = []
  const pageErrors = []

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')
        consoleMessages.push({ type: msg.params.type, text })
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const text = msg.params.exceptionDetails.text || msg.params.exceptionDetails.exception?.description || 'Unknown exception'
        pageErrors.push(text)
      } else if (msg.method === 'Log.entryAdded') {
        const entry = msg.params.entry
        if (entry.level === 'error') pageErrors.push(`[Log.error] ${entry.text} (${entry.url})`)
        else consoleMessages.push({ type: entry.level, text: entry.text })
      } else if (msg.method === 'Network.loadingFailed') {
        pageErrors.push(`[Network.failed] ${msg.params.errorText} (${msg.params.canceled ? 'canceled' : 'error'})`)
      } else if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)))
        else resolve(msg.result)
      }
    } catch (e) {
      console.error('Erro ao processar mensagem CDP:', e)
    }
  }

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  }

  // Habilita domínios
  await send('Page.enable')
  await send('Runtime.enable')
  await send('DOM.enable')
  await send('Network.enable')
  await send('Log.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  })

  return {
    consoleMessages,
    pageErrors,
    async navigate(url) {
      await send('Page.navigate', { url })
      // Espera loadEventFired
      for (let i = 0; i < 50; i++) {
        await new Promise((r) => setTimeout(r, 100))
        const res = await this.evaluate('document.readyState')
        if (res === 'complete') break
      }
    },
    async evaluate(expression) {
      const res = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })
      if (res.exceptionDetails) {
        throw new Error(`Eval error: ${res.exceptionDetails.text} (${res.exceptionDetails.exception?.description})`)
      }
      return res.result?.value
    },
    async waitForSelector(selector, timeoutMs = 5000) {
      const start = Date.now()
      while (Date.now() - start < timeoutMs) {
        const exists = await this.evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)
        if (exists) return true
        await new Promise((r) => setTimeout(r, 100))
      }
      throw new Error(`Timeout esperando seletor: ${selector}`)
    },
    async click(selector) {
      await this.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) throw new Error('Elemento não encontrado: ' + ${JSON.stringify(selector)});
        el.click();
      })()`)
    },
    async pressKey(key) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, text: key })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key })
    },
    async captureScreenshot(filepath) {
      const result = await send('Page.captureScreenshot', { format: 'png' })
      const buffer = Buffer.from(result.data, 'base64')
      writeFileSync(filepath, buffer)
      return filepath
    },
    async wait(ms) {
      await new Promise((r) => setTimeout(r, ms))
    },
    async close() {
      try { ws.close() } catch {}
      try { proc.kill() } catch {}
      try { rmSync(userData, { recursive: true, force: true }) } catch {}
    },
  }
}
