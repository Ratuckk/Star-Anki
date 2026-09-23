import { readFileSync, writeFileSync } from 'node:fs'

function replaceOnce(path, before, after) {
  const source = readFileSync(path, 'utf8')
  const index = source.indexOf(before)
  if (index < 0) throw new Error(`Missing expected block in ${path}: ${before.slice(0, 80)}`)
  if (source.indexOf(before, index + before.length) >= 0) throw new Error(`Expected unique block in ${path}: ${before.slice(0, 80)}`)
  writeFileSync(path, source.slice(0, index) + after + source.slice(index + before.length))
}

function insertAfter(path, marker, addition) {
  const source = readFileSync(path, 'utf8')
  const index = source.indexOf(marker)
  if (index < 0) throw new Error(`Missing marker in ${path}: ${marker.slice(0, 80)}`)
  if (source.indexOf(marker, index + marker.length) >= 0) throw new Error(`Expected unique marker in ${path}: ${marker.slice(0, 80)}`)
  const end = index + marker.length
  writeFileSync(path, source.slice(0, end) + addition + source.slice(end))
}

// --- wingman-radio.js: cooldown universal por piloto (2-10s) ---
replaceOnce(
  'src/combat/wingman-radio.js',
  `export const GLOBAL_COOLDOWN_MIN_MS = 6000\nexport const GLOBAL_COOLDOWN_MAX_MS = 20000`,
  `export const RADIO_COOLDOWN_MIN_MS = 2000\nexport const RADIO_COOLDOWN_MAX_MS = 10000\n// Aliases preservados para compatibilidade com imports antigos.\nexport const GLOBAL_COOLDOWN_MIN_MS = RADIO_COOLDOWN_MIN_MS\nexport const GLOBAL_COOLDOWN_MAX_MS = RADIO_COOLDOWN_MAX_MS`,
)

replaceOnce(
  'src/combat/wingman-radio.js',
  `  function scheduleNextNormalLine(pilotId, now) {\n    nextAllowedAtByPilot.set(\n      pilotId,\n      now + GLOBAL_COOLDOWN_MIN_MS + random() * (GLOBAL_COOLDOWN_MAX_MS - GLOBAL_COOLDOWN_MIN_MS),\n    )\n  }\n\n  function emit(pilotId, eventId, now, context = {}, force = false, bypassCooldown = false) {\n    const isAbility = ABILITY_EVENT_IDS.has(eventId)\n    const nextAllowedAt = nextAllowedAtByPilot.get(pilotId) ?? -Infinity\n    if (!force && !bypassCooldown && !isAbility && now < nextAllowedAt) return null\n    const pool = LINES[pilotId]?.[eventId]\n    if (!pool || pool.length === 0) return null\n\n    const line = pick(random, pool)\n    if (!isAbility && !bypassCooldown) scheduleNextNormalLine(pilotId, now)\n\n    conversations.openFromEvent({\n      openerPilotId: pilotId,\n      triggerEventId: eventId,\n      now,\n      activePilotIds: context.activePilotIds || [],\n      force,\n    })\n    return line\n  }`,
  `  function scheduleNextLine(pilotId, now) {\n    nextAllowedAtByPilot.set(\n      pilotId,\n      now + RADIO_COOLDOWN_MIN_MS + random() * (RADIO_COOLDOWN_MAX_MS - RADIO_COOLDOWN_MIN_MS),\n    )\n  }\n\n  function canSpeak(pilotId, now) {\n    return now >= (nextAllowedAtByPilot.get(pilotId) ?? -Infinity)\n  }\n\n  function emit(pilotId, eventId, now, context = {}, force = false) {\n    if (!force && !canSpeak(pilotId, now)) return null\n    const pool = LINES[pilotId]?.[eventId]\n    if (!pool || pool.length === 0) return null\n\n    const line = pick(random, pool)\n    scheduleNextLine(pilotId, now)\n\n    conversations.openFromEvent({\n      openerPilotId: pilotId,\n      triggerEventId: eventId,\n      now,\n      activePilotIds: context.activePilotIds || [],\n      force,\n    })\n    return line\n  }`,
)

