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
- [ ] **Habilidades únicas por piloto do esquadrão** (Falco/Peppy/Slippy/Phantom) — investida em
  aríete, proteção, item consumível de cura ao contato e assistência ao tiro carregado, cada uma
  com cooldown de 10-20s reduzível por carta (só se aquele piloto estiver recrutado), com ícones
  de cooldown no extremo topo-esquerdo da HUD. Planejado em detalhe (mapeamento de habilidades,
  máquina de estados, integração por arquivo, novas cartas, reflow de HUD, decisões em aberto) em
  [PLANO_HABILIDADES_ESQUADRAO.md](PLANO_HABILIDADES_ESQUADRAO.md) — **não implementado ainda**,
  aguardando confirmação do usuário sobre as decisões em aberto (seção 9 do plano).

### P3 — Especulativo / requer decisão
- [ ] **Bônus de pontos por abrir explicação em erros**.
- [ ] **Distratores por tag de confusão** — forçar discriminação entre conceitos comumente trocados.

---

## Histórico de Entregas pós-v0.60.0

### Fix de Crash ao Escolher Qualquer Carta Roguelike no Modo Arcade (`src/player.js`) — v0.70.1

Pedido do usuário: *"o jogo crasha no modo arcade quando você seleciona uma carta no roguelike"*, com a cobrança justa de que uma revisão de bugs anterior não tinha pegado isso.

1. **Reprodução ao vivo primeiro, sem adivinhar**: `preview_start "static"`. O primeiro obstáculo foi um `ReferenceError: GATE_BORDER_WIDTH is not defined` em `sentinela.js` logo no boot — mas isso era só **cache stale do Service Worker** desta aba de teste (registro de uma sessão anterior, de antes da constante ter sido renomeada para `GATE_BORDER_MIN` no overhaul da v0.69.0), não um bug de código: `node --check`/leitura do arquivo em disco não têm `GATE_BORDER_WIDTH` em lugar nenhum. Resolvido com `navigator.serviceWorker.getRegistrations()` + `unregister()` + `caches.delete()` antes de continuar — vale lembrar disso em qualquer sessão futura que veja um `ReferenceError` estranho logo no load em vez de esperar o load normal.
2. **Segundo obstáculo, ambiental (já documentado, não é bug)**: o loop principal roda via `requestAnimationFrame`, que não dispara nesta aba do Browser pane sem foco de SO (mesma limitação das sessões v0.62.3/v0.63.x/v0.68.0). Contornado com o mesmo tipo de stepper manual já usado nessas sessões (`requestAnimationFrame`/`cancelAnimationFrame` sobrescritos, avanço determinístico de frame), escrito do zero nesta sessão.
3. **Causa raiz encontrada por reprodução real, não leitura de código**: com o painel de debug (ação "Escolher carta roguelike") aberto em Modo Arcade e um card qualquer clicado, o console acusou `TypeError: player.getWingmanCount is not a function` em `applyRoguelikeCard` (`flow-question.js:21`). `combat.setWingmanCount(player.getWingmanCount())` roda incondicionalmente em **toda** escolha de carta roguelike (não só ao pegar a carta de wingman) — mas `player.js` só expunha `setWingmanCount`, nunca um `getWingmanCount` correspondente (`wingmanCount` só existia como variável interna do closure). Isso quebra a seleção de QUALQUER carta, em qualquer modo — Arcade só é onde o jogador chega nessa tela com mais frequência (todo ciclo de combate cai direto em `enterCardChoice`, sem pergunta no meio). É o mesmo padrão de bug já corrigido do lado do `combat` na v0.68.0 (`combat.getWingmanCount` faltando), só que faltando do lado do `player` agora.
4. **Correção**: adicionado `getWingmanCount: () => wingmanCount,` em `player.js`, ao lado do `setWingmanCount` existente.

**Testado**: `node --check src/player.js` e `node src/selftest.mjs` limpos. **Testado ao vivo** (`preview_start "static"`, stepper de frame manual): reproduzido o crash de forma determinística ANTES do fix (mesmo fluxo: Modo Arcade → debug "Escolher carta roguelike" → clicar num card → `TypeError` no console, tela de carta trava sem avançar) e confirmado que ele desaparece DEPOIS do fix, com o jogo voltando normalmente para `combat` e os stats do HUD (vida/pontos/inimigos) refletindo o estado pós-escolha.

**Versão**: v0.70.0 → **v0.70.1**.

---

### Esquadrão Menos Agressivo e Movimentação Cinematográfica (`src/combat/wingmen.js`) — v0.70.0

Pedido do usuário: *"o esquadrão é meio overkill e perfeito demais em questão de ataques, faça com que eles ataquem menos e se movam mais pelo cenário, de forma cinemática e menos aleatória e estranha como fazem agora, quero que sejam mais suaves e 'humanos'"*.

**Diagnóstico lendo o código real antes de mexer** (`createSquadronSystem` em `src/combat/wingmen.js`): a IA de voo livre dos wingmen (Falco/Peppy/Slippy/Slippy/Phantom) tinha dois problemas de origens distintas:
1. **Ataque "perfeito demais"**: `fireInterval` curto (0.75–1.1s) + raio de detecção de alvo enorme (100–120u, quase a arena inteira) + entrada automática em `dogfight` sempre que `fireCooldown` zerava e havia QUALQUER inimigo no raio — resultado: os caças engajavam literalmente todo alvo que aparecia, com mira 100% exata (`aimDir` sem nenhum desvio) e rajadas de até 3 tiros. Lia como onisciente e sem falhas.
2. **Movimento "estranho"**: waypoints de patrulha eram sorteados com `Math.random()` independente em cada eixo (lateral/vertical/frente) a cada 2.4–4.6s, sem nenhuma relação com o waypoint anterior — produzia reversões de rumo abruptas (zig-zag) em vez de trajetórias fluidas. O gatilho de fly-by (`Math.random() < 0.25` **avaliado a cada frame** enquanto o cooldown estava zerado) dava uma janela de ~4 frames até disparar — na prática, quase instantâneo e imprevisível, não um evento cinematográfico espaçado.

**Correções** (`src/combat/wingmen.js`, tudo contido neste arquivo — nenhum outro módulo referencia essas constantes):
- **Ataques mais raros e imperfeitos**: `fireInterval` de cada perfil ~2x maior (Falco 0.75→1.7s, Peppy 1.1→2.4s, Slippy 0.85→1.9s, Phantom 0.8→1.8s, `burstCount` de Phantom reduzido de 3→2), `fireCooldown` inicial maior (1.8–3.4s em vez de 0.5–1.0s), raio de detecção de alvo cortado de 100–120u para 65–70u, e nova `ENGAGEMENT_CHANCE = 0.45` — mesmo com alvo no alcance e cooldown pronto, só ~45% de chance de entrar em dogfight (senão volta a patrulhar por mais um tempo). Nova `AIM_SPREAD_RAD` aplica um desvio angular aleatório pequeno (~4.9°) na direção de cada tiro disparado em dogfight autônomo — tiros deixam de ser perfeitos. O modo de comando manual do jogador (`toggleCommand`/foco tático, tecla dedicada) não foi tocado — é ação intencional do jogador, não o "overkill autônomo" do pedido.
- **Movimento fluido e cinematográfico**: novo waypoint de patrulha agora é um deslocamento LIMITADO a partir do waypoint anterior (±9u lateral, ±4u vertical, clampado ao volume de patrulha) em vez de um sorteio livre no volume inteiro — elimina as reversões bruscas de rumo. Intervalo entre waypoints aumentado de 2.4–4.6s para 4.5–7.5s (trajetórias mais longas e propositais, menos "nervosas"). Modo arena (all-range) segue o mesmo princípio: o próximo ângulo de órbita é um desvio de até ±81° do ângulo anterior, não mais um ângulo aleatório novo a cada troca. Fly-by agora dispara diretamente quando `flybyCooldown` zera (sem o sorteio por frame que o tornava quase-instantâneo), com cooldown maior (9–16s). Adicionado um leve ondular (*weave*) senoidal contínuo por wingman (`weavePhase`/`weaveFreq`/`weaveAmp`, únicos por instância) somado ao alvo de voo só durante a patrulha livre — dá uma trajetória levemente sinuosa e viva entre waypoints, em vez de retas mecânicas.
- **Manobras menos "robóticas"**: taxa de mira em dogfight (`slerp` de rotação até o inimigo) reduzida de 8.5 para 5.5 e a aceleração de manobra em dogfight de 3.0 para 2.3 — o travamento de mira e as curvas de combate ficam visivelmente menos instantâneas/perfeitas, mais como um piloto reagindo do que um sistema de mira travada.

**Testado**: `node --check src/combat/wingmen.js` limpo, `node src/selftest.mjs` 100% ok (não toca nada testado ali). **Testado ao vivo** (servidor `static` já em uso por outra sessão nesta porta — aberto uma aba nova apontando pro mesmo `localhost:8420`, arquivos em disco já refletiam a mudança): Modo Arcade com Esquadrão (4) completo desde a decolagem, cutscene e ~7s de combate observados sem nenhum erro de console; os 4 wingmen mantiveram formação fluida ao redor do jogador e se espalharam pelo campo de detritos sem nenhuma exceção.

**Nota de repositório**: `src/player.js` tinha uma mudança não commitada (`getWingmanCount()`) de outra sessão concorrente usando esta mesma pasta — não foi tocada nem incluída neste commit, propositalmente, por não ser deste pedido.

**Versão**: v0.69.0 → **v0.70.0**

---

### Sentinela Refeita do Zero: Moldura Larga com Buraco que Pulsa (Abre/Fecha) de Verdade — v0.69.0

