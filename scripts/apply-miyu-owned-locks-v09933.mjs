import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

function read(path) { return readFileSync(path, 'utf8') }
function write(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
}
function replaceOnce(text, oldText, newText, label) {
  const first = text.indexOf(oldText)
  if (first < 0) throw new Error(`marker not found: ${label}`)
  if (text.indexOf(oldText, first + oldText.length) >= 0) throw new Error(`marker not unique: ${label}`)
  return text.slice(0, first) + newText + text.slice(first + oldText.length)
}
function replaceBetween(text, start, end, replacement, label) {
  const a = text.indexOf(start)
  if (a < 0) throw new Error(`start marker not found: ${label}`)
  const b = text.indexOf(end, a)
  if (b < 0) throw new Error(`end marker not found: ${label}`)
  return text.slice(0, a) + replacement + text.slice(b)
}
const lines = (...xs) => xs.join('\n') + '\n'

write('src/combat/miyu-assist-lock-budget.js', lines(
  "export const LOCK_SOURCE_BASE = 'base'",
  "export const LOCK_SOURCE_MIYU = 'miyu'",
  '',
  'function normalizeBudget(value) {',
  '  if (value === Infinity) return Infinity',
  '  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0',
  '}',
  '',
  'export function computeLockBudgets(maxAllowed, baseMaxAllowed) {',
  '  const totalBudget = normalizeBudget(maxAllowed)',
  '  const baseCap = normalizeBudget(baseMaxAllowed)',
  '  const base = Math.min(totalBudget, baseCap)',
  '  const miyu = totalBudget === Infinity',
  '    ? (baseCap === Infinity ? 0 : Infinity)',
  '    : Math.max(0, totalBudget - baseCap)',
  '  return { base, miyu }',
  '}',
  '',
  'export function sourceCanLockEntity(source, existingSourceLocksForEntity, baseEntityCap) {',
  '  if (source === LOCK_SOURCE_MIYU) return true',
  '  return existingSourceLocksForEntity < baseEntityCap',
  '}',
))

