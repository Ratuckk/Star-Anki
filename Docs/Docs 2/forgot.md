# Forgot — itens esquecidos ou ainda não implementados

> Este arquivo consolida o que ficou faltando ou parcialmente implementado nos levantamentos recentes: **3 (Swirl Blast)**, **5 (obtenção de cartas no modo Arcade)**, **10 (Fog)** e a **superchecagem dos inimigos**. Sugestões opcionais não são tratadas como requisitos aprovados. Itens já corrigidos ficam marcados como concluídos para não voltarem acidentalmente ao backlog.

## 3 — Swirl Blast

### O que já está implementado

- [x] O Swirl Blast existe como projétil perfurante próprio.
- [x] Possui cooldown próprio.
- [x] Possui câmera lenta associada ao disparo.
- [x] Possui alteração temporária de FOV e punch de câmera.
- [x] Possui visual próprio com núcleo/corpo, espiral, anéis, aura, plume/exaustão e rotação.
- [x] Possui afterimages/trilha visual básica.
- [x] Pode fazer homing contra Chefe e Dourado quando estes são o alvo.
- [x] Possui pipeline de colisão perfurante separado dos tiros normais.
- [x] Já consegue atravessar múltiplos inimigos sem desaparecer no primeiro contato.
- [x] Possui efeitos de impacto/explosão próprios em alguns contatos.

### O que foi esquecido, ficou incompleto ou está mal implementado

- [ ] **Dano especial contra bosses:** ao entrar em contato com Chefe ou Dourado, o Swirl deve causar, além do dano-base normal, **25% da vida máxima do alvo como dano adicional**.
  - O percentual deve usar `maxHp`, nunca a vida atual.
  - A implementação deve cobrir separadamente Chefe e Dourado, porque eles não usam exatamente o mesmo pipeline interno de dano.
  - A fórmula exata de arredondamento deve ser definida antes da implementação para evitar divergência entre HUD, dano real e testes.

- [ ] **Hitbox coerente com o tamanho visual:** atualmente a colisão perfurante usa essencialmente o segmento central do projétil contra o raio do inimigo. O volume visual do Swirl é muito maior do que isso.
  - Criar um raio de colisão próprio, por exemplo `SWIRL_HIT_RADIUS`.
  - Usar uma cápsula/segmento varrido entre a posição anterior e a atual, somando o raio físico do Swirl ao raio do alvo.
  - O raio de colisão deve corresponder ao **corpo sólido visual** do Swirl, não à aura translúcida externa.
  - Testar colisões centrais, raspões visuais, alvos pequenos, alvos grandes, Chefe e Dourado.

- [ ] **Separar a velocidade cinematográfica do Swirl da câmera lenta global:** atualmente a câmera lenta também reduz o `dt` usado pelo combate, então o próprio superprojétil perde velocidade junto com o mundo.
  - O efeito desejado é o mundo desacelerar enquanto o Swirl mantém sensação de velocidade extrema.
  - Revisar o pipeline de tempo para o Swirl poder usar tempo não escalado, ou outra solução equivalente que preserve sua velocidade visual/física sem quebrar colisões.

- [ ] **Refazer a coreografia de câmera do disparo:** o conjunto atual de slow motion + FOV + punch não está visualmente satisfatório.
  - Não considerar o efeito aprovado apenas porque os timers existem.
  - O disparo deve ter uma sequência temporal clara de antecipação, liberação e retorno.
  - Evitar efeitos que diminuam visualmente o projétil ou tornem sua leitura menos clara.
  - O FOV precisa ser testado em gameplay real, não aceito apenas por valor numérico.

