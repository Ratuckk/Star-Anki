#!/usr/bin/env node
// Roda o Star Anki num servidor estático local e abre como aplicativo dedicado no Windows
// (ou no navegador padrão em outros SOs). Enquanto a janela do jogo estiver aberta, ela manda
// um "ping" periódico pro servidor (ver o <script> guardado por ?launcher=1 no index.html);
// se o ping parar de chegar (janela fechada), o servidor se encerra sozinho.
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exec } from 'node:child_process'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const HOST = '127.0.0.1'
const PORT = Number(process.argv[2]) || 8420
const HEARTBEAT_TIMEOUT_MS = 6000

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

let lastPing = null
let shuttingDown = false

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`)

  if (url.pathname === '/__ping') {
    lastPing = Date.now()
    res.writeHead(204)
    res.end()
    return
  }

  const pathname = url.pathname === '/' ? '/index.html' : url.pathname
  const filePath = normalize(join(ROOT, decodeURIComponent(pathname)))

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  try {
    const info = await stat(filePath)
    if (info.isDirectory()) throw new Error('is a directory')
    const data = await readFile(filePath)
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
})

function shutdown(reason) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`\n[star-anki] encerrando servidor (${reason})`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 500).unref()
}

function openBrowser(url) {
  if (process.platform === 'win32') {
    const candidates = [
      (process.env['ProgramFiles(x86)'] || '') + '\\Microsoft\\Edge\\Application\\msedge.exe',
      (process.env['ProgramFiles'] || '') + '\\Microsoft\\Edge\\Application\\msedge.exe',
      (process.env['LocalAppData'] || '') + '\\Microsoft\\Edge\\Application\\msedge.exe',
      (process.env['ProgramFiles'] || '') + '\\Google\\Chrome\\Application\\chrome.exe',
      (process.env['ProgramFiles(x86)'] || '') + '\\Google\\Chrome\\Application\\chrome.exe',
      (process.env['LocalAppData'] || '') + '\\Google\\Chrome\\Application\\chrome.exe',
    ]
    const foundBrowser = candidates.find((p) => p && existsSync(p))
    const profileDir = join(process.env['LOCALAPPDATA'] || process.env['USERPROFILE'] || '.', 'Star-Anki', 'User Data')

    const cmd = foundBrowser
      ? `start "" "${foundBrowser}" --app="${url}" --window-size=1280,720 --user-data-dir="${profileDir}"`
      : `start "" "${url}"`

    exec(cmd, (err) => {
      if (err) console.log(`[star-anki] não consegui abrir automaticamente — abra manualmente: ${url}`)
    })
    return
  }

  const cmd = process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`
  exec(cmd, (err) => {
    if (err) console.log(`[star-anki] não consegui abrir o navegador automaticamente — abra manualmente: ${url}`)
  })
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const url = `http://${HOST}:${PORT}/?launcher=1`
    console.log(`[star-anki] servidor já ativo na porta ${PORT}. Abrindo janela...`)
    openBrowser(url)
    setTimeout(() => process.exit(0), 1000).unref()
  } else {
    console.error('[star-anki] erro no servidor:', err)
    process.exit(1)
  }
})

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/?launcher=1`
  console.log(`[star-anki] servidor rodando em ${url}`)
  console.log('[star-anki] feche a janela do jogo (ou Ctrl+C aqui) para encerrar o servidor.')
  openBrowser(url)
})

setInterval(() => {
  if (lastPing !== null && Date.now() - lastPing > HEARTBEAT_TIMEOUT_MS) {
    shutdown('a janela do jogo foi fechada')
  }
}, 1000)

process.on('SIGINT', () => shutdown('Ctrl+C'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
