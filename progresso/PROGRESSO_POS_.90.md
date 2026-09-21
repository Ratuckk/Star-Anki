# Progresso pós-v0.90 — novas documentações a partir daqui

Continuação do [PROGRESSO_POS_.80.md](PROGRESSO_POS_.80.md) (histórico v0.84.0 → v0.89.0, agora
congelado). A partir desta entrega, toda documentação nova entra neste arquivo.

---

## Backlog Pendente (herdado da v0.89.0)

Itens discutidos e aprovados pelo usuário mas ainda **não implementados**. Servem de referência
para futuras entregas neste arquivo. O detalhamento completo está em [BACKLOG.md](BACKLOG.md).

### P2 — Médio valor
- [ ] **Perguntas de cenário** — testar aplicação prática, não só definição.

### P3 — Especulativo / requer decisão
- [ ] **Bônus de pontos por abrir explicação em erros**.
- [ ] **Distratores por tag de confusão** — forçar discriminação entre conceitos comumente trocados.

Também pendentes, herdados do Overhaul 4 (fog) e do Overhaul de spawn/despawn (ver
`Docs/Overhaul 4 — Fog como mecânica de g.md` e `Docs/Overhaul do sistema de spawn e desp.md`),
sem prioridade definida — ficam só de referência:
- [ ] Redução de 60% na explosão de morte da Horda em fog denso (pilar 3 do Overhaul 4) —
  pulado por exigir checar 3+ pontos de código por um ganho visual pequeno.
- [ ] Fog reagindo ao nível de dificuldade (§4.5 do Overhaul 4) — bônus opcional.
- [ ] Ideia 4 do overhaul de spawn — orientação de aproximação (rotação convergindo no spawn) —
  pulado porque a maioria dos inimigos recalcula orientação por `lookAt` logo depois do bloco de
  spawn no mesmo frame, sobrescrevendo o slerp; precisaria de auditoria caso a caso por tipo.

Herdado também do `Docs/# Documento de Implementação — Nova.md` (rádio dos aliados + cartas por
personagem — ver entregas v0.95.0/v0.96.0 abaixo, primeiras deste documento):
- [ ] Texto das ~54 falas triviais novas por piloto (30/piloto no total, 5 já cobertas por
  ability) — o usuário pediu pra EU escrever, direto em inglês no tom de cada personagem (ver
  v0.96.0). Falco já ganhou as dele; Peppy/Slippy/Miyu ainda faltam.
- [ ] Regra 2.4 (foco vira ability quote se o piloto tem carta de upgrade sem cooldown) —
  `FOCUS_ABILITY_CARDS` já existe no código mas fica inerte até as cartas Slippy Morale e Peppy
  Auxílio nascerem.
- [ ] Item 3 completo: 9 cartas restantes (Peppy Guarda Extra/Rescue/Auxílio, Slippy Repair
  Aliados/Morale Boost/Impulsão Conjunta, Miyu Assist+1/Boombuster/Status) + item 0 (visuais da
  Miyu: lock triângulo ciano, charge glow do assist, disparo extra magenta) + faíscas de hit
  não-letal mais espalhadas (item final, independente).
- [ ] **Peppy Rescue depende de knockback por tier** (QoL #6/#7, ainda não implementado) — vem
  antes na ordem de entrega.
- [ ] **Slippy Repair Aliados depende de wingmen com HP** (Checklist item 3, ainda não
  implementado) — vem antes na ordem de entrega.
- [ ] **Miyu Boombuster depende de projétil homing pra wingmen** (sistema novo, ainda não existe).

---

## Histórico de Entregas pós-v0.90.0

### v0.90.0 — Dash lateral: afterimage + speedlines; contador de cooldown do Swirl Blast na HUD

Dois pedidos do usuário na mesma mensagem.

**1) Afterimage + speedlines no dash lateral** (propulsão segurada + bank/dodge em arena,
`rail.triggerArenaLateralDash`, `ARENA_DASH_DURATION = 0.22s`). Achado no caminho: o dash tem
DUAS formas de disparo — segurar `propulsion` + eixo de bank (já chamava o burst pontual
`effects.lateralDashVFX`) E tocar `dodgeLeft`/`dodgeRight` com `propulsionHeld` (NÃO chamava
nada, gap pré-existente). Corrigido as duas:
- `rail.js`: novo getter `isLateralDashActive()` (`lateralDashT < 1`), mesmo padrão de
  `isFullSpinActive()`.
- `effects.js`: novo `dashAfterimage()` (cone genérico, igual em espírito a `rollAfterimage`/
  `ramAfterimage`, cor `0x4db8ff` — a mesma do burst de `lateralDashVFX`) tocando a cada
  `DASH_AFTERIMAGE_INTERVAL = 0.025s` enquanto `dashActive` (intervalo mais curto que o do roll,
  0.04s, porque a janela do dash é bem menor — senão a trilha fica esparsa). Registrado no mesmo
  `update()`/dispose()/reset que os outros afterimages do jogador.
- `game-loop.js`: `dashActive = rail.isLateralDashActive()` computado uma vez, usado em três
  lugares — `effects.update()` (afterimage), `hud.setMotionLines()` (speedlines, mesma
  intensidade máxima 1.0 que o Swirl Blast usa), e passado como estava faltando o burst
  `lateralDashVFX` no branch de `dodgeLeft`/`dodgeRight` + propulsão.

