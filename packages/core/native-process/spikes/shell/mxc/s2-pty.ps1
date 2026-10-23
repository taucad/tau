# S2 interactive-PTY receipt, run INSIDE the Codex-elevated fallback token (WIN-ARM S2).
#
# This script is launched BY fallback.ps1 as the NON-ADMIN sandbox user, under the WRITE_RESTRICTED
# restricted token whose write-restricting SID is the session random S-1-5-21 capability SID
# (token.rs:500 DISABLE_MAX_PRIVILEGE | LUA_TOKEN | WRITE_RESTRICTED). It therefore runs INSIDE the
# containment token/session, not beside it. It stands up a REAL ConPTY (CreatePseudoConsole) and an
# inner interactive PowerShell attached to that pseudoconsole (the inner shell inherits this same
# restricted token, so it too is the non-admin sandboxed session), then drives five S2 terminal
# behaviours and records each pass/fail with evidence:
#   (1) tty          the inner shell sees a real tty  ([Console]::IsOutputRedirected == False)
#   (2) resize       ResizePseudoConsole is reflected in the inner shell ([Console]::WindowWidth)
#   (3) ctrl-c       0x03 interrupts a foreground Start-Sleep 30 (prompt returns promptly, not 30s)
#   (4) jobcontrol   Windows has no POSIX SIGTSTP/Ctrl+Z; the closest equivalent exercised is a
#                    PowerShell background job (Start-Job) resumed/collected (Receive-Job)
#   (5) unicode      UTF-8 (code page 65001) round-trip of accented + CJK + emoji, no mojibake
#
# Fail-closed: a missing ConPTY API, a launch failure, or any probe whose evidence is absent is a
# typed fail, never a green. Synthetic only, no secrets. Receipt -> $env:MXC_S2PTY_OUT.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$out = $env:MXC_S2PTY_OUT
if (-not $out) { $out = Join-Path ([System.IO.Path]::GetTempPath()) 's2-pty.receipt.json' }
New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null

$checks = New-Object System.Collections.ArrayList
function Add-Check($id, $expect, $observed, $ok, $detail) {
  $v = if ($ok) { 'pass' } else { 'fail' }
  [void]$checks.Add([ordered]@{ id = $id; expect = $expect; observed = "$observed"; verdict = $v; detail = $detail })
}

# --- Identity of THIS process (the S2 workload): must be non-admin, inside the sandbox session. ---
$selfUser = $null; $selfSid = $null; $selfAdmin = $null
try {
  $wi = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $selfUser = $wi.Name; $selfSid = $wi.User.Value
  $selfAdmin = (New-Object System.Security.Principal.WindowsPrincipal($wi)).IsInRole([System.Security.Principal.WindowsBuiltinRole]::Administrator)
} catch {}
Add-Check 's2.workload.nonAdmin' 'S2 PTY workload runs as a non-administrator sandbox principal' "user=$selfUser admin=$selfAdmin" ($selfAdmin -eq $false) @{ user = $selfUser; sid = $selfSid }

