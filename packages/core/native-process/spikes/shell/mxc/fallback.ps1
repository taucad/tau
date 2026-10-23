# W2 AppContainer capability/package-SID fallback probe (runs where the MXC probe fails on a row).
#
# ROOT CAUSE of the earlier ERROR_INVALID_SID, and the correction it forced:
#   The previous version built a WRITE_RESTRICTED token with a capability SID (S-1-15-3-*) as a
#   CreateRestrictedToken *restricting* SID. That is the wrong model: capability SIDs are not valid
#   restricting SIDs (CreateRestrictedToken returns ERROR_INVALID_SID = 1337), which is exactly what
#   CI observed. Per Microsoft's "Launch an AppContainer" guide and OpenAI Codex's windows-sandbox-rs,
#   capability SIDs belong in a SECURITY_CAPABILITIES struct passed through
#   PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES to CreateProcess, alongside a per-container PACKAGE SID
#   produced by CreateAppContainerProfile / DeriveAppContainerSidFromAppContainerName. The per-session
#   isolation principal is the PACKAGE SID (unique per AppContainer), not a capability SID.
#
# This probe therefore proves the CORRECT building block on a stock (PSEC-absent) host: it derives a
# distinct AppContainer PACKAGE SID per session via the documented API (the same principal Codex
# uses), with external verification that the two SIDs differ. It records — fail-closed, verdict fail,
# never a green — that the full two-AppContainer on-disk isolation receipt (Low-IL labelling +
# per-package-SID ACEs + launching the canary as an AppContainer) is the next step and that a true
# stock-Windows isolation receipt is better served by the PSEC-independent isolation_session backend
# (per-session agent user + SID); see the probe receipt's mxc.isolationSession.available fact.
#
# Synthetic only, no secrets. Emits a JSON receipt to $env:MXC_FALLBACK_OUT.
$ErrorActionPreference = 'Stop'
$out = $env:MXC_FALLBACK_OUT
if (-not $out) { $out = Join-Path $env:RUNNER_TEMP 'mxc-spike\fallback.receipt.json' }
New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null

$checks = New-Object System.Collections.ArrayList
function Add-Check($id, $expect, $observed, $ok, $detail) {
  $v = if ($ok) { 'pass' } else { 'fail' }
  [void]$checks.Add([ordered]@{ id = $id; expect = $expect; observed = $observed; verdict = $v; detail = $detail })
}

# P/Invoke only the AppContainer profile + SID APIs (the Codex principal). No process launch here:
# the launch path (STARTUPINFOEX + PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES + Low-IL labelling)
# needs a Windows test loop to validate and is intentionally not shipped blind.
$pinvoke = @'
using System;
using System.Runtime.InteropServices;
public static class TauAc {
  [DllImport("userenv.dll", CharSet = CharSet.Unicode)]
  public static extern int CreateAppContainerProfile(string name, string display, string desc, IntPtr caps, int capCount, out IntPtr sid);
  [DllImport("userenv.dll", CharSet = CharSet.Unicode)]
  public static extern int DeriveAppContainerSidFromAppContainerName(string name, out IntPtr sid);
  [DllImport("userenv.dll", CharSet = CharSet.Unicode)]
  public static extern int DeleteAppContainerProfile(string name);
  [DllImport("advapi32.dll", SetLastError = true)]
  public static extern bool ConvertSidToStringSid(IntPtr sid, out IntPtr str);
  [DllImport("advapi32.dll")] public static extern IntPtr FreeSid(IntPtr sid);
  [DllImport("kernel32.dll")] public static extern IntPtr LocalFree(IntPtr p);
}
'@

try {
  Add-Type -TypeDefinition $pinvoke -ErrorAction Stop
  $apiOk = $true
} catch {
  $apiOk = $false
  Add-Check 'fallback.appContainerApi' 'CreateAppContainerProfile / DeriveAppContainerSidFromAppContainerName available' $_.Exception.Message $false $null
}

