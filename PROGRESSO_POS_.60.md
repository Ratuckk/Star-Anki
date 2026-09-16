# Progresso pós-v0.60 — novas documentações a partir daqui

Continuação do [PROGRESSO_POS_0.50.md](PROGRESSO_POS_0.50.md) (histórico v0.51.9 → v0.60.0, agora
congelado). A partir desta entrega, toda documentação nova entra neste arquivo.

---

## Backlog Pendente (herdado da v0.60.0)

Itens discutidos e aprovados pelo usuário mas ainda **não implementados**. Servem de referência
para futuras entregas neste arquivo. O detalhamento completo está em [BACKLOG.md](BACKLOG.md).

### P1 — Alto valor / Baixo risco
- [x] **Botão de Contexto** — visível durante a pergunta inteira (recall + alternativas/arena).
  Explica o CONCEITO geral por trás da pergunta, nunca a resposta. Seguro de mostrar a qualquer
  momento porque não entrega a resposta. ✅ v0.61.0
- [x] **Botão de Explicação da Resposta** — só aparece DEPOIS de responder (certo ou errado).
  Mostra a explicação densa + fonte da resposta específica. ✅ v0.61.0
- [x] **No acerto**: embutir o botão de explicação na tela de escolha de carta roguelike
  (sem criar tela nova). ✅ v0.61.0
- [x] **No erro**: embutir o botão na tela de feedback de erro (posição consistente). ✅ v0.61.0
- [x] **Cloze misturado com Basic** nos decks. ✅ v0.61.0
- [x] **Um fato por card** — regra Wozniak. ✅ v0.61.0
- [x] **Cuidado com colisão visual** — posição do Botão de Contexto vs legenda de alternativas.
  O botão de Contexto mantém posição na extrema direita (vertical), não colide com alternativas centrais. ✅ v0.61.0

### P2 — Médio valor
- [x] **Decidir**: abrir explicação pausa mais ou é só painel sobreposto?
  → Painel sobreposto sem efeito extra no tempo. O jogo já está pausado pela tela de card/feedback. ✅ v0.61.0
- [ ] **Perguntas de cenário** — testar aplicação prática, não só definição.

### P3 — Especulativo / requer decisão
- [ ] **Bônus de pontos por abrir explicação em erros**.
- [ ] **Distratores por tag de confusão** — forçar discriminação entre conceitos comumente trocados.

---

## Histórico de Entregas pós-v0.60.0

### Dois Botões, Dois Momentos: Contexto (Durante a Pergunta) + Explicação Densa Pós-Resposta — v0.61.0

Contexto e pedidos do usuário:
1. *"Botão de Contexto — visível durante a pergunta inteira. Explica o CONCEITO geral."*
2. *"Botão de Explicação da Resposta — só aparece DEPOIS de responder (certo ou errado). Mostra a explicação densa + fonte."*
3. *"No acerto: embutir o botão dentro da tela de escolha de carta roguelike. No erro: embutir na tela de feedback de erro."*

**O que mudou e detalhes técnicos:**
1. **Separação do Códice em Dois Sistemas Distintos (`hud-game.js`)**: O botão na extrema direita (tecla `E`) agora é rotulado **"💡 CONTEXTO"** e mostra exclusivamente o conceito geral por trás da pergunta (explicação sem fontes nem resposta), seguro de acessar durante o recall ativo. A gaveta lateral foi renomeada para "CONTEXTO // CONCEITO" com seção única de conceito geral.
2. **Novo Painel de Explicação Pós-Resposta (`hud-game.js` & `hud-styles.js`)**: Gaveta lateral independente (`.hud-expl-drawer`) com acento visual âmbar dourado, contendo: card verde com a **✅ RESPOSTA CORRETA**, seção **🔬 EXPLICAÇÃO DENSA & APROFUNDADA** e seção **📚 FONTES & REFERÊNCIAS OFICIAIS** com links clicáveis. O painel é acionado por botões inline nas telas de pós-resposta.
3. **Botão de Explicação na Tela de Cartas Roguelike (Acerto)** (`hud-game.js`): Ao acertar, além dos 3 cards de upgrade, um botão âmbar "📖 Explicação da Resposta" surge com animação pop-in na parte inferior da tela. Ao clicar, o painel desliza da direita sem fechar a tela de cartas — o jogador pode ler e depois escolher seu upgrade.
4. **Botão de Explicação no Float de Erro** (`hud-game.js`): Ao errar, o float vermelho "Errou! Resposta: ..." agora contém um botão compacto "📖 Ver Explicação" que abre o mesmo painel. Tempo do float aumentado de 3s para 5s para dar tempo de interagir.
5. **Unificação de Dados de Resposta (`flow-question.js` & `flow-boss.js`)**: `setFeedback` agora é chamado em TODOS os resultados (acerto e erro), garantindo que `lastResolvedCard` no HUD sempre tenha a `correctAnswer` preenchida para alimentar o painel de explicação. Antes, no erro, só `showErrorFloat` era chamado sem dados da resposta.
6. **Fix do Bug de Referência Indefinida (`hud-game.js` L1321-1322)**: Removidas referências a `questionConceptDrawer` e `questionConceptBtn` (variáveis inexistentes) no `unmount()`, substituídas por chamadas corretas a `closeCodex()`, `closeExplDrawer()`, `detachExplKeyHandler()` e limpeza de `lastResolvedCard`.
7. **Estilização Distinta por Momento (`hud-styles.js`)**: O botão/painel de **Contexto** mantém o acento **ciano** (azul) do tema do jogo. O botão/painel de **Explicação** usa acento **âmbar dourado** para diferenciar visualmente o momento pós-resposta do momento de recall. O card de resposta correta usa **verde esmeralda** para destaque.

