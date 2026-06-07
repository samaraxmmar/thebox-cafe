@echo off
REM ──────────────────────────────────────────────
REM  THE BOX — Import des produits depuis CSV
REM  Double-clique sur ce fichier pour importer.
REM ──────────────────────────────────────────────
cd /d "%~dp0"
echo.
echo ════════════════════════════════════════════════
echo   THE BOX — Import produits du CSV
echo ════════════════════════════════════════════════
echo.
node scripts\import-produits-csv.js data\produits_import.csv
echo.
echo ════════════════════════════════════════════════
echo   Termine. Appuie sur une touche pour fermer.
echo ════════════════════════════════════════════════
pause >nul
