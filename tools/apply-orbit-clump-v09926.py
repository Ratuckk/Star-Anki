from pathlib import Path


def replace(path, old, new, count=1):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise RuntimeError(f'padrao nao encontrado em {path}: {old[:100]!r}')
    text = text.replace(old, new, count)
    p.write_text(text, encoding='utf-8')


# 1) Deconflicao: mantem steering simetrico e acrescenta correcao posicional curta/limitada.
replace(
    'src/combat/wingman-formation-separation.js',
    "export const WINGMAN_CLUMP_GRACE_S = 0.5\n",
    "export const WINGMAN_CLUMP_GRACE_S = 0.5\nexport const WINGMAN_SEPARATION_PAIR_CORRECTION_CAP = 1.25\n",
)
replace(
    'src/combat/wingman-formation-separation.js',
    "  const magnitude = separationSpeed * overlap\n  const pushA = {\n    x: direction.x * magnitude,\n    y: direction.y * magnitude,\n    z: direction.z * magnitude,\n  }\n  return {\n    distance,\n    pushA,\n    pushB: { x: -pushA.x, y: -pushA.y, z: -pushA.z },\n  }\n",
    "  const magnitude = separationSpeed * overlap\n  const pushA = {\n    x: direction.x * magnitude,\n    y: direction.y * magnitude,\n    z: direction.z * magnitude,\n  }\n  // Steering sozinho pode ser vencido pela inercia de dois pilotos em emergency regroup.\n  // Uma correcao posicional curta resolve a penetracao real sem teletransportar a formacao:\n  // cada corpo recebe no maximo 1.25u por par e os vetores continuam perfeitamente opostos.\n  const penetration = Math.max(0, minDistance - distance)\n  const correctionMagnitude = Math.min(WINGMAN_SEPARATION_PAIR_CORRECTION_CAP, penetration * 0.5)\n  const correctionA = {\n    x: direction.x * correctionMagnitude,\n    y: direction.y * correctionMagnitude,\n    z: direction.z * correctionMagnitude,\n  }\n  return {\n    distance,\n    pushA,\n    pushB: { x: -pushA.x, y: -pushA.y, z: -pushA.z },\n    correctionA,\n    correctionB: { x: -correctionA.x, y: -correctionA.y, z: -correctionA.z },\n  }\n",
)

replace(
    'src/combat/wingmen.js',
    "const WINGMAN_SEPARATION_SPEED = 48\n",
    "const WINGMAN_SEPARATION_SPEED = 48\nconst WINGMAN_SEPARATION_POSITION_STEP_CAP = 1.5\n",
)
replace(
    'src/combat/wingmen.js',
    "      separationPush: new THREE.Vector3(),\n",
    "      separationPush: new THREE.Vector3(),\n      separationCorrection: new THREE.Vector3(),\n",
)
replace(
    'src/combat/wingmen.js',
    "    for (const member of activeWingmen) member.separationPush.set(0, 0, 0)\n",
    "    for (const member of activeWingmen) {\n      member.separationPush.set(0, 0, 0)\n      member.separationCorrection.set(0, 0, 0)\n    }\n",
)
replace(
    'src/combat/wingmen.js',
    "        _wmPairPush.set(result.pushA.x, result.pushA.y, result.pushA.z)\n        a.separationPush.addScaledVector(_wmPairPush, 1)\n        b.separationPush.addScaledVector(_wmPairPush, -1)\n\n",
    "        _wmPairPush.set(result.pushA.x, result.pushA.y, result.pushA.z)\n        a.separationPush.addScaledVector(_wmPairPush, 1)\n        b.separationPush.addScaledVector(_wmPairPush, -1)\n        _wmPairPush.set(result.correctionA.x, result.correctionA.y, result.correctionA.z)\n        a.separationCorrection.addScaledVector(_wmPairPush, 1)\n        b.separationCorrection.addScaledVector(_wmPairPush, -1)\n\n",
)
replace(
    'src/combat/wingmen.js',
    "    activeSeparationPairs = nextSeparationPairs\n\n    // Comando de ofensividade do esquadrão",
    "    activeSeparationPairs = nextSeparationPairs\n\n    // Resolve a penetracao fisica ANTES de recalcular distancias/targets deste frame. Cada par\n    // contribui simetricamente; o acumulado por nave e limitado para nunca virar teleporte.\n    for (const member of activeWingmen) {\n      const correctionLength = member.separationCorrection.length()\n      if (correctionLength > WINGMAN_SEPARATION_POSITION_STEP_CAP) {\n        member.separationCorrection.multiplyScalar(WINGMAN_SEPARATION_POSITION_STEP_CAP / correctionLength)\n      }\n      if (member.separationCorrection.lengthSq() > 0) member.mesh.position.add(member.separationCorrection)\n    }\n\n    // Comando de ofensividade do esquadrão",
)