**2) Contador de cooldown do Swirl Blast na HUD.** O jogo já tinha o cooldown funcionando
(`player.getSwirlCooldownMs`/`getSwirlCooldownTotalMs`, ver etapas anteriores do Swirl Blast) mas
NENHUM indicador visual — pedido explícito pra colocar "embaixo do mesmo local de onde fica o
foco de aliados" (o widget `[D] FOCO` do comando de esquadrão, `hud-squad-command-widget`).
- `hud-game.js`: `squadCommandWidget` (antes filho direto de `topbarRow`) agora mora dentro de um
  novo wrapper `.hud-squad-column` (flex column) que ocupa o mesmo slot horizontal no topbar —
  não muda a posição de nada que já existia. Novo `swirlCooldownWidget` empilhado por baixo,
  MESMA estrutura/classes do widget de FOCO (badge + meter + timer), só com ícone 🌀/label
  "SWIRL" e sem o estado "active" (Swirl não tem janela de duração, só dispara e entra em
  cooldown — só `ready`/`cooling`). Novo `hud.setSwirlCooldown(cooldownMs, totalMs)` segue
  exatamente o padrão de `setSquadronCommandState` (fill cresce conforme o cooldown esvazia,
  texto em segundos, "PRONTO" quando liberado).
- `hud-styles.js`: `.hud-squad-column` (a coluna) + `.hud-swirl-widget.ready` (variante de cor —
  azul do Swirl, `0x2b8fff`, em vez do ciano `#38bdf8` do FOCO, pra não ler como o mesmo botão;
  estado `cooling` reaproveita o cinza neutro já existente sem modificação).
- `game-loop.js`: `hud.setSwirlCooldown(player.getSwirlCooldownMs(), player.getSwirlCooldownTotalMs())`
  chamado todo frame, ao lado do `setSquadronCommandState` existente.

Verificação: `node --check` em todos os arquivos alterados, `node src/selftest.mjs` passando. Não
consegui verificar visualmente no browser desta vez — o servidor de preview carregou mas a página
ficou em branco (o import map do jogo carrega `three` de `cdn.jsdelivr.net`; a rede da sessão não
completou esse fetch a tempo, mesmo problema já visto no timeout de 300s de uma tentativa de
`navigate`). Não é causado por este código (nenhum arquivo dependente do import de `three` sequer
chegou a ser requisitado no log do servidor — o import map trava antes disso). Ambas as mudanças
seguem 1:1 padrões já existentes e testados (`rollAfterimage`/`isFullSpinActive` e
`setSquadronCommandState`), mas ainda vale o usuário confirmar visualmente no próximo playtest.

### v0.91.0 — Overhaul visual v2 do Swirl Blast — forma triangular de 9 camadas + homing contra chefe/dourado

Pedido do usuário via documento de proposta pronto (`Docs/# Swirl Blast — Design & Plano de I.md`
tem a amenda no topo). Duas clarificações resolvidas ANTES de codar (ver histórico da conversa):

1. **Base de cálculo desatualizada** — o documento assumia como "hoje" os números PRÉ-v0.88.0 (ver
   entrada "Swirl Blast: escala visual recalibrada" nesta mesma cadeia de arquivos), mas o jogo já
   tinha valores maiores em produção. Usuário confirmou: aplicar os valores PROPOSTOS ao pé da
   letra (não recalcular a partir do real "hoje").
2. **Escala inicial** — o próprio doc recomenda 2 rodadas de teste (moderada 0.6× primeiro, cheia
   depois) por riscos reais que ele mesmo lista (near-clip da câmera, homing pode trivializar luta
   de chefe, pode ficar grande demais). Usuário escolheu **Rodada 1 (0.6×)** primeiro, depois do
   susto recente com o tamanho errado da Horda — quer ver funcionando antes de ir pro tamanho
   cheio. Constante `SWIRL_SCALE = 0.6` em `projectiles.js` — pra Rodada 2, é só subir esse valor
   pra 1.0 (todos os `*_RADIUS`/`*_LENGTH` já são derivados dele).
3. **Conflito com R1 do doc original** ("disparo reto, sem homing", citado como pedido explícito
   do usuário) — a proposta v2 pede homing contra chefe/dourado, batendo de frente com R1.
   Levantado explicitamente antes de implementar; usuário confirmou "homing apenas contra chefes"
   e depois esclareceu "chefes inclui o dourado" — R1 amendado só pra esse caso específico
   (`BOSS_KIND`/`GOLDEN_KIND`), continua valendo pra todo o resto. Doc original marcado com a
   amenda.

**`src/combat/projectiles.js`** — reescrita completa do bloco Swirl:
- Geometria: 9 camadas (pirâmide principal 3 segmentos radiais, pirâmide traseira invertida,
  agulha frontal, `TorusKnotGeometry` de espiral, 5 anéis triangulares em funil com velocidade de
  giro PRÓPRIA cada um via `userData.spinSpeed` — dessincronizados de propósito —, aura, núcleo
  cilíndrico branco, cone de cauda, 3 esferas de exaustão nas quinas da base traseira). Material
  da espiral é PRÓPRIO por instância (`buildSwirlSpiralMaterial()`, não compartilhado) — precisa
  variar opacidade/velocidade por projétil quando homing está ativo, sem afetar outro Swirl em
  voo; descartado em `removeProjectile` (não no `dispose()` global, que só cobre o que é
  compartilhado).
- Homing: `projectile.swirlHomingTarget` (campo NOVO, não reaproveita o `projectile.homingTarget`
  genérico do teleguiado comum — aquele também sobrescreveria a VELOCIDADE pro valor do
  teleguiado, errado aqui). Lerp de DIREÇÃO com `SWIRL_HOMING_TURN_RATE=4.0 rad/s`, mantendo a
  velocidade do Swirl sempre. Congela (mantendo velocidade) se o alvo morrer no meio do voo.
- `fireSwirlBlast(origin, direction, bossTarget = null)` — 3º parâmetro novo.
- `updateSwirlDynamicShell()` — gira a espiral e os 5 anéis cada um na sua velocidade, por cima do
  giro do grupo inteiro (`SWIRL_SPIN_RATE`); acende a espiral (opacidade 0.75→1.0, giro 15→22
  rad/s) quando `swirlHomingTarget` está ativo.