replaceOnce(
  'src/combat/wingman-radio.js',
  `    trySpeak(pilotId, eventId, now = performance.now(), context = {}) {\n      return emit(pilotId, eventId, now, context, false, false)\n    },\n    forceSpeak(pilotId, eventId, now = performance.now(), context = {}) {\n      return emit(pilotId, eventId, now, context, true, false)\n    },\n    speakAbility(pilotId, eventId, now = performance.now(), context = {}) {\n      if (!ABILITY_EVENT_IDS.has(eventId)) return null\n      return emit(pilotId, eventId, now, context, false, true)\n    },`,
  `    trySpeak(pilotId, eventId, now = performance.now(), context = {}) {\n      return emit(pilotId, eventId, now, context, false)\n    },\n    forceSpeak(pilotId, eventId, now = performance.now(), context = {}) {\n      // Urgências explícitas podem furar o bloqueio atual, mas reiniciam o cooldown.\n      return emit(pilotId, eventId, now, context, true)\n    },\n    speakAbility(pilotId, eventId, now = performance.now(), context = {}) {\n      if (!ABILITY_EVENT_IDS.has(eventId)) return null\n      return emit(pilotId, eventId, now, context, false)\n    },`,
)

replaceOnce(
  'src/combat/wingman-radio.js',
  `    getLine(pilotId, eventId) {\n      return pick(random, LINES[pilotId]?.[eventId])\n    },\n    takeDueResponse(now = performance.now(), eligibleResponderIds = []) {\n      return conversations.takeDueResponse(now, eligibleResponderIds)\n    },`,
  `    getLine(pilotId, eventId) {\n      return pick(random, LINES[pilotId]?.[eventId])\n    },\n    canSpeak(pilotId, now = performance.now()) {\n      return canSpeak(pilotId, now)\n    },\n    markSpoken(pilotId, now = performance.now()) {\n      scheduleNextLine(pilotId, now)\n    },\n    takeDueResponse(now = performance.now(), eligibleResponderIds = []) {\n      const cooldownEligible = eligibleResponderIds.filter((pilotId) => canSpeak(pilotId, now))\n      const reply = conversations.takeDueResponse(now, cooldownEligible)\n      if (reply) scheduleNextLine(reply.pilotId, now)\n      return reply\n    },`,
)

// Call & Response: cooldown temporário não cancela a thread; ela pode sair depois, antes do TTL.
replaceOnce(
  'src/combat/wingman-radio-callresponse.js',
  `    const index = pending.findIndex((thread) => now >= thread.dueAt)\n    if (index < 0) return null\n    const thread = pending[index]\n    if (!eligibleResponderIds.includes(thread.responderPilotId)) {\n      pending.splice(index, 1)\n      stats.canceled += 1\n      stats.lastCancelReason = 'responder-unavailable'\n      return null\n    }\n\n    pending.splice(index, 1)`,
  `    const index = pending.findIndex((thread) =>\n      now >= thread.dueAt && eligibleResponderIds.includes(thread.responderPilotId)\n    )\n    if (index < 0) return null\n    const thread = pending[index]\n\n    pending.splice(index, 1)`,
)

// --- wingmen.js: roteamento central pelo cooldown + Miyu fala apenas com lock visível ---
replaceOnce(
  'src/combat/wingmen.js',
  `  // Falas triviais/semânticas disparadas fora do loop ficam numa lista, não num único slot.\n  // Assim dois pilotos diferentes podem falar no mesmo frame e o HUD distribui cada payload\n  // diretamente no espaço permanente do respectivo personagem.\n  const pendingRadioMessages = []`,
  `  // Falas laterais acumuladas fora do loop. O rate limiter mora em wingman-radio.js e vale\n  // para trivial, abilities e Call & Response por piloto.\n  const pendingRadioMessages = []`,
)

