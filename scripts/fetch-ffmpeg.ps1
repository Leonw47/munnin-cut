# Baixa o FFmpeg (build "essentials" do gyan.dev) e coloca ffmpeg.exe/ffprobe.exe em resources\bin.
# Uso: npm run ffmpeg
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$bin = Join-Path $root 'resources\bin'
New-Item -ItemType Directory -Force $bin | Out-Null
$zip = Join-Path $env:TEMP 'ffmpeg-essentials.zip'
$tmp = Join-Path $env:TEMP 'ffmpeg-essentials'
Write-Host 'Baixando FFmpeg (gyan.dev, essentials)...'
Invoke-WebRequest 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -OutFile $zip
if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
Expand-Archive $zip -DestinationPath $tmp
foreach ($exe in 'ffmpeg.exe', 'ffprobe.exe') {
  $src = Get-ChildItem $tmp -Recurse -Filter $exe | Select-Object -First 1
  Copy-Item $src.FullName (Join-Path $bin $exe) -Force
}
Remove-Item -Recurse -Force $tmp, $zip
& (Join-Path $bin 'ffmpeg.exe') -hide_banner -version | Select-Object -First 1
Write-Host "Pronto: $bin"
