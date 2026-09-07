@echo off
setlocal
cd /d "%~dp0"

set "PORTABLE=%~dp0dist\MatrixBlockCanvas-portable.html"

if exist "%PORTABLE%" (
  start "" "%PORTABLE%"
  exit /b 0
)

echo Portable build not found. Running setup first...
call "%~dp0SETUP_WINDOWS.cmd"
