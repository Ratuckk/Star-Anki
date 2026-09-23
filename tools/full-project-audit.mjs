import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve } from 'node:path'

const root = process.cwd()
const findings = []
const add = (severity, kind, file, detail) => findings.push({ severity, kind, file, detail })

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue
    const path = join(dir, name)
    const st = statSync(path)
    if (st.isDirectory()) out.push(...walk(path))
    else out.push(path)
  }
  return out
}

const files = walk(root)
const rel = (p) => p.slice(root.length + 1).replaceAll('\\', '/')
const codeFiles = files.filter((p) => ['.js', '.mjs'].includes(extname(p)) && !rel(p).startsWith('output/'))
const textFiles = files.filter((p) => ['.js', '.mjs', '.html', '.webmanifest', '.md'].includes(extname(p)) || rel(p) === 'service-worker.js')
const fileSet = new Set(files.map((p) => normalize(p)))

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(fromFile), spec)
  const candidates = [base, `${base}.js`, `${base}.mjs`, join(base, 'index.js')]
  return candidates.find((p) => fileSet.has(normalize(p))) || null
}

for (const file of codeFiles) {
  const src = readFileSync(file, 'utf8')
  const importRx = /(?:import\s+(?:[^'";]+?\s+from\s+)?|export\s+[^'";]+?\s+from\s+|import\s*\()(['"])([^'"]+)\1/g
  for (const match of src.matchAll(importRx)) {
    const spec = match[2]
    if (spec.startsWith('.') && !resolveImport(file, spec)) {
      add('ERROR', 'missing-relative-import', rel(file), spec)
    }
  }

  // Definite logic hazards that should almost never be intentional.
  const hazards = [
    [/\.splice\(\s*-1\s*,\s*1\s*\)/g, 'splice(-1, 1) removes the last item'],
    [/\bparseInt\([^,\n]+\)(?!\s*[,<>=])/g, 'parseInt without explicit radix/context review'],
    [/\bsetInterval\([^\n]+,\s*0\s*\)/g, 'zero-delay interval'],
    [/\bnew Promise\(\s*async\b/g, 'async Promise executor'],
  ]
  for (const [rx, detail] of hazards) {
    if (rx.test(src)) add('WARN', 'hazard-pattern', rel(file), detail)
  }
}

// Validate local asset/file literals referenced by runtime-facing files.
const runtimeFiles = textFiles.filter((p) => {
  const r = rel(p)
  return r === 'index.html' || r === 'service-worker.js' || r.startsWith('src/')
})
const localPathRx = /(['"`])((?:assets|sons|icons|decks|templates)\/[A-Za-zÀ-ÿ0-9_ .()\-]+\.(?:png|jpg|jpeg|webp|gif|svg|mp3|wav|ogg|txt|ico))\1/g
for (const file of runtimeFiles) {
  const src = readFileSync(file, 'utf8')
  for (const match of src.matchAll(localPathRx)) {
    const asset = match[2]
    if (!existsSync(join(root, asset))) add('ERROR', 'missing-asset', rel(file), asset)
  }
}

// HTML ID uniqueness catches DOM lookups binding to the wrong element.
const html = readFileSync(join(root, 'index.html'), 'utf8')
const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1])
const idCounts = new Map()
for (const id of ids) idCounts.set(id, (idCounts.get(id) || 0) + 1)
for (const [id, count] of idCounts) if (count > 1) add('ERROR', 'duplicate-html-id', 'index.html', `${id} x${count}`)

// Check manifest/service-worker essentials.
try {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'))
  for (const icon of manifest.icons || []) {
    const iconPath = String(icon.src || '').replace(/^\.\//, '')
    if (iconPath && !existsSync(join(root, iconPath))) add('ERROR', 'manifest-missing-icon', 'manifest.webmanifest', iconPath)
  }
} catch (err) {
  add('ERROR', 'manifest-invalid-json', 'manifest.webmanifest', err.message)
}

// Detect localStorage JSON.parse sites with no nearby try/catch. Report only; review manually.
for (const file of codeFiles) {
  const src = readFileSync(file, 'utf8')
  for (const match of src.matchAll(/JSON\.parse\(\s*localStorage\.getItem\([^)]*\)\s*\)/g)) {
    const before = src.slice(Math.max(0, match.index - 250), match.index)
    if (!/try\s*\{[^{}]*$/s.test(before)) add('WARN', 'unsafe-localstorage-json', rel(file), match[0].slice(0, 120))
  }
}

findings.sort((a, b) => a.severity.localeCompare(b.severity) || a.file.localeCompare(b.file))
console.log(`AUDIT_FILES code=${codeFiles.length} total=${files.length}`)
for (const f of findings) console.log(`AUDIT_${f.severity} [${f.kind}] ${f.file}: ${f.detail}`)
const errors = findings.filter((f) => f.severity === 'ERROR').length
const warnings = findings.filter((f) => f.severity === 'WARN').length
console.log(`AUDIT_SUMMARY errors=${errors} warnings=${warnings}`)
if (errors) process.exitCode = 2
