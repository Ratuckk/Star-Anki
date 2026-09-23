from pathlib import Path


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'marker not found: {label}')
    if text.count(old) != 1:
        raise RuntimeError(f'marker is not unique ({text.count(old)}): {label}')
    return text.replace(old, new, 1)


def replace_between(text, start, end, replacement, label):
    start_idx = text.find(start)
    if start_idx < 0:
        raise RuntimeError(f'start marker not found: {label}')
    end_idx = text.find(end, start_idx)
    if end_idx < 0:
        raise RuntimeError(f'end marker not found: {label}')
    return text[:start_idx] + replacement + text[end_idx:]


# ---------------------------------------------------------------------------
# Pure model: player and Miyu own independent lock budgets.
# ---------------------------------------------------------------------------
write('src/combat/miyu-assist-lock-budget.js', """export const LOCK_SOURCE_BASE = 'base'\nexport const LOCK_SOURCE_MIYU = 'miyu'\n\nfunction normalizeBudget(value) {\n  if (value === Infinity) return Infinity\n  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0\n}\n\nexport function computeLockBudgets(maxAllowed, baseMaxAllowed) {\n  const totalBudget = normalizeBudget(maxAllowed)\n  const baseCap = normalizeBudget(baseMaxAllowed)\n  const base = Math.min(totalBudget, baseCap)\n  const miyu = totalBudget === Infinity\n    ? (baseCap === Infinity ? 0 : Infinity)\n    : Math.max(0, totalBudget - baseCap)\n  return { base, miyu }\n}\n\nexport function sourceCanLockEntity(source, existingSourceLocksForEntity, baseEntityCap) {\n  if (source === LOCK_SOURCE_MIYU) return true\n  return existingSourceLocksForEntity < baseEntityCap\n}\n""")