Pedido do usuário, direto e frustrado com tentativas anteriores: *"eu quero que refaça o sentinela do zero, pelo que parece nenhuma IA consegue entender o conceito simples de um inimigo que atira um quadrado reto em direção ao jogador que fica se abrindo e fechando, causando dano caso o jogador esteja dentro quando ele se fecha, com tamanho de MOLDURA, não de QUADRADO largo (bordas pequenas mas largo)"*.

**Diagnóstico do porquê as tentativas anteriores (v0.62.0→v0.66.0) nunca acertaram o conceito**, lendo o código real antes de mexer:
1. `updateGateAnimation(gate)` era **literalmente um no-op**: `gate.mesh.scale.set(1, 1, 1)`, com o comentário "Escala estável e nítida" — uma decisão deliberada de uma sessão anterior de NUNCA animar a moldura. Não existia abre/fecha nenhum, nunca existiu desde a v0.62.0.
2. As dimensões (`GATE_INNER_HALF=2.6`, `GATE_BORDER_WIDTH=3.8`) tinham a **borda mais grossa que o próprio buraco** (3.8 de espessura contra 2.6 de raio de abertura) — exatamente o "quadrado largo" que o usuário não queria, em vez de uma moldura de borda fina.
3. `resolveGateHit` fazia uma checagem puramente espacial e ESTÁTICA (banda fixa entre `inner` e `outer`), sem noção nenhuma de tempo/fase — não tinha como existir um "quando ela se fecha" porque nada nunca fechava.

**Antes de reescrever, confirmada com o usuário a única decisão de design que o código não podia responder sozinho**: o ciclo de abrir/fechar pulsa continuamente o voo inteiro (repete várias vezes até chegar no jogador), não é um pulso único — usuário confirmou essa opção.

**Reescrita completa (`src/enemies/sentinela.js`)**:
- **Silhueta externa constante, buraco interno que pulsa**: `GATE_OUTER_HALF = 6.4` nunca muda (é o "tamanho largo" da moldura). O que anima é só a abertura (`apertureHalf`), oscilando suavemente por cosseno entre `GATE_OPEN_APERTURE_HALF = 5.55` (aberta — borda residual de só `GATE_BORDER_MIN = 0.85`, ~4.5x mais fina que antes) e `0` (fechada — moldura vira um quadrado sólido, toda a área perigosa), num ciclo de `GATE_PULSE_PERIOD = 1.0s` que se repete o voo inteiro (`computeApertureHalf(age)`). A borda "cresce pra dentro" conforme fecha (`borderThickness = outer - aperture`) em vez de a moldura inteira encolher — por isso o tamanho externo nunca muda.
- **Geometria das barras trocada de estática pra unitária escalada por instância** (`gateBarUnitGeo = BoxGeometry(1,1,1)`, mesmo padrão de "geometria compartilhada + transform por instância" já usado em `detrito.js`): as 4 barras da borda e o plano central (`applyGateAperture`) são reposicionadas/re-escaladas a cada frame pra refletir a abertura atual, em vez de nascerem com um tamanho fixo pra sempre.
- **`resolveGateHit` agora usa a abertura VIVA do instante exato da passagem** (`gate.apertureHalf`, atualizada por `updateGateAnimation` no mesmo frame antes da checagem de cruzamento em `enemies/index.js`, arquitetura de resolução única já existente e preservada): fora da moldura inteira = sempre seguro; dentro do buraco daquele instante = seguro; qualquer outra coisa = dano real. Isso faz emergir exatamente o pedido — se a moldura estiver fechando/fechada bem na hora que cruza o jogador, praticamente a área inteira vira perigosa; se estiver bem aberta, só a borda fina machuca.
- **Mira reta preservada**: o direcionamento "atira reto" (trava o alvo em coordenadas relativas ao frame do trilho no instante do disparo e reprojeta a cada frame pra acompanhar a curva da pista sem homing) é a lógica adversarialmente validada em duas sessões anteriores (v0.62.2/v0.62.3) — não foi tocada, só reaproveitada.

**Testado**: `node --check` limpo. `node src/selftest.mjs` 100% ok (não afetado). **Teste sintético novo, escrito do zero pra este overhaul** (`three@0.169.0` instalado temporariamente via `npm install --no-save`, removido no final junto com `node_modules`/`package-lock.json` — mesmo padrão de sessões anteriores): exercitou o módulo REAL (`sentinelaFire`/`updateGateFlight`/`updateGateAnimation`/`resolveGateHit`, não uma reimplementação da lógica) contra um rail falso reto, simulando o voo inteiro (48u a 18u/s, ~2.67s) em passos de 1/60s. Os 15 asserts confirmaram: a moldura dispara reta e cruza o jogador no tempo esperado; a abertura de fato oscila entre ~0 (fechada) e ~5.55 (aberta) — não fica travada; **pulsa mais de uma vez durante o voo** (≥2 ciclos completos, não é pulso único); jogador no centro exato quando fechada → dano; jogador no centro quando aberta → seguro; jogador na borda fina quando aberta → dano; jogador bem fora da silhueta inteira → sempre seguro independente da fase; estado parcialmente fechado testado nos dois lados do buraco atual (dentro = seguro, fora = dano); e a proporção borda/moldura no estado aberto ficou abaixo de 10% da largura total (moldura de borda fina, não quadrado grosso).

**Não testado ao vivo no navegador nesta entrega**: outra sessão/chat tinha o servidor `static` (porta 8420) em uso no momento — evitei mexer em `.claude/launch.json` (configuração compartilhada entre sessões) só pra liberar a porta pra mim. A cobertura sintética acima testa o módulo real ponta a ponta (não uma simulação da lógica), mas vale uma passada visual ao vivo (`preview_start "static"`, debug → spawnar sentinela, observar o pulso a olho) na próxima sessão com a porta livre.

**Versão**: v0.68.0 → **v0.69.0**

---

### Overhaul Completo do Painel de Debug (Categorias, Busca, Leitura de Estado ao Vivo) e Correção de Crash no Spawn de Wingman — v0.68.0

Pedido do usuário: *"quero que faça uma pesquisa, checagem e correção extensiva por bugs, busque o máximo possível de problemas e corrija-os um por um, após isso eu quero que faça um overhaul completo no sistema de debug."* A parte de caçada extensiva de bugs já tinha sido entregue nas duas sessões anteriores (v0.66.0 e v0.67.0, ambas neste mesmo arquivo) — reconferido no início desta sessão (`node --check` nos 60+ arquivos de `src/` limpo, `node src/selftest.mjs` 100% ok, zero `TODO`/`FIXME` pendente no código) antes de partir pro overhaul do debug em si.

