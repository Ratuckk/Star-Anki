# Forgot — itens esquecidos, incompletos ou ainda não integrados (Snapshot Histórico v0.99.34)

> **Documento Arquivado / Snapshot Histórico da v0.99.34**
> Todos os itens deste snapshot foram resolvidos e reconciliados na versão v0.99.35.
> As fontes canônicas operacionais atuais são:
> - [`docs/planning/BACKLOG.md`](../../planning/BACKLOG.md)
> - [`docs/progress/CURRENT.md`](../CURRENT.md)

---

# Conteúdo Histórico Original (v0.99.34)

> Fonte de verdade operacional: **o código do `main` atual**. Relatórios do Antigravity, walkthroughs, branches locais e dumps de testes são evidência importante, mas não fecham um item enquanto a mudança não estiver integrada ao `main` e revalidada nele.
>
> Este arquivo consolida: **Swirl Blast**, **cartas no Arcade**, **Fog**, **superchecagem dos inimigos**, **caça de bugs dos Wingmen**, **fuzz/runtime dos Wingmen** e agora também **trabalho local do Antigravity que foi implementado/testado fora do `main`, mas ainda precisa ser portado ou reconciliado**.

## Legenda

- [x] Concluído no `main` ou confirmado como resolvido no código atual.
- [ ] Pendente no `main`.
- **LOCAL ANTIGRAVITY** = existe evidência de implementação/teste em workspace/branch local, mas não deve ser tratado como concluído no projeto principal sem integração e nova validação.

---

# 3 — Swirl Blast

## O que já existe no `main`

- [x] Projétil perfurante próprio.
- [x] Cooldown próprio.
- [x] Slow motion associado ao disparo.
- [x] Alteração temporária de FOV/punch.
- [x] Visual próprio com corpo/núcleo, espiral, anéis, aura, plume/exaustão e rotação.
- [x] Afterimages/trilha básica.
- [x] Homing limitado contra Chefe e Dourado quando travados.
- [x] Pipeline de colisão perfurante separado.
- [x] Pode atravessar múltiplos inimigos.

## Informação nova — patch local do Antigravity

O walkthrough do Antigravity descreve uma implementação local com:

- **30% de `boss.maxHp` de dano adicional** contra o Boss.
- **Dourado explicitamente excluído** desse bônus percentual.
- `SWIRL_BLAST_BASE_HIT_RADIUS = 3.0`.
- Colisão volumétrica swept sphere/capsule.
- Teste específico de Lock-On/Swirl reportado como aprovado.

Essa implementação **não aparece no `main` atual**. Portanto, estes pontos continuam pendentes no projeto principal.

### Atenção à regra de dano

O pedido do usuário foi de **no mínimo 25% da vida máxima dos bosses como dano adicional ao contato**. Portanto:

- 30% no Boss satisfaz o piso de “no mínimo 25%”.
- Porém, o projeto também usa em outros pontos a regra de que **“chefes inclui o Dourado”**.
- Logo, se Dourado continua pertencendo à categoria de boss para esta mecânica, a implementação local que o exclui **não atende ao requisito completo**.
- Não voltar a fixar o documento em “exatamente 25%” sem necessidade; o requisito atual é **>= 25%**, salvo decisão posterior do usuário.

## Pendente no `main`

- [ ] **Dano percentual contra boss-class:** aplicar dano-base + **>=25% de `maxHp`** aos alvos que forem definidos como boss para o Swirl.
  - Usar `maxHp`, nunca HP atual.
  - Definir explicitamente se Dourado recebe o bônus; a direção histórica do projeto indica que sim.
  - Definir arredondamento apenas se o pipeline exigir dano inteiro.
  - Proteger FSM/transições cinematográficas do Boss.

- [ ] **Integrar a hitbox volumétrica do Swirl ao `main`.**
  - Usar um raio físico próprio, com referência inicial de `3.0u` do patch local.
  - Swept capsule/sphere entre posição anterior e atual.
  - O raio deve corresponder ao corpo sólido visual, não à aura.
  - Testar raspões, inimigos pequenos/grandes, Boss, Dourado, Fragata e detritos.

