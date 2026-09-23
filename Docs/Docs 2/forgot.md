# Forgot — itens esquecidos ou ainda não implementados

> Este arquivo consolida o que ficou faltando ou parcialmente implementado nos levantamentos recentes: **3 (Swirl Blast)**, **5 (obtenção de cartas no modo Arcade)**, **10 (Fog)**, a **superchecagem dos inimigos**, a **caça extensiva de bugs dos Wingmen levantada pelo Antigravity** e **evidências adicionais de fuzz/runtime dos Wingmen**. Sugestões opcionais não são tratadas como requisitos aprovados. Itens já corrigidos ficam marcados como concluídos para não voltarem acidentalmente ao backlog.

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

## Caça extensiva de bugs dos Wingmen — Antigravity

> Esta seção preserva o diagnóstico e o plano de correção fornecidos pelo **Antigravity**. Estes itens entram no `forgot.md` como **backlog a verificar/corrigir**; não devem ser marcados como concluídos sem conferir o `main` atual e executar os testes correspondentes.

### Bugs levantados pelo Antigravity

- [ ] **Bug 1 — CRÍTICO: corrupção da posição mundial do Wingman via `.project(camera)` em `getVitalSnapshots`.**
  - `getVitalSnapshots()` teria retornado `worldPos: w.mesh.position` por referência direta.
  - O `game-loop.js` projeta `v.worldPos.project(camera)` ao calcular a posição de HUD de um Wingman ferido.
  - Como `Vector3.project()` muta o vetor in-place, isso pode substituir a posição 3D real do Wingman por coordenadas NDC.
  - Correção proposta: retornar `w.mesh.position.clone()` e ainda usar `v.worldPos.clone().project(camera)` defensivamente no consumidor.
  - **Critério:** projetar vitais para a tela nunca pode alterar `mesh.position` do aliado.

- [ ] **Bug 2 — ALTO: recuperação/respawn bloqueados durante os 5s de `retreating`.**
  - `spawnMember(id)` impediria uma nova instância porque o piloto ainda permanece em `activeWingmen` durante a retirada.
  - `recoverMember(id)` delega para `spawnMember(id)` e pode falhar silenciosamente nesse intervalo.
  - `setWingmanCount(n)` sofre o mesmo conflito de slot.
  - Correção proposta: se a instância existente do piloto estiver em `state === 'retreating'`, removê-la antes de instanciar a nave recuperada.
  - **Critério:** uma carta de recuperação escolhida durante a retirada deve recuperar o piloto imediatamente e nunca ser descartada silenciosamente.

- [ ] **Bug 3 — ALTO: `getWingmanCount()` conta aliados em retirada.**
  - A contagem teria usado `activeWingmen.length`, enquanto outros consumidores ignoram `state === 'retreating'`.
  - Isso pode inflar bônus de spawn de inimigos, HUD e suporte sincronizado depois que o aliado já foi abatido.
  - Correção proposta: contar somente `activeWingmen.filter((w) => w.state !== 'retreating')`.
  - **Critério:** o Wingman deve deixar de contar como ativo no instante em que entra em retirada.

- [ ] **Bug 4 — ALTO: `markWingmanDown` atrasado até o fim da retirada e pool roguelike inconsistente.**
  - O Antigravity apontou que `player.markWingmanDown(profileId)` só era chamado quando o retreat terminava.
  - Durante os 5s intermediários, cartas de upgrade do piloto abatido ainda podiam entrar no pool e a carta de recuperação ainda não aparecia.
  - Correção proposta: chamar `player.markWingmanDown?.(profileId)` imediatamente quando o hit coloca o aliado em `retreating`.
  - **Critério:** pool roguelike, estado do Player e estado visual do Wingman devem concordar desde o primeiro frame da retirada.

- [ ] **Bug 5 — MÉDIO: falas fantasmas de pilotos em `retreating`.**
  - Pilotos abatidos ainda poderiam participar de pools/gatilhos como `player_low_health`, `boost_used`, `charged_shot_used`, dano recebido, abates de laser e call-response.
  - Correção proposta: filtrar `w.state !== 'retreating'` em todos os pools/gatilhos e cancelar threads pendentes que envolvam pilotos que saíram.
  - **Critério:** um piloto em retirada não pode iniciar nem continuar conversa casual/combativa como se ainda estivesse ativo.

- [ ] **Bug 6 — MÉDIO: `auxShieldVisual` e cor crítica congelados durante retirada.**
  - O bloco de `retreating` dá `continue` antes das linhas que desligam o escudo auxiliar e restauram materiais de dano.
  - Isso pode deixar a bolha auxiliar do Peppy e/ou o piscar vermelho crítico congelados durante a fuga.
  - Correção proposta: no próprio bloco de retreat, forçar `auxShieldVisual.visible = false` e restaurar as cores originais de `damageMaterials`/`damageColors`.
  - **Critério:** a retirada sempre começa com efeitos temporários de combate limpos, sem escudo auxiliar residual ou material crítico travado.