**Testado**: `node --check` em todos os arquivos JS do `src/` com 0 erros. `node src/selftest.mjs` com 100% de sucesso.
**Versão**: v0.60.0 → v0.61.0.

---

### Overhaul dos Decks e Baralho Modelo (70 Cards + 6 Modelo) — Filosofia de Dois Momentos

Contexto e pedidos do usuário:
1. *"recriar as perguntas presentes na pasta de decks do Zero para serem mais coesas e refletirem estas mudanças"*
2. *"crie um template molde que adote tudo isso"*
3. *"explicar o conceito sem entregar a resposta específica (nunca competir com o pilar de recordação ativa)"*

**O que mudou:**
1. **`decks/estudo-de-prova.txt` (40 cards)**:
   - Recriado do zero com mistura balanceada de **Basic** (nomes, pioneiros, datas) e **Cloze** `{{c1::...}}` (definições, relações causais, fluxos lógicos).
   - Aplicada a regra clássica de SRS de **um fato atômico por card**.
   - Coluna 6 (Explicação/Contexto): reescrita para fornecer background conceitual denso **sem entregar a resposta**. Pode ser consultada livremente durante a pergunta via botão `[💡 CONTEXTO]` / tecla `E`.
   - Coluna 7 (Fontes): referências acadêmicas, históricas e técnicas reais (artigos, livros de referência como Patterson & Hennessy, Tanenbaum, Britannica, documentação histórica).
2. **`decks/arquitetura-manutencao-aumentado.txt` (30 cards)**:
   - Recriado do zero abrangendo placa-mãe, chipsets, fontes ATX, certificação 80 Plus, DRAM vs SRAM, hierarquia de cache (L1/L3), DDR/PMIC, Dual-Channel, HDD vs SSD, NVMe, SATA, RAID (0, 1, 5, 10), PCIe lanes, M.2, USB-C, DisplayPort vs HDMI, TDP, pasta térmica, UEFI vs BIOS, POST, beep codes, ESD, pulseira antiestática e manutenção preventiva vs corretiva.
   - 100% dos cards com explicações conceituais densas que preservam o recall ativo (sem spoiler) e fontes industriais/normativas formais (JEDEC, PCI-SIG, USB-IF, Intel, AMD, ANSI/ESD).
3. **`templates/baralho-modelo.txt` (6 cards)**:
   - Atualizado para servir de padrão canônico aos novos decks, com exemplos perfeitos de Basic e Cloze, explicações de contexto conceituais e fontes catalogadas na coluna 7.

**Testado**: Script de validação sintática e semântica com `anki.js` confirmando 100% de integridade nos 76 cards (40 + 30 + 6) com explicações e fontes válidas. `node src/selftest.mjs` passando com sucesso.

---

### Overhaul Completo: Hitboxes, Fundo Puro, Neblina Cósmica, Molduras da Sentinela, Boss Dourado e Esquadrão — v0.62.0

Pacote maciço de correções, equilíbrio de combate e polimento audiovisual contendo os 16 itens requisitados:

1. **Hitbox dos Detritos e da Nave do Jogador (`detrito.js`, `rail.js`, `combat/index.js`, `enemies/index.js`)**:
   - `DETRITO_BASE_HIT_RADIUS` reduzido de 1.9 para 1.15, eliminando a margem fantasma invisível e casando precisamente com o icosaedro 3D.
   - Nave do jogador agora possui sistema de colisão multiponto com 4 esferas fiéis ao modelo de asa delta (`bico`, `cabine/centro`, `ponta asa esquerda`, `ponta asa direita`), acabando com colisões desleais e integrando com o modo debug (`showHitboxes`).
   - Teto estrito de **no máximo 2 detritos gigantes simultâneos** no cenário via `spawnDetrito` e `spawnTitanicDetrito`.
   - Taxa de geração de detritos reduzida para permitir melhor movimentação pelo cenário (1 a 3 detritos por leva em vez de 6 a 10; tempestade de detritos desativada por padrão e ajustada para salvas menores quando ativa).
2. **Fundo Espacial Preto Puro (`mount-game.js`, `game-loop.js`, `main-constants.js`)**:
   - Fundo restaurado para `0x000000` (preto absoluto).
   - `LEVEL_BACKGROUNDS` unificado em `0x000000`.
   - Sobrescrita dinâmica de cor de fundo no game-loop revertida.
