# CLAUDE.md — Contexto Operacional Completo do Star-Anki

> Este arquivo existe para que Claude/Claude Code consiga trabalhar no Star-Anki sem depender do histórico de chats do usuário.
> Leia este arquivo **antes de planejar, alterar código, escrever documentação, abrir PR ou afirmar que algo está funcionando**.
>
> **Regra central:** neste projeto, comportamento observado no runtime + instrução explícita mais recente do usuário vencem documentação antiga, nomes de funções, comentários e testes incompletos.

---

## 0. ORDEM DE AUTORIDADE — NÃO IGNORE

Quando houver conflito, use esta prioridade:

1. **Pedido explícito mais recente do usuário / aprovação visual mais recente.**
2. **Comportamento real do runtime e código atual em `src/`.**
3. **Testes que realmente exercitam o fluxo em questão.**
4. **Este `CLAUDE.md`.**
5. **`docs/design/` e ADRs canônicos.**
6. **`docs/progress/CURRENT.md` e specs ativas.**
7. **Documentos históricos/arquivados, comentários antigos e relatórios de agentes.**

Nunca altere gameplay só para fazer o código combinar com um relatório/documento antigo incorreto.

A ordem correta de fechamento é:

```text
REQUISITO DO USUÁRIO
→ CÓDIGO REAL
→ TESTES
→ RUNTIME
→ VALIDAÇÃO VISUAL quando aplicável
→ DOCUMENTAÇÃO
→ CI
```

Nunca use:

```text
DOCUMENTO ANTIGO
→ modificar o jogo para parecer que o documento estava certo
```

---

# 1. O QUE É O STAR-ANKI

Star-Anki é um rail shooter 3D de estudo inspirado na linguagem de jogos como Star Fox 64. O jogo transforma baralhos do Anki em perguntas integradas ao combate.

Características essenciais:

- desktop + navegador/HTML;
- Three.js;
- ES modules nativos;
- sem bundler no runtime principal;
- integração com baralhos/quiz;
- modo sobre trilhos e arenas All-Range;
- inimigos regulares, especiais, chefes e Anomalia Dourada;
- wingmen aliados;
- roguelike/draft de cartas;
- lock-on e disparo carregado;
- Swirl Blast;
- HUD arcade;
- áudio/VFX/cutscenes;
- debug e telemetria;
- grande quantidade de testes Node + fuzz + CI.

O objetivo não é apenas “funcionar”: gameplay, clareza visual, personalidade, impacto, feedback e legibilidade importam tanto quanto ausência de exceções.

---

# 2. FILOSOFIA DE DESENVOLVIMENTO DO USUÁRIO

## 2.1 Não implemente aproximações vagas

O usuário rejeita implementações que “tecnicamente existem” mas não produzem o comportamento pedido.

Exemplos:

- existir um estado chamado `PINCER` não significa que a pinça foi implementada se, visualmente, os caças não vierem de dois flancos reconhecíveis;
- existir uma constante de cooldown não significa que o rádio está resolvido se outro caminho contorna o cooldown;
- existir chance matemática de Tank/Verme spawnar não basta se eles não aparecem em sessões comuns;
- existir uma mesh emissiva não basta para um “laser enorme” se parece um sólido voando;
- existir um teste que verifica a classe CSS não basta para validar layout se a HUD se sobrepõe no navegador.

## 2.2 Antes de mudar código, audite o sistema inteiro

Para qualquer mudança relevante:

1. leia os arquivos diretamente envolvidos;
2. encontre todos os callers;
3. encontre todos os caminhos alternativos;
4. encontre testes existentes;
5. encontre documentação relacionada;
6. verifique código legado/paralelo que possa contradizer a nova lógica;
7. somente depois altere.

Não suponha que uma função seja autoridade só pelo nome.

## 2.3 Validação visual não pode ser inventada

Se algo é visual, a análise estática não prova qualidade visual.

Ao relatar:

- `TESTADO AUTOMATICAMENTE: SIM/NÃO`
- `VALIDADO EM RUNTIME: SIM/NÃO`
- `VALIDADO VISUALMENTE: SIM/NÃO`

Se não foi possível ver o resultado real, escrever exatamente:

`VALIDADO VISUALMENTE: NÃO — NÃO FOI POSSÍVEL VALIDAR VISUALMENTE.`

Nunca afirmar “fica bonito”, “está perceptível”, “parece laser”, “layout aprovado” ou equivalente sem evidência visual real ou aprovação explícita do usuário.

---

# 3. MAPA DA ARQUITETURA

## Core