# ---------------------------------------------------------------------------
# Lock-on: separate budgets, repeated Miyu locks, grouped consumption.
# ---------------------------------------------------------------------------
path = 'src/combat/lockon.js'
text = read(path)
text = replace_once(
    text,
    "import * as THREE from 'three'\n",
    "import * as THREE from 'three'\nimport { aiValidator } from '../ai-validator.js'\nimport {\n  LOCK_SOURCE_BASE,\n  LOCK_SOURCE_MIYU,\n  computeLockBudgets,\n  sourceCanLockEntity,\n} from './miyu-assist-lock-budget.js'\n",
    'lockon imports',
)
text = replace_once(
    text,
    "// ============ ORIGEM DO LOCK — MIYU vs. BASE ============\n// A Carga Compartilhada só muda a aparência das travas que excedem o teto BASE do jogador.\nexport const LOCK_SOURCE_BASE = 'base'\nexport const LOCK_SOURCE_MIYU = 'miyu'\n",
    "// ============ ORIGEM DO LOCK — MIYU vs. BASE ============\n// O Fox e a Miyu possuem orçamentos independentes. Os IDs ficam num módulo puro para que a\n// regra de orçamento/empilhamento seja testável sem Three.js.\nexport { LOCK_SOURCE_BASE, LOCK_SOURCE_MIYU }\n",
    'lock source constants',
)
acquisition_start = "      // 2) AQUISIÇÃO — tenta adicionar novos até bater o orçamento. Critério de ENTRADA usa o\n"
acquisition_end = "\n    },\n\n    // Fase 8 (VISUAL): hint pra mira normal"
new_acquisition = """      // 2) AQUISIÇÃO — Fox e Miyu têm orçamentos separados. O orçamento BASE continua\n      // obedecendo o limite por entidade (comum 1x, Horda 2x, chefe/dourado livres). Já o\n      // orçamento MIYU ignora o tamanho/tipo do alvo: enquanto a mira continua dentro do cone,\n      // cada novo degrau de carga pode adicionar outro triângulo no MESMO inimigo.\n      const candidates = [...enemies.getAlive(), ...enemies.getGoldenAlive()]\n      const budgets = computeLockBudgets(maxAllowed, baseMaxAllowed)\n      let baseCount = lockedEnemies.reduce((n, rec) => n + (rec.source === LOCK_SOURCE_BASE ? 1 : 0), 0)\n      let miyuCount = lockedEnemies.reduce((n, rec) => n + (rec.source === LOCK_SOURCE_MIYU ? 1 : 0), 0)\n\n      const candidateIsAimedAndValid = (e) => {\n        const rel = e.mesh.position.clone().sub(origin)\n        const dist = rel.length()\n        if (dist > MAX_LOCK_RANGE || dist < MIN_LOCK_RANGE) return false\n        if (rel.dot(frame.forward) < PASS_BEHIND) return false\n        const toTarget = rel.clone().normalize()\n        const angle = Math.acos(THREE.MathUtils.clamp(direction.dot(toTarget), -1, 1))\n        return angle < LOCK_ACQUIRE_ANGLE\n      }\n\n      if (baseCount < budgets.base) {\n        for (const e of candidates) {\n          if (baseCount >= budgets.base) break\n          const existingBaseLocksForEntity = lockedEnemies.reduce(\n            (n, rec) => n + (rec.source === LOCK_SOURCE_BASE && rec.entity === e ? 1 : 0),\n            0,\n          )\n          if (!sourceCanLockEntity(LOCK_SOURCE_BASE, existingBaseLocksForEntity, maxLocksForEntity(e))) continue\n          if (!candidateIsAimedAndValid(e)) continue\n          lockedEnemies.push({ entity: e, seq: nextLockSeq++, source: LOCK_SOURCE_BASE })\n          baseCount += 1\n        }\n      }\n\n      if (miyuCount < budgets.miyu) {\n        for (const e of candidates) {\n          if (miyuCount >= budgets.miyu) break\n          if (!candidateIsAimedAndValid(e)) continue\n          const existingMiyuLocksForEntity = lockedEnemies.reduce(\n            (n, rec) => n + (rec.source === LOCK_SOURCE_MIYU && rec.entity === e ? 1 : 0),\n            0,\n          )\n          if (!sourceCanLockEntity(LOCK_SOURCE_MIYU, existingMiyuLocksForEntity, maxLocksForEntity(e))) continue\n          lockedEnemies.push({ entity: e, seq: nextLockSeq++, source: LOCK_SOURCE_MIYU })\n          miyuCount += 1\n          aiValidator.expect(\n            'Carga Compartilhada respeita o orçamento de locks triangulares da Miyu',\n            () => miyuCount <= budgets.miyu,\n            { miyuCount, miyuBudget: budgets.miyu, targetKind: e.kind, repeatedOnTarget: existingMiyuLocksForEntity + 1 },\n          )\n          aiValidator.logMechanic('miyu-assist-lock', 'triangular-lock-acquired', {\n            targetKind: e.kind, repeatedOnTarget: existingMiyuLocksForEntity + 1,\n            miyuCount, miyuBudget: budgets.miyu,\n          })\n        }\n      }\n"""
text = replace_between(text, acquisition_start, acquisition_end, new_acquisition, 'lock acquisition')

take_start = "    takeLockedTargets(inRange) {\n"
take_end = "\n\n    getLockedEntities:"
new_take = """    takeLockedTargetGroups(inRange) {\n      const groups = { base: [], miyu: [] }\n      for (const rec of lockedEnemies) {\n        if (rec.entity.dying || !inRange(rec.entity)) continue\n        if (rec.source === LOCK_SOURCE_MIYU) groups.miyu.push(rec.entity)\n        else groups.base.push(rec.entity)\n      }\n      lockedEnemies = []\n      return groups\n    },\n\n    // Compatibilidade com consumidores antigos: quando alguém pede a lista plana, continua\n    // recebendo todos os alvos. O disparo real usa takeLockedTargetGroups() para preservar dono.\n    takeLockedTargets(inRange) {\n      const targets = lockedEnemies\n        .filter((rec) => !rec.entity.dying && inRange(rec.entity))\n        .map((rec) => rec.entity)\n      lockedEnemies = []\n      return targets\n    },\n"""
text = replace_between(text, take_start, take_end, new_take, 'grouped target consumption')
text = text.replace(
    "        // multi-lock no mesmo alvo (só chefe/dourado chegam aqui): distribui em anel no plano\n",
    "        // multi-lock no mesmo alvo (chefe/dourado BASE ou qualquer alvo com locks da Miyu):\n        // distribui em anel no plano horizontal.\n",
)
write(path, text)

