# Progresso pós-v0.70 — CONGELADO na v0.84.0

> **⚠️ Este arquivo está congelado.** O histórico cobre v0.75.0 → v0.84.0.
> A continuação está em [PROGRESSO_POS_.80.md](PROGRESSO_POS_.80.md).

Continuação do [PROGRESSO_POS_.60.md](PROGRESSO_POS_.60.md) (histórico v0.61.0 → v0.74.1, agora
congelado).

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

### Ficha HTML preenchível do TEMPLATE_INIMIGOS.md (ferramenta, sem versão de jogo)

Pedido do usuário: uma versão em HTML do `TEMPLATE_INIMIGOS.md` pra preencher e colar de volta no
chat, em vez de responder o checklist inteiro em texto corrido.

1. Publicado como Artifact (link privado do usuário, fora do repo) — `SECTIONS` no script espelha
   fielmente as 14 seções (0-13) do `.md`, uma `<textarea>` por pergunta, autosave em
   `localStorage`, indicador de progresso, navegação rápida por seção, e um botão "Gerar resumo"
   que monta markdown só com as seções tocadas (perguntas em branco viram `(não respondido)` em
   vez de sumir silenciosamente).
2. Botão por seção "Inimigo não usa / não tem" pra marcar uma seção inteira como não aplicável
   (em vez de deixar tudo em branco, que ficaria ambíguo com "esquecido") — desabilita os campos
   da seção e o resumo imprime "Não se aplica a este inimigo" pra ela.
3. **`TEMPLATE_INIMIGOS.md` ganhou perguntas novas nas seções 5/6/7** (pedido do usuário, faltavam
   no checklist original) — espelhadas também na ficha HTML:
   - Seção 5: se o dano do projétil do inimigo varia por nível de dificuldade (mín/máx).
   - Seção 6: se o HP varia por nível de dificuldade (mín/máx); se regenera vida (taxa/gatilho/
     teto); se cria um escudo/barreira PRÓPRIO (camada de HP extra separada da vida — diferente do
     escudo refletor que já existia na pergunta de bloqueio); se é totalmente imune a tiro normal
     (dano zero, não só bloqueio parcial).
   - Seção 7: se é totalmente imune a tiro carregado/teleguiado (dano zero).
   Nenhum inimigo existente usa essas mecânicas hoje — são perguntas em aberto pra inimigos
   futuros, mesmo padrão de "não existe referência ainda" já usado em outros itens do template.

### v0.79.0 — Novo inimigo: Horda (atirador grande, fusão Blaster + Mini-Swarm)

Ficha completa preenchida pelo usuário via [TEMPLATE_INIMIGOS.md](../TEMPLATE_INIMIGOS.md) (versão
HTML), com duas rodadas de perguntas de clarificação antes de codar (checklist do template
cumprido à risca — várias respostas mudaram decisões de design, ver abaixo).

1. **`src/enemies/horda.js`** (novo) — só trilho, órbita distante do jogador (raio 12, ângulo
   0.35 rad/s) mantendo um standoff-alvo de 80u (45u durante o impulso do jogador) via **correção
   proporcional em cima da própria variável `depth`** (não remede a posição projetada contra
   outro frame — ver armadilha #1 abaixo). Dispara projétil genérico (`fireEnemyProjectile`
   estendida com `enemy.projectileOpts` — geometria/material/velocidade/hitRadius/maxRange/dano
   customizados por inimigo, sem quebrar ninguém que não define isso) grande e vermelho, mira
   perfeita, dano 5 (+1 por nível de dificuldade), até 6 tiros então foge (mesmo padrão de fuga do
   Blaster). Ao morrer (qualquer via — tiro normal/carregado/splash/aríete), se parte num grupo de
   mini-swarms DE VERDADE (`spawnMiniSwarmFromHorda` em `miniSwarm.js`, kind reaproveitado 100%)
   que passam 4s numa fase nova `spreadOut` (substitui a patrulha normal) se afastando ~1 nave de
   distância entre vizinhos antes de entrar no telegraph/mergulho padrão. HP 15/dano 5/quantidade
   de filhotes 5, todos +1 por nível — nível travado no momento do spawn.
2. **`getDifficultyLevel()` (novo, `enemies/shared.js`)** — nível 1-9, pequeno helper reusável
   (só a Horda usa por enquanto) que traduz o `wrongAnswerCount` contínuo do jogo (não existe
   "nível" discreto em lugar nenhum) em nível: +1 a cada 2 erros; em **modo arcade** (`deck.
   isNoDeck`, onde não há perguntas erradas pra contar) usa `session.score` em vez disso, +1 a
   cada 10000 pontos — pedido explícito do usuário. `isNoDeck` precisou ser plumbado até
   `game-loop.js` (não existia lá antes — `mount-game.js` agora passa `isNoDeck: !!deck?.isNoDeck`
   nos deps do `createGameLoop`).
3. **Mudança de balanceamento pedida pelo usuário, escopo global** (não só Horda): toque simples
   (sem carta "impulso aríete") só mata de verdade o Mini-Swarm agora — todo outro inimigo (Chefe/
   Dourado já eram assim; Blaster/Tank/Detrito/Sentinela/Fragata/etc. agora também) é imune a
   toque simples, precisa da carta pra sofrer dano de contato de verdade. Mudança de **uma linha**
   em `enemies/index.js` (inverteu a condição `!== BOSS_KIND` pra `=== MINI_SWARM_KIND`) porque o
   dano de aríete (`ramDamage>0`) já era genérico pra qualquer kind — só a exceção de imunidade
   era hardcoded pro Chefe.
4. **Wingmen "focam mais" na Horda** — único caso de PRIORIDADE de alvo no jogo (`combat/
   wingmen.js`, candidatos de dogfight autônomo agora ordenam Horda primeiro, distância depois; até
   aqui todo inimigo só era excluído/incluído da lista, nunca priorizado dentro dela).
5. **Painel de debug**: `spawnHorda` em `debug.js`/`debug-actions.js`.
6. **Validado com `aiValidator.expect()`** (FLUXO_VALIDACAO_IA.md): stats escaladas certas no
   spawn, grupo de split com o tamanho/posição certos, e que toque simples só remove Mini-Swarm —
   16/16 expectativas passaram no teste ao vivo (ver item 7).
