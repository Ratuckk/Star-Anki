## Pendências agora

- [ ] Fase 4: roguelike de cartas (ofensivo/defensivo/utilitário), nave-cosmética extra, tiro carregado teleguiado, giro-desvio Z/C.
- [ ] `.claude/launch.json`: CLAUDE.md menciona "dois `.claude/launch.json` que precisam ficar sincronizados", mas nenhum arquivo existia neste projeto antes da v0.14.0 (criei um do zero — ver seção v0.14.0). Se existir um segundo em outro lugar, perguntar ao usuário onde, pra manter sincronizado.
- [ ] `src/selftest.mjs` linha 117 espera `session.shields === 3`, mas `STARTING_SHIELDS` é 10 — desatualizado desde antes desta sessão (não mexi, fora de escopo da v0.14.0).
- [ ] Testar o build atual com o baralho real do usuário.
- [ ] Usuário escolher (se quiser) qual das ideias de inimigo futuro (ver seção abaixo) implementar em seguida.
- [ ] Reconfirmar ao vivo que tiro certeiro no dourado especial = +50 sem tocar combo/escudo.
- [x] Gameplay de dano/vida: vidas, escudo, invencibilidade, shake, backgrounds — v0.16.0 (Fase 3 do pedido grande).
- [x] Repositório conectado ao GitHub (`github.com/Ratuckk/Star-Anki`), push automático a partir de agora.
- [x] Ambiente de testes: launcher com auto-shutdown do servidor — v0.15.0 (Fase 2 do pedido grande).
- [x] Bugfix: feedback do bônus dourado ficava preso na tela após resolver — v0.14.1.
- [x] Pré-jogo, baralhos múltiplos, debug, editor, keybindings + gamepad — v0.14.0 (Fase 1 do pedido grande).
- [x] Workflow `star-anki-combat-rework` — feito.
- [x] Revisão de combate — bug de alcance de spawn corrigido.
- [x] Tarefa `star-anki-golden-enemy` — dourado especial, redutor de tempo, timer sempre visível, baralho aumentado.
- [x] Correções v0.8.1 — escudos visíveis, `DEBUG` desligado, teardown blindado.
- [x] D20 verde + canhões duplos — v0.9.0.
- [x] Baralho salvo no localStorage — v0.10.0.
- [x] Efeitos visuais (starfield, explosões, rastro, muzzle flash, vinheta) — v0.11.0.
- [x] Mira estilo Star Fox 64 (lock-on, resposta direta, reticle visual) — v0.12.0.
## Gameplay de dano/vida: vidas, escudo, invencibilidade, shake, backgrounds — v0.16.0

Fase 3 do pedido grande. Implementa a cascata de dano já alinhada com o usuário: **Escudo → Saúde → Vida**.

