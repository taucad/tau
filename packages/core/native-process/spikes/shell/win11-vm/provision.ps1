# Spike W2 in-guest provisioning. Runs ONCE, elevated, as the built-in Administrator (RID-500) at
# first logon (autounattend FirstLogonCommands). UAC stays enabled; Defender/SmartScreen untouched.
#
# Mirrors how .github/workflows/spike-w1-shell.yml provisions the Windows row:
#   * pinned Node 24.20.0 (the repo's setup-nx default)
#   * pinned Git for Windows bash.exe (PortableGit v2.51.0.windows.1, same digest as spike-w1)
#   * `srt-win install` (the one elevated action — done here as RID-500, no interactive UAC)
# then it creates the GENUINE STANDARD user `spikeuser`, copies the repo to local NTFS, runs
# `pnpm install`, and arms a logon task so the harness runs AS spikeuser (not as admin).
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Share   = '\\10.0.2.4\qemu'
$Drop    = Join-Path $Share 'drop'
$Status  = Join-Path $Drop 'provision.log'
New-Item -ItemType Directory -Force -Path $Drop | Out-Null
function Log($m) { $t = (Get-Date).ToUniversalTime().ToString('o'); "$t  $m" | Tee-Object -FilePath $Status -Append }

# Record a provisioning failure to the drop so the host never sees a silent hang (fail-closed).
trap {
  Log "PROVISION FAILED: $($_.Exception.Message)"
  @{ stage = 'provision'; status = 'failed'; reason = "$($_.Exception.Message)" } | ConvertTo-Json | Set-Content (Join-Path $Drop 'provision-failed.json')
  # Leave the VM up briefly so the log flushes to the share, then power off so boot-vm.sh unblocks.
  Start-Sleep -Seconds 5
  Stop-Computer -Force
  exit 1
}

Log "provisioning start (as $(whoami))"

# ── Node 24.20.0 (pinned version; integrity verified against nodejs.org's published manifest) ──────
$nodeVer = '24.20.0'
$nodeZip = "node-v$nodeVer-win-x64.zip"
$nodeUrl = "https://nodejs.org/dist/v$nodeVer/$nodeZip"
$nodeDst = 'C:\node'
Log "download Node $nodeVer"
Invoke-WebRequest -Uri $nodeUrl -OutFile "C:\$nodeZip"
$shasums = (Invoke-WebRequest -Uri "https://nodejs.org/dist/v$nodeVer/SHASUMS256.txt").Content
$want = ($shasums -split "`n" | Where-Object { $_ -match [regex]::Escape($nodeZip) }) -replace '\s.*$',''
$got  = (Get-FileHash -Algorithm SHA256 "C:\$nodeZip").Hash.ToLower()
if (-not $want -or $got -ne $want.ToLower()) { throw "Node digest mismatch: got $got want $want" }
Expand-Archive -Path "C:\$nodeZip" -DestinationPath $nodeDst -Force
$nodeBin = Join-Path $nodeDst "node-v$nodeVer-win-x64"
$env:Path = "$nodeBin;$env:Path"
[Environment]::SetEnvironmentVariable('Path', "$nodeBin;" + [Environment]::GetEnvironmentVariable('Path','Machine'), 'Machine')
Log "node: $(& (Join-Path $nodeBin 'node.exe') --version)"

# ── Pinned Git for Windows bash.exe (identical tag + digest to spike-w1-shell.yml) ─────────────────
$gfwTag = 'v2.51.0.windows.1'
$gfwAsset = 'PortableGit-2.51.0-64-bit.7z.exe'
$gfwSha = 'a09b275d51ed3e829128e04cf4168fb54896cf6234bb30fecb8dc96a2bd321fa'
$gitDst = 'C:\tau-git'
New-Item -ItemType Directory -Force -Path $gitDst | Out-Null
Log "download Git for Windows $gfwTag"
Invoke-WebRequest -Uri "https://github.com/git-for-windows/git/releases/download/$gfwTag/$gfwAsset" -OutFile "C:\$gfwAsset"
$gitGot = (Get-FileHash -Algorithm SHA256 "C:\$gfwAsset").Hash.ToLower()
if ($gitGot -ne $gfwSha) { throw "Git for Windows digest mismatch: $gitGot" }
& "C:\$gfwAsset" -y "-o$gitDst" | Out-Null
$bash = Join-Path $gitDst 'bin\bash.exe'
if (-not (Test-Path $bash)) { throw "bash.exe not found after extraction" }
Log "bash: $bash"

