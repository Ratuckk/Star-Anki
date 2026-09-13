# Progresso pós-v0.30 — novas documentações a partir daqui

Continuação do [PROGRESSO.md](PROGRESSO.md) (histórico até v0.33.x, agora congelado). A partir desta
entrega, toda documentação nova entra neste arquivo.

## `main.js` reduzido: extrai `game-menu.js` e `debug-actions.js` — v0.41.0

Pergunta do usuário: *"O que faria para melhorar a organização do código e diminuir as quantidades exorbitantes de código em cada js? Assim como fiz com os inimigos?"* — depois de confirmar (perguntando pras outras sessões) que ninguém mais estava editando `main.js`/`combat.js` no momento, comecei a mesma ideia dos splits de `enemies.js`/`combat.js`, mas aplicada ao `main.js` (1543 linhas, o mais monolítico do projeto: uma única closure `mountGame()` misturando state machine de fases, input/combos, debug panel e orquestração de HUD).

Diferença importante em relação aos splits anteriores: `enemies.js`/`combat.js` dividiam bem porque cada pedaço (uma classe de inimigo, um sistema de combate) é bastante independente. `mountGame()`'s `tick()` não é assim — é uma função só, de ~600 linhas, lendo/escrevendo umas 30 variáveis mutáveis da mesma closure (phase, timers, flags). Dividir isso de verdade (a state machine de fases em si) exigiria agrupar esse estado num objeto e passar por parâmetro pra várias funções — um refactor bem maior e mais arriscado. Por segurança (e por ter várias sessões concorrentes mexendo no mesmo repo hoje), fiz só a parte que dá pra extrair com baixo risco nesta entrega — o resto fica pra uma Fase 2 futura:

1. **`src/game-menu.js`** (novo, 175 linhas): todo o fluxo de menu/baralho/prática de painel que roda ANTES e DEPOIS de uma partida — `handlePlayDeck`, `handlePlayMergedDecks`, `restart`, `playAgain`, `renderEndScreen`, `startPainelPractice`, `downloadTagsExport` — nenhuma dessas funções tocava no loop de jogo (`tick()`) diretamente, só chamavam `mountGame(session)` como callback. Export único: `createGameMenu(mountGameFn)` (recebe `mountGame` por injeção, pra evitar import circular — `mountGame` mora em `main.js` e `game-menu.js` nunca importa de lá), devolve `{ restart }`.
   - Acoplamento reverso resolvido: `endSector()` (dentro de `mountGame`) precisa mostrar a tela de fim (`renderEndScreen`, que é privada de `game-menu.js`) — resolvido passando `deck` e um pacote `menu = { sessionResults, renderEndScreen }` como 2º/3º parâmetro de `mountGame(session, deck, menu)`.
   - `history` não precisou de nenhum parâmetro extra: `session.history` já é o MESMO objeto que `game-menu.js` persiste (`createSession`, desde a Fase 9, já grava `session.history = history`) — `recordResult` muta em vez de substituir, então os dois lados ficam sincronizados de graça.
2. **`src/debug-actions.js`** (novo, 85 linhas): o objeto inteiro passado pra `hud.debug.bind({...})` (~70 linhas de bindings do painel de debug) virou `createDebugActions(deps)`. Continua dependendo de praticamente tudo (`combat`/`player`/`rail`/`effects`/`hud`/`session`) — é o painel de debug, "alcançar tudo" é esperado — mas isolar isso tira ~70 linhas do meio do `main.js`.
   - `godMode`/`infiniteAmmoActive`/`hitboxesActive`/`slowMoActive` (4 `let` soltos) viraram um único objeto `debugFlags` compartilhado por referência — evita precisar de getter/setter pra cada um; os 2 pontos do `tick()` que liam essas flags (`dt` com câmera lenta, checagem de dano com god mode) agora leem `debugFlags.x`.
   - `phase` (lido em 4 bindings) e `bossHealthBonus` (escrito em 1) continuam sendo `let` normais dentro de `mountGame`, só expostos por um getter (`getPhase`) e uma função de reset (`resetBossHealthBonus`) — não valia a pena promovê-los a objeto só por causa do painel de debug, já que são usados pervasivamente no resto do `tick()`/state machine que não foi tocado.

`main.js`: 1543 → 1335 linhas (~13%, e as ~260 linhas que saíram foram pra dois arquivos com responsabilidade única e comentário de topo explicando a injeção de dependência).

