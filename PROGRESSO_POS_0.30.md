# Progresso pós-v0.30 — novas documentações a partir daqui

Continuação do [PROGRESSO.md](PROGRESSO.md) (histórico até v0.33.x, agora congelado). A partir desta
entrega, toda documentação nova entra neste arquivo.

## Suporte a controle genérico: mapeamento de qualquer ação a um botão do gamepad — v0.48.0

Pedido do usuário: *"adicione suporte a controle gamepad genérico para mapeamento nas configurações"*. Antes desta entrega o suporte a controle era bem parcial: só movimento (2 eixos analógicos, configuráveis) e "tiro" (`fireButtons`, array fixo de índices) existiam de verdade; Pausar usava um caso especial hardcoded pro botão Start (`GamepadStart`); e nenhuma outra ação (inclinar, propulsor/repulsor, painel de debug, escolher resposta 1-4) tinha qualquer caminho de controle — só teclado.

1. **`keybindings.js` — `gamepad.buttons`, mapa genérico ação→botão(ões)**: substitui o antigo `gamepad.fireButtons` solto por `gamepad.buttons = { fire, dodgeLeft, dodgeRight, propulsion, repulsion, pause, debugToggle, quizSlot1..4 }` (`GAMEPAD_ACTIONS`, exportado). Movimento continua de fora de propósito — é analógico, "botão = direção" não faz sentido com um analógico disponível. `getBindings()` migra sozinho o formato antigo (`storedGamepad.fireButtons`) pra dentro de `buttons.fire` se o usuário tiver configuração salva de antes desta entrega, sem perder o que ele já tinha ajustado. Novas funções `setGamepadActionButton(actionId, buttonIndex)` (substitui, não soma — mesmo padrão do rebind de teclado) e `clearGamepadActionButton(actionId)`.
2. **`isActionPressed` estendido pra aceitar id de ação, não só code de teclado**: `pressedSet` (o `Set` que sai de `input.js` a cada frame) agora pode conter tanto codes de teclado (`'ArrowLeft'`) quanto ids de ação (`'pause'`, `'dodgeLeft'`, etc.) — `isActionPressed` checa `pressedSet.has(action)` primeiro. Isso deixa **todo** o código que já chamava `isActionPressed(bindings, inputState.pressed, 'pause'|'debugToggle'|'dodgeLeft'|'dodgeRight'|'propulsion'|'repulsion')` em `main.js` funcionando com controle automaticamente, sem tocar em `main.js` além de remover o caso especial do Start (ponto 4).
3. **`input.js` — botões de controle viram hold E borda, iguais ao teclado**: `readGamepadButtons()` (novo) lê o primeiro controle conectado, computa held/borda-de-subida por ação a partir de `bindings.gamepad.buttons`, e: (a) pra ações de hold contínuo (fire/dodgeLeft/dodgeRight/propulsion/repulsion) faz OR direto com o valor do teclado — os dois métodos de entrada não competem, qualquer um ativa; (b) pra ações de borda (a mesma lista que já existia em `edgeCodes()`, agora exportada como `GAMEPAD_EDGE_ACTIONS` e reaproveitada dos dois lados) adiciona o id da ação em `pressedThisFrame` na subida do botão mapeado. O cálculo de `bank` (inclinação visual) foi movido de dentro de `readKeyboard()` pra fora, combinando `dodgeLeftHeld`/`dodgeRightHeld` de teclado e controle ANTES do tie-break de "qual foi apertado por último" — `dodgeLeftTime`/`dodgeRightTime` (já existiam pro teclado) agora também são atualizados na borda de subida do botão de controle mapeado, então o mesmo tie-break serve pros dois.
4. **Pausar via Start deixou de ser caso especial**: removido `prevPadStart`/`'GamepadStart'` hardcoded (default do botão 9 pra `pause` em `DEFAULT_GAMEPAD.buttons` já cobre o mesmo caso, e agora é remapeável como qualquer outra ação).
5. **Configurações (`hud-settings.js`) — nova seção "Ações mapeáveis a um botão do controle"**: uma linha por ação (reaproveita os labels de `ACTIONS`, já usados no editor de teclado), botão "Definir" que entra em modo de espera ("Pressione um botão no controle...") e captura o PRÓXIMO aperto (borda de subida, detectado no mesmo loop de `pollGamepad()` que já existia pro feedback visual dos eixos/botões — também dá pra clicar direto num dos chips de botão na grade de baixo em vez de apertar fisicamente) — mesmo padrão de UX do rebind de teclado existente. Botão "Limpar" desmapeia. A grade de botões (`gp-btn-chip`) perdeu o clique-pra-alternar-fire antigo (substituído pela seção nova, mais genérica) e virou só feedback visual de qual índice é qual.
6. **Escolha de resposta (quiz) e de carta roguelike (`hud-game.js`) também aceitam controle agora**: os dois modais (`revealQuestionModal`, `showCardChoice`) já liam teclado 1-4 direto por `bindings.actions.quizSlotN` (sistema paralelo ao de `input.js`, com pausa total do jogo então roda fora do loop principal) — sem tocar nesse mecanismo, adicionado `watchGamepadSlots(count, onSlot)`, um poll próprio via `requestAnimationFrame` enquanto o modal está aberto, que dispara na borda de subida do botão mapeado pra `quizSlot{i+1}`. As 3 vias de escolha (clique, tecla, controle) convergem pra uma função `pick(i)` única por modal, evitando triplicar o teardown dos 3 listeners/watchers — parado em todo caminho de fechamento (escolha feita, `hideQuestionModal`, `unmount`).

