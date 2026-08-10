# sync-invoices-scheduled.ps1
#
# Daily Windows Task Scheduler wrapper:
# bvod.by -> parse -> upsert water_invoices in Supabase.
#
# Requires ai-consultant-api/.env with SUPABASE_* and BVOD_*.

$ErrorActionPreference = 'Continue'

$ApiDir = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $ApiDir 'downloads\logs'
$Stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$LogFile = Join-Path $LogDir "invoice-sync_$Stamp.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Log([string]$Message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Message"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    Write-Host $line
}

Write-Log "Starting invoice sync in $ApiDir"
Set-Location $ApiDir

$npm = Join-Path ${env:ProgramFiles} 'nodejs\npm.cmd'
if (-not (Test-Path $npm)) {
    Write-Log "FAILED: npm not found at $npm"
    exit 1
}
if (-not (Test-Path (Join-Path $ApiDir '.env'))) {
    Write-Log "FAILED: .env not found in $ApiDir"
    exit 1
}

$env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
            [System.Environment]::GetEnvironmentVariable('Path', 'User')

# Capture stdout+stderr without treating npm stderr lines as terminating errors
$previousEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$output = & $npm run sync-invoices 2>&1
$exitCode = $LASTEXITCODE
$ErrorActionPreference = $previousEap

foreach ($line in $output) {
    $text = "$line"
    Add-Content -Path $LogFile -Value $text -Encoding UTF8
    Write-Host $text
}

if ($exitCode -ne 0) {
    Write-Log "FAILED: sync-invoices exited with code $exitCode"
    exit $exitCode
}

Write-Log "Invoice sync finished OK"
exit 0
