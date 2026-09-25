@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install it from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo Installing GCO server dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed. Check the message above and try again.
    pause
    exit /b 1
  )
)

echo.
echo GCO server is starting...
echo The portal will open automatically in a few seconds.
echo Keep this window open while using the website.
echo.
start "GCO Server" /b cmd /c "npm start"
timeout /t 5 /nobreak >nul
start "" "http://localhost:3000/portal.html"
echo.
echo GCO is available at http://localhost:3000/portal.html
echo Close the GCO Server window or press Ctrl+C there to stop it.
pause