**Testado**: `node --check` limpo em `keybindings.js`/`input.js`/`main.js`/`hud-game.js`/`hud-settings.js` e `selftest.mjs` passou. **Testado ao vivo**: servidor de teste próprio, zero erro de console no carregamento e na tela de Configurações — a seção nova renderiza os defaults corretos (Atirar: Botão 0/7, Inclinar esquerda: Botão 4, Inclinar direita: Botão 5, Pausar: Botão 9, Painel de debug: Botão 8, Propulsor/Repulsor/Resposta 1-4: sem mapa por padrão) e o botão "Definir" entra no estado de espera visualmente. **Verificado por teste sintético direto no console do navegador** (mesmo padrão já estabelecido no histórico do projeto, com um objeto `Gamepad` fabricado substituindo `navigator.getGamepads`) pros pontos que dependem de segurar/soltar botão físico, sem hardware disponível no ambiente de teste: defaults/migração de `gamepad.fireButtons` antigo pro novo `gamepad.buttons.fire`/set/clear de botão por ação — todos batendo; `input.js` end-to-end — botão de tiro (0) segurado gera `firing:true` contínuo, botão de pausa (9) gera o id `'pause'` em `pressed` só na borda (não repete no frame seguinte enquanto segurado, unicamente no aperto), `isActionPressed` reconhece esse id; `dodgeLeft`(botão 4)/`dodgeRight`(botão 5) alternados geram `bank` -1/+1 corretamente. A lógica de detecção de borda por slot do `watchGamepadSlots` (usado nos modais de pergunta/carta) foi confirmada chamando a mesma checagem isoladamente (idêntica à do arquivo) — subida no botão mapeado resolve pro slot certo, sem repetir enquanto segurado.

**Versão**: v0.47.0 → v0.48.0.

## Revisão da entrega anterior: 3 bugs corrigidos + 3 ajustes de Sentinela/Detrito/velocidade em arena — v0.47.0

Usuário revisou a entrega v0.46.0 e mandou um plano estruturado (bugs encontrados + ajustes pedidos), verbatim as partes centrais: *"Bug 1 — Ram damage no dourado aplica a cada frame (não a cada encostão)"*, *"Bug 2 — Sentinela: moldura abre/fecha sem relação com o tempo de voo"*, *"Bug 3 — Comentário obsoleto"*; ajustes: *"Sentinela — ciclo minimamente mais lento + ficar mais longe do jogador"*, *"Detrito — tamanhos ainda maiores"*, *"Inimigos comuns mais rápidos no modo arena"*.

### Bugs

