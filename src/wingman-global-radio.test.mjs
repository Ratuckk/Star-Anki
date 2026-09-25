import assert from 'node:assert/strict'
import {
  createWingmanRadio,
  SQUAD_TRIVIAL_GAP_MS,
  TRIVIAL_TRANSMISSION_ESTIMATED_MS,
  EVENT_CATEGORY_DEDUP_WINDOW_MS,
  getEventCategory,
  ABILITY_EVENT_IDS,
} from './combat/wingman-radio.js'

console.log('--- TEST: Rate Limit Global do Rádio do Esquadrão ---')

// 1. Simulação com 4 pilotos disparando eventos triviais em paralelo
{
  const radio = createWingmanRadio({
    random: () => 0,
    enforceSquadSilence: true,
    squadSilenceGapMs: SQUAD_TRIVIAL_GAP_MS,
  })

  // Piloto 0 (Falco) fala aos 1000ms
  const line0 = radio.trySpeak(0, 'engage_dogfight', 1000, { activePilotIds: [0, 1, 2, 3] })
  assert.ok(typeof line0 === 'string' && line0.length > 0, 'Primeira fala trivial de Falco deve ser emitida')

  // Janela estimada da fala = 2800ms (1000 a 3800ms) + 6000ms de silêncio obrigatório = até 9800ms
  const expectedSilenceUntil = 1000 + TRIVIAL_TRANSMISSION_ESTIMATED_MS + SQUAD_TRIVIAL_GAP_MS
  assert.equal(radio.getSquadTrivialSilenceUntil(), expectedSilenceUntil, 'squadTrivialSilenceUntil deve ser 9800ms')

  // Outros pilotos tentando falar durante a transmissão e durante o silêncio da HUD
  const timestamps = [1100, 1500, 2000, 3000, 4500, 6000, 7500, 9000, 9799]
  for (const t of timestamps) {
    // Alterna pilotos 1 (Peppy), 2 (Slippy), 3 (Miyu)
    const pilotId = 1 + (t % 3)
    const blockedLine = radio.trySpeak(pilotId, 'kill', t, { activePilotIds: [0, 1, 2, 3] })
    assert.strictEqual(
      blockedLine,
      null,
      `Fala trivial do piloto ${pilotId} no tempo ${t}ms DEVE ser bloqueada pelo silêncio global do esquadrão`,
    )
  }

  // Aos 9801ms (após o término da transmissão + gap de 6s de silêncio), Peppy pode falar um evento de categoria diferente
  const line1 = radio.trySpeak(1, 'kill', 9850, { activePilotIds: [0, 1, 2, 3] })
  assert.ok(
    typeof line1 === 'string' && line1.length > 0,
    'Após o silêncio global de 6s pós-término, outro piloto pode falar evento válido',
  )
}

// 2. Deduplicação de categoria de transição rápida (engage, return_formation, state, tactical)
{
  const radio = createWingmanRadio({
    random: () => 0,
    enforceSquadSilence: true,
    squadSilenceGapMs: 1000, // Gap menor para testar especificamente o dedup de categoria
    categoryDedupWindowMs: EVENT_CATEGORY_DEDUP_WINDOW_MS, // 8000ms
  })

  // Falco engaja em dogfight aos 1000ms (categoria: 'engage')
  const falcoEngage = radio.trySpeak(0, 'engage_dogfight', 1000, { activePilotIds: [0, 1, 2, 3] })
  assert.ok(falcoEngage, 'Falco engaja aos 1000ms')

  // Peppy tenta engage_focus aos 5000ms (já passou o squad gap de 1000ms, mas NÃO os 8000ms de categoria 'engage')
  const peppyEngageBlocked = radio.trySpeak(1, 'engage_focus', 5000, { activePilotIds: [0, 1, 2, 3] })
  assert.strictEqual(
    peppyEngageBlocked,
    null,
    'Transição engage repetida em menos de 8s pelo esquadrão deve ser suprimida',
  )

  // Mas um evento de categoria diferente (ex: 'kill') aos 5000ms é permitido
  const peppyKill = radio.trySpeak(1, 'kill', 5000, { activePilotIds: [0, 1, 2, 3] })
  assert.ok(peppyKill, 'Evento de categoria diferente ("kill") aos 5000ms é permitido')
}

// 3. Habilidade nunca usa rádio (Fase 1.1) e Trivial respeita silêncio
{
  const radio = createWingmanRadio({
    random: () => 0,
    enforceSquadSilence: true,
    squadSilenceGapMs: SQUAD_TRIVIAL_GAP_MS,
  })

  // Trivial aos 1000ms
  const line0 = radio.trySpeak(0, 'engage_dogfight', 1000, { activePilotIds: [0, 1, 2, 3] })
  assert.ok(line0, 'Primeira fala trivial emitida')

  // Habilidade aos 2000ms: NUNCA usa rádio (retorna null)
  const abilityLine = radio.speakAbility(1, 'ability_guard', 2000, { activePilotIds: [0, 1, 2, 3] })
  assert.strictEqual(abilityLine, null, 'Habilidade nunca emite fala de rádio')

  // Fala trivial durante a janela de silêncio DEVE continuar bloqueada
  const trivialBlockedAfterAbility = radio.trySpeak(2, 'boost_used', 3000, { activePilotIds: [0, 1, 2, 3] })
  assert.strictEqual(trivialBlockedAfterAbility, null, 'Trivial durante a janela de silêncio global é bloqueada')
}

