@echo off
REM gRouter Copilot server — boot startup launcher.
REM Runs pm2 resurrect so the copilot-server process comes back after reboot.
REM Independent from gRouter (port 20128). Do not touch that process.

cd /d C:\gRouter_copilot\server
pm2 resurrect
