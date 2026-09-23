# DESIGN AS-BUILT: COMPANHEIROS DE ALA (WINGMEN)

> **Status:** AS-BUILT (VIGENTE EM PRODUÇÃO)  
> **Última verificação:** 2026-09-23  
> **Código relacionado:** [`src/combat/wingmen.js`](../../../src/combat/wingmen.js), [`src/combat/wingman-state-controller.js`](../../../src/combat/wingman-state-controller.js), [`src/combat/wingman-navigation.js`](../../../src/combat/wingman-navigation.js), [`src/combat/wingman-formation-separation.js`](../../../src/combat/wingman-formation-separation.js), [`src/combat/wingman-radio.js`](../../../src/combat/wingman-radio.js)  
> **ADR Relacionada:** [`docs/decisions/ADR-0002-wingmen-tactical-freedom.md`](../../decisions/ADR-0002-wingmen-tactical-freedom.md)  

---

## 1. MÁQUINA DE ESTADOS & AUTORIDADE
Gerenciada exclusivamente através de `src/combat/wingman-state-controller.js`:
- **Integridade:** `nominal`, `damaged`, `critical` (vida baixa) e `retreating` (0 HP).
- **Behavior:** `patrol` (voo em formação/patrulha), `dogfight` (engajamento de alvo) e `regroup` (retorno suave à vaga).
- **Actions Persistentes:** `ram` (Falco), `guard` (Peppy), `rescue` (Peppy), `assist` (Miyu) e `auxShield` (Peppy).

---

## 2. NAVEGAÇÃO, FORMAÇÃO E DECONFLIÇÃO
- **Tactical Freedom:** Não há coleira nem regroup forçado por distância euclidiana. Aliados operam livremente enquanto suas ações forem válidas.
- **Separação Simétrica (`wingman-formation-separation.js`):** Quando duas naves convergem ou sobrepõem-se, ambas recebem impulsos rigorosamente opostos e determinísticos baseados em suas vagas de formação, com correção de até 1.5u/frame.
- **Detector de Clump:** Falha automática no `aiValidator` caso duas naves permaneçam coladas a menos de 1u por mais de 0.5s.

---

## 3. INTEGRIDADE, RETIRADA E RESGATE
- **Vida e Escudo:** 4 HP base, 3 de escudo (Peppy e Slippy possuem 5 de escudo). O escudo absorve dano antes da carcaça e regenera após 1.5s sem dano.
- **Sequência de Retirada:** Ao chegar a 0 HP, o aliado entra em `retreating` por 5s com fumaça e fogo, torna-se invulnerável e não-alvejável, desativa seu escudo auxiliar, encerra falas no rádio e deixa a tela.
- **Recuperação:** Pode ser resgatado imediatamente através de cartas Roguelike (Companhia / Recrutamento), mesmo durante a animação de retirada.

---

## 4. HABILIDADES ESPECÍFICAS
- **Falco (Ás Interceptor):** Investida Aríete (`ram`), Intercept com remoção atômica de 1 projétil e VFX de onda de choque azul, Fôlego de Combate e Investida em Cadeia.
- **Peppy (Defensor Blindado):** Guarda Extra (escudo temporário verde de 10s acima do teto), Rescue (resgate imediato de knockback do jogador) e Auxílio (barreira frontal em repulsão `S`).
- **Slippy (Batedor Solar):** Reparo de Campo (orbes colecionáveis de +1 HP), Morale Boost (dano extra no Foco `F` e faíscas verdes) e Impulsão Conjunta (invencibilidade no boost).
- **Miyu (Vanguarda Fantasma):** Carga Compartilhada (+50% velocidade de carga do homing), Assist (locks triangulares ciano extras) e Boombuster (orbes homing roxos contra até 1+stacks alvos).

---

## 5. RÁDIO DISTRIBUÍDO
- 4 slots independentes no HUD sem fila serial única.
- 120 quotes novos (30 por piloto) com threads Call & Response (`↳ [Piloto]: ...`).
- Transmissões de habilidades in-world diretamente acima da nave do piloto com auras de 1.5s; transmissão de Fox acima do jogador durante comando Foco.
