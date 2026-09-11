# Star Anki

Rail shooter de estudo estilo Star Fox 64 que transforma um baralho do Anki em perguntas do jogo. Three.js via CDN import map, sem bundler, ES modules nativos: `index.html` + `src/{anki.js, quiz.js, hud.js, main.js, rail.js, combat.js, input.js, storage.js}`.

**Leia [PROGRESSO.md](PROGRESSO.md) antes de mexer em qualquer coisa neste projeto** — tem o histórico do que já foi feito, pendências, e decisões/armadilhas importantes (ex: dois `.claude/launch.json` que precisam ficar sincronizados, de onde vêm as perguntas bônus, a regra de sempre pesquisar e adicionar perguntas extras a um baralho novo). Atualize esse arquivo sempre que entregar algo novo ou aprender algo que valha a pena não esquecer.

Servidor de teste: `preview_start` com `name: "static"` (serve a raiz deste projeto em `http://localhost:8420`). Sempre `preview_stop` depois de testar.

**Git**: este projeto está conectado a `github.com/Ratuckk/Star-Anki` (remote `origin`, branch `main`). O usuário (dono do repo, conta GitHub Ratuckk) autorizou explicitamente fazer commit + `git push origin main` automaticamente ao final de cada entrega (fase concluída, bugfix, etc.), sem precisar perguntar de novo a cada vez. Continue seguindo as regras normais de segurança pra git (nunca force-push, nunca pular hooks, revisar `git status`/conteúdo antes de `git add -A`), só não é necessário pedir confirmação explícita pro push em si neste repositório específico.
