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

### Verificação, Testes e Qualidade de Código (v0.76.0 QOL)

- **Suite de testes automatizados (`src/selftest.mjs`)**:
  - Nova Seção 8 adicionada a `selftest.mjs` testando especificamente:
    - Reenfileiramento de card com erro aumentando deterministamente a fila de 5 para 6 itens.
    - Presença da flag `_isFastRetry: true` no item reenfileirado 3 posições à frente.
    - Preservação dos campos `explanation`, `sourceUrl`, `sourcesText` e `tags` no array `missed` retornado por `getSummary()`.
  - Execução: `node src/selftest.mjs` **100% aprovado**.
- **Validação estática de sintaxe e dependências (`node --check`)**:
  - Validado em todos os 11 arquivos tocados (`quiz.js`, `flow-question.js`, `flow-boss.js`, `game-menu.js`, `game-loop.js`, `hud-end.js`, `hud-game.js`, `hud-styles.js`, `combat/wingmen.js`, `combat/index.js`, `version.js`), confirmando zero erros de sintaxe ou imports quebrados.
- **Versão**: `v0.75.0` → **`v0.76.0`** (atualizado em `src/version.js` e `README.md`).

---

### Hotfix crítico: crash imediato ao iniciar qualquer gameplay — v0.76.1

**Sintoma reportado pelo usuário**: jogo crashava assim que o gameplay começava no GitHub Pages
(`ratuckk.github.io/Star-Anki`). Reproduzido no navegador: após pular a decolagem, a cena
congelava (nenhum novo frame renderizado) e o console enchia com `ReferenceError` a cada frame.

**Causa raiz**: na Etapa 7a do overhaul de organização (extração de `runFrame()`/`tick()` de
`main.js` para `src/game-loop.js`, commit `7a6d9b8`), vários vetores temporários do módulo foram
renomeados com prefixo `_` (`_fireDirection`, `_reticleWorldPos`, etc. — reuso pra evitar alocação
por frame) mas **duas leituras não foram atualizadas**, ficando com o nome antigo sem `_`:
- [src/game-loop.js:413](../src/game-loop.js:413) — `combat.update(dt, playerPos, { ...,
  aimDirection: fireDirection, ... })` (deveria ser `_fireDirection`). Essa chamada roda
  incondicionalmente todo frame de combate, então o `ReferenceError` disparava imediatamente ao
  sair da cutscene de decolagem — não é um bug de borda, é o primeiro frame de gameplay real.
- [src/game-loop.js:492](../src/game-loop.js:492) — `const ndc = reticleWorldPos.project(camera)`
  (deveria ser `_reticleWorldPos`), um pouco mais adiante na mesma função — só seria alcançado
  depois de corrigir o primeiro.

Como módulos ES rodam em modo estrito, ler um identificador nunca declarado lança
`ReferenceError` (não `undefined` silencioso). Como o erro acontecia ANTES de
`renderer.render(scene, camera)` (final de `runFrame`), a tela congelava no último frame
renderizado com sucesso (a cutscene) enquanto o loop `requestAnimationFrame` continuava
reagendando e re-falhando silenciosamente no mesmo ponto — daí o "crash" sem tela de erro visível
pro jogador, só travamento total.

**Por que passou pela validação anterior**: o `node --check` citado na seção de QOL acima só
valida sintaxe — `fireDirection` e `reticleWorldPos` são identificadores sintaticamente válidos,
só nunca foram declarados. Só um `ReferenceError` em tempo de execução (ou lint com
`no-undef`) pegaria isso. Vale considerar adicionar ESLint com essa regra ao fluxo de validação.

**Correção**: `_fireDirection` e `_reticleWorldPos` nos dois pontos. Como `.project(camera)` muta
o vetor in-place, confirmado via grep que `_reticleWorldPos` não é lido de novo depois da linha
492 no mesmo frame (é reescrito do zero no início do próximo frame, linha 179), então a mutação é
segura.

**Validação**: reproduzido o crash ao vivo no `ratuckk.github.io/Star-Anki` antes da correção
(erro idêntico no console). Localmente, o painel do navegador ficou oculto durante boa parte do
teste (a app hospedeira estava minimizada), o que suspende o `requestAnimationFrame` mas não o
`document.visibilityState` — sintoma: `state.launchCutsceneTimer` não decrementava mesmo após
segundos reais de espera. Contornado usando o hook de debug `window.__starAnki.step(frames, dtMs)`
(chama `runFrame` diretamente, sem depender de rAF) pra avançar manualmente até a fase de combate
e rodar 500 frames simulados (~8.3s) de combate real — zero exceções, 15 inimigos ativos, jogador
avançando normalmente. `grep` confirmou que não sobrou nenhuma outra referência sem `_` a
`cosmicTint1/2/3`, `baseColor`, `blendedShift`, `finalColor`, `threatProj`, `threatCamDir`,
`toThreat` ou `minimapRel` (os outros temporários do mesmo padrão em `game-loop.js`).

**Nota lateral (não é bug)**: o `service-worker.js` do projeto é network-first pra assets da
própria origem (só cai pro cache em modo offline), então não contribuiu pro crash nem atrasa a
propagação deste fix pros jogadores — a próxima visita já busca o `game-loop.js` corrigido da
rede.

- **Versão**: `v0.76.0` → **`v0.76.1`**.

---

### Auditoria Geral de Bugs, Ações Insolicitadas de IA e Otimização de GC — v0.76.0

Documento de auditoria dedicado completo criado em [`REGISTRO_AUDITORIA_E_CORRECOES.md`](REGISTRO_AUDITORIA_E_CORRECOES.md).

