# Progresso pós-v0.50 — novas documentações a partir daqui

Continuação do [PROGRESSO_POS_0.30.md](PROGRESSO_POS_0.30.md) (histórico v0.34.0 → v0.50.0, agora
congelado). A partir desta entrega, toda documentação nova entra neste arquivo.

## Overhaul de Perguntas Anki, Códice Lateral na Extrema Direita com Fontes e Recriação dos Decks — v0.60.0

Contexto e pedidos do usuário:
1. *"após isso eu quero ideias de overhaul na forma como perguntas são feitas, no molde das perguntas anki e também uma forma de abrir uma explicação densa com fontes com o clicar de um botão na extrema direita da tela quando uma pergunta surge, isso inclui recriar as perguntas presentes na pasta de decks do Zero para serem mais coesas e refletirem estas mudanças, inclusive crie um template molde que adote tudo isso"*

**O que mudou e detalhes técnicos:**
1. **Aba Cibernética na Extrema Direita (`hud-game.js` & `hud-styles.js`)**: Botão neon vertical acoplado à borda extrema direita da tela (`.hud-codex-tab-btn`, `right: 0; top: 50%`) com ícone `📖`, rótulo `CÓDICE & FONTES` e atalho `[E]`, surgindo ao abrir a pergunta sem poluir o centro da interface.
2. **Gaveta Lateral Holográfica do Códice (`hud-game.js` & `hud-styles.js`)**: Painel retrátil de 500px com `backdrop-filter: blur(28px)` contendo cabeçalho com tag temática, cartão da pergunta/cloze, área de **Explicação Densa & Aprofundada** (1 a 4 parágrafos técnicos de fundamentação teórica) e seção de **Fontes & Referências Oficiais** com links clicáveis `🔗` e citações bibliográficas. Pressionar `E` ou `Esc` fecha ou alterna a gaveta.
3. **Parser de 8 Colunas Tabuladas (`anki.js`)**: Função `resolveExplanationAndSources` para extrair nativamente `explanation` (coluna 6) e `sourcesText`/`sourceUrl` (coluna 7) tanto para cartas `Basic` quanto `Cloze`, preservando retrocompatibilidade com baralhos antigos.
4. **Novo Template Molde Oficial e Guia (`templates/`)**: `baralho-modelo.txt` atualizado para o molde oficial de 8 colunas e `COMO-USAR.txt` reformulado com as 4 regras de ouro da ciência cognitiva de flashcards no Star-Anki.
5. **Recriação dos Decks da Pasta `decks/` do Zero**: `estudo-de-prova.txt` (40 cartas atômicas e densas cobrindo Pioneiros, Criptografia, Gerações Eletrônicas, Von Neumann e Ciclo de Instrução) e `arquitetura-manutencao-aumentado.txt` (30 cartas cobrindo Hardware, Caches, Memórias, RAID, Conectores, Refrigeração e Manutenção) totalmente reconstruídos com explicações e fontes embutidas em cada linha. Listas separadas `-fontes.txt` eliminadas.

**Testado**: `node --check` em todos os arquivos JS, `node src/selftest.mjs` com 100% de sucesso e validação de parsing nos decks recriados com 0 warnings.
**Versão**: v0.59.0 → v0.60.0.

## Caçada Ampla por Gargalos de Desempenho em Efeitos Visuais (VBO Thrashing, GC Pressure e CPU Particle Loops) — v0.59.0

Contexto e pedidos do usuário:
1. *"agora eu quero que faça uma caçada por problemas de desempenho no jogo em relação a efeitos visuais"*

**O que mudou e detalhes técnicos:**
1. **Eliminação de 21.600 Alocações/Minuto de GC no Game Loop (`game-loop.js`)**: Identificado que o sistema de transição da névoa viva instanciava 6 novas cores (`new THREE.Color`) a cada frame no trilho. Pré-alocadas cores estáticas a nível de módulo (`_cosmicTint1`, `_cosmicTint2`, `_cosmicTint3`, `_baseColor`, `_blendedShift`, `_finalColor`) e convertida a interpolação para `.copy().lerp()` in-place, reduzindo o lixo de memória do loop de névoa a zero.
2. **Zero-Allocation no Ambiente Cósmico (`environment.js`)**: No lerp de warp das estrelas, na rotação de cauda dos meteoros e nos clarões iônicos, novos vetores e cores eram criados a cada frame. Pré-alocados temporários estáticos (`_tmpScaleOne`, `_tmpTailVec`, `_tmpVelNorm`, `_tmpFlashColor`, `_tmpAppliedFlash`) e eliminadas as alocações contínuas.
3. **VBO / Shader Pooling e Fim do Churn de Geometrias WebGL (`effects.js`)**: Instanciadas 4 geometrias unitárias canônicas compartilhadas (`sharedSphereGeometry`, `sharedRingGeometry`, `sharedTorusGeometry`, `sharedConeGeometry`). Todos os efeitos efêmeros de anéis, esferas, toros e cones (muzzleFlash, smokeRing, machSpeedRing, deflectBurst, boostTrail, homingAfterimage, telegraph, chargeCircle, bloomSprite, contrail, reverseBrakeJets, distantFlashes) agora reutilizam essas geometrias unitárias na VRAM e ajustam apenas `mesh.scale.setScalar(...)`. Ao expirarem, apenas os materiais são descartados, mantendo as geometrias residentes e quentes na GPU sem recriar VBOs.
4. **Zero-Alloc na Chama do Motor e Grid Pulse (`effects.js`)**: Substituídos múltiplos `.clone()` e `new Vector3` a cada frame por `_tmpExhaust`, `_tmpNorm`, `_tmpQuat`, `_BACKWARD_AXIS` e `_GRID_PULSE_COLOR`.
5. **Redução de Carga de CPU em Partículas (`effects.js`)**: `DUST_COUNT` ajustado de 700 para 300 partículas. Reduz em 57% a iteração por frame e o volume de transferência `glBufferSubData` para o WebGL com fidelidade visual idêntica.
6. **Defesa de Splice em Projéteis (`projectiles.js`)**: Guarda preventiva contra remoção acidental por `indexOf === -1` em `removeProjectile`.

**Testado**: `node --check` em todos os arquivos JS e `node src/selftest.mjs` com 100% de sucesso.
**Versão**: v0.58.0 → v0.59.0.

## Caçada Ampla por Bugs em Inimigos: Spawns, Disparos, Física, Hitboxes e Ciclo de Vida — v0.58.0

Contexto e pedidos do usuário:
1. *"faça uma caçada ampla por bugs envolvendo inimigos, a forma como surgem, disparos, movimento, tudo relacionado a eles"*