**`src/combat/index.js`** — `fireSwirlBlast` agora consulta `lockon.getLockedEntities()` e filtra
por `BOSS_KIND`/`GOLDEN_KIND` ANTES de `game-loop.js` chamar `combat.clearLockedEnemies()` (que já
rodava incondicionalmente depois do branch de release do fogo — não precisou de mudança lá).

**`src/effects.js`** — `swirlBlastFlash` ganhou parâmetro `isHoming` (mais intenso quando
travado); `swirlAfterimage` usa a mesma silhueta triangular nova (3 segmentos, não mais 8);
`swirlBlastExplosion` ganhou 8 fragmentos triangulares (`TetrahedronGeometry`) voando em leque
hemisférico; `swirlLockReticle(targetPosition, fireDirection)` novo — anel branco breve sobre o
alvo no instante do disparo homing (orientado contra `fireDirection`, não há acesso à câmera
neste arquivo pra fazer billboard de verdade).

**Validado com `aiValidator.expect()`**: homing só ativa com alvo chefe/dourado; velocidade
preservada ao congelar por morte do alvo no meio do voo. Testado ao vivo via
`window.__starAnki` (`combat.sweepLockOn` + `combat.fireSwirlBlast` chamados diretamente,
contornando o gate de carga/giro do game-loop só pra teste) — **duas trajetórias reais**
capturadas frame a frame: (a) chefe travado fora do eixo de disparo → X cresce em direção ao
chefe com incremento CRESCENTE a cada frame (correção proporcional visível, não teleporte); (b)
sem nenhum lock → X e Y decrescem em incremento CONSTANTE (reta perfeita, R1 preservado). Zero
erros no console em toda a sessão de teste; `getScene().children` confirmou o Group de 15 filhos
(1+1+1+1+5+1+1+1+3) batendo exato com as 9 camadas descritas.

## Rádio dos Aliados (Overhaul de Personalidade, Ideia 3) — implementado

Ideia 3 do `Docs/# Overhaul de Personalidade e Vida.md` (bloqueada até um protótipo HTML com 3
opções visuais ser decidido). Processo: prototipei as 3 opções como um canvas de Design (claude.ai
artifact), usuário gostou da Opção B (notificação de HUD no canto) mas pediu sprites reais de
personagens em vez de ícone colorido + quotes em inglês alinhadas ao Star Fox 64 original — nesse
ponto o usuário pediu pra **não** ser mais em artefato hospedado, e sim arquivo HTML local mesmo
(protótipos ficaram em `Docs/Rádio dos Aliados — Opção B (protótipo).html` e a v2 com os sprites/
estática reais). Depois de decidido, pediu refinamento: painel quadrado (não pill, acomoda melhor
o ícone) + efeito de "rádio riscado" (a estática de sintonia real do jogo, não um glitch genérico)
+ 3 novas opções de ANIMAÇÃO com isso em mente. Escolhida a **Opção 3**: painel corta pra dentro
em fatias (glitch de steps, tipo troca de canal) na entrada, retrato passa pelos frames de
estática, flicker rápido antes de sumir.

**Assets — de onde vieram (importante pra nunca esquecer a fonte)**: sprites reais recortados do
jogo **Star Fox 2 (SNES)**, via spriters-resource.com (asset `snes/starfox2/asset/1451/`
"Mugshots" pros retratos de Falco/Peppy/Slippy/Miyu — grade de 65×65px por personagem, confirmada
por pixel-sampling; asset `1452/` "Portraits" pra sequência de "estática de sintonia" — 2 ícones de
bracket + 4 blocos de ruído colorido + 1 ruído escuro, EXATAMENTE a animação de "sinal chegando"
que o jogo original usa antes de mostrar o retrato de um personagem no rádio). Baixados via
ImageMagick (`magick -crop` no grid certo, filter point + resize pra manter pixel art nítida) —
NÃO por base64 colado manualmente (primeira tentativa disso corrompeu silenciosamente as imagens,
gerando strings curtas inválidas; lição: para blobs >1KB, baixar/decodificar via arquivo, nunca
copiar base64 gigante à mão). Assets finais em `assets/wingman-radio/` (`falco.png`, `peppy.png`,
`slippy.png`, `miyu.png`, `static1.png`..`static7.png`) — commitados no repo público. **Risco de
direito autoral aceito conscientemente pelo usuário** (sprites da Nintendo/Argonaut, projeto
pessoal não-comercial) — se o projeto algum dia for distribuído/monetizado, trocar por arte
própria.

**Renomeação Krystal → Miyu**: o 4º piloto (roxo, `WINGMAN_PROFILES[3]`) se chamava "Krystal" mas
esse nome não existe no elenco clássico de Star Fox (ela só estreia em Star Fox Adventures/GameCube,
anos depois de SF64) — não tem sprite correspondente na folha de SF2. Como não dava pra ter um
retrato "Krystal" com a cara da Miyu Lynx, o usuário decidiu renomear o piloto inteiro pra Miyu em
todo o jogo (rename global via sed, case-preservado: `Krystal`→`Miyu`, `krystal`→`miyu`,
`KRYSTAL`→`MIYU`, 7 arquivos: `combat/wingmen.js`, `game-loop.js`, `hud-game.js`, `audio-cues.js`,
`roguelike.js`, `debug.js`, `flow-question.js`). Título ("Vanguarda Fantasma") e tema (stealth/
cloak) continuam batendo bem com a Miyu, não precisou mudar.

**Idioma das falas**: inglês, catchphrases curtas no espírito de Star Fox 64 (pedido explícito do
usuário — "Do a barrel roll!" pra Peppy, "Help me, Fox!" reaproveitado pro evento `alone` do
Slippy, etc) — o resto do jogo é todo em português, isso é homenagem direta à série, decisão
consciente, não inconsistência.