replaceOnce(
  'src/combat/wingmen.js',
  `  function announceAbility(wingman, eventId) {\n    // A nave continua recebendo o pulso de 1,5 s, mas a TRANSMISSÃO volta ao rádio lateral.\n    worldRadio.triggerAbilityGlow(wingman.mesh, wingman.profile.accentColor, WINGMAN_ABILITY_GLOW_DURATION_S)\n    const text = wingmanRadio.speakAbility(\n      wingman.profile.id,\n      eventId,\n      performance.now(),\n      { activePilotIds: activeRadioPilotIds() },\n    )\n    aiValidator.expect(\n      'Habilidade de Wingman possui quote lateral e brilho de 1.5s',\n      () => typeof text === 'string' && text.length > 0 && WINGMAN_ABILITY_GLOW_DURATION_S === 1.5,\n      { pilotId: wingman.profile.id, eventId, glowDuration: WINGMAN_ABILITY_GLOW_DURATION_S },\n    )\n    if (text) pendingRadioMessages.push(buildRadioPayload(wingman.profile, text, eventId))\n    aiValidator.logMechanic('wingman-radio', 'ability-announced-lateral', {\n      pilotId: wingman.profile.id,\n      eventId,\n      glowDuration: WINGMAN_ABILITY_GLOW_DURATION_S,\n      hasQuote: !!text,\n    })\n    return text\n  }\n\n  function announceLateral(wingman, eventId) {\n    const text = wingmanRadio.getLine(wingman.profile.id, eventId)\n    if (!text) return null\n    pendingRadioMessages.push(buildRadioPayload(wingman.profile, text, eventId))\n    return text\n  }`,
  `  function triggerAbilityGlow(wingman) {\n    worldRadio.triggerAbilityGlow(wingman.mesh, wingman.profile.accentColor, WINGMAN_ABILITY_GLOW_DURATION_S)\n  }\n\n  function announceAbility(wingman, eventId, { triggerGlow = true } = {}) {\n    // O efeito visual pertence à habilidade e permanece imediato; a fala lateral respeita o\n    // cooldown universal do piloto.\n    if (triggerGlow) triggerAbilityGlow(wingman)\n    const text = wingmanRadio.speakAbility(\n      wingman.profile.id,\n      eventId,\n      performance.now(),\n      { activePilotIds: activeRadioPilotIds() },\n    )\n    if (text) {\n      aiValidator.expect(\n        'Habilidade de Wingman anunciada lateralmente preserva quote e brilho de 1.5s',\n        () => text.length > 0 && WINGMAN_ABILITY_GLOW_DURATION_S === 1.5,\n        { pilotId: wingman.profile.id, eventId, glowDuration: WINGMAN_ABILITY_GLOW_DURATION_S },\n      )\n      pendingRadioMessages.push(buildRadioPayload(wingman.profile, text, eventId))\n      aiValidator.logMechanic('wingman-radio', 'ability-announced-lateral', {\n        pilotId: wingman.profile.id, eventId, glowDuration: WINGMAN_ABILITY_GLOW_DURATION_S, hasQuote: true,\n      })\n    } else {\n      aiValidator.logMechanic('wingman-radio', 'ability-radio-suppressed-cooldown', {\n        pilotId: wingman.profile.id, eventId, glowDuration: WINGMAN_ABILITY_GLOW_DURATION_S,\n      })\n    }\n    return text\n  }\n\n  function announceLateral(wingman, eventId) {\n    const text = wingmanRadio.trySpeak(\n      wingman.profile.id,\n      eventId,\n      performance.now(),\n      { activePilotIds: activeRadioPilotIds() },\n    )\n    if (!text) return null\n    pendingRadioMessages.push(buildRadioPayload(wingman.profile, text, eventId))\n    return text\n  }`,
)

replaceOnce(
  'src/combat/wingmen.js',
  `      miyuCloakTimer: 0,\n      miyuMaterials: profile.id === 3 ? collectMaterials(mesh) : null,`,
  `      miyuCloakTimer: 0,\n      miyuAssistRadioPending: false,\n      miyuMaterials: profile.id === 3 ? collectMaterials(mesh) : null,`,
)