- **Renomeação `shields` → `health`**: o campo antigo `session.shields` (o pool de 10 hits que já existia) virou `session.health` em todo lugar (`quiz.js`, `hud.js`, `main.js`, `selftest.mjs`). Isso liberou o nome "shield/escudo" pra a camada de defesa nova, sem ambiguidade. `STARTING_SHIELDS` → `STARTING_HEALTH` (ainda 10), e um novo `STARTING_LIVES = 3` em `quiz.js`. De quebra, corrigi a asserção pré-existente e desatualizada em `selftest.mjs` que esperava `session.shields === 3` (era o valor de vidas, não de saúde — resquício de uma versão anterior do jogo).
- **Vidas** (`session.lives`, 3 iniciais): saúde zerada consome 1 vida e reabastece a saúde (e o escudo) ao máximo; zerar as vidas é que termina a run de verdade. A decisão fica em `applyHealthLoss()` (closure em `main.js`), chamada tanto no hit de inimigo em tempo real (`tick()`) quanto ao errar uma pergunta (`settleQuestion()`, via `resolveAnswer` que só decrementa `session.health` — quem decide game-over agora é sempre `main.js`, não `quiz.js`). `nextQuestion()` em `quiz.js` passou a checar `session.lives <= 0` em vez de saúde, já que saúde em 0 agora é um estado transitório (sempre resolvido antes da próxima pergunta ser pedida).
- **Escudo** (`shieldCharges`/`shieldRechargeTimer`, estado local em `mountGame` — não faz parte de `session` porque não é sobre pontuação/progresso, é uma mecânica de defesa em tempo real): aguenta `SHIELD_MAX = 2` hits sem tocar a saúde; ao esgotar (chegar a 0), entra em recarga de `SHIELD_RECHARGE_MS = 5000` e só volta ao máximo de uma vez no fim (não regenera carga por carga). Fica como variável mutável de propósito — é onde a Fase 4 (roguelike) vai plugar os buffs de "mais cargas"/"recarga mais rápida".
- **Invencibilidade**: `INVINCIBILITY_MS` 1200 → 1500 (pedido: "1 segundo e meio"). O piscar da nave já existia (`rail.setShipVisible` com flicker) — não mexido.
- **Screen-shake + nave chacoalhando**: `HIT_SHAKE_DURATION_MS = 300`, decaindo linearmente. Câmera: jitter aplicado por último no `tick()`, só na posição de render (depois de tudo que depende de `camera.position` já ter sido calculado — mira, barras de vida de inimigo — então não distorce nada de jogabilidade). Nave: `rail.js` ganhou `setShakeIntensity(magnitude)` — `main.js` decide a curva de decaimento e passa o valor a cada frame; `rail.js` só aplica um jitter na posição RENDERIZADA da nave, depois de já orientada (não mexe em `playerX`/`playerY`/`lastPlayerPos`, que são o que colisão e mira usam — shake é 100% cosmético).
- **Backgrounds por "nível"**: paleta de 6 cores escuras (`LEVEL_BACKGROUNDS` em `main.js`), trocada a cada `enterCombat()` com base em `session.pointer % 6` — dá a ilusão de ambientes diferentes a cada pergunta do setor, sem mudar nada de jogabilidade (`scene.background` e `scene.fog.color`).
- **Explosão ao destruir inimigo**: já existia (`effects.explosion()`, feito na v0.11.0) — conferido, cobre todos os casos (inimigo comum, redutor de tempo, alvo de pergunta, bônus, dourado, e agora também o inimigo "tanque" do debug).
- **HUD nova**: `hud-lives-bar` (triângulos ciano, ícone de "nave extra") e `hud-shield-bar` (círculos azuis + barrinha de recarga) empilhados entre o placar e a barra de saúde — todos usando o mesmo padrão de pool de pips já existente. `hud.setLives(lives, maxLives)` e `hud.setShield(charges, maxCharges, rechargeFrac)` são novos métodos, chamados a cada frame do `tick()` igual o `setStatus` já existente.
- **Debug**: `Causar 1 dano` agora aciona a mesma cascata de vida real (antes só mexia em `session.health` direto, sem consumir vida ao chegar em 0 — inconsistente com o hit de verdade; corrigido depois de pegar isso testando ao vivo). Dois botões novos: `Perder 1 vida` (força a cascata sem precisar zerar a saúde primeiro) e `Recarregar escudo`.
- **Testado ao vivo**: escudo absorve hit sem tocar saúde (2→1→0 cargas) → barra de recarga aparece e enche → volta a 2/2 → saúde zerada via debug reabastece sozinha e tira 1 vida (confirmado lendo `session.lives` via o próprio HUD, inclusive descobri e documentei que o HUD só repinta no próximo `tick()`, que fica bem mais lento com a aba em segundo plano — não é bug, é throttling de `requestAnimationFrame` do navegador) → última vida perdida termina a run ("Setor concluído"), sem erros no console em nenhum momento.
- **Não mexido**: `src/anki.js`, `src/effects.js`, roguelike/tiro carregado/movimentação avançada (fase 4).

**Versão**: v0.15.0 → v0.16.0.

## Repositório conectado ao GitHub

Projeto agora tem `.git` local (não tinha antes) conectado a `github.com/Ratuckk/Star-Anki`, que já existia com o histórico até a v0.13.0 (mesma origem — "tudo que tá lá foi o que iniciamos por aqui"). Reconciliei sem perder histórico: `git init -b main` + `git remote add origin` + `git fetch` + `git reset origin/main` (reset misto, não toca nos arquivos locais) — daí as mudanças da v0.14.0 em diante apareceram como diffs prontos pra commitar em cima do histórico existente, sem sobrescrever nada.