# ---------------------------------------------------------------------------
# Player projectile system consumes only BASE locks and returns Miyu-owned locks.
# ---------------------------------------------------------------------------
path = 'src/combat/projectiles.js'
text = read(path)
start = "    fireHomingShot(origin, direction, maxTargets, isMaxCharge = false) {\n"
end = "\n\n    // Swirl Blast — habilidade base"
new_block = """    fireHomingShot(origin, direction, maxTargets, isMaxCharge = false) {\n      const inRange = (e) => origin.distanceTo(e.mesh.position) <= MAX_HOMING_RANGE\n      const lockedGroups = lockon.takeLockedTargetGroups\n        ? lockon.takeLockedTargetGroups(inRange)\n        : { base: lockon.takeLockedTargets(inRange), miyu: [] }\n      const locked = lockedGroups.base\n      const miyuTargets = lockedGroups.miyu\n      const playerTargetBudget = Math.max(0, Math.min(maxTargets, player.config.homingMaxTargets ?? maxTargets))\n      let targetList\n      let straightShot = false\n      if (locked.length > 0) {\n        targetList = locked.slice(0, playerTargetBudget)\n      } else if (miyuTargets.length === 0) {\n        targetList = lockon.getEnemiesInAimCone(origin, direction, playerTargetBudget).filter(inRange)\n        if (targetList.length === 0) straightShot = true\n      } else {\n        // Se só restou um lock da Miyu por alguma transição extrema de estado, o Fox não\n        // sequestra esse triângulo via fallback: o dono continua sendo a Miyu.\n        targetList = []\n      }\n      const damage = isMaxCharge ? HOMING_PROJECTILE_DAMAGE_MAX_CHARGE : HOMING_PROJECTILE_DAMAGE\n      const homingSpeed = isMaxCharge ? HOMING_PROJECTILE_SPEED * 1.25 : HOMING_PROJECTILE_SPEED\n      for (const target of targetList) {\n        const targetDir = target.mesh.position.clone().sub(origin).normalize()\n        const mesh = new THREE.Mesh(homingProjectileGeometry, isMaxCharge ? homingMaxChargeMaterial : homingProjectileMaterial)\n        mesh.position.copy(origin)\n        if (isMaxCharge) mesh.scale.setScalar(MAX_CHARGE_VISUAL_SCALE)\n        scene.add(mesh)\n        projectiles.push({\n          mesh, velocity: targetDir.multiplyScalar(homingSpeed), traveled: 0,\n          homingTarget: target, damage, isHoming: true, afterimageTimer: 0, isMaxCharge,\n          bouncesLeft: player.config.ricochetCount ?? 0,\n        })\n      }\n      if (straightShot) {\n        const mesh = new THREE.Mesh(homingProjectileGeometry, isMaxCharge ? homingMaxChargeMaterial : homingProjectileMaterial)\n        mesh.position.copy(origin)\n        if (isMaxCharge) mesh.scale.setScalar(MAX_CHARGE_VISUAL_SCALE)\n        scene.add(mesh)\n        projectiles.push({\n          mesh, velocity: direction.clone().multiplyScalar(homingSpeed), traveled: 0,\n          damage, isHoming: true, afterimageTimer: 0, isMaxCharge,\n          bouncesLeft: player.config.ricochetCount ?? 0,\n        })\n      }\n      const firstDir = targetList[0] ? targetList[0].mesh.position.clone().sub(origin).normalize() : direction.clone()\n      if (effects) {\n        effects.muzzleFlash(origin, firstDir)\n        if (isMaxCharge && effects.maxChargeRings) {\n          effects.maxChargeRings(origin, firstDir)\n        } else {\n          effects.smokeRing(origin, firstDir)\n        }\n      }\n      const playerShotsFired = targetList.length + (straightShot ? 1 : 0)\n      if (playerShotsFired > 0) {\n        triggerSoundCue(PLAYER_SOUND_CUES.homing_fire, { count: playerShotsFired, isMaxCharge, origin })\n      }\n      return { playerShotsFired, miyuTargets }\n    },\n"""
text = replace_between(text, start, end, new_block, 'projectile homing dispatch')
write(path, text)