7. **Duas armadilhas reais pegas testando ao vivo** (`window.__starAnki.step(frames, dtMs)`,
   modo arcade, `sa.combat.spawnHorda(nível)`) — guarde pra próximos inimigos com movimento
   "auto-regulado" (que tenta manter uma distância-alvo em vez de só avançar):
   - **Nunca remedir uma posição já projetada por `rail.getSpawnFrame()` contra outro frame** (ex.:
     `rail.getFrameAt(0)`, usado pelo despawn genérico) pra fechar um controlador proporcional — os
     dois frames não são o mesmo ponto/orientação, e o erro medido errado se realimenta e diverge
     (a Horda saía disparada a dezenas de unidades por segundo em poucos segundos de teste). A
     correção certa usa a própria variável de estado (`depth`) como fonte da verdade, sem
     remedição via posição de mundo.
   - **O despawn genérico de trilho tem um teto de 180u percorridas desde o spawn** (`rail.
     getDistance() - enemy.spawnRailDist > 180`), pensado pra inimigos que cruzam a tela rápido
     (Blaster/Tank). Um inimigo com engajamento longo de propósito (Horda: órbita + até 6 tiros a
     ~3s cada, ~18-20s) estourava esse teto e desaparecia com só 2-3 tiros disparados, MESMO
     ficando numa posição relativa perfeitamente saudável (`relativeForward`/`screenY` normais) —
     o teto mede distância ABSOLUTA percorrida pelo trilho, não "está fora de posição". Isento a
     Horda desse teto especificamente (ela já tem standoff/PASS_BEHIND/offScreenAbove como rede de
     segurança própria); qualquer inimigo novo com engajamento > ~10s no trilho vai precisar da
     mesma isenção ou vai sumir cedo demais do mesmo jeito.

### v0.80.0 — Overhaul do menu de pausa (continuar/opções/reiniciar/sair)

Pedido do usuário: antes disso, pausar (`Esc`/`P`, ver `keybindings.js`) só mostrava um "Pausado"
sem nenhum botão (`.hud-pause` em `index.html`, sem nenhum CSS de verdade). Overhaul adiciona um
menu de verdade com 4 opções, decididas via clarificação: (1) opções "básicas" = só o que faz
efeito imediato na partida em andamento (visual/sensibilidade/keybinds — vida inicial e esquadrão
inicial ficaram de fora de propósito, só valem pra próxima partida); (2) Reiniciar/Sair exigem
confirmação (descartam pontuação/progresso); (3) "Reiniciar" = mesma partida do zero (mesmo
baralho/config), não volta pro menu.

1. **`src/hud-pause.js`** (novo) — overlay que fica POR CIMA do jogo congelado dentro do próprio
   `#game-screen` (mesmo padrão do `.card-choice-overlay` de upgrade de carta, não é uma tela via
   `showScreen()`). Views internas: menu principal (Continuar/Opções/Reiniciar/Sair) → Opções
   (3 seções reaproveitadas, ver abaixo) → confirmação (texto de aviso + Sim/Cancelar) antes de
   Reiniciar ou Sair. `hide()` limpa qualquer listener de rebind de teclado ainda pendente.
2. **`src/hud-settings.js` refatorado** — as 3 seções que a pausa reusa (Visual: barra de vida dos
   inimigos/nave/estilo do HUD vital; Sensibilidade: giro em arena; Controles: rebind de teclado)
   viraram builders exportados (`buildVisualSection`/`buildSensitivitySection`/
   `buildKeybindSection`) em vez de código inline dentro de `showSettingsScreen` — evita duplicar
   ~180 linhas entre a tela de Configurações completa (pré-jogo) e o painel enxuto da pausa.
   `buildKeybindSection` retorna `{el, cleanup}` porque precisa de um listener global de keydown
   pro modo "Pressione uma tecla..." — `showSettingsScreen` e `hud-pause.js` chamam `cleanup()`
   nos seus próprios pontos de saída (senão o listener vaza). Gamepad ficou de fora da pausa de
   propósito (só a tela de Configurações completa continua tendo).
3. **`src/game-menu.js`**: `playAgain` (já existia, só uso interno do botão "Jogar de novo" do fim
   de setor) e `restart` agora também são passados dentro do objeto `menu` que `startGame()` entrega
   pro `mountGameFn` — antes só continham `sessionResults`/`renderEndScreen`/`startingWingmen`.
4. **`src/mount-game.js`**: `hud.bindPauseMenu({ onResume, onRestart, onExitToMenu })` chamado
   depois que `teardown()` já existe no closure — `onRestart`/`onExitToMenu` seguem o mesmo
   contrato que `endSector()` já usava (`teardown()` da partida atual, depois o próximo passo).
5. **CSS novo em `index.html`**: `.pause-overlay`/`.pause-panel`/`.pause-menu-buttons`/
   `.pause-confirm-text`/`.pause-options-scroll` — reaproveita classes já existentes pra tudo mais
   (`.card-choice-badge`/`.card-choice-title` no cabeçalho, `.btn-secondary`/`.btn-danger`/
   `.back-link`/`.settings-section`/`.keybind-*` no corpo). `.hud-pause` (não mais usada) removida.
6. **Validado ao vivo** via `window.__starAnki.step()` + eventos de teclado DESPACHADOS DIRETO NA
   PÁGINA (`window.dispatchEvent(new KeyboardEvent(...))`) — o `computer.key()` do navegador do
   Claude não estava chegando nos listeners da página nesta sessão (pane em segundo plano
   suspendia `requestAnimationFrame` também, confirmado via `state.lastTime` parado enquanto
   `performance.now()` seguia andando). Fluxo completo testado: pausar → abrir Opções → rebind de
   tecla (entra/sai do modo "Pressione uma tecla...", sem travar) → Voltar → Continuar (despausa) →
   pausar de novo → Reiniciar → confirmação → Cancelar (volta pro menu, não reinicia) → Reiniciar
   de verdade (nova sessão, mesmo baralho, `window.__starAnki` recriado) → pausar → Sair →
   confirmação → Sair de verdade (volta pro `#pregame-screen`, `window.__starAnki` removido). Zero
   erros novos no console em qualquer ponto do fluxo.
