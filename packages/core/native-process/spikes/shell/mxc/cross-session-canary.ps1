# Cross-session canary workload (the NON-elevated workload child of the corrected fallback).
#
# Launched by fallback.ps1 under a WRITE_RESTRICTED restricted token whose only write-restricting
# capability SID is this session random S-1-5-21 SID (the ratified Codex model, token.rs:500). This
# script is the untrusted in-container workload: it ATTEMPTS to write a canary into its own private
# root (expected to succeed) and into the OTHER session private root (expected to be denied by the
# kernel write-access check because the other root grants write only to the other session cap SID).
#
# The decision is NOT this script self-reported error string: fallback.ps1 (the external observer,
# outside the restricted token) inspects the filesystem afterwards and decides pass/fail from which
# canary files actually materialized. This script also records its own identity for the receipt
# (informational only) so the workload-is-non-elevated fact can be cross-checked.
#
# Synthetic only. No secrets.
param(
  [Parameter(Mandatory)][string]$SessionId,
  [Parameter(Mandatory)][string]$OwnRoot,
  [Parameter(Mandatory)][string]$OtherRoot
)
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$report = [ordered]@{
  session = $SessionId
  ownRoot = $OwnRoot
  otherRoot = $OtherRoot
  user = $null
  userSid = $null
  isAdministrator = $null
  integrityLevel = $null
  ownWrite = $null
  crossWrite = $null
  at = (Get-Date -Format o)
}

try {
  $wi = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $report.user = $wi.Name
  $report.userSid = $wi.User.Value
  $report.isAdministrator = (New-Object System.Security.Principal.WindowsPrincipal($wi)).IsInRole([System.Security.Principal.WindowsBuiltinRole]::Administrator)
} catch {}

# Own write: the session must be able to write its own private root (cap SID write-allow ACE present).
try {
  $ownFile = Join-Path $OwnRoot ("canary-from-" + $SessionId + ".txt")
  Set-Content -LiteralPath $ownFile -Value ("written-by-" + $SessionId) -NoNewline -ErrorAction Stop
  $report.ownWrite = 'ok'
} catch {
  $report.ownWrite = "denied: $($_.Exception.Message)"
}

# Cross write: the session MUST be denied writing into the other session private root. A file named
# canary-from-<thisSession>.txt appearing in the OTHER root is a write-isolation BREACH; the external
# observer checks for exactly that.
try {
  $crossFile = Join-Path $OtherRoot ("canary-from-" + $SessionId + ".txt")
  Set-Content -LiteralPath $crossFile -Value ("LEAK-" + $SessionId) -NoNewline -ErrorAction Stop
  $report.crossWrite = 'WROTE'
} catch {
  $report.crossWrite = "denied: $($_.Exception.Message)"
}

# Write the self-report into the OWN root (guaranteed writable); the parent reads it for context.
try {
  $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OwnRoot ("child-report-" + $SessionId + ".json")) -ErrorAction Stop
} catch {}
