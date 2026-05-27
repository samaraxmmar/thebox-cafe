@echo off
title The Box - Installation auto-demarrage
color 0B
cd /d %~dp0

echo.
echo  ===========================================
echo    THE BOX - Auto-demarrage Windows
echo  ===========================================
echo.
echo Ce script va creer une tache planifiee Windows
echo qui demarre The Box automatiquement a l'ouverture
echo de Windows.
echo.
echo Appuie sur une touche pour continuer (ou Ctrl+C pour annuler)...
pause >nul

:: Verifier qu'on est admin
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERREUR] Ce script doit etre execute en ADMINISTRATEUR.
    echo Clic droit sur le fichier puis "Executer en tant qu'administrateur"
    pause
    exit /b 1
)

:: Creer la tache planifiee
echo.
echo [INFO] Creation de la tache planifiee "TheBoxPOS"...
schtasks /Create /F /TN "TheBoxPOS" /TR "\"%~dp0start.bat\"" /SC ONLOGON /RL HIGHEST /DELAY 0000:30

if %errorlevel% equ 0 (
    echo.
    echo  ===========================================
    echo   OK : Auto-demarrage configure !
    echo  ===========================================
    echo.
    echo The Box demarrera automatiquement a chaque
    echo ouverture de session Windows ^(delai 30s^).
    echo.
    echo Pour le desinstaller : execute uninstall-autostart.bat
) else (
    echo.
    echo [ERREUR] Echec de creation de la tache.
)

echo.
pause
