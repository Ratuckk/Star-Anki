@echo off
cd /d "%~dp0"

set "PROFILE_DIR=%LOCALAPPDATA%\Star-Anki\User Data"
if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%"

set "APP_URL=https://ratuckk.github.io/Star-Anki/"
set "ARGS=--app="%APP_URL%" --window-size=1280,720 --user-data-dir="%PROFILE_DIR%""

if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" %ARGS%
    exit /b
)

if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" %ARGS%
    exit /b
)

if exist "%LocalAppData%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%LocalAppData%\Microsoft\Edge\Application\msedge.exe" %ARGS%
    exit /b
)

if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" %ARGS%
    exit /b
)

start "" "%APP_URL%"
