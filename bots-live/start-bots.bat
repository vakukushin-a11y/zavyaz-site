@echo off
title ZAVYAZ Bots
echo ========================================
echo   ZAVYAZ - Telegram + MAX Bots
echo ========================================
echo.

set OPENAI_BASE_URL=https://routerai.ru/api/v1
set OPENAI_API_KEY=sk-ATy8r41YcAoMxFtezrMJvlQQARaGu86h
set TELEGRAM_BOT_TOKEN=8902870855:AAG3JOC99UpVQB2_1Bd6ajfDNbCnUZ0qGqY
set MAX_BOT_TOKEN=f9LHodD0cOIsmtWVyXWrXitdLGjyQDD4NsSZ5O0kQL3obALjjs2QeufEMkc48NklTG7OZfrnJFIZCswMyQ06
set PORT=3000

cd /d "C:\Users\va_ku\OneDrive\Трикотажный Гуру\bots-live"
echo Installing dependencies...
call npm install
echo.
echo Starting bots on port 3000...
echo Press Ctrl+C to stop.
echo.
node index.js
pause
