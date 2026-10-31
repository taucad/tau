// W2 restricted-token runner: the Codex elevated-path "command runner" shape, ported for the spike.
//
// Reference (read, not vendored): openai/codex codex-rs/windows-sandbox-rs
//   elevated/runner_client.rs spawn_runner_transport: the orchestrator starts the runner AS the
//     sandbox user with CreateProcessWithLogonW (logon flags 0, CREATE_NO_WINDOW |
//     CREATE_UNICODE_ENVIRONMENT, STARTF_FORCEOFFFEEDBACK, SetErrorMode(SEM_FAILCRITICALERRORS |
//     SEM_NOGPFAULTERRORBOX) around the call). The runner itself is NOT restricted.
//   token.rs create_token_with_caps_from: the runner mints the WRITE_RESTRICTED token from ITS OWN
//     token: flags DISABLE_MAX_PRIVILEGE | LUA_TOKEN | WRITE_RESTRICTED (0x0D), restricting SIDs
//     cap..., logon, Everyone; default DACL logon:GA + OWNER RIGHTS:RC; SeChangeNotifyPrivilege.
//   process.rs create_process_as_user: CreateProcessAsUserW(bInheritHandles=TRUE,
//     CREATE_UNICODE_ENVIRONMENT | EXTENDED_STARTUPINFO_PRESENT | CREATE_NO_WINDOW) with a
//     STARTUPINFOEX attribute list holding the job (kill-on-close) and an explicit handle list of the
//     stdio handles, STARTF_USESTDHANDLES, an explicit environment block, and lpDesktop naming the
//     private desktop.
//   conpty/mod.rs spawn_conpty_process_as_user: for a PTY-backed child the UNRESTRICTED runner creates
//     the pseudoconsole + pipes, child stdio = INVALID_HANDLE, and the child is attached via
//     PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE. The ptyBash mode below mirrors this.
//
// Usage: token-runner.exe <spec-file>. The spec is key=value lines (split at the first '='):
//   cap=<S-1-5-21-...>  desktop=<WinSta0\name>  cwd=<dir>  stdout=<file>  stderr=<file>
//   report=<file>  timeoutMs=<n>  cmd=<full command line>  env.<NAME>=<value> (any number)
//   ptyPwsh=<pwsh.exe> | ptyBash=<bash.exe>  s2receipt=<file>  -> PTY mode: the runner owns the ConPTY
//     and drives the shell in the token. The containment probe reads env.TAU_OWNROOT/TAU_DENYROOT/TAU_NONCE.
// The runner writes <report> (JSON) with what it observed; the orchestrator decides from files.
// Compiles with the .NET Framework csc (C# 5). Synthetic only; it never sees a password.
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

