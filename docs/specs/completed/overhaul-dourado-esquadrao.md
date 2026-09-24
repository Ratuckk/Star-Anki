# STAR-ANKI — OVERHAUL DO INIMIGO DOURADO E ESQUADRÃO DE CAÇAS

> **Status:** CONCLUÍDO NA v0.99.36
> **Data:** 2026-09-23
> **Implementação:** `src/enemies/golden-squadron.js` e `src/enemies/golden.js`
> **Suíte de Testes:** `src/golden-squadron.test.mjs` e `tools/golden-squadron-runtime-fuzz.mjs`

## 1. OBJETIVO

Realizar um overhaul completo do inimigo Dourado implementado em `src/enemies/golden.js`.

O objetivo NÃO é substituir seu moveset. O objetivo é preservar sua identidade e ataques existentes, mas transformar o combate para que o Dourado seja mais dinâmico, presente, agressivo espacialmente, inteligente no uso do moveset, menos dependente de timers independentes e claramente reconhecível como comandante de um esquadrão.

As mini-naves atualmente invocadas também recebem overhaul completo. Elas deixam de funcionar essencialmente como projéteis homing com aparência de nave e passam a ser **caças subordinados persistentes, destrutíveis e coordenados pelo Dourado**.

Fantasia central: **Dourado = comandante agressivo de um esquadrão de caças.**

## 2. REGRA ABSOLUTA: ANALISAR ANTES DE ALTERAR

ANTES de implementar:

1. leia integralmente as instruções permanentes do projeto;
2. leia documentação/progresso relevante;
3. leia `golden.js` integralmente;
4. investigue todos os imports e sistemas utilizados;
5. sistema compartilhado de inimigos;
6. projéteis;
7. resolução de hits;
8. lock-on/homing;
9. minimapa;
10. recompensas/kills;
11. áudio;
12. efeitos;
13. colisões;
14. progressão/dificuldade;
15. lifecycle, clear e dispose;
16. testes existentes;
17. documentação/histórico do Dourado.

Não comece escrevendo código imediatamente. O overhaul altera o papel arquitetural das mini-naves; primeiro determine onde essas entidades devem existir sem duplicar infraestrutura nem quebrar sistemas.

## 3. MOVESET BASE A PRESERVAR

Preservar conceitualmente:

- perseguição do jogador;
- weaving/zigue-zague;
- dash lateral evasivo;
- dash reativo a dano;
- teleporte reativo a dano com cooldown;
- disparo convencional;
- invocação de mini-naves;
- laser grande telegrafado;
- comportamento especial de névoa;
- colisão corporal/ram;
- scaling relacionado ao nível;
- áudio e VFX específicos.

O foco do overhaul é **coordenação + posicionamento + transições + formações + contexto + presença**.

## 4. PROBLEMA ESTRUTURAL

Reduzir a sensação de vários timers independentes de perseguição, dash, tiro, spawn, laser e teleporte, substituindo-a pela sensação de **um inimigo escolhendo e compondo ações de combate**.

Isso não exige uma FSM gigantesca. Escolha a arquitetura mais simples apropriada após analisar o código.

## 5. IDENTIDADE: COMANDANTE DE CAÇA

O Dourado é simultaneamente ameaça direta, comandante, centro de formação, fonte de ordens táticas e unidade perigosa mesmo sem escolta. As mini-naves ampliam suas possibilidades; não são necessárias para que ele consiga lutar.

## 6. MOVIMENTAÇÃO DO DOURADO

Preserve perseguição, weaving e dash, mas melhore posicionamento para buscar uma **faixa útil de combate**:

- muito longe → intercepta/aproxima agressivamente;
- distância adequada → mantém pressão com lateralidade, weaving e reposicionamento;
- muito perto → pode usar dash para atravessar linha de mira, escapar lateralmente ou criar novo ângulo.

Não transforme em órbita perfeita/artificial. Deve parecer pilotagem.

## 7. DASH

Preserve dash lateral evasivo e uso reativo após hits quando compatível. Permita participação em sequências táticas, como `dash → reposicionamento → volley` ou caças pressionando um lado enquanto o Dourado dasha para o oposto. O papel principal continua movimento/evasão/reposicionamento.

## 8. TELEPORTE

Preserve teleporte reativo, cooldown e comportamento especial de névoa salvo correção necessária.