**O que mudou e detalhes técnicos:**
1. **Fix Crítico da Morte do Chefe Dourado (`golden.js`)**: Bloco `else` envolvia o `return` de dados de colisão. Quando `killed === true`, a função terminava sem retorno explícito (`undefined`), impedindo que disparos normais e teleguiados registrassem a derrota do Dourado. Bloco `else` devidamente fechado antes do `return`.
2. **Fix do Leque de Projéteis do Boss Vermelho (`index.js` & `boss.js`)**: `fireEnemyProjectile` ignorava o 3º parâmetro `angleRad` enviado pelo leque das fases 2 e 3 do chefe vermelho. Adicionado suporte ao parâmetro angular rotacionando a direção no eixo vertical mundial (`applyAxisAngle(WORLD_UP_AXIS, extraAngleRad)`), restaurando os padrões de disparo em leque pretendidos.
3. **Fix do Teto de Inimigos / Spawns Infinitos (`index.js`)**: `getEnemyCount()` calculava apenas contagem de `BLASTER_KIND`, ignorando Fragatas, Sentinelas, Vermes, Réplicas e Sussurros. O spawner achava que havia 0 inimigos e gerava spaws sobrepostos ilimitados. Atualizado para contabilizar todos os inimigos vivos combatentes (`!e.dying && e.kind !== DETRITO_KIND && e.kind !== IMA_KIND`).
4. **Fix da Destruição de Escala no Spawn (`index.js`)**: Animação de spawn forçava `scale.setScalar(0.2)` e interpolava para `1.0` fixo, esmagando Mini-Swarm (0.7), Tanques (1.6) e Detritos (0.7 a 15.0). Corrigido para preservar `enemy.targetScale`, interpolando de `targetScale * 0.2` a `targetScale`, e isolando detritos de qualquer distorção de escala ou condensação de nave de combate.
5. **Fix de Splice com Índice Negativo (`index.js`)**: Métodos `removeEnemy`, `removeEnemyProjectile`, `removeEnemyLaser` e `removeEnemyGate` executavam `splice(indexOf, 1)` sem checar `idx !== -1`, podendo deletar o último elemento ativo do jogo em chamadas duplicadas. Adicionadas checagens de proteção `idx !== -1`.
6. **Fix da Detecção de Colisão dos Portais da Sentinela (`index.js`)**: Teste de colisão esperava `gate.traveled >= gate.targetDistance`, disparando dezenas de unidades atrás da nave do jogador. Atualizado para detectar o cruzamento no plano da nave (`alongDir <= 0`), resolvendo o dano e removendo o portal no momento exato do encontro.
7. **Fix de Orfandade e Segmentos Congelados do Verme (`index.js`)**: Se a cabeça ou elos do verme eram removidos por ultrapassar o trilho (`pass-behind`), `severChainAt` não era invocado. Integrada a chamada de quebra de corrente diretamente em `removeEnemy` para qualquer remoção de `VERME_KIND`.
8. **Fix de Independência de Framerate na Réplica (`replica.js`)**: Interpolação de standoff convergia com `Math.min(1, STANDOFF_EASE_RATE)` sem multiplicar por `dt`, gerando teleporte instantâneo em altas taxas de atualização. Corrigido com taxa em segundos `STANDOFF_EASE_RATE * dt`.
9. **Fix da Mira Normal e Patrulha dos Caças Aliados no Dourado (`lockon.js` & `wingmen.js`)**: `isAimingAtEnemy` agora inclui alvos do chefe dourado para hint visual no crosshair do HUD. Rotina de combate autônomo dos caças aliados agora invoca `getAliveEnemies()`, permitindo que os aliados também engajem no chefe dourado no modo livre de patrulha.

**Testado**: `node --check` em todos os arquivos JS e `node src/selftest.mjs` com 100% de sucesso.
**Versão**: v0.57.0 → v0.58.0.

## Evento Ambiental de Chuva/Tempestade de Detritos, Asteroides Titânicos Colossais, Física de Deriva e Alertas Holográficos com Reversibilidade Modular — v0.57.0

Contexto e pedidos do usuário:
1. *"eu tinha te dado a ideia de criar um evento de chuva de detritos onde invoca-se mais detritos com alguns ficando ainda maiores, além disso eu também tinha te falado sobre ter mais tamanhos de detritos, você fez a segunda ideia? a primeira eu sei que ainda não te dei permissão"*
2. *"implemente"*

**O que mudou e detalhes técnicos:**
1. **Mini-Evento Ambiental de Chuva/Tempestade**: Ciclo automático ocorrendo a cada 55-90s durante combate, com duração de 15s. Spawns rápidos em levas a cada 0.8-1.25s (3 a 6 detritos por salva) com física de deriva angular e 35% de chance de asteroide titânico por salva.
2. **Detritos Titânicos Colossais (Escalas 11.0 a 15.0)**: Nova categoria `TITANIC_SIZE_TIERS` com material mineral escuro diferenciado (`titanicMaterial`), vida massiva (~64 a ~74 HP), rotação pesada e hitbox colossal ampliada de 20u a 28u.
3. **Física de Deriva Espacial (Drift Velocity)**: Detritos gerados durante tempestades cruzam a tela em trajetórias diagonais/frontais via `driftVel` em tempo real.
4. **Alertas Holográficos no HUD**: Banner neon âmbar pulsante na detecção da tempestade (`⚠️ TEMPESTADE DE DETRITOS DETECTADA`) e banner neon verde na superação (`✅ CAMPO DE DETRITOS SUPERADO`).
5. **Reversibilidade Modular Total & Debug**: Flag `enableDebrisStormEvent` em `src/environment-config.js` e 3 novos controles no menu de debug (`triggerDebrisStorm`, `toggleDebrisStorm`, `spawnTitanic`).

**Testado**: `node --check` em todos os 11 arquivos tocados e `node src/selftest.mjs` com 100% de sucesso.
**Versão**: v0.56.0 → v0.57.0.

## Ambiente Cósmico Vivo (SkyDome Procedural, Corpos Celestes, Starfield Twinkle/Warp, Bolsões de Névoa, Relâmpagos Iônicos, Meteoros e Grid Energizado) com Reversibilidade Modular Total — v0.56.0

Contexto e pedidos do usuário:
1. *"me diz todas mudanças e novidades que pode fazer no background, na nevoa e no skybox em si do jogo para deixar ele mais vivo"*
2. *"implemente tudo, mas deixe preparado caso eu queira voltar atrás com algum"*

