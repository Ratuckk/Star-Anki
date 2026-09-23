# Swirl Blast — Design & Plano de Implementação

> **Versão:** 0.2 (revisado com feedback do usuário)
> **Alvo:** habilidade base do jogador, ativada por combo de estados
> **Status:** implementado (v0.85.x em diante) — ver progresso/PROGRESSO_POS_.70.md e
> progresso/PROGRESSO_POS_.80.md pro histórico real de entregas.
>
> **AMENDA (overhaul visual v2, pedido do usuário, ver progresso/PROGRESSO_POS_.80.md)**: **R1
> ("disparo reto, sem homing") não vale mais no caso específico de chefe/dourado travado no
> release** — o Swirl agora faz homing (turn rate limitado, 4 rad/s) contra `BOSS_KIND`/
> `GOLDEN_KIND` quando um dos dois está travado no instante do disparo. Confirmado explicitamente
> com o usuário depois de apontar o conflito com R1 ("chefes inclui o dourado"). R1 continua
> valendo pra TODO o resto — inimigos comuns, fragata (que já para o Swirl sozinha, sem precisar
> de homing). Ver `src/combat/projectiles.js` (`SWIRL_HOMING_TURN_RATE`,
> `projectile.swirlHomingTarget`).

---

## 1. Pitch

Um **disparo-perfurante em vórtice azul** que o jogador libera ao **soltar um tiro de carga máxima durante o giro de invencibilidade**. É o payoff do combo mais arriscado do jogo: exige que você já esteja com a carga cheia (2.2s segurando fogo), que você execute o giro duplo-toque (que te expõe se você errar o timing), e que você **solte o fogo na janela certa** enquanto o giro ainda está rolando. Quando acerta o combo, sai um projétil veloz e perfurante que **atravessa tudo que toca** — a fantasia é "rasgar a formação inimiga de ponta a ponta".

É **habilidade base** — todo jogador tem desde o começo da partida, sem depender de sorte de carta. O limitador é o próprio combo (carga máxima + giro), com um **cooldown curto de 12s** pra impedir spam.

Além de mecanicamente forte, é visualmente marcante: um **vórtice azul giratório** com **câmera lenta e speedlines** na hora do disparo — momento de "super ataque" de arcade.

---

## 2. Requisitos de produto

| # | Requisito | Como o doc atende |
|---|---|---|
| R1 | "disparo reto" | Projétil sem steer, sem homing, trajetória linear pura (§3.2). **AMENDADO**: exceto contra chefe/dourado travado — ver nota no topo do doc. |
| R2 | "grande" | Geometria ~2× o tiro normal, mais aura e vórtice (§4.1) |
| R3 | "perfurante" | Atravessa todos os inimigos, um hit por alvo (§3.2) |
| R4 | "6 de dano em tudo que atinge" | `SWIRL_BLAST_DAMAGE = 6` (§7) |
| R5 | "velocidade surpreendente como um drill" | `SWIRL_BLAST_SPEED = 520` (~2× tiro normal) |
| R6 | "realizado ao realizar o giro de invencibilidade" | Requer `rail.isFullSpinActive()` no release |
| R7 | "enquanto possui o disparo carregado no máximo" | Requer `fireHeldMs >= homingChargeMaxMs` |
| R8 | "ao soltar durante o giro, é disparado" | Detecção no release do game-loop (§6.5) |
| **R9** | **Habilidade base, não carta** | Não depende de `roguelike.js` (§3.0) |
| **R10** | **Cooldown de 12s, reduzível por cartas** | `SWIRL_COOLDOWN_MS = 12000` + cartas "Vínculo: Swirl" (§5) |
| **R11** | **Destrói escudo dos bosses** | Ignora `isShieldActive` do chefe (§3.2) |
| **R12** | **Sempre destrói detritos** | Detrito morre instantaneamente, independente de HP (§3.2) |
| **R13** | **Não explode ao contato (exceto bosses/escudos)** | Sem splash em inimigos comuns (§3.2) |
| **R14** | **Visual do tiro carregado, mas giratório com vórtice azul** | Reaproveita silhueta do homing, adiciona spin+vórtice (§4.1) |
| **R15** | **Câmera lenta + FOV bump no disparo** | Cutscene de super ataque (§4.5) |
| **R16** | **Speedlines** | Efeito visual no HUD no disparo (§4.6) |

---

## 3. Mecânica detalhada

### 3.0 É habilidade base, não carta

O Swirl Blast **não é obtido por carta roguelike**. Está disponível desde o segundo zero da partida. A ausência de carta reduz o número de arquivos afetados — `roguelike.js` **não precisa ser tocado** (ao contrário do que a versão 0.1 do doc propunha).

O cooldown (§3.1) é o limitador, e cartas "Vínculo: Swirl Blast" (§5) reduzem o cooldown como conteúdo de progressão opcional.

### 3.1 Condições de disparo

O Swirl Blast dispara **no instante em que o jogador solta o botão de fogo**, se — e somente se — **as quatro condições abaixo forem verdadeiras simultaneamente**:

1. **A carga está no máximo** — `state.fireHeldMs >= player.config.homingChargeMaxMs` (2200ms por padrão).
2. **O giro de invencibilidade está em andamento** — `rail.isFullSpinActive() === true`.
3. **O cooldown do Swirl expirou** — `state.swirlCooldownMs <= 0`.

A janela do gatilho é **a duração do giro visual** (`FULL_SPIN_DURATION = 0.45s`), não a duração total dos i-frames (900ms). Isso evita que o jogador dispare o Swirl 0.5s depois do giro já ter acabado visualmente — o que quebraria a leitura "soltei durante o giro".

### Cooldown