# --- ConPTY C# harness: a pseudoconsole with a background reader thread. ---------------------------
$csharp = @'
using System;
using System.Text;
using System.Threading;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public class TauConPty {
  [StructLayout(LayoutKind.Sequential)] public struct COORD { public short X; public short Y; }
  [StructLayout(LayoutKind.Sequential)] struct STARTUPINFO {
    public int cb; public string Reserved; public string Desktop; public string Title;
    public int dwX; public int dwY; public int dwXSize; public int dwYSize; public int dwXCountChars;
    public int dwYCountChars; public int dwFillAttribute; public int dwFlags; public short wShowWindow;
    public short cbReserved2; public IntPtr lpReserved2; public IntPtr hStdInput; public IntPtr hStdOutput; public IntPtr hStdError;
  }
  [StructLayout(LayoutKind.Sequential)] struct STARTUPINFOEX { public STARTUPINFO StartupInfo; public IntPtr lpAttributeList; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess; public IntPtr hThread; public int dwProcessId; public int dwThreadId; }

  [DllImport("kernel32.dll", SetLastError=true)] static extern bool CreatePipe(out IntPtr hRead, out IntPtr hWrite, IntPtr sa, int size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern int CreatePseudoConsole(COORD size, IntPtr hInput, IntPtr hOutput, uint dwFlags, out IntPtr phPC);
  [DllImport("kernel32.dll", SetLastError=true)] static extern int ResizePseudoConsole(IntPtr hPC, COORD size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern void ClosePseudoConsole(IntPtr hPC);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr lpAttributeList, int dwAttributeCount, int dwFlags, ref IntPtr lpSize);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr lpAttributeList, uint dwFlags, IntPtr Attribute, IntPtr lpValue, IntPtr cbSize, IntPtr lpPreviousValue, IntPtr lpReturnSize);
  [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr lpAttributeList);
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool CreateProcess(string app, string cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref STARTUPINFOEX si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr h, out uint code);

  const int PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE = 0x00020016;
  const uint EXTENDED_STARTUPINFO_PRESENT = 0x00080000;
  const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;

  IntPtr hPC = IntPtr.Zero;
  IntPtr inWrite = IntPtr.Zero, outRead = IntPtr.Zero, attrList = IntPtr.Zero;
  IntPtr hProc = IntPtr.Zero, hThread = IntPtr.Zero;
  FileStream inStream, outStream;
  Thread reader;
  readonly StringBuilder transcript = new StringBuilder();
  readonly object gate = new object();
  public string LastError = "";

  public bool Start(short cols, short rows, string app, string cmdline, string cwd) {
    IntPtr inRead, outWrite;
    if (!CreatePipe(out inRead, out inWrite, IntPtr.Zero, 0)) { LastError = "CreatePipe(in) " + Marshal.GetLastWin32Error(); return false; }
    if (!CreatePipe(out outRead, out outWrite, IntPtr.Zero, 0)) { LastError = "CreatePipe(out) " + Marshal.GetLastWin32Error(); return false; }
    COORD size; size.X = cols; size.Y = rows;
    int hr = CreatePseudoConsole(size, inRead, outWrite, 0, out hPC);
    if (hr != 0) { LastError = "CreatePseudoConsole hr=0x" + hr.ToString("X8"); return false; }
    // The pseudoconsole duplicated the ConPTY-side handles; close our copies.
    CloseHandle(inRead); CloseHandle(outWrite);

    IntPtr lpSize = IntPtr.Zero;
    InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref lpSize);
    attrList = Marshal.AllocHGlobal(lpSize);
    if (!InitializeProcThreadAttributeList(attrList, 1, 0, ref lpSize)) { LastError = "InitializeProcThreadAttributeList " + Marshal.GetLastWin32Error(); return false; }
    if (!UpdateProcThreadAttribute(attrList, 0, (IntPtr)PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE, hPC, (IntPtr)IntPtr.Size, IntPtr.Zero, IntPtr.Zero)) { LastError = "UpdateProcThreadAttribute " + Marshal.GetLastWin32Error(); return false; }

    STARTUPINFOEX si = new STARTUPINFOEX();
    si.StartupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFOEX));
    si.lpAttributeList = attrList;
    PROCESS_INFORMATION pi;
    StringBuilder cmd = new StringBuilder(cmdline);
    bool ok = CreateProcess(app, cmd.ToString(), IntPtr.Zero, IntPtr.Zero, false, EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT, IntPtr.Zero, cwd, ref si, out pi);
    if (!ok) { LastError = "CreateProcess " + Marshal.GetLastWin32Error(); return false; }
    hProc = pi.hProcess; hThread = pi.hThread;

    inStream = new FileStream(new SafeFileHandle(inWrite, true), FileAccess.Write);
    outStream = new FileStream(new SafeFileHandle(outRead, true), FileAccess.Read);
    reader = new Thread(ReadLoop); reader.IsBackground = true; reader.Start();
    return true;
  }

  void ReadLoop() {
    byte[] buf = new byte[4096];
    var dec = new UTF8Encoding(false);
    try {
      while (true) {
        int n = outStream.Read(buf, 0, buf.Length);
        if (n <= 0) break;
        string s = dec.GetString(buf, 0, n);
        lock (gate) { transcript.Append(s); }
      }
    } catch { }
  }

  public void Write(string s) {
    byte[] b = new UTF8Encoding(false).GetBytes(s);
    inStream.Write(b, 0, b.Length); inStream.Flush();
  }
  public void WriteByte(byte b) { inStream.WriteByte(b); inStream.Flush(); }

  public bool Resize(short cols, short rows) {
    COORD size; size.X = cols; size.Y = rows;
    int hr = ResizePseudoConsole(hPC, size);
    if (hr != 0) { LastError = "ResizePseudoConsole hr=0x" + hr.ToString("X8"); return false; }
    return true;
  }

  public string Transcript() { lock (gate) { return transcript.ToString(); } }

  public bool WaitForMarker(string marker, int ms) {
    var sw = System.Diagnostics.Stopwatch.StartNew();
    while (sw.ElapsedMilliseconds < ms) {
      lock (gate) { if (transcript.ToString().Contains(marker)) return true; }
      Thread.Sleep(50);
    }
    return false;
  }

  public int WaitExit(int ms) {
    uint r = WaitForSingleObject(hProc, (uint)ms);
    if (r != 0) return -1;
    uint code; GetExitCodeProcess(hProc, out code); return (int)code;
  }

  public void Close() {
    try { if (hPC != IntPtr.Zero) ClosePseudoConsole(hPC); } catch { }
    try { if (inStream != null) inStream.Dispose(); } catch { }
    try { if (outStream != null) outStream.Dispose(); } catch { }
    try { if (attrList != IntPtr.Zero) { DeleteProcThreadAttributeList(attrList); Marshal.FreeHGlobal(attrList); } } catch { }
    try { if (hThread != IntPtr.Zero) CloseHandle(hThread); } catch { }
    try { if (hProc != IntPtr.Zero) CloseHandle(hProc); } catch { }
  }
}
'@

