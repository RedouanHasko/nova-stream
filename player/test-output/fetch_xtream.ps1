$baseDir = "C:\Users\red-h\Downloads\iptvpanel\player"
Set-Location $baseDir
if(-not (Test-Path test-output)) { New-Item -ItemType Directory -Path test-output | Out-Null }

function fetch($target,$outBase) {
  $u = "http://localhost:4000/api/proxy?url=$($target)"
  Write-Output "Fetching: $u -> test-output/$outBase"
  curl.exe -sS -D "test-output/$outBase.headers" -o "test-output/$outBase.body" "$u"
  Write-Output "DONE $outBase"
}

$base = "http://line.dndnscloud.ru/player_api.php?username=beff5baba4&password=b293e5db9467"

fetch([uri]::EscapeDataString($base),"player_api.json")
fetch([uri]::EscapeDataString($base + "&action=get_live_categories"),"live_categories.json")
fetch([uri]::EscapeDataString($base + "&action=get_live_streams"),"live_streams.json")
fetch([uri]::EscapeDataString($base + "&action=get_vod_categories"),"vod_categories.json")
fetch([uri]::EscapeDataString($base + "&action=get_vod_streams"),"vod_streams.json")
fetch([uri]::EscapeDataString($base + "&action=get_series_categories"),"series_categories.json")
fetch([uri]::EscapeDataString($base + "&action=get_series"),"series.json")
fetch([uri]::EscapeDataString("http://line.dndnscloud.ru/xmltv.php?username=beff5baba4&password=b293e5db9467"),"xmltv.xml")