replaceOnce(
  'src/combat/wingmen.js',
  `    const boostActive = !!opts.boostActive\n    const homingCharging = !!opts.homingCharging\n    const shieldNotFull = !!opts.shieldNotFull`,
  `    const boostActive = !!opts.boostActive\n    const homingCharging = !!opts.homingCharging\n    const homingHasLockedTarget = !!opts.homingHasLockedTarget\n    const shieldNotFull = !!opts.shieldNotFull`,
)

replaceOnce(
  'src/combat/wingmen.js',
  `        const text = wingmanRadio.getLine(w.profile.id, eventId)\n        if (!text) continue\n        pendingRadioMessages.push(buildRadioPayload(w.profile, text, eventId, { focusResponse: true }))`,
  `        const text = wingmanRadio.getLine(w.profile.id, eventId)\n        if (!text) continue\n        // Focus explícito continua garantindo resposta de todos; depois de falar, cada piloto\n        // entra no mesmo cooldown 2-10s das demais transmissões.\n        wingmanRadio.markSpoken(w.profile.id, performance.now())\n        pendingRadioMessages.push(buildRadioPayload(w.profile, text, eventId, { focusResponse: true }))`,
)

replaceOnce(
  'src/combat/wingmen.js',
  `              telemetry.recordEvent(w.profile.name, 'ability', 'Miyu sincronizou Carga Compartilhada (+50% veloc. carga, +1 alvo)', { elapsed })\n              announceAbility(w, 'ability_assist')\n              triggerSoundCue(WINGMAN_SOUND_CUES.phantom_assist, { worldPos: w.mesh.position })`,
  `              telemetry.recordEvent(w.profile.name, 'ability', 'Miyu sincronizou Carga Compartilhada (+50% veloc. carga, +1 alvo)', { elapsed })\n              // A sincronização e o glow começam agora, mas a fala só pode sair quando o mesmo\n              // lock que desenha o triângulo já existir no HUD.\n              triggerAbilityGlow(w)\n              w.miyuAssistRadioPending = true\n              triggerSoundCue(WINGMAN_SOUND_CUES.phantom_assist, { worldPos: w.mesh.position })`,
)

replaceOnce(
  'src/combat/wingmen.js',
  `      const criticalFlash = w.hp <= WINGMAN_LOW_HP && Math.floor(elapsed * 7) % 2 === 0`,
  `      if (\n        w.profile.id === 3 &&\n        w.miyuAssistRadioPending &&\n        w.abilityActive &&\n        w.escortKind === 'assist' &&\n        homingCharging &&\n        homingHasLockedTarget\n      ) {\n        const announced = announceAbility(w, 'ability_assist', { triggerGlow: false })\n        if (announced) {\n          w.miyuAssistRadioPending = false\n          aiValidator.expect(\n            'Miyu só anuncia Carga Compartilhada com carga ativa e lock visível',\n            () => homingCharging && homingHasLockedTarget,\n            { pilotId: w.profile.id, homingCharging, homingHasLockedTarget },\n          )\n          aiValidator.logMechanic('miyu-assist-radio', 'lock-visible-announcement', {\n            pilotId: w.profile.id, homingCharging, homingHasLockedTarget,\n          })\n        }\n      }\n\n      const criticalFlash = w.hp <= WINGMAN_LOW_HP && Math.floor(elapsed * 7) % 2 === 0`,
)

replaceOnce(
  'src/combat/wingmen.js',
  `        } else if (w.escortKind === 'assist') {\n          if (!homingCharging || w.abilityTimer > ASSIST_MAX_S) {\n            telemetry.recordEvent(w.profile.name, 'ability', 'Carga Compartilhada de Miyu concluída, retornando à formação', { elapsed })\n            stateController.finishAction(w, {`,
  `        } else if (w.escortKind === 'assist') {\n          if (!homingCharging || w.abilityTimer > ASSIST_MAX_S) {\n            telemetry.recordEvent(w.profile.name, 'ability', 'Carga Compartilhada de Miyu concluída, retornando à formação', { elapsed })\n            w.miyuAssistRadioPending = false\n            stateController.finishAction(w, {`,
)

