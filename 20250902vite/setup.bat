@echo off
title ChainTrace Setup

cd /d "%~dp0"

echo.
echo  ==========================================
echo    ChainTrace - First Time Setup
echo  ==========================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    py --version >nul 2>&1
    if errorlevel 1 (
        echo  [ERROR] Python not found. Install Python 3.10+ first.
        echo          https://www.python.org/downloads/
        pause & exit /b 1
    )
    set PYTHON=py
) else (
    set PYTHON=python
)
echo  [OK] Python found.

:: Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js not found. Install Node.js 18+ first.
    echo          https://nodejs.org/
    pause & exit /b 1
)
echo  [OK] Node.js found.

echo.
echo  [1/4] Creating Python virtual environment...
if not exist ".venv\" (
    %PYTHON% -m venv .venv
    if errorlevel 1 ( echo  [ERROR] Failed to create venv. & pause & exit /b 1 )
    echo        Done.
) else (
    echo        Already exists, skipping.
)

echo  [2/4] Installing Python dependencies...
.venv\Scripts\pip install -r agentv2\requirements.txt -q
if errorlevel 1 ( echo  [ERROR] pip install failed. Check network connection. & pause & exit /b 1 )
echo        Done.

echo  [3/4] Installing frontend dependencies (npm install)...
npm install --silent
if errorlevel 1 ( echo  [ERROR] npm install failed. Check network connection. & pause & exit /b 1 )
echo        Done.

echo  [4/4] Building frontend (npm run build)...
npm run build
if errorlevel 1 ( echo  [ERROR] Frontend build failed. & pause & exit /b 1 )
echo        Done.

echo.
echo  ==========================================
echo    Setup complete! Run start.bat to launch.
echo  ==========================================
echo.
pause
