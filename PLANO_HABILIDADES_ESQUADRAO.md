# Plano: Habilidades Únicas do Esquadrão (Falco, Peppy, Slippy, Phantom)

Documento de planejamento — **nada aqui foi implementado ainda**. Serve de especificação completa
para uma entrega futura. Ver [PROGRESSO_POS_.60.md](PROGRESSO_POS_.60.md) para o histórico do
sistema de esquadrão atual (`src/combat/wingmen.js`, overhaul de agressividade/movimento cinemático
na v0.70.0) que este plano estende.

## 1. Objetivo

Pedido do usuário: cada um dos 4 companheiros de ala ganha **uma ação única, autônoma, com
cooldown de 10–20s**, reduzível por cartas roguelike específicas (só aparecem se aquele piloto já
estiver recrutado). Os 4 cooldowns aparecem como ícones no **extremo topo-esquerdo da HUD**.

Exemplos citados pelo usuário, um por piloto:
1. Vir até o lado do jogador para ajudar a carregar um tiro carregado.
2. Realizar avanços em aríete contra inimigos.
3. Às vezes soltar um item consumível ao contato que regenera vida.
4. Oferecer proteção ao jogador.

## 2. Mapeamento piloto → habilidade (proposta, precisa de confirmação — ver seção 9)

O usuário não especificou qual piloto recebe qual ação. Proponho o mapeamento abaixo por encaixar
com a personalidade/título que cada um já tem em `WINGMAN_PROFILES` (`src/combat/wingmen.js`):

| Piloto | Título atual | Habilidade proposta | Por quê |
| :--- | :--- | :--- | :--- |
| **Falco** (id 0) | Ás Interceptor | ☄️ **Investida Aríete** | "Interceptor" já é um arquétipo agressivo de aproximação/colisão. |
| **Peppy** (id 1) | Defensor Blindado | 🔰 **Guarda** (proteção) | "Defensor" é literalmente o papel de proteção. |
| **Slippy** (id 2) | Batedor Solar | 🩹 **Reparo de Campo** (item de vida) | Na obra original Slippy é o mecânico/suporte técnico do time. |
| **Phantom** (id 3) | Vanguarda Fantasma | 🔗 **Carga Compartilhada** (assiste o tiro carregado) | "Vanguarda" ladeando o jogador encaixa com vir para o seu lado. |

## 3. Especificação de cada habilidade

Todas as habilidades são **autônomas** (a IA decide ativar quando estiver pronta e as condições
baterem), não exigem tecla nova do jogador — consistente com o resto da IA de voo livre do
esquadrão (patrulha/flyby/dogfight já são autônomos).

### 3.1 Falco — ☄️ Investida Aríete
- **Condição de disparo**: Falco está em `dogfight` com um alvo válido, a habilidade está pronta, e
  a distância até o alvo está entre 20–45u (espaço suficiente para uma corrida de aproximação).
- **Execução**: em vez de rajada de laser normal, Falco entra num novo estado transitório `'ram'`:
  acelera a ~2.2x a velocidade de cruzeiro em linha reta até o alvo, com uma esteira de propulsor
  mais intensa (reaproveita `createThrusterLight`/escala, mesmo padrão do boost). Ao cruzar o raio
  de colisão do inimigo, aplica dano de impacto fixo (proposta: 6, configurável) e um `hitSpark` +
  pequeno `explosion` (reaproveita `effects.hitSpark`/`effects.explosion`, já usados pelos lasers
  do esquadrão). Depois do impacto (ou se errar o alvo — ele pode ter sido destruído por outra
  fonte no meio da corrida), aplica a mesma regra de "proibição de ficar atrás/preso" já existente
  (`PASS_BEHIND`) para sair limpo e voltar a `'patrol'`.
- **Contra chefe/dourado**: dano reduzido (proposta: 2, não os 6 normais) para não trivializar a
  luta — é um bônus de utilidade, não uma rota de dano principal.
- **Cooldown proposto**: 14s (base). Inicia a contar quando a investida termina (acerto ou erro).
- **Carta de redução**: `wingman-ram-cooldown` — só elegível se `wingmanCount > 0` (Falco recrutado).

### 3.2 Peppy — 🔰 Guarda (proteção)
- **Condição de disparo**: habilidade pronta E (jogador com escudo abaixo do máximo OU dano
  recebido recentemente nos últimos ~4s) — evita a Peppy "gastar" a habilidade à toa quando o
  jogador já está com escudo cheio e sem ameaça.