**Testado ao vivo**: `node --check` limpo nos 3 arquivos + `selftest.mjs`; joguei do menu (exercita `game-menu.js`: `restart`→`showDeckManager`→`handlePlayDeck`→`createSession`→`mountGame`) até o combate, zero erro no console; abri o painel de debug e cliquei God mode/Tiro infinito/Mostrar hitboxes/Câmera lenta (os 4 toggles ficaram verdes, confirma `debugFlags` funcionando) e "Ir para arena dourada" (confirma `getPhase()`/`startArenaCutscene` via `debug-actions.js`) — cutscene "Transicionando para o modo All-Range..." rodou normalmente, zero erro em nenhum clique.

**Versão**: v0.40.0 → v0.41.0.

**Nota de processo**: antes de mexer, confirmei com as sessões concorrentes (`star-anki-d5`, `star-anki-b8`, `star-anki-bf`) que ninguém mais estava editando `main.js` ou `combat.js` naquele momento — `main.js` tinha edições pendentes da `star-anki-d5` (Fase 5 de correções) e a divisão do `combat.js` era da `star-anki-b8`, ambas concluídas e commitadas (`5fb6dd4`, `0ad654e`) antes desta entrega começar.

## `combat.js` dividido por sistema em `src/combat/` — v0.40.0

Pedido do usuário, depois de uma conversa sobre a mesma pergunta já feita pro `enemies.js`
("vale dividir por tamanho de código?"): dessa vez o corte não é por CLASSE (não existe essa
distinção em `combat.js`), é por SISTEMA — e nem por tipo de projétil do jogador (normal vs.
carregado), que eu desaconselhei antes por eles compartilharem o mesmo array e o mesmo loop de
colisão contra inimigo/bônus/orbe (dividir ali forçaria duplicar essa lógica em 2 arquivos).

**`src/combat/projectiles.js`**: tiro normal + carregado (teleguiado) JUNTOS — `tryFire`,
`fireSingle`, `fireHomingShot`, `deflectNearbyProjectiles` (carta "giro rebatedor"), o loop de
`update()` que move os projéteis e resolve colisão. Só delega a colisão específica de bônus/orbe
pra `targets.resolveBossOrbHit`/`resolveBonusHit` (mesmo padrão já usado com
`enemies.resolveProjectileHit`).

**`src/combat/targets.js`**: alvos passivos que não atacam nem perseguem — bônus (asteroide,
`spawnBonusTarget`) e os 6 orbes-pergunta da arena do chefe (`spawnBossOrbs`). Cada um expõe
`resolve*Hit(prevPos, currPos, hitBuffer)`, que já aplica o efeito colateral (explosão, some) e
devolve só o que quem chamou precisa saber.

**`src/combat/lockon.js`**: trava do tiro carregado — `sweepLockOn`, `isAimingAtEnemy`, o array
de "lock records" (`{entity, offset, seq}`), e um método novo, `takeLockedTargets(inRange)`, que
substitui o antigo padrão de "ler `lockedEnemies` e depois zerar na mão" espalhado em
`fireHomingShot` — agora concentrado num lugar só.

**`src/combat/index.js`**: orquestrador — cria os 3 sistemas acima, mantém só o que não valia a
pena isolar sozinho (escoltas/wingmen, hitbox de debug) e a montagem do `update()`. Mesma API
pública de antes (`createCombatSystem(scene, rail, effects, enemies, player)`), então
`main.js`/`player.js` só trocam o caminho do import.

**Achado no caminho — bug real, não meu**: `spawnBonusTarget()` referenciava
`BONUS_SCALE_MIN`/`BONUS_SCALE_MAX` (variação de tamanho do asteroide, item de uma entrega
concorrente recente) sem essas constantes existirem em lugar nenhum do arquivo — `ReferenceError`
certeiro toda vez que um bônus fosse spawnado. Corrigido ao migrar (`0.7`/`1.6`, os valores que já
estavam citados no comentário ao lado).

**Cuidado de arquitetura**: as geometrias com aleatoriedade por SESSÃO (o formato irregular do
asteroide bônus, gerado 1x com jitter por vértice) precisam continuar sendo recriadas dentro de
`createTargetsSystem()` a cada `mountGame()`, não em escopo de módulo — se fossem constantes de
módulo (como a maioria das geometrias estáticas em `enemies/*.js`, sem problema ali por serem
sempre a mesma forma), toda partida nova reaproveitaria a MESMA pedra sorteada na primeira vez
que a aba carregou, em vez de uma forma nova por sessão como acontecia antes do split.

