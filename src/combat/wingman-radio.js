// Rádio dos aliados (Overhaul de Personalidade, Ideia 3 — Docs/# Overhaul de Personalidade e
// Vida.md §3). Dispatcher puramente lógico: não conhece o DOM, só decide QUAL frase (se alguma)
// deve aparecer, com um cooldown global pra não virar fadiga (§8.4 do doc, "no máximo 1 frase a
// cada 6s no geral"). O HUD (hud-game.js → showWingmanRadio/showWingmanRadioQueue) decide como
// isso aparece na tela — opção 3 dos 3 protótipos HTML: painel quadrado com glitch de entrada/
// saída + estática no retrato (ver Docs/Rádio dos Aliados — Opção B v2 (protótipo).html).
//
// Falas em inglês, catchphrases curtas no espírito de Star Fox 64 (pedido do usuário) — o jogo
// inteiro é em português, isso é homenagem direta à série, não inconsistência de idioma.

// ============ ORIGEM DO EVENTO — ABILITY vs. TRIVIAL (Docs/# Documento de Implementação) ============
// Todo eventId cai numa de duas categorias, que decidem em qual região do HUD a fala aparece
// (hud-game.js: painel superior = ability, inferior = trivial — nunca as duas ao mesmo tempo pro
// MESMO piloto). Um eventId de ability NUNCA dispara no painel trivial e vice-versa — garantido
// por construção (quem chama já sabe qual eventId está disparando, não há ambiguidade em runtime).
// Cinco eventos (ram/intercept/guard/repair/assist) já existem hoje; os demais pertencem a
// cartas ainda não implementadas (Peppy Rescue/Auxílio, Slippy Morale/Impulsão, Miyu Boombuster,
// foco com carta de upgrade) — cadastrados aqui de antemão pra já nascerem classificados certo
// quando cada fase de personagem os disparar pela primeira vez.
export const ABILITY_EVENT_IDS = new Set([
  'ability_ram', 'ability_intercept',
  'ability_guard', 'ability_rescue', 'ability_aux_shield',
  'ability_repair', 'ability_morale', 'ability_boost_dash',
  'ability_assist', 'ability_boombuster', 'ability_focus_upgrade',
])

// ============ COOLDOWN GLOBAL DO DISPATCHER ============
// Tempo mínimo entre DUAS falas quaisquer (global, não por piloto). Aleatório a cada disparo —
// evita cadência robótica. Antes era fixo em 6s; agora mínimo 6s, máximo 20s.
export const GLOBAL_COOLDOWN_MIN_MS = 6000
export const GLOBAL_COOLDOWN_MAX_MS = 20000