- **Execução**: novo estado `'escort'` — Peppy interrompe a patrulha e voa até uma posição fixa de
  escolta (ex.: `playerPos + frame.right * side*3 + frame.up*0.5`, bem próxima, "ladeando" a nave)
  e mantém a posição por ~4s. Durante esse tempo: (a) concede instantaneamente **+1 carga de
  escudo** ao jogador (mesmo efeito da carta `extra-shield-charge`, respeitando `shieldMax`), e
  (b) intercepta — destrói sem dano ao jogador — o primeiro projétil inimigo que cruzar um raio
  pequeno ao redor da posição do jogador nesse intervalo (efeito de "guarda-costas", reaproveitando
  a resolução de colisão já existente em `enemies.resolveProjectileHit`, mas invertida: aqui é
  Peppy quem intercepta o tiro ANTES dele acertar o jogador). VFX: bolha/anel de energia sutil
  ligando Peppy ao jogador (linha simples tipo os lasers, cor de acento da Peppy — ouro).
- **Cooldown proposto**: 20s (base) — é a habilidade mais forte (cura de escudo garantida +
  interceptação), por isso o cooldown mais alto da faixa 10–20s pedida.
- **Carta de redução**: `wingman-guard-cooldown` — só elegível se `wingmanCount > 1` (Peppy = id 1).

### 3.3 Slippy — 🩹 Reparo de Campo
- **Condição de disparo**: habilidade pronta E Slippy está em `dogfight`.
- **Execução**: sem estado de voo novo — é um proc no combate normal. Assim que a habilidade fica
  pronta, o **próximo laser de Slippy que acertar um inimigo** (não precisa matar) spawna, na
  posição do impacto, um novo tipo de coletável reaproveitando a infraestrutura de
  `spawnMicroOrbe`/`updateMicroOrbes` (`src/effects.js`) — uma variante visual "orbe de reparo"
  (cruz/verde, cor distinta da orbe azul de Frenesi Anki já existente) que, ao ser coletada pelo
  jogador (mesmo raio magnético/atração já implementado), cura uma quantidade fixa de vida
  (proposta: 1 ponto de vida, não escudo — vida é mais escasso e valioso no jogo atual) em vez de
  ativar o Frenesi de Foco. Isso implica estender `microOrbes` com um campo `kind: 'frenzy' |
  'heal'` e ramificar o efeito de coleta em `updateMicroOrbes`/no consumo em `combat/index.js`.
- **Cooldown proposto**: 18s (base). Inicia a contar no momento em que a orbe é spawnada (não na
  coleta — evita que o jogador ignorando a orbe trave a habilidade por mais tempo).
- **Carta de redução**: `wingman-repair-cooldown` — só elegível se `wingmanCount > 2` (Slippy = id 2).

### 3.4 Phantom — 🔗 Carga Compartilhada
- **Condição de disparo**: jogador segurando o disparo (carregando o Tiro Teleguiado) por pelo
  menos ~0.35s contínuos, habilidade pronta.
- **Execução**: novo estado `'assist'` — Phantom interrompe o que estiver fazendo e voa até uma
  posição de escolta bem próxima ao jogador (mesmo conceito de `'escort'` da Peppy, offset lateral
  menor). Enquanto acoplado E o jogador continuar segurando o disparo: aumenta a velocidade de
  carga do homing em +50% e adiciona +1 alvo simultâneo de trava (empilha com a carta
  `more-homing-targets`, sem quebrar o teto — respeita `HOMING_MAX_TARGETS_CAP`). Quando o jogador
  solta o disparo (carregado ou não) ou o tempo de assistência estoura (~3s de teto, pra não virar
  um estado permanente se o jogador segurar pra sempre), Phantom se desacopla, volta a `'patrol'` e
  o cooldown começa a contar. VFX: feixe/linha de energia visível ligando Phantom à nave do jogador
  enquanto acoplado (reaproveita o mesmo padrão de cilindro fino usado nos lasers, sem dano).
- **Cooldown proposto**: 16s (base).
- **Carta de redução**: `wingman-assist-cooldown` — só elegível se `wingmanCount > 3` (Phantom = id 3).

## 4. Modelo de dados e máquina de estados (`src/combat/wingmen.js`)

