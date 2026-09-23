# Backlog — Overhaul de perguntas + explicação com fontes

Ideias discutidas em conversa (não implementadas ainda). Prioridade P1 = mais valor/menos risco,
P3 = mais especulativo ou depende de decisão do usuário antes de codar.

## 1. Dois botões, dois momentos

- [x] **[P1] Botão de Contexto** — ✅ v0.61.0. Visível durante a pergunta inteira (recall + alternativas/arena).
  Explica o CONCEITO geral por trás da pergunta, nunca a resposta específica.
- [x] **[P1] Botão de Explicação da Resposta** — ✅ v0.61.0. Só aparece DEPOIS de responder (certo ou errado).
  Mostra a explicação densa + fonte da resposta específica daquela pergunta.

## 2. Onde a explicação da resposta mora (sem criar pausa nova)

- [x] **[P1] No acerto**: ✅ v0.61.0. Embutido botão âmbar na tela de escolha de carta roguelike.
- [x] **[P1] No erro**: ✅ v0.61.0. Embutido botão no float de feedback de erro.
- [x] **[P2] Decidir**: ✅ v0.61.0. Painel sobreposto sem efeito extra no tempo. O jogo já está
  pausado pela própria tela de card/feedback.
- [ ] **[P3] Considerar**: pequeno bônus de pontos por abrir a explicação especificamente num ERRO
  (incentiva estudar o que errou; não recompensar no acerto pra não incentivar farm).

## 3. Layout

- [x] **[P1] Cuidado com colisão visual**: ✅ v0.61.0. Botão de Contexto mantém posição vertical
  na extrema direita, não colide com a legenda de alternativas centrais.

## 4. Overhaul de como as perguntas são escritas (formato, não só conteúdo)

- [x] **[P1] Cloze de verdade misturado com Basic.** ✅ v0.61.0. Ambos os baralhos principais
  (`estudo-de-prova.txt` e `arquitetura-manutencao-aumentado.txt`) e o template agora equilibram
  perguntas Basic (para fatos, inventores e métricas pontuais) e Cloze (para conceitos,
  mecanismos e relações de causa-efeito).
- [x] **[P1] Um fato por card.** ✅ v0.61.0. Regra de Wozniak aplicada rigorosamente em todos
  os 70 cards dos decks do zero, evitando perguntas compostas.
- [ ] **[P2] Pergunta-cenário quando fizer sentido.** Em vez de "o que é SAS", algo como "precisa de
  16 discos com alta confiabilidade num datacenter, qual interface escolher" — testa aplicação, não
  só string memorizada.
- [ ] **[P3] Distratores por tag de confusão**, não só por tamanho de string. Ex: tag
  `confunde:SATA` em cards de RAID/BIOS-UEFI pra às vezes forçar de propósito a discriminação entre
  conceitos comumente trocados, em vez de puramente aleatório por comprimento parecido.

## 5. Template e recriação dos decks

- [x] **[P1] Estender o template do baralho-modelo** com os campos novos (explicação densa +
  fonte) e sem spoilers no contexto. ✅ v0.61.0 em `templates/baralho-modelo.txt`.
- [x] **[P2] Recriar os decks existentes em `decks/` do zero** no formato novo, mais coeso. ✅ v0.61.0
  concluído para `estudo-de-prova.txt` (40 cards) e `arquitetura-manutencao-aumentado.txt` (30 cards).

## Fora de escopo por agora

- Sincronizar/mesclar automaticamente o que a outra sessão/IA está produzindo no deck "Estudo de
  Prova" com este backlog — revisar manualmente depois que ela terminar.
