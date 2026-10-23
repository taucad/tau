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
# Informational evidence: recorded with verdict 'info', never gated and never counted as a pass.
function Add-Info($id, $expect, $observed, $detail) {
  [void]$checks.Add([ordered]@{ id = $id; expect = $expect; observed = "$observed"; verdict = 'info'; detail = $detail })
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
  [StructLayout(LayoutKind.Sequential)] struct SECURITY_ATTRIBUTES { public int nLength; public IntPtr lpSecurityDescriptor; public int bInheritHandle; }
  [StructLayout(LayoutKind.Sequential, Pack=4)] struct TOKEN_PRIVILEGES1 { public int Count; public long Luid; public int Attr; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct PROFILEINFO {
    public int dwSize; public int dwFlags; public string lpUserName; public string lpProfilePath; public string lpDefaultPath;
    public string lpServerName; public string lpPolicyPath; public IntPtr hProfile;
  }

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
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr h);
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr GetProcessWindowStation();
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr h, int index, StringBuilder buf, int len, out int needed);
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern IntPtr OpenWindowStation(string name, bool inherit, uint access);
  [DllImport("user32.dll", SetLastError=true)] static extern bool CloseWindowStation(IntPtr h);
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern IntPtr CreateDesktop(string name, IntPtr device, IntPtr devmode, uint flags, uint access, ref SECURITY_ATTRIBUTES sa);
  [DllImport("user32.dll", SetLastError=true)] static extern bool CloseDesktop(IntPtr h);
  [DllImport("user32.dll", SetLastError=true)] static extern bool GetUserObjectSecurity(IntPtr h, ref uint si, byte[] sd, uint len, out uint needed);
  [DllImport("user32.dll", SetLastError=true)] static extern bool SetUserObjectSecurity(IntPtr h, ref uint si, byte[] sd);
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string sddl, uint revision, out IntPtr sd, IntPtr size);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool GetSecurityDescriptorDacl(IntPtr sd, out bool present, out IntPtr dacl, out bool defaulted);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool SetTokenInformation(IntPtr tok, int cls, ref IntPtr info, int len);
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool LookupPrivilegeValue(string sys, string name, out long luid);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool AdjustTokenPrivileges(IntPtr tok, bool disableAll, ref TOKEN_PRIVILEGES1 np, int len, IntPtr prev, IntPtr retLen);
  [DllImport("userenv.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool LoadUserProfile(IntPtr tok, ref PROFILEINFO pi);
  [DllImport("userenv.dll", SetLastError=true)] static extern bool CreateEnvironmentBlock(out IntPtr env, IntPtr tok, bool inherit);
  [DllImport("userenv.dll", SetLastError=true)] static extern bool DestroyEnvironmentBlock(IntPtr env);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr h, uint code);

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

  // Diagnostic of the last Restrict(): which logon SID was used and whether the default DACL was set.
  public static string LastRestrictNote = "";
  // Diagnostic of the last LaunchAsUser(): profile load + per-user environment block.
  public static string LastLaunchNote = "";

  public static string GetLogonSid() {
    IntPtr tok;
    if (!OpenProcessToken(GetCurrentProcess(), 0x8, out tok)) return null; // TOKEN_QUERY
    try { return LogonSidOf(tok); } finally { CloseHandle(tok); }
  }

  // The SE_GROUP_LOGON_ID SID of an arbitrary token (needs TOKEN_QUERY on it).
  static string LogonSidOf(IntPtr tok) {
    {
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
    }
  }

  // token.rs:56-110 set_default_dacl: objects the restricted process creates (its own process/thread
  // handles, sections, IPC) get a default DACL of the logon SID GENERIC_ALL + OWNER RIGHTS READ_CONTROL.
  // The logon SID is BOTH a normal group and a restricting SID, so the WRITE_RESTRICTED child can open
  // its own objects for write; without it the loader fails with 0xC0000142.
  static void SetDefaultDacl(IntPtr tok, string logonSid) {
    IntPtr sd;
    if (!ConvertStringSecurityDescriptorToSecurityDescriptor("D:(A;;GA;;;" + logonSid + ")(A;;RC;;;S-1-3-4)", 1, out sd, IntPtr.Zero))
      throw new Exception("default DACL SDDL failed err=" + Marshal.GetLastWin32Error());
    try {
      bool present; bool defaulted; IntPtr dacl;
      if (!GetSecurityDescriptorDacl(sd, out present, out dacl, out defaulted) || !present) throw new Exception("GetSecurityDescriptorDacl failed err=" + Marshal.GetLastWin32Error());
      if (!SetTokenInformation(tok, 6 /* TokenDefaultDacl */, ref dacl, IntPtr.Size)) throw new Exception("SetTokenInformation(TokenDefaultDacl) failed err=" + Marshal.GetLastWin32Error());
    } finally { LocalFree(sd); }
  }

  // token.rs:519 enable_single_privilege(new_token, "SeChangeNotifyPrivilege").
  static bool EnableChangeNotify(IntPtr tok) { return EnablePrivilege(tok, "SeChangeNotifyPrivilege"); }

  static bool EnablePrivilege(IntPtr tok, string name) {
    long luid; if (!LookupPrivilegeValue(null, name, out luid)) return false;
    TOKEN_PRIVILEGES1 tp; tp.Count = 1; tp.Luid = luid; tp.Attr = 2; // SE_PRIVILEGE_ENABLED
    return AdjustTokenPrivileges(tok, false, ref tp, Marshal.SizeOf(typeof(TOKEN_PRIVILEGES1)), IntPtr.Zero, IntPtr.Zero) && Marshal.GetLastWin32Error() == 0;
  }

  // Load the sandbox account profile (LoadUserProfile needs SeBackup + SeRestore enabled on the
  // ADMIN orchestrator token, the provisioning phase) so the workload gets its own profile + env.
  static string LoadProfile(IntPtr logonTok, string user) {
    IntPtr self; string privs = "";
    if (OpenProcessToken(GetCurrentProcess(), 0x20 | 0x8 /* ADJUST_PRIVILEGES|QUERY */, out self)) {
      try { privs = "backup=" + EnablePrivilege(self, "SeBackupPrivilege") + " restore=" + EnablePrivilege(self, "SeRestorePrivilege"); }
      finally { CloseHandle(self); }
    }
    PROFILEINFO pi = new PROFILEINFO(); pi.dwSize = Marshal.SizeOf(typeof(PROFILEINFO)); pi.dwFlags = 1 /* PI_NOUI */; pi.lpUserName = user;
    bool ok = LoadUserProfile(logonTok, ref pi);
    return "profile=" + ok + (ok ? "" : "(err=" + Marshal.GetLastWin32Error() + ")") + " " + privs;
  }

  public static void Kill(IntPtr h) { if (h != IntPtr.Zero) TerminateProcess(h, 0xDEAD); }

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

  // The logon SID comes from the BASE token itself (token.rs psid_logon), so a LogonUser token for a
  // sandbox account uses its own logon session SID, not the orchestrator's.
  static IntPtr Restrict(IntPtr baseTok, string capSid, string logonSid) {
    string own = LogonSidOf(baseTok);
    string logon = string.IsNullOrEmpty(own) ? logonSid : own;
    uint c; IntPtr arr = BuildRestricting(capSid, logon, out c);
    IntPtr nt;
    if (!CreateRestrictedToken(baseTok, FLAGS, 0, IntPtr.Zero, 0, IntPtr.Zero, c, arr, out nt))
      throw new Exception("CreateRestrictedToken failed err=" + Marshal.GetLastWin32Error());
    if (string.IsNullOrEmpty(logon)) { CloseHandle(nt); throw new Exception("no logon SID for the default DACL"); }
    try { SetDefaultDacl(nt, logon); } catch { CloseHandle(nt); throw; }
    bool cn = EnableChangeNotify(nt);
    LastRestrictNote = "logonSid=" + logon + " defaultDacl=ok changeNotify=" + cn;
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
    } catch (Exception e) { LastRestrictNote = "error: " + e.Message; return -99; }
  }

  // lpDesktop = "<winsta>\\<private desktop>" (Codex desktop.rs LaunchDesktop::startup_info_desktop). A
  // null desktop inherits the parent desktop, whose DACL does not admit the write-restricted token, and
  // the child dies in user32 init with 0xC0000142 (observed on both hosted runners).
  static STARTUPINFO NewSi(string desktop) { STARTUPINFO si = new STARTUPINFO(); si.cb = Marshal.SizeOf(typeof(STARTUPINFO)); si.Desktop = desktop; return si; }

  // ---- Window station + private desktop (Codex windows-sandbox-rs/src/desktop.rs) ----
  public static string ProcessWinstaName() {
    IntPtr h = GetProcessWindowStation(); StringBuilder sb = new StringBuilder(256); int n;
    if (!GetUserObjectInformation(h, 2 /* UOI_NAME */, sb, 512, out n)) return null;
    return sb.ToString();
  }
  public static IntPtr OpenWinstaForDacl(string name, out int err) {
    err = 0; IntPtr h = OpenWindowStation(name, false, 0x00020000u | 0x00040000u); // READ_CONTROL | WRITE_DAC
    if (h == IntPtr.Zero) err = Marshal.GetLastWin32Error();
    return h;
  }
  public static void CloseWinsta(IntPtr h) { if (h != IntPtr.Zero) CloseWindowStation(h); }
  public static byte[] GetDacl(IntPtr h, out int err) {
    err = 0; uint si = 4; uint need; // DACL_SECURITY_INFORMATION
    GetUserObjectSecurity(h, ref si, null, 0, out need);
    if (need == 0) { err = Marshal.GetLastWin32Error(); return null; }
    byte[] b = new byte[need];
    if (!GetUserObjectSecurity(h, ref si, b, need, out need)) { err = Marshal.GetLastWin32Error(); return null; }
    return b;
  }
  public static int SetDacl(IntPtr h, byte[] sd) { uint si = 4; return SetUserObjectSecurity(h, ref si, sd) ? 0 : Marshal.GetLastWin32Error(); }
  // CreateDesktopW on the caller's window station with an explicit protected DACL (desktop.rs:290-326).
  public static IntPtr CreatePrivateDesktop(string name, string sddl, out int err) {
    err = 0; IntPtr sd;
    if (!ConvertStringSecurityDescriptorToSecurityDescriptor(sddl, 1, out sd, IntPtr.Zero)) { err = -Marshal.GetLastWin32Error(); return IntPtr.Zero; }
    try {
      SECURITY_ATTRIBUTES sa = new SECURITY_ATTRIBUTES(); sa.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES)); sa.lpSecurityDescriptor = sd; sa.bInheritHandle = 0;
      IntPtr h = CreateDesktop(name, IntPtr.Zero, IntPtr.Zero, 0, 0x1F01FFu /* DESKTOP_ALL_ACCESS */, ref sa);
      if (h == IntPtr.Zero) err = Marshal.GetLastWin32Error();
      return h;
    } finally { LocalFree(sd); }
  }
  public static int ClosePrivateDesktop(IntPtr h) { if (h == IntPtr.Zero) return 0; return CloseDesktop(h) ? 0 : Marshal.GetLastWin32Error(); }

  // Launch a write-restricted child from the caller OWN token (restricted-of-caller: no privilege
  // required, works non-elevated). The LUA_TOKEN flag filters it to a non-elevated token.
  public static IntPtr LaunchSelf(string app, string cmdline, string capSid, string logonSid, string cwd, string desktop, out int err) {
    err = 0; IntPtr nt = Restrict(SelfToken(), capSid, logonSid);
    STARTUPINFO si = NewSi(desktop); PROCESS_INFORMATION pi;
    bool ok = CreateProcessAsUser(nt, app, new StringBuilder(cmdline), IntPtr.Zero, IntPtr.Zero, false, CREATE_NO_WINDOW, IntPtr.Zero, cwd, ref si, out pi);
    if (!ok) { err = Marshal.GetLastWin32Error(); CloseHandle(nt); return IntPtr.Zero; }
    CloseHandle(pi.hThread); CloseHandle(nt); return pi.hProcess;
  }

  // Launch a write-restricted child AS the given non-admin user (elevated orchestrator path; needs
  // SeImpersonatePrivilege, held by the admin-phase runner). The child is the non-admin sandbox user.
  public static IntPtr LaunchAsUser(string user, SecureString pw, string app, string cmdline, string capSid, string logonSid, string cwd, string desktop, out int err) {
    err = 0; IntPtr pwPtr = Marshal.SecureStringToGlobalAllocUnicode(pw); IntPtr logonTok;
    bool lok;
    try { lok = LogonUser(user, ".", pwPtr, LOGON_INTERACTIVE, PROVIDER_DEFAULT, out logonTok); }
    finally { Marshal.ZeroFreeGlobalAllocUnicode(pwPtr); }
    if (!lok) { err = -Marshal.GetLastWin32Error(); return IntPtr.Zero; }
    try {
      string prof = LoadProfile(logonTok, user);
      IntPtr env; bool envOk = CreateEnvironmentBlock(out env, logonTok, false);
      IntPtr nt = Restrict(logonTok, capSid, logonSid);
      STARTUPINFO si = NewSi(desktop); PROCESS_INFORMATION pi;
      bool ok = CreateProcessWithTokenW(nt, 0, app, new StringBuilder(cmdline), CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT, envOk ? env : IntPtr.Zero, cwd, ref si, out pi);
      if (!ok) err = Marshal.GetLastWin32Error();
      if (envOk) DestroyEnvironmentBlock(env);
      LastLaunchNote = prof + " userEnv=" + envOk + " " + LastRestrictNote;
      if (!ok) { CloseHandle(nt); return IntPtr.Zero; }
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
  $rnote = [TauRestrict]::LastRestrictNote
  Add-Check 'fallback.token.defaultDacl' 'the restricted token default DACL is the logon SID GENERIC_ALL + OWNER RIGHTS READ_CONTROL and SeChangeNotifyPrivilege is enabled (token.rs:56-110, 518-519)' $rnote ($rnote -like '*defaultDacl=ok*') $null
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
# Sandbox-user children (run 40023733988: profile + env block loaded, yet pwsh never reached its first
# statement). A WRITE_RESTRICTED token cannot write the sandbox user's own profile (its DACL names the
# user SID, not a restricting SID), and pwsh init writes there (module analysis cache, telemetry id).
# A cmd.exe prelude first drops a breadcrumb (separates "process started" from "pwsh init stalled"),
# then points every per-user write location at the session's writable scratch dir before pwsh starts.
$cmdExe = Join-Path $env:SystemRoot 'System32\cmd.exe'
function Build-UserChildCmd([string]$shell, [string]$payload, [string]$scratch, [string]$crumb) {
  $pre = "echo STARTED>`"$crumb`"&& set `"LOCALAPPDATA=$scratch`"&& set `"APPDATA=$scratch`"&& set `"USERPROFILE=$scratch`"&& set `"TEMP=$scratch`"&& set `"TMP=$scratch`"&& set `"PSModuleAnalysisCachePath=$scratch\pmac.clixml`"&& set POWERSHELL_TELEMETRY_OPTOUT=1&& set POWERSHELL_UPDATECHECK=Off&& "
  '"' + $cmdExe + '" /d /s /c "' + $pre + (Build-ChildCmd $shell $payload) + '"'
}

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
$childShell = $null
$writeProven = $false
$readProven = $false

# ---- Per-session window-station + private-desktop grants (Codex windows-sandbox-rs/src/desktop.rs) ----
# The write-restricted child needs a desktop whose DACL admits BOTH halves of the access check: the
# normal check (the token's user SID) and the restricted check (one of its restricting SIDs: the
# session cap SID). Codex creates a private desktop per launch (PrivateDesktop::create, desktop.rs:362)
# with DESKTOP_ALL_ACCESS for the owner and DESKTOP_PARTICIPANT_ACCESS (= ALL minus WRITE_DAC,
# WRITE_OWNER, DELETE; desktop.rs:83-84) for the sandbox principal (desktop.rs:290-292). We do the same
# per session, adding the session cap SID as a participant. The window station gets one ACE per
# session SID with WINSTA_ALL_ACCESS minus WINSTA_CREATEDESKTOP (0x377), and the original window-
# station DACL is restored byte-for-byte at teardown; the receipt records both grant and revocation.
$DESKTOP_ALL = 0x1F01FF
$DESKTOP_PARTICIPANT = 0x0201FF
$WINSTA_SESSION_MASK = 0x377
$winstaName = $null; $winstaH = [IntPtr]::Zero; $winstaOrig = $null; $winstaOrigSddl = $null
$winstaGranted = New-Object System.Collections.ArrayList
$desktops = New-Object System.Collections.ArrayList

function Get-SddlOf([byte[]]$b) { (New-Object System.Security.AccessControl.RawSecurityDescriptor($b, 0)).GetSddlForm('Access') }

function Grant-WinstaSession([string]$session, [string[]]$sids) {
  if ($script:winstaH -eq [IntPtr]::Zero) { return "no-winsta-handle" }
  $e = 0
  $b = [TauRestrict]::GetDacl($script:winstaH, [ref]$e)
  if ($null -eq $b) { return "GetDacl err=$e" }
  $raw = New-Object System.Security.AccessControl.RawSecurityDescriptor($b, 0)
  foreach ($sid in $sids) {
    $ace = New-Object System.Security.AccessControl.CommonAce([System.Security.AccessControl.AceFlags]::None, [System.Security.AccessControl.AceQualifier]::AccessAllowed, $WINSTA_SESSION_MASK, (New-Object System.Security.Principal.SecurityIdentifier($sid)), $false, $null)
    $raw.DiscretionaryAcl.InsertAce($raw.DiscretionaryAcl.Count, $ace)
  }
  $nb = New-Object byte[] $raw.BinaryLength
  $raw.GetBinaryForm($nb, 0)
  $rc = [TauRestrict]::SetDacl($script:winstaH, $nb)
  [void]$script:winstaGranted.Add([ordered]@{ session = $session; sids = $sids; mask = ('0x{0:X}' -f $WINSTA_SESSION_MASK); setDacl = $rc })
  "ok rc=$rc"
}

function New-SessionDesktop([string]$session, [string[]]$participants) {
  $name = 'TauSandboxDesktop-' + [System.Guid]::NewGuid().ToString('N')
  $sddl = 'D:P(A;;0x{0:X};;;{1})' -f $DESKTOP_ALL, $script:acctSidForDesk
  foreach ($p in $participants) { $sddl += '(A;;0x{0:X};;;{1})' -f $DESKTOP_PARTICIPANT, $p }
  $e = 0
  $h = [TauRestrict]::CreatePrivateDesktop($name, $sddl, [ref]$e)
  $startup = if ($h -ne [IntPtr]::Zero) { "$($script:winstaName)\$name" } else { $null }
  [void]$script:desktops.Add([ordered]@{ session = $session; name = $name; handle = $h; startup = $startup; sddl = $sddl; createErr = $e; closeErr = $null })
  $startup
}

if ($apiOk -and $null -ne $shellPath) {
  try {
    $acctSid = $wi.User.Value
    $script:acctSidForDesk = $acctSid
    $script:winstaName = [TauRestrict]::ProcessWinstaName()
    $we = 0
    $script:winstaH = [TauRestrict]::OpenWinstaForDacl($script:winstaName, [ref]$we)
    if ($script:winstaH -ne [IntPtr]::Zero) {
      $script:winstaOrig = [TauRestrict]::GetDacl($script:winstaH, [ref]$we)
      if ($script:winstaOrig) { $script:winstaOrigSddl = Get-SddlOf $script:winstaOrig }
    }
    Add-Check 'fallback.winsta.opened' 'the process window station is opened for READ_CONTROL|WRITE_DAC and its original DACL is snapshotted for restore' "winsta=$($script:winstaName) handle=$($script:winstaH -ne [IntPtr]::Zero) err=$we" (($script:winstaH -ne [IntPtr]::Zero) -and ($null -ne $script:winstaOrig)) @{ winsta = $script:winstaName; originalSddl = $script:winstaOrigSddl }

    # ================= (A) WRITE ISOLATION purely by the random cap SID =================
    # Two concurrent sessions run as the SAME account, differing ONLY by the write-restricting cap SID.
    # wiRoot1 grants the account + cap1 write; wiRoot2 grants the account + cap2 write; NO Everyone.
    $wi1 = New-Dir (Join-Path $drop 'wi-root-1')
    $wi2 = New-Dir (Join-Path $drop 'wi-root-2')
    $tmp1 = New-SessionTemp 'sess-temp-1'
    $tmp2 = New-SessionTemp 'sess-temp-2'

    # Provision the non-admin sandbox accounts up-front (elevated mode): used for the in-child
    # cross-session READ-denial sessions and as the S2 PTY workload identity.
    if ($mode -eq 'elevated') {
      . (Join-Path $PSScriptRoot 'provision-sandbox-users.ps1')
      $sandboxA = New-TauSandboxUser -Name 'tausbxa'
      $sandboxB = New-TauSandboxUser -Name 'tausbxb'
      $createdUsers = @($sandboxA.Name, $sandboxB.Name)
      Add-Check 'fallback.sandbox.provisioned' 'two non-admin sandbox users provisioned with elevation (admin phase); workload runs as them, never elevated' "A=$($sandboxA.Name)/$($sandboxA.Sid) B=$($sandboxB.Name)/$($sandboxB.Sid)" (($sandboxA.IsAdministrator -eq $false) -and ($sandboxB.IsAdministrator -eq $false)) @{ a = $sandboxA.Sid; b = $sandboxB.Sid }
    }
    # WRITE ISOLATION: both concurrent children run under the orchestrator OWN token restricted-of-
    # caller (LUA-filtered, NON-elevated). They differ ONLY by their random S-1-5-21 write-restricting
    # cap SID, so write isolation is attributable to the cap SID alone. Each root grants the SAME
    # account plus only its OWN cap SID write; NO Everyone/Users write.
    Set-ExplicitAcl $wi1 @(@{ Sid = $ADMINS; Rights = 'FullControl'; Type = 'Allow' }, @{ Sid = $acctSid; Rights = 'Modify'; Type = 'Allow' }, @{ Sid = $cap1; Rights = 'Modify'; Type = 'Allow' })
    Set-ExplicitAcl $wi2 @(@{ Sid = $ADMINS; Rights = 'FullControl'; Type = 'Allow' }, @{ Sid = $acctSid; Rights = 'Modify'; Type = 'Allow' }, @{ Sid = $cap2; Rights = 'Modify'; Type = 'Allow' })

    # Per-session grants: window-station ACE (host account + session cap SID) and a private desktop.
    $gA = Grant-WinstaSession 'write-A' @($acctSid, $cap1)
    $gB = Grant-WinstaSession 'write-B' @($cap2)
    $deskA = New-SessionDesktop 'write-A' @($cap1)
    $deskB = New-SessionDesktop 'write-B' @($cap2)
    Add-Check 'fallback.desktop.write' 'per-session private desktops created and window-station ACEs granted for the write sessions (desktop.rs:290-326)' "deskA=$deskA deskB=$deskB winstaA=$gA winstaB=$gB" (($null -ne $deskA) -and ($null -ne $deskB) -and ($gA -like 'ok rc=0') -and ($gB -like 'ok rc=0')) $null

    $payloadA = "`$env:TEMP='$tmp1'; `$env:TMP='$tmp1'; & '$canaryChild' -SessionId A -OwnRoot '$wi1' -OtherRoot '$wi2'"
    $payloadB = "`$env:TEMP='$tmp2'; `$env:TMP='$tmp2'; & '$canaryChild' -SessionId B -OwnRoot '$wi2' -OtherRoot '$wi1'"

    function Start-WritePair([string]$shell) {
      $script:errA = 0; $script:errB = 0
      $script:hA = [TauRestrict]::LaunchSelf($shell, (Build-ChildCmd $shell $payloadA), $cap1, $logonSid, $env:SystemRoot, $deskA, [ref]$script:errA)
      $script:hB = [TauRestrict]::LaunchSelf($shell, (Build-ChildCmd $shell $payloadB), $cap2, $logonSid, $env:SystemRoot, $deskB, [ref]$script:errB)
      $script:launched = ($script:hA -ne [IntPtr]::Zero) -and ($script:hB -ne [IntPtr]::Zero)
      $script:exitA = $null; $script:exitB = $null
      if ($script:hA -ne [IntPtr]::Zero) { $script:exitA = [TauRestrict]::Wait($script:hA, 90000); [TauRestrict]::Close($script:hA) }
      if ($script:hB -ne [IntPtr]::Zero) { $script:exitB = [TauRestrict]::Wait($script:hB, 90000); [TauRestrict]::Close($script:hB) }
    }
    Start-WritePair $shellPath
    Add-Check 'fallback.concurrency' 'two sessions launched CONCURRENTLY under write-restricted tokens before either is awaited' "launchedA=$($hA -ne [IntPtr]::Zero)(err=$errA) launchedB=$($hB -ne [IntPtr]::Zero)(err=$errB)" $launched @{ errA = $errA; errB = $errB }
    $childShell = $shellPath
    # If the first shell still dies in loader init (0xC0000142), retry ONCE under the D14 fallback
    # branch, Windows PowerShell 5.1 (fixed path); the receipt never hides the first attempt.
    $firstExit = "exitA=$exitA exitB=$exitB shell=$shellKind"
    if ((($exitA -eq -1073741502) -or ($exitB -eq -1073741502)) -and ($shellPath -ne $ps51) -and (Test-Path -LiteralPath $ps51)) {
      $childShell = $ps51
      Start-WritePair $ps51
    }
    $ranA = ($exitA -eq 0); $ranB = ($exitB -eq 0)
    Add-Check 'fallback.children.exit' 'write-isolation children ran to completion (exit codes recorded; -1073741502 = 0xC0000142 DLL init failure)' "exitA=$exitA exitB=$exitB childShell=$childShell (first attempt: $firstExit)" ($ranA -and $ranB) @{ exitA = $exitA; exitB = $exitB; childShell = $childShell; firstAttempt = $firstExit }

    # External observation decides each claim. A denial counts ONLY when the same child ran to
    # completion AND passed its own positive control (own-root write) in this run; otherwise it is
    # recorded as NOT EXERCISED and fails, never a vacuous pass.
    $ownA = Test-Path -LiteralPath (Join-Path $wi1 'canary-from-A.txt')
    $crossA = Test-Path -LiteralPath (Join-Path $wi2 'canary-from-A.txt')
    $ownB = Test-Path -LiteralPath (Join-Path $wi2 'canary-from-B.txt')
    $crossB = Test-Path -LiteralPath (Join-Path $wi1 'canary-from-B.txt')
    $repA = $null; $repB = $null
    try { $repA = Get-Content -LiteralPath (Join-Path $wi1 'child-report-A.json') -Raw | ConvertFrom-Json } catch {}
    try { $repB = Get-Content -LiteralPath (Join-Path $wi2 'child-report-B.json') -Raw | ConvertFrom-Json } catch {}
    $exA = $ranA -and $ownA; $exB = $ranB -and $ownB
    Add-Check 'fallback.write.ownAllowed.A' 'session A child (running in its restricted token) writes its own root (positive control)' "ran=$ranA wi1/canary-from-A.txt exists=$ownA" $exA @{ childReport = $repA }
    Add-Check 'fallback.write.ownAllowed.B' 'session B child (running in its restricted token) writes its own root (positive control)' "ran=$ranB wi2/canary-from-B.txt exists=$ownB" $exB @{ childReport = $repB }
    Add-Check 'fallback.write.crossDenied.AtoB' 'the running session A child attempts to write session B root and is refused (external canary absent; exercised only with A positive control)' $(if ($exA) { "exercised; wi2/canary-from-A.txt exists=$crossA; child says $($repA.crossWrite)" } else { 'NOT EXERCISED (child did not run or failed its positive control)' }) ($exA -and -not $crossA) @{ exercised = $exA }
    Add-Check 'fallback.write.crossDenied.BtoA' 'the running session B child attempts to write session A root and is refused (external canary absent; exercised only with B positive control)' $(if ($exB) { "exercised; wi1/canary-from-B.txt exists=$crossB; child says $($repB.crossWrite)" } else { 'NOT EXERCISED (child did not run or failed its positive control)' }) ($exB -and -not $crossB) @{ exercised = $exB }
    $writeProven = $exA -and $exB -and -not $crossA -and -not $crossB

    # ================= (B) CROSS-SESSION READ DENIAL, in-child (elevated: distinct sandbox accounts) ===
    if ($mode -eq 'elevated') {
      $rdA = New-Dir (Join-Path $drop 'rd-root-a')
      $rdB = New-Dir (Join-Path $drop 'rd-root-b')
      $never = New-Dir (Join-Path $drop 'never-grantable')
      # acl.rs model: per-session read grant on own root; DENY-READ ACEs (add_deny_read_ace) on the
      # other session root and on the never-grantable set. DACLs are locked BEFORE the secrets exist.
      Set-ExplicitAcl $rdA @(@{ Sid = $ADMINS; Rights = 'FullControl'; Type = 'Allow' }, @{ Sid = $sandboxA.Sid; Rights = 'ReadAndExecute'; Type = 'Allow' }, @{ Sid = $sandboxB.Sid; Rights = 'Read'; Type = 'Deny' })
      Set-ExplicitAcl $rdB @(@{ Sid = $ADMINS; Rights = 'FullControl'; Type = 'Allow' }, @{ Sid = $sandboxB.Sid; Rights = 'ReadAndExecute'; Type = 'Allow' }, @{ Sid = $sandboxA.Sid; Rights = 'Read'; Type = 'Deny' })
      Set-ExplicitAcl $never @(@{ Sid = $ADMINS; Rights = 'FullControl'; Type = 'Allow' }, @{ Sid = $sandboxA.Sid; Rights = 'Read'; Type = 'Deny' }, @{ Sid = $sandboxB.Sid; Rights = 'Read'; Type = 'Deny' })
      $secretA = 'SECRET-A-' + [System.Guid]::NewGuid().ToString('N')
      $secretB = 'SECRET-B-' + [System.Guid]::NewGuid().ToString('N')
      $secretN = 'SECRET-N-' + [System.Guid]::NewGuid().ToString('N')
      $fA = Join-Path $rdA 'secret.txt'; $fB = Join-Path $rdB 'secret.txt'; $fN = Join-Path $never 'secret.txt'
      Set-Content -LiteralPath $fA -Value $secretA -NoNewline
      Set-Content -LiteralPath $fB -Value $secretB -NoNewline
      Set-Content -LiteralPath $fN -Value $secretN -NoNewline

      # Per-session out dirs: writable only by that session sandbox user AND its cap SID (both halves of
      # the WRITE_RESTRICTED check), so each child can record what it read and nothing else can.
      $outA = New-Dir (Join-Path $drop 'rd-out-a')
      $outB = New-Dir (Join-Path $drop 'rd-out-b')
      Set-ExplicitAcl $outA @(@{ Sid = $ADMINS; Rights = 'FullControl'; Type = 'Allow' }, @{ Sid = $sandboxA.Sid; Rights = 'Modify'; Type = 'Allow' }, @{ Sid = $cap1; Rights = 'Modify'; Type = 'Allow' })
      Set-ExplicitAcl $outB @(@{ Sid = $ADMINS; Rights = 'FullControl'; Type = 'Allow' }, @{ Sid = $sandboxB.Sid; Rights = 'Modify'; Type = 'Allow' }, @{ Sid = $cap2; Rights = 'Modify'; Type = 'Allow' })

      $gRA = Grant-WinstaSession 'read-A' @($sandboxA.Sid, $cap1)
      $gRB = Grant-WinstaSession 'read-B' @($sandboxB.Sid, $cap2)
      $deskRA = New-SessionDesktop 'read-A' @($sandboxA.Sid, $cap1)
      $deskRB = New-SessionDesktop 'read-B' @($sandboxB.Sid, $cap2)
      Add-Check 'fallback.desktop.read' 'per-session private desktops + window-station ACEs for the read sessions (sandbox user SID + cap SID participants)' "deskRA=$deskRA deskRB=$deskRB winstaA=$gRA winstaB=$gRB" (($null -ne $deskRA) -and ($null -ne $deskRB) -and ($gRA -like 'ok rc=0') -and ($gRB -like 'ok rc=0')) $null

      # Breadcrumb first: distinguishes "child never started" from "child started and stalled".
      $payloadRA = "Set-Content -LiteralPath '$outA\started-A.txt' -Value STARTED; `$env:TEMP='$outA'; `$env:TMP='$outA'; & '$canaryChild' -SessionId A -OwnSecret '$fA' -OtherSecret '$fB' -NeverSecret '$fN' -OutDir '$outA'"
      $payloadRB = "Set-Content -LiteralPath '$outB\started-B.txt' -Value STARTED; `$env:TEMP='$outB'; `$env:TMP='$outB'; & '$canaryChild' -SessionId B -OwnSecret '$fB' -OtherSecret '$fA' -NeverSecret '$fN' -OutDir '$outB'"
      $eRA = 0; $eRB = 0
      $hRA = [TauRestrict]::LaunchAsUser($sandboxA.Name, $sandboxA.Secure, $cmdExe, (Build-UserChildCmd $childShell $payloadRA $outA "$outA\cmd-started-A.txt"), $cap1, $logonSid, $env:SystemRoot, $deskRA, [ref]$eRA)
      $noteRA = [TauRestrict]::LastLaunchNote
      $hRB = [TauRestrict]::LaunchAsUser($sandboxB.Name, $sandboxB.Secure, $cmdExe, (Build-UserChildCmd $childShell $payloadRB $outB "$outB\cmd-started-B.txt"), $cap2, $logonSid, $env:SystemRoot, $deskRB, [ref]$eRB)
      $noteRB = [TauRestrict]::LastLaunchNote
      $xRA = $null; $xRB = $null
      if ($hRA -ne [IntPtr]::Zero) { $xRA = [TauRestrict]::Wait($hRA, 120000); if ($xRA -eq -1) { [TauRestrict]::Kill($hRA) }; [TauRestrict]::Close($hRA) }
      if ($hRB -ne [IntPtr]::Zero) { $xRB = [TauRestrict]::Wait($hRB, 120000); if ($xRB -eq -1) { [TauRestrict]::Kill($hRB) }; [TauRestrict]::Close($hRB) }
      $rRA = ($xRA -eq 0); $rRB = ($xRB -eq 0)
      $startedRA = Test-Path -LiteralPath (Join-Path $outA 'started-A.txt'); $startedRB = Test-Path -LiteralPath (Join-Path $outB 'started-B.txt')
      $cmdRA = Test-Path -LiteralPath (Join-Path $outA 'cmd-started-A.txt'); $cmdRB = Test-Path -LiteralPath (Join-Path $outB 'cmd-started-B.txt')
      Add-Check 'fallback.read.children.exit' 'read-isolation children (each its own non-admin sandbox user, in its write-restricted token) ran to completion (-1 = timed out and killed)' "launchA=$($hRA -ne [IntPtr]::Zero)(err=$eRA) cmdStartedA=$cmdRA pwshStartedA=$startedRA exitA=$xRA launchB=$($hRB -ne [IntPtr]::Zero)(err=$eRB) cmdStartedB=$cmdRB pwshStartedB=$startedRB exitB=$xRB shell=$childShell" ($rRA -and $rRB) @{ launchA = $noteRA; launchB = $noteRB }

      $readOf = { param($f) if (Test-Path -LiteralPath $f) { [string](Get-Content -LiteralPath $f -Raw) } else { '' } }
      $ownRA = & $readOf (Join-Path $outA 'own-read-A.txt'); $ownRB = & $readOf (Join-Path $outB 'own-read-B.txt')
      $exfA = & $readOf (Join-Path $outA 'exfil-A.txt'); $exfB = & $readOf (Join-Path $outB 'exfil-B.txt')
      $nevA = & $readOf (Join-Path $outA 'exfil-never-A.txt'); $nevB = & $readOf (Join-Path $outB 'exfil-never-B.txt')
      $crA = $null; $crB = $null
      try { $crA = Get-Content -LiteralPath (Join-Path $outA 'child-report-A.json') -Raw | ConvertFrom-Json } catch {}
      try { $crB = Get-Content -LiteralPath (Join-Path $outB 'child-report-B.json') -Raw | ConvertFrom-Json } catch {}
      $pcA = $rRA -and ($ownRA -eq $secretA); $pcB = $rRB -and ($ownRB -eq $secretB)
      Add-Check 'fallback.read.ownAllowed.A' 'session A child (running as tausbxa in its restricted token) reads its own root secret (positive control; external copy matches)' "ran=$rRA ownCopyMatches=$($ownRA -eq $secretA)" $pcA @{ childReport = $crA }
      Add-Check 'fallback.read.ownAllowed.B' 'session B child (running as tausbxb in its restricted token) reads its own root secret (positive control; external copy matches)' "ran=$rRB ownCopyMatches=$($ownRB -eq $secretB)" $pcB @{ childReport = $crB }
      $leakAB = $exfA.Contains($secretB); $leakBA = $exfB.Contains($secretA)
      Add-Check 'fallback.read.crossDenied.AtoB' 'the running session A child attempts to read session B secret and is refused (B secret absent from A exfil; exercised only with A positive control)' $(if ($pcA) { "exercised; leak=$leakAB; child says $($crA.crossRead)" } else { 'NOT EXERCISED (child did not run or failed its positive control)' }) ($pcA -and -not $leakAB) @{ exercised = $pcA }
      Add-Check 'fallback.read.crossDenied.BtoA' 'the running session B child attempts to read session A secret and is refused (A secret absent from B exfil; exercised only with B positive control)' $(if ($pcB) { "exercised; leak=$leakBA; child says $($crB.crossRead)" } else { 'NOT EXERCISED (child did not run or failed its positive control)' }) ($pcB -and -not $leakBA) @{ exercised = $pcB }
      $leakN = $nevA.Contains($secretN) -or $nevB.Contains($secretN)
      Add-Check 'fallback.read.neverGrantable' 'both running children attempt the never-grantable set and are refused (deny-read ACE; acl.rs:1014; exercised only with both positive controls)' $(if ($pcA -and $pcB) { "exercised; leak=$leakN; A says $($crA.neverRead) B says $($crB.neverRead)" } else { 'NOT EXERCISED' }) ($pcA -and $pcB -and -not $leakN) $null
      $readProven = $pcA -and $pcB -and -not $leakAB -and -not $leakBA -and -not $leakN

      # Orchestrator impersonation against the same ACEs: INFORMATIONAL ONLY (not a running child).
      $iAO = [TauRestrict]::TryReadAs($sandboxA.Name, $sandboxA.Secure, $fA); $iAX = [TauRestrict]::TryReadAs($sandboxA.Name, $sandboxA.Secure, $fB)
      $iBO = [TauRestrict]::TryReadAs($sandboxB.Name, $sandboxB.Secure, $fB); $iBX = [TauRestrict]::TryReadAs($sandboxB.Name, $sandboxB.Secure, $fA)
      $iAN = [TauRestrict]::TryReadAs($sandboxA.Name, $sandboxA.Secure, $fN); $iBN = [TauRestrict]::TryReadAs($sandboxB.Name, $sandboxB.Secure, $fN)
      Add-Info 'fallback.read.impersonation' 'orchestrator impersonation of each sandbox user opening the secrets (0=allowed, 5=denied); informational, not gated, not a proof' "AOwn=$iAO ACross=$iAX BOwn=$iBO BCross=$iBX ANever=$iAN BNever=$iBN" $null
    } else {
      Add-Check 'fallback.read.requiresElevated' 'cross-session READ denial requires the elevated per-account sandbox backend (distinct sandbox logons + deny-read ACEs); WRITE_RESTRICTED gates writes only' "mode=$mode (non-elevated)" $false $null
    }

    # ================= (C) S2 interactive PTY IN-CONTAINER (as the non-admin sandbox user) =============
    $tmpS2 = New-SessionTemp 'sess-temp-s2'
    # The S2 child writes ONLY into this run's fresh session temp, and the result is published under
    # its own name: run-nonadmin.ps1 writes s2-pty.receipt.json for a plain non-admin user (no
    # restricted token), and that file must never be read as the in-token result.
    $s2Out = Join-Path $tmpS2 's2-pty.receipt.json'
    $s2Final = Join-Path $drop 'fallback-s2-pty.receipt.json'
    foreach ($f in @($s2Out, $s2Final)) { if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f -Force } }
    $payloadS2 = "Set-Content -LiteralPath '$tmpS2\started-s2.txt' -Value STARTED; `$env:TEMP='$tmpS2'; `$env:TMP='$tmpS2'; `$env:MXC_S2PTY_OUT='$s2Out'; `$env:GITHUB_SHA='$($env:GITHUB_SHA)'; `$env:GITHUB_RUN_ID='$($env:GITHUB_RUN_ID)'; & '$s2Child'"
    if (-not $childShell) { $childShell = $shellPath }
    $cmdS2 = Build-ChildCmd $childShell $payloadS2
    $errS2 = 0
    $s2LaunchPath = 'self'
    if ($mode -eq 'elevated') {
      $gS2 = Grant-WinstaSession 's2' @($sandboxA.Sid, $cap1)
      $deskS2 = New-SessionDesktop 's2' @($sandboxA.Sid, $cap1)
      Add-Check 'fallback.desktop.s2' 'per-session private desktop + window-station ACE for the S2 session' "desk=$deskS2 winsta=$gS2" (($null -ne $deskS2) -and ($gS2 -like 'ok rc=0')) $null
      $hS2 = [TauRestrict]::LaunchAsUser($sandboxA.Name, $sandboxA.Secure, $cmdExe, (Build-UserChildCmd $childShell $payloadS2 $tmpS2 "$tmpS2\cmd-started-s2.txt"), $cap1, $logonSid, $env:SystemRoot, $deskS2, [ref]$errS2)
      $noteS2 = [TauRestrict]::LastLaunchNote
      $s2LaunchPath = if ($hS2 -eq [IntPtr]::Zero) { "asUser-failed(err=$errS2)" } else { 'asSandboxUser' }
    } else {
      $deskS2 = New-SessionDesktop 's2' @($cap1)
      $hS2 = [TauRestrict]::LaunchSelf($childShell, $cmdS2, $cap1, $logonSid, $env:SystemRoot, $deskS2, [ref]$errS2)
    }
    if ($hS2 -ne [IntPtr]::Zero) {
      $exitS2 = [TauRestrict]::Wait($hS2, 180000); if ($exitS2 -eq -1) { [TauRestrict]::Kill($hS2) }; [TauRestrict]::Close($hS2)
      $startedS2 = Test-Path -LiteralPath (Join-Path $tmpS2 'started-s2.txt'); $cmdS2Started = Test-Path -LiteralPath (Join-Path $tmpS2 'cmd-started-s2.txt')
      Add-Check 'fallback.s2Pty.exit' 'S2 PTY child exit code recorded (-1 = timed out and killed; -1073741502 = 0xC0000142)' "exit=$exitS2 cmdStarted=$cmdS2Started pwshStarted=$startedS2 launch=$s2LaunchPath shell=$childShell" ($exitS2 -eq 0) @{ exit = $exitS2; launchPath = $s2LaunchPath; launchNote = $noteS2 }
    } else {
      Add-Check 'fallback.s2Pty.launch' 'S2 PTY child launched under the write-restricted sandbox token' "launch failed err=$errS2 path=$s2LaunchPath" $false $null
    }
    if (Test-Path -LiteralPath $s2Out) { try { Copy-Item -LiteralPath $s2Out -Destination $s2Final -Force } catch {} }
    if (Test-Path -LiteralPath $s2Final) {
      try {
        $s2r = Get-Content -LiteralPath $s2Final -Raw | ConvertFrom-Json
        $s2Verdict = "$($s2r.verdict)"
        $s2sub = @{}; foreach ($c in $s2r.checks) { $s2sub[$c.id] = $c.verdict }
        $s2sub['launchPath'] = $s2LaunchPath
        # Attribution: the receipt must come from THIS child, running as the expected sandbox identity.
        $s2User = "$(($s2r.checks | Where-Object { $_.id -eq 's2.workload.nonAdmin' } | Select-Object -First 1).observed)"
        $expectUser = if ($mode -eq 'elevated') { $sandboxA.Name } else { $env:USERNAME }
        $attributed = $s2User -like "*\$expectUser *"
        if (-not $attributed) { $s2Verdict = "unattributed($s2Verdict)" }
        Add-Check 'fallback.s2Pty.inContainer' 'interactive ConPTY inside the non-admin write-restricted token (receipt written by this child as the sandbox user): tty+resize+ctrl-c+jobcontrol+unicode all pass' "verdict=$s2Verdict launch=$s2LaunchPath receiptUser=[$s2User] expect=$expectUser" ($attributed -and ($s2r.verdict -eq 'pass')) $s2sub
      } catch {
        Add-Check 'fallback.s2Pty.inContainer' 'S2 PTY receipt parseable' $_.Exception.Message $false $null
      }
    } else {
      Add-Check 'fallback.s2Pty.inContainer' 'S2 PTY receipt produced by the in-token child' 'no receipt from the in-token S2 child' $false @{ launchErr = $errS2 }
    }
  } catch {
    Add-Check 'fallback.orchestration' 'fallback orchestration completed without an unhandled error' $_.Exception.Message $false $null
  } finally {
    # ---- Teardown: close every per-session desktop and restore the window-station DACL. ----
    foreach ($d in $desktops) { try { $d.closeErr = [TauRestrict]::ClosePrivateDesktop($d.handle) } catch { $d.closeErr = "$($_.Exception.Message)" } }
    $restoreRc = 'not-attempted'; $afterSddl = $null; $residual = @()
    if (($winstaH -ne [IntPtr]::Zero) -and $winstaOrig) {
      try {
        $restoreRc = [TauRestrict]::SetDacl($winstaH, $winstaOrig)
        $ae = 0; $after = [TauRestrict]::GetDacl($winstaH, [ref]$ae)
        if ($after) { $afterSddl = Get-SddlOf $after }
        foreach ($g in $winstaGranted) { foreach ($sid in $g.sids) { if ($afterSddl -and $afterSddl.Contains($sid) -and -not $winstaOrigSddl.Contains($sid)) { $residual += $sid } } }
      } catch { $restoreRc = "$($_.Exception.Message)" }
    }
    if ($winstaGranted.Count -gt 0) {
      $closedAll = -not ($desktops | Where-Object { $_.closeErr -ne 0 })
      Add-Check 'fallback.grants.revoked' 'teardown revokes every per-session grant: window-station DACL restored to its snapshot (no session SID remains) and every private desktop closed' "restoreRc=$restoreRc sddlRestored=$($afterSddl -eq $winstaOrigSddl) residual=$($residual -join ',') desktopsClosed=$closedAll" (($restoreRc -eq 0) -and ($afterSddl -eq $winstaOrigSddl) -and ($residual.Count -eq 0) -and $closedAll) @{ granted = @($winstaGranted); desktops = @($desktops | ForEach-Object { [ordered]@{ session = $_.session; name = $_.name; createErr = $_.createErr; closeErr = $_.closeErr; sddl = $_.sddl } }); originalSddl = $winstaOrigSddl; afterSddl = $afterSddl }
    }
    [TauRestrict]::CloseWinsta($winstaH)
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

$required = $checks | Where-Object { $_.id -ne 'fallback.mode' -and $_.id -ne 'fallback.concurrency' -and $_.verdict -ne 'info' }
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
  conclusion = "mode=$mode arch=$arch writeIsolationProven=$writeProven readIsolationProven=$readProven s2Pty=$s2Verdict verdict=$verdict; denials count only when a running child in its restricted token was refused AND passed its own-root positive control; impersonation results are informational. isolationSession.available=$isoAvail (informational, not gated)."
  checks = $checks
  verdict = $verdict
}
$receipt | ConvertTo-Json -Depth 9 | Set-Content -LiteralPath $out
Write-Host "[mxc:fallback] $verdict (mode=$mode) -> $out"
if ($verdict -ne 'pass') { exit 1 }
