# Template de Perguntas — Criação ou Reconfiguração de Inimigos

## Como usar este arquivo (regra para a IA, não para o usuário)

Antes de escrever UMA LINHA de código de um inimigo novo ou de mexer em um inimigo
existente, percorra este arquivo do início ao fim e faça ao usuário todas as
perguntas das seções que se aplicam ao pedido. Isto vale tanto para "criar um
inimigo do zero" quanto para "ajustar um detalhe de um inimigo que já existe" —
mudanças pequenas também tomam decisões implícitas se ninguém perguntar.

Regras duras:

1. **Nunca assuma um valor "razoável" ou "parecido com outro inimigo"** só porque
   parece óbvio ou consistente. Pergunte. Mesmo se a resposta parecer óbvia demais
   pra perguntar, pergunte mesmo assim — "óbvio pra mim" já causou retrabalho antes
   neste projeto (ver o histórico de reescritas da Sentinela em `PROGRESSO_POS_.60.md`).
2. **Se uma resposta do usuário deixar uma sub-pergunta sem cobertura, pergunte de
   novo** em vez de preencher a lacuna por conta própria. Ex.: se o usuário descreve
   o movimento mas não diz o que acontece em modo arena, isso NÃO virou "implícito
   que é igual" — pergunte.
3. **Não introduza nada que não foi pedido.** Nada de "já que estou mexendo, também
   vou ajustar X" ou "aproveitei pra deixar mais consistente com Y". Se notar algo
   que parece um problema relacionado mas fora do escopo pedido, aponte pro usuário
   e pergunte se ele quer incluir — não decida sozinho.
4. **Se é uma EDIÇÃO de um inimigo existente**, releia o arquivo real dele primeiro
   (não confie em memória de sessões passadas — código muda). Depois de responder
   as perguntas relevantes, confirme explicitamente com o usuário: "só os itens
   [X, Y, Z] vão mudar, todo o resto do arquivo continua exatamente como está,
   correto?" antes de editar.
5. **Depois de implementar**, releia as respostas dadas e confira item por item que
   nada além do que foi combinado mudou (nem sequer nomes de variável, formatação
   ou comentários de trechos não tocados).
6. Cada pergunta abaixo cita como pelo menos um inimigo já existente resolve aquele
   ponto hoje. Isso é só vocabulário/referência pra facilitar a resposta do usuário
   — **nunca é uma resposta assumida por padrão**. Se o usuário não disser
   explicitamente "igual ao X", trate como indefinido e pergunte.

Mapa de arquivos pra consulta rápida durante a conversa (não decore os números —
releia o arquivo real na hora):
`src/enemies/{blaster,tank,miniSwarm,boss,golden,timeEnemy,detrito,sentinela,fragata,
verme,ima,sussurro,replica,shared,index}.js`, `src/combat/{index,projectiles,lockon,
wingmen,targets}.js`, `src/player.js`.

---

## 0. Identificação e escopo da mudança

- [ ] Nome/identidade do inimigo (nome em português exibido pro jogador, se houver).
- [ ] É um inimigo **novo** (kind inédito) ou uma **edição** de um inimigo que já existe? Se edição, qual arquivo/`_KIND` exato?
- [ ] Se for edição: liste **campo por campo** o que muda. Para tudo que não for
      listado, a resposta padrão é "não muda nada" — não generalize um pedido
      pontual pro resto do comportamento do inimigo.
- [ ] Papel/intenção narrativa ou de gameplay (ex.: obstáculo passivo, atirador
      comum, mini-chefe, hazard de arena, algo que força um tipo específico de
      esquiva). Isso ajuda a decidir os defaults de HP/dano/pontos, mas não decide
      nada sozinho — as seções abaixo ainda precisam ser respondidas.

## 1. Modo de jogo: trilho, arena, ou os dois?

Referência: Fragata/Verme/Sussurro/Réplica só existem num modo (retornam
`null`/`[]` no outro); Ima e Detrito nascem nos dois com posição adaptada
automaticamente por `spawnPositionForEnemy`; Blaster/Tank/Time têm branches de
movimento **totalmente diferentes** por modo (ex.: Tank fica parado no trilho mas
persegue em arena).

