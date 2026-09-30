' gRouter Copilot server — user logon startup (pm2 resurrect).
' Runs hidden. Independent from gRouter (port 20128).
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c ""C:\gRouter_copilot\server\ops\copilot-startup.cmd""", 0, False
