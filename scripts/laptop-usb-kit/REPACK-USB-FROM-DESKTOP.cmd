@echo off
REM Run on DESKTOP only — refreshes this USB from agent-dump repo
set REPO=C:\Users\abhinav\Desktop\MAIN_PROGRAMMING_FILES\agent-dump\scripts
if not exist "%REPO%\pack-laptop-usb.ps1" (
  echo Repo not found at %REPO%
  echo Edit REPO= in this file if your clone path differs.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO%\pack-laptop-usb.ps1" -Drive %~d0\
if errorlevel 1 pause