{
  const path = 'src/combat/lockon.js'
  let text = read(path)
  text = replaceOnce(text,
    "import * as THREE from 'three'\n",
    lines(
      "import * as THREE from 'three'",
      "import { aiValidator } from '../ai-validator.js'",
      'import {',
      '  LOCK_SOURCE_BASE,',
      '  LOCK_SOURCE_MIYU,',
      '  computeLockBudgets,',
      '  sourceCanLockEntity,',
      "} from './miyu-assist-lock-budget.js'",
    ),
    'lockon imports',
  )
  text = replaceOnce(text,
    lines(
      '// ============ ORIGEM DO LOCK — MIYU vs. BASE ============',
      '// A Carga Compartilhada só muda a aparência das travas que excedem o teto BASE do jogador.',
      "export const LOCK_SOURCE_BASE = 'base'",
      "export const LOCK_SOURCE_MIYU = 'miyu'",
    ),
    lines(
      '// ============ ORIGEM DO LOCK — MIYU vs. BASE ============',
      '// Fox e Miyu possuem orçamentos independentes; a origem agora é mecânica, não só visual.',
      'export { LOCK_SOURCE_BASE, LOCK_SOURCE_MIYU }',
    ),
    'lock sources',
  )
  const start = '      // 2) AQUISIÇÃO — tenta adicionar novos até bater o orçamento. Critério de ENTRADA usa o\n'
  const end = '\n    },\n\n    // Fase 8 (VISUAL): hint pra mira normal'
  const block = lines(
    '      // 2) AQUISIÇÃO — Fox e Miyu têm orçamentos separados. O orçamento BASE continua',
    '      // obedecendo o limite por entidade; MIYU pode repetir o mesmo alvo enquanto ele segue na mira.',
    '      const candidates = [...enemies.getAlive(), ...enemies.getGoldenAlive()]',
    '      const budgets = computeLockBudgets(maxAllowed, baseMaxAllowed)',
    '      let baseCount = lockedEnemies.reduce((n, rec) => n + (rec.source === LOCK_SOURCE_BASE ? 1 : 0), 0)',
    '      let miyuCount = lockedEnemies.reduce((n, rec) => n + (rec.source === LOCK_SOURCE_MIYU ? 1 : 0), 0)',
    '',
    '      const candidateIsAimedAndValid = (e) => {',
    '        const rel = e.mesh.position.clone().sub(origin)',
    '        const dist = rel.length()',
    '        if (dist > MAX_LOCK_RANGE || dist < MIN_LOCK_RANGE) return false',
    '        if (rel.dot(frame.forward) < PASS_BEHIND) return false',
    '        const toTarget = rel.clone().normalize()',
    '        const angle = Math.acos(THREE.MathUtils.clamp(direction.dot(toTarget), -1, 1))',
    '        return angle < LOCK_ACQUIRE_ANGLE',
    '      }',
    '',
    '      if (baseCount < budgets.base) {',
    '        for (const e of candidates) {',
    '          if (baseCount >= budgets.base) break',
    '          const existingBaseLocksForEntity = lockedEnemies.reduce(',
    '            (n, rec) => n + (rec.source === LOCK_SOURCE_BASE && rec.entity === e ? 1 : 0), 0,',
    '          )',
    '          if (!sourceCanLockEntity(LOCK_SOURCE_BASE, existingBaseLocksForEntity, maxLocksForEntity(e))) continue',
    '          if (!candidateIsAimedAndValid(e)) continue',
    '          lockedEnemies.push({ entity: e, seq: nextLockSeq++, source: LOCK_SOURCE_BASE })',
    '          baseCount += 1',
    '        }',
    '      }',
    '',
    '      if (miyuCount < budgets.miyu) {',
    '        for (const e of candidates) {',
    '          if (miyuCount >= budgets.miyu) break',
    '          if (!candidateIsAimedAndValid(e)) continue',
    '          const existingMiyuLocksForEntity = lockedEnemies.reduce(',
    '            (n, rec) => n + (rec.source === LOCK_SOURCE_MIYU && rec.entity === e ? 1 : 0), 0,',
    '          )',
    '          if (!sourceCanLockEntity(LOCK_SOURCE_MIYU, existingMiyuLocksForEntity, maxLocksForEntity(e))) continue',
    '          lockedEnemies.push({ entity: e, seq: nextLockSeq++, source: LOCK_SOURCE_MIYU })',
    '          miyuCount += 1',
    "          aiValidator.expect('Carga Compartilhada respeita o orçamento de locks triangulares da Miyu',",
    '            () => miyuCount <= budgets.miyu,',
    '            { miyuCount, miyuBudget: budgets.miyu, targetKind: e.kind, repeatedOnTarget: existingMiyuLocksForEntity + 1 },',
    '          )',
    "          aiValidator.logMechanic('miyu-assist-lock', 'triangular-lock-acquired', {",
    '            targetKind: e.kind, repeatedOnTarget: existingMiyuLocksForEntity + 1,',
    '            miyuCount, miyuBudget: budgets.miyu,',
    '          })',
    '        }',
    '      }',
  )
  text = replaceBetween(text, start, end, block, 'lock acquisition')
  text = replaceBetween(text,
    '    takeLockedTargets(inRange) {\n',
    '\n\n    getLockedEntities:',
    lines(
      '    takeLockedTargetGroups(inRange) {',
      '      const groups = { base: [], miyu: [] }',
      '      for (const rec of lockedEnemies) {',
      '        if (rec.entity.dying || !inRange(rec.entity)) continue',
      '        if (rec.source === LOCK_SOURCE_MIYU) groups.miyu.push(rec.entity)',
      '        else groups.base.push(rec.entity)',
      '      }',
      '      lockedEnemies = []',
      '      return groups',
      '    },',
      '',
      '    takeLockedTargets(inRange) {',
      '      const targets = lockedEnemies',
      '        .filter((rec) => !rec.entity.dying && inRange(rec.entity))',
      '        .map((rec) => rec.entity)',
      '      lockedEnemies = []',
      '      return targets',
      '    },',
    ),
    'grouped release',
  )
  text = text.replace(
    '        // multi-lock no mesmo alvo (só chefe/dourado chegam aqui): distribui em anel no plano\n',
    '        // multi-lock no mesmo alvo (chefe/dourado BASE ou qualquer alvo com locks da Miyu):\n        // distribui em anel no plano horizontal.\n',
  )
  write(path, text)
}

