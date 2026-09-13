@echo off
setlocal
call "%~dp0settings.cmd"
cd /d "%~dp0.."
if not exist node_modules\next\dist\bin\next (
  call npm.cmd ci
  if errorlevel 1 goto failed
)
node scripts\run-local-app.mjs "%TAILOR_SUPABASE_DIR%" --build-only
if errorlevel 1 goto failed
echo READY: Use Start Server.bat from now on.
pause
exit /b 0
:failed
echo FAILED: App build did not complete. Read the error above.
pause
exit /b 1
