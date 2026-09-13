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
.hud-damage-number.points {
  color: #ffd166;
  text-shadow: 0 0 8px rgba(255,209,102,0.7), 0 0 2px rgba(0,0,0,0.95);
}
.hud-damage-number.big { font-size: 26px; }
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
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-weight: 900;
  font-size: 20px;
  letter-spacing: 0.02em;
  color: #ff4d4d;
  text-shadow: 0 0 8px rgba(255, 40, 40, 0.85), 0 1px 2px rgba(0,0,0,0.95);
  pointer-events: none;
  z-index: 30;
  animation: hud-error-float-anim 3000ms cubic-bezier(0.2, 0.9, 0.3, 1) forwards;
}
@keyframes hud-error-float-anim {
  0%   { transform: translate(-50%, -50%) translateY(8px)  scale(0.7); opacity: 0; }
  15%  { transform: translate(-50%, -50%) translateY(-2px) scale(1.1); opacity: 1; }
  75%  { transform: translate(-50%, -50%) translateY(-14px) scale(1); opacity: 1; }
  100% { transform: translate(-50%, -50%) translateY(-32px) scale(0.95); opacity: 0; }
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

/* ============ FLASH "BOOST PRONTO" ============ */
@keyframes boost-ready-flash {
  0%   { box-shadow: 0 0 0 0 rgba(43,255,136,0.95); }
  100% { box-shadow: 0 0 0 14px rgba(43,255,136,0); }
}
.hud-boost-wrap.ready-flash {
  animation: boost-ready-flash 650ms ease-out;
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
.hud-motion-lines.active { opacity: 1; }
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

/* ============ MODAL DE PERGUNTA COM PAUSA TOTAL (orbe do chefe) — Fase 5 ============ */
/* pedido do usuário: o efeito de a pergunta aparecer era instantâneo demais (só um "hidden =
   false", snap direto) — aplicados os princípios de animação discutidos (anticipation já
   existia via playFocusCollapse/partículas convergindo; aqui entram exaggeration + follow
   through no overlay/título via overshoot de escala, e secondary action no stagger dos cards) */
.question-modal-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.4rem;
  background: rgba(11, 13, 18, 0.85);
  z-index: 16;
  animation: question-modal-overlay-in 220ms ease-out both;
}
@keyframes question-modal-overlay-in {
  0%   { background: rgba(11, 13, 18, 0); }
  100% { background: rgba(11, 13, 18, 0.85); }
}
.question-modal-title {
  margin: 0;
  max-width: 70vw;
  text-align: center;
  color: #f5f5f7;
  font-size: 1.7rem;
  font-weight: 700;
  text-shadow: 0 2px 8px #000;
  animation: question-modal-pop-in 420ms cubic-bezier(0.22, 1.5, 0.4, 1) 90ms both;
}
.question-modal-list {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 90vw;
}
.question-modal-card {
  position: relative;
  width: 240px;
  display: flex;
  align-items: center;
  gap: 0.7rem;
  text-align: left;
  background: #16202b;
  border: 2px solid #333944;
  border-radius: 12px;
  padding: 0.9rem 1rem;
  cursor: pointer;
  color: #f5f5f7;
  font-family: inherit;
  font-size: 0.95rem;
  transition: transform 0.12s;
  animation: question-modal-pop-in 380ms cubic-bezier(0.22, 1.5, 0.4, 1) both;
  animation-delay: calc(200ms + var(--stagger, 0) * 90ms);
}
/* exaggeration (overshoot de escala/posição) + follow through (assenta de volta em 1/0) —
   usada no título (delay fixo) e nos cards (delay escalonado por --stagger, uma sequência em
   vez de todos juntos) */
@keyframes question-modal-pop-in {
  0%   { opacity: 0; transform: translateY(22px) scale(0.86); }
  55%  { opacity: 1; transform: translateY(-5px) scale(1.05); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.question-modal-card:hover { transform: translateY(-4px); }
/* burst de luz no centro exato onde o modal nasce — dispara junto do revealQuestionModal, dá o
   "pouso" visual logo depois da convergência de partículas (question-focus-collapse) */
.question-modal-burst {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 24px;
  height: 24px;
  margin: -12px 0 0 -12px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(127,224,255,0.85) 40%, rgba(127,224,255,0) 72%);
  box-shadow: 0 0 40px 14px rgba(127, 224, 255, 0.55);
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
  color: #8fa2b8;
  background: rgba(11, 13, 18, 0.65);
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
`
  document.head.appendChild(style)
}
