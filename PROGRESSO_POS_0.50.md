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



