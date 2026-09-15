# Script de instalação do Atalho de Desktop do Star Anki
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoDir = Split-Path -Parent $scriptDir
$icoPath = Join-Path $repoDir "icons\star-anki.ico"

# 1. Localizar o executável do navegador (Edge ou Chrome)
$browserCandidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:LocalAppData\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
)

$browserPath = $null
foreach ($path in $browserCandidates) {
    if (Test-Path $path) {
        $browserPath = $path
        break
    }
}

if (-not $browserPath) {
    Write-Host "[ERRO] Não foi possível localizar o Microsoft Edge ou Google Chrome no sistema." -ForegroundColor Red
    exit 1
}

# 2. Caminhos do Desktop e Menu Iniciar
$desktopPath = [Environment]::GetFolderPath("Desktop")
$programsPath = [Environment]::GetFolderPath("Programs")
$profileDir = Join-Path $env:LOCALAPPDATA "Star-Anki\User Data"

if (-not (Test-Path $profileDir)) {
    New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
}

$appUrl = "https://ratuckk.github.io/Star-Anki/"
$arguments = "--app=`"$appUrl`" --window-size=1280,720 --user-data-dir=`"$profileDir`""

$wsh = New-Object -ComObject WScript.Shell

# Criar atalho na Área de Trabalho
$desktopShortcutPath = Join-Path $desktopPath "Star Anki.lnk"
$shortcut = $wsh.CreateShortcut($desktopShortcutPath)
$shortcut.TargetPath = $browserPath
$shortcut.Arguments = $arguments
$shortcut.IconLocation = "$icoPath,0"
$shortcut.Description = "Star Anki - Rail Shooter de Estudo com Auto-Atualização"
$shortcut.WorkingDirectory = $repoDir
$shortcut.Save()

# Criar atalho no Menu Iniciar
$menuShortcutPath = Join-Path $programsPath "Star Anki.lnk"
$menuShortcut = $wsh.CreateShortcut($menuShortcutPath)
$menuShortcut.TargetPath = $browserPath
$menuShortcut.Arguments = $arguments
$menuShortcut.IconLocation = "$icoPath,0"
$menuShortcut.Description = "Star Anki - Rail Shooter de Estudo com Auto-Atualização"
$menuShortcut.WorkingDirectory = $repoDir
$menuShortcut.Save()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  STAR ANKI - APLICATIVO DESKTOP INSTALADO COM SUCESSO!   " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Atalho criado na Área de Trabalho: $desktopShortcutPath" -ForegroundColor White
Write-Host "  Atalho criado no Menu Iniciar:     $menuShortcutPath" -ForegroundColor White
Write-Host "  Auto-Atualização: Ativada via GitHub Pages + Service Worker" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