1. **Ram aplicava dano a cada FRAME de sobreposição, não por encostada** (`golden.js` + `enemies/index.js`): com `RAM_DAMAGE=5` a 60fps, isso é ~300hp/s — o dourado (20hp) morria em ~0.07s no primeiro toque, e o chefe (hp alto) também recebia dano multiplicado enquanto durasse a sobreposição. Corrigido com um flag `ramHitActive` por inimigo/alvo dourado: dano só aplica na BORDA DE SUBIDA (entra no raio vindo de fora), o flag reseta quando o jogador sai do raio — um hit por encostada de verdade. Mesmo padrão aplicado nos dois lugares (o loop genérico de inimigos, que cobre o chefe, e o loop próprio do dourado).
2. **Ciclo de abrir/fechar da moldura da Sentinela dessincronizado do tempo de voo** (`sentinela.js`): `GATE_CYCLE_PERIOD` era uma constante fixa (0.75s) — como o tempo de voo real depende da distância no instante do disparo (que agora varia bem mais com o standoff maior, ver ajuste abaixo), o número de pulsos até a chegada virava loteria (podia ser 1 ou 6). Corrigido: o período agora é calculado NA HORA do disparo (`targetDistance / GATE_SPEED / GATE_CYCLES_PER_FLIGHT`), guardado por moldura (`gate.cyclePeriod`) — sempre ~3 ciclos completos até a chegada, não importa a distância (com um piso de 0.3s pra disparos muito perto não virarem uma piscadela).
3. **Comentário obsoleto em `sentinela.js`**: o bloco grande citando "Antes: outer=9, inner=4..." não batia mais com os valores atuais (14/11) — reescrito.

### Ajustes

4. **Sentinela mais longe + ciclo levemente mais lento** (`sentinela.js`): `ENGAGE_STANDOFF` 55 → 180; `GATE_CYCLES_PER_FLIGHT` (efetivamente o "ciclo" pedido) ajustado pra ~3 pulsos por voo em vez do período fixo anterior. **Achado no caminho, sinalizado pelo próprio usuário**: com o standoff 3x maior, a correção de posição discreta antiga (liga/desliga ±1 a 8u/s) nunca alcançaria — a nave anda a 22u/s, mais rápido que a correção. Trocado por um modelo proporcional (`(ENGAGE_STANDOFF - along) * ENGAGE_SPEED_GAIN`, com teto `ENGAGE_SPEED_MAX=26`, acima da velocidade da nave) — sem jitter, converge suave. `GATE_SPEED` subiu de 34 pra 100 (a moldura precisa viajar bem mais longe agora, senão o tempo de voo ficaria absurdo).
5. **Detrito maior** (`detrito.js`): tiers de tamanho `[1, 2, 3]` → `[1.5, 3, 5]` — o tier grande (5) já ultrapassa a envergadura da nave de propósito, confirmado pelo usuário que é intencional.
6. **Inimigos comuns mais rápidos em arena** (`enemies/index.js`): teto de velocidade `rail.getArenaSpeed() * 0.5` → `* 0.7` (Blaster e o branch genérico tank/time); default de `speedFactor` do branch genérico `0.6` → `0.8`. Fragata mantida em `* 0.5` de propósito (ela só precisa alcançar um standoff, não perseguir agressivamente). Os ranges por perfil do Blaster (`BLASTER_PROFILE_SPEED_RANGE` em `blaster.js`) são multiplicadores relativos ao teto — como o aumento é uniforme (1.4x em todos), a ordem relativa entre perfis (slow ainda claramente mais lento que advance, etc.) se mantém, e o perfil mais rápido (`advance`, até 1.0x) continua abaixo da velocidade máxima do jogador (22) mesmo com o novo teto — não precisou mexer nos ranges.

**Testado**: `node --check` limpo em `golden.js`/`enemies/index.js`/`sentinela.js`/`detrito.js` e `selftest.mjs` passou. **Testado ao vivo**: parcialmente — o navegador de teste perdeu o contexto WebGL no meio da sessão (`WebGLRenderer: Context Lost/Restored`, sintoma de aba em segundo plano suspensa pelo SO/Chrome, mesma limitação de foco documentada no resto do histórico do projeto) antes de eu conseguir confirmar visualmente todos os pontos; consegui confirmar carregamento limpo (zero erro de console) logo após o pull, e entrada em combate normal. **Compensado com teste sintético direto no console do navegador** (mesmo padrão das entregas anteriores) pra cada um dos 6 pontos, todos confirmados: ram no dourado — 10 frames de sobreposição tiraram só 1 hit de dano (20→15, não 20→-30), sair e voltar do raio liberou um novo hit (15→10); ram no chefe — mesmo teste, 10 frames tiraram só 5 de 100 hp; Sentinela — `updateSentinelaMovement` simulado por 10s convergiu suavemente até 176/180 de distância (sem jitter, sem overshoot); ciclo da moldura — disparo a 60 de distância deu 2 ciclos (piso de segurança), disparo a 180 deu exatamente 3.00 ciclos; Detrito — 30 spawns amostrados foram de 1.37 a 5.10 de escala (batendo com os novos tiers); velocidade em arena — confirmado por leitura direta do código que os multiplicadores `0.7`/`0.8` estão no lugar certo.

