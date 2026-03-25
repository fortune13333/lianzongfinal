@echo off
title ChainTrace

cd /d "%~dp0"

if not exist ".venv\" (
    echo  [ERROR] Virtual environment not found. Run setup.bat first.
    pause & exit /b 1
)

:: Read port from config.ini, default 8001
set PORT=8001
for /f "tokens=2 delims==" %%i in ('findstr /i "^port" agentv2\config.ini 2^>nul') do set PORT=%%i
set PORT=%PORT: =%

echo.
echo  ==========================================
echo    ChainTrace starting...
echo    Open browser: http://localhost:5173
echo    API backend:  http://localhost:%PORT%
echo    Close both windows to stop
echo  ==========================================
echo.

start "ChainTrace Frontend" cmd /k "cd /d "%~dp0" && npm run dev"
start "ChainTrace Backend"  cmd /k "cd /d "%~dp0agentv2" && ..\\.venv\\Scripts\\python.exe agent.py"
