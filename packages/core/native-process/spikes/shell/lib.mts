/**
 * Shared pieces of the S0–S2 shell feasibility spike (desktop Bash/Terminal blueprint, W1).
 *
 * Dev-only evidence harness: nothing here is exported by the package or shipped. It drives the
 * pinned sandbox runtime directly, one supervisor process per immutable profile (D6), and writes
 * JSON receipts that bind every observation to the source, provider, Bash, OS and PTY identities
 * (I12). A missing prerequisite is a failed receipt, never a skip.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arch, homedir, platform, release, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const spikeDirectory = dirname(fileURLToPath(import.meta.url));
export const packageDirectory = resolve(spikeDirectory, '..', '..');
const require = createRequire(join(packageDirectory, 'package.json'));
/** node-pty is a spike-local dependency (`spikes/shell/package.json`), so resolve it from here. */
export const spikeRequire = createRequire(join(spikeDirectory, 'package.json'));

export type Verdict = 'pass' | 'fail';

/** One observed assertion. `expect` is the invariant; `observed` is what actually happened. */
export type Check = {
  readonly id: string;
  readonly expect: string;
  readonly observed: string;
  readonly verdict: Verdict;
  readonly detail?: unknown;
};

export const check = (id: string, expect: string, observed: string, ok: boolean, detail?: unknown): Check => ({
  id,
  expect,
  observed,
  verdict: ok ? 'pass' : 'fail',
  ...(detail === undefined ? {} : { detail }),
});

export const isWindows = platform() === 'win32';

export const sha256File = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

const run = (command: string, args: readonly string[]): string => {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, timeout: 20_000 });
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
};

export const writeJson = (path: string, value: unknown): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, undefined, 2)}\n`);
};

/** The sandbox runtime package as installed for this package, with its own identity. */
export const sandboxRuntime = (): { version: string; directory: string; srtWin?: { path: string; sha256: string } } => {
  const entry = require.resolve('@anthropic-ai/sandbox-runtime');
  const directory = resolve(dirname(entry), '..');
  const { version } = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as { version: string };
  if (!isWindows) {
    return { version, directory };
  }
  const path = join(directory, 'vendor', 'srt-win', arch(), 'srt-win.exe');
  return { version, directory, srtWin: { path, sha256: existsSync(path) ? sha256File(path) : 'missing' } };
};

export const nodePty = (): { version: string; directory: string; binary?: string; sha256?: string } | undefined => {
  let entry: string;
  try {
    entry = spikeRequire.resolve('node-pty');
  } catch {
    return undefined;
  }
  const directory = resolve(dirname(entry), '..');
  const { version } = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as { version: string };
  const candidates = [
    join(directory, 'build', 'Release', 'pty.node'),
    join(directory, 'build', 'Release', 'conpty.node'),
    join(directory, 'prebuilds', `${platform()}-${arch()}`, isWindows ? 'conpty.node' : 'pty.node'),
  ];
  const binary = candidates.find((candidate) => existsSync(candidate));
  return { version, directory, ...(binary ? { binary, sha256: sha256File(binary) } : {}) };
};

export type BashIdentity = { path: string; version: string; sha256: string; origin: string };

/**
 * The Bash every probe runs. macOS and Linux use the system `/bin/bash`; Windows uses the pinned
 * Git for Windows distribution the workflow provisions into a host-owned directory outside every
 * grant (TAU_SPIKE_BASH). There is no ambient fallback: an unprovisioned Windows host fails.
 */
export const resolveBash = (): BashIdentity => {
  const path = isWindows ? process.env['TAU_SPIKE_BASH'] : '/bin/bash';
  if (!path || !existsSync(path)) {
    throw new Error(`pinned Bash is not provisioned (TAU_SPIKE_BASH=${String(path)})`);
  }
  const origin = isWindows
    ? `git-for-windows ${process.env['TAU_SPIKE_BASH_ORIGIN'] ?? 'unrecorded'}`
    : platform() === 'darwin'
      ? 'macOS system /bin/bash'
      : `distribution ${run('dpkg-query', ['-W', '-f=${Package} ${Version}', 'bash'])}`;
  return { path, version: run(path, ['--version']).split('\n')[0] ?? '', sha256: sha256File(path), origin };
};

const osBuild = (): string => {
  if (platform() === 'darwin') {
    return run('sw_vers', []).replaceAll(/\s+/g, ' ');
  }
  if (isWindows) {
    const key = String.raw`HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion`;
    const values = ['ProductName', 'EditionID', 'CurrentBuild', 'UBR', 'InstallationType'].map((name) => {
      const line =
        run('reg', ['query', key, '/v', name])
          .split('\n')
          .find((row) => row.includes(name)) ?? '';
      return (
        line
          .trim()
          .split(/\s{2,}/)
          .at(-1) ?? ''
      );
    });
    return values.join(' ');
  }
  const osRelease = existsSync('/etc/os-release') ? readFileSync('/etc/os-release', 'utf8') : '';
  return `${/PRETTY_NAME="([^"]*)"/.exec(osRelease)?.[1] ?? 'unknown'} kernel ${release()}`;
};

