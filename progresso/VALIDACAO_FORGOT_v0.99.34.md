# Candidato v0.99.34 — validação do backlog `forgot`

> Branch de validação: `validation/forgot-backlog-v09934`
>
> Base reconciliada: `main` em `c4e550a29035ae7be7da991f85ebd08558fa8c6e`.
>
> Snapshot automatizado verde antes deste registro: `38bfad0ab1037acda769b0ad006ace110bacf5db`.
>
> **Importante:** este documento não declara a entrega aprovada visualmente nem integrada ao `main`. Ele separa o que já foi comprovado por testes do que ainda exige playtest real conforme `FLUXO_VALIDACAO_IA.md`.

## O que está implementado na branch de validação

### Swirl Blast

- Hitbox volumétrica swept/capsule com raio físico de `3.0u`, somada ao raio do alvo durante a colisão perfurante.
- Boss e Dourado recebem dano base + `25%` de `maxHp` no contato do Swirl.
- O Boss não recebe dano durante `transitioning`; o bloqueio acontece antes de subtrair HP.
- Se o escudo do Boss estiver ativo, o Swirl consome/quebra o escudo e para, mas não aplica dano de casco no mesmo contato.
- Dourado continua sendo boss-class para o dano percentual e para o stop do projétil.
- O projétil usa `rawDt` durante a câmera lenta própria do Swirl, preservando velocidade em tempo real sem abandonar swept collision.
- Emissão de rastro do Swirl é orientada por distância percorrida e limitada por frame para evitar explosão de partículas em `dt` alto.
- Coreografia de câmera/FOV foi isolada em `src/swirl-camera-model.js`, com fases de compressão, release e retorno; o FOV base capturado no disparo é restaurado sem drift cumulativo.
- Impacto em Boss/Dourado usa leitura própria (`bossImpactRing`/bloom/efeito especial), separada do impacto comum.

### Draft Tático no Arcade

- O Card Choice do Arcade recebeu apresentação compacta no topo, preservando o centro da ação e reduzindo a dominância do overlay.
- A escolha continua usando `1/2/3` e mantém a arquitetura existente de card choice.
- **Não fechado:** o timing final do bullet-time continua sendo decisão de design; a branch não deve transformar um timing sugerido em requisito aprovado sem playtest.

### Fog

- Novo modelo puro em `src/fog-visual-model.js` para força visual dos bolsões e offsets dos próximos bancos.
- Bancos localizados de fog foram adicionados ao ambiente, separados da densidade global de `FogExp2`.
- Camada de estrelas próximas/intermediárias responde à presença do fog para dar referência de profundidade.
- Spawn passa a usar condensação inward/materialização conectada à massa de fog; exceções de Horda split em fog denso permanecem preservadas.
- A materialização não altera a posição lógica do inimigo e o wobble é aplicado somente no render, restaurado em `finally`.

### Tank

- Overhaul reconciliado com FSM própria e modelo modular.
- Hit radius `2.8`, morte `0.65s`, score `75`, peso populacional `2`.
- Ataques Siege Shot, Suppression Burst e Heavy Ram.
- Stagger por Swirl com janela de imunidade contra stun-lock.
- Rail usa standoff pesado e pode desengajar após ciclos; arena não entra em disengage por contador de ciclos e, se cair nesse estado por outra origem, move para fora em vez de perseguir.
- Mudanças de ataque são registradas por `aiValidator.logMechanic` em eventos discretos.

### Superchecagem dos inimigos

A suíte `src/enemy-supercheck.test.mjs` cobre os 15 achados consolidados:

1. Boss bloqueia dano na origem durante transição.
2. `Squadron.remaining` possui contabilização idempotente central.
3. Spawn pendente não participa de gameplay.
4. Material temporário de spawn é isolado e liberado.
5. Sentinela preserva 2 de casco / 4 de escudo até a resolução.
6. Sussurro usa dificuldade atual e `registerSpawn()`.
7. Homing e Swirl abandonam alvo em `fadingOut`.
8. Enxame-Ímã deixa de atuar durante fade/spawn pendente.
9. Wobble é somente visual e restaurado após render.
10. Mini-naves do Dourado orientam quaternion por direção unitária.
11. Projéteis inimigos usam swept collision.
12. Enxame-Ímã está recalibrado para tiro normal atual (`260u/s`, raio `15`, força `1100`).
13. Boss não dispara volley normal durante transição.
14. Tank não entra em disengage por ciclo na arena e possui saída real caso entre.
15. `severChainAt` é idempotente.