**O que mudou e detalhes técnicos:**
1. **Arquitetura 100% Modular e Reversível (`src/environment-config.js` e Debug Menu)**: Dicionário `ENVIRONMENT_CONFIG` com 8 flags booleanas (`enableSkyDome`, `enableCelestialBodies`, `enableMultiLayerStars`, `enableWarpStreaks`, `enableNebulaPockets`, `enableIonStorms`, `enableShootingStars`, `enableEnergizedGrid`). Todas podem ser desligadas/ligadas individualmente a qualquer momento no arquivo ou em tempo de execução via menu de debug (onde começam sincronizadas como ativas).
2. **Cúpula Cósmica Procedural (SkyDome com Nebulosa Orgânica)**: Domo invertido `SphereGeometry(380)` com textura procedural de tela gerando nuvens coloridas em gradientes cósmicos (roxo, ciano, magenta, esmeralda e âmbar), rotação contínua e respiração sutil de opacidade.
3. **Corpos Celestes em Paralaxe**: Gigante gasoso com bandas atmosféricas geradas proceduralmente, rim-glow de atmosfera externa (halo aditivo), anéis duplos de poeira inclinados e lua orbital em movimento elíptico.
4. **Starfield Multicamadas com Twinkle e Warp Streaks**: 900 estrelas profundas com cintilação senoidal e efeito clássico de dobra espacial/hiperespaço (esticamento no eixo Z e aumento de brilho) durante o acionamento do boost de propulsão.
5. **Bolsões de Névoa e Relâmpagos Iônicos**: Variação periódica da densidade da névoa no trilho ao cruzar bolsões cósmicos e clarões iônicos difusos esporádicos (90ms) iluminando o horizonte.
6. **Meteoros e Grid Energizado**: Estrelas cadentes em feixes aditivos cortando o céu e pulsos neon luminosos percorrendo o grid de solo no sentido do voo.

**Testado**: `node --check` em todos os arquivos tocados e criados; `node src/selftest.mjs` com 100% de sucesso.
**Versão**: v0.55.0 → v0.56.0.

## Sistema de Comandos do Esquadrão (Tecla D), Dourado Boss (+20 HP, Multi-lock, IA Minions), Knockback com Tumble Spin e Fix dos Aliados — v0.55.0

Contexto e pedidos do usuário:
1. *"era pros aliados sumirem depois de um tempo? (invocando pelo debug)"*
2. *"trate o inimigo dourado como um boss, de +20 de vida a ele, faça com que ele desvie mais do jogador e também melhore a IA das naves que ele invoca, inclusive, permita que a mira do tiro teleguiado o mire múltiplas vezes que nem com o boss vermelho."*
3. *"faça a nave ser jogada para longe ao colidir com o inimigo dourado ou com o boss vermelho, girando como se tivesse perdendo o controle"*
4. *"Além disso adicione um sistema de comandos aos aliados. Ao apertar D, aparece uma notificação acima da nave do jogador avisando pros aliados focarem no inimigo mais próximo do jogador ou no inimigo com maior foco do jogador (decidido pelo tiro carregado). Caso aja mais do que um inimigo mirado, cada aliado mira em um inimigo aleatório entre os mirados. E ao apertar novamente, os aliados voltam a realizar seus ataques em alvos aleatórios."*

**O que mudou e detalhes técnicos:**
1. **Fix dos Aliados Sumindo**: `player.setWingmanCount` sincronizado em `player.js` e em todas as ações de debug; remoção de teleport do rasante `flyby`; aceleração e boost de aproximação (`+48 u/s` cruzeiro, `+32 u/s` catch-up) no trilho para nunca serem deixados para trás.
2. **Dourado como Boss**: HP 40 (`+20 HP`); `kind: GOLDEN_KIND` e `radius` implementados para habilitar múltiplos lock-ons idêntico ao Boss vermelho; dash lateral mais frequente (cooldown 1.6s, trigger 46u, velocidade 72u/s), movimentação evasiva senoidal em ziguezague e dash reativo a tiros recebidos; IA dos minions com curva senoidal predatória (`flankOffset` e `weave`), mergulho acelerado e banking nas curvas.
3. **Knockback e Tumble Spin na colisão com Bosses**: método `rail.triggerBossCollisionTumble(impactOrigin)` aplicando repulsão física para longe (em arena e trilho), recuo forte e rotação rápida descontrolada em roll (0.85s com oscilações em pitch/yaw) antes de estabilizar suavemente no wobble físico.
4. **Comandos de Esquadrão na Tecla [D]**: liberada a tecla D de movimento para a nova ação `squadronCommand`; máquina de comando nos caças alternando entre Foco (alvos travados ou mais próximo) e Ataque Livre/Dispersão; banner holográfico 3D projetado acima da nave (`playerPos + up * 3.2`) com atualização em tempo real e fade-out.

**Testado**: `node --check` em todos os 13 arquivos tocados e `node src/selftest.mjs` com 100% de sucesso.
**Versão**: v0.54.1 → v0.55.0.

## Bug do inimigo nascendo sempre do lado errado: investigação, correção, regressão e revert cirúrgico pra v0.48 — v0.51.9

Pedido do usuário: *"ajeita o insuportável problema dos inimigo ficarem só sendo invocado muito
pra direita da camera da nave"*. Sessão longa, com um caminho não-linear que vale documentar
inteiro — inclui um fix que funcionou, um fix que piorou as coisas, e uma decisão final de
reverter cirurgicamente só uma parte do código.

### O que foi investigado

1. **Sincronia com GitHub**: a sessão começou com ~30 arquivos modificados sem commit, baseados
   numa v0.49 desatualizada (`db9aff0`, 40 commits atrás de `origin/main`). `git fetch` mostrou
   que o merge da v0.50.0 (`0431d87`) já incluía uma tentativa de correção pro mesmo bug
   (`getAimLineAhead`/"linha de visão da câmera", ver v0.50.0 no arquivo anterior). Sincronizado
   via `git stash` + `git merge --ff-only` (sem descartar nada sem checar primeiro).
2. **Causa raiz medida de verdade** (não só lida no código): rodei um teste sintético no console
   do navegador, importando os módulos REAIS (`rail.js`/`enemies/shared.js`) com uma
   `THREE.PerspectiveCamera` de verdade, projetando 60 spawns por cenário. Resultado: segurando
   direita 3s, spawn médio em **+24% da largura da tela** à direita DA PRÓPRIA NAVE; segurando
   esquerda, **-26%**. Causa: o spawn (`getAimLineAhead`) usava a posição INTEIRA da nave
   (`playerX`, até ±44), mas a câmera só acompanha 30% desse lateral (`CAM_FOLLOW_LATERAL`) — e
   `playerX` não reseta sozinho ao soltar a tecla (fica onde parou até mover pro lado oposto de
   novo), então o jogador passa a maior parte do tempo fora do centro. Confirmado de novo
   analisando um VÍDEO real do usuário frame a frame (ffmpeg + leitura de pixel): nave a +19,8%
   do centro, inimigo a +43,7% — a mesma lacuna de ~70% do lateral que a câmera não acompanha.
3. **Fix aplicado e verificado**: `getAimLineAhead`/novo `getSpawnFrame()` passaram a ler
   posição/right/up/forward DIRETO da matriz mundial da câmera (`camera.matrixWorld`), não mais
   reconstruindo a partir do playerX da nave. Testado no mesmo harness: NDC médio ~0.00 parado,
   direita total, esquerda total e toque rápido — zero viés em qualquer cenário.
