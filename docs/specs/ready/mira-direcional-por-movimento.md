# STAR-ANKI — MIRA DIRECIONAL POR MOVIMENTO

## 1. OBJETIVO

Implementar uma nova opção de gameplay que permita ao jogador deslocar temporariamente a mira através da combinação dos botões **C/Z com o movimento normal da nave**.

A funcionalidade deve ser introduzida inicialmente como **uma opção nas Configurações**, preservando integralmente o sistema atual quando estiver desativada.

Esta é uma alteração particularmente sensível. O projeto já teve diversos problemas relacionados à mira. Portanto, NÃO trate esta tarefa como simples movimentação visual do retículo.

Antes de alterar qualquer código, investigue completamente o pipeline atual de:

**input → movimento da nave → estado lógico da mira → projeção/renderização do retículo → conversões câmera/world/screen → criação do disparo → direção/trajetória do disparo → colisão**

Não implemente um segundo sistema de mira paralelo ao existente sem antes provar que isso é necessário.

## 2. REFERÊNCIA

Use como referência de comportamento e matemática, quando útil, a decompilação/port de Star Fox 64 existente no projeto **HarbourMasters/Starship**.

Investigue especialmente código relacionado a Player, Arwing, input, movimentação, rotação, lasers/player shots, câmera, transformações e suavização de valores.

A referência serve para compreender como Star Fox 64 relaciona movimentação/orientação da nave e disparos. NÃO copie cegamente a implementação. NÃO tente reproduzir limitações ou particularidades do Nintendo 64 que não façam sentido no Star-Anki. O comportamento definido neste documento tem prioridade.

## 3. FASE OBRIGATÓRIA DE INVESTIGAÇÃO

ANTES de implementar:

1. leia as instruções permanentes do projeto;
2. leia a documentação/progresso atual relevante;
3. identifique todos os arquivos relacionados à mira;
4. identifique onde o input de movimento é processado;
5. identifique onde C e Z são processados atualmente;
6. identifique como a posição visual atual do retículo é determinada;
7. identifique qual estado representa efetivamente o alvo;
8. identifique como um disparo recebe sua direção;
9. identifique como a câmera participa desse cálculo;
10. identifique conversões entre screen space, camera space e world space;
11. identifique como diferentes armas/lasers utilizam a mira;
12. identifique qualquer aim assist, lock-on ou sistema semelhante;
13. identifique código e documentação relacionados a problemas/correções anteriores de mira;
14. procure testes existentes;
15. determine quais sistemas dependem do comportamento atual.

Não presuma que o arquivo que desenha o retículo controla o disparo. Não presuma que a posição visual existente é a fonte autoritativa da mira. Descubra o fluxo real.

Se durante essa investigação for descoberto que algum requisito abaixo entra em conflito estrutural com o sistema existente, PARE antes de improvisar uma alternativa perceptivelmente diferente e explique o conflito.

## 4. NOVA OPÇÃO NAS CONFIGURAÇÕES

Adicionar uma opção de gameplay para habilitar/desabilitar a nova mecânica.

Nome inicial sugerido: **Mira direcional por movimento**.

Se a nomenclatura das configurações existentes indicar outro padrão claro, adapte o texto para manter consistência, sem alterar o significado.

A opção deve ser integrada ao sistema real de configurações, persistida da mesma forma que opções equivalentes, respeitar o formato atual de save/localStorage/configuração, não criar armazenamento paralelo e aparecer na categoria apropriada.

### Desativada

O comportamento atual da mira deve permanecer integralmente preservado. Não deve existir diferença perceptível de mira, movimentação, disparo, câmera, trajetória, sensibilidade ou HUD causada pela feature quando desativada.

### Ativada

Passa a valer a mecânica descrita abaixo.

## 5. PRINCÍPIO DA MECÂNICA

A posição física atual da nave na tela NÃO determina o deslocamento da mira. A mecânica utiliza o **input direcional aplicado enquanto C ou Z está sendo segurado**.

