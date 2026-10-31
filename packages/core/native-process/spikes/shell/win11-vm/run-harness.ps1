# Spike W2 harness runner. Runs AS the genuine STANDARD user `spikeuser` (logon scheduled task,
# RunLevel Limited — no elevation). Runs the EXISTING, UNMODIFIED harness
# packages/core/native-process/spikes/shell/fs-net-probe.mts (S0+S1) exactly as spike-w1 does, then
# drops the receipts and a DONE sentinel on the host SMB share and powers the VM off.
#
# THE LOAD-BEARING LINE: RUNNER_TEMP is cleared before invoking the harness. lib.mts fixtureRoot()
# is `process.env.RUNNER_TEMP ?? join(homedir(), '.tau-shell-spike')`, so with RUNNER_TEMP unset the
# fixture — including the out-of-root `outside/secret.txt` — lands in THIS standard user's
# %USERPROFILE%\.tau-shell-spike. That is where consumer per-user NTFS profile isolation applies, so
# the S0 out-of-root READ test reflects genuine profile isolation (can srt-sandbox, a different
# standard user, read this user's profile?) rather than a shared world/Users-readable temp. No edit
# to lib.mts is needed — this is the override mechanism lib.mts already exposes.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Share = '\\10.0.2.4\qemu'
$Drop  = Join-Path $Share 'drop'
$Repo  = 'C:\tau'
$Spike = Join-Path $Repo 'packages\core\native-process\spikes\shell'
$log   = Join-Path $Drop 's0s1.log'
function Log($m) { $t = (Get-Date).ToUniversalTime().ToString('o'); "$t  $m" | Tee-Object -FilePath $log -Append }

trap {
  Log "HARNESS WRAPPER FAILED: $($_.Exception.Message)"
  @{ row = 'WIN11'; status = 'harness-wrapper-failed'; reason = "$($_.Exception.Message)"; verdict = 'fail' } |
    ConvertTo-Json | Set-Content (Join-Path $Drop 'harness-failed.json')
  New-Item -ItemType File -Force -Path (Join-Path $Drop 'DONE') | Out-Null
  Start-Sleep -Seconds 5
  Stop-Computer -Force
  exit 1
}

Log "harness run start as $(whoami) (profile=$env:USERPROFILE)"
# Prove we are NOT elevated and NOT an administrator — the whole point of this row.
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$pr = New-Object Security.Principal.WindowsPrincipal($id)
$isAdmin = $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Log "is elevated/admin: $isAdmin (expected: False)"
"$(whoami /all)" | Set-Content (Join-Path $Drop 'whoami.txt')

# D14 ShellIdentity receipt (blueprint D14): the consumer standard-user Windows shell resolution,
# fixed paths only, as the real standard user. Record the default selection (pwsh 7 if present, else
# 5.1) AND the forced-5.1 branch, so both resolution paths are evidenced in-VM. This is additive to
# the existing probe below; the full MXC+PowerShell in-VM isolation retool rides the mxc lane.
$shellId = Join-Path $Spike 'mxc\shell-identity.ps1'
if (Test-Path $shellId) {
  Log 'resolving D14 ShellIdentity (default + pwsh7-hidden branches)'
  & $shellId -OutPath (Join-Path $Drop 'WIN11\shell-identity.json') | Out-Null
  & $shellId -HidePwsh7 -OutPath (Join-Path $Drop 'WIN11\shell-identity-51.json') | Out-Null
} else {
  Log "WARN: shell-identity.ps1 missing at $shellId"
}

$node = (Get-Command node.exe).Source
$bash = 'C:\tau-git\bin\bash.exe'
if (-not (Test-Path $bash)) { throw "pinned bash missing at $bash" }
$srt = & $node (Join-Path $Spike 'srt-win-path.mts')
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $srt)) { throw "srt-win.exe missing at '$srt'" }

# Harness environment (matches spike-w1's WIN row; row label WIN11). Receipts -> SMB drop. Fixture ->
# %USERPROFILE% because RUNNER_TEMP is explicitly removed below.
$env:TAU_SPIKE_ROW = 'WIN11'
$env:TAU_SPIKE_OUT = $Drop
$env:TAU_SPIKE_BASH = $bash
$env:TAU_SPIKE_BASH_ORIGIN = "$('v2.51.0.windows.1') (a09b275d51ed3e829128e04cf4168fb54896cf6234bb30fecb8dc96a2bd321fa)"
$env:TAU_SPIKE_SRT_WIN = $srt
Remove-Item Env:RUNNER_TEMP -ErrorAction SilentlyContinue   # <- forces fixtureRoot() into %USERPROFILE%
Remove-Item Env:GITHUB_SHA  -ErrorAction SilentlyContinue
Log "TAU_SPIKE_OUT=$Drop  bash=$bash  srt=$srt  RUNNER_TEMP=$([bool]$env:RUNNER_TEMP)"

# Run the UNMODIFIED probe by path, exactly as spike-w1.
Push-Location $Spike
& $node (Join-Path $Spike 'fs-net-probe.mts') 2>&1 | Tee-Object -FilePath $log -Append
$code = $LASTEXITCODE
Pop-Location
Log "fs-net-probe exit=$code"

# Record where the fixture actually landed, for the receipt reviewer (confirms profile placement).
@{
  row = 'WIN11'; probeExit = $code; isAdmin = $isAdmin; userProfile = $env:USERPROFILE;
  fixtureBase = (Join-Path $env:USERPROFILE '.tau-shell-spike'); runnerTempCleared = $true
} | ConvertTo-Json | Set-Content (Join-Path $Drop 'WIN11\run-context.json')

New-Item -ItemType File -Force -Path (Join-Path $Drop 'DONE') | Out-Null
Log "DONE sentinel written; powering off"
Start-Sleep -Seconds 5
Stop-Computer -Force