**Versão**: v0.46.0 → v0.47.0.

## Lasers de chefe/dourado reais, boss se movendo, ram danifica os dois chefões, dano do tiro carregado — v0.46.0

5 pedidos do usuário numa mensagem só, verbatim: *"os lasers dos bosses não são lasers reais, além disso só marcam a posição do jogador uma vez e disparam naquela posição ao invés de ficarem marcando ATÉ atirarem, é para serem LASERS, casos IMENSOS e rápidos o bastante para o jogador só conseguir desviar na hora certas. ALém disso o boss principal vermelho mal se move, é para ele se mover lentamente em direção ao jogador."*; *"O impulso com o efeito do roguelike de causar dano em colisão não causa dano nenhum nos dois bosses, só passa por dentro. corrija isso."*; *"aumente o dano base do tiro carregado para 4 ao invés de 3"*; *"adicione esta feature: Carregar o tiro carregado até o limite, no limite, aumenta o dano de 4 para 6"*.

1. **Lasers do chefe (`boss.js`) e do dourado (`golden.js`) — "não são lasers reais"**: eram um cone que viajava a 70-80u/s cruzando o alcance máximo em ~3s inteiros (mais torpedo lento que laser) e o telegraph travava a posição do jogador só no INSTANTE em que começava a "mirar", disparando ali 2.5-3s depois — dava pra sair de cima a qualquer momento durante o aviso e nunca precisar reagir de verdade. Duas mudanças: **(a)** o alvo (`enemy.laserTargetPos`) agora é atualizado a CADA FRAME durante o telegraph inteiro, não só uma vez no início — só o instante exato do disparo é que conta; **(b)** velocidade/tamanho bem maiores (chefe: raio 2.5→4.5, comprimento 24→45, velocidade 80→600 — cruza 240 de alcance em ~0.4s ao invés de 3s; dourado: raio 1.8→3.2, comprimento 20→36, velocidade 70→500). `effects.chargeCircle()` ganhou suporte a receber uma FUNÇÃO em vez de uma posição fixa (`() => enemy.laserTargetPos`), pra o marcador visual (os anéis crescendo) acompanhar o jogador em tempo real durante o telegraph, em vez de ficar pregado no ponto onde ele estava no início.
2. **Boss principal "mal se move" (`boss.js`)**: `BOSS_CHASE_SPEED` era 7 — quase parado perto da velocidade de perseguição padrão de um inimigo comum em arena (~11) e da própria nave (22). Aumentado pra 14 — continua "lento" (pedido do usuário), só que agora perceptível de verdade, se aproximando visivelmente com o tempo.
3. **Impulso ariete não causava dano nenhum no dourado (`golden.js`)**: o chefe (`BOSS_KIND`) já tratava ram corretamente (`enemies/index.js`, sem bug); o dourado é um sistema totalmente à parte (`goldenTargets`, array próprio) cujo `update()` nunca recebia nem checava `ramDamage` — o jogador literalmente atravessava por dentro sem nada acontecer. Adicionado: `golden.update()` agora recebe `ramDamage` e aplica dano de verdade quando o jogador está dentro do `GOLDEN_HIT_RADIUS`, igual ao chefe. **Achado no caminho, evitando um softlock**: a fase `'goldenArena'` só sai quando `events.goldenSpecialHit` vem `true` (`main.js`) — se o ram matasse o dourado sem alimentar essa flag, o jogo ficaria preso na arena dourada pra sempre (chão vazio, sem alvo, sem saída). Resolvido igual ao padrão já existente pro chefe (`ramBossDefeated`/`ramBossWorldPos`): `golden.update()` devolve `ramGoldenDefeated`/`ramGoldenWorldPos`, que sobem por `enemies/index.js` até `combat/index.js` e se mesclam em `goldenSpecialHit`/`goldenHitWorldPos` (`|| ramGoldenDefeated`) — mata por ram ou por tiro agora leva ao mesmo lugar.
4. **Dano base do tiro carregado 3 → 4** (`combat/projectiles.js`, `HOMING_PROJECTILE_DAMAGE`).
5. **Carga máxima aumenta o dano de 4 pra 6** (feature nova): `fireHomingShot(origin, maxTargets, isMaxCharge)` ganhou um 3º parâmetro — `main.js` calcula `isMaxCharge = fireHeldMs >= player.config.homingChargeMaxMs` (mesmo campo já usado pro círculo de carga visual chegar a 100%) no momento de soltar o botão, e passa adiante por `combat/index.js`. `HOMING_PROJECTILE_DAMAGE_MAX_CHARGE = 6` só se aplica quando a carga foi levada até o fim de verdade, não só passou do mínimo pra poder atirar.

