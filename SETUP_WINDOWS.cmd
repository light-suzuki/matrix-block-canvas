@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-windows.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Setup failed. See the message above.
  pause
  exit /b %EXIT_CODE%
)

echo.
echo Matrix Block Canvas is ready.
pause
