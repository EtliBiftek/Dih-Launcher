@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where node >nul 2>nul || (echo [HATA] Node.js 20+ gerekli.& exit /b 1)
where npm >nul 2>nul || (echo [HATA] npm bulunamadi.& exit /b 1)
echo [1/4] Launcher bagimliliklari...
call npm install
if errorlevel 1 exit /b %errorlevel%
echo [2/4] Kontroller...
call npm run verify
if errorlevel 1 exit /b %errorlevel%
echo [3/4] Dih Client 1.21.11...
call client-mod\reference-1.21.11\build_client.bat
if errorlevel 1 exit /b %errorlevel%
echo [4/4] Windows installer...
call npm run dist:win
if errorlevel 1 exit /b %errorlevel%
echo [OK] dist klasoru ve client-mod\reference-1.21.11\build\libs hazir.
