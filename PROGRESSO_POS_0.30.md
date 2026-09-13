# Progresso pós-v0.30 — novas documentações a partir daqui

Continuação do [PROGRESSO.md](PROGRESSO.md) (histórico até v0.33.x, agora congelado). A partir desta
entrega, toda documentação nova entra neste arquivo.

## Classes de inimigo nomeadas + split em `src/enemies/` + 4 conteúdos novos — v0.34.0

Pedido do usuário, em 3 partes: **1)** dar nome formal à classe do vermelho comum atirador
("Blaster") e formalizar que as variações de cor/movimento (entregues na v0.33.0/v0.33.1) são
variantes da MESMA classe, não classes diferentes; **2)** separar cada CLASSE de inimigo (não
cada variação de cor) em seu próprio arquivo, numa pasta `src/enemies/`, pra ficar mais fácil de
editar; **3)** 4 pedaços de conteúdo novo — 2 variações de movimento pro enxame de mini-inimigos,
uma variante grande da ampulheta, um obstáculo cinza destrutível ("Detrito"), e um inimigo
quadrado inédito ("Sentinela").

**Nota de processo importante**: esta entrega rodou em cima de uma árvore MUITO ativa — 3
commits concorrentes (`db7946a`/`279aef0`/`31b554b`, v0.34.0-v0.36.0 numeração deles, sobre o
`enemies.js`/`combat.js`/`player.js`/`main.js` monolíticos antigos) aconteceram DURANTE esta
sessão, incluindo uma mudança que eu precisava de qualquer forma (`player.takeDamage(amount)`
virou variável em vez de sempre 1, para escalar dano por dificuldade — reaproveitei direto pro
meu pedido de "laser da ampulheta mega causa muito dano ao escudo", sem precisar tocar em
`player.js`). Recebi inclusive um aviso via mensagem entre sessões (outra Claude Code rodando no
mesmo projeto) sobre esse risco — cheguei a reler tudo de novo bem na hora certa, então nada do
que a outra sessão fez (teleporte do dourado, multi-lock no chefe/dourado, preview de 5s,
timers/cutscenes da Fase 3) se perdeu; só precisei portar cada pedaço pro arquivo de classe
certo em vez de deixar tudo num `enemies.js` só.

### Arquitetura do split (`src/enemies/`)
Um arquivo por CLASSE (`blaster.js`, `miniSwarm.js`, `timeEnemy.js`, `tank.js`, `boss.js`,
`golden.js`, `detrito.js`, `sentinela.js`, `shared.js` com helpers sem estado) + `index.js`
como orquestrador: mantém os arrays compartilhados (`enemies`, `enemyProjectiles`, `enemyLasers`,
`enemyGates` novo) e o loop principal de `updateEnemies`, despachando movimento/tiro/cor/hp por
`kind` pros arquivos de classe (cada um exporta funções puras: `spawnX`, `updateXMovement`,
`xColor`, `xPassBehind`, `disposeX`). `golden.js` é a exceção — continua com array próprio
(`goldenTargets`) igual já era antes, por ser tratado à parte no `resolveProjectileHit` desde
sempre. `combat.js`/`main.js` trocaram `from './enemies.js'` → `from './enemies/index.js'`
(únicos 2 importadores). `enemies.js` antigo foi apagado, 100% migrado.

### 1. Blaster (renomeação)
`kind: 'red'` → `kind: 'blaster'` em todo canto (era 100% interno, nada fora de `enemies.js`
referenciava a string `'red'` — confirmado por grep antes de mexer). Comportamento idêntico ao
entregue na v0.33.0/v0.33.1 (6 perfis de cor/movimento).

### 2. Mini-swarm: variantes zigue-zague e espiral
`miniSwarm.js`: além do mergulho reto original (cor clara `0xff8080`), 2 variantes novas
sorteadas por spawn (o grupo inteiro usa a mesma): `zigzag` (ciano `0x4de1ff`, offset lateral
senoidal contínuo por cima da reta) e `spiral` (verde-limão `0x9dff4d`, offset circular contínuo
crescendo com o tempo — hélice avançando em linha). HP/velocidade/spawn inalterados.

### 3. Ampulheta mega
`timeEnemy.js`: `spawnTimeEnemyMega()` — escala 1.6×, cor roxa mais rica/escura (`0x7a00e0`),
10 HP (vs 5 da normal — que por sinal já tinha subido de 3→5 num dos commits concorrentes
citados acima). "Fica mais tempo em tela": reaproveita o mesmo truque do perfil `follow` do
Blaster, `PASS_BEHIND` 4× mais tolerante. Ataque: dispara um LASER reto (mesma técnica visual do
laser do chefe) em vez do cone de projétil comum, com `shieldDamage: 4` — suficiente pra estourar
o escudo cheio numa hitada só mesmo com upgrade (`SHIELD_MAX_CAP` é 4). Spawna naturalmente
~20% das vezes que o branch de ampulheta normal dispara (`main.js`, `TIME_ENEMY_MEGA_CHANCE`).