- [ ] **Criar um rastro de destruição legível após o disparo:** os afterimages atuais não cumprem a fantasia de deixar um caminho devastado.
  - O caminho percorrido deve permanecer perceptível por alguns décimos de segundo depois que o Swirl passa.
  - Preferir emissão por distância percorrida, e não apenas por intervalo de tempo, para manter espaçamento consistente em slow motion ou velocidades diferentes.
  - Cada inimigo atravessado deve gerar uma ruptura/impacto individual visível no ponto de contato.
  - Uma fileira de vários inimigos atingidos deve produzir uma sequência visual de impactos ao longo da trajetória.

- [ ] **Diferenciar claramente impacto comum e impacto contra boss:** atravessar inimigos comuns e atingir Chefe/Dourado não devem parecer o mesmo evento.
  - O impacto contra boss deve possuir feedback próprio e inequívoco.
  - Definir explicitamente o comportamento contra o escudo do Chefe antes de implementar o bônus percentual: refletir, quebrar, atravessar ou causar dano parcial não pode ficar implícito.

### Critérios mínimos de aceitação do Swirl

- [ ] Um inimigo tocado visualmente pelo corpo sólido do Swirl não pode deixar de registrar colisão por a hitbox ser menor.
- [ ] O Swirl deve aparentar mover-se violentamente rápido mesmo quando o restante do mundo entra em slow motion.
- [ ] Após atravessar uma formação, ainda deve ser possível perceber por alguns décimos de segundo o caminho do projétil e os pontos em que inimigos foram atingidos.
- [ ] Chefe e Dourado devem receber corretamente o dano-base + 25% de `maxHp`, segundo a regra de arredondamento definida.
- [ ] Os efeitos de câmera não podem deslocar a câmera cumulativamente nem prejudicar a mira depois que terminam.

---

## 5 — Obtenção de cartas no modo Arcade

### O que já está implementado

- [x] Existe escolha de cartas no modo Arcade.
- [x] O modo Arcade pode manter o jogo rodando em bullet-time durante `cardChoice` quando a pausa total está desativada.
- [x] O time scale específico do Card Choice existe.
- [x] As cartas podem ser escolhidas por teclas numéricas.
- [x] O HUD atual possui overlay, cabeçalho, lista de cartas e inspetor de build/atributos.

### O que foi esquecido, ficou incompleto ou está mal implementado

- [ ] **A interface de escolha não deve tomar conta da tela no Arcade.** O código continua usando um `card-choice-overlay` grande apesar de o jogo seguir simulando ao fundo.

- [ ] **Criar uma apresentação específica para Arcade**, separada da interface/modal usada em outros contextos.
  - As três escolhas devem aparecer de forma compacta na região superior da tela.
  - A mira, a nave, os inimigos e a maior parte do espaço de jogo devem continuar visíveis.
  - Não exibir automaticamente o inspetor completo de atributos/build durante a decisão rápida.
  - Cada opção precisa ser legível sem virar uma carta gigante: índice, ícone, nome e efeito curto são suficientes para a decisão imediata.

- [ ] **Reavaliar o comportamento do bullet-time da recompensa:** atualmente ele permanece vinculado ao estado de `cardChoice`.
  - Uma alternativa preferida é o slow motion ser um impacto temporário de aproximadamente 1 segundo, depois o jogo retornar à velocidade normal mesmo se o jogador ainda não escolheu.
  - A recompensa pode continuar pendente no topo até a escolha.
  - Esta alteração ainda precisa de decisão final de design antes de ser tratada como requisito fechado de timing.

- [ ] **Evitar que o estado de recompensa seja semanticamente uma pausa/modal de combate.**
  - Avaliar separar `arcadeDraftPending` (ou estado equivalente) de `phase === 'cardChoice'`.
  - O jogador deve continuar em combate enquanto possui uma escolha pendente.
  - Não permitir empilhamento ilimitado de novas recompensas enquanto uma escolha anterior ainda está pendente.

- [ ] **Preservar controles de combate durante o draft Arcade**, salvo qualquer input explicitamente reservado para selecionar cartas.

### Direção de design atualmente preferida, mas ainda não implementada

