@echo off
rem SteamDeals launcher for Windows - double-click to start the app.
rem Starts the Vite server (installing or repairing dependencies when
rem needed) and opens SteamDeals in the default browser. Reuses an
rem already-running server, so clicking it again just opens a new tab.
rem Stop the app with the Quit button in the UI, or: npm run stop

setlocal enabledelayedexpansion
title SteamDeals
cd /d "%~dp0"

set "URL=http://localhost:5173"
set "LOG=steamdeals-launcher.log"

rem Server already running? Just open the app.
curl -s -o NUL --max-time 2 %URL% >NUL 2>&1
if not errorlevel 1 (
    start "" %URL%
    exit /b 0
)

where node >NUL 2>&1
if errorlevel 1 (
    echo Node.js was not found. Install it from https://nodejs.org and run this again.
    pause
    exit /b 1
)

rem Install when dependencies are missing OR broken (e.g. an interrupted
rem install) - running the vite binary catches both.
set "NEED_INSTALL="
if not exist "node_modules\.bin\vite.cmd" set "NEED_INSTALL=1"
if not defined NEED_INSTALL (
    call "node_modules\.bin\vite.cmd" --version >NUL 2>&1
    if errorlevel 1 set "NEED_INSTALL=1"
)

if defined NEED_INSTALL (
    echo Installing dependencies - this can take a few minutes...
    if exist node_modules rmdir /s /q node_modules
    if exist package-lock.json (
        call npm ci --no-audit --no-fund
    ) else (
        call npm install --no-audit --no-fund
    )
    if errorlevel 1 (
        echo.
        echo Could not install dependencies. Check your internet connection,
        echo then run:  npm install   in this folder.
        pause
        exit /b 1
    )
)

rem Start the server in its own minimized window so it keeps running after
rem this launcher closes. The Quit button in the app stops it.
start "SteamDeals Server" /min cmd /c "npm run dev > %LOG% 2>&1"

echo Starting SteamDeals...
set /a TRIES=0
:wait
curl -s -o NUL --max-time 1 %URL% >NUL 2>&1
if not errorlevel 1 goto open
set /a TRIES+=1
if %TRIES% geq 90 (
    echo The server did not start in time. See %LOG% in this folder.
    pause
    exit /b 1
)
timeout /t 1 /nobreak >NUL
goto wait

:open
start "" %URL%
exit /b 0