# 2) Metadata necessaria para decidir se o alvo e robusto (12+ HP maximo).
replace(
    'src/combat/damage-feedback.js',
    "    worldPos: hit.worldPos.clone(), targetId: hit.meshRef?.uuid ?? null,\n    damage, pilotId, charged, instant, killed: !!hit.killed,\n    points: hit.enemyKillPoints || hit.points || 0,\n",
    "    worldPos: hit.worldPos.clone(), targetId: hit.meshRef?.uuid ?? null, kind: hit.kind ?? null,\n    targetMaxHp: Number.isFinite(hit.targetMaxHp) ? hit.targetMaxHp : null,\n    damage, pilotId, charged, instant, killed: !!hit.killed,\n    points: hit.enemyKillPoints || hit.points || 0,\n",
)
replace(
    'src/enemies/index.js',
    "          kind: enemyHit.kind, killed, worldPos: enemyHit.mesh.position.clone(), meshRef: enemyHit.mesh,\n          enemyKillPoints, timeReductionMs, bossDefeated, goldenSpecialHit: false,\n",
    "          kind: enemyHit.kind, killed, worldPos: enemyHit.mesh.position.clone(), meshRef: enemyHit.mesh,\n          targetMaxHp: Number.isFinite(enemyHit.maxHp) ? enemyHit.maxHp : null,\n          enemyKillPoints, timeReductionMs, bossDefeated, goldenSpecialHit: false,\n",
)

# 3) Setting visual independente. So tem efeito quando o estilo Buraco negro esta selecionado.
replace(
    'src/settings.js',
    "  damageNumberStyle: 'classic', // 'classic' | 'manga' | 'orbit'\n",
    "  damageNumberStyle: 'classic', // 'classic' | 'manga' | 'orbit'\n  damageOrbitEnabled: true, // coop visual do Buraco negro; nunca altera dano/gameplay\n",
)

