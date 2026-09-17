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

### Pacote de QOL: Inspetor de Build, Widget do Comando [D], Ponteiros Fora da Tela, Códice de Erros e Fast Active-Recall — v0.76.0

Atendendo à seleção das 5 melhorias de Qualidade de Vida (QOL) aprovadas pelo usuário (Itens 2, 3, 4, 5 e 9) para integrar e aprimorar os sistemas recém-entregues (Radar Tático da v0.75.0, Habilidades da v0.74.x, Combate Neon da v0.73.0 e Estudo Ativo da v0.61.0):

1. **Item 2 — Inspetor de Build & Atributos na Escolha de Cartas Roguelike (`src/flow-question.js`, `src/hud-game.js`, `index.html`)**:
   - **Problema resolvido**: Na tela de escolha de cartas (`card-choice-overlay`), o jogador precisava tomar decisões de upgrade às cegas, sem saber com precisão quantos projéteis já tinha, quanto escudo acumulou ou quais cartas já estavam instaladas.
   - **Encanamento de dados**: `enterCardChoice` em `flow-question.js` agora empacota e envia para `hud.showCardChoice()` os dados vitais em tempo real:
     - `stats`: `{ health, maxHealth, shield, maxShield, projectileCount, homingTargets, wingmanCount }`.
     - `collectedCards`: cópia viva do `Map` de cartas adquiridas via `player.getCollectedCards()`.
   - **Interface `.card-choice-inspector`**:
     - **Linha de Vitais (`.inspector-stats-row`)**: pílulas escuras com contorno ciano e ícones temáticos exibindo:
       - `❤️ HP: ${health}/${maxHealth}`
       - `🛡️ Escudo: ${shield}/${maxShield}`
       - `🚀 Tiros: ${projectileCount}x` (canhões paralelos ativos)
       - `🎯 Homing: ${homingTargets}` (alvos máximos de mira teleguiada)
       - `👥 Ala: ${wingmanCount}/4` (pilotos escoltando a nave)
     - **Bandeja de Upgrades Instalados (`.inspector-upgrades-wrap`)**: lista compacta com badge `"Upgrades Instalados:"` e chips `.inspector-chip` para cada carta com `count > 0`. Cada chip possui a cor de sua categoria (`CARD_CATEGORY_COLOR`), ícone, nome e contador (`xN`), além de tooltip nativo com a descrição do efeito.
   - **Ciclo de vida e teardown**: limpados automaticamente no fechamento (`close()`) do overlay, garantindo zero vazamento de DOM entre escolhas consecutivas.

2. **Item 3 — Barra / Indicador de Recarga do Comando de Ofensiva do Esquadrão `[D]` (`src/combat/wingmen.js`, `src/combat/index.js`, `src/game-loop.js`, `src/hud-game.js`, `src/hud-styles.js`)**:
   - **Problema resolvido**: Na v0.74.1, a ordem `[D]` (foco de fogo do esquadrão) ganhou 6s de duração e 10s de recarga. Porém, o jogador não tinha nenhum feedback visual prévio do tempo restante e só descobria o cooldown se apertasse `D` e tomasse uma mensagem de aviso no centro da tela.
   - **Exposição de estado na API de combate**:
     - `wingmen.js` ganhou o método `getCommandState()` retornando:
       `{ mode: squadronCommandMode, durationRemaining: Math.max(0, squadronCommandDurationTimer), durationMax: SQUADRON_COMMAND_DURATION_S (6), cooldownRemaining: Math.max(0, squadronCommandCooldownTimer), cooldownMax: SQUADRON_COMMAND_COOLDOWN_S (10) }`.
     - Repassado de forma limpa por `combat.getSquadronCommandState()` em `src/combat/index.js`.
     - Chamado a cada frame em `src/game-loop.js`: `hud.setSquadronCommandState(combat.getSquadronCommandState())`.
   - **Widget Tático `.hud-squad-command-widget`**:
     - Posicionado na barra superior (`.hud-topbar-row`), imediatamente adjacente aos 4 hexágonos de habilidades dos companheiros.
     - **Estado `PRONTO` (`.ready`)**: badge com tecla `[D]`, rótulo `FOCO`, medidor em 100% ciano neon (`#38bdf8`) e texto `PRONTO`.
     - **Estado `ATIVO` (`.active`)**: borda âmbar pulsante (`@keyframes squad-cmd-active-pulse`), medidor de 3px esvaziando proporcionalmente aos 6s e timer numérico em tempo real com precisão de décimos (`ex: 5.2s`).
     - **Estado `RECARGA` (`.cooling`)**: widget escurecido com opacidade 85%, barra enchendo suavemente conforme o cooldown esgota e contagem regressiva em segundos inteiros (`ex: 8s`).