7. **Armadilha de sessão concorrente**: outra sessão trabalhando no MESMO repositório (usuário
   rodando duas conversas em paralelo) commitou `08abbfe` ("v0.78.2 — HUD orbital") enquanto as
   edições desta entrega em `src/hud-game.js` ainda estavam só no working tree — o `git add`
   daquela sessão varreu junto as mudanças da pausa que já estavam no mesmo arquivo (import de
   `buildPauseOverlay`, `pauseOverlay`, `bindPauseMenu`), então parte do código da pausa foi parar
   num commit sobre HUD orbital, já publicado (`git push`) antes desta entrega perceber. Não dá
   pra desfazer isso sem reescrever histórico já publicado — os arquivos restantes desta entrega
   (`hud-pause.js`, `hud-settings.js`, `game-menu.js`, `mount-game.js`, `index.html`) foram
   commitados normalmente por cima. **Lição**: com duas sessões editando o mesmo repo ao mesmo
   tempo, um arquivo tocado por AMBAS pode ter suas mudanças misturadas no commit de qualquer uma
   das duas, mesmo que a outra sessão não tenha terminado — nenhuma automação evita isso hoje.

### fix: Horda 9x menor do que devia (raio de colisão medido contra a referência errada)

Usuário jogou de verdade e reportou: a Horda aparecia como "um círculo minúsculo cinza", nenhuma
mecânica perceptível. Causa raiz: `HORDA_HIT_RADIUS` (v0.79.0) foi calculado contra o PONTO de
colisão da nave (`rail.getShipHitboxPoints()`, raio 0.55 — só usado internamente pra hit-test),
não contra o modelo visual real dela. A nave de verdade (`rail.js`, preset `'default'`) tem
`wingHalfSpan=2.6` (envergadura real = 5.2) e `bodyLength=3.4` — "3 naves de largura e 3 naves de
altura" media então ~15.6 × ~10.2, não ~1.1 × ~1.1. Raio corrigido: 1.65 → **6.5** (entre a
Fragata, 3.74, e o Chefe, 7.7 — do tamanho certo pra "atirador comum mas bem maior"). Corrigido
junto (todos proporcionais ao novo tamanho, todos eram baseados no raio errado):
- Geometria do torus: `(1.3, 0.5)` → `(4.5, 2.0)` (mesma proporção raio/tubo, só escalada).
- Cor de identidade: `0x6b7280`/emissive `0x2b2f36`/intensidade 0.6 → `0x9ca3af`/`0x4b5563`/0.9 —
  o tom original era escuro demais contra o fundo preto do espaço, ilegível mesmo maior.
- Distância de órbita (`HORDA_STANDOFF_FAR/NEAR`): 80/45 → 50/28 — a 80u ela ficava um ponto
  quase invisível na tela o tempo todo, mesmo depois de aumentar o tamanho. Continua isenta do
  teto genérico `ENEMY_FIRE_RANGE` (55u) em `index.js` por clareza (evita reintroduzir a mesma
  fragilidade se o standoff for ajustado de novo no futuro), mesmo 50u já estando perto do limite.
- Distância de spawn e magnitude da "turbulência" (chacoalha ao ser atingida) ajustadas junto.
- `HORDA_HIT_RADIUS`/geometria/spawn distance eram os únicos valores derivados da medição errada
  — dano/HP/contagem de filhotes/intervalo de tiro não dependiam disso, continuam iguais.

**Lição pro próximo inimigo com medida relativa à nave do jogador**: `rail.getShipHitboxPoints()`
retorna só o PONTO usado pra hit-test (colisão simplificada, raio 0.55) — não é o tamanho visual
da nave. Pra "X naves de largura/altura", meça contra `SHIP_PRESETS[variant]` em `rail.js`
(`wingHalfSpan*2` = envergadura real, `bodyLength` = comprimento real), não contra o ponto de
colisão. Validado ao vivo de novo depois do fix (`window.__starAnki`, screenshot real): torus
grande e claro, telegraph vermelho bem visível antes do tiro, split em mini-swarms continua
funcionando no novo tamanho.

### v0.81.0 — Sistema de dificuldade por níveis 1-9 (todos os inimigos) + fixes reais da Horda + Boss/Dourado no modo sem baralho + indicador de nível no HUD

Rodada grande baseada num documento de planejamento trazido pelo usuário. **Armadilha real
pega logo no início**: o documento listava os 8 itens do §2 (fixes da Horda) como "já
implementado" — o usuário confirmou que isso era falso (nunca colou o código, uma sessão
anterior escreveu o doc como se tivesse feito). Conferido lendo o `git diff` real antes de
mexer em qualquer coisa: só o guard de arena (§2.1) e a hitbox (fix separado, `896cf52`)
existiam de fato; os outros 6 sub-itens (HP cap, 2 travas, split reancorado, spin, espaçamento,
invencibilidade pós-spawn) foram implementados nesta entrega, não numa sessão anterior. Havia
também um diff uncommitted de sessão anterior em 16 arquivos (`PROJECTILE_SPEED` pra 360, etc.)
e uma pasta `Docs/` não rastreada — **descartados a pedido do usuário** (`git checkout --`), não
fazem parte desta entrega.

**§2 — fixes da Horda (todos os 8 itens, ver commit `4ecb2be`)**:
1. `src/enemies/horda.js`: removido o guard `if (rail.isArena()) return null` — se aparecer em
   arena por bug, o branch genérico de perseguição em `enemies/index.js` já cobre.
2. HP com teto real: `HORDA_HP_PER_LEVEL` 1 → 1.25 + `HORDA_HP_CAP = 25` (bate o teto exato no
   nível 9, 15 + 8*1.25 = 25).
3. `src/combat/lockon.js`: `maxLocksForEntity(e)` novo — Horda aceita até 2 travas simultâneas
   (chefe/dourado continuam sem teto próprio, resto continua 1). Substituiu o antigo booleano
   `isBigLockTarget` por uma contagem numérica por entidade.
4/6/8. `src/enemies/miniSwarm.js`: filhotes soltos pela Horda (`spawnMiniSwarmFromHorda`) agora
   guardam a origem do espalhamento como **depth/lateral relativos ao frame vivo do jogador**
   (`spreadOriginDepthStart/Target`, `spreadOriginRight/Up`), reprojetados a cada tick em vez de
   um `Vector3` de mundo congelado no spawn — o jogador avança dezenas de unidades durante os 4s
   de `spreadOut` (trilho sempre anda), então o ponto de espalhamento "andava" junto do frame
   atual só depois desta mudança; antes, o cull de "ficou atrás" disparava assim que a fase
   seguinte comparava contra o frame atual. Espaçamento entre vizinhos `1.2 → 5.2` (era medido
   contra o raio do ponto de colisão, 0.55, igual ao erro que a própria Horda teve — corrigido
   pra envergadura real da nave). `SPREAD_MIN_TARGET_DEPTH = 200` garante um corredor de
   mergulho decente mesmo quando a Horda morre perto (órbita a só 28-50u); `MINI_SWARM_DIVE_MAX_S`
   7 → 10 pra dar tempo de cruzar essa distância maior sem cull por tempo.
