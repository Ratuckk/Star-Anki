import { buildVisualSection, buildSensitivitySection, buildKeybindSection } from './hud-settings.js'

// Overhaul do menu de pausa (v0.80.0, pedido do usuário) — antes disso, pausar só mostrava um
// "Pausado" sem nenhum botão (ver .hud-pause em index.html, agora substituído). Não é uma tela
// top-level via showScreen() (ver hud-shared.js) — é um overlay que fica POR CIMA do jogo
// congelado, dentro do próprio `#game-screen`, mesmo padrão do `.card-choice-overlay` já
// existente (upgrade de carta). Isso é o que permite reaparecer exatamente onde a partida
// parou ao clicar "Continuar", sem remontar nada.
//
// As opções expostas aqui são um SUBCONJUNTO deliberado da tela de Configurações completa
// (reaproveita os mesmos 3 builders de seção que ela usa, ver hud-settings.js): só o que faz
// efeito imediato na partida em andamento (visual/sensibilidade/keybinds). Vida inicial e
// esquadrão inicial ficaram de fora de propósito — só valem pra PRÓXIMA partida, expor isso
// aqui enganaria o jogador achando que mudou algo na partida atual. Mapeamento de gamepad
// também ficou de fora (mantém o painel enxuto — pedido foi "opções básicas").
export function buildPauseOverlay(root) {
  const overlay = document.createElement('div')
  overlay.className = 'pause-overlay'
  overlay.hidden = true
  root.appendChild(overlay)

  const panel = document.createElement('div')
  panel.className = 'pause-panel'
  overlay.appendChild(panel)

  let handlers = { onResume: () => {}, onRestart: () => {}, onExitToMenu: () => {} }
  let keybindCleanup = null

  function clearKeybindCleanup() {
    if (keybindCleanup) keybindCleanup()
    keybindCleanup = null
  }

  function header(badge, title) {
    const wrap = document.createElement('div')
    wrap.className = 'pause-header'
    wrap.innerHTML = `
      <div class="card-choice-badge">${badge}</div>
      <h3 class="card-choice-title">${title}</h3>
    `
    return wrap
  }

  function renderMenu() {
    clearKeybindCleanup()
    panel.innerHTML = ''
    panel.appendChild(header('PARTIDA EM PAUSA', 'PAUSA'))

    const buttons = document.createElement('div')
    buttons.className = 'pause-menu-buttons'

    const resumeBtn = document.createElement('button')
    resumeBtn.textContent = '▶ Continuar'
    resumeBtn.addEventListener('click', () => handlers.onResume())
    buttons.appendChild(resumeBtn)

    const optionsBtn = document.createElement('button')
    optionsBtn.className = 'btn-secondary'
    optionsBtn.textContent = '⚙ Opções'
    optionsBtn.addEventListener('click', renderOptions)
    buttons.appendChild(optionsBtn)

    const restartBtn = document.createElement('button')
    restartBtn.className = 'btn-secondary'
    restartBtn.textContent = '↺ Reiniciar Partida'
    restartBtn.addEventListener('click', () => renderConfirm({
      text: 'Reiniciar a partida agora? Pontuação e progresso do setor atual serão perdidos — o mesmo baralho/config começa do zero.',
      confirmLabel: 'Sim, reiniciar',
      onConfirm: () => handlers.onRestart(),
    }))
    buttons.appendChild(restartBtn)

    const exitBtn = document.createElement('button')
    exitBtn.className = 'btn-secondary'
    exitBtn.textContent = '⏻ Sair para o Menu Principal'
    exitBtn.addEventListener('click', () => renderConfirm({
      text: 'Sair para o menu principal agora? Pontuação e progresso da partida atual serão perdidos.',
      confirmLabel: 'Sim, sair',
      onConfirm: () => handlers.onExitToMenu(),
    }))
    buttons.appendChild(exitBtn)

    panel.appendChild(buttons)
  }

  function renderOptions() {
    clearKeybindCleanup()
    panel.innerHTML = ''
    panel.appendChild(header('OPÇÕES BÁSICAS', 'OPÇÕES'))

    const back = document.createElement('button')
    back.className = 'back-link'
    back.textContent = '← Voltar'
    back.addEventListener('click', renderMenu)
    panel.appendChild(back)

    const scroll = document.createElement('div')
    scroll.className = 'pause-options-scroll'
    scroll.appendChild(buildVisualSection())
    scroll.appendChild(buildSensitivitySection())
    const { el: keybindEl, cleanup } = buildKeybindSection()
    keybindCleanup = cleanup
    scroll.appendChild(keybindEl)
    panel.appendChild(scroll)
  }

  function renderConfirm({ text, confirmLabel, onConfirm }) {
    clearKeybindCleanup()
    panel.innerHTML = ''
    panel.appendChild(header('CONFIRMAÇÃO NECESSÁRIA', 'TEM CERTEZA?'))

    const p = document.createElement('p')
    p.className = 'pause-confirm-text'
    p.textContent = text
    panel.appendChild(p)

    const buttons = document.createElement('div')
    buttons.className = 'pause-menu-buttons'

    const confirmBtn = document.createElement('button')
    confirmBtn.className = 'btn-danger'
    confirmBtn.textContent = confirmLabel
    confirmBtn.addEventListener('click', onConfirm)
    buttons.appendChild(confirmBtn)

    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'btn-secondary'
    cancelBtn.textContent = 'Cancelar'
    cancelBtn.addEventListener('click', renderMenu)
    buttons.appendChild(cancelBtn)

    panel.appendChild(buttons)
  }

  return {
    show() {
      overlay.hidden = false
      renderMenu()
    },
    hide() {
      overlay.hidden = true
      clearKeybindCleanup()
    },
    bind(h) {
      handlers = { ...handlers, ...h }
    },
  }
}