Cada `WINGMAN_PROFILES[i]` ganha:
```js
abilityId: 'ram' | 'guard' | 'repair' | 'assist',
abilityIcon: '☄️' | '🔰' | '🩹' | '🔗',
abilityLabel: 'Investida Aríete' | 'Guarda' | 'Reparo de Campo' | 'Carga Compartilhada',
abilityCooldownBase: 14 | 20 | 18 | 16, // segundos
abilityCooldownFloor: <~50% do base>, // teto de redução por cartas, mesmo padrão dos outros caps do projeto
```

Cada wingman instanciado (`spawnMember`) ganha:
```js
abilityCooldown: <valor inicial, proposta: metade do cooldown base — não fica pronta no primeiro segundo>,
abilityActive: false,
abilityTimer: 0, // uso interno do estado de execução (ram/escort/assist)
```

Estado da fila de voo (`w.state`) ganha dois valores novos além dos 4 existentes
(`'patrol' | 'flyby' | 'dogfight' | 'regroup'`): **`'ram'`** (Falco) e **`'escort'`** (Peppy e
Phantom, com sub-modo `escortKind: 'guard' | 'assist'` pra diferenciar o efeito aplicado sem
duplicar toda a lógica de "voar até perto do jogador e segurar posição").

O multiplicador de redução por cartas fica no **nível do sistema** (`createSquadronSystem`), não no
wingman individual — `abilityCooldownMultByProfileId = {0:1, 1:1, 2:1, 3:1}` dentro do closure,
sobrevive a qualquer respawn (o painel de debug permite remover/respawnar wingmen individualmente).
Nova função exposta: `applyAbilityCooldownCard(profileId)` → multiplica por 0.75 (clamped ao piso).

## 5. Pontos de integração por arquivo

- **`src/combat/wingmen.js`**: toda a lógica acima (novos campos de perfil/instância, dois novos
  estados na máquina de estados, resolução de colisão da investida, spawn do proc de cura,
  interceptação de projétil da Peppy, aceleração/desaceleração de carga do Phantom). Expõe
  `getAbilityStates()` → `[{ id, abilityId, icon, ready, cooldownRemaining, cooldownTotal, active }]`
  pra HUD consumir, e `applyAbilityCooldownCard(profileId)` pras cartas.
- **`src/combat/index.js`**: repassa `getAbilityStates` e `applyAbilityCooldownCard` (mesmo padrão
  de repasse já usado pra `getWingmanCount`/`getActiveWingmen`/etc.). `squadron.update(...)` passa a
  retornar também `healOrbSpawns` (posições) e `shieldGrants`/`interceptedProjectiles` (contagens)
  pro `combat.update()` incluir no objeto de eventos que já devolve `enemyKills`/`bossDefeated`.
- **`src/game-loop.js`**: `combat.update(dt, playerPos, {...})` precisa passar novos campos de
  entrada: `homingCharging: <bool>` (se o jogador está segurando o disparo — já deve existir uma
  flag equivalente no input/estado de carga do homing; localizar e reaproveitar, não duplicar) e
  possivelmente `player` ou getters específicos (`player.getShieldValue/getShieldMax` pra Peppy
  decidir se vale a pena guardar). Do lado de saída, consome `events.healOrbSpawns` (chama
  `effects.spawnMicroOrbe(pos, { kind: 'heal' })`) e `events.shieldGrants` (chama um novo
  `player.grantShieldCharge(n)`).
- **`src/player.js`**: novo método `grantShieldCharge(n)` (idêntico ao efeito interno já usado pela
  carta `extra-shield-charge`, só que chamável a qualquer momento, não só na escolha de carta) e
  `heal(n)` se ainda não existir um equivalente (checar se já há algo assim antes de duplicar).
  `buildCardExcludeSet()` ganha as 4 novas entradas de exclusão (ver seção 6).
- **`src/effects.js`**: `spawnMicroOrbe`/`updateMicroOrbes` ganham um parâmetro `kind` (`'frenzy'`
  default, `'heal'` novo) com geometria/material distintos (verde + ícone de cruz) e ramificam o
  efeito de coleta — frenzy ativa o buff existente, heal chama de volta pro consumidor (mesmo padrão
  de retorno usado por `getMicroOrbesCollected()`, provavelmente vira `getMicroOrbesCollected({kind})`
  ou um retorno separado por tipo).
- **`src/roguelike.js`**: 4 novas entradas em `ROGUELIKE_CARDS` (ver seção 6).
- **`src/hud.js` / `src/hud-game.js` / `src/hud-styles.js` / `index.html`**: novo cluster de ícones
  (ver seção 7).
