# DESIGN AS-BUILT: SWIRL BLAST

> **Status:** AS-BUILT (VIGENTE EM PRODUÇÃO)  
> **Última verificação:** 2026-09-23  
> **Código relacionado:** [`src/combat/projectiles.js`](../../../src/combat/projectiles.js), [`src/enemies/index.js`](../../../src/enemies/index.js), [`src/enemies/boss.js`](../../../src/enemies/boss.js)  

---

## 1. DANO PERCENTUAL CONTRA BOSS
- **Constante Central:** `SWIRL_BOSS_MAX_HP_DAMAGE_RATIO = 0.30` (em `src/enemies/index.js`).
- **Fórmula de Dano Aplicado:**
  $$\text{DanoTotal} = \text{DanoBase (6)} + \text{BônusGlobal} + (0.30 \times \text{boss.maxHp})$$
- **Proteção de FSM do Chefe:** Respeita os limiares de HP de transição de fase e a invulnerabilidade cênica.
- **Escudo Refletor:** Destruído imediatamente no contato sem refletir o Swirl e sem duplicar dano.
- **Exclusão do Dourado:** A Anomalia Dourada não recebe os 30% adicionais (sofre apenas o dano base de 6 + bônus normais).

---

## 2. HITBOX VOLUMÉTRICA & SWEPT COLLISION
- **Raio Base:** `SWIRL_BLAST_BASE_HIT_RADIUS = 3.0`.
- **Detecção Contínua:** Implementada verificação de distância contínua do segmento percorrido pelo projétil (`distanceToSegment(alvo, prevPos, currPos) <= alvo.hitRadius + 3.0`), eliminando "túneis" em alta velocidade.
- **Interação com Detritos:** Detritos são destruídos instantaneamente sem parar o projétil; chefes e fragatas absorvem o projétil.
- **Anti-Duplicação:** A lista `piercedTargets` impede que o mesmo projétil aplique dano mais de uma vez ao mesmo alvo em frames consecutivos.
