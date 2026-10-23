# W2 Windows containment fallback: the ratified Codex-ELEVATED restricted-token model (runs where the
# MXC/PSEC probe is unavailable, which is every hosted GA runner). This REPLACES the broken
# AppContainer-package-SID model that previously lived here.
#
# ROOT CAUSE of the earlier ERROR_INVALID_SID (1337), and the correction:
#   The previous version derived AppContainer CAPABILITY SIDs (S-1-15-3-*) via
#   DeriveCapabilitySidsFromName and fed them to CreateRestrictedToken as RESTRICTING SIDs. Capability
#   SIDs are NOT valid restricting SIDs, so CreateRestrictedToken returned ERROR_INVALID_SID. That
#   AppContainer model is WRONG for this purpose and is kept ONLY as the documented alternative below.
#
#   DOCUMENTED ALTERNATIVE (not used): the AppContainer model passes capability SIDs through a
#   SECURITY_CAPABILITIES struct via PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES to CreateProcess,
#   with a per-container PACKAGE SID (S-1-15-2-*) from CreateAppContainerProfile as the principal. It
#   is a different mechanism (Low-IL AppContainer launch), not a CreateRestrictedToken restricting SID.
#
# RATIFIED MODEL IMPLEMENTED HERE (openai/codex codex-rs/windows-sandbox-rs):
#   * cap.rs make_random_cap_sid_string() (lines 39-46) mints a RANDOM S-1-5-21-{a}-{b}-{c}-{d} SID
#     per writable root / per session. A random account-domain (S-1-5-21) SID IS a valid restricting
#     SID (unlike a capability SID), which is the whole fix.
#   * token.rs create_token_with_caps_from() builds the consuming token. token.rs:500 reads exactly:
#         let flags = DISABLE_MAX_PRIVILEGE | LUA_TOKEN | WRITE_RESTRICTED;
#     with WRITE_RESTRICTED = 0x08 (token.rs:44), DISABLE_MAX_PRIVILEGE = 0x01 (token.rs:42),
#     LUA_TOKEN = 0x04 (token.rs:43) => flags = 0x0D. The CreateRestrictedToken call is token.rs:501,
#     and the random cap SID is passed as a RESTRICTING SID (entries order: capabilities..., extra,
#     logon, everyone; token.rs:483-509). So it IS a WRITE_RESTRICTED token, NOT a plain restricted
#     token. This script mints the same flags and restricting-SID layout and cites that line.
#   * acl.rs: ALLOW ACEs (FILE_GENERIC_WRITE) for the cap SID on the admitted writable roots
#     (ensure_allow_mask_aces_with_inheritance), and add_deny_read_ace (acl.rs:1014) DENY-READ ACEs on
#     the never-grantable set. Mirrored here with System.Security.AccessControl rules keyed on the SID.
#   * Elevated backend: the sandbox user(s) are provisioned ONCE with elevation (admin phase); the
#     workload runs AS the non-admin user, never elevated (spawn_prep.rs require_logon_sandbox_creds).
#
# WHAT THIS PROVES, fail-closed (a typed *-failed / *-unavailable check + fail verdict on any
# unresolved API or provisioning failure; never a fabricated pass):
#   (A) WRITE ISOLATION decided purely by the cap SID: two CONCURRENT sessions run as the SAME
#       non-admin account, differing ONLY by their random S-1-5-21 write-restricting SID. External
#       synthetic canary files show each can write its own root and is DENIED the other root.
#   (B) CROSS-SESSION READ DENIAL: two distinct non-admin sandbox accounts + deny-read ACEs; an
#       external observer (the orchestrator, outside the sandbox) impersonates each and shows its read
#       of the other session private root (and of the never-grantable set) is denied by the kernel.
#   (C) S2 interactive PTY IN-CONTAINER: s2-pty.ps1 is launched as the non-admin sandbox user under the
#       write-restricted token; it stands up a real ConPTY and records tty/resize/ctrl-c/job/unicode.
#   (D) WORKLOAD NON-ELEVATED: the restricted token is LUA-filtered (not elevated) and the sandbox
#       accounts are not members of Administrators.
#
# Synthetic only, no secrets; any account password is an in-memory SecureString, never logged or
# persisted. Receipt -> $env:MXC_FALLBACK_OUT.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$out = $env:MXC_FALLBACK_OUT
if (-not $out) { $out = Join-Path (Join-Path $env:RUNNER_TEMP 'mxc-spike') 'fallback.receipt.json' }
$drop = Split-Path $out
New-Item -ItemType Directory -Force -Path $drop | Out-Null

$checks = New-Object System.Collections.ArrayList
function Add-Check($id, $expect, $observed, $ok, $detail) {
  $v = if ($ok) { 'pass' } else { 'fail' }
  [void]$checks.Add([ordered]@{ id = $id; expect = $expect; observed = "$observed"; verdict = $v; detail = $detail })
}

