@echo off
cd /d "%~dp0"
title Star Anki Launcher

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao foi encontrado no PATH do sistema.
    echo O Star Anki Desktop precisa do Node.js instalado para servir a versao local.
    pause
    exit /b 1
)

node tools\run-game.mjs
