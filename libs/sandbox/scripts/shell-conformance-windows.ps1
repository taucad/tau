# The WIN-X64 shell conformance row on a hosted Windows runner (`.github/workflows/shell-conformance.yml`).
#
# A hosted runner's steps run as an administrator, but the Windows shell sandbox serves a standard user: the helper's
# `setup` runs elevated once, and everything after it runs as a person who is not an administrator. This script plays
# both parts with an ephemeral local account, adapted from the Q2 spike's `run-nonadmin.ps1`:
#
#   setup    (elevated)  create the standard user `tauconformance`, prove it is not an administrator, install the
#                        built helper under %ProgramFiles% (administrator-owned, as an installer would place it), run
#                        `tau-windows-sandbox.exe setup --for-user <its SID>` and let it read and write the checkout.
#   run      (elevated)  give the user a fresh random password and start this script's `inner` mode as that user
#                        with its own profile; wait, bounded, and exit with the conformance target's status.
#   inner    (the user)  prove the process is not elevated, then run `sandbox:test:shell-conformance:windows` with
#                        Nx from the checkout (what `pnpm nx` runs) and the forwarded environment.
#   revoke   (elevated)  `tau-windows-sandbox.exe revoke`, confirm the install record is gone, then delete the user,
#                        its profile and the installed helper. Idempotent; run it whatever happened before.
#
# Passwords are random, held as SecureStrings, never printed, never written and never put on a command line. The
# environment forwarded to `inner` is a fixed allowlist of names; no token or credential is ever in it. A missing
# prerequisite fails the phase by name; nothing here turns a failure into a skip.
#
# Usage (from an elevated pwsh, at the workspace root):
#   pwsh -NoLogo -NoProfile -File libs/sandbox/scripts/shell-conformance-windows.ps1 setup
#   pwsh -NoLogo -NoProfile -File libs/sandbox/scripts/shell-conformance-windows.ps1 run [-TimeoutMinutes 40]
#   pwsh -NoLogo -NoProfile -File libs/sandbox/scripts/shell-conformance-windows.ps1 revoke
#
# Env (run): TAU_SHELL_CONFORMANCE_ROW, TAU_SHELL_CONFORMANCE_RECEIPT, GITHUB_SHA and the other forwarded names below.
# Exit codes: 0 ok; 1 a phase failed; 124 the conformance target exceeded -TimeoutMinutes; otherwise the target's own.
[CmdletBinding()]
param(
  [Parameter(Mandatory, Position = 0)]
  [ValidateSet('setup', 'run', 'inner', 'revoke')]
  [string]$Mode,
  [string]$EnvFile,
  [int]$TimeoutMinutes = 40
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version Latest

$user = 'tauconformance'
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$built = Join-Path $workspace 'libs\sandbox\windows-sandbox\target\x86_64-pc-windows-msvc\release\tau-windows-sandbox.exe'
$installDirectory = Join-Path $env:ProgramFiles 'Tau\ShellConformance'
$helper = Join-Path $installDirectory 'tau-windows-sandbox.exe'
$drop = Join-Path $workspace 'out\shell-conformance-windows'

# The only names `inner` receives from the elevated step; anything else comes from the user's own profile.
$forwarded = @(
  'PATH', 'CI', 'GITHUB_ACTIONS', 'GITHUB_SHA', 'GITHUB_RUN_ID', 'GITHUB_REPOSITORY', 'GITHUB_SERVER_URL',
  'TAU_SHELL_CONFORMANCE_ROW', 'TAU_SHELL_CONFORMANCE_RECEIPT', 'TAU_SHELL_TIER', 'TAU_SHELL_EVIDENCE',
  'NX_NO_CLOUD', 'NX_DAEMON', 'NX_NATIVE_COMMAND_RUNNER', 'pnpm_config_verify_deps_before_run'
)

function Assert-Elevated {
  $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "The $Mode phase needs an elevated shell."
  }
}

