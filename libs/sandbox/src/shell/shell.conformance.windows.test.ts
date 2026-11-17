/* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */
// @vitest-environment node
/*
 * The Windows shell conformance suite (row WIN-X64, desktop Bash/Terminal blueprint Q15): the real Windows provider
 * (`createWindowsShellProvider` over `tau-windows-sandbox.exe`) and the machine's own PowerShell, never a fixture or a
 * mock. The Bash rows live in `shell.conformance.test.ts`; this file is the Windows half of the same contract.
 *
 * Every row starts with a positive control that must succeed inside the same sandbox, then the negatives, and every
 * deny verdict is decided outside the sandbox: file digests, canaries and ACLs the test process placed and reads back,
 * listeners and a named-pipe server that count their own clients, and the process table. What the sandboxed command
 * prints is recorded as context only. Launches run one at a time unless a row overlaps them on purpose (A23, NW02-NW04).
 *
 * Off unless `TAU_SHELL_CONFORMANCE=1`, which only `sandbox:test:shell-conformance:windows` sets. On any platform but
 * win32 the suite fails rather than skips. `TAU_SHELL_CONFORMANCE_ROW` names the row (WIN-X64),
 * `TAU_SHELL_CONFORMANCE_RECEIPT` where the JSON receipt goes, and `TAU_SHELL_CONFORMANCE_WINDOWS_HELPER` the installed
 * helper (default: the `sandbox:build:windows-sandbox` output). The helper's elevated `setup` must already have run for
 * the user running this suite (`libs/sandbox/scripts/shell-conformance-windows.ps1`); its absence fails the row.
 */
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { connect } from 'node:net';
import { arch, homedir, networkInterfaces, platform, release, tmpdir, version } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { refusedShellEnvironment } from '#shell/shell-environment.js';
import {
  powerShellModuleCacheCommand,
  powerShellModuleCacheFile,
  powerShellModuleCacheVariable,
  resolveShellExecutable,
  shellCommandArguments,
  shellInteractiveArguments,
  shellVersionCommand,
} from '#shell/shell-identity.js';
import type { ShellExecutable } from '#shell/shell-identity.js';
import type { ShellLaunch, ShellLaunchOutcome, ShellProcess, ShellProvider } from '#shell/shell-provider.js';
import {
  nativeWorkerRows,
  personSession,
  statusWithoutSystemEnvironment,
} from '#shell/windows-native-worker.fixture.js';
import type { NativeWorkerContext, PersonSession } from '#shell/windows-native-worker.fixture.js';
import { atomicWrite, pipeObserverScript } from '#shell/windows-conformance-scripts.fixture.js';
import { tcpCanary, tcpControl, udpCanary, udpControl } from '#shell/windows-conformance-network.fixture.js';
import { createWindowsShellProvider } from '#shell/windows-shell-provider.js';

const enabled = process.env['TAU_SHELL_CONFORMANCE'] === '1';
const row = process.env['TAU_SHELL_CONFORMANCE_ROW'] ?? 'unnamed';
const helperPath =
  process.env['TAU_SHELL_CONFORMANCE_WINDOWS_HELPER'] ??
  fileURLToPath(
    new URL('../../windows-sandbox/target/x86_64-pc-windows-msvc/release/tau-windows-sandbox.exe', import.meta.url),
  );
/** NW01's stand-in native worker (`windows-sandbox/examples/tau_worker_probe.rs`), built beside the helper. */
const workerProbe =
  process.env['TAU_SHELL_CONFORMANCE_WINDOWS_WORKER_PROBE'] ??
  fileURLToPath(
    new URL(
      '../../windows-sandbox/target/x86_64-pc-windows-msvc/release/examples/tau-worker-probe.exe',
      import.meta.url,
    ),
  );
const systemRoot = process.env['SystemRoot'] ?? process.env['SYSTEMROOT'] ?? String.raw`C:\Windows`;
/** Windows PowerShell 5.1 at its fixed path; T02 runs on it too when present beside PowerShell 7. */
const windowsPowerShell = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const windowsPowerShellPresent = process.platform === 'win32' && existsSync(windowsPowerShell);

type RowResult = Readonly<{
  id: string;
  title: string;
  status: 'pass' | 'fail' | 'operator-validation-pending' | 'residual-disclosed';
  detail?: string;
}>;

const results: RowResult[] = [];
/** Context the sandboxed commands printed, kept for the receipt only; no verdict reads it. */
const observations: Record<string, unknown> = {};
/** The helper's own diagnostic lines (the runner's AppContainer, registry and COM checks), kept for the receipt. */
const helperDiagnostics: string[] = [];
const helperDiagnosticLimit = 400;
const recordHelperDiagnostic = (line: string): void => {
  if (line.trim() === '') {
    return;
  }
  // Printed as it arrives so a failing CI run carries it in its log, not only in the receipt artifact.
  console.info(`[helper] ${line}`);
  if (helperDiagnostics.length < helperDiagnosticLimit) {
    helperDiagnostics.push(line);
  }
};

/** Conformance rows with one time bound: each outcome lands in the receipt whether it passes or fails. */
const conformanceWithin =
  (rowTimeout: number) =>
  (id: string, title: string, body: () => Promise<void>): void => {
    it(`${id}: ${title}`, { timeout: rowTimeout }, async () => {
      try {
        await body();
        results.push({ id, title, status: 'pass' });
      } catch (error) {
        results.push({ id, title, status: 'fail', detail: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    });
  };

const conformance = conformanceWithin(60_000);

const digestOf = (path: string): string => `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;

/** A file's digest, or `absent`: a write probe that created a file shows up as a change from `absent`. */
const stateOf = (path: string): string => (existsSync(path) ? digestOf(path) : 'absent');

const sizeOf = (path: string): number => (existsSync(path) ? statSync(path).size : 0);

const commandOutput = (file: string, arguments_: readonly string[]): string => {
  try {
    return execFileSync(file, arguments_, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return `unavailable: ${error instanceof Error ? error.message.split('\n')[0]! : String(error)}`;
  }
};

const text = async (chunks: AsyncIterable<Uint8Array<ArrayBuffer>>): Promise<string> => {
  const decoder = new TextDecoder();
  let result = '';
  for await (const chunk of chunks) {
    result += decoder.decode(chunk, { stream: true });
  }
  return result + decoder.decode();
};

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

/** A PowerShell single-quoted literal. */
const quote = (value: string): string => `'${value.replaceAll("'", "''")}'`;
/** `-EncodedCommand` text: UTF-16LE, base64, so a nested script survives every command line it passes through. */
const encoded = (script: string): string => Buffer.from(script, 'utf16le').toString('base64');

/** Whether a process exists, from the process table: EPERM is another account's live process (`uv_kill`, signal 0). */
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};

let root = '';
let work = '';
let readonly = '';
let secret = '';
let outside = '';
let home = '';
let records = '';
let profileCanaryDirectory = '';
let custodyRoot = '';
let shell: ShellExecutable;
let windowsPowerShellIdentity: ShellExecutable | undefined;
let provider: ShellProvider;
let shellVersion = '';
let helperStatus: Record<string, unknown> = {};
let proxyPorts: readonly number[] = [];
let aclPaths: readonly string[] = [];
let aclBaseline: Record<string, string> = {};
let ready = false;

/** The explicit child environment: system folders, and a private profile and temp folder inside the writable root. */
const baseEnvironment = (): Record<string, string> => {
  const system32 = join(systemRoot, 'System32');
  const profile = join(work, 'profile');
  return {
    SystemRoot: systemRoot,
    windir: systemRoot,
    ComSpec: join(system32, 'cmd.exe'),
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
    PATH: [system32, systemRoot, join(system32, 'Wbem'), dirname(windowsPowerShell), dirname(shell.path)].join(';'),
    ProgramFiles: process.env['ProgramFiles'] ?? String.raw`C:\Program Files`,
    USERPROFILE: profile,
    APPDATA: join(profile, 'AppData', 'Roaming'),
    LOCALAPPDATA: join(profile, 'AppData', 'Local'),
    TEMP: join(work, 'temp'),
    TMP: join(work, 'temp'),
  };
};

const defaultFilesystem = (): ShellLaunch['filesystem'] => ({
  readable: [readonly, home],
  writable: [work],
  readOnly: [],
  denied: [secret, join(home, '.ssh')],
});

const launchOf = (command: string, overrides: Partial<ShellLaunch> = {}): ShellLaunch => ({
  /* Prepared in `start`; a launch refused at admission never reaches custody. */
  executionId: '',
  executablePath: shell.path,
  arguments: shellCommandArguments('powershell', command),
  workingDirectory: work,
  commandId: `conformance#${String(results.length + 1)}`,
  filesystem: defaultFilesystem(),
  network: { domains: [] },
  environment: baseEnvironment(),
  stdio: { kind: 'pipes' },
  signal: new AbortController().signal,
  ...overrides,
});

const prepared = async (launch: ShellLaunch, through: ShellProvider = provider): Promise<ShellLaunchOutcome> => {
  const privateRoot = mkdtempSync(join(custodyRoot, 'sessions', 'tau-shell-'));
  const { executionId } = await through.prepare({ privateRoot, resource: undefined });
  return through.launch({ ...launch, executionId });
};

const start = async (launch: ShellLaunch, through: ShellProvider = provider): Promise<ShellProcess> => {
  const outcome = await prepared(launch, through);
  if (outcome.status !== 'started') {
    throw new Error(`the provider did not start the launch: ${JSON.stringify(outcome)}`);
  }
  return outcome.process;
};

/** Run one command to completion in the sandbox and collect what it printed. */
const run = async (
  command: string,
  overrides: Partial<ShellLaunch> = {},
): Promise<{ stdout: string; stderr: string; exitCode: number | undefined }> => {
  const process_ = await start(launchOf(command, overrides));
  if (process_.kind !== 'pipes') {
    throw new Error('expected a pipes launch');
  }
  const [stdout, stderr, exit] = await Promise.all([text(process_.stdout), text(process_.stderr), process_.exited]);
  return { stdout: stdout.replaceAll('\r\n', '\n'), stderr, exitCode: 'exitCode' in exit ? exit.exitCode : undefined };
};

/** Run PowerShell outside the sandbox, as the test user: the external observer's own tool. */
const observe = (script: string, environment: Record<string, string> = {}): string =>
  execFileSync(shell.path, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    env: { ...process.env, ...environment },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/** The SDDL (owner, group and DACL) of each path, read outside the sandbox. */
const sddlOf = (paths: readonly string[]): Record<string, string> =>
  JSON.parse(
    observe(
      [
        "$ErrorActionPreference = 'Stop'",
        '$result = [ordered]@{}',
        'foreach ($path in ($env:CONFORMANCE_SDDL_PATHS | ConvertFrom-Json)) { $result[$path] = (Get-Acl -LiteralPath $path).Sddl }',
        '$result | ConvertTo-Json -Compress',
      ].join('\n'),
      { CONFORMANCE_SDDL_PATHS: JSON.stringify(paths) },
    ),
  ) as Record<string, string>;

const interfaceAddress = (): string | undefined =>
  Object.values(networkInterfaces())
    .flat()
    .find((entry) => entry?.family === 'IPv4' && !entry.internal)?.address;

const waitUntil = async (condition: () => boolean, milliseconds: number): Promise<boolean> => {
  for (const deadline = Date.now() + milliseconds; !condition(); ) {
    if (Date.now() > deadline) {
      return false;
    }
    // oxlint-disable-next-line no-await-in-loop -- polls an external observation until it holds or the bound passes.
    await delay(50);
  }
  return true;
};

/**
 * A named-pipe server outside the sandbox that keeps four instances listening and writes the number of clients it ever
 * accepted. With `everyone` its DACL grants Everyone full control (A22), so only the sandbox can keep a sandboxed client
 * out; with `default` it is created with no security descriptor at all, so it carries the default named-pipe DACL the
 * person's token gives it (full control for the person, SYSTEM and Administrators, read for Everyone and Anonymous).
 */
const pipeServer = async (
  dacl: 'everyone' | 'default',
): Promise<{ name: string; connections: () => number; stop: () => Promise<void> }> => {
  const name = `tau-conformance-${randomUUID()}`;
  const directory = mkdtempSync(join(custodyRoot, 'pipe-'));
  const count = join(directory, 'count');
  const listening = join(directory, 'listening');
  const stop = join(directory, 'stop');
  const child: ChildProcess = spawn(
    shell.path,
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', pipeObserverScript],
    {
      env: {
        ...process.env,
        CONFORMANCE_PIPE: name,
        CONFORMANCE_PIPE_DACL: dacl,
        CONFORMANCE_PIPE_COUNT: count,
        CONFORMANCE_PIPE_LISTENING: listening,
        CONFORMANCE_PIPE_STOP: stop,
      },
      stdio: 'ignore',
    },
  );
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => {
      resolve();
    });
  });
  if (!(await waitUntil(() => existsSync(listening), 30_000))) {
    child.kill();
    throw new Error('the named-pipe observer never listened');
  }
  return {
    name,
    connections: () => Number(readFileSync(count, 'utf8') || '0'),
    stop: async () => {
      writeFileSync(stop, '');
      if (!(await Promise.race([exited.then(() => true), delay(10_000).then(() => false)]))) {
        child.kill();
      }
    },
  };
};