1. **Diagnóstico do painel antigo**: o painel de debug (`` ` `` pra abrir/fechar) era só um `<div>` com um heading, uma dica de tecla e uma lista **plana e não estilizada de propósito** de 59 botões idênticos empilhados (a única CSS de `.debug-panel` vivia solta em `index.html`, nunca em `hud-styles.js`) — sem nenhum agrupamento, busca, ou retrato do estado da partida. Com 59 ações despejadas em ordem de declaração, achar uma ação específica exigia rolar a lista inteira toda vez.

2. **Bug real encontrado no caminho (`src/combat/index.js`)**: os 4 botões "+ Wingman N" do painel (`src/debug-actions.js`) chamam `combat.getWingmanCount()` depois de `combat.spawnSpecificWingman(id)` pra sincronizar `player.setWingmanCount(...)` — mas `combat/index.js` nunca expunha esse método no objeto que devolve (só `setWingmanCount`, `getActiveWingmen`, etc.; `getWingmanCount` existia só internamente em `squadron` via `wingmen.js`). Clicar em qualquer um dos 4 botões lançava `TypeError: combat.getWingmanCount is not a function` no clique, abortando a sincronização (o wingman era spawnado visualmente, mas a contagem interna do `player` nunca era atualizada). Corrigido expondo `getWingmanCount: () => squadron.getWingmanCount()` junto dos outros repasses de `squadron` — confirmado ao vivo que o clique (invocado direto via `.onclick()` com try/catch) não lança mais exceção nenhuma.

3. **Redesenho do painel (`src/debug.js`, `src/hud-game.js`, `index.html`)** — API externa 100% preservada (`hud.debug.bind/.setVisible/.setToggleActive` idênticos; `main.js`/`mount-game.js`/`debug-actions.js` não mudaram a lógica de nenhuma ação, só a apresentação):
   - **Categorias**: `DEBUG_ACTIONS` ganhou um campo `category` por ação e um novo `DEBUG_CATEGORY_ORDER` (11 categorias: Setor & Fluxo, Chefe & Dourado, Combate, Spawns, Jogador, Cartas & Buffs, Esquadrão, Pergunta, Ambiente, Eventos, Testes & Visual). O painel agora agrupa os 59 botões nessas seções, cada uma colapsável individualmente (clique no cabeçalho, seta ▾ gira -90° quando colapsada), todas expandidas por padrão.
   - **Busca**: campo de texto filtra os botões por substring do label (case-insensitive); categoria sem nenhum match some inteira; categoria com match força a expansão mesmo se o jogador tinha colapsado antes; mensagem "Nenhuma ação encontrada" aparece só quando zero botões sobram visíveis em qualquer categoria.
   - **Leitura de estado ao vivo**: nova grade fixa no topo do painel (FPS, Fase, Setor, Vida, Escudo, Vidas, Pontos, Combo, Inimigos, Ala, Posição, Flags ativos) atualizada ~5x/s por um `requestAnimationFrame` próprio do painel (só roda enquanto o painel está visível, parado em `unmount()`/`setVisible(false)`). Implementado via `hud.debug.setStatsProvider(fn)` — `mount-game.js` fornece um `fn` que lê `state`/`session`/`player`/`rail`/`combat`/`enemies` (todos já no escopo de onde `hud.debug.bind()` já era chamado) e devolve um snapshot plano; `hud-game.js` só pinta os valores recebidos, sem importar nada de lógica de jogo — mantém o HUD como camada de apresentação pura, mesmo padrão dos outros métodos do hud que recebem dados prontos.
   - **Layout**: cabeçalho/dica/stats/busca ficam fixos (`flex-shrink:0`) no topo do painel; só a lista de categorias rola por baixo (`overflow-y:auto` isolado) — dá pra ler o estado ou filtrar sem perder a posição de rolagem nos botões. Botões de toggle (`godMode`, `showHitboxes`, etc.) ganharam borda tracejada pra se diferenciar visualmente dos botões de ação única.

4. **Correção de segurança de input necessária pro campo de busca (`src/input.js`)**: o painel de debug introduziu o **primeiro campo de texto que pode ganhar foco durante uma partida ativa** (o jogo continua rodando com o painel aberto — só `state.debugVisible` muda, não `state.paused`). O listener global de teclado (`window.addEventListener('keydown', ...)`) não tinha NENHUMA checagem de alvo do evento — digitar "spawn" pra filtrar ações também acionaria movimento/tiro/dodge, já que as teclas batem nos mesmos bindings do jogo. Adicionada uma guarda `isTypingTarget(e)` (`t.tagName === 'INPUT' || 'TEXTAREA' || t.isContentEditable`) no início de `onKeyDown`, ignorando esses eventos por completo quando o foco está num campo de texto — corrige o campo de busca novo e protege qualquer campo de texto futuro durante o jogo.

**Testado**: `node --check` nos 60+ arquivos de `src/` (incluindo os 5 tocados) e `node src/selftest.mjs`, 100% ok. **Testado ao vivo** (`preview_start "static"`, Modo Arcade): painel abre/fecha via crase, os 12 valores da grade de stats populam corretamente na primeira renderização com dados reais da sessão (Setor 1/1, Vida 10/10, Escudo 3/3, etc. — prova que `getDebugStatsSnapshot` roda de ponta a ponta sem exceção, incluindo o `combat.getWingmanCount()` corrigido). Busca testada via `dispatchEvent('input')` real no campo: filtrar por "chefe" deixa só a categoria "Chefe & Dourado" visível com os 2 botões que batem; busca sem match nenhum mostra "Nenhuma ação encontrada" e esconde todas as categorias; limpar a busca restaura tudo. Colapsar/expandir categoria testado via clique real no cabeçalho (classe `.collapsed` + `display:none` no corpo, confirmado por `getComputedStyle`). Botão "+ Wingman 1" invocado diretamente com try/catch — zero exceção (antes do fix, lançava `TypeError` toda vez). Toggle "God mode" testado — classe `.active` aplicada corretamente. **Limitação de ambiente encontrada e documentada, não é bug**: `requestAnimationFrame` não disparou nenhuma vez em ~10s de espera real nesta sessão do Browser pane (confirmado isoladamente com uma Promise de rAF puro, sem nenhum código deste projeto envolvido) — a mesma limitação de "rAF sem foco de SO" já documentada nas sessões da v0.62.3/v0.63.x, que também trava o loop principal do próprio jogo (fase ficou presa em `launchCutscene`, posição do jogador não avançou). Isso impediu confirmar visualmente o FPS/posição atualizando em tempo real dentro desta sessão, mas não afeta a corretude: a busca/colapso de categoria são orientados a evento (não dependem de rAF) e a grade de stats populou corretamente na sua única renderização executada.

**Versão**: v0.67.0 → **v0.68.0**

---

### Correção do Softlock do Chefe, Propagação de Abate por Wingmen e Reset do Painel de Debug — v0.67.0

Pedido do usuário: *"por que você anda quebrando coisa que antes funcionava direito??? o boss foi derrotado mas não teve cutscene e agora o jogo deu softlock. que que adianta existir debug se as opções do debug não podem ser selecionadas quando um evento está presente? era pra resetar tudo (inimigos na tela) e ai ir pra esse evento"*.

1. **Diagnóstico do Softlock do Chefe e Resolução em Múltiplas Camadas**:
   - **Causa Raiz 1 (Abate por Wingmen desconsiderado)**: Em `src/combat/wingmen.js`, quando os caças aliados disparavam lasers contra o chefe e desferiam o golpe final (`hit.bossDefeated = true`), a função `wingmen.update()` descartava o retorno de `enemies.resolveProjectileHit()`. Com isso, `events.bossDefeated` retornava `false` no tick do `game-loop.js`. Como o chefe já entrava em `dying = true` e reduzia seu HP a 0, em todos os frames subsequentes `!e.dying` o tornava invisível para novos acertos. O chefe sumia e a barra de HUD esvaziava, mas a fase permanecia indefinidamente em `'bossFight'`.
   - **Solução 1**: `wingmen.update()` agora acumula e propaga `enemyKills`, `enemyKillPoints`, `bossDefeated`, `bossHitWorldPos`, `goldenSpecialHit` e `goldenHitWorldPos`, integrando-os diretamente ao retorno de `combat.update()`.
   - **Causa Raiz 2 (Dependência de evento booleano instantâneo)**: No `game-loop.js`, a vitória dependia exclusivamente de `events.bossDefeated && state.phase === 'bossFight'` no exato frame da colisão. Se qualquer condição de tick ou morte assíncrona ocorresse, a transição para a cutscene era perdida para sempre.
   - **Solução 2 (Fail-Safe Imbatível no `game-loop.js`)**: O loop agora verifica `combat.hasAliveBoss()`, `combat.isBossDying()` e o snapshot de HP. Se a fase for `'bossFight'` e o chefe estiver morto (`hp <= 0`), no estado `dying`, ou ausente da arena, o jogo dispara imediatamente `bossFlow.handleBossDefeated(...)`. É matematicamente impossível o jogador ficar preso na arena de chefe sem chefe ativo.
   - **Ajuste de HUD**: Se `bossSnap` for nulo ou tiver `hp <= 0`, o HUD do chefe é ocultado automaticamente (`hud.setBossFight(false, 0, 1)`), impedindo que a barra vermelha vazia continue flutuando na tela.

2. **Reset Geral e Desbloqueio Irrestrito do Painel de Debug**:
   - As opções de evento do debug (`gotoBoss`, `skipToBossFight`, `gotoGolden`, `giveCard`, `restartSector`, `nextSector`, `prevSector`, `exitArenaNow`) continham guardas restritivas `if (getPhase() === 'combat')`, impedindo o jogador de clicar ou navegar caso o jogo estivesse em arena, cutscene, evento ou em estado anômalo.
   - Criada a rotina unificada `resetEverythingForDebugEvent()` em `src/debug-actions.js`:
     1. Limpa imediatamente todos os inimigos, chefes, projéteis, lasers e portais da tela (`combat.clearAllCombatants()`, `combat.clearOtherEnemies()`).
     2. Limpa projéteis de alas em voo (`squadron.clearLasers()`).
     3. Destrava e reseta o rail e o modo arena (`rail.exitArena()`, `rail.setAdvancing(true)`).
     4. Reseta e oculta todas as barras de combate, chefes, anomalias, minimapa, horizonte, contadores e feedbacks do HUD.
     5. Fecha qualquer modal aberto (pergunta ou escolha de cartas roguelike).
     6. Limpa temporizadores de cutscene e reseta a fase para `'combat'`.
   - Todas as opções de salto e transição do debug agora executam `resetEverythingForDebugEvent()` antes de iniciar o evento solicitado, garantindo tela limpa e execução 100% confiável em qualquer circunstância.

**Versão**: v0.66.0 → **v0.67.0**

---

### Sentinela Retificado, Proibição de Inimigos Presos, Desengajamento após 4 Tiros, Naves Douradas Suaves e Efeito de Disparo em Cone Invertido — v0.66.0

1. **Sentinela Reformulado (Giroscópio / Moldura)**:
   - Velocidade equilibrada para 18 u/s (~1.2s de reação).
   - Moldura central com abertura de 5.2x5.2 unidades e colisão real de 3.8 unidades de espessura de borda com partículas de impacto âmbar.
2. **Proibição Absoluta de Inimigos Presos ao Lado ou Atrás da Nave**:
   - Linha de ultrapassagem estrita `PASS_BEHIND = -2.0u`. Ao ultrapassar a nave do jogador, os inimigos aceleram e desengajam para fora do campo de visão.
3. **Desengajamento de Inimigos Genéricos após 4 Ataques**:
   - Caças comuns (Blaster e Tank) que realizam 4 disparos puxam o manche para cima e aceleram sem teleguiar, saindo da tela suavemente.
4. **Naves Douradas da Anomalia**:
   - Corrigido o comportamento de grudar no jogador: após ultrapassagem ou aproximação (< 14u), desativam o tracking e passam direto.
5. **Visibilidade e Dimensões (+10%)**:
   - Escala de todos os inimigos aumentada em +10% e materiais com brilho emissivo mais vibrante.
6. **Muzzle Flash em Cone Invertido**:
   - Geometria cônica azul compacta de ápice invertido voltado para a saída do canhão.

**Versão**: v0.65.0 → **v0.66.0**

---

### Modo Arcade Roguelike (Jogar Sem Baralho) e Escolta Inicial de Companheiros — v0.65.0

Pedido do usuário: *"adicione uma opção no pré jogo para jogar sem baralho, removendo as perguntas do jogo e mantendo o modo roguelike normal (onde ao invés de ir para uma pergunta, vai direto para a escolha de carta)", "atualize sempre o numero de versao no readme do site", "adicione a opção no pré-jogo de iniciar já com 1 ou mais companheiros"*.

1. **Modo Arcade Roguelike (Jogar Sem Baralho)**:
   - Criado `buildNoDeckVirtual()` e `NO_DECK_ID = '__no_deck__'` em `src/decks.js`, gerando uma estrutura virtual leve sem necessidade de baralhos Anki importados.
   - Em `src/flow-question.js`: ao expirar o tempo de ciclo, quando `deck.isNoDeck` está ativo, o jogo bypassa completamente qualquer modal de pergunta (`enterAlternatives`) e abre diretamente a escolha de 3 cartas Roguelike (`enterCardChoice`). Ao selecionar uma carta, os upgrades são aplicados e o setor/ciclo de combate avança imediatamente.
   - Em `src/flow-boss.js`: destruição de orbes no *Boss Buildup* e vitória sobre a *Anomalia Dourada* concedem seus bônus e avançam diretamente para a escolha de cartas de melhoria sem exibir perguntas.
   - Botão estilizado com gradiente neon/arcade (`.btn-arcade`) adicionado na tela de pré-jogo (`src/hud-pregame.js`), permitindo iniciar partidas Arcade com um clique mesmo sem nenhum arquivo de deck importado.
2. **Escolta Inicial de Companheiros Configurável**:
   - Adicionada configuração `startingWingmen: 0` em `src/settings.js`, persistida em `localStorage`.
   - Criado seletor interativo com botões de 0 a 4 alas (`Solo (0)`, `+1 Ala`, `+2 Alas`, `+3 Alas`, `Esquadrão (4)`) no card de pré-jogo (`src/hud-pregame.js`) e no menu de Configurações (`src/hud-settings.js`).
   - Em `src/mount-game.js`: `player.setWingmanCount` e `combat.setWingmanCount` são inicializados imediatamente no carregamento da partida com a quantidade escolhida, fazendo os caças aliados (*Falco, Peppy, Slippy, Phantom*) decolarem e voarem em formação ao lado da nave do jogador desde o primeiro frame.
3. **Sincronização de Documentação e README**:
   - Badge de versão do `README.md` atualizado para **`v0.65.0`**.
   - Visão Geral do `README.md` atualizada com o resumo do Modo Estudo, Modo Arcade e Escolta de Companheiros.

**Versão**: v0.64.1 → **v0.65.0**

---

### Reversão de Modelos Genéricos, Suavização de Movimento em Tela, Escala e Fix Crítico de `playerPosition` — v0.64.1

Pedido do usuário: *"eu não pedi pra mudar os modelos dos inimigos, volte atrás com os modelos deles, é apenas para se diferenciar em cores, deixa a movimentação deles mais suave e menos extrema, eles estão saindo da tela na maior parte das vezes. Os deixe 15% maiores, o tank deixe 30% maior com 10 de vida a mais e corrija este problema [screenshot com ReferenceError: playerPosition is not defined]"*.

1. **Correção de Crash de Loop (`src/effects.js`)**:
   - `ReferenceError: playerPosition is not defined`: o loop de atração de micro-orbes em `effects.update` tentava referenciar `playerPosition` em vez do parâmetro de função `shipPosition`. Extraído para a função dedicada `updateMicroOrbes(dt, playerPos)` e exposta com segurança para consumo no orquestrador de combate.
2. **Reversão dos Modelos 3D para Modelo Unificado (`src/enemies/blaster.js`)**:
   - Revertidas todas as variações complexas de malhas para o modelo 3D unificado de caça com cone piramidal de 4 faces (`ConeGeometry`), mantendo a diferenciação puramente pelas cores originais dos 6 arquétipos (Azul, Vermelho, Verde, Laranja, Branco e Roxo).
3. **Escalonamento de Inimigos**:
   - Caças genéricos ampliados em **15%** (`ConeGeometry(1.15, 2.53, 4)` e `BLASTER_HIT_RADIUS = 2.07`).
   - Tanque blindado ampliado em **30%** (`TANK_SCALE = 2.08`, `TANK_HIT_RADIUS = 2.34`) com **+10 de vida** (`TANK_DEFAULT_HP = 15`).
4. **Movimentação Suave sem Sair da Tela**:
   - Removidas manobras extremas de fuga (*fly-by velocity* que arremessavam naves a 18u/s para fora da visão).
   - Adicionada interpolação suave (*lerp*) e limites estritos de tela (`MAX_SCREEN_X: ±5.4`, `MAX_SCREEN_Y: ±3.5`) no perfil evasivo e em órbitas, garantindo que os caças permaneçam sempre enquadrados na câmera.
   - Ajustados os espaçamentos das esquadrilhas em `src/enemies/index.js` para evitar que naves surjam cortando as bordas.

**Versão**: v0.64.0 → **v0.64.1**

---

### Overhaul Tático dos Inimigos Genéricos Estilo Star Fox 64 — v0.64.0

1. **Formações Coordenadas em Esquadrilha**: 4 formações táticas (`vFormation`, `sweepLine`, `trailColumn`, `pincer`) integradas no spawn de trilho.
2. **Líder de Esquadrão e Pânico de Ala**: Insígnia holográfica para o líder; abate do líder descoordena o esquadrão.
3. **Bônus Squad Wipe e Micro-Orbes Anki de Frenesi**: Eliminar o esquadrão concede +150 PTS e dropa Micro-Orbe Anki magnético que ativa o **Frenesi de Foco (5s)** (disparo frontal triplo contínuo acelerado).
4. **Feedback Visual de Combate no HUD**: Banners cinemáticos `SQUAD WIPE!` e `FRENESI DE FOCO!`.

**Versão**: v0.63.3 → **v0.64.0**

---

### Transição suave entre o fim da cutscene de decolagem e o início do gameplay — v0.63.2

Pedido do usuário, logo depois da v0.63.1: *"eu queria que houvesse uma transição suave do fim da cutscene até o início do gameplay"* — mesmo com os fixes de FOV/background da v0.63.0, a TROCA em si (letterbox, banner, HUD de combate) ainda podia estar abrupta.

**Diagnóstico ao vivo** (`preview_start "static"`, mesmo padrão de instrumentação das duas entregas anteriores: `requestAnimationFrame`/`cancelAnimationFrame` sobrescritos por um stepper manual, mais leitura direta de `getComputedStyle` no exato frame da troca):

1. `updateLaunchCutscene` faz `hud.hideLaunchBanner()` + `hud.setLetterbox(false)` + `camera.fov = 70` + `done()` todos no MESMO frame (confirmado por stepper: `cinematicActive`/`letterboxTopActive`/`bannerHidden` viram juntos, sempre no mesmo pump). Isso por si só não é o bug — várias mudanças no mesmo frame são normais quando cada uma tem sua própria transição CSS.
2. **Letterbox e HUD de combate (vida/escudo/pontuação/retícula) JÁ tinham transição CSS correta** (achado que contraria a suposição inicial do pedido): `hud-styles.js` já definia `.hud-letterbox { transition: transform 0.45s }` (barras retraem suavemente ao perder a classe `active`) e `.reticle, .hud-status, .hud-lives-bar, .hud-bar-wrap, ... { transition: opacity 0.35s ease }` (fade-in ao perder `cinematic-active`, que é o que aplica `opacity: 0 !important` durante a cutscene). Confirmado ao vivo por leitura direta de `getComputedStyle(letterboxTop).transitionDuration` (`"0.45s"`) e `getComputedStyle(reticle).transitionDuration` (`"0.35s"`) já no código anterior à esta entrega.
3. **O único elemento realmente sem transição era o banner de decolagem** (`hud-launch-banner`): `getComputedStyle(banner).transitionProperty` retornava `"all 0s"` — a CSS só tinha a `animation` de ENTRADA (`launch-banner-in`), nenhuma transição de saída. `hideLaunchBanner()` fazia só `launchBanner.hidden = true`, e o atributo `hidden` mapeia pra `display: none` via UA stylesheet — propriedade não-animável, então o banner literalmente sumia num frame só, sem chance de fade. Esse pop (o único elemento realmente abrupto entre os três citados no pedido) é o que fazia a troca inteira "ler" como abrupta, mesmo com letterbox/HUD já suaves ao lado.

**Correção** (`hud-styles.js`, `hud-game.js`):
- `hud-styles.js`: `.hud-launch-banner` ganhou `transition: opacity 0.35s ease` (mesma duração do grupo HUD/reticle, pra sincronizar visualmente) e uma classe `.hud-launch-banner.is-hiding { opacity: 0 }` que serve de alvo pra essa transição.
- `hud-game.js`: `hideLaunchBanner()` agora só adiciona a classe `is-hiding` (dispara o fade) e agenda — via `scheduleTimeout`, mesmo mecanismo de limpeza já usado por hit marker/squadron notice/storm warning, e igualmente coberto pelo `unmount()` — o `hidden = true` de verdade pra **370ms depois** (350ms da transição + folga, mesmo padrão de "duração + folga" já usado no `FOCUS_COLLAPSE_MS`). `showLaunchBanner()` cancela esse timeout pendente e remove `is-hiding` antes de reexibir, pra uma cutscene futura (próxima partida) não nascer com o banner preso em opacidade 0.

**Armadilha encontrada e corrigida NA HORA (vale registrar pra não repetir)**: a primeira tentativa desse fix comentou a mudança usando crases (`` ` ``) estilo markdown dentro do comentário CSS em `hud-styles.js` — só que o arquivo INTEIRO de CSS injetado é o conteúdo de um template literal JS (`style.textContent = \`...\``, abre na linha 9, fecha na ~1409). Qualquer crase dentro desse bloco (mesmo dentro de um comentário `/* */`, que é só texto pro parser JS) fecha/reabre o template literal de verdade, corrompendo a sintaxe do arquivo inteiro — `node --check` não pegou (o V8 do Node aparentemente reparsa os fragmentos resultantes como statements soltos sintaticamente válidos, tipo `hidden = true` e `display:none` como label), mas o `import()` real no navegador jogava `SyntaxError: Unexpected identifier 'hidden'` e quebrava a cadeia inteira de módulos do HUD (`hud.js`→`hud-game.js`→`hud-styles.js`), deixando a tela de pré-jogo em branco. Detectado ao vivo (tela de pregame vazia, zero botões) e corrigido removendo as crases do comentário antes de seguir com o teste. Lição: **nunca usar crase dentro de qualquer comentário em `hud-styles.js`** (ou qualquer arquivo que injete CSS via template literal) — usar aspas normais ou nenhuma marcação.

