@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo Ilk kurulum yapiliyor...
  call npm install || goto :hata
)
start "" http://127.0.0.1:3737
node sunucu.mjs
pause
exit /b
:hata
echo Kurulum basarisiz. Node.js kurulu mu? https://nodejs.org
pause