**Testado**: `node --check` limpo em `boss.js`/`golden.js`/`effects.js`/`enemies/index.js`/`combat/index.js`/`combat/projectiles.js`/`main.js` e `selftest.mjs` passou. **Testado ao vivo** (servidor de teste próprio): entrei na luta do chefe via debug (god mode + buffs máximos + pular pra luta), zero erro de console em toda a sessão. **Verificado por teste sintético direto no console do navegador** (mesmo padrão já estabelecido nas entregas anteriores pra mecânicas de timing difíceis de pegar ao vivo) pros pontos centrais: `updateBossMovement` simulado por 1s fechou exatamente 14 unidades de distância (bate com o novo `BOSS_CHASE_SPEED`); `updateBossLaser` simulado com o jogador se movendo continuamente confirmou o alvo do telegraph ACOMPANHANDO o movimento (não fixo) e o laser final saindo com velocidade 600/raio de acerto 5; `golden.update()` com jogador longe não tirou HP nenhum e com jogador dentro do raio matou o dourado e devolveu `ramGoldenDefeated:true`; `enemiesSys.update()` confirmou que o ram no chefe principal continua funcionando (sem regressão); `fireHomingShot` capturado direto confirmou dano 4 na carga normal e 6 na carga máxima.

**Versão**: v0.45.0 → v0.46.0.

## 3 correções nos inimigos: mini-enxame não fazia zigue-zague/espiral, Sentinela não travava o jogador — v0.45.0

Usuário revisou a entrega anterior e apontou 2 problemas reais, verbatim: *"os ataques em zig-zag / rodopios dos mini inimigos enfileirados, eles não fazem isso"* e *"corrija o ataque do inimigo sentinela, aparentemente ele não tá seguindo o jogador enquanto lança seus ataques, é pra ele ficar preso na mesma velocidade q o jogador, não permitir que o jogador passe por ele até ele terminar de atacar 4 vezes, além disso os quadrados que ele lança, é para eles fecharem e abrirem causando dano, no memnto eles só abrem e nunca fecham"*.

**Nota de versão**: o commit anterior por baixo (`36c660d`) se rotulou "v0.44.0" na mensagem, mas não bumpou a tag em `hud-pregame.js` (ficou em v0.43.0) — mesma colisão de sempre entre sessões concorrentes. Esta entrega usa v0.45.0 pra não colidir de novo.

1. **Mini-enxame (`miniSwarm.js`) — zigue-zague/espiral eram imperceptíveis, bug real**: no mergulho, o código somava o desvio lateral/espiral a um vetor de direção já normalizado (magnitude 1) só que ESCALADO por `dt` (~0.016) antes de somar — um desvio de amplitude 6 virava uma perturbação de ~0.1 numa direção de magnitude 1, e a chamada seguinte renormalizava tudo de novo, apagando quase todo o efeito (virava um chacoalhar quase invisível, não um zigue-zague). Corrigido pra separar em 2 componentes: uma "base" reta (posição avançando na direção travada no início do mergulho, à velocidade cheia) + um OFFSET lateral (zigue-zague: seno lateral ±6; espiral: círculo de raio 4.5) somado por cima, sem renormalizar — mesmo princípio já usado pela "patrulha" (`patrolBase` + `wobble`) logo acima no mesmo arquivo, só aplicado também ao mergulho.
2. **Sentinela não travava lateralmente (`sentinela.js`)**: `updateSentinelaMovement` só corrigia a distância PRA FRENTE (along-forward), nunca a lateral — o jogador podia simplesmente desviar de lado e passar reto por ela sem nunca entrar no alcance das molduras. Adicionado: enquanto ataca, persegue `rail.getPlayerLateral()` (mesmo dado cru que a Réplica já usa) com resposta rápida (não instantânea) nos dois eixos, travando de verdade na lateral do jogador até esgotar os 4 disparos.
3. **Molduras (`sentinela.js`) só abriam, nunca fechavam**: o buraco tinha tamanho FIXO a vida inteira do disparo, resolvido numa checagem única na chegada — não existia abertura/fechamento nenhum, só um buraco estático. Adicionado `updateGateAnimation`, chamado a cada frame em `updateEnemyGates` (`enemies/index.js`): o buraco (`gate.innerHalf`) oscila com cosseno entre aberto (11, tamanho original) e fechado (~0, sem passagem — todo o quadro vira zona de dano) num ciclo de 0.75s, começando TOTALMENTE ABERTO no disparo (dá tempo de reação). As 4 barras (compartilham geometria entre instâncias) são redimensionadas/reposicionadas por frame (`applyGateVisual`) pra o visual bater com o `innerHalf` atual. Como a checagem de dano continua acontecendo uma vez, na chegada, o resultado agora depende de EM QUE FASE do ciclo a moldura estava naquele instante — se chegou fechada, machuca em qualquer posição dentro do quadro.

