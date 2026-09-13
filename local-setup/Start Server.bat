@echo off
setlocal
title NewLook Local Server
call "%~dp0settings.cmd"
cd /d "%~dp0.."
node scripts\local-windows-setup.mjs start "%TAILOR_SUPABASE_DIR%"
if errorlevel 1 echo Server stopped or failed. Read the message above.
pause