3. **Item 4 — Indicador Direcional de Ameaças Fora da Tela — Off-Screen Pointers (`src/game-loop.js`, `src/hud-game.js`, `src/hud-styles.js`)**:
   - **Problema resolvido**: O Radar Tático da v0.75.0 alerta a proximidade (< 32u) na borda do minimapa, mas o jogador foca o olhar no retículo de mira e no espaço tridimensional. Tiros e naves hostis vindo pelas costas ou pelas laterais fora do campo de visão (FOV) atingiam a nave sem que o jogador percebesse a direção exata para manobrar.
   - **Cálculo geométrico e projeção NDC**:
     - A cada frame em `game-loop.js`, lê `combat.getMinimapBlips()` (raio de perigo máximo: 70u, ignorando dourados pacíficos).
     - Projeta as coordenadas de mundo `b.worldPos` para o espaço normalizado de dispositivo (NDC) da câmera Three.js via `_threatProj.copy(b.worldPos).project(camera)`.
     - **Tratamento de objetos atrás da câmera**: quando o vetor de perigo está atrás da câmera (`toThreat.dot(camForward) <= 0`), os eixos NDC $x$ e $y$ são invertidos ($ndcX = -ndcX, ndcY = -ndcY$).
     - **Corte de visão direta**: se o alvo estiver dentro da tela visível e na frente da câmera ($|ndcX| \le 0.90$ e $|ndcY| \le 0.88$), o ponteiro é omitido (o jogador já o enxerga diretamente).
     - **Interseção Raio-Retângulo**: para alvos fora da tela, o raio central $(0,0) \to (ndcX, ndcY)$ é projetado nas bordas do retângulo da viewport ($boundX = 0.90, boundY = 0.88$):
       - Se $|ndcX| \cdot boundY > |ndcY| \cdot boundX \implies edgeX = \pm boundX, edgeY = edgeX \cdot m$ (borda lateral).
       - Caso contrário $\implies edgeY = \pm boundY, edgeX = edgeY / m$ (borda superior/inferior).
     - Rotação do chevron: $\theta = \text{atan2}(-edgeY, edgeX) \cdot \frac{180}{\pi}$, apontando precisamente para o vetor externo da ameaça.
   - **Renderização e Pool de Elementos**:
     - Pool estático de 4 elementos `.hud-threat-pointer` em `.hud-offscreen-pointers`, sem alocação contínua de memória (zero GC pressure).
     - Chevrons âmbar luminosos (`►`) com opacidade escalando com a proximidade ($1 - \frac{dist}{70} \cdot 0.6$).
     - Modo Crítico (`.critical`): se o inimigo estiver a menos de 32u, o chevron passa para vermelho vivo (`#ef4444`) com pulsação rápida (`@keyframes hud-threat-pulse`).
     - Desativação automática em cutscenes (`.cinematic-active .hud-offscreen-pointers { display: none }`).

