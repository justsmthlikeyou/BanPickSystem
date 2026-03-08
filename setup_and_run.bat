@echo off
setlocal enabledelayedexpansion
title GenshinPickSystem Configuration and Runner

echo ========================================================
echo   Genshin Pick System - Automated Environment Setup
echo ========================================================
echo.

echo [1/4] Terminating any existing servers on port 8000 and 5173...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr "LISTENING" ^| findstr ":8000 "') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr "LISTENING" ^| findstr ":5173 "') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo Pre-existing connections cleared.
echo.

echo [2/4] Verifying Environments...
:: Check Python Venv
if not exist "%~dp0venv\Scripts\activate.bat" (
    echo [X] ERROR: Python virtual environment not found at %~dp0venv
    pause
    exit /b 1
)
echo [OK] Python venv found.

:: Check Node Modules
if not exist "%~dp0frontend\node_modules\" (
    echo [!] Frontend dependencies not found. Running npm install...
    cd /d "%~dp0frontend"
    call npm install
)
echo [OK] Node modules verified.
echo.

echo [3/4] Running Database Migrations (Backend)...
cd /d "%~dp0backend"
:: Run alembic safely using the venv binary
call "%~dp0venv\Scripts\alembic.exe" upgrade head
if %errorlevel% neq 0 (
    echo [X] ERROR: Database migration failed.
    pause
    exit /b 1
)
echo [OK] Migrations applied successfully.
echo.

echo [4/4] Starting Servers Simultaneously...

:: Start Backend in a new detached window
start "Genshin Backend Server" cmd /k "cd /d ""%~dp0backend"" && call ""%~dp0venv\Scripts\activate.bat"" && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

:: Start Frontend in a new detached window
start "Genshin Frontend Server" cmd /k "cd /d ""%~dp0frontend"" && npm run dev"

echo ========================================================
echo   System Boot Completed!
echo   Frontend: http://localhost:5173
echo   Backend API: http://localhost:8000
echo   You can close this window now. The servers will 
echo   keep running in the two newly opened cmd windows.
echo ========================================================
pause