// 4. Call & Response respeita o orçamento global de silêncio
{
  const radio = createWingmanRadio({
    random: () => 0,
    enforceSquadSilence: true,
    squadSilenceGapMs: SQUAD_TRIVIAL_GAP_MS,
  })

  // Falco engaja aos 1000ms
  radio.trySpeak(0, 'engage_dogfight', 1000, { activePilotIds: [0, 1, 2, 3] })

  // Resposta Call & Response vence após o silêncio global
  const reply = radio.takeDueResponse(10000, [0, 1, 2, 3])
  if (reply) {
    assert.ok(reply.text, 'Resposta Call & Response entregue após janela global')
    // O silêncio global foi estendido para garantir pausa após a resposta:
    const silenceAfterReply = radio.getSquadTrivialSilenceUntil()
    assert.ok(
      silenceAfterReply >= 10000 + TRIVIAL_TRANSMISSION_ESTIMATED_MS + SQUAD_TRIVIAL_GAP_MS,
      'Silêncio global estendido após resposta Call & Response',
    )

    // Trivial durante a janela pós-resposta DEVE ser bloqueada
    const trivialAfterReply = radio.trySpeak(3, 'kill', 11000, { activePilotIds: [0, 1, 2, 3] })
    assert.strictEqual(trivialAfterReply, null, 'Trivial logo após resposta de Call & Response é bloqueada')
  }
}

// 5. Teste determinístico de simulação pesada de combate (Fuzz de eventos simultâneos)
{
  const radio = createWingmanRadio({
    random: () => 0.5,
    enforceSquadSilence: true,
    squadSilenceGapMs: 6000,
  })

  const emittedTrivials = []
  const emittedAbilities = []
  const activePilots = [0, 1, 2, 3]
  const trivialEvents = ['engage_dogfight', 'kill', 'boost_used', 'return_formation', 'charged_shot_used']

  // Simula 60 segundos de combate com rajadas a cada 100ms de múltiplos pilotos
  for (let t = 0; t <= 60000; t += 100) {
    // A cada segundo, 2 pilotos geram eventos triviais aleatórios
    for (const p of [0, 1, 2, 3]) {
      const evt = trivialEvents[(p + Math.floor(t / 1000)) % trivialEvents.length]
      const text = radio.trySpeak(p, evt, t, { activePilotIds: activePilots })
      if (text) {
        emittedTrivials.push({ pilotId: p, eventId: evt, time: t, text })
      }
    }
    // Aos 20s e 40s há uma habilidade
    if (t === 20000) {
      const text = radio.speakAbility(0, 'ability_ram', t, { activePilotIds: activePilots })
      if (text) emittedAbilities.push({ pilotId: 0, time: t, text })
    }
    if (t === 40000) {
      const text = radio.speakAbility(1, 'ability_guard', t, { activePilotIds: activePilots })
      if (text) emittedAbilities.push({ pilotId: 1, time: t, text })
    }
  }

  console.log(`Simulação de 60s: ${emittedTrivials.length} falas triviais emitidas, ${emittedAbilities.length} abilities.`)

  // Critério: em 60s com silêncio de ~8.8s (2.8s transmissão + 6.0s silêncio),
  // não pode haver mais de 60 / 8.8 ≈ 7 falas triviais no total!
  assert.ok(
    emittedTrivials.length <= 8,
    `Spam agregado prevenido: esperado <= 8 falas triviais em 60s, emitidas: ${emittedTrivials.length}`,
  )

  // Critério: nenhum par consecutivo de falas triviais pode ter intervalo menor que 8800ms
  for (let i = 1; i < emittedTrivials.length; i++) {
    const prev = emittedTrivials[i - 1]
    const curr = emittedTrivials[i]
    const interval = curr.time - prev.time
    assert.ok(
      interval >= TRIVIAL_TRANSMISSION_ESTIMATED_MS + SQUAD_TRIVIAL_GAP_MS,
      `Intervalo entre fala ${i - 1} (${prev.time}ms) e fala ${i} (${curr.time}ms) foi ${interval}ms, menor que 8800ms!`,
    )
  }

  // Critério: as abilities NUNCA usam rádio
  assert.equal(emittedAbilities.length, 0, 'Zero abilities emitidas pelo rádio')
}

console.log('wingman-global-radio.test.mjs: OK (Todos os critérios de rate limit global passaram)')