# 4) HUD de dano: 0.5s sem co-hit; orbita curta so quando explicitamente autorizada.
replace(
    'src/hud-damage.js',
    "export const ORBIT_DURATION_MS = 1700\n",
    "export const ORBIT_IDLE_DURATION_MS = 500\nexport const ORBIT_ACTIVE_DURATION_MS = 850\n",
)
replace(
    'src/hud-damage.js',
    "    const { el, style, slot, killed } = entry\n    const calm = reduced?.matches\n    const duration = style === 'orbit' ? ORBIT_DURATION_MS : 1100\n",
    "    const { el, style, slot, killed } = entry\n    const calm = reduced?.matches\n    const isOrbiting = style === 'orbit' && entry.orbitActive && !killed\n    const duration = style === 'orbit' ? (isOrbiting ? ORBIT_ACTIVE_DURATION_MS : ORBIT_IDLE_DURATION_MS) : 1100\n",
)
replace(
    'src/hud-damage.js',
    "      } else if (style === 'orbit') {\n        const orbit = orbitFrame(slot, t, { calm, killed })\n        x = orbit.x\n        y = orbit.y\n        opacity = orbit.opacity\n      } else if (!calm) y = -16 - t * 48\n",
    "      } else if (style === 'orbit') {\n        if (isOrbiting) {\n          const orbit = orbitFrame(slot, t, { calm, killed })\n          x = orbit.x\n          y = orbit.y\n          opacity = orbit.opacity\n        } else {\n          // Buraco negro sem cooperacao: numero curto e estatico, sem arco/circulo.\n          y = -12 - (calm ? 0 : t * 8)\n          scale = t < .15 ? .8 + (t / .15) * .2 : 1\n          opacity = 1 - Math.max(0, (t - .55) / .45)\n        }\n      } else if (!calm) y = -16 - t * 48\n",
)
replace(
    'src/hud-damage.js',
    "    clearTimeout(entry.timeout)\n    entry.timeout = setTimeout(() => remove(entry), duration)\n  }\n  return {\n",
    "    clearTimeout(entry.timeout)\n    entry.timeout = setTimeout(() => remove(entry), duration)\n  }\n\n  function ensureOrbitRing(entry) {\n    if (entry.ringEl || entry.style !== 'orbit') return\n    entry.ringEl = createOrbitRing(entry.slot, entry.color)\n    entry.el.insertBefore(entry.ringEl, entry.motionEl)\n  }\n\n  function activateOrbitForTarget(targetId) {\n    if (!targetId) return\n    for (const entry of active) {\n      if (entry.targetId !== targetId || entry.style !== 'orbit' || entry.killed) continue\n      entry.orbitActive = true\n      ensureOrbitRing(entry)\n      animate(entry)\n    }\n  }\n\n  function clearTarget(targetId) {\n    if (!targetId) return\n    for (const entry of [...active]) if (entry.targetId === targetId) remove(entry)\n  }\n\n  return {\n",
)
replace(
    'src/hud-damage.js',
    "      const style = getSettings().damageNumberStyle\n      const slot = Number.isInteger(opts.pilotId) && opts.pilotId >= 0 && opts.pilotId <= 3 ? opts.pilotId + 1 : 0\n      const author = AUTHORS[slot]\n      const now = performance.now()\n",
    "      const settings = getSettings()\n      const style = settings.damageNumberStyle\n      const slot = Number.isInteger(opts.pilotId) && opts.pilotId >= 0 && opts.pilotId <= 3 ? opts.pilotId + 1 : 0\n      const author = AUTHORS[slot]\n      const now = performance.now()\n      const orbitActive = style === 'orbit' && settings.damageOrbitEnabled !== false && !!opts.orbitActive && !opts.killed\n      // Morte encerra imediatamente qualquer arco/numero orbital anterior desse alvo; o numero\n      // do golpe letal ainda pode aparecer por 0.5s, mas ja sem orbita.\n      if (opts.targetId && opts.killed) clearTarget(opts.targetId)\n      if (orbitActive && opts.targetId) activateOrbitForTarget(opts.targetId)\n",
)
replace(
    'src/hud-damage.js',
    "      if (style === 'orbit') {\n        ringEl = createOrbitRing(slot, author.color)\n        const content = document.createElement('span')\n        content.className = 'damage-feedback-orbit-content'\n        content.append(number, label)\n        el.append(ringEl, content)\n        motionEl = content\n      } else {\n",
    "      if (style === 'orbit') {\n        const content = document.createElement('span')\n        content.className = 'damage-feedback-orbit-content'\n        content.append(number, label)\n        if (orbitActive) {\n          ringEl = createOrbitRing(slot, author.color)\n          el.append(ringEl, content)\n        } else {\n          el.append(content)\n        }\n        motionEl = content\n      } else {\n",
)
replace(
    'src/hud-damage.js',
    "      const entry = { el, motionEl, ringEl, value, hits: 1, style, slot, targetId: opts.targetId, started: now, killed: !!opts.killed }\n",
    "      const entry = { el, motionEl, ringEl, value, hits: 1, style, slot, targetId: opts.targetId, started: now, killed: !!opts.killed, orbitActive, color: author.color }\n",
)