# ---------------------------------------------------------------------------------------------------
# P/Invoke harness: mint a WRITE_RESTRICTED token (random cap SID restricting), launch children under
# it (as self for the non-elevated path, or as a sandbox user via CreateProcessWithTokenW when
# elevated), and impersonate a sandbox user to perform an external read-access check.
# ---------------------------------------------------------------------------------------------------
$csharp = @'
using System;
using System.Text;
using System.Security;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class TauRestrict {
  [StructLayout(LayoutKind.Sequential)] struct SID_AND_ATTRIBUTES { public IntPtr Sid; public uint Attributes; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct STARTUPINFO {
    public int cb; public string Reserved; public string Desktop; public string Title;
    public int dwX; public int dwY; public int dwXSize; public int dwYSize; public int dwXCountChars;
    public int dwYCountChars; public int dwFillAttribute; public int dwFlags; public short wShowWindow;
    public short cbReserved2; public IntPtr lpReserved2; public IntPtr hStdInput; public IntPtr hStdOutput; public IntPtr hStdError;
  }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess; public IntPtr hThread; public int dwProcessId; public int dwThreadId; }

  [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr proc, uint access, out IntPtr tok);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool CreateRestrictedToken(IntPtr existing, uint flags, uint disableCount, IntPtr disable, uint deleteCount, IntPtr delete, uint restrictCount, IntPtr restrict, out IntPtr newTok);
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool ConvertStringSidToSid(string s, out IntPtr sid);
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool ConvertSidToStringSid(IntPtr sid, out IntPtr str);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool GetTokenInformation(IntPtr tok, int cls, IntPtr buf, int len, out int ret);
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool LogonUser(string user, string domain, IntPtr pw, int type, int provider, out IntPtr tok);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool ImpersonateLoggedOnUser(IntPtr tok);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool RevertToSelf();
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool CreateProcessAsUser(IntPtr tok, string app, StringBuilder cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool CreateProcessWithTokenW(IntPtr tok, uint logonFlags, string app, StringBuilder cmd, uint flags, IntPtr env, string cwd, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern IntPtr CreateFile(string path, uint access, uint share, IntPtr sa, uint disp, uint flags, IntPtr tmpl);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr h, out uint code);

  // token.rs:42-44: DISABLE_MAX_PRIVILEGE | LUA_TOKEN | WRITE_RESTRICTED == 0x01 | 0x04 | 0x08.
  public const uint FLAGS = 0x1u | 0x4u | 0x8u; // 0x0D
  const uint TOKEN_ACCESS = 0x1 | 0x2 | 0x8 | 0x80 | 0x100; // ASSIGN_PRIMARY|DUPLICATE|QUERY|ADJUST_DEFAULT|ADJUST_SESSIONID
  const uint SE_GROUP_LOGON_ID = 0xC0000000;
  const int TOKEN_GROUPS_CLASS = 2;
  const int TOKEN_ELEVATION_CLASS = 20;
  const int LOGON_INTERACTIVE = 2, PROVIDER_DEFAULT = 0;
  const uint CREATE_NO_WINDOW = 0x08000000, CREATE_UNICODE_ENVIRONMENT = 0x00000400;
  const uint GENERIC_READ = 0x80000000, FILE_SHARE_READ = 0x1, OPEN_EXISTING = 3;
  const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;

  public static string GetLogonSid() {
    IntPtr tok;
    if (!OpenProcessToken(GetCurrentProcess(), 0x8, out tok)) return null; // TOKEN_QUERY
    try {
      int len; GetTokenInformation(tok, TOKEN_GROUPS_CLASS, IntPtr.Zero, 0, out len);
      IntPtr buf = Marshal.AllocHGlobal(len);
      try {
        if (!GetTokenInformation(tok, TOKEN_GROUPS_CLASS, buf, len, out len)) return null;
        int count = Marshal.ReadInt32(buf);
        int off = IntPtr.Size; int stride = Marshal.SizeOf(typeof(SID_AND_ATTRIBUTES));
        for (int i = 0; i < count; i++) {
          IntPtr entry = (IntPtr)(buf.ToInt64() + off + (long)i * stride);
          IntPtr sid = Marshal.ReadIntPtr(entry);
          uint attr = (uint)Marshal.ReadInt32((IntPtr)(entry.ToInt64() + IntPtr.Size));
          if ((attr & SE_GROUP_LOGON_ID) == SE_GROUP_LOGON_ID) {
            IntPtr sp; if (ConvertSidToStringSid(sid, out sp)) return Marshal.PtrToStringUni(sp);
          }
        }
        return null;
      } finally { Marshal.FreeHGlobal(buf); }
    } finally { CloseHandle(tok); }
  }

  static IntPtr BuildRestricting(string capSid, string logonSid, out uint count) {
    var sids = new List<string>(); sids.Add(capSid);
    if (!string.IsNullOrEmpty(logonSid)) sids.Add(logonSid);
    sids.Add("S-1-1-0"); // Everyone, matching the token.rs entries tail
    int stride = Marshal.SizeOf(typeof(SID_AND_ATTRIBUTES));
    IntPtr arr = Marshal.AllocHGlobal(stride * sids.Count);
    for (int i = 0; i < sids.Count; i++) {
      IntPtr p; if (!ConvertStringSidToSid(sids[i], out p)) throw new Exception("ConvertStringSidToSid failed for " + sids[i] + " err=" + Marshal.GetLastWin32Error());
      SID_AND_ATTRIBUTES sa; sa.Sid = p; sa.Attributes = 0;
      Marshal.StructureToPtr(sa, (IntPtr)(arr.ToInt64() + (long)i * stride), false);
    }
    count = (uint)sids.Count; return arr;
  }

  static IntPtr Restrict(IntPtr baseTok, string capSid, string logonSid) {
    uint c; IntPtr arr = BuildRestricting(capSid, logonSid, out c);
    IntPtr nt;
    if (!CreateRestrictedToken(baseTok, FLAGS, 0, IntPtr.Zero, 0, IntPtr.Zero, c, arr, out nt))
      throw new Exception("CreateRestrictedToken failed err=" + Marshal.GetLastWin32Error());
    return nt;
  }

  static IntPtr SelfToken() {
    IntPtr tok; if (!OpenProcessToken(GetCurrentProcess(), TOKEN_ACCESS, out tok)) throw new Exception("OpenProcessToken failed err=" + Marshal.GetLastWin32Error());
    return tok;
  }

  // 0 = not elevated (LUA-filtered), 1 = elevated, negative = -winerr.
  public static int RestrictedElevation(string capSid, string logonSid) {
    try {
      IntPtr nt = Restrict(SelfToken(), capSid, logonSid);
      try {
        IntPtr b = Marshal.AllocHGlobal(4);
        try { int r; if (!GetTokenInformation(nt, TOKEN_ELEVATION_CLASS, b, 4, out r)) return -Marshal.GetLastWin32Error(); return Marshal.ReadInt32(b) == 0 ? 0 : 1; }
        finally { Marshal.FreeHGlobal(b); }
      } finally { CloseHandle(nt); }
    } catch (Exception) { return -99; }
  }

  static STARTUPINFO NewSi() { STARTUPINFO si = new STARTUPINFO(); si.cb = Marshal.SizeOf(typeof(STARTUPINFO)); /* Desktop left null: inherit the parent desktop. Forcing winsta0\\default from the runner service session denies the restricted child its desktop and it dies in user32 init (0xC0000142). */ return si; }

  // Launch a write-restricted child from the caller OWN token (restricted-of-caller: no privilege
  // required, works non-elevated). The LUA_TOKEN flag filters it to a non-elevated token.
  public static IntPtr LaunchSelf(string app, string cmdline, string capSid, string logonSid, string cwd, out int err) {
    err = 0; IntPtr nt = Restrict(SelfToken(), capSid, logonSid);
    STARTUPINFO si = NewSi(); PROCESS_INFORMATION pi;
    bool ok = CreateProcessAsUser(nt, app, new StringBuilder(cmdline), IntPtr.Zero, IntPtr.Zero, false, CREATE_NO_WINDOW, IntPtr.Zero, cwd, ref si, out pi);
    if (!ok) { err = Marshal.GetLastWin32Error(); CloseHandle(nt); return IntPtr.Zero; }
    CloseHandle(pi.hThread); CloseHandle(nt); return pi.hProcess;
  }

  // Launch a write-restricted child AS the given non-admin user (elevated orchestrator path; needs
  // SeImpersonatePrivilege, held by the admin-phase runner). The child is the non-admin sandbox user.
  public static IntPtr LaunchAsUser(string user, SecureString pw, string app, string cmdline, string capSid, string logonSid, string cwd, out int err) {
    err = 0; IntPtr pwPtr = Marshal.SecureStringToGlobalAllocUnicode(pw); IntPtr logonTok;
    bool lok;
    try { lok = LogonUser(user, ".", pwPtr, LOGON_INTERACTIVE, PROVIDER_DEFAULT, out logonTok); }
    finally { Marshal.ZeroFreeGlobalAllocUnicode(pwPtr); }
    if (!lok) { err = -Marshal.GetLastWin32Error(); return IntPtr.Zero; }
    try {
      IntPtr nt = Restrict(logonTok, capSid, logonSid);
      STARTUPINFO si = NewSi(); PROCESS_INFORMATION pi;
      bool ok = CreateProcessWithTokenW(nt, 0, app, new StringBuilder(cmdline), CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT, IntPtr.Zero, cwd, ref si, out pi);
      if (!ok) { err = Marshal.GetLastWin32Error(); CloseHandle(nt); return IntPtr.Zero; }
      CloseHandle(pi.hThread); CloseHandle(nt); return pi.hProcess;
    } finally { CloseHandle(logonTok); }
  }

  // Impersonate the sandbox user and attempt to OPEN path for read. 0 = read allowed, 5 = ACCESS
  // DENIED (the deny we want), other positive = other win32 error, negative = -(logon winerr).
  public static int TryReadAs(string user, SecureString pw, string path) {
    IntPtr pwPtr = Marshal.SecureStringToGlobalAllocUnicode(pw); IntPtr tok; bool lok;
    try { lok = LogonUser(user, ".", pwPtr, LOGON_INTERACTIVE, PROVIDER_DEFAULT, out tok); }
    finally { Marshal.ZeroFreeGlobalAllocUnicode(pwPtr); }
    if (!lok) return -Marshal.GetLastWin32Error();
    try {
      if (!ImpersonateLoggedOnUser(tok)) return -Marshal.GetLastWin32Error();
      try {
        IntPtr h = CreateFile(path, GENERIC_READ, FILE_SHARE_READ, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
        if (h == IntPtr.Zero || h == (IntPtr)(-1)) return Marshal.GetLastWin32Error();
        CloseHandle(h); return 0;
      } finally { RevertToSelf(); }
    } finally { CloseHandle(tok); }
  }

  public static int Wait(IntPtr h, int ms) { uint r = WaitForSingleObject(h, (uint)ms); if (r != 0) return -1; uint c; GetExitCodeProcess(h, out c); return (int)c; }
  public static void Close(IntPtr h) { if (h != IntPtr.Zero) CloseHandle(h); }
}
'@

# The literal token flags, independent of whether the C# compiled: DISABLE_MAX_PRIVILEGE (0x01) |
# LUA_TOKEN (0x04) | WRITE_RESTRICTED (0x08) = 0x0D (token.rs:500-501). The receipt is built from this
# literal, never from [TauRestrict]::FLAGS, so the receipt is ALWAYS written even if Add-Type fails.
$FLAGS = 0x0D
$FLAGS_HEX = ('0x{0:X2}' -f $FLAGS)

$apiOk = $true
$compileErr = $null
# Capture the FULL Add-Type failure (the terminating exception message is generic — "Cannot add type.
# There were compilation errors." — while the specific CSxxxx diagnostics are in the recent error
# records), so a compile failure is a typed, inspectable receipt instead of an opaque crash.
try { Add-Type -TypeDefinition $csharp -ErrorAction Stop } catch {
  $apiOk = $false
  $recent = ($Error | Select-Object -First 6 | ForEach-Object { $_.ToString() }) -join ' | '
  $compileErr = ($_.Exception.Message + ' || ' + $recent)
  Add-Check 'fallback.api.compile' 'restricted-token P/Invoke harness compiles' $compileErr $false @{ error = $compileErr }
}

# ---- Elevation + identity ----
$elevated = $false; $whoami = $null
try {
  $wi = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $whoami = $wi.Name
  $elevated = (New-Object System.Security.Principal.WindowsPrincipal($wi)).IsInRole([System.Security.Principal.WindowsBuiltinRole]::Administrator)
} catch {}

# ---- (1) Mint two distinct random S-1-5-21 capability SIDs (cap.rs make_random_cap_sid_string). ----
function New-RandomCapSid {
  $b = New-Object byte[] 16
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  $a0 = [System.BitConverter]::ToUInt32($b, 0); $a1 = [System.BitConverter]::ToUInt32($b, 4)
  $a2 = [System.BitConverter]::ToUInt32($b, 8); $a3 = [System.BitConverter]::ToUInt32($b, 12)
  "S-1-5-21-$a0-$a1-$a2-$a3"
}
$cap1 = New-RandomCapSid
$cap2 = New-RandomCapSid
$distinct = ($cap1 -ne $cap2) -and ($cap1 -match '^S-1-5-21-\d+-\d+-\d+-\d+$') -and ($cap2 -match '^S-1-5-21-\d+-\d+-\d+-\d+$')
Add-Check 'fallback.capSid.distinct' 'two concurrent sessions each get a distinct, well-formed random S-1-5-21 SID (cap.rs:39-46)' "A=$cap1 B=$cap2" $distinct @{ a = $cap1; b = $cap2 }
# Persist per-session (Codex persist_caps / cap_sid file equivalent).
try { @{ sessionA = $cap1; sessionB = $cap2; mintedAt = (Get-Date -Format o) } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $drop 'cap-sids.session.json') } catch {}

$logonSid = $null
if ($apiOk) { try { $logonSid = [TauRestrict]::GetLogonSid() } catch {} }

# ---- WRITE_RESTRICTED token flags + non-elevated workload facts ----
if ($apiOk) {
  $elev = [TauRestrict]::RestrictedElevation($cap1, $logonSid)
  Add-Check 'fallback.token.writeRestricted' 'WRITE_RESTRICTED token built with the random cap SID as a restricting SID (flags DISABLE_MAX_PRIVILEGE|LUA_TOKEN|WRITE_RESTRICTED=0x0D; token.rs:500-501)' ("flags=$FLAGS_HEX elevationProbe=$elev") ($elev -ge 0) @{ flags = $FLAGS_HEX; citation = 'codex-rs/windows-sandbox-rs/src/token.rs:500' }
  Add-Check 'fallback.workload.nonElevated' 'the write-restricted workload token is NOT elevated (LUA_TOKEN filtered)' "tokenIsElevated=$elev (0=not-elevated)" ($elev -eq 0) $null
}

# ---- Copy the child workload scripts to a readable staging dir (sandbox users get read+execute). ----
$scriptsDir = Join-Path $drop 'scripts'
New-Item -ItemType Directory -Force -Path $scriptsDir | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'cross-session-canary.ps1') -Destination $scriptsDir -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 's2-pty.ps1') -Destination $scriptsDir -Force

