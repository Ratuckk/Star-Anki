// Dispatcher ÚNICO das transmissões de rádio dos wingmen (CLAUDE.md §10 / §34.1).
//
// Todo produtor de fala do esquadrão passa por aqui; `wingmen.js` NÃO tem acesso a `getLine`,
// `markSpoken` nem à fila de mensagens (essas APIs deixaram de existir/serem exportadas). Assim
// não há como contornar o scheduler: uma fala só nasce se `emit()` (gate global de 6 s, silêncio
// do esquadrão, dedupe por categoria, cooldown por piloto) aceitar.
//
// Contrato:
//  - habilidade nunca usa rádio (ABILITY_EVENT_IDS é recusado aqui e no scheduler);
//  - no máximo UMA mensagem pendente; ela só é entregue por take();
//  - urgente (`force`) ignora cooldown/dedupe do piloto, MAS NUNCA o gate global de 6 s; só
//    substitui a pendente depois de a emissão urgente ter sido realmente aceita;
//  - comando/status do jogador (Fox/FOCO) tem prioridade máxima: requestPlayerCommand (ver abaixo);
//  - a resposta de Call & Response também é entregue por aqui (takeReply), e só se não houver
//    pendente no mesmo instante.
import { ABILITY_EVENT_IDS } from './wingman-radio.js'
import { aiValidator } from '../ai-validator.js'

export function createRadioDispatcher({ radio, buildPayload, getActivePilotIds, now = () => performance.now() }) {
  let pending = null
  let lastAcceptedAt = -Infinity
  let lastCommand = null

  // profile: perfil do piloto; eventId: id do evento de fala; opts.force: urgente (retreat /
  // state_critical); opts.alone: fala única "sozinho"; opts.meta: campos extras do payload.
  // Devolve o payload aceito ou null (nada muda quando é recusado).
  function request(profile, eventId, { force = false, alone = false, meta = {} } = {}) {
    if (!profile) return null
    if (ABILITY_EVENT_IDS.has(eventId)) {
      aiValidator.expect('Rádio dos wingmen nunca recebe evento de habilidade', () => false, { pilotId: profile.id, eventId })
      return null
    }
    // Uma mensagem pendente implica gate armado há menos de um frame: uma nova só seria aceita
    // por urgência, e o gate global de 6 s também barra o urgente. Recusa cedo, sem efeito colateral.
    if (pending && !force) return null

    const t = now()
    const context = { activePilotIds: getActivePilotIds() }
    const text = alone
      ? radio.trySpeakAlone(profile.id, t)
      : force
        ? radio.forceSpeak(profile.id, eventId, t, context)
        : radio.trySpeak(profile.id, eventId, t, context)
    if (!text) return null // recusado (gate/cooldown/dedupe/sem linha): pendente INTACTA

    // aceito: só agora uma urgente pode substituir o que estava pendente
    if (pending) pending = null
    const gapMs = t - lastAcceptedAt
    aiValidator.expect(
      'Duas transmissões de rádio nunca ficam a menos de 6 s uma da outra',
      () => gapMs >= radio.getGlobalGapMs(),
      { eventId, pilotId: profile.id, gapMs, force },
    )
    lastAcceptedAt = t
    pending = buildPayload(profile, text, eventId, meta)
    return pending
  }

  // COMANDO/STATUS do jogador (Fox — FOCO ativado / FOCO pronto). Prioridade MÁXIMA (1º: comando,
  // 2º: urgente, 3º: chatter, 4º: Call & Response): substitui qualquer pendente e, no HUD, o painel
  // único interrompe o chatter em exibição (mesmo controlador, nunca dois painéis). Não passa pelo
  // gate de chatter nem consome cooldown de piloto; em compensação arma o gate global, então
  // chatter/urgente/resposta só saem >= 6 s depois e nunca apagam a fala do Fox.
  function requestPlayerCommand(speaker, eventId, text) {
    if (!speaker || !text) return null
    if (ABILITY_EVENT_IDS.has(eventId)) return null
    const t = now()
    // nunca duas transmissões do jogador coladas: mesma fala repetida em < 0,25 s é descartada
    if (lastCommand && lastCommand.eventId === eventId && t - lastCommand.at < 250) return null
    lastCommand = { eventId, at: t }
    radio.markPlayerTransmission(t)
    lastAcceptedAt = t
    pending = {
      pilotId: speaker.pilotId ?? null,
      speakerId: speaker.speakerId,
      speakerType: 'player',
      name: speaker.name,
      color: speaker.color,
      avatar: speaker.avatar,
      voiceCue: speaker.voiceCue,
      text,
      eventId,
      priority: 'command',
    }
    return pending
  }

  // Resposta de Call & Response vencida (o scheduler só a libera depois do gate global).
  function takeReply(eligibleResponderIds, buildReplyPayload) {
    if (pending) return null // nunca perde a resposta: só consulta quando o canal está livre
    const t = now()
    const reply = radio.takeDueResponse(t, eligibleResponderIds)
    if (!reply) return null
    const gapMs = t - lastAcceptedAt
    aiValidator.expect(
      'Resposta de Call & Response respeita o gate global de 6 s',
      () => gapMs >= radio.getGlobalGapMs(),
      { threadId: reply.threadId, gapMs },
    )
    lastAcceptedAt = t
    pending = buildReplyPayload(reply)
    return pending
  }

  function take() {
    const payload = pending
    pending = null
    return payload
  }

  // Piloto abatido/removido: descarta só a mensagem pendente DELE (não substitui nada por urgência).
  function cancelForPilot(pilotId) {
    if (pending && pending.pilotId === pilotId) pending = null
  }

  function clear() {
    pending = null
    lastAcceptedAt = -Infinity
    lastCommand = null
  }

  return { request, requestPlayerCommand, takeReply, take, cancelForPilot, clear, hasPending: () => pending !== null }
}