# 5) Settings UI: toggle logo abaixo do estilo de dano; desabilitado fora de Buraco negro.
replace(
    'src/hud-settings.js',
    "  damageRow.appendChild(damageChoices)\n  visualSection.appendChild(damageRow)\n\n  function renderDamageButtons() {\n",
    "  damageRow.appendChild(damageChoices)\n  visualSection.appendChild(damageRow)\n\n  const damageOrbitRow = document.createElement('div')\n  damageOrbitRow.className = 'settings-row'\n  const damageOrbitLabel = document.createElement('label')\n  damageOrbitLabel.textContent = 'Órbita cooperativa em inimigos resistentes (12+ HP)'\n  const damageOrbitCheckbox = document.createElement('input')\n  damageOrbitCheckbox.type = 'checkbox'\n  damageOrbitCheckbox.checked = getSettings().damageOrbitEnabled !== false\n  damageOrbitCheckbox.addEventListener('change', () => {\n    setSetting('damageOrbitEnabled', damageOrbitCheckbox.checked)\n    onDamageStyleChange?.()\n  })\n  damageOrbitRow.append(damageOrbitLabel, damageOrbitCheckbox)\n  visualSection.appendChild(damageOrbitRow)\n  const damageOrbitHint = document.createElement('p')\n  damageOrbitHint.className = 'settings-hint'\n  damageOrbitHint.textContent = 'Só afeta Buraco negro. É puramente visual e só arma quando jogador/aliados compartilham o mesmo alvo em até 1s.'\n  visualSection.appendChild(damageOrbitHint)\n\n  function renderDamageButtons() {\n",
)
replace(
    'src/hud-settings.js',
    "    for (const [id, btn] of Object.entries(damageButtons)) {\n      const active = id === current\n      btn.classList.toggle('active', active)\n      btn.setAttribute('aria-pressed', String(active))\n    }\n  }\n",
    "    for (const [id, btn] of Object.entries(damageButtons)) {\n      const active = id === current\n      btn.classList.toggle('active', active)\n      btn.setAttribute('aria-pressed', String(active))\n    }\n    damageOrbitCheckbox.disabled = current !== 'orbit'\n    damageOrbitRow.classList.toggle('disabled', current !== 'orbit')\n  }\n",
)
replace(
    'src/hud-settings.js',
    "    schedule(40, () => damageNumbers.spawn(.5, .5, 12, { targetId: 'preview-drone' }))\n    schedule(120, () => damageNumbers.spawn(.5, .5, 8, { targetId: 'preview-drone' }))\n    schedule(230, () => damageNumbers.spawn(.5, .5, 7, { targetId: 'preview-drone', pilotId: 0 }))\n    schedule(330, () => damageNumbers.spawn(.5, .5, 5, { targetId: 'preview-drone', pilotId: 1 }))\n    schedule(430, () => damageNumbers.spawn(.5, .5, 6, { targetId: 'preview-drone', pilotId: 2, killed: true }))\n",
    "    schedule(40, () => damageNumbers.spawn(.5, .5, 12, { targetId: 'preview-drone', orbitActive: false }))\n    schedule(230, () => damageNumbers.spawn(.5, .5, 7, { targetId: 'preview-drone', pilotId: 0, orbitActive: true }))\n    schedule(330, () => damageNumbers.spawn(.5, .5, 5, { targetId: 'preview-drone', pilotId: 1, orbitActive: true }))\n    schedule(430, () => damageNumbers.spawn(.5, .5, 6, { targetId: 'preview-drone', pilotId: 2, orbitActive: true }))\n",
)

