// Suporte a mobile — pedido do usuário: "versão mobile funcional (pelo site) que também seja
// jogável com um joystick/gamepad/controle". Escopo confirmado com o usuário: SEM controles por
// toque pra jogar (a partida em si continua exclusiva de controle físico, igual já ficou pronto
// na entrega anterior de mapeamento genérico de gamepad) — o toque só precisa funcionar até a
// tela de Configurações, onde o jogador mapeia os botões do controle. Este arquivo cuida só de
// viabilizar jogar num celular: forçar/pedir modo paisagem, com um aviso bloqueando a tela de
// jogo enquanto o aparelho estiver na vertical.

let overlay = null

function ensureOverlay() {
  if (overlay) return overlay
  overlay = document.createElement('div')
  overlay.id = 'rotate-overlay'
  overlay.hidden = true
  overlay.innerHTML = '<div class="rotate-overlay-icon">⟳</div><p>Gire o celular para o modo paisagem para jogar</p>'
  document.body.appendChild(overlay)
  return overlay
}

// checado toda vez que uma tela troca (showScreen) OU a orientação/tamanho da janela muda —
// só bloqueia quando a tela de JOGO está de fato visível; os menus (pré-jogo, baralhos,
// configurações) continuam usáveis em retrato normalmente, é só a partida que exige paisagem
export function syncRotateOverlay() {
  const gameScreen = document.getElementById('game-screen')
  const gameVisible = gameScreen && !gameScreen.hidden
  const portrait = window.innerHeight > window.innerWidth
  ensureOverlay().hidden = !(gameVisible && portrait)
}

export function initMobileSupport() {
  ensureOverlay()
  window.addEventListener('resize', syncRotateOverlay)
  window.addEventListener('orientationchange', syncRotateOverlay)
  syncRotateOverlay()
}

// chamado ao montar uma partida (main.js) — tela cheia + travar em paisagem são best-effort:
// ambos falham silenciosamente onde o navegador não suporta (ex: iOS Safari não tem nenhum dos
// dois fora de um PWA instalado) — o overlay de "gire o celular" acima é o fallback que sempre
// funciona, independente de qualquer um desses dois terem pegado ou não
export async function requestGameOrientation() {
  syncRotateOverlay()
  try {
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen()
    }
  } catch {
    // bloqueado pelo navegador (sem gesto do usuário recente o bastante, ou sem suporte) — ok
  }
  try {
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('landscape')
    }
  } catch {
    // não suportado (iOS Safari, a maioria dos navegadores fora Android Chrome) — ok
  }
}

// chamado ao encerrar a partida (main.js, teardown) — libera o que tiver sido aplicado acima
export function releaseGameOrientation() {
  try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock() } catch { /* sem suporte, ok */ }
  try { if (document.fullscreenElement) document.exitFullscreen() } catch { /* sem suporte, ok */ }
}