# A random password from a switch-safe alphabet, as a SecureString; the plaintext lives only inside this function.
function New-Password {
  $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_#%@!'.ToCharArray()
  $bytes = [byte[]]::new(32)
  [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $secure = [Security.SecureString]::new()
  foreach ($character in 'Aa1_'.ToCharArray()) { $secure.AppendChar($character) }
  foreach ($byte in $bytes) { $secure.AppendChar($alphabet[$byte % $alphabet.Length]) }
  $secure.MakeReadOnly()
  return $secure
}

function Get-UserSid {
  $account = Get-LocalUser -Name $user -ErrorAction SilentlyContinue
  if ($null -eq $account) { return $null }
  return $account.SID.Value
}

function Invoke-Helper([string]$path, [string[]]$arguments) {
  & $path @arguments
  if ($LASTEXITCODE -ne 0) { throw "tau-windows-sandbox $($arguments[0]) exited $LASTEXITCODE." }
}

function Invoke-Setup {
  Assert-Elevated
  if (-not (Test-Path -LiteralPath $built)) {
    throw "No helper at $built; build it with 'pnpm nx run sandbox:build:windows-sandbox' first."
  }
  if ($null -ne (Get-UserSid)) { throw "The local user $user already exists; revoke the previous run first." }

  New-LocalUser -Name $user -Password (New-Password) -FullName 'Tau shell conformance (ephemeral)' `
    -Description 'Tau WIN-X64 shell conformance standard user' `
    -AccountNeverExpires -PasswordNeverExpires | Out-Null
  $sid = Get-UserSid
  # A first check here; `inner` makes the authoritative one from the token of the process that runs the suite.
  # Get-LocalGroupMember throws on a group holding an orphaned SID, which some images carry, so only a positive match
  # is a verdict.
  try {
    $administrators = @(Get-LocalGroupMember -SID 'S-1-5-32-544' -ErrorAction Stop)
  } catch {
    $administrators = @()
    Write-Host "::warning::Administrators could not be listed ($($_.Exception.Message)); inner checks the token."
  }
  if ($administrators | Where-Object { $_.SID.Value -eq $sid }) {
    throw "$user is a member of Administrators; the row runs only as a standard user."
  }
  Write-Host "Standard user $user ($sid) created."

  New-Item -ItemType Directory -Force -Path $installDirectory | Out-Null
  Copy-Item -LiteralPath $built -Destination $helper -Force
  $digest = (Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Host "Helper installed at $helper (sha256:$digest)."

  # With Windows Firewall off the sandbox account's block rules have no effect; run 44004391207 reached both listeners.
  # A consumer Windows 11 has it on, so the disposable runner is set to match, with the default outbound allow and
  # inbound block for every other account. The profile state is printed for the receipt.
  Set-NetFirewallProfile -All -Enabled True -DefaultOutboundAction Allow -DefaultInboundAction Block
  Get-NetFirewallProfile | ForEach-Object { Write-Host "Firewall profile $($_.Name): enabled $($_.Enabled)." }

  Invoke-Helper $helper @('setup', '--for-user', $sid)
  Write-Host 'Install record:'
  Invoke-Helper $helper @('status')

  # Nx, Vitest and the receipt write into the checkout (.nx, node_modules\.vite, out); the user owns none of it.
  & icacls.exe $workspace /grant "*${sid}:(OI)(CI)M" /Q | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "icacls could not grant $user the checkout (exit $LASTEXITCODE)." }
  New-Item -ItemType Directory -Force -Path $drop | Out-Null
}

function Invoke-Run {
  Assert-Elevated
  $sid = Get-UserSid
  if ($null -eq $sid) { throw "No local user $user; run the setup phase first." }
  if (-not (Test-Path -LiteralPath $helper)) { throw "No installed helper at $helper; run the setup phase first." }
  foreach ($name in 'TAU_SHELL_CONFORMANCE_ROW', 'TAU_SHELL_CONFORMANCE_RECEIPT') {
    if (-not [Environment]::GetEnvironmentVariable($name)) { throw "$name is not set." }
  }

  $environment = [ordered]@{ TAU_SHELL_CONFORMANCE_WINDOWS_HELPER = $helper }
  foreach ($name in $forwarded) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if ($null -ne $value) { $environment[$name] = $value }
  }
  New-Item -ItemType Directory -Force -Path $drop | Out-Null
  $environmentFile = Join-Path $drop 'environment.json'
  $environment | ConvertTo-Json | Set-Content -LiteralPath $environmentFile -Encoding utf8NoBOM
  $stdout = Join-Path $drop 'inner.out.log'
  $stderr = Join-Path $drop 'inner.err.log'

  $password = New-Password
  Set-LocalUser -Name $user -Password $password
  $credential = [pscredential]::new($user, $password)
  $pwsh = (Get-Process -Id $PID).Path
  $process = Start-Process -FilePath $pwsh -Credential $credential -LoadUserProfile -PassThru `
    -WorkingDirectory $workspace -RedirectStandardOutput $stdout -RedirectStandardError $stderr `
    -ArgumentList @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', "`"$PSCommandPath`"", 'inner', '-EnvFile', "`"$environmentFile`"")
  $null = $process.Handle  # keep the handle so ExitCode stays readable after the process exits
  $process | Wait-Process -Timeout ($TimeoutMinutes * 60) -ErrorAction SilentlyContinue
  $process.Refresh()
  $timedOut = -not $process.HasExited
  if ($timedOut) {
    Write-Host "::error::the conformance target ran past $TimeoutMinutes minutes; stopping its process tree."
    & taskkill.exe /PID $process.Id /T /F | Out-Null
  }
  foreach ($log in $stdout, $stderr) {
    if (Test-Path -LiteralPath $log) { Get-Content -LiteralPath $log | ForEach-Object { Write-Host $_ } }
  }
  if ($timedOut) { exit 124 }
  $code = $process.ExitCode
  Write-Host "The conformance target exited $code."
  if ($code -eq 0 -and -not (Test-Path -LiteralPath $env:TAU_SHELL_CONFORMANCE_RECEIPT)) {
    Write-Host "::error::the target passed but wrote no receipt at $env:TAU_SHELL_CONFORMANCE_RECEIPT."
    exit 1
  }
  exit $code
}