**Plumbing de dano** (pro "muito dano ao escudo" funcionar de verdade): antes, TODO hit no
jogador virava `player.takeDamage()` sem parâmetro, sempre 1 ponto. A própria árvore concorrente
já tinha acabado de mudar `player.takeDamage(amount = 1)` pra escalar com dificuldade por erro
(`enemyDamageValue` em `main.js`) — só faltava threading pra hits ESPECÍFICOS (laser da mega,
borda da moldura da sentinela) declararem seu próprio `shieldDamage` maior. Adicionei: cada
projétil/laser/moldura ganha campo `shieldDamage` (default 1); `updateEnemyProjectiles`/
`updateEnemyLasers`/`updateEnemyGates` (`enemies/index.js`) devolvem `{hits, damage}` (damage =
MAIOR valor do frame, não soma); `combat.js` agrega isso em `enemyDamage` no retorno de
`update()`; `main.js` chama `player.takeDamage(Math.max(enemyDamageValue, events.enemyDamage ||
1))` — nunca deixa a escalada por erro abafar o ataque especial nem o contrário.

### 4. Detrito (obstáculo cinza destrutível)
`detrito.js`: `IcosahedronGeometry` cinza (`0x888888`), rotação inicial aleatória + giro lento
contínuo por vida visual, 6 HP, sem movimento nem tiro (`fireTimer: Infinity`). Spawna em arena
OU trilho. `main.js`: timer PRÓPRIO (`detritoTimer`, 4-8s), decrementado sempre que
`enemiesActive` é true — **sem** checar `spawnPauseThreshold`/`cycleTimer`/`currentEnemyCap()`
(confirmado com o usuário: ignora as duas regras que os outros inimigos seguem). Kill dá bônus
de pontos menor que o normal (`DETRITO_KILL_BONUS = BLASTER_KILL_BONUS / 2`, confirmado).

### 5. Sentinela (inimigo quadrado inédito, só trilho)
`sentinela.js`: nave quadrada azul-aço (`0x3fa9f5`), 10 HP, **só spawna em trilho** (`spawnSenti-
nela` retorna `null` em arena, mesmo guard do mini-swarm). Persegue mantendo distância (reaprovei-
ta o mesmo princípio do perfil `follow` do Blaster — corrige posição pra um "standoff" fixo à
frente, nunca cruza o jogador). Ataque: dispara 4 "molduras" quadradas — 4 caixas formando um
quadro tipo janela (a parte visual PREENCHE de verdade a faixa entre o buraco interno e a borda
externa, não é só um aro fino — importante pro que o jogador vê bater com o que realmente causa
dano). Cada moldura trava a posição do jogador no instante do disparo (mesmo truque do laser do
chefe), viaja até essa distância e resolve UMA VEZ: se a posição atual do jogador (que pode ter
se mexido pra desviar) cai dentro do buraco → seguro; na faixa da borda → dano normal
(`shieldDamage: 1`); além da borda externa → também seguro (errou o alcance). Depois do 4º
disparo, entra em modo "indo embora" (acelera pra trás até sair de tela, sentido oposto ao avanço
do Blaster) e não atira mais. Entra na rotação natural de spawn (`main.js`,
`SENTINELA_SPAWN_CHANCE = 0.12`, mesmo branch de time/mini-swarm/blaster).

### Testado
`node --check` limpo em todo arquivo novo/tocado (`enemies/*.js`, `combat.js`, `main.js`,
`debug.js`) — reconferido de novo no fim, depois de mais 3 arquivos (`effects.js`/`rail.js`/
mais um trecho de `main.js`) mudarem por baixo por causa de uma sessão concorrente adicionando
uma opção nova em `effects.explosion()` (`{rings:true}`), inclusive dentro dos meus arquivos
novos ainda não commitados (`boss.js`, `golden.js`, `index.js`) — puramente aditivo, mantive.
**Testado ao vivo** (servidor estático, debug panel): spawnei cada classe/variante nova (Detrito,
Sentinela, ampulheta mega, mini-swarm 3× até sortear zigue-zague/espiral) sem nenhum erro de
console em nenhum momento — antes/depois de cada spawn, e num reload limpo no final já com tudo
junto (meu trabalho + as mudanças concorrentes). Confirmado por unit-test manual no console do
navegador (`resolveGateHit` importado direto e chamado com casos sintéticos: centro do buraco
seguro, quase-buraco seguro, borda com dano em eixo E diagonal, além do alcance externo seguro —
os 5 casos bateram com o esperado). **Não confirmado por gameplay orgânico completo**: a mesma
limitação de rAF sem foco de SO documentada no resto do histórico do projeto deixou o relógio do
jogo rodar devagar demais pra ver a Sentinela completar as 4 rodadas de disparo ou a ampulheta
mega disparar o laser em tempo real — compensado pelo teste unitário da matemática da moldura
acima e pela revisão cuidadosa do resto do código.

**Versão**: v0.33.1 → v0.34.0.