{
  const path = 'src/combat/projectiles.js'
  let text = read(path)
  const start = '    fireHomingShot(origin, direction, maxTargets, isMaxCharge = false) {\n'
  const end = '\n\n    // Swirl Blast — habilidade base'
  const block = lines(
    '    fireHomingShot(origin, direction, maxTargets, isMaxCharge = false) {',
    '      const inRange = (e) => origin.distanceTo(e.mesh.position) <= MAX_HOMING_RANGE',
    '      const lockedGroups = lockon.takeLockedTargetGroups',
    '        ? lockon.takeLockedTargetGroups(inRange)',
    '        : { base: lockon.takeLockedTargets(inRange), miyu: [] }',
    '      const locked = lockedGroups.base',
    '      const miyuTargets = lockedGroups.miyu',
    '      const playerTargetBudget = Math.max(0, Math.min(maxTargets, player.config.homingMaxTargets ?? maxTargets))',
    '      let targetList',
    '      let straightShot = false',
    '      if (locked.length > 0) {',
    '        targetList = locked.slice(0, playerTargetBudget)',
    '      } else if (miyuTargets.length === 0) {',
    '        targetList = lockon.getEnemiesInAimCone(origin, direction, playerTargetBudget).filter(inRange)',
    '        if (targetList.length === 0) straightShot = true',
    '      } else {',
    '        targetList = []',
    '      }',
    '      const damage = isMaxCharge ? HOMING_PROJECTILE_DAMAGE_MAX_CHARGE : HOMING_PROJECTILE_DAMAGE',
    '      const homingSpeed = isMaxCharge ? HOMING_PROJECTILE_SPEED * 1.25 : HOMING_PROJECTILE_SPEED',
    '      for (const target of targetList) {',
    '        const targetDir = target.mesh.position.clone().sub(origin).normalize()',
    '        const mesh = new THREE.Mesh(homingProjectileGeometry, isMaxCharge ? homingMaxChargeMaterial : homingProjectileMaterial)',
    '        mesh.position.copy(origin)',
    '        if (isMaxCharge) mesh.scale.setScalar(MAX_CHARGE_VISUAL_SCALE)',
    '        scene.add(mesh)',
    '        projectiles.push({',
    '          mesh, velocity: targetDir.multiplyScalar(homingSpeed), traveled: 0,',
    '          homingTarget: target, damage, isHoming: true, afterimageTimer: 0, isMaxCharge,',
    '          bouncesLeft: player.config.ricochetCount ?? 0,',
    '        })',
    '      }',
    '      if (straightShot) {',
    '        const mesh = new THREE.Mesh(homingProjectileGeometry, isMaxCharge ? homingMaxChargeMaterial : homingProjectileMaterial)',
    '        mesh.position.copy(origin)',
    '        if (isMaxCharge) mesh.scale.setScalar(MAX_CHARGE_VISUAL_SCALE)',
    '        scene.add(mesh)',
    '        projectiles.push({',
    '          mesh, velocity: direction.clone().multiplyScalar(homingSpeed), traveled: 0,',
    '          damage, isHoming: true, afterimageTimer: 0, isMaxCharge,',
    '          bouncesLeft: player.config.ricochetCount ?? 0,',
    '        })',
    '      }',
    '      const firstDir = targetList[0] ? targetList[0].mesh.position.clone().sub(origin).normalize() : direction.clone()',
    '      if (effects) {',
    '        effects.muzzleFlash(origin, firstDir)',
    '        if (isMaxCharge && effects.maxChargeRings) effects.maxChargeRings(origin, firstDir)',
    '        else effects.smokeRing(origin, firstDir)',
    '      }',
    '      const playerShotsFired = targetList.length + (straightShot ? 1 : 0)',
    '      if (playerShotsFired > 0) triggerSoundCue(PLAYER_SOUND_CUES.homing_fire, { count: playerShotsFired, isMaxCharge, origin })',
    '      return { playerShotsFired, miyuTargets }',
    '    },',
  )
  text = replaceBetween(text, start, end, block, 'player homing dispatch')
  write(path, text)
}