1. **Correções de Bugs e Ações Insolicitadas de IA (BUG-01 a BUG-09):**
   - **BUG-01 e BUG-02 (Inversão 180° e Disparo Traseiro no Trilho):** Inimigos que ultrapassavam o jogador no trilho giravam de costas e atiravam para trás. Corrigido restringindo `lookAt` e `inFireRange` a `relativeForward > 0`.
   - **BUG-03 (Perda de Roll Dinâmico por lookAt):** Corrigido reaplicando a rotação local `rollZ` após o direcionamento do caça em curvas.
   - **BUG-04 (Elos Órfãos do Verme de Fogo Suspensos):** Segmentos sem predecessor ativo são agora promovidos a cabeças autônomas com projeção correta no trilho (`rail.getSpawnFrame()`).
   - **BUG-05 (Vazamento do Contador de Esquadrões no Despawn):** Decremento de `activeSquadrons` incluído no despawn natural para evitar bloqueio de novas ondas.
   - **BUG-06 (Jitter de 1 Frame de Wingmen em Foco):** Caças aliados em descanso não reengajam instantaneamente em dogfight se o alvo estiver fora de alcance (>105u) ou em cooldown.
   - **BUG-07 (Descarte de VRAM e Geometrias de Caças Aliados):** Criado `disposeWingmanMesh(mesh)` com liberação recursiva de geometrias e materiais na remoção de membros.
   - **BUG-08 (Deduplicação de Cards Cloze no Códice de Erros):** Chave atualizada para `${e.guid}::${e.question}`, permitindo que múltiplos cartões cloze da mesma nota coexistam no resumo de erros.
   - **BUG-09 (Shield Gate e Dano Decimal no Casco):** Qualquer valor de escudo > 0 agora absorve completamente o hit que o esgota, zerando o dano excedente para o casco e mantendo a integridade inteira do HP.

2. **Otimizações de Desempenho e Coleta de Lixo (OPT-01 a OPT-05):**
   - Vetores de módulo reutilizáveis em `src/combat/projectiles.js` e consulta içada de fontes magnéticas (1x por frame).
   - Cache de frame de câmera em `src/rail.js:getSpawnFrame()`, eliminando ~1.920 alocações de `THREE.Vector3` por segundo.
   - Chamada única de `combat.getMinimapBlips()` por tick compartilhada entre radar e minimapa em `src/game-loop.js`.
   - Telemetria preguiçosa (*lazy*) em `enemy-telemetry.js` e `wingman-telemetry.js`, com geração de snapshots apenas sob demanda.
   - Vetores estáticos de módulo em `src/enemies/miniSwarm.js` e `src/combat/wingmen.js`.

3. **Validação:** Seção 9 de `src/selftest.mjs` cobrindo todos os cenários, aprovada com 20 execuções consecutivas (100% de consistência).

---

### Preparação da Arquitetura e Gatilhos de Áudio (Sound Cues) — v0.76.0

Conforme especificado pelo usuário e mapeado no checklist [`SONS_TODO.md`](SONS_TODO.md), foi preparada toda a infraestrutura de eventos e gatilhos de áudio no código-fonte de **cada personagem, nave aliada, inimigo e chefe**, **sem carregar arquivos de áudio antecipadamente (`file: null`)**:

1. **Módulo Centralizador de Sound Cues ([`src/audio-cues.js`](src/audio-cues.js)):**
   - **78 Sound Cues registradas**, catalogadas em três dicionários exportados: `PLAYER_SOUND_CUES`, `WINGMAN_SOUND_CUES` e `ENEMY_SOUND_CUES`.
   - **Parâmetros padronizados por Cue:**
     - `id`: identificador único semântico do som.
     - `file: null`: nenhum arquivo de áudio carregado ainda.
     - `durationMs`: duração estimada em milissegundos.
     - `delayMs`: atraso planejado para o início do som.
     - `cooldownMs`: janela de proteção contra disparos simultâneos/spam.
     - `volume`: intensidade relativa (0.0 a 1.0).
     - `category`: categoria (`'sfx'`, `'voice'`, `'ambient'`, `'music'`).
     - `spatial`: booleano indicando se possui posicionamento espacial 3D (`true`) ou estéreo fixo (`false`).
     - `loop`: booleano indicando se é som contínuo de sustentação.
     - `triggerLogic`: descrição da regra exata e momento do início do evento.
   - **Despachante Seguro (`triggerSoundCue(cue, params)`):**
     - Execução não-bloqueante e protegida por `try/catch`.
     - Opera como `no-op` silencioso de zero custo quando nenhum driver de som estiver conectado.
     - Encaminha automaticamente eventos e dados contextuais (`worldPos`, `damage`, `count`, etc.) para qualquer manipulador registrado via `registerAudioHandler(fn)` ou `window.__starAnkiAudio`.

