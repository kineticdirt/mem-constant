@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Run-From-Laptop.ps1"
if errorlevel 1 pause