function Set-ExplicitAcl([string]$path, [object[]]$rules) {
  $acl = New-Object System.Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true, $false) # disable inheritance, drop inherited ACEs
  foreach ($r in $rules) {
    $id = New-Object System.Security.Principal.SecurityIdentifier($r.Sid)
    $type = [System.Security.AccessControl.AccessControlType]::$($r.Type)
    $rights = [System.Security.AccessControl.FileSystemRights]::$($r.Rights)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($id, $rights, 'ContainerInherit,ObjectInherit', 'None', $type)
    $acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $path -AclObject $acl
}
# Grant every logged-on principal read+execute on the staging scripts (Authenticated Users S-1-5-11).
Set-ExplicitAcl $scriptsDir @(
  @{ Sid = 'S-1-5-32-544'; Rights = 'FullControl'; Type = 'Allow' },
  @{ Sid = 'S-1-5-11'; Rights = 'ReadAndExecute'; Type = 'Allow' }
)
$canaryChild = Join-Path $scriptsDir 'cross-session-canary.ps1'
$s2Child = Join-Path $scriptsDir 's2-pty.ps1'

$ADMINS = 'S-1-5-32-544'
$EVERYONE_RW = 'S-1-1-0'

function New-Dir([string]$p) { New-Item -ItemType Directory -Force -Path $p | Out-Null; (Resolve-Path -LiteralPath $p).Path }
function New-SessionTemp([string]$name) {
  $t = New-Dir (Join-Path $drop $name)
  # Temp scratch for incidental child writes: grant Everyone Modify so BOTH the normal check and the
  # Everyone restricting-SID write check pass (temp is not the isolation subject).
  Set-ExplicitAcl $t @(@{ Sid = $ADMINS; Rights = 'FullControl'; Type = 'Allow' }, @{ Sid = $EVERYONE_RW; Rights = 'Modify'; Type = 'Allow' })
  $t
}

