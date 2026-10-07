@echo off
echo ============================================================
echo   Starting CD-Recruit Services in Separate Terminals
echo ============================================================
echo.

cd /d "%~dp0"

echo [1/3] Launching Backend API (Port 3001)...
start "CD-Recruit Backend API (Port 3001)" cmd /k "cd /d %~dp0 && npm run dev:api"

ping -n 3 127.0.0.1 >nul

echo [2/3] Launching Candidate Web (Port 3000)...
start "CD-Recruit Candidate Web (Port 3000)" cmd /k "cd /d %~dp0 && npm run dev:candidate"

ping -n 3 127.0.0.1 >nul

echo [3/3] Launching Admin Web (Port 5173)...
start "CD-Recruit Admin Web (Port 5173)" cmd /k "cd /d %~dp0 && npm run dev:admin"

echo.
echo ============================================================
echo All services have been launched in separate terminal windows!
echo   - Backend API:    http://localhost:3001/api/v1/health
echo   - Candidate Web:  http://localhost:3000
echo   - Admin Web:      http://localhost:5173
echo   - Swagger Docs:   http://localhost:3001/api-docs
echo ============================================================