- **12 segundos** (`SWIRL_COOLDOWN_MS = 12000`), começando a contar do **instante do disparo**, não do fim da cutscene de slow-mo (§4.5).
- Reduzível por cartas "Vínculo: Swirl Blast" (§5) — cada carta aplicada multiplica o cooldown por 0.85, com piso em 6s.
- **Não há cooldown extra do giro** — o giro já tem os 3s de `FULL_SPIN_COOLDOWN_MS` independentes, e isso já limita naturalmente a frequência.

Se o jogador soltar o fogo **fora** da janela (por qualquer motivo — não girou, giro acabou, carga não chegou no máximo, cooldown ativo), o fluxo **não muda em nada**: dispara o tiro teleguiado normal (max-charge ou não) ou nada, exatamente como hoje.

### 3.2 Comportamento do projétil

O Swirl Blast em voo:

| Propriedade | Valor | Racional |
|---|---|---|
| Trajetória | Linear pura (direction × speed × dt) | R1 |
| Steer | Nenhum | R1 |
| Homing | Nenhum | R1 |
| Velocidade | `520 u/s` | ~2× tiro normal, "surpreendente" |
| Dano | `6 por alvo` | R4 |
| Perfuração | Atravessa todos os inimigos | R3 |
| Um hit por alvo | Set de IDs já atingidos | evita 6 dano/frame em alvos grandes |
| Vida | `8s` (mesmo do tiro normal) | coerente |
| Alcance máx | `700u` (mesmo do tiro normal) | coerente |

#### 3.2.1 Destruição total de detritos

O Swirl Blast **SEMPRE destrói detritos ao tocar**, independente de quanto HP o detrito tem. Isso significa:

- Detrito comum (3-15 HP): morre instantaneamente.
- Detrito gigante (>15 HP): morre instantaneamente.
- Detrito titânico (HP escalado, pode passar de 40): **morre instantaneamente**.

Isso é uma exceção deliberada à regra de "6 de dano" — o dano numérico **não** é aplicado a detritos; é um `kill` direto. O racional é temático: uma broca de energia atravessa pedra como se fosse manteiga. O Swirl **continua voando** após destruir o detrito (não para no impacto).

Essa regra se aplica **a todos os detritos, sempre**. Se um dia surgir uma variante de detrito "boss" com HP de chefe, ele ainda morre instantaneamente — a regra é absoluta.

#### 3.2.2 Sem explosão em inimigos comuns

O Swirl Blast **não causa dano em área**. Atinge só o que está exatamente no segmento percorrido no frame. Diferente do tiro de carga máxima (que tem `MAX_CHARGE_SPLASH_RADIUS = 3` de AOE), o Swirl é **puramente cinético**: 6 de dano por alvo, sem espalhamento.

**Exceção (§3.2.3)**: contra bosses e escudos, ele **explode** ao contato — ver abaixo.

#### 3.2.3 Explosão ao contato — só contra bosses e escudos

Quando o Swirl Blast encontra:

- **Corpo do Chefe** (`BOSS_KIND`, sem escudo ativo)
- **Escudo refletor do Chefe** (com `isShieldActive === true`)
- **Corpo do Dourado** (`GOLDEN_KIND`)
- **Placa da Fragata-Escudo** (`FRAGATA_KIND`)

…ele **para no alvo** e explode, causando:

- **Contra Boss (`BOSS_KIND`)**:
  - Dano total = `6 de dano base + bônus globais aplicáveis + 30% do maxHp original do boss` (`SWIRL_BOSS_MAX_HP_DAMAGE_RATIO = 0.30`).
  - O percentual usa o `maxHp` autoritativo do chefe, não o HP restante.
  - A resolução de dano respeita integralmente os pisos de transição de fase do chefe (não pula fases nem causa morte indevida durante transição).
- **Contra Dourado (`GOLDEN_KIND`)**:
  - Dano normal = `6 de dano base + bônus aplicáveis`.
  - **O Dourado NÃO recebe a parcela de 30% de maxHp** (regra exclusiva para `BOSS_KIND`).
- **Contra Fragata-Escudo (`FRAGATA_KIND`)**:
  - Dano normal = `6 de dano base + bônus aplicáveis` e para o projétil.
- Uma explosão visual (vórtice expandindo + burst) no ponto do impacto.
- **No caso específico do escudo do chefe**: o Swirl **destrói o escudo** e aplica o dano completo ao chefe em um único impacto, não sendo bloqueado nem refletido por ele. Ver §3.2.4.

#### Hitbox Própria e Colisão Swept

- O Swirl Blast possui espessura de colisão própria: `SWIRL_BLAST_BASE_HIT_RADIUS = 3.0`, escalando via `SWIRL_BLAST_HIT_RADIUS = SWIRL_BLAST_BASE_HIT_RADIUS * SWIRL_SCALE`.
- Esse raio de 3.0u corresponde ao volume do corpo ofensivo principal (pirâmide principal / agulha frontal / espiral interna), sendo deliberadamente menor que a aura translúcida (5.0u) e a cauda externa (6.0u) para evitar hits visualmente artificiais.
- O pipeline swept segmentado é mantido: `distanceToSegment(alvo, prevPos, currPos) <= targetHitRadius + swirlHitRadius`, prevenindo tunneling em altas velocidades (`520 u/s`).

Contra todos os outros inimigos (blaster, mini-swarm, tank, time, sentinela, réplica, verme, imã, sussurro, horda, mini-swarm-da-horda), o Swirl **atravessa** sem parar e sem explodir.

#### 3.2.4 Escudo do chefe — Swirl destrói

Quando o Swirl atinge um chefe com escudo ativo, o escudo é **imediatamente desativado** (`enemy.isShieldActive = false`), a mesh do escudo é escondida, e o Swirl **é consumido** nesse impacto, aplicando o dano integral de contato (6 base + bônus + 30% de maxHp) sem aplicação duplicada.

Isso é uma decisão de design: o Swirl é a "chave" que quebra o cadeado. Depois de destruir o escudo, o jogador tem a janela normal de dano no chefe (o escudo não reativa por ~7s).

