# Progresso pós-v0.50 — novas documentações a partir daqui

Continuação do [PROGRESSO_POS_0.30.md](PROGRESSO_POS_0.30.md) (histórico v0.34.0 → v0.50.0, agora
congelado). A partir desta entrega, toda documentação nova entra neste arquivo.

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