// Estrutura: { [pilotId]: { [eventId]: [strings] } } — pilotId bate com WINGMAN_PROFILES[i].id
// (0 Falco, 1 Peppy, 2 Slippy, 3 Miyu — ver combat/wingmen.js).
const LINES = {
  0: { // Falco — Ás Interceptor: confiante, cascavel
    engage_dogfight: ["I'm on him, watch this!", 'You call that flying?'],
    engage_focus: ['On your mark!', "Say the word, I'm there!"],
    engage_boss: ['Now THIS is a real fight!', "Let's rattle 'em!"],
    engage_horda: ["Swarm's mine, don't crowd me!"],
    engage_fragata: ["That shield won't hold forever!"],
    ability_ram: ['Time to make my move!', 'Ramming speed!', "Outta my way!", 'Locked on — here I come!', 'Brace for impact, hotshot!'],
    // Carta "Falco Intercept" (Docs/# Documento de Implementação — Nova.md, item 3) — Falco
    // abate um projétil pesado (powerLevel 3-4) antes que ele chegue no jogador.
    ability_intercept: ['Not on my watch!', 'I got your six, Fox!', "Yeah, I don't think so!", 'Ha! Too slow!', 'Denied!'],
    kill: ['Got him!', 'Too easy.'],
    boss_kill: ['Yeah! Take that, big guy!'],
    golden_kill: ['Special delivery — right in the face!'],
    boost_used: ['Punching it!', 'Eat my exhaust!'],
    charged_shot_used: ['Charged and fired!', 'Full power, baby!'],
    player_take_damage: ['Hey, watch it!'],
    player_low_health: ['Hang in there!'],
    return_formation: ['Falling back.'],
    alone: ["Guess it's just me now."],
    focus_ready: ['Locked and loaded!'],
  },
  1: { // Peppy — Defensor Blindado: firme, protetor
    engage_dogfight: ["I'll handle this one.", 'Standing my ground.'],
    engage_focus: ['Copy, moving in.'],
    engage_boss: ["This one's dangerous — stay sharp!", 'Focus fire, everyone!'],
    engage_horda: ["Careful, they're swarming!"],
    engage_fragata: ['Watch its blind spot!'],
    ability_guard: ["I'll cover you, Fox!", 'Standing by to defend!', 'Shields up!', 'Defense grid online!', 'Nothing gets through me!'],
    // As abilities futuras recebem o pool completo já na Etapa 1 do rádio. Assim, quando as
    // cartas nascerem, não há risco de o evento de ability ficar sem fala no painel superior.
    ability_rescue: ["Hang on, Fox — I'm coming in!", "I've got you, steady now.", 'Stay with me, Fox!', "You're not going down today.", 'Rescue run underway!'],
    ability_aux_shield: ['Shield wall deployed!', 'Stay behind me, Fox.', "I'll take the heat.", 'Barrier holding.', "I've got the incoming fire."],
    ability_focus_upgrade: ['Formation locked. Protecting the lead.', 'Auxiliary systems ready.', 'My shield is yours, Fox.', 'Command received. Defense first.', 'Cover pattern set.'],
    kill: ['Target down.'],
    boss_kill: ['Great shot, Fox!'],
    golden_kill: ['That was a clean hit!'],
    boost_used: ['Hang on tight!', "I'm right behind you!"],
    charged_shot_used: ['Nice charge shot!', "That'll leave a mark!"],
    player_take_damage: ['Fox, you alright?'],
    player_low_health: ['Do a barrel roll!'],
    return_formation: ['Fall back and regroup!'],
    alone: ['Keep your guard up out there.'],
    focus_ready: ['Standing by.'],
  },
  2: { // Slippy — Batedor Solar: nervoso mas dedicado
    engage_dogfight: ['Here goes nothing!'],
    engage_focus: ['O-okay, going in!'],
    engage_boss: ["Th-that thing's huge!!", 'Here we go, big one!'],
    engage_horda: ['So many of them!!'],
    engage_fragata: ['That armor looks tough...'],
    ability_repair: ['Got a little something for you!', 'Got you covered, buddy!', 'Field repair incoming!', 'Patch kit on the way!', "Don't worry, I can fix this!"],
    ability_morale: ['Everybody, hit harder!', 'Boosting the whole squad!', 'Morale boost is live!', "Let's turn this around!", 'Damage link optimized!'],
    ability_boost_dash: ["I'm boosting with you!", 'Turbo sync, go go go!', 'No one can touch us now!', 'Hold on, Fox!', 'Boost trail engaged!'],
    ability_focus_upgrade: ['Morale systems ready!', 'Everyone gets the boost!', 'Focus command received!', 'I can make every shot count!', 'Squad link charged!'],
    kill: ['Yeah! Got one!'],
    boss_kill: ['We actually did it!!'],
    golden_kill: ['Whoa, nice shot!'],
    boost_used: ['H-here we go!'],
    charged_shot_used: ['Whoa, full charge!', 'That was awesome!'],
    player_take_damage: ['Fox, look out!'],
    player_low_health: ['You okay out there?!'],
    return_formation: ['Heading back!'],
    alone: ["Where'd everyone go? Help me, Fox!"],
    focus_ready: ['R-ready when you are!'],
  },
  3: { // Miyu — Vanguarda Fantasma: cirúrgica, cool
    engage_dogfight: ['Target acquired.', 'Engaging with precision.', 'I have the angle.'],
    engage_focus: ['Moving to intercept.'],
    engage_boss: ['Priority target confirmed.', 'Engaging primary threat.'],
    engage_horda: ['Multiple contacts, staying sharp.'],
    engage_fragata: ['Scanning for a weak point.'],
    ability_assist: ['Syncing targeting array.', 'Systems synced.', 'Uplink stable.', 'Sharing target solution.', 'Additional locks available.'],
    ability_boombuster: ['Heavy charge pattern armed.', 'Multiple targets, one solution.', 'Boombuster volley released.', 'Charged ordnance away.', 'Saturation strike confirmed.'],
    kill: ['Clean shot.'],
    boss_kill: ['Target eliminated.'],
    golden_kill: ['Precision strike, confirmed.'],
    boost_used: ['Boosting.'],
    charged_shot_used: ['Charge released.', 'Direct hit.'],
    player_take_damage: ['Steady, Fox.'],
    player_low_health: ["Stay sharp, I've got you."],
    return_formation: ['Regrouping.'],
    alone: ['...Just me and the silence now.'],
    focus_ready: ['Awaiting your mark.', 'Command link ready.'],
  },
}