Quando o Dourado teleporta, **as mini-naves NÃO teleportam junto**. Elas perdem temporariamente a formação e deslocam-se fisicamente até a nova posição do comandante.

Esse estado de **DESORGANIZAÇÃO** quebra a formação, faz sobreviventes reencontrarem slots e pode adiar ordens dependentes de formação, criando pequena janela tática ao jogador.

## 9. OVERHAUL DAS MINI-NAVES

A implementação não deve permanecer como `spawn → direção ao jogador → projectile homing`.

Mini-naves passam a ser **entidades de combate persistentes**, com estado próprio suficiente para identidade, posição, slot/formação, HP, hit detection, morte, ordem atual, movimentação, ataque, retorno, reagrupamento, lifecycle e recompensa.

Não transforme `spawnMinion()` apenas em projétil mais sofisticado.

## 10. MINI-NAVES SÃO INIMIGOS ABATÍVEIS

Cada caça destruído conta como **INIMIGO ABATIDO**. Integre sua morte ao sistema normal de kill, pontuação, recompensas, feedback e estatísticas conforme aplicável. Não invente infraestrutura paralela nem recompensa especial arbitrária.

## 11. HP DAS MINI-NAVES

Devem possuir HP próprio. Determine valor inicial após analisar HP de inimigos comuns, dano das armas, dificuldade, tempo esperado para abate, quantidade simultânea e reposição.

Centralize valor/scaling. Não use números mágicos nem transforme cada caça em bullet sponge.

## 12. FORMAÇÃO

Quando não estiver executando ordem ofensiva, cada caça ocupa um **slot de formação** ao redor do Dourado.

A formação deve acompanhar o comandante, possuir movimento suavizado, tolerar movimento rápido, evitar snaps e sobreposição grosseira e adaptar-se à quantidade de sobreviventes. Pequenos movimentos próprios são desejáveis para transmitir pilotagem.

## 13. QUANTIDADE POR DIFICULDADE

| Dificuldade | Máximo simultâneo |
|---|---:|
| 1 | 2 |
| 2 | 2 |
| 3 | 3 |
| 4 | 3 |
| 5 | 4 |
| 6 | 4 |
| 7 | 5 |
| 8 | 5 |
| 9 | 6 |

Contrato: **2 / 2 / 3 / 3 / 4 / 4 / 5 / 5 / 6**.

Dificuldade 5 é referência intermediária inicial, com 4 caças. Centralize e documente o mapping.

## 14. LIMITE DE ATACANTES SIMULTÂNEOS

| Dificuldade | Máximo do esquadrão | Máximo ofensivo |
|---|---:|---:|
| 1–2 | 2 | 1 |
| 3–4 | 3 | 2 |
| 5–6 | 4 | 2 |
| 7–8 | 5 | 3 |
| 9 | 6 | 3 |

Seis caças vivos NÃO significa seis mergulhando simultaneamente. Os demais mantêm formação, reposicionam, preparam função ou aguardam retorno.

## 15. REPOSIÇÃO DE CAÇAS

Destruir um caça deve produzir vantagem real. NÃO reponha imediatamente.

Ponto inicial de tuning:

- dificuldade 1: ~15 s;
- dificuldade 5: ~11 s;
- dificuldade 9: ~8 s;

Use progressão coerente nos níveis intermediários. Somente **uma nave por ciclo** e nunca ultrapasse o máximo da dificuldade.

## 16. REPOSIÇÃO É AÇÃO VISÍVEL

Uma nave nova não aparece magicamente no slot. O Dourado deve efetivamente lançá-la, preservando/reutilizando quando apropriado o feedback de spawn e áudio existente. O jogador deve perceber que o esquadrão está sendo recomposto.

## 17. PRIORIDADE DA REPOSIÇÃO

Timer de reposição não deve interromper arbitrariamente laser, sequência ofensiva, teleporte ou estado incompatível. Pode aguardar janela apropriada. O objetivo é comportamento coerente, não timers independentes.

## 18. MINI-NAVES NÃO SÃO MÍSSEIS SUICIDAS

Ciclo desejado: **formação → preparação → ataque → ultrapassagem → curva → retorno/reagrupamento**.

Colisão pode aplicar dano conforme sistema apropriado, mas não destrua automaticamente a nave apenas por cumprir sua função ofensiva, salvo consequência real de HP/colisão.

## 19. ORDEM TÁTICA 1 — STRAFING RUN

Um ou mais caças, respeitando limite ofensivo:

1. abandonam formação;
2. abrem trajetória;
3. alinham passagem;
4. atacam jogador;
5. ultrapassam;
6. fazem curva;
7. retornam ao Dourado;
8. reassumem slots.

Preparação deve ser legível. Evite homing perfeito grudado no jogador.

## 20. ORDEM TÁTICA 2 — PINÇA

Com pelo menos dois caças apropriados:

1. dois deixam formação;
2. abrem-se para lados diferentes;
3. aproximam-se por vetores distintos;
4. pressionam em conjunto;
5. atravessam;
6. retornam.

Evite simetria artificial idêntica em todas as execuções. A pinça cria pressão espacial, não dano inevitável.

## 21. ORDEM TÁTICA 3 — CERCO DO LASER

Preserve o laser grande e seu telegraph fundamental.

Durante carregamento, caças disponíveis assumem posições laterais relevantes, pressionam rotas de fuga e executam movimentos coordenados.

**NÃO FECHE TODAS AS ROTAS DE FUGA.** O laser deve continuar evitável. Caças tornam a esquiva mais interessante, não inevitável.

## 22. ORDEM TÁTICA 4 — FOGO COORDENADO

Criar sequência coordenada envolvendo esquadrão e Dourado. Caças orientam-se, apresentam telegraph, disparam em sequência escalonada, Dourado participa e formação é retomada.

Evite todos atirando no mesmo frame. Ponto inicial conceitual: **caça → caça → Dourado → caça**, adaptado à quantidade disponível.

## 23. DISPARO CONVENCIONAL DO DOURADO

Preserve disparo convencional e permita uso independente quando apropriado, mas evite que timer cause disparos incoerentes em estados incompatíveis. O sistema deve saber quando tiro simples pode acontecer, deve esperar ou participa do Fogo Coordenado.

## 24. LASER GRANDE

Preserve identidade do laser, incluindo carregamento, telegraph, direção, áudio, VFX, dano e papel de ataque pesado salvo necessidade comprovada. A mudança principal é o contexto criado pelos caças.

## 25. DOURADO SEM ESQUADRÃO

Se todos os caças morrerem, **o Dourado continua perigoso**, podendo perseguir, fazer weaving, dash, teleporte, disparo e laser. Não aplique debuff artificial; a vantagem vem da redução da pressão tática.

## 26. ESQUADRÃO PARCIAL

Ordens devem degradar graciosamente. Não crie naves fantasmas nem mantenha referências a caças destruídos. Se uma ordem ideal requer dois e só há um, escolha/adapte conscientemente.

## 27. DESTRUIÇÃO DURANTE UMA ORDEM

Se um caça for destruído durante ordem, remova corretamente, cancele seu papel, permita continuidade apropriada das demais, não deixe estado travado/referência inválida e permita reposição futura.

## 28. TELEPORTE DURANTE OPERAÇÕES

Defina comportamento robusto para teleporte enquanto caças estão em formação, atacando, retornando ou preparando ordem. Regra geral: **teleporte força eventual reagrupamento físico**. Não teleporte caças automaticamente nem os faça atravessar instantaneamente a arena.

## 29. LOCK-ON / HOMING

Investigue antes. Se inimigos comuns usam interface reutilizável de aquisição, caças devem preferencialmente participar. NÃO altere o lock-on global de forma arriscada apenas para suportar a feature. Documente conflito estrutural antes de improvisar.

## 30. MINIMAPA

Investigue como inimigos comuns aparecem. Use infraestrutura existente e evite poluição visual com vários caças próximos. Não invente UI complexa sem necessidade.

## 31. COLISÃO

Investigue hitbox de inimigos, colisão com jogador, ram, projéteis, homing, perfuração e sistemas especiais. Não copie automaticamente o `MINION_HIT_RADIUS` atual; valide visualmente.

## 32. MORTE DOS CAÇAS

Use infraestrutura existente para flash, explosão, áudio, pontuação, recompensa e kill registration. Evite efeito equivalente à morte do Dourado. O jogador deve perceber claramente o abate de um membro do esquadrão.

## 33. MORTE DO DOURADO

Não deixe caças presos em estados dependentes de comandante inexistente. Preserve comportamento atual quando houver precedente claro. Se não houver, NÃO invente silenciosamente uma sequência nova pós-morte; documente a necessidade antes de ampliar escopo.

## 34. ESCOLHA DE ORDENS