- [ ] Existe só em trilho, só em arena, ou nos dois?
- [ ] Se existe nos dois: o comportamento de **movimento** é o mesmo código
      reaproveitado, ou cada modo tem sua própria lógica (como o Blaster)? Se for
      o mesmo, tem certeza — ou só ainda não pensou no caso do outro modo?
- [ ] Se existe só num modo: o que deve acontecer se, por engano de outro código,
      alguém tentar spawná-lo no modo errado? (padrão atual: retorna `null`/`[]`
      silenciosamente — confirme se é isso mesmo que você quer.)

## 2. Estados internos (máquina de estados)

Referência: Sentinela tem 2 estados nomeados (`engaging`/`leaving`); Mini-Swarm tem
3 sequenciais e **sem volta** (`patrol`→`telegraph`→`dive`); Boss tem 3 fases por
HP mais uma sub-máquina de transição; Blaster usa flags booleanas soltas em vez de
um enum (`wingBroken`, `disengaging`, `dying`) — e tem pelo menos um flag hoje
(`panicked`/`panicTimer`) que é setado mas **nunca lido em lugar nenhum** (bug
morto, não repita esse padrão sem querer).

- [ ] Quantos estados/fases distintos o inimigo tem? Dê um nome pra cada um.
- [ ] Para CADA estado: o que exatamente ele faz diferente (movimento, disparo,
      visual, colisão)?
- [ ] Para CADA transição entre estados: o que exatamente dispara ela — tempo
      decorrido, número de disparos, HP abaixo de um limiar, distância até o
      jogador, um evento externo (ex.: sofreu um hit específico), ou combinação?
- [ ] Algum estado é **terminal** (uma vez lá, nunca volta a um estado anterior)?
      Se sim, qual e por quê.
- [ ] Se algum estado/flag só existe pra ser "possível checar depois", confirme:
      **alguma outra parte do código vai de fato ler e reagir a esse flag?** Se a
      resposta for "não por enquanto", pergunte se vale a pena criar o flag agora
      mesmo assim ou se é melhor deixar de fora até ter uso real.

## 3. Movimento

Referência: 6 perfis diferentes de Blaster (órbita, avanço reto, lento, "follow"
sem nunca emparelhar, órbita com raio encolhendo, esquiva com "juke" aleatório);
mergulho de 3 fases do Mini-Swarm (patrulha oscilante → telegraph pulsante →
mergulho com desvio zigue-zague/espiral que converge no alvo); perseguição pura do
Boss (sempre reto até a posição atual do jogador, sem desvio); corrente elástica do
Verme (cada elo persegue o elo da frente, mantendo espaçamento fixo); posição
travada em relação ao trilho da Sentinela/Sussurro (nunca desvia mesmo em curva);
espelhamento do INPUT lateral do jogador com atraso de 0.4s da Réplica (único caso
assim no jogo); parado de propósito do Ima (só gira visualmente, nunca translada).

- [ ] Descreva a trajetória exata: reto, perseguição direta, órbita, zigue-zague,
      espiral, standoff fixo (para a uma distância e não avança mais), elástico
      (persegue outro elo/objeto, não o jogador), espelha o input do jogador,
      parado, ou outra coisa — descreva com suas palavras se for outra coisa.
- [ ] Existem múltiplas VARIANTES de movimento dentro da mesma classe (como os 6
      perfis do Blaster)? Se sim, liste cada uma com sua trajetória própria.
- [ ] Velocidade (em unidades/segundo, ou "não sei, sugira um valor e eu ajusto
      depois de ver rodando" — mas isso precisa ser dito explicitamente, não
      assumido).
- [ ] Se avança/persegue: tem uma distância mínima (standoff) onde para de se
      aproximar, ou fecha até a distância zero (colisão)?
