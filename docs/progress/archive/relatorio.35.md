# RELATÓRIO CONSOLIDADO — MARCO v0.99.35 (STAR-ANKI)
## Registro Autoritativo de Sistemas Implementados, Backlog Pendente e Diretrizes Técnicas para IAs

> **Documento:** `relatorio.35.md`
> **Data:** 23 de Setembro de 2026
> **Versão de Referência:** v0.99.35 (Branch: `chore/reorganize-and-forgot-v09935` / Base de fechamento: `bfad055e7bcb07f57e396a511b3258c15f0f2a91` / Head auditado: `83a1ba832368b066dcb4eda1676202b0559f61c1`)
> **Status de Validação:** 35/35 Testes Unitários Aprovados (`selftest.mjs`), CI GitHub Actions run `#35912947333` verde, Auditoria 0 erros / 0 avisos (`full-project-audit.mjs`), Fuzzing 0 falhas (`state-fuzz-audit.mjs` e `wingman-runtime-fuzz-audit.mjs`).
> **Público-alvo:** Desenvolvedores, Engenheiros de Software e Agentes de Inteligência Artificial trabalhando no Star-Anki.

---

## SUMÁRIO GERAL
1. [Visão Geral & Filosofia do Projeto](#1-visão-geral--filosofia-do-projeto)
2. [PARTE I — TUDO O QUE FOI IMPLEMENTADO E ADICIONADO](#parte-i--tudo-o-que-foi-implementado-e-adicionado)
   - [1.1 Modularização Arquitetural do Core (`main.js`)](#11-modularização-arquitetural-do-core-mainjs)
   - [1.2 Sistema de Foco / Lock-On & Swirl Blast](#12-sistema-de-foco--lock-on--swirl-blast)
   - [1.3 Overhaul Completo do Tank (Unidade Pesada de Assalto)](#13-overhaul-completo-do-tank-unidade-pesada-de-assalto)
   - [1.4 Subsistema Completo de Companheiros de Ala (Wingmen)](#14-subsistema-completo-de-companheiros-de-ala-wingmen)
   - [1.5 Rádio dos Aliados, Retratos e Expansão de Falas](#15-rádio-dos-aliados-retratos-e-expansão-de-falas)
   - [1.6 Feedback Visual de Dano (Mangá & Buraco Negro Orbital)](#16-feedback-visual-de-dano-mangá--buraco-negro-orbital)
   - [1.7 Sistema de Knockback, Alerta de Perigo e Câmera](#17-sistema-de-knockback-alerta-de-perigo-e-câmera)
   - [1.8 Sistema de Áudio Real, Sound Cues e Controles](#18-sistema-de-áudio-real-sound-cues-e-controles)
   - [1.9 Dificuldade, Escalada de Combate e Progressão](#19-dificuldade-escalada-de-combate-e-progressão)
   - [1.10 Filosofia Pedagógica (Active Recall + Explicação com Fontes)](#110-filosofia-pedagógica-active-recall--explicação-com-fontes)
   - [1.11 Auditoria Completa, Resiliência a Falhas e Caça aos Bugs](#111-auditoria-completa-resiliência-a-falhas-e-caça-aos-bugs)
3. [PARTE II — TUDO O QUE AINDA NÃO FOI ADICIONADO (BACKLOG & DOCS PENDENTES)](#parte-ii--tudo-o-que-ainda-não-foi-adicionado-backlog--docs-pendentes)
   - [2.1 FSM Universal de Inimigos — Fase 2 em Diante](#21-fsm-universal-de-inimigos--fase-2-em-diante)
   - [2.2 Overhaul do Dourado e Esquadrão de Caças](#22-overhaul-do-dourado-e-esquadrão-de-caças)
   - [2.3 Mira Direcional por Movimento (C/Z + Direcionais)](#23-mira-direcional-por-movimento-cz--direcionais)
   - [2.4 Evolução do Retículo e Expansão da Mira Carregada](#24-evolução-do-retículo-e-expansão-da-mira-carregada)
   - [2.5 Cutscene de Vida Perdida (Queda + Reserva)](#25-cutscene-de-vida-perdida-queda--reserva)
   - [2.6 Novo Chefe: Colmeia-Mãe](#26-novo-chefe-colmeia-mãe)
   - [2.7 Novo Evento: Apagão de Radar](#27-novo-evento-apagão-de-radar)
   - [2.8 Novos Obstáculos Passivos e Ambientais](#28-novos-obstáculos-passivos-e-ambientais)
   - [2.9 Melhorias de Qualidade de Vida (QoL Pendentes)](#29-melhorias-de-qualidade-de-vida-qol-pendentes)
   - [2.10 Catálogo de Áudio e Efeitos Sonoros Faltantes](#210-catálogo-de-áudio-e-efeitos-sonoros-faltantes)
   - [2.11 Melhorias no Sistema de Estudo Anki e Decks](#211-melhorias-no-sistema-de-estudo-anki-e-decks)
4. [PARTE III — GUIA DE IMPLEMENTAÇÃO E CORREÇÃO PARA OUTRAS IAs](#parte-iii--guia-de-implementação-e-correção-para-outras-ias)
   - [3.1 Regras de Ouro e Mandamentos de Integridade](#31-regras-de-ouro-e-mandamentos-de-integridade)
   - [3.2 Armadilhas Críticas de Three.js no Projeto](#32-armadilhas-críticas-de-threejs-no-projeto)
   - [3.3 Padrão de Arquitetura de Módulos e Gerenciamento de Estado](#33-padrão-de-arquitetura-de-módulos-e-gerenciamento-de-estado)
   - [3.4 Como Utilizar o Motor de Validação em Tempo de Execução (`aiValidator`)](#34-como-utilizar-o-motor-de-validação-em-tempo-de-execução-aivalidator)
   - [3.5 Protocolo Obrigatório de Validação Pré-Commit](#35-protocolo-obrigatório-de-validação-pré-commit)

---

## 1. VISÃO GERAL & FILOSOFIA DO PROJETO

O **Star-Anki** é um arcade rail shooter 3D inspirado nos clássicos dos anos 90 (*Star Fox 64*), implementado nativamente em JavaScript (ES Modules), WebGL através da biblioteca **Three.js** e interface via Vanilla DOM/CSS.

O jogo integra duas experiências simbióticas:
1. **Modo Estudo (Active Recall + Repetição Espaçada / SRS):** Cada rodada de perguntas utiliza baralhos de estudo exportados do Anki. Respostas corretas concedem upgrades permanentes estilo Roguelike, enquanto erros exigem reflexão através de explicações técnicas com referências bibliográficas.
2. **Modo Arcade Roguelike:** Ação espacial pura sem pausas de perguntas, com progressão direta de melhorias de combate, combate de chefes e alta densidade de inimigos.

O projeto adota uma política rigorosa de **estabilidade contínua**: novas funcionalidades nunca devem quebrar suítes de testes automatizados, nem introduzir regressões na física de voo, no subsistema de miras ou na máquina de estados dos companheiros de esquadrão.

---

# PARTE I — TUDO O QUE FOI IMPLEMENTADO E ADICIONADO

Abaixo encontra-se o registro detalhado de tudo o que foi construído, refatorado e testado com sucesso no projeto até o presente marco:

---

### 1.1 MODULARIZAÇÃO ARQUITETURAL DO CORE (`main.js`)
O antigo arquivo monolítico `src/main.js` (~1050 linhas) foi completamente decomposto em 8 módulos desacoplados com responsabilidades exclusivas, mantendo zero alteração de comportamento:

- [`src/main.js`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/src/main.js): Reduzido a bootstrap puro (~10 linhas), inicializando o suporte mobile e o menu de início.
- [`src/main-constants.js`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/src/main-constants.js): Reúne mais de 100 constantes numéricas autoritativas de balanceamento (timings de ciclo, combate, chefes, chances de spawn e multiplicadores).
- [`src/mount-game.js`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/src/mount-game.js): Responsável pelo ciclo de montagem da cena Three.js, instanciamento de câmeras, luzes, sistemas de jogo, injeção de dependências e teardown de memória.
- [`src/game-loop.js`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/src/game-loop.js): Executa o `tick()` autoritativo de renderização e física (ordem rigorosa: inputs → pausas → cutscenes → atualizações de entidades → resolução de combate → HUD → render Three.js).
- [`src/cutscenes.js`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/src/cutscenes.js): Gerencia as transições de câmera para arena (`arenaCutscene`, usando `dt` suavizado) e câmera lenta de abate de chefes (`deathCutscene`, usando `rawDt`).
- [`src/flow-boss.js`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/src/flow-boss.js): Controla o ciclo do Chefe (caçada de orbes, invocação, combate de fases, vitória) e da Anomalia Dourada (arena e pergunta-bônus).
- [`src/flow-question.js`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/src/flow-question.js): Modais de estudo, seleção de cartas Roguelike e aplicação de upgrades ao jogador.
- [`src/flow-progression.js`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/src/flow-progression.js): Escalada de dificuldade por erros e randomizadores de intervalos de spawn.

---

### 1.2 SISTEMA DE FOCO / LOCK-ON & SWIRL BLAST
Reformulação completa da mira telescópica e do tiro carregado em [`src/combat/lockon.js`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/src/combat/lockon.js) e [`src/combat/projectiles.js`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/src/combat/projectiles.js):

1. **Regra de Prioridade Linear Autoritativa:**
   - **Prioridade 1 (Absoluta):** Boss ativo (`kind === 'boss'`). Se existir um chefe na cena, todas as novas travas concentram-se nele imediatamente.
   - **Prioridade 2:** Inimigo com **maior `maxHp`** configurado (exemplo: uma unidade com 10/300 HP tem prioridade sobre uma de 100/100 HP).
   - **Desempate Determinístico:** Em caso de empate exato em `maxHp`, prevalece o menor `entity.id` numérico para evitar oscilações visuais (*flickering*).
   - **Estabilidade:** Travas já consolidadas nunca mudam de alvo repentinamente se um inimigo de maior HP surgir depois.
2. **Multi-Lock por Categoria de Entidade:**
   - **Boss (`boss`):** Travas ilimitadas até o limite máximo de carga (`maxAllowed`).
   - **Dourado (`golden`):** Multi-lock completo até o teto de carga caso seja o alvo prioritário.
   - **Horda (`horda`):** Limite de até 2 travas simultâneas.
   - **Inimigos Comuns:** Máximo de 1 trava por entidade; alvos adicionais são distribuídos para as próximas maiores ameaças.
3. **Validação Espacial e Desacoplamento do Retículo:**
   - Alvos atrás do jogador (`rel.dot(forward) < -4`) ou fora do alcance de 10 a 90 unidades são estritamente rejeitados.
   - O *Aim Hint* visual (círculo vermelho no HUD via `isAimingAtEnemy`) permanece com cone de 7° estritamente para feedback estético do jogador, sem interferir na aquisição matemática das travas.
4. **Swirl Blast Volumétrico & Dano Percentual:**
   - **Bônus contra Boss:** `SWIRL_BOSS_MAX_HP_DAMAGE_RATIO = 0.30`. O impacto direto causa:
     $$\text{Dano} = \text{Dano Base (6)} + \text{Bônus Global} + (0.30 \times \text{boss.maxHp})$$
   - O Dourado foi expressamente excluído do bônus de 30% (recebe 6 base + bônus normais).
   - **Hitbox Volumétrica:** `SWIRL_BLAST_BASE_HIT_RADIUS = 3.0`. Implementada colisão contínua (*swept sphere-capsule*) ao longo do trajeto do projétil. Detritos são pulverizados instantaneamente sem parar o projétil; chefes e fragatas absorvem o impacto final.

---

### 1.3 OVERHAUL COMPLETO DO TANK (UNIDADE PESADA DE ASSALTO)
Transformação integral do `tank` em [`src/enemies/tank.js`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/src/enemies/tank.js), estabelecendo o arquétipo de **Unidade Pesada de Linha de Frente**:

- **Definição de Papel:** É um inimigo regular de encontro (NÃO é boss, não inicia all-range obrigatório, não tem cutscene, ocupa 2 vagas no limite de população de combate e concede 75 pontos).
- **Modelo 3D com Recoil Desacoplado:** Hierarquia Three.js com `root` (âncora da hitbox `TANK_HIT_RADIUS = 2.80`) e `visualGroup` (subgrupo com canhão frontal maciço, sponsons laterais e bocais de propulsores). Os disparos geram impulso físico de recuo (-1.35u em Z) com retorno elástico amortecido sem jamais alterar a hitbox física.
- **FSM Dedicada (9 Estados):**
  - `SPAWNING`: Entrada cênica suave com invulnerabilidade temporária.
  - `ENGAGED`: Manutenção de distância dinâmica (standoff 32–52u) com velocidade lateral de 5.5 u/s.
  - `BRACING`: Ancoragem mecânica com redução de velocidade e alinhamento do canhão (0.70s a 0.50s conforme a dificuldade D1–D9).
  - `TELEGRAPHING`: Brilho no bocal do canhão e aviso sonoro específico para o ataque sorteado.
  - `ATTACKING`: Executa um dos 3 ataques do arsenal:
    - *Siege Shot:* Artilharia pesada (`speed = 34`, `hitRadius = 2.4`, `damage = 2`, `powerLevel = 4`).
    - *Suppression Burst:* Rajada de 2 a 3 projéteis (`speed = 40`, `interval = 0.22s`) recalculando a mira para a posição atual do jogador a cada disparo.
    - *Heavy Ram:* Investida curta em distâncias menores que 13u (`speed = 30 u/s`, duração 0.55s).
  - `RECOVERY`: Vulnerabilidade pós-disparo (0.80s a 0.64s).
  - `REPOSITIONING`: Deslocamento pesado para uma nova coordenada segura.
  - `STAGGERED`: Interrupção mecânica provocada pelo Swirl Blast (0.45s de atordoamento + 2.5s de proteção contra stun-lock).
  - `DISENGAGING`: Retirada tática no modo trilho após 5 ciclos completos de ataque (na arena ele nunca foge por tempo).
- **Limiares Visuais de Blindagem:**
  - `> 66% HP`: Casco blindado intacto.
  - `33–66% HP`: Blindagem fissurada com alerta sonoro `tank_armor_break`.
  - `< 33% HP`: Estado crítico com núcleo exposto, tremor mecânico e recuperação 10% mais veloz.
- **Morte:** Sequência de 0.65s com faíscas internas e detonação com ondas de choque sonoras (`tank_death`).

---

### 1.4 SUBSISTEMA COMPLETO DE COMPANHEIROS DE ALA (WINGMEN)
Refatoração profunda da inteligência artificial, física de voo e autoridade dos aliados (*Falco, Peppy, Slippy, Miyu*):

1. **Controlador Central de Estados (`src/combat/wingman-state-controller.js`):**
   - Eliminação de variáveis soltas em favor de máquina de estados estrita.
   - Três camadas semânticas isoladas: *Integridade* (`nominal`, `damaged`, `critical`, `retreating`), *Behavior* (`patrol`, `dogfight`, `regroup`) e *Actions Persistentes* (`ram`, `guard`, `rescue`, `assist`, `auxShield`).
   - Políticas formais de interrupção com aplicação atômica de cooldowns.
2. **Navegação & Deconflição Física:**
   - **Tactical Freedom:** Remoção definitiva de "regroup por distância euclidiana" e coleira artificial. Os aliados operam livremente na arena enquanto suas ações forem válidas.
   - **Separação Simétrica (`wingman-formation-separation.js`):** Tratamento de pares de naves sobrepostas aplicando impulsos rigorosamente opostos a partir de snapshots, com resolução de penetração física até 1.5u/frame.
   - **Detector de Clump:** Validação contínua que aciona falha no `aiValidator` caso duas naves permaneçam a menos de 1u de distância por mais de 0.5s.
3. **Integridade, Escudo e Retirada:**
   - Cada piloto possui 4 HP e 3 a 5 de escudo (com regeneração após 1.5s).
   - Barras de vitais projetadas no mundo 3D quando danificados.
   - Ao atingir 0 HP, o piloto entra no estado `retreating`: torna-se invulnerável, para de atirar, fala sua linha de retirada no rádio e deixa a tela em 5s com fumaça e fogo.
   - Retorno ao combate através da carta Roguelike correspondente ou carta genérica de Companhia.
4. **Habilidades Únicas & Cartas Roguelike:**
   - **Falco (Ás Interceptor):**
     - *Investida Aríete (`ram`):* Ataque cinemático em alta velocidade contra alvos em dogfight.
     - *Intercept:* Destruição atômica de projéteis pesados direcionados ao jogador, com feixe e onda de choque azul visíveis.
     - *Fôlego de Combate:* Prolongamento do tempo de engajamento ofensivo.
     - *Investida em Cadeia:* Rebote do aríete para um segundo alvo vivo próximo.
   - **Peppy (Defensor Blindado):**
     - *Guarda Extra:* Adiciona cargas de escudo verde temporário (acima do teto máximo) por 10s.
     - *Rescue:* Detecta cambalhota/knockback no jogador, voa até ele, cancela o atordoamento e restaura +1 de escudo.
     - *Auxílio:* Durante a manobra de repulsão (`S`), Peppy posiciona-se à frente criando barreira que bloqueia projéteis frontais.
   - **Slippy (Batedor Solar):**
     - *Reparo de Campo:* Spawna orbes verdes colecionáveis que restauram 1 HP do jogador ou aliados.
     - *Morale Boost:* Ativado no comando Foco (`F`), concede +1 de dano a todas as armas e muda faíscas para verde.
     - *Impulsão Conjunta:* Durante o boost (`A`), concede invencibilidade temporária e adiciona dano maciço de aríete.
   - **Miyu / Phantom (Vanguarda Fantasma):**
     - *Carga Compartilhada:* Acopla na lateral do jogador durante a carga do tiro teleguiado, acelerando o tempo de carga em +50%.
     - *Assist:* Adiciona travas extras de mira com retículos triangulares ciano e disparos laser rosa/magenta independentes.
     - *Boombuster:* Disparo simultâneo de orbes teleguiados roxos (`#9b5de5`) em até 1+stacks alvos prioritários.

---

### 1.5 RÁDIO DOS ALIADOS, RETRATOS E EXPANSÃO DE FALAS
Overhaul da comunicação de combate em [`src/combat/wingman-radio.js`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/src/combat/wingman-radio.js) e [`src/combat/wingman-world-radio.js`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/src/combat/wingman-world-radio.js):

- **4 Slots Permanentes e Independentes no HUD:** O rádio lateral abandonou a fila serial única. Cada piloto possui seu próprio painel abaixo da bandeja de cartas, com transmissões simultâneas que não se sobrescrevem.
- **120 Falas Novas:** Adicionados exatamente 30 quotes inéditos para cada piloto, preservando suas personalidades e histórico de combate.
- **Call & Response:** Eventos críticos (retirada, entrada em HP crítico, recuperação, ativação de habilidade) abrem threads de diálogo contextual onde um segundo aliado responde de acordo com o parentesco emocional. Respostas exibem o prefixo claro `↳ [Piloto]: ...`.
- **Rádio In-World e Efeitos de Habilidade:**
  - Ativações de habilidades (Ram, Rescue, Intercept, etc.) exibem o balão de fala projetado diretamente no espaço 3D **acima da nave do respectivo piloto**, acompanhado de aura aditiva na cor da sua identidade por 1.5s.
  - Ao acionar o comando Foco (`F`), Fox McCloud transmite acima da nave do jogador através do retrato dedicado `assets/wingman-radio/fox.png`, e os aliados confirmam a ordem acima de seus caças.

---

### 1.6 FEEDBACK VISUAL DE DANO (MANGÁ & BURACO NEGRO ORBITAL)
Sistema de números de dano configurável em `Configurações → Visual` através de [`src/hud-damage.js`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/src/hud-damage.js):

- **Clássico:** Apresentação retro tradicional com números flutuantes padrão.
- **Mangá de Colisão:** Tipografia de impacto estilo quadrinho, com números menores, linhas cinéticas e emergência direta do ponto de impacto sem flutuação errática.
- **Buraco Negro Orbital:**
  - Mecânica cooperativa: ativa-se apenas em alvos vivos com HP $\ge 12$ quando jogador e aliados combinam disparos no mesmo alvo em até 1s.
  - Os números e arcos de energia orbitam suavemente em torno do centro autoritativo do alvo, distribuídos em 5 slots dedicados (jogador + 4 pilotos).
  - Encerramento atômico imediato em caso de acerto letal, evitando números fantasma após a explosão da nave.

---

### 1.7 SISTEMA DE KNOCKBACK, ALERTA DE PERIGO E CÂMERA
- **Knockback por Tiers:** 4 intensidades de cambalhota e atordoamento de controle após colisões físicas pesadas (durações: 1.2s, 1.8s, 2.6s e 3.6s).
- **Janela de Controle de 35%:** A perda total de direção ocorre apenas nos primeiros 35% do tempo da cambalhota; após esse marco, o controle direcional é devolvido suavemente mesmo com a nave completando a desaceleração do giro. Disparo, rolamento e repulsor permanecem disponíveis.
- **Alerta de Perigo:** Ícone ampliado (`68px`) projetado na tela exatamente acima da posição física da nave do jogador.

---

### 1.8 SISTEMA DE ÁUDIO REAL, SOUND CUES E CONTROLES
Implementado reprodutor de áudio nativo em [`src/audio.js`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/src/audio.js) consumindo o catálogo de eventos em [`src/audio-cues.js`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/src/audio-cues.js):

- **Gerenciamento de Contexto:** Desbloqueio do WebAudio API no primeiro clique/gesto da sessão e encerramento limpo de todos os canais no teardown.
- **Opções de Áudio:** Configurações com modos *Tudo Ligado*, *Somente Rádio* (voz e conexão dos aliados) e *Desligado*.
- **97 Sound Cues Registradas:** Associação formal de eventos de gameplay a arquivos de áudio em `sons/` (tiro primário, homing charging loop com cauda de loop perfeita, explosão carregada, swirl, disparos inimigos, telegraph de lasers do boss, teleporte dourado, sons de rádio e vozes dos aliados).
- **Fallback Sintético:** Todas as cues que ainda não possuem arquivos de áudio gravados utilizam bips sintéticos WebAudio curtos e calibrados, garantindo que nenhum evento do jogo seja mudo.

---

### 1.9 DIFICULDADE, ESCALADA DE COMBATE E PROGRESSÃO
- **Escalação Formal por Nível (D1 a D9):**
  - Cada nível de dificuldade adiciona **+25 segundos** ao ciclo de combate regular antes do encontro especial.
  - Cada nível de dificuldade adiciona **+1 inimigo** por leva nas ondas normais de spawn.
- **Quebra de Combo:** Ser atingido por projéteis ou colisões inimigas quebra imediatamente o multiplicador de combo acumulado do quiz.
- **Recompensa por Estudo:** Abrir a explicação detalhada de uma resposta errada concede **25 pontos** uma única vez por carta, estimulando a revisão do conteúdo pedagógico.

---

### 1.10 FILOSOFIA PEDAGÓGICA (ACTIVE RECALL + EXPLICAÇÃO COM FONTES)
Implementação rigorosa das diretrizes de aprendizado nos baralhos e na interface de quiz:

- **Dois Momentos Rígidos:**
  - *Durante a Pergunta (Active Recall Puro):* Exibição de alternativas sem antecipação da resposta. Botão de Contexto (`E`) apresenta apenas o conceito geral e link acadêmico, sem spoilers.
  - *Pós-Resposta (Aprofundamento):* No acerto, abre a escolha de cartas Roguelike com acesso opcional ao botão "Explicação da Resposta"; no erro, pausa pedagógica de 5s exibindo a resposta correta e a explicação densa com fontes oficiais (pulável instantaneamente com Espaço/Botão A).
- **Reestruturação dos Baralhos:** 70 cartas oficiais reescritas no padrão Cloze e Basic seguindo a regra de Wozniak (um único fato por card).

---

### 1.11 AUDITORIA COMPLETA, RESILIÊNCIA A FALHAS E CAÇA AOS BUGS
Durante as auditorias adversariais e a sincronização com o branch `origin/audit/full-project-bughunt-v09932` (v0.99.31/v0.99.32), foram identificados e sanados os seguintes problemas críticos:

1. **Mutação In-Place de Posição 3D dos Wingmen via `project(camera)` (CRÍTICO):**
   - *Causa:* `getVitalSnapshots` retornava `w.mesh.position` direto por referência. Ao calcular as barras de HP no HUD, o Three.js executava `v.worldPos.project(camera)`, o que alterava o vetor mundial original para coordenadas normalizadas de tela `[-1, 1]`.
   - *Correção:* Retorno de clones explícitos `w.mesh.position.clone()` e uso defensivo em `game-loop.js`.
2. **Bloqueio de Recuperação de Pilotos em Retirada:** `spawnMember` agora permite recolocar em combate pilotos que ainda estão completando a animação de 5s de retreat.
3. **Contagem Dessincronizada em `getWingmanCount()`:** Aliados em retreat agora são filtrados, corrigindo cálculos de spawn de inimigos e HUD.
4. **Race Condition no Pool de Cartas Roguelike:** `player.markWingmanDown` agora é acionado imediatamente no primeiro frame em que o aliado é abatido, evitando que cartas de pilotos mortos sejam ofertadas.
5. **Vazamento de Falas no Rádio de Naves Fora de Combate:** Filtros estritos de `w.state !== 'retreating'` em todas as transmissões de rádio e cancelamento atômico de conversas Call & Response para pilotos abatidos.
6. **Glitch de Escudo Visual e Flash Crítico Congelados:** Desativação forçada de `auxShieldVisual` e restauração de materiais no frame de entrada em retreat.
7. **Falco Chain Ram com Alvos Inválidos:** Validação obrigatória de alvos vivos através de `isWingmanCombatTargetReady`, filtrando alvos em fade/morte e incluindo o Dourado.
8. **Vazamento de Estado em `clearSquadron()`:** Reset completo de modos de comando (`squadronCommandMode`), multiplicadores de cooldown e bônus de moral.
9. **Compatibilidade com Node 21+ (`tools/state-fuzz-audit.mjs`):** Mock de `navigator` via `Object.defineProperty` defensivo.
10. **Sanitização de Esquemas Corrompidos:** Tratamento estrito contra entradas corrompidas de `localStorage` em `keybindings.js`, `storage.js` e `decks.js`.
11. **Vazamento de Borda em Teclas no `blur`:** Limpeza de `pressedThisFrame` e `keys` em `input.js` ao perder o foco (Alt+Tab).

---

# PARTE II — TUDO O QUE AINDA NÃO FOI ADICIONADO (BACKLOG & DOCS PENDENTES)

Abaixo está o inventário completo de todas as funcionalidades, reformas arquiteturais, novos inimigos, chefes e melhorias conceituais que já foram documentados, desenhados ou aprovados pelo usuário, mas que **AINDA NÃO FORAM IMPLEMENTADOS NO CÓDIGO**:

---

### 2.1 FSM UNIVERSAL DE INIMIGOS — FASE 2 EM DIANTE
*Referência: [`OVERHAUL_ESTADOS_INIMIGOS.md`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/OVERHAUL_ESTADOS_INIMIGOS.md)*

A Fase 1 da migração de FSM unificada foi concluída para **Blaster** e **Tank**. Restam os outros 9 tipos de inimigos para serem desacoplados e migrados para `src/enemies/state-machine.js`:

1. **MiniSwarm (`miniSwarm.js`):** Migrar de `enemy.swarmState` para FSM formal com os estados `SWARM_PATROL`, `SWARM_TELEGRAPH` e `SWARM_DIVE`.
2. **Sentinela (`sentinela.js`):** FSM formal com `APPROACH`, `STANDOFF`, `GATE_TELEGRAPH`, `GATE_FIRE` e `LEAVING`.
3. **Boss (`boss.js`):**
   - HFSM com Fases 1, 2 e 3 e sub-estados: `MANEUVER`, `VOLLEY`, `LASER_CHARGE`, `LASER_FIRE` e `PHASE_TRANSITION`.
   - ⚠️ **Atenção:** O documento de especificação contém um erro conhecido: documentou a transição como 2.0s, mas o código real executa em 1.2s. Além disso, o escudo é independente e não deve ser ativado compulsoriamente na transição de fase.
4. **Golden / Dourado (`golden.js`):** FSM com `PATROL`, `DASH`, `TELEPORT`, `MINION_BURST`, `MEGA_LASER` e `CATACLYSM`.
5. **Sussurro (`sussurro.js`):** FSM com `CLOAKED`, `GLITCH_VISIBLE`, `SUMMONING` e `RETREAT`.
6. **Fragata (`fragata.js`):** FSM com `SHIELD_PATROL`, `CORE_EXPOSED` e `BROADSIDE`.
7. **Verme, TimeEnemy, Detrito, Ímã, Réplica:** Integração aos controladores universais.
8. **Limpeza do Despachante Monolítico:** Redução de centenas de linhas de `if/else if` em `src/enemies/index.js` para um loop genérico delegando para `enemy.fsm.update(dt, ctx)`.

---

### 2.2 OVERHAUL DO DOURADO E ESQUADRÃO DE CAÇAS
*Referência: [`Docs/docs 2/overhaul-inimigo-dourado-e-esquadrao.md`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/Docs/docs%202/overhaul-inimigo-dourado-e-esquadrao.md)*

- **Mini-Naves Convertidas em Caças Reais:** As mini-naves invocadas deixam de ser meros projéteis teleguiados disfarçados de nave. Elas passam a ser **entidades de combate persistentes**, com HP próprio, abatíveis individualmente pelo jogador (concedendo pontuação e contagem de abate), com slots de formação geométrica ao redor do Dourado.
- **FSM Tática do Dourado:** O Dourado passa a agir como comandante de esquadrão, orquestrando avanços e intercalando dashes com disparos combinados.
- **Mecânica de Desorganização:** Quando o Dourado usa seu teleporte reativo a dano, **as mini-naves NÃO teleportam junto**. Elas entram no estado temporário de `DESORGANIZAÇÃO`, quebrando a formação e tendo que voar fisicamente até as novas coordenadas do líder, criando uma janela tática para o jogador eliminá-las.

---

### 2.3 MIRA DIRECIONAL POR MOVIMENTO (C/Z + DIRECIONAIS)
*Referência: [`Docs/docs 2/mira-direcional-por-movimento.md`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/Docs/docs%202/mira-direcional-por-movimento.md)*

- **Opção em Configurações:** Toggle novo no menu de configurações (default desativado).
- **Mecânica de Deslocamento:**
  - Segurar `C` + Direcional Direita: desloca a mira progressivamente para a direita.
  - Segurar `Z` + Direcional Esquerda: desloca a mira progressivamente para a esquerda.
  - `C/Z` + Cima/Baixo: desloca a mira verticalmente.
  - **Inversão de Input:** `C` + Esquerda ou `Z` + Direita realiza uma **recentralização rápida e suave** da mira, sem saltos bruscos.
- **Preservação de Trajetória:** A movimentação e física da nave permanecem inalteradas; apenas o retículo lógico e o vetor de lançamento dos canhões sofrem deflexão relativa.

---

### 2.4 EVOLUÇÃO DO RETÍCULO E EXPANSÃO DA MIRA CARREGADA
*Referência: [`Docs/# QoL — Documento de Melhorias.md`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/Docs/%23%20QoL%20%E2%80%94%20Documento%20de%20Melhorias.md) (Itens 2 e 12)*

- **Item 12 — Abertura Animada da Mira em Verde:**
  - A mira não deve sofrer saltos discretos ao acumular travas.
  - Durante o carregamento (`fireHeldMs`), o retículo expande linearmente de `1.0×` até `1.8×` em perfeita sincronia com a fração de carga, transicionando da cor base para um verde saturado brilhante (`#00ff88`) com glow forte no ápice da carga.
- **Item 2 — Marcadores de Lock-On Proporcionais ao Tamanho do Alvo:**
  - Escalonar o tamanho visual dos retículos quadrados e anéis multi-lock com base no `hitRadius` real projetado do alvo na tela, evitando que alvos gigantes como o Boss tenham marcadores que parecem flutuar no vazio fora do seu casco.

---

### 2.5 CUTSCENE DE VIDA PERDIDA (QUEDA + RESERVA)
*Referência: [`Docs/Cutscene de vida perdida — planejam.md`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/Docs/Cutscene%20de%20vida%20perdida%20%E2%80%94%20planejam.md)*

Substituir o `respawnBurst` instantâneo atual por uma sequência dramática de 2 cutscenes ao perder uma vida intermediária (quando o jogador ainda tem vidas restantes):
1. **Fase 1 — Queda (2000ms):** A nave avariada pega fogo, perde sustentação e cai girando descontroladamente em câmera lenta (`timeScale = 0.35`, FOV 70° → 45°), finalizando com flash vermelho no impacto.
2. **Transição (300ms):** Beat de tela preta absoluta sem HUD.
3. **Fase 2 — Reserva (1500ms):** A nova nave de substituição chega voando em altíssima velocidade (200 u/s) por trás da câmera, desacelera suavemente no ponto do trilho e assume a posição com i-frames piscantes de proteção.
- O jogador pode pular a animação após 500ms usando Espaço ou Botão A.

---

### 2.6 NOVO CHEFE: COLMEIA-MÃE
*Referência: [`Docs/Boss - Colmeia-Mãe.md`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/Docs/Boss%20-%20Colmeia-M%C3%A3e.md)*

- **Conceito:** Chefe de arena estacionário com estilo de combate defensivo e ritmado.
- **Mecânica Central:**
  - *Estado Shielded (Permanente):* Escudo 360° impenetrável que gira no centro da arena.
  - *Estado Spawning (Periódico a cada 8s):* A Colmeia emite ondas de 4 a 6 Mini-Swarms através de suas comportas iluminadas.
  - *Estado Vulnerable (Janela de 3.5s):* Logo após liberar o enxame, os escudos desativam-se temporariamente, expondo o núcleo ao fogo do jogador.

---

### 2.7 NOVO EVENTO: APAGÃO DE RADAR
*Referência: [`Docs/Evento - Apagão de Radar.md`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/Docs/Evento%20-%20Apag%C3%A3o%20de%20Radar.md)*

- **Conceito:** Evento temporário no modo trilho análogo à Tempestade de Detritos.
- **Efeito:** Desativa temporariamente o minimapa do HUD ou introduz estática/ruído visual (blips piscando com jitter e posições imprecisas).
- **Sinergia:** Ocorre concomitantemente a um pico de spawn do inimigo **Sussurro** (que possui camuflagem ativa), forçando o jogador a depender da visão direta e reflexos.

---

### 2.8 NOVOS OBSTÁCULOS PASSIVOS E AMBIENTAIS
*Referência: [`Docs/Obstaculos novos (selecionados).md`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/Docs/Obstaculos%20novos%20%28selecionados%29.md)*

Quatro novos obstáculos arquitetados como classes independentes em `src/enemies/`:
1. **Campo de Minas Estelares:** Esferas espaciais estáticas em grade que explodem em área caso sejam tocadas pela nave OU atingidas por tiros.
2. **Anel Rotativo:** Estrutura toroidal giratória cujo centro é seguro para travessia, mas a colisão com a borda causa dano à nave.
3. **Nuvem de Poeira Densa:** Obstáculo volumétrico não-letal que temporariamente reduz o campo de visão (fog local) e aplica atrito diminuindo a velocidade da nave.
4. **Barreira de Energia Setorial:** Painel de energia sem HP que pulsa ciclicamente entre estados sólido (dano por contato) e intangível (seguro para atravessar).

---

### 2.9 MELHORIAS DE QUALIDADE DE VIDA (QoL PENDENTES)
*Referência: [`Docs/# QoL — Documento de Melhorias.md`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/Docs/%23%20QoL%20%E2%80%94%20Documento%20de%20Melhorias.md)*

- **QoL #8 — Variedade de Blasters por Cor:** Diferenciação visual e de comportamento nos caças Blasters (Vermelhos: alta agressividade e velocidade; Verdes: esquivos com acrobacias de banking acentuadas; Azuis: padrão de patrulha).
- **QoL #9 — Correção de Preview de Aviso do Chefe:** Garantir que o modelo do Chefe Vermelho e do Dourado não sumam no preview holográfico durante o alerta cinemático de arena.
- **QoL #10 — Cores Dinâmicas de Nível (Background & Grid):** Transição suave de cor do fundo espacial e do grid do chão através de 9 tonalidades escuras exclusivas correspondentes aos níveis de dificuldade D1–D9.
- **QoL #11 — Perceptibilidade de Inimigos Raros:**
  - Substituir a cadeia cascata de `else if` no sorteio de spawn do `game-loop.js` por rolls independentes ponderados, permitindo que Verme, Réplica, Sussurro, Fragata e Ímã apareçam conforme suas probabilidades reais nominais.
  - *Verme:* Escala aumentada em 30%, cauda brilhante e aceleração furiosa dos elos restantes quando a cabeça for abatida.
  - *Réplica:* Redução do tempo de invisibilidade (de 2.2s para 1.5s) e inclusão de dash evasivo ao ser alvejada.
  - *Sussurro:* Invisibilidade completa de 2s durante a invocação de reforços.
  - *Fragata:* Manobra de investida frontal curta a cada 5s e abertura inicial acelerada de blindagem.
  - *Ímã:* Feixe de atração sutil conectando as esferas aos tiros desviados e reforço da atração (`IMA_FIELD_STRENGTH = 240`).

---

### 2.10 CATÁLOGO DE ÁUDIO E EFEITOS SONOROS FALTANTES
*Referência: [`SONS_TODO.md`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/SONS_TODO.md)*

- Atribuição confirmada dos 6 arquivos de áudio já presentes na pasta `sons/` que ainda não foram conectados por aguardarem direcionamento do usuário (`angry-birds-space-bomb-explosion-sound.mp3`, `explode_WHu7g6E.mp3`, `numbers-lore-explosion-sound-effect.mp3`, `rebel-blaster.mp3`, `s1_ca-online-audio-converter.mp3`, `shotgun-blasting-intimidator.mp3`).
- Efeitos finais para: quebra de asa de Blasters, loop contínuo de aviso de vida crítica, deflexão de projéteis e impacto de aríete.

---

### 2.11 MELHORIAS NO SISTEMA DE ESTUDO ANKI E DECKS
*Referência: [`BACKLOG.md`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/BACKLOG.md)*

- **Perguntas de Cenário:** Elaboração de cards com situações práticas contextualizadas em vez de definições literais isoladas.
- **Distratores por Tags de Confusão:** Reconhecimento da metatag `confunde:GRUPO` para gerar alternativas incorretas baseadas em conceitos frequentemente confundidos entre si.
- **Digitação Letra a Letra no Rádio:** Integração definitiva da animação de digitação do rádio após aprovação entre os protótipos de terminal limpo, varredura ou speedlines (`Docs/prototipo-radio-digitacao.html`).

---

# PARTE III — GUIA DE IMPLEMENTAÇÃO E CORREÇÃO PARA OUTRAS IAs

Este guia é a especificação técnica para qualquer Inteligência Artificial ou desenvolvedor encarregado de implementar código, corrigir bugs ou executar novos overhauls no **Star-Anki**.

---

### 3.1 REGRAS DE OURO E MANDAMENTOS DE INTEGRIDADE

1. **Testes Unitários São Inegociáveis:**
   Antes de considerar qualquer entrega finalizada, execute:
   ```bash
   node src/selftest.mjs
   ```
   Todos os testes devem passar (33/33 ou mais). Se qualquer teste falhar, a implementação está errada e deve ser corrigida imediatamente.
2. **Auditoria Estática Zero-Avisos:**
   Execute a ferramenta de auditoria completa:
   ```bash
   node tools/full-project-audit.mjs
   ```
   A contagem deve ser estritamente `AUDIT_SUMMARY errors=0 warnings=0`. Não introduza imports circulares, funções não declaradas nem arquivos soltos.
3. **Resiliência a Fuzzing de Estado:**
   Execute o teste adversarial:
   ```bash
   node tools/state-fuzz-audit.mjs
   ```
   Deve registrar `FUZZ_SUMMARY failures=0`. Esquemas de storage, inputs e dados persistidos devem ser à prova de falhas e corrupção.
4. **Preservação de APIs Públicas:**
   Nunca altere as assinaturas exportadas consumidas por `src/combat/index.js`, `src/combat/projectiles.js`, `src/combat/wingmen.js` e `src/game-loop.js` sem atualizar todos os seus respectivos consumidores e testes unitários.
5. **Nunca Confie Cegamente em Números de Documentos de Rascunho:**
   Documentos conceituais antigos na pasta `Docs/` podem conter discrepâncias com o código real em produção (exemplo: a transição do Boss é 1.2s no código real, enquanto rascunhos mencionavam 2.0s). **Sempre inspecione o código-fonte atual antes de definir constantes.**

---

### 3.2 ARMADILHAS CRÍTICAS DE THREE.JS NO PROJETO

O Star-Anki roda a 60 frames por segundo no navegador. Erros sutis de Three.js causam quedas catastróficas de performance e bugs espaciais bizarros:

1. **Mutação In-Place de Posição via `.project(camera)` (O Bug Mais Grave do Histórico):**
   - No Three.js, `vector.project(camera)` **muda as coordenadas do próprio vetor in-place** para coordenadas normalizadas NDC (`[-1, 1]`).
   - Se você passar `mesh.position` direto para uma função que chama `.project()`, a nave no mundo 3D será instantaneamente teletransportada para dentro da lente da câmera!
   - **SOLUÇÃO OBRIGATÓRIA:** Sempre clone o vetor antes de projetar:
     ```javascript
     // CORRETO:
     const screenPos = worldPos.clone().project(camera)
     ```
2. **Alocação de Vetores em Hot Loops (Zero-Allocation Rule):**
   - Métodos chamados todo frame ou em disparos (`update()`, `tryFireSupport`, `resolveHits`) **NUNCA** devem instanciar `new THREE.Vector3()` ou `new THREE.Matrix4()`. Isso sobrecarrega o Garbage Collector e causa micro-engasgos visuais (*stutter*).
   - **SOLUÇÃO OBRIGATÓRIA:** Declare vetores de scratch reutilizáveis no topo do arquivo fora das funções:
     ```javascript
     const _scratchVecA = new THREE.Vector3()
     const _scratchVecB = new THREE.Vector3()
     ```
3. **Divisão por Zero em Vetores Nulos:**
   - Nunca chame `.normalize()` em um vetor que pode ter magnitude zero (ex: duas entidades na mesma coordenada exata). O Three.js resultará em `(NaN, NaN, NaN)`, o que corromperá a matriz mundial e fará o objeto desaparecer da cena.
   - **SOLUÇÃO OBRIGATÓRIA:** Verifique o comprimento antes de normalizar:
     ```javascript
     if (diff.lengthSq() > 0.000001) {
       diff.normalize()
     } else {
       diff.copy(FORWARD_AXIS)
     }
     ```
4. **Descarte de Memória (`dispose`):**
   - Ao remover inimigos ou geometrias procedurais, sempre invoque `.dispose()` em geometrias e materiais, e libere texturas. Use o padrão estabelecido em `disposeTank()`, `disposeBlaster()`, etc.

---

### 3.3 PADRÃO DE ARQUITETURA DE MÓDULOS E GERENCIAMENTO DE ESTADO

1. **Estado Único Compartilhado por Referência (`state`):**
   Os fluxos do jogo (`flow-boss.js`, `flow-question.js`, `game-loop.js`) não devem ter estado isolado próprio. Todos recebem e manipulam o objeto central `state` criado em `mount-game.js`. Qualquer mutação em `state.phase` deve ser imediatamente reconhecível pelos demais sistemas.
2. **Padrão de Criação de Sistemas (Fábricas):**
   ```javascript
   export function createMySystem(deps) {
     const { state, combat, effects, audio } = deps

     function update(dt) {
       // Lógica do sistema
     }

     return {
       update,
       dispose: () => { /* cleanup */ }
     }
   }
   ```
3. **Máquina de Estados de Inimigos (`createStateMachine`):**
   Para novos inimigos, utilize a fábrica em `src/enemies/state-machine.js`. Defina estados com os ciclos formais:
   ```javascript
   const STATES = {
     ENGAGED: {
       onEnter(enemy, ctx, payload) { /* setup */ },
       update(enemy, dt, ctx) { /* frame */ },
       onExit(enemy, ctx) { /* cleanup */ }
     }
   }
   ```

---

### 3.4 COMO UTILIZAR O MOTOR DE VALIDAÇÃO EM TEMPO DE EXECUÇÃO (`aiValidator`)
*Referência: [`FLUXO_VALIDACAO_IA.md`](file:///C:/Users/zerke/.gemini/antigravity/scratch/Star-Anki/FLUXO_VALIDACAO_IA.md)*

O Star-Anki possui um motor de telemetria singleton em `src/ai-validator.js` que captura bugs emergentes durante sessões de gameplay real:

1. **`aiValidator.expect(descricao, avaliacaoFn, contexto)`:**
   - Registre expectativas de integridade sempre que calcular vida, escudos, dano, limites numéricos ou transições de FSM.
   - **Regra Crucial:** **NUNCA** chame `aiValidator.expect()` dentro de loops de 60fps (`update()`). Chame apenas em **eventos discretos** (disparo, hit sofrido, morte, troca de estado).
   - Exemplo:
     ```javascript
     aiValidator.expect(
       'Tank HP nunca ultrapassa o limite da dificuldade',
       () => tank.hp <= maxHpForLevel,
       { currentHp: tank.hp, maxHp: maxHpForLevel }
     )
     ```
2. **`aiValidator.logMechanic(nome, acao, snapshot)`:**
   - Registre passos de mecânicas complexas para alimentar o histórico de eventos circular (últimos 200 eventos), facilitando o diagnóstico de falhas pós-sessão.

---

### 3.5 PROTOCOLO OBRIGATÓRIO DE VALIDAÇÃO PRÉ-COMMIT

Toda IA que realizar modificações no repositório deve seguir a seguinte esteira de validação antes de dar a tarefa por encerrada:

1. **Checagem de Sintaxe JavaScript:**
   ```bash
   node --check src/seu-arquivo-modificado.js
   ```
2. **Execução de Testes Automatizados:**
   ```bash
   node src/selftest.mjs
   ```
3. **Auditoria Geral de Código e Diretórios:**
   ```bash
   node tools/full-project-audit.mjs
   ```
4. **Fuzzing de Estresse:**
   ```bash
   node tools/state-fuzz-audit.mjs
   ```
5. **Verificação de Whitespace e Diff:**
   ```bash
   git diff --check
   ```

Seguindo este protocolo rigorosamente, o Star-Anki manterá sua arquitetura limpa, escalável e imune a regressões em direção à versão v0.99.35 e lançamentos futuros.