- **`src/mount-game.js`**: fio de ligação pra alimentar o HUD com `combat.getAbilityStates()` no
  mesmo lugar/frequência que já alimenta o resto do HUD de combate (vida/escudo/boost).

## 6. Novas cartas roguelike (`src/roguelike.js`)

```js
{ id: 'wingman-ram-cooldown',    category: 'ofensivo',  label: 'Vínculo: Falco (Investida)',   icon: '☄️', description: 'Reduz o cooldown da Investida Aríete de Falco. Só disponível com Falco na ala.' },
{ id: 'wingman-guard-cooldown',  category: 'defensivo', label: 'Vínculo: Peppy (Guarda)',       icon: '🔰', description: 'Reduz o cooldown da Guarda de Peppy. Só disponível com Peppy na ala.' },
{ id: 'wingman-repair-cooldown', category: 'defensivo', label: 'Vínculo: Slippy (Reparo)',      icon: '🩹', description: 'Reduz o cooldown do Reparo de Campo de Slippy. Só disponível com Slippy na ala.' },
{ id: 'wingman-assist-cooldown', category: 'utilitario',label: 'Vínculo: Phantom (Carga)',      icon: '🔗', description: 'Reduz o cooldown da Carga Compartilhada de Phantom. Só disponível com Phantom na ala.' },
```

Regra de elegibilidade em `player.js: buildCardExcludeSet()` (mesmo padrão de
`if (wingmanCount >= WINGMAN_CAP) exclude.add('wingman')` já existente), lembrando que
`setWingmanCount` sempre recruta em ordem de id (0→3), então presença por id é monotônica em jogo
normal (só o painel de debug pode fugir dessa ordem, e não afeta jogo real):
```js
if (wingmanCount <= 0) exclude.add('wingman-ram-cooldown')
if (wingmanCount <= 1) exclude.add('wingman-guard-cooldown')
if (wingmanCount <= 2) exclude.add('wingman-repair-cooldown')
if (wingmanCount <= 3) exclude.add('wingman-assist-cooldown')
// + exclude quando aquele cooldown já está no piso (abilityCooldownFloor), mesmo padrão de
// `if (shieldRegenDelayMs <= SHIELD_REGEN_DELAY_FLOOR_MS) exclude.add(...)`
```

Cada carta reduz o cooldown daquela habilidade em -25% (multiplicativo), até o piso
(`abilityCooldownFloor`, proposta ~50% do valor base) — mesmo espírito de progressão diminuindo em
retornos das outras cartas de redução do jogo (recarga de escudo, carga do homing, etc.).

## 7. HUD — cluster de ícones de cooldown no topo-esquerdo

Layout atual do canto superior esquerdo (`index.html`, CSS inline, todos `left: 12px`):
`.hud-status` (Pontos/Combo) em `top:12px` → `.hud-lives-bar` em `top:40px` → `.hud-shield-wrap` em
`top:72px` → `.hud-health-wrap` em `top:92px` → `.hud-boost-wrap` em `top:118px` →
`.hud-cards-tray` (bandeja de cartas coletadas, `top:136px`).

**Proposta**: o novo cluster (`.hud-squad-abilities`) vira o elemento mais alto de todos —
`top:12px; left:12px` — literalmente o "extremo topo-esquerdo" pedido, e todo o resto da coluna
desce 36px (altura do ícone + respiro) pra abrir espaço:

| Elemento | Top atual | Top novo |
| :--- | :--- | :--- |
| `.hud-squad-abilities` (**novo**) | — | **12px** |
| `.hud-status` | 12px | 48px |
| `.hud-lives-bar` | 40px | 76px |
| `.hud-shield-wrap` | 72px | 108px |
| `.hud-health-wrap` | 92px | 128px |
| `.hud-boost-wrap` | 118px | 154px |
| `.hud-cards-tray` | 136px | 172px |

Estrutura: 4 ícones de ~28×28px lado a lado (`display:flex; gap:6px`), um por piloto, na ordem
Falco/Peppy/Slippy/Phantom, cada um:
- Fundo com a cor de acento do próprio piloto (`profile.accentColor`), glifo do emoji da habilidade
  no centro.
