# Overhaul: Sistema de Pontos

Documento de planejamento — **nada aqui foi implementado ainda**. Ideias descartadas ou registradas
em conversa para uma leva futura. Ver `src/quiz.js` (`resolveAnswer`) para o sistema atual: pontos
só vêm de responder pergunta certa (`100 * comboMultiplier * timeBonus * accuracyBonus`, sendo
`timeBonus`/`accuracyBonus` hoje fixos em `1.2` — não dinâmicos), combo sobe 0.15/acerto até 2.5x e
zera em qualquer erro/timeout, erro não desconta pontos.

## Descartadas (1ª leva, rejeitadas pelo usuário — "todos são péssimos")

Bônus de velocidade real no `timeBonus`, pontuação por abater inimigos, multiplicador de risco por
vida/escudo cheios, high score persistido + ranking por baralho, penalidade proporcional no erro.

## Ideias para a próxima leva

1. **Combo quebra ao levar hit.** Hoje o combo só zera em erro/timeout de pergunta (`quiz.js`,
   `resolveAnswer`) — levar dano de inimigo não afeta o combo. Mudar para: o combo também zera
   quando o jogador é atingido por um inimigo (não só ao errar pergunta).
2. **Dificuldade escalando por pontos no modo arcade.** No modo arcade (sem baralho Anki), a cada
   10000 pontos acumulados o jogo fica mais difícil — precisa decidir o que exatamente escala
   (spawn rate, variedade de inimigos, agressividade) e como isso interage com a progressão de
   dificuldade que já existe hoje.
