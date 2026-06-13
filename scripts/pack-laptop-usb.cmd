@echo off
REM Pack laptop USB kit to E: — no execution-policy change needed
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0pack-laptop-usb.ps1" %*
if errorlevel 1 pause