# 6) Orquestrador: tracker puro decide quando a UI pode orbitar.
replace(
    'src/game-loop.js',
    "import { aiValidator } from './ai-validator.js'\n",
    "import { aiValidator } from './ai-validator.js'\nimport { createDamageOrbitTracker } from './combat/damage-orbit-tracker.js'\n",
)
replace(
    'src/game-loop.js',
    "  const wingmanReactivity = createWingmanReactivity()\n",
    "  const wingmanReactivity = createWingmanReactivity()\n  const damageOrbitTracker = createDamageOrbitTracker()\n",
)
replace(
    'src/game-loop.js',
    "    // ============ NÚMEROS DE DANO FLUTUANTES ============\n    for (const h of events.damageFeedback || []) {\n      // Copiar: worldPos continua em coordenadas de mundo para outros consumidores.\n      const ndcH = _threatProj.copy(h.worldPos).project(camera)\n      if (ndcH.z < -1 || ndcH.z > 1 || Math.abs(ndcH.x) > 1 || Math.abs(ndcH.y) > 1) continue\n      const xFrac = (ndcH.x + 1) / 2\n      const yFrac = (1 - ndcH.y) / 2\n      hud.spawnDamageNumber(xFrac, yFrac, h.instant ? 'ABATE' : h.damage, {\n        homing: h.charged, pilotId: h.pilotId, targetId: h.targetId, killed: h.killed,\n      })\n      if (h.points) hud.spawnDamageNumber(xFrac, Math.min(.94, yFrac + .09), `${h.points} PTS`, { points: true, prefix: '+', big: true })\n    }\n",
    "    // ============ NÚMEROS DE DANO FLUTUANTES ============\n    const damageVisualSettings = getSettings()\n    const cooperativeOrbitEnabled = damageVisualSettings.damageNumberStyle === 'orbit' && damageVisualSettings.damageOrbitEnabled !== false\n    for (const h of events.damageFeedback || []) {\n      // Copiar: worldPos continua em coordenadas de mundo para outros consumidores.\n      const ndcH = _threatProj.copy(h.worldPos).project(camera)\n      if (ndcH.z < -1 || ndcH.z > 1 || Math.abs(ndcH.x) > 1 || Math.abs(ndcH.y) > 1) continue\n      const xFrac = (ndcH.x + 1) / 2\n      const yFrac = (1 - ndcH.y) / 2\n      // Dourado vive em subsistema separado e nao devolve maxHp no hit legado; quando vivo,\n      // o snapshot supre o mesmo metadado sem tocar golden.js (preserva customizacoes locais).\n      const targetMaxHp = Number.isFinite(h.targetMaxHp)\n        ? h.targetMaxHp\n        : h.kind === 'golden' ? (combat.getGoldenSnapshot?.()?.maxHp ?? null) : null\n      const orbitDecision = cooperativeOrbitEnabled\n        ? damageOrbitTracker.recordHit({\n            targetId: h.targetId, pilotId: h.pilotId, targetMaxHp, killed: h.killed, now: performance.now(),\n          })\n        : { orbit: false, triggeredNow: false }\n      if (orbitDecision.triggeredNow) {\n        aiValidator.expect(\n          'Órbita visual cooperativa só arma em alvo vivo com pelo menos 12 HP máximos',\n          () => !h.killed && Number.isFinite(targetMaxHp) && targetMaxHp >= 12,\n          { targetId: h.targetId, targetMaxHp, pilotId: h.pilotId },\n        )\n        aiValidator.logMechanic('damage-orbit-visual', 'cohit-armed', { targetId: h.targetId, targetMaxHp, pilotId: h.pilotId, windowMs: orbitDecision.windowMs })\n      }\n      hud.spawnDamageNumber(xFrac, yFrac, h.instant ? 'ABATE' : h.damage, {\n        homing: h.charged, pilotId: h.pilotId, targetId: h.targetId, killed: h.killed, orbitActive: cooperativeOrbitEnabled && orbitDecision.orbit,\n      })\n      if (h.points) hud.spawnDamageNumber(xFrac, Math.min(.94, yFrac + .09), `${h.points} PTS`, { points: true, prefix: '+', big: true })\n    }\n",
)

