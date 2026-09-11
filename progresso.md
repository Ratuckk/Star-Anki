## Pendências agora

- [ ] Testar o build atual com o baralho real do usuário.
- [ ] Usuário escolher (se quiser) qual das ideias de inimigo futuro da tarefa `star-anki-golden-enemy` (ver seção abaixo) implementar em seguida — não implementar nenhuma sem ele escolher.
- [ ] Reconfirmar ao vivo (numa próxima sessão com timing) que tiro certeiro no dourado especial = +50 sem tocar combo/escudo. O código não mudou desde a confirmação original, mas a última sessão de revisão não conseguiu refazer esse teste específico (projéteis de teste ainda em voo quando o orçamento de tempo acabou). Risco residual baixo.
- [x] Workflow `star-anki-combat-rework` (núcleo de combate: inimigo vermelho que atira/é abatido, ciclo 90s+contador, roguelike de buff/dificuldade) — feito pelo agente anterior, e o chefe a cada 5ª pergunta (abaixo) foi construído em cima sem precisar tocar no que ele fez.
- [x] Revisão/teste a fundo de todo o pacote de combate (ver seção "Revisão de combate — bug de alcance corrigido" abaixo) — achou e corrigiu um bug real de posicionamento de spawn.
- [x] Tarefa agendada `star-anki-golden-enemy` (ver seção própria abaixo): inimigo dourado especial + pergunta bônus + All-Range, inimigo redutor de tempo, timer sempre visível, baralho de Arquitetura e Manutenção aumentado com 24 perguntas extras verificadas.
- [x] Versão subida pra v0.8.0 nesta leva (dourado especial, redutor de tempo, timer sempre visível).
- [x] Correções pós-v0.8.0 (ver seção "Correções — v0.8.1" abaixo): escudos invisíveis (CSS faltando), `DEBUG` do `rail.js` desligado, corrida de teardown no `main.js` blindada. Versão pra v0.8.1.
- [x] D20 verde + canhões duplos (ver seção "D20 verde + canhões duplos — v0.9.0" abaixo). Versão pra v0.9.0.
- [x] Baralho salvo no `localStorage` (ver seção "Baralho salvo — v0.10.0" abaixo). Versão pra v0.10.0.
- [x] Efeitos visuais (ver seção "Efeitos visuais — v0.11.0" abaixo): starfield, explosões, rastro de motor, muzzle flash, vinheta de dano. Versão pra v0.11.0.

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
