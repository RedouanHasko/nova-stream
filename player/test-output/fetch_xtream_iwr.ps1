$baseDir = "C:\Users\red-h\Downloads\iptvpanel\player"
Set-Location $baseDir
if(-not (Test-Path test-output)) { New-Item -ItemType Directory -Path test-output | Out-Null }

function fetch_iwr($target,$outBase) {
  $enc = [uri]::EscapeDataString($target)
  $u = "http://localhost:4000/api/proxy?url=$enc"
  Write-Output "IWR Fetching: $u -> test-output/$outBase"
  try {
    Invoke-WebRequest -Uri $u -OutFile "test-output/$outBase.body" -Headers @{ 'User-Agent' = 'NovaTest/1.0' } -UseBasicParsing -TimeoutSec 120
    Write-Output "DONE $outBase"
  } catch {
    Write-Output ("FAILED {0}: {1}" -f $outBase, $_.Exception.Message)
  }
}

$base = "http://line.dndnscloud.ru/player_api.php?username=beff5baba4&password=b293e5db9467"
fetch_iwr $base "player_api.json"
fetch_iwr ($base + "&action=get_live_categories") "live_categories.json"
fetch_iwr ($base + "&action=get_live_streams") "live_streams.json"
fetch_iwr ($base + "&action=get_vod_categories") "vod_categories.json"
fetch_iwr ($base + "&action=get_vod_streams") "vod_streams.json"
fetch_iwr ($base + "&action=get_series_categories") "series_categories.json"
fetch_iwr ($base + "&action=get_series") "series.json"
fetch_iwr "http://line.dndnscloud.ru/xmltv.php?username=beff5baba4&password=b293e5db9467" "xmltv.xml"
