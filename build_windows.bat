@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [HATA] Node.js 20+ bulunamadi.
  exit /b 1
)
if not exist node_modules (
  echo [1/3] Bagimliliklar kuruluyor...
  call npm install
  if errorlevel 1 exit /b %errorlevel%
) else (
  echo [1/3] Bagimliliklar mevcut.
)
echo [2/3] Kaynak kontrolu...
call npm run check
if errorlevel 1 exit /b %errorlevel%
echo [3/3] Windows kurulumu olusturuluyor...
call npm run dist:win
exit /b %errorlevel%