- [ ] **Bug 7 — MÉDIO: seleção de alvos da Investida em Cadeia do Falco.**
  - O encadeamento iteraria `enemies.getAlive()` diretamente, sem aplicar toda a validação de `isWingmanCombatTargetReady(candidate)` e sem incluir Dourados.
  - O efeito de explosão também poderia usar `target.mesh.position` mesmo quando `hit.worldPos` é a posição correta de impacto.
  - Correção proposta: usar `getAliveEnemies()`/pipeline equivalente já validado, incluir Dourados e preferir `hit.worldPos || target.mesh.position` nos efeitos.
  - **Critério:** a cadeia só pode saltar para alvos gameplay-ready e os efeitos devem nascer no ponto real do hit.

- [ ] **Bug 8 — MÉDIO: `isWingmanCombatTargetReady` não rejeita `spawnPhase` nem HP zerado em todos os caminhos.**
  - Sem `readyTargets`, uma validação direta poderia considerar inimigos em `peek/materialize/settle` ou com `hp <= 0`/`health <= 0` como prontos.
  - Correção proposta: rejeitar explicitamente `target.spawnPhase`, `hp <= 0` e `health <= 0` quando esses campos forem finitos.
  - **Critério:** nenhum Wingman pode atacar um alvo ainda materializando ou já morto, independentemente do caminho usado para obter o alvo.

- [ ] **Bug 9 — MÉDIO: vazamento de estado em `clearSquadron()`.**
  - O reset não limparia `squadronCommandMode`, timers de comando/cooldown, `moraleDamageBonus`, `abilityCooldownMultByProfileId` e outros históricos transitórios.
  - Isso pode fazer um novo setor/sessão nascer carregando `focus` ou multiplicadores da partida anterior.
  - Correção proposta: reset completo de modos, timers, bônus e mapas transitórios em `clearSquadron()`.
  - **Critério:** após `clearSquadron()`, recriar Wingmen deve ser equivalente a iniciar o subsistema do zero, exceto por estado explicitamente persistente.

- [ ] **Bug 10 — LEVE/ESTABILIDADE: alocações desnecessárias e risco de NaN em hot loops.**
  - Foram apontadas alocações de `new THREE.Vector3()`/`.clone()` em caminhos frequentes e normalização sem teste de magnitude zero no Boombuster da Miyu.
  - Correção proposta: reutilizar vetores scratch como `_wmLaserMuzzle`/`_wmRel` e proteger toda normalização que possa receber vetor de comprimento zero.
  - **Critério:** nenhuma direção zero pode produzir NaN; hot loops de tiro/manobra não devem criar vetores descartáveis sem necessidade.

### Arquivos indicados pelo plano do Antigravity

- [ ] **`src/combat/wingman-flight-stability.js`**
  - Reforçar `isWingmanCombatTargetReady()` com rejeição de `spawnPhase`, `hp <= 0` e `health <= 0`.

- [ ] **`src/combat/wingmen.js`**
  - Clonar posição em `getVitalSnapshots()`.
  - Fazer `getWingmanCount()` ignorar `retreating`.
  - Permitir respawn/recovery substituindo instância em retreat.
  - Resetar estado transitório completo em `clearSquadron()`.
  - Limpar escudo auxiliar e materiais críticos no retreat.
  - Corrigir Chain Ram do Falco.
  - Excluir retreating do rádio/call-response.
  - Reusar vetores scratch e proteger normalizações.

- [ ] **`src/combat/index.js`**
  - Marcar `player.markWingmanDown?.(profileId)` imediatamente quando o dano iniciar retreat.

- [ ] **`src/game-loop.js`**
  - Projetar HUD com `v.worldPos.clone().project(camera)` de forma defensiva.

### Testes obrigatórios propostos pelo Antigravity

- [ ] Criar/manter `src/wingman-bughunt.test.mjs` cobrindo os 10 cenários:
  1. Imutabilidade de `mesh.position` ao projetar vitais para NDC.
  2. Recuperação durante os 5s de retreat.
  3. `getWingmanCount()` ignorando retreat.
  4. `markWingmanDown` imediato e pool roguelike consistente.
  5. Rádio sem falas de Wingmen em retreat.
  6. Desativação de `auxShieldVisual` e restauração de materiais no retreat.
  7. Chain Ram do Falco com alvos gameplay-ready e suporte a Dourados.
  8. `isWingmanCombatTargetReady` rejeitando `spawnPhase` e HP zerado.
  9. `clearSquadron()` limpando comandos/bônus/multiplicadores transitórios.
  10. Ausência de NaN e redução de alocações nos caminhos auditados.

