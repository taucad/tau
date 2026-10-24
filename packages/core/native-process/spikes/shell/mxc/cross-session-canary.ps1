# Cross-session canary workload (the NON-elevated workload child of the corrected fallback).
#
# Launched by fallback.ps1 under a WRITE_RESTRICTED restricted token whose only write-restricting
# capability SID is this session random S-1-5-21 SID (the ratified Codex model, token.rs:500). This
# script is the untrusted in-container workload. It runs in one or both of two modes in the SAME
# process, so every denial it attempts is paired with a positive control by the same child:
#
#   WRITE mode (-OwnRoot/-OtherRoot): write a canary into its own private root (positive control,
#   expected to succeed) and into the OTHER session private root (expected to be denied by the kernel
#   write-access check because the other root grants write only to the other session cap SID).
#
#   READ mode (-OwnSecret/-OtherSecret/-OutDir): read its own session secret (positive control) and
#   copy what it read into -OutDir; then attempt to read the OTHER session secret and append whatever
#   it got into an exfil file in -OutDir (expected to be denied: the other root carries a deny-read
#   ACE for this session sandbox account). With -NeverSecret it also attempts the never-grantable set
#   (deny-read ACE for every session) into a separate exfil file.
#
# The decision is NOT this script self-reported strings: fallback.ps1 (the external observer, outside
# the restricted token) inspects the filesystem afterwards and decides pass/fail from which canary
# files materialized and which secrets appear where. The self-report is recorded only as context.
#
# Synthetic only. No secrets.
param(
  [Parameter(Mandatory)][string]$SessionId,
  [string]$OwnRoot,
  [string]$OtherRoot,
  [string]$OwnSecret,
  [string]$OtherSecret,
  [string]$NeverSecret,
  [string]$OutDir
)
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$report = [ordered]@{
  session = $SessionId
  user = $null
  userSid = $null
  isAdministrator = $null
  ownWrite = $null
  crossWrite = $null
  ownRead = $null
  crossRead = $null
  neverRead = $null
  at = (Get-Date -Format o)
}

try {
  $wi = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $report.user = $wi.Name
  $report.userSid = $wi.User.Value
  $report.isAdministrator = (New-Object System.Security.Principal.WindowsPrincipal($wi)).IsInRole([System.Security.Principal.WindowsBuiltinRole]::Administrator)
} catch {}

if ($OwnRoot -and $OtherRoot) {
  # Own write: the session must be able to write its own private root (cap SID write-allow ACE).
  try {
    Set-Content -LiteralPath (Join-Path $OwnRoot ("canary-from-" + $SessionId + ".txt")) -Value ("written-by-" + $SessionId) -NoNewline -ErrorAction Stop
    $report.ownWrite = 'ok'
  } catch { $report.ownWrite = "denied: $($_.Exception.Message)" }
  # Cross write: a canary-from-<thisSession>.txt appearing in the OTHER root is a BREACH.
  try {
    Set-Content -LiteralPath (Join-Path $OtherRoot ("canary-from-" + $SessionId + ".txt")) -Value ("LEAK-" + $SessionId) -NoNewline -ErrorAction Stop
    $report.crossWrite = 'WROTE'
  } catch { $report.crossWrite = "denied: $($_.Exception.Message)" }
}

if ($OwnSecret -and $OtherSecret -and $OutDir) {
  # Own read (positive control): copy the own secret into OutDir; the observer checks it matches.
  try {
    $v = Get-Content -LiteralPath $OwnSecret -Raw -ErrorAction Stop
    Set-Content -LiteralPath (Join-Path $OutDir ("own-read-" + $SessionId + ".txt")) -Value $v -NoNewline -ErrorAction Stop
    $report.ownRead = 'ok'
  } catch { $report.ownRead = "denied: $($_.Exception.Message)" }
  # Cross read: whatever is read goes into the exfil file; the victim secret appearing there is a LEAK.
  try {
    $x = Get-Content -LiteralPath $OtherSecret -Raw -ErrorAction Stop
    Add-Content -LiteralPath (Join-Path $OutDir ("exfil-" + $SessionId + ".txt")) -Value $x -ErrorAction Stop
    $report.crossRead = 'READ'
  } catch { $report.crossRead = "denied: $($_.Exception.Message)" }
  # Never-grantable read: the never-grantable secret appearing in exfil-never is a LEAK.
  if ($NeverSecret) {
    try {
      $n = Get-Content -LiteralPath $NeverSecret -Raw -ErrorAction Stop
      Add-Content -LiteralPath (Join-Path $OutDir ("exfil-never-" + $SessionId + ".txt")) -Value $n -ErrorAction Stop
      $report.neverRead = 'READ'
    } catch { $report.neverRead = "denied: $($_.Exception.Message)" }
  }
}

# Self-report (context only) into a location this child can write.
$reportDir = if ($OutDir) { $OutDir } elseif ($OwnRoot) { $OwnRoot } else { $null }
if ($reportDir) {
  try { $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $reportDir ("child-report-" + $SessionId + ".json")) -ErrorAction Stop } catch {}
}