#### 3.2.5 Nota crítica — bug do escudo do chefe não acionar normalmente

**Registrar como bug separado a investigar** (não é escopo do Swirl Blast, mas apareceu durante o design):

O escudo refletor azul do Chefe (`BOSS_SHIELD_*` em `boss.js`) **não está sendo ativado de forma consistente** durante a luta, segundo observação em partidas recentes. O comportamento esperado é:

- A cada `BOSS_SHIELD_COOLDOWN_S = 7s` fora do escudo, ativa por `BOSS_SHIELD_DURATION_S = 3s`.
- Fica visível como esfera azul em volta do corpo do chefe.
- Reflete tiros normais do jogador.

**Código atual que controla isso** (`boss.js`, `updateBossMovement`):

```js
} else {
  enemy.shieldMesh.visible = false
  if (!enemy.dying && !enemy.transitioning) {
    enemy.shieldCooldown -= dt
    if (enemy.shieldCooldown <= 0) {
      enemy.isShieldActive = true
      enemy.shieldTimer = BOSS_SHIELD_DURATION_S
      enemy.shieldMesh.visible = true
      enemy.shieldActivationFxPending = true
    }
  }
}
```

**Suspeitas a investigar** (nenhuma confirmada — só hipóteses para uma sessão de debug separada):

1. **Transição de fase zera o cooldown?** — quando o chefe muda de fase, `updateBossMovement` faz `enemy.laserCooldown = randomLaserInterval(...)` mas **não** zera `shieldCooldown`. Se o cooldown já tiver rodado até perto de 0, o escudo ativa logo após a transição. Se ainda estiver em 6s+, o escudo fica invisível durante uma boa parte da fase.

2. **`enemy.transitioning` travado em `true`?** — o bloco acima pula o decremento de `shieldCooldown` enquanto `enemy.transitioning === true`. Se por algum motivo a transição não terminar (bug de timer?), o cooldown **congela** e o escudo nunca ativa. Verificar se `transitionTimer` está sendo decrementado corretamente em `updateBossMovement`.

3. **Timing na luta inteira** — a fase 3 do chefe (`chaseSpeed: 22`) pode matar o chefe antes do primeiro escudo ter tempo de ativar (7s de cooldown + tempo até a barra chegar em 33%). Se a luta durar menos de 7s na fase 3, o escudo literalmente nunca aparece nessa fase.

4. **Fase 1 tem escudo?** — sim, `shieldCooldown` começa em `BOSS_SHIELD_COOLDOWN_S = 7s` no `spawnBossEnemy`. Então o escudo deve aparecer ~7s após o spawn do chefe, em qualquer fase. Se não aparece nem em fase 1 (luta longa), é bug real de lógica.

**Ação**: abrir ticket separado. Rodar uma luta de chefe em modo debug (`skipToBossFight`) com `console.log` em `shieldCooldown` a cada frame durante 30s. Registrar quando ativa, quando não ativa, e correlacionar com transições de fase.

**Nota**: enquanto o bug não for corrigido, o Swirl Blast **funciona perfeitamente** contra o escudo quando ele está ativo — o comportamento é o mesmo descrito em §3.2.4. Se o escudo não está ativando, o Swirl simplesmente não encontra escudo para quebrar — o que é o correto do ponto de vista do Swirl (ele não inventa um escudo que não existe).

### 3.3 Interações com sistemas existentes

| Sistema | Efeito do Swirl Blast |
|---|---|
| HUD (retículo de lock-on) | Nenhum — Swirl não trava em ninguém |
| Lock-on | Locks existentes são **limpos no release** (padrão atual) |
| Charge glow | Some no release (padrão atual) |
| Frenesi de Foco | Swirl **substitui** o tiro do frenesi no frame do disparo (não coexiste) |
| Aríete (`propulsion-ram`) | Nenhuma interação |
| Giro rebatedor (`deflect-on-spin`) | **Coexistem** — o mesmo giro pode defletir projéteis próximos E permitir o Swirl Blast |
| Modo arena | Funciona igual — as três condições de §3.1 não dependem de arena/trilho |

---

## 4. Design visual

### 4.1 Projétil — "vórtice azul giratório"

**Base visual**: reaproveita a silhueta do **tiro carregado (homing)** — o formato básico já é familiar ao jogador, e a semântica "isto é um tiro premium" já está estabelecida. O que muda é a adição do **spin** e do **vórtice**.

O projétil é um `THREE.Group` com **4 componentes**, girando em torno do próprio eixo de voo durante toda a vida:

| Camada | Forma | Papel |
|---|---|---|
| **Core** | `ConeGeometry(0.6, 3.6, 8)` — mesma silhueta do homing, mas um pouco maior | Corpo do disparo |
| **Vortex ring × 3** | `TorusGeometry(0.75, 0.12, 8, 24)` — distribuídos ao longo do comprimento, girando | O vórtice em si |
| **Aura** | `SphereGeometry(1.1, 14, 12)` com additive, opacidade baixa | "Presença" luminosa |
| **Tip glow** | Esfera pequena, muito brilhante, na ponta dianteira | Punch visual |

**Rotação**: `mesh.rotation.z += SWIRL_SPIN_RATE * dt` (~18 rad/s) — como o `quaternion` do Group já está orientado pelo `setFromUnitVectors(FORWARD_AXIS, direction)`, rotacionar Z local é rotação em torno do próprio eixo de voo.

**Cor**: `SWIRL_COLOR = 0x2b8fff`. **Azul** — mesma família do `homingMaxChargeMaterial` (carga máxima), mantendo a leitura "isto é o tiro carregado, só que muito mais violento".

**Aditivo**: todos os materiais usam `THREE.AdditiveBlending`, `depthWrite: false`, `fog: false` — mesmo padrão do resto.

**Sem trailing de partículas do próprio mesh** — o rastro (vórtice deixado atrás) é feito via **afterimages** (§4.4), não via emissão de partículas.