5. Giro cosmético: `rotateZ` era no-op visual (TorusGeometry nasce simétrico em torno do próprio
   eixo Z — o "buraco" do donut aponta pra lá); trocado por `rotateY`, que tumba o torus de
   verdade. Campo `enemy.spinAngle` acumulado só de referência.
7. `src/enemies/index.js`: `spawnInvincibleTimer` (campo genérico, decai uma vez por frame em
   `updateEnemies`) — só os filhotes da Horda nascem com 0.4s de graça (mini-swarm comum nasce
   com 0, sem mudança de comportamento). Checado em toque simples/aríete (via `isColliding`),
   `resolveProjectileHit` e `applyAreaDamage`.

**§1 — nível de dificuldade 1-9 aplicado a TODOS os inimigos** (antes só a Horda usava
`getDifficultyLevel`, ver `shared.js`). Dois eixos continuam coexistindo por design:
`applyDifficulty`/`wrongAnswerCount` (contínuo, spawn rate/agressividade/dano-padrão, ver
`flow-progression.js`, **inalterado**) e o nível 1-9 (por inimigo, HP/comportamento próprio).
Curva mantida **linear** (aprovado pelo usuário — rejeitou a opção de raiz quadrada do §4.1 do
plano). Arquétipos diferenciados por velocidade de escala (aprovado, §4.2 do plano):

- **Provider centralizado** (`src/enemies/index.js`): `setDifficultyLevelProvider(fn)` +
  `currentDifficultyLevel()` internos — `mount-game.js` registra UMA VEZ, logo depois do
  `state` ficar pronto, uma closure que chama `getDifficultyLevel({wrongAnswerCount,
  score, isNoDeck})`. Escolhido em vez de plumbar `level` manualmente por ~15 call sites de
  `spawnX()` (a opção citada no documento como "mais limpa" mas mais invasiva) porque
  `state`/`session` não estão no escopo de `enemies/index.js`. Bônus colateral: os spawns do
  painel de debug (`debug-actions.js`) agora também recebem o nível real em vez de sempre 1.
- **Arquétipo "enxame"** (escala devagar, +0.5/nível — o volume já é a dificuldade): Blaster
  (2→6), Réplica (3→7), Sussurro (2→6), Ima (4→8). Mini-Swarm comum continua sem escalar (1hp
  fixo, pedido explícito do plano — só os filhotes da Horda usam HP diferente, e nem isso, 1hp
  sempre, só ganham a invencibilidade pós-spawn).
- **Arquétipo "atirador"** (linear, +1/nível): Sentinela (10→18), Verme por elo (3→6, teto cedo
  de propósito — 4 elos por cadeia já multiplicam o HP efetivo), Ampulheta normal (5→10),
  Ampulheta mega (10→16, dano do laser também escala 4→8 — é o único dano próprio dela, não
  passa por `enemyDamageValue`). Detrito ganha +1hp/nível só nos NÃO-titânicos, teto 15 total,
  somado por cima da fórmula de HP-por-escala existente (`spawnDetrito` já não usava a constante
  `DETRITO_HP`, era 100% derivada de `scale` — o bônus de nível entra como termo adicional).
- **Arquétipo "miniboss"** (rápido, +1.5/nível — são os momentos de pico): Tank (15→27, mantém o
  parâmetro `hp` como override opcional pro debug — só usa o valor por nível se `hp` não for
  passado), Fragata (6→18, sem dano próprio hoje — só o HP escala). Horda usa seu próprio passo
  fracionário (1.25) já existente, ver §2.2 acima.
- **Chefe e Dourado** (tratamento à parte, não usam a fórmula genérica): `+15hp/nível` sem teto
  próprio (9 níveis * 15 = +120 na prática), somado por cima do `bossHealthBonus`/`GOLDEN_HP`
  já existentes — nível não substitui a fonte de HP antiga, adiciona um termo novo. Chefe:
  intervalo de laser encolhe até 50% (nível 9), `rotationSpeedMult` sobe até +40% — calculado no
  PONTO DE USO (`enemy.difficultyLevel`, guardado no spawn), nunca mutando `BOSS_PHASES`
  (array compartilhado entre todas as lutas). Dourado: cooldown de dash/teleporte encolhe até
  50% também, mesmo raciocínio (`dashCooldownS`/`teleportCooldownS` por instância). Chefe recebe
  o nível em `flow-boss.js → enterBossFight` (só ali tem `state`/`session`/`deck` no escopo,
  igual o Dourado em `enterGoldenArena` — não usam o provider genérico porque já tinham escopo
  próprio, ao contrário dos ~10 inimigos comuns).

**§3 — Chefe/Dourado no modo sem baralho** (bug real, não pedido de feature): em
`deck.isNoDeck`, `session.queue.length === 1` (card dummy único) e
`session.pointer = (pointer+1) % queue.length` (ver `flow-question.js`) fica **preso em 0 pra
sempre** — `(0+1) % BOSS_EVERY_QUESTIONS` nunca bate 0, então `state.isBossCycle` era sempre
`false` a partida inteira e o chefe nunca aparecia no modo arcade.
- `main-constants.js`: `BOSS_NO_DECK_SCORE_INTERVAL = 15000` (novo).
- `mount-game.js → enterCombat()`: `state.isBossCycle` agora ramifica por `deck?.isNoDeck` —
  sem baralho usa `session.score - state.bossNoDeckScoreCheckpoint >= 15000` em vez do ciclo de
  perguntas. Checkpoint novo (`state.bossNoDeckScoreCheckpoint`, inicia em 0) consumido dentro
  de `enterBossBuildup()` (não em `enterCombat`, que só decide o gatilho) — assim o próximo
  chefe sem baralho conta só a pontuação ganha DEPOIS deste.
