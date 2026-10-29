param([ValidateSet('setup', 'cleanup')][string]$Action)
$ErrorActionPreference = 'Stop'
$share = $env:TAU_AUTHORITY_TEST_SHARE
if ($share -notmatch '^tau-authority-[a-f0-9]+$') { throw 'Invalid fixture share name' }
if ($Action -eq 'cleanup') {
  $mappings = Get-SmbMapping -ErrorAction SilentlyContinue | Where-Object { $_.RemotePath -eq "\\localhost\$share" }
  foreach ($mapping in $mappings) { Remove-SmbMapping -LocalPath $mapping.LocalPath -Force -UpdateProfile }
  if (Get-SmbShare -Name $share -ErrorAction SilentlyContinue) {
    Remove-SmbShare -Name $share -Force
  }
  exit 0
}
$drive = $null
try {
  $drive = @('Z', 'Y', 'X', 'W', 'V', 'U', 'T', 'S', 'R') | Where-Object { -not (Get-PSDrive -Name $_ -ErrorAction SilentlyContinue) } | Select-Object -First 1
  if (-not $drive) { throw 'No disposable drive available' }
  $owner = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  New-SmbShare -Name $share -Path $env:TAU_AUTHORITY_TEST_ROOT -FullAccess $owner -Temporary | Out-Null
  $unc = "\\localhost\$share"
  New-PSDrive -Name $drive -PSProvider FileSystem -Root $unc -Persist -Scope Global | Out-Null
  @{ status = 'ready'; unc = $unc; drive = $drive } | ConvertTo-Json -Compress
} catch {
  if ($drive) { & net.exe use "$($drive):" /delete /y 2>$null | Out-Null }
  if (Get-SmbShare -Name $share -ErrorAction SilentlyContinue) { Remove-SmbShare -Name $share -Force }
  @{ status = 'unavailable'; reason = 'Disposable SMB share or mapping unavailable on this runner' } | ConvertTo-Json -Compress
}
