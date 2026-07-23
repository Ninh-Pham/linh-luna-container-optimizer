@echo off
setlocal
chcp 65001 >nul
title Linh Luna T&M Container Optimizer V4
cd /d "%~dp0"

echo.
echo ============================================================
echo        LINH LUNA T^&M - CONTAINER OPTIMIZER V4
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] May tinh chua co Node.js.
  echo Hay cai Node.js 22 LTS tai: https://nodejs.org/
  echo Sau khi cai xong, dong cua so nay va chay lai file.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Dang cai dat thu vien lan dau. Buoc nay co the mat vai phut...
  call npm install
  if errorlevel 1 (
    echo.
    echo [LOI] Khong cai dat duoc thu vien.
    echo Kiem tra ket noi Internet, sau do chay lai file nay.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo Dang khoi dong chuong trinh...
echo Dia chi: http://127.0.0.1:5173
echo Hay giu cua so nay mo trong khi su dung.
echo Muon tat chuong trinh: nhan Ctrl+C.
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "$url='http://127.0.0.1:5173'; for($i=0;$i -lt 60;$i++){try{$r=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1;if($r.StatusCode -eq 200){Start-Process $url;exit}}catch{};Start-Sleep -Milliseconds 500}"

call npm run dev:local

echo.
echo Chuong trinh da dung.
pause
endlocal