- `flow-boss.js → enterBossBuildup()`: ramifica por `deck?.isNoDeck` **internamente**, mesmo
  call site de sempre (`bossFlow.startArenaCutscene('boss', bossFlow.enterBossBuildup)`, zero
  mudança em `game-loop.js`) — sem baralho pula a caçada de orbes inteira (não spawna orbes nem
  inimigos extra) mas MANTÉM `rail.enterArena()` (crítico — sem isso o chefe nasceria/lutaria no
  modo trilho errado) e vai direto pra `finishBossHunt()`, que já dispara a cutscene de
  invocação (`bossSummon`) antes de `enterBossFight` — senão o combate começava "no susto"
  (pedido explícito do documento de planejamento).

**§4.3 — indicador de nível no HUD** (aprovado): `hud.setStatus()` ganhou o campo opcional
`difficultyLevel`, anexado na mesma string de placar/combo (`"Pontos: X · Combo xY · Nível
Z/9"`) — sem elemento novo de DOM. Recalculado TODO FRAME em `game-loop.js` (não só em resposta
errada) porque o modo sem baralho escala por pontuação, não por erro — `applyDifficulty()` não
roda nesse modo. Flash de transição (`hud.showTierIncrease`) trocado pra usar o nível real 1-9
em vez do `wrongAnswerCount` cru que mostrava antes (`state.lastDifficultyLevel`, novo campo de
state, só dispara o flash quando o nível SOBE — descida por `decayDifficulty` fica silenciosa,
pedido explícito do documento).

**§4.1 rejeitado, §4.2 aprovado** — ver decisões do usuário acima.

**Verificação**: todos os ~20 arquivos tocados passaram em `node --check` (sintaxe limpa) e
todo call site de toda função de spawn alterada foi conferido manualmente (grep + leitura) pra
consistência de assinatura — incluindo os wrappers em `combat/index.js` e os spawns do painel
de debug. **Não foi possível validar ao vivo no navegador nesta entrega** — o Browser pane desta
sessão ficou preso em `net::ERR_CONNECTION_REFUSED` contra o servidor local mesmo após reiniciar
o preview e o tab várias vezes (falha de infraestrutura da sessão, não do código — confirmado
porque nem uma página em branco carregava). Recomendo rodar `window.__starAnki` / `aiValidator`
manualmente na próxima sessão antes de mexer em qualquer coisa deste sistema de novo.

### v0.82.0 — Overhaul de Personalidade e Vida dos Wingmen (Ideias 1, 5, 4, 2)

Baseado em `Docs/# Overhaul de Personalidade e Vida.md`, documento trazido pelo usuário (pasta
`Docs/` na raiz do projeto, com mais 3 documentos de overhaul ainda não implementados — cutscene
de vida perdida, fog como mecânica, spawn/despawn em 3 fases — escolhidos por serem os de maior
escopo/risco, ficam pra depois). Ordem aprovada pelo usuário: Ideia 1 → 5 → 4 → 2, um commit por
ideia (ver `bc8b22d`/`c596ecf`/`c3c5d61`/`5b63546`). **Ideia 3 (rádio) fica de fora** — bloqueada
no próprio documento até o usuário decidir entre 3 opções visuais num protótipo HTML separado.

1. **Rename Phantom → Krystal** (pedido explícito no topo do documento) — em todo o codebase
   (`WINGMAN_PROFILES`, comentários, logs de telemetria, labels de debug/roguelike/audio-cues).
2. **Ideia 1 — perfil de voo por piloto** (`src/combat/wingmen.js`): `WINGMAN_PROFILES` ganha
   `flightProfile` (`cruiseTurnRate`/`aimTurnRate`/`accelRate`/`cruiseSpeed`), substituindo as
   constantes globais únicas (`CRUISE_TURN_RATE`/`AIM_TURN_RATE`/`accelRate` fixo/`profile.speed`
   compartilhados pelos 4). Falco rápido e giros apertados, Peppy pesado e vira devagar
   (deliberadamente "o defensor", não "o wingman ruim"), Slippy equilibrado, Krystal fluida.
3. **Ideia 5 — reatividade ao estado do jogador**: `src/combat/wingman-reactivity.js` (novo)
   calcula `playerLowHealth`/`playerHighCombo`/`playerJustLostLife`/`playerBoosting` uma vez por
   frame em `game-loop.js` (único lugar com `session`/`state.killChainCount`/`isNoDeck` no mesmo
   escopo — `combat/index.js` só encaminha via `opts.reactivity`, sem saber de onde vem).
   **Descoberta real ao implementar**: o documento propunha usar `session.comboMultiplier` (x2.0+)
   como gatilho de "combo alto", mas esse valor **fica travado em 1.0 no modo sem baralho** — o
   fluxo arcade nunca chama `resolveAnswer()` (só `enterCardChoice`, ver `flow-question.js`).
   Pedido do usuário ao ser confrontado com essa ambiguidade: usar `killChainCount >= 7` (mesma
   ordem de grandeza do x2.0 de perguntas: `(2.0-1.0)/COMBO_STEP(0.15) ≈ 6.7`) só no modo arcade;
   no modo com baralho essa reação específica fica **desligada** por ora (decisão futura).
   Falco (engajar mais/menos, recuar quando o jogador perde vida), Peppy (escolta mais apertada
   com vida baixa, "escudo humano visual" por 3s — não bloqueia dano de verdade, só posição),
   Slippy (foge do cone de boost, cura duas vezes mais rápido com vida baixa), Krystal (protege o
   jogador em vez de si mesma ao escolher alvo, mira cirúrgica com combo alto, acelera no boost).
4. **Ideia 4 — personalidade de formação** (puramente cosmético, zero mudança de hitbox/colisão):
   Falco oscila lateralmente na vaga (±3u/2.5s); Peppy vira o nariz até ±10° em direção ao
   jogador quando em patrulha (ajuste incremental por cima da base ortonormal principal,
   recalculado do zero a cada frame — não acumula viés); Slippy imita o roll do JOGADOR
   (`rail.getRollAngle()`) com 0.3s de atraso via buffer amostrado por frame, em vez de reagir ao
   próprio movimento lateral; Krystal fica semi-transparente (opacidade 0.35) 1.5s a cada 8s.
   **Nota de material corrigida**: o documento alertava que `mesh.material` seria compartilhado
   entre wingmen do mesmo `modelType` (precisaria clonar pra Krystal) — não é verdade no código
   atual, `buildWingmanShip`/`buildStealthShip` já criam materiais NOVOS a cada `spawnMember()`
   (nunca há 2 instâncias vivas do mesmo perfil ao mesmo tempo de qualquer forma). Só precisou
   coletar as referências (`collectMaterials()`) e marcar `transparent = true` nelas.
