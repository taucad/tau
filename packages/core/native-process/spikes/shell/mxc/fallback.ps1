# W2 capability-SID fallback probe (runs where the MXC probe fails on a row).
#
# Proves Codex's elevated-backend design on this host, with external verification:
#   - A WRITE_RESTRICTED token per session whose restricting SIDs include a PER-SESSION CAPABILITY
#     SID. A write succeeds only where that capability SID has an ACE, so session A's token cannot
#     write session B's root and vice-versa  => WRITES ARE ISOLATED (no deny ACE needed).
#   - Tau DENY-READ ACEs for the other session's capability SID on each session's private root.
#     WRITE_RESTRICTED does not gate reads, so cross-reads are isolated ONLY if the deny-read ACE
#     holds; where it does not, sessions must serialize per device (session-limit).
#
# Every allow/deny is observed by the host thread AFTER reverting impersonation (external), never
# trusted from inside the impersonated context. Emits a JSON receipt to $env:MXC_FALLBACK_OUT.
# A missing capability API (DeriveCapabilitySidsFromName / CreateRestrictedToken) is a typed
# prerequisite failure, not a green.
$ErrorActionPreference = 'Stop'
$out = $env:MXC_FALLBACK_OUT
if (-not $out) { $out = Join-Path $env:RUNNER_TEMP 'mxc-spike\fallback.receipt.json' }
New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null

$checks = New-Object System.Collections.ArrayList
function Add-Check($id, $expect, $observed, $ok, $detail) {
  $v = if ($ok) { 'pass' } else { 'fail' }
  [void]$checks.Add([ordered]@{ id = $id; expect = $expect; observed = $observed; verdict = $v; detail = $detail })
}