// Contagem usada pela validação automatizada do requisito de variedade do rádio. Mantém `LINES`
// privada para o dispatcher, mas permite confirmar que nenhuma expansão futura derrubou um piloto
// abaixo do mínimo de 30 falas preservadas.
export function getWingmanRadioLineCount(pilotId) {
  return Object.values(LINES[pilotId] || {}).reduce((total, pool) => total + pool.length, 0)
}

export function createWingmanRadio() {
  // Guarda o PRÓXIMO instante liberado (não o último em que alguém falou) — cada fala sorteia um
  // novo intervalo entre GLOBAL_COOLDOWN_MIN_MS e GLOBAL_COOLDOWN_MAX_MS, evitando cadência
  // robótica de cooldown fixo.
  let nextAllowedAt = -Infinity
  let hasSaidAlone = false

  function pick(pilotId, eventId, now) {
    if (now < nextAllowedAt) return null
    const pool = LINES[pilotId]?.[eventId]
    if (!pool || pool.length === 0) return null
    nextAllowedAt = now + GLOBAL_COOLDOWN_MIN_MS + Math.random() * (GLOBAL_COOLDOWN_MAX_MS - GLOBAL_COOLDOWN_MIN_MS)
    return pool[Math.floor(Math.random() * pool.length)]
  }

  return {
    // Chamado pelos pontos de disparo em wingmen.js. Retorna a string OU null (cooldown/sem fala
    // cadastrada pra esse par piloto+evento).
    trySpeak(pilotId, eventId, now = performance.now()) {
      return pick(pilotId, eventId, now)
    },
    // "alone" só pode disparar 1x por partida (§3.3 do doc) — o dispatcher guarda esse estado
    // porque é o único evento com essa regra especial; os demais só têm o cooldown global.
    trySpeakAlone(pilotId, now = performance.now()) {
      if (hasSaidAlone) return null
      const line = pick(pilotId, 'alone', now)
      if (line) hasSaidAlone = true
      return line
    },
    // Lookup SEM cooldown — usado só pela rajada de "prontidão" do comando de foco ([D]), onde os
    // até 4 pilotos precisam falar em sequência garantida (fila no HUD), não competindo pelo
    // cooldown global de 6s que existe pra evitar fadiga no uso normal.
    getLine(pilotId, eventId) {
      const pool = LINES[pilotId]?.[eventId]
      if (!pool || pool.length === 0) return null
      return pool[Math.floor(Math.random() * pool.length)]
    },
    reset() {
      nextAllowedAt = -Infinity
      hasSaidAlone = false
    },
  }
}