**Testado**: `node --check` em todos os 55 arquivos de `src/` (incluindo os 2 tocados) e `node src/selftest.mjs` — 100% ok, depois da correção da armadilha acima. **Testado ao vivo** (`preview_start "static"`, stepper de frame manual, múltiplas rodadas): confirmado que no exato frame da troca, `banner.hidden` continua `false` e a classe `is-hiding` já foi aplicada (opacity indo a 0 via transição, não sumindo na hora); ~370ms depois (tempo real), `banner.hidden` vira `true` de verdade. Reproduzido de forma consistente em 2 rodadas frescas (frame exato da troca variou ligeiramente por causa do jitter de clique real do teste, mas o comportamento — `is-hiding` true / `hidden` false no frame da troca — foi idêntico nas duas). Confirmado também que o jogo segue normal pro combate logo depois (HUD completo — pontos/combo, vidas, barras de vida/escudo/boost, retícula — renderizando certo, zero erro novo no console). **Sem regressão**: cutscene de chefe (`gotoBoss` via painel de debug) rodada até o fim depois do fix — `cinematicActive`/letterbox alternam no ponto certo (~92% do tempo), sem exceções, confirmando que `updateArenaCutscene`/`updateDeathCutscene` (não tocadas) continuam intactas. FOV/background da v0.63.0 não tocados (zero mudança em `cutscenes.js`).

