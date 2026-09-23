#!/usr/bin/env node
// tools/docs-link-audit.mjs
//
// Auditoria rigorosa de links Markdown com detecção estrita de broken links
// e case mismatches (garantindo compatibilidade com sistemas case-sensitive como Linux/CI).
//
// Categorias auditadas:
// 1. ACTIVE DOCS (STRICT): README.md, BACKLOG.md, AGENTS.md, CLAUDE.md, THIRD_PARTY_NOTICES.md,
//    pontes legadas de navegação na raiz e todos os documentos em docs/ (exceto archives).
//    Resolução estrita: caminhos sem '/' inicial são resolvidos a partir do diretório fonte.
//    Zero broken links e zero case mismatches permitidos.
// 2. HISTORICAL ARCHIVE: docs/archive/**, docs/audits/archive/**, docs/progress/archive/**,
//    Docs/** e progresso/**. Referências históricas reportadas de forma informativa.

import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const REPO_ROOT = process.cwd()

// Mapeamento de arquivos rastreados no git preservando o case canônico (sem escape octal)
const gitFilesOutput = execSync('git -c core.quotepath=false ls-files', { encoding: 'utf8', cwd: REPO_ROOT })
const trackedFiles = new Set(
  gitFilesOutput
    .split(/\r?\n/)
    .filter(Boolean)
    .map((p) => p.replace(/\\/g, '/'))
)

// Mapa de paths em lowercase -> path canônico exato no git
const trackedLowerMap = new Map()
for (const f of trackedFiles) {
  trackedLowerMap.set(f.toLowerCase(), f)
}

// Conjunto e mapa de diretórios canônicos rastreados
const trackedDirs = new Set()
const trackedDirsLower = new Map()
for (const f of trackedFiles) {
  const parts = f.split('/')
  let cur = ''
  for (let i = 0; i < parts.length - 1; i++) {
    cur = cur ? `${cur}/${parts[i]}` : parts[i]
    trackedDirs.add(cur)
    trackedDirsLower.set(cur.toLowerCase(), cur)
  }
}

// Expressão regular para links markdown: [texto](url)
const LINK_REGEX = /!?\[([^\]]*)\]\(([^)]+)\)/g

function isHistoricalArchive(relPath) {
  const lower = relPath.toLowerCase()
  return (
    lower.startsWith('docs/archive/') ||
    lower.startsWith('docs/audits/archive/') ||
    lower.startsWith('docs/progress/archive/') ||
    relPath.startsWith('Docs/') ||
    relPath.startsWith('progresso/')
  )
}

// Todos os arquivos .md rastreados
const allMarkdownFiles = Array.from(trackedFiles).filter((f) => f.endsWith('.md'))

const activeFiles = allMarkdownFiles.filter((f) => !isHistoricalArchive(f)).sort()
const archiveFiles = allMarkdownFiles.filter((f) => isHistoricalArchive(f)).sort()

