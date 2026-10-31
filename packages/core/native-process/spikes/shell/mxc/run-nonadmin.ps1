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

# Random synthetic password (local, ephemeral; never logged/persisted). Built from a switch-safe
# alphabet (no / \ " ' ` space, and it cannot lead with - or /) so that no tool mis-parses it, then
# wrapped as a SecureString that is reused for both New-LocalUser and the credential — the plaintext
# never touches a command line. The 'Aa1_' prefix guarantees upper+lower+digit+symbol complexity.
$alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_#%@!'.ToCharArray()
$rng = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rng)
$pwPlain = 'Aa1_' + (($rng | ForEach-Object { $alphabet[$_ % $alphabet.Length] }) -join '')
$secure = ConvertTo-SecureString $pwPlain -AsPlainText -Force
$pwPlain = $null

$overallExit = 0
try {
  # Create the standard user via New-LocalUser (SecureString: the password never hits a command line,
  # so no character can be mis-parsed as a switch). Do NOT add it to any admin group.
  New-LocalUser -Name $user -Password $secure -FullName 'Tau Spike (ephemeral)' `
    -Description 'Ephemeral non-admin spike user' -AccountNeverExpires -PasswordNeverExpires -ErrorAction Stop | Out-Null
  # Prove non-membership of Administrators (external, host-side), by well-known SID S-1-5-32-544.
  $adminGroup = (Get-LocalGroup -SID 'S-1-5-32-544').Name
  $isAdmin = [bool](Get-LocalGroupMember -Group $adminGroup -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match "[\\/]$([regex]::Escape($user))$" -or $_.Name -eq $user })
  $cred = New-Object System.Management.Automation.PSCredential($user, $secure)

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

  # Each child runs under its OWN bounded timeout so a single hang (e.g. ConPTY teardown) cannot eat
  # the whole block and starve the later probe/isolation receipts. On timeout the child tree is
  # force-killed (taskkill /T /F) and a typed <label>.timeout.json is dropped; the run continues.
  function Invoke-AsUser([string]$script, [string]$label, [int]$timeoutSec = 240) {
    $so = Join-Path $drop "$label.out.log"
    $se = Join-Path $drop "$label.err.log"
    $p = Start-Process -FilePath $node -ArgumentList @("`"$script`"") -Credential $cred `
      -WorkingDirectory $env:GITHUB_WORKSPACE -RedirectStandardOutput $so -RedirectStandardError $se -PassThru
    $null = $p | Wait-Process -Timeout $timeoutSec -ErrorAction SilentlyContinue
    $p.Refresh()
    if (-not $p.HasExited) {
      Write-Host "[$label] TIMEOUT after ${timeoutSec}s — force-killing child tree"
      cmd /c "taskkill /PID $($p.Id) /T /F" 2>$null | Out-Null
      @{ kind = $label; verdict = 'fail'; arch = $arch; conclusion = "$label exceeded its ${timeoutSec}s run-as timeout and was force-terminated (typed timeout); harness timeout, not a containment finding." } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $drop "$label.timeout.json")
    }
    Get-Content -LiteralPath $so -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "[$label] $_" }
    $err = Get-Content -LiteralPath $se -ErrorAction SilentlyContinue
    if ($err) { $err | ForEach-Object { Write-Host "[$label:err] $_" } }
    $code = if ($p.HasExited) { $p.ExitCode } else { 124 }
    Write-Host "[$label] exit=$code"
    return $code
  }

  # Order: provision, D14 ShellIdentity (both branches), grammar, pty, probe; then isolation if the
  # MXC probe passed (PSEC present), else the capability-SID fallback. pty gets a tighter run-as
  # timeout (its own in-process watchdog is 60s, so 120s leaves it room to self-record first).
  [void](Invoke-AsUser (Join-Path $mxc 'provision.mts') 'provision')
  [void](Invoke-AsUser (Join-Path $mxc 'shell-identity.mts') 'shell-identity')
  [void](Invoke-AsUser (Join-Path $mxc 'grammar.mts') 'grammar')
  [void](Invoke-AsUser (Join-Path $mxc 'pty.mts') 'pty' 120)
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
  Remove-LocalUser -Name $user -ErrorAction SilentlyContinue
}
# The host Summarize step is the single gate over the receipts; this launcher only surfaces its own
# infrastructure failure.
exit $overallExit