### 4.2 Vórtice no trajeto

Além do spin do mesh, o Swirl deixa um **traço de vórtice** no espaço por onde passa, via **afterimages** (§4.4). O efeito visual final é como se o projétil estivesse **rasgando o tecido do espaço** — do ponto de disparo até o ponto de impacto, uma trilha de vórtices azuis vai sumindo gradualmente.

Isso é o que dá a leitura "surpreendente como um drill" do requisito R5.

### 4.3 Flash de disparo

Flash **distinto** do muzzle flash normal:

- **1 cone azul grande** na saída do canhão (silhueta igual à do muzzle flash, mas com `SWIRL_COLOR` e escala 1.5×).
- **1 anel de choque expandindo** perpendicular ao tiro, 3× maior e mais lento.
- **2 anéis de sucção** encolhendo para dentro (efeito "sugou o ar pra dentro antes de disparar").
- Duração total ~0.28s.

Implementação: nova função `effects.swirlBlastFlash(position, direction)` em `effects.js`.

### 4.4 Afterimage — trilha de vórtices

Enquanto o projétil viaja, um **afterimage por 0.03s** é spawnado na posição atual, com:

- Cópia do mesh do projétil **sem os anéis de vórtice** (senão vira sopa visual).
- Cor azul com opacidade decrescente.
- Duração 0.5s.
- Escala do afterimage 1.0 no início, indo pra 0.85 no fim da vida.

O efeito agregado: conforme o projétil avança, uma trilha de "fantasmas azuis" marca o caminho, cada um girando por conta própria por alguns frames antes de sumir — dá a leitura de vórtice deixado para trás.

Implementação: nova função `effects.swirlAfterimage(position, quaternion)`.

### 4.5 Câmera lenta + FOV bump no disparo — "cutscene de super ataque"

No instante do disparo, o jogo entra num **breve estado de câmera lenta cinematográfica** por **~0.45s** (comprimento do giro visual):

- **Time scale global** cai para `0.15` durante o efeito.
- **FOV da câmera** sobe de `70` para **`95`** (25° de bump) nos primeiros 0.15s, volta para `70` nos 0.30s seguintes (curva ease-out).
- **Câmera "punch"**: um offset de `+1.5` no eixo Z (afastando) e uma pequena rotação Z (`+3°`) no instante do disparo, voltando ao normal junto com o FOV.

O efeito é o clássico "super attack freeze" de jogos de ação — o tempo trava por meio segundo, a tela dá um zoom-out sutil, e o Swirl sai voando em câmera lenta antes de tudo voltar ao normal.

**Detalhes de implementação**:

- Reaproveitar o mecanismo de `slowMo` já existente em `game-loop.js` (`state.debugFlags.slowMoActive`) mas como flag **temporária** e local ao Swirl.
- Um timer `state.swirlSlowMoMs` que decresce a cada frame. Enquanto `> 0`, o `dt` global é multiplicado por `0.15`.
- **Interação com debug slowMo**: se o debug slowMo já estiver ligado, os dois se **multiplicam** (`dt * 0.25 * 0.15`). Pode dar um efeito bizarro em teste — aceitável.
- **FOV**: reaproveitar o mesmo mecanismo de `rail.js` que faz o FOV de boost. Mas o Swirl **sobrescreve** com sua própria curva durante a cutscene, voltando ao controle de boost depois.

**Nada disso para o jogo de verdade** — o update continua rodando normalmente, só com `dt` escalado. Inimigos continuam se movendo devagar, projéteis inimigos continuam voando devagar, tudo normal, só em câmera lenta.

### 4.6 Speedlines

Durante o slow-mo (mesmos 0.45s), as **speedlines** do HUD (as mesmas usadas pelo boost, `hud.setMotionLines(true)`) ficam ativas com **intensidade máxima**, independente do jogador estar boostando ou não.

Detalhes:

- Reaproveitar `hud.setMotionLines`.
- Um parâmetro adicional `intensity` (0..1) que modula a opacidade das linhas via CSS custom property.
- No Swirl: `hud.setMotionLines(true, 1.0)`.
- Ao fim da cutscene: `hud.setMotionLines(player.isPropulsionActive())` — volta ao estado normal.

Se preferir isolamento visual, dá pra criar um efeito próprio (`hud.setSwirlSpeedlines(active)`) com linhas mais grossas/vermelhas — mas reaproveitar é mais barato e visualmente coerente.

### 4.7 Som

Novo Sound Cue em `audio-cues.js` (`PLAYER_SOUND_CUES.swirl_blast_fire`):

| Campo | Valor |
|---|---|
| id | `'player_swirl_blast_fire'` |
| durationMs | 1400 |
| delayMs | 0 |
| cooldownMs | 500 |
| volume | 1.0 |
| category | `'sfx'` |
| spatial | `false` |
| loop | `false` |
| triggerLogic | `'Disparo do Swirl Blast — whoosh agudo + zumbido crescente de perfuração, sustentado por ~1.4s enquanto o projétil viaja'` |

Sugestão temática: whoosh agudo + sustain metálico grave + leve reverb. Idealmente **junto com a cutscene de slow-mo**, o som "entra em câmera lenta" também (pitch shift down durante o slow-mo, volta ao normal com o resto).

---

## 5. Cartas "Vínculo: Swirl Blast" (conteúdo opcional de progressão)

Como o Swirl é **habilidade base** (§3.0), o cooldown de 12s é fixo. Cartas "Vínculo: Swirl Blast" são o **conteúdo de progressão** — reduzem o cooldown, dando ao jogador uma escolha de build (investir em Swirl mais frequente vs outras cartas ofensivas/defensivas).

Adicionar em `roguelike.js`:

```js
{
  id: 'swirl-blast-cooldown',
  category: 'ofensivo',
  label: 'Vínculo: Swirl Blast',
  icon: '🌀',
  description: 'Reduz o cooldown do Swirl Blast em 15%. Pode ser pega múltiplas vezes (piso de 6s).',
}
```

Regras:

- Cada aplicação multiplica `swirlCooldownMult *= 0.85`.
- Piso em `0.5` (metade do cooldown base), ou seja, **cooldown mínimo de 6s**.
- Sem exclusão por "já pega" — é stackável até o piso.
- Sem restrição de "só aparece se X" — sempre pode aparecer.

---

## 6. Mapa de alterações por arquivo

### 6.1 `src/player.js`

**Variáveis no topo do arquivo** (§7) e:

- [ ] Adicionar `let swirlCooldownMs = 0` e `let swirlCooldownMult = 1` no estado do player.
- [ ] Adicionar `case 'swirl-blast-cooldown': swirlCooldownMult = Math.max(0.5, swirlCooldownMult * 0.85); break` no `applyCard`.
- [ ] Adicionar `swirlCooldownMult = 1; swirlCooldownMs = 0` no `resetCards`.
- [ ] Expor getters:
  - `getSwirlCooldownMs: () => swirlCooldownMs`
  - `getSwirlCooldownTotalMs: () => SWIRL_COOLDOWN_MS * swirlCooldownMult`
  - `isSwirlReady: () => swirlCooldownMs <= 0`
- [ ] Expor `startSwirlCooldown()` que seta `swirlCooldownMs = SWIRL_COOLDOWN_MS * swirlCooldownMult`.
- [ ] No `update(dt)`, decrementar `swirlCooldownMs = Math.max(0, swirlCooldownMs - dt * 1000)`.
- [ ] No `debugMaxBuffs`, `swirlCooldownMs = 0` (Swirl sempre pronto no debug).

### 6.2 `src/rail.js`

- [ ] Expor `isFullSpinActive: () => fullSpinT < 1` no retorno do `createRailController`. (Uma linha.)

### 6.3 `src/combat/projectiles.js`

**Todas as constantes do Swirl no topo do arquivo**, comentadas (§7) e:

- [ ] Adicionar geometrias/materiais compartilhados (`swirlCoreGeo`, `swirlRingGeo`, `swirlAuraGeo`, `swirlTipGlowGeo`, materiais correspondentes) — todos `AdditiveBlending`.
- [ ] Adicionar `buildSwirlBlastMesh()` que devolve o Group montado.
- [ ] Adicionar `fireSwirlBlast(origin, direction)` — cria o mesh, empurra o projétil no array com `isPiercing: true` e `piercedTargets: new Set()`, chama `effects.swirlBlastFlash`, toca o Sound Cue.
- [ ] Expor `fireSwirlBlast` no retorno.
- [ ] No `update()`, adicionar branch no topo do loop: `if (projectile.isPiercing) { ... }`, com:
  - (a) sem `homingTarget`, sem steer, sem magnet;
  - (b) chama `enemies.resolvePiercingProjectileHits(...)` (ver §6.4) que devolve array de hits;
  - (c) para cada hit, empurra em `hitsLog`, contabiliza kills/points;
  - (d) **não remove o projétil** — continua até `life <= 0` ou `traveled > MAX_RANGE`;
  - (e) exceção: se o hit for **boss/golden/fragata/escudo-do-boss**, remove o projétil e dispara `effects.swirlBlastExplosion(position, direction)`.
- [ ] Após o update de posição, aplicar `mesh.rotation.z += SWIRL_SPIN_RATE * dt`.
- [ ] A cada `SWIRL_AFTERIMAGE_INTERVAL`, chamar `effects.swirlAfterimage(...)`.
- [ ] `dispose()` — descartar todas as geometrias novas.

### 6.4 `src/enemies/index.js`

- [ ] Adicionar `resolvePiercingProjectileHits(prevPos, currPos, meta = {})` no retorno do sistema.
- [ ] A função itera `enemies`, calcula `distanceToSegment`, aplica `hitRadiusFor(e) + hitBuffer`, **pula IDs já em `piercedTargets`**, aplica dano em cada alvo válido, marca o ID no Set, e devolve **array de hits** (não um único hit).
- [ ] **Ignora escudos** (chefe ativo / fragata) — Swirl não é bloqueado, exceto pelo caso específico do escudo do chefe (§3.2.4).
- [ ] **Detritos**: aplica `kill` direto, sem checar HP (§3.2.1). Marca `killed: true` no hit e soma pontos.
- [ ] **Boss/chefe com escudo**: se `enemy.kind === BOSS_KIND && enemy.isShieldActive`, desativa o escudo (`enemy.isShieldActive = false`, `enemy.shieldMesh.visible = false`), aplica 6 de dano, retorna o hit com flag `destroyedShield: true` e sinaliza para o chamador **parar o projétil**.
- [ ] **Boss/dourado/fragata sem escudo**: aplica 6 de dano e retorna o hit com flag `stopProjectile: true`.
- [ ] Demais inimigos: aplica 6 de dano e retorna hit sem flag de parada.
- [ ] Manter a lógica de morte idêntica à de `resolveProjectileHit` (kill points, `triggerHordaSplitIfNeeded`, `severChainAt` para verme, sons de morte).
- [ ] Para o dourado (vive em `golden.js`), adicionar `golden.resolvePiercingHit(prevPos, currPos, piercedTargets)` — mesma lógica, Set próprio.

### 6.5 `src/game-loop.js`

- [ ] Adicionar `state.swirlSlowMoMs = 0` no `mount-game.js` (é onde `state` nasce).
- [ ] No branch de release do fogo (onde hoje está `if (isCharging) { ... }`):