- [ ] Precisa acompanhar a curva do trilho sem desviar lateralmente (mesma técnica
      usada por Blaster/Sentinela/Sussurro/Verme: reprojetar a posição a partir do
      frame VIVO do trilho a cada frame, em vez de só somar velocidade em
      coordenadas fixas de mundo — sem isso, qualquer curva causa deriva lateral
      perceptível)? Isso importa mesmo que o inimigo não pareça "rápido" — mesmo
      um avanço lento acumula deriva com o tempo.
- [ ] Faz `lookAt` (vira de frente) pro jogador continuamente, ou mantém uma
      orientação própria (como Verme/Réplica, que são as duas exceções hoje)?
- [ ] Gira/rotaciona por conta própria só por estética (cosmético, sem afetar
      hitbox/mira), como a maioria dos obstáculos girando (Detrito, Ima,
      Sentinela)?
- [ ] **Comportamento em ARENA especificamente** (se existir lá): persegue a
      posição do jogador, orbita em volta dele, ou algo diferente do trilho? Se
      você não especificar isso, o padrão hoje seria cair no fallback genérico de
      "perseguição suavizada a `speedFactor*0.8*velocidadeDaArena`" — confirme se
      é isso que você quer ou se precisa de comportamento próprio.
- [ ] Existe alguma "rede de segurança" pra nunca deixar o inimigo ficar parado do
      lado ou atrás da nave do jogador (padrão `PASS_BEHIND`/aceleração de saída
      usado por vários inimigos hoje)? Ou é aceitável ele ficar atrás por um tempo?

## 4. Dispara ou não? Se sim, como e quando?

Referência: Fragata/Verme/Ima/Sussurro/Réplica **nunca disparam** (só existem
como obstáculo/perseguidor de contato); Blaster/Tank usam o disparo genérico
compartilhado; Boss tem volley genérico + laser telegrafado num sistema paralelo;
Dourado tem TRÊS sistemas paralelos (volley reto, mini-naves teleguiadas, laser
grande telegrafado); Sentinela dispara um mecanismo totalmente próprio (a moldura).