- [ ] **Separar a velocidade do Swirl do slow motion global.**
  - O mundo pode desacelerar, mas o Swirl precisa manter sensação de velocidade extrema.
  - Não quebrar swept collision ao usar tempo não escalado ou solução equivalente.

- [ ] **Refazer a coreografia visual de disparo/câmera/FOV.**
  - O simples fato de timers de slow motion/FOV existirem não significa que o efeito esteja aprovado.
  - Criar antecipação, liberação e retorno legíveis.
  - Evitar FOV que faça o projétil parecer menor/fraco.
  - Validar em gameplay real.

- [ ] **Criar rastro de destruição persistente e legível.**
  - O caminho deve continuar visível por alguns décimos de segundo.
  - Preferir emissão por distância percorrida.
  - Cada inimigo atravessado deve produzir ruptura/impacto próprio.
  - Uma fileira de inimigos precisa deixar uma sequência clara de destruição.

- [ ] **Diferenciar impacto comum de impacto em Boss/Dourado.**
  - Feedback próprio e inequívoco.
  - Definir interação com escudo do Boss: quebra, atravessa, bloqueia percentual, aplica parcial etc.

## Critérios mínimos de aceitação do Swirl

- [ ] Corpo sólido tocou visualmente o alvo => colisão registra.
- [ ] Swirl continua parecendo rápido durante slow motion.
- [ ] Trajetória permanece perceptível depois da passagem.
- [ ] Boss-class recebe dano-base + percentual aprovado de `maxHp`.
- [ ] Câmera/FOV retornam exatamente ao estado correto sem drift cumulativo.
- [ ] Regressão do Boss não pula transições/cutscenes.

---

# 5 — Obtenção de cartas no modo Arcade

## Já existe

- [x] Escolha de cartas no Arcade.
- [x] Bullet-time opcional durante `cardChoice`.
- [x] Time scale específico.
- [x] Escolha por teclas numéricas.
- [x] Overlay atual com cartas/inspetor.

## Pendente

- [ ] **A escolha de cartas não deve dominar a tela no Arcade.**
- [ ] Criar apresentação exclusiva/compacta para Arcade.
  - Três opções na região superior.
  - Centro da ação, mira, nave e inimigos continuam visíveis.
  - Sem inspetor grande de build por padrão.
  - Cada opção: índice, ícone, nome e descrição curta suficiente para escolha rápida.

- [ ] **Definir comportamento final do bullet-time.**
  - Direção preferida: slow motion curto de leitura e depois retorno à velocidade normal mesmo com draft pendente.
  - Ainda é decisão de design; não tratar timing sugerido como requisito fechado sem aprovação.

- [ ] **Separar recompensa pendente da ideia de modal/pausa de combate.**
  - Avaliar `arcadeDraftPending` ou equivalente.
  - Continuar combate durante a escolha.
  - Não acumular drafts ilimitadamente.

- [ ] **Preservar controles de nave/combate durante o draft**, exceto inputs reservados para a escolha.
- [ ] Validar teclado e gamepad.

## Direção preferida

**Draft Tático:** 3 chips compactos no topo, `1/2/3`, jogo visível e ativo, slow motion apenas como janela curta de leitura.

---

# 10 — Fog

## Já existe

- [x] `THREE.FogExp2`/fog funcional.
- [x] Densidade recalibrada por distância de spawn.
- [x] Multiplicador de arena.
- [x] Perfis de fog para Boss/Dourado/Tempestade de Detritos.
- [x] Sistemas táticos consultam densidade do fog.
- [x] Wisps/partículas suaves.
- [x] Bolsões configuráveis.

## Pendente

- [ ] **Dar referência visual inequívoca ao fog.**
  - Preto sobre fundo preto hoje comunica mais “inimigo sumindo” que névoa presente.

- [ ] **Fazer camada próxima/intermediária de estrelas responder ao fog.**
  - Não precisa esconder toda estrela profunda.
  - Deve existir profundidade visual suficiente para ver estrelas entrando/saindo da névoa.

- [ ] **Criar bancos/volumes localizados de névoa em vez de depender de wisps espalhados.**
  - Jogador precisa identificar uma massa de fog antes de atravessá-la.
  - Reaproveitar recursos existentes quando possível.
  - Evitar virar overlay cinza de tela inteira.

