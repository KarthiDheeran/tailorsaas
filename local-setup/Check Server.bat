@echo off
setlocal
call "%~dp0settings.cmd"
cd /d "%~dp0.."
node scripts\local-windows-setup.mjs status "%TAILOR_SUPABASE_DIR%"
pause