// --- lock visível: mesma fonte dos triângulos do HUD ---
replaceOnce(
  'src/game-loop.js',
  `    const events = combat.update(dt, playerPos, {\n      enemiesActive,`,
  `    const homingHasLockedTarget = isCharging && combat.getLockedEnemySnapshots().length > 0\n    const events = combat.update(dt, playerPos, {\n      enemiesActive,`,
)
replaceOnce(
  'src/game-loop.js',
  `      homingCharging: isCharging,\n      reactivity,`,
  `      homingCharging: isCharging,\n      homingHasLockedTarget,\n      reactivity,`,
)
replaceOnce(
  'src/combat/index.js',
  `        homingCharging: opts.homingCharging,\n        shieldNotFull:`,
  `        homingCharging: opts.homingCharging,\n        homingHasLockedTarget: opts.homingHasLockedTarget,\n        shieldNotFull:`,
)

// --- testes ---
replaceOnce(
  'src/wingman-radio-overhaul.test.mjs',
  `  ABILITY_EVENT_IDS,\n  NEW_TRIVIAL_QUOTES_PER_PILOT,`,
  `  ABILITY_EVENT_IDS,\n  NEW_TRIVIAL_QUOTES_PER_PILOT,\n  RADIO_COOLDOWN_MIN_MS,\n  RADIO_COOLDOWN_MAX_MS,`,
)
replaceOnce(
  'src/wingman-radio-overhaul.test.mjs',
  `const independent = createWingmanRadio({ random: () => 0 })\nassert.ok(independent.trySpeak(0, 'engage_dogfight', 0, { activePilotIds: [0, 1] }))\nassert.ok(independent.trySpeak(1, 'engage_dogfight', 0, { activePilotIds: [0, 1] }))\nassert.ok(independent.speakAbility(0, 'ability_ram', 1, { activePilotIds: [0, 1] }))\nassert.ok(ABILITY_EVENT_IDS.has('ability_focus_upgrade'))`,
  `assert.equal(RADIO_COOLDOWN_MIN_MS, 2000)\nassert.equal(RADIO_COOLDOWN_MAX_MS, 10000)\nconst independent = createWingmanRadio({ random: () => 0 })\nassert.ok(independent.trySpeak(0, 'engage_dogfight', 0, { activePilotIds: [0, 1] }))\nassert.ok(independent.trySpeak(1, 'engage_dogfight', 0, { activePilotIds: [0, 1] }))\nassert.equal(independent.speakAbility(0, 'ability_ram', 1999, { activePilotIds: [0, 1] }), null, 'ability respeita cooldown do piloto')\nassert.ok(independent.speakAbility(0, 'ability_ram', 2000, { activePilotIds: [0, 1] }))\nconst maxCooldown = createWingmanRadio({ random: () => 1 })\nassert.ok(maxCooldown.trySpeak(3, 'engage_dogfight', 0, { activePilotIds: [3] }))\nassert.equal(maxCooldown.speakAbility(3, 'ability_assist', 9999, { activePilotIds: [3] }), null)\nassert.ok(maxCooldown.speakAbility(3, 'ability_assist', 10000, { activePilotIds: [3] }))\nassert.ok(ABILITY_EVENT_IDS.has('ability_focus_upgrade'))`,
)

insertAfter(
  'src/wingman-radio-overhaul.test.mjs',
  `assert.ok(wingmen.includes('worldRadio.triggerAbilityGlow'), 'glow de ability permanece')`,
  `\nassert.ok(wingmen.includes('w.miyuAssistRadioPending = true'), 'Miyu deve adiar a fala do Assist até existir lock')\nassert.ok(wingmen.includes("announceAbility(w, 'ability_assist', { triggerGlow: false })"), 'fala do Assist deve acontecer apenas no gate de lock visível')\nassert.equal((wingmen.match(/announceAbility\\(w, 'ability_assist'/g) || []).length, 1, 'Assist não pode anunciar imediatamente na ativação')\nassert.ok(wingmen.includes('homingCharging &&\\n        homingHasLockedTarget'), 'gate da Miyu exige carga e lock visível')\nconst gameLoop = readFileSync(new URL('./game-loop.js', import.meta.url), 'utf8')\nassert.ok(gameLoop.includes('const homingHasLockedTarget = isCharging && combat.getLockedEnemySnapshots().length > 0'), 'triângulo e Miyu precisam compartilhar a fonte real de lock')\nconst combatIndex = readFileSync(new URL('./combat/index.js', import.meta.url), 'utf8')\nassert.ok(combatIndex.includes('homingHasLockedTarget: opts.homingHasLockedTarget'), 'lock visível precisa chegar ao sistema de Wingmen')`,
)