function Build-ChildCmd([string]$app, [string]$payload) { '"' + $app + '" -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "' + $payload + '"' }

# Resolve the D14 inner shell for the children (fixed paths only).
$pwsh7 = Join-Path $env:ProgramFiles 'PowerShell\7\pwsh.exe'
$ps51 = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shellPath = if (Test-Path -LiteralPath $pwsh7) { $pwsh7 } elseif (Test-Path -LiteralPath $ps51) { $ps51 } else { $null }
$shellKind = if ($shellPath -eq $pwsh7) { 'pwsh7' } elseif ($shellPath) { 'windows-powershell-5.1' } else { 'shell-missing' }
Add-Check 'fallback.d14.shell' 'D14 shell resolved at a fixed trusted path for the sandboxed children' "kind=$shellKind path=$shellPath" ($null -ne $shellPath) @{ kind = $shellKind; path = $shellPath }

# Mode banner.
$mode = if ($elevated -and $apiOk) { 'elevated' } else { 'nonElevated' }
Add-Check 'fallback.mode' 'orchestration mode (elevated => provision sandbox users + read-denial + S2; else single-account write isolation)' "elevated=$elevated apiOk=$apiOk mode=$mode" $true @{ whoami = $whoami }

$s2Verdict = 'not-run'
$createdUsers = @()

