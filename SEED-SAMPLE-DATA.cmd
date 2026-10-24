@echo off
title Scholaris sample data
cd /d "%~dp0backend"
if not exist ".venv\Scripts\python.exe" (
  echo Start the app once with START-APP.cmd first, so the backend is set up.
  pause
  exit /b 1
)
echo Adding sample data to the running app at http://localhost:8001 ...
echo.
".venv\Scripts\python.exe" seed_demo.py
echo.
pause