**Testado**: `node --check` limpo em `miniSwarm.js`/`sentinela.js`/`enemies/index.js` e `selftest.mjs` passou. **Testado ao vivo** (servidor de teste próprio, numa porta separada — o servidor padrão 8420 estava em uso por outra sessão): mini-enxame spawnado repetidas vezes com câmera lenta (0.25x) ativada pra dar tempo de observar — confirmado visualmente um rastro CURVO de verdade (arco visível de vários mini-inimigos), bem diferente da linha reta de antes. Sentinela spawnada sem erro, corpo e moldura renderizando normalmente. **Verificado por teste sintético direto no console do navegador** (mesmo padrão já usado na entrega original da Sentinela, v0.34.0: funções importadas e chamadas com casos fabricados) pros dois pontos mais difíceis de pegar ao vivo por causa do timing de fase: `updateGateAnimation` varre um ciclo inteiro e confirma `innerHalf` oscilando entre ~0 e 11 (aberto→fechado→aberto), e um ponto FIXO no meio do quadro que é seguro quando `innerHalf=11` e machuca quando `innerHalf≈0` (mesma posição, resultado oposto — prova que fechar de verdade muda o resultado); `updateSentinelaMovement` simulado por 3s convergiu a posição lateral da Sentinela exatamente pro offset lateral fabricado do jogador (8, -3). Zero erro de console em toda a sessão de teste.

**Versão**: v0.43.0 → v0.45.0.

## 5 inimigos originais novos: Réplica, Fragata-Escudo, Verme-Corrente, Enxame-Ímã, Sussurro — v0.43.0

Pedido do usuário em 3 mensagens: *"Quero ideias de 5 novos inimigos originais"* → propus 5 conceitos; *"Vou refrasiar\n\nTem que me dizer se eles utilizam certos perfis ou estados já presentes ou devem criar próprios, suas cores e em que modo aparecem, no rail ou no all range"* → detalhei perfil/estado/cor/modo de cada um; *"ok, implemente todos"* → esta entrega.

**Nota de processo importante**: entre o pedido e esta entrega, uma sessão concorrente já tinha implementado e enviado pro GitHub os 5 mesmos inimigos (18 commits, mensagens genéricas em inglês tipo "Add replica enemy with lateral movement behavior") — mesmo design, mesma arquitetura, arquivos praticamente idênticos aos que eu mesmo tinha escrito em paralelo (as duas implementações convergiram porque partiram do mesmo pedido do usuário e das mesmas convenções já estabelecidas em `src/enemies/`). Ao perceber isso (`git fetch`/`git log HEAD..origin/main` mostrando 18 commits à frente, e diff comparando meu working tree contra `origin/main` mostrando conteúdo idêntico ou quase idêntico), descartei meu trabalho local duplicado (guardado num `git stash` por segurança, não apagado) e dei `git pull --ff-only` pra adotar a versão já publicada, em vez de arriscar um merge de duas implementações da mesma coisa. **O que faltava** na versão publicada: o painel de debug (`debug.js`/`debug-actions.js`) não tinha sido atualizado com os 5 botões novos — a sessão concorrente implementou o inimigo e a integração no spawn natural do jogo, mas não a integração de teste manual. Completei essa parte.