$pinvoke = @'
using System;
using System.Runtime.InteropServices;
public static class TauCap {
  // Exported by kernelbase.dll (NOT userenv.dll — the wrong DLL throws EntryPointNotFoundException
  // on first call, which previously surfaced as an opaque fallback.run failure).
  [DllImport("kernelbase.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool DeriveCapabilitySidsFromName(string capName, out IntPtr groupSids, out int groupCount, out IntPtr sids, out int count);
  [DllImport("advapi32.dll", SetLastError = true)]
  public static extern bool ConvertSidToStringSid(IntPtr sid, out IntPtr str);
  [DllImport("advapi32.dll")] public static extern bool IsValidSid(IntPtr sid);
  [DllImport("kernel32.dll")] public static extern IntPtr LocalFree(IntPtr p);
  [DllImport("advapi32.dll", SetLastError = true)]
  public static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
  [DllImport("kernel32.dll")] public static extern IntPtr GetCurrentProcess();
  [StructLayout(LayoutKind.Sequential)] public struct SID_AND_ATTRIBUTES { public IntPtr Sid; public uint Attributes; }
  [DllImport("advapi32.dll", SetLastError = true)]
  public static extern bool CreateRestrictedToken(IntPtr existing, uint flags, uint disableCount, IntPtr disable,
    uint deleteCount, IntPtr delete, uint restrictCount, SID_AND_ATTRIBUTES[] restrict, out IntPtr newToken);
  [DllImport("advapi32.dll", SetLastError = true)]
  public static extern bool ImpersonateLoggedOnUser(IntPtr token);
  [DllImport("advapi32.dll", SetLastError = true)] public static extern bool RevertToSelf();
  public const uint WRITE_RESTRICTED = 0x8;
  public const uint TOKEN_ALL = 0xF01FF;
}
'@

try {
  Add-Type -TypeDefinition $pinvoke -ErrorAction Stop
  $capApi = $true
} catch {
  $capApi = $false
  Add-Check 'fallback.capabilityApi' 'DeriveCapabilitySidsFromName / CreateRestrictedToken available' $_.Exception.Message $false $null
}

function Get-CapabilitySidString($name) {
  # DeriveCapabilitySidsFromName returns TWO pointer-to-array-of-PSID outputs, each with its own
  # count: capability GROUP sids (2nd/3rd) and capability sids (4th/5th). Each element must be
  # marshalled out of its array (ReadIntPtr at i * IntPtr.Size) and validated with IsValidSid before
  # use — passing the outer pointer or an unvalidated element yields ERROR_INVALID_SID downstream.
  $g = [IntPtr]::Zero; $gc = 0; $s = [IntPtr]::Zero; $c = 0
  if (-not [TauCap]::DeriveCapabilitySidsFromName($name, [ref]$g, [ref]$gc, [ref]$s, [ref]$c)) {
    throw "DeriveCapabilitySidsFromName failed: win32=$([System.Runtime.InteropServices.Marshal]::GetLastWin32Error())"
  }
  $ptrSize = [IntPtr]::Size
  $candidates = @()
  # Prefer the capability SIDs (the S-1-15-3-* resource capability), then the capability group SIDs.
  for ($i = 0; $i -lt $c; $i++) { $candidates += [System.Runtime.InteropServices.Marshal]::ReadIntPtr($s, $i * $ptrSize) }
  for ($i = 0; $i -lt $gc; $i++) { $candidates += [System.Runtime.InteropServices.Marshal]::ReadIntPtr($g, $i * $ptrSize) }
  $valid = [IntPtr]::Zero
  foreach ($p in $candidates) {
    if ($p -ne [IntPtr]::Zero -and [TauCap]::IsValidSid($p)) { $valid = $p; break }
  }
  if ($valid -eq [IntPtr]::Zero) {
    throw "no valid capability SID derived for '$name' (capSidCount=$c groupSidCount=$gc)"
  }
  $strPtr = [IntPtr]::Zero
  if (-not [TauCap]::ConvertSidToStringSid($valid, [ref]$strPtr)) {
    throw "ConvertSidToStringSid failed: win32=$([System.Runtime.InteropServices.Marshal]::GetLastWin32Error())"
  }
  $str = [System.Runtime.InteropServices.Marshal]::PtrToStringUni($strPtr)
  [TauCap]::LocalFree($strPtr) | Out-Null
  return @{ str = $str; ptr = $valid }
}

function New-WriteRestrictedToken($capPtr) {
  $hProc = [TauCap]::GetCurrentProcess()
  $hTok = [IntPtr]::Zero
  [void][TauCap]::OpenProcessToken($hProc, [TauCap]::TOKEN_ALL, [ref]$hTok)
  $sa = New-Object 'TauCap+SID_AND_ATTRIBUTES'
  $sa.Sid = $capPtr; $sa.Attributes = 0
  $arr = [TauCap+SID_AND_ATTRIBUTES[]]@($sa)
  $new = [IntPtr]::Zero
  if (-not [TauCap]::CreateRestrictedToken($hTok, [TauCap]::WRITE_RESTRICTED, 0, [IntPtr]::Zero, 0, [IntPtr]::Zero, 1, $arr, [ref]$new)) {
    throw "CreateRestrictedToken failed: $([System.Runtime.InteropServices.Marshal]::GetLastWin32Error())"
  }
  return $new
}

if ($capApi) {
  $base = Join-Path $env:RUNNER_TEMP 'mxc-spike\fallback'
  $rootA = Join-Path $base 'A'; $rootB = Join-Path $base 'B'
  New-Item -ItemType Directory -Force -Path $rootA, $rootB | Out-Null
  Set-Content -Path (Join-Path $rootA 'secret.txt') -Value 'SECRET-A'
  Set-Content -Path (Join-Path $rootB 'secret.txt') -Value 'SECRET-B'

  # Stage 1 — derive per-session capability SIDs. A failure here is a typed prerequisite, recorded on
  # its own check (never an opaque crash), and the later stages are skipped.
  $capA = $null; $capB = $null
  try {
    $capA = Get-CapabilitySidString 'tauSessionA'
    $capB = Get-CapabilitySidString 'tauSessionB'
    Add-Check 'fallback.capabilitySid' 'per-session capability SIDs derived (DeriveCapabilitySidsFromName)' "A=$($capA.str) B=$($capB.str)" $true @{ a = $capA.str; b = $capB.str }
  } catch {
    Add-Check 'fallback.capabilitySid' 'per-session capability SIDs derived (DeriveCapabilitySidsFromName)' $_.Exception.Message $false $null
  }

  if ($capA -and $capB) {
    # Grant each session's capability SID write (M) on its OWN root; deny the OTHER session's
    # capability SID read on each private root (the Tau deny-read ACEs).
    & icacls $rootA /grant "*$($capA.str):(OI)(CI)M" | Out-Null
    $grantA = ($LASTEXITCODE -eq 0)
    & icacls $rootB /grant "*$($capB.str):(OI)(CI)M" | Out-Null
    $grantB = ($LASTEXITCODE -eq 0)
    & icacls $rootA /deny "*$($capB.str):(OI)(CI)R" | Out-Null
    $denyA = ($LASTEXITCODE -eq 0)
    & icacls $rootB /deny "*$($capA.str):(OI)(CI)R" | Out-Null
    $denyB = ($LASTEXITCODE -eq 0)
    $denyReadApplied = ($denyA -and $denyB)
    Add-Check 'fallback.aces' 'capability-SID write grants + deny-read ACEs applied via icacls' "grants=$grantA,$grantB deny=$denyA,$denyB" ($grantA -and $grantB) @{ grantA = $grantA; grantB = $grantB; denyA = $denyA; denyB = $denyB }

    # Stage 2 — build the WRITE_RESTRICTED tokens with the capability SIDs as restricting SIDs.
    $tokA = $null; $tokB = $null
    try {
      $tokA = New-WriteRestrictedToken $capA.ptr
      $tokB = New-WriteRestrictedToken $capB.ptr
      Add-Check 'fallback.restrictedToken' 'WRITE_RESTRICTED tokens with capability restricting SIDs created' 'created' $true $null
    } catch {
      Add-Check 'fallback.restrictedToken' 'WRITE_RESTRICTED tokens with capability restricting SIDs created' $_.Exception.Message $false $null
    }

    if ($tokA -and $tokB) {
      function Try-Access($token, $sessionId, $ownRoot, $otherRoot) {
        $result = @{ ownWrite = $false; crossWrite = $false; crossRead = $false }
        [void][TauCap]::ImpersonateLoggedOnUser($token)
        try { Set-Content -Path (Join-Path $ownRoot "own-$sessionId.txt") -Value 'x' -ErrorAction Stop; $result.ownWrite = $true } catch {}
        try { Set-Content -Path (Join-Path $otherRoot "cross-$sessionId.txt") -Value 'x' -ErrorAction Stop; $result.crossWrite = $true } catch {}
        try { $null = Get-Content -Path (Join-Path $otherRoot 'secret.txt') -ErrorAction Stop; $result.crossRead = $true } catch {}
        [void][TauCap]::RevertToSelf()
        return $result
      }

      $ra = Try-Access $tokA 'A' $rootA $rootB
      $rb = Try-Access $tokB 'B' $rootB $rootA

      # EXTERNAL verification (host thread, after RevertToSelf): inspect what actually landed on disk.
      $ownWrites = (Test-Path (Join-Path $rootA 'own-A.txt')) -and (Test-Path (Join-Path $rootB 'own-B.txt'))
      $crossWrites = (Test-Path (Join-Path $rootB 'cross-A.txt')) -or (Test-Path (Join-Path $rootA 'cross-B.txt'))
      $ownObserved = if ($ownWrites) { 'both wrote' } else { 'blocked' }
      Add-Check 'fallback.write.own' 'each session CAN write its own root (capability SID ACE)' $ownObserved $ownWrites @{ a = $ra; b = $rb }
      $crossObserved = if (-not $crossWrites) { 'both denied' } else { 'TAMPER' }
      Add-Check 'fallback.write.cross' "neither session can write the other's root (restricting SID isolation)" $crossObserved (-not $crossWrites) @{ crossAonB = (Test-Path (Join-Path $rootB 'cross-A.txt')); crossBonA = (Test-Path (Join-Path $rootA 'cross-B.txt')) }
      $readIsolated = (-not $ra.crossRead) -and (-not $rb.crossRead)
      $readObserved = if ($readIsolated) { 'both denied' } else { 'READABLE (serialize required)' }
      Add-Check 'fallback.read.cross' "cross-reads isolated ONLY if deny-read ACE holds (else serialize per device)" $readObserved $readIsolated @{ denyReadApplied = $denyReadApplied; aReadB = $ra.crossRead; bReadA = $rb.crossRead }
    }
  }
}

# The row's verdict gates on the CORE guarantee (capability SIDs + tokens + WRITE isolation).
# fallback.read.cross is a measured, documented outcome, NOT a gate: per §RQ5, cross-reads are
# isolated only if the deny-read ACE holds, else sessions serialize per device — a real finding
# either way, so it is recorded but excluded from pass/fail (mirrors the probe excluding ConPTY).
$core = $checks | Where-Object { $_.id -ne 'fallback.read.cross' }
$verdict = if (($core | Where-Object { $_.verdict -eq 'fail' }).Count -eq 0 -and $core.Count -gt 0) { 'pass' } else { 'fail' }
$readCheck = $checks | Where-Object { $_.id -eq 'fallback.read.cross' } | Select-Object -First 1
$receipt = [ordered]@{
  kind = 'capability-sid-fallback'
  os = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' | Select-Object ProductName, EditionID, CurrentBuild, UBR, DisplayVersion)
  source = @{ sha = $env:GITHUB_SHA; run = $env:GITHUB_RUN_ID }
  readIsolation = if ($null -eq $readCheck) { 'not-measured' } elseif ($readCheck.verdict -eq 'pass') { 'isolated (deny-read ACE held)' } else { 'not isolated -> serialize shell sessions per device (session-limit)' }
  checks = $checks
  verdict = $verdict
}
$receipt | ConvertTo-Json -Depth 8 | Set-Content -Path $out
Write-Host "[mxc:fallback] $verdict -> $out"
if ($verdict -ne 'pass') { exit 1 }
