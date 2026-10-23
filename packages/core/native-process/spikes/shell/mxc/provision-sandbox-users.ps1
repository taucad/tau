# Provision ephemeral NON-admin sandbox local users with elevation (the ADMIN phase of the W2 MXC
# lane). This is the Codex-elevated model step 4: the sandbox principal(s) are created ONCE, with
# elevation, by an administrator; the sandboxed workload then runs AS the non-admin user (never
# elevated). The per-session WRITE principal is a random S-1-5-21 capability SID (see fallback.ps1 /
# cap.rs make_random_cap_sid_string); the per-session READ principal is one of these sandbox accounts.
#
# Passwords are random, built only in memory as a SecureString, never written to disk, a command line
# or a log, and the account is removed in the caller finally block. No customer data; synthetic only.
#
# Two uses:
#   * Dot-sourced by fallback.ps1 for the function New-TauSandboxUser (returns name + SID + credential).
#   * Run standalone as an admin-phase workflow step: it provisions a probe sandbox user, proves it is
#     NOT a member of Administrators (external, by well-known SID S-1-5-32-544), records the
#     sandbox-provision receipt, then removes the probe user. Fail-closed: a provisioning or
#     elevation-requirement failure is a typed fail, never a green.

function New-TauSandboxUser {
  [CmdletBinding()]
  param([Parameter(Mandatory)][string]$Name)

  # Switch-safe alphabet (no quote / slash / space, cannot lead with - or /); the SecureString is the
  # only place the secret lives. The 'Aa1_' prefix guarantees upper+lower+digit+symbol complexity.
  $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_#%@!'.ToCharArray()
  $rng = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rng)
  $pwPlain = 'Aa1_' + (($rng | ForEach-Object { $alphabet[$_ % $alphabet.Length] }) -join '')
  $secure = ConvertTo-SecureString $pwPlain -AsPlainText -Force
  $pwPlain = $null

  Remove-LocalUser -Name $Name -ErrorAction SilentlyContinue
  New-LocalUser -Name $Name -Password $secure -FullName 'Tau sandbox (ephemeral)' `
    -Description 'Ephemeral non-admin MXC sandbox user' -AccountNeverExpires -PasswordNeverExpires -ErrorAction Stop | Out-Null

  # External non-admin proof: enumerate the Administrators group by its well-known SID.
  $adminGroup = (Get-LocalGroup -SID 'S-1-5-32-544').Name
  $isAdmin = [bool](Get-LocalGroupMember -Group $adminGroup -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match "[\\/]$([regex]::Escape($Name))$" -or $_.Name -eq $Name })
  if ($isAdmin) {
    Remove-LocalUser -Name $Name -ErrorAction SilentlyContinue
    throw "sandbox user $Name unexpectedly a member of Administrators; refusing"
  }
  $sid = (Get-LocalUser -Name $Name).SID.Value
  [pscustomobject]@{
    Name = $Name
    Sid = $sid
    IsAdministrator = $isAdmin
    Secure = $secure
    Credential = (New-Object System.Management.Automation.PSCredential($Name, $secure))
  }
}

# ---- Standalone admin-phase self-test (only when invoked directly, not when dot-sourced). ----------
if ($MyInvocation.InvocationName -ne '.') {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  $out = $env:MXC_SANDBOX_PROVISION_OUT
  if (-not $out) { $out = Join-Path (Join-Path $env:RUNNER_TEMP 'mxc-spike') 'sandbox-provision.receipt.json' }
  New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null

  $checks = New-Object System.Collections.ArrayList
  function Add-Check($id, $expect, $observed, $ok, $detail) {
    $v = if ($ok) { 'pass' } else { 'fail' }
    [void]$checks.Add([ordered]@{ id = $id; expect = $expect; observed = "$observed"; verdict = $v; detail = $detail })
  }

  # Elevation is REQUIRED to create a local user. Record it fail-closed.
  $elevated = $false
  $elevUser = $null
  try {
    $wi = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $elevUser = $wi.Name
    $elevated = (New-Object System.Security.Principal.WindowsPrincipal($wi)).IsInRole([System.Security.Principal.WindowsBuiltinRole]::Administrator)
  } catch {}
  Add-Check 'sandbox.provision.elevated' 'provisioning runs with elevation (admin phase)' $elevated $elevated @{ user = $elevUser }

  $probe = "tausbx$([System.Diagnostics.Process]::GetCurrentProcess().Id)"
  $created = $null
  try {
    $created = New-TauSandboxUser -Name $probe
    Add-Check 'sandbox.provision.create' 'ephemeral local user created' "name=$($created.Name) sid=$($created.Sid)" $true @{ sid = $created.Sid }
    Add-Check 'sandbox.provision.nonAdmin' 'provisioned sandbox user is NOT a member of Administrators (S-1-5-32-544)' "isAdministrator=$($created.IsAdministrator)" ($created.IsAdministrator -eq $false) $null
  } catch {
    Add-Check 'sandbox.provision.create' 'ephemeral local user created' $_.Exception.Message $false $null
  } finally {
    if ($created) { Remove-LocalUser -Name $created.Name -ErrorAction SilentlyContinue }
  }

  $allPass = ($checks.Count -gt 0) -and -not ($checks | Where-Object { $_.verdict -ne 'pass' })
  $verdict = if ($allPass) { 'pass' } else { 'fail' }
  $receipt = [ordered]@{
    kind = 'sandbox-user-provision'
    model = 'Codex-elevated step 4: sandbox user(s) provisioned ONCE with elevation in the admin phase; the workload runs AS the non-admin user (never elevated). Passwords are in-memory SecureStrings only, never logged or persisted; the probe user is removed after proof.'
    source = @{ sha = $env:GITHUB_SHA; run = $env:GITHUB_RUN_ID; arch = $env:PROCESSOR_ARCHITECTURE }
    checks = $checks
    verdict = $verdict
  }
  $receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $out
  Write-Host "[mxc:sandbox-provision] $verdict -> $out"
  if ($verdict -ne 'pass') { exit 1 }
}