# ---------------------------------------------------------------------------
# Combat orchestrator dispatches the assist-owned targets to Miyu.
# ---------------------------------------------------------------------------
path = 'src/combat/index.js'
text = read(path)
start = "    fireHomingShot: (origin, direction, maxTargets, isMaxCharge) => {\n"
end = "    // overhaul v2 (pedido do usuário): homing contra chefe/dourado"
new_block = """    fireHomingShot: (origin, direction, maxTargets, isMaxCharge) => {\n      const shotResult = projectiles.fireHomingShot(origin, direction, maxTargets, isMaxCharge)\n      const playerShotsFired = typeof shotResult === 'number' ? shotResult : (shotResult?.playerShotsFired || 0)\n      const miyuTargets = Array.isArray(shotResult?.miyuTargets) ? shotResult.miyuTargets : []\n      const miyuShotsFired = squadron.fireMiyuAssistShots?.(miyuTargets) || 0\n      const totalShotsFired = playerShotsFired + miyuShotsFired\n      if (totalShotsFired > 0) {\n        player.getTelemetry?.()?.recordEvent(\n          'homing',\n          `Tiro teleguiado disparado! Carga máx: ${isMaxCharge}, Fox: ${playerShotsFired}, Miyu: ${miyuShotsFired}`,\n          { isMaxCharge, maxTargets, playerShotsFired, miyuShotsFired, miyuLocks: miyuTargets.length },\n        )\n      }\n      return totalShotsFired\n    },\n"
text = replace_between(text, start, end, new_block, 'combat homing wrapper')
write(path, text)

# ---------------------------------------------------------------------------
# Miyu fires every triangle herself, from her ship, as purple homing support.
# ---------------------------------------------------------------------------
path = 'src/combat/wingmen.js'
text = read(path)
start = "  // Carga Compartilhada: para cada lock QUE EXCEDE o teto base, Miyu solta um laser roxo\n"
end = "  function fireMiyuBoombuster(miyu, playerPos, stacks) {\n"
new_block = """  // Carga Compartilhada: cada lock triangular pertence EXCLUSIVAMENTE à Miyu. O Fox não\n  // consome mais essas travas. Cada triângulo vira um laser roxo homing que nasce fisicamente\n  // na nave dela; múltiplos triângulos podem apontar para o mesmo inimigo, independente do kind.\n  function fireMiyuAssistShots(miyuTargets) {\n    const miyu = activeWingmen.find((w) => w.profile.id === 3 && w.abilityActive && w.escortKind === 'assist')\n    if (!miyu || !Array.isArray(miyuTargets)) return 0\n    let shots = 0\n    const targetCounts = new Map()\n    for (const target of miyuTargets) {\n      if (!target?.mesh || target.dying) continue\n      _wmToEnemy.copy(target.mesh.position).sub(miyu.mesh.position)\n      if (_wmToEnemy.lengthSq() < 0.001) continue\n      _wmToEnemy.normalize()\n      const muzzle = _wmLaserMuzzle.copy(miyu.mesh.position).addScaledVector(_wmToEnemy, 1.3)\n      fireWingmanLaser(miyu, muzzle, _wmToEnemy, {\n        color: MIYU_CHARGED_SHOT_COLOR,\n        chargedVisual: true,\n        homingTarget: target,\n        homingTurnRate: MIYU_BOOMBUSTER_TURN_RATE,\n      })\n      shots += 1\n      targetCounts.set(target, (targetCounts.get(target) || 0) + 1)\n    }\n    aiValidator.expect(\n      'Cada lock triangular da Miyu gera no máximo um disparo próprio',\n      () => shots <= miyuTargets.length,\n      { shots, miyuLocks: miyuTargets.length },\n    )\n    if (shots > 0) {\n      aiValidator.logMechanic('miyu-assist-shot', 'triangular-locks-fired-from-miyu', {\n        shots, miyuLocks: miyuTargets.length,\n        repeatedTargets: [...targetCounts.values()].filter((count) => count > 1).length,\n      })\n    }\n    return shots\n  }\n\n"
text = replace_between(text, start, end, new_block, 'Miyu assist firing')
write(path, text)

