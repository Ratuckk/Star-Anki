// CSS injetado (uma vez por página) dos elementos "extras" do HUD de jogo — números de dano,
// hit marker, vignettes, motion lines, faixas de dano, aviso/cutscene de transição all-range,
// modal de pergunta do chefe. Extraído de hud.js na refatoração que separa cada tela em seu
// próprio arquivo. Só createGameHud (hud-game.js) chama isso. Zero mudança de comportamento.
export function injectHudExtraStyles() {
  if (document.getElementById('star-anki-hud-extra-styles')) return
  const style = document.createElement('style')
  style.id = 'star-anki-hud-extra-styles'
  style.textContent = `
/* ============ NÚMEROS DE DANO FLUTUANTES ============ */
.hud-damage-number {
  position: absolute;
  transform: translate(-50%, -50%) scale(0.7);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-weight: 900;
  font-size: 18px;
  color: #ffffff;
  text-shadow: 0 0 6px rgba(0,0,0,0.95), 0 1px 2px rgba(0,0,0,0.95);
  pointer-events: none;
  z-index: 30;
  will-change: transform, opacity;
  animation: hud-damage-float 900ms cubic-bezier(0.2, 0.9, 0.3, 1) forwards;
}
.hud-damage-number.homing {
  color: #2bff88;
  text-shadow: 0 0 10px rgba(43,255,136,0.85), 0 0 3px rgba(0,0,0,0.95);
}
/* Popup de pontos por abate — "Arcade Neon" (opção 1 de 5 escolhida pelo usuário no documento
   de design de feedback de combate): fonte pixel de verdade, contorno preto grosso, pop de
   escala tipo "carimbo" e uma estrela de fundo que estoura atrás do número. Some com o combo de
   abates (hud-kill-chain) e a tela de K.O. do chefe (hud-boss-ko), ambos logo abaixo. */
.hud-damage-number.points {
  font-family: 'Press Start 2P', ui-monospace, monospace;
  font-size: 13px;
  color: #ffe600;
  -webkit-text-stroke: 2px #000;
  paint-order: stroke fill;
  text-shadow: none;
  animation: hud-points-punch 950ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
.hud-damage-number.points::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 30px;
  height: 30px;
  background: #ffe600;
  clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
  transform: translate(-50%, -50%) scale(0);
  z-index: -1;
  animation: hud-star-burst 420ms ease-out forwards;
}
@keyframes hud-points-punch {
  0%   { transform: translate(-50%, -50%) scale(0.2); opacity: 0; }
  12%  { transform: translate(-50%, -50%) scale(1.35); opacity: 1; }
  22%  { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  75%  { transform: translate(-50%, calc(-50% - 26px)) scale(1); opacity: 1; }
  100% { transform: translate(-50%, calc(-50% - 40px)) scale(0.9); opacity: 0; }
}
@keyframes hud-star-burst {
  0%   { transform: translate(-50%, -50%) scale(0) rotate(0deg); opacity: 0.9; }
  60%  { transform: translate(-50%, -50%) scale(1.3) rotate(35deg); opacity: 0.9; }
  100% { transform: translate(-50%, -50%) scale(1.6) rotate(50deg); opacity: 0; }
}
.hud-damage-number.big { font-size: 26px; }
.hud-damage-number.points.big { font-size: 16px; }
/* pedido do usuário: número roxo pequeno + ícone de ampulheta acima do redutor de tempo
   destruído, deixando claro quanto tempo aquele kill específico reduziu do ciclo */
.hud-damage-number.time {
  color: #c77dff;
  font-size: 13px;
  text-shadow: 0 0 8px rgba(199,125,255,0.75), 0 0 2px rgba(0,0,0,0.95);
}
@keyframes hud-damage-float {
  0%   { transform: translate(-50%, -50%) translateY(4px) scale(0.6);  opacity: 0; }
  18%  { transform: translate(-50%, -50%) translateY(-4px) scale(1.18); opacity: 1; }
  45%  { transform: translate(-50%, -50%) translateY(-18px) scale(1); opacity: 1; }
  100% { transform: translate(-50%, -50%) translateY(-48px) scale(0.9); opacity: 0; }
}

/* ============ TEXTO FLUTUANTE DE ERRO (v0.29.6) ============ */
/* substitui o painel grande de feedback quando o jogador erra uma pergunta — pequeno,
   vermelho, sobe e some sozinho em 3s, sem travar a leitura da tela */
.hud-error-float {
  position: absolute;
  left: 50%;
  top: 38%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-weight: 900;
  font-size: 20px;
  letter-spacing: 0.02em;
  color: #ff4d4d;
  text-shadow: 0 0 8px rgba(255, 40, 40, 0.85), 0 1px 2px rgba(0,0,0,0.95);
  pointer-events: auto;
  z-index: 30;
  animation: hud-error-float-anim 5000ms cubic-bezier(0.2, 0.9, 0.3, 1) forwards;
}
.hud-error-skip-hint {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #94a3b8;
  text-shadow: none;
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(148, 163, 184, 0.35);
  padding: 3px 10px;
  border-radius: 4px;
}
@keyframes hud-error-float-anim {
  0%   { transform: translate(-50%, -50%) translateY(8px)  scale(0.7); opacity: 0; }
  10%  { transform: translate(-50%, -50%) translateY(-2px) scale(1.05); opacity: 1; }
  85%  { transform: translate(-50%, -50%) translateY(-10px) scale(1); opacity: 1; }
  100% { transform: translate(-50%, -50%) translateY(-24px) scale(0.95); opacity: 0; }
}

/* ============ HIT MARKER (X na mira) ============ */
.hit-marker {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 26px;
  height: 26px;
  pointer-events: none;
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.35);
  transition: opacity 70ms ease-out, transform 90ms ease-out;
}
.hit-marker span {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 3px;
  height: 13px;
  border-radius: 2px;
  background: #ffffff;
  box-shadow: 0 0 6px rgba(255,255,255,0.9), 0 0 2px rgba(0,0,0,0.9);
}
.hit-marker span:nth-child(1) { transform: translate(-50%, -50%) rotate(45deg); }
.hit-marker span:nth-child(2) { transform: translate(-50%, -50%) rotate(-45deg); }
.hit-marker.active {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1.05);
}
.hit-marker.active.kill span {
  background: #ff3a3a;
  box-shadow: 0 0 9px rgba(255, 58, 58, 0.95), 0 0 2px rgba(0,0,0,0.9);
}

/* ============ VIGNETTE PERSISTENTE DE VIDA BAIXA ============ */
.hud-low-health-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 400ms ease-out;
  background:
    radial-gradient(ellipse 120% 100% at center, transparent 30%, rgba(130, 0, 25, 0.55) 100%),
    radial-gradient(ellipse 150% 120% at center, transparent 50%, rgba(255, 30, 60, 0.15) 100%);
  z-index: 4;
}

/* ============ FEEDBACK ESCALONADO (PERFEITO/BOM/ACERTOU) ============ */
.feedback.perfect {
  font-size: 30px;
  letter-spacing: 2px;
  color: #ffd54a;
  text-shadow: 0 0 14px rgba(255, 213, 74, 0.85), 0 0 3px rgba(0,0,0,0.9);
  animation: feedback-punch 500ms cubic-bezier(0.2, 1.1, 0.3, 1);
}
.feedback.good {
  font-size: 26px;
  color: #2bff88;
  text-shadow: 0 0 12px rgba(43,255,136,0.75), 0 0 3px rgba(0,0,0,0.9);
  animation: feedback-punch 420ms cubic-bezier(0.2, 1.1, 0.3, 1);
}
.feedback.ok {
  font-size: 22px;
  color: #ffffff;
}
@keyframes feedback-punch {
  0%   { transform: scale(0.7); opacity: 0; }
  45%  { transform: scale(1.18); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

/* ============ ÍCONES DE COOLDOWN DO ESQUADRÃO (v0.72.0) ============ */
/* 4 emblemas hexagonais ao lado do placar (Opção B do canvas de design, escolhida pelo usuário):
   ecoa o clip-path triangular já usado nos pips de vida, sem empurrar o resto da HUD — mora
   dentro de .hud-topbar-row, num flex row junto do texto de pontos/combo, então a largura real
   do placar nunca colide com os ícones (ao contrário de um left fixo "chutado"). */
.hud-squad-abilities {
  display: flex;
  gap: 5px;
  pointer-events: none;
}
.hud-ability-slot {
  position: relative;
}
.hud-ability-hex {
  position: relative;
  width: 34px;
  height: 29px;
  clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
  background: rgba(20, 24, 32, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ab-color, #38bdf8);
  transition: filter 0.2s ease;
}
.hud-ability-hex::before {
  content: '';
  position: absolute;
  inset: 0;
  clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
  box-shadow: inset 0 0 0 2px #333944;
  transition: box-shadow 0.2s ease;
}
.hud-ability-icon {
  position: relative;
  z-index: 2;
  font-size: 14px;
  line-height: 1;
  filter: drop-shadow(0 1px 2px #000);
}
.hud-ability-sweep {
  position: absolute;
  inset: 0;
  z-index: 1;
}
.hud-ability-num {
  position: absolute;
  bottom: -5px;
  right: -5px;
  z-index: 5;
  min-width: 14px;
  height: 14px;
  padding: 0 2px;
  border-radius: 7px;
  background: rgba(8, 10, 14, 0.9);
  box-shadow: inset 0 0 0 1px #333944;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 2px #000;
}
.hud-ability-num:empty { display: none; }
/* Bloqueado: piloto ainda não recrutado — contorno vazado, sem preenchimento nem glifo visível */
.hud-ability-hex.locked {
  background: transparent;
}
.hud-ability-hex.locked::before {
  box-shadow: inset 0 0 0 1.5px #333944;
}
.hud-ability-hex.locked .hud-ability-icon { opacity: 0.28; }
/* Pronta: contorno + glow pulsam suavemente na cor do piloto */
@keyframes hud-ability-ready-pulse {
  0%, 100% { filter: drop-shadow(0 0 1px var(--ab-color)); }
  50%      { filter: drop-shadow(0 0 6px var(--ab-color)); }
}
.hud-ability-hex.ready {
  animation: hud-ability-ready-pulse 2s ease-in-out infinite;
}
.hud-ability-hex.ready::before {
  box-shadow: inset 0 0 0 2px var(--ab-color);
}
/* Em cooldown: fatia cônica escura varre o hexágono (hud-ability-sweep, --pct setado via JS) */
.hud-ability-hex.cooling::before {
  box-shadow: inset 0 0 0 2px #333944;
}
/* Ativa: contorno branco sólido + glow forte fixo, sem pulsar — a habilidade está acontecendo agora */
.hud-ability-hex.active {
  filter: drop-shadow(0 0 9px var(--ab-color));
}
.hud-ability-hex.active::before {
  box-shadow: inset 0 0 0 2.5px #fff;
}

/* Coluna que empilha o widget de FOCO do esquadrão + o contador de cooldown do Swirl Blast no
   mesmo slot horizontal do topbar (pedido do usuário: Swirl "embaixo do mesmo local" do foco). */
.hud-squad-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

/* ============ WIDGET DE COMANDO DO ESQUADRÃO [D] (Item 3 — QOL v0.76.0) ============ */
.hud-squad-command-widget {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 2px 7px;
  background: rgba(15, 23, 42, 0.85);
  border: 1.5px solid #334155;
  border-radius: 6px;
  min-width: 62px;
  height: 32px;
  box-sizing: border-box;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  pointer-events: none;
  transition: all 0.2s ease;
}
.hud-squad-command-badge {
  display: flex;
  align-items: center;
  gap: 4px;
}
.hud-cmd-key {
  background: #1e293b;
  border: 1px solid #475569;
  border-radius: 3px;
  padding: 0 3px;
  font-size: 8px;
  font-weight: 800;
  color: #38bdf8;
  line-height: 1.2;
}
.hud-cmd-label {
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #94a3b8;
  text-transform: uppercase;
}
.hud-cmd-meter {
  width: 100%;
  height: 3px;
  background: rgba(30, 41, 59, 0.9);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 1px;
}
.hud-cmd-meter-fill {
  height: 100%;
  width: 100%;
  border-radius: 2px;
  transition: width 0.1s linear, background-color 0.2s ease;
}
.hud-cmd-timer {
  font-size: 7.5px;
  font-weight: 800;
  letter-spacing: 0.05em;
  color: #64748b;
  line-height: 1;
}

/* Modificadores de Estado */
.hud-squad-command-widget.ready {
  border-color: rgba(56, 189, 248, 0.5);
  box-shadow: 0 0 6px rgba(56, 189, 248, 0.2);
}
.hud-squad-command-widget.ready .hud-cmd-key {
  color: #38bdf8;
  border-color: #0284c7;
  box-shadow: 0 0 4px rgba(56, 189, 248, 0.5);
}
.hud-squad-command-widget.ready .hud-cmd-label { color: #38bdf8; }
.hud-squad-command-widget.ready .hud-cmd-meter-fill {
  background: #38bdf8;
  box-shadow: 0 0 6px rgba(56, 189, 248, 0.6);
}
.hud-squad-command-widget.ready .hud-cmd-timer { color: #38bdf8; }

.hud-squad-command-widget.active {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.18);
  animation: squad-cmd-active-pulse 1s infinite alternate;
}
@keyframes squad-cmd-active-pulse {
  from { box-shadow: 0 0 6px rgba(245, 158, 11, 0.3); }
  to   { box-shadow: 0 0 14px rgba(245, 158, 11, 0.7); }
}
.hud-squad-command-widget.active .hud-cmd-key {
  color: #fff;
  background: #d97706;
  border-color: #f59e0b;
}
.hud-squad-command-widget.active .hud-cmd-label {
  color: #fbbf24;
  font-weight: 900;
}
.hud-squad-command-widget.active .hud-cmd-meter-fill {
  background: #fbbf24;
  box-shadow: 0 0 8px #fbbf24;
}
.hud-squad-command-widget.active .hud-cmd-timer {
  color: #fbbf24;
  font-size: 8px;
  font-weight: 900;
}

.hud-squad-command-widget.cooling {
  border-color: #1e293b;
  opacity: 0.85;
}
.hud-squad-command-widget.cooling .hud-cmd-key { color: #64748b; }
.hud-squad-command-widget.cooling .hud-cmd-label { color: #64748b; }
.hud-squad-command-widget.cooling .hud-cmd-meter-fill { background: #64748b; }
.hud-squad-command-widget.cooling .hud-cmd-timer { color: #94a3b8; }

/* Variante do Swirl Blast — mesma estrutura do widget de FOCO acima, só troca o azul-ciano
   (#38bdf8) pelo azul do próprio Swirl Blast (0x2b8fff em combat/projectiles.js) no estado
   "ready", pra não ler como o mesmo botão. Estado "cooling" fica igual (cinza neutro). */
.hud-swirl-widget.ready {
  border-color: rgba(43, 143, 255, 0.5);
  box-shadow: 0 0 6px rgba(43, 143, 255, 0.2);
}
.hud-swirl-widget.ready .hud-cmd-key {
  color: #5fa8ff;
  border-color: #2b6fd6;
  box-shadow: 0 0 4px rgba(43, 143, 255, 0.5);
}
.hud-swirl-widget.ready .hud-cmd-label { color: #5fa8ff; }
.hud-swirl-widget.ready .hud-cmd-meter-fill {
  background: #2b8fff;
  box-shadow: 0 0 6px rgba(43, 143, 255, 0.6);
}
.hud-swirl-widget.ready .hud-cmd-timer { color: #5fa8ff; }

/* ============ CADEIA DE ABATES — "Arcade Neon" (v0.73.0) ============ */
/* terceiro filho de .hud-topbar-row, ao lado do placar e dos emblemas de habilidade — evita
   colidir com o minimapa (top:12px;right:12px) que ocupa o canto oposto da tela. Sobe de cor a
   cada abate em cadeia (verde → amarelo → laranja → vermelho) e zera sozinha depois de um tempo
   sem abates novos (ver KILL_CHAIN_DECAY_S em game-loop.js). */
.hud-kill-chain {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  pointer-events: none;
}
.hud-kill-chain-label {
  font-family: 'Press Start 2P', ui-monospace, monospace;
  font-size: 7px;
  color: #7fe0ff;
  text-shadow: 2px 2px 0 #000;
}
.hud-kill-chain-x {
  font-family: 'Press Start 2P', ui-monospace, monospace;
  font-size: 15px;
  color: #39ff6a;
  text-shadow: 2px 2px 0 #000;
  transform: scale(1);
}
.hud-kill-chain-x.pulse {
  animation: hud-kill-chain-pop 260ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes hud-kill-chain-pop {
  0%   { transform: scale(0.6); }
  55%  { transform: scale(1.35); }
  100% { transform: scale(1); }
}
.hud-kill-chain-x.tier2 { color: #ffe600; }
.hud-kill-chain-x.tier3 { color: #ff9a00; }
.hud-kill-chain-x.tier4 { color: #ff3860; }
.hud-kill-chain-segs { display: flex; gap: 2px; }
.hud-kill-chain-seg {
  width: 10px;
  height: 6px;
  background: #1c2030;
  border: 1px solid #3a4258;
}
.hud-kill-chain-seg.on { background: #39ff6a; border-color: #39ff6a; box-shadow: 0 0 5px #39ff6a; }
.hud-kill-chain-seg.on.tier2 { background: #ffe600; border-color: #ffe600; box-shadow: 0 0 5px #ffe600; }
.hud-kill-chain-seg.on.tier3 { background: #ff9a00; border-color: #ff9a00; box-shadow: 0 0 5px #ff9a00; }
.hud-kill-chain-seg.on.tier4 { background: #ff3860; border-color: #ff3860; box-shadow: 0 0 6px #ff3860; }

/* ============ DERROTA DE CHEFE — TELA DE K.O. "Arcade Neon" (v0.73.0) ============ */
/* disparada por hud.showBossKO() a partir de flow-boss.js, ANTES da cutscene de morte mais
   sedada que já existe — um momento de impacto imediato e rápido (3.4s), não substitui nada. */
.hud-boss-ko {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  background: rgba(0, 0, 0, 0);
  pointer-events: none;
  opacity: 0;
}
.hud-boss-ko.go {
  animation: hud-boss-ko-bg 3400ms ease forwards;
}
@keyframes hud-boss-ko-bg {
  0%   { opacity: 0; background: rgba(0,0,0,0); }
  5%   { opacity: 1; background: rgba(10,4,20,0.82); }
  88%  { opacity: 1; background: rgba(10,4,20,0.82); }
  100% { opacity: 0; background: rgba(10,4,20,0); }
}
.hud-boss-ko-text {
  font-family: 'Press Start 2P', ui-monospace, monospace;
  font-size: 0px;
  color: #ffe600;
  -webkit-text-stroke: 3px #000;
  paint-order: stroke fill;
  text-shadow: 5px 5px 0 #ff3860;
  letter-spacing: 0.05em;
}
.hud-boss-ko.go .hud-boss-ko-text {
  animation: hud-boss-ko-in 3400ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
@keyframes hud-boss-ko-in {
  0%   { font-size: 0px; transform: rotate(-8deg); }
  8%   { font-size: 46px; transform: rotate(-8deg); }
  16%  { font-size: 38px; transform: rotate(4deg); }
  22%  { font-size: 42px; transform: rotate(0deg); }
  85%  { font-size: 42px; opacity: 1; }
  100% { font-size: 42px; opacity: 0; }
}
.hud-boss-ko-bonus {
  font-family: 'Press Start 2P', ui-monospace, monospace;
  font-size: 16px;
  color: #39ff6a;
  text-shadow: 3px 3px 0 #000;
  opacity: 0;
}
.hud-boss-ko.go .hud-boss-ko-bonus {
  animation: hud-boss-ko-bonus-in 3400ms ease forwards;
}
@keyframes hud-boss-ko-bonus-in {
  0%, 25% { opacity: 0; }
  30%     { opacity: 1; }
  85%     { opacity: 1; }
  100%    { opacity: 0; }
}
.hud-boss-ko-coin {
  position: absolute;
  width: 10px;
  height: 10px;
  background: #ffe600;
  border: 2px solid #000;
  top: 50%;
  left: 50%;
  opacity: 0;
}
.hud-boss-ko.go .hud-boss-ko-coin {
  animation: hud-boss-ko-coin-fly 900ms cubic-bezier(0.16, 0.9, 0.3, 1) forwards;
  animation-delay: 280ms;
}
@keyframes hud-boss-ko-coin-fly {
  0%   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(calc(-50% + var(--cx)), calc(-50% + var(--cy))) scale(0.4); }
}

/* ============ CLUSTER DE VIDA/ESCUDO/BOOST — placas angulares (overhaul v0.71.0) ============ */
/* Pedido do usuário: overhaul do design pra ficar "mais dinamico e epico" — console militar com
   segmentos angulares em vez das 3 barras retas antigas. Mantém a mesma posição de tela (canto
   superior esquerdo) e a mesma API do hud (setLives/setStatus/setShield/setBoost inalteradas). */
.hud-vitals-cluster {
  position: absolute;
  top: 56px;
  left: 12px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  width: 220px;
  pointer-events: none;
  filter: drop-shadow(0 1px 3px #000);
}
.hud-vitals-cluster.hit-flash {
  animation: hud-vitals-hitflash 260ms ease-out;
}
@keyframes hud-vitals-hitflash {
  0%   { filter: brightness(2.2) saturate(0) drop-shadow(0 1px 3px #000); }
  100% { filter: brightness(1) drop-shadow(0 1px 3px #000); }
}

.hud-lives-bar { display: flex; gap: 6px; }
.hud-life-pip {
  width: 20px;
  height: 20px;
  clip-path: polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%);
  background: rgba(20, 24, 32, 0.75);
  border: 1px solid #333944;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.hud-life-pip.filled {
  background: #5ad1ff;
  border-color: #5ad1ff;
  box-shadow: 0 0 8px rgba(90, 209, 255, 0.75);
}
.hud-life-pip.lost {
  animation: hud-pip-shatter 450ms cubic-bezier(.36,.07,.19,.97);
}
@keyframes hud-pip-shatter {
  0%   { transform: scale(1,1) rotate(0deg); opacity: 1; }
  30%  { transform: scale(1.5,.55) rotate(6deg); opacity: .7; }
  60%  { transform: scale(.7,1.35) rotate(-8deg); opacity: .85; }
  100% { transform: scale(1,1) rotate(0deg); opacity: 1; }
}

.hud-bar-row { display: flex; align-items: center; gap: 8px; }
.hud-bar-label {
  font: 700 10px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #7c8aa8;
  width: 30px;
  flex: none;
}
.hud-segs { display: flex; gap: 3px; flex: 1; height: 20px; }
.hud-shield-wrap .hud-segs { height: 12px; }
.hud-seg {
  flex: 1;
  background: rgba(20, 24, 32, 0.75);
  border: 1px solid #333944;
  clip-path: polygon(22% 0, 100% 0, 78% 100%, 0 100%);
  transition: background .15s, box-shadow .15s;
}
.hud-seg.fill-health { background: #3df0a6; box-shadow: 0 0 6px rgba(61,240,166,.7); }
.hud-seg.fill-shield { background: #4a9bff; box-shadow: 0 0 6px rgba(74,155,255,.7); }
.hud-health-wrap.crit .hud-seg.fill-health {
  animation: hud-seg-crit 550ms infinite alternate;
}
@keyframes hud-seg-crit {
  from { filter: brightness(1); }
  to   { filter: brightness(1.8) hue-rotate(-30deg); }
}

.hud-boost-wrap {
  height: 11px;
  border: 1px solid #333944;
  clip-path: polygon(6% 0, 100% 0, 94% 100%, 0 100%);
  overflow: hidden;
}
.hud-boost-fill {
  height: 100%;
  width: 100%;
  background: #ffb545;
  box-shadow: 0 0 8px rgba(255,181,69,.7) inset;
  transition: width 0.15s ease-out;
}
.hud-boost-wrap.active .hud-boost-fill {
  background-color: #ffd54a;
  background-image: repeating-linear-gradient(115deg, rgba(255,255,255,.35) 0 6px, transparent 6px 14px);
  background-size: 200% 100%;
  animation: hud-boost-stripes .5s linear infinite;
}
@keyframes hud-boost-stripes {
  from { background-position: 0 0; }
  to   { background-position: -40px 0; }
}

/* ============ FLASH "BOOST PRONTO" ============ */
@keyframes boost-ready-flash {
  0%   { box-shadow: 0 0 0 0 rgba(43,255,136,0.95); }
  100% { box-shadow: 0 0 0 14px rgba(43,255,136,0); }
}
.hud-boost-wrap.ready-flash {
  animation: boost-ready-flash 650ms ease-out;
}

/* ============ CLUSTER ORBITAL DE VIDA/ESCUDO/BOOST — arcos ao redor da nave (v0.78.0) ============ */
/* Alternativa ao cluster de canto acima, escolhida em Configurações (settings.vitalsHudStyle =
   'orbital'). Mesma API pública em hud-game.js (setLives/setStatus/setShield/setBoost) — só a
   apresentação muda: 3 arcos SVG lisos e concêntricos (escudo/vida/impulso, raio crescente) que
   acompanham a projeção de tela da nave (setVitalsAnchor, chamado por game-loop.js) em vez de
   ficar fixo no canto. Pedido do usuário: "só arcos", sem segmentos/lâminas individuais.
   Geometria (viewBox -200 -260 400 300, âncora da nave em 0,0) validada visualmente num
   protótipo de design antes de virar código — ver canvas de exploração do HUD. */
.hud-vitals-orbital {
  position: absolute;
  left: 50%;
  top: 50%;
  /* v0.78.1 — 20% menor a pedido do usuário */
  width: 32vmin;
  height: 24vmin;
  min-width: 208px;
  min-height: 156px;
  /* v0.78.2 — translateX extra desloca a âncora (nave) pra dentro do cluster, fazendo os
     arcos ficarem mais à esquerda da nave em vez de centralizados sobre ela; opacity
     reduzida a pedido do usuário (HUD um pouco mais discreta) */
  transform: translate(-50%, -86.7%) translateX(-1.6vmin);
  opacity: 0.82;
  pointer-events: none;
  z-index: 6;
  filter: drop-shadow(0 1px 3px #000);
}
.hud-vitals-orbital.hit-flash {
  animation: hud-vitals-hitflash 260ms ease-out;
}
.hud-vitals-orbital-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
  display: block;
}
.hvo-arc {
  fill: none;
  stroke-linecap: round;
  /* v0.78.1 — faltava isso: sem stroke-dasharray, o strokeDashoffset que hud-game.js já
     atualizava por vida/escudo/impulso não tinha NENHUM efeito visual (o traço ficava sempre
     sólido/cheio, só o brilho/cor mudava). pathLength="100" no path normaliza o comprimento
     pra 100 unidades — dasharray 100 cria 1 traço de 100 + 1 vão de 100, e o dashoffset (0..100
     vindo de hud-game.js) revela progressivamente menos traço conforme o valor cai. */
  stroke-dasharray: 100;
  /* v0.78.2 — a pedido do usuário: cada arco fica invisível por padrão e só "surge" quando o
     valor que ele representa muda (gasto ou recuperado) — hud-game.js alterna a classe
     is-active via pulseOrbitalVisible() a cada mudança de vida/escudo/impulso. Transição de
     entrada rápida (0.12s, ver .is-active abaixo), saída lenta (1.3s) pra "dessurgir" aos
     poucos depois do hold. */
  opacity: 0;
  transition: stroke-dashoffset 0.15s linear, stroke 0.2s ease, opacity 1.3s ease-out;
}
.hvo-arc.is-active {
  opacity: 1;
  transition: stroke-dashoffset 0.15s linear, stroke 0.2s ease, opacity 0.12s ease-out;
}
.hvo-shield { stroke: #4a9bff; stroke-width: 8px; filter: drop-shadow(0 0 5px rgba(74,155,255,.7)); }
.hvo-health { stroke: #3df0a6; stroke-width: 8px; filter: drop-shadow(0 0 5px rgba(61,240,166,.65)); }
.hvo-boost  { stroke: #ffd54a; stroke-width: 7px; filter: drop-shadow(0 0 5px rgba(255,213,74,.7)); }
.hvo-boost.active {
  opacity: 1;
  animation: hvo-boost-pulse 0.5s ease-in-out infinite alternate;
}
@keyframes hvo-boost-pulse {
  from { filter: drop-shadow(0 0 5px rgba(255,213,74,.7)); }
  to   { filter: drop-shadow(0 0 11px rgba(255,213,74,1)); }
}
.hvo-boost.ready-flash {
  animation: hvo-boost-ready-flash 650ms ease-out;
}
@keyframes hvo-boost-ready-flash {
  0%   { stroke-width: 13px; filter: drop-shadow(0 0 16px rgba(255,213,74,1)); }
  100% { stroke-width: 7px; filter: drop-shadow(0 0 5px rgba(255,213,74,.7)); }
}
.hvo-health.crit {
  /* vida crítica é um estado de perigo contínuo — fica visível mesmo sem mudar a cada frame,
     não some no meio do sistema de fade-por-mudança dos outros arcos */
  opacity: 1 !important;
  animation: hvo-health-crit 550ms infinite alternate;
}
@keyframes hvo-health-crit {
  from { stroke: #3df0a6; filter: drop-shadow(0 0 5px rgba(61,240,166,.65)); }
  to   { stroke: #ff5c5c; filter: drop-shadow(0 0 9px rgba(255,92,92,.9)); }
}
.hvo-lifepips {
  opacity: 0;
  transition: opacity 1.3s ease-out;
}
.hvo-lifepips.is-active {
  opacity: 1;
  transition: opacity 0.12s ease-out;
}
.hvo-life-pip {
  fill: rgba(20, 24, 32, 0.75);
  stroke: #333944;
  stroke-width: 1.5px;
  transition: fill 0.15s, stroke 0.15s;
}
.hvo-life-pip.filled {
  fill: #5ad1ff;
  stroke: #5ad1ff;
  filter: drop-shadow(0 0 5px rgba(90,209,255,.75));
}
.hvo-life-pip.lost {
  animation: hvo-pip-lost-flash 450ms ease-out;
}
@keyframes hvo-pip-lost-flash {
  0%   { fill: #ffffff; stroke: #ffffff; filter: drop-shadow(0 0 9px #fff); }
  100% { fill: rgba(20, 24, 32, 0.75); stroke: #333944; filter: none; }
}

/* ============ MOTION LINES (boost) ============ */
.hud-motion-lines {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 200ms ease-out;
  z-index: 3;
  overflow: hidden;
}
.hud-motion-lines.active { opacity: var(--intensity, 1); }
.hud-motion-lines::before,
.hud-motion-lines::after {
  content: '';
  position: absolute;
  inset: -10%;
  background: repeating-conic-gradient(
    from 0deg at 50% 50%,
    transparent 0deg,
    rgba(255, 255, 255, 0.65) 0.4deg,
    transparent 0.8deg,
    transparent 45deg
  );
  animation: motion-line-spin 1.6s linear infinite;
}
.hud-motion-lines::after {
  animation-duration: 2.2s;
  animation-direction: reverse;
  opacity: 0.6;
}
@keyframes motion-line-spin {
  0%   { transform: rotate(0deg) scale(1.15); }
  100% { transform: rotate(360deg) scale(1.15); }
}

/* ============ SCREEN DISTORTION (boost) ============ */
.hud-boost-distortion {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 250ms ease-out;
  background: radial-gradient(
    ellipse 60% 45% at center,
    transparent 20%,
    rgba(150, 200, 255, 0.06) 55%,
    rgba(150, 200, 255, 0.18) 100%
  );
  z-index: 2;
}
.hud-boost-distortion.active { opacity: 1; }

/* ============ COLOR GRADING NO CHEFE ============ */
.hud-boss-tint {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 400ms ease-out;
  background: radial-gradient(
    ellipse 100% 100% at center,
    rgba(255, 40, 60, 0.06) 0%,
    rgba(180, 20, 40, 0.18) 100%
  );
  mix-blend-mode: overlay;
  z-index: 5;
}
.hud-boss-tint.active { opacity: 1; }

/* ============ FAIXAS LATERAIS DE DANO: escudo (azul + grid) vs vida (vermelho) ============ */
.hud-side-flash {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  z-index: 6;
}
.hud-side-flash::before, .hud-side-flash::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 16%;
}
.hud-side-flash::before { left: 0; }
.hud-side-flash::after { right: 0; transform: scaleX(-1); }
.hud-side-flash.shield::before, .hud-side-flash.shield::after {
  background:
    repeating-linear-gradient(0deg, rgba(150, 210, 255, 0.4) 0 1px, transparent 1px 22px),
    repeating-linear-gradient(90deg, rgba(150, 210, 255, 0.4) 0 1px, transparent 1px 22px),
    linear-gradient(to right, rgba(77, 166, 255, 0.5), transparent);
}
.hud-side-flash.damage::before, .hud-side-flash.damage::after {
  background: linear-gradient(to right, rgba(255, 50, 50, 0.55), transparent);
}
@keyframes hud-side-flash-anim {
  0% { opacity: 0; }
  15% { opacity: 1; }
  100% { opacity: 0; }
}
.hud-side-flash.flash { animation: hud-side-flash-anim 450ms ease-out; }

/* ============ AVISO DE TRANSIÇÃO PARA ALL-RANGE (dourado/chefe se aproximando) — Fase 5 */
.hud-arena-warning {
  position: absolute;
  top: 20%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 1.6rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-shadow: 0 2px 10px #000;
  pointer-events: none;
  z-index: 12;
}
.hud-arena-warning.kind-golden { color: #ffd700; }
.hud-arena-warning.kind-boss { color: #ff6b5a; }

/* ============ CUTSCENE DE TRANSIÇÃO PARA ALL-RANGE — Fase 5 ============ */
.hud-arena-cutscene {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(11, 13, 18, 0.55);
  color: #f5f5f7;
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-shadow: 0 2px 10px #000;
  pointer-events: none;
  z-index: 18;
}

/* ============ BANDEJA DE CARTAS ROGUELIKE (v0.53.4) ============ */
.hud-cards-tray {
  position: absolute;
  top: 136px;
  left: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: 250px;
  z-index: 12;
  pointer-events: none;
}
#game-screen.game-paused .hud-cards-tray {
  pointer-events: auto;
}
.hud-card-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  background: rgba(10, 16, 26, 0.88);
  border: 1.5px solid var(--card-color, #3ea6ff);
  box-shadow: 0 0 8px var(--card-glow, rgba(62, 166, 255, 0.25));
  color: #fff;
  cursor: default;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  user-select: none;
}
#game-screen.game-paused .hud-card-chip {
  cursor: pointer;
}
#game-screen.game-paused .hud-card-chip:hover {
  transform: translateY(-2px) scale(1.06);
  box-shadow: 0 0 14px var(--card-color, #3ea6ff);
  z-index: 55;
}
.hud-card-icon {
  font-size: 0.85rem;
  line-height: 1;
}
.hud-card-count {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.72rem;
  font-weight: 800;
  color: #f1f5f9;
}
.hud-card-tooltip {
  display: none;
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 240px;
  max-width: 290px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(8, 14, 24, 0.97);
  border: 1px solid var(--card-color, #3ea6ff);
  box-shadow: 0 10px 30px rgba(0,0,0,0.85), 0 0 16px rgba(0, 140, 255, 0.3);
  backdrop-filter: blur(10px);
  z-index: 60;
  pointer-events: none;
  text-align: left;
}
#game-screen.game-paused .hud-card-chip:hover .hud-card-tooltip {
  display: block;
  animation: hud-card-tooltip-pop 160ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
@keyframes hud-card-tooltip-pop {
  0% { opacity: 0; transform: translateY(-4px) scale(0.96); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.hud-card-tooltip-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  gap: 8px;
}
.hud-card-tooltip-title {
  font-weight: 700;
  font-size: 0.85rem;
  color: #ffffff;
}
.hud-card-tooltip-cat {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 6px;
  border-radius: 4px;
  color: #0b0f19;
  background: var(--card-color, #3ea6ff);
  flex-shrink: 0;
}
.hud-card-tooltip-body {
  font-size: 0.78rem;
  color: #cbd5e1;
  line-height: 1.4;
  margin-bottom: 6px;
}
.hud-card-tooltip-stacks {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.72rem;
  color: #94a3b8;
  font-weight: 600;
}

/* ============ MODAL DE PERGUNTA COM PAUSA TOTAL (v0.53.4 - 12 Princípios de Animação) ============ */
.question-modal-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at center, rgba(14, 22, 36, 0.88) 0%, rgba(4, 7, 12, 0.96) 100%);
  backdrop-filter: blur(8px);
  z-index: 20;
  animation: question-modal-overlay-in 240ms ease-out both;
}
@keyframes question-modal-overlay-in {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}
.question-modal-frame {
  position: relative;
  max-width: 840px;
  width: 92vw;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(13, 20, 32, 0.92);
  border: 1.5px solid rgba(56, 189, 248, 0.4);
  border-radius: 16px;
  padding: 1.8rem 2rem;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.85), 0 0 35px rgba(56, 189, 248, 0.22), inset 0 1px 1px rgba(255, 255, 255, 0.15);
  overflow-y: auto;
  overflow-x: hidden;
  animation: question-frame-pop-in 420ms cubic-bezier(0.18, 1.25, 0.38, 1) both;
}
@keyframes question-frame-pop-in {
  0%   { opacity: 0; transform: translateY(28px) scale(0.85); }
  60%  { opacity: 1; transform: translateY(-4px) scale(1.02); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.question-modal-badge {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 20px;
  padding: 4px 14px;
  margin-bottom: 0.85rem;
  text-transform: uppercase;
  text-shadow: 0 0 10px rgba(56, 189, 248, 0.6);
  pointer-events: none;
}
.question-modal-retry-pill {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 8px;
  background: rgba(245, 158, 11, 0.25);
  border: 1px solid #f59e0b;
  border-radius: 999px;
  color: #fbbf24;
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  box-shadow: 0 0 10px rgba(245, 158, 11, 0.4);
  animation: retry-badge-pulse 1.8s ease-in-out infinite alternate;
}
@keyframes retry-badge-pulse {
  from { opacity: 0.85; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1.03); }
}
.question-modal-title {
  margin: 0 0 1.2rem 0;
  max-width: 740px;
  text-align: center;
  color: #f8fafc;
  font-size: 1.55rem;
  font-weight: 700;
  line-height: 1.35;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 255, 255, 0.25);
  animation: question-modal-pop-in 400ms cubic-bezier(0.22, 1.4, 0.38, 1) 80ms both;
}
/* ============ BOTÃO NA EXTREMA DIREITA (CÓDICE TAB) ============ */
.hud-codex-tab-btn {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%) translateX(0);
  z-index: 25;
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(14, 22, 38, 0.94);
  border: 1.5px solid rgba(56, 189, 248, 0.45);
  border-right: none;
  border-radius: 12px 0 0 12px;
  padding: 16px 12px;
  cursor: pointer;
  color: #38bdf8;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.6), 0 0 15px rgba(56, 189, 248, 0.25);
  transition: all 0.25s cubic-bezier(0.2, 0.9, 0.3, 1);
  animation: codex-tab-enter 400ms cubic-bezier(0.18, 1.2, 0.38, 1) both;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  user-select: none;
}
@keyframes codex-tab-enter {
  0% { opacity: 0; transform: translateY(-50%) translateX(30px); }
  100% { opacity: 1; transform: translateY(-50%) translateX(0); }
}
.hud-codex-tab-btn:hover {
  background: rgba(20, 32, 54, 0.98);
  border-color: #38bdf8;
  color: #7dd3fc;
  box-shadow: -6px 0 25px rgba(56, 189, 248, 0.4), 0 0 20px rgba(56, 189, 248, 0.35);
  transform: translateY(-50%) translateX(-4px);
}
.hud-codex-tab-btn.is-open {
  background: rgba(56, 189, 248, 0.18);
  border-color: #38bdf8;
  color: #ffffff;
  box-shadow: -6px 0 25px rgba(56, 189, 248, 0.5);
  transform: translateY(-50%) translateX(-6px);
}
.hud-codex-tab-icon {
  font-size: 1.25rem;
  writing-mode: horizontal-tb;
  line-height: 1;
  filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.8));
}
.hud-codex-tab-label {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.hud-codex-tab-key {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.68rem;
  font-weight: 800;
  color: #ffd700;
  background: rgba(255, 215, 0, 0.15);
  border: 1px solid rgba(255, 215, 0, 0.4);
  border-radius: 4px;
  padding: 3px 6px;
  writing-mode: horizontal-tb;
  text-orientation: initial;
}

/* ============ BACKDROP DA GAVETA LATERAL ============ */
.hud-codex-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 12, 0.55);
  backdrop-filter: blur(4px);
  z-index: 28;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}
.hud-codex-backdrop.is-open {
  opacity: 1;
  pointer-events: auto;
}

/* ============ GAVETA LATERAL DO CÓDICE (CODEX DRAWER) ============ */
.hud-codex-drawer {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(500px, 94vw);
  height: 100vh;
  z-index: 30;
  display: flex;
  flex-direction: column;
  background: rgba(10, 16, 28, 0.96);
  border-left: 1.5px solid rgba(56, 189, 248, 0.5);
  backdrop-filter: blur(28px);
  box-shadow: -15px 0 50px rgba(0, 0, 0, 0.85), -4px 0 25px rgba(56, 189, 248, 0.25);
  transform: translateX(105%);
  transition: transform 0.38s cubic-bezier(0.16, 1, 0.3, 1);
  box-sizing: border-box;
  user-select: text;
}
.hud-codex-drawer.is-open {
  transform: translateX(0);
}

.hud-codex-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.1rem 1.4rem;
  border-bottom: 1px solid rgba(56, 189, 248, 0.22);
  background: rgba(14, 22, 38, 0.85);
  flex-shrink: 0;
}
.hud-codex-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.hud-codex-badge {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.2em;
  color: #38bdf8;
  text-transform: uppercase;
  text-shadow: 0 0 8px rgba(56, 189, 248, 0.6);
}
.hud-codex-tag-badge {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.68rem;
  color: #ffd700;
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.25);
  border-radius: 4px;
  padding: 2px 6px;
  align-self: flex-start;
}
.hud-codex-close-btn {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.78rem;
  font-weight: 700;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  outline: none;
}
.hud-codex-close-btn:hover {
  color: #f8fafc;
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.5);
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.3);
}

.hud-codex-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 1.4rem;
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
  scrollbar-width: thin;
  scrollbar-color: rgba(56, 189, 248, 0.3) transparent;
}
.hud-codex-scroll::-webkit-scrollbar {
  width: 6px;
}
.hud-codex-scroll::-webkit-scrollbar-thumb {
  background: rgba(56, 189, 248, 0.3);
  border-radius: 3px;
}

.hud-codex-question-card {
  background: rgba(14, 22, 38, 0.75);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 10px;
  padding: 1rem 1.2rem;
}
.hud-codex-section-label {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: #7dd3fc;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
}
.hud-codex-question-text {
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.4;
  color: #f8fafc;
}

.hud-codex-section {
  display: flex;
  flex-direction: column;
}
.hud-codex-explanation-text {
  font-size: 0.95rem;
  line-height: 1.65;
  color: #cbd5e1;
  background: rgba(12, 19, 32, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 1.2rem;
  white-space: pre-wrap;
  text-align: justify;
}
.hud-codex-explanation-text p {
  margin: 0 0 0.8rem 0;
}
.hud-codex-explanation-text p:last-child {
  margin-bottom: 0;
}

.hud-codex-sources-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.hud-codex-source-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.82rem;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: 6px;
  padding: 8px 12px;
  text-decoration: none;
  transition: all 0.15s ease;
  word-break: break-all;
}
.hud-codex-source-link:hover {
  background: rgba(56, 189, 248, 0.18);
  border-color: #38bdf8;
  color: #bae6fd;
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.35);
}
.hud-codex-source-citation {
  font-size: 0.84rem;
  line-height: 1.5;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.03);
  border-left: 3px solid #ffd700;
  padding: 8px 12px;
  border-radius: 0 6px 6px 0;
}

.hud-codex-footer {
  padding: 0.8rem 1.4rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(14, 22, 38, 0.85);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.72rem;
  color: #64748b;
  text-align: center;
  flex-shrink: 0;
}
.hud-codex-footer b {
  color: #38bdf8;
}

/* ============ PAINEL DE EXPLICAÇÃO PÓS-RESPOSTA (v0.61.0) ============ */
.hud-expl-drawer {
  border-left-color: rgba(251, 191, 36, 0.5);
  box-shadow: -15px 0 50px rgba(0, 0, 0, 0.85), -4px 0 25px rgba(251, 191, 36, 0.25);
}
.hud-expl-header {
  border-bottom-color: rgba(251, 191, 36, 0.22);
}
.hud-expl-badge-title {
  color: #fbbf24 !important;
  text-shadow: 0 0 8px rgba(251, 191, 36, 0.6) !important;
}
.hud-expl-answer-card {
  border-color: rgba(52, 211, 153, 0.4);
  background: rgba(16, 28, 20, 0.75);
}
.hud-expl-answer-text {
  color: #34d399 !important;
  font-size: 1.15rem !important;
  font-weight: 700 !important;
}
.hud-expl-footer {
  border-top-color: rgba(251, 191, 36, 0.12);
}
.hud-expl-footer b {
  color: #fbbf24;
}
.hud-expl-backdrop.is-open {
  z-index: 50;
}
.hud-expl-drawer.is-open {
  z-index: 52;
}

/* ============ BOTÕES INLINE DE EXPLICAÇÃO (CARD CHOICE + ERRO) ============ */
.hud-expl-inline-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.1);
  border: 1.5px solid rgba(251, 191, 36, 0.35);
  border-radius: 8px;
  padding: 8px 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  outline: none;
  user-select: none;
}
.hud-expl-inline-btn:hover {
  background: rgba(251, 191, 36, 0.2);
  border-color: #fbbf24;
  color: #fef3c7;
  box-shadow: 0 0 16px rgba(251, 191, 36, 0.4), 0 2px 8px rgba(0, 0, 0, 0.4);
  transform: translateY(-1px);
}
.hud-expl-inline-btn:active {
  transform: translateY(0);
  box-shadow: 0 0 8px rgba(251, 191, 36, 0.3);
}

/* Row do botão de explicação na tela de cartas */
.hud-expl-card-row {
  width: 100%;
  display: flex;
  justify-content: center;
  padding-top: 1.2rem;
}
.hud-expl-card-btn {
  animation: question-modal-pop-in 400ms cubic-bezier(0.22, 1.4, 0.38, 1) 400ms both;
}

/* Botão de explicação embutido no float de erro */
.hud-error-float {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.hud-expl-error-btn {
  font-size: 0.72rem;
  padding: 6px 12px;
  animation: fadeIn 300ms ease 600ms both;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.question-modal-list {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 800px;
}
.question-modal-card {
  position: relative;
  width: 250px;
  min-height: 64px;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  text-align: left;
  background: rgba(18, 28, 44, 0.85);
  border: 2px solid #334155;
  border-radius: 12px;
  padding: 0.85rem 1rem;
  cursor: pointer;
  color: #f8fafc;
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 500;
  transition: transform 0.14s ease, box-shadow 0.14s ease;
  animation: question-modal-pop-in 380ms cubic-bezier(0.22, 1.5, 0.4, 1) both;
  animation-delay: calc(160ms + var(--stagger, 0) * 80ms);
}
@keyframes question-modal-pop-in {
  0%   { opacity: 0; transform: translateY(22px) scale(0.88); }
  55%  { opacity: 1; transform: translateY(-4px) scale(1.04); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.question-modal-card:hover {
  transform: translateY(-4px) scale(1.02);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6), 0 0 18px currentColor;
}
.question-modal-burst {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 24px;
  height: 24px;
  margin: -12px 0 0 -12px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(56,189,248,0.85) 40%, rgba(56,189,248,0) 72%);
  box-shadow: 0 0 40px 14px rgba(56, 189, 248, 0.55);
  pointer-events: none;
  z-index: 44;
  animation: question-modal-burst-anim 500ms cubic-bezier(0.15, 0.85, 0.3, 1) forwards;
}
@keyframes question-modal-burst-anim {
  0%   { transform: scale(0.2); opacity: 0; }
  25%  { opacity: 1; }
  100% { transform: scale(9); opacity: 0; }
}
.question-modal-card svg { flex-shrink: 0; }
.question-modal-hint {
  position: absolute;
  top: 6px;
  right: 8px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.72rem;
  font-weight: 700;
  color: #94a3b8;
  background: rgba(11, 15, 25, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 1px 6px;
  pointer-events: none;
}

/* ============ HORIZONTE ARTIFICIAL (Fase 9, ideia all-range 2) ============ */
.hud-horizon {
  position: absolute;
  right: 16px;
  bottom: 96px;
  width: 76px;
  height: 76px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid rgba(124, 224, 255, 0.5);
  background: #0b0d12;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.6);
  z-index: 8;
  pointer-events: none;
}
.hud-horizon-line {
  position: absolute;
  left: -20px;
  right: -20px;
  top: 50%;
  height: 200px;
  margin-top: -100px;
  background: linear-gradient(to bottom, #4da6ff 0%, #4da6ff 50%, #2a1f14 50%, #2a1f14 100%);
  transition: transform 60ms linear;
}
.hud-horizon::after {
  content: '';
  position: absolute;
  left: 8px;
  right: 8px;
  top: 50%;
  height: 2px;
  margin-top: -1px;
  background: #ffd166;
  z-index: 1;
}

/* ============ FACHO DE ABSORÇÃO DA CARTA (Fase 9, ideia visual 4) ============ */
.card-absorb-beam {
  position: absolute;
  width: 16px;
  height: 16px;
  margin: -8px 0 0 -8px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(124,224,255,0.9) 45%, rgba(124,224,255,0) 75%);
  box-shadow: 0 0 20px 6px rgba(124,224,255,0.65);
  pointer-events: none;
  z-index: 40;
  animation: card-absorb-travel 420ms cubic-bezier(0.3,0,0.2,1) forwards;
}
@keyframes card-absorb-travel {
  0%   { transform: translate(0, 0) scale(1); opacity: 1; }
  70%  { opacity: 1; }
  100% { transform: translate(var(--tx), var(--ty)) scale(0.1); opacity: 0; }
}

/* ============ COLAPSO DE FOCO DA PERGUNTA (item 19, cutscene ideia 5) ============ */
/* pedido do usuário: "partículas convergindo pro centro da tela" antes do modal de pergunta
   aparecer, em vez dele dar snap direto — cada partícula nasce perto da borda (--sx/--sy,
   calculado no JS) e a keyframe abaixo anima left/top até 50%/50% (centro exato onde o modal
   nasce), sumindo de opacidade e encolhendo no caminho. */
.question-focus-collapse {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 45;
  overflow: hidden;
}
.question-focus-particle {
  position: absolute;
  left: var(--sx);
  top: var(--sy);
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #7fe0ff;
  box-shadow: 0 0 10px 3px rgba(127, 224, 255, 0.85);
  transform: translate(-50%, -50%) scale(1);
  opacity: 0;
  animation: question-focus-converge 280ms ease-in forwards;
}
@keyframes question-focus-converge {
  0%   { opacity: 0; }
  20%  { opacity: 1; }
  100% { left: 50%; top: 50%; opacity: 0; transform: translate(-50%, -50%) scale(0.2); }
}

/* ============ OVERHAUL DE CUTSCENES CINEMÁTICAS ============ */
.reticle,
.hud-status,
.hud-topbar-row,
.hud-vitals-cluster,
.hud-vitals-orbital,
.hud-horizon,
.hud-minimap,
.hud-boss-fight-bar,
.hud-question,
.hud-legend {
  transition: opacity 0.35s ease;
}

/* Ocultação limpa de miras, barras e status de combate durante cutscenes cinemáticas */
.cinematic-active .reticle,
.cinematic-active .hud-status,
.cinematic-active .hud-topbar-row,
.cinematic-active .hud-vitals-cluster,
.cinematic-active .hud-vitals-orbital,
.cinematic-active .hud-horizon,
.cinematic-active .hud-question,
.cinematic-active .hud-legend,
.cinematic-active .hud-countdown,
.cinematic-active .hud-arena-warning,
.cinematic-active .hud-boss-banner,
.cinematic-active .hud-golden-banner,
.cinematic-active .hud-boss-fight-bar,
.cinematic-active .hud-minimap,
.cinematic-active .hud-lockon-crosshair,
.cinematic-active .hud-lockon-target {
  opacity: 0 !important;
  pointer-events: none !important;
}

.hud-letterbox {
  position: absolute;
  left: 0;
  right: 0;
  height: 12vh;
  background: #000000;
  z-index: 32;
  pointer-events: none;
  transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1);
}
.hud-letterbox-top {
  top: 0;
  transform: translateY(-100%);
}
.hud-letterbox-bottom {
  bottom: 0;
  transform: translateY(100%);
}
.hud-letterbox.active.hud-letterbox-top {
  transform: translateY(0);
}
.hud-letterbox.active.hud-letterbox-bottom {
  transform: translateY(0);
}

.hud-boss-warning-card {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  padding: 1.4rem 2.6rem;
  background: rgba(18, 4, 8, 0.88);
  border: 2px solid #ff2d4d;
  box-shadow: 0 0 30px rgba(255, 45, 77, 0.5), inset 0 0 16px rgba(255, 45, 77, 0.25);
  border-radius: 4px;
  z-index: 34;
  pointer-events: none;
  font-family: monospace, sans-serif;
  text-align: center;
  animation: boss-card-enter 0.4s cubic-bezier(0.18, 1.25, 0.4, 1) both;
}
@keyframes boss-card-enter {
  0% { opacity: 0; transform: translate(-50%, -45%) scale(0.9); }
  100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
.hud-boss-warning-header {
  color: #ff2d4d;
  font-size: 0.95rem;
  font-weight: 800;
  letter-spacing: 0.25em;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  animation: boss-warning-blink 0.55s infinite alternate;
}
@keyframes boss-warning-blink {
  0% { opacity: 0.65; text-shadow: 0 0 5px #ff2d4d; }
  100% { opacity: 1; text-shadow: 0 0 15px #ff2d4d, 0 0 25px #ff2d4d; }
}
.hud-boss-warning-name {
  color: #ffffff;
  font-size: 1.9rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-shadow: 0 0 12px rgba(255, 255, 255, 0.6);
}
.hud-boss-warning-sub {
  color: #ff94a4;
  font-size: 0.85rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.hud-golden-warning-card {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  padding: 1.4rem 2.6rem;
  background: rgba(24, 20, 4, 0.88);
  border: 2px solid #ffd700;
  box-shadow: 0 0 30px rgba(255, 215, 0, 0.5), inset 0 0 16px rgba(255, 215, 0, 0.25);
  border-radius: 4px;
  z-index: 34;
  pointer-events: none;
  font-family: monospace, sans-serif;
  text-align: center;
  animation: golden-card-enter 0.4s cubic-bezier(0.18, 1.25, 0.4, 1) both;
}
@keyframes golden-card-enter {
  0% { opacity: 0; transform: translate(-50%, -45%) scale(0.9); }
  100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
.hud-golden-warning-header {
  color: #ffd700;
  font-size: 1.4rem;
  font-weight: 900;
  letter-spacing: 0.18em;
  text-shadow: 0 0 12px rgba(255, 215, 0, 0.7);
}
.hud-golden-warning-sub {
  color: #fff4b8;
  font-size: 0.85rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.hud-launch-banner {
  position: absolute;
  top: 45%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  font-family: monospace, sans-serif;
  z-index: 34;
  pointer-events: none;
  animation: launch-banner-in 0.5s cubic-bezier(0.2, 1, 0.3, 1) both;
  /* transição de saída (pedido do usuário: fim da cutscene de decolagem sem "pop") — sem isso
     hideLaunchBanner() só tinha hidden=true pra sumir, e display:none não anima; a classe
     is-hiding abaixo dá o alvo (opacity:0) que essa transition interpola antes do hidden real */
  transition: opacity 0.35s ease;
}
@keyframes launch-banner-in {
  0% { opacity: 0; transform: translate(-50%, -55%) scale(0.85); }
  100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
.hud-launch-banner.is-hiding {
  opacity: 0;
}
.hud-launch-sector {
  color: #3ea6ff;
  font-size: 1.8rem;
  font-weight: 900;
  letter-spacing: 0.25em;
  text-shadow: 0 0 16px rgba(62, 166, 255, 0.7);
}
.hud-launch-sub {
  color: #b4e4ff;
  font-size: 0.95rem;
  letter-spacing: 0.15em;
}
.hud-launch-skip {
  color: rgba(255, 255, 255, 0.45);
  font-size: 0.75rem;
  margin-top: 0.6rem;
  letter-spacing: 0.1em;
}

.hud-whiteout-overlay {
  position: absolute;
  inset: 0;
  background: #ffffff;
  opacity: 0;
  pointer-events: none;
  z-index: 40;
  transition: opacity 0.5s ease-out;
}
.hud-whiteout-overlay.flash {
  opacity: 0.92;
  transition: none;
}

.hud-mission-complete {
  position: absolute;
  top: 46%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  z-index: 34;
  pointer-events: none;
  font-family: monospace, sans-serif;
  animation: mission-complete-in 0.6s cubic-bezier(0.18, 1.25, 0.4, 1) both;
}
@keyframes mission-complete-in {
  0% { opacity: 0; transform: translate(-50%, -35%) scale(0.75); }
  100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
.hud-mission-complete-title {
  color: #ffd700;
  font-size: 2.3rem;
  font-weight: 900;
  letter-spacing: 0.22em;
  text-shadow: 0 0 25px rgba(255, 215, 0, 0.8), 0 2px 4px #000;
}
.hud-mission-complete-sub {
  color: #fff4b8;
  font-size: 1.05rem;
  letter-spacing: 0.18em;
  text-shadow: 0 0 12px rgba(255, 215, 0, 0.5);
}

/* ============ ALERTA DE PATAMAR DE ERRO (Seção 3 do backlog) ============ */
.hud-tier-warning {
  position: absolute;
  top: 18%;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  z-index: 35;
  pointer-events: none;
  font-family: monospace, sans-serif;
  text-transform: uppercase;
  padding: 0.6rem 1.4rem;
  border-radius: 6px;
  background: rgba(180, 20, 20, 0.4);
  border: 1px solid rgba(255, 60, 60, 0.7);
  box-shadow: 0 0 25px rgba(255, 30, 30, 0.6), inset 0 0 15px rgba(255, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  animation: hud-tier-anim 2.4s ease-out forwards;
}
@keyframes hud-tier-anim {
  0% { opacity: 0; transform: translateX(-50%) scale(0.8); }
  12% { opacity: 1; transform: translateX(-50%) scale(1.08); }
  20% { opacity: 1; transform: translateX(-50%) scale(1); }
  75% { opacity: 1; transform: translateX(-50%) scale(1); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-15px) scale(0.95); }
}
.hud-tier-warning-title {
  color: #ff3344;
  font-size: 1.35rem;
  font-weight: 900;
  letter-spacing: 0.18em;
  text-shadow: 0 0 18px rgba(255, 50, 50, 0.9), 0 2px 4px #000;
}
.hud-tier-warning-sub {
  color: #ffc4c4;
  font-size: 0.85rem;
  letter-spacing: 0.12em;
  text-shadow: 0 0 8px rgba(255, 100, 100, 0.7);
}

/* ============ NOTIFICAÇÃO DE COMANDO DO ESQUADRÃO (TECLA D) ============ */
.hud-squadron-notice {
  position: absolute;
  transform: translate(-50%, -100%) scale(0.85);
  pointer-events: none;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  opacity: 0;
  transition: opacity 140ms ease-out, transform 160ms cubic-bezier(0.18, 0.9, 0.3, 1.2);
  will-change: transform, opacity, left, top;
}
.hud-squadron-notice.active {
  opacity: 1;
  transform: translate(-50%, -100%) scale(1);
}
.hud-squadron-notice-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(10, 15, 28, 0.88);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(56, 189, 248, 0.6);
  box-shadow: 0 0 16px rgba(56, 189, 248, 0.35), 0 4px 12px rgba(0, 0, 0, 0.6);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-weight: 800;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: #e0f2fe;
  text-transform: uppercase;
  white-space: nowrap;
}
.hud-squadron-notice.focus .hud-squadron-notice-pill {
  border-color: rgba(239, 68, 68, 0.85);
  box-shadow: 0 0 20px rgba(239, 68, 68, 0.5), 0 4px 12px rgba(0, 0, 0, 0.6);
  color: #fecaca;
}
.hud-squadron-notice.cooldown .hud-squadron-notice-pill {
  border-color: rgba(148, 163, 184, 0.7);
  box-shadow: 0 0 14px rgba(148, 163, 184, 0.3), 0 4px 12px rgba(0, 0, 0, 0.6);
  color: #cbd5e1;
}
.hud-squadron-notice-icon {
  font-size: 14px;
}
.hud-squadron-notice-sub {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.75);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  letter-spacing: 0.03em;
}

/* ============ RÁDIO DOS ALIADOS (Overhaul de Personalidade, Ideia 3) ============ */
/* Opção 3 dos 3 protótipos HTML (escolhida pelo usuário) — painel quadrado (não pill, pra
   acomodar melhor o retrato) com cantos técnicos, glitch de entrada por corte em steps e
   flicker rápido antes de sumir. Ver Docs/Rádio dos Aliados — Opção B v2 (protótipo).html. */
.hud-wingman-radio {
  position: absolute;
  left: 28px;
  bottom: 30px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 17px 8px 8px;
  border-radius: 4px;
  background: rgba(8, 12, 22, 0.92);
  border: 1px solid var(--pc, #38bdf8);
  box-shadow: 0 0 18px var(--pg, rgba(56, 189, 248, 0.4)), 0 6px 16px rgba(0, 0, 0, 0.6);
  opacity: 0;
  transform: translateY(14px);
  transition: opacity 140ms ease-out, transform 200ms ease-out, border-color 200ms, box-shadow 200ms;
  pointer-events: none;
  z-index: 45;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.hud-wingman-radio.active {
  opacity: 1;
  transform: translateY(0);
}
.hud-wingman-radio-corner {
  position: absolute;
  width: 7px;
  height: 7px;
  border-color: var(--pc, #38bdf8);
  opacity: 0.9;
}
.hud-wingman-radio-corner.tl { left: -1px; top: -1px; border-left: 2px solid; border-top: 2px solid; }
.hud-wingman-radio-corner.tr { right: -1px; top: -1px; border-right: 2px solid; border-top: 2px solid; }
.hud-wingman-radio-corner.bl { left: -1px; bottom: -1px; border-left: 2px solid; border-bottom: 2px solid; }
.hud-wingman-radio-corner.br { right: -1px; bottom: -1px; border-right: 2px solid; border-bottom: 2px solid; }
.hud-wingman-radio-avatar {
  position: relative;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  border: 2px solid var(--pc, #38bdf8);
  box-shadow: 0 0 10px var(--pg, rgba(56, 189, 248, 0.5));
  background: #0a0f1c;
}
.hud-wingman-radio-avatar img {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated;
  opacity: 0;
}
.hud-wingman-radio-avatar img.visible {
  opacity: 1;
}
.hud-wingman-radio-name {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #e2e8f0;
  text-transform: uppercase;
}
.hud-wingman-radio-line {
  font-size: 11px;
  color: #f8fafc;
  margin-top: 2px;
}
@keyframes hud-wingman-radio-glitch-in {
  0%   { clip-path: inset(0 0 92% 0); transform: translateY(14px) translateX(-6px); }
  15%  { clip-path: inset(40% 0 20% 0); transform: translateY(14px) translateX(4px); }
  30%  { clip-path: inset(10% 0 60% 0); transform: translateY(8px) translateX(-3px); }
  45%  { clip-path: inset(70% 0 5% 0); transform: translateY(4px) translateX(3px); }
  60%  { clip-path: inset(0 0 30% 0); transform: translateY(0) translateX(-2px); }
  80%  { clip-path: inset(0 0 0 0); transform: translateY(0) translateX(1px); }
  100% { clip-path: inset(0 0 0 0); transform: translateY(0) translateX(0); }
}
.hud-wingman-radio.entering {
  animation: hud-wingman-radio-glitch-in 260ms steps(2, end);
}
@keyframes hud-wingman-radio-flicker {
  0%, 100% { opacity: 1; } 20% { opacity: 0.2; } 40% { opacity: 1; } 60% { opacity: 0.15; } 80% { opacity: 1; }
}
.hud-wingman-radio.leaving {
  animation: hud-wingman-radio-flicker 180ms steps(1, end);
}

/* ============ ALERTA DE EVENTO AMBIENTAL: TEMPESTADE DE DETRITOS ============ */
.hud-storm-warning {
  position: absolute;
  top: 75px;
  left: 50%;
  transform: translateX(-50%) translateY(-20px) scale(0.92);
  pointer-events: none;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  opacity: 0;
  transition: opacity 220ms ease-out, transform 260ms cubic-bezier(0.18, 0.9, 0.3, 1.25);
  will-change: transform, opacity;
}
.hud-storm-warning.active {
  opacity: 1;
  transform: translateX(-50%) translateY(0) scale(1);
}
.hud-storm-warning-pill {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 8px 22px;
  border-radius: 999px;
  background: rgba(18, 12, 8, 0.92);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(245, 158, 11, 0.85);
  box-shadow: 0 0 24px rgba(245, 158, 11, 0.45), 0 4px 16px rgba(0, 0, 0, 0.7);
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
.hud-storm-warning.cleared .hud-storm-warning-pill {
  border-color: rgba(34, 197, 94, 0.85);
  box-shadow: 0 0 24px rgba(34, 197, 94, 0.45), 0 4px 16px rgba(0, 0, 0, 0.7);
  background: rgba(6, 20, 12, 0.92);
}
.hud-storm-warning-icon {
  font-size: 20px;
  filter: drop-shadow(0 0 8px rgba(245, 158, 11, 0.8));
}
.hud-storm-warning.cleared .hud-storm-warning-icon {
  filter: drop-shadow(0 0 8px rgba(34, 197, 94, 0.8));
}
.hud-storm-warning-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
.hud-storm-warning-title {
  font-weight: 800;
  font-size: 13px;
  letter-spacing: 0.05em;
  color: #fef3c7;
  text-transform: uppercase;
}
.hud-storm-warning.cleared .hud-storm-warning-title {
  color: #dcfce7;
}
.hud-storm-warning-sub {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgba(254, 243, 199, 0.8);
}
.hud-storm-warning.cleared .hud-storm-warning-sub {
  color: rgba(220, 252, 231, 0.8);
}

/* ============ BANNERS DE EVENTO DE COMBATE (SQUAD WIPE / FRENESI) ============ */
.hud-combat-event-banner {
  position: absolute;
  top: 18%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.8);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px 28px;
  border-radius: 8px;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  pointer-events: none;
  z-index: 55;
  opacity: 0;
  animation: hud-combat-banner-anim 2.2s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards;
}
.hud-combat-event-banner.squad-wipe {
  background: linear-gradient(135deg, rgba(234, 179, 8, 0.25), rgba(15, 23, 42, 0.85));
  border: 2px solid #eab308;
  box-shadow: 0 0 25px rgba(234, 179, 8, 0.6), inset 0 0 15px rgba(234, 179, 8, 0.3);
}
.hud-combat-event-banner.frenzy {
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.35), rgba(15, 23, 42, 0.9));
  border: 2px solid #c084fc;
  box-shadow: 0 0 30px rgba(168, 85, 247, 0.8), inset 0 0 20px rgba(192, 132, 252, 0.4);
}
.hud-combat-event-title {
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin: 0;
}
.hud-combat-event-banner.squad-wipe .hud-combat-event-title {
  color: #fef08a;
  text-shadow: 0 0 12px rgba(234, 179, 8, 0.9), 0 2px 4px rgba(0, 0, 0, 0.8);
}
.hud-combat-event-banner.frenzy .hud-combat-event-title {
  color: #f5d0fe;
  text-shadow: 0 0 14px rgba(192, 132, 252, 1), 0 2px 4px rgba(0, 0, 0, 0.8);
}
.hud-combat-event-sub {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #ffffff;
  margin-top: 4px;
  text-shadow: 0 0 6px rgba(0, 0, 0, 0.9);
}
@keyframes hud-combat-banner-anim {
  0%   { opacity: 0; transform: translate(-50%, -60%) scale(0.6); }
  12%  { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
  22%  { transform: translate(-50%, -50%) scale(1.0); }
  75%  { opacity: 1; transform: translate(-50%, -50%) scale(1.0); }
  100% { opacity: 0; transform: translate(-50%, -40%) scale(0.9); }
}

/* ============ INDICADORES DE AMEAÇAS FORA DA TELA (Item 4 — QOL v0.76.0) ============ */
.hud-offscreen-pointers {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 12;
}
.cinematic-active .hud-offscreen-pointers {
  display: none !important;
}
.hud-threat-pointer {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  pointer-events: none;
  will-change: transform, opacity, left, top;
}
.hud-threat-chevron {
  display: inline-block;
  font-size: 20px;
  color: #f59e0b;
  text-shadow: 0 0 8px rgba(245, 158, 11, 0.8), 0 0 16px rgba(245, 158, 11, 0.4);
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.9));
  transform-origin: center center;
}
.hud-threat-pointer.critical .hud-threat-chevron {
  color: #ef4444;
  text-shadow: 0 0 10px rgba(239, 68, 68, 1), 0 0 20px rgba(239, 68, 68, 0.8);
  animation: hud-threat-pulse 0.35s infinite alternate ease-in-out;
}
@keyframes hud-threat-pulse {
  from { transform: scale(0.92); opacity: 0.85; }
  to   { transform: scale(1.28); opacity: 1.0; }
}
`
  document.head.appendChild(style)
}
