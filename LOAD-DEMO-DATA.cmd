@echo off
rem Fills the demo school with sample classes, students, marks, fees, attendance and a syllabus,
rem so you can show the app without using real school data. Safe to run again.
rem The app must already be running (START-APP.cmd), at http://localhost:8001
cd /d "%~dp0backend"
if not exist ".venv\Scripts\python.exe" (
  echo The app has not been set up yet. Run START-APP.cmd first, wait until it opens, then run this again.
  pause
  exit /b 1
)
echo Loading demo data. This takes a minute or two...
".venv\Scripts\python.exe" seed_demo.py
echo.
echo Done. Sign in at http://localhost:8001/login with school code "demo".
pause