- `src/main.js` — bootstrap externo.
- `src/mount-game.js` — monta cena, sistemas, partida e teardown.
- `src/game-loop.js` — tick principal, orquestra input → mundo → combate → HUD → render.
- `src/rail.js` — trilho, nave/câmera, All-Range.
- `src/player.js` — vida, escudo, boost, upgrades e estado da nave.
- `src/effects.js` — VFX.
- `src/environment.js` / `src/environment-config.js` — starfield, fog, ambiente.
- `src/cutscenes.js` — sequências de câmera/cutscene.

## Combate

- `src/combat/index.js` — orquestra combate.
- `src/combat/projectiles.js` — projéteis do jogador.
- `src/combat/lockon.js` — autoridade do lock-on.
- `src/combat/wingmen.js` — wingmen, IA, abilities, rádio, projéteis aliados.
- `src/combat/wingman-radio.js` — scheduler/linhas do rádio.
- demais módulos em `src/combat/` — telemetria, reatividade, validação etc.

## Inimigos

- `src/enemies/index.js` — lifecycle e integração.
- `src/enemies/blaster.js`
- `src/enemies/tank.js`
- `src/enemies/miniSwarm.js`
- `src/enemies/timeEnemy.js`
- `src/enemies/sentinela.js`
- `src/enemies/detrito.js`
- `src/enemies/boss.js`
- `src/enemies/golden.js`
- `src/enemies/golden-squadron.js`
- `src/enemies/fragata.js`
- `src/enemies/verme.js`
- `src/enemies/ima.js`
- `src/enemies/sussurro.js`
- `src/enemies/replica.js`
- `src/enemies/state-machine.js`

## Quiz / Anki / Progressão

- `src/anki.js`
- `src/quiz.js`
- `src/decks.js`
- `src/flow-question.js`
- `src/flow-boss.js`
- `src/flow-progression.js`
- `src/roguelike.js`

## HUD

- `src/hud.js` — fachada.
- `src/hud-game.js` — HUD de gameplay.
- `src/hud-styles.js` — estilos do HUD.
- demais `src/hud-*.js` — telas e componentes.

## Input / Config / Áudio / Debug

- `src/input.js`
- `src/keybindings.js`
- `src/settings.js`
- `src/audio.js`
- `src/audio-cues.js`
- `src/debug.js`
- `src/debug-actions.js`
- `src/ai-validator.js`

---

# 4. DOCUMENTAÇÃO CANÔNICA

A documentação ativa mora em `docs/`.

Consultar primeiro:

- `docs/README.md` — mapa mestre;
- `docs/progress/CURRENT.md` — estado operacional recente;
- `docs/planning/BACKLOG.md` — backlog central;
- `docs/design/` — comportamento as-built;
- `docs/specs/` — specs;
- `docs/decisions/` — ADRs;
- `docs/project/validation.md` — processo de validação.

A árvore `Docs/` maiúscula é legado. **Não criar nova documentação canônica lá.**

Atenção: arquivos de progresso podem conter descrições de versões anteriores que ficaram obsoletas depois de commits mais recentes. Se divergirem do código, audite o código e corrija a documentação; não reverta o código automaticamente.

---

# 5. GIT, BRANCHES E MERGE

Fluxo padrão:

1. confirmar `git status`;
2. confirmar branch e HEAD;
3. atualizar referência remota sem destruir trabalho local;
4. criar branch dedicada;
5. implementar;
6. testar;
7. revisar diff;
8. push;
9. abrir PR;
10. CI;
11. revisão humana;
12. merge somente com autorização explícita.

Regras:

- nunca force-push;
- não sobrescrever trabalho local desconhecido;
- não esconder falhas de CI;
- não declarar “pronto para merge” se o head testado não for o head real da PR;
- depois de qualquer commit corretivo, CI antigo não vale como evidência do novo head;
- por padrão não auto-mergear PRs;
- se o usuário **explicitamente mandar mergear**, a autorização humana já existe para aquela ação: revalidar head/mergeability e executar.

---

# 6. TESTES E CI

Workflow principal: `.github/workflows/ci.yml`.

A CI atualmente inclui, entre outros:

```bash
node src/forgot-stage2.test.mjs
node src/forgot-stage3.test.mjs
node src/forgot-stage4.test.mjs
node src/enemy-supercheck.test.mjs
node src/lockon-priority.test.mjs
node src/combat-lockon-swirl.test.mjs
node src/tank.test.mjs
node src/tank-spawn-integration.test.mjs
node src/golden-squadron.test.mjs
node src/wingman-bughunt.test.mjs
node src/wingman-navigation.test.mjs
node src/wingman-global-radio.test.mjs
node src/miyu-assist-locks.test.mjs
node src/wingman-radio-overhaul.test.mjs
node src/wingman-radio-callresponse.test.mjs
node src/arcade-draft-bullet-time.test.mjs
node src/playtest-polish.test.mjs
node src/lockon-miyu-reticle-fog.test.mjs
node src/selftest.mjs
node tools/state-fuzz-audit.mjs
node tools/wingman-runtime-fuzz-audit.mjs
node tools/golden-squadron-runtime-fuzz.mjs
node tools/docs-link-audit.mjs
node tools/full-project-audit.mjs
git diff --check
```

Ao tocar uma feature, rodar primeiro a suíte específica, depois regressões relacionadas e por fim selftest/audits.

**Não use “CI verde” como substituto de playtest visual.**

---

# 7. `aiValidator` É PARTE DO CONTRATO

Mudanças de mecânica importante devem instrumentar invariantes com `aiValidator.expect(...)` quando isso realmente ajuda a provar estado/runtime.

Use para validar coisas como:

- nenhuma referência fantasma;
- cap respeitado;
- nenhuma posição NaN/Inf;
- transição aceita/rejeitada corretamente;
- cooldown não violado;
- ordem tática executada;
- hit único por janela;
- estado visual/mecânico sincronizado quando mensurável.

Não abuse do validator para “provar estética”.

---

# 8. ESTADO ATUAL DE REFERÊNCIA

Baseline integrada antes deste arquivo:

- branch principal: `main`;
- pacote das Fases 0–5 + HUD Opção 4 já foi integrado via PR #20;
- hotfix `THREE is not defined` de `setReticleCharge()` já foi corrigido antes disso.

**Importante:** várias features tecnicamente implementadas ainda dependem de avaliação visual do usuário. Não trate “mergeado” como sinônimo de “aceito visualmente”.

---

# 9. HUD — DIREÇÃO VISUAL APROVADA

## 9.1 Layout escolhido: Opção 4 — Coluna Esquerda Clássica

A direção aprovada pelo usuário é uma composição vertical no canto esquerdo.

Ordem obrigatória:

```text
SCORE
STREAK / KILLS
COMBO

RECURSOS / ÍCONES ROGUELIKE / INDICADORES SUPERIORES

FOCO / SWIRL / CADEIA

VIDAS
ESCUDO
VIDA
```

Regra crítica:

**VIDAS / ESCUDO / VIDA ficam ABAIXO de todos os demais blocos da esquerda.**

Nunca:

- ao lado do Score;
- na mesma faixa Y do Score;
- em uma coluna paralela competindo com estatísticas;
- entre Score e recursos;
- entre recursos e FOCO/SWIRL/CADEIA.

## 9.2 Centro da tela

O centro da tela deve permanecer livre para gameplay.

Elementos persistentes proibidos no centro/topo central:

- Score;
- Combo;
- FOCO;
- SWIRL;
- Cadeia;
- vitais;
- ícones roguelike;
- timer.

Elementos contextuais permitidos:

- retícula;
- locks;
- avisos temporários;
- elementos world-space de combate;
- cutscenes.

## 9.3 Timer

Durante gameplay deve existir **um único display numérico principal de tempo**, no topo direito.

O mesmo componente pode mudar de semântica conforme estado:

- combate/ciclo;
- warning;
- chefe;
- Dourado.

Não reintroduzir countdown numérico central simultâneo.

## 9.4 Nível

Nível fica no topo direito, abaixo/associado ao timer.

## 9.5 Ícones roguelike — NÃO considerar layout final

Os ícones do roguelike/recursos ainda precisam de overhaul visual futuro.

O usuário explicitamente decidiu tratar isso em outro ciclo.

Ao desenhar novos protótipos para esses ícones:

- considerar posição real de **todos** os outros blocos da HUD;
- não ocupar a mesma região de Stats, FOCO/SWIRL/CADEIA, vitais, timer/nível, rádio ou centro útil;
- validar `getBoundingClientRect()` e screenshots em múltiplas resoluções;
- não resolver colocando tudo no centro;
- não projetar o elemento isoladamente sem o restante da HUD.

---

# 10. RÁDIO DOS WINGMEN — DIREÇÃO AUTORITATIVA ATUAL

Esta seção é especialmente importante porque implementações anteriores interpretaram o pedido errado.

## 10.1 Rádio serve SOMENTE para chatter/trivial

Rádio pode conter:

- comentários de personalidade;
- reação rara a contexto;
- retorno de formação;
- aviso situacional;
- fala curta de combate;
- call & response disciplinado, se respeitar orçamento.