3. **Animação de Spawn para Inimigos e Detritos (`enemies/index.js`)**:
   - Removida a restrição que ignorava detritos e arena no spawn.
   - Detritos e todas as naves agora surgem com animação suave de escala e condensação de névoa (`fogWispCondensation`), eliminando o snap instantâneo na tela.
4. **Argolas de Explosão Maiores, Mais Largas e Assimétricas (`effects.js`)**:
   - Nova geometria `sharedWideRingGeometry` com banda espessa (raio interno 0.55 a 1.0).
   - Escala das argolas cinzas aumentada significativamente (mín 2.8, máx 5.8).
   - Animação de expansão alargando-se com o tempo em apenas um dos eixos (`majorScale = scale * (1 + t * 1.05)`), gerando expansão assimétrica/elíptica espetacular.
5. **Restauração e Destaque da Neblina Cósmica (`effects.js`, `environment.js`, `mount-game.js`)**:
   - Densidade de neblina cósmica calibrada para `0.0075`, garantindo transição atmosférica suave contra o fundo preto.
   - Efeito volumétrico de wisps de névoa (`FOG_WISP_`) ampliado: 85 partículas, diâmetro expandido (5u a 12u) e opacidade 0.24 em azul cósmico.
   - Corrigido bug em `environment.js` onde clarões iônicos acumulavam cor permanentemente no `scene.fog.color`.
6. **Projétil da Sentinela em Moldura com Bordas Finas e Centro Translúcido (`sentinela.js`, `enemies/index.js`)**:
   - Projétil totalmente reformulado para ser uma moldura: bordas finas com brilho neon (`0x70c5ff`) e plano central com opacidade sutil (`0.14`).
   - Hitbox 100% coerente: o jogador que atravessa pelo centro está completamente seguro e não sofre dano; colisão só é registrada se a fuselagem atingir as bordas da moldura.
   - Resolução de travessia corrigida para disparar na passagem pelo plano do jogador (`alongDir <= 0`), eliminando acertos fantasmas antecipados.
7. **Remoção de Planetas e Cenários Secundários (`environment-config.js`, `environment.js`)**:
   - `enableCelestialBodies`, `enableSkyDome`, `enableShootingStars` e `enableEnergizedGrid` desativados por padrão.
   - Foco visual concentrado na imensidão negra do cosmos e nas partículas e névoa viva.
8. **Garantia de 4+ Alternativas Coesas em Todas as Perguntas (`anki.js`)**:
   - Fallback multinível garantindo sempre pelo menos 4 alternativas coesas (1 certa + 3 distratores técnicos congruentes), mesmo em respostas curtas como "IBM".
9. **Link de Fonte no Códice de Contexto (`hud-game.js`)**:
   - Adicionada seção de fonte citada clicável com link de referência dentro da gaveta de Contexto.
10. **Transição Imediata para Escolha de Cartas Roguelike (`flow-question.js`)**:
    - Ao acertar uma pergunta, o jogo transiciona imediatamente para `state.phase = 'cardChoice'`, abrindo o menu de upgrades sem qualquer despausa intermediária do combate.
11. **Barra de Vida de Chefe para o Inimigo Dourado (`hud-game.js`, `combat/index.js`, `enemies/index.js`, `index.html`)**:
    - O inimigo dourado agora exibe a barra superior estilo Boss com gradiente temático dourado e label "ANOMALIA DOURADA".
12. **Correção de Colisão com Inimigo Dourado (`golden.js`)**:
    - Raio de colisão de corpo reduzido de 4.7 para 1.6, casando perfeitamente com o modelo 3D `TorusKnotGeometry` (raio 1.5) e eliminando danos fantasmas à distância.
13. **Cutscene Espalhafatosa de Morte do Dourado (`cutscenes.js`, `flow-boss.js`)**:
    - Duração estendida para 3.4 segundos com slow motion dramático.
    - Cascata rápida de detonações secundárias em ouro, âmbar e branco a cada 90ms.
    - Clímax com supernova dourada, múltiplos shockwaves concêntricos, tremor de tela e whiteout cegante na tela inteira (`hud.triggerWhiteout()`).
14. **Prevenção de Botões Duplicados de Explicação (`hud-game.js`)**:
    - Limpeza garantida de `.hud-expl-card-row` antes da criação de novas opções de cartas.
15. **Voo Planado e Mira Direta das Naves Aliadas / Esquadrão (`combat/wingmen.js`)**:
    - Removidas as piruetas e giros excessivos (`smoothRoll` amortecido e limitado a suaves 18° de inclinação em curvas).
    - Durante combate (`dogfight`), as naves aliadas agora planam suavemente orientando o bico e travando a mira diretamente no inimigo sem guinadas bruscas ou quebras de trajetória caóticas.
16. **Pausa de 5s no Erro com Skip por Barra de Espaço (`keybindings.js`, `hud-game.js`, `hud-styles.js`, `flow-question.js`, `game-loop.js`)**:
    - Ao errar, o jogo permanece pausado por 5s exibindo a resposta correta e o botão de explicação.
    - Pode ser pulado instantaneamente a qualquer momento pressionando `Espaço` (ou botão A no controle), com ação configurável nas Opções de Teclas.

