## Pendências agora

- [ ] Testar o build atual com o baralho real do usuário.
- [ ] Usuário escolher (se quiser) qual das ideias de inimigo futuro (ver seção abaixo) implementar em seguida.
- [ ] Reconfirmar ao vivo que tiro certeiro no dourado especial = +50 sem tocar combo/escudo.
- [x] Workflow `star-anki-combat-rework` — feito.
- [x] Revisão de combate — bug de alcance de spawn corrigido.
- [x] Tarefa `star-anki-golden-enemy` — dourado especial, redutor de tempo, timer sempre visível, baralho aumentado.
- [x] Correções v0.8.1 — escudos visíveis, `DEBUG` desligado, teardown blindado.
- [x] D20 verde + canhões duplos — v0.9.0.
- [x] Baralho salvo no localStorage — v0.10.0.
- [x] Efeitos visuais (starfield, explosões, rastro, muzzle flash, vinheta) — v0.11.0.
- [x] Mira estilo Star Fox 64 (lock-on, resposta direta, reticle visual) — v0.12.0.

## Mira estilo Star Fox 64 — v0.12.0

Pedido do usuário: "deixar o movimento da mira mais semelhante ao movimento de mira de Star Fox 64... de um jeito mais simples de controlar também, movendo a mira corretamente". Três mudanças cirúrgicas, nenhuma altera o combate:

- **`rail.js`** — `LATERAL_ACCEL_RATE` de 20 → 35. Como a mira é derivada da posição do nariz, a nave (e portanto a mira) leva ~0,03s pra responder ao stick em vez de ~0,05s. Fica snappy sem perder o peso. `LATERAL_SPEED` também subiu levemente, 32 → 34.
- **`combat.js`** — refatoração do lock-on. Antes, a mira assistida era calculada só dentro de `fire()`, no instante do disparo. Agora: função `findLockOnTarget(origin, direction)` extraída, chamada **todos os frames** dentro de `update()` (que passou a aceitar `aimOrigin`/`aimDirection` no `opts`). O resultado fica cacheado em `currentLockOn` e é exposto via `getLockOnTarget()`. `fire()` reusa o cache em vez de recalcular — mira e tiro saem do **mesmo** cálculo, então nunca dessincronizam.
- **`main.js`** — a posição da mira agora depende do lock-on: se há alvo travado, a mira pula pra cima dele (via `lockOn.mesh.position` projetada na tela); senão, cai no livre-arbítrio antigo (`nose + RETICLE_AHEAD_DISTANCE`). Também chama `hud.setReticleLocked()` a cada frame.
- **`hud.js`** — novo `setReticleLocked(bool)` que alterna a classe `.locked` no elemento da mira.
- **`index.html`** — CSS de `.reticle.locked`: cor verde `#6bffb0`, anel maior (34px → 44px), brilho, e animação `reticle-lock-pulse` (0.5s, alternando entre escala 1 e 1.12). Sem a classe, a mira é branca como antes.
- **Sensação resultante**: quando você passa o retículo perto de um alvo de pergunta, ele **trava** no alvo e fica verde pulsante, sinalizando que o tiro vai acertar. Soltando o alvo (afastando a nave), volta ao branco e ao livre-arbítrio. É o mesmo feedback visual do SF64.
- **Versão**: v0.11.0 → v0.12.0.
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
