# ADR-0001: Estratégia de Prioridade do Lock-On: Boss e Maior maxHp

Status: **Aceito**  
Data: **2026-09-22**  
Relacionados: [`src/combat/lockon.js`](../../src/combat/lockon.js), [`docs/design/combat/lock-on.md`](../design/combat/lock-on.md)  

---

## Contexto
O sistema anterior de aquisição de travas utilizava um cone de mira visual estreito (6°). Isso causava sérias frustrações no jogador: inimigos fracos e descartáveis que passavam exatamente na frente do retículo "roubavam" a trava que deveria ir para o Boss ou para uma nave pesada de assalto. Além disso, travas oscilavam entre inimigos conforme a nave realizava manobras de rolamento.

## Decisão
Adotou-se uma regra de prioridade autoritativa puramente linear e determinística:
1. **Boss Ativo (`boss`):** Prioridade absoluta em qualquer circunstância.
2. **Maior `maxHp`:** Na ausência de boss, vence a unidade com maior HP máximo autoritativo (independente de HP atual ou de estar no centro do retículo).
3. **Desempate por ID:** Em caso de empate, menor `entity.id` vence fixamente.
4. **Desacoplamento Visual:** O cone de mira do HUD (`isAimingAtEnemy`) foi desacoplado da lógica de aquisição e serve apenas como feedback cosmético.

## Consequências
- **Positivas:** Mira extremamente previsível e tática; o tiro carregado foca automaticamente a ameaça mais perigosa em cena; travas consolidadas nunca mudam arbitrariamente de alvo.
- **Concessões:** O jogador não consegue "escolher" travar num inimigo fraco se houver uma unidade mais pesada na cena (comportamento desejado para ritmo de arcade).