Não execute A→B→C→D em loop fixo nem use `Math.random()` puro sem contexto. Considere quantidade de caças, disponibilidade, distância, estado do Dourado, laser, reposição, teleporte recente, ordem anterior, cooldowns e dificuldade. Evite repetição excessiva e previsibilidade perfeita.

## 35. LEGIBILIDADE

Mais dinamismo NÃO significa remover janelas de leitura. Cada ação importante deve permitir entender quem ataca, de onde, aproximadamente quando e qual ameaça tem prioridade. Use movimentação preparatória, formação, orientação, telegraphs, áudio e VFX existentes.

## 36. DIFICULDADE

Aumente principalmente por tamanho do esquadrão, atacantes simultâneos, reposição moderadamente mais rápida, scaling existente apropriado e maior disponibilidade de composições táticas.

Evite escalar agressivamente ao mesmo tempo HP, dano, velocidade, quantidade, cooldown e tracking sem evidência.

## 37. PARÂMETROS CENTRALIZADOS

Centralize/comente pelo menos:

- tamanho por dificuldade;
- atacantes simultâneos por dificuldade;
- HP/scaling dos caças;
- velocidade/raio de formação;
- velocidade de ataque/retorno;
- parâmetros de strafing e pinça;
- intervalo de fogo coordenado e entre disparos;
- reposição por dificuldade;
- tempos mínimos entre ordens;
- reagrupamento;
- distâncias ideais do Dourado.

Não espalhe números mágicos. Comentários devem explicar efeito/unidade.

## 38. PERFORMANCE

Com até seis caças persistentes, evite garbage desnecessário por frame. Observe `Vector3.clone()`, arrays temporários, closures, raycasts, buscas repetidas, criação/destruição frequente de geometria/material, minimapa e targeting. Reutilize recursos quando apropriado sem micro-otimização prejudicial.

## 39. ÁUDIO

Preserve cues existentes. Reutilize quando apropriado o cue de lançamento. Só adicione novos cues se realmente necessários e evite sobreposição excessiva.

## 40. VFX

Valorize formação, saída para ataque, retorno, teleporte/desorganização, lançamento de substituto, morte de caça e laser. Não transforme cada ação em explosão/shockwave; movimentação e composição espacial carregam parte da leitura.

## 41. FORA DE ESCOPO

Não substituir modelo visual do Dourado, criar boss phases completamente novas, remover ataques existentes, alterar armas/câmera/HUD global, redesenhar minimapa, reescrever dificuldade global ou todos os inimigos, criar ECS novo, adicionar buffs invisíveis/escudo/invulnerabilidade ligada aos caças.

Refatorações adjacentes só quando necessárias para integração correta e comprovadas pela investigação.

## 42. TESTES DO DOURADO

Testar spawn, perseguição, faixa ideal, weaving, dash por proximidade, dash reativo, volley, laser, teleporte, teleporte sob névoa, colisão, ram, morte e scaling por dificuldade.

## 43. TESTES DO ESQUADRÃO

Testar spawn inicial, formação, 2/3/4/5/6 caças, slots, movimentação, destruição, recompensa, reposição, limite máximo, ataque, retorno, reagrupamento e perda do comandante.

## 44. TESTES DAS ORDENS

### Strafing Run
Preparação, ataque, passagem, retorno e destruição durante ataque.

### Pinça
Vetores distintos, esquiva possível, retorno e perda de participante.

### Cerco do Laser
Coordenação com telegraph, rotas de fuga, quantidade por dificuldade e perda de caça sem quebrar laser.

### Fogo Coordenado
Sequência escalonada, adaptação à quantidade, telegraph, ausência de caos simultâneo e retorno normal.

## 45. EDGE CASES

Testar todos mortos, um vivo, morte ao receber ordem, teleporte durante ataque/retorno, morte do Dourado durante ordem, reposição pronta durante laser/teleporte, novo caça enquanto outros retornam, jogador muito distante/próximo, pausa/reinício, saída da arena, clear/dispose, reload e múltiplos hits no mesmo frame quando aplicável.

## 46. TESTES DE DIFICULDADE

Verifique explicitamente níveis 1, 5 e 9:

- nível 1: máximo 2, ofensivo 1, reposição lenta;
- nível 5: máximo 4, ofensivo 2, referência de balanceamento;
- nível 9: máximo 6, ofensivo 3, reposição mais rápida.

Depois verifique mapping intermediário.

## 47. VALIDAÇÃO DE GAMEPLAY