# ── Copy the repo to local NTFS so pnpm's symlink farm works (SMB-hosted node_modules do not) ──────
$repoSrc = Join-Path $Share 'repo'
$repoDst = 'C:\tau'
Log "robocopy repo -> $repoDst (this is the slow step)"
# /MIR mirrors; /NFL /NDL /NP quiet; a reparse-point-free source copy. robocopy exit <8 is success.
robocopy $repoSrc $repoDst /MIR /NFL /NDL /NP /R:2 /W:2 | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }

# ── Dependencies, exactly as setup-nx does (corepack pnpm@11.7.0 from packageManager) ──────────────
Push-Location $repoDst
& (Join-Path $nodeBin 'corepack.cmd') enable
Log "pnpm install --frozen-lockfile"
& (Join-Path $nodeBin 'corepack.cmd') pnpm install --frozen-lockfile 2>&1 | Tee-Object -FilePath (Join-Path $Drop 'pnpm-install.log')
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed ($LASTEXITCODE)" }
Pop-Location

# ── The one elevated action: srt-win install (done as RID-500; UAC stays enabled machine-wide) ─────
$srt = & (Join-Path $nodeBin 'node.exe') "$repoDst\packages\core\native-process\spikes\shell\srt-win-path.mts"
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $srt)) { throw "vendored srt-win.exe missing at '$srt'" }
Log "srt-win: $srt"
& $srt install
if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 10) { throw "srt-win install exited $LASTEXITCODE" }
& $srt status | Tee-Object -FilePath (Join-Path $Drop 'srt-status.log')

# ── Create the GENUINE STANDARD user and arm the harness to run AS it (never as admin) ─────────────
$suName = 'spikeuser'
$suPw   = 'Spike!Usr#W2'   # synthetic, VM-local, disposable — no secret
$suSec  = ConvertTo-SecureString $suPw -AsPlainText -Force
if (-not (Get-LocalUser -Name $suName -ErrorAction SilentlyContinue)) {
  New-LocalUser -Name $suName -Password $suSec -PasswordNeverExpires -AccountNeverExpires | Out-Null
}
# Users group ONLY — explicitly NOT Administrators. This is the consumer standard user.
Add-LocalGroupMember -Group 'Users' -Member $suName -ErrorAction SilentlyContinue
if (Get-LocalGroupMember -Group 'Administrators' -Member $suName -ErrorAction SilentlyContinue) {
  throw "spikeuser must not be an administrator"
}
Log "created standard user $suName (Administrators member: $([bool](Get-LocalGroupMember -Group 'Administrators' -Member $suName -ErrorAction SilentlyContinue)))"

# Autologon as spikeuser on next boot, and a logon scheduled task that runs the harness as spikeuser.
$win = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
Set-ItemProperty $win AutoAdminLogon 1
Set-ItemProperty $win DefaultUserName $suName
Set-ItemProperty $win DefaultPassword $suPw
Set-ItemProperty $win DefaultDomainName '.'
Set-ItemProperty $win AutoLogonCount 1 -Type DWord

$action  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File $repoDst\packages\core\native-process\spikes\shell\win11-vm\run-harness.ps1"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $suName
# Run in the standard user's own context (no elevation). The task runs the sandboxed workload.
$principal = New-ScheduledTaskPrincipal -UserId $suName -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'TauSpikeHarness' -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
Log "armed logon task for $suName; rebooting into standard-user session"

Start-Sleep -Seconds 3
Restart-Computer -Force