/** Filesystem type of the volume holding `path`. */
export const filesystemType = (path: string): string => {
  if (platform() === 'linux') {
    return run('stat', ['-f', '-c', '%T', path]);
  }
  if (platform() === 'darwin') {
    return run('stat', ['-f', '%T', path]) || run('df', ['-T', path]);
  }
  const drive = resolve(path).slice(0, 2);
  const out = run('fsutil', ['fsinfo', 'volumeinfo', `${drive}\\`]);
  return /File System Name\s*:\s*(\S+)/.exec(out)?.[1] ?? out.split('\n')[0] ?? 'unknown';
};

/** Linux security knobs a stock row must leave untouched. */
const linuxSecurity = (): Record<string, string> | undefined => {
  if (platform() !== 'linux') {
    return undefined;
  }
  const read = (path: string): string => (existsSync(path) ? readFileSync(path, 'utf8').trim() : 'absent');
  return {
    apparmorRestrictUnprivilegedUserns: read('/proc/sys/kernel/apparmor_restrict_unprivileged_userns'),
    unprivilegedUsernsClone: read('/proc/sys/kernel/unprivileged_userns_clone'),
    maxUserNamespaces: read('/proc/sys/user/max_user_namespaces'),
    bwrap: run('bwrap', ['--version']),
    bwrapMode: run('stat', ['-c', '%A %U', run('sh', ['-c', 'command -v bwrap'])]),
    socat: run('sh', ['-c', 'socat -V | head -2']),
  };
};

const sourceSha = (): string => process.env['GITHUB_SHA'] ?? run('git', ['-C', packageDirectory, 'rev-parse', 'HEAD']);

export const identity = (row: string, fixtureRoot: string, bash: BashIdentity | undefined) => ({
  row,
  source: {
    sha: sourceSha(),
    ref: process.env['GITHUB_REF'] ?? 'local',
    run: process.env['GITHUB_RUN_ID']
      ? `${process.env['GITHUB_SERVER_URL']}/${process.env['GITHUB_REPOSITORY']}/actions/runs/${process.env['GITHUB_RUN_ID']}/attempts/${process.env['GITHUB_RUN_ATTEMPT']}`
      : 'local',
  },
  os: {
    platform: platform(),
    arch: arch(),
    build: osBuild(),
    runnerImage: process.env['ImageOS'] ?? 'unknown',
    imageVersion: process.env['ImageVersion'] ?? 'unknown',
  },
  node: { version: process.version, abi: process.versions.modules, electron: process.versions['electron'] ?? null },
  provider: sandboxRuntime(),
  nodePty: nodePty() ?? null,
  bash: bash ?? null,
  filesystem: { root: fixtureRoot, type: filesystemType(fixtureRoot) },
  linuxSecurity: linuxSecurity() ?? null,
  // `net session` needs administrator rights, so its denial is a reliable non-elevated signal.
  elevated: isWindows ? !run('net', ['session']).toLowerCase().includes('access is denied') : process.getuid?.() === 0,
});

/** A per-run fixture root outside the checkout and outside shared temporary storage. */
export const fixtureRoot = (): string => {
  const base = process.env['RUNNER_TEMP'] ?? join(homedir(), '.tau-shell-spike');
  const root = join(base, `tau-shell-spike-${process.pid}`);
  mkdirSync(root, { recursive: true });
  return realpathSync(root);
};

export type ShellGrant = {
  /** The admitted project (live view candidate). */
  readonly project: string;
  /** Private HOME and temporary directory for this session. */
  readonly home: string;
  readonly temporary: string;
  /** Host-selected read-only toolchain roots. */
  readonly toolchain: readonly string[];
  readonly extraRead?: readonly string[];
  readonly extraWrite?: readonly string[];
  /** Protected paths the session may read but never write (records). */
  readonly readOnly?: readonly string[];
  /** Protected paths the session may neither read nor write (control/hidden). */
  readonly hidden?: readonly string[];
  /** Exact `host:port` destinations approved for this session; empty denies all egress. */
  readonly domains?: readonly string[];
};

