param(
  [string]$TaskName = "LONACI-Daily-Backup",
  [string]$BackupTime = "02:00",
  [string]$ProjectPath = ""
)

$ErrorActionPreference = "Stop"

function Resolve-ProjectPath([string]$InputPath) {
  if ($InputPath -and $InputPath.Trim().Length -gt 0) {
    return (Resolve-Path -LiteralPath $InputPath).Path
  }
  # scripts/ -> racine projet
  return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}

if ($BackupTime -notmatch "^\d{2}:\d{2}$") {
  throw "Le format de l'heure doit être HH:mm (exemple: 02:00)."
}

$resolvedProjectPath = Resolve-ProjectPath -InputPath $ProjectPath
$packageJsonPath = Join-Path $resolvedProjectPath "package.json"
if (-not (Test-Path -LiteralPath $packageJsonPath)) {
  throw "package.json introuvable dans $resolvedProjectPath"
}

$backupDir = Join-Path $resolvedProjectPath "backups"
if (-not (Test-Path -LiteralPath $backupDir)) {
  New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$schedulerLogPath = Join-Path $backupDir "scheduler.log"

$taskCommand = "cd /d `"$resolvedProjectPath`" && npm run backup:data >> `"$schedulerLogPath`" 2>>&1"
$taskArgs = "/c $taskCommand"

Write-Host "[backup:task] Création / mise à jour de la tâche '$TaskName' à $BackupTime..."
schtasks /Create /F /SC DAILY /TN $TaskName /TR "cmd.exe $taskArgs" /ST $BackupTime | Out-Null

Write-Host "[backup:task] Tâche enregistrée."
Write-Host "[backup:task] Vérification:"
schtasks /Query /TN $TaskName /V /FO LIST
