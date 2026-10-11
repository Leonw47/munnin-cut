# Baixa o whisper.cpp (legendas automáticas, build b5454 com OpenBLAS) para resources\whisper.
# Uso: npm run whisper   (os modelos são baixados pelo próprio app na primeira vez que gerar legendas)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dst = Join-Path $root 'resources\whisper'
New-Item -ItemType Directory -Force $dst | Out-Null
$zip = Join-Path $env:TEMP 'whisper-blas-bin-x64.zip'
$tmp = Join-Path $env:TEMP 'whisper-blas-bin-x64'
Write-Host 'Baixando whisper.cpp b5454 (GitHub ggml-org/whisper.cpp)...'
Invoke-WebRequest 'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-blas-bin-x64.zip' -OutFile $zip
if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
Expand-Archive $zip -DestinationPath $tmp
$rel = Get-ChildItem $tmp -Recurse -Filter 'whisper-cli.exe' | Select-Object -First 1
$dir = $rel.DirectoryName
Copy-Item (Join-Path $dir 'whisper-cli.exe'), (Join-Path $dir 'whisper.dll'), (Join-Path $dir 'libopenblas.dll') $dst -Force
Get-ChildItem $dir -Filter 'ggml*.dll' | Copy-Item -Destination $dst -Force
Remove-Item -Recurse -Force $tmp, $zip
Write-Host "Pronto: $dst"
