@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Test-RemoteTailnet.ps1" -SkipMoonlight
if errorlevel 1 pause