4. **Item 5 — Códice de Revisão Completo na Tela de Fim de Jogo (`src/quiz.js`, `src/game-menu.js`, `src/hud-end.js`, `index.html`)**:
   - **Problema resolvido**: A tela de fim de partida antiga exibia uma lista de texto plano `<ul>` sem estilo, mostrando apenas `"Pergunta — Resposta"`. O jogador não conseguia rever o conceito denso, nem consultar as fontes bibliográficas, nem havia destaque visual para o desempenho da missão.
   - **Preservação de metadados educacionais**:
     - `quiz.js:resolveAnswer()` agora registra no log da sessão não apenas `guid`, `question` e `answer`, mas também `explanation`, `sourceUrl`, `sourcesText`, `tags` e `deck`.
     - `getSummary(session)` repassa esses dados para a lista `missed`, com desduplicação rigorosa por `guid` (evitando poluição visual se um card reenfileirado tiver sido errado duas vezes na mesma corrida).
   - **Tela de Fim de Missão Estilizada (`src/hud-end.js`, `index.html`)**:
     - **Grid de Métricas Táticas (`.end-metrics-grid`)**:
       - 🏆 Pontuação Total (arredondada, tipografia monospace).
       - 🎯 Precisão Anki (% de acertos sobre o total de perguntas respondidas).
       - ✅ Acertos (com destaque em verde neon e glow).
       - ❌ Erros (com destaque em vermelho e glow).
     - **Códice de Revisão dos Erros (`.end-codex-section`)**:
       - Cada questão errada é apresentada em um card holográfico `.end-missed-card`:
         - Tag do baralho e identificador numérico (`#1`, `#2`...).
         - Enunciado da questão em destaque (`.end-missed-question`).
         - Resposta correta com selo de verificação (`✓ Resposta Correta:` em verde).
         - Botão retrátil `"💡 Ver Explicação & Fontes [▾]"` (`.end-expl-toggle-btn`).
         - Painel expansível sanfona (`.end-expl-drawer`):
           - Bloco de Explicação Densa / Conceito Geral.
           - Bloco de Fontes Bibliográficas: links externos seguros (`target="_blank" rel="noopener noreferrer"`) e citações textuais de livros/normas.
     - **Ação Direta de Reforço**:
       - Botão dourado destacado: `"🔁 Reforçar Cards Errados Agora (N)"` (`.btn-practice-missed`), que aproveita a infraestrutura de `createPainelSession()` para abrir imediatamente um modo de prática focado estritamente nas cartas que falharam naquela surtida.

5. **Item 9 — Reenfileiramento Curto para Cards com Erro — Fast Active-Recall (`src/quiz.js`, `src/flow-question.js`, `src/flow-boss.js`, `src/hud-game.js`, `src/hud-styles.js`, `src/selftest.mjs`)**:
   - **Problema resolvido**: Em decks de 40 a 70 cards, quando o jogador errava uma pergunta, ela só reaparecia dezenas de minutos depois (quando a fila inteira reciclava), quebrando o ritmo de retenção imediata do conceito lido na explicação.
   - **Mecanismo de repetição ativa intra-sessão**:
     - Em `src/quiz.js:resolveAnswer()`: se `type !== 'correct'`, calcula `requeueOffset = Math.min(session.queue.length, session.pointer + 3)`.
     - Reinsere o card na fila da mesma sessão via `session.queue.splice(requeueOffset, 0, { ...card, _isFastRetry: true })`.
     - Mantém a integridade do histórico do Anki: o erro original continua registrado para cálculo de dificuldade e SRS, mas a oportunidade de reaplicar o aprendizado ocorre enquanto a explicação ainda está fresca na memória de trabalho.
   - **Feedback visual no Modal de Pergunta**:
     - `flow-question.js` e `flow-boss.js` repassam a flag `isFastRetry: !!result.card?._isFastRetry` para `hud.showQuestionModal()`.
     - Quando `isFastRetry` é verdadeiro, o cabeçalho do modal renderiza o badge destacado:
       `<span class="question-modal-retry-pill">⚡ REFORÇO DE MEMÓRIA</span>`.
     - Estilizado em âmbar com pulsação suave (`@keyframes retry-badge-pulse`).

---

### Verificação, Testes e Qualidade de Código

- **Suite de testes automatizados (`src/selftest.mjs`)**:
  - Nova Seção 8 adicionada a `selftest.mjs` testando especificamente:
    - Reenfileiramento de card com erro aumentando deterministamente a fila de 5 para 6 itens.
    - Presença da flag `_isFastRetry: true` no item reenfileirado 3 posições à frente.
    - Preservação dos campos `explanation`, `sourceUrl`, `sourcesText` e `tags` no array `missed` retornado por `getSummary()`.
  - Execução: `node src/selftest.mjs` **100% aprovado**.
- **Validação estática de sintaxe e dependências (`node --check`)**:
  - Validado em todos os 11 arquivos tocados (`quiz.js`, `flow-question.js`, `flow-boss.js`, `game-menu.js`, `game-loop.js`, `hud-end.js`, `hud-game.js`, `hud-styles.js`, `combat/wingmen.js`, `combat/index.js`, `version.js`), confirmando zero erros de sintaxe ou imports quebrados.
- **Versão**: `v0.75.0` → **`v0.76.0`** (atualizado em `src/version.js` e `README.md`).