2. **Gatilhos Conectados no Código de Cada Entidade:**
   - **Jogador (Player):**
     - [`src/player.js`](src/player.js): `shield_absorb`, `shield_break`, `shield_regen`, `hull_damage`, `life_lost`, `game_over`, `heal`, `boost_ignite`, `brake_ignite`, `barrel_roll`.
     - [`src/combat/projectiles.js`](src/combat/projectiles.js): `laser_fire`, `homing_fire`, `homing_impact`, `max_charge_splash`, `ricochet`, `ima_deflect_shot`.
     - [`src/game-loop.js`](src/game-loop.js): `charge_loop`, `charge_max_ready`.
   - **Companheiros de Esquadrão (Wingmen):**
     - [`src/combat/wingmen.js`](src/combat/wingmen.js): `laser_fire`, `support_volley`, `command_focus_toggle`, `command_free_toggle`, `dogfight_engage`.
     - Habilidades únicas: Falco (`falco_ram`), Peppy (`peppy_guard`), Slippy (`slippy_repair`), Phantom (`phantom_assist`).
   - **Inimigos Comuns, Especiais e Chefes:**
     - [`src/enemies/index.js`](src/enemies/index.js): `blaster_fire`, `blaster_telegraph`, `generic_death`, `time_enemy_rewind_snap`, `debris_shatter`, `debris_titanic_shatter`.
     - [`src/enemies/blaster.js`](src/enemies/blaster.js): `blaster_spin_damage`.
     - [`src/enemies/boss.js`](src/enemies/boss.js): `boss_entrance`, `boss_volley`, `boss_laser_charge`, `boss_laser_fire`, `boss_shield_activate`, `boss_phase_transition`, `boss_death_sequence`.
     - [`src/enemies/golden.js`](src/enemies/golden.js): `golden_entrance`, `golden_straight_volley`, `golden_drone_launch`, `golden_laser_fire`, `golden_teleport`, `golden_cataclysm_death`.
     - [`src/enemies/sentinela.js`](src/enemies/sentinela.js): `sentinela_gate_fire`, `sentinela_crush`, `sentinela_escape`.
     - [`src/enemies/verme.js`](src/enemies/verme.js): `verme_segment_break`.
     - [`src/enemies/sussurro.js`](src/enemies/sussurro.js): `sussurro_cloak_pulse`, `sussurro_summon`.
     - [`src/enemies/miniSwarm.js`](src/enemies/miniSwarm.js): `mini_swarm_dive_telegraph`, `mini_swarm_whoosh`.
     - [`src/enemies/fragata.js`](src/enemies/fragata.js): `fragata_side_broadside`, `fragata_core_vulnerable`.
     - [`src/enemies/timeEnemy.js`](src/enemies/timeEnemy.js): `time_enemy_time_dilation_field`.
     - [`src/enemies/ima.js`](src/enemies/ima.js): `ima_polar_pulse`.
     - [`src/enemies/replica.js`](src/enemies/replica.js): `replica_spawn`.

3. **Catálogo de Cues e Parâmetros de Timing:**

   | Categoria / Cue ID | Duração (`durationMs`) | Atraso (`delayMs`) | Cooldown (`cooldownMs`) | Espacial 3D | Momento do Gatilho / Lógica de Início |
   | :--- | :--- | :--- | :--- | :--- | :--- |
   | **Player: laser_fire** | 240ms | 0ms | 80ms | Não | Disparo instantâneo do blaster comum ao acionar gatilho |
   | **Player: charge_loop** | 1200ms (loop) | 0ms | 0ms | Não | Segurar disparo (`fireHeldMs >= homingChargeMinMs`) |
   | **Player: charge_max_ready** | 450ms | 0ms | 400ms | Não | Chime quando `fireHeldMs` atinge 100% da carga |
   | **Player: homing_fire** | 600ms | 0ms | 200ms | Não | Soltura do botão de tiro com alvos travados |
   | **Player: homing_impact** | 380ms | 0ms | 50ms | Sim | Colisão física do míssil contra o mesh inimigo |
   | **Player: max_charge_splash** | 850ms | 0ms | 300ms | Sim | Detonação em área esférica da carga máxima |
   | **Player: ricochet** | 300ms | 0ms | 60ms | Sim | Tiro saltando para o próximo alvo do encadeamento |
   | **Player: ima_deflect_shot** | 420ms | 0ms | 80ms | Sim | Projétil refletido ou curvado por campo polar |
   | **Player: barrel_roll** | 480ms | 0ms | 300ms | Não | Esquiva lateral ativada com Z ou C |
   | **Player: boost_ignite** | 350ms | 0ms | 200ms | Não | Início imediato do impulso propulsor frontal |
   | **Player: brake_ignite** | 320ms | 0ms | 200ms | Não | Acionamento dos retrofoguetes de frenagem |
   | **Player: shield_absorb** | 280ms | 0ms | 60ms | Não | Escudo absorvendo impacto sem se esgotar |
   | **Player: shield_break** | 720ms | 0ms | 500ms | Não | Escudo reduzido a zero (quebra do campo) |
   | **Player: shield_regen** | 400ms | 0ms | 1000ms | Não | Início do ciclo de recarga passiva do escudo |
   | **Player: hull_damage** | 520ms | 0ms | 120ms | Não | Dano penetrante atingindo o casco diretamente |
   | **Player: life_lost** | 1300ms | 0ms | 1000ms | Não | Perda de um caça/vida de reserva |
   | **Player: game_over** | 3200ms | 150ms | 0ms | Não | Destruição final (última vida perdida) |
   | **Player: heal** | 650ms | 0ms | 400ms | Não | Coleta de kit médico ou reparo de casco |
   | **Wingman: laser_fire** | 220ms | 0ms | 100ms | Sim | Disparo do canhão auxiliar de caça aliado |
   | **Wingman: support_volley** | 350ms | 0ms | 250ms | Sim | Rajada de cobertura sincronizada com o líder |
   | **Wingman: dogfight_engage** | 450ms | 0ms | 2000ms | Sim | Entrada autônoma em perseguição de alvo |
   | **Wingman: commands** | 260ms | 0ms | 200ms | Não | Alternância entre Postura de Foco e Postura Livre |
   | **Wingman: falco_ram** | 750ms | 0ms | 1000ms | Sim | Execução da manobra aríete de Falco |
   | **Wingman: peppy_guard** | 850ms | 0ms | 1000ms | Sim | Barreira de interceptação defensiva de Peppy |
   | **Wingman: slippy_repair** | 900ms | 0ms | 1000ms | Sim | Drones de nanocura e reparo de Slippy |
   | **Wingman: phantom_assist** | 800ms | 0ms | 1000ms | Sim | Transferência de sobrecarga de Phantom |
   | **Enemy: blaster_fire** | 280ms | 0ms | 90ms | Sim | Disparo frontal padrão do caça Blaster |
   | **Enemy: blaster_telegraph** | 320ms | 0ms | 300ms | Sim | Brilho e trava de mira 300ms antes do tiro |
   | **Enemy: blaster_spin** | 420ms | 0ms | 200ms | Sim | Dano de colisão durante giro fora de controle |
   | **Enemy: generic_death** | 650ms | 0ms | 50ms | Sim | Explosão ao zerar HP de unidade comum |
   | **Enemy: mini_swarm_dive** | 340ms / 550ms | 0ms | 200ms | Sim | Telegraph de mergulho e whoosh de rasante |
   | **Enemy: time_rewind_snap**| 480ms | 0ms | 600ms | Sim | Salto temporal / restauração de estado |
   | **Enemy: debris_shatter** | 600ms / 1400ms | 0ms | 80ms | Sim | Estilhaçamento de asteroide ou detrito titânico |
   | **Enemy: sentinela** | 420ms / 850ms | 0ms | 300ms | Sim | Disparo de moldura, fechamento esmagador e fuga |
   | **Enemy: verme_break** | 400ms | 0ms | 100ms | Sim | Rompimento de anel segmentado do verme |
   | **Enemy: sussurro** | 500ms / 800ms | 0ms | 400ms | Sim | Pulso de invisibilidade e invocação de sombras |
   | **Enemy: fragata** | 700ms / 950ms | 0ms | 300ms | Sim | Bateria lateral pesada e exposição de núcleo |
   | **Boss: entrance** | 1800ms | 0ms | 0ms | Não | Entrada cinematográfica da nave capitânia |
   | **Boss: volley / laser** | 450ms / 1400ms | 0ms | 150ms | Sim | Rajada massiva de dispersão e canhão de feixe contínuo |
   | **Boss: shield / phase** | 750ms / 1600ms | 0ms | 500ms | Não | Ativação de barreira e transição de fase com sobrecarga |
   | **Boss: death_sequence** | 4200ms | 0ms | 0ms | Não | Sequência encadeada de múltiplas explosões finais |
   | **Golden: entrance / warp**| 1600ms / 500ms | 0ms | 0ms | Sim | Aparição dimensional e teleporte quântico |
   | **Golden: cataclysm** | 3800ms | 0ms | 0ms | Não | Morte cataclísmica com clarão e pulso eletromagnético |