Pegadinha de autenticação: o `gh` da máquina estava logado como conta **Ziaker** (permissão só de leitura nesse repo específico). O dono de fato é **Ratuckk** — precisou `gh auth login --web` pra trocar de conta antes de conseguir dar push. Se aparecer erro de permissão num push futuro, primeiro conferir `gh auth status` (qual conta está ativa).

**O usuário pediu push automático daqui pra frente** — documentado no `CLAUDE.md` (seção "Git"): a partir de agora, toda entrega (fim de fase, bugfix) recebe commit + `git push origin main` sem pedir confirmação a cada vez. Só continuo seguindo as regras normais de segurança git (nunca force-push, revisar `git status` antes de `git add -A`).

## Ambiente de testes: launcher com auto-shutdown — v0.15.0

Fase 2 do pedido grande: "crie um programa que rode o jogo, fechar ele deve obrigatoriamente e forçadamente fechar o servidor também."

Em vez de empacotar um app Electron (pesaria muito num projeto "sem bundler, ES modules nativos"), fiz um launcher leve só com módulos nativos do Node (`node:http`, `node:fs`, `node:child_process` — zero dependências pra instalar):

- **`tools/run-game.mjs`**: servidor HTTP estático (serve a raiz do projeto, com MIME types corretos) escutando em `127.0.0.1:8420` (só localhost, não expõe na rede). Abre o navegador padrão do usuário em `http://127.0.0.1:8420/?launcher=1` via `start`/`open`/`xdg-open` conforme a plataforma.
- **Auto-shutdown por heartbeat**: `index.html` ganhou um `<script>` inline (não-módulo, antes do `main.js`) que só ativa quando `?launcher=1` está na URL — manda `fetch('/__ping', {keepalive:true})` a cada 2s. O servidor guarda o timestamp do último ping e um watchdog (`setInterval` de 1s) chama `shutdown()` se passar 6s sem ping — ou seja, se a janela/aba do jogo for fechada, o servidor se encerra sozinho em até ~7s. Fora do launcher (ex: `preview_start` do Claude, ou `python -m http.server`), o parâmetro nunca aparece na URL, então o ping nunca dispara — inofensivo.
- **Fechar o processo também mata o servidor**: `SIGINT`/`SIGTERM` (Ctrl+C, fechar o terminal) chamam o mesmo `shutdown()`. Como o servidor roda no mesmo processo do terminal, fechar a janela do terminal mata os dois juntos de qualquer forma.
- **`start-game.bat`**: clique-duplo no Windows — roda `node tools\run-game.mjs`, com `pause` no fim pra manter o console visível até o usuário fechar.
- **Testado**: rodei o servidor, conectei via Browser pane (`?launcher=1`), confirmei pings periódicos chegando (`/__ping` → 204) e o jogo carregando normalmente pelos arquivos servidos pelo launcher. Fechar só a aba do Browser pane não derrubou o servidor porque o `start` do launcher também abriu uma janela real do navegador padrão do usuário no desktop, que continuou mandando ping — confirma que o rastreamento de "ainda tem alguém pingando" funciona como esperado. Encerrei o processo manualmente (`taskkill`) ao fim do teste; se uma janela de navegador ficou aberta no desktop do usuário por causa desse teste, é inofensiva — só fechar.
- **Não mexido**: nada do jogo em si; só a camada de serving/launcher e um `<script>` inline guardado por query param no `index.html`.

**Versão**: v0.14.1 → v0.15.0.

## Bugfix: feedback do bônus dourado preso na tela — v0.14.1

Usuário reportou: depois de derrotar o inimigo dourado especial e responder a pergunta bônus, a caixa de feedback (com fundo semi-transparente) ficava flutuando na tela em vez de sumir quando o jogo voltava ao combate normal.

Causa: `resumeCombatFromGolden()` (chamado ao fim da fase `goldenResolution`) trocava a fase de volta pra `'combat'` mas nunca chamava `hud.setFeedback(null)` — diferente do fluxo normal de pergunta, que passa por `enterCombat()` e limpa tudo (`setQuestion`, `setAlternatives`, `setFeedback`, etc). `settleGoldenBonus()` seta o feedback corretamente, só ninguém limpava depois.