$apiOk = $true
try { Add-Type -TypeDefinition $csharp -ErrorAction Stop } catch { $apiOk = $false; Add-Check 's2.conpty.compile' 'ConPTY P/Invoke harness compiles' $_.Exception.Message $false $null }

# Resolve the D14 inner shell (fixed paths only; pwsh 7 preferred, else Windows PowerShell 5.1).
$pwsh7 = Join-Path $env:ProgramFiles 'PowerShell\7\pwsh.exe'
$ps51 = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$innerApp = if (Test-Path -LiteralPath $pwsh7) { $pwsh7 } elseif (Test-Path -LiteralPath $ps51) { $ps51 } else { $null }
if (-not $innerApp) { $apiOk = $false; Add-Check 's2.shell.resolve' 'trusted pwsh7/5.1 at the D14 fixed path' 'none found' $false $null }

$transcript = ''
if ($apiOk) {
  $pty = New-Object TauConPty
  # Interactive REPL (NO -NonInteractive, NO -Command/-File): the inner shell reads from the ConPTY.
  $innerCmd = '"' + $innerApp + '" -NoLogo -NoProfile -ExecutionPolicy Bypass'
  $started = $false
  try { $started = $pty.Start(80, 25, $innerApp, $innerCmd, $env:SystemRoot) } catch { Add-Check 's2.conpty.start' 'CreatePseudoConsole + inner interactive shell started' $_.Exception.Message $false $null }
  if (-not $started) {
    Add-Check 's2.conpty.start' 'CreatePseudoConsole + inner interactive shell started' $pty.LastError $false $null
  } else {
    Add-Check 's2.conpty.start' 'CreatePseudoConsole + inner interactive shell started' 'started' $true $null
    try {
      # Give the interactive banner/prompt a moment, then force UTF-8 and quiet the prompt.
      # IMPORTANT: ConPTY echoes typed input, so every marker LITERAL is assembled from fragments
      # (e.g. 'TTY'+'MARK:') inside the command; the full literal (TTYMARK:) therefore appears ONLY
      # in the inner shell evaluated OUTPUT, never in the command echo. The decoders below match the
      # resolved literal, so a marker can never be satisfied by the echo of the command that produced it.
      Start-Sleep -Milliseconds 1500
      $pty.Write("chcp 65001 > `$null`r`n")
      $pty.Write("function prompt { '' }`r`n")
      Start-Sleep -Milliseconds 400

      # (1) TTY: inner shell reports whether its output is a real tty (ConPTY attached => not redirected).
      $pty.Write("Write-Host ('TTY'+'MARK:' + (-not [Console]::IsOutputRedirected) + ':' + [Console]::WindowWidth + 'x' + [Console]::WindowHeight)`r`n")
      [void]$pty.WaitForMarker('TTYMARK:', 8000)

      # (2) RESIZE: grow the pseudoconsole, then read the inner shell console width.
      $resizeApi = $pty.Resize(132, 44)
      Start-Sleep -Milliseconds 800
      $pty.Write("Write-Host ('SIZE'+'MARK:' + [Console]::WindowWidth + 'x' + [Console]::WindowHeight)`r`n")
      [void]$pty.WaitForMarker('SIZEMARK:', 8000)

      # (5) UNICODE: UTF-8 round-trip of accented + CJK + emoji through the pty.
      $pty.Write("Write-Host ('UNI'+'MARK:' + [char]0x00e9 + 'cole ' + [char]0x65e5 + [char]0x672c + [char]0x8a9e + ' ' + [char]::ConvertFromUtf32(0x1F600) + ':END')`r`n")
      [void]$pty.WaitForMarker('UNIMARK:', 8000)

      # (4) JOB CONTROL EQUIVALENT: Windows has no POSIX SIGTSTP/Ctrl+Z. Exercise the closest thing:
      # a PowerShell background job (Start-Job) then resume/collect it (Receive-Job).
      $pty.Write("`$j = Start-Job { Start-Sleep -Seconds 2; ('JOB'+'VAL:' + (6*7)) }; Wait-Job `$j > `$null; Receive-Job `$j; Remove-Job `$j`r`n")
      [void]$pty.WaitForMarker('JOBVAL:42', 15000)

      # (3) CTRL-C: start a 30s foreground sleep, then after ~1.2s inject 0x03; the prompt must return
      # promptly. We measure the time from the Ctrl-C byte to the recovery marker appearing in OUTPUT.
      $pty.Write("Start-Sleep -Seconds 30`r`n")
      Start-Sleep -Milliseconds 1200
      $ctrlcSw = [System.Diagnostics.Stopwatch]::StartNew()
      $pty.WriteByte([byte]3)
      Start-Sleep -Milliseconds 200
      $pty.Write("Write-Host ('CTRLC'+'MARK:recovered')`r`n")
      $sawCtrlc = $pty.WaitForMarker('CTRLCMARK:recovered', 20000)
      $ctrlcSw.Stop()
      $ctrlcMs = $ctrlcSw.ElapsedMilliseconds

      $pty.Write("exit`r`n")
      [void]$pty.WaitExit(8000)
    } catch {
      Add-Check 's2.conpty.drive' 'drove the five S2 probes over the pty' $_.Exception.Message $false $null
    } finally {
      $transcript = $pty.Transcript()
      $pty.Close()
    }

    # ---- Decide each probe from the transcript (external observation of the inner shell output). ----
    $ttyMatch = [regex]::Match($transcript, 'TTYMARK:(True|False):(\d+)x(\d+)')
    $ttyOk = $ttyMatch.Success -and ($ttyMatch.Groups[1].Value -eq 'True')
    Add-Check 's2.tty.attached' 'inner interactive shell sees a real tty ([Console]::IsOutputRedirected == False)' $ttyMatch.Value $ttyOk @{ redirectedIsFalse = $ttyMatch.Groups[1].Value }

    $sizeMatch = [regex]::Match($transcript, 'SIZEMARK:(\d+)x(\d+)')
    $newWidth = if ($sizeMatch.Success) { [int]$sizeMatch.Groups[1].Value } else { -1 }
    $sizeOk = $resizeApi -and $sizeMatch.Success -and ($newWidth -eq 132)
    Add-Check 's2.pty.resize' 'ResizePseudoConsole(132) reflected in inner [Console]::WindowWidth' ("resizeApi=$resizeApi width=$newWidth") $sizeOk @{ requested = 132; observed = $newWidth }

    $uniMatch = [regex]::Match($transcript, 'UNIMARK:(.*?):END')
    $expectedUni = [char]0x00e9 + 'cole ' + [char]0x65e5 + [char]0x672c + [char]0x8a9e + ' ' + [char]::ConvertFromUtf32(0x1F600)
    $uniGot = if ($uniMatch.Success) { $uniMatch.Groups[1].Value } else { '' }
    $uniOk = $uniMatch.Success -and ($uniGot -eq $expectedUni)
    Add-Check 's2.unicode.utf8RoundTrip' 'UTF-8 (cp65001) accented+CJK+emoji round-trips with no mojibake' ("got=$uniGot") $uniOk @{ expected = $expectedUni; got = $uniGot }

    $jobOk = [regex]::IsMatch($transcript, 'JOBVAL:42')
    Add-Check 's2.jobcontrol.equivalent' 'PowerShell background job (Start-Job) resumed/collected (Receive-Job) -> JOBVAL:42; Windows has no POSIX Ctrl+Z/SIGTSTP' ($(if ($jobOk) { 'JOBVAL:42 observed' } else { 'not observed' })) $jobOk @{ mechanism = 'Start-Job/Receive-Job'; note = 'Ctrl+Z is not POSIX job control on Windows; PowerShell job objects are the closest shell-level equivalent (background + resume/collect).' }

    # Ctrl-C passes only if the recovery marker appeared AND it came back well under the 30s sleep.
    $ctrlcOk = $sawCtrlc -and ($ctrlcMs -lt 8000)
    Add-Check 's2.ctrlc.interrupt' '0x03 interrupts a foreground Start-Sleep 30; prompt returns in well under 30s' ("sawRecover=$sawCtrlc elapsedMs=$ctrlcMs") $ctrlcOk @{ elapsedMs = $ctrlcMs; threshold = 8000 }
  }
}