A mira possui um deslocamento relativo ao estado neutro/central, acumulado progressivamente enquanto existir uma combinação válida.

## 6. CONTROLE HORIZONTAL

### C + direita

Enquanto C estiver segurado e o jogador estiver aplicando movimento para a direita, a mira se desloca progressivamente para a direita. A nave continua se movimentando normalmente.

### Z + esquerda

Enquanto Z estiver segurado e o jogador estiver aplicando movimento para a esquerda, a mira se desloca progressivamente para a esquerda. A nave continua se movimentando normalmente.

## 7. INPUT HORIZONTAL CONTRÁRIO

**C + esquerda** e **Z + direita** NÃO deslocam a mira para o lado contrário.

Nesses casos, o componente horizontal da mira deve realizar uma **recentralização rápida, mas suavizada**: mais rápida que o retorno normal, sem teleporte, snap, inversão ou acumulação contrária. A movimentação física da nave continua normal.

## 8. CONTROLE VERTICAL

O eixo vertical funciona tanto com C quanto com Z:

- C + cima → mira sobe.
- C + baixo → mira desce.
- Z + cima → mira sobe.
- Z + baixo → mira desce.

C e Z NÃO invertem o eixo vertical.

## 9. DIAGONAIS

Combinações diagonais são explicitamente suportadas:

- C + direita + cima → cima/direita.
- C + direita + baixo → baixo/direita.
- Z + esquerda + cima → cima/esquerda.
- Z + esquerda + baixo → baixo/esquerda.

Não implemente diagonais como quatro estados especiais. Sempre que a arquitetura permitir, represente o deslocamento como um **vetor contínuo de mira**.

## 10. C + Z SIMULTANEAMENTE

Se C e Z estiverem pressionados simultaneamente, **esta mecânica não deve fazer nada**.

Não dê prioridade a C ou Z. Não produza deslocamento vertical. Não crie comportamento especial. Se a mira estiver deslocada anteriormente, ela segue a lógica normal de retorno ao estado neutro; C+Z não deve congelá-la.

## 11. RETORNO AO CENTRO

A mira NÃO permanece deslocada simplesmente porque C ou Z continua segurado. O deslocamento depende da existência do input direcional válido.

Quando o input responsável cessar, a mira começa imediatamente a retornar ao centro, de forma suave, previsível, contínua, sem teleportes ou oscilações e independente de framerate conforme os padrões temporais do projeto.

## 12. RETORNO VETORIAL

Não trate X e Y como estados mutuamente exclusivos. Um componente pode retornar ao centro enquanto o outro recebe novo input. Isso deve permitir trajetórias suaves/curvas do retículo, sem resets artificiais entre eixos.

## 13. LIMITE DA MIRA

A mira não pode se afastar indefinidamente. Implemente limite máximo de deflexão em uma região **elíptica**, permitindo limites horizontal e vertical independentes sem cantos artificiais. Diagonais devem ser corretamente limitadas à elipse.

## 14. PARÂMETROS DE GAMEPLAY

Centralize e comente, no mínimo:

- limite máximo horizontal;
- limite máximo vertical;
- velocidade de deslocamento da mira;
- responsividade/suavização da entrada;
- velocidade normal de retorno;
- velocidade de retorno rápido de C+esquerda/Z+direita;
- parâmetros adicionais de suavização.

Não espalhe números mágicos. Comentários devem explicar o efeito do parâmetro.

## 15. MODELO INICIAL DE MOVIMENTO

Na primeira implementação, prefira **velocidade de aquisição previsível + suavização + retorno amortecido**.

NÃO introduza inicialmente aceleração progressiva complexa baseada no tempo segurando a direção, salvo se a arquitetura já possuir abstração apropriada cuja reutilização preserve o comportamento solicitado.

## 16. RETÍCULO E DISPARO DEVEM COMPARTILHAR A MESMA VERDADE

Requisito crítico: NÃO implemente `input → posição visual do retículo` e, em paralelo, `input → cálculo independente parecido para o disparo`.

