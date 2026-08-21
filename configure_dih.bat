@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo Dih yayin ayarlari
set /p GH_OWNER=GitHub kullanici/organizasyon: 
set /p GH_REPO=GitHub repo: 
set /p GH_BRANCH=Branch [main]: 
if "%GH_BRANCH%"=="" set "GH_BRANCH=main"
set /p MS_CLIENT=Microsoft Entra public Client ID: 
set /p DISCORD_ID=Discord Application ID [istege bagli]: 

if "%GH_OWNER%"=="" (echo [HATA] GitHub owner bos olamaz.& exit /b 1)
if "%GH_REPO%"=="" (echo [HATA] GitHub repo bos olamaz.& exit /b 1)
if "%MS_CLIENT%"=="" (echo [HATA] Microsoft Client ID bos olamaz.& exit /b 1)

set "DIH_CFG_GH_OWNER=%GH_OWNER%"
set "DIH_CFG_GH_REPO=%GH_REPO%"
set "DIH_CFG_GH_BRANCH=%GH_BRANCH%"
set "DIH_CFG_MS_CLIENT=%MS_CLIENT%"
set "DIH_CFG_DISCORD=%DISCORD_ID%"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$o=[ordered]@{github=[ordered]@{owner=$env:DIH_CFG_GH_OWNER;repo=$env:DIH_CFG_GH_REPO;branch=$env:DIH_CFG_GH_BRANCH;versionsRoot='sürümler'};updates=[ordered]@{enabled=$true;owner=$env:DIH_CFG_GH_OWNER;repo=$env:DIH_CFG_GH_REPO;prerelease=$false;requireChecksum=$true};microsoftClientId=$env:DIH_CFG_MS_CLIENT;discordRpc=([bool]$env:DIH_CFG_DISCORD);discordAppId=$env:DIH_CFG_DISCORD}; $o|ConvertTo-Json -Depth 5|Set-Content -Encoding UTF8 'dih.config.json'"
if errorlevel 1 exit /b 1
echo [OK] dih.config.json yazildi.
