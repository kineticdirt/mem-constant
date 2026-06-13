@echo off
title Remote Control Setup (Admin)
rem One-click remote-control setup. Self-elevates to Administrator, then runs the
rem full machine-aware flow (laptop = install+configure, desktop = prep).

net session >nul 2>&1
if %errorlevel% NEQ 0 (
    echo Requesting Administrator rights...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Setup-Everything.ps1"

echo.
echo ================================================================
echo  Setup finished. Read the [OK]/[WARN]/[FAIL] messages above.
echo ================================================================
pause >nul
