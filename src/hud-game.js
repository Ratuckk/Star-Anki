import { getBindings } from './keybindings.js'
import { DEBUG_ACTIONS, DEBUG_CATEGORY_ORDER } from './debug.js'
import { CARD_CATEGORY_LABEL, CARD_CATEGORY_COLOR, ROGUELIKE_CARDS } from './roguelike.js'
import { COLOR_MAP, shapeMarkup, showScreen } from './hud-shared.js'
import { buildPauseOverlay } from './hud-pause.js'
import { injectHudExtraStyles } from './hud-styles.js'
import { LOW_HEALTH_THRESHOLD_FRAC } from './main-constants.js'
import { getSettings } from './settings.js'

const CARD_MAP = new Map(ROGUELIKE_CARDS.map((c) => [c.id, c]))

// QoL #2: tamanho do marcador de lock-on escala com o hit radius (mundo) do alvo travado —
// menor inimigo do jogo (ímã, ~1.3u) até o chefe (~7.7u). Clamp em px pra nunca ficar
// minúsculo (mini-swarm) nem gigantesco a ponto de cobrir o HUD (chefe).
const LOCK_MARKER_RADIUS_MIN = 1.3
const LOCK_MARKER_RADIUS_MAX = 7.7
const LOCK_MARKER_PX_MIN = 22
const LOCK_MARKER_PX_MAX = 62
function lockMarkerSizePx(sizeHint) {
  if (sizeHint == null) return LOCK_MARKER_PX_MIN
  const t = Math.max(0, Math.min(1, (sizeHint - LOCK_MARKER_RADIUS_MIN) / (LOCK_MARKER_RADIUS_MAX - LOCK_MARKER_RADIUS_MIN)))
  return LOCK_MARKER_PX_MIN + t * (LOCK_MARKER_PX_MAX - LOCK_MARKER_PX_MIN)
}

// Rádio dos aliados (Overhaul de Personalidade, Ideia 3) — retratos por pilotId (0 Falco, 1
// Peppy, 2 Slippy, 3 Miyu, mesma ordem de WINGMAN_PROFILES em combat/wingmen.js). Sprites
// recortados do mugshot sheet de Star Fox 2 (SNES) — spriters-resource.com — pra homenagear a
// origem da série. Miyu Lynx (SF2) faz as vezes do 4º piloto, que não tem sprite clássico próprio.
const WINGMAN_RADIO_AVATARS = [
  'assets/wingman-radio/falco.png',
  'assets/wingman-radio/peppy.png',
  'assets/wingman-radio/slippy.png',
  'assets/wingman-radio/miyu.png',
]
// Sequência de "sintonia" (estática de rádio) — também recortada do jogo original (folha
// Portraits), não inventada: 2 brackets + ruído colorido crescente + ruído escuro antes de
// resolver no retrato de verdade. Ver Docs/Rádio dos Aliados — Opção B v2 (protótipo).html.
const WINGMAN_RADIO_STATIC_FRAMES = [1, 2, 3, 4, 5, 6, 7].map((n) => `assets/wingman-radio/static${n}.png`)
const WINGMAN_RADIO_STATIC_FRAME_MS = 55
const WINGMAN_RADIO_HOLD_MS = 2400
const WINGMAN_RADIO_ENTER_MS = 280
const WINGMAN_RADIO_LEAVE_MS = 190