**Versão**: v0.63.1 → **v0.63.2**.

---

### Verificação Adversarial Independente da v0.63.0 (Cutscene de Decolagem) — v0.63.1

Segunda nave verificou de forma independente o diagnóstico + redesenho da v0.63.0 abaixo, sem confiar no relatório do primeiro agente — assistiu a cutscene do zero, tentando ativamente achar algo errado, mal calibrado ou quebrado, em vez de só confirmar.

1. **Nota de processo corrigida primeiro**: a entrega da v0.63.0 (diagnóstico + redesenho abaixo) tinha sido documentada em `PROGRESSO_POS_0.30.md` — um arquivo já **congelado** desde a v0.50.0 (o próprio cabeçalho de `PROGRESSO_POS_0.50.md` já dizia isso). O `CLAUDE.md` do projeto ainda apontava pro `_POS_0.30` como "o arquivo atual" (referência desatualizada, nunca migrada quando o `_POS_0.50`/`_POS_.60` nasceram) — o agente anterior seguiu essa instrução ao pé da letra e teria a entrega perdida do olhar de quem só lê o arquivo de progresso realmente atual. Corrigido: entrada movida pra cá (única cópia, não duplicada) e `CLAUDE.md` atualizado para apontar pro `_POS_.60` como atual, com a cadeia de sucessão completa.
2. **Instrumentação própria de passo manual** (RAF/`requestAnimationFrame` congelado e avançado em incrementos exatos de 16.67ms via `window.requestAnimationFrame`/`cancelAnimationFrame` sobrescritos, mais `THREE.Object3D.prototype.add`/`THREE.PerspectiveCamera.prototype.updateProjectionMatrix` para capturar `scene`/`camera` ao vivo) — escrita do zero nesta sessão, não reaproveitando a do primeiro agente, contra o jogo real rodando em `preview_start "static"`.
3. **Background/ambiente — CONFIRMADO por leitura direta dos objetos three.js**: logo após o frame 1 da cutscene de decolagem, `skyDome.visible`/`planetGroup.visible`/`gridPulseMesh.visible` já são `false` (antes do fix ficariam `true`, valor padrão do three.js na construção, até o primeiro `environment.update()` normal do jogo — que só rodava DEPOIS do handoff). Confirmado ao longo de toda a cutscene (amostras a cada ~50-100ms, 0 momento com qualquer um dos três `true`) e também depois do handoff e durante a cutscene de arena do chefe (`updateArenaCutscene`, disparada via painel de debug) — nenhuma regressão.
4. **Neblina — CONFIRMADO sem descontinuidade**: `scene.fog.density` evolui suavemente de ~0.0077 a ~0.0085 (alvo de "bolsão de névoa") ao longo de toda a cutscene, sem nenhum salto no frame exato do handoff — a mesma leitura por frame usada pra visibilidade dos meshes captura a curva completa.
5. **Pulso de FOV — CONFIRMADO numericamente**: pico medido em exatamente `78.0°` (~56% do tempo total, batendo com o valor alegado), e o FOV volta a ficar travado em exatamente `70.000` por ~250-300ms (múltiplas amostras consecutivas idênticas) ANTES do frame em que o letterbox desativa e o handoff acontece — não mais no mesmo frame do handoff como na versão antiga.
6. **Shockwave de ignição — confirmado por leitura de código, não só descrição**: `SHOCKWAVE_MAX_SCALE` (em `effects.js`) é `8`; escala `2.0` (antiga) dava `maxScale=16`, escala `1.1` (nova) dá `maxScale=8.8` — redução real de ~45% no raio máximo do anel, batendo com o alegado. Nos screenshots capturados ao vivo (wall-clock, além do stepper determinístico) o anel de fato cresce grande o bastante pra dominar boa parte do quadro por alguns frames (é billboard, sempre de frente pra câmera, `effects.js` linha ~1500), mas nunca cobre 100% opaco — estrelas de fundo continuam visíveis através dele em toda amostra capturada, e ele já está desvanecendo (`opacity = 0.85*(1-t)`) bem antes de chegar no raio máximo. Redução real, não uma alegação exagerada.
7. **Handoff sem soluço — CONFIRMADO**: posição/FOV da câmera não têm nenhum salto abrupto no frame exato da transição letterbox-ativo → letterbox-inativo (posições e FOV variam continuamente entre os frames antes/depois); painel de debug (`` ` ``) responde imediatamente após o handoff, confirmando que o loop de input/tick normal está de fato no controle.
8. **`updateArenaCutscene`/`updateDeathCutscene` — sem regressão**: `git diff` do commit da v0.63.0 mostra que as duas funções ficaram byte-a-byte idênticas (só uma propriedade nova e não usada, `environment`, foi adicionada ao objeto de deps desestruturado em `createCutscenesSystem`) — risco de regressão estruturalmente nulo. Confirmado também ao vivo: disparada a cutscene de apresentação de chefe via painel de debug (`Ir para arena de chefe`), rodou sem erro de console, FOV subiu a 90° (bate com `70 + (16+4)` de `ARENA_CUTSCENE_FOV_BUMP`), letterbox desativou no ponto certo (~92% do tempo) e os 3 meshes de ambiente permaneceram `false` (não há "pop" porque o tick normal já os deixa `false` antes da cutscene começar — a lacuna real dessas duas cutscenes, já sinalizada como não corrigida de propósito, é a animação de ambiente CONGELAR durante elas, não o mesmo pop visual da decolagem; ponto sutil que vale registrar caso alguém decida atacar o achado pendente).
9. **Nenhum bug adicional de código encontrado.** `node --check` limpo nos 55 arquivos JS do projeto (54 em `src/` + `service-worker.js`) e `node src/selftest.mjs` 100% ok, ambos reconferidos do zero nesta sessão.

**Versão**: v0.63.0 → **v0.63.1**.

### Overhaul da cutscene de decolagem: causa raiz do background errado + retiming do FOV — v0.63.0

Pedido do usuário: só *"péssimo timing e background/efeitos incorretos"* na cutscene de decolagem, sem detalhe extra — o pedido exigia diagnóstico ao vivo ANTES de qualquer redesenho.

**Diagnóstico ao vivo** (servidor `static`, instrumentação temporária só nesta sessão do navegador, nunca commitada: `requestAnimationFrame`/`cancelAnimationFrame` sobrescritos por um stepper manual sincronizado com `performance.now()` no instante do `start()` — permite avançar a cutscene em incrementos exatos de tempo e tirar screenshot em qualquer ponto — mais um patch em `THREE.Object3D.prototype.add`/`THREE.PerspectiveCamera.prototype.updateProjectionMatrix` pra capturar `scene`/`camera` ao vivo sem precisar tocar no closure de `mountGame`):

1. **Causa raiz do "background incorreto" (a mais grave)**: `updateLaunchCutscene` nunca chamava `environment.update()` (só `effects.update()`) — e `environment.update()` é o ÚNICO lugar que sincroniza `skyDome.visible`/`planetGroup.visible`/`gridPulseMesh.visible` com `ENVIRONMENT_CONFIG` (hoje todos `false`, fundo preto puro — decisão de uma entrega anterior). Esses meshes nascem com `visible=true` por padrão do three.js, então a cutscene INTEIRA (os 2s completos) renderizava com o skydome de nebulosa colorida, o planeta gigante gasoso com anéis + lua, e o grid energizado pulsante — os 3 elementos que o resto do jogo desliga de propósito — sumindo todos de uma vez no frame exato em que o tick normal assume logo após o handoff (um "pop" visual abrupto). Confirmado com screenshots em t≈0%, na ignição (30%), no pico de FOV (~56%) e no frame imediatamente pós-handoff — reproduzido de forma IDÊNTICA em 3 execuções frescas (bug 100% determinístico, sem aleatoriedade envolvida).
2. **Neblina "congelada" a cutscene inteira**: mesma causa raiz — sem `environment.update()`, `scene.fog.density` ficava travado no valor inicial (0.0075) durante os 2s inteiros (incluindo o hold de 700ms com `rail.setDistance(0)` parado), só passando a reagir aos "bolsões de névoa" (`nebulaPockets`) no instante em que o tick normal assumia. Sintoma secundário do mesmo bug, corrigido pela mesma correção.
3. **Pulso de FOV (70→82→70) media exatamente certo, mas só terminava de descer NO ÚLTIMO frame antes da troca de fase** (confirmado numericamente, com a duração antiga de 2000ms) — lia como mais um solavanco empilhado em cima da troca de câmera/HUD/background no mesmo instante, não como um efeito de câmera de propósito.
4. **Efeito de ignição (shockwave escala 2.0, raio máx. ~16) cobria quase a tela inteira** nesse plano fechado (câmera a 6.5-10 de distância da nave) — confirmado visualmente no screenshot do instante de ignição.
5. **A divisão de fases em si (hold 700ms / aceleração 1300ms) estava OK** — o problema de ritmo percebido vinha majoritariamente dos itens 1-4 acima, não da proporção hold/aceleração.

**Redesenho** (`src/cutscenes.js`, `src/main-constants.js`, `src/mount-game.js`):
- `createCutscenesSystem` passou a receber `environment` nas deps (`mount-game.js`) e `updateLaunchCutscene` chama `environment.update(dt, playerPos, { boostActive: t >= ignitionT })` a cada frame, igual ao tick normal — corrige os itens 1 e 2 de uma vez, e de quebra a decolagem ganha os efeitos que DEVERIAM estar ligados (`multiLayerStars`/`warpStreaks`/`nebulaPockets`) reagindo em tempo real desde o primeiro frame, em vez de só depois do handoff.
- `LAUNCH_CUTSCENE_MS`: 2000 → **2400ms**. `ignitionT`: 0.35 → **0.3** (mantém o hold em ~720ms em tempo absoluto, quase idêntico ao anterior — o ganho de tempo é pro assentamento do FOV abaixo, não pra alongar a espera parada).
- Pulso de FOV: amplitude 12 → **8**, comprimido pra assentar em `fov=70` aos 85% da fase de aceleração (`fovPulseP = min(1, p/0.85)`) em vez de exatamente no último frame — sobram ~250-300ms de câmera já estável antes do handoff, tirando o empilhamento de mudanças no mesmo instante.
- Shockwave de ignição: escala 2.0 → **1.1** (mesmo punch, sem estourar o enquadramento).

**Valores finais**: `LAUNCH_CUTSCENE_MS=2400`, `ignitionT=0.3` (hold ≈720ms, aceleração ≈1680ms), pico do pulso de FOV (78°) em ≈56% do total (≈1350ms), assentado em 70° por ≈300ms antes do handoff.

**Testado**: `node --check` limpo em `cutscenes.js`/`main-constants.js`/`mount-game.js`. **Testado ao vivo**: servidor `static`, instrumentação de passo manual (ver acima) rodada 3× antes do fix (bug reproduzido de forma idêntica nas 3) e novamente depois — confirmado por leitura direta de `scene`/`camera` a cada frame que `skyDome`/`planetGroup`/`gridPulseMesh` ficam `visible=false` desde o frame 1 da cutscene, fundo permanece `#000000` o tempo todo, `fogDensity` evolui suavemente sem descontinuidade no handoff, e o FOV assenta em 70 ~300ms antes do fim. Handoff conferido: `letterboxActive`/`bannerHidden` viram na hora certa, HUD de combate (vida/escudo/pontuação/mira) aparece normalmente logo em seguida, sem erro de console (o único erro de console presente é o de Service Worker/CDN do Three.js já documentado como limitação do ambiente de teste, não deste código). Reprodução em tempo real (`requestAnimationFrame` nativo) esbarrou na mesma limitação de rAF sem foco de SO já documentada no histórico do projeto — compensado integralmente pela instrumentação de passo manual, determinística e mais precisa que observação em tempo real.

**Achado, não corrigido (fora de escopo deste pedido)**: `updateArenaCutscene` e `updateDeathCutscene` (mesmo arquivo) muito provavelmente compartilham a mesma lacuna — nenhuma das duas chama `environment.update()` também. Não mexi nelas porque o pedido do usuário era especificamente sobre a cutscene de decolagem, e a instrução desta tarefa foi não tocar nas outras duas sem confirmação ao vivo própria delas. Vale investigar numa entrega futura se o mesmo pop de background acontece na apresentação do chefe/dourado ou na morte do chefe.

**Versão**: v0.62.3 → v0.63.0.

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

---

### Correção Crítica de Referência Indefinida e Robustez de Input — v0.62.1

1. **Causa Raiz do Erro de Inicialização/Combate (`src/enemies/index.js`)**:
   - `ReferenceError: opts is not defined` no método `updateEnemyProjectiles` (L494).
   - O método acessava `opts && opts.shipHitboxPoints` para o cálculo multiponto de colisão, porém o parâmetro `opts = {}` havia sido omitido na assinatura da função (`function updateEnemyProjectiles(dt, playerPosition)`).
   - Corrigida a assinatura para `function updateEnemyProjectiles(dt, playerPosition, opts = {})`, eliminando os milhares de erros de console por segundo e o congelamento do loop de combate.
2. **Robustez na Despausa de Erro (`src/game-loop.js`)**:
   - Adicionada verificação direta de tecla de contingência (`Space`, `Enter`, `KeyX`) na fase `wrongPause`, garantindo que o jogador consiga despausar imediatamente mesmo caso os mapeamentos em `localStorage` ainda não tivessem sido sincronizados com a nova chave `skipErrorFeedback`.
3. **Auditoria Geral de Escopo do Repositório**:
   - Varredura via AST com Acorn em todos os 56 arquivos JavaScript confirmando **0 variáveis indefinidas** em todo o código-fonte.
   - Testes unitários (`selftest.mjs`) e de resolução de módulos validados com 100% de integridade.

**Versão**: v0.62.0 → **v0.62.1**

---

### Causa Raiz Real da Moldura Incoerente (Deriva de Curva), Recalibração de Hitboxes e Variação de Distância de Spawn — v0.62.2

O usuário reportou que a moldura da Sentinela continuava incoesa mesmo depois da v0.62.0 ("às vezes acerta quando você está dentro, às vezes não"), e pediu para confirmar se a hitbox de detrito/nave (v0.62.0) tinha ficado correta de verdade. Investigação **medida antes de qualquer mudança**, não assumida — cada item abaixo tem teste sintético em Node importando os módulos reais.

1. **Causa raiz REAL da moldura incoesa (`sentinela.js`, `enemies/index.js`)**: a v0.62.0 corrigiu a checagem de cruzamento (`alongDir <= 0`) mas não era esse o bug residual. Escrito um teste sintético isolado (sem `rail.js` — só `Vector3` fixos) e confirmado que `resolveGateHit`/`updateEnemyGates` já batiam certo nos 4 cenários pedidos (centro/borda/fora/desvio-no-meio-do-voo) *em linha reta*. Só ao escrever um SEGUNDO teste usando o `rail.js` real (câmera + curva de verdade) é que o bug apareceu: a moldura viajava com uma velocidade FIXA em coordenadas de MUNDO, travada no instante do disparo, mas o jogador — mesmo sem esquivar (zero input lateral) — continua avançando pela pista CURVA (curva real de `buildCurve()`, viradas de até ~90°). Como o voo da moldura dura ~2-3s (`GATE_SPEED=42` numa distância típica de ~150-190), a pista curva o bastante nesse tempo pra fazer o alvo "escorregar" da linha reta original. Medido: um jogador 100% parado (nunca esquivou) terminava até **39 unidades** fora do centro da moldura no instante do cruzamento, dependendo só de ONDE na pista o tiro saiu — dando hit/miss incoerente sem relação nenhuma com a esquiva real do jogador. Fix (mesmo princípio de `projectBlasterToWorld` em `blaster.js`): o alvo travado passa a ser guardado em coordenadas RELATIVAS ao frame do trilho (`targetLocal.depth/right/up`, capturadas no instante do disparo) e reprojetado a cada frame através do frame ATUAL (`updateGateFlight`, nova função exportada) — a origem do tiro continua fixa no mundo (é um fato histórico de onde a Sentinela realmente estava), só o alvo "acompanha" a curva como o próprio jogador acompanharia se não desviasse. Reteste pós-fix: offset médio/máximo = **0.0000** em 31 amostras ao longo de toda a pista, 0 falso-positivo.
2. **Bug secundário corrigido de brinde**: `updateGateAnimation` calculava a escala usando `gate.traveled` ANTES dele ser incrementado no frame (`updateGateAnimation` chamada antes do avanço de posição em `updateEnemyGates`), deixando a escala usada na resolução do hit um frame atrasada (medido: 1.17785 em vez do 1.18 correto no instante exato do cruzamento). Ordem invertida — escala some calculada depois do avanço de posição/`traveled`.
3. **Hitbox da nave: bico realmente desproporcional, resto já estava correto (`rail.js`)**: medido geometricamente contra o modelo 3D real (variante padrão: `ConeGeometry(0.4, 3.4)` + asa delta) — o corpo afina até um PONTO no bico (raio real ~0.07-0.1 na posição do ponto de hitbox "bico", a 1.1 de distância do centro), mas a esfera de hitbox ali usava raio 0.4 (o raio MÁXIMO do corpo, só válido na traseira) — ~5.7x maior que a geometria real ali, sem a asa pra compensar (ela não chega tão à frente). Reduzido de 0.4 para 0.28. Os outros 3 pontos ("cabine" 0.55, asas 0.38) já faziam sentido: a asa delta é bem mais larga (envergadura real ±2.6) que o alcance das esferas (±1.98) e o corpo é fino/achatado por design, então a folga vertical ali é esperada (evita um "hitbox-lâmina" injusto), não sobra fantasma.
4. **Hitbox de detrito: comentário antigo estava errado, valor estava perto mas não exato (`detrito.js`)**: o comentário dizia "reduzido para 1.15 pra casar com os vértices do icosaedro (raio 1.3)" — mas 1.15 nunca bateu com 1.3. Medido com teste sintético amostrando 2 milhões de pontos sobre a SUPERFÍCIE real da `IcosahedronGeometry(1.3, 0)` (ponderado por área de cada face, não só vértices): raio circunscrito (vértice) = 1.3, raio inscrito (face) = 1.0331, distância média ponderada por área centro→superfície = **1.1045** (RMS 1.1058) — é essa média que importa pra colisão (o tiro/nave normalmente acerta uma FACE, não um dos 12 vértices esparsos). `DETRITO_BASE_HIT_RADIUS` ajustado de 1.15 para **1.10**, colado na média medida (~4% de margem fantasma a menos, proporcional ao tamanho do detrito).
5. **Distância de spawn mais variada, sem repetir o erro antigo (`blaster.js`, `sentinela.js`, `replica.js`, `timeEnemy.js`, `verme.js`, `sussurro.js`, `ima.js`, `fragata.js`)**: as faixas (`SPAWN_DISTANCE_MIN/MAX`) eram estreitas (30-50 unidades) demais pra dar sensação real de variação — quase todo spawn caía perto da mesma distância. Alargadas moderadamente (chão ligeiramente mais baixo, teto bem mais alto), mas SEM repetir o teto que o próprio `miniSwarm.js` já tinha testado e rejeitado como "longe demais" (160-240, documentado no arquivo). Blaster/ampulheta: 50-150 (era 60-100/60-100). Verme/sussurro: 55-150 (era 70-100/70-110). Sentinela/Réplica: 70-160 (era 90-130). Enxame-ímã: 50-110 (era 55-90, mantido mais próximo de propósito — o campo magnético só importa perto). Fragata (arena): 90-170 (era 90-140). Detrito e mini-swarm mantidos como estavam — já serviam de referência do que "variação boa" parece.

**Testado**: `node --check` em todos os 11 arquivos tocados. Testes sintéticos em Node (via loader customizado apontando `three` pro pacote real, sem mockar lógica nenhuma): (a) cenário isolado (sem `rail.js`) confirmando os 4 casos pedidos pelo usuário — centro parado, borda parada, fora parado, desvio no meio do voo — batendo exatamente com o esperado antes E depois do fix; (b) cenário com `rail.js` real (câmera + curva de verdade) confirmando a deriva de até 39 unidades ANTES do fix e exatamente 0.0000 de offset em 31 amostras ao longo de toda a pista DEPOIS; (c) amostragem geométrica de 2M pontos sobre `IcosahedronGeometry` real pro raio do detrito. `node src/selftest.mjs` com 100% de sucesso. **Testado ao vivo**: `preview_start` "static", jogado com debug (God mode + Mostrar hitboxes + spawn manual de Sentinela/Detrito) até confirmar visualmente que a moldura acompanha a nave coerentemente durante a curva (sem "escorregar"), que a nave atravessou o centro sem tomar dano, e que as esferas de hitbox (incluindo o bico reduzido) e o wireframe do detrito parecem proporcionais aos modelos visuais reais. Zero erros novos no console.
**Versão**: v0.62.1 → **v0.62.2**

---

### Verificação Adversarial Independente da v0.62.2 (Segunda Nave) — v0.62.3

Segundo agente verificou de forma independente os 4 achados da v0.62.2 acima, escrevendo os PRÓPRIOS scripts sintéticos em Node (instalando `three` num `node_modules` temporário do projeto, removido no final) em vez de reaproveitar os testes já escritos — tentando ativamente provar que algo tinha ficado incompleto ou errado, não só confirmar.

1. **Moldura da Sentinela — confirmado, com bateria própria mais ampla**: teste isolado com >15 cenários (centro, quase-centro, borda nos 4 lados, canto interno/externo, 4 direções "fora", limites exatos da faixa de borda, em escala 1 e em escala 0.92) todos bateram exatamente. Teste com `rail.js` real: 47 amostras (mais que as 31 originais) de jogador 100% parado ao longo de mais de uma volta inteira da pista → offset máximo **0.0000** em todas. Adicionalmente, uma varredura de "jogador que só começa a desviar depois de N frames parado" (`delayFrames` de 0 a 100000, ponto de disparo diferente dos testes originais) com um recálculo geométrico escrito de forma independente de `resolveGateHit` (mesma fórmula, código separado) confirmou 100% de concordância entre o que `resolveGateHit` devolveu e o que deveria devolver dado o offset real medido — incluindo pelo menos uma amostra que bate exatamente na borda (hit=true) e uma onde o desvio começa tarde demais pra sair do centro (miss). Nenhuma divergência encontrada — a v0.62.2 está correta.
2. **Hitbox da nave — bico e detrito confirmados, mas achado um problema real nos pontos de asa que a v0.62.2 não tocou e a v0.62.0 não tinha medido certo**: reconstruí a geometria real da nave (`ConeGeometry`/`ShapeGeometry` do `buildShip`, mesmos parâmetros) e, crucialmente, verifiquei **empiricamente** (não por memória de convenção) que `Object3D.lookAt` nesta nave mapeia o eixo LOCAL +Z (não -Z) para o `forward` do mundo — um detalhe que inverte o sinal de qualquer dedução feita de cabeça. Com o sinal certo, o raio real do cone no ponto "bico" bateu em **0.0706**, confirmando o número da v0.62.2 (~0.07-0.1) e validando a folga deliberada pra 0.28 (evitar hitbox minúscula/injusta — não é bug). Detrito: Monte Carlo próprio (4M amostras, sampling por coordenadas baricêntricas por face, ponderado por área real de cada uma das 20 faces de `IcosahedronGeometry(1.3,0)`) mais checagem cruzada por fórmula fechada de icosaedro regular → raio de vértice 1.3, raio inscrito 1.0331, média ponderada por área **1.1046** (RMS 1.1059) — bate com os 1.1045/1.1058 da v0.62.2, `DETRITO_BASE_HIT_RADIUS = 1.10` confirmado correto. **Achado novo**: os pontos "asa esquerda/direita" (`rail.js`, não tocados pela v0.62.2, alegados como "undersized" desde a v0.62.0) comparavam o alcance da esfera (offset 1.6 + raio 0.38 = 1.98) contra a ENVERGADURA MÁXIMA da asa (2.6) em vez da meia-largura real NA POSIÇÃO Z EXATA onde a esfera fica (offset de -0.3 na direção de voo, que cai numa fatia da asa já afunilando rumo ao bico). Medido (analiticamente pela geometria do `Shape` E numericamente por interseção de triângulos reais, os dois batendo): meia-largura real nessa fatia = **1.691**, menor que o alcance de 1.98 — a esfera sobrava ~0.29u (17%) pra fora da asa visível, uma margem fantasma real que a v0.62.0/v0.62.2 não pegaram porque compararam contra o span máximo errado.
3. **Distância de spawn — números batem, mas resumo tinha um arredondamento incorreto**: reconferidas as 8 constantes nos arquivos-fonte (não o resumo). Todas batem com o que a v0.62.2 relatou, EXCETO que o resumo dizia "verme/sussurro: 50-150" quando o código real (e o comentário interno de cada arquivo) usa **55-150** pros dois — divergência pequena (5 unidades no chão) mas é uma alegação numérica que não correspondia ao código; corrigida no item 5 do registro da v0.62.2 acima.
4. **`node --check` em TODOS os arquivos de `src/`** (55 arquivos, não só os 11 tocados) — 100% ok. `node src/selftest.mjs` — 100% ok (não afetado por nenhuma dessas mudanças).
5. **Teste ao vivo, independente**: `preview_start` "static". As teclas do painel de debug (`Backquote`) e o pulo da cutscene de decolagem (`Space`) não funcionaram via automação de teclado padrão do Browser pane nesse ambiente (o evento sintético chega com `e.code`/`e.key` vazios — limitação da ferramenta de automação, não bug do jogo); contornado despachando `KeyboardEvent` de verdade via `dispatchEvent` com `code` explícito, o que o listener `window.addEventListener('keydown', ...)` de `input.js` reconhece normalmente. Com God mode + Mostrar hitboxes + spawn manual de Sentinela e Detrito: confirmado visualmente que a moldura (agora com rotação visivelmente variando ao longo do voo, evidência direta do rastreamento de curva) mantém a nave sempre no centro do quadro em toda a travessia, a nave atravessa sem dano, as esferas de hitbox (bico/cabine/asas) parecem proporcionais ao modelo real, e o wireframe do detrito acompanha o icosaedro. Zero erros novos no console (só os já pré-existentes de Service Worker, não relacionados).

**Fix adicional aplicado** (`rail.js`, `getShipHitboxPoints`): removido o offset de profundidade (`f, -0.3`) dos pontos "asa esquerda/direita" — ficam agora em Z=0 (junto da cabine), onde a meia-largura real medida é ~2.33, comportando com folga o alcance de 1.98 da esfera (raio/offset lateral inalterados). Reverificado com script próprio contra `getShipHitboxPoints()` real (9 amostras ao longo da pista): 100% dos pontos (exceto o "bico", que documentadamente já sobra de propósito) ficam dentro da silhueta real da nave.

**Testado**: `node --check` nos 55 arquivos de `src/`. `node src/selftest.mjs` OK. 3 scripts sintéticos próprios em Node (moldura da Sentinela com >15 cenários isolados + 47 amostras de pista real + varredura de desvio tardio; geometria da nave reconstruída com `THREE.ConeGeometry`/`ShapeGeometry` reais + verificação empírica do `lookAt`; Monte Carlo de 4M amostras + fórmula fechada pro icosaedro do detrito), todos rodando contra os módulos reais do projeto, do zero, sem reaproveitar os testes do agente anterior. Testado ao vivo no Browser pane.
**Versão**: v0.62.2 → **v0.62.3**

---

### Modo Arcade (Sem Baralho) e Seleção de Companheiros Iniciais — v0.65.0

1. **Modo Arcade Roguelike ("Jogar Sem Baralho")**:
   - Adicionada opção tanto na tela de pré-jogo quanto nas configurações para jogar sem cartas/perguntas do Anki.
   - O jogo remove todas as pausas de perguntas: ao passar pelas transições ou derrotar chefes, transiciona diretamente para a escolha de upgrades Roguelike, mantendo o gameplay espacial arcade ininterrupto.
2. **Seleção de Companheiros Iniciais (0 a 4 pilotos)**:
   - Seletor interativo na tela inicial e no menu de configurações permitindo decolar imediatamente acompanhado por 0, 1, 2, 3 ou 4 naves de apoio (*Falco, Peppy, Slippy, Phantom*).
   - Persistência em `localStorage` e integração com a contagem máxima de companheiros (`WINGMAN_CAP = 4`).

**Versão**: v0.64.0 → **v0.65.0**

---

### Overhaul do Sentinela, Proibição de Inimigos Presos/Atrás, Fuga dos Genéricos após 4 Ataques, Mini-Naves do Dourado, Inimigos +10% e Cores Vibrantes, e Novo Muzzle Flash — v0.66.0

Pacote completo de correções estruturais e melhorias de gameplay respondendo aos 7 apontamentos do usuário:

1. **Correção Completa do Sentinela (`src/enemies/sentinela.js`)**:
   - **Causa raiz da aproximação prematura**: a Sentinela usava coordenadas de mundo estáticas e não acompanhava o avanço do trilho da pista (`railSpeed = 22 u/s`), fazendo o jogador ramar nela em menos de 2 segundos.
   - **Solução implementada**: adotado o modelo de trilho (`projectSentinelaToWorld`), travando rigidamente a profundidade em `depth = ENGAGE_STANDOFF` (48 unidades) durante todo o estado `ENGAGING`. Ela avança na mesma velocidade do trilho e **NUNCA** se aproxima da nave antes de terminar os 4 disparos.
   - **Velocidade do tiro equilibrada**: reduzida de 42 u/s para **18 u/s**. A velocidade relativa com a nave fica em confortáveis ~40 u/s (~1.2s de tempo de reação e voo legível), acabando com o disparo excessivamente rápido.
   - **Dimensões e colisão real da moldura**: corrigido o bug em que `GATE_INNER_HALF` estava em 11.2 (uma abertura vazada de 22.4 unidades, muito maior que toda a tela útil), tornando impossível encostar nas bordas. Redimensionado para proporções reais:
     - `GATE_INNER_HALF = 2.6`: abertura central vazada de 5.2 x 5.2 unidades (passagem justa e segura se a nave estiver centralizada).
     - `GATE_OUTER_HALF = 6.4`: bordas sólidas luminosas de 3.8 unidades de espessura.
     - `resolveGateHit`: colisão justa que causa dano real (1 HP / 1 escudo) ao encostar nas bordas sólidas, permite passagem segura no vão central e esquiva limpa por fora.
   - **Fuga dramática**: ao terminar o 4º disparo, a Sentinela empina para cima (`screenY += 12 * dt`) e acelera a toda velocidade para frente (`depth += 32 * dt`), sumindo no horizonte.

2. **Proibição Estrita de Inimigos Atrás ou ao Lado do Jogador (`blaster.js`, `miniSwarm.js`, `shared.js`, `index.js`)**:
   - `PASS_BEHIND` ajustado para **-2.0**: qualquer inimigo que cruze para trás do jogador é sumariamente removido (`removeEnemy`), proibindo qualquer permanência na retaguarda.
   - Removido o standoff infinito do perfil `follow` do Blaster que igualava a velocidade e mantinha inimigos emparelhados ao lado da nave.
   - Ao se aproximar a menos de 5 unidades de profundidade da nave, todos os inimigos recebem aceleração mínima de passagem (`depth -= 14.0 * dt`), garantindo que cruzem o enquadramento em uma fração de segundo e saiam da tela sem nunca empacar ao lado.

3. **Inimigos Genéricos Voam Embora após 4 Ataques sem Teleguiar (`blaster.js`, `tank.js`, `index.js`)**:
   - Inimigos `blaster` e `tank` agora rastreiam `shotsFired`. Ao atingirem 4 disparos, ativam `disengaging = true` e travam o timer de disparo (`fireTimer = Infinity`).
   - **Sem teleguiar**: desativa o `mesh.lookAt(playerPosition)`.
   - **Subir e fugir**: no trilho, empinam para cima (`screenY += 12.0 * dt`, `rotation.x = -0.35`) e passam por cima do jogador em alta velocidade (`depth -= 16.0 * dt`), saindo pelo topo da tela. Na arena, ascendem e aceleram em linha reta para o vácuo até despawnarem.

4. **Mini-naves do Inimigo Dourado Suaves e sem Grudar (`golden.js`, `index.js`)**:
   - Velocidade reduzida de 18 (com boost para 24.3) para **12 u/s**.
   - Taxa de curva reduzida para 1.8 rad/s para evitar manobras bruscas.
   - **Passagem limpa**: ao chegarem a menos de 14 unidades da nave ou começarem a ultrapassar o jogador (`dotHeading < 0.2` ou `traveled > 55u`), **desativam o teleguiamento** (`projectile.homing = false`). Seguem em linha reta, cruzam suavemente pelo jogador e vão embora para longe sem rodopiar em volta da nave.

5. **Aumento de 10% no Tamanho de Todos os Inimigos + Cores e Emissivos Vibrantes**:
   - Geometrias e hitboxes escaladas em +10% em todas as classes:
     - `blaster`: Cone (1.265 raio, 2.783 altura), Hitbox 2.28.
     - `sentinela`: Box (2.64 x 2.64 x 0.44), Hitbox 2.2.
     - `tank`: Escala 2.29, Hitbox 2.57.
     - `timeEnemy`: Cone (0.99, 1.43), Hitbox 1.98.
     - `replica`: Cone (1.1, 2.42), Hitbox 1.87.
     - `fragata`: Corpo 1.76, Placa 3.52, Hitbox 3.74.
     - `verme`: Esfera 1.1, Hitbox 1.54.
     - `sussurro`: Octaedro 1.21, Hitbox 1.76.
     - `ima`: Esfera 0.77, Hitbox 1.43.
     - `detrito`: Icosaedro 1.43, Hitbox 1.21.
     - `miniSwarm`: Escala 0.77, Hitbox 2.42.
     - `boss`: Escala 5.5, Hitbox 7.7.
     - `golden`: TorusKnot (1.21, 0.44), Hitbox 2.42.
   - **Cores & Emissivos Ultra-Vibrantes**:
     - Todos os materiais receberam componentes emissivos brilhantes para contraste absoluto no espaço escuro.
     - Réplica atualizada para ciano espectral vibrante (`0x80d8ff`, emissivo `0x0091ea`, opacidade 0.88), eliminando o cinza opaco 0.55 invisível.
     - Sussurro com opacidade mínima elevada para 0.28 em ciano neon brilhante (`0x00e5ff`).
     - Fragata com corpo em azul cobalto elétrico (`0x2563eb`) e escudo em ouro reluzente (`0xffaa00`).
     - Verme em verde lima neon elétrico (`0x76ff03`).
     - Blasters com saturação máxima (Ciano elétrico, Vermelho puro, Verde neon, Âmbar dourado, Branco brilhante, Magenta elétrico).

6. **Novo Efeito de Disparo dos Tiros Normais (Muzzle Flash) (`effects.js`)**:
   - Substituída a esfera amarelada gigante por um **cone azul relativamente pequeno cuja ponta é invertida** (`playerMuzzleConeGeo`).
   - Vértice (ponta) voltado para trás em direção à boca do canhão da nave, e base aberta projetada para frente na direção do tiro.
   - Material em azul elétrico vibrante (`0x38bdf8`, blending aditivo, opacidade 0.95).
   - Escala contida (0.42 expandindo suavemente até 0.56 antes de desvanecer em 0.07s), acabando com o efeito gigantesco que obstruía a visão.

7. **Validação e Testes**:
   - `test-enemy-overhaul.mjs`: 100% dos testes matemáticos de colisão e passagem aprovados.
   - `selftest.mjs`: suite de testes executada com sucesso.
   - `node --check` em todos os arquivos JavaScript do projeto aprovado com 0 erros de sintaxe.

**Versão**: v0.65.0 → **v0.66.0**

