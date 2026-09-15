Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
RepoDir = FSO.GetParentFolderName(ScriptDir)
WshShell.CurrentDirectory = RepoDir
WshShell.Run "node tools\run-game.mjs", 0, False
