# Reproduce un "npm install" LIMPIO, como el de GitHub Actions.
#
# Sirve para detectar dependencias que funcionan por casualidad en la maquina de
# desarrollo (por ejemplo tipos que llegan de rebote) pero fallan al publicar.
#
# Uso:  pwsh -File scripts/verify-clean-install.ps1
# Copia solo los ficheros versionados, instala con "npm ci" en una carpeta
# temporal y ejecuta la misma verificacion que hace GitHub. No toca node_modules.

# OJO: sin "ErrorActionPreference = Stop". npm escribe sus avisos en stderr, y
# PowerShell los interpretaria como errores graves aunque el comando vaya bien.
# Aqui el exito o el fallo se decide SIEMPRE por $LASTEXITCODE.

$sourceDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$workDir = Join-Path ([System.IO.Path]::GetTempPath()) ("gymlog-clean-" + [System.Guid]::NewGuid().ToString('N').Substring(0, 8))

Write-Host "Proyecto:     $sourceDir"
Write-Host "Copia limpia: $workDir"
Write-Host ""

New-Item -ItemType Directory -Path $workDir -Force | Out-Null

Push-Location $sourceDir
try {
    # Se copian exactamente los ficheros que van al repositorio: lo mismo que recibe GitHub.
    $files = git ls-files
    Write-Host "--- copiando $($files.Count) ficheros versionados ---"
    foreach ($file in $files) {
        $destination = Join-Path $workDir $file
        $parent = Split-Path $destination -Parent
        if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
        Copy-Item -LiteralPath (Join-Path $sourceDir $file) -Destination $destination -Force
    }
} finally {
    Pop-Location
}

$npm = 'C:\Users\Oscar\AppData\Local\hermes\node\npm.cmd'
$failed = $false

Push-Location $workDir
try {
    Write-Host ""
    Write-Host "--- npm ci (instalacion limpia desde package-lock.json) ---"
    & $npm ci --no-audit --no-fund 2>&1 | Select-Object -Last 3
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FALLO: npm ci (codigo $LASTEXITCODE)" -ForegroundColor Red
        Pop-Location
        Remove-Item -Recurse -Force $workDir -ErrorAction SilentlyContinue
        exit 1
    }
    Write-Host "instalado correctamente" -ForegroundColor Green

    $pasos = @(
        @{ nombre = 'Comprobar tipos (npm run typecheck)'; args = @('run', 'typecheck') },
        @{ nombre = 'Ejecutar pruebas (npm test)';          args = @('test') },
        @{ nombre = 'Compilar (npm run build)';             args = @('run', 'build') }
    )

    foreach ($paso in $pasos) {
        Write-Host ""
        Write-Host "--- $($paso.nombre) ---"
        & $npm @($paso.args) 2>&1 | Select-Object -Last 6
        if ($LASTEXITCODE -ne 0) {
            Write-Host "FALLO en: $($paso.nombre) (codigo $LASTEXITCODE)" -ForegroundColor Red
            $failed = $true
        } else {
            Write-Host "OK: $($paso.nombre)" -ForegroundColor Green
        }
    }
} finally {
    Pop-Location
    Remove-Item -Recurse -Force $workDir -ErrorAction SilentlyContinue
}

Write-Host ""
if ($failed) {
    Write-Host "RESULTADO: la instalacion limpia FALLA. No subir asi: GitHub fallara igual." -ForegroundColor Red
    exit 1
}
Write-Host "RESULTADO: la instalacion limpia funciona igual que en local." -ForegroundColor Green