4. **Validação Automatizada:**
   - Adicionada Seção 10 em `src/selftest.mjs`, validando cada um dos 78 cues e testando o despacho com e sem manipulador.
   - `node src/selftest.mjs`: **100% aprovado** (*"78 Sound Cues validadas"*).
   - `node --check` validado em todos os 18 arquivos modificados: **0 erros**.

### Reorganização da Documentação — Pasta `progresso/`

Pedido do usuário: criar uma pasta específica para onde devem ficar os patch notes e documentos
de progresso, em vez de espalhados soltos na raiz do projeto junto com planos/checklists.

1. **Criada a pasta [`progresso/`](.)** e movidos pra dentro dela (via `git mv`, histórico
   preservado) os documentos que registram trabalho já feito: `PROGRESSO.md` (renomeado de
   `progresso.md` — corrige o casing divergente já documentado como pendência antiga),
   `PROGRESSO_POS_0.30.md`, `PROGRESSO_POS_0.50.md`, `PROGRESSO_POS_.60.md`,
   `PROGRESSO_POS_.70.md` (este arquivo), `REGISTRO_AUDITORIA_E_CORRECOES.md` e
   `Info mudancas.md`.
2. **Ficaram na raiz** os documentos de planejamento/checklist (natureza diferente — descrevem
   trabalho ainda NÃO feito ou processo a seguir, não histórico): `TEMPLATE_INIMIGOS.md`,
   `BACKLOG.md`, `SONS_TODO.md`, `PLANO_HABILIDADES_ESQUADRAO.md` e
   `OVERHAUL_ESTADOS_INIMIGOS.md` (plano de FSM ainda não implementado).
3. **Links atualizados** em `CLAUDE.md`, `README.md` e `PLANO_HABILIDADES_ESQUADRAO.md` pra
   apontar pro novo caminho `progresso/...`. Os links cruzados *entre* os arquivos que se
   moveram juntos não precisaram de mudança (continuam irmãos na mesma pasta).
4. **Convenção daqui pra frente**: todo novo patch note / atualização de progresso vai em
   `progresso/`; a raiz fica só pra planejamento, checklists obrigatórios e docs de projeto
   (`README.md`, `CLAUDE.md`).

### Motor de Validação Guiada por IA (`aiValidator`) + `FLUXO_VALIDACAO_IA.md`

Pedido do usuário (inspirado num documento de outro projeto seu, "Magispelll", que **não** se
aplica aqui — adaptado do zero pra arquitetura real do Star-Anki, não copiado). Objetivo: fechar
o loop entre "a IA escreveu uma mecânica nova" e "funcionou de verdade quando um humano jogou",
sem depender só de descrição verbal de bug.

