# 🚀 Star-Anki

> **Um jogo de combate espacial 3D arcade inspirado no clássico Star Fox, projetado para estudo de alta retenção através de Recordação Ativa (Active Recall) e Repetição Espaçada (SRS).**

[![Versão](https://img.shields.io/badge/versão-v0.65.0-blue.svg)](src/version.js)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Three.js](https://img.shields.io/badge/WebGL-Three.js-black?logo=three.js)](https://threejs.org/)
[![Status](https://img.shields.io/badge/status-ativo-success.svg)]()

🎮 **Jogue no navegador:** [https://ratuckk.github.io/Star-Anki/](https://ratuckk.github.io/Star-Anki/)

---

## 🌌 Visão Geral

**Star-Anki** combina a adrenalina e fluidez dos combates espaciais clássicos dos anos 90 (*rail-shooter* e combate tridimensional em arena *all-range mode*) com flexibilidade total de jogo:

1. **Modo Estudo (Com Baralho):** Estudo de alta retenção através de **recordação ativa** e **repetição espaçada (SRS)** com cartas do Anki. Cada acerto concede upgrades roguelike permanentes.
2. **Modo Arcade Roguelike (Sem Baralho):** Combate arcade espacial puro sem perguntas, indo diretamente para a escolha de upgrades Roguelike a cada transição e encontro de chefes.
3. **Escolta de Companheiros Configurável:** Escolha no pré-jogo iniciar a missão com 0 até 4 pilotos aliados cobrindo seus flancos desde a decolagem.

---

## 🧠 Filosofia de Dois Momentos (Active Recall + Explicação Densa)

O sistema de estudo do Star-Anki foi projetado respeitando rigorosamente a regra do **Active Recall** para nunca antecipar a resposta antes do esforço de memória:

### 1. Durante a Pergunta (Esforço Ativo de Recuperação)
- **Modo Recall:** A pergunta é exibida com um contador de tempo e opções de resposta (mínimo de 4 alternativas coerentes geradas contextualmente).
- **💡 Botão de Contexto (`E` / Botão X no Controle):** Pode ser consultado a qualquer momento durante a pergunta. Explica o **conceito geral** sem entregar o fato específico testado, além de fornecer link clicável para a referência técnica/acadêmica.

### 2. Pós-Resposta (Aprofundamento e Correção de Lacunas)
- **No Acerto:** O jogo transiciona diretamente para a tela de upgrades Roguelike, onde o botão **"📖 Explicação da Resposta"** permite ler uma análise densa e aprofundada com fontes oficiais antes de escolher sua melhoria.
- **No Erro:** O combate pausa por 5 segundos com a exibição clara da resposta correta e acesso direto ao painel explicativo. Jogadores experientes podem pular a pausa instantaneamente pressionando **Espaço** (ou botão A no controle).

---

## 🎮 Mecânicas de Gameplay

### Modos de Voo
- **Modo Trilho (Rail-Shooter):** Voo guiado por curvas splines 3D com movimentação lateral livre, banking aerodinâmico suave e passagens cinemáticas.
- **Modo Arena All-Range (360°):** Controle total de pitch, yaw e roll em uma esfera de combate aberta para enfrentar o Chefe de Setor e a Anomalia Dourada.

### Arsenal e Habilidades da Nave
- **Canhões Blaster Duplos:** Disparo contínuo com cadência rápida e feedback sonoro/visual.
- **Tiro Teleguiado Carregado (Homing Shot):** Mantenha pressionado o disparo para travar a mira em múltiplos alvos simultâneos. Ao atingir a carga máxima (100%), o disparo causa detonação com dano em área e anéis Mach.
- **Giro Completo / Rolamento (Barrel Roll - `Z` ou `C`):** Manobra defensiva que concede frames de invencibilidade e reflete projéteis inimigos quando combinada com cartas de deflexão.
- **Propulsor de Aceleração (`A`):** Impulso frontal para escapar de encurralamentos ou colidir usando a carta de Aríete.
- **Freio Reverso / Repulsor (`S`):** Desaceleração tática com jatos frontais reversos para alinhar disparos em alvos que passam velozes.
- **Esquadrão Aliado Autônomo:** Até 4 companheiros de equipe (*Falco, Peppy, Slippy, Phantom*) que realizam voos planados realistas, cobrem os flancos e travam mira nos inimigos. Modo foco (`F`) permite direcionar todo o fogo do esquadrão a um alvo prioritário.

---

## 👾 Inimigos e Desafios

| Inimigo | Comportamento |
| :--- | :--- |
| **Blaster Comum** | Caças rápidos que patrulham o trilho e disparam salvas de plasma. |
| **Tanque Blindado** | Naves robustas com blindagem pesada e alta resistência a disparos frontais. |
| **Ampulheta Temporal** | Naves cronométricas — destruí-las reduz o tempo de ciclo para o próximo encontro. |
| **Sentinela** | Inimigo tático que projeta **molduras holográficas**: atravessar o centro translúcido é seguro; encostar nas bordas finas causa dano. |
| **Enxame-Ímã** | Drones magnéticos estáticos que formam barreiras de navegação pelo espaço. |
| **Réplicas & Vermes** | Formações em cadeia e caças de manobra acrobática. |
| **Detritos & Asteroides** | Fragmentos com física de rotação e colisão precisa, com limite estrito de no máximo 2 variantes gigantes simultâneas. |
| **Chefe de Setor** | Encontro épico em arena all-range com canhões colossais, teleporte, escudos de fase e orbes de perguntas. |
| **Anomalia Dourada** | Mini-chefe ágil com barra de vida superior estilo Boss, lasers hiper-rápidos, investidas e cutscene cataclísmica de destruição. |

---

## 🃏 Sistema de Cartas Roguelike

A cada resposta correta, escolha entre 3 cartas de upgrade sorteadas para personalizar sua build durante a run:
- **Armas:** Mais projéteis por disparo, aumento de velocidade de carga do homing, ricochete entre alvos, aumento de cadência.
- **Defesa:** Aumento da capacidade de escudos, tempo de regeneração reduzido, maior duração de invencibilidade no rolamento.
- **Mobilidade:** Eficiência do propulsor, aríete de dano no boost, giro rebatedor de tiros inimigos.
- **Esquadrão:** Recrutamento de novos pilotos aliados para a ala.

---

## ⌨️ Controles

Os controles são 100% reconfiguráveis através do menu de **Opções de Teclas**.

### Teclado & Mouse
| Ação | Tecla Padrão |
| :--- | :--- |
| **Movimento (Pitch/Yaw)** | `Setas` ou `Mouse` |
| **Disparo Primário / Carregar Homing** | `Botão Esquerdo do Mouse` ou `J` |
| **Rolamento / Barrel Roll** | `Z` (esquerda) / `C` (direita) [Dois toques] |
| **Propulsor (Boost)** | `A` |
| **Freio Reverso** | `S` |
| **Códice de Contexto (Durante Pergunta)** | `E` |
| **Comando do Esquadrão (Livre / Foco)** | `F` |
| **Pular Pausa de Erro (Feedback)** | `Espaço` |
| **Pausar Jogo** | `P` ou `Esc` |

### Controle / Gamepad (Xbox / PlayStation)
- **Direcional Analógico:** Direcionamento da nave.
- **Gatilho Direito (RT / R2):** Disparo e carga do tiro teleguiado.
- **Ombros (LB / RB):** Rolamentos defensivos em barril.
- **Botão A (Xbox) / ✕ (PS):** Confirmação / Pular pausa de erro.
- **Botão X (Xbox) / ▢ (PS):** Abrir Códice de Contexto.
- **Botão Y (Xbox) / △ (PS):** Alternar comando do esquadrão.

---

## 📚 Gerenciamento de Baralhos (Decks)

O Star-Anki suporta baralhos em arquivos de texto delimitados por tabulação (`.txt`), compatíveis com exportações padrão do Anki.

### Formato de Linha
Cada linha do arquivo do baralho segue a estrutura canônica:
```tsv
ID	Tipo	Pergunta / Texto	Resposta	Opções_Extras	Contexto_Sem_Spoiler	Fonte_Ou_Referencia
```

- **Tipos Suportados:**
  - `Basic`: Pergunta direta na coluna 3 e resposta na coluna 4.
  - `Cloze`: Texto com omissão de palavras no padrão `{{c1::termo}}`.
- **Baralhos Incluídos:**
  - `decks/estudo-de-prova.txt`: História da computação, arquitetura de Von Neumann, pioneiros e fundamentos (40 cards).
  - `decks/arquitetura-manutencao-aumentado.txt`: Hardware de PC, placas-mãe, chipsets, memórias DDR, barramentos PCIe, NVMe, refrigeração e manutenção (30 cards).
  - `templates/baralho-modelo.txt`: Template de referência para criação de novos baralhos.

---

## 🛠️ Instalação e Execução Local

O projeto foi construído em arquitetura web nativa e limpa, sem a necessidade de bundlers pesados ou transpiladores complexos.

### Pré-requisitos
- Um navegador moderno compatível com WebGL (Chrome, Firefox, Edge, Safari, Brave).
- Opcional: Node.js (apenas para rodar os testes unitários ou servidor local).

### Execução Imediata
1. Clone o repositório:
   ```bash
   git clone https://github.com/Ratuckk/Star-Anki.git
   cd Star-Anki
   ```
2. Inicie qualquer servidor estático local. Exemplos:
   - Com Python:
     ```bash
     python -m http.server 8000
     ```
   - Com Node (`npx serve`):
     ```bash
     npx serve .
     ```
   - Com a extensão *Live Server* do VSCode.
3. Abra `http://localhost:8000` no seu navegador.

### Execução dos Testes Unitários
Para validar a integridade dos parsers de baralhos Anki e da lógica do quiz:
```bash
node src/selftest.mjs
```

---

## 📁 Estrutura de Diretórios

```
Star-Anki/
├── index.html              # Ponto de entrada, marcação do HUD e canvas WebGL
├── decks/                  # Baralhos de estudo prontos para uso
├── templates/              # Modelos para criação de novos baralhos
├── src/
│   ├── main.js             # Inicializador principal e gerenciador de sessões
│   ├── mount-game.js       # Inicialização da cena Three.js, iluminação e fog
│   ├── game-loop.js        # Loop central de física, colisões, fases e render
│   ├── rail.js             # Controle de rota de trilho e física da nave
│   ├── player.js           # Estado de vida, escudos, buffs e estatísticas
│   ├── cutscenes.js        # Sequências cinemáticas (decolagem, morte de chefes)
│   ├── effects.js          # Sistema de partículas, explosões, shockwaves e neblina
│   ├── environment.js      # Gerenciamento de starfield e atmosfera cósmica
│   ├── environment-config.js # Configuração modular e toggles do ambiente
│   ├── anki.js             # Parser e gerador dinâmico de distratores coesos
│   ├── flow-question.js    # Fluxo e timers de perguntas e feedback
│   ├── flow-boss.js        # Lógica de buildup e combate contra chefes
│   ├── flow-progression.js # Curvas de dificuldade e balanceamento
│   ├── keybindings.js      # Mapeamento e persistência de teclas/gamepad
│   ├── hud-game.js         # Interface de usuário (retícula, barras, códice, cards)
│   ├── hud-styles.js       # Estilização completa do HUD e animações CSS
│   ├── version.js          # Controle de versão do jogo
│   ├── combat/
│   │   ├── index.js        # Orquestrador de projéteis e detecção de hits
│   │   ├── projectiles.js  # Balística e física dos lasers do jogador
│   │   ├── targets.js      # Alvos bônus e orbes de chefes
│   │   └── wingmen.js      # IA e física de voo dos companheiros de esquadrão
│   └── enemies/
│       ├── index.js        # Gerenciador de ciclo de vida e colisão dos inimigos
│       ├── blaster.js      # Inimigo blaster padrão
│       ├── tank.js         # Inimigo pesado
│       ├── sentinela.js    # Sentinela e molduras geométricas
│       ├── detrito.js      # Asteroides e destroços físicos
│       ├── golden.js       # Mini-chefe Anomalia Dourada
│       └── boss.js         # Chefe principal de setor
└── PROGRESSO_POS_.60.md    # Histórico detalhado de versões e changelog
```

---

## 📜 Histórico e Evolução

Para detalhes minuciosos sobre o desenvolvimento e os patches de cada versão:
- [PROGRESSO_POS_.60.md](PROGRESSO_POS_.60.md) — Documentação a partir da versão v0.60.0 (v0.61.0, v0.62.0).
- [PROGRESSO_POS_0.50.md](PROGRESSO_POS_0.50.md) — Histórico de versões v0.51.0 a v0.60.0.
- [BACKLOG.md](BACKLOG.md) — Registro de ideias e próximos recursos planejados.

---

## 📄 Licença

Este projeto é desenvolvido para fins educacionais e de entretenimento, sob a licença [MIT](LICENSE).
Inspirado na franquia *Star Fox* da Nintendo. Todos os direitos sobre conceitos originais pertencem a seus respectivos detentores.
