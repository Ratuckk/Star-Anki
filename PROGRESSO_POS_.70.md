# Progresso pós-v0.70 — novas documentações a partir daqui

Continuação do [PROGRESSO_POS_.60.md](PROGRESSO_POS_.60.md) (histórico v0.61.0 → v0.74.1, agora
congelado). A partir desta entrega, toda documentação nova entra neste arquivo.

---

## Backlog Pendente (herdado da v0.74.1)

Itens discutidos e aprovados pelo usuário mas ainda **não implementados**. Servem de referência
para futuras entregas neste arquivo. O detalhamento completo está em [BACKLOG.md](BACKLOG.md).

### P2 — Médio valor
- [ ] **Perguntas de cenário** — testar aplicação prática, não só definição.

### P3 — Especulativo / requer decisão
- [ ] **Bônus de pontos por abrir explicação em erros**.
- [ ] **Distratores por tag de confusão** — forçar discriminação entre conceitos comumente trocados.

---

## Histórico de Entregas pós-v0.70.0

### Overhaul do Minimapa — Radar Tático — v0.75.0

Atendendo ao pedido do usuário: um documento de design com 3 opções animadas de overhaul do
minimapa (ver seção de pesquisa abaixo), seguido de "radar tático" — a Opção A do documento
escolhida pra implementação real.

1. **Levantamento das lacunas reais do minimapa antigo** (antes de desenhar qualquer proposta):
   lido o código-fonte de `getMinimapBlips()` (`src/enemies/index.js`) e do bloco de atualização
   em `src/game-loop.js` — confirmado que (a) o minimapa só ficava visível quando
   `rail.isArena()` era verdadeiro, ou seja, sumia durante o combate normal em trilho (a maior
   parte do tempo de jogo) e só aparecia em arena de chefe/dourado; (b) todo inimigo não-chefe/
   não-dourado virava o mesmo pontinho vermelho, sem nenhuma distinção por tipo de ameaça; (c) os
   aliados do esquadrão nunca apareciam no mapa.
2. **Documento de design com 3 opções animadas** (Claude Design, formato HTML simples com
   `<canvas>` real e demonstração automática em loop, testado clicando em cada botão antes de
   publicar): Opção A "Radar Tático" (sempre ativo, formas por tipo de ameaça, aliados no mapa,
   cone de visão, alerta de proximidade), Opção B "Sweep Retrô" (varredura giratória estilo
   sonar, moldura circular), Opção C "Compacto Adaptativo" (encolhe/cresce sozinho conforme a
   tensão do combate). Usuário escolheu a **Opção A**.
3. **Implementação real da Opção A**:
   - `src/enemies/index.js`: `getMinimapBlips()` agora inclui o `kind` de cada inimigo (antes só
     `type: 'enemy'|'boss'`), pra HUD escolher o formato do blip.
   - `src/game-loop.js`: o gate `if (rail.isArena())` foi removido — o radar agora fica ativo o
     combate inteiro. Reescrita a projeção de coordenadas: antes usava eixos XZ fixos do mundo
     (só fazia sentido numa arena estática); agora projeta cada blip relativo ao frame do jogador
     (`worldPos.sub(playerPos).dot(frame.right / frame.forward)`), necessário porque o trilho
     curva em 3D — um "mundo fixo, ícone do jogador gira" ficaria ilegível fora da arena. O
     jogador fica sempre fixo no centro apontando "pra cima"; o mundo é que gira ao redor dele.
     Também computa `alert` (true se qualquer blip hostil está a menos de 32u do jogador) e a
     lista de `allies` (posição + cor de cada aliado ativo, via `combat.getWingmanPositions()` +
     `combat.getActiveWingmen()`, zipados pelo mesmo índice).
   - `src/hud-game.js`: `setMinimap()` reescrito — mapa `MINIMAP_SHAPE_BY_KIND` traduz o `kind` do
     inimigo pra um formato (triângulo = atirador comum/genérico, losango = sentinela, hexágono =
     enxame/sussurro, cruz = fragata/verme — chefe e dourado mantêm os círculos já existentes).
     Novo pool de elementos `.hud-minimap-ally` (pequenos chevrons coloridos por piloto, cor via
     CSS custom property `--ally-color`). Cone de visão virou um elemento CSS estático (gradiente
     radial recortado por `clip-path`), sem custo de JS por frame. Marcador do jogador não gira
     mais (sempre fixo apontando pra cima), então o parâmetro `angle` saiu do contrato de dados.
   - `index.html`: CSS do minimapa reescrito — `.hud-minimap-blip-tri/diamond/hex/plus` (novos
     formatos via `clip-path`, hexágono reaproveita o mesmo polígono já usado nos emblemas de
     habilidade do esquadrão), `.hud-minimap-fov` (cone estático), `.hud-minimap-ally` (chevron
     colorido), `.hud-minimap.alert` com `@keyframes hud-minimap-alert-pulse` (pulso contínuo na
     borda enquanto `alert` for verdadeiro, não um flash único — steady warning, não um blip).
4. **Testado ao vivo** via `window.__starAnki.step()`: confirmado que o minimapa fica visível
   (`minimap.hidden === false`) durante `state.phase === 'combat'` com `rail.isArena() === false`
   (antes ficava escondido); spawnei sentinela/miniSwarm/inimigo comum e confirmei via DOM os
   formatos corretos (`-diamond`, `-hex`×8, `-tri`×11); confirmei as 4 cores dos aliados batendo
   exatamente com `WINGMAN_PROFILES` (`#1d4ed8` Falco, `#059669` Peppy, `#ea580c` Slippy,
   `#7c3aed` Phantom); e confirmei visualmente por screenshot o cone de visão, o marcador do
   jogador fixo, e a borda pulsando vermelho quando um inimigo ficou a poucas unidades de
   distância (classe `.alert` aplicada corretamente).
5. **Doc chain avançada**: `PROGRESSO_POS_.60.md` congelado (cobria v0.61.0 → v0.74.1); este
   arquivo (`PROGRESSO_POS_.70.md`) é o atual a partir de agora.

---