function Get-PackageSid($name) {
  $sid = [IntPtr]::Zero
  $hr = [TauAc]::CreateAppContainerProfile($name, $name, 'Tau spike AppContainer', [IntPtr]::Zero, 0, [ref]$sid)
  # 0x800700B7 == HRESULT_FROM_WIN32(ERROR_ALREADY_EXISTS): reuse the existing profile's SID.
  if ($hr -ne 0 -and $hr -ne [int]0x800700B7) {
    throw "CreateAppContainerProfile('$name') hr=0x$($hr.ToString('X8'))"
  }
  if ($hr -eq [int]0x800700B7) {
    $hr2 = [TauAc]::DeriveAppContainerSidFromAppContainerName($name, [ref]$sid)
    if ($hr2 -ne 0) { throw "DeriveAppContainerSidFromAppContainerName('$name') hr=0x$($hr2.ToString('X8'))" }
  }
  $strPtr = [IntPtr]::Zero
  if (-not [TauAc]::ConvertSidToStringSid($sid, [ref]$strPtr)) {
    throw "ConvertSidToStringSid failed: win32=$([System.Runtime.InteropServices.Marshal]::GetLastWin32Error())"
  }
  $str = [System.Runtime.InteropServices.Marshal]::PtrToStringUni($strPtr)
  [TauAc]::LocalFree($strPtr) | Out-Null
  [TauAc]::FreeSid($sid) | Out-Null
  return $str
}

if ($apiOk) {
  $nameA = "tau.spike.sessionA.$PID"
  $nameB = "tau.spike.sessionB.$PID"
  $sidA = $null; $sidB = $null
  try {
    $sidA = Get-PackageSid $nameA
    $sidB = Get-PackageSid $nameB
    # EXTERNAL check: the two per-session package SIDs are well-formed AppContainer SIDs (S-1-15-2-*)
    # and DISTINCT — that distinctness is the isolation principal Codex relies on.
    $distinct = ($sidA -and $sidB -and ($sidA -ne $sidB) -and ($sidA -like 'S-1-15-2-*') -and ($sidB -like 'S-1-15-2-*'))
    Add-Check 'fallback.packageSid.derive' 'distinct per-session AppContainer PACKAGE SIDs derived (CreateAppContainerProfile)' "A=$sidA B=$sidB" $distinct @{ a = $sidA; b = $sidB }
  } catch {
    Add-Check 'fallback.packageSid.derive' 'distinct per-session AppContainer PACKAGE SIDs derived (CreateAppContainerProfile)' $_.Exception.Message $false $null
  } finally {
    foreach ($n in @($nameA, $nameB)) { try { [void][TauAc]::DeleteAppContainerProfile($n) } catch {} }
  }
}

# The full two-container on-disk isolation proof is NOT exercised here (it needs Low-IL labelling +
# per-package-SID ACEs + an AppContainer launch, validated on a Windows test loop). Record that as a
# typed, non-green model finding so the row stays honestly red on a PSEC-absent host.
Add-Check 'fallback.model' 'two-AppContainer on-disk isolation receipt exercised on this host' 'NOT exercised: correct model identified (AppContainer PACKAGE SID via SECURITY_CAPABILITIES / PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES), not CreateRestrictedToken(capability-SID) which returns ERROR_INVALID_SID. Prefer isolation_session (PSEC-independent) for a stock-Windows receipt.' $false $null

$verdict = 'fail'
$receipt = [ordered]@{
  kind = 'capability-sid-fallback'
  os = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' | Select-Object ProductName, EditionID, CurrentBuild, UBR, DisplayVersion)
  source = @{ sha = $env:GITHUB_SHA; run = $env:GITHUB_RUN_ID }
  conclusion = 'Root-caused the ERROR_INVALID_SID: capability SIDs are not valid CreateRestrictedToken restricting SIDs. Correct AppContainer model derives a distinct PACKAGE SID per session (proven above) and passes capabilities via SECURITY_CAPABILITIES to CreateProcess. A true stock-Windows (PSEC-absent) isolation receipt is better served by isolation_session; see probe mxc.isolationSession.available.'
  checks = $checks
  verdict = $verdict
}
$receipt | ConvertTo-Json -Depth 8 | Set-Content -Path $out
Write-Host "[mxc:fallback] $verdict -> $out"
if ($verdict -ne 'pass') { exit 1 }