**Segunda colisão, desta vez de número de versão**: enquanto eu terminava (testando ao vivo + escrevendo esta entrega), mais duas entregas de outra(s) sessão(ões) foram commitadas e enviadas por baixo (`1c01d0b` "v0.42.0: argolas cinzas de explosão", depois `914be1d`/`307ee37` "6 animações de peso físico") — a primeira já tinha reivindicado v0.42.0 na mensagem do commit (embora a tag visível em `hud-pregame.js` tenha voltado pra v0.41.0 depois, aparentemente por causa da 2ª entrega ter sido commitada em cima de um `hud-pregame.js` desatualizado em disco — não investiguei a fundo, não é meu código). Pra não colidir de novo, esta entrega usa **v0.43.0**.

1. **Réplica** (`replica.js`) — eco fantasma cinza-azulado translúcido (cone), só trilho. Não usa perfil/estado existente: grava um histórico de `rail.getPlayerLateral()` e reproduz a posição lateral do jogador com 0.4s de atraso, mantendo distância fixa (~70) à frente. HP 3, bônus 30.
2. **Fragata-Escudo** (`fragata.js`) — corpo icosaedro cinza + placa retangular laranja girando devagar em torno dele, só arena/all-range. Estado novo (ângulo de blindagem): só toma dano de verdade quando o tiro chega do lado que a rotação deixou exposto NAQUELE instante (`isFragataShielded`, checado por ângulo, não por posição — diferente da Sentinela). Avança até um standoff de 40. HP 6, bônus 40. Hit bloqueado gera um resultado novo (`{blocked: true}`) que `combat/projectiles.js` intercepta pra descartar o projétil sem contar dano/kill.
3. **Verme-Corrente** (`verme.js`) — cadeia de 4 esferas verde-oliva, só trilho. Cada elo é uma entrada comum no array de inimigos (mesmo hp/hit/morte de sempre); a única coisa nova é `followTarget` (referência ao elo da frente) — destruir qualquer elo (cabeça ou meio) faz o que seguia ele virar cabeça de uma cadeia independente (`severChainAt`, chamado nos 3 pontos de morte: ram, toque, projétil). HP 3 por elo, bônus 20 por elo.
4. **Enxame-Ímã** (`ima.js`) — grupo de 3-5 esferas azul-elétrico estacionárias, ambos os modos. Não ataca nem persegue — projeta um campo magnético (`getMagnetSources()`) que `combat/projectiles.js` usa pra curvar a trajetória de tiros NÃO-teleguiados que passam perto (tiro teleguiado ignora, já tem o próprio sistema de mira). HP 2, bônus 15.
5. **Sussurro** (`sussurro.js`) — octaedro cinza-claro quase invisível (opacidade pulsando ~0.5s visível / ~2.2s quase invisível), só trilho. Avança reto; depois de 6s vivo, invoca 2-3 Blaster de reforço uma única vez (`sussurroShouldSummon`, checado no loop do orquestrador, que já tem `spawnBlaster`/`scene`/`rail` no escopo). HP 2, bônus 25.

Todos entram na rotação natural de spawn do `main.js` (chances 8-15% no trilho, Enxame-Ímã por timer próprio de 10-18s em qualquer modo, Fragata 15% substituindo o spawn comum em arena) e ganharam botão próprio no painel de debug.

**Testado**: `node --check` limpo em todos os arquivos tocados/novos e `selftest.mjs` passou. **Testado ao vivo** (servidor estático): os 5 botões de debug novos spawnam sem nenhum erro de console, em ambos os modos (rail e all-range) — confirmado repetidamente ao longo de várias dezenas de cliques/interações. Fragata-Escudo confirmada visualmente completa: corpo+placa girando, aproximação até o standoff, e disparos de teste (`Testar tiro teleguiado`) interagindo sem erro (score subindo, indicando parte dos tiros acertando e parte plausivelmente bloqueada pelo escudo). **Não confirmado visualmente em detalhe** (mesma limitação de rAF/timing de fase documentada no resto do histórico do projeto — a arena dourada natural interrompeu as janelas de teste no trilho antes do tempo necessário): o corte de cadeia do Verme ao matar um elo do meio, o ciclo de pulso e o gatilho de invocação (6s) do Sussurro, e a curva visível de um tiro normal pelo campo do Enxame-Ímã — compensado pela revisão cuidadosa da lógica (idêntica, linha a linha, à meu próprio design original pro mesmo pedido) e pelo fato de nenhum dos 5 gerar erro de console em nenhum spawn.

**Versão**: v0.41.0 → v0.43.0.