**Draft Tático:** três chips compactos no topo da tela, seleção por `1/2/3`, jogo visível e ainda ativo. O bullet-time funciona como breve janela de leitura, não como modo permanente até o jogador escolher.

Alternativas ainda possíveis, caso essa direção seja rejeitada em playtest:

- Janela de Suprimento: pausa apenas novos spawns por um instante, mantendo inimigos existentes ativos.
- Upgrade físico/diegético no cenário: escolher voando através de uma opção; muito mais complexo e ainda não aprovado.

### Critérios mínimos de aceitação das cartas no Arcade

- [ ] A interface de escolha não pode cobrir o centro da ação nem impedir o jogador de enxergar o combate.
- [ ] O jogador precisa conseguir identificar as três opções rapidamente sem abrir um painel de inspeção grande.
- [ ] O jogo deve continuar simulando conforme a regra de bullet-time aprovada.
- [ ] Uma escolha pendente não pode gerar várias novas recompensas acumuladas sem limite.
- [ ] Teclado e gamepad precisam continuar funcionando durante a escolha.

---

## 10 — Fog

### O que já está implementado

- [x] Existe `THREE.FogExp2`/fog funcional no ambiente.
- [x] A densidade do fog é recalibrada de acordo com a distância máxima esperada de spawn.
- [x] Arena pode aplicar multiplicador de densidade diferente.
- [x] Existem perfis de fog para Chefe, Dourado e Tempestade de Detritos.
- [x] Existem efeitos táticos que conseguem consultar a densidade atual do fog.
- [x] Existem fog wisps/partículas suaves no sistema de efeitos.
- [x] Existem bolsões de névoa habilitáveis pela configuração de ambiente.

### O que foi esquecido, ficou incompleto ou está mal implementado

- [ ] **Dar referência visual inequívoca ao fog.** Atualmente o fog padrão é preto sobre um espaço predominantemente preto, portanto ele é percebido mais pela desaparição dos inimigos do que como uma massa presente no ambiente.

- [ ] **Fazer parte do campo estelar responder ao fog.** Atualmente camadas importantes de estrelas usam `fog: false`, removendo uma das principais referências de profundidade.
  - Não é necessário esconder todas as estrelas profundas.
  - Deve existir pelo menos uma camada próxima/intermediária cuja visibilidade seja reduzida pelo fog.
  - O jogador deve conseguir perceber uma massa de névoa porque estrelas entram e saem dela.

- [ ] **Substituir a leitura de wisps uniformemente espalhados por bancos/volumes localizados de névoa.**
  - O jogador precisa conseguir olhar para frente e identificar visualmente onde há uma região de fog antes de entrar nela.
  - Reaproveitar a textura suave existente em vez de criar um sistema paralelo desnecessário.
  - Usar distribuição, escala, opacidade e profundidade suficientes para formar massas legíveis sem transformar o cenário em uma tela cinza.

- [ ] **Integrar o surgimento dos inimigos à massa visual do fog.**
  - Quando inimigos aparecem dentro do fog, o efeito de materialização deve parecer emergir/condensar a névoa daquele local.
  - Não depender apenas do fade do próprio inimigo para fingir que existe fog ao redor.

- [ ] **Evitar resolver o problema apenas com overlay de tela.** Um filtro cinza 2D sobre a câmera não substitui profundidade espacial e não deve ser a solução principal.

- [ ] **Recalibrar visualmente o fog em gameplay real.** O valor matemático de cobertura já existe, mas precisa ser validado pelo que o jogador efetivamente vê em trilho e arena.

### Critérios mínimos de aceitação do Fog

- [ ] Em uma cena sem inimigos, tiros ou eventos, o jogador deve conseguir apontar onde existe um banco de fog.
- [ ] Estrelas próximas/intermediárias devem desaparecer e reaparecer progressivamente ao entrar/sair desses volumes.
- [ ] Inimigos emergindo do fog devem parecer sair de uma massa presente no espaço, e não simplesmente aparecer/fazer fade em um fundo preto.
- [ ] O fog deve continuar permitindo leitura de gameplay, especialmente em arena de Chefe/Dourado.
- [ ] A mudança não pode depender de habilitar SkyDome ou planetas, já que o fundo preto é uma escolha atual do projeto.

