# Run the full W2 MXC + D14 receipt set as a NON-ADMIN local user (windows-11-arm row).
#
# GitHub Actions steps run as an administrator; MXC needs no elevation (ratification §RQ5, D14), so
# the arm64 receipt must be collected as a genuine standard user. This creates an ephemeral local
# user with a random synthetic password (never printed, never persisted — deleted in finally),
# proves it is NOT an administrator, then runs each probe AS that user via Start-Process -Credential,
# writing receipts to the shared drop the host summarizes. Every probe records arch=arm64 through
# laneIdentity (os.arch). Honest: a launch failure is recorded, never faked.
#
# This path also sidesteps the Git-bash whoami shadow without a shell wrapper: the children run as
# the standard user via node directly (not under bash), so the SDK's internal `whoami /user` resolves
# to System32\whoami.exe (Git\usr\bin is not on a standard user's default PATH).
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$drop = Join-Path $env:RUNNER_TEMP 'mxc-spike'
New-Item -ItemType Directory -Force -Path $drop | Out-Null
$mxc = Join-Path $env:GITHUB_WORKSPACE $env:MXC_DIR
$node = (Get-Command node.exe).Source
$user = 'tauspike'
$arch = $env:PROCESSOR_ARCHITECTURE

# Random synthetic password (local, ephemeral, satisfies complexity; never logged/persisted).
$rng = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rng)
$pwPlain = [Convert]::ToBase64String($rng) + 'Aa1!'

$overallExit = 0
try {
  # Create the standard user; do NOT add it to Administrators. /y answers any prompt.
  cmd /c "net user $user `"$pwPlain`" /add /y" | Out-Null
  # Prove non-membership of Administrators (external, host-side).
  $admins = (cmd /c "net localgroup Administrators") -join "`n"
  $isAdmin = $admins -match "(?im)^\s*$user\s*$"
  $secure = ConvertTo-SecureString $pwPlain -AsPlainText -Force
  $cred = New-Object System.Management.Automation.PSCredential("$env:COMPUTERNAME\$user", $secure)

  # The standard user must be able to write the drop (receipts) and read node_modules/workspace.
  cmd /c "icacls `"$drop`" /grant `"${user}:(OI)(CI)M`"" | Out-Null

  # Children read the drop path from a Machine env var (Start-Process -Credential builds the child
  # env from Machine+User scope). Removed in finally.
  [Environment]::SetEnvironmentVariable('TAU_SPIKE_OUT', $drop, 'Machine')

  @{
    row = 'WIN-ARM'
    arch = $arch
    standardUser = $user
    isAdministrator = [bool]$isAdmin
    note = 'Full MXC + D14 receipt set collected as a non-admin local user; arm64. An arm64 PSEC receipt does NOT close the x64 or consumer-SKU rows.'
  } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $drop 'nonadmin-context.json')
  if ($isAdmin) { throw "created user unexpectedly in Administrators; refusing to run elevated" }

  function Invoke-AsUser([string]$script, [string]$label) {
    $so = Join-Path $drop "$label.out.log"
    $se = Join-Path $drop "$label.err.log"
    $p = Start-Process -FilePath $node -ArgumentList @("`"$script`"") -Credential $cred `
      -WorkingDirectory $env:GITHUB_WORKSPACE -RedirectStandardOutput $so -RedirectStandardError $se -PassThru -Wait
    Get-Content -LiteralPath $so -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "[$label] $_" }
    $err = Get-Content -LiteralPath $se -ErrorAction SilentlyContinue
    if ($err) { $err | ForEach-Object { Write-Host "[$label:err] $_" } }
    Write-Host "[$label] exit=$($p.ExitCode)"
    return $p.ExitCode
  }

  # Order: provision, D14 ShellIdentity (both branches), grammar, pty, probe; then isolation if the
  # MXC probe passed (PSEC present), else the capability-SID fallback.
  [void](Invoke-AsUser (Join-Path $mxc 'provision.mts') 'provision')
  [void](Invoke-AsUser (Join-Path $mxc 'shell-identity.mts') 'shell-identity')
  [void](Invoke-AsUser (Join-Path $mxc 'grammar.mts') 'grammar')
  [void](Invoke-AsUser (Join-Path $mxc 'pty.mts') 'pty')
  [void](Invoke-AsUser (Join-Path $mxc 'probe.mts') 'probe')

  $probeReceipt = Join-Path $drop 'probe.receipt.json'
  $probeOk = (Test-Path $probeReceipt) -and (((Get-Content -LiteralPath $probeReceipt -Raw | ConvertFrom-Json).verdict) -eq 'pass')
  if ($probeOk) {
    Write-Host 'MXC probe PASSED on arm64 (PSEC present): collecting the two-container isolation receipt.'
    [void](Invoke-AsUser (Join-Path $mxc 'isolation.mts') 'isolation')
  } else {
    Write-Host 'MXC probe did not pass on arm64: collecting the capability-SID fallback receipt.'
    [void](Invoke-AsUser (Join-Path $mxc 'fallback.mts') 'fallback')
  }
} catch {
  Write-Host "[run-nonadmin] ERROR: $($_.Exception.Message)"
  @{ row = 'WIN-ARM'; arch = $arch; status = 'nonadmin-runner-failed'; reason = "$($_.Exception.Message)"; verdict = 'fail' } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $drop 'nonadmin-runner-failed.json')
  $overallExit = 1
} finally {
  [Environment]::SetEnvironmentVariable('TAU_SPIKE_OUT', $null, 'Machine')
  cmd /c "net user $user /delete" 2>$null | Out-Null
}
# The host Summarize step is the single gate over the receipts; this launcher only surfaces its own
# infrastructure failure.
exit $overallExit