```js
if (isCharging) {
  const isMaxCharge = state.fireHeldMs >= player.config.homingChargeMaxMs
  const canSwirl = isMaxCharge
    && rail.isFullSpinActive()
    && player.isSwirlReady()
  if (canSwirl) {
    combat.fireSwirlBlast(nosePos, _fireDirection)
    player.startSwirlCooldown()
    state.swirlSlowMoMs = SWIRL_SLOW_MO_MS  // 450
    // FOV bump — curto, com retorno automático
    state.swirlFovBumpMs = SWIRL_FOV_BUMP_MS  // 300
  } else {
    combat.fireHomingShot(nosePos, currentHomingAllowedTargets(state.fireHeldMs), isMaxCharge)
  }
}
```

- [ ] Aplicar o time scale no topo do frame:

```js
const baseDt = state.debugFlags.slowMoActive ? rawDt * 0.25 : rawDt
const swirlSlowDt = state.swirlSlowMoMs > 0 ? baseDt * SWIRL_SLOW_MO_FACTOR : baseDt
state.swirlSlowMoMs = Math.max(0, state.swirlSlowMoMs - rawDt * 1000)
const dt = swirlSlowDt
```

- [ ] FOV bump: enquanto `state.swirlFovBumpMs > 0`, sobrepor `camera.fov = 70 + bumpCurve(...)` e `camera.updateProjectionMatrix()`.
- [ ] Speedlines: `hud.setMotionLines(true, 1.0)` no disparo; ao fim do slow-mo, `hud.setMotionLines(player.isPropulsionActive())`.

### 6.6 `src/hud-game.js`

- [ ] Modificar `setMotionLines(active, intensity = null)` — quando `intensity` for passado, setar `style.setProperty('--intensity', intensity)` no `motionLines`.
- [ ] (Opcional) Adicionar `setSwirlReady(active)` para HUD — não obrigatório, o feedback fica no charge glow (§4.2 do doc, no `effects.setChargeGlow`).

### 6.7 `src/effects.js`

- [ ] Adicionar função `swirlBlastFlash(position, direction)` — cone + anel de choque + 2 anéis de sucção.
- [ ] Adicionar função `swirlAfterimage(position, quaternion)` — cópia do mesh do swirl com opacidade decrescente.
- [ ] Adicionar função `swirlBlastExplosion(position, direction)` — vórtice expandindo + burst azul (usada em impacto contra boss/escudo).
- [ ] Adicionar arrays próprios em `createEffectsSystem` e processá-los no `update()`.
- [ ] `dispose()` — descartar geometrias/materiais novos.

### 6.8 `src/audio-cues.js`

- [ ] Adicionar `swirl_blast_fire` em `PLAYER_SOUND_CUES` (ver §4.7).

### 6.9 `src/roguelike.js`

- [ ] Adicionar a carta `swirl-blast-cooldown` em `ROGUELIKE_CARDS` (ver §5).

### 6.10 `src/main-constants.js`

- [ ] Adicionar `SWIRL_SLOW_MO_MS`, `SWIRL_SLOW_MO_FACTOR`, `SWIRL_FOV_BUMP_MS`, `SWIRL_FOV_TARGET`, `SWIRL_COOLDOWN_MS` (constantes de timing global). As outras constantes ficam em `projectiles.js` (§7).

### 6.11 `src/mount-game.js`

- [ ] Adicionar `swirlCooldownMs: 0`, `swirlSlowMoMs: 0`, `swirlFovBumpMs: 0` no `state`.

---

## 7. Constantes — todas no topo do código, todas comentadas

**Regra geral**: toda constante nova deste sistema fica **no topo do arquivo correspondente**, com um comentário explicando o que ela faz. Isso é pedido explícito do usuário (R7 do feedback).

### `main-constants.js` — constantes globais de timing

```js
// ============ SWIRL BLAST (habilidade base) ============
// Cooldown total da habilidade, em ms. Reduzível por cartas "Vínculo: Swirl Blast" (cada uma
// multiplica por 0.85, piso em 6s — ver player.js, swirlCooldownMult).
export const SWIRL_COOLDOWN_MS = 12000

// Duração da cutscene de câmera lenta ao disparar, em ms. É o tempo em que o dt global é
// multiplicado por SWIRL_SLOW_MO_FACTOR, dando o efeito "super attack freeze".
export const SWIRL_SLOW_MO_MS = 450

// Fator de time scale durante a cutscene. 0.15 = 15% da velocidade normal (bem lento, mas
// não congelado — inimigos e projéteis continuam se movendo devagar).
export const SWIRL_SLOW_MO_FACTOR = 0.15

// Duração do FOV bump, em ms. Começa no instante do disparo e dura um pouco menos que o
// slow-mo, pra dar tempo do FOV voltar ao normal antes de tudo descongelar.
export const SWIRL_FOV_BUMP_MS = 300

// FOV alvo no pico do bump. Base do jogo é 70; boost normal sobe pra 84. Swirl sobe pra 95,
// mais agressivo — "você acabou de disparar um super ataque".
export const SWIRL_FOV_TARGET = 95
```

### `combat/projectiles.js` — mecânica do projétil

```js
// ============ SWIRL BLAST — projétil perfurante ============
// Todas as constantes do Swirl Blast num só lugar, comentadas, pra facilitar tuning sem
// caçar valores no meio do código.

// --- Mecânica ---
export const SWIRL_BLAST_SPEED = 520          // velocidade em u/s (~2x o tiro normal de 260)
export const SWIRL_BLAST_DAMAGE = 6           // dano por alvo atingido (requisito R4)
export const SWIRL_BLAST_LIFETIME = 8         // segundos de vida (mesmo do tiro normal)
export const SWIRL_BLAST_MAX_RANGE = 700      // alcance máximo em u (mesmo do tiro normal)
export const SWIRL_BLAST_HIT_BUFFER = 0.4     // folga extra no raio de acerto (maior que o tiro normal)

// --- Visual do projétil ---
export const SWIRL_COLOR = 0x2b8fff           // azul (mesma família do tiro carregado máximo)
export const SWIRL_SPIN_RATE = 18             // rad/s — giro do mesh em torno do próprio eixo
export const SWIRL_AFTERIMAGE_INTERVAL = 0.03 // segundos entre cada afterimage deixado pra trás
export const SWIRL_CORE_RADIUS = 0.6          // raio do cone do core
export const SWIRL_CORE_LENGTH = 3.6          // comprimento do cone do core
export const SWIRL_RING_RADIUS = 0.75         // raio dos 3 anéis do vórtice
export const SWIRL_RING_TUBE = 0.12           // espessura do tubo dos anéis
export const SWIRL_RING_OFFSETS = [-1.1, 0.0, 1.1] // posições Z dos 3 anéis ao longo do comprimento
export const SWIRL_AURA_RADIUS = 1.1          // raio da esfera de aura
export const SWIRL_TIP_GLOW_RADIUS = 0.35     // raio da esfera brilhante na ponta dianteira
```

