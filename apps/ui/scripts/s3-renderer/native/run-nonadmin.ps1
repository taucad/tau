# Run S3 renderer suites on the WIN-ARM row as a NON-ADMIN local user (Q2's run-nonadmin.ps1 pattern).
#
# GitHub Actions steps run as an administrator, and Tau runs as a standard user. This creates an ephemeral
# local user with a random synthetic password (a SecureString that never reaches a command line, never
# printed or persisted), proves it is not in Administrators, and runs each `run.mts` invocation as that user
# through Start-Process -Credential. A launch or desktop-access failure is recorded as a typed receipt in the
# drop, never faked and never retried as administrator here: the workflow labels any admin run separately.
#
# Usage: run-nonadmin.ps1 -Drop <dir> -Runs 'label=<run.mts arguments>', ... [-TimeoutSeconds 2400]
# Each run writes results under <Drop>/<label> (pass `--out` yourself) and logs to <Drop>/<label>.*.log.
param(
  [Parameter(Mandatory = $true)][string]$Drop,
  [Parameter(Mandatory = $true)][string[]]$Runs,
  [int]$TimeoutSeconds = 2400
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

New-Item -ItemType Directory -Force -Path $Drop | Out-Null
$node = (Get-Command node.exe).Source
$runner = Join-Path $env:GITHUB_WORKSPACE 'apps/ui/scripts/s3-renderer/run.mts'
$user = 'taus3'

$alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_#%@!'.ToCharArray()
$rng = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rng)
$pwPlain = 'Aa1_' + (($rng | ForEach-Object { $alphabet[$_ % $alphabet.Length] }) -join '')
$secure = ConvertTo-SecureString $pwPlain -AsPlainText -Force
$pwPlain = $null

# Children get these through Machine scope (Start-Process -Credential builds the env from Machine+User).
$forwarded = @('S3_HOST_LABEL', 'S3_GPU_LABEL', 'S3_GUIDEPUP_MODULE', 'GUIDEPUP_SCREEN_READERS_PATH')
$overallExit = 0
try {
  New-LocalUser -Name $user -Password $secure -FullName 'Tau S3 (ephemeral)' `
    -Description 'Ephemeral non-admin S3 renderer user' -AccountNeverExpires -PasswordNeverExpires -ErrorAction Stop | Out-Null
  $adminGroup = (Get-LocalGroup -SID 'S-1-5-32-544').Name
  $isAdmin = [bool](Get-LocalGroupMember -Group $adminGroup -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match "[\\/]$([regex]::Escape($user))$" -or $_.Name -eq $user })
  $cred = New-Object System.Management.Automation.PSCredential($user, $secure)
  @{
    row = $env:S3_HOST_LABEL
    arch = $env:PROCESSOR_ARCHITECTURE
    standardUser = $user
    isAdministrator = $isAdmin
  } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Drop 'nonadmin-context.json')
  if ($isAdmin) { throw 'created user unexpectedly in Administrators; refusing to run elevated' }

  # Read access to the checkout (node_modules, the built harness; the runner's ACL admits only administrators). An
  # inheritable grant alone left pnpm's hard-linked store files unreadable (EPERM), so every file also gets an explicit
  # ACE (/T). The summary line and one probed file's ACL go to the log.
  cmd /c "icacls `"$env:GITHUB_WORKSPACE`" /grant `"${user}:(OI)(CI)RX`" /C /Q" | Out-Null
  $grant = cmd /c "icacls `"$env:GITHUB_WORKSPACE`" /grant `"${user}:RX`" /T /C /Q 2>&1"
  Write-Host "[run-nonadmin] read grant: $(($grant | Select-Object -Last 1))"
  $probe = Join-Path $env:GITHUB_WORKSPACE 'node_modules/playwright/package.json'
  Write-Host "[run-nonadmin] probe ACL: $((cmd /c "icacls `"$probe`"" 2>&1) -join ' | ')"
  # Write access to the drop and the harness output (packaged fixture, Electron user data stays in the profile).
  foreach ($path in @($Drop, (Join-Path $env:GITHUB_WORKSPACE 'out/s3-renderer'))) {
    cmd /c "icacls `"$path`" /grant `"${user}:(OI)(CI)M`"" | Out-Null
  }
  foreach ($name in $forwarded) {
    [Environment]::SetEnvironmentVariable($name, [Environment]::GetEnvironmentVariable($name), 'Machine')
  }

  foreach ($run in $Runs) {
    $label, $arguments = $run -split '=', 2
    $so = Join-Path $Drop "$label.out.log"
    $se = Join-Path $Drop "$label.err.log"
    $receipt = @{ label = $label; arguments = $arguments; runAs = $user }
    try {
      $p = Start-Process -FilePath $node -ArgumentList "`"$runner`" $arguments" -Credential $cred -LoadUserProfile `
        -WorkingDirectory $env:GITHUB_WORKSPACE -RedirectStandardOutput $so -RedirectStandardError $se -PassThru
      if (-not $p.WaitForExit($TimeoutSeconds * 1000)) {
        cmd /c "taskkill /T /F /PID $($p.Id)" | Out-Null
        $receipt.status = 'timeout'
      } else {
        $receipt.status = if ($p.ExitCode -eq 0) { 'ran' } else { 'failed' }
        $receipt.exitCode = $p.ExitCode
      }
    } catch {
      $receipt.status = 'launch-failed'
      $receipt.reason = "$($_.Exception.Message)"
    }
    Get-Content -LiteralPath $so -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "[$label] $_" }
    Get-Content -LiteralPath $se -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "[${label}:err] $_" }
    Write-Host "[$label] $($receipt.status) exit=$($receipt.exitCode)"
    $receipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Drop "$label.nonadmin.json")
    if ($receipt.status -ne 'ran') { $overallExit = 1 }
  }
} catch {
  Write-Host "[run-nonadmin] ERROR: $($_.Exception.Message)"
  @{ row = $env:S3_HOST_LABEL; status = 'nonadmin-runner-failed'; reason = "$($_.Exception.Message)" } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Drop 'nonadmin-runner-failed.json')
  $overallExit = 1
} finally {
  foreach ($name in $forwarded) { [Environment]::SetEnvironmentVariable($name, $null, 'Machine') }
  Remove-LocalUser -Name $user -ErrorAction SilentlyContinue
}
exit $overallExit