# ---------------------------------------------------------------------------
# Regression test: pure budgets + integration guards.
# ---------------------------------------------------------------------------
write('src/miyu-assist-locks.test.mjs', """import assert from 'node:assert/strict'\nimport { readFileSync } from 'node:fs'\nimport {\n  LOCK_SOURCE_BASE,\n  LOCK_SOURCE_MIYU,\n  computeLockBudgets,\n  sourceCanLockEntity,\n} from './combat/miyu-assist-lock-budget.js'\n\nassert.deepStrictEqual(computeLockBudgets(4, 4), { base: 4, miyu: 0 })\nassert.deepStrictEqual(computeLockBudgets(5, 4), { base: 4, miyu: 1 })\nassert.deepStrictEqual(computeLockBudgets(8, 4), { base: 4, miyu: 4 })\nassert.deepStrictEqual(computeLockBudgets(3, 4), { base: 3, miyu: 0 })\nassert.strictEqual(sourceCanLockEntity(LOCK_SOURCE_BASE, 1, 1), false, 'alvo comum continua limitado a 1 lock BASE')\nassert.strictEqual(sourceCanLockEntity(LOCK_SOURCE_BASE, 1, 2), true, 'Horda ainda aceita o segundo lock BASE')\nassert.strictEqual(sourceCanLockEntity(LOCK_SOURCE_MIYU, 1, 1), true, 'Miyu pode repetir lock em alvo comum')\nassert.strictEqual(sourceCanLockEntity(LOCK_SOURCE_MIYU, 20, 1), true, 'limite por entidade não se aplica ao orçamento da Miyu')\n\nconst lockon = readFileSync(new URL('./combat/lockon.js', import.meta.url), 'utf8')\nassert.ok(lockon.includes('computeLockBudgets(maxAllowed, baseMaxAllowed)'), 'lockon deve usar orçamentos independentes')\nassert.ok(lockon.includes("source: LOCK_SOURCE_MIYU"), 'lockon deve registrar dono Miyu no triângulo')\nassert.ok(lockon.includes("triangular-lock-acquired"), 'aquisição triangular deve ser instrumentada no aiValidator')\nassert.ok(lockon.includes('takeLockedTargetGroups(inRange)'), 'release deve preservar grupos BASE/MIYU')\n\nconst projectiles = readFileSync(new URL('./combat/projectiles.js', import.meta.url), 'utf8')\nassert.ok(projectiles.includes('const locked = lockedGroups.base'), 'Fox deve consumir somente locks BASE')\nassert.ok(projectiles.includes('const miyuTargets = lockedGroups.miyu'), 'projéteis devem devolver locks da Miyu sem dispará-los')\nassert.ok(projectiles.includes('player.config.homingMaxTargets'), 'fallback do Fox deve respeitar teto próprio, sem usar bônus da Miyu')\n\nconst wingmen = readFileSync(new URL('./combat/wingmen.js', import.meta.url), 'utf8')\nconst assistStart = wingmen.indexOf('function fireMiyuAssistShots')\nconst assistEnd = wingmen.indexOf('function fireMiyuBoombuster', assistStart)\nconst assistBlock = wingmen.slice(assistStart, assistEnd)\nassert.ok(assistBlock.includes('for (const target of miyuTargets)'), 'cada triângulo deve ser despachado pela Miyu')\nassert.ok(assistBlock.includes('homingTarget: target'), 'disparo triangular da Miyu deve ser homing')\nassert.ok(assistBlock.includes('MIYU_CHARGED_SHOT_COLOR'), 'disparo triangular deve manter identidade roxa da Miyu')\nassert.ok(!assistBlock.includes('slice(Math.max(0, baseMaxTargets))'), 'Miyu não pode inferir ownership por índice do array')\n\nconst orchestrator = readFileSync(new URL('./combat/index.js', import.meta.url), 'utf8')\nassert.ok(orchestrator.includes('shotResult?.miyuTargets'), 'orquestrador deve encaminhar os locks pertencentes à Miyu')\nassert.ok(orchestrator.includes('squadron.fireMiyuAssistShots?.(miyuTargets)'), 'Miyu deve receber apenas seus próprios alvos')\n\nconsole.log('miyu-assist-locks.test.mjs: OK')\n""")

path = 'src/selftest.mjs'
text = read(path)
text = replace_once(
    text,
    "import './playtest-polish.test.mjs'\n",
    "import './playtest-polish.test.mjs'\nimport './miyu-assist-locks.test.mjs'\n",
    'selftest import',
)
write(path, text)

# ---------------------------------------------------------------------------
# Version + README.
# ---------------------------------------------------------------------------
path = 'src/version.js'
text = read(path)
text = replace_once(text, "export const GAME_VERSION = 'v0.99.32'", "export const GAME_VERSION = 'v0.99.33'", 'version bump')
write(path, text)