const pipeControl = async (name: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const socket = connect({ path: `\\\\.\\pipe\\${name}` }, () => {
      socket.end();
      resolve();
    });
    socket.on('error', reject);
  });

/**
 * What a process's token is, read outside the sandbox by the test user: the runner grants the person
 * `PROCESS_QUERY_LIMITED_INFORMATION` on the shell and `TOKEN_QUERY` on its token, nothing more, so this opens exactly
 * those and reads the user, image, AppContainer state, package SID, capabilities, restricting SIDs and integrity level.
 */
type ShellToken = Readonly<{
  user: string;
  image: string;
  isAppContainer: boolean;
  /** Absent when the token has no package SID. */
  package?: string;
  capabilities: string[];
  restricted: string[];
  integrity: string;
}>;

const tokenObserver = [
  'using System; using System.Collections; using System.ComponentModel; using System.Runtime.InteropServices;',
  'using System.Security.Principal; using System.Text;',
  'public static class TauShellToken {',
  '  [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);',
  '  [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr handle);',
  '  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]',
  '  static extern bool QueryFullProcessImageNameW(IntPtr process, int flags, StringBuilder name, ref int size);',
  '  [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);',
  '  [DllImport("advapi32.dll", SetLastError = true)]',
  '  static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr buffer, int length, out int needed);',
  '  static IntPtr Read(IntPtr token, int kind) {',
  '    int needed; GetTokenInformation(token, kind, IntPtr.Zero, 0, out needed);',
  '    if (needed == 0) { throw new Win32Exception(Marshal.GetLastWin32Error(), "GetTokenInformation " + kind); }',
  '    IntPtr buffer = Marshal.AllocHGlobal(needed);',
  '    if (!GetTokenInformation(token, kind, buffer, needed, out needed)) { int error = Marshal.GetLastWin32Error(); Marshal.FreeHGlobal(buffer); throw new Win32Exception(error, "GetTokenInformation " + kind); }',
  '    return buffer; }',
  '  static string Sid(IntPtr sid) { return sid == IntPtr.Zero ? null : new SecurityIdentifier(sid).Value; }',
  '  static string First(IntPtr token, int kind) { IntPtr b = Read(token, kind); try { return Sid(Marshal.ReadIntPtr(b)); } finally { Marshal.FreeHGlobal(b); } }',
  '  static ArrayList Groups(IntPtr token, int kind) {',
  '    IntPtr b = Read(token, kind); var list = new ArrayList();',
  '    try { int count = Marshal.ReadInt32(b); for (int i = 0; i < count; i++) { list.Add(Sid(Marshal.ReadIntPtr(b, IntPtr.Size + i * 2 * IntPtr.Size))); } }',
  '    finally { Marshal.FreeHGlobal(b); } return list; }',
  '  public static Hashtable Describe(int pid) {',
  '    IntPtr process = OpenProcess(0x1000, false, pid);',
  '    if (process == IntPtr.Zero) { throw new Win32Exception(Marshal.GetLastWin32Error(), "OpenProcess " + pid); }',
  '    try {',
  '      var name = new StringBuilder(32768); int size = name.Capacity;',
  '      if (!QueryFullProcessImageNameW(process, 0, name, ref size)) { throw new Win32Exception(Marshal.GetLastWin32Error(), "QueryFullProcessImageName"); }',
  '      IntPtr token; if (!OpenProcessToken(process, 0x0008, out token)) { throw new Win32Exception(Marshal.GetLastWin32Error(), "OpenProcessToken"); }',
  '      try {',
  '        IntPtr flag = Read(token, 29); int isAppContainer; try { isAppContainer = Marshal.ReadInt32(flag); } finally { Marshal.FreeHGlobal(flag); }',
  '        var result = new Hashtable();',
  '        result["user"] = First(token, 1); result["image"] = name.ToString(0, size);',
  '        result["isAppContainer"] = isAppContainer != 0; result["package"] = First(token, 31);',
  '        result["capabilities"] = Groups(token, 30); result["restricted"] = Groups(token, 11);',
  '        result["integrity"] = First(token, 25);',
  '        return result;',
  '      } finally { CloseHandle(token); }',
  '    } finally { CloseHandle(process); } } }',
].join('\n');

const shellTokenOf = (pid: number): ShellToken =>
  JSON.parse(
    observe(
      [
        "$ErrorActionPreference = 'Stop'",
        'Add-Type -TypeDefinition $env:CONFORMANCE_TOKEN_OBSERVER',
        '[TauShellToken]::Describe([int]$env:CONFORMANCE_TOKEN_PID) | ConvertTo-Json -Compress',
      ].join('\n'),
      { CONFORMANCE_TOKEN_OBSERVER: tokenObserver, CONFORMANCE_TOKEN_PID: String(pid) },
    ),
    /* A token without a package SID reads back as JSON null: leave the field absent instead. */
    (_key, value: unknown) => value ?? undefined,
  ) as ShellToken;

/** Strip VT control sequences ConPTY interleaves with text, so a marker is matched on what the screen shows. */
const vtSequence =
  // oxlint-disable-next-line no-control-regex -- the escape and bell characters are the point.
  /\u001B\[[\d;?]*[ -/]*[@-~]|\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)|\u001B[()][\dAB]|\u001B[=>]/gu;

const operatingSystem = (): Record<string, string> => ({
  version: version(),
  build: release(),
  caption: commandOutput(shell.path, [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '(Get-CimInstance Win32_OperatingSystem).Caption',
  ]),
});