- [ ] Executar `node src/wingman-bughunt.test.mjs`.
- [ ] Executar `node src/selftest.mjs`.
- [ ] Executar `node tools/state-fuzz-audit.mjs`.
- [ ] Executar `node tools/full-project-audit.mjs`.
- [ ] Confirmar que a suíte de regressão do projeto continua integralmente aprovada e que `full-project-audit` termina com **0 erros e 0 avisos**.

### Prioridade sugerida para os bugs de Wingmen do Antigravity

1. [ ] **P0 — Bug 1: corrupção de posição por `.project(camera)`.**
2. [ ] **P0 — Bug 2: recovery/respawn descartado durante retreat.**
3. [ ] **P0 — Bug 4: `markWingmanDown` atrasado / pool roguelike incorreto.**
4. [ ] **P1 — Bug 3: contagem de Wingmen incluindo retreat.**
5. [ ] **P1 — Bug 8: target readiness incompleta.**
6. [ ] **P1 — Bug 7: Chain Ram do Falco.**
7. [ ] **P1 — Bug 9: vazamento de estado em `clearSquadron()`.**
8. [ ] **P2 — Bug 5: rádio fantasma.**
9. [ ] **P2 — Bug 6: visuais congelados no retreat.**
10. [ ] **P2 — Bug 10: estabilidade/performance dos hot loops.**

---

## Evidência adicional de fuzz/runtime dos Wingmen

> Dump adicional de verificação: **3.644 expectativas avaliadas, 3.612 aprovadas e 32 falhas**. Esta seção registra somente o que o dump comprova e separa fatos observados de hipóteses de causa.

### Falha reproduzida A — Wingmen permanecem praticamente sobrepostos

- [ ] **29 das 32 falhas são da expectativa “Wingmen não permanecem praticamente sobrepostos por mais de 0.5s”.**
  - As distâncias observadas nos eventos de falha variam de aproximadamente **0,0166 a 0,535 unidades**, com tempo de proximidade entre aproximadamente **0,5001 s e 0,5167 s**.
  - O problema não está restrito a um único par de pilotos: todos os pares aparecem em alguma falha.
  - O par **1–2** é o mais recorrente no dump, com 8 ocorrências; 0–3 e 2–3 aparecem 5 vezes cada; 0–2 e 1–3 aparecem 4 vezes cada; 0–1 aparece 3 vezes.
  - **17/29** falhas ocorreram com ambos em `patrol`; **20/29** ocorreram com ambos usando `navigation: formation`.
  - Também há falhas envolvendo `escort`, `damaged-passive`, `ram` e `dogfight`, portanto a correção não pode ficar restrita à formação-base.

- [ ] **Revisar a autoridade entre formation target, separation e catch-up.**
  - O dump mostra separação iniciando em alguns momentos, mas ainda registra `wingman-formation-clump/sobreposicao-persistente` depois.
  - A correção deve impedir que dois sistemas de navegação deem comandos incompatíveis no mesmo frame ou façam ambos os Wingmen convergirem para praticamente o mesmo ponto.
  - A separação precisa ter prioridade/autoridade suficiente para resolver sobreposição mesmo durante `escort`, `damaged-passive`, `attack-lane` e catch-up.

- [ ] **Adicionar histerese/debounce ao rail catch-up para impedir “thrashing”.**
  - Na timeline capturada há **16 `catchup-started` e 16 `catchup-ended`**.
  - Perto de `t≈494647–494947`, o catch-up liga e desliga repetidamente em intervalos muito curtos conforme o `longitudinalLag` cruza o limiar.
  - Há boosts muito altos no mesmo trecho, incluindo aproximadamente **41,8** e **69,33**, que merecem validação de clamp e estabilidade.
  - Isto é uma **hipótese de contribuição ao clumping**, não uma causa comprovada pelo dump: testar antes de alterar comportamento.

- [ ] **Revisar o churn de obstacle avoidance.**
  - A timeline contém **131 eventos `wingman-obstacle-avoidance / curva-preditiva-iniciada`**.
  - Muitos envolvem repetidamente os mesmos pilotos/obstáculos com poucos frames de diferença.
  - Verificar se isso é apenas telemetria verbosa ou se a curva preditiva está sendo reiniciada continuamente sem hysteresis/cooldown, competindo com formation/separation/catch-up.
  - Não reduzir a evasão só para silenciar o log; primeiro medir impacto real na trajetória.

### Critérios de aceitação para a formação/separação