const posixDeniedRoots = (): string[] =>
  [
    homedir(),
    '/Users',
    '/home',
    '/root',
    '/Volumes',
    '/mnt',
    '/media',
    '/tmp',
    tmpdir(),
    '/private/tmp',
    '/var/folders',
  ].filter((path) => existsSync(path));

/**
 * The directory the Linux sandbox runtime runs its own vendored `apply-seccomp` helper from. bwrap
 * resolves that path inside the sandbox, so a helper under a denied root hides and every launch
 * exits 127 before Bash runs. Mirrors `native-sandbox.ts` `sandboxRuntimeReadRoots`.
 */
const sandboxRuntimeReadRoots = (): string[] =>
  platform() === 'linux' ? [join(sandboxRuntime().directory, 'vendor', 'seccomp')] : [];

/**
 * The candidate shell profile in the sandbox runtime's own configuration shape. It mirrors the
 * fixed CAD profile's stance (deny user homes/shared temp, re-allow only granted roots, proxy-only
 * egress with an exact allowlist) and adds the S0 live-mask candidate: records are write-denied and
 * control/hidden paths are read- and write-denied.
 */
export const shellProfile = (grant: ShellGrant): Record<string, unknown> => {
  const readable = [
    grant.project,
    grant.home,
    grant.temporary,
    ...grant.toolchain,
    ...sandboxRuntimeReadRoots(),
    ...(grant.extraRead ?? []),
  ];
  const writable = [grant.project, grant.home, grant.temporary, ...(grant.extraWrite ?? [])];
  const hidden = grant.hidden ?? [];
  const domains = [...(grant.domains ?? [])];
  return {
    network: { allowedDomains: domains, deniedDomains: domains.length === 0 ? ['*'] : [], strictAllowlist: true },
    filesystem: {
      denyRead: [...(isWindows ? [] : posixDeniedRoots()), ...hidden],
      allowRead: readable,
      allowWrite: writable,
      denyWrite: [...(grant.readOnly ?? []), ...hidden],
    },
    ...(isWindows
      ? { windows: { srtWin: { path: process.env['TAU_SPIKE_SRT_WIN'] ?? sandboxRuntime().srtWin?.path } } }
      : {}),
  };
};

export type SupervisorRun = {
  readonly id: string;
  readonly command: string;
  readonly cwd: string;
  readonly timeoutMs?: number;
  /** Extra environment for the command (synthetic values only). */
  readonly env?: Readonly<Record<string, string>>;
};

export type SupervisorResult = {
  readonly id: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly argv0?: string;
  readonly error?: string;
};

export type SupervisorJob = {
  readonly profile: Record<string, unknown>;
  readonly bash: string;
  readonly runs: readonly SupervisorRun[];
  /** Hold the supervisor (and its grants) open until this file exists, for concurrency probes. */
  readonly holdUntil?: string;
  /** Write a JSON readiness file once the sandbox is initialized. */
  readonly readyFile?: string;
};

/** Start one supervisor process for one immutable profile and collect its results. */
export const startSupervisor = (
  job: SupervisorJob,
): {
  pid: number | undefined;
  done: Promise<{ results: SupervisorResult[]; stderr: string; exitCode: number | null }>;
  kill: () => void;
} => {
  const child = spawn(process.execPath, [join(spikeDirectory, 'supervisor.mts')], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env },
  });
  let out = '';
  let err = '';
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => (out += chunk));
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (err += chunk));
  child.stdin.end(JSON.stringify(job));
  const done = new Promise<{ results: SupervisorResult[]; stderr: string; exitCode: number | null }>((resolveDone) => {
    child.once('close', (exitCode) => {
      const results = out
        .split('\n')
        .filter((line) => line.startsWith('{'))
        .map((line) => JSON.parse(line) as SupervisorResult);
      resolveDone({ results, stderr: err.slice(-8000), exitCode });
    });
  });
  return { pid: child.pid, done, kill: () => child.kill('SIGKILL') };
};

export const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
};

/** Poll until `condition` holds or the deadline passes. */
export const waitFor = async (condition: () => boolean, deadlineMs: number, intervalMs = 100): Promise<boolean> => {
  const end = Date.now() + deadlineMs;
  while (Date.now() < end) {
    if (condition()) {
      return true;
    }
    await sleep(intervalMs);
  }
  return condition();
};

/** A path spelled for MSYS Bash on Windows (forward slashes keep the drive letter intact). */
export const shellPath = (path: string): string => (isWindows ? path.replaceAll('\\', '/') : path);
