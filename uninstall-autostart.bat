@echo off
title The Box - Desinstallation auto-demarrage
color 0C
cd /d %~dp0

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Execute en tant qu'administrateur.
    pause
    exit /b 1
)

schtasks /Delete /F /TN "TheBoxPOS"
echo.
echo Tache "TheBoxPOS" supprimee.
pause