**Arquitetura**: `src/combat/wingman-radio.js` (novo) — dispatcher puramente lógico, sem DOM,
igual ao spec original do doc (`trySpeak(pilotId, eventId, now)`, cooldown global de 6s,
`trySpeakAlone` com estado próprio pra só falar 1x por partida). 10 pontos de disparo em
`combat/wingmen.js` (8 do doc + `player_low_health` edge-triggered + `alone`): `engage_dogfight`,
`engage_focus`, `ability_ram/guard/repair/assist`, `kill`, `return_formation`,
`player_low_health`, `alone`; mais `player_take_damage` disparado de FORA do laço de update
(`triggerPlayerTookDamage()`, chamado por `game-loop.js` no momento em que `player.takeDamage()`
resolve — decisão (b) do §3.5 do doc: só reage a dano do JOGADOR, nunca do wingman, que é
invulnerável). Mensagens que nascem fora do laço de `update()` ficam em `pendingRadioMessage`
(closure) até o próximo frame devolver — 1 frame de atraso, imperceptível. `combat/index.js`
repassa `radioMessage` no retorno de `update()` e expõe `notifyPlayerDamaged()` (patch cirúrgico —
arquivo tem WIP concorrente de outra sessão no Swirl Blast homing, mesma técnica de sempre:
extrai HEAD, replica só as 2 linhas novas, diff, `git apply --cached`). `hud-game.js` →
`showWingmanRadio({ pilotId, name, color, text })` monta o painel + toca o flipbook de 7 frames de
estática (55ms cada, pré-carregados no mount do HUD pra primeira fala da partida não perder frame
por cache frio) antes de resolver no retrato de verdade. CSS em `hud-styles.js`
(`.hud-wingman-radio*`) — `@keyframes hud-wingman-radio-glitch-in` (clip-path em steps) e
`-flicker` (opacity em steps) fazem as duas animações da Opção 3. Setting novo
`wingmanRadioEnabled` (default `true`, toggle em Configurações → "Rádio do Esquadrão").

**Testado ao vivo** via `window.__starAnki.combat.notifyPlayerDamaged()` + eventos orgânicos de IA
durante partida real com Esquadrão completo (4 pilotos) — painel apareceu corretamente pros 4
pilotos (cores/retratos certos), zero erros de console. `selftest.mjs` ganhou seção nova
(cooldown global bloqueia 2ª fala, libera depois de 6s, `pilotId`/`eventId` inexistentes devolvem
`null` sem lançar, `reset()` zera cooldown, `trySpeakAlone` só fala 1x mesmo com outro piloto e
cooldown livre).

### Swirl Blast Rodada 2 (escala cheia) + bug real do homing corrigido

(sem número de versão nesta entrada — havia um bump pra v0.92.0 pendente/staged de outra sessão
concorrente no momento desta entrega, ver nota sobre `game-loop.js` mais abaixo; não dava pra
commitar `version.js` sem entrelaçar as duas entregas)

Usuário aprovou a Rodada 1 (0.6×) em teste real e pediu pra seguir pra Rodada 2, mas reportou dois
problemas: (1) "o projétil precisa ser maior" — pedido de Rodada 2 mesmo; (2) "ele ainda não é
teleguiado corretamente até os chefes" — bug real, não percepção.

**Escala**: `SWIRL_SCALE` em `combat/projectiles.js` foi de `0.6` pra `1.0` (valores cheios da
proposta v2). As constantes duplicadas de propósito em `effects.js` (não importa de
`combat/projectiles.js` — mesma regra de sempre, evita import circular) também foram reescaladas
pra bater: `SWIRL_FLASH_RING_SCALE` (4.8→8.0), `SWIRL_EXPLOSION_RADIUS` (4.2→7.0),
`swirlFragmentGeo` (0.3→0.5), `swirlAfterimageCoreGeo` (1.8×6.0→3.0×10.0).

**Bug do homing — causa raiz encontrada via teste ao vivo, não suposição**: o homing da Rodada 1
usava `Vector3.lerp` entre a direção atual e a direção desejada (ambas normalizadas) pra simular
uma taxa de giro limitada. Isso tem um defeito geométrico conhecido: lerp entre dois vetores
UNITÁRIOS encolhe de magnitude perto de ângulos largos (~90°-180°) antes de normalizar de volta —
distorce a taxa de giro real e, em alvo próximo/ângulo largo, o projétil ULTRAPASSAVA o alvo e
entrava numa órbita instável ao redor dele sem nunca fechar a distância até o `hitRadius`. Provado
via `window.__starAnki`: disparo contra chefe reposicionado a 60u de distância / 15u lateral
(mira reta, sem apontar pro alvo — simula o jogador não conseguindo manter a mira exata após o
giro completo) — posição do projétil oscilando 36u↔147u em torno de um chefe PARADO, nunca
conectando, expirando por alcance máximo.

**Correção em 2 partes** (ambas em `combat/projectiles.js`, bloco do homing dentro de
`update(dt, ...)`):
1. Trocada a rotação de `Vector3.lerp` (degenera) por rotação de eixo-ângulo de verdade
   (`Vector3.applyAxisAngle` em torno do eixo `cross(direçãoAtual, direçãoDesejada)`, ângulo
   limitado por `SWIRL_HOMING_TURN_RATE * dt`) — taxa de giro genuinamente constante, sem a
   distorção do lerp. `SWIRL_HOMING_TURN_RATE` subiu de `4.0` pra `18.0` rad/s (o valor de 4.0
   nunca convergia a tempo mesmo com a rotação corrigida).