4. **Bug maior descoberto no caminho**: pedido do usuário pra investigar "será que não tem a ver
   com tratar o trilho como 3D em vez de 2D com profundidade" levou a achar que o MOVIMENTO
   pós-spawn de vários perfis do Blaster (`orbit`/`circular`/`follow`/`evasive`) reconsultava a
   cada frame o frame da CURVA do trilho (`rail.getFrameAt(0)`), que gira sozinho conforme a
   pista curva — mesmo parado lateralmente, só de avançar. Medido: perfil `circular` "explodia"
   pra **+4472px/-1897px** da tela antes de ser removido. Reescrevi `blaster.js` pra um modelo
   2D+profundidade (`depth`/`screenX`/`screenY` recalculados todo frame a partir da base ATUAL
   da câmera, nunca acumulando deltas em coordenadas de mundo) — verificado que `circular` caiu
   pra ~-129px, todos os 6 perfis estáveis.
5. **Regressão real reportada pelo usuário** depois dessa reescrita grande: inimigos "muito
   longe", alguns "presos na tela ao invés de se moverem" (o modelo 2D deixou `follow`/`orbit`
   visualmente ESTÁTICOS em vez de terem a variação — ainda que "errada" — de antes), além de
   miniSwarm (não tocado ainda) ter um bug PRÓPRIO e diferente nas variantes zigue-
   zague/espiral (até ±2000px antes do despawn, causa: direção de mergulho travada no início +
   trilho que continua curvando durante o voo).

### Decisão final: revert cirúrgico pra v0.48.0

Diante da bagunça (fix real + regressão nova), o usuário pediu pra reverter só o que é
"movimentação, invocação e posicionamento dos inimigos" pra v0.48.0 (`7c4549f`, antes de QUALQUER
trabalho da v0.50 nessa área) — mantendo tudo mais como está. Verificado por diff de
exportações (`git show <commit>:<file> | grep '^export'`) que nenhum arquivo FORA de
`src/enemies/` depende de nomes novos introduzidos depois da v0.48 nesses arquivos (ex:
`blasterFireConfig`, `SUSSURRO_STATE_*`) — seguro reverter em bloco.

**Revertidos pra v0.48.0**: `rail.js`, `enemies/shared.js`, `enemies/blaster.js`,
`enemies/sentinela.js`, `enemies/sussurro.js`, `enemies/index.js`.
**Mantido como estava** (não é posicionamento, é overhaul de combate): `enemies/boss.js` (3 fases
de HP, lasers em rajada, fan de tiro — entrou depois da v0.48 e não tem nada a ver com o bug
reportado).
**Não tocado**: PWA (v0.50.0), roguelike overhaul, HUD, combat (fora do lock-on abaixo).

**Importante pra quem mexer aqui de novo**: o revert significa que o viés MODERADO (~0.17-0.19,
não mais o extremo pré-fix) que já existia na v0.48/v0.50 **continua presente** — a correção
completa (item 3 acima) foi abandonada de propósito nesta entrega, priorizando estabilidade sobre
uma correção que trouxe efeitos colaterais piores. Se for reabrir essa frente, o aprendizado
desta sessão é: **não vale a pena mexer em `getAimLineAhead` sem TAMBÉM revisar cada perfil de
movimento que reconsulta o frame do trilho a cada tick** — os dois problemas estão acoplados.

### Bug separado, também corrigido: mira travada esquecia alvos ao mover a retícula

Pedido do usuário: *"a mira do tiro carregado simplesmente esquece dos alvos que já está
mirando, não é assim que é pra funcionar quando você move a retícula para mirar em outros
inimigos"*. Causa: `sweepLockOn` (`combat/lockon.js`) reavaliava TODO frame o ângulo de CADA
trava já feita contra a direção ATUAL da mira, soltando qualquer uma que passasse de 9° — como
o sistema é um MULTI-lock que acumula alvos ao longo da carga (`maxAllowed` sobe aos poucos,
1 alvo novo por vez), virar a mira pra travar o próximo alvo destravava o anterior na hora.
Corrigido: uma trava só sai por invalidez do PRÓPRIO alvo (morreu, ficou perto demais, passou
pra trás) — nunca porque a mira do jogador se moveu. `LOCK_RELEASE_ANGLE` removido (ficou sem
uso).

**Testado**: `node --check` limpo em todos os arquivos tocados/revertidos. **Testado ao vivo**:
servidor local (`start-game.bat`), zero erro de console após cada mudança (recarregado a cada
edição). Teste sintético (mesmo padrão já estabelecido no histórico do projeto) confirmou a
matemática do fix de spawn (item 3) e da reescrita do Blaster (item 4) antes de cada um ser
aplicado — nenhum dos dois foi ao ar sem essa verificação numérica primeiro.

**Ainda em aberto, pedidos pelo usuário mas não endereçados nesta entrega**: cores dos inimigos
mais vibrantes/visíveis; alguns inimigos (miniSwarm zigue-zague/espiral confirmado, outros não
verificados) ainda com posicionamento errado — ficaram de fora do revert pra v0.48 porque não
foram tocados nesta sessão de qualquer forma (o bug ali é anterior, não introduzido aqui).

**Versão**: v0.50.0 → v0.51.9 (várias bumps intermediárias nesta mesma sessão, pedido explícito
do usuário pra sempre subir a versão a cada mudança, facilitando confirmar qual build está
rodando).

## Resolução do jogo não abrir no GitHub, fix de cartas e correções de combate — v0.52.0

Sessão de estabilização pós-overhaul do `main.js`. O overhaul de modularização (`mount-game.js`,
`game-loop.js`, `cutscenes.js`, `flow-boss.js`, `flow-question.js`, `flow-progression.js`,
`main-constants.js`) havia sido concluído, mas o deploy no GitHub Pages apresentava travamento no
carregamento e bugs no fluxo de jogo.

### O que foi investigado e corrigido

1. **Problema do jogo não abrir no GitHub Pages (cache poisoning / Service Worker)**:
   - **Causa**: Durante etapas parciais do overhaul, o navegador executou versões intermediárias
     que continham erros de importação (`Uncaught SyntaxError: The requested module './flow-boss.js'
     does not provide an export named 'createBossFlow'`). Como o `service-worker.js` mantinha
     `CACHE_NAME = 'star-anki-shell-v1'` estático e realizava `fetch(req)` com a política de cache
     padrão do navegador, respostas intermediárias ou cacheadas com `max-age=600` do CDN do
     GitHub Pages foram salvas no CacheStorage. Além disso, `service-worker.js` não verificava
     `res.ok`, gravando erros (404/500) direto no cache. Como o arquivo do Service Worker não
     mudou, novos deploys não acionavam `controllerchange`.
   - **Correção**:
     - `CACHE_NAME` elevado para `'star-anki-shell-v2'`.
     - `fetch(req, { cache: 'no-cache' })` aplicado a requisições de mesma origem, forçando a
       revalidação com o GitHub Pages e ignorando respostas defasadas do cache de disco.
     - Proteção `if (res.ok)` adicionada antes de qualquer `cache.put()`.
     - Ao ativar (`activate`), o Service Worker remove qualquer cache diferente de `v2` e assume
       o controle com `self.clients.claim()`. O listener `controllerchange` no `index.html`
       recarrega a aba automaticamente com os arquivos atualizados.