{
  const path = 'src/combat/index.js'
  let text = read(path)
  text = replaceBetween(text,
    '    fireHomingShot: (origin, direction, maxTargets, isMaxCharge) => {\n',
    '    // overhaul v2 (pedido do usuário): homing contra chefe/dourado',
    lines(
      '    fireHomingShot: (origin, direction, maxTargets, isMaxCharge) => {',
      '      const shotResult = projectiles.fireHomingShot(origin, direction, maxTargets, isMaxCharge)',
      "      const playerShotsFired = typeof shotResult === 'number' ? shotResult : (shotResult?.playerShotsFired || 0)",
      '      const miyuTargets = Array.isArray(shotResult?.miyuTargets) ? shotResult.miyuTargets : []',
      '      const miyuShotsFired = squadron.fireMiyuAssistShots?.(miyuTargets) || 0',
      '      const totalShotsFired = playerShotsFired + miyuShotsFired',
      '      if (totalShotsFired > 0) {',
      "        player.getTelemetry?.()?.recordEvent('homing',",
      "          'Tiro teleguiado disparado! Carga max: ' + isMaxCharge + ', Fox: ' + playerShotsFired + ', Miyu: ' + miyuShotsFired,",
      '          { isMaxCharge, maxTargets, playerShotsFired, miyuShotsFired, miyuLocks: miyuTargets.length },',
      '        )',
      '      }',
      '      return totalShotsFired',
      '    },',
    ),
    'combat homing wrapper',
  )
  write(path, text)
}

{
  const path = 'src/combat/wingmen.js'
  let text = read(path)
  text = replaceBetween(text,
    '  // Carga Compartilhada: para cada lock QUE EXCEDE o teto base, Miyu solta um laser roxo\n',
    '  function fireMiyuBoombuster(miyu, playerPos, stacks) {\n',
    lines(
      '  // Carga Compartilhada: cada lock triangular pertence EXCLUSIVAMENTE à Miyu.',
      '  // Cada triângulo vira um laser roxo homing nascido fisicamente na nave dela.',
      '  function fireMiyuAssistShots(miyuTargets) {',
      "    const miyu = activeWingmen.find((w) => w.profile.id === 3 && w.abilityActive && w.escortKind === 'assist')",
      '    if (!miyu || !Array.isArray(miyuTargets)) return 0',
      '    let shots = 0',
      '    const targetCounts = new Map()',
      '    for (const target of miyuTargets) {',
      '      if (!target?.mesh || target.dying) continue',
      '      _wmToEnemy.copy(target.mesh.position).sub(miyu.mesh.position)',
      '      if (_wmToEnemy.lengthSq() < 0.001) continue',
      '      _wmToEnemy.normalize()',
      '      const muzzle = _wmLaserMuzzle.copy(miyu.mesh.position).addScaledVector(_wmToEnemy, 1.3)',
      '      fireWingmanLaser(miyu, muzzle, _wmToEnemy, {',
      '        color: MIYU_CHARGED_SHOT_COLOR, chargedVisual: true,',
      '        homingTarget: target, homingTurnRate: MIYU_BOOMBUSTER_TURN_RATE,',
      '      })',
      '      shots += 1',
      '      targetCounts.set(target, (targetCounts.get(target) || 0) + 1)',
      '    }',
      "    aiValidator.expect('Cada lock triangular da Miyu gera no máximo um disparo próprio',",
      '      () => shots <= miyuTargets.length, { shots, miyuLocks: miyuTargets.length })',
      '    if (shots > 0) {',
      "      aiValidator.logMechanic('miyu-assist-shot', 'triangular-locks-fired-from-miyu', {",
      '        shots, miyuLocks: miyuTargets.length,',
      '        repeatedTargets: [...targetCounts.values()].filter((count) => count > 1).length,',
      '      })',
      '    }',
      '    return shots',
      '  }',
      '',
    ),
    'Miyu assist firing',
  )
  write(path, text)
}