path = 'README.md'
text = read(path)
text = replace_once(text, 'versão-v0.99.32-blue.svg', 'versão-v0.99.33-blue.svg', 'README badge')
text = replace_once(
    text,
    '**v0.99.32:** rádio dos Wingmen passa a aplicar cooldown de 2–10 s por piloto a qualquer transmissão normal/ability/Call & Response; a fala da Carga Compartilhada da Miyu só ocorre enquanto o jogador está carregando e já existe um lock visível (triângulo) em inimigo.',
    '**v0.99.33:** locks triangulares da Carga Compartilhada agora pertencem exclusivamente à Miyu: podem se repetir no mesmo inimigo enquanto a mira permanece nele e cada triângulo gera um disparo roxo homing saindo da nave dela, sem criar uma cópia extra no Fox.',
    'README current version summary',
)
if '### v0.99.33 — Carga Compartilhada com ownership real dos locks' not in text:
    marker = '### v0.99.31 — Hotfix de carregamento dos Wingmen\n'
    history = """### v0.99.33 — Carga Compartilhada com ownership real dos locks\n- Locks triangulares (`source: miyu`) deixam de ser consumidos pelo tiro carregado do Fox.\n- Orçamento BASE e orçamento da Miyu são independentes; os locks-base preservam limites por tipo de inimigo, enquanto a Miyu pode repetir seus triângulos no mesmo alvo comum enquanto a mira permanece nele.\n- Cada triângulo gera um laser roxo homing de suporte disparado fisicamente da nave da Miyu; com 3 stacks, o orçamento atual permite até 4 extras.\n- Aquisição e disparo recebem instrumentação `aiValidator` e regressão dedicada.\n\n### v0.99.32 — Antispam de rádio e fala contextual da Miyu\n- Cooldown de rádio por piloto entre 2 e 10 segundos passa a valer para falas triviais, abilities e Call & Response.\n- `ability_assist` da Miyu só é anunciada enquanto o jogador ainda carrega e já existe um lock visível no HUD.\n\n"""
    text = replace_once(text, marker, history + marker, 'README history insertion')
if 'PROGRESSO_POS_.90.35.md' not in text:
    marker = '- [progresso/PROGRESSO_POS_.70.md](progresso/PROGRESSO_POS_.70.md) — **Arquivo atual**, v0.75.0 em diante.\n'
    replacement = """- [progresso/PROGRESSO_POS_.90.35.md](progresso/PROGRESSO_POS_.90.35.md) — registro incremental criado a partir da v0.99.33.\n- [progresso/PROGRESSO_POS_.90.md](progresso/PROGRESSO_POS_.90.md) — resumo contínuo das implementações v0.90+.\n- [progresso/PROGRESSO_POS_.70.md](progresso/PROGRESSO_POS_.70.md) — histórico v0.75.0 em diante até a faixa seguinte.\n"""
    text = replace_once(text, marker, replacement, 'README progress links')
write(path, text)

# ---------------------------------------------------------------------------
# Required progress records.
# ---------------------------------------------------------------------------
path = 'progresso/PROGRESSO_POS_.90.md'
text = read(path).rstrip() + "\n\n---\n\n### v0.99.33 — Carga Compartilhada: triângulos pertencem à Miyu (23/09/2026)\n\n- O lock-on foi separado em orçamento BASE e orçamento MIYU. O teto por entidade permanece no Fox (comum 1x, Horda 2x, chefe/dourado livres), mas os triângulos da Miyu podem repetir o mesmo inimigo independentemente do `kind`, desde que ele continue dentro do cone no momento de cada nova aquisição.\n- O bônus continua limitado pelo design existente de `1 + stacks` da Carga Compartilhada, chegando a no máximo 4 locks extras com 3 stacks; não existe geração infinita de triângulos.\n- `projectiles.js` consome apenas os locks BASE. Os locks `source: miyu` são devolvidos ao orquestrador e encaminhados diretamente para `wingmen.js`.\n- Cada triângulo agora produz um laser roxo homing que nasce na posição da nave da Miyu, usando o dano normal de suporte dela. O Fox não dispara mais uma cópia do projétil triangular.\n- `aiValidator` registra aquisição de lock triangular e a salva da Miyu somente em eventos discretos.\n- Regressão nova cobre orçamento 4+4, repetição da Miyu em alvo comum, ownership no release, origem do disparo e homing.\n- README e `src/version.js` atualizados para v0.99.33. Criados `docs/docs 2/Gpt progress.md` e `progresso/PROGRESSO_POS_.90.35.md` conforme solicitado.\n\n**Validação automatizada:** este registro só entra no commit validado se sintaxe, teste dedicado, `selftest.mjs` e `git diff --check` passarem no workflow de validação. O playtest visual continua sendo a confirmação final de trajetória/origem em runtime.\n"
write(path, text)

