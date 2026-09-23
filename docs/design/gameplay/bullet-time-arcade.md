# DESIGN AS-BUILT: BULLET-TIME NO CARD CHOICE (ARCADE)

> **Status:** AS-BUILT (VIGENTE EM PRODUÇÃO)  
> **Última verificação:** 2026-09-23  
> **Código relacionado:** [`src/game-loop.js`](../../../src/game-loop.js), [`src/flow-question.js`](../../../src/flow-question.js), [`src/settings.js`](../../../src/settings.js)  

---

## 1. COMPORTAMENTO NO MODO ARCADE
- No modo Arcade (sem baralho Anki), a seleção de cartas Roguelike não precisa pausar bruscamente o combate.
- Quando a configuração `arcadeCardChoicePauses` está desligada, o jogo entra em **Bullet-Time**:
  - A escala temporal (`dt`) desacelera suavemente para ~0.2x.
  - O mundo 3D continua se movendo, com naves e projéteis em câmera lenta.
  - O jogador escolhe sua carta sem a sensação de engasgo ou quebra de ritmo do modo estudo.
- Quando `arcadeCardChoicePauses` está ligada (padrão clássico), preserva a pausa integral anterior.