write('src/miyu-assist-locks.test.mjs', lines(
  "import assert from 'node:assert/strict'",
  "import { readFileSync } from 'node:fs'",
  "import { LOCK_SOURCE_BASE, LOCK_SOURCE_MIYU, computeLockBudgets, sourceCanLockEntity } from './combat/miyu-assist-lock-budget.js'",
  '',
  'assert.deepStrictEqual(computeLockBudgets(4, 4), { base: 4, miyu: 0 })',
  'assert.deepStrictEqual(computeLockBudgets(5, 4), { base: 4, miyu: 1 })',
  'assert.deepStrictEqual(computeLockBudgets(8, 4), { base: 4, miyu: 4 })',
  'assert.deepStrictEqual(computeLockBudgets(3, 4), { base: 3, miyu: 0 })',
  "assert.strictEqual(sourceCanLockEntity(LOCK_SOURCE_BASE, 1, 1), false, 'comum: segundo BASE bloqueado')",
  "assert.strictEqual(sourceCanLockEntity(LOCK_SOURCE_BASE, 1, 2), true, 'Horda: segundo BASE permitido')",
  "assert.strictEqual(sourceCanLockEntity(LOCK_SOURCE_MIYU, 1, 1), true, 'Miyu repete em comum')",
  "assert.strictEqual(sourceCanLockEntity(LOCK_SOURCE_MIYU, 20, 1), true, 'Miyu ignora teto por entidade')",
  '',
  "const lockon = readFileSync(new URL('./combat/lockon.js', import.meta.url), 'utf8')",
  "assert.ok(lockon.includes('computeLockBudgets(maxAllowed, baseMaxAllowed)'))",
  "assert.ok(lockon.includes('source: LOCK_SOURCE_MIYU'))",
  "assert.ok(lockon.includes('triangular-lock-acquired'))",
  "assert.ok(lockon.includes('takeLockedTargetGroups(inRange)'))",
  '',
  "const projectiles = readFileSync(new URL('./combat/projectiles.js', import.meta.url), 'utf8')",
  "assert.ok(projectiles.includes('const locked = lockedGroups.base'))",
  "assert.ok(projectiles.includes('const miyuTargets = lockedGroups.miyu'))",
  "assert.ok(projectiles.includes('player.config.homingMaxTargets'))",
  '',
  "const wingmen = readFileSync(new URL('./combat/wingmen.js', import.meta.url), 'utf8')",
  "const assistStart = wingmen.indexOf('function fireMiyuAssistShots')",
  "const assistEnd = wingmen.indexOf('function fireMiyuBoombuster', assistStart)",
  'const assistBlock = wingmen.slice(assistStart, assistEnd)',
  "assert.ok(assistBlock.includes('for (const target of miyuTargets)'))",
  "assert.ok(assistBlock.includes('homingTarget: target'))",
  "assert.ok(assistBlock.includes('MIYU_CHARGED_SHOT_COLOR'))",
  "assert.ok(!assistBlock.includes('slice(Math.max(0, baseMaxTargets))'))",
  '',
  "const orchestrator = readFileSync(new URL('./combat/index.js', import.meta.url), 'utf8')",
  "assert.ok(orchestrator.includes('shotResult?.miyuTargets'))",
  "assert.ok(orchestrator.includes('squadron.fireMiyuAssistShots?.(miyuTargets)'))",
  "console.log('miyu-assist-locks.test.mjs: OK')",
))

{
  const path = 'src/selftest.mjs'
  let text = read(path)
  text = replaceOnce(text,
    "import './playtest-polish.test.mjs'\n",
    "import './playtest-polish.test.mjs'\nimport './miyu-assist-locks.test.mjs'\n",
    'selftest import',
  )
  write(path, text)
}

