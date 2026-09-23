# DESIGN AS-BUILT: SISTEMA DE ÁUDIO & SOUND CUES

> **Status:** AS-BUILT (VIGENTE EM PRODUÇÃO)  
> **Última verificação:** 2026-09-23  
> **Código relacionado:** [`src/audio.js`](../../../src/audio.js), [`src/audio-cues.js`](../../../src/audio-cues.js), [`src/settings.js`](../../../src/settings.js)  

---

## 1. REPRODUTOR WEBAUDIO & CICLO DE VIDA
- Desbloqueio seguro do AudioContext no primeiro gesto do usuário na missão.
- Pré-carregamento dos arquivos de áudio da pasta `sons/`.
- Cancelamento e interrupção atômica de loops de áudio no encerramento da partida (`teardown`).
- Loop de carregamento do tiro teleguiado (`Disparo carregado carregando.mp3`) calibrado para cortar a introdução e repetir apenas os 360ms finais, cessando imediatamente ao soltar o gatilho.

---

## 2. CONFIGURAÇÕES & MODOS DE ÁUDIO
- **Tudo Ligado:** Reprodução completa de efeitos sonoros, tiros, explosões, telegraphs e rádio.
- **Somente Rádio:** Silencia armas e combate espacial, preservando exclusivamente as transmissões e vozes dos companheiros de esquadrão.
- **Desligado:** Mudo total.

---

## 3. CATÁLOGO DE 97 SOUND CUES
- Todas as ações do jogo possuem uma `SoundCue` formal registrada em `src/audio-cues.js`.
- Cues mapeadas com arquivos reais são tocadas nativamente.
- Cues sem arquivos utilizam um **fallback sintético** curto e discreto gerado via oscilador WebAudio, garantindo que nenhum evento do jogo seja mudo.