- [ ] **Integrar materialização de inimigos aos bancos de fog.**
  - Spawn deve parecer emergir/condensar a massa local.

- [ ] **Recalibrar visualmente em gameplay real**, trilho e arena.

## Critérios de aceitação do Fog

- [ ] Sem inimigos nem tiros, ainda é possível apontar onde está um banco de fog.
- [ ] Estrelas próximas/intermediárias desaparecem/reaparecem progressivamente nos volumes.
- [ ] Spawn parece sair de uma massa presente no espaço.
- [ ] Continua legível em Boss/Dourado.
- [ ] Não depende de SkyDome/planetas para funcionar visualmente.

---

# Superchecagem dos inimigos

> Estado anteriormente auditado contra `main`: 15 achados, sendo 3 corrigidos, 2 parciais e 10 pendentes. Continuar usando o código atual como fonte de verdade.

## Corrigidos — manter fechados

- [x] **#3 — Spawn `peek/materialize/settle` participava do gameplay.**
  - IA/disparo/colisão bloqueados enquanto spawn está pendente.

- [x] **#4 — Spawn alterava materiais compartilhados.**
  - Material por instância/restauração corrigidos.

- [x] **#6 — Sussurro gerava reforços nível 1 fora do pipeline.**
  - Usa dificuldade atual + `registerSpawn()`.

## Parciais

- [ ] **#7 — Homing/Swirl já disparado pode continuar perseguindo alvo em `fadingOut`.**
  - Aquisição nova foi endurecida.
  - Falta validar alvo já armazenado a cada frame também contra `fadingOut`.

- [ ] **#8 — Campo do Enxame-Ímã continua ativo durante `fadingOut`.**
  - Spawn pendente já é ignorado.
  - Falta retirar fonte em fade do campo magnético.

## Pendentes

- [ ] **#1 — Boss pode receber dano durante transição declarada invulnerável.**
  - Bloquear dano na origem, não restaurar piso de HP depois.
  - Cobrir tiro normal, carregado, Swirl, AoE e aríete.

- [ ] **#2 — `Squadron.remaining` pode ser decrementado duas vezes.**
  - Centralizar morte/remoção e side effects.

- [ ] **#5 — Sentinela perde distinção 2 dano casco / 4 dano escudo.**
  - Preservar ambos até resolução final.

- [ ] **#9 — Wobble visual altera posição lógica do inimigo.**
  - Separar offset visual de posição autoritativa.

- [ ] **#10 — Quaternion das mini-naves do Dourado usa vetor escalado.**
  - Manter direção unitária separada de velocidade.

- [ ] **#11 — Projéteis inimigos comuns usam colisão pontual.**
  - Adotar swept collision robusta a `dt`/FPS.

- [ ] **#12 — Enxame-Ímã calibrado para velocidade antiga dos tiros.**
  - Recalibrar para física atual e validar em gameplay.

- [ ] **#13 — Boss pode disparar rajada normal durante transição.**
  - Bloquear ataque acidental por timer durante fase cinematográfica/invulnerável.

- [ ] **#14 — Tank em `DISENGAGING` na arena continua perseguindo no `main`.**
  - O `main` atual ainda usa `updateTankArenaChase()` durante `DISENGAGING`.
  - Definir saída correta em arena ou impedir entrada indevida nesse estado.

- [ ] **#15 — Verme pode executar `severChainAt` mais de uma vez.**
  - Tornar idempotente ou centralizar responsabilidade.

## Prioridade