---

## Superchecagem dos inimigos

> Situação auditada contra o `main`: dos 15 achados originais, **3 foram corrigidos funcionalmente, 2 ficaram parciais e 10 continuam pendentes**. O estado do código é a fonte de verdade; descrições antigas de PR não devem ser usadas para marcar estes itens como concluídos.

### Corrigidos — manter fechados

- [x] **#3 — Spawn `peek/materialize/settle` participava do gameplay.**
  - O lifecycle real agora bloqueia IA, disparo e colisão enquanto `isEnemySpawnPending(enemy)` for verdadeiro.
  - Resolvedores de tiro/área e `getAlive()` também excluem inimigos em materialização.
  - Dívida arquitetural restante: Blaster/Tank ainda possuem uma representação FSM `SPAWNING` separada, mas isso não reabre o bug funcional original.

- [x] **#4 — Spawn modificava materiais compartilhados.**
  - A animação de spawn passou a usar material clonado por instância e restaura/descarta corretamente o material ao terminar.

- [x] **#6 — Sussurro criava reforços nível 1 fora do pipeline.**
  - Reforços agora usam `currentDifficultyLevel()`, passam o nível a `spawnBlaster()` e entram via `registerSpawn()`.

### Parcialmente corrigidos — continuam no backlog

- [ ] **#7 — Homing já disparado pode perseguir alvo em `fadingOut`.**
  - Aquisição nova foi corrigida: `getAlive()` exclui `dying`, `fadingOut` e inimigos ainda materializando.
  - O problema restante é o projétil que **já possuía alvo**: ele abandona a referência ao detectar `dying`, mas não `fadingOut`.
  - O Swirl com alvo travado apresenta a mesma lacuna.
  - Corrigir validação do alvo por frame sem permitir retargeting telepático/inconsistente.

- [ ] **#8 — Campo do Enxame-Ímã permanece ativo durante `fadingOut`.**
  - A parte do spawn foi corrigida: fontes magnéticas ainda materializando são ignoradas.
  - Falta excluir inimigos em `fadingOut` de `getMagnetSources()` ou do caminho equivalente que aplica o campo.
  - O campo não pode continuar alterando tiros quando a fonte já está visualmente desaparecendo.

### Pendentes — não corrigidos

- [ ] **#1 — Boss pode receber dano durante a fase declarada como invulnerável da transição.**
  - O código ainda tenta restaurar um piso de HP depois (`transitionFloorHp`) em vez de bloquear o dano na origem.
  - `resolveProjectileHit`, dano em área, Swirl e aríete ainda podem reduzir HP durante `transitioning`.
  - Um hit letal pode colocar o Boss em `dying` antes da restauração do piso.
  - A correção deve centralizar a regra: enquanto `transitioning`, todos os caminhos ofensivos que deveriam respeitar invulnerabilidade devem sair sem aplicar dano/morte.
  - Testar tiro normal, carregado, Swirl, AoE e aríete durante toda a transição.

- [ ] **#2 — `Squadron.remaining` ainda pode ser decrementado duas vezes.**
  - A morte por projétil reduz `sq.remaining` e a remoção posterior por `removeEnemy()` reduz novamente.
  - A resolução de morte continua duplicada entre tiro, Swirl, área e aríete.
  - Centralizar a transição `alive → dying → removed` e garantir que a contagem do esquadrão aconteça exatamente uma vez.
  - Adicionar teste explícito de squad wipe para não liberar/encerrar esquadrão antes da hora.