Fix: uma linha — `hud.setFeedback(null)` dentro de `resumeCombatFromGolden()` em `main.js`.

**Versão**: v0.14.0 → v0.14.1.

## Pré-jogo, baralhos múltiplos, debug, editor, keybindings + gamepad — v0.14.0

Fase 1 de um pedido grande (22 mudanças em 3 blocos: pré-jogo, ambiente de testes, gameplay). Antes de implementar, alinhei com o usuário 3 decisões de arquitetura via pergunta direta — valem para as próximas fases também:

- **Vida** (fase 3, ainda não implementada): cascata Escudo → Saúde (10 hits) → Vidas (3). Hit consome escudo primeiro; sem escudo, consome a barra de saúde; saúde zerada consome 1 vida e reseta a saúde.
- **Roguelike** (fase 4, ainda não implementado): a cada acerto abre escolha de carta, substituindo o `applyBuff()` automático atual.
- **Esquiva Z/C** (fase 4): só i-frames + animação de giro no lugar, sem deslocar a nave (mais simples que dash físico).

Entrega dividida em 4 fases, testando cada uma antes de avançar — só a Fase 1 foi implementada agora.

**Novos módulos**: `src/decks.js` (múltiplos baralhos salvos em `star-anki-decks-v1`, com migração automática do antigo `star-anki-saved-deck` de baralho único), `src/settings.js` (`star-anki-settings`: vida inicial, toggle de barra de vida de inimigo), `src/keybindings.js` (`star-anki-keybindings`: mapa de ações→códigos + config de gamepad, com merge sobre defaults pra não quebrar quem já jogou), `src/debug.js` (metadados das ações do painel de debug).

**Fluxo de telas mudou**: `index.html` trocou o antigo `#load-screen` único por `#pregame-screen` → `#deck-manager-screen` → `#settings-screen`, tudo orquestrado em `hud.js` (que agora importa `decks.js`/`settings.js`/`keybindings.js` diretamente e é praticamente autocontido — `main.js` só entra pra navegação e pra realmente montar o jogo). `restart()` em `main.js` abre o menu de pré-jogo em vez do load screen direto. "Jogar novamente" na tela de fim de setor agora replay direto o mesmo baralho (`currentDeckId` guardado em módulo), sem passar pelo menu de novo.