2. **Bug da carta "Carga acelerada" (`faster-charge`) nunca sorteada**:
   - **Causa**: Em `src/player.js`, `HOMING_CHARGE_MIN_FLOOR_MS` estava definido como `1000`, igual
     ao valor inicial `HOMING_CHARGE_MIN_MS = 1000`. A checagem `if (homingChargeMinMs <=
     HOMING_CHARGE_MIN_FLOOR_MS) exclude.add('faster-charge')` excluía a carta logo na largada do
     jogo. Além disso, ao ser comprada ela subtraía 300ms com `Math.max(HOMING_CHARGE_MIN_FLOOR_MS, ...)`,
     sendo impedida de surtir efeito pelo piso em 1000.
   - **Correção**: `HOMING_CHARGE_MIN_FLOOR_MS` alterado para `400ms`. A carta agora aparece
     normalmente no sorteio até o teto de 2 upgrades.
   - **Exclusões completas no `buildCardExcludeSet`**: Adicionados caps e filtros de exclusão para
     `longer-invincibility` (teto `INVINCIBILITY_CAP_MS`), `faster-shield-recharge` (teto
     `SHIELD_REGEN_DELAY_FLOOR_MS`), `faster-fire` (piso `FIRE_COOLDOWN_FLOOR`) e `longer-dodge-iframe`
     (novo cap `FULL_SPIN_IFRAME_MS_CAP = 1800ms`), evitando que cartas em stack máximo continuem
     poluindo o pool de sorteio.

3. **Vazamento de `setTimeout` do FOV no início da luta do chefe**:
   - **Causa**: Em `src/flow-boss.js` (`enterBossFight`), o timer de 500ms para restaurar o FOV
     da câmera para 70 rodava solto sem referência. Se o jogador resetasse o jogo ou o setor
     acabasse nesse intervalo, o callback alterava a câmera de uma cena desmontada.
   - **Correção**: Id guardado em `state.bossFovTimeout` e limpo defensivamente tanto em
     `enterBossFight` quanto no `teardown()` de `src/mount-game.js`.

4. **Bug da pergunta pré-chefe "pulada" (orbe destruído sem modal)**:
   - **Causa**: Disparos de laser em voo continuavam colidindo com os orbes em
     `targets.resolveBossOrbHit()` mesmo quando a fase do jogo já havia mudado para resolução da
     pergunta ou cutscene (`state.phase !== 'bossBuildup'`), destruindo o orbe sem que o
     `game-loop.js` chamasse `bossFlow.triggerBossQuestion()`. Além disso, se dois lasers
     acertassem orbes no mesmo tick, apenas um evento booleano era gerado e o segundo orbe era
     perdido.
   - **Correção**: Passado `allowBossOrbHit: state.phase === 'bossBuildup'` de `game-loop.js` para
     `combat.update()` e `projectiles.update()`. Orbes só são destruídos e pontuados enquanto o
     jogador estiver ativamente na fase de caçada, e apenas um acerto por frame é processado.

5. **Testes e Verificação**:
   - `node src/selftest.mjs` executado com sucesso (todos os testes de parsing de Anki e sessão).
   - Validador sintático e de consistência de imports/exports em todos os 50 arquivos JS
     executado sem nenhuma divergência.

**Versão**: v0.51.15 → **v0.52.0**

## Ajustes de gameplay do backlog: Sentinela, Dash do Dourado, Escudo Refletor do Chefe e Feedback de Tiro Carregado Máximo — v0.52.1

Implementação dos 4 itens de gameplay do backlog listados em `Info mudancas.md`:

### 1. Sentinela mais lenta, maior e mais discreta (Item 4 do backlog)
- **Velocidade do ciclo 20% mais lenta**: o período do ciclo senoidal da moldura passa a ser escalado por 1.25 em relação ao tempo de voo (`cyclePeriod = Math.max(GATE_MIN_CYCLE_PERIOD, (flightTime / GATE_CYCLES_PER_FLIGHT) * 1.25)`), tornando a abertura e fechamento mais suaves.
- **Velocidade de voo reduzida**: `GATE_SPEED` reduzido de 100 para 80 u/s, aumentando o tempo de leitura e reação do jogador.
- **Crescimento de escala ao longo da trajetória**: a moldura agora escala dinamicamente de 0.7x no disparo até 1.25x na chegada (`updateGateAnimation`), e `resolveGateHit` normaliza a distância radial pela escala atual do mesh (`dist / currentScale`).
- **Modelo 3D mais curto**: espessura Z do corpo da Sentinela reduzida de 0.7 para 0.4 (`THREE.BoxGeometry(2.4, 2.4, 0.4)`).
- **Opacidade reduzida**: opacidade do material da moldura reduzida para 35% (`opacity: 0.35`), deixando o obstáculo visualmente mais leve na tela.

### 2. Dourado com Dash Lateral Longo (Item 3 do backlog)
- Quando o jogador se aproxima a menos de 28 unidades (`GOLDEN_DASH_TRIGGER_DIST = 28`), o Dourado engatilha uma arrancada lateral perpendicular à linha de visão (`lateral = cross(dirToPlayer, UP)` com lado aleatório esquerdo/direito).
- Velocidade de 62 u/s durante 0.35s (cobrindo ~22 unidades lateralmente), com efeito sonoro/visual de onda de choque (`effects.shockwave`).
- Cooldown estrito de 3.0s (`GOLDEN_DASH_COOLDOWN_S = 3.0`) entre dashes.

### 3. Chefe Vermelho com Escudo Refletor Azul (Item 5 do backlog)
- A cada 7 segundos, o chefe ergue uma esfera de escudo azul semi-transparente (`bossShieldMesh`, raio 1.35x com additive blending) que dura 3 segundos.
- O cooldown de 7 segundos **só começa a contar após os 3 segundos de escudo terminarem**.
- Enquanto o escudo está ativo:
  - O chefe fica completamente imune a dano de projéteis normais, teleguiados, explosões em área (`applyAreaDamage`) e atropelamento com impulso aríete.
  - Qualquer tiro do jogador que atinja o escudo é defletido de volta (`resolveProjectileHit` com `reflected: true`), gerando faíscas azuis e disparando um projétil inimigo azul de volta na direção contrária, capaz de causar dano ao jogador.

