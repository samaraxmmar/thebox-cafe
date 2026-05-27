@echo off
title Activer Developer Mode Windows
color 0B
echo.
echo  ===========================================
echo    Activer Developer Mode (necessaire pour
echo    electron-builder sur Windows non-admin)
echo  ===========================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Lancer ce script en ADMINISTRATEUR.
    echo Clic droit sur le fichier - Executer en tant qu'administrateur
    pause
    exit /b 1
)

echo Activation de Developer Mode via le registre...
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /t REG_DWORD /f /v "AllowDevelopmentWithoutDevLicense" /d "1" >nul

if %errorlevel% equ 0 (
    echo.
    echo  ===========================================
    echo   OK : Developer Mode active.
    echo  ===========================================
    echo.
    echo Tu peux maintenant relancer npm run dist:clean
    echo sans avoir besoin d'admin a chaque fois.
) else (
    echo [ERREUR] Echec activation.
)

echo.
pause
