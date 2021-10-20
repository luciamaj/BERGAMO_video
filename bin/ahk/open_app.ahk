SetTitleMatchMode RegEx
Run "C:\Program Files\Google\Chrome\Application\chrome.exe" --autoplay-policy=no-user-gesture-required --kiosk --incognito --disable-pinch --overscroll-history-navigation=0 --use-fake-ui-for-media-stream --app="http://localhost" 

Sleep, 300
WinWait, ahk_exe chrome.exe

WinMove, 0, 0
Sleep, 2000
Send ^r
Sleep, 2000
MouseClick, left, 100,100