2. Mesmo com eixo-ângulo correto, perseguição pura (mirar sempre na posição ATUAL do alvo) tem um
   problema geométrico separado e conhecido: perto do alvo, a taxa angular NECESSÁRIA pra
   continuar apontando pra ele cresce sem limite — o projétil pode ficar preso numa órbita estável
   ao redor do alvo (visto ao vivo: mínimo de distância baixando de 68u→38u→18u conforme
   `SWIRL_HOMING_TURN_RATE` subia, mas nunca cruzando o `hitRadius` de ~7.7u — um ciclo-limite, não
   uma espiral convergente). Adicionado `SWIRL_HOMING_SNAP_RANGE = 26` — dentro desse raio, o
   projétil aponta DIRETO pro alvo (sem limite de giro), a "guiagem terminal" padrão de mísseis em
   jogos, só pro trecho final. É maior que a órbita observada em teste, então garante que a órbita
   sempre entra no raio de snap e converge de vez.

**Validado ao vivo** (`window.__starAnki`, chefe E dourado, caso fácil/moderado/extremo):
- 60u frente / 15u lateral, mira reta: hit em 6 frames.
- 40u frente / 25u lateral (~32°), mira reta: hit em 4 frames.
- 40u frente / 25u lateral, disparo PERPENDICULAR (mira "pra cima", pior caso de desalinhamento
  giro→soltura): hit em 7 frames — esse caso especificamente falhava 100% das vezes antes da
  correção (expirava sem conectar).
- Dourado, mesmo caso moderado: hit em 8 frames.
- R1 (sem alvo travado): 15 frames consecutivos com delta de posição EXATAMENTE idêntico
  (8.684u/frame) — zero curvatura, trajetória reta preservada intacta.
- `stopProjectile` (chefe/dourado sempre param o Swirl) continua funcionando — grupo do projétil
  removido da cena no mesmo frame do hit em todos os casos acima.

**Câmera lenta (slow-mo do Swirl)** — usuário pediu pra ajustar ele mesmo, só perguntou se as
variáveis já estavam isoladas/comentadas pra edição fácil. Confirmado que sim, sem precisar mexer:
`SWIRL_SLOW_MO_MS`/`SWIRL_SLOW_MO_FACTOR`/`SWIRL_FOV_BUMP_MS`/`SWIRL_FOV_TARGET` em
`main-constants.js` (bloco "SWIRL BLAST", cada uma já com comentário explicando o efeito). O punch
de câmera (`camera.translateZ(1.5)`) e o roll (`degToRad(3)`) em `game-loop.js` também têm
comentário no local explicando o que fazem, mas ficaram como número mágico inline (não extraídos
pra constante nomeada) — havia uma sessão concorrente com mudanças não commitadas nesse mesmo
arquivo (`game-loop.js`) no momento desta entrega; extrair essas duas constantes teria misturado
esta entrega com o trabalho pendente da outra sessão, então foi revertido de propósito. Se quiser
essa extração depois, é seguro fazer numa entrega isolada.

## Rádio dos Aliados — correção de bug + expansão de conteúdo + fila de mensagens

Entrega seguinte à implementação inicial do Rádio dos Aliados (ver seção acima). Usuário reportou
bug visual real: **os retratos só trocavam um tempo DEPOIS da mensagem aparecer**, não junto com
ela.

**Causa raiz**: o flipbook de estática reatribuía `img.src` a cada 55ms (7 frames). Browsers
cancelam o carregamento anterior assim que um novo `src` é atribuído — 55ms é rápido demais pra
completar fetch+decode+paint de um frame antes do próximo substituir, então NENHUM frame de
estática chegava a pintar; o `<img>` ficava com o retrato antigo (ou em branco) até o load final
(por acaso lento o bastante pra sobreviver) trocar de repente, bem depois do texto já ter
aparecido. **Fix**: os 7 frames de estática viraram `<img>` de verdade, pré-carregados 1x no mount
do HUD e NUNCA MAIS têm `src` tocado — "tocar o flipbook" virou só alternar qual já tem a classe
`visible` (opacity via CSS, sem nenhuma rede/decode no caminho crítico). Retrato final continua
reatribuindo `src` (não tem pressão de tempo, 2.4s de hold sobram).

**+52 falas novas** (pedido: mín. 40, referenciando inimigos/chefes/impulso/disparo carregado/
habilidades "principalmente"/eventos): mais variedade nos 4 eventos de habilidade existentes (2-3
falas cada agora, era 1); eventos novos — `engage_boss` (chefe/dourado, prioridade sobre o
genérico via `engageEventFor()`), `engage_horda`/`engage_fragata` (inimigos com identidade visual
forte), `boss_kill`/`golden_kill` (substituem `kill` genérico quando `hit.bossDefeated`/
`goldenSpecialHit`), `boost_used` (edge-trigger em `opts.boostActive`), `charged_shot_used`
(edge-trigger na SOLTA do carregado — `wasHomingCharging && !homingCharging`, só conta se segurou
>0.3s, evita comentar em tap acidental), `focus_ready` (ver fila abaixo).