- [ ] **#5 — Sentinela perde a distinção de 2 dano no casco / 4 no escudo.**
  - A entidade ainda declara `GATE_DAMAGE = 2` e `GATE_SHIELD_DAMAGE = 4`.
  - O pipeline promove apenas `gate.shieldDamage` para um `damage` global e o game loop envia um único número a `player.takeDamage()`.
  - Preservar ambos os valores até a resolução final, escolhendo corretamente segundo o recurso atingido.
  - Testar jogador com escudo, sem escudo e transição entre escudo→casco no mesmo contato se isso for permitido pelo sistema.

- [ ] **#9 — Wobble visual altera posição lógica do inimigo.**
  - O jitter ainda é somado diretamente em `mesh.position.x/y/z` sem restauração pós-render.
  - Isso pode alterar colisão, mira, homing, distância e comportamento de IA quando a intenção era apenas visual.
  - Separar posição lógica de offset visual, usando child visual, matriz/offset temporário restaurado ou arquitetura equivalente.

- [ ] **#10 — Quaternion das mini-naves do Dourado recebe vetor de direção escalado.**
  - O vetor é normalizado, depois multiplicado pela velocidade e então enviado a `setFromUnitVectors`, que espera vetores unitários.
  - Manter uma direção normalizada separada da velocidade física.
  - Testar orientação em curvas, aproximação, afastamento e velocidades diferentes.

- [ ] **#11 — Projéteis inimigos comuns continuam usando colisão pontual e podem atravessar o jogador em frames grandes.**
  - O hit é avaliado na posição final do projétil no frame em vez do segmento percorrido.
  - Lasers já usam corretamente `prevPos → novaPos`; projéteis comuns devem adotar swept collision equivalente.
  - Testar FPS baixo, velocidades elevadas, boost/dash do jogador e cruzamentos quase perpendiculares.

- [ ] **#12 — Enxame-Ímã continua calibrado para a velocidade antiga dos tiros.**
  - A justificativa/força atual foi concebida para projétil de aproximadamente `60 u/s`, enquanto o tiro normal atual está em aproximadamente `260 u/s`.
  - Recalibrar força, raio e curva de influência com base na física atual.
  - A alteração precisa ser validada em gameplay para evitar tanto um campo irrelevante quanto um desvio impossível de combater.

- [ ] **#13 — Boss ainda pode disparar rajada normal durante a transição.**
  - Depois de `updateBossMovement()`, o orquestrador ainda pode diminuir `fireTimer` e chamar `fireBossVolley()` sem bloquear `transitioning`.
  - Durante uma fase cinematográfica/invulnerável, o comportamento ofensivo precisa seguir a regra aprovada de transição e não acontecer por acidente de timer.
  - Testar início, meio e frame final da transição para evitar tiro residual na borda temporal.

- [ ] **#14 — Tank em `DISENGAGING` na arena continua perseguindo o jogador.**
  - O comportamento atual foi preservado explicitamente: em arena chama `updateTankArenaChase()` até passar da distância de remoção.
  - Isso contradiz a semântica de `DISENGAGING` e pode criar inimigo que deveria sair mas continua pressionando/perseguindo.
  - Definir comportamento correto de disengage em arena antes de implementar: afastar-se do jogador, manter vetor de saída, ou outro fluxo explícito.
  - Não apenas renomear o estado; corrigir a lógica de movimento e o critério de despawn juntos.

- [ ] **#15 — Verme pode executar `severChainAt` novamente durante remoção.**
  - O corte da cadeia pode acontecer no caminho de morte e novamente em `removeEnemy()`.
  - Tornar a operação idempotente ou centralizar a responsabilidade de corte.
  - Testar morte da cabeça, segmento intermediário, cauda, morte em área e remoção/despawn para garantir que a cadeia não seja alterada duas vezes.

### Prioridade recomendada para a superchecagem

