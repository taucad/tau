# D14 Windows shell resolution + ShellIdentity receipt (blueprint D14, Brain f1b7c6df).
#
# Canonical, standalone probe reused by both the hosted mxc row (spike-w2-win-mxc.yml) and the Win11
# VM consumer row (win11-vm/run-harness.ps1). It resolves the Windows shell exactly as D14 pins it
# and records the identity; it does not itself launch the agent shell.
#
# D14 rules enforced here:
#   * FIXED PATHS ONLY, never PATH:
#       pwsh 7  -> %ProgramFiles%\PowerShell\7\pwsh.exe        (preferred when present)
#       else    -> %SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe   (5.1, on every Win11)
#   * REFUSE user-/store-writable copies: WindowsApps aliases, profile-path copies, .cmd shims.
#   * Launch argv is -NoLogo -NoProfile -NonInteractive -Command, with NO -ExecutionPolicy override
#     (the machine/GPO policy applies; a blocked script is an ordinary nonzero `completed`).
#   * Terminal pane uses the same shell interactively: -NoLogo -NoProfile over ConPTY.
#   * kind + version + digest are recorded; neither present/trusted => kind 'shell-missing'.
#
# -HidePwsh7 forces the 5.1 branch (ignores pwsh 7) so both resolution branches are testable on one
# host. -OutPath writes the JSON receipt (default: stdout only).
param(
  [string]$OutPath,
  [switch]$HidePwsh7
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$launchArgv = @('-NoLogo', '-NoProfile', '-NonInteractive', '-Command')
$ptyArgv = @('-NoLogo', '-NoProfile')

# A fixed path is trusted only if it is NOT under a user-/store-writable location and is a real .exe.
function Test-Trusted($path) {
  if ([string]::IsNullOrWhiteSpace($path)) { return @{ trusted = $false; reason = 'empty' } }
  $lower = $path.ToLowerInvariant()
  if ($lower.EndsWith('.cmd') -or $lower.EndsWith('.bat')) { return @{ trusted = $false; reason = 'shim (.cmd/.bat) refused' } }
  foreach ($bad in @('\windowsapps\', $env:USERPROFILE, $env:LOCALAPPDATA, $env:APPDATA)) {
    if ($bad -and $lower.Contains($bad.ToLowerInvariant())) { return @{ trusted = $false; reason = "under user-/store-writable location: $bad" } }
  }
  return @{ trusted = $true; reason = 'fixed trusted install path' }
}

function Probe-Candidate($kind, $path) {
  $exists = Test-Path -LiteralPath $path -PathType Leaf
  $trust = if ($exists) { Test-Trusted $path } else { @{ trusted = $false; reason = 'not present' } }
  $version = $null; $digest = $null
  if ($exists -and $trust.trusted) {
    try {
      # Resolve the version by launching with the D14 argv (no -ExecutionPolicy). A policy that blocks
      # this is itself a recorded nonzero completion, not a probe error.
      $version = (& $path @launchArgv '$PSVersionTable.PSVersion.ToString()' 2>$null | Select-Object -First 1)
    } catch { $version = "launch-failed: $($_.Exception.Message)" }
    try { $digest = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() } catch { $digest = $null }
  }
  return [ordered]@{ kind = $kind; path = $path; present = $exists; trusted = $trust.trusted; reason = $trust.reason; version = $version; sha256 = $digest }
}

$pwsh7Path = Join-Path $env:ProgramFiles 'PowerShell\7\pwsh.exe'
$ps51Path = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

$pwsh7 = Probe-Candidate 'pwsh7' $pwsh7Path
$ps51 = Probe-Candidate 'windows-powershell-5.1' $ps51Path

# Selection: pwsh 7 wins when present AND trusted (unless hidden for the 5.1-branch test); else 5.1.
$selected = $null
if (-not $HidePwsh7 -and $pwsh7.present -and $pwsh7.trusted) {
  $selected = $pwsh7
} elseif ($ps51.present -and $ps51.trusted) {
  $selected = $ps51
}

$kind = if ($null -ne $selected) { $selected.kind } else { 'shell-missing' }
$identity = [ordered]@{
  kind = $kind
  trusted = ($null -ne $selected)
  path = if ($selected) { $selected.path } else { $null }
  version = if ($selected) { $selected.version } else { $null }
  sha256 = if ($selected) { $selected.sha256 } else { $null }
  launchArgv = $launchArgv
  ptyArgv = $ptyArgv
  executionPolicyOverride = $false
  hidePwsh7 = [bool]$HidePwsh7
  candidates = @($pwsh7, $ps51)
  executionPolicy = (Get-ExecutionPolicy -List | ForEach-Object { "$($_.Scope)=$($_.ExecutionPolicy)" }) -join '; '
  user = ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
  userSid = ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value)
  note = 'D14: fixed paths only (never PATH); WindowsApps/profile/.cmd refused; -NoLogo -NoProfile -NonInteractive -Command, no -ExecutionPolicy; Git Bash not offered on Windows.'
}

$json = $identity | ConvertTo-Json -Depth 6
if ($OutPath) {
  New-Item -ItemType Directory -Force -Path (Split-Path $OutPath) | Out-Null
  $json | Set-Content -LiteralPath $OutPath
}
Write-Output $json
if ($kind -eq 'shell-missing') { exit 3 }
