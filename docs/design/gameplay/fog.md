# DESIGN AS-BUILT: FOG COMO MECÂNICA DE GAMEPLAY

> **Status:** AS-BUILT (VIGENTE EM PRODUÇÃO)  
> **Última verificação:** 2026-09-23  
> **Código relacionado:** [`src/environment.js`](../../../src/environment.js), [`src/game-loop.js`](../../../src/game-loop.js), [`src/settings.js`](../../../src/settings.js)  

---

## 1. OS 4 PILARES DO FOG TÁTICO
Implementado na v0.83.0:
1. **Densidade Dinâmica por Eventos:** O fog intensifica-se durante tempestades de detritos, entrada em setores de nebulosa e encontros especiais.
2. **Fog Tático Colorido (Opcional):** Configuração `fogTacticalColors` (default `false`) permite que o fog assuma a tonalidade tática do evento ou setor espacial.
3. **Visibilidade de Alvos e Lock-On:** Em fog denso, a aquisição visual do retículo é desafiada, valorizando o radar e o disparo cego.
4. **Transições Suaves:** Interpolação exponencial (*lerp*) entre densidades para evitar cortes secos de iluminação volumétrica.