1. [ ] **P0 — Boss transition/invulnerabilidade (#1).**
2. [ ] **P0 — Centralização de morte + `Squadron.remaining` (#2).**
3. [ ] **P0 — Pipeline de dano da Sentinela (#5).**
4. [ ] **P1 — Homing/Swirl abandonar `fadingOut` (#7).**
5. [ ] **P1 — Boss não disparar durante transição (#13).**
6. [ ] **P1 — Swept collision dos projéteis inimigos (#11).**
7. [ ] **P1 — Enxame-Ímã não atuar em fade + recalibração (#8/#12).**
8. [ ] **P2 — Wobble puramente visual (#9).**
9. [ ] **P2 — Quaternion das mini-naves do Dourado (#10).**
10. [ ] **P2 — Tank `DISENGAGING` em arena (#14).**
11. [ ] **P2 — Idempotência do `severChainAt` do Verme (#15).**

### Critérios gerais de aceitação da superchecagem

- [ ] Nenhum estado visual de entrada/saída pode continuar causando efeitos físicos por acidente.
- [ ] Nenhum caminho de dano deve duplicar resolução de morte, contagem de esquadrão ou side effects.
- [ ] Invulnerabilidade precisa bloquear dano na origem, não reparar HP depois.
- [ ] Colisões de projéteis rápidos devem ser robustas a variações de `dt`/FPS.
- [ ] Efeitos puramente visuais não podem modificar posição ou orientação lógica usada por gameplay.
- [ ] Todo conserto deve ser testado no caminho específico que originou o bug e também em pelo menos um caminho alternativo de dano/morte.

---

## Resumo do que realmente permanece pendente

### Swirl Blast
- [ ] +25% de `maxHp` contra Chefe/Dourado além do dano-base.
- [ ] Hitbox física coerente com o tamanho visual.
- [ ] Swirl manter sensação de velocidade enquanto o mundo desacelera.
- [ ] Refazer a coreografia de câmera/FOV/slow motion.
- [ ] Rastro de destruição persistente e legível.
- [ ] Impactos por vítima e impacto especial contra boss.
- [ ] Regra explícita de interação com escudo do Chefe.

### Cartas — Arcade
- [ ] Remover a experiência de overlay dominante no Arcade.
- [ ] Criar draft compacto no topo com o combate ainda visível.
- [ ] Definir se o bullet-time será temporário ou continuará enquanto a escolha estiver pendente.
- [ ] Separar, se necessário, recompensa pendente de `phase === 'cardChoice'`.
- [ ] Impedir acúmulo ilimitado de drafts pendentes.
- [ ] Validar teclado/gamepad e controle da nave durante a escolha.

### Fog
- [ ] Tornar o fog perceptível como volume espacial mesmo sem inimigos.
- [ ] Fazer estrelas próximas/intermediárias participarem da atenuação.
- [ ] Criar bancos de névoa visualmente localizados.
- [ ] Fazer o spawn/materialização de inimigos interagir visualmente com esses bancos.
- [ ] Validar visualmente trilho e arena sem depender apenas dos números de densidade.

### Superchecagem dos inimigos
- [ ] Boss realmente invulnerável durante transição em todos os caminhos de dano.
- [ ] Centralizar morte/remoção e impedir decremento duplo de `Squadron.remaining`.
- [ ] Preservar dano 2 casco / 4 escudo da Sentinela até `player.takeDamage()`.
- [ ] Homing e Swirl abandonarem alvo em `fadingOut`.
- [ ] Campo do Enxame-Ímã parar durante `fadingOut`.
- [ ] Tornar wobble estritamente visual, sem alterar posição lógica.
- [ ] Corrigir direção unitária usada no quaternion das mini-naves do Dourado.
- [ ] Usar swept collision nos projéteis inimigos comuns.
- [ ] Recalibrar Enxame-Ímã para a velocidade atual do tiro normal.
- [ ] Impedir rajada do Boss durante transição.
- [ ] Corrigir comportamento do Tank `DISENGAGING` em arena.
- [ ] Tornar `severChainAt` do Verme idempotente/centralizado.
