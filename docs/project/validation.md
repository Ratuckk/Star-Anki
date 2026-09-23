# Fluxo de Auto-Validação da IA (Motor de Validação)

Este projeto tem um motor de validação em tempo de execução — `src/ai-validator.js`, singleton
`aiValidator` — pensado pra fechar o loop entre "a IA escreveu uma mecânica nova" e "a mecânica
funciona de verdade quando um humano joga". Ele não substitui `src/selftest.mjs`: selftest roda
cenários sintéticos antes de commitar; o `aiValidator` captura comportamento emergente de uma
sessão de play real — timing, sequência de inputs, edge cases que ninguém pensou em escrever
como teste unitário.

## O que é: `expect()` e `logMechanic()`

- **`aiValidator.expect(descrição, fnAvaliação, contexto)`** — registra uma suposição sobre o
  estado que você acabou de calcular. Não lança exceção nunca (uma expectativa mal escrita não
  pode derrubar o jogo) e só guarda o `contexto` quando falha, pra facilitar diagnóstico.
- **`aiValidator.logMechanic(nomeDaMecânica, ação, snapshotDoEstado)`** — registra um passo de
  uma mecânica nova numa timeline circular (últimos 200), pra dar contexto de "o que aconteceu
  antes" quando uma expectativa falha longe da causa raiz.

Exemplo real já em produção (`src/player.js`, dentro de `takeDamage`):

```javascript
aiValidator.expect(
  'Escudo do jogador nunca fica negativo nem passa do máximo após absorver dano',
  () => shieldValue >= 0 && shieldValue <= shieldMax,
  { shieldValue, shieldMax, damage: amount }
)
```

**Regra importante**: só chame `expect()`/`logMechanic()` em eventos discretos (hit, disparo,
transição de estado/fase, spawn, morte) — nunca dentro de um loop de `update(dt)` que roda a
60fps. Isso inflaria o log sem necessidade e o objetivo é sinal, não ruído.

## Obrigações ao criar ou alterar mecânica de jogo

1. **Instrumente estado crítico com `aiValidator.expect()`** sempre que calcular vida, escudo,
   dano, mana/recursos de feitiço, combo, transição de FSM (ver `OVERHAUL_ESTADOS_INIMIGOS.md`)
   ou qualquer invariante que, se quebrar, é bug silencioso (vira `NaN`, fica negativo, passa do
   teto, trava num estado).
2. **Registre fluxos novos com `aiValidator.logMechanic()`** quando a mecânica for complexa o
   bastante pra precisar de contexto histórico (ex: uma FSM nova de inimigo, um sistema de
   combo em cadeia).
3. **Peça pro usuário rodar o ciclo de feedback** (próxima seção) antes de considerar a entrega
   validada — instrumentar sem testar não fecha o loop.

## Ciclo de feedback

1. Você implementa a mecânica pedida e já embute os `expect()`/`logMechanic()` relevantes.
2. Você pede pro usuário testar no jogo normalmente (não precisa de roteiro especial — só jogar
   a situação que exercita a mudança).
3. O usuário abre o painel de debug e clica **"Copiar Log de Validação IA"** (categoria "Testes
   & Visual") — copia um JSON pra área de transferência, mesmo padrão dos outros logs do painel
   (`Copiar Log de Combate dos Inimigos`, etc.). **"Limpar Log de Validação IA"** zera os
   contadores sem precisar recarregar a página, útil entre um teste e outro.
4. O usuário cola esse JSON na conversa.
5. Você lê `expectativas_falhas`. Vazio = a implementação se comportou como previsto. Se tiver
   algo, o `context` de cada item tem os valores exatos no momento exato da falha — leia,
   corrija a implementação e, se fizer sentido, adicione uma expectativa nova cobrindo o caso
   que faltou.

## Escopo

Isso é uma ferramenta de desenvolvimento, não uma feature do jogo — não precisa (e não deve)
instrumentar retroativamente todo o código existente. Aplique a novas features e a código que
você está alterando agora; o valor está em pegar regressões e edge cases no momento em que a
lógica é escrita, não em cobertura total do código legado.