**Nota de processo**: outra sessão concorrente entregou "Correções fase 6" (cutscene de foco na
pergunta, v0.39.0) nos mesmos minutos, em `hud-game.js`/`hud-pregame.js`/`hud-styles.js` — ela
mesma documentou ter ficado de fora de `combat`/`main`/`player` de propósito enquanto eu
terminava. Nada conflitou (arquivos disjuntos), mas por estarem os dois grupos de mudança no
mesmo disco na hora do commit, este commit inclui as duas entregas juntas (`node --check` limpo
nos 3 arquivos dela também).

**Testado ao vivo**: servidor estático, zero erro de console durante spawn de vermelho/bônus/
dourado, 6 tiros normais, teste de tiro teleguiado (exercita `lockon.takeLockedTargets` +
fallback de `enemies.getAlive()`), toggle de hitbox, e `+100 pontos` (confirmado via HUD
atualizando de 0→100, prova de que o loop principal seguiu rodando integrado ao `combat/`
novo — só bem mais lento que tempo real pela mesma limitação de rAF sem foco de SO já
documentada no histórico deste projeto).

**Versão**: v0.39.0 → v0.40.0.

## Correções fase 6 (última da lista): cutscene de foco na pergunta — v0.39.0

Item 19, o último da lista de 20 correções — o próprio usuário tinha marcado "deixe isso por último". Antes de implementar, fiz uma rodada de "me dê ideias" (6 conceitos de cutscene pra quando a pergunta aparece, cobrindo desde zoom na mira até holograma de cockpit) e o usuário escolheu a **ideia 5: partículas convergindo pro centro da tela**.

**Nota de processo**: outra sessão está no meio da divisão de `combat.js` em `src/combat/` (arquivo antigo já aparece deletado no disco, `main.js`/`player.js` também modificados por ela) — não toquei em nenhum desses, só nos 3 arquivos que eu de fato editei (`hud-game.js`, `hud-styles.js`, `hud-pregame.js`). Não consegui subir meu próprio servidor de preview pra testar ao vivo (porta 8420 já em uso pelo servidor de outra sessão) — compensado com revisão cuidadosa do diff (a lógica de verdade do modal foi movida byte-a-byte pra dentro de `revealQuestionModal`, sem nenhuma mudança de comportamento nela).

1. **`playFocusCollapse` + `revealQuestionModal`** (`hud-game.js`): `showQuestionModal({question, alternatives, onPick})` não popula mais o modal na hora — primeiro dispara `playFocusCollapse`, que spawna 10 partículas (divs) num raio ao redor do centro da tela (perto da borda), cada uma com posição inicial aleatória via CSS custom properties (`--sx`/`--sy`) e um pequeno atraso de animação pra não nascerem todas no mesmo instante. Só quando a animação termina (~350ms, `setTimeout`) o modal de verdade aparece, chamando a função que ANTES era o corpo direto de `showQuestionModal` (extraída, zero mudança de comportamento — clique ou número 1-4 continuam idênticos).
2. **CSS da animação** (`hud-styles.js`, `.question-focus-collapse`/`.question-focus-particle`): puramente DOM/CSS, mesmo padrão já usado pelo `cardAbsorbBeam` (Fase 9) — precisa rodar independente do loop 3D porque o jogo já está em pausa total (`questionPause`/`bossQuestionPause`) no instante em que a pergunta aparece. A keyframe anima `left`/`top` de onde a partícula nasceu até 50%/50% (centro exato, onde o modal nasce), com opacidade e escala caindo no caminho.

Como a função é `showQuestionModal` (compartilhada), o efeito vale pra pergunta normal, bônus dourado E orbe do chefe — os 3 fluxos, sem precisar mexer em `main.js`.

**Testado**: `node --check` limpo em `hud-game.js`/`hud-styles.js`/`hud-pregame.js` e `selftest.mjs` passou. **Não confirmado ao vivo** (porta do servidor de preview em uso por outra sessão, não tentei forçar trocar de porta pra não mexer em config compartilhado `.claude/launch.json`) — compensado revisando que o corpo do modal foi só REALOCADO (comparei linha a linha com o código anterior, idêntico) e que o timing da animação CSS (280ms + até 60ms de delay aleatório) cabe dentro do timeout de remoção (350ms) sem cortar a animação no meio.

**Com isso, a lista original de 20 correções está completa.**

**Versão**: v0.38.0 → v0.39.0.

