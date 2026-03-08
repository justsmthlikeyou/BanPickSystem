@echo off
cd /d F:\GenshinPickSystem\backend
echo.
echo [1/2] Applying migration (creating tables)...
F:\GenshinPickSystem\venv\Scripts\alembic.exe upgrade head
if %errorlevel% neq 0 (
    echo ERROR: Migration apply failed.
    pause
    exit /b 1
)

echo.
echo [2/2] Seeding character data...
F:\GenshinPickSystem\venv\Scripts\python.exe seed.py
if %errorlevel% neq 0 (
    echo ERROR: Seeding failed.
    pause
    exit /b 1
)

echo.
echo ================================================
echo  Database setup complete!
echo ================================================