Não considere validado só porque testes/build passaram. Quando possível, execute o jogo e observe se Dourado parece mais presente, esquadrão coordenado, caças parecem naves e não mísseis, ataques são legíveis, destruir caças gera vantagem, reposição não anula a vantagem, laser+caças continua justo, dificuldade 9 não vira spam e Dourado sozinho continua interessante. Inspecione console.

## 48. REVISÃO ADVERSARIAL

Procure deliberadamente: timers ainda produzindo combinações absurdas; caças presos; sobreposição; slots duplicados; referências mortas; reposição acima do máximo; atacantes acima do limite; teleporte quebrando formação; laser simultâneo com sequência incompatível; pinça inevitável; burst ilegível; kill fora do pipeline; lock-on em morto; falha de clear/dispose; objetos órfãos; dependência de FPS; garbage excessivo; regressões no Dourado original.

Corrija problemas reais e reteste.

## 49. DOCUMENTAÇÃO

Atualize documentação relevante e progresso apropriado. Documente identidade nova, arquitetura do esquadrão, quantidade por dificuldade, limite ofensivo, ordens, reposição, kills/recompensas, teleporte, laser, parâmetros, testes, problemas e limitações reais. Não documente validações não realizadas.

## 50. GIT

Antes: `git status`, identifique modificações preexistentes e não sobrescreva trabalho alheio.

Depois: testes, lint/typecheck/build disponíveis, gameplay quando possível, console, revisão de diff, arquivos inesperados, remoção de debug, documentação e nova revisão. NÃO faça commit antes dos testes, nem operações destrutivas/force-push.

## 51. CRITÉRIOS DE ACEITAÇÃO

- [ ] moveset fundamental preservado;
- [ ] posicionamento mais dinâmico;
- [ ] dash, teleporte, volley e laser funcionais;
- [ ] mini-naves não são meros projéteis homing;
- [ ] caças persistentes com HP e destruição;
- [ ] cada caça destruído conta como inimigo abatido;
- [ ] recompensa/pontuação usa integração normal;
- [ ] formação acompanha suavemente;
- [ ] teleporte quebra temporariamente formação e reagrupamento é físico;
- [ ] Strafing Run, Pinça, Cerco do Laser e Fogo Coordenado funcionam;
- [ ] caças retornam e não são suicidas por padrão;
- [ ] quantidade 2/2/3/3/4/4/5/5/6;
- [ ] limites ofensivos respeitados;
- [ ] reposição gradual, visível e sem exceder máximo;
- [ ] Dourado continua perigoso sem caças;
- [ ] ordens degradam corretamente com perdas;
- [ ] morte durante ordem não quebra estado;
- [ ] morte do Dourado não deixa órfãos;
- [ ] clear/dispose funcionam;
- [ ] dificuldades 1, 5 e 9 testadas;
- [ ] gameplay observado quando possível;
- [ ] console inspecionado;
- [ ] testes automatizados aplicáveis passaram;
- [ ] build/lint/typecheck aplicáveis passaram;
- [ ] diff final revisado;
- [ ] documentação atualizada.

Itens impossíveis de validar devem ser explicitamente marcados **NÃO FOI POSSÍVEL VALIDAR**, nunca presumidos aprovados.

## 52. RELATÓRIO FINAL OBRIGATÓRIO

Ao terminar, apresente:

### Investigação
Arquivos e sistemas analisados antes da implementação.

### Arquitetura
Onde vivem os caças, estados e relação com Dourado.

### Dourado
Mudanças de comportamento e posicionamento.

### Esquadrão
Formação, HP, kills, ataques, retorno e reagrupamento.

### Dificuldade
Quantidade, limite ofensivo e reposição implementados.

### Ordens
Resultado de Strafing Run, Pinça, Cerco do Laser e Fogo Coordenado.

### Integrações
Hits, lock-on, minimapa, recompensas, áudio, VFX, lifecycle etc.

### Parâmetros de tuning
Nomes e valores atuais.

### Testes
Comandos executados e resultados.

### Gameplay
Somente o observado em execução.

### Regressões
Sistemas adjacentes efetivamente retestados.

### Documentação
Arquivos atualizados.

### Git
Branch/status/commit conforme aplicável.

### Pendências
Somente problemas reais ainda existentes.

Não utilize afirmações genéricas como “sem regressões” ou “funcionando perfeitamente” sem evidência correspondente.
