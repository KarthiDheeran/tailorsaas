@echo off
setlocal
title Build NewLook Customer Package
cd /d "%~dp0.."
node scripts\build-customer-package.mjs
if errorlevel 1 goto failed
echo SUCCESS: Copy the ZIP from the release folder to the customer computer.
start "" explorer.exe "%CD%\release"
pause
exit /b 0
:failed
echo FAILED: Do not distribute a partial package. Read the error above.
pause
exit /b 1
