# Avisos de Terceiros e Atribuições de Materiais / Third-Party Notices

Este documento estabelece a distinção clara entre o **código e documentação originais** do projeto Star-Anki e os **conteúdos, marcas, artes e efeitos sonoros de terceiros** presentes neste repositório.

---

## 1. Código e Documentação Originais do Projeto

* **Escopo:** Todo o código-fonte original em JavaScript/HTML/CSS (diretórios `src/`, `tools/`, testes `*.test.mjs`, `selftest.mjs`, configurações de CI) e a documentação canônica original desenvolvida para o Star-Anki.
* **Licença:** Disponibilizados sob os termos da licença [MIT](LICENSE), Copyright (c) 2026 Ratuckk e contribuidores do projeto.

---

## 2. Conteúdos e Materiais de Terceiros

O Star-Anki é um projeto desenvolvido para fins educacionais e de estudo através de repetição espaçada, inspirado na clássica franquia *Star Fox* da Nintendo.

**A licença MIT deste repositório NÃO se aplica a materiais de terceiros.** Todos os nomes, personagens, marcas registradas, sprites, modelos visuais e gravações de áudio permanecem sob titularidade e direitos exclusivos de seus respectivos detentores e não são relicenciados por este projeto.

Abaixo estão listados os ativos de terceiros identificados no repositório:

### 2.1 Retratos dos Personagens e Sprites de Rádio

* **Arquivos:**
  * `assets/wingman-radio/falco.png`
  * `assets/wingman-radio/fox.png`
  * `assets/wingman-radio/peppy.png`
  * `assets/wingman-radio/slippy.png`
  * `assets/wingman-radio/miyu.png`
  * `assets/wingman-radio/static1.png` até `static7.png`
  * Cópias históricas/protótipos em `Docs/radio-sprites/`
* **Origem e Documentação no Código:** Conforme documentado expressamente em `src/hud-game.js` (linhas 15–28), estes sprites foram recortados da folha de retratos (*mugshot sheet* / *portraits*) do jogo **Star Fox 2 (Super Nintendo Entertainment System / SNES)**, disponibilizados pela comunidade através de *The Spriters Resource* (spriters-resource.com).
* **Titular dos Direitos Originais:** © Nintendo Co., Ltd. Todos os direitos reservados.
* **Status:** Material de terceiros utilizado estritamente como homenagem visual de fã e protótipo pedagógico sem fins comerciais; não relicenciado sob MIT.

### 2.2 Efeitos Sonoros e Amostras de Voz (`sons/`)

Nenhum arquivo de áudio deste repositório é reivindicado como obra original autoral sob a licença MIT. A proveniência e licenciamento de cada categoria são descritas a seguir:

#### A. Falas e Efeitos de Personagens
* **Arquivos:** `sons/falco.mp3`, `sons/fox.mp3`, `sons/peppy.mp3`, `sons/slippy.mp3`, `sons/miyu.wav`.
* **Detentores prováveis:** Nintendo Co., Ltd. (amostras sonoras associadas à franquia *Star Fox*).
* **Status:** Proveniência/licença precisa ser verificada; não licenciado pela MIT.

#### B. Áudios Externos Identificados Nominalmente
* `sons/angry-birds-space-bomb-explosion-sound.mp3` — Proveniência/licença precisa ser verificada (referência associada a Rovio Entertainment).
* `sons/sonic-thats-no-good_boV0d2M.mp3` — Proveniência/licença precisa ser verificada (referência associada a SEGA).
* `sons/sonic-youth-superstar-cutmp3.mp3` — Proveniência/licença precisa ser verificada.
* `sons/rebel-blaster.mp3` — Proveniência/licença precisa ser verificada.
* `sons/numbers-lore-explosion-sound-effect.mp3` — Proveniência/licença precisa ser verificada.
* `sons/shotgun-blasting-intimidator.mp3` — Proveniência/licença precisa ser verificada.
* `sons/explode_WHu7g6E.mp3` — Proveniência/licença precisa ser verificada.

#### C. Efeitos Sonoros de Combate e Interface
* **Arquivos:**
  * `sons/disparo.wav`
  * `sons/Disparo generico.mp3`
  * `sons/Disparo carregado carregando.mp3`
  * `sons/disparo carregado disparo.mp3`
  * `sons/explosao disparo completamente carregado.mp3`
  * `sons/ricochete carta contato pulo.mp3`
  * `sons/som disparo swirl.mp3`
  * `sons/inimigo disparo generico.mp3`
  * `sons/som mira disparo laser boss dourado.mp3`
  * `sons/Laser boss.mp3`
  * `sons/Teleporte dourado.mp3`
  * `sons/Radio connect.mp3`
  * `sons/Radio disconnect.mp3`
  * `sons/s1_ca-online-audio-converter.mp3`
* **Status:** Proveniência/licença precisa ser verificada; mantidos para efeito de gameplay local, não cobertos pela licença MIT.

### 2.3 Ícones de Aplicação (`icons/`)

* **Arquivos:** `icons/apple-touch-icon.png`, `icons/favicon-32.png`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-512-maskable.png`.
* **Status:** Proveniência/licença precisa ser verificada.

### 2.4 Bibliotecas e Dependências Externas em Tempo de Execução

* **Three.js:**
  * Utilizado como motor de renderização WebGL 3D via import map CDN (`https://unpkg.com/three` em `index.html`).
  * Autores: Ricardo Cabello (Mr.doob) e contribuidores do Three.js.
  * Licença: MIT License.