replaceOnce(
  'src/wingman-radio-callresponse.test.mjs',
  `assert.equal(unavailableRadio.takeDueResponse(CALL_RESPONSE_DELAY_MIN_MS, [0, 2]), null)\nassert.equal(unavailableRadio.getDebugSnapshot().stats.lastCancelReason, 'responder-unavailable')`,
  `assert.equal(unavailableRadio.takeDueResponse(CALL_RESPONSE_DELAY_MIN_MS, [0, 2]), null)\nassert.equal(unavailableRadio.getDebugSnapshot().pending.length, 1, 'cooldown/indisponibilidade temporária não cancela a resposta')\nassert.equal(unavailableRadio.getDebugSnapshot().stats.lastCancelReason, null)\nconst delayedReply = unavailableRadio.takeDueResponse(CALL_RESPONSE_DELAY_MIN_MS + 500, [0, 1, 2])\nassert.equal(delayedReply.pilotId, 1)`,
)

// --- versão / README / progresso ---
replaceOnce('src/version.js', `export const GAME_VERSION = 'v0.99.31'`, `export const GAME_VERSION = 'v0.99.32'`)
replaceOnce(
  'README.md',
  `[![Versão](https://img.shields.io/badge/versão-v0.99.31-blue.svg)](src/version.js)`,
  `[![Versão](https://img.shields.io/badge/versão-v0.99.32-blue.svg)](src/version.js)`,
)
insertAfter(
  'README.md',
  `🎮 **Jogue no navegador:** [https://ratuckk.github.io/Star-Anki/](https://ratuckk.github.io/Star-Anki/)`,
  `\n\n**v0.99.32:** rádio dos Wingmen passa a aplicar cooldown de 2–10 s por piloto a qualquer transmissão normal/ability/Call & Response; a fala da Carga Compartilhada da Miyu só ocorre enquanto o jogador está carregando e já existe um lock visível (triângulo) em inimigo.`,
)
insertAfter(
  'progresso/PROGRESSO_POS_.90.md',
  `## Histórico de Entregas pós-v0.90.0`,
  `\n\n### v0.99.32 — Antispam de rádio e gatilho contextual da Miyu\n\n- **Cooldown universal por piloto:** após uma transmissão, o mesmo aliado fica entre 2 e 10 segundos sem nova fala normal; abilities entram no mesmo rate limiter e urgências explícitas, quando forçadas, reiniciam a janela.\n- **Call & Response preservado:** uma resposta pronta não é descartada só porque o respondente ainda está em cooldown; permanece pendente até ficar elegível ou expirar pelo TTL narrativo existente.\n- **Focus preservado:** a confirmação explícita de todos os Wingmen continua garantida; cada resposta inicia o cooldown daquele piloto.\n- **Miyu / Carga Compartilhada:** a habilidade e o glow podem iniciar ao sincronizar a carga, mas a fala `ability_assist` só é emitida enquanto a carga continua ativa e `getLockedEnemySnapshots()` já contém pelo menos um alvo — exatamente a mesma fonte que desenha o triângulo de lock no HUD.\n- **Validação IA:** telemetria registra anúncio da Miyu condicionado a carga+lock e bloqueios de ability por cooldown.\n- **Documentação/versão:** README e versão do site atualizados para v0.99.32.\n`,
)

console.log('v0.99.32 migration applied')