if ($apiOk -and $null -ne $shellPath) {
  try {
    # ================= (A) WRITE ISOLATION purely by the random cap SID =================
    # Two concurrent sessions run as the SAME account, differing ONLY by the write-restricting cap SID.
    # wiRoot1 grants the account + cap1 write; wiRoot2 grants the account + cap2 write; NO Everyone.
    $wi1 = New-Dir (Join-Path $drop 'wi-root-1')
    $wi2 = New-Dir (Join-Path $drop 'wi-root-2')
    $tmp1 = New-SessionTemp 'sess-temp-1'
    $tmp2 = New-SessionTemp 'sess-temp-2'

    # Provision the non-admin sandbox accounts up-front (elevated mode): used for the cross-session
    # READ-denial impersonation checks and as the S2 PTY workload identity.
    if ($mode -eq 'elevated') {
      . (Join-Path $PSScriptRoot 'provision-sandbox-users.ps1')
      $sandboxA = New-TauSandboxUser -Name 'tausbxa'
      $sandboxB = New-TauSandboxUser -Name 'tausbxb'
      $createdUsers = @($sandboxA.Name, $sandboxB.Name)
      Add-Check 'fallback.sandbox.provisioned' 'two non-admin sandbox users provisioned with elevation (admin phase); workload runs as them, never elevated' "A=$($sandboxA.Name)/$($sandboxA.Sid) B=$($sandboxB.Name)/$($sandboxB.Sid)" (($sandboxA.IsAdministrator -eq $false) -and ($sandboxB.IsAdministrator -eq $false)) @{ a = $sandboxA.Sid; b = $sandboxB.Sid }
    }
    # WRITE ISOLATION: both concurrent children run under the orchestrator OWN token restricted-of-
    # caller (CreateProcessAsUser needs no privilege and there is no cross-user window-station launch
    # to be refused). The LUA_TOKEN filter makes the child NON-elevated. The two children differ ONLY
    # by their random S-1-5-21 write-restricting cap SID, so any write isolation observed is
    # attributable to the cap SID alone. Each root grants the SAME account (normal check passes on
    # both roots) plus only its OWN cap SID write (the restricting-check discriminator); NO
    # Everyone/Users write, so the WRITE_RESTRICTED restricting-SID check is what denies the cross write.
    $acctSid = $wi.User.Value
    Set-ExplicitAcl $wi1 @(@{ Sid = $ADMINS; Rights = 'FullControl'; Type = 'Allow' }, @{ Sid = $acctSid; Rights = 'Modify'; Type = 'Allow' }, @{ Sid = $cap1; Rights = 'Modify'; Type = 'Allow' })
    Set-ExplicitAcl $wi2 @(@{ Sid = $ADMINS; Rights = 'FullControl'; Type = 'Allow' }, @{ Sid = $acctSid; Rights = 'Modify'; Type = 'Allow' }, @{ Sid = $cap2; Rights = 'Modify'; Type = 'Allow' })

    $payloadA = "`$env:TEMP='$tmp1'; `$env:TMP='$tmp1'; & '$canaryChild' -SessionId A -OwnRoot '$wi1' -OtherRoot '$wi2'"
    $payloadB = "`$env:TEMP='$tmp2'; `$env:TMP='$tmp2'; & '$canaryChild' -SessionId B -OwnRoot '$wi2' -OtherRoot '$wi1'"
    $cmdA = Build-ChildCmd $shellPath $payloadA
    $cmdB = Build-ChildCmd $shellPath $payloadB

    $errA = 0; $errB = 0
    $hA = [TauRestrict]::LaunchSelf($shellPath, $cmdA, $cap1, $logonSid, $env:SystemRoot, [ref]$errA)
    $hB = [TauRestrict]::LaunchSelf($shellPath, $cmdB, $cap2, $logonSid, $env:SystemRoot, [ref]$errB)
    $launched = ($hA -ne [IntPtr]::Zero) -and ($hB -ne [IntPtr]::Zero)
    Add-Check 'fallback.concurrency' 'two sessions launched CONCURRENTLY under write-restricted tokens before either is awaited' "launchedA=$($hA -ne [IntPtr]::Zero)(err=$errA) launchedB=$($hB -ne [IntPtr]::Zero)(err=$errB)" $launched @{ errA = $errA; errB = $errB }
    $exitA = $null; $exitB = $null
    if ($hA -ne [IntPtr]::Zero) { $exitA = [TauRestrict]::Wait($hA, 60000); [TauRestrict]::Close($hA) }
    if ($hB -ne [IntPtr]::Zero) { $exitB = [TauRestrict]::Wait($hB, 60000); [TauRestrict]::Close($hB) }
    Add-Check 'fallback.children.exit' 'write-isolation children ran to completion (exit codes recorded; -1073741502 = 0xC0000142 DLL init failure)' "exitA=$exitA exitB=$exitB" (($exitA -eq 0) -and ($exitB -eq 0)) @{ exitA = $exitA; exitB = $exitB }

    if ($launched) {
      # External observation: which canary files actually materialized decides each claim.
      $ownA = Test-Path -LiteralPath (Join-Path $wi1 'canary-from-A.txt')
      $crossA = Test-Path -LiteralPath (Join-Path $wi2 'canary-from-A.txt')
      $ownB = Test-Path -LiteralPath (Join-Path $wi2 'canary-from-B.txt')
      $crossB = Test-Path -LiteralPath (Join-Path $wi1 'canary-from-B.txt')
      Add-Check 'fallback.write.ownAllowed.A' 'session A can write its own root' "wi1/canary-from-A.txt exists=$ownA" $ownA $null
      Add-Check 'fallback.write.ownAllowed.B' 'session B can write its own root' "wi2/canary-from-B.txt exists=$ownB" $ownB $null
      Add-Check 'fallback.write.crossDenied.AtoB' 'session A CANNOT write into session B root (external canary absent)' "wi2/canary-from-A.txt exists=$crossA (want False)" (-not $crossA) $null
      Add-Check 'fallback.write.crossDenied.BtoA' 'session B CANNOT write into session A root (external canary absent)' "wi1/canary-from-B.txt exists=$crossB (want False)" (-not $crossB) $null
    } else {
      Add-Check 'fallback.write.isolation' 'write-restricted children launched' "launch failed errA=$errA errB=$errB" $false $null
    }

    # ================= (B) CROSS-SESSION READ DENIAL (elevated: distinct sandbox accounts) =============
    if ($mode -eq 'elevated') {
      $rdA = New-Dir (Join-Path $drop 'rd-root-a')
      $rdB = New-Dir (Join-Path $drop 'rd-root-b')
      $never = New-Dir (Join-Path $drop 'never-grantable')
      # acl.rs model: per-session read grant on own root; DENY-READ ACEs (add_deny_read_ace) on the
      # other session root and on the never-grantable set. Lock the DACLs FIRST so the secret files
      # inherit the restrictive ACL at creation (the admin orchestrator still writes them via its Full
      # grant); the sandbox principals never get an inherited broad grant.
      Set-ExplicitAcl $rdA @(@{ Sid = $ADMINS; Rights = 'FullControl'; Type = 'Allow' }, @{ Sid = $sandboxA.Sid; Rights = 'ReadAndExecute'; Type = 'Allow' }, @{ Sid = $sandboxB.Sid; Rights = 'Read'; Type = 'Deny' })
      Set-ExplicitAcl $rdB @(@{ Sid = $ADMINS; Rights = 'FullControl'; Type = 'Allow' }, @{ Sid = $sandboxB.Sid; Rights = 'ReadAndExecute'; Type = 'Allow' }, @{ Sid = $sandboxA.Sid; Rights = 'Read'; Type = 'Deny' })
      Set-ExplicitAcl $never @(@{ Sid = $ADMINS; Rights = 'FullControl'; Type = 'Allow' }, @{ Sid = $sandboxA.Sid; Rights = 'Read'; Type = 'Deny' }, @{ Sid = $sandboxB.Sid; Rights = 'Read'; Type = 'Deny' })
      # External synthetic canaries, authored by the orchestrator (outside any sandbox), after lockdown.
      $secretA = 'SECRET-A-' + [System.Guid]::NewGuid().ToString('N')
      $secretB = 'SECRET-B-' + [System.Guid]::NewGuid().ToString('N')
      $secretN = 'SECRET-N-' + [System.Guid]::NewGuid().ToString('N')
      Set-Content -LiteralPath (Join-Path $rdA 'secret.txt') -Value $secretA -NoNewline
      Set-Content -LiteralPath (Join-Path $rdB 'secret.txt') -Value $secretB -NoNewline
      Set-Content -LiteralPath (Join-Path $never 'secret.txt') -Value $secretN -NoNewline

      $fA = Join-Path $rdA 'secret.txt'; $fB = Join-Path $rdB 'secret.txt'; $fN = Join-Path $never 'secret.txt'
      $aOwn = [TauRestrict]::TryReadAs($sandboxA.Name, $sandboxA.Secure, $fA)
      $aCross = [TauRestrict]::TryReadAs($sandboxA.Name, $sandboxA.Secure, $fB)
      $bOwn = [TauRestrict]::TryReadAs($sandboxB.Name, $sandboxB.Secure, $fB)
      $bCross = [TauRestrict]::TryReadAs($sandboxB.Name, $sandboxB.Secure, $fA)
      $aNever = [TauRestrict]::TryReadAs($sandboxA.Name, $sandboxA.Secure, $fN)
      $bNever = [TauRestrict]::TryReadAs($sandboxB.Name, $sandboxB.Secure, $fN)
      Add-Check 'fallback.read.ownAllowed.A' 'session A can read its own private root (impersonated open == 0)' "status=$aOwn" ($aOwn -eq 0) $null
      Add-Check 'fallback.read.ownAllowed.B' 'session B can read its own private root (impersonated open == 0)' "status=$bOwn" ($bOwn -eq 0) $null
      Add-Check 'fallback.read.crossDenied.AtoB' 'session A read of session B root is DENIED (ACCESS_DENIED==5)' "status=$aCross (want 5)" ($aCross -eq 5) $null
      Add-Check 'fallback.read.crossDenied.BtoA' 'session B read of session A root is DENIED (ACCESS_DENIED==5)' "status=$bCross (want 5)" ($bCross -eq 5) $null
      Add-Check 'fallback.read.neverGrantable' 'the never-grantable set is DENIED to both sessions (deny-read ACE; acl.rs:1014)' "A=$aNever B=$bNever (want 5/5)" (($aNever -eq 5) -and ($bNever -eq 5)) $null
    } else {
      Add-Check 'fallback.read.requiresElevated' 'cross-session READ denial requires the elevated per-account sandbox backend (distinct sandbox logons + deny-read ACEs); not provable from a single non-admin account because WRITE_RESTRICTED gates writes only, so reads use the shared account identity' "mode=$mode (non-elevated)" $false @{ note = 'Run the elevated admin-phase step to obtain the read-denial receipt.' }
    }

    # ================= (C) S2 interactive PTY IN-CONTAINER (as the non-admin sandbox user) =============
    $tmpS2 = New-SessionTemp 'sess-temp-s2'
    # The S2 child runs as the (non-admin) sandbox user, which may not be able to write the shared
    # drop; have it write its receipt into the Everyone-writable session temp, then the orchestrator
    # copies it into the drop for the summarizer + artifact.
    $s2Out = Join-Path $tmpS2 's2-pty.receipt.json'
    $s2Final = Join-Path $drop 's2-pty.receipt.json'
    $payloadS2 = "`$env:TEMP='$tmpS2'; `$env:TMP='$tmpS2'; `$env:MXC_S2PTY_OUT='$s2Out'; `$env:GITHUB_SHA='$($env:GITHUB_SHA)'; `$env:GITHUB_RUN_ID='$($env:GITHUB_RUN_ID)'; & '$s2Child'"
    $cmdS2 = Build-ChildCmd $shellPath $payloadS2
    $errS2 = 0
    $s2LaunchPath = 'self'
    if ($mode -eq 'elevated') {
      $hS2 = [TauRestrict]::LaunchAsUser($sandboxA.Name, $sandboxA.Secure, $shellPath, $cmdS2, $cap1, $logonSid, $env:SystemRoot, [ref]$errS2)
      if ($hS2 -eq [IntPtr]::Zero) {
        # Cross-user window-station launch can be refused in the runner service session; fall back to
        # the restricted-of-caller (LUA-filtered, non-elevated) token so the S2-in-token receipt is
        # still collected. s2-pty.ps1 re-proves non-admin regardless of which path launched it.
        $s2LaunchPath = "asUser-failed(err=$errS2)->self"
        $hS2 = [TauRestrict]::LaunchSelf($shellPath, $cmdS2, $cap1, $logonSid, $env:SystemRoot, [ref]$errS2)
      } else {
        $s2LaunchPath = 'asSandboxUser'
      }
    } else {
      $hS2 = [TauRestrict]::LaunchSelf($shellPath, $cmdS2, $cap1, $logonSid, $env:SystemRoot, [ref]$errS2)
    }
    if ($hS2 -ne [IntPtr]::Zero) {
      $exitS2 = [TauRestrict]::Wait($hS2, 180000); [TauRestrict]::Close($hS2)
      Add-Check 'fallback.s2Pty.exit' 'S2 PTY child exit code recorded (-1073741502 = 0xC0000142 DLL init failure)' "exit=$exitS2 launch=$s2LaunchPath" ($exitS2 -eq 0) @{ exit = $exitS2; launchPath = $s2LaunchPath }
    } else {
      Add-Check 'fallback.s2Pty.launch' 'S2 PTY child launched under the write-restricted sandbox token' "launch failed err=$errS2" $false $null
    }
    if (Test-Path -LiteralPath $s2Out) { try { Copy-Item -LiteralPath $s2Out -Destination $s2Final -Force } catch {} }
    if (Test-Path -LiteralPath $s2Final) {
      try {
        $s2r = Get-Content -LiteralPath $s2Final -Raw | ConvertFrom-Json
        $s2Verdict = "$($s2r.verdict)"
        $s2sub = @{}; foreach ($c in $s2r.checks) { $s2sub[$c.id] = $c.verdict }
        $s2sub['launchPath'] = $s2LaunchPath
        Add-Check 'fallback.s2Pty.inContainer' 'interactive ConPTY inside the non-admin write-restricted token: tty+resize+ctrl-c+jobcontrol+unicode all pass' "verdict=$s2Verdict launch=$s2LaunchPath" ($s2Verdict -eq 'pass') $s2sub
      } catch {
        Add-Check 'fallback.s2Pty.inContainer' 'S2 PTY receipt parseable' $_.Exception.Message $false $null
      }
    } else {
      Add-Check 'fallback.s2Pty.inContainer' 'S2 PTY receipt produced' 'no s2-pty.receipt.json' $false @{ launchErr = $errS2 }
    }
  } catch {
    Add-Check 'fallback.orchestration' 'fallback orchestration completed without an unhandled error' $_.Exception.Message $false $null
  } finally {
    foreach ($u in $createdUsers) { try { Remove-LocalUser -Name $u -ErrorAction SilentlyContinue } catch {} }
  }
}