## Correções fase 5: nave sem piscar no rolamento, tiro carregado revisado, giro rebatedor, asteroide bônus, bug do all-range — v0.38.0

Continuação da lista de 20 correções ("Siga" — usuário confirmou seguir com a Fase 5 como proposto).

**Nota de processo**: no meio desta entrega, a **star-anki-45** avisou que tinha acabado de mesclar o PR #4 (rotulado v0.37.0 — 2ª colisão de número de versão entre sessões, a 1ª foi v0.34.0) e que meu `main.js`/`effects.js`/`player.js` não commitados estavam bloqueando o `git pull` dela; ela também sinalizou intenção de começar uma refatoração grande do `main.js` (dividir em módulos). Combinei com ela segurar essa refatoração até eu terminar e commitar — ela concordou. Terminei a Fase 5 inteira antes de fechar (em vez de um checkpoint parcial) pra não reabrir os mesmos arquivos duas vezes. Também apareceu uma pasta nova não rastreada `src/combat/` (`lockon.js`/`projectiles.js`/`targets.js`) — outra sessão, aparentemente, começando a dividir `combat.js` do mesmo jeito que `enemies.js` foi dividido — não toquei nela.

1. **Nave não pisca mais no rolamento (giro completo), afterimage no lugar** (`player.js`+`effects.js`+`main.js`): o flicker de invencibilidade é read do MESMO `invincibleTimer` usado por dano/ram — não dava pra distinguir "por que" a nave está invencível. `player.js` ganhou `rollIframeTimer` (paralelo, só pro giro) + `isRollIframeActive()`; `main.js` usa isso pra suprimir o flicker especificamente nessa janela (`rail.setShipVisible` ganhou o `||`) e passa `rollActive` pro `effects.update()`, que spawna uma silhueta-cone azul-clara a cada ~0.04s enquanto ativo (`rollAfterimage`).
2. **Tiro carregado: camadas revelando uma por segundo, pulsando, -30% opacidade** (`effects.js`): a v0.30.0 original já tinha entregue "4 camadas" mas todas apareciam e cresciam JUNTAS desde o início da carga — o pedido de verdade era cada uma revelar em sequência. `setChargeGlow` agora calcula um threshold próprio por camada (`i/4` da fração de carga — com carga de 3s isso bate com "uma a cada ~1s"), cada camada com progresso PRÓPRIO que converge pro tamanho máximo em conjunto com as outras no fim da carga (todas terminam do mesmo tamanho relativo, só começam em momentos diferentes). Adicionado pulso (`Math.sin`, fase diferente por camada) e opacidade × 0.7.
3. **Giro rebatedor: argolas azuis + afterimage ao deflectar** (`effects.js`+`main.js`): burst único (`deflectBurst`, 3 argolas escalonadas + 1 afterimage reaproveitando `ramAfterimage`, mesmo azul) disparado nos 3 pontos onde `player.isDeflectActive()` já condicionava `combat.deflectNearbyProjectiles(...)` (os 2 gatilhos reais de dodge-tap + o debug `triggerFullDodge`).
4. **Alvo bônus verde: variedade de tamanho + shading de asteroide** (`combat.js`): geometria trocada de `DodecahedronGeometry` fixa pra um icosaedro com vértices deslocados aleatoriamente ao longo da normal (forma "de pedra" irregular, construída uma vez, compartilhada) + `emissiveIntensity` reduzido (menos "gema brilhando"). Cada spawn sorteia escala (0.7x-1.6x, hitbox/explosão acompanham) e velocidade de rotação própria — tumble lento e contínuo, não mais parado no ar. **Achado no processo**: a animação de morte (`bonus.mesh.scale.setScalar(1 - deathT)`) ignorava a escala da instância — corrigido pra multiplicar por ela, senão um alvo grande "encolhia" pro tamanho base de repente ao morrer.
5. **Bug real corrigido: tiro de inimigo nunca chegava no jogador em modo all-range** (`enemies/index.js`): em arena, `inFireRange` deixava atirar de QUALQUER distância (inimigos spawnam a até 160 de distância), mas o projétil se autodestrói em `ENEMY_PROJECTILE_MAX_RANGE` (100) — de longe, todo tiro expirava no meio do caminho antes de chegar. Novo teto `ENEMY_ARENA_FIRE_MAX_DISTANCE` (85) — em arena, só atira se estiver dentro desse raio (vale pro chefe também, que reaproveita a mesma função de tiro pra rajada normal; o laser telegrafado dele é um sistema à parte, não afetado).
6. **Geração de inimigo no all-range reduzida** (`main.js`): `ENEMY_CAP_ARENA_BASE` 20 → 14 (teto de inimigos simultâneos) + intervalo de spawn ×1.3 (`ARENA_ENEMY_INTERVAL_MULT`) só em arena — ajuste de calibração, sem número exato pedido pelo usuário, fácil de re-tunar se ainda estiver muito ou pouco.
7. **Item 16 (movimento "mais dinâmico") — só parcialmente endereçado, com uma pergunta pro usuário**: não mexi no MOVIMENTO em si além dos itens 5/6 acima. Motivo: outra sessão já entregou 6 perfis de movimento pro inimigo comum em arena (órbita/avanço/lento/persegue/espiral/evasivo, v0.33.1) — é plausível que a reclamação original ("estranho", "não dinâmico") tenha sido escrita ANTES dessa entrega, ou que o bug do item 5 acima (tiros nunca acertando) por si só já fizesse o combate parecer "inerte" mesmo com movimento variado. Prefiro o usuário confirmar se ainda sente o problema depois desses dois fixes antes de eu mexer mais em código de movimento já calibrado, em vez de adivinhar mudanças em cima de um feedback vago.

