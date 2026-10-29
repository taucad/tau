param([ValidateSet('setup', 'cleanup')][string]$Action)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$clock = [Diagnostics.Stopwatch]::StartNew()
$launchMs = [int]([DateTime]::Now - [Diagnostics.Process]::GetCurrentProcess().StartTime).TotalMilliseconds
$hostVersion = $PSVersionTable.PSVersion.ToString()
# Phase lines go to stderr as they happen, so a caller that kills this process on timeout still sees the last phase reached.
function Write-Phase([string]$Name, [string]$Detail = '') {
  [Console]::Error.WriteLine("tau-smb-fixture action=$Action host=$hostVersion phase=$Name launchMs=$launchMs elapsedMs=$($clock.ElapsedMilliseconds) $Detail".TrimEnd())
  [Console]::Error.Flush()
}
function Wait-Until([string]$Name, [int]$Seconds, [scriptblock]$Ready) {
  $deadline = $clock.ElapsedMilliseconds + ($Seconds * 1000)
  while ($true) {
    try { if (& $Ready) { return } } catch { $last = $_.Exception.Message }
    if ($clock.ElapsedMilliseconds -ge $deadline) {
      $script:readinessFailure = "$Name not ready within $Seconds s: $last"
      throw $script:readinessFailure
    }
    Start-Sleep -Milliseconds 200
  }
}
function Wait-Service([string]$Name, [int]$Seconds) {
  $service = Get-Service -Name $Name
  if ($service.Status -eq 'Stopped') { $service.Start() }
  if ($service.Status -ne 'Running') {
    try {
      $service.WaitForStatus('Running', [TimeSpan]::FromSeconds($Seconds))
    } catch {
      $service.Refresh()
      $script:readinessFailure = "service $Name is $($service.Status) after $Seconds s"
      throw $script:readinessFailure
    }
  }
}
Write-Phase 'start'
$share = $env:TAU_AUTHORITY_TEST_SHARE
if ($share -notmatch '^tau-authority-[a-f0-9]+$') { throw 'Invalid fixture share name' }
$unc = "\\localhost\$share"
Import-Module SmbShare
Write-Phase 'module'
function Remove-FixtureResources {
  $owned = Get-SmbShare -Name $share -ErrorAction SilentlyContinue
  if (-not $owned) { return }
  if ($owned.Path -ne $env:TAU_AUTHORITY_TEST_ROOT) { throw 'Fixture share name already bound elsewhere' }
  # A selected drive letter is not ownership. Remove only mappings to this verified fixture share.
  $mappings = Get-SmbMapping -ErrorAction SilentlyContinue | Where-Object { $_.RemotePath -eq $unc }
  foreach ($mapping in $mappings) { Remove-SmbMapping -LocalPath $mapping.LocalPath -Force -UpdateProfile }
  Write-Phase 'mapping-removed'
  Remove-SmbShare -Name $share -Force
}
if ($Action -eq 'cleanup') {
  Remove-FixtureResources
  Write-Phase 'done'
  exit 0
}
$script:readinessFailure = $null
$drive = $null
try {
  Wait-Service 'LanmanServer' 5
  Wait-Service 'LanmanWorkstation' 5
  Write-Phase 'services'
  $taken = @([IO.DriveInfo]::GetDrives() | ForEach-Object { $_.Name.Substring(0, 1).ToUpperInvariant() })
  # A mapping can exist without a local path, and reading a drive letter off it would fail the whole setup.
  $taken += @(Get-SmbMapping -ErrorAction SilentlyContinue | Where-Object { $_.LocalPath } | ForEach-Object { $_.LocalPath.Substring(0, 1).ToUpperInvariant() })
  $drive = @('Z', 'Y', 'X', 'W', 'V', 'U', 'T', 'S', 'R') | Where-Object { $taken -notcontains $_ } | Select-Object -First 1
  if (-not $drive) { throw 'No disposable drive available' }
  $existing = Get-SmbShare -Name $share -ErrorAction SilentlyContinue
  if ($existing -and $existing.Path -ne $env:TAU_AUTHORITY_TEST_ROOT) { throw 'Fixture share name already bound elsewhere' }
  if (-not $existing) {
    $owner = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    New-SmbShare -Name $share -Path $env:TAU_AUTHORITY_TEST_ROOT -FullAccess $owner -Temporary | Out-Null
  }
  Write-Phase 'share'
  Wait-Until 'UNC share' 5 { Test-Path -LiteralPath $unc -PathType Container }
  Write-Phase 'share-ready'
  New-SmbMapping -LocalPath "$($drive):" -RemotePath $unc -Persistent $false | Out-Null
  Write-Phase 'mapping' "drive=$drive"
  Wait-Until 'mapped drive' 5 { Test-Path -LiteralPath "$($drive):\" -PathType Container }
  Write-Phase 'ready'
  [Console]::Out.WriteLine((@{ status = 'ready'; unc = $unc; drive = $drive } | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
  Write-Phase 'emitted'
} catch {
  Write-Phase 'failed' "error=$($_.Exception.Message)"
  Remove-FixtureResources
  if ($script:readinessFailure) {
    # A runner that has SMB but is slow to bring it up is a failure with diagnostics, never an unavailable skip.
    [Console]::Error.WriteLine("tau-smb-fixture readiness failure: $script:readinessFailure")
    exit 3
  }
  @{ status = 'unavailable'; reason = 'Disposable SMB share or mapping unavailable on this runner' } | ConvertTo-Json -Compress
}
