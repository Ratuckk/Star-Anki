// Falantes do rádio fixo inferior-central (HUD). O Fox é o JOGADOR: não é wingman, não tem pilotId
// (nada de pilotId=4 nem índice fantasma em WINGMAN_RADIO_AVATARS). Cada falante declara retrato e
// cue de voz; o painel do HUD só lê esses campos do payload.
export const FOX_SPEAKER = Object.freeze({
  speakerId: 'fox',
  speakerType: 'player',
  pilotId: null,
  name: 'Fox',
  color: '#38bdf8',
  avatar: 'assets/wingman-radio/fox.png',
  voiceCue: 'pilot_voice_fox',
})

// Fala do Fox por evento de comando (texto curto; sem ability, sem chatter de personalidade).
export const FOX_COMMAND_LINES = Object.freeze({
  focus_activated: ['Esquadrão, foco no alvo!', 'Todos os caças, atacar agora!', 'Foco total! Derrubem-no!'],
  focus_ready: ['Comando de foco pronto.', 'Foco disponível, esquadrão.', 'Canal de ataque liberado.'],
})
export const FOX_COMMAND_EVENT_IDS = Object.freeze(Object.keys(FOX_COMMAND_LINES))

// Retratos dos wingmen (mesma ordem de WINGMAN_PROFILES); reutilizados pelo badge de habilidade.
export const WINGMAN_PORTRAITS = Object.freeze([
  'assets/wingman-radio/falco.png',
  'assets/wingman-radio/peppy.png',
  'assets/wingman-radio/slippy.png',
  'assets/wingman-radio/miyu.png',
])