**Testado**: `node --check` limpo em `player.js`/`effects.js`/`main.js`/`combat.js`/`enemies/index.js` e `selftest.mjs` passou a cada rodada. **Não confirmado ao vivo**: outra sessão segue com servidor de dev na mesma pasta, não tentei subir um próprio. Compensado com revisão cuidadosa de cada diff e reaproveitamento máximo de padrões já testados (o próprio `ramAfterimage`/`ramRing` da Fase 4, que usa a mesma técnica).

**Versão**: v0.37.0 → v0.38.0.

## Correções fase 4: explosão revertida pras partículas, guinada assistida removida, efeitos do impulso ariete — v0.37.0

Continuação da lista de 20 correções. Usuário corrigiu 2 coisas da minha entrega anterior antes de eu seguir: (1) a explosão em anéis coloridos que virou v0.32.1 não era o pedido — o pedido real é voltar às partículas pequenas de antes, só sem o bug de quadrado; (2) apontou que o controle do all-range ficou puxando pra cima do chefe/dourado sozinho. Investiguei os dois ANTES de perguntar (`AskUserQuestion` só nos pontos genuinamente ambíguos de escopo) — respostas: remover a guinada assistida por completo, e as argolas cinzas novas só em explosão de inimigo (não dano na nave nem burst de impulso).

**Nota de processo — descoberta importante sobre as sessões concorrentes**: `git log -- src/rail.js` mostra que minha remoção da guinada assistida (que eu tinha acabado de editar, ainda não commitada) foi parar dentro do commit `8d0c891` de **outra sessão** (o split de `enemies.js`), sem que ela soubesse — como todas as sessões escrevem no MESMO diretório de trabalho, um `git commit` de qualquer uma pode incluir edições não commitadas de qualquer outra que estejam no disco na hora. Não é um bug meu nem dela, mas vale o usuário saber: não dá pra garantir que um commit de uma sessão contém só o que ela mesma descreveu ter feito. Confirmei que o conteúdo do `rail.js` está correto de qualquer forma (a remoção está lá, `node --check` limpo).

**Nota de processo 2 — colisão de número de versão**: aquele mesmo commit `8d0c891` se rotulou "v0.34.0" na mensagem, mas isso já tinha sido usado pela minha entrega (`db7946a`) 3 versões atrás — a tag visível no jogo (`hud-pregame.js`) continuou em v0.36.0 (a outra sessão não mexeu nela), então não houve regressão visível, só a mensagem do commit ficou com número duplicado no histórico do git.

**Nota de processo 3**: `CLAUDE.md` e a estrutura de documentação mudaram (outra sessão) — `PROGRESSO.md`/`progresso.md` (mesmo arquivo, nomes com casing diferente) virou "congelado" até v0.33.x, e esta entrega já é a primeira minha neste novo arquivo, `PROGRESSO_POS_0.30.md`, seguindo a convenção nova.

