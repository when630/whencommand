# #9 · LNCH-03 — Windows 앱 목록: 시작 메뉴 .lnk + UWP(shell:AppsFolder). 둘 중 하나만 보면 반쪽이다.
# 실행: powershell -ExecutionPolicy Bypass -File list-apps.ps1
$sw = [Diagnostics.Stopwatch]::StartNew()
$lnk = @()
foreach ($d in @("$env:ProgramData\Microsoft\Windows\Start Menu\Programs", "$env:APPDATA\Microsoft\Windows\Start Menu\Programs")) {
  if (Test-Path $d) { $lnk += Get-ChildItem $d -Recurse -Filter *.lnk -ErrorAction SilentlyContinue }
}
$tLnk = $sw.ElapsedMilliseconds
$sw.Restart()
$uwp = Get-StartApps                         # AppsFolder 전체 — 데스크톱 앱도 섞여 온다
$tUwp = $sw.ElapsedMilliseconds
"시작 메뉴 .lnk  : $($lnk.Count)개 · ${tLnk}ms"
"Get-StartApps  : $($uwp.Count)개 · ${tUwp}ms   (AppID가 '!'를 포함하면 UWP)"
"UWP만          : $(($uwp | Where-Object { $_.AppID -like '*!*' }).Count)개"
""
"→ 03 §11 #9. Get-StartApps가 .lnk를 포함하면 이것 하나로 충분한지, 아니면 둘을 합쳐야 하는지 결과에 적는다."