Rádio **não pode ser usado para anunciar ativação de habilidade**.

Proibido:

- `ability_ram` aparecendo como painel de rádio;
- `ability_guard` no rádio;
- `ability_repair` no rádio;
- `ability_assist` no rádio;
- qualquer “ability quote” que abra retrato/painel;
- Focus contornar o scheduler e enfileirar várias confirmações consecutivas.

Se uma habilidade ativou:

```text
Ícone brilhante sobre a nave do aliado = SIM
Painel de rádio = NÃO
Texto de rádio = NÃO
Retrato = NÃO
```

## 10.2 Cooldown global de fala é autoridade única

Objetivo mínimo:

**no máximo uma transmissão trivial do esquadrão a cada 6 segundos.**

Deve existir um único dispatcher/gate autoritativo.

Nenhum caminho pode fazer:

```js
getLine(...)
pendingRadioMessages.push(...)
```

para contornar o scheduler global.

Urgência pode alterar seleção/prioridade, mas não pode reconstruir spam permanente sem decisão explícita do usuário.

Call & Response e resposta de comando devem respeitar o orçamento global e não gerar “rajada de quatro pilotos”.

## 10.3 Posição do rádio — CORREÇÃO IMPORTANTE

**Não ancorar o painel na posição 3D da nave do jogador.**

Implementação anterior projetou `playerPos + offset` para screen-space e literalmente fez o rádio seguir a nave. O usuário rejeitou isso.

A direção correta é estilo Star Fox:

- painel **screen-space**;
- região **inferior-central da HUD**;
- posição estável;
- não segue a Arwing/nave;
- não ocupa o centro de mira;
- respeita safe margins e demais HUDs;
- portrait + nome + texto continuam válidos para chatter trivial.

A interpretação “embaixo da nave” NÃO é mais válida.

---

# 11. FEEDBACK DE HABILIDADES DOS WINGMEN

Quando um wingman ativa uma ability:

- não abre rádio;
- aparece **somente um ícone brilhante acima da nave desse wingman**;
- ícone acompanha a nave;
- halo/pulso curto;
- duração curta (~1,5s é referência existente);
- some por fade;
- se a nave sair da câmera, não teleportar o ícone para a borda;
- não repetir continuamente enquanto a mesma ability continua ativa.

O trigger deve ser por **transição de estado** (inactive → active), não por frame nem por cada projétil.

Se um método como `fireMiyuAssistShots()` dispara várias vezes durante a mesma janela, isso não deve recriar o aviso a cada salva.

---

# 12. MIYU — CARGA COMPARTILHADA

A assistência da Miyu só pode iniciar quando há intenção real de mira/lock.

Condições esperadas:

- Miyu ativa e viva;
- ability pronta;
- jogador carregando;
- tempo mínimo de carga atingido;
- **pelo menos um alvo elegível realmente travado / dentro da autoridade atual do lock-on**.

Não criar um segundo cone de mira só para Miyu.

Se jogador segura carga olhando para espaço vazio:

- não ativa;
- não consome cooldown;
- não mostra ícone;
- não fala no rádio.

Os projéteis assistidos devem nascer fisicamente da nave da Miyu.

---

# 13. LOCK-ON — VALORES E AUTORIDADE

Valores reais que foram deliberadamente mantidos conservadores:

- hint: ~7°;
- acquire: ~7,5°;
- maintain: ~12°;
- alcance máximo: ~90u;
- alcance mínimo: ~10u.

Não substituir por valores históricos incorretos como 16°/23°/380u só porque algum relatório antigo menciona isso.

Prioridade de alvo só vale **entre alvos elegíveis** pela autoridade de mira.

Snapshots devem preservar âncora world-space e metadados; screen-space pertence ao HUD/render.

---

# 14. SWIRL BLAST

Direção geral:

- projétil/efeito deve permanecer violento e rápido mesmo durante slow-motion do mundo;
- hitbox física swept/volumétrica;
- pode perfurar alvos subordinados/obstáculos conforme regra atual;
- impacto em boss/dourado deve ser distinto;
- não depender de spam arbitrário de partículas.

## 14.1 Câmera do Swirl

A coreografia **já está integrada no runtime**. Não trate como protótipo pendente.

Modelo atual inclui:

- antecipação;
- compressão de FOV;
- release;
- roll curto;
- punch de câmera;
- retorno exato ao FOV base.

Arquivos principais:

- `src/swirl-camera-model.js`
- `src/game-loop.js`

Ao mexer no Swirl, não remover/regredir silenciosamente essa coreografia.

---

# 15. ARCADE DRAFT / CARD CHOICE

Modos existentes:

- `pause`;
- `slowmo`;
- `normal`.

No modo `slowmo`:

- desaceleração é apenas uma janela curta de leitura (~1,5s);
- depois o mundo retorna a 1.0x mesmo se draft continuar aberto;
- gameplay continua ativo conforme design do modo;
- tempo scale real historicamente usado na implementação atual é `0.18`, não `0.05` de relatórios antigos.

Evitar fila ilimitada de rewards/drafts pendentes.

---

# 16. FOG

O usuário rejeitou fog que fosse apenas invisível ou um overlay cinza chapado.

Direção correta:

- bancos/volumes localizados visíveis;
- estrelas próximas/intermediárias mudam perceptivelmente ao atravessar fog;
- inimigos emergem visualmente da massa;
- interação com profundidade/mundo 3D;
- evitar overlay 2D uniforme como efeito principal.

Critério visual mínimo:

1. banco de fog perceptível mesmo sem inimigo;
2. estrelas mudam através dele;
3. inimigo aparece emergindo da massa.

Não afirmar isso como validado sem playtest visual.

---

# 17. DOURADO — COMANDANTE E ESQUADRÃO

Fantasia central:

**Dourado = comandante agressivo de um esquadrão de caças persistentes.**

Não transformar os caças em “mísseis que vivem mais”.

## 17.1 Caças

Eles devem ter:

- entidade própria;
- posição;
- slot;
- HP;
- hit detection;
- morte;
- kill/reward normal;
- estado;
- ataque;
- retorno/reagrupamento;
- reposição;
- cleanup.

## 17.2 Quantidade

Base por dificuldade:

```text
lvl 1..9 = 2 / 2 / 3 / 3 / 4 / 4 / 5 / 5 / 6
```

Regra adicional atual:

**+1 caça para cada aliado presente quando o encontro começa.**

Máximo técnico atual: 10.

Existem 10 slots de formação distintos em `golden-squadron.js`; não voltar a `% 6` ou empilhar slots.

## 17.3 Cap ofensivo

Base:

```text
1 / 1 / 2 / 2 / 2 / 2 / 3 / 3 / 3
```

Com aliados:

```text
base + ceil(allyBonus / 2)
```

limitado naturalmente pelo número de caças vivos.

## 17.4 Ordens

- Strafing Run;
- Pincer;
- Laser Siege / flank durante telegraph;
- Coordinated Fire.

Devem ser reconhecíveis visualmente.

Coordinated Fire:

```text
fighter → fighter → Golden → fighter ...
```

sem todos dispararem no mesmo frame.

Teleporte:

- comandante teleporta;
- caças NÃO teleportam;
- entram em desorganização;
- viajam fisicamente até ele.

Reposição:

- gradual;
- uma nave por ciclo;
- aproximadamente 15s lvl1 → 8s lvl9;
- feedback de launch;
- sem reconstruir esquadrão inteiro instantaneamente.

---

# 18. MEGA LASER DO DOURADO

O usuário pediu explicitamente um **laser enorme**, não um cone/projétil sólido.

A implementação atual foi migrada para beam sustentado.

Requisitos que não devem regredir:

- telegraph longo (~2,5s);
- feixe sustentado (~0,6s é a implementação atual);
- origem presa ao Dourado;
- núcleo branco/dourado;
- envelope luminoso amplo;
- comprimento grande;
- colisão por segmento/cápsula ao longo do feixe;
- no máximo um hit indevido por frame/janela;
- não existe “ponta de cone” viajando como míssil.

Usar Mesh/BufferGeometry/Cylinder/Shader internamente é aceitável. O requisito é o **resultado** parecer beam de energia, não sólido voador.

---

# 19. TANK

Direção exigida e atualmente codificada:

- ~60% maior que a versão antiga;
- hitbox aumentada junto;
- `TANK_HIT_RADIUS` de referência atual: `4.48`;
- nova geometria/silhueta, não apenas modelo antigo escalado;
- unidade pesada legível;
- torre/canhão claros;
- mais deslocamento pela tela;
- sweep lateral amplo;
- movimento vertical menor;
- torre pode acompanhar jogador independentemente.

Se o usuário reprovar o visual, faça novo design visual; não alegue que números corretos garantem aprovação estética.

---

# 20. VERME

Não pode voltar a ser uma fileira de esferas.

Direção atual:

- organismo/construct segmentado;
- cabeça distinta;
- mandíbula/carapace;
- segmentos articulados;
- juntas/placas;
- cauda distinta;
- elos destrutíveis;
- seccionamento da cadeia;
- **span/largura inicial de 8.0 unidades**;
- movimento em arco;
- yaw/pitch seguindo tangente;
- roll em curvas;
- seguidores usam histórico/spline do caminho em vez de perseguir linearmente o elo anterior.