function resolveTarget(rawTarget, fileDir) {
  // Ignorar links externos, mailto, âncoras locais e file:///
  if (
    rawTarget.startsWith('http://') ||
    rawTarget.startsWith('https://') ||
    rawTarget.startsWith('mailto:') ||
    rawTarget.startsWith('#') ||
    rawTarget.startsWith('file:///')
  ) {
    return null
  }

  // Remove âncoras internas (#ancora), queries (?query) e referências de linha (:413)
  const cleanTarget = rawTarget
    .split('#')[0]
    .split('?')[0]
    .trim()
    .replace(/:\d+$/, '')

  if (!cleanTarget) return null

  // Decodifica URL encoding (%20 etc)
  let decodedTarget
  try {
    decodedTarget = decodeURIComponent(cleanTarget)
  } catch {
    decodedTarget = cleanTarget
  }

  // Resolução estrita:
  // Se começa com '/', relativo à raiz do repositório
  // Caso contrário, estritamente relativo ao diretório do arquivo fonte (sem fallback)
  if (decodedTarget.startsWith('/')) {
    return path
      .normalize(decodedTarget.replace(/^\//, ''))
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
  }

  return path
    .normalize(path.join(fileDir, decodedTarget))
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
}

console.log('[Docs Link Audit] Iniciando auditoria fiel de links Markdown...\n')

// 1. Auditoria Estrita de ACTIVE DOCS
let activeFilesCount = 0
let activeLinksCount = 0
let activeBrokenCount = 0
let activeCaseMismatchCount = 0
const activeErrors = []

for (const relFile of activeFiles) {
  const fullPath = path.join(REPO_ROOT, relFile)
  if (!existsSync(fullPath)) continue

  activeFilesCount++
  const content = readFileSync(fullPath, 'utf8')
  const fileDir = path.dirname(relFile).replace(/\\/g, '/')

  let match
  while ((match = LINK_REGEX.exec(content)) !== null) {
    const rawTarget = match[2].trim()
    const resolved = resolveTarget(rawTarget, fileDir)
    if (!resolved) continue

    activeLinksCount++

    // Checagem de correspondência exata física/git
    if (trackedFiles.has(resolved) || trackedDirs.has(resolved) || existsSync(path.join(REPO_ROOT, resolved))) {
      continue
    }

    // Checagem de case mismatch
    const lower = resolved.toLowerCase()
    const canonicalMatch = trackedLowerMap.get(lower) || trackedDirsLower.get(lower)
    if (canonicalMatch) {
      activeCaseMismatchCount++
      activeErrors.push({
        sourceFile: relFile,
        linkText: match[1],
        target: rawTarget,
        tested: resolved,
        canonical: canonicalMatch,
        type: 'CASE_MISMATCH',
      })
    } else {
      activeBrokenCount++
      activeErrors.push({
        sourceFile: relFile,
        linkText: match[1],
        target: rawTarget,
        tested: resolved,
        type: 'BROKEN_LINK',
      })
    }
  }
}

// 2. Auditoria Informativa de HISTORICAL ARCHIVE
let archiveFilesCount = 0
let archiveLinksCount = 0
let archiveValidCount = 0
let archiveBrokenCount = 0

for (const relFile of archiveFiles) {
  const fullPath = path.join(REPO_ROOT, relFile)
  if (!existsSync(fullPath)) continue

  archiveFilesCount++
  const content = readFileSync(fullPath, 'utf8')
  const fileDir = path.dirname(relFile).replace(/\\/g, '/')

  let match
  while ((match = LINK_REGEX.exec(content)) !== null) {
    const rawTarget = match[2].trim()
    const resolved = resolveTarget(rawTarget, fileDir)
    if (!resolved) continue

    archiveLinksCount++

    if (trackedFiles.has(resolved) || trackedDirs.has(resolved) || existsSync(path.join(REPO_ROOT, resolved))) {
      archiveValidCount++
    } else {
      archiveBrokenCount++
    }
  }
}

console.log('======================================================')
console.log('            RELATÓRIO DE LINKS MARKDOWN               ')
console.log('======================================================')
console.log('ACTIVE DOCS (STRICT)')
console.log(`  files: ${activeFilesCount}`)
console.log(`  relative links: ${activeLinksCount}`)
console.log(`  broken: ${activeBrokenCount}`)
console.log(`  case mismatches: ${activeCaseMismatchCount}`)
console.log('')
console.log('HISTORICAL ARCHIVE')
console.log(`  files: ${archiveFilesCount}`)
console.log(`  legacy references: ${archiveLinksCount}`)
console.log(`  broken historical links: ${archiveBrokenCount}`)
console.log('  status: informational')
console.log('======================================================\n')

if (activeErrors.length > 0) {
  console.error(`[FALHA] Foram encontrados ${activeErrors.length} problemas em documentos ativos:\n`)
  for (const err of activeErrors) {
    if (err.type === 'CASE_MISMATCH') {
      console.error(
        `  ❌ [CASE MISMATCH] Em ${err.sourceFile}:\n` +
        `     Link original: "${err.target}"\n` +
        `     Resolvido como: "${err.tested}"\n` +
        `     Caminho canônico esperado: "${err.canonical}"\n`
      )
    } else {
      console.error(
        `  ❌ [BROKEN LINK] Em ${err.sourceFile}:\n` +
        `     Link original: "${err.target}"\n` +
        `     Destino não encontrado: "${err.tested}"\n`
      )
    }
  }
  process.exit(1)
} else {
  console.log('[SUCESSO] Todos os links relativos dos documentos ativos passaram na auditoria estrita!')
  process.exit(0)
}