$allPass = ($checks.Count -gt 0) -and -not ($checks | Where-Object { $_.verdict -ne 'pass' })
$verdict = if ($allPass) { 'pass' } else { 'fail' }
$transcriptSha = $null
try {
  $ms = [System.IO.MemoryStream]::new([System.Text.Encoding]::UTF8.GetBytes([string]$transcript))
  $transcriptSha = (Get-FileHash -InputStream $ms -Algorithm SHA256).Hash
} catch {}
$receipt = [ordered]@{
  kind = 's2-pty-in-container'
  session = @{ user = $selfUser; sid = $selfSid; isAdministrator = $selfAdmin }
  conpty = @{ api = 'CreatePseudoConsole/ResizePseudoConsole'; innerShell = $innerApp }
  model = 'Inner interactive PowerShell over a real ConPTY, running under the WRITE_RESTRICTED restricted token (random S-1-5-21 capability restricting SID; token.rs:500) as the non-admin sandbox user. S2 behaviours proven inside the containment session, not beside it.'
  source = @{ sha = $env:GITHUB_SHA; run = $env:GITHUB_RUN_ID; arch = $env:PROCESSOR_ARCHITECTURE }
  transcriptSha256 = $transcriptSha
  checks = $checks
  verdict = $verdict
}
$receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $out
Write-Host "[mxc:s2-pty] $verdict -> $out"
if ($verdict -ne 'pass') { exit 1 }