**Fila de mensagens** (pedido: permitir uma fala depois da outra "como o botão de foco com todos
os 4 se comunicando de prontidão"): canal novo `radioQueue` (array), separado do `radioMessage`
singular — nasce em `toggleCommand()` quando o comando de foco ativa: cada piloto ativo (exceto
quem está com `abilityActive`, mesma exceção do assign de alvo) fala uma linha de `focus_ready` via
`wingmanRadio.getLine()` (lookup SEM cooldown — não é `trySpeak()`, senão só 1 dos 4 conseguiria
falar por causa do cooldown global de 6s). HUD (`showWingmanRadioQueue`) tem fila própria + flag
`wingmanRadioPlaying`: se já tem algo tocando, entra no fim da fila; ao terminar de sumir, encadeia
a próxima automaticamente. `showWingmanRadio` (trigger avulso) continua interrompendo tudo e
tocando na hora, comportamento inalterado.

**Tamanho -15%** (pedido explícito): avatar 52px→44px, fonte do nome 12px→10px, fonte da fala
13px→11px, padding/gap/cantos técnicos proporcionalmente menores.

Testado ao vivo com `window.__starAnki` + `setManualStepping(true)` (stepping determinístico,
necessário porque o `setInterval` do flipbook roda em tempo real de parede — testar com
`step()`+`await sleep` competia com o próprio timer): confirmado via `MutationObserver` +
inspeção de `naturalWidth`/classe `visible` que o frame 0 da estática fica visível IMEDIATAMENTE
(síncrono, no mesmo tick da chamada), os 7 frames chegam pré-decodificados (`naturalWidth: 260`
todos), e a rajada de prontidão do `[D]` realmente encadeia mensagens de pilotos diferentes em
sequência (Falco "Locked and loaded!" confirmado). Zero erros de console.

### v0.94.0 — Swirl Blast: 10 bugs achados por code-review (`/code-review`) + corrigidos

Pedido do usuário: "cace por bugs" em cima da entrega anterior do Swirl Blast (v2 visual + homing
+ Rodada 2). Review multi-ângulo (8 agentes: scan linha-a-linha, auditoria de comportamento
removido, rastreio cross-file, reuse/simplificação/eficiência/altitude, convenções do CLAUDE.md) +
verificação 1-voto em cada candidato antes de reportar. 10 achados, todos corrigidos:

1. **Bug real, o mais grave**: `SWIRL_HOMING_SNAP_RANGE` (26) era MENOR que o raio de órbita
   estável da perseguição pura (`SWIRL_BLAST_SPEED / SWIRL_HOMING_TURN_RATE` ≈ 28.9) — simulação
   numérica do agente verificador provou que um chefe/dourado travado a ~27-31u de distância e
   ~93-103° de ângulo do disparo faz o projétil orbitar pra sempre sem cruzar o raio de snap,
   exatamente o bug que a Rodada 2 achou e "corrigiu" antes. Nenhum dos 4 testes ao vivo daquela
   sessão caiu nessa faixa de ressonância — passaram por sorte geométrica, não porque o fix era
   geral. Corrigido derivando o snap range da física real: `(SWIRL_BLAST_SPEED /
   SWIRL_HOMING_TURN_RATE) * 1.3` (margem de segurança). Reproduzido o caso exato ao vivo
   (distância 29u, ângulo 95° — 98° cai fora do cone de trava por causa do `PASS_BEHIND` do
   lock-on, então usei 95° pra manter o alvo travável) — antes expirava sem conectar, depois do
   fix conecta no frame 2.
2. Flash de disparo (`swirlBlastFlash`) calculava `flashOpacity=1.0` pra tiro homing mas o
   `muzzleFlashes.push` tinha `startOpacity: 0.9` hardcoded, sobrescrito todo frame pelo loop
   genérico — o "flash mais intenso quando travado" nunca aparecia. Corrigido: usa `flashOpacity`.
3. Rotação por eixo-ângulo do homing não tinha fallback quando direção atual e desejada ficam
   (quase) antiparalelas (cross product degenera a zero) — a velocidade congelava sem corrigir.
   Corrigido: se o eixo degenerar, usa qualquer eixo perpendicular (world-up, ou world-right se
   o primeiro também degenerar) como desempate.
4. `SWIRL_SPIRAL_TUBE` era calculado a partir de `SWIRL_SCALE` mas a geometria usava o literal
   `0.09` direto, ignorando a constante — a espessura da espiral parou de escalar quando
   `SWIRL_SCALE` virou 1.0 na Rodada 2. Corrigido: geometria usa a constante (com piso de 0.09
   pra não sumir em escalas pequenas).
5. `swirlFlashConeGeo` (flash do disparo) continuava cone redondo (8 segmentos) enquanto o
   afterimage já tinha sido migrado pra 3 segmentos triangulares — mismatch visual de 1 frame no
   instante que devia vender a identidade triangular nova. Corrigido: 3 segmentos.
6. Nenhum `aiValidator.expect()` cobria "o Swirl com alvo travado realmente conecta antes de
   expirar" — exatamente a invariante que quebrou duas vezes nesta feature (achado #1 acima
   incluso) e só foi pega por debug manual ao vivo, violando a obrigação do
   `FLUXO_VALIDACAO_IA.md` de instrumentar invariante crítica. Corrigido: `expect()` nos dois
   pontos de remoção por expiração (vida e alcance máximo) cobrando `false` se o projétil ainda
   tinha `swirlHomingTarget` ativo — vira `expectativas_falhas` no log se acontecer de novo.
7. A rotação por eixo-ângulo corrigida ficou inline só pro Swirl, enquanto o steer de mira normal
   (assist de tiro comum) ao lado continuava com o mesmo `Vector3.lerp` que degenera — mesma
   classe de bug, sem correção. Extraído `steerDirectionTowardTarget(dir, desired, maxAngle,
   axisTemp)` compartilhado (com o fallback do item 3 embutido), usado pelos dois lugares agora.
8. `swirlBlastExplosion` reimplementava a mesma matemática de espalhamento esférico aleatório
   (theta/phi/speed) que `glassShatter` já tinha — extraído `randomSphereVelocity(min, max)`
   compartilhado (mantive os dois em sistemas de animação separados, `muzzleFlashes` vs
   `glassShards`, que têm ciclos de vida diferentes — só a matemática do vetor era duplicada).
9. Comentário em `effects.js` dizia "escala Rodada 1 (0.6×)" mas os valores logo abaixo já eram
   Rodada 2 (cheia) — corrigido o texto do comentário.