// Extraído de hud.js na refatoração que separa cada tela em seu próprio arquivo. Zero mudança
// de comportamento. `createGameHud` continua sendo uma closure única — todos os métodos abaixo
// compartilham o mesmo `root`/pools de elementos, então não faz sentido dividir mais que isso
// (dividir a closure em vários arquivos ia exigir passar estado por parâmetro ou virar classe,
// mais risco de regressão do que ganho).
//
// v0.51.0 (fix de vazamento): todos os setTimeout que agendam remoção de DOM passam por
// `scheduleTimeout()` e são limpos em bloco pelo `unmount()`. Antes, cada setTimeout vivia por
// conta própria — um HUD remontado num novo jogo antes do próximo timeout vencer via os
// callbacks dispararem em nós órfãos (sem crash, mas vazava entre sessões). Além disso,
// `playFocusCollapse` virou cancelável: se o modal fosse fechado durante os ~350ms da animação
// de convergência (chefe morrendo no mesmo frame do trigger, debug forçando outcome), o
// setTimeout do collapse reabria o modal sozinho depois do overlay já escondido.
export function createGameHud() {
  injectHudExtraStyles()

  showScreen('game')
  const root = document.getElementById('game-screen')
  root.innerHTML = ''

  const sceneRoot = document.createElement('div')
  sceneRoot.id = 'scene-root'
  root.appendChild(sceneRoot)

  // ============ CAMADAS VISUAIS (ordem importa) ============
  const boostDistortion = document.createElement('div')
  boostDistortion.className = 'hud-boost-distortion'
  root.appendChild(boostDistortion)

  const motionLines = document.createElement('div')
  motionLines.className = 'hud-motion-lines'
  root.appendChild(motionLines)

  const lowHealthVignette = document.createElement('div')
  lowHealthVignette.className = 'hud-low-health-vignette'
  root.appendChild(lowHealthVignette)

  const damageVignette = document.createElement('div')
  damageVignette.className = 'hud-damage-vignette'
  root.appendChild(damageVignette)

  const bossTint = document.createElement('div')
  bossTint.className = 'hud-boss-tint'
  root.appendChild(bossTint)

  const sideFlash = document.createElement('div')
  sideFlash.className = 'hud-side-flash'
  root.appendChild(sideFlash)

  // ============ MIRA + HIT MARKER ============
  const reticle = document.createElement('div')
  reticle.className = 'reticle'
  reticle.innerHTML = '<div class="reticle-ring"></div>'
  root.appendChild(reticle)
  const reticleRing = reticle.querySelector('.reticle-ring')

  const hitMarkerEl = document.createElement('div')
  hitMarkerEl.className = 'hit-marker'
  hitMarkerEl.innerHTML = '<span></span><span></span>'
  reticle.appendChild(hitMarkerEl)

  let hitMarkerTimeout = null

  // ============ NOTIFICAÇÃO DE COMANDO DO ESQUADRÃO (TECLA D) ============
  const squadronNotice = document.createElement('div')
  squadronNotice.className = 'hud-squadron-notice'
  squadronNotice.innerHTML = `
    <div class="hud-squadron-notice-pill">
      <span class="hud-squadron-notice-icon">🎯</span>
      <span class="hud-squadron-notice-text">ESQUADRÃO: CONCENTRAR FOGO!</span>
    </div>
    <div class="hud-squadron-notice-sub">[D] Dispersão</div>
  `
  root.appendChild(squadronNotice)
  let squadronNoticeTimeout = null

  // ============ ALERTA DE TEMPESTADE DE DETRITOS (v0.57.0) ============
  const stormWarning = document.createElement('div')
  stormWarning.className = 'hud-storm-warning'
  stormWarning.innerHTML = `
    <div class="hud-storm-warning-pill">
      <span class="hud-storm-warning-icon">⚠️</span>
      <div class="hud-storm-warning-content">
        <span class="hud-storm-warning-title">TEMPESTADE DE DETRITOS DETECTADA</span>
        <span class="hud-storm-warning-sub">CAMPO DENSO DE ASTEROIDES // MANOBRAS EVASIVAS</span>
      </div>
    </div>
  `
  root.appendChild(stormWarning)
  let stormWarningTimeout = null

  // ============ RÁDIO DOS ALIADOS (Overhaul de Personalidade, Ideia 3) ============
  // Opção 3 dos 3 protótipos HTML (escolhida pelo usuário): painel quadrado com glitch de
  // entrada/saída + retrato passando pelos frames de estática antes de resolver.
  const wingmanRadioPanel = document.createElement('div')
  wingmanRadioPanel.className = 'hud-wingman-radio'
  // Fix do bug "retrato só troca um tempo depois da mensagem": reatribuir `img.src` a cada 55ms
  // (flipbook por troca de src) é rápido demais — o browser cancela o load anterior antes de
  // decodificar/pintar UM frame sequer, então a estática nunca aparecia e o retrato antigo ficava
  // parado até o load final (por acaso lento o bastante pra completar) trocar de repente. Fix:
  // os 7 frames de estática viram <img> DECODIFICADOS DE VERDADE uma vez só (pré-carregados no
  // mount, nunca mais têm o `src` tocado depois disso) empilhados atrás do retrato; "tocar o
  // flipbook" agora é só alternar QUAL já está visível (classe CSS), sem nenhuma rede/decode
  // envolvida no caminho crítico — instantâneo e confiável.
  const WINGMAN_RADIO_PANEL_MARKUP = `
    <div class="hud-wingman-radio-corner tl"></div>
    <div class="hud-wingman-radio-corner tr"></div>
    <div class="hud-wingman-radio-corner bl"></div>
    <div class="hud-wingman-radio-corner br"></div>
    <div class="hud-wingman-radio-avatar">
      ${WINGMAN_RADIO_STATIC_FRAMES.map((url, i) => `<img class="wr-frame" data-frame="${i}" src="${url}" alt="">`).join('')}
      <img class="wr-portrait" alt="">
    </div>
    <div class="hud-wingman-radio-text">
      <div class="hud-wingman-radio-name"></div>
      <div class="hud-wingman-radio-line"></div>
    </div>
  `
  wingmanRadioPanel.innerHTML = WINGMAN_RADIO_PANEL_MARKUP
  root.appendChild(wingmanRadioPanel)

  // ============ PAINEL DE ABILITY (região superior) — Documento de Implementação, item 2 ============
  // Mesma estrutura visual/timing do painel trivial acima, canal INDEPENDENTE (fila própria,
  // nunca compete pelo cooldown do outro) — só muda a posição (top, via CSS) e a animação de
  // entrada (mais dramática). Roteamento entre os dois: ver showWingmanRadio()/showWingmanRadioQueue()
  // mais abaixo, que decidem a região pelo payload.isAbility (combat/wingmen.js → ABILITY_EVENT_IDS).
  const wingmanAbilityPanel = document.createElement('div')
  wingmanAbilityPanel.className = 'hud-wingman-ability-panel'
  wingmanAbilityPanel.innerHTML = WINGMAN_RADIO_PANEL_MARKUP
  root.appendChild(wingmanAbilityPanel)

  // Pré-carrega os 4 retratos assim que o HUD monta — o `.wr-portrait.src` ainda É reatribuído a
  // cada mensagem (só troca 1x por fala, sem pressão de tempo), mas com cache já quente o
  // load é efetivamente instantâneo em vez de competir com o resto da rede na primeira fala.
  for (const url of WINGMAN_RADIO_AVATARS) {
    const preload = new Image()
    preload.src = url
  }

  // Factory: cada região (trivial/inferior, ability/superior) tem seu próprio painel DOM, fila e
  // timers — nasce da extração do código original (que só existia pro painel trivial) pra não
  // duplicar ~60 linhas de gerência de timer/glitch quando o painel de ability foi adicionado.
  function createWingmanRadioRegion(panelEl) {
    const frameEls = Array.from(panelEl.querySelectorAll('.wr-frame'))
    const portraitEl = panelEl.querySelector('.wr-portrait')
    const nameEl = panelEl.querySelector('.hud-wingman-radio-name')
    const lineEl = panelEl.querySelector('.hud-wingman-radio-line')
    // Não usa scheduleTimeout/pendingTimeouts (aquele Set é só pra setTimeout) porque tem 1
    // setInterval no meio (flipbook de estática) — gerencia a própria lista pra limpar tudo de
    // uma vez tanto ao reiniciar (nova fala chega enquanto a anterior ainda anima) quanto no
    // unmount().
    let timers = []
    let queue = []
    let playing = false
    let currentPilotId = null

    function clearTimers() {
      for (const t of timers) { if (t.type === 'interval') clearInterval(t.id); else clearTimeout(t.id) }
      timers = []
    }
    function setFrame(frameIdx) {
      for (const el of frameEls) el.classList.toggle('visible', el.dataset.frame === String(frameIdx))
      portraitEl.classList.remove('visible')
    }
    function play({ pilotId, name, color, text }) {
      playing = true
      currentPilotId = pilotId
      clearTimers()
      panelEl.classList.remove('leaving')
      panelEl.style.setProperty('--pc', color)
      panelEl.style.setProperty('--pg', `${color}80`)
      if (nameEl) nameEl.textContent = name
      if (lineEl) lineEl.textContent = text

      // Painel "corta" pra dentro (glitch de steps) ao mesmo tempo em que o retrato passa pelos
      // frames de estática — as duas animações rodam juntas, não uma depois da outra. Os frames já
      // estão decodificados (pré-carregados no mount, `src` nunca reatribuído) — "tocar" é só
      // alternar a classe `visible`, sem nenhum load no meio do caminho.
      panelEl.classList.add('active', 'entering')
      let frameIdx = 0
      setFrame(0)
      const sprite = WINGMAN_RADIO_AVATARS[pilotId]
      if (sprite) portraitEl.src = sprite
      const staticIv = setInterval(() => {
        frameIdx += 1
        if (frameIdx >= WINGMAN_RADIO_STATIC_FRAMES.length) {
          clearInterval(staticIv)
          for (const el of frameEls) el.classList.remove('visible')
          portraitEl.classList.add('visible')
          return
        }
        setFrame(frameIdx)
      }, WINGMAN_RADIO_STATIC_FRAME_MS)
      timers.push({ type: 'interval', id: staticIv })

      const enterDoneId = setTimeout(() => {
        panelEl.classList.remove('entering')
      }, WINGMAN_RADIO_ENTER_MS)
      timers.push({ type: 'timeout', id: enterDoneId })

      const leaveStartId = setTimeout(() => {
        panelEl.classList.add('leaving')
        const removeId = setTimeout(() => {
          panelEl.classList.remove('active', 'leaving')
          playing = false
          currentPilotId = null
          // Fila (ex.: rajada de prontidão do foco) — encadeia a próxima fala automaticamente.
          if (queue.length > 0) {
            const next = queue.shift()
            play(next)
          }
        }, WINGMAN_RADIO_LEAVE_MS)
        timers.push({ type: 'timeout', id: removeId })
      }, WINGMAN_RADIO_HOLD_MS)
      timers.push({ type: 'timeout', id: leaveStartId })
    }
    // Esconde na hora (fade-out rápido), sem encadear a fila — usado pela regra "não pode estar
    // nas 2 regiões ao mesmo tempo pro mesmo piloto" (Documento de Implementação, item 2.1-2.3).
    function forceHide() {
      if (!playing) return
      clearTimers()
      panelEl.classList.remove('entering')
      panelEl.classList.add('leaving')
      const removeId = setTimeout(() => {
        panelEl.classList.remove('active', 'leaving')
        playing = false
        currentPilotId = null
      }, WINGMAN_RADIO_LEAVE_MS)
      timers.push({ type: 'timeout', id: removeId })
    }
    function show(payload) {
      clearTimers()
      queue = []
      play(payload)
    }
    function showQueue(payloads) {
      if (!payloads || payloads.length === 0) return
      if (playing) { queue.push(...payloads); return }
      const [first, ...rest] = payloads
      queue = rest
      play(first)
    }
    function unmount() {
      clearTimers()
      panelEl.classList.remove('active', 'entering', 'leaving')
      playing = false
      currentPilotId = null
      queue = []
    }
    return { show, showQueue, forceHide, unmount, isPlaying: () => playing, currentPilotId: () => currentPilotId }
  }

  const wingmanRadioRegionTrivial = createWingmanRadioRegion(wingmanRadioPanel)
  const wingmanRadioRegionAbility = createWingmanRadioRegion(wingmanAbilityPanel)

  // ============ TIMEOUTS PENDENTES (fix de vazamento — ver comentário do topo) ============
  // Set único de tudo que agenda DOM-removal por tempo: damage numbers, hit marker, absorb
  // beam, focus collapse, error float. `unmount()` limpa em bloco. `focusCollapse` precisa de
  // referência direta (não só estar no Set) porque o `hideQuestionModal` tem que abortar a
  // animação caso o jogador saia do estado antes dela terminar — por isso os dois `let`
  // dedicados abaixo, além da entrada no Set.
  const pendingTimeouts = new Set()
  let focusCollapseTimeout = null
  let focusCollapseContainer = null
  // transição de saída do banner de decolagem (ver hideLaunchBanner) — dedicado como os outros
  // dois acima porque showLaunchBanner precisa CANCELAR um hide pendente se a cutscene seguinte
  // já reabrir o banner antes da anterior terminar de sumir (setor seguinte, restart via debug)
  let launchBannerHideTimeout = null

  function scheduleTimeout(fn, ms) {
    const id = setTimeout(() => {
      pendingTimeouts.delete(id)
      fn()
    }, ms)
    pendingTimeouts.add(id)
    return id
  }

  function cancelTimeout(id) {
    if (id == null) return
    clearTimeout(id)
    pendingTimeouts.delete(id)
  }

  function cancelFocusCollapse() {
    cancelTimeout(focusCollapseTimeout)
    focusCollapseTimeout = null
    if (focusCollapseContainer) {
      focusCollapseContainer.remove()
      focusCollapseContainer = null
    }
  }

  const topbarRow = document.createElement('div')
  topbarRow.className = 'hud-topbar-row'
  root.appendChild(topbarRow)

  const status = document.createElement('div')
  status.className = 'hud-status'
  topbarRow.appendChild(status)

  // ============ ÍCONES DE COOLDOWN DO ESQUADRÃO (Opção B: emblemas hexagonais) ============
  // 4 slots fixos (Falco/Peppy/Slippy/Miyu, mesma ordem de WINGMAN_PROFILES) ao lado do
  // placar — ver PLANO_HABILIDADES_ESQUADRAO.md. A posição nunca "pula" quando um piloto novo
  // é recrutado porque os 4 slots sempre existem, só o estado visual muda (bloqueado → pronto).
  const SQUAD_ABILITY_ICONS = { ram: '☄️', guard: '🔰', repair: '🩹', assist: '🔗' }
  const abilityRow = document.createElement('div')
  abilityRow.className = 'hud-squad-abilities'
  topbarRow.appendChild(abilityRow)
  // v0.74.1 fix: o número de cooldown morava DENTRO de .hud-ability-hex, que tem clip-path de
  // hexágono — o badge ficava ancorado no canto inferior-direito da caixa, uma região que o
  // recorte hexagonal CORTA FORA (o hexágono não chega nos cantos). Resultado: o número nunca
  // aparecia de verdade, só não tinha sido notado porque antes só mostrava nos 3s finais. Agora
  // o badge é irmão do hexágono (não filho), num wrapper `.hud-ability-slot` sem clip-path.
  const abilityHexEls = [0, 1, 2, 3].map(() => {
    const slot = document.createElement('div')
    slot.className = 'hud-ability-slot'
    slot.innerHTML = `
      <div class="hud-ability-hex locked">
        <span class="hud-ability-icon"></span>
        <div class="hud-ability-sweep"></div>
      </div>
      <span class="hud-ability-num"></span>
      <div class="hud-ability-subcolumn"></div>
    `
    abilityRow.appendChild(slot)
    const hex = slot.querySelector('.hud-ability-hex')
    return {
      el: hex,
      icon: hex.querySelector('.hud-ability-icon'),
      sweep: hex.querySelector('.hud-ability-sweep'),
      num: slot.querySelector('.hud-ability-num'),
      subcolumn: slot.querySelector('.hud-ability-subcolumn'),
      subIconEls: new Map(), // id da carta → { el, iconEl } — reaproveitado entre chamadas
    }
  })
  let prevAbilitySignature = ''

  // ============ WIDGET DE COMANDO DO ESQUADRÃO [D] (Item 3 — QOL v0.76.0) ============
  // Empilhado numa coluna (`.hud-squad-column`) que ocupa o mesmo slot no `topbarRow` que o
  // widget sozinho ocupava antes — pedido do usuário pra colocar o contador do Swirl Blast
  // "embaixo do mesmo local de onde fica o foco de aliados", sem mexer na posição horizontal.
  const squadColumn = document.createElement('div')
  squadColumn.className = 'hud-squad-column'
  topbarRow.appendChild(squadColumn)

  const squadCommandWidget = document.createElement('div')
  squadCommandWidget.className = 'hud-squad-command-widget ready'
  squadCommandWidget.innerHTML = `
    <div class="hud-squad-command-badge">
      <span class="hud-cmd-key">D</span>
      <span class="hud-cmd-label">FOCO</span>
    </div>
    <div class="hud-cmd-meter">
      <div class="hud-cmd-meter-fill"></div>
    </div>
    <span class="hud-cmd-timer">PRONTO</span>
  `
  squadColumn.appendChild(squadCommandWidget)
  const squadCmdFill = squadCommandWidget.querySelector('.hud-cmd-meter-fill')
  const squadCmdTimer = squadCommandWidget.querySelector('.hud-cmd-timer')

  // ============ CONTADOR DE COOLDOWN DO SWIRL BLAST (pedido do usuário) ============
  // Mesma estrutura/estados visuais do widget de FOCO acima (ready/cooling), só que pro
  // cooldown de 6-12s do Swirl Blast (ver player.js getSwirlCooldownMs/getSwirlCooldownTotalMs).
  // Sem estado "active" — o Swirl não tem janela de duração como o comando do esquadrão, só
  // dispara e entra em cooldown.
  const swirlCooldownWidget = document.createElement('div')
  swirlCooldownWidget.className = 'hud-squad-command-widget hud-swirl-widget ready'
  swirlCooldownWidget.innerHTML = `
    <div class="hud-squad-command-badge">
      <span class="hud-cmd-key">🌀</span>
      <span class="hud-cmd-label">SWIRL</span>
    </div>
    <div class="hud-cmd-meter">
      <div class="hud-cmd-meter-fill"></div>
    </div>
    <span class="hud-cmd-timer">PRONTO</span>
  `
  squadColumn.appendChild(swirlCooldownWidget)
  const swirlCmdFill = swirlCooldownWidget.querySelector('.hud-cmd-meter-fill')
  const swirlCmdTimer = swirlCooldownWidget.querySelector('.hud-cmd-timer')

  // ============ CADEIA DE ABATES — "Arcade Neon" (v0.73.0) ============
  // Terceiro filho de .hud-topbar-row, ao lado do placar e dos emblemas de habilidade — ver
  // documento de design de feedback de combate (opção 1 de 5, escolhida pelo usuário).
  const KILL_CHAIN_MAX_SEGS = 8
  const killChainRow = document.createElement('div')
  killChainRow.className = 'hud-kill-chain'
  killChainRow.innerHTML = `
    <span class="hud-kill-chain-label">CADEIA</span>
    <span class="hud-kill-chain-x">x0</span>
    <div class="hud-kill-chain-segs"></div>
  `
  topbarRow.appendChild(killChainRow)
  const killChainXEl = killChainRow.querySelector('.hud-kill-chain-x')
  const killChainSegsEl = killChainRow.querySelector('.hud-kill-chain-segs')
  const killChainSegEls = Array.from({ length: KILL_CHAIN_MAX_SEGS }, () => {
    const seg = document.createElement('div')
    seg.className = 'hud-kill-chain-seg'
    killChainSegsEl.appendChild(seg)
    return seg
  })
  let prevKillChainCount = 0

  // ============ TELA DE K.O. DO CHEFE — "Arcade Neon" (v0.73.0) ============
  const bossKoEl = document.createElement('div')
  bossKoEl.className = 'hud-boss-ko'
  bossKoEl.innerHTML = `
    <div class="hud-boss-ko-text">K.O.!</div>
    <div class="hud-boss-ko-bonus"></div>
  `
  root.appendChild(bossKoEl)
  const bossKoTextEl = bossKoEl.querySelector('.hud-boss-ko-text')
  const bossKoBonusEl = bossKoEl.querySelector('.hud-boss-ko-bonus')
  let bossKoTimeout = null

  // ============ HORIZONTE ARTIFICIAL (Fase 9, ideia all-range 2) ============
  // só visível no modo all-range — ajuda a não perder a noção de "pra cima" (main.js chama
  // setHorizon(null) fora do all-range pra esconder). Linha de céu/chão que gira com o roll e
  // desloca verticalmente com o pitch, dentro de um recorte circular.
  const horizon = document.createElement('div')
  horizon.className = 'hud-horizon'
  horizon.hidden = true
  horizon.innerHTML = '<div class="hud-horizon-line"></div>'
  root.appendChild(horizon)
  const horizonLine = horizon.querySelector('.hud-horizon-line')

  // ============ CLUSTER DE VIDA/ESCUDO/BOOST ============
  // Duas apresentações atrás da MESMA API pública (setLives/setStatus/setShield/setBoost) —
  // settings.vitalsHudStyle escolhe qual. 'classic' = placas angulares fixas no canto superior
  // esquerdo (overhaul v0.71.0, pedido do usuário: "console militar angular" com segmentos
  // discretos). 'orbital' = 3 arcos SVG lisos e concêntricos que acompanham a projeção de tela
  // da nave (pedido do usuário, v0.78.0: HUD "ao redor da própria nave" em vez de canto fixo;
  // ver setVitalsAnchor abaixo e a chamada em game-loop.js). Lida uma única vez aqui na criação
  // do HUD — mesmo padrão de shipVisual/startingWingmen: só reflete no próximo jogo, não troca
  // ao vivo em partida.
  const useOrbitalVitals = getSettings().vitalsHudStyle === 'orbital'
  const SVG_NS = 'http://www.w3.org/2000/svg'

  let vitalsCluster
  // clássico
  let livesBar, shieldSegsEl, healthSegsEl, healthBarWrap, boostBar, boostFill
  let livePips = []
  let livePipsMax = null
  let shieldSegEls = []
  let shieldSegsMax = null
  let healthSegEls = []
  let healthSegsMax = null
  // orbital
  let orbitalSvg, healthArc, shieldArc, boostArc, orbitalLifePipsGroup
  let orbitalLifePips = []
  let orbitalLifePipsMax = null
  // compartilhado
  let prevLives = null
  let prevShield = null
  let prevHealth = null
  let prevBoostCharge = 1

  function rebuildSegs(container, count) {
    container.innerHTML = ''
    return Array.from({ length: count }, () => {
      const seg = document.createElement('div')
      seg.className = 'hud-seg'
      container.appendChild(seg)
      return seg
    })
  }

  function flashVitalsHit() {
    vitalsCluster.classList.remove('hit-flash')
    void vitalsCluster.offsetWidth
    vitalsCluster.classList.add('hit-flash')
  }

  // posições (no espaço local do SVG, mesmo sistema de coordenadas dos arcos) da trilha de
  // pontinhos de vida na ponta da varredura — extrapola pra além do 3º ponto se maxLives > 3
  // (startingWingmen/cartas 'extra-life' podem levar até LIVES_CAP=5 em player.js)
  // v0.78.1 — geometria refeita pra bater com a referência do usuário: varredura de ~90°
  // (era ~180°+, formava uma "cúpula" simétrica em cima da nave) concentrada no quadrante
  // SUPERIOR-ESQUERDO relativo à nave (âncora local 0,0), com a nave perto da ponta
  // inferior-direita do arco em vez de centralizada embaixo dele. Pontinhos continuam a
  // mesma direção da varredura, logo depois da ponta do arco mais externo (impulso).
  // v0.78.2 — offset/step reduzidos na mesma proporção que os arcos (raios menores, ver
  // makeOrbitalArc abaixo) pra continuar logo depois da ponta do arco de impulso.
  const ORBITAL_LIFE_PIP_STEP = [-7, -8]
  const ORBITAL_LIFE_PIP_START = [-81, -29]
  function orbitalLifePipPos(i) {
    return [
      ORBITAL_LIFE_PIP_START[0] + ORBITAL_LIFE_PIP_STEP[0] * i,
      ORBITAL_LIFE_PIP_START[1] + ORBITAL_LIFE_PIP_STEP[1] * i,
    ]
  }
  function rebuildOrbitalLifePips(count) {
    orbitalLifePips.forEach((el) => el.remove())
    return Array.from({ length: count }, (_, i) => {
      const [cx, cy] = orbitalLifePipPos(i)
      const c = document.createElementNS(SVG_NS, 'circle')
      c.setAttribute('class', 'hvo-life-pip')
      c.setAttribute('cx', String(cx))
      c.setAttribute('cy', String(cy))
      c.setAttribute('r', '7')
      orbitalLifePipsGroup.appendChild(c)
      return c
    })
  }
  function makeOrbitalArc(className, d) {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('class', `hvo-arc ${className}`)
    path.setAttribute('pathLength', '100')
    path.setAttribute('d', d)
    orbitalSvg.appendChild(path)
    return path
  }

  // v0.78.2 — pedido do usuário: cada componente (arco de vida/escudo/impulso, trilha de vidas)
  // só aparece quando o valor que representa muda (gasto ou recuperado), e desaparece devagar
  // depois de um tempo parado — em vez de ficar sempre visível. classList.add('is-active') faz
  // aparecer na hora (transição rápida via CSS), o timeout reagenda a cada mudança e remove a
  // classe depois do hold, disparando a transição de saída lenta (ver .hvo-arc/.hvo-lifepips
  // em hud-styles.js).
  const orbitalFadeTimers = new WeakMap()
  const ORBITAL_FADE_HOLD_MS = 1100
  function pulseOrbitalVisible(el) {
    if (!el) return
    const existing = orbitalFadeTimers.get(el)
    if (existing) clearTimeout(existing)
    el.classList.add('is-active')
    orbitalFadeTimers.set(
      el,
      setTimeout(() => {
        el.classList.remove('is-active')
        orbitalFadeTimers.delete(el)
      }, ORBITAL_FADE_HOLD_MS)
    )
  }

  if (!useOrbitalVitals) {
    vitalsCluster = document.createElement('div')
    vitalsCluster.className = 'hud-vitals-cluster'
    root.appendChild(vitalsCluster)

    livesBar = document.createElement('div')
    livesBar.className = 'hud-lives-bar'
    vitalsCluster.appendChild(livesBar)

    const shieldBarWrap = document.createElement('div')
    shieldBarWrap.className = 'hud-bar-wrap hud-shield-wrap hud-bar-row'
    shieldBarWrap.innerHTML = '<span class="hud-bar-label">Esc</span>'
    vitalsCluster.appendChild(shieldBarWrap)
    shieldSegsEl = document.createElement('div')
    shieldSegsEl.className = 'hud-segs'
    shieldBarWrap.appendChild(shieldSegsEl)

    healthBarWrap = document.createElement('div')
    healthBarWrap.className = 'hud-bar-wrap hud-health-wrap hud-bar-row'
    healthBarWrap.innerHTML = '<span class="hud-bar-label">Vida</span>'
    vitalsCluster.appendChild(healthBarWrap)
    healthSegsEl = document.createElement('div')
    healthSegsEl.className = 'hud-segs'
    healthBarWrap.appendChild(healthSegsEl)

    boostBar = document.createElement('div')
    boostBar.className = 'hud-bar-wrap hud-boost-wrap'
    vitalsCluster.appendChild(boostBar)
    boostFill = document.createElement('div')
    boostFill.className = 'hud-bar-fill hud-boost-fill'
    boostBar.appendChild(boostFill)
  } else {
    vitalsCluster = document.createElement('div')
    vitalsCluster.className = 'hud-vitals-orbital'
    root.appendChild(vitalsCluster)

    orbitalSvg = document.createElementNS(SVG_NS, 'svg')
    orbitalSvg.setAttribute('class', 'hud-vitals-orbital-svg')
    orbitalSvg.setAttribute('viewBox', '-200 -260 400 300')
    vitalsCluster.appendChild(orbitalSvg)

    // v0.78.1 — geometria refeita a pedido do usuário (imagem de referência): varredura de
    // ~90° (era ~180°+, formava uma "cúpula" simétrica acima da nave) de -75° (quase reto pra
    // cima, um pouco à direita — perto da nave) a -165° (quase reto pra esquerda, um pouco pra
    // cima — ponta do arco) em torno da âncora (0,0) = posição da nave, concentrada no
    // quadrante SUPERIOR-ESQUERDO. Raio interno = escudo (1ª linha de defesa), médio = vida,
    // externo = impulso (recurso, não "perigo", fica mais longe do casco).
    // v0.78.2 — raios reduzidos de novo (57/77/97 → 43/58/73) a pedido do usuário, pra ficar
    // ainda mais perto da nave; deslocamento pra esquerda fica no translateX do container
    // (hud-styles.js), não na geometria dos arcos.
    shieldArc = makeOrbitalArc('hvo-shield', 'M 11.13 -41.54 A 43 43 0 0 0 -41.54 -11.13')
    healthArc = makeOrbitalArc('hvo-health', 'M 15.01 -56.02 A 58 58 0 0 0 -56.02 -15.01')
    boostArc = makeOrbitalArc('hvo-boost', 'M 18.89 -70.51 A 73 73 0 0 0 -70.51 -18.89')

    orbitalLifePipsGroup = document.createElementNS(SVG_NS, 'g')
    orbitalLifePipsGroup.setAttribute('class', 'hvo-lifepips')
    orbitalSvg.appendChild(orbitalLifePipsGroup)
  }

  // ============ BANDEJA DE CARTAS ROGUELIKE (v0.53.4) ============
  const cardsTray = document.createElement('div')
  cardsTray.className = 'hud-cards-tray'
  root.appendChild(cardsTray)
  let prevCardsSignature = ''

  const question = document.createElement('p')
  question.className = 'hud-question'
  question.hidden = true
  root.appendChild(question)

  const legend = document.createElement('div')
  legend.className = 'hud-legend'
  legend.hidden = true
  root.appendChild(legend)

  const feedback = document.createElement('div')
  feedback.className = 'hud-feedback'
  feedback.hidden = true
  root.appendChild(feedback)

  const countdown = document.createElement('div')
  countdown.className = 'hud-countdown'
  countdown.hidden = true
  root.appendChild(countdown)

  const bossBanner = document.createElement('div')
  bossBanner.className = 'hud-boss-banner'
  bossBanner.hidden = true
  root.appendChild(bossBanner)

  const goldenBanner = document.createElement('div')
  goldenBanner.className = 'hud-golden-banner'
  goldenBanner.textContent = 'ALVO DOURADO ESPECIAL — CAÇA LIVRE'
  goldenBanner.hidden = true
  root.appendChild(goldenBanner)

  // ============ AVISO + CUTSCENE DE TRANSIÇÃO PRO ALL-RANGE MODE (Fase 5) ============
  const arenaWarning = document.createElement('div')
  arenaWarning.className = 'hud-arena-warning'
  arenaWarning.hidden = true
  root.appendChild(arenaWarning)

  const arenaCutsceneOverlay = document.createElement('div')
  arenaCutsceneOverlay.className = 'hud-arena-cutscene'
  arenaCutsceneOverlay.textContent = 'Transicionando para o modo All-Range...'
  arenaCutsceneOverlay.hidden = true
  root.appendChild(arenaCutsceneOverlay)

  // ============ ELEMENTOS DE CUTSCENE CINEMÁTICA ============
  const letterboxTop = document.createElement('div')
  letterboxTop.className = 'hud-letterbox hud-letterbox-top'
  root.appendChild(letterboxTop)

  const letterboxBottom = document.createElement('div')
  letterboxBottom.className = 'hud-letterbox hud-letterbox-bottom'
  root.appendChild(letterboxBottom)

  const bossWarningCard = document.createElement('div')
  bossWarningCard.className = 'hud-boss-warning-card'
  bossWarningCard.hidden = true
  root.appendChild(bossWarningCard)

  const goldenWarningCard = document.createElement('div')
  goldenWarningCard.className = 'hud-golden-warning-card'
  goldenWarningCard.hidden = true
  root.appendChild(goldenWarningCard)

  const launchBanner = document.createElement('div')
  launchBanner.className = 'hud-launch-banner'
  launchBanner.hidden = true
  root.appendChild(launchBanner)

  const whiteoutOverlay = document.createElement('div')
  whiteoutOverlay.className = 'hud-whiteout-overlay'
  root.appendChild(whiteoutOverlay)

  const missionCompleteBanner = document.createElement('div')
  missionCompleteBanner.className = 'hud-mission-complete'
  missionCompleteBanner.hidden = true
  root.appendChild(missionCompleteBanner)

  // ============ MODAL DE PERGUNTA (chefe/normal: pausa total e moldura holográfica) ============
  const questionModalOverlay = document.createElement('div')
  questionModalOverlay.className = 'question-modal-overlay'
  questionModalOverlay.hidden = true
  root.appendChild(questionModalOverlay)

  const questionModalFrame = document.createElement('div')
  questionModalFrame.className = 'question-modal-frame'
  questionModalOverlay.appendChild(questionModalFrame)

  const questionModalBadge = document.createElement('div')
  questionModalBadge.className = 'question-modal-badge'
  questionModalBadge.textContent = 'TERMINAL DE CONHECIMENTO // ANKI'
  questionModalFrame.appendChild(questionModalBadge)

  const questionModalTitle = document.createElement('h3')
  questionModalTitle.className = 'question-modal-title'
  questionModalFrame.appendChild(questionModalTitle)

  // ============ BOTÃO DE CONTEXTO NA EXTREMA DIREITA (DURANTE A PERGUNTA) ============
  // Mostra o CONCEITO geral por trás da pergunta — nunca revela a resposta.
  // Seguro de exibir a qualquer momento durante o recall ativo.
  const codexTabBtn = document.createElement('button')
  codexTabBtn.className = 'hud-codex-tab-btn'
  codexTabBtn.type = 'button'
  codexTabBtn.innerHTML = `
    <span class="hud-codex-tab-icon">💡</span>
    <span class="hud-codex-tab-label">CONTEXTO</span>
    <span class="hud-codex-tab-key">E</span>
  `
  questionModalOverlay.appendChild(codexTabBtn)

  const codexBackdrop = document.createElement('div')
  codexBackdrop.className = 'hud-codex-backdrop'
  questionModalOverlay.appendChild(codexBackdrop)

  const codexDrawer = document.createElement('aside')
  codexDrawer.className = 'hud-codex-drawer'
  questionModalOverlay.appendChild(codexDrawer)

  codexDrawer.innerHTML = `
    <div class="hud-codex-header">
      <div class="hud-codex-meta">
        <span class="hud-codex-badge">CONTEXTO // CONCEITO</span>
        <span class="hud-codex-tag-badge" id="hudCodexTag"></span>
      </div>
      <button type="button" class="hud-codex-close-btn" id="hudCodexCloseBtn" aria-label="Fechar Contexto">
        ✕ Fechar [Esc]
      </button>
    </div>
    <div class="hud-codex-scroll">
      <div class="hud-codex-question-card">
        <div class="hud-codex-section-label">🎯 PERGUNTA / ENUNCIADO</div>
        <div class="hud-codex-question-text" id="hudCodexQuestion"></div>
      </div>
      <div class="hud-codex-section" id="hudCodexExplanationSection">
        <div class="hud-codex-section-label">💡 CONCEITO GERAL</div>
        <div class="hud-codex-explanation-text" id="hudCodexExplanation"></div>
      </div>
      <div class="hud-codex-section" id="hudCodexSourcesSection">
        <div class="hud-codex-section-label">📚 FONTE / REFERÊNCIA</div>
        <div class="hud-codex-sources-content" id="hudCodexSources"></div>
      </div>
    </div>
    <div class="hud-codex-footer">
      <span>Pressione <b>E</b> ou <b>Esc</b> para alternar o Contexto</span>
    </div>
  `

  const hudCodexTag = codexDrawer.querySelector('#hudCodexTag')
  const hudCodexCloseBtn = codexDrawer.querySelector('#hudCodexCloseBtn')
  const hudCodexQuestion = codexDrawer.querySelector('#hudCodexQuestion')
  const hudCodexExplanationSection = codexDrawer.querySelector('#hudCodexExplanationSection')
  const hudCodexExplanation = codexDrawer.querySelector('#hudCodexExplanation')
  const hudCodexSourcesSection = codexDrawer.querySelector('#hudCodexSourcesSection')
  const hudCodexSources = codexDrawer.querySelector('#hudCodexSources')

  function openCodex() {
    codexDrawer.classList.add('is-open')
    codexTabBtn.classList.add('is-open')
    codexBackdrop.classList.add('is-open')
  }

  function closeCodex() {
    codexDrawer.classList.remove('is-open')
    codexTabBtn.classList.remove('is-open')
    codexBackdrop.classList.remove('is-open')
  }

  function toggleCodex() {
    if (codexDrawer.classList.contains('is-open')) closeCodex()
    else openCodex()
  }

  codexTabBtn.onclick = (e) => {
    e.stopPropagation()
    toggleCodex()
  }
  hudCodexCloseBtn.onclick = (e) => {
    e.stopPropagation()
    closeCodex()
  }
  codexBackdrop.onclick = () => {
    closeCodex()
  }

  // ============ PAINEL DE EXPLICAÇÃO PÓS-RESPOSTA (SÓ APARECE APÓS RESPONDER) ============
  // Mostra a explicação densa + fontes + resposta correta. Visível nas telas de
  // card choice (acerto) e feedback de erro.
  const explDrawerBackdrop = document.createElement('div')
  explDrawerBackdrop.className = 'hud-codex-backdrop hud-expl-backdrop'
  root.appendChild(explDrawerBackdrop)

  const explDrawer = document.createElement('aside')
  explDrawer.className = 'hud-codex-drawer hud-expl-drawer'
  root.appendChild(explDrawer)

  explDrawer.innerHTML = `
    <div class="hud-codex-header hud-expl-header">
      <div class="hud-codex-meta">
        <span class="hud-codex-badge hud-expl-badge-title">EXPLICAÇÃO DA RESPOSTA</span>
        <span class="hud-codex-tag-badge" id="hudExplTag"></span>
      </div>
      <button type="button" class="hud-codex-close-btn" id="hudExplCloseBtn" aria-label="Fechar Explicação">
        ✕ Fechar [Esc]
      </button>
    </div>
    <div class="hud-codex-scroll">
      <div class="hud-codex-question-card hud-expl-answer-card">
        <div class="hud-codex-section-label">✅ RESPOSTA CORRETA</div>
        <div class="hud-codex-question-text hud-expl-answer-text" id="hudExplAnswer"></div>
      </div>
      <div class="hud-codex-section" id="hudExplExplanationSection">
        <div class="hud-codex-section-label">🔬 EXPLICAÇÃO DENSA &amp; APROFUNDADA</div>
        <div class="hud-codex-explanation-text" id="hudExplExplanation"></div>
      </div>
      <div class="hud-codex-section" id="hudExplSourcesSection">
        <div class="hud-codex-section-label">📚 FONTES &amp; REFERÊNCIAS OFICIAIS</div>
        <div class="hud-codex-sources-content" id="hudExplSources"></div>
      </div>
    </div>
    <div class="hud-codex-footer hud-expl-footer">
      <span>Pressione <b>Esc</b> para fechar</span>
    </div>
  `

  const hudExplTag = explDrawer.querySelector('#hudExplTag')
  const hudExplCloseBtn = explDrawer.querySelector('#hudExplCloseBtn')
  const hudExplAnswer = explDrawer.querySelector('#hudExplAnswer')
  const hudExplExplanationSection = explDrawer.querySelector('#hudExplExplanationSection')
  const hudExplExplanation = explDrawer.querySelector('#hudExplExplanation')
  const hudExplSourcesSection = explDrawer.querySelector('#hudExplSourcesSection')
  const hudExplSources = explDrawer.querySelector('#hudExplSources')

  // guardar dados da última pergunta resolvida para alimentar o painel de explicação
  let lastResolvedCard = null
  let currentErrorFloat = null

  function openExplDrawer() {
    explDrawer.classList.add('is-open')
    explDrawerBackdrop.classList.add('is-open')
  }

  function closeExplDrawer() {
    explDrawer.classList.remove('is-open')
    explDrawerBackdrop.classList.remove('is-open')
  }

  function populateExplDrawer(card) {
    if (!card) return
    hudExplAnswer.textContent = card.answer || card.correctAnswer || ''
    hudExplTag.textContent = (card.tags && card.tags.length > 0) ? card.tags.join(' • ') : (card.deck || 'Estudo')

    const hasExpl = Boolean(card.explanation && card.explanation.trim().length > 0)
    const hasSrc = Boolean(card.sourceUrl || (card.sourcesText && card.sourcesText.trim().length > 0))

    if (hasExpl) {
      hudExplExplanationSection.style.display = 'block'
      hudExplExplanation.textContent = card.explanation
    } else {
      hudExplExplanationSection.style.display = 'none'
    }

    if (hasSrc) {
      hudExplSourcesSection.style.display = 'block'
      hudExplSources.innerHTML = ''
      if (card.sourceUrl) {
        const a = document.createElement('a')
        a.className = 'hud-codex-source-link'
        a.href = card.sourceUrl
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        const label = card.sourceUrl.length > 55 ? card.sourceUrl.slice(0, 52) + '...' : card.sourceUrl
        a.innerHTML = `<span>🔗</span> <span>${label}</span>`
        hudExplSources.appendChild(a)
      }
      if (card.sourcesText && card.sourcesText !== card.sourceUrl) {
        const p = document.createElement('div')
        p.className = 'hud-codex-source-citation'
        p.textContent = card.sourcesText
        hudExplSources.appendChild(p)
      }
    } else {
      hudExplSourcesSection.style.display = 'none'
    }
  }

  // handler global de teclado para fechar o painel de explicação
  let explKeyHandler = null
  function attachExplKeyHandler() {
    if (explKeyHandler) return
    explKeyHandler = (e) => {
      if (e.key === 'Escape' || e.code === 'Escape') {
        if (explDrawer.classList.contains('is-open')) {
          e.preventDefault()
          e.stopPropagation()
          closeExplDrawer()
        }
      }
    }
    window.addEventListener('keydown', explKeyHandler, true)
  }
  function detachExplKeyHandler() {
    if (explKeyHandler) {
      window.removeEventListener('keydown', explKeyHandler, true)
      explKeyHandler = null
    }
  }

  hudExplCloseBtn.onclick = (e) => {
    e.stopPropagation()
    closeExplDrawer()
  }
  explDrawerBackdrop.onclick = () => {
    closeExplDrawer()
  }

  const questionModalList = document.createElement('div')
  questionModalList.className = 'question-modal-list'
  questionModalFrame.appendChild(questionModalList)

  const bossFightBar = document.createElement('div')
  bossFightBar.className = 'hud-boss-fight-bar'
  bossFightBar.hidden = true
  root.appendChild(bossFightBar)
  const bossFightLabel = document.createElement('div')
  bossFightLabel.className = 'hud-boss-fight-label'
  bossFightLabel.textContent = 'CHEFE'
  bossFightBar.appendChild(bossFightLabel)
  const bossFightTrack = document.createElement('div')
  bossFightTrack.className = 'hud-boss-fight-track'
  bossFightBar.appendChild(bossFightTrack)
  const bossFightFill = document.createElement('div')
  bossFightFill.className = 'hud-boss-fight-fill'
  bossFightTrack.appendChild(bossFightFill)

  const minimap = document.createElement('div')
  minimap.className = 'hud-minimap'
  minimap.hidden = true
  root.appendChild(minimap)
  const minimapFov = document.createElement('div')
  minimapFov.className = 'hud-minimap-fov'
  minimap.appendChild(minimapFov)
  const minimapPlayer = document.createElement('div')
  minimapPlayer.className = 'hud-minimap-player'
  minimap.appendChild(minimapPlayer)
  const minimapBlipPool = new Map()
  const minimapAllyPool = new Map()

  // ============ INDICADORES DE AMEAÇAS FORA DA TELA (Item 4 — QOL v0.76.0) ============
  const threatPointersRoot = document.createElement('div')
  threatPointersRoot.className = 'hud-offscreen-pointers'
  root.appendChild(threatPointersRoot)

  const threatPointerPool = [0, 1, 2, 3].map(() => {
    const el = document.createElement('div')
    el.className = 'hud-threat-pointer'
    el.hidden = true
    el.innerHTML = `<span class="hud-threat-chevron">►</span>`
    threatPointersRoot.appendChild(el)
    return el
  })
  // Radar Tático: formato do blip por tipo de ameaça (ver kind em src/enemies/*.js), não só cor
  const MINIMAP_SHAPE_BY_KIND = {
    blaster: 'tri', time: 'tri', tank: 'tri', detrito: 'tri', replica: 'tri', ima: 'tri',
    sentinela: 'diamond',
    miniSwarm: 'hex', sussurro: 'hex',
    fragata: 'plus', verme: 'plus',
  }

  // Overhaul do menu de pausa (v0.80.0, pedido do usuário) — antes era só um "Pausado" sem
  // botão nenhum. O overlay de verdade (continuar/opções/reiniciar/sair) mora em hud-pause.js.
  const pauseOverlay = buildPauseOverlay(root)

  const cardChoiceOverlay = document.createElement('div')
  cardChoiceOverlay.className = 'card-choice-overlay'
  cardChoiceOverlay.hidden = true
  root.appendChild(cardChoiceOverlay)

  const cardChoiceHeader = document.createElement('div')
  cardChoiceHeader.className = 'card-choice-header'
  cardChoiceHeader.innerHTML = `
    <div class="card-choice-badge">PROTOCOLO DE RECOMPENSA TÁTICA</div>
    <h3 class="card-choice-title">UPGRADE DE SISTEMA DISPONÍVEL</h3>
    <p class="card-choice-subtitle">Selecione um aprimoramento permanente para sua nave · Teclas <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></p>
  `
  cardChoiceOverlay.appendChild(cardChoiceHeader)

  const cardChoiceInspector = document.createElement('div')
  cardChoiceInspector.className = 'card-choice-inspector'
  cardChoiceOverlay.appendChild(cardChoiceInspector)

  const cardChoiceList = document.createElement('div')
  cardChoiceList.className = 'card-choice-list'
  cardChoiceOverlay.appendChild(cardChoiceList)

  // ============ PAINEL DE DEBUG (overhaul v0.68.0) ============
  // Antes: heading + lista plana de ~60 botões idênticos, sem agrupamento nem busca, sem
  // nenhum retrato do estado vivo da partida — só ações. Overhaul mantém a API externa 100%
  // compatível (hud.debug.bind/.setVisible/.setToggleActive continuam idênticos, main.js/
  // mount-game.js/debug-actions.js não mudam nada) e adiciona: (1) leitura de estado ao vivo
  // (fps/fase/vida/inimigos/posição/flags) via setStatsProvider, (2) busca que filtra ações
  // por texto, (3) seções por categoria (DEBUG_CATEGORY_ORDER) colapsáveis individualmente.
  const debugPanel = document.createElement('div')
  debugPanel.className = 'debug-panel'
  debugPanel.hidden = true
  root.appendChild(debugPanel)

  const debugHeading = document.createElement('h4')
  debugHeading.textContent = 'Debug'
  debugPanel.appendChild(debugHeading)

  const debugHint = document.createElement('p')
  debugHint.className = 'debug-hint'
  debugHint.textContent = 'Crase (`) para abrir/fechar'
  debugPanel.appendChild(debugHint)

  // ---- Leitura de estado ao vivo ----
  const DEBUG_STAT_ROWS = [
    ['fps', 'FPS'], ['phase', 'Fase'], ['sector', 'Setor'],
    ['health', 'Vida'], ['shield', 'Escudo'], ['lives', 'Vidas'],
    ['score', 'Pontos'], ['combo', 'Combo'], ['enemies', 'Inimigos'],
    ['wingmen', 'Ala'], ['position', 'Posição'], ['flags', 'Flags'],
  ]
  const debugStats = document.createElement('div')
  debugStats.className = 'debug-stats'
  debugPanel.appendChild(debugStats)
  const debugStatEls = {}
  for (const [key, label] of DEBUG_STAT_ROWS) {
    const row = document.createElement('div')
    // posição/flags são texto de tamanho variável (coordenadas, lista de flags ativas) — ganham
    // a linha inteira pra não truncar em elipse contra o vizinho de coluna, diferente dos outros
    // (números curtos de formato fixo, cabem bem 2 por linha)
    row.className = key === 'position' || key === 'flags' ? 'debug-stat-row debug-stat-row-wide' : 'debug-stat-row'
    const labelEl = document.createElement('span')
    labelEl.className = 'debug-stat-label'
    labelEl.textContent = label
    const valueEl = document.createElement('span')
    valueEl.className = 'debug-stat-value'
    valueEl.textContent = '—'
    row.appendChild(labelEl)
    row.appendChild(valueEl)
    debugStats.appendChild(row)
    debugStatEls[key] = valueEl
  }

  let debugStatsProvider = null
  let debugStatsRafId = null
  let debugStatsFrameCount = 0
  let debugStatsFpsWindowStart = 0
  let debugStatsLastFps = 0
  let debugStatsLastRenderAt = 0

  function renderDebugStats() {
    if (!debugStatsProvider) return
    const s = debugStatsProvider()
    if (!s) return
    debugStatEls.fps.textContent = String(debugStatsLastFps)
    debugStatEls.phase.textContent = s.phase ?? '—'
    debugStatEls.sector.textContent = s.sector ?? '—'
    debugStatEls.health.textContent = `${s.health ?? 0}/${s.maxHealth ?? 0}`
    debugStatEls.shield.textContent = `${Math.round(s.shield ?? 0)}/${Math.round(s.maxShield ?? 0)}`
    debugStatEls.lives.textContent = `${s.lives ?? 0}/${s.maxLives ?? 0}`
    debugStatEls.score.textContent = String(s.score ?? 0)
    debugStatEls.combo.textContent = `x${(s.combo ?? 1).toFixed(2)}`
    debugStatEls.enemies.textContent = String(s.enemies ?? 0)
    debugStatEls.wingmen.textContent = String(s.wingmen ?? 0)
    debugStatEls.position.textContent = s.position ?? '—'
    const activeFlags = s.flags ? Object.keys(s.flags).filter((k) => s.flags[k]) : []
    debugStatEls.flags.textContent = activeFlags.length ? activeFlags.join(', ') : '—'
  }

  function debugStatsLoop(now) {
    debugStatsRafId = requestAnimationFrame(debugStatsLoop)
    debugStatsFrameCount++
    if (now - debugStatsFpsWindowStart >= 500) {
      debugStatsLastFps = Math.round((debugStatsFrameCount * 1000) / (now - debugStatsFpsWindowStart))
      debugStatsFrameCount = 0
      debugStatsFpsWindowStart = now
    }
    if (now - debugStatsLastRenderAt >= 200) {
      debugStatsLastRenderAt = now
      renderDebugStats()
    }
  }
  function startDebugStatsLoop() {
    if (debugStatsRafId != null) return
    debugStatsFrameCount = 0
    debugStatsFpsWindowStart = performance.now()
    debugStatsLastRenderAt = 0
    debugStatsRafId = requestAnimationFrame(debugStatsLoop)
  }
  function stopDebugStatsLoop() {
    if (debugStatsRafId != null) {
      cancelAnimationFrame(debugStatsRafId)
      debugStatsRafId = null
    }
  }

  // ---- Busca ----
  const debugSearch = document.createElement('input')
  debugSearch.type = 'text'
  debugSearch.className = 'debug-search'
  debugSearch.placeholder = 'Filtrar ações…'
  debugSearch.autocomplete = 'off'
  debugPanel.appendChild(debugSearch)

  const debugEmpty = document.createElement('p')
  debugEmpty.className = 'debug-empty'
  debugEmpty.textContent = 'Nenhuma ação encontrada.'
  debugEmpty.hidden = true
  debugPanel.appendChild(debugEmpty)

  // ---- Ações agrupadas por categoria ----
  const debugCategoriesEl = document.createElement('div')
  debugCategoriesEl.className = 'debug-categories'
  debugPanel.appendChild(debugCategoriesEl)

  const debugButtons = {}
  const debugCategoryMap = new Map()
  for (const action of DEBUG_ACTIONS) {
    const catName = action.category || 'Outros'
    let cat = debugCategoryMap.get(catName)
    if (!cat) {
      const section = document.createElement('div')
      section.className = 'debug-category'
      const header = document.createElement('button')
      header.type = 'button'
      header.className = 'debug-category-header'
      const chevron = document.createElement('span')
      chevron.className = 'debug-category-chevron'
      chevron.textContent = '▾'
      const title = document.createElement('span')
      title.textContent = catName
      header.appendChild(chevron)
      header.appendChild(title)
      const body = document.createElement('div')
      body.className = 'debug-category-body'
      section.appendChild(header)
      section.appendChild(body)
      debugCategoriesEl.appendChild(section)
      header.onclick = () => section.classList.toggle('collapsed')
      cat = { section, body, entries: [] }
      debugCategoryMap.set(catName, cat)
    }
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = action.label
    btn.className = action.toggle ? 'debug-action-btn debug-toggle-btn' : 'debug-action-btn'
    cat.body.appendChild(btn)
    debugButtons[action.id] = btn
    cat.entries.push({ btn, label: action.label.toLowerCase() })
  }
  // seções na ordem declarada em DEBUG_CATEGORY_ORDER; qualquer categoria nova que alguém
  // esqueça de listar lá ainda aparece (só vai parar no fim, em vez de sumir)
  const debugCategoriesInOrder = [
    ...DEBUG_CATEGORY_ORDER.filter((name) => debugCategoryMap.has(name)),
    ...[...debugCategoryMap.keys()].filter((name) => !DEBUG_CATEGORY_ORDER.includes(name)),
  ].map((name) => debugCategoryMap.get(name))
  for (const cat of debugCategoriesInOrder) debugCategoriesEl.appendChild(cat.section)

  debugSearch.addEventListener('input', () => {
    const q = debugSearch.value.trim().toLowerCase()
    let anyVisible = false
    for (const cat of debugCategoriesInOrder) {
      let catHasMatch = false
      for (const { btn, label } of cat.entries) {
        const match = !q || label.includes(q)
        btn.hidden = !match
        if (match) catHasMatch = true
      }
      cat.section.hidden = !catHasMatch
      if (q && catHasMatch) cat.section.classList.remove('collapsed')
      if (catHasMatch) anyVisible = true
    }
    debugEmpty.hidden = anyVisible
  })

  // handler do keydown 1–4 do modal de pergunta — guardado pra remover quando o modal fecha
  // (evita listener órfão se o modal abrir/fechar várias vezes, ou se `hideQuestionModal` for
  // chamado de fora sem ter passado pelo clique)
  let questionModalKeyHandler = null
  // mesma ideia, pra tela de escolha de carta roguelike (pedido do usuário: selecionar as
  // cartas pelos números também, igual já funciona na pergunta)
  let cardChoiceKeyHandler = null
  // função de parar (cancela o rAF) do watcher de controle de cada modal — mesmo padrão dos
  // handlers de teclado acima, só que via polling em vez de evento
  let questionModalGpStop = null
  let cardChoiceGpStop = null

  // suporte a controle genérico pra escolher um dos N slots (pergunta ou carta): como não existe
  // "keydown" de gamepad, poll a cada rAF enquanto o modal estiver aberto e dispara onSlot(i) na
  // borda de subida do botão mapeado pra quizSlot{i+1} nas Configurações (reusa os mesmos binds
  // já usados pro teclado 1-4 — vazio por padrão até o jogador mapear um botão)
  function watchGamepadSlots(count, onSlot) {
    let raf = null
    let prevPressed = {}
    function poll() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : []
      const pad = [...pads].find(Boolean)
      if (pad) {
        const bindings = getBindings()
        const currPressed = {}
        pad.buttons.forEach((b, i) => { currPressed[i] = !!b?.pressed })
        for (let i = 0; i < count; i += 1) {
          const idxs = bindings.gamepad.buttons[`quizSlot${i + 1}`] || []
          const rising = idxs.some((bi) => currPressed[bi] && !prevPressed[bi])
          if (rising) {
            stop()
            onSlot(i)
            return
          }
        }
        prevPressed = currPressed
      }
      raf = requestAnimationFrame(poll)
    }
    function stop() {
      if (raf) cancelAnimationFrame(raf)
      raf = null
    }
    poll()
    return stop
  }

  // Fase 9 (ideia visual 4, bloco 1): "facho de absorção" — uma partícula de luz viajando do
  // card escolhido até a nave (aproximada pelo centro-baixo da tela) no instante da escolha,
  // reforçando "esse upgrade entrou em mim" antes do overlay fechar. Puramente DOM/CSS — a
  // escolha em si já fecha o overlay logo em seguida, então isso só precisa sobreviver ~400ms.
  function cardAbsorbBeam(rect) {
    const startX = rect.left + rect.width / 2
    const startY = rect.top + rect.height / 2
    const el = document.createElement('div')
    el.className = 'card-absorb-beam'
    el.style.left = `${startX}px`
    el.style.top = `${startY}px`
    el.style.setProperty('--tx', `${window.innerWidth * 0.5 - startX}px`)
    el.style.setProperty('--ty', `${window.innerHeight * 0.82 - startY}px`)
    root.appendChild(el)
    scheduleTimeout(() => el.remove(), 450)
  }

  // pedido do usuário (item 19, cutscene "5 — partículas convergindo pro centro da tela"): em
  // vez do modal de pergunta simplesmente dar snap, um punhado de partículas nasce espalhado
  // perto das bordas e converge pro centro exato da tela (onde o modal vai aparecer) antes dele
  // ser revelado de verdade. Puramente DOM/CSS, mesmo padrão do cardAbsorbBeam acima — preciso
  // disso rodar independente do loop 3D porque o jogo já está em pausa total nesse instante.
  //
  // v0.51.0: guarda referência do container/timeout nos dois `let` de fora pra que
  // `cancelFocusCollapse()` (chamado por hideQuestionModal/unmount) consiga abortar tanto a
  // animação visual quanto o callback de reveal — sem isso, fechar o modal durante os ~350ms
  // da convergência reabria ele do nada (o onComplete disparava mesmo com o overlay escondido).
  const FOCUS_COLLAPSE_PARTICLES = 10
  const FOCUS_COLLAPSE_MS = 350 // animação CSS (280ms) + folga pro maior animationDelay aleatório (até 60ms)
  function playFocusCollapse(onComplete) {
    const container = document.createElement('div')
    container.className = 'question-focus-collapse'
    for (let i = 0; i < FOCUS_COLLAPSE_PARTICLES; i += 1) {
      const angle = (i / FOCUS_COLLAPSE_PARTICLES) * Math.PI * 2 + Math.random() * 0.4
      const radius = 55 + Math.random() * 12 // % da tela a partir do centro — nasce perto da borda
      const startX = 50 + Math.cos(angle) * radius
      const startY = 50 + Math.sin(angle) * radius
      const p = document.createElement('div')
      p.className = 'question-focus-particle'
      p.style.setProperty('--sx', `${startX}%`)
      p.style.setProperty('--sy', `${startY}%`)
      p.style.animationDelay = `${Math.random() * 60}ms`
      container.appendChild(p)
    }
    root.appendChild(container)
    focusCollapseContainer = container
    focusCollapseTimeout = scheduleTimeout(() => {
      focusCollapseTimeout = null
      focusCollapseContainer = null
      container.remove()
      onComplete()
    }, FOCUS_COLLAPSE_MS)
  }

  // burst de luz no instante exato em que o modal nasce — mesmo ponto onde as partículas do
  // playFocusCollapse convergiram; reforça o "pouso" da anticipation (princípio de Staging: guia
  // o olho pro centro bem no momento em que título/cards começam a aparecer)
  function questionModalBurst() {
    const el = document.createElement('div')
    el.className = 'question-modal-burst'
    root.appendChild(el)
    scheduleTimeout(() => el.remove(), 520)
  }

  // corpo de verdade do modal de pergunta — chamado só depois do playFocusCollapse acima
  // terminar (ver showQuestionModal no objeto retornado). Suporta explicação densa e fontes no Códice lateral.
  function revealQuestionModal({ question, alternatives, explanation, sourceUrl, sourcesText, tags, deck, isFastRetry, onPick }) {
    questionModalBurst()
    if (isFastRetry) {
      questionModalBadge.innerHTML = 'TERMINAL DE CONHECIMENTO // ANKI <span class="question-modal-retry-pill">⚡ REFORÇO DE MEMÓRIA</span>'
    } else {
      questionModalBadge.textContent = 'TERMINAL DE CONHECIMENTO // ANKI'
    }
    questionModalTitle.textContent = question
    questionModalList.innerHTML = ''

    closeCodex()

    // Guardar dados da carta para o painel de explicação pós-resposta
    lastResolvedCard = { question, explanation, sourceUrl, sourcesText, tags, deck, answer: '' }

    const hasExplanation = Boolean(explanation && explanation.trim().length > 0)
    const hasConcept = hasExplanation

    if (hasConcept) {
      codexTabBtn.style.display = 'flex'
      hudCodexQuestion.textContent = question
      hudCodexTag.textContent = (tags && tags.length > 0) ? tags.join(' • ') : (deck || 'Estudo')

      if (hasExplanation) {
        hudCodexExplanationSection.style.display = 'block'
        hudCodexExplanation.textContent = explanation
      } else {
        hudCodexExplanationSection.style.display = 'none'
      }

      if (sourceUrl || sourcesText) {
        hudCodexSourcesSection.style.display = 'block'
        hudCodexSources.innerHTML = ''
        if (sourceUrl) {
          const a = document.createElement('a')
          a.className = 'hud-codex-source-link'
          a.href = sourceUrl
          a.target = '_blank'
          a.rel = 'noopener noreferrer'
          const label = sourceUrl.length > 55 ? sourceUrl.slice(0, 52) + '...' : sourceUrl
          a.innerHTML = `<span>🔗</span> <span>${label}</span>`
          hudCodexSources.appendChild(a)
        }
        if (sourcesText && sourcesText !== sourceUrl) {
          const p = document.createElement('div')
          p.className = 'hud-codex-source-citation'
          p.textContent = sourcesText
          hudCodexSources.appendChild(p)
        }
      } else {
        hudCodexSourcesSection.style.display = 'none'
      }
    } else {
      codexTabBtn.style.display = 'none'
    }

    // ponto único de escolha (clique, tecla 1–4 ou botão de controle mapeado) — evita triplicar
    // o teardown dos 3 listeners/watchers em cada caminho
    function pick(i) {
      questionModalOverlay.hidden = true
      closeCodex()
      if (questionModalKeyHandler) {
        window.removeEventListener('keydown', questionModalKeyHandler)
        questionModalKeyHandler = null
      }
      if (questionModalGpStop) {
        questionModalGpStop()
        questionModalGpStop = null
      }
      onPick(alternatives[i].slot)
    }

    alternatives.forEach((alt, i) => {
      const hex = COLOR_MAP[alt.color] ?? '#ffffff'
      const btn = document.createElement('button')
      btn.className = 'question-modal-card'
      btn.style.borderColor = hex
      btn.style.setProperty('--stagger', i) // secondary action: cards entram em sequência, não juntos
      // pequeno hint numérico no canto do card pra lembrar que 1–4 também funciona
      btn.innerHTML = `${shapeMarkup(alt.shape, hex)}<span>${alt.text}</span><span class="question-modal-hint">${i + 1}</span>`
      btn.addEventListener('click', () => pick(i))
      questionModalList.appendChild(btn)
    })
    questionModalOverlay.hidden = false

    // se algum listener/watcher antigo ficou pendurado de um modal que não foi fechado direito,
    // remove antes de registrar o novo (defensivo, evita disparo duplo)
    if (questionModalKeyHandler) {
      window.removeEventListener('keydown', questionModalKeyHandler)
      questionModalKeyHandler = null
    }
    if (questionModalGpStop) {
      questionModalGpStop()
      questionModalGpStop = null
    }
    const bindings = getBindings()
    questionModalKeyHandler = (e) => {
      if (hasConcept && (e.code === 'KeyE' || e.key === 'e' || e.key === 'E')) {
        e.preventDefault()
        toggleCodex()
        return
      }
      if (codexDrawer.classList.contains('is-open') && (e.key === 'Escape' || e.code === 'Escape')) {
        e.preventDefault()
        closeCodex()
        return
      }
      for (let i = 0; i < alternatives.length; i += 1) {
        const codes = bindings.actions[`quizSlot${i + 1}`] || []
        if (codes.includes(e.code)) {
          e.preventDefault()
          pick(i)
          return
        }
      }
    }
    window.addEventListener('keydown', questionModalKeyHandler)
    questionModalGpStop = watchGamepadSlots(alternatives.length, pick)
  }

  const enemyBarPool = new Map()
  const lockMarkerPool = new Map()

  return {
    sceneRoot,

    setStatus({ health, maxHealth = health, score, combo, difficultyLevel }) {
      status.textContent = `Pontos: ${Math.round(score)} · Combo x${combo.toFixed(2)}`
        + (difficultyLevel ? ` · Nível ${difficultyLevel}/9` : '')
      const roundedHealth = Math.round(health)
      const isCrit = maxHealth > 0 && health / maxHealth <= LOW_HEALTH_THRESHOLD_FRAC
      if (!useOrbitalVitals) {
        if (maxHealth !== healthSegsMax) {
          healthSegsMax = maxHealth
          healthSegEls = rebuildSegs(healthSegsEl, maxHealth)
        }
        healthSegEls.forEach((seg, i) => seg.classList.toggle('fill-health', i < roundedHealth))
        healthBarWrap.classList.toggle('crit', isCrit)
      } else {
        const frac = maxHealth > 0 ? Math.max(0, Math.min(1, health / maxHealth)) : 0
        healthArc.style.strokeDashoffset = String((1 - frac) * 100)
        healthArc.classList.toggle('crit', isCrit)
        if (prevHealth == null || roundedHealth !== prevHealth) pulseOrbitalVisible(healthArc)
      }
      if (prevHealth != null && roundedHealth < prevHealth) flashVitalsHit()
      prevHealth = roundedHealth
    },

    setLives(lives, maxLives = lives) {
      const livesChanged = prevLives == null || lives !== prevLives
      if (!useOrbitalVitals) {
        if (maxLives !== livePipsMax) {
          livePipsMax = maxLives
          livesBar.innerHTML = ''
          livePips = Array.from({ length: maxLives }, () => {
            const pip = document.createElement('div')
            pip.className = 'hud-life-pip'
            livesBar.appendChild(pip)
            return pip
          })
          prevLives = null
        }
        livePips.forEach((pip, i) => {
          const filled = i < lives
          if (prevLives != null && i < prevLives && !filled) {
            pip.classList.remove('lost')
            void pip.offsetWidth
            pip.classList.add('lost')
          }
          pip.classList.toggle('filled', filled)
        })
      } else {
        if (maxLives !== orbitalLifePipsMax) {
          orbitalLifePipsMax = maxLives
          orbitalLifePips = rebuildOrbitalLifePips(maxLives)
          prevLives = null
        }
        orbitalLifePips.forEach((pip, i) => {
          const filled = i < lives
          if (prevLives != null && i < prevLives && !filled) {
            pip.classList.remove('lost')
            void pip.getBoundingClientRect()
            pip.classList.add('lost')
          }
          pip.classList.toggle('filled', filled)
        })
        if (livesChanged) pulseOrbitalVisible(orbitalLifePipsGroup)
      }
      prevLives = lives
    },

    setShield(value, maxValue) {
      const roundedShield = Math.round(value)
      if (!useOrbitalVitals) {
        if (maxValue !== shieldSegsMax) {
          shieldSegsMax = maxValue
          shieldSegEls = rebuildSegs(shieldSegsEl, maxValue)
        }
        shieldSegEls.forEach((seg, i) => seg.classList.toggle('fill-shield', i < roundedShield))
      } else {
        const frac = maxValue > 0 ? Math.max(0, Math.min(1, value / maxValue)) : 0
        shieldArc.style.strokeDashoffset = String((1 - frac) * 100)
        if (prevShield == null || roundedShield !== prevShield) pulseOrbitalVisible(shieldArc)
      }
      if (prevShield != null && roundedShield < prevShield) flashVitalsHit()
      prevShield = roundedShield
    },

    setBoost(charge, active) {
      const frac = Math.max(0, Math.min(1, charge))
      if (!useOrbitalVitals) {
        boostFill.style.width = `${frac * 100}%`
        boostBar.classList.toggle('active', !!active)
        if (charge >= 1 && prevBoostCharge < 1) {
          boostBar.classList.remove('ready-flash')
          void boostBar.offsetWidth
          boostBar.classList.add('ready-flash')
        }
      } else {
        boostArc.style.strokeDashoffset = String((1 - frac) * 100)
        boostArc.classList.toggle('active', !!active)
        if (charge >= 1 && prevBoostCharge < 1) {
          boostArc.classList.remove('ready-flash')
          void boostArc.getBoundingClientRect()
          boostArc.classList.add('ready-flash')
        }
        // ativo (impulsionando = gastando) ou variação real de carga (gasto/recarga) reacende
        // o arco; epsilon evita repique por ruído de ponto flutuante quando a carga está parada
        if (active || Math.abs(frac - prevBoostCharge) > 0.0005) pulseOrbitalVisible(boostArc)
      }
      prevBoostCharge = charge
    },

    // só tem efeito no estilo orbital (no-op no clássico, que fica fixo no canto) — chamado
    // incondicionalmente pelo game-loop a cada frame com a posição da nave projetada na tela.
    setVitalsAnchor(xFrac, yFrac) {
      if (!useOrbitalVitals) return
      vitalsCluster.style.left = `${xFrac * 100}%`
      vitalsCluster.style.top = `${yFrac * 100}%`
    },

    setQuestion(text) {
      question.hidden = text == null
      question.textContent = text ?? ''
    },

    setAlternatives(alternatives) {
      legend.hidden = alternatives == null
      legend.innerHTML = ''
      if (!alternatives) return
      alternatives.forEach((alt, i) => {
        const hex = COLOR_MAP[alt.color] ?? '#ffffff'
        const item = document.createElement('div')
        item.className = 'hud-legend-item'
        item.style.borderColor = hex
        item.innerHTML = `${shapeMarkup(alt.shape, hex)}<span class="hud-legend-text">${i + 1}. ${alt.text}</span>`
        legend.appendChild(item)
      })
    },

    setFeedback(data) {
      feedback.hidden = data == null
      feedback.innerHTML = ''
      if (!data) return

      let title, titleClass
      if (data.correct) {
        let quality = data.quality
        if (!quality && typeof data.accuracyBonus === 'number') {
          if (data.accuracyBonus >= 1.15) quality = 'perfect'
          else if (data.accuracyBonus >= 1.05) quality = 'good'
          else quality = 'ok'
        }
        if (quality === 'perfect') { title = 'PERFEITO!'; titleClass = 'perfect' }
        else if (quality === 'good') { title = 'BOM!'; titleClass = 'good' }
        else if (quality === 'ok') { title = 'ACERTOU!'; titleClass = 'ok' }
        else { title = data.bonus ? 'Bônus dourado: acertou!' : 'Acertou!'; titleClass = 'correct' }
      } else {
        title = data.bonus ? 'Bônus dourado: errou (sem penalidade).' : 'Errou.'
        titleClass = 'wrong'
      }

      const result = document.createElement('p')
      result.className = `feedback ${titleClass}`
      result.textContent = title
      feedback.appendChild(result)

      if (!data.correct) {
        const answer = document.createElement('p')
        answer.className = 'feedback-answer'
        answer.textContent = `Resposta correta: ${data.correctAnswer}`
        feedback.appendChild(answer)
      }

      const stats = document.createElement('p')
      stats.className = 'feedback-stats'
      stats.textContent = data.bonus
        ? (data.correct ? 'Buff de arma reforçado!' : 'Sem efeito na partida.')
        : `+${Math.round(data.points)} pontos · combo x${data.comboMultiplier.toFixed(2)} · vida ${data.health}`
      feedback.appendChild(stats)

      // Guardar resposta correta no card resolvido para o painel de explicação
      if (lastResolvedCard && data.correctAnswer) {
        lastResolvedCard.answer = data.correctAnswer
      }
    },

    setPaused(paused) {
      if (paused) pauseOverlay.show()
      else pauseOverlay.hide()
      root.classList.toggle('game-paused', !!paused)
    },

    // chamado por mount-game.js depois que teardown()/menu já existem no closure dela — o HUD
    // nasce antes disso, então o bind das ações reais (que precisam de teardown) vem depois,
    // separado da criação do overlay em si.
    bindPauseMenu(handlers) {
      pauseOverlay.bind(handlers)
    },

    setCountdown(n, urgent) {
      countdown.hidden = n == null
      countdown.textContent = n == null ? '' : String(n)
      countdown.classList.toggle('urgent', !!urgent)
    },

    // remaining: quantos orbes-pergunta ainda faltam achar/atirar (Fase 5) — opcional, só pra
    // texto informativo; omitir mantém o rótulo genérico
    setBossActive(active, remaining) {
      bossBanner.hidden = !active
      if (active) {
        bossBanner.textContent = typeof remaining === 'number'
          ? `CHEFE — ache e atire nos orbes de pergunta (${remaining} restante${remaining === 1 ? '' : 's'})`
          : 'CHEFE — ache e atire nos orbes de pergunta'
      }
    },

    setGoldenActive(active) {
      goldenBanner.hidden = !active
    },

    // aviso de 5s antes da cutscene de transição pro all-range (dourado surgindo / chefe se
    // aproximando) — kind null esconde
    setArenaWarning(kind, seconds) {
      if (!kind) { arenaWarning.hidden = true; return }
      arenaWarning.hidden = false
      arenaWarning.className = `hud-arena-warning kind-${kind}`
      arenaWarning.textContent = kind === 'golden'
        ? `Inimigo dourado surgindo em ${seconds}s`
        : `Chefe se aproximando em ${seconds}s`
    },

    // overlay de texto legado durante a cutscene de câmera/mapa — desativado em prol dos warning cards
    setArenaCutscene(_kind) {
      arenaCutsceneOverlay.hidden = true
    },

    setLetterbox(active) {
      root.classList.toggle('cinematic-active', !!active)
      if (active) {
        letterboxTop.classList.add('active')
        letterboxBottom.classList.add('active')
      } else {
        letterboxTop.classList.remove('active')
        letterboxBottom.classList.remove('active')
      }
    },

    showBossWarningCard({ name = 'NÚCLEO RUBRO // RED CORE', subtitle = 'FORTALEZA DEFENSIVA', warning = 'ALERTA MÁXIMO // AMEAÇA DETECTADA' } = {}) {
      bossWarningCard.innerHTML = `
        <div class="hud-boss-warning-header">⚠️ ${warning}</div>
        <div class="hud-boss-warning-name">${name}</div>
        <div class="hud-boss-warning-sub">${subtitle} // ALL-RANGE MODE ENGAGED</div>
      `
      bossWarningCard.hidden = false
    },

    hideBossWarningCard() {
      bossWarningCard.hidden = true
    },

    showGoldenWarningCard({ title = 'ANOMALIA DOURADA DETECTADA', subtitle = 'ALVO DE ALTO VALOR // ALL-RANGE MODE' } = {}) {
      goldenWarningCard.innerHTML = `
        <div class="hud-boss-warning-header" style="color:#ffd700;">✨ ${title}</div>
        <div class="hud-boss-warning-name" style="color:#fff2a8;">SINAL NÃO IDENTIFICADO</div>
        <div class="hud-boss-warning-sub" style="color:#ffe066;">${subtitle}</div>
      `
      goldenWarningCard.hidden = false
    },

    hideGoldenWarningCard() {
      goldenWarningCard.hidden = true
    },

    showLaunchBanner({ sector = 'SECTOR 01', text = 'MISSÃO INICIADA: BOA SORTE', skipText = '[ESPAÇO] PULAR DECOLAGEM' } = {}) {
      cancelTimeout(launchBannerHideTimeout)
      launchBannerHideTimeout = null
      launchBanner.classList.remove('is-hiding')
      launchBanner.innerHTML = `
        <div class="hud-launch-sector">${sector}</div>
        <div class="hud-launch-sub">${text}</div>
        <div class="hud-launch-skip">${skipText}</div>
      `
      launchBanner.hidden = false
    },

    // diagnóstico ao vivo (transição decolagem→gameplay): `hidden = true` direto cortava pra
    // `display:none` no mesmo frame do letterbox/HUD — os únicos elementos que já tinham
    // transição própria (CSS) — e o banner, sem nenhuma, dava o "pop" que sobrava no meio da
    // troca suave. Agora primeiro dispara o fade (classe `is-hiding`, opacity 0.35s em
    // hud-styles.js) e só marca `hidden` de verdade depois, quando a transição já terminou.
    hideLaunchBanner() {
      launchBanner.classList.add('is-hiding')
      cancelTimeout(launchBannerHideTimeout)
      launchBannerHideTimeout = scheduleTimeout(() => {
        launchBannerHideTimeout = null
        launchBanner.hidden = true
      }, 370)
    },

    triggerWhiteout() {
      whiteoutOverlay.classList.add('flash')
      setTimeout(() => {
        whiteoutOverlay.classList.remove('flash')
      }, 50)
    },

    showMissionComplete({ title = 'MISSION ACCOMPLISHED', subtitle = 'SETOR CONCLUÍDO COM SUCESSO' } = {}) {
      missionCompleteBanner.innerHTML = `
        <div class="hud-mission-complete-title">${title}</div>
        <div class="hud-mission-complete-sub">${subtitle}</div>
      `
      missionCompleteBanner.hidden = false
    },

    hideMissionComplete() {
      missionCompleteBanner.hidden = true
    },

    // pausa total: pergunta+alternativas centralizadas, visual de card (Fase 5/6) — usado
    // quando o jogador atira num orbe do chefe. onPick(slot) resolve a escolha.
    //
    // desde a v0.29.2, também dá pra escolher pelos NÚMEROS 1–4 (reusa os binds quizSlot1..4,
    // padrão Digit1..Digit4) em vez de ter que clicar no card — quem remapeou os números nas
    // Configurações também funciona aqui, porque leio de getBindings() em vez de hardcodar.
    showQuestionModal({ question, alternatives, explanation, sourceUrl, sourcesText, tags, deck, isFastRetry, onPick }) {
      // pedido do usuário (item 19, cutscene "5 — partículas convergindo pro centro"): em vez
      // do modal simplesmente dar snap, um burst de partículas nas bordas da tela voa pro
      // centro exato onde ele vai nascer, e só então o modal aparece de verdade. Puramente
      // DOM/CSS (mesmo padrão do cardAbsorbBeam) — o jogo já está em pausa total nesse ponto
      // (phase questionPause/bossQuestionPause), então um atraso visual de ~300ms aqui não
      // acumula com nada, é só o "beat" da cutscene.
      playFocusCollapse(() => revealQuestionModal({ question, alternatives, explanation, sourceUrl, sourcesText, tags, deck, isFastRetry, onPick }))
    },

    hideQuestionModal() {
      // v0.51.0: aborta a animação de convergência se ela estiver rodando. Sem isso, fechar o
      // modal durante os ~350ms do playFocusCollapse deixava o setTimeout do callback disparar
      // depois do overlay já escondido — o modal reabria "do nada" quando o jogador saía do
      // estado por outra via (morte do chefe no mesmo frame, debug forçando outcome).
      cancelFocusCollapse()
      questionModalOverlay.hidden = true
      closeCodex()
      if (questionModalKeyHandler) {
        window.removeEventListener('keydown', questionModalKeyHandler)
        questionModalKeyHandler = null
      }
      if (questionModalGpStop) {
        questionModalGpStop()
        questionModalGpStop = null
      }
    },

    damageFlash() {
      damageVignette.classList.remove('flash')
      void damageVignette.offsetWidth
      damageVignette.classList.add('flash')
    },

    showTierIncrease(level) {
      if (level <= 0) return
      damageVignette.classList.remove('flash')
      void damageVignette.offsetWidth
      damageVignette.classList.add('flash')

      const existing = root.querySelector('.hud-tier-warning')
      if (existing) existing.remove()

      const banner = document.createElement('div')
      banner.className = 'hud-tier-warning'
      banner.innerHTML = `
        <div class="hud-tier-warning-title">⚠️ AMEAÇA ESCALADA — NÍVEL ${level} ⚠️</div>
        <div class="hud-tier-warning-sub">Inimigos mais rápidos e agressivos detectados</div>
      `
      root.appendChild(banner)
      setTimeout(() => {
        if (banner.parentElement) banner.remove()
      }, 2500)
    },

    setLowHealth(intensity) {
      const v = Math.max(0, Math.min(1, intensity))
      lowHealthVignette.style.opacity = String(v)
    },

    // ============ MOTION LINES (boost / Swirl Blast) ============
    // `intensity` (0..1) modula a opacidade via CSS custom property — usado pelo Swirl Blast
    // (§4.6) pra forçar intensidade máxima independente do boost estar ativo ou não; omitido,
    // o CSS cai no default de 1 (comportamento antigo, inalterado).
    setMotionLines(active, intensity = null) {
      motionLines.classList.toggle('active', !!active)
      if (intensity != null) motionLines.style.setProperty('--intensity', Math.max(0, Math.min(1, intensity)))
    },

    // ============ SCREEN DISTORTION (boost) ============
    setBoostDistortion(active) {
      boostDistortion.classList.toggle('active', !!active)
    },

    // ============ BOSS TINT ============
    setBossTint(active) {
      bossTint.classList.toggle('active', !!active)
    },

    // ============ FAIXAS LATERAIS DE DANO (escudo vs vida) ============
    // escudo absorveu o hit: efeito azul com grid de escudo nas laterais
    showShieldBlock() {
      sideFlash.classList.remove('flash', 'damage')
      sideFlash.classList.add('shield')
      void sideFlash.offsetWidth
      sideFlash.classList.add('flash')
    },

    // dano foi direto na vida (sem escudo pra absorver): faixas vermelhas nas laterais
    showDamageSide() {
      sideFlash.classList.remove('flash', 'shield')
      sideFlash.classList.add('damage')
      void sideFlash.offsetWidth
      sideFlash.classList.add('flash')
    },

    setReticlePosition(xFrac, yFrac) {
      reticle.style.left = `${xFrac * 100}%`
      reticle.style.top = `${yFrac * 100}%`
    },

    // Fase 8 (VISUAL): mira muda de cor/engrossa quando há um inimigo vivo bem na frente dela
    // (combat.isAimingAtEnemy) — só hint visual, não afeta o disparo nem o teleguiado.
    setReticleAiming(active) {
      reticleRing.classList.toggle('aiming', !!active)
    },

    // Fase 9 (ideia all-range 2): horizonte artificial — passar null esconde (fora do
    // all-range). pitch/roll em radianos, vindos de rail.getArenaAttitude().
    setHorizon(pitch, roll) {
      if (pitch == null) { horizon.hidden = true; return }
      horizon.hidden = false
      const rollDeg = -roll * (180 / Math.PI)
      const pitchOffsetPx = pitch * 60
      horizonLine.style.transform = `translateY(${pitchOffsetPx}px) rotate(${rollDeg}deg)`
    },

    hitMarker(killed = false) {
      hitMarkerEl.classList.remove('active', 'kill')
      void hitMarkerEl.offsetWidth
      hitMarkerEl.classList.add('active')
      if (killed) hitMarkerEl.classList.add('kill')
      if (hitMarkerTimeout) cancelTimeout(hitMarkerTimeout)
      hitMarkerTimeout = scheduleTimeout(() => {
        hitMarkerTimeout = null
        hitMarkerEl.classList.remove('active', 'kill')
      }, killed ? 240 : 170)
    },

    spawnDamageNumber(xFrac, yFrac, value, opts = {}) {
      const el = document.createElement('div')
      el.className = 'hud-damage-number'
      if (opts.homing) el.classList.add('homing')
      if (opts.points) el.classList.add('points')
      if (opts.big) el.classList.add('big')
      if (opts.time) el.classList.add('time')
      const prefix = opts.prefix != null ? opts.prefix : ''
      el.textContent = `${prefix}${value}`
      el.style.left = `${Math.max(0, Math.min(1, xFrac)) * 100}%`
      el.style.top = `${Math.max(0, Math.min(1, yFrac)) * 100}%`
      root.appendChild(el)
      scheduleTimeout(() => el.remove(), 950)
    },

    setKillChain(count) {
      const n = Math.max(0, count | 0)
      if (n === prevKillChainCount) return
      const grew = n > prevKillChainCount
      prevKillChainCount = n
      killChainXEl.textContent = `x${n}`
      killChainXEl.classList.remove('tier2', 'tier3', 'tier4')
      if (n >= 6) killChainXEl.classList.add('tier4')
      else if (n >= 4) killChainXEl.classList.add('tier3')
      else if (n >= 2) killChainXEl.classList.add('tier2')
      if (grew) {
        killChainXEl.classList.remove('pulse')
        void killChainXEl.offsetWidth
        killChainXEl.classList.add('pulse')
      }
      killChainSegEls.forEach((seg, i) => {
        seg.classList.remove('on', 'tier2', 'tier3', 'tier4')
        if (i < n) {
          seg.classList.add('on')
          if (n >= 6) seg.classList.add('tier4')
          else if (n >= 4) seg.classList.add('tier3')
          else if (n >= 2) seg.classList.add('tier2')
        }
      })
    },

    showBossKO(bonusPoints = 0) {
      bossKoBonusEl.textContent = `+${bonusPoints} PTS`
      const coins = []
      for (let i = 0; i < 10; i++) {
        const coin = document.createElement('div')
        coin.className = 'hud-boss-ko-coin'
        const ang = (Math.PI * 2 * i) / 10
        coin.style.setProperty('--cx', `${Math.cos(ang) * 140}px`)
        coin.style.setProperty('--cy', `${Math.sin(ang) * 90}px`)
        bossKoEl.appendChild(coin)
        coins.push(coin)
      }
      bossKoEl.classList.remove('go')
      void bossKoEl.offsetWidth
      bossKoEl.classList.add('go')
      if (bossKoTimeout) cancelTimeout(bossKoTimeout)
      bossKoTimeout = scheduleTimeout(() => {
        bossKoTimeout = null
        bossKoEl.classList.remove('go')
        coins.forEach((c) => c.remove())
      }, 3500)
    },

    showErrorFloat(text = 'Errou!') {
      if (currentErrorFloat) {
        currentErrorFloat.remove()
        currentErrorFloat = null
      }
      const el = document.createElement('div')
      el.className = 'hud-error-float'

      const textSpan = document.createElement('span')
      textSpan.textContent = text
      el.appendChild(textSpan)

      // Botão de explicação no float de erro — só aparece se houver dados
      const hasExpl = lastResolvedCard && (
        (lastResolvedCard.explanation && lastResolvedCard.explanation.trim().length > 0) ||
        lastResolvedCard.sourceUrl ||
        (lastResolvedCard.sourcesText && lastResolvedCard.sourcesText.trim().length > 0)
      )
      if (hasExpl) {
        const explBtn = document.createElement('button')
        explBtn.className = 'hud-expl-inline-btn hud-expl-error-btn'
        explBtn.type = 'button'
        explBtn.innerHTML = '📖 <span>Ver Explicação</span>'
        explBtn.onclick = (e) => {
          e.stopPropagation()
          populateExplDrawer(lastResolvedCard)
          openExplDrawer()
          attachExplKeyHandler()
        }
        el.appendChild(explBtn)
      }

      const skipHint = document.createElement('span')
      skipHint.className = 'hud-error-skip-hint'
      skipHint.textContent = '[ESPAÇO] Continuar'
      el.appendChild(skipHint)

      root.appendChild(el)
      currentErrorFloat = el
    },

    hideErrorFloat() {
      if (currentErrorFloat) {
        currentErrorFloat.remove()
        currentErrorFloat = null
      }
    },

    setEnemyHealthBars(list) {
      const seen = new Set()
      for (const item of list) {
        seen.add(item.id)
        let el = enemyBarPool.get(item.id)
        if (!el) {
          el = document.createElement('div')
          el.className = 'enemy-health-bar'
          const fill = document.createElement('div')
          fill.className = 'enemy-health-bar-fill'
          el.appendChild(fill)
          root.appendChild(el)
          enemyBarPool.set(item.id, el)
        }
        el.style.left = `${item.xFrac * 100}%`
        el.style.top = `${item.yFrac * 100}%`
        el.firstChild.style.width = `${Math.max(0, Math.min(1, item.hp / item.maxHp)) * 100}%`
      }
      for (const [id, el] of enemyBarPool) {
        if (!seen.has(id)) { el.remove(); enemyBarPool.delete(id) }
      }
    },

    setLockedEnemyMarkers(list) {
      const seen = new Set()
      for (const item of list) {
        seen.add(item.id)
        let el = lockMarkerPool.get(item.id)
        if (!el) {
          el = document.createElement('div')
          el.className = 'enemy-lock-marker'
          // 3 quadrados que convergem (grande→pequeno) até sobrar só o que gira — a
          // animação de "lock-in" só roda uma vez, no instante em que o alvo é travado
          el.innerHTML = '<div class="lock-sq lock-sq-a"></div><div class="lock-sq lock-sq-b"></div><div class="lock-sq lock-sq-c"></div>'
          root.appendChild(el)
          lockMarkerPool.set(item.id, el)
        }
        el.style.left = `${item.xFrac * 100}%`
        el.style.top = `${item.yFrac * 100}%`
        el.style.setProperty('--marker-size', `${lockMarkerSizePx(item.sizeHint)}px`)
      }
      for (const [id, el] of lockMarkerPool) {
        if (!seen.has(id)) { el.remove(); lockMarkerPool.delete(id) }
      }
    },

    setBossFight(active, hp, maxHp, label = 'CHEFE', isGolden = false) {
      bossFightBar.hidden = !active
      if (active) {
        bossFightLabel.textContent = label
        bossFightBar.classList.toggle('is-golden', !!isGolden)
        bossFightFill.style.width = `${Math.max(0, Math.min(1, hp / maxHp)) * 100}%`
      }
    },

    // Radar Tático (overhaul v0.75.0): jogador sempre fixo no centro apontando "pra cima" — o
    // mundo gira ao redor dele (xFrac/yFrac já vêm projetados relativos ao frame do jogador, ver
    // game-loop.js), então o marcador do jogador não precisa mais de rotação por JS.
    setMinimap(active, data) {
      minimap.hidden = !active
      if (!active) return
      const { blips = [], allies = [], alert = false } = data
      minimap.classList.toggle('alert', !!alert)

      const seen = new Set()
      blips.forEach((b, i) => {
        seen.add(i)
        let el = minimapBlipPool.get(i)
        if (!el) {
          el = document.createElement('div')
          minimap.appendChild(el)
          minimapBlipPool.set(i, el)
        }
        const shape = b.type === 'boss' ? 'boss' : b.type === 'golden' ? 'golden' : (MINIMAP_SHAPE_BY_KIND[b.kind] || 'tri')
        const ghostCls = b.visState === 'ghost' ? ' hud-minimap-blip-ghost' : ''
        el.className = `hud-minimap-blip hud-minimap-blip-${shape}${ghostCls}`
        el.style.left = `${(b.xFrac * 0.5 + 0.5) * 100}%`
        el.style.top = `${(b.yFrac * 0.5 + 0.5) * 100}%`
      })
      for (const [i, el] of minimapBlipPool) {
        if (!seen.has(i)) { el.remove(); minimapBlipPool.delete(i) }
      }

      const seenAllies = new Set()
      allies.forEach((a, i) => {
        seenAllies.add(i)
        let el = minimapAllyPool.get(i)
        if (!el) {
          el = document.createElement('div')
          el.className = 'hud-minimap-ally'
          minimap.appendChild(el)
          minimapAllyPool.set(i, el)
        }
        el.style.left = `${(a.xFrac * 0.5 + 0.5) * 100}%`
        el.style.top = `${(a.yFrac * 0.5 + 0.5) * 100}%`
        el.style.setProperty('--ally-color', a.color)
      })
      for (const [i, el] of minimapAllyPool) {
        if (!seenAllies.has(i)) { el.remove(); minimapAllyPool.delete(i) }
      }
    },

    // QOL (Item 4 — Indicador Direcional de Ameaças Fora da Tela)
    setOffscreenThreats(threats) {
      const list = Array.isArray(threats) ? threats : []
      threatPointerPool.forEach((el, i) => {
        if (i < list.length) {
          const t = list[i]
          el.hidden = false
          el.style.left = `${t.xPct}%`
          el.style.top = `${t.yPct}%`
          el.style.transform = `translate(-50%, -50%) rotate(${t.rotDeg}deg)`
          el.classList.toggle('critical', !!t.isCritical)
          const opacity = Math.max(0.4, Math.min(1.0, 1 - (t.dist / 70) * 0.6))
          el.style.opacity = String(opacity)
        } else {
          el.hidden = true
        }
      })
    },

    // pedido do usuário: selecionar as cartas de upgrade pelos NÚMEROS também, igual já
    // funciona no modal de pergunta — reusa os mesmos binds quizSlot1..4 (Digit1..4 por padrão).
    showCardChoice({ cards, stats, collectedCards, onPick }) {
      cardChoiceList.innerHTML = ''
      cardChoiceInspector.innerHTML = ''
      cardChoiceOverlay.querySelectorAll('.hud-expl-card-row').forEach((el) => el.remove())

      // QOL (Item 2 — Inspetor de Build & Atributos)
      if (stats) {
        const statsRow = document.createElement('div')
        statsRow.className = 'inspector-stats-row'
        statsRow.innerHTML = `
          <div class="inspector-stat-pill" title="Saúde Atual / Máxima">
            <span class="stat-icon">❤️</span>
            <span class="stat-lbl">HP</span>
            <span class="stat-val">${stats.health}/${stats.maxHealth}</span>
          </div>
          <div class="inspector-stat-pill" title="Cargas de Escudo Atual / Máximo">
            <span class="stat-icon">🛡️</span>
            <span class="stat-lbl">Escudo</span>
            <span class="stat-val">${stats.shield}/${stats.maxShield}</span>
          </div>
          <div class="inspector-stat-pill" title="Projéteis Disparados por Tiro">
            <span class="stat-icon">🚀</span>
            <span class="stat-lbl">Tiros</span>
            <span class="stat-val">${stats.projectileCount}x</span>
          </div>
          <div class="inspector-stat-pill" title="Alvos Simultâneos da Carga Teleguiada">
            <span class="stat-icon">🎯</span>
            <span class="stat-lbl">Homing</span>
            <span class="stat-val">${stats.homingTargets}</span>
          </div>
          <div class="inspector-stat-pill" title="Membros do Esquadrão Recrutados">
            <span class="stat-icon">👥</span>
            <span class="stat-lbl">Ala</span>
            <span class="stat-val">${stats.wingmanCount}/4</span>
          </div>
        `
        cardChoiceInspector.appendChild(statsRow)
      }

      if (collectedCards && collectedCards.size > 0) {
        const entries = Array.from(collectedCards.entries()).filter(([_, count]) => count > 0)
        if (entries.length > 0) {
          const upgradesWrap = document.createElement('div')
          upgradesWrap.className = 'inspector-upgrades-wrap'
          const upgradesLabel = document.createElement('span')
          upgradesLabel.className = 'inspector-upgrades-label'
          upgradesLabel.textContent = 'Upgrades Instalados:'
          upgradesWrap.appendChild(upgradesLabel)

          const chipsRow = document.createElement('div')
          chipsRow.className = 'inspector-chips-row'
          for (const [id, count] of entries) {
            const cardDef = CARD_MAP.get(id)
            if (!cardDef) continue
            const chip = document.createElement('div')
            chip.className = `inspector-chip category-${cardDef.category}`
            chip.title = `${cardDef.label} (x${count}): ${cardDef.description}`
            chip.innerHTML = `
              <span class="chip-icon">${cardDef.icon || '📦'}</span>
              <span class="chip-name">${cardDef.label}</span>
              <span class="chip-count">x${count}</span>
            `
            chipsRow.appendChild(chip)
          }
          upgradesWrap.appendChild(chipsRow)
          cardChoiceInspector.appendChild(upgradesWrap)
        }
      }

      const close = () => {
        cardChoiceOverlay.hidden = true
        cardChoiceInspector.innerHTML = ''
        cardChoiceOverlay.querySelectorAll('.hud-expl-card-row').forEach((el) => el.remove())
        closeExplDrawer()
        detachExplKeyHandler()
        if (cardChoiceKeyHandler) {
          window.removeEventListener('keydown', cardChoiceKeyHandler)
          cardChoiceKeyHandler = null
        }
        if (cardChoiceGpStop) {
          cardChoiceGpStop()
          cardChoiceGpStop = null
        }
      }
      function pick(i) {
        cardAbsorbBeam(cardChoiceList.children[i].getBoundingClientRect())
        close()
        onPick(cards[i])
      }
      cards.forEach((card, i) => {
        const el = document.createElement('button')
        el.className = `roguelike-card category-${card.category}`
        el.style.setProperty('--card-stagger', `${i * 90}ms`)
        const catLabel = CARD_CATEGORY_LABEL[card.category] ?? card.category
        el.innerHTML = `
          <div class="card-top-row">
            <span class="card-category">${catLabel}</span>
            <span class="card-key-badge">${i + 1}</span>
          </div>
          <div class="card-icon-wrap">
            <span class="card-icon">${card.icon || '✨'}</span>
          </div>
          <h4 class="card-name">${card.label}</h4>
          <p class="card-desc">${card.description}</p>
        `
        el.addEventListener('click', () => pick(i))
        cardChoiceList.appendChild(el)
      })

      // Botão de explicação da resposta na tela de cartas (acerto)
      const hasExpl = lastResolvedCard && (
        (lastResolvedCard.explanation && lastResolvedCard.explanation.trim().length > 0) ||
        lastResolvedCard.sourceUrl ||
        (lastResolvedCard.sourcesText && lastResolvedCard.sourcesText.trim().length > 0)
      )
      if (hasExpl) {
        const explRow = document.createElement('div')
        explRow.className = 'hud-expl-card-row'
        const explBtn = document.createElement('button')
        explBtn.className = 'hud-expl-inline-btn hud-expl-card-btn'
        explBtn.type = 'button'
        explBtn.innerHTML = '📖 <span>Explicação da Resposta</span>'
        explBtn.onclick = (e) => {
          e.stopPropagation()
          populateExplDrawer(lastResolvedCard)
          openExplDrawer()
          attachExplKeyHandler()
        }
        explRow.appendChild(explBtn)
        cardChoiceOverlay.appendChild(explRow)
      }

      cardChoiceOverlay.hidden = false

      if (cardChoiceKeyHandler) {
        window.removeEventListener('keydown', cardChoiceKeyHandler)
        cardChoiceKeyHandler = null
      }
      if (cardChoiceGpStop) {
        cardChoiceGpStop()
        cardChoiceGpStop = null
      }
      const bindings = getBindings()
      cardChoiceKeyHandler = (e) => {
        for (let i = 0; i < cards.length; i += 1) {
          const codes = bindings.actions[`quizSlot${i + 1}`] || []
          if (codes.includes(e.code)) {
            e.preventDefault()
            pick(i)
            return
          }
        }
      }
      window.addEventListener('keydown', cardChoiceKeyHandler)
      cardChoiceGpStop = watchGamepadSlots(cards.length, pick)
    },

    hideCardChoice() {
      if (cardChoiceKeyHandler) {
        window.removeEventListener('keydown', cardChoiceKeyHandler)
        cardChoiceKeyHandler = null
      }
      if (cardChoiceGpStop) {
        cardChoiceGpStop()
        cardChoiceGpStop = null
      }
      cardChoiceOverlay.hidden = true
      cardChoiceOverlay.querySelectorAll('.hud-expl-card-row').forEach((el) => el.remove())
    },

    updateCollectedCards(cardsMap) {
      if (!cardsMap) {
        cardsTray.innerHTML = ''
        prevCardsSignature = ''
        return
      }
      const entries = Array.from(cardsMap.entries()).filter(([_, count]) => count > 0)
      const sig = entries.map(([id, count]) => `${id}:${count}`).sort().join(';')
      if (sig === prevCardsSignature) return
      prevCardsSignature = sig

      cardsTray.innerHTML = ''
      for (const [id, count] of entries) {
        const card = CARD_MAP.get(id)
        if (!card) continue
        const catColor = CARD_CATEGORY_COLOR[card.category] || '#3ea6ff'
        const catLabel = CARD_CATEGORY_LABEL[card.category] || card.category

        const chip = document.createElement('div')
        chip.className = 'hud-card-chip'
        chip.style.setProperty('--card-color', catColor)
        chip.style.setProperty('--card-glow', `${catColor}44`)

        chip.innerHTML = `
          <span class="hud-card-icon">${card.icon || '📦'}</span>
          <span class="hud-card-count">x${count}</span>
          <div class="hud-card-tooltip">
            <div class="hud-card-tooltip-header">
              <span class="hud-card-tooltip-title">${card.label}</span>
              <span class="hud-card-tooltip-cat">${catLabel}</span>
            </div>
            <div class="hud-card-tooltip-body">${card.description}</div>
            <div class="hud-card-tooltip-stacks">Nível acumulado: x${count}</div>
          </div>
        `
        cardsTray.appendChild(chip)
      }
    },

    // 4 slots fixos (ver criação de abilityHexEls acima) — states vem de combat.getAbilityStates(),
    // sempre na ordem Falco/Peppy/Slippy/Miyu (mesma de WINGMAN_PROFILES).
    setSquadronAbilities(states) {
      if (!Array.isArray(states) || states.length === 0) return
      const sig = states.map((s) => `${s.id}:${s.recruited ? 1 : 0}:${s.active ? 1 : 0}:${Math.ceil(s.cooldownRemaining)}`).join(';')
      if (sig === prevAbilitySignature) return
      prevAbilitySignature = sig

      states.forEach((s, i) => {
        const slot = abilityHexEls[i]
        if (!slot) return
        const colorHex = typeof s.color === 'number' ? `#${s.color.toString(16).padStart(6, '0')}` : '#38bdf8'
        slot.el.style.setProperty('--ab-color', colorHex)
        slot.icon.textContent = SQUAD_ABILITY_ICONS[s.abilityId] || ''
        slot.el.title = s.recruited ? (s.name || '') : ''

        const frac = s.cooldownTotal > 0 ? Math.max(0, Math.min(1, s.cooldownRemaining / s.cooldownTotal)) : 0
        slot.sweep.style.background = frac > 0
          ? `conic-gradient(rgba(6,8,12,0.88) 0deg, rgba(6,8,12,0.88) ${frac * 360}deg, transparent ${frac * 360}deg)`
          : 'none'
        // Pedido do usuário: mostrar o número o tempo TODO do cooldown, não só nos 3s finais —
        // "pra eu saber quanto tempo vai levar até eles estarem capazes de realizar suas gimmicks"
        slot.num.textContent = (s.recruited && !s.active && s.cooldownRemaining > 0)
          ? String(Math.ceil(s.cooldownRemaining)) : ''

        slot.el.classList.toggle('locked', !s.recruited)
        slot.el.classList.toggle('ready', s.recruited && s.ready)
        slot.el.classList.toggle('cooling', s.recruited && !s.ready && !s.active)
        slot.el.classList.toggle('active', s.recruited && s.active)
      })
    },

    // Sub-ícones de cooldown (Documento de Implementação, item 3) — um círculo empilhado por
    // carta com cooldown PRÓPRIO que o jogador já tem (ver combat/wingmen.js →
    // getSubAbilityStates). Sem ordenação por urgência (pedido explícito do usuário); a ordem é a
    // mesma em que `subs` chega. Reconstrói só quando o SET de ids muda — reaproveita os elementos
    // entre frames pro estado ready/cooling só trocar de classe, não recriar DOM toda hora.
    setSquadronSubAbilities(groups) {
      if (!Array.isArray(groups) || groups.length === 0) return
      groups.forEach((g, i) => {
        const slot = abilityHexEls[i]
        if (!slot) return
        const subs = g.subs || []
        const seenIds = new Set()
        for (const s of subs) {
          seenIds.add(s.id)
          let entry = slot.subIconEls.get(s.id)
          if (!entry) {
            const el = document.createElement('div')
            el.className = 'hud-ability-subicon'
            el.innerHTML = '<span class="hud-ability-subicon-glyph"></span>'
            slot.subcolumn.appendChild(el)
            entry = { el, glyph: el.querySelector('.hud-ability-subicon-glyph') }
            slot.subIconEls.set(s.id, entry)
          }
          const colorHex = typeof s.color === 'number' ? `#${s.color.toString(16).padStart(6, '0')}` : '#38bdf8'
          entry.el.style.setProperty('--sub-color', colorHex)
          entry.glyph.textContent = s.icon || ''
          entry.el.title = s.ready ? '' : String(Math.ceil(s.cooldownRemaining))
          entry.el.classList.toggle('ready', !!s.ready)
          entry.el.classList.toggle('cooling', !s.ready)
        }
        // Remove sub-ícones cuja carta não está mais na lista (ex.: reset de partida)
        for (const [id, entry] of slot.subIconEls) {
          if (!seenIds.has(id)) {
            entry.el.remove()
            slot.subIconEls.delete(id)
          }
        }
      })
    },

    // QOL (Item 3 — Barra / Indicador de Recarga do Comando de Ofensiva [D])
    setSquadronCommandState(cmdState) {
      if (!cmdState) return
      const { mode = 'free', durationRemaining = 0, durationMax = 6, cooldownRemaining = 0, cooldownMax = 10 } = cmdState
      const isActive = mode === 'focus' && durationRemaining > 0
      const isCooling = !isActive && cooldownRemaining > 0

      squadCommandWidget.classList.toggle('active', isActive)
      squadCommandWidget.classList.toggle('cooling', isCooling)
      squadCommandWidget.classList.toggle('ready', !isActive && !isCooling)

      if (isActive) {
        squadCmdTimer.textContent = `${durationRemaining.toFixed(1)}s`
        squadCmdFill.style.width = `${Math.max(0, Math.min(100, (durationRemaining / durationMax) * 100))}%`
      } else if (isCooling) {
        squadCmdTimer.textContent = `${Math.ceil(cooldownRemaining)}s`
        squadCmdFill.style.width = `${Math.max(0, Math.min(100, ((cooldownMax - cooldownRemaining) / cooldownMax) * 100))}%`
      } else {
        squadCmdTimer.textContent = 'PRONTO'
        squadCmdFill.style.width = '100%'
      }
    },

    // Contador de cooldown do Swirl Blast (pedido do usuário) — mesmo padrão visual do widget
    // de FOCO acima, ready/cooling só (sem "active": o Swirl dispara instantâneo, não tem janela
    // de duração pra mostrar).
    setSwirlCooldown(cooldownMs, totalMs) {
      const isCooling = cooldownMs > 0
      swirlCooldownWidget.classList.toggle('cooling', isCooling)
      swirlCooldownWidget.classList.toggle('ready', !isCooling)
      if (isCooling) {
        swirlCmdTimer.textContent = `${(cooldownMs / 1000).toFixed(1)}s`
        swirlCmdFill.style.width = `${Math.max(0, Math.min(100, ((totalMs - cooldownMs) / totalMs) * 100))}%`
      } else {
        swirlCmdTimer.textContent = 'PRONTO'
        swirlCmdFill.style.width = '100%'
      }
    },

    showSquadronNotice({ mode, targetCount = 1, hasLocked = false, remaining = 0, xFrac = 0.5, yFrac = 0.5 }) {
      cancelTimeout(squadronNoticeTimeout)
      squadronNotice.classList.remove('active', 'focus', 'cooldown')

      const icon = squadronNotice.querySelector('.hud-squadron-notice-icon')
      const text = squadronNotice.querySelector('.hud-squadron-notice-text')
      const sub = squadronNotice.querySelector('.hud-squadron-notice-sub')

      if (mode === 'focus') {
        squadronNotice.classList.add('focus')
        if (icon) icon.textContent = '🎯'
        if (text) text.textContent = hasLocked ? 'ESQUADRÃO: FOCO NO ALVO TRAVADO!' : 'ESQUADRÃO: CONCENTRAR FOGO!'
        if (sub) sub.textContent = 'Volta ao normal sozinho em 6s'
      } else if (mode === 'cooldown') {
        // pedido do usuário: comando agora tem cooldown de 10s após os 6s de duração — sem esse
        // aviso, apertar [D] durante o cooldown não fazia nada visível e parecia bugado.
        squadronNotice.classList.add('cooldown')
        if (icon) icon.textContent = '⏳'
        if (text) text.textContent = 'ESQUADRÃO: COMANDO EM RECARGA'
        if (sub) sub.textContent = `Disponível em ${Math.ceil(remaining)}s`
      } else {
        if (icon) icon.textContent = '🚀'
        if (text) text.textContent = 'ESQUADRÃO: DISPERSÃO / ATAQUE LIVRE'
        if (sub) sub.textContent = '[D] Focar Alvos'
      }

      squadronNotice.style.left = `${(xFrac * 100).toFixed(1)}%`
      squadronNotice.style.top = `${(yFrac * 100).toFixed(1)}%`
      squadronNotice.classList.add('active')

      squadronNoticeTimeout = scheduleTimeout(() => {
        squadronNotice.classList.remove('active')
      }, 2200)
    },

    // Overhaul de Personalidade (Ideia 3) — payload vem de combat/wingmen.js via
    // wingman-radio.js: { pilotId, name, color, text, isAbility }. color já chega como string CSS
    // ('#rrggbb'). Trigger avulso: interrompe qualquer fila/animação em andamento NA REGIÃO
    // escolhida e toca na hora. Regra "não pode estar nas 2 regiões ao mesmo tempo pro MESMO
    // piloto" (Documento de Implementação, item 2.1-2.3): se a região OPOSTA está tocando esse
    // mesmo pilotId, esconde ela primeiro (fade-out rápido, sem encadear a fila dela).
    showWingmanRadio(payload) {
      const region = payload.isAbility ? wingmanRadioRegionAbility : wingmanRadioRegionTrivial
      const otherRegion = payload.isAbility ? wingmanRadioRegionTrivial : wingmanRadioRegionAbility
      if (otherRegion.currentPilotId() === payload.pilotId) otherRegion.forceHide()
      region.show(payload)
    },

    // Fila garantida — ex.: rajada de "prontidão" do comando de foco, onde os até 4 pilotos
    // precisam falar em SEQUÊNCIA, sem se atropelar nem competir pelo cooldown do dispatcher (que
    // já foi ignorado lá na origem, ver wingman-radio.js → getLine()). Se já tem algo tocando,
    // entra no fim da fila; senão começa na hora. Hoje só carrega falas triviais (focus_ready) —
    // ver combat/wingmen.js → toggleCommand() — então a fila sempre roda na região inferior.
    showWingmanRadioQueue(payloads) {
      if (!payloads || payloads.length === 0) return
      for (const p of payloads) {
        if (wingmanRadioRegionAbility.currentPilotId() === p.pilotId) wingmanRadioRegionAbility.forceHide()
      }
      wingmanRadioRegionTrivial.showQueue(payloads)
    },

    updateSquadronNoticePosition(xFrac, yFrac) {
      if (!squadronNotice.classList.contains('active')) return
      squadronNotice.style.left = `${(xFrac * 100).toFixed(1)}%`
      squadronNotice.style.top = `${(yFrac * 100).toFixed(1)}%`
    },

    showDebrisStormNotice({ active = true, cleared = false, title, sub } = {}) {
      cancelTimeout(stormWarningTimeout)
      stormWarning.classList.remove('active', 'cleared')

      const icon = stormWarning.querySelector('.hud-storm-warning-icon')
      const titleEl = stormWarning.querySelector('.hud-storm-warning-title')
      const subEl = stormWarning.querySelector('.hud-storm-warning-sub')

      if (cleared) {
        stormWarning.classList.add('cleared')
        if (icon) icon.textContent = '✅'
        if (titleEl) titleEl.textContent = title || 'CAMPO DE DETRITOS SUPERADO'
        if (subEl) subEl.textContent = sub || 'TURBULÊNCIA CESSADA // ROTA LIVRE'
      } else {
        if (icon) icon.textContent = '⚠️'
        if (titleEl) titleEl.textContent = title || 'TEMPESTADE DE DETRITOS DETECTADA'
        if (subEl) subEl.textContent = sub || 'CAMPO DENSO DE ASTEROIDES // MANOBRAS EVASIVAS'
      }

      stormWarning.classList.add('active')
      const duration = cleared ? 2500 : 3600
      stormWarningTimeout = scheduleTimeout(() => {
        stormWarning.classList.remove('active')
      }, duration)
    },

    showCombatEventBanner(title, subtitle, type = 'squad-wipe') {
      const banner = document.createElement('div')
      banner.className = `hud-combat-event-banner ${type}`

      const titleEl = document.createElement('div')
      titleEl.className = 'hud-combat-event-title'
      titleEl.textContent = title

      const subEl = document.createElement('div')
      subEl.className = 'hud-combat-event-sub'
      subEl.textContent = subtitle

      banner.appendChild(titleEl)
      banner.appendChild(subEl)
      root.appendChild(banner)

      scheduleTimeout(() => {
        if (banner.parentNode) banner.parentNode.removeChild(banner)
      }, 2300)
    },

    debug: {
      setVisible(v) {
        debugPanel.hidden = !v
        if (v) {
          renderDebugStats()
          startDebugStatsLoop()
        } else {
          stopDebugStatsLoop()
        }
      },
      refreshStats() {
        renderDebugStats()
      },
      bind(handlers) {
        for (const [id, fn] of Object.entries(handlers)) {
          if (debugButtons[id]) debugButtons[id].onclick = fn
        }
      },
      setToggleActive(id, active) {
        if (debugButtons[id]) debugButtons[id].classList.toggle('active', !!active)
      },
      // recebe uma função sem args que devolve um snapshot plano do estado da partida (ver
      // getDebugStatsSnapshot em mount-game.js) — mantém hud-game.js sem importar nada de
      // combat/rail/session diretamente, só consome o objeto pronto, igual aos outros métodos
      // do HUD que recebem dados já computados por quem chama.
      setStatsProvider(fn) { debugStatsProvider = fn },
    },

    unmount() {
      // v0.51.0: cancela TUDO que estava agendado (damage numbers, hit marker, absorb beam,
      // focus collapse, error float) e aborta o collapse se ele ainda estiver em voo. Sem
      // isso, um HUD remontado num novo jogo antes do próximo timeout vencer disparava
      // callbacks em nós já desanexados do DOM — não quebrava nada, mas era exatamente o
      // tipo de vazamento silencioso que aparece como bug intermitente depois de N partidas.
      cancelFocusCollapse()
      stopDebugStatsLoop()
      cancelTimeout(squadronNoticeTimeout)
      squadronNoticeTimeout = null
      squadronNotice.classList.remove('active')
      cancelTimeout(stormWarningTimeout)
      stormWarningTimeout = null
      stormWarning.classList.remove('active')
      wingmanRadioRegionTrivial.unmount()
      wingmanRadioRegionAbility.unmount()
      cancelTimeout(launchBannerHideTimeout)
      launchBannerHideTimeout = null
      for (const id of pendingTimeouts) clearTimeout(id)
      pendingTimeouts.clear()
      hitMarkerTimeout = null

      // se o HUD for desmontado com o modal aberto (fim de setor, teardown), remove o listener
      // global de keydown e o watcher de controle pra não vazar entre sessões
      if (questionModalKeyHandler) {
        window.removeEventListener('keydown', questionModalKeyHandler)
        questionModalKeyHandler = null
      }
      if (cardChoiceKeyHandler) {
        window.removeEventListener('keydown', cardChoiceKeyHandler)
        cardChoiceKeyHandler = null
      }
      if (questionModalGpStop) {
        questionModalGpStop()
        questionModalGpStop = null
      }
      if (cardChoiceGpStop) {
        cardChoiceGpStop()
        cardChoiceGpStop = null
      }
      // limpar paineis laterais
      closeCodex()
      closeExplDrawer()
      detachExplKeyHandler()
      lastResolvedCard = null
      // se a pausa for desmontada com o painel de opções (rebind de teclado) aberto, sem isso o
      // listener global de keydown daquela seção vazava pra depois do fim da partida
      pauseOverlay.hide()
      root.classList.remove('cinematic-active', 'game-paused')
      cardsTray.innerHTML = ''
      prevCardsSignature = ''
      root.innerHTML = ''
    },
  }
}
