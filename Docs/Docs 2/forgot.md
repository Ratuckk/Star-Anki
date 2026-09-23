# Forgot — itens esquecidos ou ainda não implementados

> Este arquivo consolida **somente** o que ficou faltando do último levantamento sobre os itens **3 (Swirl Blast)**, **5 (obtenção de cartas no modo Arcade)** e **10 (Fog)**. Ele não trata sugestões opcionais como requisitos já aprovados e não marca como ausente aquilo que o código atual já implementa.

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