Após seccionamento, nenhuma referência fantasma/NaN/snap absurdo.

---

# 21. SUSSURRO

Fantasia: inimigo stealth perceptível e relevante, não invisível até receber lock.

Direção atual:

```text
CLOAKED_APPROACH
→ REVEAL_TELEGRAPH
→ ATTACK ou SUMMON
→ EVADE
→ CLOAKED_APPROACH
```

Precisa ter:

- silhueta própria;
- núcleo;
- halo/rim/distortion;
- cloak difícil de ler, mas não praticamente invisível;
- aproximação em arco;
- telegraph legível;
- ataque próprio;
- summon com cooldown e feedback;
- evade.

Se visualmente continuar irrelevante, aumentar legibilidade/contraste/tamanho com playtest — não apenas trocar uma constante de opacity sem avaliar.

---

# 22. RÉPLICA

Não pode ser apenas “segue o jogador”.

Identidade:

- cópia corrompida da nave;
- movimento lateral atrasado;
- fuselagem/asa/motores/canhões reconhecíveis;
- glitch/echo visual;
- comportamento ofensivo.

Ataque esperado atualmente:

- telegraph curto (~0,35s);
- rajada de 3 tiros;
- stagger ~0,12s;
- cooldown ~2,2–3,2s;
- mira preditiva sobre jogador.

Nunca voltar a `fireTimer: Infinity`.

---

# 23. SPAWN DE TANK E VERME

Eles devem ser encontrados nos níveis iniciais; “chance > 0” não é suficiente.

Existe lógica de pity/garantia introduzida para impedir sessões onde nunca aparecem.

Ao alterar spawn:

- verificar chance nominal;
- verificar chance efetiva dentro da cadeia condicional;
- verificar room/population budget;
- verificar caps;
- verificar pity;
- testar nível 1 com sessão suficientemente longa;
- não afirmar “aparece” só porque `Math.random()` pode teoricamente cair no ramo.

---

# 24. DIFICULDADE E DEBUG

Faixa de dificuldade efetiva: 1–9.

O debug deve permitir subir/descer nível sem falsificar score ou respostas erradas.

Princípios:

- override explícito;
- clamp 1..9;
- mesmo provider de dificuldade usado pelos inimigos;
- HUD reflete nível efetivo;
- novos spawns usam nível efetivo;
- não criar segundo sistema paralelo de dificuldade.

---

# 25. WINGMEN — MOVIMENTO E COMBATE

Wingmen são entidades físicas do mundo.

Preservar:

- formação;
- steering;
- separação/deconflição;
- sem teleportes arbitrários para corrigir pathing;
- sem NaN/Inf;
- recovery de stall por velocidade/steering, não teleporte;
- dogfight com duração/cooldown;
- projéteis nascem na nave correta;
- abilities não devem cancelar estados de forma incoerente sem FSM/controller.

Quando tocar IA de wingmen, rodar o fuzz específico.

---

# 26. RÁDIO ≠ ABILITY UI

Esta separação deve ser preservada em toda refatoração:

```text
RADIO
= chatter/personality/contexto textual raro
= painel inferior central fixo

ABILITY FEEDBACK
= ícone acima da nave do aliado
= world/screen projected
= sem texto de rádio
```

Não unificar os dois sistemas por “conveniência”.

---

# 27. HUD — REGRAS DE NÃO-SOBREPOSIÇÃO

Qualquer protótipo/overhaul deve considerar a HUD inteira, não um widget isolado.

Zonas ocupadas/reservadas:

## Superior esquerdo

- Score;
- Streak;
- Kills;
- Combo;
- recursos/ícones roguelike;
- FOCO/SWIRL/CADEIA;
- abaixo disso, vitais.

## Superior direito

- timer;
- estado;
- nível.

## Centro

- gameplay;
- retícula;
- locks;
- alvos;
- espaço de leitura.

## Inferior central

- rádio/trivial quando aparece;
- mensagens contextuais compatíveis.

## Sobre wingmen

- ability icons temporários.

Testar com `getBoundingClientRect()` e resoluções pelo menos:

- 1280×720;
- 1366×768;
- 1920×1080.

Critérios:

- nenhum overlap;
- nenhum corte;
- centro não invadido;
- resize não quebra;
- todos os estados preenchidos também funcionam.

---

# 28. PERFORMANCE / THREE.JS

Evitar:

- criar geometrias/materials por frame;
- `clone()`/`new Vector3()` em hot loops sem necessidade;
- arrays descartáveis gigantes por tick;
- leak de Mesh/Material/Geometry;
- não remover objetos do scene graph no cleanup;
- partículas permanentes para comunicar estados que um VFX curto resolveria.

Preferir:

- geometrias/materials compartilhados;
- temporários de módulo;
- pooling quando aplicável;
- dispose explícito;
- VFX com significado.

---

# 29. ÁUDIO

- áudio deve reforçar eventos claros;
- não tocar cue repetidamente por frame;
- loops precisam de start/stop determinísticos;
- ability icon visual não implica obrigatoriamente fala de rádio;
- não misturar “radio voice” com toda ação mecânica.

Consultar `src/audio-cues.js` e backlog de áudio antes de inventar cue nova.

---

# 30. QUIZ / ANKI

O jogo é uma ferramenta de estudo, não apenas shooter.

Ao mexer em quiz:

- preservar integridade dos cards;
- não inventar conteúdo de respostas;
- distinguir deck real vs no-deck/arcade;
- preservar fluxo de pergunta/feedback;
- regressões de combate não podem corromper estado de estudo;
- mudanças grandes devem considerar `flow-question.js`, `quiz.js`, `anki.js`, `decks.js` e HUD correspondente.

Pendências específicas: consultar `docs/planning/question-system-backlog.md`.

---

# 31. INIMIGOS NOVOS / RECONFIGURAÇÃO

Antes de criar ou reconfigurar uma classe de inimigo, consultar:

`docs/templates/enemy-spec-template.md`

Cobrir explicitamente:

- estados;
- movimento;
- ataque;
- telegraph;
- reação a tiro normal;
- reação a homing/carregado;
- Swirl;
- ram;
- repulsão/boost;
- spawn;
- despawn;
- arena vs rail;
- fog;
- lock-on;
- minimap;
- score/kill pipeline;
- dificuldade;
- áudio;
- VFX;
- cleanup;
- testes.

Não assumir automaticamente comportamento “razoável”.

---

# 32. BACKLOG FUTURO

O backlog canônico é `docs/planning/BACKLOG.md`.

Exemplos de itens ainda listados como futuros incluem specs como:

- Mira Direcional por Movimento;
- Cutscene de Vida Perdida;
- Boss Colmeia-Mãe;
- novos obstáculos;
- etapas futuras da FSM universal;
- melhorias de áudio;
- melhorias do sistema de perguntas.

Antes de iniciar um desses itens, abrir a spec correspondente e confirmar com o usuário se ela continua atual.

---

# 33. CONTEÚDO DE TERCEIROS / LICENÇA

O código do projeto está sob MIT, mas isso não significa automaticamente que sprites/arte de terceiros estejam relicenciados.

Consultar:

- `LICENSE`
- `THIRD_PARTY_NOTICES.md`

Não remover atribuições de assets/portraits históricos sem verificar origem.

---

# 34. PROBLEMAS CONHECIDOS QUE NÃO DEVEM SER “ESQUECIDOS”

## 34.1 Rádio ainda precisa de correção arquitetural final

Mesmo após o pacote integrado, o usuário relatou spam e ability radio ainda aparecendo.

Auditoria recente encontrou caminhos como resposta de FOCO que podem buscar linha diretamente e enfileirar mensagens fora do gate normal.

Portanto:

- não presumir que `wingman-radio.js` estar correto significa sistema inteiro correto;
- procurar bypass em `wingmen.js` e HUD;
- consolidar emissão num dispatcher único;
- ability nunca deve virar rádio;
- rádio deve mudar para região inferior-central fixa.

## 34.2 Ability icon existe, mas não basta se o rádio também aparece

Critério de aceite:

**quando ability ativa, aparece apenas o ícone sobre o aliado.**

Se rádio abrir junto, falhou.

## 34.3 Ícones roguelike atuais não são visual final

Não investir em microajuste definitivo do posicionamento antes do overhaul visual solicitado pelo usuário, salvo correção de overlap crítico.

Qualquer futuro protótipo deve nascer já consciente das demais zonas da HUD.

## 34.4 Visual de inimigos pode estar tecnicamente implementado sem estar aprovado

Tank, Verme, Sussurro, Réplica e beam do Dourado têm implementações novas no código, porém qualquer reprovação visual posterior do usuário é autoritativa.

---

# 35. COMO RESPONDER A RELATÓRIOS DE OUTRO AGENTE

Relatório do Antigravity, Claude ou outro agente é **alegação**, não prova.

Ao receber relatório:

1. verificar branch e SHA real;
2. verificar diff remoto;
3. verificar arquivos alterados;
4. conferir valores críticos diretamente no código;
5. conferir CI do SHA exato;
6. se houver afirmação visual, exigir screenshot/video/runtime real;
7. apontar divergências entre relatório e código.

Não ajustar gameplay para combinar com um relatório errado.

---

# 36. PROTOCOLO DE TRABALHO PARA CLAUDE

Antes de qualquer tarefa substancial, responda internamente a estas perguntas:

1. Qual é o pedido exato?
2. Qual arquivo é a autoridade atual?
3. Quais callers podem contornar minha mudança?
4. Há sistema legado paralelo?
5. Qual teste existente cobre isso?
6. Preciso de teste novo?
7. Isso é visual?
8. Se for visual, como vou validar em runtime?
9. Há risco de regressão em quiz, wingmen, lock-on, spawn ou HUD?
10. Qual documentação canônica precisa ser atualizada depois?

Depois da mudança:

1. revisar diff;
2. buscar referências antigas do comportamento removido;
3. rodar testes específicos;
4. rodar regressões;
5. rodar selftest/audits;
6. playtest visual quando aplicável;
7. atualizar docs;
8. abrir PR;
9. validar CI do head final.

---

# 37. REGRA DE RELATO

Nunca use formulações genéricas como:

- “deve estar funcionando”;
- “provavelmente resolvido”;
- “visualmente correto” sem ver;
- “100% validado” só por teste Node.

Prefira:

```text
IMPLEMENTADO NO CÓDIGO: SIM
TESTE AUTOMATIZADO: SIM
RUNTIME NO NAVEGADOR: SIM/NÃO
VALIDAÇÃO VISUAL: SIM/NÃO
CI DO HEAD EXATO: SIM/NÃO
PENDÊNCIAS: ...
```

---

# 38. RESUMO DAS DECISÕES QUE NÃO DEVEM REGREDIR

- HUD: Opção 4, coluna esquerda clássica.
- Vitais: abaixo de Stats + recursos + FOCO/SWIRL/CADEIA.
- Centro: livre de HUD persistente.
- Timer: um único display visível no topo direito.
- Rádio: chatter trivial apenas.
- Rádio: painel fixo inferior-central, **não preso à nave**.
- Rádio: gate global mínimo de 6s e sem bypass.
- Ability de wingman: apenas ícone brilhante acima da nave, sem rádio.
- Miyu assist: só inicia com carga + lock/alvo válido.
- Swirl camera: já é runtime e não deve ser removida.
- Lock-on: ~7° / 7,5° / 12° / 90u, não valores históricos errados.
- Arcade slowmo: janela curta e volta a 1.0x; escala atual de referência 0.18.
- Fog: bancos volumétricos perceptíveis, não overlay cinza.
- Golden: comandante + caças persistentes.
- Golden: +1 fighter por aliado, máximo 10.
- Golden: caças não teleportam junto do comandante.
- Golden laser: beam sustentado enorme, não cone voador.
- Tank: ~60% maior + hitbox correspondente + mobilidade + geometria nova.
- Verme: span 8u + visual segmentado + arco/rotação + path history.
- Sussurro: stealth perceptível + telegraph + ataque + summon + evade.
- Réplica: cópia corrompida ofensiva com rajada, não follower passivo.
- Tank/Verme: devem aparecer já em níveis iniciais; pity/garantia deve ser preservada.
- Debug de dificuldade: override 1–9 sem falsificar score/erros.
- Não fazer afirmação visual sem ver o runtime.
- Não fazer merge automaticamente sem autorização explícita do usuário.

---

# 39. PRIMEIRA AÇÃO DE QUALQUER NOVA SESSÃO CLAUDE

Antes de começar trabalho:

```bash
git status
git branch --show-current
git rev-parse HEAD
```

Depois ler:

1. `CLAUDE.md`;
2. `docs/progress/CURRENT.md`;
3. `docs/planning/BACKLOG.md` se a tarefa for nova;
4. spec/design diretamente relacionado;
5. código real relacionado.

Se `CURRENT.md` e código divergirem, **não adivinhe**: audite, documente a divergência e use código + pedido atual como autoridade.

---

# 40. OBJETIVO FINAL

Claude deve otimizar para **comportamento real correto no jogo**, não para aparência de conclusão.

Um requisito só está realmente fechado quando:

- foi implementado no caminho autoritativo;
- não existe bypass contraditório;
- testes relevantes passam;
- runtime não quebra;
- visual foi verificado quando necessário;
- documentação foi sincronizada;
- CI corresponde ao head final.

Se uma dessas camadas faltar, diga claramente que está pendente.