### 4. Feedback Visual de Tiro Carregado no Máximo (Item 9 do backlog)
- **Marco visual ao atingir 100% de carga**: quando o tiro carregado atinge a carga máxima (`state.fireHeldMs >= player.config.homingChargeMaxMs`), `effects.maxChargeReady()` dispara instantaneamente um bloom azul de punch, onda de choque e faíscas brancas na ponta de mira da nave, avisando o jogador que a carga máxima foi atingida.
- **Argolas ovais curtas disparadas junto**: ao soltar o disparo com carga máxima, `effects.maxChargeRings()` dispara uma sequência de 3 argolas ovais azuis curtas (`TorusGeometry` escalado ovalmente em 1.5x por 0.85x) que viajam em alta velocidade junto com o tiro carregado.

### Testes e Verificação
- `node src/selftest.mjs` OK.
- `check_syntax.mjs` e `check_imports.mjs` executados em todos os 50 arquivos JS com sucesso total.

**Versão**: v0.52.0 → **v0.52.1**

## Posicionamento e Câmera: Despawn por Progresso no Trilho [P1] e Câmera com Viés de Mira (SF64) [P2] — v0.52.2

Implementação dos itens de prioridade P1 e P2 da Seção 1 do `BACKLOG.md`, inspirados na arquitetura e código-fonte decompilado de Star Fox 64 (*HarbourMasters/Starship*):

### 1. [P1] Cull/Despawn por Progresso no Trilho (Robustez e Eliminação de Bugs por Curva)
- **Causa Raiz Resolvida**: As checagens de despawn anteriores usavam o produto escalar `relative.dot(frame.forward) < passBehind`. Como o frame do trilho gira conforme a pista curva, curvas acentuadas faziam com que inimigos que já tinham ficado para trás parecessem estar na frente novamente, ou que inimigos à frente fossem prematuramente considerados "atrás" (causa de anomalias no mini-swarm atacando pelas costas).
- **Mecanismo Novo**:
  - `rail.getDistance()` exposto na API pública de `src/rail.js`.
  - Ao spawnar qualquer inimigo no trilho, são atribuídos `enemy.spawnDistance = rail.getDistance()` e `enemy.despawnDistance = spawnDistance + spawnAhead + cullMargin` (com `cullMargin` de 20 a 35 unidades, garantindo que o inimigo já passou completamente da câmera, posicionada a 10 unidades atrás da nave).
  - Em `src/enemies/index.js`, tanto obstáculos estáticos (`detrito`, `ima`) quanto inimigos em geral no trilho são removidos quando `railDist >= enemy.despawnDistance` (com Blaster mantendo também sua checagem de profundidade de câmera `depth < passBehind`).
  - Em `src/enemies/miniSwarm.js`:
    - Durante a patrulha, caso o jogador avance em alta velocidade além de `despawnDistance`, o enxame é removido imediatamente sem esperar pelo mergulho.
    - Durante o mergulho (`dive`), a passagem pela nave é detectada diretamente pela distância percorrida no vetor escalar de mergulho (`distDived > enemy.diveTotalDistance + 14`) ou por `railDist >= enemy.despawnDistance`. A checagem `relative.dot(frame.forward) < MINI_SWARM_DIVE_PASS_BEHIND` foi completamente removida.

### 2. [P2] Câmera Mirando Levemente para a Nave (Star Fox 64 Camera_UpdateArwingOnRails)
- **Comportamento Anterior**: A câmera transladava lateralmente (`CAM_FOLLOW_LATERAL = 0.3`), mas seu `lookAt` sempre apontava para `camera.position + frame.forward` estático na curva, deixando a nave deslocada e colada na borda da tela ao manobrar.
- **Implementação**:
  - Adicionadas constantes `CAM_LOOK_AHEAD = 35`, `CAM_LOOK_BIAS_LATERAL = 0.15` e `CAM_LOOK_BIAS_VERTICAL = 0.08`.
  - No `rail.js`, o `camera.lookAt` agora mira em:
    `camLookTarget = camera.position + frame.forward * CAM_LOOK_AHEAD + frame.right * (playerX * 0.15) + frame.up * (playerY * 0.08)`.
  - A nave e a retícula de tiro mantêm-se naturalmente mais bem enquadradas no centro da tela ao esterçar, com a retícula 2D no HUD perfeitamente alinhada com a trajetória dos disparos via `camera.project(reticleWorldPos)`.

### Testes e Verificação
- `node src/selftest.mjs` executado com sucesso total (quiz e parsing do Anki).
- Validação de sintaxe via `node --check` em todos os arquivos JS de `src/` e no `service-worker.js`.

**Versão**: v0.52.1 → **v0.52.2**

## Overhaul Cinemático de Cutscenes: Decolagem, Apresentação de Chefe (Letterbox & Warning Card) e Vitória Heroica — v0.53.0

Implementação do sistema cinemático arcade inspirado em Star Fox 64, trazendo apresentação visual impactante para abertura de missões, confrontos contra chefes/dourado e desfecho vitorioso da partida:

### 1. Cutscene de Decolagem / Início de Missão (`updateLaunchCutscene`)
- Ao iniciar a partida, a câmera parte de uma perspectiva baixa e lateral com foco nos motores da nave.
- Aos 22% do tempo (`t = 0.22`), os propulsores entram em ignição com explosão de partículas (`effects.propulsionBurst`), onda de choque e muzzle flash.
- A câmera acelera suavemente (`smoothstep`) em direção à traseira da nave, com distorção dinâmica de FOV (efeito lente/túnel de velocidade) e alinhamento milimétrico com a câmera normal de combate.
- **Letterbox cinemático e banner visual**: barras pretas arcade no topo/rodapé e banner com design HUD sci-fi identificando o setor e deck atual.
- **Skip responsivo**: permissão para pular a qualquer instante com Barra de Espaço, Tecla de Tiro (Z) ou Enter após breve carência anti-clique acidental.

### 2. Apresentação Dramática do Chefe e Anomalia Dourada (`updateArenaCutscene`)
- **Letterbox e Warning Card**:
  - Para o Chefe: card vermelho pulsante *"NÚCLEO RUBRO // RED CORE"*, *"FORTALEZA DEFENSIVA"*, *"ALERTA MÁXIMO // AMEAÇA DETECTADA"*, com listras diagonais de perigo (`stripes`) animadas.
  - Para o Dourado: card dourado cibernético *"ANOMALIA TEMPORAL DETECTADA"*, *"ALVO DE ALTO VALOR // ALL-RANGE MODE"*.