1. [ ] P0 — Boss invulnerabilidade/transição (#1).
2. [ ] P0 — morte centralizada + `Squadron.remaining` (#2).
3. [ ] P0 — dano da Sentinela (#5).
4. [ ] P1 — homing/Swirl abandonar `fadingOut` (#7).
5. [ ] P1 — Boss sem volley na transição (#13).
6. [ ] P1 — swept collision projéteis inimigos (#11).
7. [ ] P1 — Enxame-Ímã fade + recalibração (#8/#12).
8. [ ] P2 — wobble visual (#9).
9. [ ] P2 — quaternion Dourado (#10).
10. [ ] P2 — Tank disengage arena (#14).
11. [ ] P2 — idempotência Verme (#15).

---

# Wingmen — caça de bugs do Antigravity

## Nota de status importante

O material mais recente do Antigravity afirma que os 10 bugs abaixo foram **corrigidos localmente** e que as suítes passaram. Porém, a inspeção do `main` atual ainda encontra pelo menos estes três problemas originais:

- `getVitalSnapshots()` ainda retorna `worldPos: w.mesh.position` sem clone.
- `getWingmanCount()` ainda retorna `activeWingmen.length` sem excluir `retreating`.
- `player.markWingmanDown()` ainda é chamado apenas a partir de `completedRetreatIds` ao fim da retirada.

Além disso, o branch remoto `audit/full-project-bughunt-v09932` consultado ainda mostrava `getWingmanCount: () => activeWingmen.length` no snapshot inspecionado.

**Conclusão:** as correções do Antigravity são hoje um **patch local validado**, não uma conclusão do `main`. Não fechar os itens até portar/reconciliar e testar novamente.

## 10 bugs levantados

- [ ] **Bug 1 — CRÍTICO: mutação de posição 3D via `.project(camera)`.**
  - Correção local alegada: `getVitalSnapshots()` clona posição e consumidor também clona antes de `project()`.

- [ ] **Bug 2 — ALTO: recovery/respawn bloqueado durante 5s de `retreating`.**
  - Correção local alegada: remover instância em retreat do mesmo perfil antes de respawn.

- [ ] **Bug 3 — ALTO: `getWingmanCount()` inclui retirantes.**
  - Correção local alegada: filtrar `w.state !== 'retreating'`.

- [ ] **Bug 4 — ALTO: `markWingmanDown` atrasado e pool roguelike inconsistente.**
  - Correção local alegada: marcar down no frame em que `hit?.retreating` ocorre.

- [ ] **Bug 5 — MÉDIO: falas fantasmas de pilotos em retirada.**
  - Correção local alegada: filtrar retreating de todos os pools e cancelar conversas pendentes.

- [ ] **Bug 6 — MÉDIO: `auxShieldVisual`/cor crítica congelados no retreat.**
  - Correção local alegada: limpar visuais no início do retreat.

- [ ] **Bug 7 — MÉDIO: Chain Ram do Falco usa alvo inválido/ignora Dourado/ponto errado.**
  - Correção local alegada: `getAliveEnemies()`, readiness e `hit.worldPos`.

- [ ] **Bug 8 — MÉDIO: `isWingmanCombatTargetReady` aceita spawn pendente/HP 0 em alguns caminhos.**
  - Correção local alegada: rejeitar `spawnPhase`, `hp <= 0`, `health <= 0`.

- [ ] **Bug 9 — MÉDIO: vazamento de estado em `clearSquadron()`.**
  - Correção local alegada: reset de comando, timers, morale, cooldown multipliers e histórico transitório.

- [ ] **Bug 10 — ESTABILIDADE: alocações em hot loop e risco de NaN.**
  - Correção local alegada: reutilizar scratch vectors e proteger normalização de vetor zero.

## Testes reportados pelo Antigravity local

O relatório local mais recente afirma:

- [x] `src/wingman-bughunt.test.mjs`: 10/10.
- [x] `src/selftest.mjs`: 33/33 suítes.
- [x] `tools/state-fuzz-audit.mjs`: 0 falhas / 6 verificações.
- [x] `tools/full-project-audit.mjs`: 0 erros / 0 avisos, 102 arquivos auditados.

**Esses checks são evidência do workspace local, não validação do `main` atual.**

## Integração obrigatória

- [ ] Portar os 10 fixes ao `main` sem sobrescrever mudanças posteriores.
- [ ] Recriar/manter `src/wingman-bughunt.test.mjs` no `main`.
- [ ] Integrar a suíte ao `selftest.mjs` se ainda não estiver.
- [ ] Rodar novamente todos os testes no código já reconciliado.
- [ ] Só então marcar cada bug acima como `[x]`.

### Perigo de cherry-pick/replace cego

O `main` recebeu alterações posteriores, incluindo rádio/cooldown da Miyu e ownership de locks triangulares da Miyu. Portanto:

- [ ] Não substituir `wingmen.js`, `lockon.js`, `combat/index.js` ou rádio por versões inteiras do workspace antigo.
- [ ] Portar cada fix semanticamente.
- [ ] Preservar as mudanças mais novas do `main`.

---

# Wingmen — evidência fuzz/runtime adicional

## Snapshot de falhas observado anteriormente

Um dump anterior registrou:

- **3.644 expectativas avaliadas**.
- **3.612 aprovadas**.
- **32 falhas**.
- **29/32** eram Wingmen praticamente sobrepostos por mais de 0,5s.
- **3/32** eram feedback de dano de `detrito` com `damage: 0` e `pilotId: null`.

O relatório posterior do Antigravity local afirma `state-fuzz-audit` com **0 falhas** após correções. Tratar como dois snapshots temporais diferentes; não apagar a evidência antiga até o `main` reproduzir o resultado zero.

## Sobreposição persistente / formação

- [ ] Corrigir clumping sem afrouxar o threshold do teste.
- [ ] Revisar autoridade entre formation target, separation, catch-up e obstacle avoidance.
- [ ] Separation deve conseguir resolver sobreposição também em `escort`, `damaged-passive`, `ram`, `dogfight`, `attack-lane` e `support-player`.

### Evidência do dump

- Todos os 6 pares possíveis entre 4 pilotos aparecem em falhas.
- Par 1–2 foi o mais recorrente no dump original.
- A maioria relevante ocorreu em `patrol/formation`, mas não exclusivamente.

## Catch-up

- [ ] Adicionar/validar histerese ou debounce para impedir thrashing.
- [ ] Validar clamp de boost.
- [ ] O dump mostrou alternâncias frequentes de `catchup-started`/`catchup-ended` e boosts muito altos em alguns momentos.
- [ ] Confirmar no `main` reconciliado se a correção local realmente eliminou o padrão.

## Obstacle avoidance

- [ ] Verificar churn/reinicialização excessiva da curva preditiva.
- [ ] Medir se compete com formation/separation/catch-up.
- [ ] Não reduzir evasão apenas para silenciar telemetria.

## Feedback de dano de Detrito

- [ ] Definir contrato correto de dano ambiental.
- [ ] Se `damage === 0`, não emitir “dano confirmado” como hit válido, salvo semântica explícita de bloqueio/absorção.
- [ ] `pilotId: null` pode ser legítimo para ambiente; representar autoria ambiental com `sourceKind`/flag equivalente em vez de inventar piloto.
- [ ] Adicionar teste de Detrito para jogador/Wingman/receptores aplicáveis.

## Critério de fechamento do fuzz

- [ ] Executar fuzz prolongado no `main` integrado.
- [ ] Exigir `expectativas_falhas: []` para considerar esta rodada encerrada.

---

# Trabalho local do Antigravity ainda não integrado

> Esta seção registra implementações descritas nos walkthroughs enviados, mas ausentes ou diferentes no `main` atual. O objetivo é impedir que trabalho já feito localmente seja esquecido, sem fingir que já está em produção.

## Lock-On local

O walkthrough descreve:

- Prioridade absoluta para Boss ativo.
- Depois, maior `maxHp` autoritativo.
- Desempate por `entity.id`.
- Common 1 lock, Horda 2, Boss/Dourado multi-lock até orçamento.
- Exclusão de `dying`, `fadingOut` e HP <= 0.

### Estado do `main`

O `main` atual já evoluiu para um sistema com **origem de locks BASE vs MIYU**, orçamentos independentes e ownership de locks triangulares da Miyu. Ele não deve ser substituído por uma versão local mais antiga só para recuperar a prioridade `Boss > maxHp`.

- [ ] Se a prioridade `Boss > maior maxHp` ainda for desejada, portar apenas essa política para a arquitetura atual de BASE/MIYU.
- [ ] Preservar locks da Miyu, budgets separados, multi-lock e estabilidade atuais.
- [ ] Adicionar testes específicos para prioridade dentro de cada source/budget.

## Swirl local

- [ ] Portar/reconciliar hitbox swept de `3.0u`.
- [ ] Portar/reconciliar dano percentual, ajustando a regra de alvo para o requisito atual (`>=25%` e decisão explícita sobre Dourado).
- [ ] Não considerar isso suficiente para fechar o overhaul visual: câmera/FOV/slow motion/rastro de destruição continuam pendentes.

## Tank local

O walkthrough descreve um overhaul muito maior do Tank:

- Modelo modular/`visualGroup` com recoil desacoplado da hitbox.
- Hit radius 2.80.
- FSM de 9 estados.
- Standoff pesado no trilho.
- `BRACING`, `TELEGRAPHING`, `ATTACKING`, `RECOVERY`, `REPOSITIONING`, `STAGGERED`, `DISENGAGING`.
- 3 ataques: Siege Shot, Suppression Burst e Heavy Ram.
- Stagger por Swirl com proteção contra stun-lock.
- Blindagem visual por faixas de HP.
- Morte própria de 0.65s.
- Score 75 e peso populacional 2.
- Arena sem fuga por contador de ciclos.
- Suíte `tank.test.mjs` reportada 13/13.

### Estado do `main`

O `main` atual ainda identifica o Tank como implementação genérica: modelo simples, tiro genérico, sem movimento próprio no trilho e `DISENGAGING` em arena continuando o chase.

- [ ] Portar/reconciliar o overhaul de Tank ao `main`.
- [ ] Não sobrescrever fixes posteriores de inimigos/spawn lifecycle.
- [ ] Revalidar `DISENGAGING` em arena após integração.
- [ ] Revalidar score, população, radar, hitbox, morte, Stagger e os três ataques.
- [ ] Rodar `tank.test.mjs` + `selftest` + fuzz + auditoria global no resultado reconciliado.

---

# Resumo do que realmente permanece pendente no `main`

## Swirl Blast

- [ ] Dano-base + **>=25% `maxHp`** contra boss-class, com regra explícita para Dourado.
- [ ] Integrar hitbox swept volumétrica coerente com visual.
- [ ] Swirl manter sensação de velocidade durante slow motion.
- [ ] Refazer câmera/FOV/slow motion.
- [ ] Rastro de destruição persistente.
- [ ] Impactos por vítima e impacto especial em Boss/Dourado.
- [ ] Regra de escudo do Boss.

## Cartas — Arcade

- [ ] Remover overlay dominante.
- [ ] Draft compacto no topo.
- [ ] Definir timing final do bullet-time.
- [ ] Separar recompensa pendente de modal de combate.
- [ ] Impedir acúmulo ilimitado.
- [ ] Validar teclado/gamepad e controle da nave.

## Fog

- [ ] Fog visível como volume espacial sem depender de inimigos.
- [ ] Estrelas próximas/intermediárias afetadas.
- [ ] Bancos localizados.
- [ ] Spawn interagindo visualmente com bancos.
- [ ] Playtest de trilho/arena.

## Superchecagem dos inimigos

- [ ] Boss invulnerável durante transição em todos os caminhos.
- [ ] Morte/remoção centralizada e `Squadron.remaining` sem decremento duplo.
- [ ] Sentinela 2 casco / 4 escudo preservado.
- [ ] Homing/Swirl abandona `fadingOut`.
- [ ] Enxame-Ímã para no fade.
- [ ] Wobble puramente visual.
- [ ] Quaternion Dourado unitário.
- [ ] Swept collision de projétil inimigo comum.
- [ ] Recalibrar Enxame-Ímã.
- [ ] Boss sem volley na transição.
- [ ] Corrigir/absorver Tank `DISENGAGING` pela integração do overhaul.
- [ ] `severChainAt` idempotente.

## Wingmen

- [ ] Integrar ao `main` os 10 fixes já reportados/testados localmente pelo Antigravity.
- [ ] Preservar mudanças posteriores do rádio/Miyu/lock ownership.
- [ ] Corrigir clumping/separation/catch-up se ainda reproduzir após integração.
- [ ] Resolver contrato de feedback de dano de Detrito.
- [ ] Reexecutar `wingman-bughunt`, `selftest`, `state-fuzz-audit` e `full-project-audit` no `main` reconciliado.
- [ ] Exigir fuzz sem expectativas falhas antes de fechar.

## Trabalho local a não perder

- [ ] Portar prioridade de Lock-On, se ainda desejada, para a arquitetura BASE/MIYU atual.
- [ ] Portar hitbox/dano local do Swirl com regra atualizada.
- [ ] Portar overhaul completo do Tank.
- [ ] Não fazer replace bruto de arquivos locais antigos sobre o `main` mais novo.