5. **Ideia 2 — agressividade assimétrica** (a mais arriscada das 5, por último de propósito):
   `WINGMAN_PROFILES` ganha `combatProfile` (`engagementChance`/`dogfightDuration`/
   `detectionRange`/`aimSpreadRad`) substituindo os 4 valores globais únicos que todo piloto
   compartilhava (chance 0.65, detecção 80/75u, timeout de dogfight 6.0s/4.2s, dispersão 0.05).
   **Falco não usa o valor "cru" da tabela do documento** (0.65/6.5s) — o próprio documento (§2.4)
   avisa que isso pode reintroduzir "overkill" (histórico do projeto: 3 iterações
   overkill↔transe) e recomenda mitigar; usado 0.55/5.5s, mais perto do valor global antigo com
   teto de segurança mais curto. As proporções internas que já existiam (timeout de rajada =
   70% do timeout de dogfight; cone de arena = 93.75% do de trilho) foram preservadas ao escalar
   pelos novos valores por piloto, em vez de reinventadas do zero.

**Verificação**: `node --check` limpo em todos os arquivos tocados, cada ponto de uso conferido
manualmente (grep + leitura) linha por linha durante a implementação. **De novo sem validação ao
vivo no navegador** — o Browser pane desta sessão continuou preso (falha de carregamento de
página) mesmo depois de reiniciar o preview no meio do overhaul (tentativa registrada, mesmo
sintoma da entrega anterior). Prioridade #1 da próxima sessão: playtest manual real do esquadrão
inteiro (`window.__starAnki`, painel de debug — spawnar os 4 wingmen, observar voo/dogfight/
formação/habilidades por alguns minutos) antes de confiar cegamente no código destas 5 entregas.

### v0.83.0 — Overhaul 4 (Fog como mecânica) + Overhaul de spawn/despawn — ambos completos

Os outros 2 documentos grandes de `Docs/` que ainda faltavam da checklist. Commits:
`1a2bc27` (fog pilares 1/2/4), `ab2680b` (fog pilar 3), `feb0355` (spawn/despawn). **Validado
ao vivo pela primeira vez em várias entregas** — o Browser pane finalmente carregou depois de
forçar `await import('/src/main.js?t=...')` manualmente no console (a carga normal via `<script
type="module">` ficava presa em `readyState: 'interactive'` sem nenhum erro — parece ser uma
condição de corrida específica do Browser pane desta sessão, não um bug do código; sessões
futuras devem tentar o carregamento normal primeiro e só recorrer a esse workaround se travar
do mesmo jeito). Com 4 wingmen recrutados e combate ativo por ~15s: zero erros no console,
`window.__starAnki.getWingmanTelemetry()` confirmou os 4 nomes certos (Krystal incluída),
`scene.fog.density` em 0.0143 (não o valor fixo antigo 0.0075 — confirma a calibração
dinâmica do pilar 1 rodando de verdade), `fog.color` preto (setting `fogTacticalColors`
desligada por padrão, como esperado).

**Overhaul 4 (Fog)** — decisão do usuário antes de começar: cor do fog por evento (âmbar no
aviso do Dourado, vermelho no do Chefe, bege na tempestade) vira **setting opcional**
(`fogTacticalColors`, default `false`) em vez de mudança incondicional — preserva o "preto
clássico" do jogo por padrão. Os 4 pilares:
- **Pilar 1 (densidade calibrada)**: `environment.js` ganha `setSpawnDistanceExpectation(maxDist)`
  — a densidade do `FogExp2` deixa de ser fixa (0.0075) e passa a ser calculada por
  `coverage(d) = 1 - exp(-(density*d)²)` invertida, alvo de 85% de cobertura na distância
  máxima de spawn do contexto atual (`TRACK_MAX_SPAWN_DISTANCE=96` no trilho,
  `ARENA_MAX_SPAWN_DISTANCE=150` em arena de chefe/dourado — usa o teto do Chefe, que cobre o
  Dourado também, em vez de recalibrar a cada variação pequena de `bossDifficulty`). Lerp suave
  (~1.5s) + multiplicador de 0.6x em arena (chefe/dourado precisam ficar visíveis). Os
  "bolsões de névoa" que já existiam (`enableNebulaPockets`) continuam somando por cima, só
  que agora relativos à densidade calibrada em vez de um valor absoluto fixo.
- **Pilar 2 (radar como contra-jogo)**: blips do minimapa ganham `visState: 'visible' | 'ghost'`
  calculado pela mesma fórmula de cobertura — inimigo fora do alcance de visibilidade direta
  vira um blip difuso (opacidade 0.4 + blur, CSS `.hud-minimap-blip-ghost` em `index.html` —
  **não** em `hud-styles.js`, o CSS do minimapa mora no HTML mesmo). Boss/golden/detrito nunca
  viram fantasma. Setting `minimapGhostBlips` (default `true`).
- **Pilar 3 (mecânicas táticas)**: Sussurro (opacidade invisível cai pra 0.05 e fica escondido
  por mais tempo em fog denso), Dourado (teleporte sem efeito visual no ponto de partida, só um
  `bloomSprite` sutil no destino), Detrito (emissive cai de 0.35 pra 0.15 — "obstáculo que você
  não viu a tempo", igual Star Fox 64 fazia com asteroides), filhotes da Horda (nascem sem
  condensação visual + fade-in de opacidade nos primeiros 0.5s do `spreadOut`, precisou clonar
  o material da variante por instância — normalmente compartilhado — com dispose no fim do
  fade E na morte prematura, senão vaza `THREE.Material`). "Denso" é **proporcional** a uma
  densidade de referência (`DENSE_FOG_REFERENCE_DENSITY`, calibrada pro trilho comum), não um
  valor fixo — o próprio documento avisava que um valor fixo (0.015) quebrava porque a
  densidade calibrada varia muito por contexto (Horda sozinha a 45u dá 0.042, sempre "densa";
  chefe a 150u dá 0.013, nunca "densa" mesmo em arena de verdade). Setting `fogTacticalEffects`
  (default `true`). Redução de 60% na explosão de morte da Horda em fog denso (mencionada no
  documento) **não implementada** — exigiria checagem em 3+ pontos de código
  (resolveProjectileHit/applyAreaDamage/ram) pra um ganho visual pequeno.