{
  const path = 'src/version.js'
  let text = read(path)
  text = replaceOnce(text, "export const GAME_VERSION = 'v0.99.32'", "export const GAME_VERSION = 'v0.99.33'", 'version')
  write(path, text)
}

{
  const path = 'README.md'
  let text = read(path)
  text = replaceOnce(text, 'versão-v0.99.32-blue.svg', 'versão-v0.99.33-blue.svg', 'README badge')
  text = replaceOnce(text,
    '**v0.99.32:** rádio dos Wingmen passa a aplicar cooldown de 2–10 s por piloto a qualquer transmissão normal/ability/Call & Response; a fala da Carga Compartilhada da Miyu só ocorre enquanto o jogador está carregando e já existe um lock visível (triângulo) em inimigo.',
    '**v0.99.33:** os locks triangulares da Carga Compartilhada pertencem exclusivamente à Miyu: podem se repetir no mesmo inimigo enquanto a mira permanece nele e cada triângulo gera um disparo roxo homing saindo da nave dela, sem criar uma cópia extra no Fox.',
    'README current summary',
  )
  if (!text.includes('### v0.99.33 — Carga Compartilhada com ownership real dos locks')) {
    const marker = '### v0.99.31 — Hotfix de carregamento dos Wingmen\n'
    const history = lines(
      '### v0.99.33 — Carga Compartilhada com ownership real dos locks',
      '- Locks triangulares (`source: miyu`) deixam de ser consumidos pelo tiro carregado do Fox.',
      '- Orçamentos BASE e MIYU são independentes; o BASE preserva limites por tipo e a Miyu pode repetir seus triângulos no mesmo alvo comum enquanto a mira permanece nele.',
      '- Cada triângulo gera um laser roxo homing de suporte disparado fisicamente da nave da Miyu; com 3 stacks, o orçamento atual permite até 4 extras.',
      '- Aquisição e disparo recebem instrumentação `aiValidator` e regressão dedicada.',
      '',
      '### v0.99.32 — Antispam de rádio e fala contextual da Miyu',
      '- Cooldown de rádio por piloto entre 2 e 10 segundos para falas triviais, abilities e Call & Response.',
      '- `ability_assist` só é anunciada enquanto o jogador ainda carrega e já existe um lock visível no HUD.',
      '',
    )
    text = replaceOnce(text, marker, history + marker, 'README history')
  }
  if (!text.includes('PROGRESSO_POS_.90.35.md')) {
    const marker = '- [progresso/PROGRESSO_POS_.70.md](progresso/PROGRESSO_POS_.70.md) — **Arquivo atual**, v0.75.0 em diante.\n'
    const links = lines(
      '- [progresso/PROGRESSO_POS_.90.35.md](progresso/PROGRESSO_POS_.90.35.md) — registro incremental criado a partir da v0.99.33.',
      '- [progresso/PROGRESSO_POS_.90.md](progresso/PROGRESSO_POS_.90.md) — resumo contínuo das implementações v0.90+.',
      '- [progresso/PROGRESSO_POS_.70.md](progresso/PROGRESSO_POS_.70.md) — histórico anterior.',
    )
    text = replaceOnce(text, marker, links, 'README progress links')
  }
  write(path, text)
}

{
  const path = 'progresso/PROGRESSO_POS_.90.md'
  let text = read(path).trimEnd()
  text += '\n\n---\n\n' + lines(
    '### v0.99.33 — Carga Compartilhada: triângulos pertencem à Miyu (23/09/2026)',
    '',
    '- Lock-on separado em orçamento BASE e MIYU. O teto por entidade permanece no Fox; os triângulos da Miyu podem repetir o mesmo inimigo enquanto a mira permanece nele.',
    '- O bônus continua limitado a `1 + stacks`, chegando a 4 locks extras com 3 stacks.',
    '- `projectiles.js` consome apenas locks BASE; locks `source: miyu` são encaminhados a `wingmen.js`.',
    '- Cada triângulo produz um laser roxo homing que nasce na nave da Miyu com dano normal de suporte. O Fox não dispara a cópia extra.',
    '- `aiValidator` instrumenta aquisição e salva da Miyu em eventos discretos.',
    '- Regressão dedicada cobre budgets, repetição no mesmo alvo, ownership e homing.',
    '- README e `src/version.js` atualizados para v0.99.33; criados `docs/docs 2/Gpt progress.md` e `progresso/PROGRESSO_POS_.90.35.md`.',
    '',
    '**Validação:** sintaxe, teste dedicado, selftest completo e `git diff --check` no workflow isolado.',
  )
  write(path, text)
}