- **Ausente da ala** (piloto ainda não recrutado): ícone acinzentado/baixa opacidade (~35%), sem
  contorno colorido — sinaliza "ainda não desbloqueado" sem ocupar espaço extra ou sumir (mantém a
  posição dos 4 slots sempre fixa, pra não a UI "pular" quando um novo piloto é recrutado).
- **Em cooldown**: overlay radial escuro (`conic-gradient` cobrindo a fração restante, mesmo
  princípio visual de cooldown de habilidade em jogos de ação) + número de segundos restantes
  (only nos últimos ~3s, pra não poluir visualmente o resto do tempo).
- **Pronta**: contorno com glow pulsante sutil na cor de acento (reaproveita o mesmo tipo de
  `@keyframes` já usado em `.hud-boost-wrap.ready-flash`).
- **Ativa/executando** (durante a investida/escolta/assistência): glow mais intenso e contínuo, sem
  pulsar — feedback claro de "acontecendo agora".

**Não esquecer**: `hud-styles.js` (linhas ~1006-1024) mantém uma lista de seletores que ganham
`opacity:0` durante cutscenes/cinemáticas (`.cinematic-active .hud-status, .hud-lives-bar, ...`) —
`.hud-squad-abilities` PRECISA entrar nessa mesma lista, senão os ícones ficam vazando por cima de
cutscenes onde o resto do HUD de combate já sumiu (armadilha real já documentada em entregas
anteriores deste projeto pra outros elementos de HUD).

## 8. Balanceamento e interação com sistemas existentes

- Nenhuma das 4 habilidades deve ser mais forte, sozinha, que uma carta roguelike equivalente — são
  bônus de posse (só existem se aquele piloto foi recrutado), não substitutos de build.
- A Investida do Falco reduzida contra chefe/dourado evita virar uma segunda fonte de DPS
  trivializando esses encontros (que já são o clímax de cada setor).
- A Guarda da Peppy só ativa com necessidade real (escudo não-cheio ou dano recente) pra não virar
  um recurso desperdiçado por RNG de timing.
- O Reparo do Slippy cura vida (não escudo) de propósito — vida é o recurso mais escasso/precioso
  do jogo atual (perder todas as vidas = game over), então um dreno lento e opcional de cura é
  valioso sem ser desequilibrante (depende do jogador efetivamente voar até a orbe).
- A Carga Compartilhada do Phantom tem teto de 3s pra não travar o estado de assistência
  indefinidamente se o jogador segurar o disparo por muito tempo.

## 9. Decisões em aberto (precisam de confirmação antes de codar)

1. **Mapeamento piloto→habilidade** (seção 2) é só uma proposta — confirmar ou trocar.
2. **Valores numéricos exatos** (cooldowns base/piso, dano da investida, cura do reparo, % de bônus
   de carga do Phantom, duração da escolta da Peppy) são pontos de partida pra playtest, não valores
   finais — ajustar depois de testar ao vivo.
3. **Reflow da HUD** (seção 7): empurrar toda a coluna esquerda 36px pra baixo é a interpretação mais
   literal de "extremo topo-esquerdo". Alternativa mais conservadora: colocar os 4 ícones **ao lado**
   do texto "Pontos/Combo" na mesma linha (`top:12px`, deslocado à direita), sem mexer nos outros 5
   elementos — menos invasivo, mas "menos" extremo-topo-esquerdo. Preciso saber qual o usuário prefere.
4. **Cor de fundo dos ícones**: usar a cor de acento de cada piloto (proposta acima) ou uma cor
   neutra única pra todos os 4 (mais legível a distância, menos "personalizado")?

## 10. Ordem de implementação sugerida (incremental, testável a cada passo)

1. `wingmen.js`: novos campos de perfil + `getAbilityStates()` retornando estado fixo/mock (sem
   lógica de gameplay ainda) — só pra validar o encanamento até a HUD primeiro.
2. HUD: cluster de ícones consumindo o mock acima, reflow validado visualmente (`preview_start`).
3. Implementar as 4 habilidades uma de cada vez, da mais simples pra mais complexa:
   Reparo (Slippy, reaproveita micro-orbes) → Investida (Falco, novo estado + dano) → Guarda
   (Peppy, escudo + interceptação) → Carga Compartilhada (Phantom, acoplamento + bônus de carga).
4. Cartas roguelike de redução de cooldown, uma por habilidade, só depois de cada habilidade em si
   estar validada ao vivo.
5. Balanceamento final e ajuste dos números da seção 8/9.2 com base no playtest.