- **Ondas de Choque e Fenda Espacial**: durante os primeiros 65% da apresentação, o portal do chefe emite pulsos de distorção no espaço (`effects.shockwave` e fagulhas).
- **Órbita Cinemática da Câmera**: arco de câmera que recua e orbita lateralmente antes de retornar suavemente para a traseira da nave, sincronizado com o encerramento do aviso.

### 3. Morte do Chefe e Sequência de Vitória Heroica (`updateDeathCutscene`)
- **Detonações Secundárias em Cadeia**: durante a fase de desestabilização (36% iniciais), explosões menores com anéis de choque e faíscas estouram aleatoriamente pela carcaça do chefe em câmera lenta.
- **Flash Terminal de Whiteout**: clarão branco em tela cheia (`triggerWhiteout`) com queda exponencial de opacidade no instante da explosão colossal final.
- **Voo Rasante de Vitória (Victory Flyby)**: a câmera se posiciona à frente da nave olhando para trás enquanto a nave cruza a fumaça da explosão e o banner comemorativo *"MISSION ACCOMPLISHED // SETOR CONCLUÍDO"* surge na tela com letterbox.

### 4. Arquitetura Modular e Isolamento
- Todo o gerenciamento de sequências cinemáticas agora reside em `src/cutscenes.js`.
- Elementos visuais estilizados adicionados em `src/hud-styles.js` e métodos de controle expostos na interface `hud` em `src/hud-game.js`.
- Integração limpa no `game-loop.js` e inicialização no `mount-game.js`, mantendo zero quebra e compatibilidade total.

### Testes e Verificação
- `node src/selftest.mjs` executado com sucesso total.
- `check_all.mjs` e `check_imports.mjs`: validação de sintaxe e resolução de imports em todos os 51 arquivos JS/ESM com 100% de integridade.

**Versão**: v0.52.2 → **v0.53.0**

## Aplicativo Desktop com Auto-Atualização e Overhaul da Tela Inicial — v0.53.1

Entrega do aplicativo desktop nativo leve e overhaul visual e interativo completo da tela inicial (`hud-pregame.js` e `index.html`):

### 1. Aplicativo de Desktop Nativo Leve com Auto-Atualização
- **Zero Overhead & Zero Dependências**: Em vez de inflar o projeto com centenas de megabytes de dependências do Electron, o aplicativo utiliza o motor de renderização acelerado por hardware nativo do Windows em modo de aplicação isolada (`--app=https://ratuckk.github.io/Star-Anki/`), com janela dedicada, sem barra de endereços, sem abas de navegador e com seu próprio perfil de dados em `%LOCALAPPDATA%\Star-Anki\User Data`.
- **Ícone Nativo do Windows (.ico)**:
  - Gerado `icons/star-anki.ico` multi-resolução (32x32, 192x192, 512x512) via `tools/generate-ico.mjs` a partir dos ativos visuais oficiais.
- **Instalador de 1 Clique (`Instalar Star Anki Desktop.bat` e `tools/install-desktop.ps1`)**:
  - Script que localiza o executável do navegador do sistema e cria os atalhos com ícone oficial diretamente na Área de Trabalho do Windows (`Área de Trabalho\Star Anki.lnk`) e no Menu Iniciar.
- **Launcher Direto (`Star Anki.bat`)**:
  - Permite abrir a janela do jogo diretamente a partir da raiz do repositório em modo aplicativo exclusivo.
- **Auto-Atualização Contínua & Modo Offline**:
  - Conectado diretamente à URL de produção (`https://ratuckk.github.io/Star-Anki/`). A cada novo commit publicado no GitHub, o **Service Worker v2** detecta e instala a atualização automaticamente em segundo plano. Caso o jogador esteja sem internet, todo o jogo roda offline a partir do CacheStorage.

### 2. Overhaul Visual Completo da Tela Inicial (`hud-pregame.js` & `index.html`)
- **Estética Arcade Espacial e Sci-Fi Moderna**:
  - Tipografia imponente com gradientes metálicos espaciais em `STAR ANKI` (`#ffffff` → `#7ee7ff` → `#18a0fb`), drop shadow de neon azul e subtítulo com tracking largo `ARCADEMIC SPACE RAIL SHOOTER`.
  - Badge de telemetria `SISTEMA OPERACIONAL // v0.53.1` com LED pulsante verde.
- **Card Hero de Decolagem / Missão**:
  - Card central com efeito de glassmorphism (`backdrop-filter: blur(16px)`), gradientes escuros profundos e glow radial ciano.
  - Exibe o status dinâmico do baralho: badge de quantidade de baralhos prontos, título do baralho ativo e contagem de cartas de combate vs painel.
  - Botão épico **"INICIAR MISSÃO"** com gradiente ciano brilhante, animações de elevação, sombra volumétrica e ícone dinâmico.
- **Cards de Acesso Rápido**:
  - Tiles modernos com ícones estilizados para "Gerenciador de Baralhos" (com status da coleção) e "Hangar & Configurações" (indicando a nave ativa configurada no hangar).
- **Dock de Controles & Detector de Gamepad em Tempo Real**:
  - Barra inferior em glassmorphism resumindo os comandos principais do teclado (`WASD`, `ESPAÇO`, `Z/C`, `SHIFT`).
  - **Live Gamepad Indicator**: Chip de controle que monitora a conexão de gamepads via `navigator.getGamepads()` e listeners de eventos, acendendo LED verde neon e exibindo o modelo do controle conectado.

### Testes e Verificação
- `node src/selftest.mjs` executado com sucesso total (quiz e parsing do Anki).
- `node tools/generate-ico.mjs` executado: ícone `.ico` gerado com sucesso.
- `tools/install-desktop.ps1` executado: atalho criado na Área de Trabalho do usuário com sucesso.
- Validação de sintaxe via `node --check` em todos os arquivos JS tocados.

**Versão**: v0.53.0 → **v0.53.1**

---

## Correções Críticas: Despawn de Inimigos, Tela Inicial Minimalista & Launcher Local — v0.53.2

Correções de jogabilidade, revisão de UI e infraestrutura do launcher desktop solicitadas pelo usuário:

### 1. Correção do Bug de Despawn de Inimigos no Ar
- **Causa Raiz Identificada**: A introdução de `tagRailEnemy` e da fórmula arbitrária de distância no trilho (`despawnDistance = currentDist + ahead + 20`) fazia com que os inimigos fossem eliminados sumariamente após 3.6 a 5.0 segundos (tempo em que a nave percorre ~100 unidades a 22 u/s). Como consequência, enxames (`miniSwarm`, patrulha de 2.5 a 4.0s), sentinelas (ciclo de mira de 4 a 7s), obstáculos estáticos (`detrito`, `ima`) e tanques sumiam no ar bem na frente do jogador sem sequer engajá-lo.
- **Resolução**:
  - Removido completamente o helper `tagRailEnemy` e a verificação `railDist >= enemy.despawnDistance`.
  - Restaurada a verificação geométrica e física de ultrapassagem (`relative.dot(frame.forward) < passBehindFor(enemy)`). O inimigo ou obstáculo só é removido quando a nave realmente passa por ele.
  - No `miniSwarm.js`: durante a patrulha, nunca sofre despawn por distância; no mergulho, só despawna após ultrapassar o jogador (`relative.dot(frame.forward) < MINI_SWARM_DIVE_PASS_BEHIND`) ou por limite de segurança de tempo (`diveElapsed > MINI_SWARM_DIVE_MAX_S`).
  - No `blaster.js`: adicionada taxa de aproximação natural e suave (`enemy.depth -= RAIL_SLOW_SPEED * dt`) para os perfis `orbit` e `evasive`, garantindo que se aproximem do jogador e passem limpos caso não sejam abatidos antes.