1. **Explosão revertida pras partículas pequenas + textura circular de verdade** (`effects.js`): a v0.32.1 tinha trocado a explosão por 4 anéis coloridos colados na câmera ("círculos feios estranhos", segundo o usuário) — revertido pro burst de partículas pequenas voando (`EXPLOSION_PARTICLES`/`DURATION`/`SPEED_MIN/MAX`/`PARTICLE_SIZE`, valores idênticos aos de antes da v0.32.1). A causa raiz do "quadrado" confirmada: `PointsMaterial` sem `map` renderiza cada partícula como quadrado sólido — resolvido reaproveitando `softCircleTexture` (renomeado de `fogWispTexture`, já existia pra neblina) como `map` do material.
2. **Argolas cinzas grandes, só em explosão de inimigo** (`effects.js` + `enemies/boss.js`, `enemies/golden.js`, `enemies/index.js`): `explosion(position, colorHex, size, opts)` ganhou `opts.rings` — 1-2 argolas (`EXPLOSION_GRAY_RING_COUNT_MIN/MAX`) cinzas (`0x999999`), tamanho aleatório, com um **ângulo 3D aleatório fixo na criação** (não billboard pra câmera, de propósito — lêem como destroço visto de lado, não um círculo sempre de frente). Passado `{ rings: true }` só nos kills de verdade (chefe via `explodeBoss`, dourado, inimigo comum/ram) — os hits não-letais (`isHoming` spark) e as explosões de dano na nave/burst de propulsão continuam só com as partículas, sem argola.
3. **Guinada assistida rumo ao inimigo mais próximo REMOVIDA** (`rail.js`+`main.js`): era da Fase 9 (outra sessão) — em lutas de chefe/dourado o "mais próximo" quase sempre era ele mesmo, puxando a nave pra lá o tempo todo em vez de responder só ao manual. Removido por completo (`ARENA_ASSIST_MIN_ANGLE`/`TURN_RATE`, o bloco em `updateArena`, o cálculo de `assistTarget` em `main.js`, e o parâmetro `opts` de `rail.update()`/`updateArena()` que tinha ficado sem mais nenhum uso).
4. **Impulso ariete: efeitos visuais novos** (`effects.js`+`main.js`) — verifiquei o código primeiro: o dano de verdade já acontecia (`ramDamage` chega até `enemies/index.js`), só faltava feedback visual, não era mecanismo quebrado. Adicionado, só enquanto `ramActive` (carta equipada E impulso ativo):
   - **Escudo angular**: reconstrução do antigo "shieldBubble" (removido em fase anterior) — era uma esfera-grade azul; agora um icosaedro wireframe (facetado/"anguloso", pedido literal do usuário) ao redor da nave, só durante o ram.
   - **Argolas ao redor do jogador**: uma nova a cada ~0.12s (`ramRing`), perpendiculares ao forward, expandindo e sumindo.
   - **Afterimage da nave**: silhueta simplificada (cone azul) deixada a cada ~0.05s (`ramAfterimage`), mesmo padrão do `homingAfterimage` já existente.
   - **Trail de propulsão restaurado**: o antigo `cometTrailParticle` (removido na Fase 7) voltou como `boostTrailParticle` — só que agora aparece durante QUALQUER impulso (`boostActive`), não só com a carta ariete equipada (a frase do pedido não menciona a carta especificamente nesse item; se a intenção era só durante o ram, é rápido de restringir).

**Testado**: `node --check` limpo em `effects.js`/`main.js`/`rail.js` e `selftest.mjs` passou a cada rodada. **Não confirmado ao vivo**: outra sessão está com um servidor de dev rodando nesta mesma pasta (o painel de preview desta sessão não alcança o dela) — não tentei subir um servidor próprio pra não conflitar. Compensado com revisão cuidadosa de cada diff e reaproveitamento maximizado de padrões já testados no próprio arquivo (`homingAfterimage`, `spinWind`, `smokeRing`, o `cometTrailParticle` antigo que eu mesmo já tinha visto funcionando antes de remover na v0.32.1).

**Versão**: v0.36.0 → v0.37.0.

## Classes de inimigo nomeadas + split em `src/enemies/` + 4 conteúdos novos — v0.34.0

Pedido do usuário, em 3 partes: **1)** dar nome formal à classe do vermelho comum atirador
("Blaster") e formalizar que as variações de cor/movimento (entregues na v0.33.0/v0.33.1) são
variantes da MESMA classe, não classes diferentes; **2)** separar cada CLASSE de inimigo (não
cada variação de cor) em seu próprio arquivo, numa pasta `src/enemies/`, pra ficar mais fácil de
editar; **3)** 4 pedaços de conteúdo novo — 2 variações de movimento pro enxame de mini-inimigos,
uma variante grande da ampulheta, um obstáculo cinza destrutível ("Detrito"), e um inimigo
quadrado inédito ("Sentinela").

