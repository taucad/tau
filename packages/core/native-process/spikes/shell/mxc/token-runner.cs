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
//
// Usage: token-runner.exe <spec-file>. The spec is key=value lines (split at the first '='):
//   cap=<S-1-5-21-...>  desktop=<WinSta0\name>  cwd=<dir>  stdout=<file>  stderr=<file>
//   report=<file>  timeoutMs=<n>  cmd=<full command line>  env.<NAME>=<value> (any number)
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