### Wingmen + Lock-On

- `src/wingman-bughunt.test.mjs` cobre os 10 bugs do patch local reconciliado: snapshots clonados, recovery de retreat, contagem sem retreating, `markWingmanDown` imediato, rádio/visuais de retreat, Chain Ram, readiness, reset de estado e guards de navegação.
- Lock-On preserva a arquitetura BASE/MIYU e adiciona prioridade `Boss > maior maxHp > menor id` sem apagar ownership/budgets da Miyu.
- Catch-up mantém histerese explícita e boost clampado.
- Fuzz determinístico exercita separação, catch-up, lag longitudinal, arrival scale e formation motion gain.

## Validação automatizada concluída

Último pipeline verde do snapshot `38bfad0...`:

- `wingman-bughunt.test.mjs`: **10/10**.
- `enemy-supercheck.test.mjs`: **15/15**.
- `tank.test.mjs`: **15 assertions**.
- `lockon-priority.test.mjs`: prioridade + budgets BASE/MIYU OK.
- `forgot-stage2.test.mjs`: canais de dano/feedback OK.
- `forgot-stage3.test.mjs`: Draft/Fog/Swirl camera model OK.
- `forgot-stage4.test.mjs`: integração visual complementar OK.
- `tools/state-fuzz-audit.mjs`: **6000 iterações, 31.986 verificações, 0 falhas**.
- `src/selftest.mjs`: passou completo com as novas suítes integradas.
- `git diff --check`: passou.

## O que AINDA NÃO está validado

Os itens abaixo permanecem abertos até sessão real de jogo + log do `aiValidator`:

- Leitura visual e sensação da nova coreografia de câmera/FOV do Swirl.
- Tamanho/sensação do Swirl durante slow motion e clareza do rastro de destruição.
- Leitura inequívoca do impacto especial em Boss e Dourado.
- Legibilidade dos bancos de Fog sem inimigos/tiros.
- Estrelas intermediárias desaparecendo/reaparecendo progressivamente ao atravessar fog.
- Spawn realmente parecendo emergir/condensar a massa local.
- Fog legível durante Boss/Dourado.
- Draft Tático compacto não cobrindo nave/mira/ameaças em resolução real.
- Controle de nave/combate durante Card Choice no Arcade e conforto do bullet-time atual.
- Tank: telegraphs, ritmo dos três ataques, Stagger e saída visual no Rail/Arena.
- Wingmen: sessão real suficiente para confirmar ausência de clumping/catch-up churn fora do fuzz sintético.

## Roteiro mínimo de playtest

1. Jogar no Rail até atravessar pelo menos um banco de fog, observando estrelas próximas/intermediárias e um spawn dentro/na borda do banco.
2. Entrar no Arcade e abrir ao menos um Card Choice; confirmar que o Draft fica compacto no topo e que o combate/nave continuam legíveis.
3. Disparar Swirl em inimigos comuns enfileirados, depois em Boss com escudo, Boss sem escudo e Dourado.
4. Contra Boss com escudo: confirmar visualmente `escudo quebra + Swirl para + nenhum dano de casco no mesmo contato`.
5. Observar ao menos um Tank completando a sequência de ataques; se possível, acertar Swirl para disparar Stagger.
6. Jogar com 4 Wingmen por alguns minutos, incluindo Rail e All-Range, procurando sobreposição persistente, jitter e spam de catch-up.
7. Abrir Debug → `Testes & Visual` → **Copiar Log de Validação IA** e colar o JSON na conversa.

## Critério de promoção

Só considerar este candidato pronto para integração quando:

- `expectativas_falhas` do playtest estiver vazio ou as falhas tiverem sido corrigidas e retestadas;
- o usuário aprovar visualmente Swirl, Fog e Draft;
- nenhum regressão crítica aparecer no Tank/Wingmen durante sessão real;
- depois disso, atualizar o progresso canônico/README/versão e preparar a integração — sem merge automático no `main`.
