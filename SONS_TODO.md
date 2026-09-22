# Checklist de Sons Necessários — Star Anki

## Estado da integração — v0.99.16

O jogo agora possui um reprodutor real (`src/audio.js`): respeita volume, atraso e cooldown de
cada cue, pré-carrega os arquivos atribuídos e encerra corretamente o loop da carga quando o
botão de tiro é solto. Cada cue sem arquivo recebe um sinal sintético curto e discreto como
**fallback provisório** (incluindo um bip de rádio para cues de voz); isso evita eventos mudos,
mas não substitui efeitos finais nem vozes gravadas.

Arquivos cujo nome deixa a função clara e já foram conectados:

| Arquivo | Evento no jogo |
| --- | --- |
| `Disparo generico.mp3` | tiro normal do jogador, laser dos aliados e salva de apoio |
| `Disparo carregado carregando.mp3` | loop de carregamento do tiro teleguiado |
| `disparo carregado disparo.mp3` | lançamento do tiro carregado/teleguiado |
| `explosao disparo completamente carregado.mp3` | explosão em área da carga máxima |
| `ricochete carta contato pulo.mp3` | carta Ricochete |
| `som disparo swirl.mp3` | Swirl Blast |
| `inimigo disparo generico.mp3` | disparo de Blaster, Tank e inimigos genéricos |
| `Laser boss.mp3` | carregamento/telegraph dos lasers normal e dourado, junto dos círculos de mira |
| `som mira disparo laser boss dourado.mp3` | disparo liberado dos lasers normal e dourado, após o telegraph |
| `Teleporte dourado.mp3` | sumiço/aparição da Anomalia Dourada |
| `Radio connect.mp3` / `Radio disconnect.mp3` | abertura/saída de toda transmissão de rádio dos aliados |

Arquivos mantidos propositalmente sem atribuição até que você diga o que são: `angry-birds-space-
bomb-explosion-sound.mp3`, `explode_WHu7g6E.mp3`, `numbers-lore-explosion-sound-effect.mp3`,
`rebel-blaster.mp3`, `s1_ca-online-audio-converter.mp3` e `shotgun-blasting-intimidator.mp3`.
Eles não foram encaixados por suposição só pelo nome em inglês.

## Como usar

O checklist foi criado quando o jogo ainda não reproduzia sons. A integração inicial já está
descrita acima; os itens em branco abaixo continuam sendo a fonte de verdade para os efeitos
finais que ainda precisam de arquivo próprio. A pasta `sons/` contém os arquivos enviados — os
nomes ambíguos continuam sem encaixe automático para não introduzir uma associação errada.

Preencha o campo `Arquivo:` de cada item com o nome do arquivo (dentro de
`sons/` ou de uma subpasta nova, se preferir organizar por categoria) e me
mande de volta. Pode deixar itens em branco — implemento só o que vier
preenchido, e o resto fica pendente pra depois. Prioridade é só uma sugestão de
por onde começar, não elimina os itens marcados como Opcional.

**Prioridade**: 🔴 Essencial (o jogo fica estranho sem) · 🟡 Importante (some
falta perceptível) · ⚪ Opcional (polimento/ambiente).

---

## A. Jogador — Armas

- [ ] 🔴 **Tiro normal** (disparo do canhão blaster, toca a cada disparo) — sugestão: `sniper-blaster.mp3`/`rebel-blaster.mp3`/`laserr.mp3` (escolher 1). Arquivo:
- [ ] 🟡 **Carregando o tiro teleguiado** (loop curto/crescente enquanto segura o botão). Arquivo:
- [ ] 🟡 **Carga máxima pronta** (chime/aviso ao atingir 100% da carga). Arquivo:
- [ ] 🔴 **Disparo do tiro carregado/teleguiado saindo**. Arquivo:
- [ ] 🟡 **Impacto do tiro carregado num alvo**. Arquivo:
- [ ] ⚪ **Ricochete** (tiro pulando pro próximo alvo) — sugestão: `star-wars-ricochet.mp3`. Arquivo:
- [ ] ⚪ **Deflexão de projétil** (giro rebatedor destruindo tiro inimigo e reenviando). Arquivo:
- [ ] ⚪ **Frenesi de Foco ativado** (coleta de micro-orbe, tiro triplo acelerado). Arquivo:
- [ ] 🟡 **Explosão em área** (estouro da carga máxima) — sugestão: `undertale-bomb-explosion.mp3`/`angry-birds-space-bomb-explosion-sound.mp3`. Arquivo:

## B. Jogador — Manobras

- [ ] 🔴 **Giro completo / Barrel roll** (dodge Z/C). Arquivo:
- [ ] 🟡 **Propulsor (boost) — ignição**. Arquivo:
- [ ] ⚪ **Propulsor — loop enquanto sustentado**. Arquivo:
- [ ] 🟡 **Freio reverso (repulsão) — ignição**. Arquivo:
- [ ] 🟡 **Impulso aríete** (colisão RAM contra um inimigo, com a carta ativa). Arquivo:

## C. Jogador — Vida / Escudo / Dano

- [ ] 🔴 **Escudo absorve um hit**. Arquivo:
- [ ] 🟡 **Escudo se esgota** (chega a zero). Arquivo:
- [ ] ⚪ **Escudo recarrega** (som sutil ao voltar a encher sozinho). Arquivo:
- [ ] 🔴 **Dano direto à vida** (hit sem escudo pra absorver). Arquivo:
- [ ] ⚪ **Vida baixa / crítico** (loop de aviso enquanto a vida está no vermelho). Arquivo:
- [ ] 🟡 **Perda de uma vida inteira** (não só HP). Arquivo:
- [ ] ⚪ **Cura** (heal). Arquivo:
- [ ] ⚪ **Vida extra concedida** (carta extra-life). Arquivo:
- [ ] 🔴 **Morte / Game Over** (última vida perdida). Arquivo:

## D. Inimigos — Genérico (vale pra maioria)

- [ ] 🔴 **Disparo genérico de inimigo** (Blaster/Tank/Ampulheta-normal) — sugestão: `enemy blast.mp3`/`lego-star-wars-droid-trifighter-blaster2.mp3`. Arquivo:
- [ ] ⚪ **Telegraph de disparo inimigo** (aviso visual ~0.3s antes — som curto de "carregando"). Arquivo:
- [ ] 🔴 **Impacto de tiro inimigo na nave do jogador**. Arquivo:
- [ ] 🟡 **Inimigo atingido sem morrer** (hit não-letal, genérico). Arquivo:
- [ ] 🔴 **Inimigo destruído** (explosão de morte, genérica p/ naves pequenas) — sugestão: `explode_WHu7g6E.mp3`. Arquivo:
- [ ] 🟡 **Colisão kamikaze** (inimigo se destrói ao simplesmente tocar a nave, sem aríete). Arquivo:
- [ ] ⚪ **Squad wipe** (bônus por eliminar um esquadrão inteiro de Blasters). Arquivo:

## E. Inimigos — Específicos por classe

- [ ] ⚪ **Blaster: asa quebrando** (hit não-letal específico, antes de entrar em parafuso). Arquivo:
- [ ] ⚪ **Mini-Swarm: telegraph de mergulho** (pulso de aviso antes do dive). Arquivo:
- [ ] ⚪ **Mini-Swarm: whoosh do mergulho**. Arquivo:
- [ ] ⚪ **Ampulheta (Time): tique-taque ambiente** (giro contínuo). Arquivo:
- [ ] 🟡 **Ampulheta: bônus de redução de tempo** (chime ao morrer). Arquivo:
- [ ] 🟡 **Ampulheta Mega: disparo de laser**. Arquivo:
- [ ] 🟡 **Detrito: destruição de asteroide** (estilhaço, diferente de explosão de nave) — sugestão: `numbers-lore-explosion-sound-effect.mp3`. Arquivo:
- [ ] ⚪ **Detrito Titânico: destruição colossal** (mais grave/reverb que o normal). Arquivo:
- [ ] 🟡 **Sentinela: disparo da moldura**. Arquivo:
- [ ] 🟡 **Sentinela: pulso da moldura** (tick rítmico enquanto abre/fecha). Arquivo:
- [ ] 🔴 **Sentinela: moldura fecha com o jogador dentro** (impacto do dano). Arquivo:
- [ ] ⚪ **Sentinela: fuga** (empina e sai depois do 4º disparo). Arquivo:
- [ ] 🟡 **Fragata: escudo bloqueando um tiro** (clang metálico/energia). Arquivo:
- [ ] ⚪ **Fragata: giro da placa** (ambiente mecânico contínuo). Arquivo:
- [ ] ⚪ **Verme: elo sendo destruído** (corrente se partindo). Arquivo:
- [ ] ⚪ **Enxame-Ímã: campo magnético** (hum ambiente contínuo). Arquivo:
- [ ] ⚪ **Enxame-Ímã: tiro do jogador sendo desviado** (whoosh distorcido). Arquivo:
- [ ] ⚪ **Sussurro: pulso de visibilidade** (ping sutil ao alternar visível/tênue). Arquivo:
- [ ] 🟡 **Sussurro: invoca reforços**. Arquivo:
- [ ] ⚪ **Réplica: materialização** (eco aparecendo, já que espelha o jogador com atraso). Arquivo:

## F. Chefe (Boss)

- [ ] 🟡 **Chefe: entrada na arena**. Arquivo:
- [ ] 🔴 **Chefe: rajada (volley)**. Arquivo:
- [ ] 🟡 **Chefe: telegraph do laser** (carregando). Arquivo:
- [ ] 🔴 **Chefe: disparo do laser**. Arquivo:
- [ ] 🟡 **Chefe: escudo ativando**. Arquivo:
- [ ] 🟡 **Chefe: escudo bloqueando/refletindo um tiro**. Arquivo:
- [ ] 🔴 **Chefe: transição de fase** (1→2, 2→3). Arquivo:
- [ ] 🟡 **Chefe: impacto crítico** (hit forte, diferente do hit comum). Arquivo:
- [ ] 🔴 **Chefe: morte/explosão final** (sequência de 3 estouros). Arquivo:

## G. Anomalia Dourada

- [ ] 🟡 **Dourado: entrada na arena**. Arquivo:
- [ ] 🟡 **Dourado: rajada reta**. Arquivo:
- [ ] 🟡 **Dourado: lançamento de mini-nave teleguiada**. Arquivo:
- [ ] 🟡 **Dourado: telegraph + disparo do laser grande**. Arquivo:
- [ ] 🟡 **Dourado: dash evasivo** (whoosh rápido). Arquivo:
- [ ] 🔴 **Dourado: teleporte** (sumiço + reaparição). Arquivo:
- [ ] 🔴 **Dourado: morte cataclísmica** (explosão grande + whiteout). Arquivo:

## H. Esquadrão (Wingmen)

- [ ] 🟡 **Wingman: disparo de laser**. Arquivo:
- [ ] ⚪ **Wingman: disparo de apoio sincronizado** (junto com o tiro do jogador — pode reusar o item acima). Arquivo:
- [ ] ⚪ **Wingman: engajando em combate** (entrando em dogfight). Arquivo:
- [ ] ⚪ **Wingman: passagem cinematográfica** (flyby). Arquivo:
- [ ] 🟡 **Wingman abatido**. Arquivo:
- [ ] ⚪ **Alternar comando do esquadrão** (foco/livre — bip de confirmação). Arquivo:
- [ ] 🟡 **Habilidade única — Falco: Investida Aríete**. Arquivo:
- [ ] 🟡 **Habilidade única — Peppy: Guarda**. Arquivo:
- [ ] 🟡 **Habilidade única — Slippy: Reparo de Campo**. Arquivo:
- [ ] 🟡 **Habilidade única — Phantom: Carga Compartilhada**. Arquivo:
- [ ] ⚪ **Habilidade do esquadrão pronta** (cooldown zerou, ícone acende). Arquivo:

## I. Eventos de Ambiente

- [ ] 🟡 **Tempestade de detritos — alerta/início**. Arquivo:
- [ ] ⚪ **Tempestade de detritos — fim/superada**. Arquivo:
- [ ] ⚪ **Relâmpago iônico** (ambiente esporádico). Arquivo:
- [ ] ⚪ **Estrela cadente cruzando** (ambiente). Arquivo:

## J. Cutscenes e Transições

- [ ] 🟡 **Decolagem — ignição do motor**. Arquivo:
- [ ] ⚪ **Decolagem — boost final até o combate**. Arquivo:
- [ ] 🟡 **Entrada na arena** (cutscene de transição pro Chefe/Dourado). Arquivo:
- [ ] 🟡 **Cutscene de morte do jogador**. Arquivo:
- [ ] ⚪ **Alerta pré-arena** (contagem regressiva de 5s). Arquivo:
- [ ] ⚪ **Transição de setor** (fim de fase, próximo setor). Arquivo:
- [ ] 🟡 **Missão completa** (fim de sessão vitorioso). Arquivo:

## K. Sistema de Perguntas (Anki)

- [ ] ⚪ **Pergunta aparece** (abertura do modal). Arquivo:
- [ ] ⚪ **Cronômetro — tique normal**. Arquivo:
- [ ] 🟡 **Cronômetro urgente** (últimos segundos, tique acelerado/alerta). Arquivo:
- [ ] 🔴 **Resposta correta**. Arquivo:
- [ ] 🔴 **Resposta errada** — sugestão: `sonic-thats-no-good_boV0d2M.mp3`. Arquivo:
- [ ] ⚪ **Botão de Contexto abrindo/fechando**. Arquivo:
- [ ] ⚪ **Painel de Explicação abrindo/fechando**. Arquivo:
- [ ] ⚪ **Combo aumentando** (multiplicador subindo). Arquivo:

## L. Cartas Roguelike

- [ ] 🟡 **Tela de escolha de carta abrindo**. Arquivo:
- [ ] ⚪ **Navegar/passar o mouse entre cartas**. Arquivo:
- [ ] 🔴 **Carta selecionada/adquirida**. Arquivo:

## M. Interface fora do jogo (menus)

- [ ] ⚪ **Clique de botão genérico** (menus). Arquivo:
- [ ] ⚪ **Navegação entre telas** (avançar/voltar). Arquivo:
- [ ] ⚪ **Importar baralho — sucesso**. Arquivo:
- [ ] ⚪ **Importar baralho — erro**. Arquivo:

## N. Música (trilha, não efeito pontual)

- [ ] ⚪ **Tema do menu/pré-jogo** — talvez `sonic-youth-superstar-cutmp3.mp3`? (nome sugere música, não SFX — confirme se é isso mesmo). Arquivo:
- [ ] ⚪ **Loop de combate normal**. Arquivo:
- [ ] ⚪ **Loop de tensão** (dificuldade escalando após erros). Arquivo:
- [ ] ⚪ **Loop de chefe**. Arquivo:
- [ ] ⚪ **Loop da Anomalia Dourada**. Arquivo:
- [ ] ⚪ **Vitória** (fim de sessão bem-sucedida). Arquivo:
- [ ] ⚪ **Derrota** (game over). Arquivo:

---

## Arquivos já na pasta `sons/` sem categoria óbvia ainda

Estes três eu não consegui encaixar com confiança pelo nome — me diga o que são
quando puder, ou já aponte pra qual item da lista acima cada um serve:

- `sabine-blaster-2_9BD3PcR.mp3`
- `lego-star-wars-jango-fett-blaster-sound.mp3` (mais uma variação de tiro — talvez pra um inimigo específico ter som próprio, tipo Tank ou Boss)
- `tmp65ev8a74.mp3`
- `s1_ca-online-audio-converter.mp3`

## Observação sobre implementação (pra depois)

Quando a lista vier preenchida, meu plano é criar um `src/audio.js` novo (mesmo
padrão dos outros sistemas — `createAudioSystem`) com um mapa `id → arquivo` e
métodos tipo `play(id)`/`playLoop(id)`/`stopLoop(id)`, chamado nos pontos
certos de `effects.js`/`combat/*.js`/`enemies/*.js`/`hud-game.js`. Não vou
implementar nada disso agora — só listei o que precisa, como pedido.