function Invoke-Inner {
  if (-not $EnvFile -or -not (Test-Path -LiteralPath $EnvFile)) { throw 'inner needs -EnvFile.' }
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]$identity
  if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "$($identity.Name) is elevated; the row runs only as a standard user."
  }
  Write-Host "Running as $($identity.Name) ($($identity.User.Value)), not an administrator; inherited USERPROFILE $env:USERPROFILE."
  $environment = Get-Content -LiteralPath $EnvFile -Raw | ConvertFrom-Json
  foreach ($entry in $environment.PSObject.Properties) {
    [Environment]::SetEnvironmentVariable($entry.Name, [string]$entry.Value, 'Process')
  }
  # Start-Process -Credential can carry the elevated account's expanded user-scope variables; the profile folders the
  # suite uses (os.homedir, os.tmpdir) come from this process's own token instead.
  $profileDirectory = [Environment]::GetFolderPath('UserProfile')
  if (-not $profileDirectory -or -not $profileDirectory.EndsWith("\$user", [StringComparison]::OrdinalIgnoreCase)) {
    throw "The profile of $user is not loaded (got '$profileDirectory')."
  }
  # The known-folder lookups expand `%USERPROFILE%` from this process's inherited environment, which still names the
  # elevated account (run 44002533057), so the per-user folders are derived from the profile directory itself.
  $localAppData = Join-Path $profileDirectory 'AppData\Local'
  $roamingAppData = Join-Path $profileDirectory 'AppData\Roaming'
  $temporary = Join-Path $localAppData 'Temp'
  New-Item -ItemType Directory -Force -Path $temporary | Out-Null
  $own = [ordered]@{
    USERPROFILE = $profileDirectory
    HOMEDRIVE = $profileDirectory.Substring(0, 2)
    HOMEPATH = $profileDirectory.Substring(2)
    APPDATA = $roamingAppData
    LOCALAPPDATA = $localAppData
    TEMP = $temporary
    TMP = $temporary
    USERNAME = $user
  }
  foreach ($name in $own.Keys) { [Environment]::SetEnvironmentVariable($name, $own[$name], 'Process') }
  Set-Location -LiteralPath $workspace
  $nx = Join-Path $workspace 'node_modules\.bin\nx.cmd'
  if (-not (Test-Path -LiteralPath $nx)) { throw "No Nx at $nx; install the workspace first." }
  & $nx run sandbox:test:shell-conformance:windows --skip-nx-cache
  exit $LASTEXITCODE
}

function Invoke-Revoke {
  Assert-Elevated
  $failures = [Collections.Generic.List[string]]::new()
  $path = if (Test-Path -LiteralPath $helper) { $helper } elseif (Test-Path -LiteralPath $built) { $built } else { $null }
  if ($null -eq $path) {
    Write-Host 'No helper is installed or built; there is no sandbox install to revoke.'
  } else {
    try {
      Invoke-Helper $path @('revoke')
      $status = (& $path status | Out-String | ConvertFrom-Json)
      $installed = $status.PSObject.Properties['installed']
      if ($null -eq $installed -or $installed.Value -ne $false) {
        $failures.Add('the install record is still present after revoke')
      }
    } catch {
      $failures.Add($_.Exception.Message)
    }
  }

  $sid = Get-UserSid
  if ($null -ne $sid) {
    try {
      Get-CimInstance -ClassName Win32_UserProfile | Where-Object { $_.SID -eq $sid } | Remove-CimInstance
    } catch {
      $failures.Add("profile of ${user}: $($_.Exception.Message)")
    }
    Remove-LocalUser -SID $sid
    Write-Host "Removed the standard user $user ($sid)."
  }
  if (Test-Path -LiteralPath $installDirectory) { Remove-Item -LiteralPath $installDirectory -Recurse -Force }
  if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Host "::error::revoke: $_" }
    exit 1
  }
  Write-Host 'Revoked: no sandbox install, no conformance user, no installed helper.'
}

try {
  switch ($Mode) {
    'setup' { Invoke-Setup }
    'run' { Invoke-Run }
    'inner' { Invoke-Inner }
    'revoke' { Invoke-Revoke }
  }
} catch {
  Write-Host "::error::shell-conformance-windows $Mode`: $($_.Exception.Message)"
  exit 1
}