10. `buildSwirlSpiralMaterial()` alocava um material novo por disparo só pra variar opacidade
    entre reto/homing — trocado por 2 materiais compartilhados (`swirlSpiralMaterialBase`/
    `Homing`) com troca de REFERÊNCIA em `updateSwirlDynamicShell`, zero alocação por disparo.

**Validado ao vivo** após os fixes: os 3 casos de teste da Rodada 2 (fácil/moderado/extremo)
continuam conectando (4-6 frames), R1 sem alvo travado continua com trajetória perfeitamente reta
(10 frames de delta idêntico), zero erros de console, e o caso de ressonância do achado #1
(antes expirava sem nunca acertar) agora conecta no frame 2.

---

### v0.95.0 — Rádio dos Aliados Fase 1 (sistema base do `Docs/# Documento de Implementação — Nova.md`)

Início da implementação do documento novo (rádio pra todos os 4 pilotos → depois cartas por
personagem, Falco → Peppy → Slippy → Miyu). Usuário escolheu começar pela Fase 1 (infra do rádio,
itens 1+2 do doc) e mandar o TEXTO das ~54 falas triviais novas depois — o doc define a estrutura
(30 falas/piloto, 5 por ability) mas não trazia o conteúdo das falas, então **as falas em si não
foram tocadas nesta entrega** (as ~24-25 atuais por piloto continuam, já expandidas de uma entrega
anterior — ver "Rádio dos Aliados — correção de bug + expansão de conteúdo" acima; o "~66 atuais"
citado no doc novo já estava desatualizado antes mesmo de começar).

- **`combat/wingman-radio.js`**: `ABILITY_EVENT_IDS` (Set exportado) classifica todo eventId como
  ability ou trivial — os 4 que já existem hoje (`ability_ram/guard/repair/assist`) mais 7 que só
  vão nascer nas fases de cartas por personagem (`ability_intercept/rescue/aux_shield/morale/
  boost_dash/boombuster/focus_upgrade`), cadastrados de antemão pra já nascerem classificados
  certo. Cooldown global virou aleatório: `nextAllowedAt` (renomeado de `lastSpokenAt`, que na
  prática já guardava o PRÓXIMO instante liberado) sorteia entre `GLOBAL_COOLDOWN_MIN_MS` (6000,
  igual antes) e `GLOBAL_COOLDOWN_MAX_MS` (20000, novo).
- **`combat/wingmen.js`**: `buildRadioPayload(profile, text, eventId)` ganhou `isAbility:
  ABILITY_EVENT_IDS.has(eventId)` no payload — os 3 call sites (`speak()`, `dismissWingman` via
  `trySpeakAlone`, rajada de prontidão do `toggleCommand()`) passam o eventId agora. A regra 2.4
  do doc (foco: ability quote se o piloto tem carta de upgrade e ela não está em cooldown) fica
  **pendente** até `FOCUS_ABILITY_CARDS`/as cartas Slippy Morale e Peppy Auxílio existirem —
  comentado no código, `focus_ready` continua sempre trivial por ora (comportamento preservado).
- **`hud-game.js`**: painel de rádio virou uma FACTORY (`createWingmanRadioRegion(panelEl)`)
  reaproveitada 2x — `wingmanRadioRegionTrivial` (painel original, inferior) e
  `wingmanRadioRegionAbility` (novo `.hud-wingman-ability-panel`, superior, `top: 18%`), cada uma
  com fila/timers/estado próprios (extraído do código original, que só existia pro painel
  inferior — evita duplicar ~60 linhas de gerência de timer/flipbook de estática). Roteamento em
  `showWingmanRadio()`: escolhe a região por `payload.isAbility`; regra "não pode estar nas 2
  regiões ao mesmo tempo pro MESMO piloto" (item 2.1-2.3 do doc) via `forceHide()` na região
  oposta quando ela já mostra esse `pilotId`. `showWingmanRadioQueue()` (rajada de prontidão) só
  carrega falas triviais hoje, então sempre roda na região inferior — mas ainda checa/esconde a
  região de ability se ela estiver com o mesmo piloto, pela mesma regra.
- **`hud-styles.js`**: `.hud-wingman-ability-panel` — mesma estrutura interna reaproveitada sem
  redefinição (`.hud-wingman-radio-corner/-avatar/-name/-line` não são escopadas ao painel pai),
  só a caixa raiz muda: `top: 18%` em vez de `bottom`, borda/glow mais saturados, e uma entrada em
  fatias verticais (`hud-wingman-ability-glitch-in`, steps a partir da esquerda) mais dramática
  que a entrada do painel trivial, pra diferenciar "fala de habilidade" de "papo" à primeira vista.
- **`selftest.mjs`**: teste do cooldown global atualizado pro range aleatório (usa
  `GLOBAL_COOLDOWN_MAX_MS` como pior caso, exportado só pra teste); teste novo confirmando a
  classificação de `ABILITY_EVENT_IDS` (`ability_ram`/`ability_guard` dentro, `kill`/`focus_ready`
  fora).

**Validado**: `node src/selftest.mjs` passa. Ao vivo (`preview_start` + Esquadrão completo, `state.
phase` forçado via `window.__starAnki`): os dois painéis existem no DOM com os 7 frames de estática
cada; setei manualmente o painel de ability (Falco, "Ramming speed!") e confirmei visualmente a
posição superior/cor saturada/estrutura corretas; **o painel inferior foi sobrescrito por um evento
REAL de gameplay** (Miyu, `engage_horda`, "Multiple contacts, staying sharp.") durante o teste,
substituindo o texto que eu tinha setado manualmente — confirma o pipeline de dispatch real (não só
o CSS) funcionando ponta a ponta pro canal trivial. Não consegui forçar um evento de ability real
(`ability_ram`/`ability_guard`) via console nesta sessão (dependem de FSM interna do wingman não
exposta em `window.__starAnki`) — o roteamento pro painel superior fica confirmado por leitura de
código + teste manual de CSS/estrutura, não por um disparo de ability orgânico ao vivo; vale
confirmar num playtest real com o usuário quando alguma habilidade ativar.