Deve existir um estado lógico autoritativo da mira/alvo:

**input → estado lógico da mira → alvo/direção real**

Do mesmo estado derivam:

- representação visual do retículo;
- direção/destino efetivo do disparo.

Respeite a arquitetura atual encontrada durante a investigação e não crie abstração nova desnecessariamente.

## 17. CORRESPONDÊNCIA ENTRE RETÍCULO E TIRO

O disparo deve efetivamente seguir a mira. Não aceite implementação em que o retículo se move e o laser continua central, em que o laser apenas aproxima a direção, em que câmera/profundidade/resolução criam divergência, ou em que somente uma arma respeita o alvo sem isso ter sido deliberadamente especificado.

## 18. PROFUNDIDADE E CONVERSÃO 2D/3D

NÃO invente uma nova regra arbitrária de profundidade antes de investigar o sistema atual. Descubra como Star-Anki transforma mira/retículo em direção ou destino tridimensional e preserve/estenda essa lógica quando adequada.

Não escolha silenciosamente uma distância 3D fixa apenas porque funciona em um cenário.

## 19. MOVIMENTAÇÃO DA NAVE

Nesta primeira versão, a movimentação da nave continua normal. A mecânica NÃO deve reduzir velocidade, alterar aceleração/handling/roll/pitch/limites ou introduzir modo separado de movimento.

Se C ou Z já possuir função conflitante, não a sobrescreva silenciosamente; analise e informe o conflito antes de decidir comportamento diferente.

## 20. CASOS DE TESTE DE INPUT

Validar explicitamente: C+direita, C+cima, C+baixo, C+direita+cima, C+direita+baixo, C+esquerda, Z+esquerda, Z+cima, Z+baixo, Z+esquerda+cima, Z+esquerda+baixo, Z+direita, C+Z, C sozinho, Z sozinho, nenhum modificador, troca rápida C↔Z, troca rápida de direções, abandonar uma diagonal mantendo um eixo, atingir limite, retorno do limite e novo input durante retorno.

## 21. TESTES DO RETORNO

Verifique retorno normal, retorno mantendo C/Z, retorno após soltar C/Z, retorno rápido em C+esquerda e Z+direita, ausência de teleportes/overshoot/oscilação, interrupção correta por novo input e combinação de retorno em um eixo com deslocamento no outro.

## 22. TESTES DE CORRESPONDÊNCIA DO DISPARO

Testar disparos com mira central, parcialmente/máximo à direita e esquerda, acima, abaixo, nas quatro diagonais, durante deslocamento, durante recentralização e imediatamente após troca de direção.

Quando possível, use alvos em profundidades diferentes para detectar divergência entre projeção visual e trajetória real. Confirme comportamento perceptível, não apenas valores internos.

## 23. CONFIGURAÇÃO DESATIVADA — REGRESSÃO

Com a opção desativada, reteste movimentação, C, Z, disparo central, mira, câmera, lock-on/aim assist se existirem, diferentes tipos/níveis de laser, controles, persistência e reload. A feature deve ser realmente opt-in.

## 24. CONFIGURAÇÃO ATIVADA — PERSISTÊNCIA

Verifique ativação, saída das configurações, persistência, reload/reinício, desativação restaurando comportamento tradicional e compatibilidade com saves/configurações anteriores. Use o mecanismo padrão de default/migração do projeto.

## 25. PERFORMANCE

Evite objetos/arrays temporários desnecessários por frame, manipulação DOM redundante, raycasts extras e cálculos duplicados de projeção. Preserve atenção especial à versão web sem fazer otimizações especulativas que compliquem a implementação.

## 26. FORA DE ESCOPO

Não aproveitar esta tarefa para redesenhar retículo, alterar armas/dano/cadência/velocidade/câmera/dificuldade/inimigos, adicionar aim assist/lock-on, criar aceleração avançada sem necessidade, redesenhar Configurações ou refatorar sistemas grandes sem causa demonstrável.

Bugs reais diretamente relacionados podem ser corrigidos se comprovados, testados e documentados.