- **Pilar 4 (indicador de ameaça)**: `environment.setFogProfile(name)` — perfis
  `bossWarn`/`bossDeath`/`goldenWarn`/`goldenDeath`/`debrisStorm`, cada um com `colorMult`
  (sempre aplica, engrossa a densidade) e `color` (só aplica com a setting ligada). Acionado em
  `flow-boss.js` (`startArenaCutscene`, `handleBossDefeated`, `handleGoldenDefeated`,
  `exitGoldenArenaVisuals`) e `game-loop.js` (`triggerDebrisStorm` e seu término).
  `game-loop.js` para de forçar `scene.fog.color.set(0x000000)` todo frame quando a setting
  está ligada (senão sobrescreveria a cor do perfil no mesmo tick — `environment.update()` já
  rodou antes desse bloco).

**Overhaul de spawn/despawn** — Ideias 1/2/3/6/8 implementadas, Ideia 4 (orientação de
aproximação) **não implementada**: a maioria dos inimigos já recalcula orientação a cada frame
no próprio update de movimento (`lookAt` ou similar), que roda DEPOIS do bloco de spawn no
mesmo frame — um `slerp` de aproximação seria sobrescrito imediatamente na maior parte dos
casos, ou competiria com o `lookAt` de forma imprevisível nos outros. Precisaria de auditoria
caso a caso por tipo de inimigo antes de valer a pena.
- `effects.js` ganha `fogCondensationInward()` (partículas de FORA pra DENTRO, oposto de
  `fogWispCondensation`, `fog: true` de propósito — integra com o Overhaul 4) e
  `spawnAnticipation()` (anel fino que encolhe no ponto de spawn antes do mesh "existir").
- `enemies/index.js`: `registerSpawn`/`updateEnemies` reescritos pra 3 fases (peek 20% /
  materialize 60% / settle 20%, proporção pulada quando o inimigo é pequeno demais pra peek —
  mini-swarm/ima sempre sem peek independente do `hitRadius`, tabela `SPAWN_DURATION_BY_KIND`
  vai de 0.20s pra enxame a 0.65s pra miniboss). Canal de material (emissive vs opacidade)
  escolhido automaticamente pelo `emissiveIntensity` base — nunca anima os dois ao mesmo tempo.
  **Chefe fica fora do sistema** (cutscene própria já cobre a entrada; integrar exigiria
  coreografar em cima dela). Dourado nunca passou por `registerSpawn` (sistema separado), sem
  mudança.
- Wobble pós-spawn aplicado no ÚLTIMO instante antes do `renderer.render` (não dentro do
  `update()` normal, onde hit-test/lock-on/IA leem a posição "real" do inimigo o frame
  inteiro) — `applySpawnWobbles()` encadeado `enemies → combat → game-loop.js`.
- Despawn com fade-out: `beginFadeOut()`/`processFadeOuts()` substituem os 2 pontos de culling
  GENÉRICO (saiu de vista no trilho, desengajando longe demais em arena) por um encolhimento de
  0.4s em vez de sumir de golpe. Não mexe em morte por HP≤0 (já tem a própria animação) nem em
  `clearAllCombatants`/`clearEnemies` (desmonte precisa ser instantâneo). `railDespawnCheck` do
  Blaster/Tank (auto-contidos via `enemy.fsm`, fora do orquestrador central) e o timeout de
  mergulho do mini-swarm ficam de fora desta entrega. `fadingOut` excluído de hit-test/
  `applyAreaDamage`/`getAlive`/`getEnemyCount`, igual `dying` já era.

**Pendências reais pra próxima sessão**: playtest mais longo focado especificamente nos dois
overhauls novos (spawn/despawn de vários tipos de inimigo em sequência, um setor inteiro com
chefe/dourado pra ver os perfis de fog do pilar 4 de verdade, ligar a setting
`fogTacticalColors` manualmente pra ver as cores) — a validação desta entrega foi um combate
comum de ~15s, não cobriu chefe/dourado/boss-no-deck nem um ciclo completo de setor.

**Debug: toggle "Desligar geração automática de inimigos"** — `toggleAutoSpawn` (categoria
Spawns), flag `debugFlags.disableAutoSpawn`. Gateia os dois blocos de timer automático em
`game-loop.js` (spawn de `goldenArena`/`bossBuildup` e o spawn normal da fase `combat`, que
cobre mini-swarm/sentinela/réplica/verme/sussurro/horda/esquadrão/inimigo comum) sem tocar nos
timers de alvo bônus, entrada de arena dourada/chefe, ou tempestade de detritos (cada um já tem
seu próprio controle). Os botões de spawn manual do painel de debug chamam `combat.spawnX()`
direto, fora desse gate — continuam funcionando normalmente com o toggle ligado, como pedido.

---

## v0.84.0 — Ajustes na Horda + hierarquia de poder de projétil (perda de controle nível 4)

Pedido do usuário: 2 ajustes na Horda/mini-swarm e um sistema novo (hierarquia de poder de
projétil, 4 níveis) cuja única mecânica concreta hoje é a reação do jogador a hits nível 4.

**Horda — tempo de preparo, espalhamento e visual dos filhotes** (`enemies/miniSwarm.js`):
- `HORDA_SPLIT_SPREAD_DURATION_S`: 4 → 3.
- `HORDA_CHILD_SPREAD_MULT = 1.5` multiplicando o `spreadRadius` calculado a partir de
  `HORDA_CHILD_NEIGHBOR_SPACING` (mesma fórmula de antes, só escalada).
- Filhotes da Horda (`spawnMiniSwarmFromHorda`) ganharam visual PRÓPRIO, diferente do mini-swarm
  de fila normal: `hordaChildGeometry` (TorusGeometry, "roda" como a Horda) +
  `hordaChildMaterial` (cinza, mesma família de cor da Horda — 0x9ca3af/0x4b5563, hardcoded em
  miniSwarm.js pra não criar import cruzado com horda.js) + `HORDA_CHILD_SCALE = MINI_ENEMY_SCALE
  * 1.15` (+15%). `variant` continua sorteado normalmente, mas agora só decide o PADRÃO DE
  MERGULHO (reto/zigue-zague/hélice) — não afeta mais a cor/geometria dos filhotes da Horda.
  Flag `enemy.fromHorda: true` marca a origem; `miniSwarmHitRadius(enemy)` agora recebe o inimigo
  e devolve `HORDA_CHILD_HIT_RADIUS` (escalado junto, 2.42 * 1.15) quando `fromHorda`, senão o
  raio padrão — `hitRadiusFor()` em `enemies/index.js` repassa o enemy. Pulso de escala no
  telegraph e fade-in de opacidade em fog denso também respeitam `fromHorda` (antes hardcoded em
  `MINI_ENEMY_SCALE`/`variantMaterials`, quebraria o tamanho/cor certos dos filhotes).