- [ ] Este inimigo dispara algum projétil? Se a resposta é não, pule o resto desta
      seção e da seção 5 — mas confirme explicitamente ("não dispara nada, é
      só obstáculo/perseguidor de contato") em vez de deixar implícito.
- [ ] Usa o disparo genérico compartilhado (`fireEnemyProjectile` — cone reto,
      mesma velocidade/alcance/erro de mira de Blaster e Tank) ou precisa de um
      mecanismo totalmente próprio (como o laser do Chefe/Ampulheta-mega, os
      mísseis teleguiados do Dourado, ou a moldura da Sentinela)?
- [ ] Intervalo entre disparos: fixo (valor exato) ou aleatório numa faixa
      (mín/máx)? Deve ser afetado pelo multiplicador global de agressividade
      (`enemyAggression`, que acelera Blaster/Tank/Ampulheta-normal conforme o
      jogador erra perguntas) ou deve ser IMUNE a esse multiplicador (como o Chefe
      e a Sentinela são hoje, cada um com seu próprio intervalo fixo/independente)?
- [ ] Existe um número de disparos após o qual algo muda (como o "desengaja depois
      de 4 tiros" de Blaster/Tank)? Se sim, quantos e o que acontece exatamente
      (para de atirar? muda de estado/fase? foge?).
- [ ] Alcance mínimo e máximo de disparo (distância até o jogador em que ele pode
      atirar)?
- [ ] Precisa de telegraph visual antes do disparo (aviso de ~0.3s, padrão de todo
      inimigo atirador hoje)? Alguma cor/efeito específico, ou usa a cor de
      identidade do próprio inimigo (padrão)?
- [ ] Erro de mira: usa o padrão global (±5°, ajustável globalmente pelo debug) ou
      precisa de precisão própria (perfeita, ou mais imprecisa)?
- [ ] Dispara em rajada única, leque (vários projéteis num ângulo de espalhamento,
      como o Chefe nas fases 2/3), ou tiro único por vez?
- [ ] Tem uma SEGUNDA arma paralela e independente (como Chefe/Dourado, que têm
      volley + laser rodando em paralelo com cooldowns próprios)? Se sim, descreva
      a segunda arma com as mesmas perguntas desta seção.
- [ ] Ganha recuo visual (kickback) e clarão de disparo (muzzle flare) — hoje isso
      é hardcoded só pro Blaster; se você quiser isso pra um inimigo novo, precisa
      dizer explicitamente.

## 5. Como é o projétil dele (se disparar)

- [ ] Formato/geometria visual (cone reto padrão, cilindro/laser, outro formato).
- [ ] Cor.
- [ ] Velocidade.
- [ ] Alcance máximo (distância percorrida antes de desaparecer sozinho).
- [ ] Raio de acerto (hit radius) do projétil.
- [ ] Dano contra a vida e contra o escudo do jogador (podem ser valores
      diferentes — o padrão de laser do Chefe/Dourado causa 1 de dano de escudo
      fixo, mas a Ampulheta-mega causa 4).
- [ ] É reto (voa em linha desde o disparo) ou telegrafado com alvo travado
      durante um tempo antes de disparar de fato (padrão Chefe/Dourado: a posição
      alvo continua re-rastreando o jogador durante todo o telegraph, "sem trava
      antecipada")?
- [ ] É afetado pelo campo magnético do Enxame-Ímã (empurra tiros do JOGADOR pra
      longe — só relevante se este NOVO inimigo for parecido com esse mecanismo, a
      pergunta aqui é se o projétil DESTE inimigo deveria ter algum comportamento
      equivalente, como ser desviável por algo do jogador)?
- [ ] Pode ser destruído pela carta "giro rebatedor" do jogador (deflect) do mesmo
      jeito que qualquer projétil inimigo hoje, ou precisa de alguma exceção?

## 6. Reação a tiro NORMAL do jogador

Referência: dano padrão de tiro normal = 2. Blaster tem 2 HP (morre num tiro, mas
sobrevive e quebra uma asa se receber um dano MENOR, ex. 1 de dano de wingman);
Chefe reflete o tiro de volta se o escudo estiver ativo; Fragata bloqueia só se o
tiro vier do lado que a placa giratória está cobrindo naquele instante; Dourado
faz um dash evasivo reativo e pode teleportar se sobreviver a um hit.

- [ ] HP total (e portanto, quantos tiros normais de dano padrão são necessários
      pra matar — faça a conta junto com o usuário, não deixe implícito).
- [ ] Existe algum bloqueio/imunidade parcial? Se sim, qual dos dois padrões
      existentes se aplica (ou é um terceiro totalmente novo)?
  - Escudo refletor (bloqueia e devolve o projétil, como o Chefe) — em qual
    condição liga/desliga?
  - Blindagem direcional (bloqueia só de um lado específico, como a Fragata) —
    como esse lado é determinado e como muda com o tempo?
  - Nenhum bloqueio — todo tiro que acerta causa dano cheio.
- [ ] Ao ser atingido SEM morrer, acontece alguma coisa além de perder HP (efeito
      cosmético como quebra de asa, dash evasivo, teleporte, mudança de estado)?
      Se sim, descreva o gatilho exato (qualquer hit não-letal? só se estiver fora
      de um cooldown próprio, como o teleporte do Dourado?).
- [ ] Pontos concedidos ao morrer.
- [ ] Cor/efeito da explosão de morte (usa a cor de identidade do próprio inimigo,
      por padrão).
- [ ] Duração da animação de encolhimento na morte (padrão ~0.2-0.3s, mas alguns
      inimigos têm valores próprios).

## 7. Reação a tiro CARREGADO/teleguiado (homing) — e a estar sendo mirado/carregado

Referência: dano padrão do teleguiado é 4 (6 na carga máxima). O Dourado é
**imune ao splash de área** da carga máxima (só o hit direto travado o afeta) —
todo outro inimigo comum sofre o splash normalmente. Hoje NENHUM inimigo foge da
mira travada ou reage de alguma forma a estar sendo carregado/mirado antes do tiro
sair — é uma pergunta em aberto pra qualquer inimigo novo.

- [ ] O dano do tiro carregado/teleguiado é o padrão (4 normal / 6 carga máxima)
      ou precisa de um valor próprio?
- [ ] É elegível ao splash de dano em área da carga máxima (padrão pra todo
      inimigo na lista genérica) ou deveria ser IMUNE a esse splash (como o
      Dourado é hoje, só recebendo dano do hit direto)?
- [ ] É elegível a receber MÚLTIPLAS travas de lock-on simultâneas (hoje só Chefe
      e Dourado podem, via uma lista fixa no código) ou deve ser tratado como alvo
      comum (uma trava só)?
- [ ] Reage de alguma forma a estar TRAVADO pela mira do jogador antes do tiro sair
      (ex.: tenta fugir, muda de comportamento, nada muda)? Isso não existe em
      nenhum inimigo hoje — se você quiser isso, é um comportamento novo que
      precisa ser bem especificado (o que conta como "travado"? o que ele faz?).
- [ ] Reage de alguma forma a estar sendo mirado/o jogador estar SEGURANDO o botão
      de disparo (carregando), mesmo sem estar necessariamente travado nele?

## 8. Reação ao esquadrão (wingmen do jogador)

Referência: hoje NENHUM inimigo muda de comportamento por causa dos wingmen — eles
só são mais uma fonte de dano (1 de dano fixo por laser, resolvido pelo mesmo
sistema genérico de colisão do tiro do jogador). Bloqueios/escudos (Chefe/Fragata)
valem automaticamente contra laser de wingman também, sem código extra.

- [ ] Os wingmen podem mirar/atirar nele pelos critérios padrão de distância e
      ângulo (mesmo filtro genérico de qualquer inimigo vivo), ou deveria ser
      excluído da lista de alvos deles (como o Chefe é hoje, por uma
      particularidade do filtro — confirme se isso é intencional pro seu caso)?
- [ ] Muda de comportamento de alguma forma quando percebe/é atacado por um
      wingman (prioriza fugir dele, ignora, nenhuma reação)? Isso não existe em
      nenhum inimigo hoje — precisa ser especificado do zero se você quiser.
- [ ] Se tiver bloqueio/escudo (seção 6): o bloqueio também vale contra laser de
      wingman (padrão de hoje) ou deveria ser diferente?
- [ ] Se nascer em grupo/esquadrão: deveria participar do bônus de "esquadrão
      inteiro abatido" (hoje só formações de Blaster tem isso, e só conta mortes
      por tiro do JOGADOR, não por wingman nem por aríete — confirme se você quer
      essa mesma limitação ou se quer corrigir isso também, mas isso seria uma
      mudança em código compartilhado, avise antes de mexer).

## 9. Reação a impulso (boost) e a repulsão (freio reverso) do jogador

Referência: hoje, tocar QUALQUER inimigo (exceto Chefe/Dourado) com a nave do
jogador o destrói instantaneamente e conta um hit no jogador — é assim mesmo sem
boost ativo, é a regra padrão de "toque = morte mútua". Com a carta "impulso
aríete" ativa E o jogador propulsionando, esse toque vira dano de verdade
(`RAM_DAMAGE=5`) contra o HP do inimigo em vez de destruição instantânea — Chefe e
Dourado são as únicas exceções que **exigem** a carta de aríete pra sofrer
qualquer dano de contato (toque simples sem a carta não faz nada a eles). A
REPULSÃO (freio reverso) não tem NENHUMA interação codificada com nenhum inimigo
hoje.

- [ ] Um toque simples da nave (sem nenhuma carta ativa) deveria matar/remover
      este inimigo instantaneamente (padrão pra quase todo mundo) ou ele deveria
      ser IMUNE a toque simples, só sofrendo dano de verdade com a carta de aríete
      ativa (padrão exclusivo de Chefe/Dourado hoje)?
- [ ] Se usa o dano de aríete: o valor padrão `RAM_DAMAGE=5` serve, ou precisa de
      um valor próprio? O raio de colisão do aríete deveria ser o raio de hit
      padrão do inimigo, ou um raio dedicado maior/menor (como o `ramRadius=3.0`
      específico do Dourado, ajustado à geometria dele)?
- [ ] Deveria reagir de alguma forma específica à REPULSÃO (freio reverso) do
      jogador? Isso seria a PRIMEIRA interação desse tipo no jogo — se você quer
      isso, descreva bem o que deveria acontecer (nenhum inimigo existente serve
      de referência aqui).
- [ ] Deveria reagir de alguma forma ao jogador estar em BOOST especificamente
      (acelerar fuga, ficar mais perigoso, nada)? Hoje isso só é consultável pelo
      esquadrão do jogador (wingmen aceleram durante boost) — nenhum inimigo lê
      esse estado hoje, mas o dado já está tecnicamente disponível se você quiser
      que um inimigo novo reaja a ele.

## 10. Reação à movimentação do jogador (fora dos itens acima)

Referência: a maioria dos inimigos ou ignora completamente onde o jogador está
(Verme, Ima), ou rastreia a posição ATUAL dele continuamente (`lookAt`/perseguição
padrão). A Réplica é o único caso que rastreia o INPUT lateral (não a posição) com
atraso de 0.4s. O Dourado tem um gatilho de distância (dash evasivo ao chegar
perto demais).

- [ ] Rastreia a posição atual do jogador continuamente, ignora completamente, ou
      faz algo mais específico (like espelhar o input dele com atraso)?
- [ ] Existe alguma distância-gatilho que muda o comportamento dele (ex.: só reage
      quando o jogador chega perto demais, como o dash do Dourado)? Se sim, qual
      distância e o que acontece.
- [ ] Reage de forma diferente a movimento LATERAL (strafe) versus mudança de
      velocidade (acelerar/frear) do jogador, ou trata tudo igual (só distância
      euclidiana até a posição dele)?

## 11. Avanço, fuga, surgimento, teleporte, desaparecimento, invisibilidade, invocação

Pergunte cada um destes separadamente — não assuma que "não mencionado" significa
"não se aplica".

- [ ] **Avança sozinho** rumo ao jogador (decrementa a própria posição/depth
      ativamente) ou só "parece se aproximar" porque o próprio trilho avança
      (como Tank/Ampulheta-normal hoje, que ficam parados no trilho)?
- [ ] **Foge/desengaja** depois de algo (X disparos, tempo vivo, HP baixo)? Se
      sim: o gatilho exato, e como foge (sobe e acelera reto tipo Blaster, foge em
      alguma direção específica, desaparece na hora)?
- [ ] **Teleporta** em algum momento? Hoje só o Dourado faz isso (ao sobreviver a
      um hit, respeitando um cooldown de 10s, reposicionando pra um ponto aleatório
      na casca da arena). Se você quer isso: qual o gatilho exato e o cooldown?
- [ ] **Some/desaparece** de alguma forma que não seja morte normal ou os
      despawns padrão de distância? Fica de fato IMUNE a dano enquanto
      "desaparecido" (invisibilidade de verdade) ou só fica visualmente
      transparente/pulsando SEM nenhuma imunidade real (como o Sussurro, cuja
      opacidade oscila mas o hitbox/hp continuam 100% normais o tempo todo — é
      puramente cosmético)? Essa distinção importa muito, especifique com certeza.
- [ ] **Invoca reforços** (como o Sussurro, único caso hoje)? Se sim: gatilho
      exato (tempo vivo? outro evento?), quantos e de que tipo, e eles devem
      nascer com a animação normal de entrada (pop-in + efeito visual) ou aparecer
      já em tamanho cheio sem aviso (como os reforços do Sussurro hoje)?
- [ ] **Posição de spawn**: distância mínima/máxima até o jogador (ou até o centro
      da arena, se for em modo arena), espalhamento lateral, sozinho ou em
      grupo/formação (se em grupo, quantos e como se distribuem)?
- [ ] Anima a entrada com o crescimento de escala padrão (0.1x→1x em ~0.35s) e o
      efeito visual de condensação de névoa padrão, ou precisa de algo próprio?
- [ ] **Condições de despawn** (removido sem morrer): usa a regra padrão de trilho
      (passou atrás do plano da câmera, viajou mais de 180 unidades desde o
      spawn, ou saiu por cima da tela), precisa de uma folga maior/menor que o
      padrão (como a Réplica, que tolera 5x mais distância atrás por ficar parada
      de propósito), ou não deveria ter despawn por distância nenhum (existe até
      morrer, como Fragata/Ima em modo arena)?

## 12. Integração técnica obrigatória com sistemas compartilhados

Isto é um checklist técnico, não apenas de design — cada item aqui é um lugar
onde o código PRECISA de uma entrada explícita pro inimigo novo, ou ele cai
silenciosamente num valor padrão (geralmente os do Blaster) sem avisar ninguém.
Pergunte cada um mesmo que a resposta óbvia seja "usa o padrão".

- [ ] Raio de colisão (hitbox) — valor exato, e proporcional a quê (tamanho visual
      real da geometria 3D — ver a lição da Sentinela e do Detrito nas entregas
      anteriores deste projeto: a proporção entre a borda visível e o hitbox real
      já causou bugs sérios de "acerta quando não devia"/"não acerta quando
      devia"; meça, não estime de cabeça).
- [ ] Duração da animação de morte (padrão da tabela: usa o valor de outro
      inimigo, ou um valor próprio?).
- [ ] Cor de identidade (usada em telegraph e tingimento de explosão).
- [ ] Pontos de bônus por abate.
- [ ] Distância de "passar atrás" pra despawn (padrão -2.0, ou customizado — ver
      seção 11).
- [ ] Precisa de uma função `disposeX()` própria (obrigatório se tiver geometria
      ou material NÃO compartilhado com outra classe) — e ela precisa ser
      adicionada à lista central de limpeza.
- [ ] Deve contar para o teto de inimigos ativos por onda (`getEnemyCount`), ou
      deve ser excluído dessa contagem como obstáculo ambiental (padrão hoje de
      Detrito e Enxame-Ímã)?
- [ ] Deve aparecer com barra de vida na HUD? (Hoje isso só acontece
      automaticamente se `maxHp>1`, com uma exceção hardcoded pro Mini-Swarm que
      tem `hp=1`.)
- [ ] Deve aparecer no minimapa com o ícone genérico de inimigo, ou precisa de um
      ícone/tipo próprio (hoje só o Chefe tem um tipo dedicado no minimapa)?
- [ ] Deve respeitar os 3 multiplicadores globais de dificuldade (agressividade,
      bônus de velocidade de projétil, erro de mira) ou deve ser imune a algum/
      todos eles, como Chefe e Sentinela são hoje?
- [ ] Entra no array genérico `enemies[]` compartilhado (like praticamente todo
      inimigo hoje) ou precisa de um subsistema totalmente separado, composto por
      fora (padrão do Dourado — exige integrar manualmente em ~8 pontos
      diferentes de `enemies/index.js`)? Só escolha a segunda opção se houver um
      motivo concreto (ex.: uma segunda barra de vida especial, um conjunto de
      efeitos exclusivos grande demais pra caber no padrão genérico).

## 13. Regras de spawn na progressão normal do jogo

- [ ] Em que fase(s) do jogo ele pode aparecer (combate normal, arena de chefe,
      arena dourada, ambas, só via debug)?
- [ ] Chance de spawn (valor fixo, ou uma chance base que aumenta com erros do
      jogador, como vários inimigos hoje fazem)?
- [ ] Tem um timer de spawn PRÓPRIO e independente do ciclo normal de inimigos
      (como Detrito/Ima, que não competem pelo teto de onda), ou entra na fila
      normal de spawn condicionado ao teto de inimigos ativos (como
      Fragata/Verme/Sussurro/Réplica)?

---

*Depois de responder tudo o que se aplica, resuma de volta pro usuário em texto
corrido (não precisa reimprimir o checklist) o que foi decidido, destacando
claramente: (a) tudo que muda, (b) tudo que explicitamente NÃO muda (se for
edição), e (c) qualquer ponto que ficou em aberto/sem resposta clara — e pare
para confirmação antes de codificar qualquer coisa.*