1. **Novo módulo [`src/ai-validator.js`](../src/ai-validator.js)**: factory `createAIValidator()`
   (mesmo padrão de `createEnemyTelemetry()`/`createWingmanTelemetry()`) + singleton exportado
   `aiValidator`. API: `expect(descrição, fnAvaliação, contexto)` registra uma suposição sobre
   estado crítico (nunca lança exceção; só guarda `contexto` se falhar) e `logMechanic(nome,
   ação, snapshot)` registra um passo de mecânica nova numa timeline circular (últimos 200).
   `copyReport()` reusa `copyTextToClipboard` de `telemetry-utils.js`; `reset()` zera tudo.
2. **Integrado ao painel de debug** (categoria "Testes & Visual"): botões "Copiar Log de
   Validação IA" e "Limpar Log de Validação IA" em `debug.js`/`debug-actions.js`, `aiValidator`
   injetado via `deps` em `mount-game.js` — mesmo padrão de injeção dos outros sistemas.
3. **Exemplo real instrumentado** em `player.js` (`takeDamage`): expectativa de que o escudo
   nunca fica negativo nem passa do máximo após absorver dano — serve de referência de uso.
4. **Documento de fluxo**: [`FLUXO_VALIDACAO_IA.md`](../FLUXO_VALIDACAO_IA.md) (raiz — é
   processo/checklist, não histórico) explica quando/como instrumentar, a regra de só usar em
   eventos discretos (nunca dentro de `update(dt)` a 60fps) e o ciclo de feedback (IA instrumenta
   → usuário joga → copia log → cola na conversa → IA lê `expectativas_falhas`). Referenciado a
   partir de `CLAUDE.md`. Escopo é só features novas/alteradas — não retroativo ao código legado.
5. **Validação**: testado via `window.__starAnki.player.takeDamage()` no browser (4 hits reais
   quebrando o escudo 3→0, 4/4 expectativas registradas, 0 falhas) e `node src/selftest.mjs`
   (100% aprovado, nenhuma regressão). Complementa selftest.mjs, não substitui — selftest cobre
   cenário sintético pré-commit, `aiValidator` cobre comportamento emergente de sessão real.

### Overhaul FSM dos Inimigos — Fase 1 (Blaster + Tank)

Pedido do usuário: prosseguir com `OVERHAUL_ESTADOS_INIMIGOS.md` (documento de implementação
escrito pela ferramenta "Antigravity", sem passar pelo processo deste projeto). Regra dura do
`CLAUDE.md`/`TEMPLATE_INIMIGOS.md` obrigou reler o código real e confirmar com o usuário antes de
tocar em qualquer inimigo — o documento tinha números certos (Blaster: `recoilZ=-0.3`,
`rotation.x=-0.35`, fórmula do `tumbleRollSpeed`, limiar de 4 tiros, telegraph 0.3s, todos
conferidos) mas também **2 erros concretos verificados** em Boss/Golden (fora de escopo nesta
fase, ficam pra quando chegar a vez deles): duração de transição de fase documentada como 2.0s
(real: `PHASE_TRANSITION_DURATION_S=1.2`, o próprio código comenta "1.2s") e um vínculo inventado
"transição ativa o escudo refletor" (o escudo é um ciclo independente de 7s/3s que na real
**pausa**, não ativa, durante a transição). O documento também subestimava o quanto Blaster está
entrelaçado com o loop compartilhado de `enemies/index.js` (Tank compartilha o mesmo mecanismo de
tiro/telegraph/desengate; só Blaster e Tank de fato alcançavam o fallback `fireEnemyProjectile`
hoje — Boss/Time/Sentinela desviam pra suas próprias funções).

Usuário escolheu: **Blaster + Tank juntos nesta fase** (dividem o mesmo mecanismo de tiro — migrar
só um deixaria o mecanismo "pela metade") e **remover só os campos mortos confirmados**
(`panicked`/`panicTimer`, nunca lidos em lugar nenhum; o argumento `'left'/'right'` de
`breakBlasterWing` que a função de 1 parâmetro sempre ignorava) — todo o resto, incluindo duas
esquisitices encontradas (Blaster com asa quebrada girando ainda pode atirar; o giro de asa
quebrada só existe em modo trilho, nunca em arena), fica exatamente igual ao de hoje.

1. **[`src/enemies/state-machine.js`](../src/enemies/state-machine.js) (novo)**: motor de FSM
   genérico e leve (`createStateMachine`, `ENEMY_STATES`), zero dependência de Three.js (roda em
   Node puro, testável direto em `selftest.mjs`). `transition()` chama `onExit`→troca de
   estado→`onEnter`; `update()` acumula `timeInState` e despacha pro estado atual; transição pra
   estado inexistente lança erro claro.
2. **[`src/enemies/blaster.js`](../src/enemies/blaster.js) reescrito**: FSM completa
   (`SPAWNING→ENGAGED→TELEGRAPHING→ATTACKING→RECOVERY→ENGAGED`, `CRITICAL_TUMBLE`,
   `DISENGAGING`), preservando os valores reais item por item. Achado durante testes ao vivo (e
   corrigido antes de fechar): a primeira versão de `RECOVERY` sempre voltava pra `ENGAGED`, o que
   fazia uma asa quebrada "curar sozinha" depois de 1 tiro — o código antigo checava `tumbleSpin`
   *antes* de `disengaging` e ambos davam `return` (asa quebrada sempre vencia, pra sempre, mesmo
   com 4 tiros completados); `RECOVERY` agora confere `wingBroken` primeiro e volta pra
   `CRITICAL_TUMBLE` nesse caso, reproduzindo o mesmo predomínio.
