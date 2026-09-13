@echo off
setlocal
call "%~dp0settings.cmd"
cd /d "%~dp0.."
node scripts\setup-local-database.mjs "%TAILOR_SUPABASE_DIR%"
if errorlevel 1 echo STOPPED: Read the message above. Never reset an existing database to repeat this step.
pause