public static class TauTokenRunner {
  [StructLayout(LayoutKind.Sequential)] struct SID_AND_ATTRIBUTES { public IntPtr Sid; public uint Attributes; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO {
    public int cb; public string Reserved; public string Desktop; public string Title;
    public int dwX; public int dwY; public int dwXSize; public int dwYSize; public int dwXCountChars;
    public int dwYCountChars; public int dwFillAttribute; public int dwFlags; public short wShowWindow;
    public short cbReserved2; public IntPtr lpReserved2; public IntPtr hStdInput; public IntPtr hStdOutput; public IntPtr hStdError;
  }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFOEX { public STARTUPINFO StartupInfo; public IntPtr lpAttributeList; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess; public IntPtr hThread; public int dwProcessId; public int dwThreadId; }
  [StructLayout(LayoutKind.Sequential)] struct SECURITY_ATTRIBUTES { public int nLength; public IntPtr lpSecurityDescriptor; public int bInheritHandle; }
  [StructLayout(LayoutKind.Sequential, Pack = 4)] struct TOKEN_PRIVILEGES1 { public int Count; public long Luid; public int Attr; }
  [StructLayout(LayoutKind.Sequential)] struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
    public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit; public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize; public uint ActiveProcessLimit;
    public UIntPtr Affinity; public uint PriorityClass; public uint SchedulingClass;
  }
  [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong a, b, c, d, e, f; }
  [StructLayout(LayoutKind.Sequential)] struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
    public JOBOBJECT_BASIC_LIMIT_INFORMATION Basic; public IO_COUNTERS Io;
    public UIntPtr ProcessMemoryLimit; public UIntPtr JobMemoryLimit; public UIntPtr PeakProcessMemoryUsed; public UIntPtr PeakJobMemoryUsed;
  }

  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr proc, uint access, out IntPtr tok);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool CreateRestrictedToken(IntPtr existing, uint flags, uint disableCount, IntPtr disable, uint deleteCount, IntPtr delete, uint restrictCount, IntPtr restrict, out IntPtr newTok);
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool ConvertStringSidToSid(string s, out IntPtr sid);
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool ConvertSidToStringSid(IntPtr sid, out IntPtr str);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool GetTokenInformation(IntPtr tok, int cls, IntPtr buf, int len, out int ret);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool SetTokenInformation(IntPtr tok, int cls, ref IntPtr info, int len);
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string sddl, uint revision, out IntPtr sd, IntPtr size);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool GetSecurityDescriptorDacl(IntPtr sd, out bool present, out IntPtr dacl, out bool defaulted);
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool LookupPrivilegeValue(string sys, string name, out long luid);
  [DllImport("advapi32.dll", SetLastError = true)] static extern bool AdjustTokenPrivileges(IntPtr tok, bool disableAll, ref TOKEN_PRIVILEGES1 np, int len, IntPtr prev, IntPtr retLen);
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool CreateProcessAsUser(IntPtr tok, string app, StringBuilder cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref STARTUPINFOEX si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern IntPtr CreateFile(string path, uint access, uint share, ref SECURITY_ATTRIBUTES sa, uint disp, uint flags, IntPtr tmpl);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetExitCodeProcess(IntPtr h, out uint code);
  [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr h);
  [DllImport("kernel32.dll")] static extern uint SetErrorMode(uint mode);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr sa, string name);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int cls, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION info, int len);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateJobObject(IntPtr job, uint code);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr proc);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attr, IntPtr value, IntPtr size, IntPtr prev, IntPtr retSize);
  [DllImport("kernel32.dll", SetLastError = true)] static extern void DeleteProcThreadAttributeList(IntPtr list);

  [StructLayout(LayoutKind.Sequential)] struct COORD { public short X; public short Y; }
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool CreatePipe(out IntPtr r, out IntPtr w, IntPtr sa, int size);
  [DllImport("kernel32.dll", SetLastError = true)] static extern int CreatePseudoConsole(COORD size, IntPtr hIn, IntPtr hOut, uint flags, out IntPtr hpc);
  [DllImport("kernel32.dll", SetLastError = true)] static extern int ResizePseudoConsole(IntPtr hpc, COORD size);
  [DllImport("kernel32.dll", SetLastError = true)] static extern void ClosePseudoConsole(IntPtr hpc);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool ReadFile(IntPtr h, byte[] buf, int len, out int read, IntPtr ov);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool WriteFile(IntPtr h, byte[] buf, int len, out int written, IntPtr ov);
  static readonly IntPtr PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE = (IntPtr)0x20016;
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetConsoleCtrlHandler(IntPtr handler, bool add);

  const uint FLAGS = 0x1u | 0x4u | 0x8u; // token.rs:500 DISABLE_MAX_PRIVILEGE | LUA_TOKEN | WRITE_RESTRICTED
  const uint SE_GROUP_LOGON_ID = 0xC0000000;
  const uint CREATE_NO_WINDOW = 0x08000000, CREATE_UNICODE_ENVIRONMENT = 0x00000400, EXTENDED_STARTUPINFO_PRESENT = 0x00080000;
  const int STARTF_USESTDHANDLES = 0x100;
  const uint SEM_FAILCRITICALERRORS = 0x1, SEM_NOGPFAULTERRORBOX = 0x2;
  const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;
  static readonly IntPtr PROC_THREAD_ATTRIBUTE_HANDLE_LIST = (IntPtr)0x20002;
  static readonly IntPtr PROC_THREAD_ATTRIBUTE_JOB_LIST = (IntPtr)0x2000D;

  static readonly List<string> notes = new List<string>();

  static string Esc(string s) {
    if (s == null) return "null";
    StringBuilder b = new StringBuilder("\"");
    foreach (char c in s) {
      if (c == '"' || c == '\\') { b.Append('\\').Append(c); }
      else if (c < 0x20) { b.Append("\\u").Append(((int)c).ToString("x4")); }
      else b.Append(c);
    }
    return b.Append('"').ToString();
  }

  static string LogonSidOf(IntPtr tok) {
    int len; GetTokenInformation(tok, 2, IntPtr.Zero, 0, out len);
    IntPtr buf = Marshal.AllocHGlobal(len);
    try {
      if (!GetTokenInformation(tok, 2, buf, len, out len)) return null;
      int count = Marshal.ReadInt32(buf); int stride = Marshal.SizeOf(typeof(SID_AND_ATTRIBUTES));
      for (int i = 0; i < count; i++) {
        IntPtr entry = (IntPtr)(buf.ToInt64() + IntPtr.Size + (long)i * stride);
        uint attr = (uint)Marshal.ReadInt32((IntPtr)(entry.ToInt64() + IntPtr.Size));
        if ((attr & SE_GROUP_LOGON_ID) == SE_GROUP_LOGON_ID) {
          IntPtr sp; if (ConvertSidToStringSid(Marshal.ReadIntPtr(entry), out sp)) return Marshal.PtrToStringUni(sp);
        }
      }
      return null;
    } finally { Marshal.FreeHGlobal(buf); }
  }

  static bool EnablePrivilege(IntPtr tok, string name) {
    long luid; if (!LookupPrivilegeValue(null, name, out luid)) return false;
    TOKEN_PRIVILEGES1 tp; tp.Count = 1; tp.Luid = luid; tp.Attr = 2;
    return AdjustTokenPrivileges(tok, false, ref tp, Marshal.SizeOf(typeof(TOKEN_PRIVILEGES1)), IntPtr.Zero, IntPtr.Zero) && Marshal.GetLastWin32Error() == 0;
  }

  // token.rs create_token_with_caps_from + set_default_dacl + enable_single_privilege.
  static IntPtr MintToken(string capSid, out string logon, out int elevated) {
    IntPtr self; elevated = -1;
    if (!OpenProcessToken(GetCurrentProcess(), 0x1 | 0x2 | 0x8 | 0x20 | 0x80 | 0x100, out self)) throw new Exception("OpenProcessToken err=" + Marshal.GetLastWin32Error());
    try {
      logon = LogonSidOf(self);
      if (string.IsNullOrEmpty(logon)) throw new Exception("runner token has no logon SID");
      string[] sids = new string[] { capSid, logon, "S-1-1-0" };
      int stride = Marshal.SizeOf(typeof(SID_AND_ATTRIBUTES));
      IntPtr arr = Marshal.AllocHGlobal(stride * sids.Length);
      for (int i = 0; i < sids.Length; i++) {
        IntPtr p; if (!ConvertStringSidToSid(sids[i], out p)) throw new Exception("ConvertStringSidToSid " + sids[i] + " err=" + Marshal.GetLastWin32Error());
        SID_AND_ATTRIBUTES sa; sa.Sid = p; sa.Attributes = 0;
        Marshal.StructureToPtr(sa, (IntPtr)(arr.ToInt64() + (long)i * stride), false);
      }
      IntPtr nt;
      if (!CreateRestrictedToken(self, FLAGS, 0, IntPtr.Zero, 0, IntPtr.Zero, (uint)sids.Length, arr, out nt)) throw new Exception("CreateRestrictedToken err=" + Marshal.GetLastWin32Error());
      IntPtr sd;
      if (!ConvertStringSecurityDescriptorToSecurityDescriptor("D:(A;;GA;;;" + logon + ")(A;;RC;;;S-1-3-4)", 1, out sd, IntPtr.Zero)) throw new Exception("default DACL SDDL err=" + Marshal.GetLastWin32Error());
      try {
        bool present, defaulted; IntPtr dacl;
        if (!GetSecurityDescriptorDacl(sd, out present, out dacl, out defaulted) || !present) throw new Exception("GetSecurityDescriptorDacl err=" + Marshal.GetLastWin32Error());
        if (!SetTokenInformation(nt, 6, ref dacl, IntPtr.Size)) throw new Exception("SetTokenInformation(TokenDefaultDacl) err=" + Marshal.GetLastWin32Error());
      } finally { LocalFree(sd); }
      notes.Add("changeNotify=" + EnablePrivilege(nt, "SeChangeNotifyPrivilege"));
      IntPtr b = Marshal.AllocHGlobal(4); int r;
      if (GetTokenInformation(nt, 20, b, 4, out r)) elevated = Marshal.ReadInt32(b);
      Marshal.FreeHGlobal(b);
      return nt;
    } finally { CloseHandle(self); }
  }

  // process.rs make_env_block: sorted case-insensitively, first spelling wins, double-NUL terminated.
  static IntPtr EnvBlock(Dictionary<string, string> overrides) {
    SortedDictionary<string, string> env = new SortedDictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    foreach (DictionaryEntry e in Environment.GetEnvironmentVariables()) env[(string)e.Key] = (string)e.Value;
    foreach (KeyValuePair<string, string> kv in overrides) env[kv.Key] = kv.Value;
    StringBuilder sb = new StringBuilder();
    foreach (KeyValuePair<string, string> kv in env) sb.Append(kv.Key).Append('=').Append(kv.Value).Append('\0');
    sb.Append('\0');
    return Marshal.StringToHGlobalUni(sb.ToString());
  }

  static IntPtr OpenInheritable(string path, uint access, uint disp) {
    SECURITY_ATTRIBUTES sa = new SECURITY_ATTRIBUTES(); sa.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES)); sa.bInheritHandle = 1;
    IntPtr h = CreateFile(path, access, 0x1 | 0x2, ref sa, disp, 0x80, IntPtr.Zero);
    if (h == (IntPtr)(-1)) throw new Exception("CreateFile " + path + " err=" + Marshal.GetLastWin32Error());
    return h;
  }

  // ===== PTY mode: the UNRESTRICTED runner owns the ConPTY and pipes; only Bash runs in the token. =====
  // This is the Codex conpty/mod.rs shape: create_conpty + PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE on the
  // child, child stdio = INVALID_HANDLE. node-pty and MSYS bash both fail to CREATE a pipe inside the
  // write-restricted token (ConPTY EPERM; bash signal pipe Win32 error 5), so the pipe owner must be
  // the unrestricted runner. The runner then drives tty/resize/ctrl-c/jobcontrol/utf8 from the stream.
  static readonly List<string> ptyChecks = new List<string>();
  static string shellWhoami = null, shellVersion = null, shellKind = null;
  static readonly StringBuilder transcript = new StringBuilder();
  static readonly object tlock = new object();
  static IntPtr ptyOutRead = IntPtr.Zero, ptyInWrite = IntPtr.Zero, ptyHpc = IntPtr.Zero;

  static void PtyCheck(string id, string expect, string observed, bool ok) {
    ptyChecks.Add("{\"id\":" + Esc(id) + ",\"expect\":" + Esc(expect) + ",\"observed\":" + Esc(observed) + ",\"verdict\":" + (ok ? "\"pass\"" : "\"fail\"") + "}");
  }
  static void PtyInfo(string id, string observed) {
    ptyChecks.Add("{\"id\":" + Esc(id) + ",\"observed\":" + Esc(observed) + ",\"verdict\":\"info\"}");
  }
  static string Trans() { lock (tlock) { return transcript.ToString(); } }
  static void TermWrite(string s) { byte[] b = Encoding.UTF8.GetBytes(s); int w; WriteFile(ptyInWrite, b, b.Length, out w, IntPtr.Zero); }
  // Wait until re appears in the transcript produced AFTER `from`; returns the Match or null.
  static System.Text.RegularExpressions.Match WaitFor(string re, int from, int ms) {
    var rx = new System.Text.RegularExpressions.Regex(re);
    long end = Environment.TickCount + ms;
    while (Environment.TickCount < end) {
      string t = Trans(); if (t.Length > from) { var m = rx.Match(t.Substring(from)); if (m.Success) return m; }
      System.Threading.Thread.Sleep(100);
    }
    return null;
  }
  static System.Text.RegularExpressions.Match RunLine(string line, string re, int ms) {
    int from = Trans().Length; TermWrite(line + "\r"); return WaitFor(re, from, ms);
  }

  // Returns child exit, or -1 on timeout (job killed). Writes the S2 receipt + transcript + u8.txt.
  // pwsh=true drives PowerShell (the D14 Windows shell); pwsh=false drives Git for Windows Bash. Either
  // way the UNRESTRICTED runner owns the pseudoconsole; only the shell runs in the token.
  static int RunPty(Dictionary<string, string> spec, Dictionary<string, string> envOverrides, bool pwsh, out string note) {
    note = "";
    shellKind = pwsh ? "pwsh" : "bash";
    string shell = spec[pwsh ? "ptyPwsh" : "ptyBash"]; string scratch = spec["cwd"];
    IntPtr inR, inW, outR, outW;
    if (!CreatePipe(out inR, out inW, IntPtr.Zero, 0)) { note = "CreatePipe in err=" + Marshal.GetLastWin32Error(); return -2; }
    if (!CreatePipe(out outR, out outW, IntPtr.Zero, 0)) { note = "CreatePipe out err=" + Marshal.GetLastWin32Error(); return -2; }
    ptyInWrite = inW; ptyOutRead = outR;
    COORD size; size.X = 80; size.Y = 25;
    int hr = CreatePseudoConsole(size, inR, outW, 0, out ptyHpc);
    if (hr != 0) { note = "CreatePseudoConsole hr=" + hr; return -2; }
    CloseHandle(inR); CloseHandle(outW); // owned by the pseudoconsole now

    // Reader thread: accumulate UTF-8 output.
    var reader = new System.Threading.Thread(() => {
      byte[] buf = new byte[4096]; var dec = Encoding.UTF8.GetDecoder(); char[] cb = new char[4096];
      while (true) {
        int n; if (!ReadFile(ptyOutRead, buf, buf.Length, out n, IntPtr.Zero) || n == 0) break;
        int cc = dec.GetChars(buf, 0, n, cb, 0); lock (tlock) { transcript.Append(cb, 0, cc); }
      }
    });
    reader.IsBackground = true; reader.Start();

    IntPtr tok = MintToken(spec["cap"], out ptyLogon, out ptyElevated);
    IntPtr job = CreateJobObject(IntPtr.Zero, null);
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION li = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
    li.Basic.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    SetInformationJobObject(job, 9, ref li, Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION)));
    IntPtr asize = IntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero, 2, 0, ref asize);
    IntPtr list = Marshal.AllocHGlobal(asize);
    if (!InitializeProcThreadAttributeList(list, 2, 0, ref asize)) { note = "InitAttrList err=" + Marshal.GetLastWin32Error(); return -2; }
    if (!UpdateProcThreadAttribute(list, 0, PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE, ptyHpc, (IntPtr)IntPtr.Size, IntPtr.Zero, IntPtr.Zero)) { note = "UpdateAttr(PSEUDOCONSOLE) err=" + Marshal.GetLastWin32Error(); return -2; }
    IntPtr jobs = Marshal.AllocHGlobal(IntPtr.Size); Marshal.WriteIntPtr(jobs, job);
    UpdateProcThreadAttribute(list, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST, jobs, (IntPtr)IntPtr.Size, IntPtr.Zero, IntPtr.Zero);

    STARTUPINFOEX si = new STARTUPINFOEX();
    si.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));
    si.StartupInfo.Desktop = spec["desktop"];
    si.StartupInfo.hStdInput = (IntPtr)(-1); si.StartupInfo.hStdOutput = (IntPtr)(-1); si.StartupInfo.hStdError = (IntPtr)(-1);
    si.lpAttributeList = list;
    // Shell env: HOME/TEMP/TMP=scratch, kept off the roaming profile. Bash also gets a UTF-8 locale and
    // CHERE_INVOKING; pwsh gets the telemetry/update-check opt-outs. Any env.* from the spec (the
    // containment roots and nonce) is already merged into envOverrides.
    envOverrides["HOME"] = scratch; envOverrides["TEMP"] = scratch; envOverrides["TMP"] = scratch;
    if (pwsh) {
      envOverrides["POWERSHELL_TELEMETRY_OPTOUT"] = "1"; envOverrides["POWERSHELL_UPDATECHECK"] = "Off";
    } else {
      envOverrides["LANG"] = "C.UTF-8"; envOverrides["LC_ALL"] = "C.UTF-8"; envOverrides["CHERE_INVOKING"] = "1"; envOverrides["PS1"] = "$ ";
    }
    IntPtr env = EnvBlock(envOverrides);
    string cmd = pwsh ? ("\"" + shell + "\" -NoLogo -NoProfile") : ("\"" + shell + "\" --noprofile --norc -i");
    // Ctrl-C: the "ignore CTRL_C" console flag is inherited by children, and run 40045912771 showed 0x03
    // not interrupting a foreground Start-Sleep. Clear it in the runner before the spawn
    // (SetConsoleCtrlHandler(NULL, FALSE)). The spawn flags below carry no CREATE_NEW_PROCESS_GROUP,
    // which would also disable Ctrl-C in the child.
    bool ctrlCleared = SetConsoleCtrlHandler(IntPtr.Zero, false); int ctrlErr = ctrlCleared ? 0 : Marshal.GetLastWin32Error();
    uint spawnFlags = CREATE_UNICODE_ENVIRONMENT | EXTENDED_STARTUPINFO_PRESENT;
    PtyInfo("s2.ctrlc.setup", "runner SetConsoleCtrlHandler(NULL,FALSE)=" + ctrlCleared + " err=" + ctrlErr + "; spawnFlags=0x" + spawnFlags.ToString("X") + " newProcessGroup=" + ((spawnFlags & 0x200u) != 0));
    PROCESS_INFORMATION pi;
    bool ok = CreateProcessAsUser(tok, null, new StringBuilder(cmd), IntPtr.Zero, IntPtr.Zero, false,
      spawnFlags, env, scratch, ref si, out pi);
    if (!ok) { int e = Marshal.GetLastWin32Error(); note = "CreateProcessAsUser(" + shellKind + ") err=" + e; PtyCheck("s2." + shellKind + ".start", shellKind + " spawned in the runner-owned ConPTY in the token", "CreateProcessAsUser err=" + e, false); WritePtyReceipt(spec, -2); return -2; }

    try { if (pwsh) DrivePwsh(scratch); else DriveBash(scratch); } catch (Exception e) { PtyCheck("s2.driver.error", "driver ran without throwing", e.Message, false); }

    uint w2 = WaitForSingleObject(pi.hProcess, 8000);
    int exit = -1;
    if (w2 == 0) { uint c; GetExitCodeProcess(pi.hProcess, out c); exit = (int)c; } else { TerminateJobObject(job, 0xDEAD); }
    CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
    ClosePseudoConsole(ptyHpc); CloseHandle(ptyInWrite); CloseHandle(ptyOutRead);
    CloseHandle(job); CloseHandle(tok);
    bool allPass = true; foreach (string c in ptyChecks) { if (c.Contains("\"verdict\":\"fail\"")) allPass = false; }
    WritePtyReceipt(spec, allPass ? 0 : 1);
    return allPass ? 0 : 1;
  }

  static string ptyLogon = null; static int ptyElevated = -1;

  static void DriveBash(string scratch) {
    var ready = RunLine("echo \"RDY_\"$((40+2))", "RDY_42", 30000);
    PtyCheck("s2.bash.start", "Bash started in the runner-owned ConPTY inside the token and answered a marker", ready != null ? "answered RDY_42" : "no answer; tail=" + Tail(400), ready != null);
    if (ready == null) return;

    RunLine("echo \"W\"\"HO_$(whoami)_E\"\"ND\"; echo \"B\"\"V_${BASH_VERSION}_E\"\"ND\"", "BV_([^\\r\\n]*)_END", 15000);
    var mw = new System.Text.RegularExpressions.Regex("WHO_([^\\r\\n]*?)_END").Match(Trans()); shellWhoami = mw.Success ? mw.Groups[1].Value : null;
    var mv = new System.Text.RegularExpressions.Regex("BV_([^\\r\\n]*)_END").Match(Trans()); shellVersion = mv.Success ? mv.Groups[1].Value : null;

    var tty = RunLine("if test -t 0 && test -t 1; then echo \"TTY_\"YES; else echo \"TTY_\"NO; fi", "TTY_(YES|NO)", 15000);
    PtyCheck("s2.tty.attached", "stdin and stdout of the interactive Bash are a terminal (test -t 0/1)", tty != null ? tty.Value : "no answer", tty != null && tty.Groups[1].Value == "YES");

    COORD rs; rs.X = 100; rs.Y = 40; ResizePseudoConsole(ptyHpc, rs); System.Threading.Thread.Sleep(700);
    var sz = RunLine("echo \"S\"\"Z_$(stty size)_E\"\"ND\"", "SZ_([^\\r\\n]*)_END", 15000);
    PtyCheck("s2.pty.resize", "after ResizePseudoConsole(100x40), stty size reports \"40 100\"", sz != null ? sz.Groups[1].Value : "no answer", sz != null && sz.Groups[1].Value.Trim() == "40 100");

    int from = Trans().Length; long t0 = Environment.TickCount;
    TermWrite("sleep 30\r"); System.Threading.Thread.Sleep(1500); TermWrite("\x03"); System.Threading.Thread.Sleep(300); TermWrite("echo \"C\"\"C_$?_E\"\"ND\"\r");
    var cc = WaitFor("CC_(\\d+)_END", from, 20000); long ms = Environment.TickCount - t0;
    PtyCheck("s2.ctrlc.interrupt", "0x03 interrupts a foreground sleep 30; $? is 130 and the prompt returns under 10s", "rc=" + (cc != null ? cc.Groups[1].Value : "none") + " elapsedMs=" + ms, cc != null && cc.Groups[1].Value == "130" && ms < 10000);

    var jb = RunLine("sleep 300 & jobs -l; echo \"JB_\"DONE", "JB_DONE", 15000);
    bool listed = jb != null && new System.Text.RegularExpressions.Regex("\\[1\\][^\\r\\n]*Running[^\\r\\n]*sleep 300").IsMatch(Tail(2000));
    var kl = RunLine("kill %1; wait %1; echo \"K\"\"L_$?_E\"\"ND\"", "KL_(\\d+)_END", 15000);
    PtyCheck("s2.jobcontrol", "background job: sleep 300 & listed Running by jobs, kill %1 terminates it (wait -> 143)", "listedRunning=" + listed + " waitRc=" + (kl != null ? kl.Groups[1].Value : "none"), listed && kl != null && kl.Groups[1].Value == "143");

    int zf = Trans().Length; TermWrite("sleep 30\r"); System.Threading.Thread.Sleep(1500); TermWrite("\x1a"); System.Threading.Thread.Sleep(500); TermWrite("jobs; echo \"SZZ_\"DONE\r");
    var z = WaitFor("SZZ_DONE", zf, 10000); bool stopped = z != null && Trans().Substring(zf).Contains("Stopped");
    PtyInfo("s2.jobcontrol.suspend", "Ctrl-Z suspends sleep 30 (jobs shows Stopped); stopped=" + stopped);
    RunLine("kill -9 %1 2>/dev/null; echo \"ZK_\"DONE", "ZK_DONE", 5000);

    string sample = "café ✓ 日本 \U0001F600"; // ASCII-safe source: csc codepage-independent
    var u8 = RunLine("printf '%s' '" + sample + "' > \"$HOME/u8.txt\"; echo \"U\"\"8_$(cat \"$HOME/u8.txt\")_E\"\"ND\"", "U8_([^\\r\\n]*)_END", 15000);
    string fileHex = "";
    try { fileHex = BitConverter.ToString(File.ReadAllBytes(Path.Combine(scratch, "u8.txt"))).Replace("-", "").ToLowerInvariant(); } catch { }
    string wantHex = BitConverter.ToString(Encoding.UTF8.GetBytes(sample)).Replace("-", "").ToLowerInvariant();
    bool echoed = u8 != null && u8.Groups[1].Value == sample;
    PtyCheck("s2.unicode.utf8RoundTrip", "typed UTF-8 (accented, CJK, emoji) echoes back through the pty and lands as exact UTF-8 bytes in a file Bash wrote", "echoed=" + echoed + " fileBytesMatch=" + (fileHex == wantHex), echoed && fileHex == wantHex);

    TermWrite("exit\r"); System.Threading.Thread.Sleep(1200);
  }

  // The D14 bar: pwsh as the S2 shell in the runner-owned ConPTY, inside the token. Same S2 checks as
  // Linux/macOS (tty, resize, Ctrl-C of a foreground wait, UTF-8 round-trip) plus a containment probe
  // from inside the PTY session. Job control maps to PSJob cmdlets; POSIX fg/bg and Ctrl-Z do not apply
  // and are recorded honestly as info rows.
  static void DrivePwsh(string scratch) {
    // PSReadLine rewrites the input line with ANSI as you type; drop it so the transcript stays clean.
    // Force UTF-8 on the console so the round-trip is byte-exact, and use a fixed, markerless prompt.
    var ready = RunLine("Remove-Module PSReadLine -ErrorAction SilentlyContinue; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; function prompt { 'PSX> ' }; Write-Host (\"RD\"+\"Y_\"+(40+2))", "RDY_42", 40000);
    PtyCheck("s2.pwsh.start", "pwsh started in the runner-owned ConPTY inside the token and answered a marker", ready != null ? "answered RDY_42" : "no answer; tail=" + Tail(400), ready != null);
    if (ready == null) return;

    RunLine("Write-Host (\"WH\"+\"O_\"+[Environment]::UserName+\"_END\"); Write-Host (\"P\"+\"V_\"+$PSVersionTable.PSVersion.ToString()+\"_END\")", "PV_([^\\r\\n]*)_END", 15000);
    var mw = new System.Text.RegularExpressions.Regex("WHO_([^\\r\\n]*?)_END").Match(Trans()); shellWhoami = mw.Success ? mw.Groups[1].Value : null;
    var mv = new System.Text.RegularExpressions.Regex("PV_([^\\r\\n]*)_END").Match(Trans()); shellVersion = mv.Success ? mv.Groups[1].Value : null;

    var tty = RunLine("$r=(-not [Console]::IsInputRedirected)-and(-not [Console]::IsOutputRedirected); Write-Host (\"TT\"+\"Y_\"+$(if($r){'YES'}else{'NO'}))", "TTY_(YES|NO)", 15000);
    PtyCheck("s2.tty.attached", "stdin and stdout of the interactive pwsh are a real console (Console.IsInput/OutputRedirected are both false)", tty != null ? tty.Value : "no answer", tty != null && tty.Groups[1].Value == "YES");

    COORD rs; rs.X = 100; rs.Y = 40; ResizePseudoConsole(ptyHpc, rs); System.Threading.Thread.Sleep(700);
    var sz = RunLine("Write-Host (\"S\"+\"Z_\"+[Console]::WindowHeight+\" \"+[Console]::WindowWidth+\"_END\")", "SZ_([^\\r\\n]*)_END", 15000);
    PtyCheck("s2.pty.resize", "after ResizePseudoConsole(100x40), Console reports WindowHeight/Width \"40 100\"", sz != null ? sz.Groups[1].Value : "no answer", sz != null && sz.Groups[1].Value.Trim() == "40 100");

    int from = Trans().Length; long t0 = Environment.TickCount;
    TermWrite("Start-Sleep -Seconds 30\r"); System.Threading.Thread.Sleep(1500); TermWrite("\x03"); System.Threading.Thread.Sleep(400); TermWrite("Write-Host (\"C\"+\"C_\"+\"DONE\")\r");
    var cc = WaitFor("CC_DONE", from, 20000); long ms = Environment.TickCount - t0;
    PtyCheck("s2.ctrlc.interrupt", "Ctrl-C (0x03) interrupts a foreground Start-Sleep 30 and the prompt returns under 10s (pwsh stops the pipeline -> PipelineStoppedException; there is no POSIX 130 exit code)", "ccDone=" + (cc != null) + " elapsedMs=" + ms, cc != null && ms < 10000);

    var jb = RunLine("$j=Start-Job { Start-Sleep 300 }; Start-Sleep -Milliseconds 500; Write-Host (\"J\"+\"B_\"+$j.State+\"_END\")", "JB_([^\\r\\n]*)_END", 20000);
    bool running = jb != null && jb.Groups[1].Value.Trim() == "Running";
    var kl = RunLine("Stop-Job $j; Wait-Job $j -Timeout 5 > $null; Write-Host (\"K\"+\"L_\"+(Get-Job -Id $j.Id).State+\"_END\")", "KL_([^\\r\\n]*)_END", 15000);
    bool jstopped = kl != null && kl.Groups[1].Value.Trim() == "Stopped";
    PtyCheck("s2.jobcontrol", "pwsh background job: Start-Job runs (State=Running) and Stop-Job terminates it (State=Stopped)", "startState=" + (jb != null ? jb.Groups[1].Value.Trim() : "none") + " stopState=" + (kl != null ? kl.Groups[1].Value.Trim() : "none"), running && jstopped);
    PtyInfo("s2.jobcontrol.posix", "POSIX fg/bg and Ctrl-Z suspend do not apply in pwsh; it has no POSIX job table and uses the PSJob cmdlets (Start-Job/Stop-Job/Receive-Job) instead");

    // UTF-8 built from code points (accented, check mark, CJK, astral emoji) so csc stays codepage-free.
    // $HOME on Windows ignores $env:HOME, so write under $env:TEMP, which the runner pinned to scratch.
    string sample = "café ✓ 日本 \U0001F600";
    string build = "$s=[string]::Concat([char]0x63,[char]0x61,[char]0x66,[char]0xE9,' ',[char]0x2713,' ',[char]0x65E5,[char]0x672C,' ',[System.Char]::ConvertFromUtf32(0x1F600)); [IO.File]::WriteAllText((Join-Path $env:TEMP 'u8.txt'),$s,(New-Object System.Text.UTF8Encoding($false))); Write-Host (\"U\"+\"8_\"+$s+\"_END\")";
    var u8 = RunLine(build, "U8_([^\\r\\n]*)_END", 15000);
    string fileHex = "";
    try { fileHex = BitConverter.ToString(File.ReadAllBytes(Path.Combine(scratch, "u8.txt"))).Replace("-", "").ToLowerInvariant(); } catch { }
    string wantHex = BitConverter.ToString(Encoding.UTF8.GetBytes(sample)).Replace("-", "").ToLowerInvariant();
    bool echoed = u8 != null && u8.Groups[1].Value == sample;
    PtyCheck("s2.unicode.utf8RoundTrip", "typed UTF-8 (accented, CJK, emoji) echoes back through the pty and lands as exact UTF-8 bytes in a file pwsh wrote", "echoed=" + echoed + " fileBytesMatch=" + (fileHex == wantHex), echoed && fileHex == wantHex);

    // Containment, as seen from inside the PTY session: the token writes its own-root canary (a dir its
    // cap is granted on) and is refused the deny-root (a dir its cap is not on). The orchestrator checks
    // the bytes on disk authoritatively; these rows record what the shell inside the token observed.
    var own = RunLine("Set-Content -LiteralPath (Join-Path $env:TAU_OWNROOT 'canary-s2pwsh.txt') -Value $env:TAU_NONCE -NoNewline -ErrorAction Stop; Write-Host (\"OW\"+\"N_done_END\")", "OWN_done_END", 15000);
    PtyCheck("s2.contain.ownRoot", "inside the PTY session the token writes its own-root canary (the cap-granted dir)", own != null ? "wrote canary-s2pwsh.txt" : "no answer; tail=" + Tail(400), own != null);
    var deny = RunLine("try { Set-Content -LiteralPath (Join-Path $env:TAU_DENYROOT 'canary-s2pwsh.txt') -Value $env:TAU_NONCE -NoNewline -ErrorAction Stop; Write-Host (\"DE\"+\"NY_WROTE_END\") } catch { Write-Host (\"DE\"+\"NY_\"+$_.Exception.GetType().Name+\"_END\") }", "DENY_([^\\r\\n]*)_END", 15000);
    bool denied = deny != null && deny.Groups[1].Value != "WROTE";
    PtyCheck("s2.contain.denyRoot", "inside the PTY session the token is refused a write to the deny-root (a dir its cap is not on)", deny != null ? deny.Groups[1].Value : "no answer", denied);

    TermWrite("exit\r"); System.Threading.Thread.Sleep(1200);
  }

  static string Tail(int n) { string t = Trans(); return t.Length > n ? t.Substring(t.Length - n) : t; }

  static void WritePtyReceipt(Dictionary<string, string> spec, int verdictCode) {
    bool pass = verdictCode == 0;
    string shellPath = spec.ContainsKey("ptyPwsh") ? spec["ptyPwsh"] : (spec.ContainsKey("ptyBash") ? spec["ptyBash"] : null);
    string json = "{\"kind\":\"s2-" + shellKind + "-pty-in-token\",\"identity\":{\"runnerUser\":" + Esc(Environment.UserName) +
      ",\"shellKind\":" + Esc(shellKind) + ",\"shellPath\":" + Esc(shellPath) + ",\"shellWhoami\":" + Esc(shellWhoami) +
      ",\"shellVersion\":" + Esc(shellVersion) + ",\"ptyMaster\":\"runner-conpty\",\"logonSid\":" + Esc(ptyLogon) + ",\"tokenElevated\":" + ptyElevated + "}" +
      ",\"checks\":[" + string.Join(",", ptyChecks.ToArray()) + "],\"transcriptTail\":" + Esc(Tail(4000)) + ",\"verdict\":" + (pass ? "\"pass\"" : "\"fail\"") + "}";
    try { File.WriteAllText(spec["s2receipt"], json); } catch { }
    try { File.WriteAllText(Path.Combine(spec["cwd"], "s2-" + shellKind + "-transcript.txt"), Trans()); } catch { }
  }

  public static int Main(string[] args) {
    Dictionary<string, string> spec = new Dictionary<string, string>();
    Dictionary<string, string> envOverrides = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    string report = null;
    string logon = null; int elevated = -1; bool createOk = false; int createErr = 0; long exit = -2; bool timedOut = false;
    string jobMode = "none"; int pid = 0;
    try {
      foreach (string line in File.ReadAllLines(args[0])) {
        int i = line.IndexOf('='); if (i <= 0) continue;
        string k = line.Substring(0, i), v = line.Substring(i + 1);
        if (k.StartsWith("env.")) envOverrides[k.Substring(4)] = v; else spec[k] = v;
      }
      report = spec["report"];
      File.WriteAllText(report + ".started", "runner=" + Environment.UserName);
      SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX); // inherited by the child (runner_client.rs)
      // PTY mode: the runner owns the ConPTY and drives the shell in the token (Codex conpty/mod.rs shape).
      // ptyPwsh selects PowerShell (the D14 Windows shell); ptyBash selects Git for Windows Bash.
      if (spec.ContainsKey("ptyPwsh") || spec.ContainsKey("ptyBash")) {
        bool pwsh = spec.ContainsKey("ptyPwsh");
        string pnote; int prc = RunPty(spec, envOverrides, pwsh, out pnote);
        string pjson = "{\"runnerUser\":" + Esc(Environment.UserName) + ",\"mode\":" + Esc(pwsh ? "ptyPwsh" : "ptyBash") + ",\"createOk\":" + (prc != -2 ? "true" : "false") +
          ",\"exit\":" + prc + ",\"timedOut\":false,\"notes\":" + Esc(pnote) + "}";
        try { File.WriteAllText(report, pjson); } catch { }
        return prc == 0 ? 0 : 1;
      }
      IntPtr tok = MintToken(spec["cap"], out logon, out elevated);
      IntPtr hIn = OpenInheritable("NUL", 0x80000000, 3);
      IntPtr hOut = OpenInheritable(spec["stdout"], 0x40000000, 2);
      IntPtr hErr = OpenInheritable(spec["stderr"], 0x40000000, 2);

      IntPtr job = CreateJobObject(IntPtr.Zero, null);
      JOBOBJECT_EXTENDED_LIMIT_INFORMATION li = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
      li.Basic.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
      SetInformationJobObject(job, 9, ref li, Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION)));

      // Attribute list: handle list (stdio) + job list, as process.rs does.
      IntPtr size = IntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero, 2, 0, ref size);
      IntPtr list = Marshal.AllocHGlobal(size);
      if (!InitializeProcThreadAttributeList(list, 2, 0, ref size)) throw new Exception("InitializeProcThreadAttributeList err=" + Marshal.GetLastWin32Error());
      IntPtr handles = Marshal.AllocHGlobal(IntPtr.Size * 3);
      Marshal.WriteIntPtr(handles, 0, hIn); Marshal.WriteIntPtr(handles, IntPtr.Size, hOut); Marshal.WriteIntPtr(handles, IntPtr.Size * 2, hErr);
      if (!UpdateProcThreadAttribute(list, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST, handles, (IntPtr)(IntPtr.Size * 3), IntPtr.Zero, IntPtr.Zero))
        throw new Exception("UpdateProcThreadAttribute(HANDLE_LIST) err=" + Marshal.GetLastWin32Error());
      IntPtr jobs = Marshal.AllocHGlobal(IntPtr.Size); Marshal.WriteIntPtr(jobs, job);
      if (UpdateProcThreadAttribute(list, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST, jobs, (IntPtr)IntPtr.Size, IntPtr.Zero, IntPtr.Zero)) jobMode = "attribute";
      else { jobMode = "assign(attrErr=" + Marshal.GetLastWin32Error() + ")"; }

      STARTUPINFOEX si = new STARTUPINFOEX();
      si.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));
      si.StartupInfo.Desktop = spec["desktop"];
      si.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
      si.StartupInfo.hStdInput = hIn; si.StartupInfo.hStdOutput = hOut; si.StartupInfo.hStdError = hErr;
      si.lpAttributeList = list;
      IntPtr env = EnvBlock(envOverrides);
      PROCESS_INFORMATION pi;
      createOk = CreateProcessAsUser(tok, null, new StringBuilder(spec["cmd"]), IntPtr.Zero, IntPtr.Zero, true,
        CREATE_UNICODE_ENVIRONMENT | EXTENDED_STARTUPINFO_PRESENT | CREATE_NO_WINDOW, env, spec["cwd"], ref si, out pi);
      if (!createOk) createErr = Marshal.GetLastWin32Error();
      CloseHandle(hIn); CloseHandle(hOut); CloseHandle(hErr);
      if (createOk) {
        pid = pi.dwProcessId;
        if (jobMode != "attribute") AssignProcessToJobObject(job, pi.hProcess);
        uint w = WaitForSingleObject(pi.hProcess, uint.Parse(spec["timeoutMs"]));
        if (w != 0) { timedOut = true; TerminateJobObject(job, 0xDEAD); WaitForSingleObject(pi.hProcess, 5000); exit = -1; }
        else { uint c; GetExitCodeProcess(pi.hProcess, out c); exit = (int)c; }
        CloseHandle(pi.hThread); CloseHandle(pi.hProcess);
      }
      DeleteProcThreadAttributeList(list);
      CloseHandle(job); CloseHandle(tok);
    } catch (Exception e) { notes.Add("error: " + e.Message); }
    string json = "{\"runnerUser\":" + Esc(Environment.UserName) + ",\"logonSid\":" + Esc(logon) +
      ",\"tokenFlags\":\"0x0D\",\"restrictingSids\":[" + Esc(spec.ContainsKey("cap") ? spec["cap"] : null) + "," + Esc(logon) + ",\"S-1-1-0\"]" +
      ",\"tokenElevated\":" + elevated + ",\"errorMode\":\"0x3\",\"jobMode\":" + Esc(jobMode) + ",\"desktop\":" + Esc(spec.ContainsKey("desktop") ? spec["desktop"] : null) +
      ",\"createOk\":" + (createOk ? "true" : "false") + ",\"createErr\":" + createErr + ",\"pid\":" + pid +
      ",\"exit\":" + exit + ",\"timedOut\":" + (timedOut ? "true" : "false") + ",\"notes\":" + Esc(string.Join("; ", notes.ToArray())) + "}";
    try { if (report != null) File.WriteAllText(report, json); } catch { }
    return createOk && !timedOut ? 0 : 1;
  }
}