**Nota de processo importante**: esta entrega rodou em cima de uma árvore MUITO ativa — 3
commits concorrentes (`db7946a`/`279aef0`/`31b554b`, v0.34.0-v0.36.0 numeração deles, sobre o
`enemies.js`/`combat.js`/`player.js`/`main.js` monolíticos antigos) aconteceram DURANTE esta
sessão, incluindo uma mudança que eu precisava de qualquer forma (`player.takeDamage(amount)`
virou variável em vez de sempre 1, para escalar dano por dificuldade — reaproveitei direto pro
meu pedido de "laser da ampulheta mega causa muito dano ao escudo", sem precisar tocar em
`player.js`). Recebi inclusive um aviso via mensagem entre sessões (outra Claude Code rodando no
mesmo projeto) sobre esse risco — cheguei a reler tudo de novo bem na hora certa, então nada do
que a outra sessão fez (teleporte do dourado, multi-lock no chefe/dourado, preview de 5s,
timers/cutscenes da Fase 3) se perdeu; só precisei portar cada pedaço pro arquivo de classe
certo em vez de deixar tudo num `enemies.js` só.

### Arquitetura do split (`src/enemies/`)
Um arquivo por CLASSE (`blaster.js`, `miniSwarm.js`, `timeEnemy.js`, `tank.js`, `boss.js`,
`golden.js`, `detrito.js`, `sentinela.js`, `shared.js` com helpers sem estado) + `index.js`
como orquestrador: mantém os arrays compartilhados (`enemies`, `enemyProjectiles`, `enemyLasers`,
`enemyGates` novo) e o loop principal de `updateEnemies`, despachando movimento/tiro/cor/hp por
`kind` pros arquivos de classe (cada um exporta funções puras: `spawnX`, `updateXMovement`,
`xColor`, `xPassBehind`, `disposeX`). `golden.js` é a exceção — continua com array próprio
(`goldenTargets`) igual já era antes, por ser tratado à parte no `resolveProjectileHit` desde
sempre. `combat.js`/`main.js` trocaram `from './enemies.js'` → `from './enemies/index.js'`
(únicos 2 importadores). `enemies.js` antigo foi apagado, 100% migrado.

### 1. Blaster (renomeação)
`kind: 'red'` → `kind: 'blaster'` em todo canto (era 100% interno, nada fora de `enemies.js`
referenciava a string `'red'` — confirmado por grep antes de mexer). Comportamento idêntico ao
entregue na v0.33.0/v0.33.1 (6 perfis de cor/movimento).

### 2. Mini-swarm: variantes zigue-zague e espiral
`miniSwarm.js`: além do mergulho reto original (cor clara `0xff8080`), 2 variantes novas
sorteadas por spawn (o grupo inteiro usa a mesma): `zigzag` (ciano `0x4de1ff`, offset lateral
senoidal contínuo por cima da reta) e `spiral` (verde-limão `0x9dff4d`, offset circular contínuo
crescendo com o tempo — hélice avançando em linha). HP/velocidade/spawn inalterados.

### 3. Ampulheta mega
`timeEnemy.js`: `spawnTimeEnemyMega()` — escala 1.6×, cor roxa mais rica/escura (`0x7a00e0`),
10 HP (vs 5 da normal — que por sinal já tinha subido de 3→5 num dos commits concorrentes
citados acima). "Fica mais tempo em tela": reaproveita o mesmo truque do perfil `follow` do
Blaster, `PASS_BEHIND` 4× mais tolerante. Ataque: dispara um LASER reto (mesma técnica visual do
laser do chefe) em vez do cone de projétil comum, com `shieldDamage: 4` — suficiente pra estourar
o escudo cheio numa hitada só mesmo com upgrade (`SHIELD_MAX_CAP` é 4). Spawna naturalmente
~20% das vezes que o branch de ampulheta normal dispara (`main.js`, `TIME_ENEMY_MEGA_CHANCE`).