3. **[`src/enemies/tank.js`](../src/enemies/tank.js) reescrito**: mesma FSM, bem mais simples
   (sem movimento próprio no trilho, sem `CRITICAL_TUMBLE` — Tank nunca teve conceito de asa).
4. **[`src/enemies/shared.js`](../src/enemies/shared.js)**: ganhou `ENEMY_FIRE_RANGE`/
   `ENEMY_FIRE_MIN_DISTANCE`/`ENEMY_ARENA_FIRE_MAX_DISTANCE` (movidos de `index.js`, mesmos
   valores) e `enemyInFireRange(enemy, ctx)`, usado pelos dois.
5. **`src/enemies/index.js`**: novo branch auto-contido (`if (enemy.fsm) { enemy.fsm.update(...);
   continue }`) logo após o do MiniSwarm, seguindo o mesmo precedente já existente no código.
   Removidos os branches agora mortos de Blaster no dispatch de movimento, no carve-out de
   `lookAt`/`rotation.z` e no rastro do propulsor; `hitRadiusFor`/`deathDurationFor`/
   `killPointsFor` ganharam casos explícitos pra Blaster/Tank (valores idênticos ao `default` que
   usavam antes — zero mudança de comportamento pra quem continua usando esse default, como
   MiniSwarm em `deathDurationFor`). `breakBlasterWing` perdeu o argumento `'left'/'right'` morto.
6. **`src/enemies/enemy-telemetry.js`**: heurística de estado agora lê `enemy.fsm.currentState`
   direto quando existe (Blaster/Tank), mantendo o fallback antigo pros 11 inimigos ainda não
   migrados. Bug pré-existente e não relacionado encontrado mas **não corrigido** (fora de escopo,
   avisado ao usuário): `specialInfo` do Blaster sempre imprime `"profile=padrao"` porque
   `e.profile` é string, não `{name}`.
7. **`src/selftest.mjs`**: nova Seção 11 — testes reais de `createStateMachine` (ordem
   onExit/onEnter, `timeInState`, `isIn`, erro claro em transição/estado inicial inexistente) e
   testes de fidelidade de valores (fórmula de `inFireRange`, limiar de 4 tiros, wing-break só em
   hit não-letal) no padrão já usado no arquivo (função local simulando a lógica real, já que
   Blaster/Tank dependem de Three.js via import map e não são importáveis em Node puro).
8. **Validação**: `node --check` em todos os arquivos, `node src/selftest.mjs` 100% aprovado.
   Testado ao vivo via `window.__starAnki` (porta 8420 estava ocupada por outra sessão servindo
   uma cópia desatualizada de `blaster.js` — subi uma instância própria de
   `tools/no-cache-server.py` na porta 8421 pra garantir arquivo fresco): ciclo completo
   `SPAWNING→ENGAGED→TELEGRAPHING→ATTACKING(shotsFired++)→RECOVERY→ENGAGED` confirmado pra
   Blaster e Tank; limiar de 4 tiros→`DISENGAGING` (`rotation.x=-0.35`) confirmado pros dois;
   `CRITICAL_TUMBLE` confirmado disparando/telegrafando normalmente enquanto gira, e persistindo
   através de múltiplos ciclos de tiro mesmo depois do limiar de desengate (é onde o bug do item 2
   foi pego). Não tocado: os outros 11 tipos de inimigo, que continuam na fase seguinte.
9. **Segunda rodada de caça a bugs** (pedido explícito do usuário, "última checagem de gameplay"),
   depois do commit acima:
   - Testado tiro REAL do jogador (`combat.tryFire`) contra um Blaster de esquadrão até acertar —
     confirma que o caminho de colisão de verdade (não só a transição de FSM forçada manualmente)
     chega em `breakBlasterWing`/`CRITICAL_TUMBLE` corretamente.
   - **2º bug achado e corrigido**: o bail-out do `TELEGRAPHING` (quando o alvo sai de alcance no
     meio do telegraph) também voltava incondicionalmente pra `ENGAGED`, ignorando `wingBroken` —
     mesma classe do bug do item 2, só que num ponto de transição diferente. Extraída a decisão
     "pra onde volta depois de um ciclo de tiro" pra uma função só (`returnFromFireCycle`,
     `wingBroken`→`CRITICAL_TUMBLE` sempre primeiro), reusada por `RECOVERY` e pelo bail-out do
     `TELEGRAPHING` — impossível os dois pontos divergirem de novo no futuro.
   - Sweep de compatibilidade: spawnados os 13 tipos de inimigo simultaneamente (incluindo Boss/
     Golden/Fragata de fora, e squadron) e rodados ~240 frames — zero erros de console, zero
     exceções no loop, `getEnemySnapshots`/`getMinimapBlips`/`getHitboxTargets` sem lançar. O
     desaparecimento de Tank/Time/Detrito/Ima/MiniSwarm depois de alguns segundos é o despawn por
     distância percorrida genérico (pré-existente, eles não têm movimento próprio no trilho pra
     acompanhar o avanço do trilho) — não é regressão. Fragata não spawna fora de arena
     (comportamento já documentado, não relacionado).
   - `node --check` + `node src/selftest.mjs` 100% aprovado depois da correção do 2º bug.

### Correção: Esquadrão "em transe" (aliados quase parados na tela, atacam raramente sozinhos)