**Debug** (crase `` ` `` abre/fecha, remapeável): spawns de todos os tipos de inimigo/alvo + um inimigo "tanque" configurável (5 hp, só existe no debug — inimigos normais continuam com 1 hp, comportamento de jogo inalterado), forçar acerto/erro da pergunta atual, pontos/cura/dano/vida cheia, god mode, tiro infinito, buffs máximos, ir direto pra arena de chefe/dourada, limpar inimigos/projéteis, hitboxes visíveis (wireframes nos raios de colisão reais — `combat.js` ganhou `setShowHitboxes`), câmera lenta (0.25x, multiplica o `dt` do tick). A lógica de cada ação vive em `main.js` (só lá tem acesso a `combat`/`rail`/`session` do closure de `mountGame`); `hud.js` só sabe montar botões a partir de `debug.js` e receber os handlers via `hud.debug.bind(...)`.

**Barra de vida de inimigo** (toggle em Configurações): `combat.js` ganhou `hp`/`maxHp` por inimigo (default 1, comportamento normal inalterado — só o inimigo tanque do debug tem >1) e `getEnemySnapshots()`; `main.js` projeta a posição de cada um pra tela (mesma técnica já usada pra mira) e `hud.js` desenha barras DOM pooled por id.

**Keybindings + gamepad**: `input.js` não tem mais constantes fixas — lê tudo de `keybindings.js` na criação de cada sessão (rebind só é possível fora do jogo, na tela de Configurações, então não precisa reler ao vivo). Editor de controles com captura de tecla (clica, aperta a tecla, salva). Pra gamepad, em vez de um fluxo de "captura" (frágil com controles genéricos variados), fiz um **painel de diagnóstico ao vivo**: mostra todos os eixos (barra -1..1) e botões (0..N, acende quando pressionado) do primeiro controle conectado, com botões inline pra escolher qual eixo é X/Y e quais botões contam como tiro — o usuário vê o número certo antes de escolher, resolve o "não sei se meu controle genérico funciona".

**Gotcha de teste descoberto nesta sessão**: a ferramenta de automação de browser usada aqui (`mcp__Claude_Browser__computer` com `action: key`) manda `KeyboardEvent` com `.key` preenchido mas `.code` **vazio**. Como o input do jogo (original, não mudei isso) sempre usou `e.code`, não dava pra testar atalhos de teclado clicando/apertando tecla via essa ferramenta — tive que despachar `KeyboardEvent` sintético via `javascript_tool` com `code` setado manualmente pra exercitar o mesmo listener. Isso é uma limitação da ferramenta de teste, não do jogo — um teclado físico real manda `.code` normalmente. Vale lembrar pra sessões futuras de teste.

**`.claude/launch.json` não existia** — criei um novo (`python -m http.server 8420`, nome `static`, porta 8420) pra bater com o que o CLAUDE.md descreve. Não achei o "segundo" launch.json que o CLAUDE.md menciona precisar ficar sincronizado — a nota original sobre isso não estava mais no progresso.md (arquivo já estava curto/truncado quando comecei esta sessão). Se o usuário souber onde está o outro, atualizar aqui.

**Testado ao vivo** (servidor local + browser): pré-jogo → adicionar baralho real (arquitetura-manutencao-aumentado.txt, 20 cartas) → contagem certa (20 combate/0 painel) → preview de perguntas → jogar → HUD com barra de 10 hits → fim de setor → "Jogar novamente" replay direto → debug panel (spawns, god mode, tiro infinito, hitboxes visíveis, limpar inimigos — todos sem erro no console) → Configurações (vida inicial, toggle de barra de inimigo, rebind de tecla com persistência em localStorage confirmada, restaurar padrão, diagnóstico de gamepad renderiza mesmo sem controle conectado) → barra de vida de inimigo tanque renderiza (100% fill, posição projetada corretamente).

**Não mexido**: `src/anki.js`, `src/rail.js`, `src/effects.js`, jogabilidade/dano/pontuação/dificuldade/ciclos/chefes (isso é fase 3/4).

**Versão**: v0.13.0 → v0.14.0.

## Mira com curso próprio + nave mais calma — v0.13.0

O usuário reportou que "a mira está exatamente na mesma posição da nave" e pediu que ela (1) se movesse mais que a nave, (2) chegasse nas extremidades antes da nave, (3) mantivesse o lock-on (que será usado pra um tiro carregado no futuro). Leva cirúrgica:

- **`rail.js`**: `LATERAL_SPEED` 34 → 26 (nave mais calma, sem ficar lenta demais). Novo método público `getPlayerLateral()` que expõe `{ x, y }` crus do jogador, ANTES de qualquer offset de trilho/câmera.
- **`main.js`**: nova constante `RETICLE_LATERAL_MULT = 4`. Quando não há lock-on, a mira agora é calculada a partir da posição lateral CRUA amplificada 4x (em vez de partir do nariz da nave, como era antes). Resultado: com a nave na metade do curso, a mira está no dobro do caminho; com a nave no máximo, a mira já passou da borda visível. A mira tem curso próprio de verdade, não anda colada no nariz.
- **Lock-on mantido sem alteração** — quando há alvo travado (aim assist detecta), a mira pula pra cima do alvo e fica verde pulsante, como na v0.12.0. O usuário confirmou que quer esse comportamento preservado pra um futuro tiro carregado.
- **Não mexido**: `combat.js`, `hud.js`, `effects.js`, `anki.js`, `quiz.js`, `storage.js`. Nenhuma lógica de combate ou pontuação mudou.
- **Valores de ajuste fácil**, caso o usuário queira calibrar:
  - `RETICLE_LATERAL_MULT` em `main.js` → quanto a mira amplifica o movimento lateral (4 = bem solto; 2 ou 3 = mais contido).
  - `LATERAL_SPEED` em `rail.js` → velocidade da nave no eixo lateral (26 = atual; 20 = mais lenta; 32 = volta perto do original).
- **Versão**: v0.12.0 → v0.13.0.
## Efeitos visuais — v0.11.0

Pedido do usuário: "queria adicionar mais efeitos visuais, está tudo muito bland". O jogo tinha luz ambiente, um sol direcional, um grid de chão e um fundo preto liso — funcional, mas sem nenhuma camada visual. Cinco efeitos adicionados, todos sem tocar em jogabilidade:

- **Módulo novo `src/effects.js`** (`createEffectsSystem(scene)`): centraliza tudo. Expõe `update(dt, shipPosition, shipForward, opts)`, `explosion(position, colorHex, size)`, `muzzleFlash(position, direction)` e `dispose()`. Os efeitos transientes são criados sob demanda e descartados quando a vida útil acaba; o starfield é único e dura a sessão inteira.
- **Starfield** (1400 pontos numa casca esférica achatada de raio 260–640, com cores levemente variadas — maioria branca, algumas azuladas, algumas alaranjadas). `fog: false` no material, senão o `FogExp2` do cenário engoliria qualquer coisa a 200+ unidades. `depthWrite: false` pra estrelas não ocluírem nada e `depthTest` padrão pra serem ocluídas pelo cenário quando atrás. Como o trilho é um loop fechado que nunca sai da região ±190 da origem, o campo de estrelas sempre envolve a cena e gera paralaxe natural conforme a nave avança. **Impacto visual gigante sozinho** — a maior parte da sensação de "space game" vem daqui.
- **Explosões**: `combat.js` chama `effects.explosion()` no ponto exato de cada morte, com a cor do objeto (alvo de quiz usa `SHAPE_COLOR[alt.color]`, inimigo vermelho `0xff4d4d`, redutor de tempo `0xb026ff`, bônus verde `0x2bff6b`, dourado especial `0xfff2a0` com size 1.8). 16 partículas por burst, com `AdditiveBlending`, drag (velocidade decai 2.5/s) e fade. A animação de encolher continua existindo por baixo — as duas camadas juntas ficam melhores que qualquer uma sozinha. `colorHex` é gravado no target no momento do spawn (`spawnQuizTargets`/`spawnBossTargets`) porque o material não sabe mais qual cor é depois.
- **Rastro do motor**: partículas ciano (`0x8fdcff`) saindo da traseira da nave a cada ~35ms, cadência proporcional ao `speedMultiplier` (mais rápido = mais denso). Velocidade `-shipForward * 8`, vida 0.7s, encolhem e desaparecem. Em arena (chefe/dourado) continua ativo — a nave está sempre se movendo.
- **Muzzle flash**: pequeno flash aditivo no nariz da nave a cada tiro, expandindo de 1x a 1.5x em 70ms. Como o flash usa `shotDirection` (já corrigido pela mira assistida) e não a direção bruta da câmera, ele fica alinhado com o tiro real mesmo quando a mira assistida está ativa.
- **Vinheta de dano** (HUD, não Three.js): overlay fullscreen em CSS com `radial-gradient` vermelho nas bordas (centro limpo, não atrapalha a visão). `hud.damageFlash()` reinicia a animação de 0.5s a cada hit — remove a classe, força reflow (`void offsetWidth`), readiciona. Chamado em `main.js` no mesmo ponto onde o escudo é decrementado.
- **Integração**: `createCombatSystem(scene, rail, effects)` — novo 3º parâmetro **opcional** (`effects = null`). Se null/undefined, tudo funciona igual, só sem efeitos. `main.js` cria `effects` antes de `combat`, chama `effects.update()` a cada tick (após `rail.update` e `combat.update`), e `effects.dispose()` no `teardown`. `rail.js` **não mudou** — os efeitos só precisam de `getPlayerPosition()` e `getFrameAt(0).forward`, que já existiam.
- **Não mexido**: jogabilidade (danos, pontuação, buffs, dificuldade, ciclos, chefes), arquitetura de módulos, formato do baralho, baralho salvo, HUD existente (só ganhou a vinheta).
- **Versão**: v0.10.0 → v0.11.0.

## Baralho salvo — v0.10.0

[... o resto fica igual ao que já estava ...]
