# Script de instalação do Atalho de Desktop do Star Anki (Versão Local em Tempo Real)
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoDir = Split-Path -Parent $scriptDir
$icoPath = Join-Path $repoDir "icons\star-anki.ico"
$vbsPath = Join-Path $repoDir "tools\run-desktop.vbs"

# 1. Verificar se o Node.js está instalado
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "[AVISO] Node.js não foi encontrado no PATH. O Star Anki precisa do Node.js instalado." -ForegroundColor Yellow
}

# 2. Caminhos do Desktop e Menu Iniciar
$desktopPath = [Environment]::GetFolderPath("Desktop")
$programsPath = [Environment]::GetFolderPath("Programs")
$profileDir = Join-Path $env:LOCALAPPDATA "Star-Anki\User Data"

if (-not (Test-Path $profileDir)) {
    New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
}

$wsh = New-Object -ComObject WScript.Shell
$arguments = "`"$vbsPath`""

# Criar atalho na Área de Trabalho
$desktopShortcutPath = Join-Path $desktopPath "Star Anki.lnk"
$shortcut = $wsh.CreateShortcut($desktopShortcutPath)
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = $arguments
$shortcut.IconLocation = "$icoPath,0"
$shortcut.Description = "Star Anki - Rail Shooter de Estudo (Versão Local)"
$shortcut.WorkingDirectory = $repoDir
$shortcut.Save()

# Criar atalho no Menu Iniciar
$menuShortcutPath = Join-Path $programsPath "Star Anki.lnk"
$menuShortcut = $wsh.CreateShortcut($menuShortcutPath)
$menuShortcut.TargetPath = "wscript.exe"
$menuShortcut.Arguments = $arguments
$menuShortcut.IconLocation = "$icoPath,0"
$menuShortcut.Description = "Star Anki - Rail Shooter de Estudo (Versão Local)"
$menuShortcut.WorkingDirectory = $repoDir
$menuShortcut.Save()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  STAR ANKI - APLICATIVO DESKTOP ATUALIZADO COM SUCESSO!  " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Atalho criado na Área de Trabalho: $desktopShortcutPath" -ForegroundColor White
Write-Host "  Atalho criado no Menu Iniciar:     $menuShortcutPath" -ForegroundColor White
Write-Host "  Modo de Execução: Versão Local em Tempo Real (No-Cache)" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
