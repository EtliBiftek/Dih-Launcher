@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "GRADLE_VERSION=9.6.1"
set "GRADLE_SHA256=9c0f7faeeb306cb14e4279a3e084ca6b596894089a0638e68a07c945a32c9e14"
set "TOOLS=%CD%\.build-tools"
set "GRADLE_HOME=%TOOLS%\gradle-%GRADLE_VERSION%"
set "ZIP=%TOOLS%\gradle-%GRADLE_VERSION%-bin.zip"

where java >nul 2>nul
if errorlevel 1 (
  echo [HATA] Java 21 bulunamadi. JDK 21 kurup tekrar calistir.
  exit /b 1
)
for /f "tokens=3" %%V in ('java -version 2^>^&1 ^| findstr /i "version"') do set "JAVA_VERSION=%%~V"
for /f "tokens=1 delims=." %%M in ("%JAVA_VERSION%") do set "JAVA_MAJOR=%%M"
if "%JAVA_MAJOR%"=="1" for /f "tokens=2 delims=." %%M in ("%JAVA_VERSION%") do set "JAVA_MAJOR=%%M"
if not defined JAVA_MAJOR (
  echo [HATA] Java surumu okunamadi.
  exit /b 1
)
if %JAVA_MAJOR% LSS 21 (
  echo [HATA] Java 21+ gerekli. Bulunan: %JAVA_VERSION%
  exit /b 1
)

if not exist "%GRADLE_HOME%\bin\gradle.bat" (
  if not exist "%TOOLS%" mkdir "%TOOLS%"
  echo [1/3] Gradle %GRADLE_VERSION% indiriliyor...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri 'https://services.gradle.org/distributions/gradle-%GRADLE_VERSION%-bin.zip' -OutFile '%ZIP%'"
  if errorlevel 1 exit /b 1

  echo [2/3] SHA-256 dogrulaniyor...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$h=(Get-FileHash -Algorithm SHA256 '%ZIP%').Hash.ToLower(); if($h -ne '%GRADLE_SHA256%'){ Write-Error ('Gradle SHA-256 uyusmuyor: '+$h); exit 1 }"
  if errorlevel 1 exit /b 1

  powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%TOOLS%' -Force"
  if errorlevel 1 exit /b 1
)

echo [3/3] Dih Client 1.21.11 derleniyor...
call "%GRADLE_HOME%\bin\gradle.bat" --no-daemon clean build --stacktrace
if errorlevel 1 exit /b %errorlevel%

echo.
echo [OK] JAR: build\libs\
exit /b 0
