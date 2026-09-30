# FOCO / SWIRL — Display de Armamento (Opção B)

> **Status:** `active` — implementado (`src/hud-armament.js`); **pendente** validação visual do usuário em gameplay.
> **Decisão do usuário:** Opção B do protótipo `foco-swirl-v2` (Display de Armamento), skin Tático/Militar.
> **Escopo:** só COMO FOCO e SWIRL comunicam estado. Posição, ordem da coluna esquerda e a zona `.hud-left-actions` são contrato e não mudam. CADEIA não foi redesenhada.

## Componente
- Caixa externa fixa **76 × 46 px** por widget (FOCO e SWIRL lado a lado, gap 8 px; a linha com CADEIA continua dentro de ~290 px).
- Etiqueta vertical (`FOCO` / `SWIRL`), leitura temporal grande, label secundária pequena e medidor contínuo com 4 marcas.
- Estado por **texto + padrão + direção**, nunca só cor:

| Estado | Valor | Label | Medidor |
|---|---|---|---|
| READY | `PRONTO` | `DISPONÍVEL` | cheio, sólido |
| ACTIVE (só FOCO) | `durationRemaining` (ex.: `3.7s`) | `ATIVO` | hachurado, **esvazia** (`durationRemaining / durationMax`) |
| COOLDOWN | tempo restante (FOCO: `Ns` inteiro; SWIRL: `N.Ns`) | `RECARGA` | cinza listrado, **enche** (`1 − cooldownRemaining / cooldownMax`) |

- SWIRL só tem READY/COOLDOWN (dispara instantâneo). O **total efetivo** vem do player (`getSwirlCooldownTotalMs`, alterado por cartas); nada de 10 s hardcoded. FOCO usa os valores reais de `combat.getSquadronCommandState()`.
- **Sem valores sintéticos:** `computeFocoView` não tem fallback de duração/cooldown. Se `durationMax`/`cooldownMax` (ou o total do SWIRL) vierem ausentes/<=0/não-finitos, nada é inventado: o texto usa o tempo restante real, a barra assume um valor visual seguro (ACTIVE cheia, COOLDOWN vazia) e o problema é reportado uma vez via `aiValidator` ("runtime forneceu duração/cooldown válidos"). Wiring quebrado é detectado, não mascarado.
- Nenhum relógio visual próprio: o widget só reflete `hud.setSquadronCommandState()` / `hud.setSwirlCooldown()` chamados pelo `game-loop.js` com o estado real.
- Microanimações locais: FOCO READY→ACTIVE (sweep + flash ~220–280 ms), SWIRL disparo (pulso + colapso da barra ~200–240 ms), retorno a READY (flash ~260 ms). `prefers-reduced-motion: reduce` remove animações e mantém toda a informação.

## Feedback legado REMOVIDO (não pode voltar)
Ao acionar FOCO **não existe mais** nenhum painel/pill/retrato acima da nave; o widget é a fonte visual autoritativa do estado do comando. Foram removidos:
- `hud-squadron-notice` (DOM, CSS, `showSquadronNotice`, `updateSquadronNoticePosition`, projeção `shipAbove` no `game-loop.js`, chamada no handler de `squadronCommand`);
- `worldRadio.showFoxFocus` (sprite world-space `followPlayer`), `FOX_AVATAR`/`FOX_COLOR` do world-radio e a lógica `followPlayer` do update.

Preservados: rádio lateral fixo inferior-central, glows/ícones de ability dos aliados (`triggerAbilityGlow`), respostas de rádio dos wingmen (auditoria do scheduler é separada — `CLAUDE.md` §34.1).

## Testes
`src/hud-armament.test.mjs` (CI): estados com valores reais, barras, total efetivo do SWIRL, DOM estável, microanimações, ausência do legado no código de produção. `tools/validate-armament.mjs` (Chromium, jogo real, fora da CI): tecla `KeyD` real → READY→ACTIVE→COOLDOWN→READY, nenhum `.hud-squadron-notice`, nenhum `THREE.Sprite` novo, layout em 4 resoluções × 2 modos de vitais.

## Pendências
- Validação visual do usuário em gameplay (legibilidade do medidor e da etiqueta vertical de 13 px).
- Código morto candidato a remoção futura: `showWingman()`/painéis in-world de `wingman-world-radio.js` (sem consumidores desde a migração do rádio lateral).
