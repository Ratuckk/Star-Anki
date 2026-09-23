# ADR-0002: Tactical Freedom: Separação de Comportamento e Navegação sem Coleira

Status: **Aceito**  
Data: **2026-09-21**  
Relacionados: [`src/combat/wingmen.js`](../../src/combat/wingmen.js), [`src/combat/wingman-state-controller.js`](../../src/combat/wingman-state-controller.js)  

---

## Contexto
Anteriormente, os companheiros de esquadrão possuíam uma "coleira" por distância euclidiana do jogador. Se um piloto estivesse perseguindo um inimigo ou executando uma habilidade e ultrapassasse certa distância, o jogo forçava um estado de `regroup`, cancelando a ação abruptamente e causando convergência errática de todos os aliados em torno da nave do jogador.

## Decisão
1. **Remoção de Regroup por Distância Euclidiana:** No modo arena all-range, não há limite de distância que force o retorno. Os pilotos podem voar e combater livremente longe do jogador.
2. **Navegação no Trilho por Progresso:** No modo trilho, apenas o atraso longitudinal (`frame.forward`) aplica aceleração suave para não ficarem fora da tela.
3. **Recovery Técnico Apenas para Falhas Físicas:** Apenas coordenadas não finitas (`NaN` ou `Infinity`) acionam reset de emergência.

## Consequências
- **Positivas:** Os aliados parecem pilotos de caça autônomos e competentes em vez de drones presos a um fio; habilidades como Ram e Boombuster concluem seus trajetos sem interrupções artificiais.
- **Concessões:** Exigiu a criação de um módulo de separação simétrica física (`wingman-formation-separation.js`) para evitar sobreposições quando múltiplos aliados convergem para o mesmo ponto.