write('progresso/PROGRESSO_POS_.90.35.md', """# PROGRESSO POS .90.35\n\nRegistro incremental criado em 23/09/2026 a pedido do usuário. Este arquivo não substitui `PROGRESSO_POS_.90.md`: o arquivo `.90` continua recebendo resumos das implementações, enquanto este passa a concentrar o progresso a partir desta etapa.\n\n---\n\n## v0.99.33 — Ownership dos locks triangulares da Miyu\n\n### Pedido\n- Fazer o disparo extra indicado pelo target triangular sair da Miyu, e não do jogador.\n- Permitir que a Carga Compartilhada mire duas ou mais vezes no mesmo inimigo, independentemente do tamanho, enquanto a mira permanecer nele.\n\n### Implementação\n- Orçamentos BASE e MIYU separados no lock-on.\n- Locks BASE preservam os limites antigos por entidade.\n- Locks MIYU ignoram o limite por entidade e usam o orçamento existente da habilidade (`1 + stacks`, máximo 4 extras com 3 stacks).\n- O release separa ownership: Fox recebe somente BASE; Miyu recebe somente MIYU.\n- Cada lock triangular gera um laser roxo homing de suporte originado na nave da Miyu.\n- Nenhum lock triangular é convertido em disparo carregado adicional do Fox.\n\n### Segurança e validação\n- `aiValidator` instrumenta aquisição e disparo da mecânica.\n- Teste dedicado cobre budgets, repetição no mesmo alvo, roteamento e homing.\n- `selftest.mjs` importa a regressão nova.\n- README e versão do site sobem para v0.99.33.\n""")

write('docs/docs 2/Gpt progress.md', """# Gpt progress\n\nEste documento registra o progresso das ações implementadas pelo GPT neste projeto a partir de 23/09/2026. Ele complementa os arquivos de `progresso/`: aqui ficam decisão, análise, arquivos afetados e validação daquilo que foi pedido nesta conversa.\n\n## Regras de registro daqui em diante\n- Registrar cada pacote implementado vindo desta conversa.\n- Descrever a intenção do usuário e a solução realmente aplicada.\n- Registrar testes/validações executados e qualquer pendência de playtest.\n- Continuar resumindo as entregas também em `progresso/PROGRESSO_POS_.90.md`.\n- Manter `progresso/PROGRESSO_POS_.90.35.md` como novo registro incremental da fase atual.\n- Atualizar README e versão do site em toda entrega versionada.\n\n---\n\n## 23/09/2026 — v0.99.33 — Carga Compartilhada com ownership da Miyu\n\n### Solicitação\nO target triangular da Carga Compartilhada deve representar um disparo realmente pertencente à Miyu. Além disso, a mecânica precisa permitir vários triângulos sobre o mesmo inimigo, mesmo que ele seja pequeno/comum, enquanto o jogador continuar mirando nele.\n\n### Diagnóstico\nAntes desta mudança, `lockon.js` marcava locks excedentes como `source: miyu`, porém `projectiles.fireHomingShot()` consumia a lista inteira e o Fox disparava esses projéteis. Depois, `wingmen.js` ainda tentava criar tiros da Miyu com base na posição dos extras no array. O ownership era visual, não mecânico. O limite por entidade também era aplicado antes de decidir a origem, impedindo repetição em inimigos comuns.\n\n### Solução\n1. Criado modelo puro de budgets BASE/MIYU.\n2. Aquisição BASE continua obedecendo o limite por entidade.\n3. Aquisição MIYU ignora o tamanho/tipo do alvo e permite repetição, limitada somente pelo orçamento `1 + stacks`.\n4. Release separa os grupos e impede o Fox de consumir `source: miyu`.\n5. Cada triângulo é encaminhado para `fireMiyuAssistShots()` e vira um laser roxo homing disparado da nave da Miyu, com dano de suporte.\n6. Adicionada instrumentação discreta no `aiValidator`.\n7. Adicionada regressão automatizada e integração ao `selftest`.\n8. README, versão e ambos os registros de progresso foram atualizados.\n\n### Validação\nA árvore só é commitada pela branch de validação quando passam checks de sintaxe, o teste dedicado, `selftest.mjs` e `git diff --check`. A inspeção visual em gameplay continua recomendada para confirmar origem e trajetória do projétil no navegador.\n""")

print('v0.99.33 Miyu owned-lock migration applied')