# ---- Informational: isolationSession.available (do NOT gate), D14 + arch identity. ----
$isoAvail = 'not-observed'
try {
  $pr = Join-Path $drop 'probe.receipt.json'
  if (Test-Path -LiteralPath $pr) {
    $prj = Get-Content -LiteralPath $pr -Raw | ConvertFrom-Json
    $hit = $prj.checks | Where-Object { $_.id -match 'isolationSession' } | Select-Object -First 1
    if ($hit) { $isoAvail = "$($hit.observed)" }
    elseif ($prj.PSObject.Properties.Name -contains 'probes') { $isoAvail = "$($prj.probes.isolationSessionAvailable)" }
  }
} catch {}

$archRaw = $env:PROCESSOR_ARCHITECTURE
$arch = switch -Wildcard ($archRaw) { 'ARM64' { 'arm64' } 'AMD64' { 'x64' } default { "$archRaw".ToLowerInvariant() } }
$build = $null
try { $build = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' | Select-Object ProductName, EditionID, CurrentBuild, UBR, DisplayVersion) } catch {}

$shellIdentity = @{ kind = $shellKind; path = $shellPath }
try { if ($shellPath) { $shellIdentity.sha256 = (Get-FileHash -LiteralPath $shellPath -Algorithm SHA256).Hash.ToLowerInvariant() } } catch {}

$orchSid = $null
try { $orchSid = $wi.User.Value } catch {}

$required = $checks | Where-Object { $_.id -ne 'fallback.mode' -and $_.id -ne 'fallback.concurrency' }
$allPass = ($required.Count -gt 0) -and -not ($required | Where-Object { $_.verdict -ne 'pass' })
$verdict = if ($allPass) { 'pass' } else { 'fail' }

$receipt = [ordered]@{
  kind = 'capability-sid-fallback'
  model = 'Ratified Codex-elevated restricted-token fallback: random S-1-5-21 capability SID per session (cap.rs:39-46) as the RESTRICTING SID of a WRITE_RESTRICTED token (token.rs:500-501, flags DISABLE_MAX_PRIVILEGE|LUA_TOKEN|WRITE_RESTRICTED=0x0D); ALLOW-write ACEs for the cap SID on the admitted roots and deny-read ACEs (acl.rs:1014) on the never-grantable set; sandbox user(s) provisioned once with elevation, workload runs non-elevated. The broken AppContainer capability-SID-as-restricting-SID model (ERROR_INVALID_SID) is documented as the rejected alternative in this file header.'
  tokenFlags = $FLAGS_HEX
  tokenFlagsCitation = 'codex-rs/windows-sandbox-rs/src/token.rs:500 (DISABLE_MAX_PRIVILEGE|LUA_TOKEN|WRITE_RESTRICTED); CreateRestrictedToken at token.rs:501'
  mode = $mode
  s2Pty = $s2Verdict
  identity = [ordered]@{
    lane = 'spike-w2-win-mxc'
    elevatedOrchestrator = $elevated
    orchestratorUser = $whoami
    os = [ordered]@{ arch = $arch; archRaw = $archRaw; build = $build; userSid = $orchSid }
    d14ShellIdentity = $shellIdentity
    mxc = [ordered]@{ isolationSessionAvailable = $isoAvail }
    source = [ordered]@{ sha = $env:GITHUB_SHA; ref = $env:GITHUB_REF; run = $env:GITHUB_RUN_ID }
  }
  conclusion = "mode=$mode arch=$arch; write isolation by random S-1-5-21 cap SID + cross-session read denial (elevated) + S2 in-container PTY ($s2Verdict). isolationSession.available=$isoAvail (informational, not gated)."
  checks = $checks
  verdict = $verdict
}
$receipt | ConvertTo-Json -Depth 9 | Set-Content -LiteralPath $out
Write-Host "[mxc:fallback] $verdict (mode=$mode) -> $out"
if ($verdict -ne 'pass') { exit 1 }