## 6 animações de "peso físico" nas 3 naves selecionáveis — `rail.js`

Pedido do usuário: depois de uma rodada de "me dê ideias" pra animação das 3 naves configuráveis
(Clássica/Bombardeiro/Veloz), ele escolheu uma ideia (squash-stretch por peso percebido) e pediu
mais 5 na mesma linha ("sensação de peso/massa") — as 6 juntas viraram esta entrega.

**Mecanismo comum**: cada preset de `SHIP_PRESETS` ganhou um campo `weight` (0 = leve/ágil,
1 = pesada/robusta — Clássica 0.5, Bombardeiro 1, Veloz 0.15). `shipPhysicsFor(preset)` interpola
esse único número em 10 parâmetros (rigidez/amortecimento do spring de roll, força/decaimento do
recuo, profundidade/decaimento da agachada, trepidação, esticada de boost, achatada de impacto,
amortecimento do wobble) — mexer no "peso" de uma nave ajusta as 6 animações de uma vez.

1. **Inércia no giro**: `roll`/`arenaRoll` trocaram a suavização exponencial simples
   (`+= (alvo-atual)*(1-exp(-taxa*dt))`) por um spring-damper de verdade (Euler semi-implícito).
   Nave pesada tem rigidez menor (responde mais devagar) E amortecimento menor (sub-amortecida —
   "sobra" um pouco de rotação antes de assentar, overshoot real); a Veloz fica crítica/sem sobra.
2. **Recuo no disparo**: `triggerRecoil()` soma um impulso que decai sozinho a cada frame
   (`decayImpulse`), aplicado como deslocamento ao longo do -forward. `combat.tryFire()` (e
   `projectiles.tryFire()`) passaram a devolver `true`/`false` pra `main.js` saber se o tiro saiu
   de verdade antes de chamar o recuo (cooldown ainda ativo = sem recuo).
3. **Agachada ao ligar o boost**: detecção de borda (`boostActive` false→true) dispara o mesmo
   tipo de impulso decadente, deslocando a nave ao longo do -up.
4. **Trepidação em alta velocidade**: jitter contínuo (`applyWeightJitter`) proporcional a
   `boostBlend` (suavização do liga/desliga do boost) — mais forte nas naves leves.
5. **Estica no boost / achata no impacto**: escala não uniforme (`ship.scale`) — o eixo do
   comprimento estica com o boost e encolhe com o impacto (`triggerImpactSquash()`, chamado por
   `main.js` no hit de verdade), a seção transversal compensa no sentido oposto.
6. **Amortecimento pós-manobra**: giro completo e cambalhota, ao TERMINAREM (não durante),
   somam um impulso de velocidade no mesmo spring-damper do roll — a nave balança um pouco extra
   antes de estabilizar, mais nas pesadas.

**Nota de processo — colisão real, não hipotética**: a primeira tentativa desta entrega foi
inteiramente perdida — enquanto eu ainda tinha as edições em `rail.js` só no disco (não
commitadas), outra sessão (branch `claude/exciting-turing-90bhle`, cuidando de "efeitos visuais e
mecânicas de nave" no mesmo período) fez um merge (`535cabf`) que resultou no `rail.js` voltando
à versão sem meu trabalho, sem nenhum conflito reportado — commits em Git não protegem edições
não commitadas de outra sessão escrevendo no mesmo arquivo em disco. Refiz tudo do zero e
commitei bem mais cedo desta vez (`914be1d`) especificamente pra reduzir essa janela.

**Testado ao vivo**: `node --check` limpo em `rail.js`/`main.js`/`combat/index.js`/
`combat/projectiles.js`. Como já havia um servidor de outra sessão na porta 8420 (com uma
partida em andamento, incluindo os 5 inimigos novos dela visíveis em tela), naveguei pro mesmo
`localhost:8420` (é estático, serve o disco atual pra qualquer aba) em vez de subir um servidor
próprio — testei virar/atirar/impulsionar (modo trilho, cobre o grosso do código novo: spring de
roll, recuo, agachada, trepidação, escala) e o debug "Testar giro/inclinação", zero erro de
console em qualquer interação. **Não testado**: o modo arena especificamente (`updateArena` reusa
as MESMAS funções já exercitadas em trilho, risco baixo) e a achatada de impacto de verdade (o
atalho de debug "Causar 1 dano" pula `player.takeDamage()` direto, não passa pelo gatilho).

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
