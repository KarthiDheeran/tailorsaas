@echo off
setlocal
call "%~dp0settings.cmd"
cd /d "%~dp0.."
node scripts\local-windows-setup.mjs check "%TAILOR_SUPABASE_DIR%"
if errorlevel 1 echo FAILED: Fix the error above before continuing.
pause
