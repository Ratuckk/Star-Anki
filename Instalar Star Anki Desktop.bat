@echo off
chcp 65001 >nul
title Instalando Star Anki Desktop...
cd /d "%~dp0"

echo.
echo ==========================================================
echo        INSTALANDO STAR ANKI - APLICATIVO DESKTOP
echo ==========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\install-desktop.ps1"

echo.
pause