- `HORDA_FIRE_INTERVAL_MS` (`enemies/horda.js`): 3000 → 2100 (-30%, "dispare mais vezes em menor
  intervalo"). Telegraph visual antes de cada tiro já era genérico (bloco em `enemies/index.js`
  que dispara `effects.telegraph()` a 0.3s do fireTimer zerar, vale pra qualquer `enemy.kind`) —
  nenhuma mudança nova precisou ali, só documentado que a Horda já tinha esse aviso.

**Hierarquia de poder de projétil (4 níveis)** — `POWER_LEVEL_BASIC/GUIDED_OR_LARGE/AREA_DAMAGE/
HIGH_IMPACT` em `enemies/shared.js`. Só o nível 4 (Chefe/Dourado/Horda) tem reação própria hoje;
2 e 3 existem como classificação pronta, sem uso concreto ainda (documentado no comentário de
shared.js pra próxima sessão saber que "existe mas não faz nada sozinho").
- Todo projétil/laser/moldura inimigo carrega `powerLevel` (default `POWER_LEVEL_BASIC`) — tag
  em `enemyProjectiles`/`enemyLasers`/`enemyGates` (`enemies/index.js`), lido do `projectileOpts`
  de quem dispara (`po?.powerLevel`) ou hardcoded 4 nos `pushLaser`/`pushProjectile` diretos de
  Chefe (`boss.js`) e Dourado (`golden.js`). `updateEnemyProjectiles/Lasers/Gates` retornam o
  MAIOR powerLevel entre os hits do frame; `updateProjectiles()` agrega os 3 com `Math.max`;
  `combat/index.js` propaga como `enemyHitPowerLevel` no objeto de eventos do frame (só conta
  hit de PROJÉTIL — toque físico direto/aríete não passa por aqui, já tem seu próprio tumble via
  `bossCollisionWorldPos`).
- Reação nível 4 — **perda de controle** (`rail.js`): motor de tumble existente
  (`triggerBossCollisionTumble`, giro + knockback ao encostar fisicamente no chefe/dourado) virou
  `startTumble(duration, impactOrigin, {highImpact})` compartilhado; `triggerHighImpactTumble()`
  é a nova entrada, chamada de `game-loop.js` quando `events.enemyHitPowerLevel >=
  POWER_LEVEL_HIGH_IMPACT` no bloco de dano ao jogador (dispara mesmo se o escudo absorveu o
  dano — é reação a TOMAR o hit, não ao dano de vida). Constantes
  `HIGH_IMPACT_TUMBLE_DURATION_S=2.0`/`HIGH_IMPACT_TUMBLE_SPIN_SPEED`/
  `HIGH_IMPACT_RED_FLASH_INTERVAL_S`/`_COLOR`/`_INTENSITY` ficam bem acima do código (pedido
  explícito do usuário, fácil de ajustar), duração/velocidade de giro PRÓPRIAS (2s/mais lento que
  a colisão física, que é 0.85s/mais rápida) pra não virar "liquidificador" por 2s inteiros. Pisca
  vermelho: alterna `emissive`/`emissiveIntensity` do `bodyMaterial`/`accentMaterial` da nave
  (únicos por instância, `buildShip()` passou a devolver `{ group, bodyMaterial, accentMaterial
  }` em vez de só o group) — reseta pra preto ao fim do tumble. Bloco de update do tumble reposicionado
  ANTES do `if (mode === 'arena') { updateArena(...); return }` (early return existente) — senão o
  flash nunca rodaria em arena (onde Chefe/Dourado vivem).
- Verificado ao vivo (debug harness, `window.__starAnki`): Horda spawnada com `fireTimer=2.1`/
  `projectileOpts.powerLevel=4`; morta via `applyAreaDamage` gerou 5 filhotes `fromHorda:true`
  (TorusGeometry, cor cinza, `spreadTimer=3`, `spreadRadius≈6.64` = fórmula×1.5), escala
  convergindo pra `0.8855` (=0.77×1.15) após o spawn de 3 fases. `rail.triggerHighImpactTumble()`
  confirmado visualmente (nave girando fora de eixo + vermelho vivo, resetando ao normal após
  ~2s). Chefe spawnado e disparando 90 frames sem erro com o `projectileOpts` novo. Sem erros de
  console em nenhum dos testes.

**Fix: chuva de detritos desligada por padrão** — `ENVIRONMENT_CONFIG.enableDebrisStormEvent`
estava `false` em `environment-config.js` desde a v0.57.0 ("evitar excesso de detritos na
pista"), então o evento nunca disparava sozinho — só via botão de debug ("Evento: Iniciar
Tempestade de Detritos") ou ligando o toggle "Evento: Chuva de Detritos (Auto)" manualmente a
cada partida. Pedido do usuário: virar `true` por padrão. O intervalo entre tempestades
(`nextDebrisStormTimer`, ~27–51s, já com o +15% de frequência de uma entrega anterior) e o
perfil de fog do Overhaul 4 (`setFogProfile('debrisStorm')`) não precisaram de nenhuma mudança —
só liam a flag errada.

**Fix: opções de fog do Overhaul 4 sem UI em Configurações** — `fogTacticalColors`/
`minimapGhostBlips`/`fogTacticalEffects` existiam em `settings.js` desde a entrega do Overhaul 4
mas nunca ganharam controle na tela (os dois docs do overhaul pediam isso explicitamente —
§2.6/§3.6, "jogador precisa poder desligar"). Nova seção "Névoa (Fog)" em `hud-settings.js`
(`buildFogSection`, mesmo padrão de builder exportado das outras seções — `buildVisualSection`/
`buildSensitivitySection`), com 1 checkbox por flag. Adicionada tanto na tela de Configurações
completa (pré-jogo) quanto no painel "OPÇÕES BÁSICAS" da pausa (`hud-pause.js`), entre Visual e
Modo All-Range. Verificado ao vivo: os 3 checkboxes aparecem, e marcar/desmarcar persiste em
`localStorage` (`star-anki-settings`) corretamente.


