@echo off
setlocal
echo ONE-TIME TECHNICIAN STEP
echo In Studio, create admin@tailor.test under Authentication - Users.
echo Choose a private password and auto-confirm the user. Do not send an invitation.
echo Then paste the opened SQL file into Studio's SQL Editor and run it.
start "" "http://localhost:8000"
start "" notepad.exe "%~dp0create-local-admin.sql"
pause