write('progresso/PROGRESSO_POS_.90.35.md', lines(
  '# PROGRESSO POS .90.35',
  '',
  'Registro incremental criado em 23/09/2026. Não substitui `PROGRESSO_POS_.90.md`; ambos continuam sendo atualizados.',
  '',
  '---',
  '',
  '## v0.99.33 — Ownership dos locks triangulares da Miyu',
  '',
  '### Pedido',
  '- Fazer o disparo extra indicado pelo target triangular sair da Miyu, e não do jogador.',
  '- Permitir múltiplos locks da Miyu no mesmo inimigo independentemente do tamanho, enquanto a mira permanecer nele.',
  '',
  '### Implementação',
  '- Orçamentos BASE e MIYU separados.',
  '- BASE preserva limites antigos por entidade; MIYU ignora o limite por entidade e usa o orçamento `1 + stacks` (até 4 extras).',
  '- Release preserva ownership: Fox recebe BASE; Miyu recebe MIYU.',
  '- Cada triângulo gera laser roxo homing de suporte originado na nave da Miyu.',
  '- Nenhum triângulo é convertido em disparo carregado adicional do Fox.',
  '',
  '### Validação',
  '- `aiValidator` para aquisição/disparo.',
  '- Teste dedicado integrado ao `selftest.mjs`.',
  '- README e versão do site em v0.99.33.',
))

write('docs/docs 2/Gpt progress.md', lines(
  '# Gpt progress',
  '',
  'Registro das ações implementadas pelo GPT neste projeto a partir de 23/09/2026.',
  '',
  '## Regras daqui em diante',
  '- Registrar cada pacote implementado vindo desta conversa.',
  '- Descrever pedido, diagnóstico, solução e validação.',
  '- Continuar resumindo as entregas em `progresso/PROGRESSO_POS_.90.md`.',
  '- Manter `progresso/PROGRESSO_POS_.90.35.md` como registro incremental atual.',
  '- Atualizar README e versão do site em toda entrega versionada.',
  '',
  '---',
  '',
  '## 23/09/2026 — v0.99.33 — Carga Compartilhada com ownership da Miyu',
  '',
  '### Solicitação',
  'O target triangular deve representar um disparo realmente pertencente à Miyu e poder acumular múltiplos triângulos no mesmo inimigo enquanto ele permanecer sob a mira.',
  '',
  '### Diagnóstico',
  '`lockon.js` marcava extras como `source: miyu`, mas `projectiles.fireHomingShot()` consumia a lista inteira; o Fox disparava esses projéteis e `wingmen.js` ainda inferia extras pela posição no array. O ownership era visual, não mecânico.',
  '',
  '### Solução',
  '1. Budgets BASE/MIYU independentes.',
  '2. BASE mantém limite por entidade; MIYU pode repetir alvo comum.',
  '3. O release separa grupos de ownership.',
  '4. Fox dispara apenas BASE.',
  '5. Cada MIYU lock gera laser roxo homing saindo da nave da Miyu, com dano de suporte.',
  '6. Instrumentação `aiValidator` e regressão dedicada.',
  '',
  '### Validação',
  'Árvore validada em branch isolada com checks de sintaxe, teste dedicado, `selftest.mjs` e `git diff --check`. Playtest visual ainda é útil para confirmar trajetória/origem em runtime.',
))

console.log('v0.99.33 Miyu owned-lock migration applied')