Reportado pelo usuário com vídeo (`2026-09-17 22-09-27.mp4`) — extraí frames com ffmpeg pra
confirmar visualmente antes de mexer em [`src/combat/wingmen.js`](../src/combat/wingmen.js): os
4 aliados ficavam essencialmente parados na posição relativa à câmera por vários segundos, com um
leve "flutuar" (ease-in-ease-out), e só entravam em combate via comando manual `[D]`. O usuário
não lembrava de ter pedido esse resultado — e não pediu: são efeitos colaterais reais de tuning
anterior (v0.70.0 "menos agressivo", fix do "chacoalhar" em v0.73.2) que, somados, foram longe
demais. Usuário escolheu corrigir a suavização + soltar mais o alcance de patrulha e a frequência
de ataque automático, sem voltar ao "ataca tudo com mira perfeita" de antes.

1. **Bug real (suavização em dobro)**: `patrolTarget` era suavizado com `lerp(_wmSlotPos,
   1-exp(-2.2*dt))` A CADA FRAME do estado `patrol`, mas `_wmSlotPos` (vaga de formação) já se
   move sozinha todo frame porque segue o jogador — suavizar um alvo que nunca para de se mover
   cria um atraso permanente (matemática de filtro exponencial seguindo uma rampa: ~22 unidades de
   atraso constante em cruzeiro, bem acima da margem de ±4u que a lógica de `cruiseSpeed`
   já tolerava sem corrigir). Depois disso, a velocidade era suavizada DE NOVO em cima do alvo já
   atrasado — duas camadas de amortecimento empilhadas, a causa direta do "transe". Fix: o lerp
   agora só roda nos primeiros 0.6s depois de entrar em `patrol` (cobre a curva suave de retorno
   que o v0.73.2 pediu, pro caso de sair de dogfight/ram/escolta); depois disso, `patrolTarget`
   acompanha a vaga em tempo real e a suavização de velocidade (`accelRate`) sozinha já basta pro
   "voo macio" sem o atraso extra.
2. **"Mais alcance de patrulha"**: adicionado um componente de vaguear lento e largo (~35-55s de
   período, 5.5/2.2 unidades de amplitude) somado ao micro-flutuar rápido que já existia — a vaga
   de formação em si passa a variar visivelmente ao longo do tempo em vez de ser um ponto fixo,
   sem virar "fly-by livre" (opção que o usuário rejeitou explicitamente por risco de reintroduzir
   o caos de antes).
3. **Engajamento automático mais frequente**: chance de checagem 45%→65%, cone de detecção à
   frente alargado (`dotForward` 0.2→-0.15, de ~78° pra ~99° de meio-ângulo), alcance de detecção
   65→80u (trilho) e 60→75u (arena), cooldown de reengajamento depois de um dogfight reduzido de
   5-8.5s pra 3-5.5s. Mantido intacto: só 1 aliado briga por vez, dano/precisão/duração de rajada
   (isso não fazia parte da reclamação e evita voltar ao "ataca tudo" já nerfado antes).
4. **Validação**: `node --check` + `selftest.mjs` 100% aprovado. Ao vivo via
   `window.__starAnki`: amostrado offset de cada aliado em relação ao jogador a cada 10 frames por
   10s — percurso relativo real de 83 a 144 unidades por aliado (antes, visualmente perto de zero
   no vídeo do usuário); log de voo confirmou 3 aliados diferentes (Slippy, Phantom, Peppy)
   engajando sozinhos contra alvos distintos nos mesmos 10s, sem nenhum comando `[D]` manual.

### v0.77.0 — Inimigos 20% mais distantes no spawn + versão atualizada

Pedido do usuário: "não esqueça de atualizar a versão" + "inimigos surjam no mínimo 20% mais
distantes do jogador". Versão bumped `v0.76.1` → `v0.77.0` (cobre também a Fase 1 do overhaul FSM
e o fix do esquadrão acima, que ainda não tinham gerado bump).

1. **Levantamento antes de mexer**: toda constante de distância de spawn em `src/enemies/*.js` +
   `src/main-constants.js` (Golden). Achados que mudam a forma de aplicar o pedido:
   - Em modo ARENA, `spawnPositionForEnemy()` (`shared.js`) **ignora** o min/max de cada inimigo e
     usa sempre `ENEMY_ARENA_SPAWN_MIN/MAX` — inclusive Boss (`ENEMY_ARENA_SPAWN_MAX*0.6` a
     `ENEMY_ARENA_SPAWN_MAX`) e Fragata (que passa `50, 85` pra essa função, mas como só spawna em
     arena, esses dois números são código morto).
   - Sentinela tem `SPAWN_DISTANCE_MIN/MAX` (45/70) declarados mas **nunca lidos** — a posição
     real usa `ENGAGE_STANDOFF` (48u fixo), mantido durante a luta INTEIRA (não só no spawn).
     Perguntei ao usuário se queria escalar isso também — respondeu que sim, mas com **+30%** em
     vez de +20% (justamente por ser a distância de combate inteira, não só a de entrada).
   - Boss orbes de pergunta (`BOSS_SPREAD_MIN/MAX_BASE`) e a distância de preview cinematográfico
     do Boss/Dourado (`ARENA_PREVIEW_DISTANCE=220`) são categorias diferentes (alvo de
     pergunta / cutscene, não "inimigo aparecendo") — não tocados.
