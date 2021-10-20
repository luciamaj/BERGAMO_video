#SingleInstance Force
#NoEnv
OnExit, RestoreAndExit

SetSystemCursor(A_ScriptDir "\invisible.cur")

^!m::(k := !k)? SetSystemCursor(A_ScriptDir "\invisible.cur"):RestoreSystemCursor()

SetSystemCursor(Cursor) {
    return DllCall("SetSystemCursor", "UInt", DllCall("LoadCursorFromFile", "Str", Cursor), "Int", "32512")
}

RestoreSystemCursor() {
    return DllCall("SystemParametersInfo", "UInt", 0x57, "UInt", 0, "UInt", 0, "UInt", 0)
}

RestoreAndExit:
    RestoreSystemCursor()
    ExitApp