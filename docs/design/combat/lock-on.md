# DESIGN AS-BUILT: SISTEMA DE FOCO / LOCK-ON

> **Status:** AS-BUILT (VIGENTE EM PRODUÇÃO)  
> **Última verificação:** 2026-09-23  
> **Código relacionado:** [`src/combat/lockon.js`](../../../src/combat/lockon.js), [`src/combat/projectiles.js`](../../../src/combat/projectiles.js)  
> **ADR Relacionada:** [`docs/decisions/ADR-0001-lock-on-priority-strategy.md`](../../decisions/ADR-0001-lock-on-priority-strategy.md)  

---

## 1. REGRA DE AQUISIÇÃO E PRIORIDADE
A aquisição de travas do tiro teleguiado é governada por uma função puramente determinística:
`findBestLockCandidate(candidates, lockedEnemies, origin, forward)`.

- **Prioridade 1 (Absoluta) — Boss Ativo:** Se houver um boss vivo e válido (`e.kind === 'boss'`), ele recebe a trava obrigatoriamente, independente da mira ou do HP de outros inimigos.
- **Prioridade 2 — Maior `maxHp` Autoritativo:** Na ausência de boss, vence o alvo com o maior HP máximo configurado (exemplo: `10 / 300` vence `100 / 100`).
- **Desempate Estável:** Em caso de empate exato em `maxHp`, prevalece o menor `entity.id` numérico, impedindo alternâncias de frame (*flickering*).
- **Estabilidade:** Travas já consolidadas nunca mudam de alvo se um inimigo de maior HP surgir posteriormente.

---

## 2. ORÇAMENTO DE TRAVAS POR CATEGORIA
- **Boss (`boss`):** Travas ilimitadas até o limite máximo de carga (`maxAllowed`).
- **Dourado (`golden`):** Multi-lock completo até o teto de carga caso seja a maior prioridade.
- **Horda (`horda`):** Limite de até 2 travas.
- **Inimigos Comuns:** Máximo de 1 trava por entidade.

---

## 3. VALIDAÇÃO ESPACIAL E AIM HINT
- **Alcance Permitido:** Entre 10 e 90 unidades mundiais (`MIN_LOCK_RANGE` a `MAX_LOCK_RANGE`).
- **Proibição de Alvos Atrás:** Alvos com `rel.dot(forward) < -4` são rejeitados.
- **Aim Hint Desacoplado:** O retículo visual do HUD (`isAimingAtEnemy`) utiliza cone estreito de 7° exclusivamente para feedback visual do jogador, sem interferir na seleção matemática do lock-on.