**Falta pra fechar o doc**: texto das falas novas (usuário vai mandar), regra 2.4 completa (depende
das cartas de foco), e os itens 3 (12 cartas por personagem, uma por uma) + faíscas brancas mais
espalhadas (item final, independente).

---

### v0.96.0 — Falco: as 3 cartas (Combate/Intercept/Status) + sub-ícone de cooldown

Segunda fase do `Docs/# Documento de Implementação — Nova.md` (ordem: rádio → Falco → Peppy →
Slippy → Miyu). O usuário corrigiu no meio do caminho: ele queria que EU escrevesse as falas
novas, não que mandasse o texto pronto — escritas direto em inglês, no tom confiante/cascavel já
estabelecido de Falco: `ability_ram` ganhou +2 falas (chegando a 5, "5 falas por ability" do doc);
`ability_intercept` nasceu com 5 falas próprias (`combat/wingman-radio.js`).

**As 3 cartas novas** (`roguelike.js`, categoria ofensivo, 0/3 stacks cada, só aparecem com Falco
recrutado — `wingmanCount <= 0` no exclude set, mesma regra das cartas "Vínculo" existentes):

- **`falco-combat-chain`** ("Investida em Cadeia"): ao ACERTAR a Investida Aríete (não em timeout
  sem conectar), se tem stacks e ainda não encadeou o máximo, procura o inimigo vivo mais próximo
  da posição ATUAL de Falco (`FALCO_CHAIN_RADIUS = 80u`) e reinicia o state 'ram' contra ele sem
  cooldown extra — só entra em cooldown normal quando a cadeia acaba (esgotou stacks OU não achou
  ninguém por perto). `w.chainCount` zera a cada nova investida (não a cada elo).
- **`falco-intercept`** ("Interceptação"): a cada `6 - stacks` segundos (cooldown PRÓPRIO,
  independente do da Investida Aríete), acha o projétil inimigo mais perigoso
  (`powerLevel >= POWER_LEVEL_AREA_DAMAGE`, novo `enemies.getThreateningProjectile()`) mais perto
  do JOGADOR e destrói na hora (`enemies.removeProjectilesNear()`, raio pequeno em cima da posição
  do projétil). Roda em QUALQUER state do wingman (não só dogfight), proteção proativa. Decisão de
  design: o feixe visual é um array PRÓPRIO (`interceptBeams`), fora de `activeLasers` de
  propósito — reusar `fireWingmanLaser`/`activeLasers` faria o "tiro" participar da resolução de
  colisão normal contra inimigos de verdade (8 de dano por acidente, o projétil já foi destruído
  instantaneamente, então o feixe é só cosmético: fade de 140ms, sem hitbox).
- **`falco-status`** ("Fôlego de Combate"): `+2s` de `dogfightDuration` por stack (base 5.5s → até
  11.5s com 3 stacks). `effectiveDogfightDuration(profile, opts)` novo em `combat/wingmen.js`,
  substitui as 2 leituras diretas de `profile.combatProfile.dogfightDuration` — só Falco (id 0)
  ganha o bônus, os outros 3 pilotos continuam com o valor de sempre.

**Arquitetura de stacks**: seguido o padrão JÁ existente das cartas "Vínculo" (não o
`ownerPilotId`/`applyWingmanCard` genérico que o doc original propunha) — os 3 contadores moram em
`player.js` (`falcoChainStacks`/`falcoInterceptStacks`/`falcoStatusStacks`, cap 3, getters
dedicados), lidos por `combat/wingmen.js` via `opts` no `update()` (mesmo padrão de
`shieldNotFull`), repassados de `combat/index.js`. Reaproveitar o padrão existente em vez de somar
um segundo sistema paralelo pro mesmo conceito.

**Sub-ícone de cooldown** (item 3 do doc): novo `combat.getSubAbilityStates(cardStacks)` →
`hud.setSquadronSubAbilities()` — círculo pequeno (`.hud-ability-subicon`) empilhado abaixo do
hexágono principal do piloto, só aparece se o jogador tem a carta com cooldown próprio (hoje só
Falco Intercept — Combate reusa o cooldown do Ram, Status não tem cooldown nenhum). Reaproveita
elementos entre frames (só troca classe ready/cooling), remove sozinho se a carta sumir (reset de
partida).

**Validado ao vivo** (`window.__starAnki`, stepper determinístico): `debugMaxBuffs()` confirmado
cravando os 3 stacks em 3; sub-ícone aparece no DOM com classe `ready`, glifo 🛑 e `cooldownTotal:
3` (6-3 stacks) assim que o jogador tem a carta. **Intercept disparou organicamente contra um
projétil real da Horda** (`t=1.84s` no flight log, sem eu forçar nada) — confirma o pipeline
completo, não só a função isolada. **Chain-ram forçado via comando de foco [D]** (`toggleSquadronCommand`,
bypassa o gate probabilístico de engajamento pra teste determinístico): Falco rammou tank #47 →
encadeou (1/3) → rammou tank #49 → encadeou (2/3) → encadeou (3/3) contra um miniSwarm auto-spawnado
que calhou de estar por perto → parou exatamente no cap de 3 e voltou pra formação. Zero erros de
console (só o ServiceWorker de infraestrutura, já documentado em entregas anteriores).

**Falta pra fechar Falco**: nenhuma carta pendente — as 3 estão implementadas. Falta a `getLine`
confirmar a fala nova via playtest real com áudio (validado só por lookup de string aqui). Próximo:
Peppy (rádio + cartas, incluindo knockback por tier como pré-requisito de Rescue).
