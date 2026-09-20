// Rádio dos aliados (Overhaul de Personalidade, Ideia 3 — Docs/# Overhaul de Personalidade e
// Vida.md §3). Dispatcher puramente lógico: não conhece o DOM, só decide QUAL frase (se alguma)
// deve aparecer, com um cooldown global pra não virar fadiga (§8.4 do doc, "no máximo 1 frase a
// cada 6s no geral"). O HUD (hud-game.js → showWingmanRadio/showWingmanRadioQueue) decide como
// isso aparece na tela — opção 3 dos 3 protótipos HTML: painel quadrado com glitch de entrada/
// saída + estática no retrato (ver Docs/Rádio dos Aliados — Opção B v2 (protótipo).html).
//
// Falas em inglês, catchphrases curtas no espírito de Star Fox 64 (pedido do usuário) — o jogo
// inteiro é em português, isso é homenagem direta à série, não inconsistência de idioma.
const GLOBAL_COOLDOWN_MS = 6000

// Estrutura: { [pilotId]: { [eventId]: [strings] } } — pilotId bate com WINGMAN_PROFILES[i].id
// (0 Falco, 1 Peppy, 2 Slippy, 3 Miyu — ver combat/wingmen.js).
const LINES = {
  0: { // Falco — Ás Interceptor: confiante, cascavel
    engage_dogfight: ["I'm on him, watch this!", 'You call that flying?'],
    engage_focus: ['On your mark!', "Say the word, I'm there!"],
    engage_boss: ['Now THIS is a real fight!', "Let's rattle 'em!"],
    engage_horda: ["Swarm's mine, don't crowd me!"],
    engage_fragata: ["That shield won't hold forever!"],
    ability_ram: ['Time to make my move!', 'Ramming speed!', "Outta my way!"],
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
    ability_guard: ["I'll cover you, Fox!", 'Standing by to defend!', 'Shields up!'],
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
    ability_repair: ['Got a little something for you!', 'Got you covered, buddy!', 'Field repair incoming!'],
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
    engage_dogfight: ['Target acquired.'],
    engage_focus: ['Moving to intercept.'],
    engage_boss: ['Priority target confirmed.', 'Engaging primary threat.'],
    engage_horda: ['Multiple contacts, staying sharp.'],
    engage_fragata: ['Scanning for a weak point.'],
    ability_assist: ['Syncing targeting array.', 'Systems synced.', 'Uplink stable.'],
    kill: ['Clean shot.'],
    boss_kill: ['Target eliminated.'],
    golden_kill: ['Precision strike, confirmed.'],
    boost_used: ['Boosting.'],
    charged_shot_used: ['Charge released.', 'Direct hit.'],
    player_take_damage: ['Steady, Fox.'],
    player_low_health: ["Stay sharp, I've got you."],
    return_formation: ['Regrouping.'],
    alone: ['...Just me and the silence now.'],
    focus_ready: ['Awaiting your mark.'],
  },
}

export function createWingmanRadio() {
  let lastSpokenAt = -Infinity
  let hasSaidAlone = false

  function pick(pilotId, eventId, now) {
    if (now - lastSpokenAt < GLOBAL_COOLDOWN_MS) return null
    const pool = LINES[pilotId]?.[eventId]
    if (!pool || pool.length === 0) return null
    lastSpokenAt = now
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
      lastSpokenAt = -Infinity
      hasSaidAlone = false
    },
  }
}