### `effects.js` — flash, afterimage, explosão

```js
// ============ SWIRL BLAST — efeitos visuais ============
// Flash de disparo (substitui o muzzle flash normal quando o Swirl dispara), afterimage da
// trilha de vórtice, e explosão contra boss/escudo.

export const SWIRL_FLASH_DURATION = 0.28      // duração total do flash de disparo (dobro do normal)
export const SWIRL_FLASH_RING_SCALE = 3.0     // escala do anel de choque (3x o muzzle flash normal)
export const SWIRL_AFTERIMAGE_DURATION = 0.5  // duração de cada fantasma na trilha
export const SWIRL_EXPLOSION_DURATION = 0.6   // duração da explosão contra boss/escudo
export const SWIRL_EXPLOSION_RADIUS = 2.5     // raio visual da explosão (não é raio de dano — dano é sempre 6 fixo)
```

---

## 8. Prototipação — passo a passo

### Etapa 1 — Mecânica sem visual

1. `player.js`: adicionar cooldown `swirlCooldownMs`, `isSwirlReady()`, `startSwirlCooldown()`.
2. `rail.js`: expor `isFullSpinActive()`.
3. `game-loop.js`: só detecção — `console.log('SWIRL BLAST!')` quando as 3 condições batem, e chamar `fireHomingShot` mesmo assim (não quebra nada).
4. Testar manualmente as 4 combinações de estado (com/sem giro × com/sem carga máx × com/sem cooldown expirado).

### Etapa 2 — Projétil placeholder + mecânica de perfuração

5. `projectiles.js`: `fireSwirlBlast` cria um **cubo grande azul** com `isPiercing: true`. Nada de visual bonito ainda.
6. `enemies/index.js`: `resolvePiercingProjectileHits` — testar com 3-4 blasters alinhados, todos tomam 6.
7. `game-loop.js`: chamar `combat.fireSwirlBlast` de verdade.

### Etapa 3 — Regras especiais

8. Detritos: matar sempre, independente de HP.
9. Boss/escudo: parar o projétil e desativar escudo.
10. Boss/dourado/fragata: parar o projétil.
11. Inimigos comuns: não parar.

### Etapa 4 — Visual do projétil

12. Substituir o cubo pelo Group de vórtice (§4.1).
13. Ajustar cor, escala, spin rate até parecer "drill".

### Etapa 5 — Flash, afterimage, explosão

14. `effects.js`: `swirlBlastFlash`, `swirlAfterimage`, `swirlBlastExplosion`.
15. Testar visual com `slowMo` ativo.

### Etapa 6 — Cutscene de slow-mo + FOV + speedlines

16. `game-loop.js`: time scale, FOV bump, speedlines.
17. Ajustar números de §7 até o efeito ficar "épico" sem ser enjoativo.

### Etapa 7 — Cartas e polimento

18. `roguelike.js`: carta "Vínculo: Swirl Blast".
19. `audio-cues.js`: Sound Cue.
20. Ajuste fino contra chefes, dourado, horda, fragata.

---

## 9. Edge cases e bugs prováveis

| Caso | Comportamento esperado | Como evitar |
|---|---|---|
| **Giro dá cooldown antes do Swirl completar** | Swirl **não dispara** se `player.isSwirlReady()` for false. Só o giro normal acontece, sem Swirl. | §3.1 |
| **Cooldown reduzido por cartas até o piso** | Piso em 6s (`swirlCooldownMult = 0.5`). Nada abaixo disso. | §5 |
| **Swirl disparado durante frenesi** | Swirl **substitui** o tiro do frenesi no frame do disparo. | §3.3 |
| **Swirl disparado com `projectileCount > 1`** | Sempre sai **1 Swirl só**. Não é spray. | Não iterar por `projectileCount` em `fireSwirlBlast` |
| **Swirl atravessa todo mundo e não mata ninguém** | Correto — um Swirl pode causar 6 dano em cada um de 5 inimigos = 30 dano total. | — |
| **Swirl encontra detrito titânico com 40 HP** | Morre instantaneamente, independente de HP. Regra absoluta (§3.2.1). | — |
| **Swirl encontra chefe com escudo ativo** | Escudo é destruído, chefe toma 6, projétil some. | §3.2.4 |
| **Swirl encontra chefe sem escudo** | 6 de dano, projétil some. | §3.2.3 |
| **Swirl encontra dourado** | 6 de dano, projétil some. | §3.2.3 |
| **Swirl encontra fragata com placa bloqueando** | Ignora a placa, causa 6 de dano, projétil some. | §3.2.3 |
| **Swirl ativa slow-mo enquanto debug slowMo já está ligado** | Os dois se multiplicam (`dt * 0.25 * 0.15`). Efeito estranho, mas não trava. | Aceitável |
| **Swirl disparado durante a decolagem** | Fase `launchCutscene` não lê release do fogo. Não dispara. | Comportamento correto |
| **Swirl disparado quando nave já está `dying`** | Não chega aqui — `endSector()` já rodou. | Se acontecer, bug de desmontagem |
| **Speedlines ficam presas em `active` após o disparo** | Ao fim do slow-mo, `hud.setMotionLines(player.isPropulsionActive())` restaura. | §4.6 |
| **Duplo disparo no mesmo frame** | Flag `state.swirlFiredThisFrame` bloqueia segundo disparo. | Só se ocorrer em teste |