## 27. VALORES INICIAIS

Escolha valores iniciais conservadores somente depois de compreender escala do retículo, resolução lógica, câmera, delta time/frame model, sensibilidade e limites de movimento. São pontos de partida para tuning e devem permanecer fáceis de modificar.

## 28. VALIDAÇÃO VISUAL

Não considere validado apenas por testes unitários/leitura de código. Quando possível, execute o jogo e observe movimento, suavidade, diagonais, limites, recentralização, retorno rápido, correspondência tiro/retículo, jitter, clipping e resoluções relevantes. Inspecione o console.

## 29. REVISÃO ADVERSARIAL

Procure deliberadamente: duas fontes de mira; divergência de trajetória; dependência de resolução; erro de câmera/profundidade; diagonais fora do limite; retorno dependente de FPS; snap indevido; comportamento incorreto de C+Z; regressão com opção desligada; armas não integradas; competição com código antigo; estado residual após morte/restart/pausa; números mágicos.

Corrija problemas reais e reteste.

## 30. DOCUMENTAÇÃO

Atualize somente documentação realmente afetada, incluindo o arquivo de progresso apropriado se concluído. Registre configuração, comportamento, arquitetura da fonte autoritativa, parâmetros, problemas, correções, testes e limitações reais. Não documente testes não executados.

## 31. GIT

Antes: verifique `git status`, compreenda modificações preexistentes e não sobrescreva trabalho não relacionado.

Depois: execute validações, revise diff, procure arquivos inesperados, remova debug temporário, atualize documentação e revise novamente. NÃO faça commit antes de testar. NÃO use operações destrutivas nem force-push.

## 32. CRITÉRIOS DE ACEITAÇÃO

- [ ] opção funcional nas Configurações;
- [ ] persistência correta;
- [ ] opção desativada preserva mira anterior;
- [ ] C+direita desloca para direita;
- [ ] Z+esquerda desloca para esquerda;
- [ ] C/Z+cima desloca para cima;
- [ ] C/Z+baixo desloca para baixo;
- [ ] diagonais funcionam;
- [ ] C+esquerda causa retorno horizontal rápido e suave;
- [ ] Z+direita causa retorno horizontal rápido e suave;
- [ ] C+Z não controla a mira;
- [ ] ausência de input válido inicia recentralização;
- [ ] recentralização não teleporta;
- [ ] limite da mira funciona e diagonais o respeitam;
- [ ] parâmetros são fáceis de modificar e comentados;
- [ ] retículo e disparo utilizam fonte lógica coerente;
- [ ] disparos efetivamente seguem a mira;
- [ ] comportamento não depende incorretamente da resolução/profundidade;
- [ ] movimentação normal da nave foi preservada;
- [ ] configurações/saves antigos continuam funcionando;
- [ ] testes aplicáveis foram executados;
- [ ] gameplay foi verificado quando possível;
- [ ] console foi inspecionado;
- [ ] regressões relacionadas foram verificadas;
- [ ] documentação atualizada;
- [ ] diff final revisado.

Qualquer item não validável deve ser reportado como **NÃO FOI POSSÍVEL VALIDAR**, nunca presumido aprovado.

## 33. RELATÓRIO FINAL OBRIGATÓRIO

Ao terminar, responda separando:

### O que foi alterado
Arquivos/sistemas e comportamento.

### Arquitetura da mira
Fonte autoritativa e sincronização retículo/disparo.

### Configuração
Nome, default, persistência e compatibilidade.

### Parâmetros de tuning
Nomes e valores atuais.

### Validação
Comandos, testes e verificações executados e resultados.

### Gameplay/visual
Somente o realmente observado.

### Regressões
Sistemas adjacentes efetivamente retestados.

### Documentação
Arquivos atualizados.

### Git
Estado/commit/branch conforme aplicável.

### Pendências
Somente problemas reais ainda existentes.

Não use “implementado com sucesso”, “sem regressões” ou equivalentes sem evidência correspondente.
