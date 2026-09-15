# Comprueba que la version 1.1.0 y sus funciones estan publicadas de verdad.
# Uso:  pwsh -File scripts\verificar-publicado.ps1

$ErrorActionPreference = 'Stop'
$base = 'https://oscarmestre2011.github.io/gymlog/'
$commit = '12f5f9d'
$h = @{ 'User-Agent' = 'gymlog-check' }

# 1. Esperar a que termine la publicacion automatica.
$conclusion = 'desconocida'
foreach ($i in 1..24) {
  Start-Sleep -Seconds 12
  $runs = (Invoke-RestMethod -Uri 'https://api.github.com/repos/oscarmestre2011/gymlog/actions/runs' -Headers $h -TimeoutSec 25).workflow_runs
  $run = $runs | Where-Object { $_.head_sha -like "$commit*" } | Select-Object -First 1
  if (-not $run) { continue }
  if ($run.status -eq 'completed') { $conclusion = $run.conclusion; break }
}
Write-Output "publicacion: $conclusion"

Start-Sleep -Seconds 20

# 2. La app publicada.
$html = (Invoke-WebRequest -Uri $base -UseBasicParsing -TimeoutSec 25).Content
# OJO: en la version publicada el src ya viene con la subcarpeta (/gymlog/assets/...), asi que
# la direccion se saca del propio html y no concatenando la base.
$rutaAsset = [regex]::Match($html, 'src="([^"]*assets/index-[A-Za-z0-9_-]+\.js)"').Groups[1].Value
$urlAsset = "https://oscarmestre2011.github.io$rutaAsset"
Write-Output "archivo de la app: $rutaAsset"
$js = (Invoke-WebRequest -Uri $urlAsset -UseBasicParsing -TimeoutSec 40).Content

$version = '?'
if ($js -match '1\.1\.0') { $version = '1.1.0' }
Write-Output "version en la app publicada: $version"

$textos = @('Novedades', 'Carpeta de copias', 'kairos-copia', 'Falta tu altura', 'Quincenal')
foreach ($t in $textos) {
  $esta = $js.Contains($t)
  $estado = 'FALTA'
  if ($esta) { $estado = 'publicado' }
  Write-Output "  $t : $estado"
}

# 3. El service worker, que es donde estaba el fallo del aviso de version.
Write-Output ''
Write-Output 'service worker publicado:'
$sw = (Invoke-WebRequest -Uri "${base}sw.js" -UseBasicParsing -TimeoutSec 25).Content
$swVersion = [regex]::Match($sw, "const VERSION = '(v\d+)'").Groups[1].Value
Write-Output "  version de la cache: $swVersion"
Write-Output "  la clave de cache conserva el parametro: $($sw.Contains('url.pathname + url.search'))"
Write-Output "  no guarda las comprobaciones de version: $($sw.Contains('endsWith(''/index.html'') && url.search'))"

# 4. La marca del archivo en uso apunta a un archivo real.
$codigo = (Invoke-WebRequest -Uri "${base}raiz.txt" -UseBasicParsing -TimeoutSec 20).StatusCode
Write-Output "  raiz.txt responde: $codigo"

# 5. Comprobaciones generales de la direccion publicada.
Write-Output ''
node scripts/verify-live.mjs 2>&1 | Select-Object -Last 3
