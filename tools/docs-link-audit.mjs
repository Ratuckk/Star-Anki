#!/usr/bin/env node
// tools/docs-link-audit.mjs
//
// Auditoria rigorosa de links Markdown com detecção estrita de broken links
// e case mismatches (garantindo compatibilidade com sistemas case-sensitive como Linux/CI).

import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const REPO_ROOT = process.cwd()

// Mapeamento de arquivos rastreados no git preservando o case canônico
const gitFilesOutput = execSync('git ls-files', { encoding: 'utf8', cwd: REPO_ROOT })
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

// Arquivos de documentação a auditar
const targetFiles = [
  'README.md',
  'BACKLOG.md',
  ...Array.from(trackedFiles).filter((f) => {
    return (
      (f.startsWith('docs/') || f.startsWith('Docs/')) &&
      f.endsWith('.md')
    )
  }),
]

// Aliases para resolver referências históricas de relatórios legados pré-reorganização
const LEGACY_ARCHIVE_ALIASES = new Map([
  ['progresso.md', 'docs/progress/archive/PROGRESSO_v0.00-v0.33.md'],
  ['progresso_pos_0.30.md', 'docs/progress/archive/PROGRESSO_v0.00-v0.33.md'],
  ['progresso_pos_0.50.md', 'docs/progress/archive/PROGRESSO_v0.34-v0.50.md'],
  ['progresso_pos_.60.md', 'docs/progress/archive/PROGRESSO_v0.61-v0.74.md'],
  ['progresso_pos_.70.md', 'docs/progress/archive/PROGRESSO_v0.61-v0.74.md'],
  ['progresso_pos_.80.md', 'docs/progress/archive/PROGRESSO_v0.75-v0.84.md'],
  ['progresso_pos_.90.md', 'docs/progress/archive/PROGRESSO_v0.84-v0.89.md'],
  ['registro_auditoria_e_correcoes.md', 'docs/audits/archive/auditoria-v0.76.0.md'],
  ['sons_todo.md', 'docs/planning/audio-backlog.md'],
  ['../fluxo_validacao_ia.md', 'docs/project/validation.md'],
  ['../template_inimigos.md', 'docs/templates/enemy-spec-template.md'],
  ['fluxo_validacao_ia.md', 'docs/project/validation.md'],
  ['template_inimigos.md', 'docs/templates/enemy-spec-template.md'],
])

// Expressão regular para links markdown: [texto](url)
const LINK_REGEX = /!?\[([^\]]*)\]\(([^)]+)\)/g

let totalFilesAudited = 0
let totalLinksAudited = 0
let brokenLinksCount = 0
let caseMismatchesCount = 0

const errors = []

console.log('[Docs Link Audit] Iniciando auditoria de links em Markdown...\n')

for (const relFile of targetFiles) {
  const fullPath = path.join(REPO_ROOT, relFile)
  if (!existsSync(fullPath)) continue

  totalFilesAudited++
  const content = readFileSync(fullPath, 'utf8')
  const fileDir = path.dirname(relFile).replace(/\\/g, '/')
  const isArchiveFile = relFile.toLowerCase().includes('/archive/')

  let match
  while ((match = LINK_REGEX.exec(content)) !== null) {
    const rawTarget = match[2].trim()

    // Ignorar links externos, mailto, âncoras locais e file:/// de relatórios arquivados
    if (
      rawTarget.startsWith('http://') ||
      rawTarget.startsWith('https://') ||
      rawTarget.startsWith('mailto:') ||
      rawTarget.startsWith('#') ||
      rawTarget.startsWith('file:///')
    ) {
      continue
    }

    totalLinksAudited++

    // Remove âncoras internas (#ancora), queries (?query) e referências de linha (:413)
    const cleanTarget = rawTarget
      .split('#')[0]
      .split('?')[0]
      .trim()
      .replace(/:\d+$/, '')

    if (!cleanTarget) continue

    // Decodifica URL encoding (%20 etc)
    let decodedTarget
    try {
      decodedTarget = decodeURIComponent(cleanTarget)
    } catch {
      decodedTarget = cleanTarget
    }

    // Candidato 1: resolvido relativo ao diretório do arquivo fonte
    const candidateRelative = path
      .normalize(path.join(fileDir, decodedTarget))
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')

    // Candidato 2: resolvido relativo à raiz do repositório (para links como src/..., docs/...)
    const candidateFromRoot = path
      .normalize(decodedTarget.replace(/^\//, ''))
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')

    // Candidato 3: resolvido para links antigos de arquivo archive que usavam ../src/...
    const candidateArchiveSrc = isArchiveFile && decodedTarget.startsWith('../src/')
      ? path.normalize(decodedTarget.replace(/^\.\.\//, '')).replace(/\\/g, '/')
      : null

    // Candidato 4: alias legado para documentos em archive/
    const legacyAliasKey = decodedTarget.toLowerCase()
    const candidateLegacyAlias = isArchiveFile ? LEGACY_ARCHIVE_ALIASES.get(legacyAliasKey) : null

    // Seleciona a melhor resolução candidata
    const candidates = [
      candidateRelative,
      candidateFromRoot,
      candidateArchiveSrc,
      candidateLegacyAlias,
    ].filter(Boolean)

    let matchedExact = null
    let matchedCaseMismatch = null

    for (const c of candidates) {
      if (trackedFiles.has(c) || trackedDirs.has(c) || existsSync(path.join(REPO_ROOT, c))) {
        matchedExact = c
        break
      }

      const lower = c.toLowerCase()
      const canonicalMatch = trackedLowerMap.get(lower) || trackedDirsLower.get(lower)
      if (canonicalMatch) {
        matchedCaseMismatch = { tested: c, canonical: canonicalMatch }
      }
    }

    if (matchedExact) {
      // Link válido com case 100% correto
      continue
    }

    if (matchedCaseMismatch) {
      caseMismatchesCount++
      errors.push({
        sourceFile: relFile,
        linkText: match[1],
        target: rawTarget,
        tested: matchedCaseMismatch.tested,
        canonical: matchedCaseMismatch.canonical,
        type: 'CASE_MISMATCH',
      })
    } else {
      brokenLinksCount++
      errors.push({
        sourceFile: relFile,
        linkText: match[1],
        target: rawTarget,
        tested: candidateRelative,
        type: 'BROKEN_LINK',
      })
    }
  }
}

console.log('======================================================')
console.log('            RELATÓRIO DE LINKS MARKDOWN               ')
console.log('======================================================')
console.log(`arquivos Markdown analisados: ${totalFilesAudited}`)
console.log(`links relativos analisados: ${totalLinksAudited}`)
console.log(`broken links: ${brokenLinksCount}`)
console.log(`case mismatches: ${caseMismatchesCount}`)
console.log('======================================================\n')

if (errors.length > 0) {
  console.error(`[FALHA] Foram encontrados ${errors.length} problemas de linkagem:\n`)
  for (const err of errors) {
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
  console.log('[SUCESSO] Todos os links relativos existem e respeitam o case canônico!')
  process.exit(0)
}