2. **+20% aplicado** (arredondado, nunca abaixo de 20%) em: `BLASTER_SPAWN_DISTANCE_MIN/MAX`
   (45/75→54/90), Tank (45/70→54/84), TimeEnemy (45/75→54/90), Detrito (45/80→54/96), Ima
   (40/65→48/78), Replica (45/70→54/84), Sussurro (45/75→54/90), Verme (45/75→54/90), MiniSwarm
   (48/75→58/90, 58 arredondado pra cima de 57.6), `ENEMY_ARENA_SPAWN_MIN/MAX` em `shared.js`
   (45/80→54/96 — cobre automaticamente Boss e Fragata via a mesma função), `GOLDEN_SPREAD_MIN/MAX`
   em `main-constants.js` (40/90→48/108, com os defaults internos de `golden.js` sincronizados).
3. **+30% aplicado** em: `ENGAGE_STANDOFF` da Sentinela (48→62).
4. **Validação**: `node --check` + `selftest.mjs` 100% aprovado. Ao vivo via
   `window.__starAnki`: spawnado cada um dos 10 tipos "normais" e medida a distância real até o
   jogador no instante do spawn — todas dentro da faixa nova esperada. A Sentinela mediu 48.4u de
   distância ao jogador nesse teste (não os 62 esperados) por causa de um desalinhamento
   pré-existente e não relacionado entre `rail.getSpawnFrame()` (usado por `projectSentinelaToWorld`,
   ~14u atrás do frame atual do jogador no momento do teste) e a posição real do jogador — o campo
   `enemy.depth` no spawn confirmou os 62 exatos, então a constante está certa; o desvio é só no
   metro usado pra verificar, não no valor aplicado.

### v0.78.0 — HUD orbital de vida/escudo/impulso (opção alternativa nas Configurações)

Pedido do usuário: explorou num canvas de design separado (fora deste fluxo) várias opções pra
tirar o cluster de vida/escudo/impulso do canto fixo da tela e colocar ao redor da própria nave;
depois de iterar o visual até chegar em arcos lisos e concêntricos (sem segmentos/lâminas
individuais — pedido explícito: "sua ideia... é muito detalhada visualmente e pode distrair"),
pediu pra implementar como **opção alternativa em Configurações**, não substituindo o cluster de
canto existente.

1. **`settings.js`**: novo campo `vitalsHudStyle` (`'classic'` default | `'orbital'`), mesmo
   padrão de `shipVisual`/`startingWingmen` — persistido via `setSetting`, lido uma única vez por
   `createGameHud()` na criação do HUD (não troca ao vivo em partida, só no próximo jogo).
2. **`hud-settings.js`**: novo seletor de 2 botões na seção "Visual" (mesmo padrão visual do
   seletor de nave existente).
3. **`hud-game.js`**: o bloco que criava o cluster de canto virou um `if (!useOrbitalVitals) {...}
   else {...}` — ramo clássico inalterado (mesmos elementos/classes de sempre), ramo novo constrói
   um `<svg>` com 3 `<path>` concêntricos (escudo raio 95 / vida raio 128 / impulso raio 161,
   varredura de ~100° a ~-60° ao redor da âncora, cima-esquerda) usando `pathLength="100"` +
   `stroke-dashoffset` pra encolher/crescer de forma lisa (sem keyframes fake — o offset é escrito
   direto a partir da fração real de vida/escudo/boost a cada chamada de `setStatus/setShield/
   setBoost`, o que dá de graça uma transição suave via `transition: stroke-dashoffset` no CSS).
   Vidas viram `<circle>` numa trilha na ponta da varredura (mesma lógica de rebuild-on-max-change
   do cluster clássico). Crítico de vida (`LOW_HEALTH_THRESHOLD_FRAC`), hit-flash, boost ativo e
   boost-pronto têm equivalente visual no arco (pulso de cor/glow em vez de segmento piscando).
   Novo método `setVitalsAnchor(xFrac, yFrac)` (no-op no clássico) posiciona o cluster orbital via
   `left/top` em `%`, mesmo padrão de `setReticlePosition`.
4. **`game-loop.js`**: chama `setVitalsAnchor` a cada frame com a posição da nave projetada na
   tela (`playerPos` + leve offset em `noseFrame.up`, via `.project(camera)`, mesmo padrão já
   usado por `setReticlePosition`/`updateSquadronNoticePosition`/threat pointers) — clamp de
   margem generosa (x 0.18-0.82, y 0.34-0.90) porque o cluster se estende bem mais pra cima da
   âncora que pros lados/baixo (a varredura vai de baixo-direita a cima-esquerda), evitando cortar
   no topo da tela quando a nave sobe perto da borda.
5. **CSS** (`hud-styles.js`): novo bloco `.hud-vitals-orbital`/`.hvo-*`; `.hud-vitals-orbital`
   também entrou nas duas listas de seletores que escondem HUD durante cutscenes cinemáticas
   (`.cinematic-active .hud-vitals-cluster, ...`) — sem isso o cluster orbital ficaria visível por
   cima de cutscenes, já que aquela regra listava só a classe do cluster clássico.
6. **Validação**: `node --check` em todos os arquivos tocados + `selftest.mjs` 100% aprovado.
   Testado ao vivo via `preview_start`: alternado o setting nas Configurações (persiste em
   `localStorage`), confirmado visualmente em partida real (não só mockup) que os 3 arcos
   aparecem, encolhem corretamente com dano real (escudo chegou a 0 = arco some, vida crítica =
   arco pisca vermelho via classe `.crit`), acompanham a nave se movendo pela tela, e que o
   cluster clássico continua idêntico a antes (zero regressão) com o setting em `'classic'`.


