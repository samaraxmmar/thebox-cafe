@echo off
title The Box - Serveur POS
color 0A
cd /d %~dp0

echo.
echo  ===========================================
echo    THE BOX - Cafe and Gestion
echo  ===========================================
echo.

:: Mode production par defaut
set NODE_ENV=production

:: Verifier Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js n'est pas installe.
    echo Telecharger sur https://nodejs.org
    pause
    exit /b 1
)

:: Premier lancement : creer .env depuis l'exemple
if not exist .env (
    if exist .env.example (
        echo [SETUP] Premier lancement - creation du fichier .env...
        copy .env.example .env >nul
        echo.
        echo  IMPORTANT : edite .env et saisis SUPABASE_URL + SUPABASE_KEY
        echo.
        notepad .env
        echo.
        echo Appuie sur une touche apres avoir sauvegarde .env...
        pause >nul
    )
)

:: Installer les dependances si necessaire
if not exist node_modules (
    echo [SETUP] Installation des dependances...
    call npm install
    echo.
)

:: Demarrer
echo [INFO] Demarrage du serveur en mode PRODUCTION...
echo [INFO] Ouvre http://localhost:3001 dans Chrome
echo [INFO] Ctrl+C pour arreter proprement
echo.
echo  ===========================================
echo.

node server.js

echo.
echo  Serveur arrete.
pause
