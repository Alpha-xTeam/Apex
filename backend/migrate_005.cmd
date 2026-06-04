@echo off
REM ============================================================
REM   CyberArena — Database Migration Helper
REM   Apply migration 005 to create the web_exploitation_challenges table
REM ============================================================

echo.
echo ============================================================
echo   CyberArena — Database Migration 005
echo   Creates: public.web_exploitation_challenges
echo ============================================================
echo.
echo This migration creates the new table for Web Exploitation
echo challenges (Red Team).
echo.
echo HOW TO RUN:
echo   1. Open the Supabase Dashboard:
echo      https://supabase.com/dashboard/project/yevtnyokixocpihpdwqu
echo   2. Go to: SQL Editor (left sidebar)
echo   3. Click: New query
echo   4. Copy the entire contents of:
echo        backend/migrations/005_web_exploitation_challenges.sql
echo   5. Paste into the SQL editor and click "Run" (or Ctrl+Enter)
echo.
echo After running, restart the backend:
echo   python main.py
echo.
echo The pool watcher will auto-populate 5 web exploitation
echo challenges for the red team within ~8 seconds.
echo ============================================================
echo.

set /p OPEN=Open the migration file now? (y/n):
if /i "%OPEN%"=="y" (
    start notepad "migrations\005_web_exploitation_challenges.sql"
)

pause