const receipt = (): Record<string, unknown> => {
  const server = process.env['GITHUB_SERVER_URL'];
  const repository = process.env['GITHUB_REPOSITORY'];
  const runId = process.env['GITHUB_RUN_ID'];
  return {
    schema: 'tau.shell-conformance.receipt/1',
    row,
    recordedAt: new Date().toISOString(),
    source: {
      sha: process.env['GITHUB_SHA'] ?? commandOutput('git', ['rev-parse', 'HEAD']),
      run: server && repository && runId ? `${server}/${repository}/actions/runs/${runId}` : 'local',
    },
    host: { platform: platform(), arch: arch(), kernel: release(), kernelVersion: version(), os: operatingSystem() },
    node: { version: process.versions.node, abi: process.versions.modules, electron: process.versions['electron'] },
    provider: {
      name: provider.name,
      helper: { path: helperPath, realPath: realpathSync(helperPath), digest: digestOf(helperPath) },
      install: helperStatus,
    },
    shell: { ...shell, version: shellVersion },
    windowsPowerShell: windowsPowerShellIdentity,
    observations: { ...observations, helperDiagnostics },
    results,
  };
};

let sessionBefore: PersonSession | undefined;

describe.runIf(enabled)('Windows shell conformance', () => {
  beforeAll(async () => {
    if (process.platform !== 'win32') {
      throw new Error(`${process.platform} is not a row of this suite; the Bash rows are shell.conformance.test.ts.`);
    }
    if (!existsSync(helperPath)) {
      throw new Error(`no Windows sandbox helper at ${helperPath}; a conformance row never falls back to another one.`);
    }
    helperStatus = JSON.parse(execFileSync(helperPath, ['status'], { encoding: 'utf8' })) as Record<string, unknown>;
    if (helperStatus['installed'] === false) {
      throw new Error('the Windows sandbox is not set up on this machine; run the helper `setup --for-user` elevated.');
    }
    sessionBefore = personSession(workerProbe);
    /* Chromium's GPU process needs exactly this; a session that refuses it before any row is not a baseline. */
    expect(sessionBefore.restrictedChild).toStrictEqual({ stage: 'exit', exitCode: '0x00000000' });
    observations['session'] = sessionBefore;
    proxyPorts = Array.isArray(helperStatus['proxyPorts']) ? (helperStatus['proxyPorts'] as number[]) : [];
    const resolved = await resolveShellExecutable({ platform: 'win32', environment: process.env });
    if ('status' in resolved) {
      throw new Error(resolved.message);
    }
    shell = resolved;
    if (windowsPowerShellPresent && realpathSync(windowsPowerShell).toLowerCase() !== shell.realPath.toLowerCase()) {
      windowsPowerShellIdentity = {
        kind: 'powershell',
        path: windowsPowerShell,
        realPath: realpathSync(windowsPowerShell),
        digest: digestOf(windowsPowerShell),
      };
    }
    root = realpathSync(mkdtempSync(join(tmpdir(), 'tau-shell-conformance-')));
    work = join(root, 'work');
    readonly = join(root, 'readonly');
    secret = join(root, 'secret');
    outside = join(root, 'outside');
    home = join(root, 'home');
    records = join(work, 'records');
    for (const directory of [
      work,
      readonly,
      secret,
      outside,
      records,
      join(home, '.ssh'),
      join(work, 'temp'),
      join(work, 'profile', 'AppData', 'Roaming'),
      join(work, 'profile', 'AppData', 'Local'),
    ]) {
      mkdirSync(directory, { recursive: true });
    }
    writeFileSync(join(readonly, 'granted.txt'), 'GRANTED-READ');
    writeFileSync(join(secret, 'canary.txt'), 'SECRET-CANARY');
    writeFileSync(join(outside, 'canary.txt'), 'OUTSIDE-CANARY');
    writeFileSync(join(home, 'notes.txt'), 'HOME-NOTES');
    writeFileSync(join(home, '.ssh', 'id_canary'), 'SSH-CANARY');
    writeFileSync(join(records, 'chat.json'), 'RECORD-ORIGINAL');
    /* The test user's own profile, outside every grant: the sandbox account must not read or write it. */
    profileCanaryDirectory = realpathSync(mkdtempSync(join(homedir(), 'tau-conformance-profile-')));
    writeFileSync(join(profileCanaryDirectory, 'canary.txt'), 'PROFILE-CANARY');
    custodyRoot = realpathSync(mkdtempSync(join(tmpdir(), 'tau-shell-custody-')));
    mkdirSync(join(custodyRoot, 'records'));
    mkdirSync(join(custodyRoot, 'sessions'));
    aclPaths = [
      root,
      work,
      readonly,
      join(readonly, 'granted.txt'),
      secret,
      join(secret, 'canary.txt'),
      outside,
      join(outside, 'canary.txt'),
      home,
      join(home, 'notes.txt'),
      join(home, '.ssh'),
      join(home, '.ssh', 'id_canary'),
      records,
      join(records, 'chat.json'),
      profileCanaryDirectory,
      join(profileCanaryDirectory, 'canary.txt'),
    ];
    aclBaseline = sddlOf(aclPaths);
    provider = createWindowsShellProvider({
      helperPath,
      custody: { directory: join(custodyRoot, 'records'), sessionDirectory: join(custodyRoot, 'sessions') },
      onHelperDiagnostic: recordHelperDiagnostic,
    });
    ready = true;
  });

  /* Every row ends with the person's session as it began: the same window-station, desktop and volume-root DACLs (as
     `setup` left them), a new process of theirs that starts and creates a window, and a Chromium-style restricted,
     Low-integrity child of theirs on an alternate desktop that starts and creates one too. NW02-NW04 also check it
     while their workers are live. */
  afterEach(() => {
    expect(personSession(workerProbe)).toStrictEqual(sessionBefore);
  });

  afterAll(() => {
    const path = process.env['TAU_SHELL_CONFORMANCE_RECEIPT'];
    if (path !== undefined && ready) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(receipt(), undefined, 2)}\n`);
    }
    for (const directory of [root, profileCanaryDirectory, custodyRoot]) {
      if (directory !== '') {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  conformance('W01', 'the fixed-path PowerShell runs in the sandbox and reports its version', async () => {
    const result = await run(shellVersionCommand('powershell'));

    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+/u);
    shellVersion = result.stdout.trim();
  });

  conformance(
    'W09',
    'status, quick and full, reads the install record with no SystemDrive, SystemRoot, windir, ProgramData or ALLUSERSPROFILE',
    async () => {
      statusWithoutSystemEnvironment(shell.path, helperPath, helperStatus['accountSid']);
    },
  );

  conformance(
    'W10',
    "a journal kept in denied app data under the person's profile on the system drive: the launch runs, the shell cannot read it, and it is restored",
    async () => {
      /* Tau's desktop keeps custody in Electron's userData (under the profile, on the system drive) and denies it whole. */
      const appData = mkdtempSync(join(homedir(), 'AppData', 'Local', 'tau-conformance-appdata-'));
      try {
        expect(appData.slice(0, 2).toUpperCase()).toBe((process.env['SystemDrive'] ?? 'C:').toUpperCase());
        const custody = join(appData, 'shell-custody');
        mkdirSync(custody);
        const kept = join(appData, 'kept.txt');
        writeFileSync(kept, 'APP-DATA\n');
        const before = sddlOf([appData, custody]);
        const through = createWindowsShellProvider({
          helperPath,
          custody: { directory: custody, sessionDirectory: join(custodyRoot, 'sessions') },
        });
        const filesystem = defaultFilesystem();
        const process_ = await start(
          launchOf(
            `[Console]::Write('ran;'); try { [void][IO.File]::ReadAllText(${quote(kept)}); [Console]::Write('read') } catch { [Console]::Write('denied') }`,
            { filesystem: { ...filesystem, denied: [...filesystem.denied, appData] } },
          ),
          through,
        );
        if (process_.kind !== 'pipes') {
          throw new Error('expected a pipes launch');
        }
        const [stdout, stderr, exit] = await Promise.all([
          text(process_.stdout),
          text(process_.stderr),
          process_.exited,
        ]);

        expect(exit, stderr).toStrictEqual({ exitCode: 0 });
        expect(stdout).toBe('ran;denied');
        /* The journal is gone once restored, and the denied root reads back as it was. */
        expect(readdirSync(custody).filter((name) => name.endsWith('.acl.json'))).toStrictEqual([]);
        expect(sddlOf([appData, custody])).toStrictEqual(before);
      } finally {
        rmSync(appData, { recursive: true, force: true });
      }
    },
  );

  conformance('W02', 'the receipt binds the shell kind, fixed path, real path and digest (I12)', async () => {
    const programFiles = process.env['ProgramFiles'] ?? String.raw`C:\Program Files`;
    const pwsh = join(programFiles, 'PowerShell', '7', 'pwsh.exe');
    const expected = existsSync(pwsh) ? pwsh : windowsPowerShell;

    expect(shell.kind).toBe('powershell');
    expect(shell.path.toLowerCase()).toBe(expected.toLowerCase());
    expect(shell.realPath.toLowerCase()).toBe(realpathSync(expected).toLowerCase());
    /* The digest is recomputed here from the bytes on disk, not taken from the resolver. */
    expect(shell.digest).toBe(digestOf(shell.realPath));
    const bound = receipt();

    expect(bound['shell']).toMatchObject({
      kind: 'powershell',
      path: shell.path,
      realPath: shell.realPath,
      digest: digestOf(shell.realPath),
    });
    expect((bound['provider'] as { helper: { digest: string } }).helper.digest).toBe(digestOf(helperPath));
    expect(provider.name.length).toBeGreaterThan(0);
  });

  /*
   * Module analysis cache (shell-service `shell-module-cache.ts`). A session reads its shell's cache read-only from a
   * folder the host made, with the service's `PSModulePath`; the T02 rows run that way, as a real session does. Each
   * shell's cache is built once in this suite, in one build launch running the service's build command, and the host
   * copies it outside every writable root. Timings are logged (`[T02]`, `[T02-cache]`) and kept in the receipt.
   */
  type ModuleCacheGrant = Readonly<{ modulePath: string; directory: string; file: string; digest: string }>;
  const moduleCaches = new Map<string, Promise<ModuleCacheGrant>>();
  const timingsOf = (label: string): Record<string, number> => {
    const evidence = (observations[`T02-cache-${label}`] ??= { timings: {} }) as { timings: Record<string, number> };
    return evidence.timings;
  };
  /*
   * The service's `PSModulePath` (`shellEnvironment`): the shell's own modules first; then Windows PowerShell's for
   * PowerShell 7, and the machine's `%ProgramFiles%\WindowsPowerShell\Modules` for Windows PowerShell 5.1, so that no
   * machine module folder the sandbox cannot list stops 5.1's auto-discovery before its built-in modules.
   */
  const serviceModulePath = (executablePath: string): string => {
    const home = dirname(executablePath);
    const windowsPowerShellHome = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0');
    const programFiles = process.env['ProgramW6432'] ?? process.env['ProgramFiles'] ?? String.raw`C:\Program Files`;
    return home.toLowerCase() === windowsPowerShellHome.toLowerCase()
      ? [join(home, 'Modules'), join(programFiles, 'WindowsPowerShell', 'Modules')].join(';')
      : [join(home, 'Modules'), join(windowsPowerShellHome, 'Modules')].join(';');
  };
  /*
   * The build's deadline here. Run 44014103911 measured 87.5 s for Windows PowerShell 5.1 and 14.2 s for PowerShell 7
   * on this hosted runner; 240 s is about 2.7 times the slower one. (The service allows 600 s, since a build there never
   * delays a launch.)
   */
  const buildMilliseconds = 240_000;
  const buildModuleCache = async (executablePath: string, label: string): Promise<ModuleCacheGrant> => {
    const modulePath = serviceModulePath(executablePath);
    const build = join(work, `module-cache-${label}`);
    mkdirSync(build, { recursive: true });
    const written = join(build, powerShellModuleCacheFile);
    const started = Date.now();
    const built = await run(powerShellModuleCacheCommand, {
      executablePath,
      environment: { ...baseEnvironment(), PSModulePath: modulePath, [powerShellModuleCacheVariable]: written },
      signal: AbortSignal.timeout(buildMilliseconds),
    });
    timingsOf(label)['build'] = Date.now() - started;
    console.info(`[T02-cache] ${executablePath} build ${String(timingsOf(label)['build'])} ms`);

    expect(built.exitCode, built.stderr).toBe(0);
    expect(sizeOf(written), 'the build wrote no module analysis cache').toBeGreaterThan(0);
    (observations[`T02-cache-${label}`] as Record<string, unknown>)['bytes'] = sizeOf(written);
    const directory = join(root, `module-cache-${label}`);
    const file = join(directory, powerShellModuleCacheFile);
    mkdirSync(directory, { recursive: true });
    copyFileSync(written, file);
    return { modulePath, directory, file, digest: digestOf(file) };
  };
  /** The shell's cache, built on first use; a failed build fails every row that reads it. */
  const moduleCacheOf = async (executablePath: string, label: string): Promise<ModuleCacheGrant> => {
    let grant = moduleCaches.get(executablePath);
    if (grant === undefined) {
      grant = buildModuleCache(executablePath, label);
      moduleCaches.set(executablePath, grant);
    }
    return grant;
  };
  /** A session's launch: the service's `PSModulePath` and the cache folder readable and read-only. */
  const session = (grant: ModuleCacheGrant, extraModules: readonly string[] = []): Partial<ShellLaunch> => ({
    environment: {
      ...baseEnvironment(),
      PSModulePath: [grant.modulePath, ...extraModules].join(';'),
      [powerShellModuleCacheVariable]: grant.file,
    },
    filesystem: {
      ...defaultFilesystem(),
      readable: [...defaultFilesystem().readable, grant.directory, ...extraModules],
      readOnly: [grant.directory],
    },
  });
  /** Neither a session nor a launch that missed the cache may change it or add to its folder. */
  const expectCacheUnchanged = (grant: ModuleCacheGrant): void => {
    expect(digestOf(grant.file), 'a session changed the read-only cache').toBe(grant.digest);
    expect(readdirSync(grant.directory)).toStrictEqual([powerShellModuleCacheFile]);
  };
  /*
   * A session launch's bound. Run 44014103911 (hosted windows-2025) measured cached launches at 0.33 to 3.4 s: Windows
   * PowerShell 5.1's slowest a launch that missed the cache (3.4 s), its cmdlet-resolving ones 1.95 s, PowerShell 7's
   * slowest 1.5 s. Uncached, 5.1 took 22.5 s for the pipeline. 10 s is about three times the slowest cached launch,
   * room for hosted-runner noise, and under half the uncached one, so a cache that stops working fails the row.
   */
  const sessionMilliseconds = 10_000;
  /*
   * Rows that may build a cache: the build's 240 s deadline, one uncached pipeline (22.5 s measured), and up to five
   * session launches at their 10 s bound: 240 + 22.5 + 50 = 312.5 s, so these rows get 330 s.
   */
  const cacheConformance = conformanceWithin(330_000);

  /**
   * Context for a pipeline that could not find `Measure-Object`: `module-diagnostics.fixture.ps1`, which only reads and
   * prints what decides whether command discovery finds `Microsoft.PowerShell.Utility`, run in the failing launch's
   * sandbox, again there with no cache, and with no cache outside the sandbox as the test user. No variant can write a
   * cache: the session one reads the read-only cache, and the cold ones name a path under the shell's executable file.
   */
  const moduleDiagnosticsScript = readFileSync(join(import.meta.dirname, 'module-diagnostics.fixture.ps1'), 'utf8');
  const moduleDiagnostics = async (executablePath: string, overrides: Partial<ShellLaunch>): Promise<string> => {
    const environment = overrides.environment ?? baseEnvironment();
    /*
     * A cache "inside" the shell's own executable file: PowerShell finds no cache, and neither its folder creation nor
     * its write can succeed, since a file already holds that folder's name.
     */
    const cold = { ...environment, [powerShellModuleCacheVariable]: join(executablePath, powerShellModuleCacheFile) };
    const diagnose = async (label: string, launch: Partial<ShellLaunch>): Promise<string> => {
      try {
        const result = await run(moduleDiagnosticsScript, { executablePath, ...launch });
        return `[module diagnostics, ${label}, exit ${String(result.exitCode)}]\n${result.stdout.trim()}\n${result.stderr.trim()}`;
      } catch (error) {
        return `[module diagnostics, ${label}, failed] ${error instanceof Error ? error.message : String(error)}`;
      }
    };
    /* One after another: the provider runs one sandboxed shell at a time. */
    const sections: string[] = [];
    if (environment[powerShellModuleCacheVariable] !== undefined) {
      sections.push(await diagnose('session', overrides));
    }
    sections.push(await diagnose('cold', { ...overrides, environment: cold }));
    try {
      const outside = execFileSync(
        executablePath,
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', moduleDiagnosticsScript],
        { encoding: 'utf8', env: cold, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 },
      );
      sections.push(`[module diagnostics, cold, outside the sandbox]\n${outside.trim()}`);
    } catch (error) {
      sections.push(
        `[module diagnostics, cold, outside the sandbox, failed] ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return sections.join('\n');
  };

  /** T02: the language cases in a session's launch, decided by comparing stdout and the exit status outside the sandbox. */
  const grammar = async (executablePath: string, label: string): Promise<void> => {
    const grant = await moduleCacheOf(executablePath, label);
    const of = async (command: string) => {
      const started = Date.now();
      const result = await run(command, { executablePath, ...session(grant) });
      const elapsed = Date.now() - started;
      console.info(`[T02] ${executablePath} ${JSON.stringify(command.slice(0, 24))} ${String(elapsed)} ms`);

      expect(elapsed, `${command.slice(0, 24)} took ${String(elapsed)} ms`).toBeLessThan(sessionMilliseconds);
      return result;
    };
    const hereString = await of("@'\nline1\nline2\n'@");

    expect(hereString.exitCode, hereString.stderr).toBe(0);
    expect(hereString.stdout.trim()).toBe('line1\nline2');
    const pipeline = await of("'a b c' -split ' ' | Measure-Object | ForEach-Object Count");

    expect(
      pipeline.stdout.trim(),
      pipeline.stdout.trim() === '3'
        ? pipeline.stderr
        : `${pipeline.stderr}\n${await moduleDiagnostics(executablePath, session(grant))}`,
    ).toBe('3');
    const subexpression = await of('Write-Output "val=$(2 + 3)"');

    expect(subexpression.stdout.trim()).toBe('val=5');
    const exit = await of('exit 7');

    expect(exit.exitCode).toBe(7);
    /* UTF-8 on stdout: the bytes are set explicitly, and a non-ASCII argument reaches the shell intact. */
    const utf8 = await of(
      "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); [Console]::Write([string][char]0xE9 + [char]0x2603 + '-' + 'café☃'.Length)",
    );

    expect(utf8.exitCode, utf8.stderr).toBe(0);
    expect(utf8.stdout).toBe('é☃-5');
    expectCacheUnchanged(grant);
  };

  /**
   * T02-cache: the cache itself. An uncached launch with the service's `PSModulePath` is the baseline (logged, and
   * required to answer correctly); then the build, and session launches that must answer correctly within their bound.
   * A launch whose `PSModulePath` adds a module the build never saw makes PowerShell analyse it and try to write the
   * cache back: that must fail quietly and leave the cache as it was.
   */
  const moduleCache = async (executablePath: string, label: string): Promise<void> => {
    const timings = timingsOf(label);
    const timed = async (phase: string, command: string, overrides: Partial<ShellLaunch>) => {
      const started = Date.now();
      const result = await run(command, { executablePath, ...overrides });
      timings[phase] = Date.now() - started;
      console.info(`[T02-cache] ${executablePath} ${phase} ${String(timings[phase])} ms`);
      return result;
    };
    const pipeline = "'a b c' -split ' ' | Measure-Object | ForEach-Object Count";
    const cold = await timed('cold', pipeline, {
      environment: { ...baseEnvironment(), PSModulePath: serviceModulePath(executablePath) },
    });

    expect(
      cold.stdout.trim(),
      cold.stdout.trim() === '3'
        ? cold.stderr
        : `${cold.stderr}\n${await moduleDiagnostics(executablePath, {
            environment: { ...baseEnvironment(), PSModulePath: serviceModulePath(executablePath) },
          })}`,
    ).toBe('3');
    const grant = await moduleCacheOf(executablePath, label);
    const modules = join(root, `module-probe-${label}`);
    mkdirSync(join(modules, 'TauConformanceProbe'), { recursive: true });
    writeFileSync(
      join(modules, 'TauConformanceProbe', 'TauConformanceProbe.psd1'),
      "@{ ModuleVersion = '1.0'; FunctionsToExport = @(); CmdletsToExport = @(); AliasesToExport = @(); VariablesToExport = @() }\n",
    );
    const cases = [
      { phase: 'cached-here-string', command: "@'\nline1\nline2\n'@", expected: 'line1\nline2', extra: [] },
      { phase: 'cached-pipeline', command: pipeline, expected: '3', extra: [] },
      { phase: 'cached-subexpression', command: 'Write-Output "val=$(2 + 3)"', expected: 'val=5', extra: [] },
      {
        phase: 'cached-miss',
        command: "Get-Command -Name Tau-NoSuchCommand -ErrorAction SilentlyContinue; 'done'",
        expected: 'done',
        extra: [modules],
      },
    ];
    for (const { phase, command, expected, extra } of cases) {
      // oxlint-disable-next-line no-await-in-loop -- the provider admits one launch at a time.
      const result = await timed(phase, command, session(grant, extra));

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout.trim(), result.stderr).toBe(expected);
      expect(result.stderr).not.toMatch(/ModuleAnalysisCache|UnauthorizedAccess|Access to the path/iu);
      expect(timings[phase], `${phase} took ${String(timings[phase])} ms`).toBeLessThan(sessionMilliseconds);
    }
    expectCacheUnchanged(grant);
  };

  /* The cache rows run first: they hold the uncached baseline and build the caches the grammar rows then read. */
  cacheConformance(
    'T02-cache',
    'a module analysis cache built once is read, read-only, by later launches of the resolved shell',
    async () => {
      await moduleCache(shell.path, 'shell');
    },
  );

  if (windowsPowerShellPresent) {
    cacheConformance(
      'T02-cache-ps51',
      'the same module analysis cache on Windows PowerShell 5.1 at its fixed path',
      async () => {
        if (windowsPowerShellIdentity === undefined) {
          /* The resolved shell is 5.1 itself; T02-cache already ran on it. */
          expect(shell.realPath.toLowerCase()).toBe(realpathSync(windowsPowerShell).toLowerCase());
          return;
        }
        await moduleCache(windowsPowerShell, 'ps51');
      },
    );
  }

  cacheConformance(
    'T02-pwsh',
    'PowerShell grammar: here-string, pipeline, subexpression, exit status, UTF-8',
    async () => {
      await grammar(shell.path, 'shell');
    },
  );

  if (windowsPowerShellPresent) {
    cacheConformance('T02-ps51', 'the same grammar on Windows PowerShell 5.1 at its fixed path', async () => {
      if (windowsPowerShellIdentity === undefined) {
        /* The resolved shell is 5.1 itself; T02-pwsh already ran on it. */
        expect(shell.realPath.toLowerCase()).toBe(realpathSync(windowsPowerShell).toLowerCase());
        return;
      }
      await grammar(windowsPowerShell, 'ps51');
    });
  }

  conformance(
    'W03',
    'granted roots read and write; readable-only, denied, read-only and profile paths do not, ACLs unchanged',
    async () => {
      const filesystem = { ...defaultFilesystem(), readOnly: [records] };
      /* Each read probe copies what it read into its own file in the writable root: the copy is what is judged. */
      const readProbe = (name: string, path: string): string =>
        `try { Get-Content -LiteralPath ${quote(path)} -Raw -ErrorAction Stop | Set-Content -LiteralPath ${quote(join(work, `read-${name}.txt`))} -NoNewline -ErrorAction Stop } catch { }`;
      const writeProbe = (path: string): string =>
        `try { Set-Content -LiteralPath ${quote(path)} -Value FORGED -NoNewline -ErrorAction Stop } catch { }`;
      const positive = await run(
        [
          readProbe('granted', join(readonly, 'granted.txt')),
          readProbe('notes', join(home, 'notes.txt')),
          readProbe('record', join(records, 'chat.json')),
          `Set-Content -LiteralPath ${quote(join(work, 'out.txt'))} -Value WROTE -NoNewline`,
        ].join('\n'),
        { filesystem },
      );

      expect(positive.exitCode, positive.stderr).toBe(0);
      expect(readFileSync(join(work, 'read-granted.txt'), 'utf8')).toBe('GRANTED-READ');
      expect(readFileSync(join(work, 'read-notes.txt'), 'utf8')).toBe('HOME-NOTES');
      expect(readFileSync(join(work, 'read-record.txt'), 'utf8')).toBe('RECORD-ORIGINAL');
      expect(readFileSync(join(work, 'out.txt'), 'utf8')).toBe('WROTE');

      const denied = {
        secret: join(secret, 'canary.txt'),
        ssh: join(home, '.ssh', 'id_canary'),
        outside: join(outside, 'canary.txt'),
        profile: join(profileCanaryDirectory, 'canary.txt'),
      };
      const written = [
        join(readonly, 'written.txt'),
        join(readonly, 'granted.txt'),
        join(outside, 'written.txt'),
        join(secret, 'canary.txt'),
        join(home, '.ssh', 'id_canary'),
        join(records, 'chat.json'),
        join(records, 'new.json'),
        join(profileCanaryDirectory, 'canary.txt'),
        join(profileCanaryDirectory, 'written.txt'),
      ];
      const before = Object.fromEntries(written.map((path) => [path, stateOf(path)]));
      const negative = await run(
        [
          ...Object.entries(denied).map(([name, path]) => readProbe(name, path)),
          ...written.map((path) => writeProbe(path)),
          `try { Move-Item -LiteralPath ${quote(join(records, 'chat.json'))} -Destination ${quote(join(work, 'moved.json'))} -ErrorAction Stop } catch { }`,
          `try { Remove-Item -LiteralPath ${quote(records)} -Recurse -Force -ErrorAction Stop } catch { }`,
          `try { Remove-Item -LiteralPath ${quote(join(readonly, 'granted.txt'))} -Force -ErrorAction Stop } catch { }`,
          `Set-Content -LiteralPath ${quote(join(work, 'negative-ran.txt'))} -Value ran -NoNewline`,
        ].join('\n'),
        { filesystem },
      );

      /* The probes ran (positive control inside the negative launch), and the bytes outside judge every one. */
      expect(readFileSync(join(work, 'negative-ran.txt'), 'utf8'), negative.stderr).toBe('ran');
      expect(Object.keys(denied).filter((name) => existsSync(join(work, `read-${name}.txt`)))).toStrictEqual([]);
      expect(negative.stdout).not.toMatch(/CANARY/u);
      expect(Object.fromEntries(written.map((path) => [path, stateOf(path)]))).toStrictEqual(before);
      expect(existsSync(join(work, 'moved.json'))).toBe(false);
      expect(readFileSync(join(records, 'chat.json'), 'utf8')).toBe('RECORD-ORIGINAL');
      expect(readFileSync(join(readonly, 'granted.txt'), 'utf8')).toBe('GRANTED-READ');
      /* Every path the two launches granted, denied or probed carries exactly the descriptor it had before. */
      expect(sddlOf(aclPaths)).toStrictEqual(aclBaseline);
    },
  );

  conformance(
    'W04',
    'baseline outbound is refused, judged by TCP and UDP listeners on an interface and on loopback',
    async () => {
      const address = interfaceAddress();
      if (address === undefined) {
        throw new Error('this host has no non-loopback IPv4 interface to place the outbound canary on.');
      }
      const [remoteTcp, loopbackTcp, remoteUdp, loopbackUdp] = await Promise.all([
        tcpCanary(address),
        tcpCanary('127.0.0.1'),
        udpCanary(address),
        udpCanary('127.0.0.1'),
      ]);
      try {
        const ports = [remoteTcp.port, loopbackTcp.port, remoteUdp.port, loopbackUdp.port];

        expect(ports.filter((port) => proxyPorts.includes(port))).toStrictEqual([]);
        /* Controls: each listener counts a client from outside the sandbox. */
        await tcpControl(address, remoteTcp.port);
        await tcpControl('127.0.0.1', loopbackTcp.port);
        await udpControl(address, remoteUdp.port);
        await udpControl('127.0.0.1', loopbackUdp.port);
        expect(await waitUntil(() => remoteUdp.datagrams() === 1 && loopbackUdp.datagrams() === 1, 5000)).toBe(true);

        expect([remoteTcp.connections(), loopbackTcp.connections()]).toStrictEqual([1, 1]);
        const tcp = (host: string, port: number): string =>
          `try { $c = [System.Net.Sockets.TcpClient]::new(); [void]$c.ConnectAsync(${quote(host)}, ${String(port)}).Wait(5000); $c.Dispose() } catch { }`;
        const udp = (host: string, port: number): string =>
          `try { $u = [System.Net.Sockets.UdpClient]::new(); [void]$u.Send([byte[]](1,2,3), 3, ${quote(host)}, ${String(port)}); $u.Dispose() } catch { }`;
        const http = (host: string, port: number): string =>
          `try { [void](Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri 'http://${host}:${String(port)}/') } catch { }`;
        const result = await run(
          [
            tcp(address, remoteTcp.port),
            tcp('127.0.0.1', loopbackTcp.port),
            http(address, remoteTcp.port),
            http('127.0.0.1', loopbackTcp.port),
            udp(address, remoteUdp.port),
            udp('127.0.0.1', loopbackUdp.port),
            `Set-Content -LiteralPath ${quote(join(work, 'network-ran.txt'))} -Value ran -NoNewline`,
          ].join('\n'),
        );
        await delay(1000);

        expect(readFileSync(join(work, 'network-ran.txt'), 'utf8'), result.stderr).toBe('ran');
        /* The listeners are the judge: still only the controls. */
        expect({
          remoteTcp: remoteTcp.connections(),
          loopbackTcp: loopbackTcp.connections(),
          remoteUdp: remoteUdp.datagrams(),
          loopbackUdp: loopbackUdp.datagrams(),
        }).toStrictEqual({ remoteTcp: 1, loopbackTcp: 1, remoteUdp: 1, loopbackUdp: 1 });
      } finally {
        remoteTcp.server.close();
        loopbackTcp.server.close();
        remoteUdp.socket.close();
        loopbackUdp.socket.close();
      }

      const marker = join(work, 'network-domains-ran.txt');
      const outcome = await prepared(
        launchOf(`Set-Content -LiteralPath ${quote(marker)} -Value ran`, {
          network: { domains: ['granted.tau-qualification.test'] },
        }),
      );

      expect(outcome).toMatchObject({ status: 'unsupported', requirement: 'network-isolation' });
      expect(existsSync(marker)).toBe(false);
    },
  );

  /** Every way a sandboxed PowerShell opens a pipe client; the server outside counts what got through. */
  const pipeProbe = async (name: string, marker: string): Promise<{ stderr: string }> => {
    const client = (direction: string): string =>
      `try { $p = [System.IO.Pipes.NamedPipeClientStream]::new('.', ${quote(name)}, '${direction}'); $p.Connect(3000); $p.Dispose() } catch { }`;
    return run(
      [
        client('InOut'),
        client('In'),
        client('Out'),
        `try { $f = [System.IO.File]::Open(${quote(`\\\\.\\pipe\\${name}`)}, 'Open', 'Read'); $f.Dispose() } catch { }`,
        `Set-Content -LiteralPath ${quote(join(work, marker))} -Value ran -NoNewline`,
      ].join('\n'),
    );
  };

  conformance('A22', 'a named pipe whose DACL grants Everyone is never reached from the sandbox', async () => {
    const server = await pipeServer('everyone');
    try {
      await pipeControl(server.name);

      expect(await waitUntil(() => server.connections() === 1, 5000)).toBe(true);
      const result = await pipeProbe(server.name, 'pipe-ran.txt');
      await delay(1000);

      expect(readFileSync(join(work, 'pipe-ran.txt'), 'utf8'), result.stderr).toBe('ran');
      /* The server is the judge: the control client and nothing else. */
      expect(server.connections()).toBe(1);
    } finally {
      await server.stop();
    }
  });

  conformance(
    'A22-default',
    "a named pipe with the person's default DACL (Everyone may read) is never reached from the sandbox",
    async () => {
      const server = await pipeServer('default');
      try {
        await pipeControl(server.name);

        expect(await waitUntil(() => server.connections() === 1, 5000)).toBe(true);
        const result = await pipeProbe(server.name, 'pipe-default-ran.txt');
        await delay(1000);

        expect(readFileSync(join(work, 'pipe-default-ran.txt'), 'utf8'), result.stderr).toBe('ran');
        expect(server.connections()).toBe(1);
      } finally {
        await server.stop();
      }
    },
  );

  conformance(
    'W08',
    'the shell runs in a fresh AppContainer per launch: lowbox token, only the volume capability, write-restricted, Low integrity',
    async () => {
      const { accountSid, volumeCapabilitySid, volumeRootsGranted } = helperStatus;

      expect(typeof accountSid).toBe('string');
      /* The volume capability: a capability SID derived from Tau's fixed name, granted on the volume roots. */
      expect(volumeCapabilitySid).toMatch(/^S-1-15-3-1024(?:-\d+){8}$/u);
      expect(volumeRootsGranted).toBe(true);
      /* One launch that parks once it has recorded its PID and the environment it sees, so its token is read live. */
      const observeLaunch = async (
        tag: string,
      ): Promise<{
        token: ShellToken;
        seen: Record<string, string | number>;
        ended: Awaited<ReturnType<typeof run>>;
      }> => {
        const sync = join(work, `w08-${tag}`);
        mkdirSync(sync, { recursive: true });
        const parked = run(
          [
            `$seen = @{ pid = $PID; TEMP = $env:TEMP; LOCALAPPDATA = $env:LOCALAPPDATA; APPDATA = $env:APPDATA } | ConvertTo-Json -Compress`,
            atomicWrite(quote(join(sync, 'seen.json')), '$seen'),
            `while (-not (Test-Path -LiteralPath ${quote(join(sync, 'release'))})) { Start-Sleep -Milliseconds 50 }`,
          ].join('\n'),
          { commandId: `conformance#w08-${tag}` },
        );
        const release = async (): Promise<Awaited<ReturnType<typeof run>>> => {
          writeFileSync(join(sync, 'release'), '');
          return parked;
        };
        try {
          await Promise.race([waitUntil(() => existsSync(join(sync, 'seen.json')), 30_000), parked]);
          if (!existsSync(join(sync, 'seen.json'))) {
            throw new Error(`the ${tag} launch recorded no PID: ${JSON.stringify(await release())}`);
          }
          const seen = JSON.parse(readFileSync(join(sync, 'seen.json'), 'utf8')) as Record<string, string | number>;
          const token = shellTokenOf(Number(seen['pid']));
          return { token, seen, ended: await release() };
        } catch (error) {
          await release().catch(() => undefined);
          throw error;
        }
      };
      const first = await observeLaunch('first');
      const second = await observeLaunch('second');
      observations['W08-token'] = first.token;
      observations['W08-environment'] = first.seen;

      for (const { token, ended } of [first, second]) {
        expect(ended.exitCode, ended.stderr).toBe(0);
        /* The process the PID names is this sandbox's shell: the sandbox account running the fixed-path PowerShell. */
        expect(token.user).toBe(accountSid);
        expect(token.image.toLowerCase()).toBe(shell.path.toLowerCase());
        expect(token.isAppContainer).toBe(true);
        expect(token.package).toMatch(/^S-1-15-2(?:-\d+){7}$/u);
        /* Exactly one capability: Tau's volume capability, granted on the volume roots by `setup`. */
        expect(token.capabilities).toStrictEqual([volumeCapabilitySid]);
        /* Still write-restricted: the launch's capability SID, the runner's logon SID and Everyone. */
        expect(token.restricted).toHaveLength(3);
        expect(token.restricted).toContain('S-1-1-0');
        expect(token.restricted.filter((sid) => /^S-1-5-21(?:-\d+){4}$/u.test(sid))).toHaveLength(1);
        expect(token.restricted.filter((sid) => /^S-1-5-5-\d+-\d+$/u.test(sid))).toHaveLength(1);
        expect(token.integrity).toBe('S-1-16-4096');
      }
      /* Per launch: nothing granted to one launch's package reaches the next. */
      expect(second.token.package).not.toBe(first.token.package);
      /* The AppContainer does not redirect the environment the host gave the shell. */
      const given = baseEnvironment();

      const names = ['TEMP', 'LOCALAPPDATA', 'APPDATA'] as const;

      expect(Object.fromEntries(names.map((name) => [name, first.seen[name]]))).toStrictEqual(
        Object.fromEntries(names.map((name) => [name, given[name]])),
      );
    },
  );

  /**
   * A24's escape set: a detached `Start-Process`, a `Start-Job`, a `CREATE_BREAKAWAY_FROM_JOB` child and a WMI
   * `Win32_Process.Create` child, each a writer that appends to its own sentinel and records its own PID there.
   */
  const escapes = (
    prefix: string,
  ): { sentinels: Record<string, string>; pids: Record<string, string>; command: string } => {
    const names = ['detached', 'job', 'breakaway', 'wmi'] as const;
    const sentinels = Object.fromEntries(names.map((name) => [name, join(work, `${prefix}-${name}.beat`)]));
    const pids = Object.fromEntries(names.map((name) => [name, join(work, `${prefix}-${name}.pid`)]));
    const writer = (name: (typeof names)[number]): string =>
      `${atomicWrite(quote(pids[name]!), '"$PID"')}; while ($true) { Add-Content -LiteralPath ${quote(sentinels[name]!)} -Value b -NoNewline; Start-Sleep -Milliseconds 100 }`;
    const argumentsOf = (name: (typeof names)[number]): string =>
      `-NoLogo -NoProfile -NonInteractive -EncodedCommand ${encoded(writer(name))}`;
    const breakaway = [
      'using System; using System.Runtime.InteropServices; using System.Text;',
      'public static class TauBreakaway {',
      '  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct StartupInfo {',
      '    public int cb; public string reserved; public string desktop; public string title;',
      '    public int x, y, xSize, ySize, xChars, yChars, fill, flags; public short show, reserved2;',
      '    public IntPtr reserved3, input, output, error; }',
      '  [StructLayout(LayoutKind.Sequential)] struct ProcessInformation { public IntPtr process, thread; public int pid, tid; }',
      '  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]',
      '  static extern bool CreateProcessW(string application, StringBuilder command, IntPtr processAttributes,',
      '    IntPtr threadAttributes, bool inherit, uint flags, IntPtr environment, string directory,',
      '    ref StartupInfo startup, out ProcessInformation information);',
      '  public static string Start(string application, string command) {',
      '    var startup = new StartupInfo(); startup.cb = Marshal.SizeOf(typeof(StartupInfo)); ProcessInformation information;',
      '    // CREATE_BREAKAWAY_FROM_JOB | CREATE_NO_WINDOW',
      '    bool started = CreateProcessW(application, new StringBuilder(command), IntPtr.Zero, IntPtr.Zero, false,',
      '      0x01000000 | 0x08000000, IntPtr.Zero, null, ref startup, out information);',
      '    return started ? "started " + information.pid : "refused " + Marshal.GetLastWin32Error(); } }',
    ].join('\n');
    const started = (name: string): string =>
      `((Test-Path -LiteralPath ${quote(sentinels[name]!)}) -and (Get-Item -LiteralPath ${quote(sentinels[name]!)}).Length -gt 0)`;
    const command = [
      `$exe = ${quote(shell.path)}`,
      `Start-Process -FilePath $exe -ArgumentList ${quote(argumentsOf('detached'))} -WindowStyle Hidden`,
      `$job = Start-Job -ScriptBlock ([scriptblock]::Create(${quote(writer('job'))}))`,
      `try { Add-Type -TypeDefinition ${quote(breakaway)}; Write-Output ('breakaway ' + [TauBreakaway]::Start($exe, ('"' + $exe + '" ' + ${quote(argumentsOf('breakaway'))}))) } catch { Write-Output ('breakaway error ' + $_.Exception.Message) }`,
      `try { $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = ('"' + $exe + '" ' + ${quote(argumentsOf('wmi'))}) } -ErrorAction Stop; Write-Output ('wmi ' + $r.ReturnValue + ' ' + $r.ProcessId) } catch { Write-Output ('wmi error ' + $_.Exception.Message) }`,
      /* Wait, bounded, for the two writers that must start; the escapes get a few more seconds to show themselves. */
      `$deadline = (Get-Date).AddSeconds(25); while ((Get-Date) -lt $deadline -and -not (${started('detached')} -and ${started('job')})) { Start-Sleep -Milliseconds 100 }`,
      `$deadline = (Get-Date).AddSeconds(3); while ((Get-Date) -lt $deadline -and -not (${started('breakaway')} -and ${started('wmi')})) { Start-Sleep -Milliseconds 100 }`,
      /* Context only, for a job that never ran: its state and the reason PowerShell gives. */
      `Write-Output ('job ' + $job.State + ' ' + $job.ChildJobs[0].JobStateInfo.Reason)`,
    ].join('\n');
    return { sentinels, pids, command };
  };

  /** The PIDs a writer recorded, and any the sandboxed command reported, for the external process-table check. */
  const escapePids = (pids: Record<string, string>, stdout: string): number[] =>
    [
      ...Object.values(pids)
        .filter((path) => existsSync(path))
        .map((path) => Number(readFileSync(path, 'utf8').trim())),
      ...[...stdout.matchAll(/^(?:breakaway started|wmi 0) (\d+)$/gmu)].map((match) => Number(match[1])),
    ].filter((pid) => Number.isInteger(pid) && pid > 0);

  const sizesOf = (sentinels: Record<string, string>): Record<string, number> =>
    Object.fromEntries(Object.entries(sentinels).map(([name, path]) => [name, sizeOf(path)]));

  conformance(
    'A24',
    'a detached process, a job, a breakaway child and a WMI child all die with a session that exits',
    async () => {
      const exited = escapes('a24-exit');
      const result = await run([exited.command, 'exit 0'].join('\n'));
      observations['A24-exit'] = result.stdout.trim();
      const settled = sizesOf(exited.sentinels);

      expect(result.exitCode, result.stderr).toBe(0);
      /* Positive controls: the detached process and the job really ran inside the session. */
      expect(
        [settled['detached']! > 0, settled['job']! > 0],
        `${JSON.stringify(settled)} ${result.stdout}`,
      ).toStrictEqual([true, true]);
      await delay(1500);

      expect(sizesOf(exited.sentinels)).toStrictEqual(settled);
      const exitedPids = escapePids(exited.pids, result.stdout);

      expect(exitedPids.filter((pid) => alive(pid))).toStrictEqual([]);
    },
  );

  conformance('A24-abort', 'the same escapes all die with a session that is aborted while it runs', async () => {
    const aborted = escapes('a24-abort');
    const controller = new AbortController();
    const process_ = await start(
      launchOf([aborted.command, 'Start-Sleep -Seconds 300'].join('\n'), { signal: controller.signal }),
    );
    if (process_.kind !== 'pipes') {
      throw new Error('expected a pipes launch');
    }
    const stdout = text(process_.stdout);
    try {
      expect(
        await waitUntil(
          () => sizeOf(aborted.sentinels['detached']!) > 0 && sizeOf(aborted.sentinels['job']!) > 0,
          30_000,
        ),
      ).toBe(true);
      await delay(3500);
    } finally {
      // A failed positive control still stops the launch.
      controller.abort();
      await process_.exited;
    }
    const output = await stdout;
    observations['A24-abort'] = output.trim();
    const stopped = sizesOf(aborted.sentinels);
    await delay(1500);

    expect(sizesOf(aborted.sentinels)).toStrictEqual(stopped);
    expect(escapePids(aborted.pids, output).filter((pid) => alive(pid))).toStrictEqual([]);
  });

  conformance(
    'A23',
    'a second launch runs to completion beside a live first one, over the same workspace',
    async () => {
      const sync = join(work, 'a23');
      mkdirSync(sync, { recursive: true });
      const first = run(
        [
          `Set-Content -LiteralPath ${quote(join(sync, 'ready'))} -Value ready -NoNewline`,
          `while (-not (Test-Path -LiteralPath ${quote(join(sync, 'release'))})) { Start-Sleep -Milliseconds 50 }`,
          `Set-Content -LiteralPath ${quote(join(sync, 'first-done'))} -Value done -NoNewline`,
        ].join('\n'),
        { commandId: 'conformance#a23-first' },
      );
      try {
        expect(await waitUntil(() => existsSync(join(sync, 'ready')), 30_000)).toBe(true);
        /* Concurrent launches (README "Sessions"): the second grants the same workspace and ends first. */
        const second = await run(`Set-Content -LiteralPath ${quote(join(sync, 'second-ran'))} -Value ran -NoNewline`, {
          commandId: 'conformance#a23-second',
        });

        expect(second.exitCode, second.stderr).toBe(0);
        expect(readFileSync(join(sync, 'second-ran'), 'utf8')).toBe('ran');
        /* The second's restore left the first's grants: it still writes where it was granted. */
        expect(existsSync(join(sync, 'first-done'))).toBe(false);
      } finally {
        writeFileSync(join(sync, 'release'), '');
        await first.catch(() => undefined);
      }
      const ended = await first;

      expect(ended.exitCode, ended.stderr).toBe(0);
      expect(readFileSync(join(sync, 'first-done'), 'utf8')).toBe('done');
    },
  );

  conformance(
    'A26',
    'a PowerShell copy under the profile or a .cmd shim is shell-missing or refused, and nothing starts',
    async () => {
      const fake = realpathSync(mkdtempSync(join(homedir(), 'tau-conformance-a26-')));
      try {
        const fakeProgramFiles = join(fake, 'Program Files');
        const fakeSystemRoot = join(fake, 'Windows');
        mkdirSync(join(fakeProgramFiles, 'PowerShell', '7'), { recursive: true });
        mkdirSync(join(fakeSystemRoot, 'System32', 'WindowsPowerShell', 'v1.0'), { recursive: true });
        const copiedPwsh = join(fakeProgramFiles, 'PowerShell', '7', 'pwsh.exe');
        const copiedWindowsPowerShell = join(fakeSystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
        copyFileSync(shell.realPath, copiedPwsh);
        if (windowsPowerShellPresent) {
          copyFileSync(windowsPowerShell, copiedWindowsPowerShell);
        }
        const resolved = await resolveShellExecutable({
          platform: 'win32',
          environment: { ...process.env, ProgramFiles: fakeProgramFiles, SystemRoot: fakeSystemRoot },
        });

        expect(resolved).toMatchObject({ status: 'shell-missing' });
        const shim = join(fake, 'pwsh.cmd');
        const marker = join(work, 'a26-ran');
        writeFileSync(shim, `@echo ran> "${marker}-shim"\r\n`);
        /* The 5.1 copy runs from anywhere, so only a refusal keeps its marker absent. */
        const candidates = [copiedPwsh, ...(windowsPowerShellPresent ? [copiedWindowsPowerShell] : []), shim];
        const outcomes: Record<string, ShellLaunchOutcome['status']> = {};
        for (const [index, executablePath] of candidates.entries()) {
          // oxlint-disable-next-line no-await-in-loop -- one refused executable at a time, each judged by its marker.
          const outcome = await prepared({
            ...launchOf(`Set-Content -LiteralPath ${quote(`${marker}-${String(index)}`)} -Value ran`),
            executablePath,
          });
          outcomes[executablePath] = outcome.status;
          if (outcome.status === 'started') {
            // oxlint-disable-next-line no-await-in-loop -- stop what should never have started before judging it.
            await outcome.process.terminate();
          }
        }

        expect(
          Object.values(outcomes).filter((status) => status === 'started'),
          JSON.stringify(outcomes),
        ).toStrictEqual([]);
        expect(candidates.map((_, index) => existsSync(`${marker}-${String(index)}`))).toStrictEqual(
          candidates.map(() => false),
        );
        expect(existsSync(`${marker}-shim`)).toBe(false);
      } finally {
        rmSync(fake, { recursive: true, force: true });
      }
    },
  );

  conformance(
    'E17',
    'a missing or corrupt helper leaves the capability unavailable, never an unsandboxed substitute',
    async () => {
      const corrupt = join(custodyRoot, 'corrupt-helper.exe');
      writeFileSync(corrupt, 'not an executable\n');
      for (const [name, path] of [
        ['missing', join(custodyRoot, 'missing-helper.exe')],
        ['corrupt', corrupt],
      ] as const) {
        const marker = join(work, `e17-ran-${name}`);
        const through = createWindowsShellProvider({
          helperPath: path,
          custody: { directory: join(custodyRoot, 'records'), sessionDirectory: join(custodyRoot, 'sessions') },
        });
        // oxlint-disable-next-line no-await-in-loop -- one broken install at a time, each judged by its own marker.
        const outcome = await prepared(launchOf(`Set-Content -LiteralPath ${quote(marker)} -Value ran`), through);
        if (outcome.status === 'started') {
          // oxlint-disable-next-line no-await-in-loop -- as above.
          const exit = await outcome.process.exited.catch((error: unknown) => ({ rejected: String(error) }));

          expect(exit, name).not.toStrictEqual({ exitCode: 0 });
        } else {
          expect(outcome.message.length, name).toBeGreaterThan(0);
        }
        expect(existsSync(marker), name).toBe(false);
      }
    },
  );

  conformance(
    'W05',
    'refused variables are refused, and the shell sees only the environment it was given',
    async () => {
      const given = { ...baseEnvironment(), GIVEN_VALUE: 'GIVEN-VALUE' };
      const positive = await run('[Console]::Write($env:GIVEN_VALUE)', { environment: given });

      expect(positive.exitCode, positive.stderr).toBe(0);
      expect(positive.stdout).toBe('GIVEN-VALUE');
      /* The host's own variables are in this process; none may reach the child. */
      const names = await run("[Console]::Write(((Get-ChildItem env:).Name | Sort-Object) -join ';')", {
        environment: given,
      });

      expect(names.exitCode, names.stderr).toBe(0);
      const allowed = new Set([...Object.keys(given), 'PSModulePath'].map((name) => name.toUpperCase()));
      const seen = names.stdout.split(';').filter((name) => name !== '');
      observations['W05-environment'] = seen;

      expect(seen.filter((name) => !allowed.has(name.toUpperCase()))).toStrictEqual([]);
      for (const [name, value] of [
        ['PSExecutionPolicyPreference', 'Bypass'],
        ['NODE_OPTIONS', String.raw`--require=C:\injected.js`],
        ['GITHUB_TOKEN', 'not-a-real-token'],
      ] as const) {
        /* The provider's floor names it, so a refusal is the only correct outcome. */
        expect(refusedShellEnvironment({ [name]: value })).toStrictEqual([name]);
        const marker = join(work, `w05-ran-${name}`);
        // oxlint-disable-next-line no-await-in-loop -- one refused variable at a time, each judged by its own marker.
        const outcome = await prepared(
          launchOf(`Set-Content -LiteralPath ${quote(marker)} -Value ran`, {
            environment: { ...baseEnvironment(), [name]: value },
          }),
        );

        expect(outcome, name).toMatchObject({ status: 'unsupported', requirement: 'environment' });
        expect(existsSync(marker), name).toBe(false);
      }
    },
  );

  conformance(
    'W06',
    'the Terminal shell owns a ConPTY: tty, resize, Ctrl-C, UTF-8 and containment inside it',
    async () => {
      const process_ = await start(
        launchOf('', {
          arguments: shellInteractiveArguments('powershell'),
          stdio: { kind: 'terminal', size: { columns: 80, rows: 24 } },
        }),
      );
      if (process_.kind !== 'terminal') {
        throw new Error('expected a terminal launch');
      }
      let raw = '';
      const reading = (async () => {
        const decoder = new TextDecoder();
        for await (const chunk of process_.output) {
          raw += decoder.decode(chunk, { stream: true });
        }
      })();
      const screen = (): string => raw.replace(vtSequence, '');
      const waitFor = async (marker: string | RegExp, milliseconds = 15_000): Promise<void> => {
        const seen = (): boolean => (typeof marker === 'string' ? screen().includes(marker) : marker.test(screen()));
        if (!(await waitUntil(seen, milliseconds))) {
          throw new Error(`no ${String(marker)} in ${JSON.stringify(screen().slice(-2000))}`);
        }
      };
      const type = (line: string): void => {
        process_.write(new TextEncoder().encode(line));
      };
      try {
        /* Only the shell's own evaluation prints these markers; the echo of the typed line cannot. */
        type('"TTY-$(40+2)-$([Console]::IsInputRedirected)-$([Console]::IsOutputRedirected)"\r');
        await waitFor('TTY-42-False-False');

        process_.resize({ columns: 100, rows: 40 });
        let resized = false;
        for (let attempt = 0; attempt < 5 && !resized; attempt++) {
          type('"SIZE-$([Console]::WindowHeight)x$([Console]::WindowWidth)"\r');
          // oxlint-disable-next-line no-await-in-loop -- the resize reaches the shell asynchronously; ask until it shows.
          resized = await waitUntil(() => screen().includes('SIZE-40x100'), 1000);
        }

        expect(resized, JSON.stringify(screen().slice(-1000))).toBe(true);

        type('"SLEEP-$(3+4)"; Start-Sleep -Seconds 30\r');
        await waitFor('SLEEP-7');
        await delay(300);
        /*
         * Ctrl-C makes the console flush its pending input, so the next line is typed only once a fresh prompt shows the
         * foreground `Start-Sleep` was interrupted (run 44007705346 lost a line typed straight after the 0x03).
         */
        const prompts = (): number =>
          screen()
            .split('SLEEP-7')
            .at(-1)
            ?.match(/PS [^\r\n>]*> /gu)?.length ?? 0;
        const promptsBefore = prompts();
        const interruptedAt = Date.now();
        type('\u0003');
        if (!(await waitUntil(() => prompts() > promptsBefore, 10_000))) {
          throw new Error(`no prompt after Ctrl-C in ${JSON.stringify(screen().slice(-2000))}`);
        }
        type('"AFTER-$(1+1)"\r');
        await waitFor('AFTER-2', 10_000);

        expect(Date.now() - interruptedAt).toBeLessThan(10_000);

        /* UTF-8 both ways: typed non-ASCII reaches the shell as the right characters, and the shell's output arrives. */
        type(`"UNI-$('café☃日本'.Length)-$([int][char]'é')-$([int][char]'☃')"\r`);
        /* `café☃日本` is seven UTF-16 code units: c, a, f, é, ☃, 日, 本. */
        await waitFor('UNI-7-233-9731');
        type('"OUT-$([char]0x2603)$([char]0xE9)"\r');
        await waitFor('OUT-☃é');

        /* Containment from inside the Terminal, judged by the files outside it. */
        const exfil = join(work, 'terminal-read-secret.txt');
        const forged = join(readonly, 'terminal-written.txt');
        const ran = join(work, 'terminal-ran.txt');
        const secretBefore = digestOf(join(secret, 'canary.txt'));
        type(
          [
            `try { Get-Content -LiteralPath ${quote(join(secret, 'canary.txt'))} -Raw -ErrorAction Stop | Set-Content -LiteralPath ${quote(exfil)} -NoNewline } catch { }`,
            `try { Set-Content -LiteralPath ${quote(forged)} -Value FORGED -ErrorAction Stop } catch { }`,
            `try { Set-Content -LiteralPath ${quote(join(secret, 'canary.txt'))} -Value FORGED -ErrorAction Stop } catch { }`,
            `Set-Content -LiteralPath ${quote(ran)} -Value ran -NoNewline`,
            '"PROBED-$(5+5)"',
          ].join('; ') + '\r',
        );
        await waitFor('PROBED-10');

        expect(readFileSync(ran, 'utf8')).toBe('ran');
        expect(existsSync(exfil)).toBe(false);
        expect(existsSync(forged)).toBe(false);
        expect(digestOf(join(secret, 'canary.txt'))).toBe(secretBefore);
        expect(screen()).not.toContain('SECRET-CANARY');

        type('exit 3\r');

        expect(await process_.exited).toStrictEqual({ exitCode: 3 });
      } finally {
        await process_.terminate().catch(() => undefined);
        await reading.catch(() => undefined);
      }
    },
  );

  const nativeWorkerContext = (): NativeWorkerContext => ({
    root,
    helperPath,
    workerProbe,
    systemRoot,
    recordHelperDiagnostic,
    sddlOf,
    interfaceAddress,
    tcpCanary,
    tcpControl,
    waitUntil,
    pause: delay,
  });

  for (const [id, title, body] of nativeWorkerRows(nativeWorkerContext)) {
    conformanceWithin(180_000)(id, title, body);
  }

  conformance('W07', 'after every launch, each path the suite touched has exactly its original ACL', async () => {
    expect(sddlOf(aclPaths)).toStrictEqual(aclBaseline);
  });
});