- [ ] A expectativa existente de “não permanecer praticamente sobreposto por mais de 0,5 s” deve passar em fuzz prolongado sem simplesmente afrouxar o threshold do teste.
- [ ] O teste deve cobrir `patrol+patrol`, `escort+patrol`, `damaged-passive+patrol`, `ram+patrol` e casos com `attack-lane`/`support-player`.
- [ ] Todos os seis pares possíveis entre os quatro pilotos devem ser exercitados.
- [ ] `formation-separation` não pode ser imediatamente anulada por formation target, catch-up ou obstacle avoidance no frame seguinte.
- [ ] Catch-up deve possuir histerese suficiente para não alternar start/end a cada poucos frames ao redor do mesmo limiar.
- [ ] Qualquer boost de catch-up deve possuir limite seguro e não produzir salto/teleporte/convergência abrupta entre Wingmen.

### Falha reproduzida B — feedback de dano inválido de Detrito

- [ ] **3 das 32 falhas são da expectativa “Feedback de dano confirmado tem valor, posição e autoria válidos”.**
  - Nas três ocorrências o contexto é exatamente `kind: "detrito"`, `damage: 0` e `pilotId: null`.
  - Tempos observados: aproximadamente `218986.3`, `327934.7` e `409124.9`.
  - O dump comprova que um evento tratado como **dano confirmado** está sendo emitido sem valor de dano e sem autoria de piloto.

- [ ] **Definir a semântica correta do evento antes de corrigir.**
  - Se `damage === 0` significa que nenhum dano foi aplicado, o evento de “dano confirmado” não deve ser emitido como hit válido.
  - Se o Detrito realmente deveria causar dano naquele contato, corrigir o pipeline upstream que perdeu/zerou o valor.
  - `pilotId: null` pode ser legítimo para dano ambiental; nesse caso o contrato do evento/teste deve representar autoria ambiental explicitamente em vez de inventar um piloto.
  - Não mascarar a falha preenchendo valores fictícios apenas para satisfazer o teste.

### Critérios de aceitação para feedback de dano

- [ ] Um evento de dano confirmado precisa carregar um valor coerente com o dano realmente aplicado.
- [ ] Dano ambiental deve ter autoria explicitamente representável (`sourceKind`, `environmental` ou contrato equivalente) sem exigir `pilotId` artificial.
- [ ] Eventos de contato que resultam em zero dano devem ser classificados como bloqueio/contato/absorção, ou simplesmente não entrar no pipeline de “damage confirmed”, conforme a semântica escolhida.
- [ ] Adicionar caso automatizado específico para Detrito cobrindo jogador, Wingman e qualquer outro receptor válido do pipeline de dano.

### Sinais secundários do dump — investigar, não tratar como causa confirmada

- [ ] Existe pelo menos um evento `wingman-navigation-stall / velocity-recovered` para piloto 2 em `damaged-passive`; manter telemetria e verificar se reaparece em execuções longas.
- [ ] O volume de evasões preditivas e alternâncias de catch-up sugere competição entre controladores de movimento; instrumentar prioridade/owner do steering por frame antes de fazer refactor grande.
- [ ] Preservar no próximo dump contadores agregados por `state`, `navigationIntent`, par de pilotos, motivo de separation e motivo de catch-up start/end para facilitar comparação antes/depois.

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

### Wingmen — Antigravity
- [ ] Impedir corrupção de `mesh.position` por projeção NDC.
- [ ] Permitir recovery/respawn durante `retreating`.
- [ ] Excluir `retreating` de `getWingmanCount()`.
- [ ] Marcar piloto como down imediatamente ao entrar em retreat e corrigir o pool roguelike.
- [ ] Remover pilotos em retreat dos pools/threads de rádio.
- [ ] Limpar `auxShieldVisual` e materiais críticos durante retreat.
- [ ] Corrigir seleção/impacto da Chain Ram do Falco.
- [ ] Reforçar `isWingmanCombatTargetReady()` contra spawn pendente e HP zerado.
- [ ] Resetar todo estado transitório relevante em `clearSquadron()`.
- [ ] Remover riscos de NaN e alocações desnecessárias nos hot loops auditados.
- [ ] Implementar e executar a suíte `wingman-bughunt.test.mjs` + regressões globais.

### Wingmen — evidência fuzz/runtime adicional
- [ ] Corrigir sobreposição persistente dos Wingmen sem afrouxar a expectativa de 0,5 s.
- [ ] Fazer separation ter autoridade consistente contra formation/catch-up/obstacle avoidance e outros intents.
- [ ] Eliminar thrashing de rail catch-up com histerese/debounce e clamp de boost.
- [ ] Investigar reinicializações excessivas de obstacle avoidance e sua competição com outros steerings.
- [ ] Corrigir/definir o contrato do feedback de dano de Detrito (`damage: 0`, `pilotId: null`).
- [ ] Reexecutar fuzz prolongado e exigir `expectativas_falhas: []` para considerar esta rodada concluída.
