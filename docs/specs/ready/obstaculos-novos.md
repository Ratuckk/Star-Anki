# Obstáculos novos — selecionados pra planejamento

## Documento de planejamento (rascunho inicial, pra discussão futura)

4 das 6 ideias originais escolhidas (`Checklist de overhauls pendentes.md`, item 6): Campo de
Minas Estelares, Anel Rotativo, Nuvem de Poeira Densa, Barreira de Energia Setorial. Destroço
Telecomandado e Cristal Instável ficam de fora por ora.

---

## 0. Referência: como o Detrito funciona hoje

Todos os 4 obstáculos abaixo são variações do mesmo papel que o Detrito ocupa hoje
(`src/enemies/detrito.js`) — obstáculo (não IA de combate ofensiva), spawn independente das
regras de pausa de combate normal (comentário em `CLAUDE.md`: "spawn independente das regras de
pausa"). Vale usar o Detrito como molde de convenções técnicas:

- Cinza/neutro visualmente, HP proporcional ao tamanho (`spawnDetrito`, fórmula por `scale`).
- Timer próprio de spawn (`randomDetritoInterval`, `DETRITO_SPAWN_INTERVAL_MIN/MAX_MS`).
- Cada um é uma CLASSE própria — por convenção do projeto (`CLAUDE.md`, `src/enemies/`), cada
  obstáculo novo ganharia seu próprio arquivo em `src/enemies/`, seguindo o padrão de
  `spawnX`/`updateX`/`disposeX` exportado e orquestrado por `enemies/index.js`.
- Escala por nível de dificuldade já tem precedente direto pro Detrito (+1hp/nível só em
  não-titânicos, teto 15) — cada obstáculo novo provavelmente quer seu próprio raciocínio de
  escala (nem todos precisam ganhar HP; alguns podem escalar frequência/velocidade em vez disso).

---

## 1. Campo de Minas Estelares

**Conceito**: pequenas esferas estáticas espalhadas em grade/cluster que não se movem (ao
contrário do Detrito, que pode ter `driftVel`) e explodem em dano de área **tanto ao serem
tocadas pelo jogador QUANTO ao serem atingidas por um tiro** — diferente do Detrito, que só
bloqueia/absorve. Força desviar em vez de simplesmente limpar atirando através.

**Perguntas de design**:
- Raio da explosão e dano — fixo ou escala com nível?
- Reação em cadeia: uma mina explodindo pode detonar minas vizinhas próximas (empilha com a
  ideia do "Cristal Instável" não escolhido, mas pode ser reaproveitada aqui se fizer sentido)?
- Spawnam em grade fixa (padrão legível, "campo minado" de verdade) ou aleatório disperso?
- O jogador pode "limpar o campo" atirando de longe com segurança, ou o raio de explosão é
  grande o bastante pra também ameaçar quem atira de perto?

---

## 2. Anel Rotativo

**Conceito**: uma argola/anel giratório grande que preenche parte do campo de visão — passar
pelo CENTRO (vazado) é seguro, tocar a BORDA (o material do anel em si) causa dano. Mistura o
tema de "moldura com centro seguro" da Sentinela (`sentinela.js`, que dispara molduras
pulsantes com abertura segura no centro), mas como **obstáculo passivo sem IA** — não persegue,
não atira, só gira no lugar (ou desliza lentamente) esperando o jogador acertar o timing de
atravessar.

**Perguntas de design**:
- É totalmente estático de posição (só gira) ou desliza pelo espaço como o Detrito com
  `driftVel`?
- Tamanho do "olho" central vazado — fixo, ou varia (alguns anéis mais generosos, outros mais
  apertados, como variação de dificuldade dentro da própria classe)?
- É destrutível (tem HP, pode ser destruído a tiro pra abrir caminho) ou é puramente ambiental
  (indestrutível, só desviável)? Detrito é destrutível; um obstáculo indestrutível seria uma
  categoria nova no jogo — vale a pena diferenciar.

---

## 3. Nuvem de Poeira Densa

**Conceito**: não causa dano direto, mas ao ser atravessada reduz visibilidade (aumenta a
densidade de fog localmente, efeito temporário) e desacelera levemente a nave (fricção) por
alguns instantes. Obstáculo "soft" — afeta percepção e controle, não HP.

**Perguntas de design**:
- Duração do efeito de desaceleração/fog após sair da nuvem — instantâneo ao sair, ou um
  "resíduo" que persiste por 1-2s?
- Interage com o Overhaul 4 (Fog como mecânica de gameplay, documento já existente em `Docs/`)
  se aquele overhaul for implementado primeiro — poderia reaproveitar a mesma infraestrutura de
  densidade dinâmica de fog em vez de criar um sistema de fog local paralelo. Vale revisitar
  este item depois de decidir o destino do Overhaul 4.
- É uma nuvem "sólida" (tem um volume/hitbox de entrada clara) ou um gradiente difuso sem borda
  definida?

---

## 4. Barreira de Energia Setorial

**Conceito**: uma parede/plano fino que atravessa parte da tela, pulsando entre estado
sólido (dano ao tocar) e atravessável (invisível/inofensiva) em um ciclo previsível — obriga
timing de passagem, tipo uma "porta que abre e fecha". Puramente ambiental, sem HP, sem
IA — só um relógio.

**Perguntas de design**:
- O ciclo sólido/atravessável é sempre no mesmo ritmo (previsível, decorável) ou varia por
  instância (cada barreira tem timing levemente diferente, obrigando leitura visual em vez de
  memorização)?
- Feedback visual do estado — a barreira muda de cor/opacidade claramente entre os dois estados?
  Precisa ser MUITO legível à distância (o jogador precisa decidir "vou passar ou não" com
  antecedência, não em cima da hora).
- Cobre a tela inteira (não dá pra desviar, só timing) ou tem uma abertura fixa em algum ponto
  (combina timing + posicionamento, mais parecido com a Sentinela)?

---

## 5. Observação geral

Os 4 têm uma progressão natural de complexidade de implementação:
**Anel Rotativo** e **Barreira de Energia Setorial** são conceitualmente mais simples (geometria
fixa + timing, sem muita lógica nova) — bons candidatos a ir primeiro se/quando este documento
virar trabalho de verdade. **Campo de Minas** precisa de lógica de explosão em área/cadeia nova.
**Nuvem de Poeira** depende de decisão sobre o Overhaul 4 (fog) pra não duplicar trabalho.

Nenhuma prioridade de ordem foi pedida ainda — isto é só uma observação técnica, não uma decisão.

---

*Fim do rascunho. Fica pra planejamento futuro — nada implementado ainda.*
