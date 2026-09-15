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