---

## 10. Validação / testes

Adicionar em `selftest.mjs`:

### 10.1 Detecção de gatilho

```js
function shouldFireSwirl({ isCharging, isMaxCharge, isSpinning, isReady }) {
  return isCharging && isMaxCharge && isSpinning && isReady
}

assert.strictEqual(shouldFireSwirl({ isCharging: true, isMaxCharge: true, isSpinning: true, isReady: true }), true)
assert.strictEqual(shouldFireSwirl({ isCharging: true, isMaxCharge: true, isSpinning: true, isReady: false }), false, 'Cooldown ativo bloqueia')
assert.strictEqual(shouldFireSwirl({ isCharging: true, isMaxCharge: true, isSpinning: false, isReady: true }), false, 'Sem giro não dispara')
assert.strictEqual(shouldFireSwirl({ isCharging: true, isMaxCharge: false, isSpinning: true, isReady: true }), false, 'Sem carga máx não dispara')
```

### 10.2 Perfuração

```js
function simulateSwirlHits(prev, curr, enemies, piercedTargets) {
  const hits = []
  for (const e of enemies) {
    if (piercedTargets.has(e.id)) continue
    const d = distanceToSegment2D(e.pos, prev, curr)
    if (d > e.hitRadius) continue
    piercedTargets.add(e.id)
    hits.push(e.id)
  }
  return hits
}

const alvos = [
  { id: 1, pos: [0, 0, 10], hitRadius: 1 },
  { id: 2, pos: [0, 0, 20], hitRadius: 1 },
  { id: 3, pos: [0, 0, 30], hitRadius: 1 },
]
const pierced = new Set()
const h1 = simulateSwirlHits([0, 0, 0], [0, 0, 15], alvos, pierced)
assert.deepStrictEqual(h1, [1])
const h2 = simulateSwirlHits([0, 0, 15], [0, 0, 35], alvos, pierced)
assert.deepStrictEqual(h2, [2, 3])
```

### 10.3 Detrito morre sempre

```js
function simulateSwirlHitOnDetrito(hp) {
  // Regra: detrito é sempre destruído, independente do HP
  return { killed: true, hpRestante: 0 }
}
assert.deepStrictEqual(simulateSwirlHitOnDetrito(3), { killed: true, hpRestante: 0 })
assert.deepStrictEqual(simulateSwirlHitOnDetrito(50), { killed: true, hpRestante: 0 }, 'Detrito titânico morre igual')
```

### 10.4 Cooldown reduzível

```js
function computeSwirlCooldown(baseMs, applications) {
  const mult = Math.max(0.5, Math.pow(0.85, applications))
  return baseMs * mult
}
assert.strictEqual(computeSwirlCooldown(12000, 0), 12000)
assert.strictEqual(Math.round(computeSwirlCooldown(12000, 1)), 10200)
assert.strictEqual(Math.round(computeSwirlCooldown(12000, 5)), 6000)
assert.strictEqual(Math.round(computeSwirlCooldown(12000, 10)), 6000, 'Piso em 6s')
```

### 10.5 Manual

- [ ] Swirl destrói detrito comum em 1 hit.
- [ ] Swirl destrói detrito titânico em 1 hit (spawnar via debug `spawnTitanic`).
- [ ] Swirl contra chefe sem escudo → 6 de dano, projétil some.
- [ ] Swirl contra chefe com escudo → escudo some, chefe toma 6, projétil some.
- [ ] Swirl contra fragata com placa → ignora placa, 6 de dano.
- [ ] Swirl contra dourado → 6 de dano, some.
- [ ] Slow-mo dispara visível por ~0.45s.
- [ ] FOV sobe visivelmente e volta.
- [ ] Speedlines aparecem durante o slow-mo e somem depois (ou mantêm se o jogador estiver em boost).
- [ ] Cooldown de 12s é respeitado — não dá pra disparar dois Swirls seguidos sem esperar.

---

## 11. Notas de design (para discussão antes de implementar)

1. **Perfurar escudo é muito forte?** — o Swirl é a "chave" do chefe. Recomendo **começar sem balanceamento** — é pra ser o payoff do combo mais difícil do jogo. Ajustar depois de 5-10 partidas.

2. **Frenesi e Swirl** — decidi que o Swirl substitui o tiro do frenesi no frame. Alternativa: Swirl no centro + 2 tiros normais laterais (frenesi preservado). Se em teste ficar "vazio" demais (só 1 projétil saindo), mudar pra alternativa.

3. **Slow-mo de 450ms é muito tempo?** — é o comprimento exato do giro visual. Se em teste parecer longo demais, reduzir pra 300ms (mas aí o giro termina depois do slow-mo, o que quebra a leitura). Melhor manter em 450 e ajustar `FULL_SPIN_DURATION` se for o caso.

4. **FOV 95 é extremo?** — a base é 70, o boost normal é 84. 95 é bem agressivo. Se ficar desconfortável, reduzir pra 88-90. Ajustar em teste.

5. **A aura extra do projétil** (`SWIRL_AURA_RADIUS = 1.1`) pode deixar o projétil visualmente "gordo" demais contra inimigos pequenos (mini-swarm tem hitRadius ~2.4). Se em teste ficar desproporcional, reduzir pra 0.9.

6. **Investigar o bug do escudo do chefe (§3.2.5) antes de implementar o Swirl** — se o escudo nunca ativa, o teste "Swirl destrói escudo" é impossível de validar em jogo. Ação paralela: abrir ticket de investigação.

---

*Fim do documento.*