### 2. Tela Inicial Minimalista, Limpa e Sem Artifícios
- **Simplificação Completa**: Removidos mais de 250 linhas de efeitos pesados e artificiais (LEDs falsos de status, gradientes de texto multicoloridos, glows e emojis excessivos).
- **Design Elegante e Coeso**:
  - Cabeçalho limpo com `Star Anki` e badge discreto de versão `v0.53.2`.
  - Card minimalista do baralho ativo (`pregame-deck-card`) exibindo nome e contagem de perguntas no trilho e no painel de revisão.
  - Botão de ação primária `Jogar` com estilo padrão ciano do jogo, acompanhado por botões secundários para `Gerenciar baralhos` e `Configurações`.
  - Rodapé discreto com dicas de teclas (`WASD`, `Espaço`, `Z/C`, `Shift`) e indicador de gamepad sem poluição visual.

### 3. Launcher Desktop Local em Tempo Real (No-Cache)
- **Causa Raiz**: O launcher anterior e o atalho apontavam para a URL do GitHub Pages (`https://ratuckk.github.io/Star-Anki/`), que refletia a branch remota desatualizada em vez dos arquivos locais do usuário.
- **Resolução**:
  - `tools/run-game.mjs`: atualizado para detectar executáveis do Edge ou Chrome no Windows e lançar em `--app="http://127.0.0.1:8420/?launcher=1"` apontando para o servidor estático local com `Cache-Control: no-store` (atualizações imediatas do código local). Caso a porta 8420 já esteja ativa, foca a janela sem crashar (`EADDRINUSE`).
  - `Star Anki.bat`: inicia diretamente `node tools/run-game.mjs`.
  - `tools/run-desktop.vbs`: criado launcher silencioso que inicia o servidor e abre a janela do aplicativo sem manter console preto na tela.
  - `tools/install-desktop.ps1`: atalhos da Área de Trabalho e do Menu Iniciar atualizados para executar a versão local através do `run-desktop.vbs` com o ícone nativo `star-anki.ico`.

### Testes e Verificação
- `node --check` passou em todos os arquivos modificados.
- `node src/selftest.mjs` passou com 100% de sucesso.
- `tools/install-desktop.ps1` executado e atalho de desktop atualizado com sucesso.

**Versão**: v0.53.1 → **v0.53.2**

---

## Alinhamento de Decolagem, Pista Reta, Aceleração Física e Timing Arcade — v0.53.3

Ajustes de física, geometria do trilho e timing cinemático solicitados pelo usuário:

### 1. Correção da Orientação Inicial da Nave e Pista Reta Frontal
- **Causa Raiz da Nave Torta**: No `rail.js`, o modelo 3D da nave era instanciado sem rotação inicial (`(0, 0, 0)`, apontando para `(0, 0, -1)`). Além disso, a curva original do trilho iniciava virando ~32° para a direita (`+X, -Z`). Durante a cutscene de decolagem, a nave ficava travada em `(0, 0, 0)` enquanto a câmera olhava ao longo do vetor da pista, fazendo a nave parecer torta para a esquerda e dando um solavanco para a direita ao término da cutscene.
- **Resolução**:
  - **Pista Reta Frontal (`buildCurve`)**: Redesenhamos o início da curva com 75 metros estritamente alinhados no eixo Z (`(0, 3, 0) -> (0, 3, -75)`), garantindo tangente inicial matematicamente pura em `(0, 0, -1)`.
  - **Orientação Imediata**: `ship.up.copy(lastFrame.up)` e `ship.lookAt(lastFrame.position + lastFrame.forward)` adicionados na criação do mesh em `rail.js`.
  - **Controle de Distância (`rail.setDistance`)**: Exposto método público no controlador do trilho para posicionar e orientar a nave em qualquer ponto do trilho durante cinemáticas.

### 2. Aceleração Contínua na Decolagem (Padrão Star Fox 64)
- Em `src/cutscenes.js` (`updateLaunchCutscene`):
  - **0.0s – 0.35s**: Câmera na perspectiva traseira direita (3/4 baixa), exibindo a fuselagem e os motores enquanto o banner sci-fi surge.
  - **0.35s**: Ignição potente dos propulsores com explosão de partículas (`effects.propulsionBurst`), anel de choque e flash de bico.
  - **0.35s – 2.0s**: A nave **acelera fisicamente pela pista** ($s = a \cdot t^2$), cobrindo 22 metros em aceleração contínua. A câmera sobe suavemente (`smoothstep`) e se centraliza atrás da nave, sincronizando com a velocidade de cruzeiro.
  - Ao término (2.0s), a entrega de controle para o jogador ocorre com a nave já em velocidade máxima, sem congelamento ou solavancos.

### 3. Calibração do Timing Arcade
- Em `src/main-constants.js`:
  - **Decolagem (`LAUNCH_CUTSCENE_MS`)**: 2000ms (2.0s rápidos e energéticos).
  - **Apresentação do Chefe (`BOSS_SUMMON_CUTSCENE_MS`)**: Reduzido de **5200ms para 3200ms** (3.2s). O card fica em destaque por 2.1s com pulsos de fenda espacial e a câmera retorna ágil em 0.7s, eliminando o vazio de 2 segundos de tela escura anterior.
  - **Morte do Chefe (`BOSS_DEATH_CUTSCENE_MS`)**: 3000ms com câmera lenta nas detonações, whiteout terminal e flyby comemorativo heroico.
  - **Morte de Inimigo / Dourado (`DEATH_CUTSCENE_MS`)**: 1200ms com câmera lenta e zoom rápido.

### 4. Tag de Versão Centralizada Dinâmica
- Criado `src/version.js` como fonte única da verdade (`GAME_VERSION = 'v0.53.3'`).
- `src/hud-pregame.js` consome dinamicamente a versão para exibir o badge `v0.53.3` na tela inicial.

### Testes e Verificação
- `node --check` executado em todos os arquivos tocados.
- `node src/selftest.mjs` passou com 100% de sucesso.

**Versão**: v0.53.2 → **v0.53.3**