**Plumbing de dano** (pro "muito dano ao escudo" funcionar de verdade): antes, TODO hit no
jogador virava `player.takeDamage()` sem parâmetro, sempre 1 ponto. A própria árvore concorrente
já tinha acabado de mudar `player.takeDamage(amount = 1)` pra escalar com dificuldade por erro
(`enemyDamageValue` em `main.js`) — só faltava threading pra hits ESPECÍFICOS (laser da mega,
borda da moldura da sentinela) declararem seu próprio `shieldDamage` maior. Adicionei: cada
projétil/laser/moldura ganha campo `shieldDamage` (default 1); `updateEnemyProjectiles`/
`updateEnemyLasers`/`updateEnemyGates` (`enemies/index.js`) devolvem `{hits, damage}` (damage =
MAIOR valor do frame, não soma); `combat.js` agrega isso em `enemyDamage` no retorno de
`update()`; `main.js` chama `player.takeDamage(Math.max(enemyDamageValue, events.enemyDamage ||
1))` — nunca deixa a escalada por erro abafar o ataque especial nem o contrário.

### 4. Detrito (obstáculo cinza destrutível)
`detrito.js`: `IcosahedronGeometry` cinza (`0x888888`), rotação inicial aleatória + giro lento
contínuo por vida visual, 6 HP, sem movimento nem tiro (`fireTimer: Infinity`). Spawna em arena
OU trilho. `main.js`: timer PRÓPRIO (`detritoTimer`, 4-8s), decrementado sempre que
`enemiesActive` é true — **sem** checar `spawnPauseThreshold`/`cycleTimer`/`currentEnemyCap()`
(confirmado com o usuário: ignora as duas regras que os outros inimigos seguem). Kill dá bônus
de pontos menor que o normal (`DETRITO_KILL_BONUS = BLASTER_KILL_BONUS / 2`, confirmado).

### 5. Sentinela (inimigo quadrado inédito, só trilho)
`sentinela.js`: nave quadrada azul-aço (`0x3fa9f5`), 10 HP, **só spawna em trilho** (`spawnSenti-
nela` retorna `null` em arena, mesmo guard do mini-swarm). Persegue mantendo distância (reaprovei-
ta o mesmo princípio do perfil `follow` do Blaster — corrige posição pra um "standoff" fixo à
frente, nunca cruza o jogador). Ataque: dispara 4 "molduras" quadradas — 4 caixas formando um
quadro tipo janela (a parte visual PREENCHE de verdade a faixa entre o buraco interno e a borda
externa, não é só um aro fino — importante pro que o jogador vê bater com o que realmente causa
dano). Cada moldura trava a posição do jogador no instante do disparo (mesmo truque do laser do
chefe), viaja até essa distância e resolve UMA VEZ: se a posição atual do jogador (que pode ter
se mexido pra desviar) cai dentro do buraco → seguro; na faixa da borda → dano normal
(`shieldDamage: 1`); além da borda externa → também seguro (errou o alcance). Depois do 4º
disparo, entra em modo "indo embora" (acelera pra trás até sair de tela, sentido oposto ao avanço
do Blaster) e não atira mais. Entra na rotação natural de spawn (`main.js`,
`SENTINELA_SPAWN_CHANCE = 0.12`, mesmo branch de time/mini-swarm/blaster).

### Testado
`node --check` limpo em todo arquivo novo/tocado (`enemies/*.js`, `combat.js`, `main.js`,
`debug.js`) — reconferido de novo no fim, depois de mais 3 arquivos (`effects.js`/`rail.js`/
mais um trecho de `main.js`) mudarem por baixo por causa de uma sessão concorrente adicionando
uma opção nova em `effects.explosion()` (`{rings:true}`), inclusive dentro dos meus arquivos
novos ainda não commitados (`boss.js`, `golden.js`, `index.js`) — puramente aditivo, mantive.
**Testado ao vivo** (servidor estático, debug panel): spawnei cada classe/variante nova (Detrito,
Sentinela, ampulheta mega, mini-swarm 3× até sortear zigue-zague/espiral) sem nenhum erro de
console em nenhum momento — antes/depois de cada spawn, e num reload limpo no final já com tudo
junto (meu trabalho + as mudanças concorrentes). Confirmado por unit-test manual no console do
navegador (`resolveGateHit` importado direto e chamado com casos sintéticos: centro do buraco
seguro, quase-buraco seguro, borda com dano em eixo E diagonal, além do alcance externo seguro —
os 5 casos bateram com o esperado). **Não confirmado por gameplay orgânico completo**: a mesma
limitação de rAF sem foco de SO documentada no resto do histórico do projeto deixou o relógio do
jogo rodar devagar demais pra ver a Sentinela completar as 4 rodadas de disparo ou a ampulheta
mega disparar o laser em tempo real — compensado pelo teste unitário da matemática da moldura
acima e pela revisão cuidadosa do resto do código.

**Versão**: v0.33.1 → v0.34.0.