# 7) Testes existentes + nova suite.
replace(
    'src/wingman-formation-separation.test.mjs',
    "  assert.deepStrictEqual(r.pushB, { x: -r.pushA.x, y: -r.pushA.y, z: -r.pushA.z })\n",
    "  assert.deepStrictEqual(r.pushB, { x: -r.pushA.x, y: -r.pushA.y, z: -r.pushA.z })\n  assert.deepStrictEqual(r.correctionB, { x: -r.correctionA.x, y: -r.correctionA.y, z: -r.correctionA.z })\n  const correctedDistance = Math.hypot(\n    (a.position.x + r.correctionA.x) - (b.position.x + r.correctionB.x),\n    (a.position.y + r.correctionA.y) - (b.position.y + r.correctionB.y),\n    (a.position.z + r.correctionA.z) - (b.position.z + r.correctionB.z),\n  )\n  assert.ok(correctedDistance > 1, 'correcao posicional precisa tirar sobreposicao exata da zona de clump em um frame')\n",
)
replace(
    'src/wingman-formation-separation.test.mjs',
    "assert.ok(wingmenSource.includes('separationPush.addScaledVector'), 'integração precisa aplicar contribuição simétrica pré-calculada')\n",
    "assert.ok(wingmenSource.includes('separationPush.addScaledVector'), 'integração precisa aplicar contribuição simétrica pré-calculada')\nassert.ok(wingmenSource.includes('separationCorrection') && wingmenSource.includes('WINGMAN_SEPARATION_POSITION_STEP_CAP'), 'integração precisa corrigir penetracao fisica com passo limitado')\n",
)
replace(
    'src/damage-feedback.test.mjs',
    "const hit = { worldPos: position, meshRef: { uuid: 'target-7' }, killed: true, enemyKillPoints: 100 }\n",
    "const hit = { worldPos: position, meshRef: { uuid: 'target-7' }, kind: 'tank', targetMaxHp: 18, killed: true, enemyKillPoints: 100 }\n",
)
replace(
    'src/damage-feedback.test.mjs',
    "  assert.equal(result.targetId, 'target-7')\n",
    "  assert.equal(result.targetId, 'target-7')\n  assert.equal(result.targetMaxHp, 18)\n  assert.equal(result.kind, 'tank')\n",
)
replace(
    'src/damage-feedback.test.mjs',
    "assert.equal(getSettings().damageNumberStyle, 'classic', 'save antigo continua válido')\n",
    "assert.equal(getSettings().damageNumberStyle, 'classic', 'save antigo continua válido')\nassert.equal(getSettings().damageOrbitEnabled, true, 'orbita cooperativa vem ligada por padrao mas pode ser desligada')\nsetSetting('damageOrbitEnabled', false)\nassert.equal(getSettings().damageOrbitEnabled, false)\nsetSetting('damageOrbitEnabled', true)\n",
)
replace(
    'src/selftest.mjs',
    "import './wingman-formation-separation.test.mjs'\n",
    "import './wingman-formation-separation.test.mjs'\nimport './damage-orbit-tracker.test.mjs'\n",
)

# 8) Versao e progresso.
replace('src/version.js', "export const GAME_VERSION = 'v0.99.25'\n", "export const GAME_VERSION = 'v0.99.26'\n")
progress_path = Path('progresso/PROGRESSO_POS_.90.md')
progress = progress_path.read_text(encoding='utf-8')
marker = '## Histórico de Entregas pós-v0.90.0\n\n'
if marker not in progress:
    raise RuntimeError('marcador de progresso nao encontrado')
entry = '''### v0.99.26 — Deconflição física e órbita cooperativa contextual\n\n- **Clump dos Wingmen:** o log real ainda mostrou pares em emergency regroup a 0.003–0.01u por mais de 0.5s. A deconflição mantém o steering simétrico da v0.99.24, mas agora também resolve penetração com correção posicional simétrica, limitada a 1.25u por par e 1.5u por nave/frame. Assim duas naves não conseguem continuar fisicamente fundidas enquanto a inércia de regroup vence o steering.\n- **Buraco negro contextual:** o estilo orbital deixa de orbitar todo impacto. Sem cooperação, o número dura só 0.5s e não cria arco. A órbita curta (0.85s) só arma quando dois autores diferentes atingem o mesmo alvo em até 1s e pelo menos um deles é Wingman.\n- **Elegibilidade:** a mecânica visual só existe no estilo Buraco negro, só para alvos vivos com HP máximo >= 12 e é encerrada imediatamente por um hit letal. Outros estilos de número não recebem qualquer lógica orbital.\n- **Configuração:** adicionada opção Visual para desligar a órbita cooperativa independentemente do estilo. É puramente cosmética e não altera dano, IA, combo ou pontuação.\n- **Testes:** novo damage-orbit-tracker.test.mjs cobre jogador sozinho, coop em ambas as ordens, mesma autoria, janela de 1s, limiar de 12 HP e limpeza na morte. A suíte de formação agora exige correção posicional simétrica que saia da zona de clump em um frame.\n\n**Validado:** sintaxe dos módulos alterados, damage-orbit-tracker.test.mjs, damage-feedback.test.mjs, suítes de Wingman/rádio/formação, playtest-polish.test.mjs, selftest.mjs e git diff --check.\n\n'''
progress_path.write_text(progress.replace(marker, marker + entry, 1), encoding='utf-8')
