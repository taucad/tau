/**
 * Shared pieces of the W2 Windows MXC processcontainer S1 isolation spike (desktop Bash/Terminal
 * blueprint, ratification §RQ5).
 *
 * Dev-only evidence harness: nothing here is exported by the package or shipped. It drives the
 * pinned Microsoft MXC Node SDK (`@microsoft/mxc-sdk/v1`, pinned in `pin.json`) directly and writes
 * JSON receipts binding every observation to the MXC revision, SDK digest, licence, OS build and
 * source SHA. A missing prerequisite is a typed `prerequisite` state and a failed receipt — never a
 * skip, never a green. Isolation is a receipt decided by an external out-of-container observer,
 * never a trusted in-container error string.
 *
 * Read-only reuse of the W1 harness: this module imports pure helpers from `../lib.mts` (check,
 * identity, writeJson, sha256File, sleep, waitFor). It owns no W1 file and edits none.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { arch, platform, release } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

import { type Check, check, sha256File, sleep, waitFor, writeJson } from '../lib.mts';

export { check, sha256File, sleep, waitFor, writeJson };
export type { Check };

// fileURLToPath (not `new URL(...).pathname`): on Windows the latter yields `/D:/a/...`, whose
// leading slash makes readFileSync resolve a doubled `D:\D:\...` path. fileURLToPath returns the
// native `D:\a\...` form, so every readPin()/fallback.ps1 path resolves correctly on all platforms.
export const mxcDirectory = dirname(fileURLToPath(import.meta.url));
/** Resolve the MXC SDK (and its own package.json) from this spike's node_modules only. */
const sdkRequire = createRequire(join(mxcDirectory, 'package.json'));

export const isWindows = platform() === 'win32';

/** The pinned identity this lane admits, loaded from the committed `pin.json`. */
export type Pin = {
  nodeSdk: {
    name: string;
    version: string;
    integrity: string;
    shasum: string;
    license: string;
    entry: string;
  };
  spec: { upstreamRepo: string; upstreamRevisionPrefix: string; brainCommit: string };
  target: { backend: string; runner: string; os: string };
};

export const readPin = (): Pin => JSON.parse(readFileSync(join(mxcDirectory, 'pin.json'), 'utf8')) as Pin;

/**
 * A typed prerequisite state. An absent capability, a missing SDK or an off-Windows host is NEVER a
 * green row: it is recorded as `{ available: false, reason }` and turned into a failed check.
 */
export type Prereq = { readonly available: boolean; readonly reason?: string; readonly detail?: unknown };

export const prereqCheck = (id: string, what: string, prereq: Prereq): Check =>
  check(
    id,
    `${what} available`,
    prereq.available ? 'available' : (prereq.reason ?? 'unavailable'),
    prereq.available,
    prereq.detail,
  );

/**
 * Minimal structural view of the pinned SDK's `/v1` surface, feature-detected at load time. We do
 * not statically depend on the SDK's types (it is a native, Windows-only, optional dependency); we
 * assert the exports we use are present and record anything missing as a prerequisite failure.
 */
export type MxcSdk = {
  readonly resolvedPath: string;
  readonly packageVersion: string;
  readonly getPlatformSupport: () => MxcPlatformSupport;
  readonly getAvailableBackends: () => MxcAvailableBackend[];
  readonly probe: (request?: unknown) => MxcProbeOutput;
  readonly run: (request: MxcContainerRequest, options?: unknown) => Promise<MxcExecutionResult>;
  readonly spawnWithPty?: (request: MxcContainerRequest, options?: unknown) => unknown;
  readonly findWxcExecutable?: () => string | null;
  /** Names of the exports the loader expected but did not find. */
  readonly missingExports: string[];
};

export type MxcPlatformSupport = {
  isSupported: boolean;
  reason?: string;
  availableMethods: string[];
  isolationTier?: string;
  isolationWarnings?: string[];
  uiCapabilities?: Record<string, boolean>;
};

export type MxcAvailableBackend = { backend: string; tier?: string; capabilities: string[]; warnings: string[] };

export type MxcProbeFacts = {
  baseContainerApiPresent: boolean;
  baseContainerSupportsDenyPaths: boolean;
  baseContainerSupportsEnumeratePaths: boolean;
  baseContainerSupportsIngressHostLoopbackAllow: boolean;
  baseContainerSupportsIdentitylessLoopbackProxy: boolean;
  isolationSessionAvailable: boolean;
  uiCapabilities: Record<string, boolean>;
};

export type MxcProbeOutput = {
  tier?: string;
  needsDaclAugmentation?: boolean;
  warnings: string[];
  probes: MxcProbeFacts;
  error?: string;
};

export type MxcExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  warnings: string[];
};

/** A ContainerRequest for the processcontainer backend. Shape mirrors the pinned SDK's v1 types. */
export type MxcContainerRequest = {
  command: string;
  containment?: { type: 'processcontainer'; config?: Record<string, unknown> };
  filesystem?: {
    readwritePaths?: string[];
    readonlyPaths?: string[];
    deniedPaths?: string[];
    clearPolicyOnExit?: boolean;
  };
  network?: {
    egress?: { default?: 'allow' | 'deny'; allow?: unknown[]; deny?: unknown[] };
    ingress?: { default?: 'allow' | 'deny'; hostLoopback?: 'allow' | 'deny' };
    runtimeConfig?: { networkProxy?: string };
  };
  // MXC launches the in-container process from `process.env` VERBATIM when `inheritDefaultEnv` is
  // false; a Windows process cannot start without SYSTEMROOT/LOCALAPPDATA, so a request that sets only
  // a couple of custom vars fails with "missing the required variable(s): SYSTEMROOT, LOCALAPPDATA".
  // inheritDefaultEnv=true layers our vars on top of the default user environment (the fix).
  process?: { inheritDefaultEnv?: boolean; env?: Record<string, string> };
  timeoutMs?: number;
  containerName?: string;
  workingDirectory?: string;
};

/**
 * Load the pinned SDK's `/v1` entry. Returns a prerequisite failure (never throws) when the package
 * is absent, when it cannot be imported on this host, or when an export we rely on is missing.
 */
export const loadSdk = async (): Promise<{ sdk?: MxcSdk; prereq: Prereq }> => {
  let entryPath: string;
  try {
    entryPath = sdkRequire.resolve('@microsoft/mxc-sdk/v1');
  } catch (error) {
    return { prereq: { available: false, reason: '@microsoft/mxc-sdk not installed', detail: String(error) } };
  }
  let packageVersion = 'unknown';
  try {
    const pkgPath = sdkRequire.resolve('@microsoft/mxc-sdk/package.json');
    packageVersion = (JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }).version;
  } catch {
    /* recorded below via the version mismatch gate in provision.mts */
  }
  let mod: Record<string, unknown>;
  try {
    mod = (await import(pathToFileURL(entryPath).href)) as Record<string, unknown>;
  } catch (error) {
    return {
      prereq: { available: false, reason: 'SDK import failed (native library unavailable?)', detail: String(error) },
    };
  }
  const required = ['getPlatformSupport', 'getAvailableBackends', 'probe', 'run'] as const;
  const missingExports = required.filter((name) => typeof mod[name] !== 'function');
  if (missingExports.length > 0) {
    return {
      prereq: {
        available: false,
        reason: `SDK missing exports: ${missingExports.join(', ')}`,
        detail: { packageVersion },
      },
    };
  }
  const sdk: MxcSdk = {
    resolvedPath: entryPath,
    packageVersion,
    getPlatformSupport: mod['getPlatformSupport'] as MxcSdk['getPlatformSupport'],
    getAvailableBackends: mod['getAvailableBackends'] as MxcSdk['getAvailableBackends'],
    probe: mod['probe'] as MxcSdk['probe'],
    run: mod['run'] as MxcSdk['run'],
    spawnWithPty:
      typeof mod['spawnWithPty'] === 'function' ? (mod['spawnWithPty'] as MxcSdk['spawnWithPty']) : undefined,
    findWxcExecutable:
      typeof mod['findWxcExecutable'] === 'function'
        ? (mod['findWxcExecutable'] as MxcSdk['findWxcExecutable'])
        : undefined,
    missingExports: [],
  };
  return { sdk, prereq: { available: true } };
};

/** Locate and digest the on-disk native `wxc-exec` executable the SDK will run (the binding digest). */
export const wxcExecDigest = (sdk?: MxcSdk): { path: string; sha256: string } | undefined => {
  try {
    const found = sdk?.findWxcExecutable?.();
    if (found && existsSync(found)) {
      return { path: found, sha256: sha256File(found) };
    }
  } catch {
    // findWxcExecutable can throw on hosts where the native backend is absent; treat as not-found.
  }
  return undefined;
};

export const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export const nonce = (): string => randomBytes(16).toString('hex');

/**
 * D14 Windows shell resolution (blueprint D14, Brain f1b7c6df), the TypeScript mirror of
 * shell-identity.ps1: FIXED PATHS ONLY, never PATH. pwsh 7 at %ProgramFiles%\PowerShell\7 wins when
 * present and trusted, else Windows PowerShell 5.1 at %SystemRoot%\System32\WindowsPowerShell\v1.0.
 * User-/store-writable copies (WindowsApps, profile paths, .cmd/.bat shims) are refused. The agent
 * launch argv is fixed and carries NO -ExecutionPolicy override. shell-identity.ps1 produces the
 * authoritative receipt; this resolver is used to BUILD in-container PowerShell command lines.
 */
export type ShellKind = 'pwsh7' | 'windows-powershell-5.1' | 'shell-missing';
export type ShellIdentity = {
  readonly kind: ShellKind;
  readonly path?: string;
  readonly launchArgv: readonly string[];
  readonly ptyArgv: readonly string[];
  readonly trusted: boolean;
  readonly reason?: string;
};

export const D14_LAUNCH_ARGV: readonly string[] = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command'];
export const D14_PTY_ARGV: readonly string[] = ['-NoLogo', '-NoProfile'];

const shellPathUntrusted = (p: string): string | undefined => {
  const lower = p.toLowerCase();
  if (lower.endsWith('.cmd') || lower.endsWith('.bat')) {
    return 'shim (.cmd/.bat) refused';
  }
  for (const bad of [
    '\\windowsapps\\',
    process.env['USERPROFILE'],
    process.env['LOCALAPPDATA'],
    process.env['APPDATA'],
  ]) {
    if (bad && lower.includes(bad.toLowerCase())) {
      return `under user-/store-writable location: ${bad}`;
    }
  }
  return undefined;
};

export const resolveWindowsShell = (hidePwsh7 = false): ShellIdentity => {
  const pwsh7 = join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe');
  const ps51 = join(
    process.env['SystemRoot'] ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  const candidates: { kind: ShellKind; path: string }[] = [
    { kind: 'pwsh7', path: pwsh7 },
    { kind: 'windows-powershell-5.1', path: ps51 },
  ];
  for (const candidate of candidates) {
    if (candidate.kind === 'pwsh7' && hidePwsh7) {
      continue;
    }
    if (existsSync(candidate.path) && shellPathUntrusted(candidate.path) === undefined) {
      return {
        kind: candidate.kind,
        path: candidate.path,
        launchArgv: D14_LAUNCH_ARGV,
        ptyArgv: D14_PTY_ARGV,
        trusted: true,
      };
    }
  }
  return {
    kind: 'shell-missing',
    launchArgv: D14_LAUNCH_ARGV,
    ptyArgv: D14_PTY_ARGV,
    trusted: false,
    reason: 'no trusted pwsh7 or 5.1 at the fixed paths',
  };
};

/**
 * Build one MXC command line that runs `script` under the resolved PowerShell with the D14 argv.
 * Scripts are authored with single-quoted literals so no inner double quotes need escaping inside the
 * outer `-Command "..."`. The in-MXC shell is PowerShell (D14), never Git Bash or cmd.
 */
export const psLaunch = (shell: ShellIdentity, script: string): string => {
  if (!shell.path) {
    throw new Error('shell-missing: no trusted PowerShell at the D14 fixed paths');
  }
  return `"${shell.path}" ${shell.launchArgv.join(' ')} "${script.replaceAll('"', '\\"')}"`;
};

/** A per-session grant: private roots, a read-only toolchain root, the other session's roots to deny. */
export type SessionGrant = {
  readonly id: string;
  readonly project: string;
  readonly home: string;
  readonly temporary: string;
  readonly readOnly: string;
  /** Paths that MUST be denied (the other session's private roots and approved folders). */
  readonly deny: readonly string[];
  /** host:port the session's own proxy listens on, and the bearer token it accepts. */
  readonly proxy: { host: string; port: number; token: string };
};

/**
 * The system directories every launched process needs READ access to inside a base container. The
 * processcontainer filesystem policy is allow-list: a path absent from readwritePaths/readonlyPaths is
 * NOT readable. A child launched without these dies at load time with 0xC0000142 (STATUS_DLL_INIT_
 * FAILED) because it cannot read its own executable + its DLL closure (System32 kernel DLLs, and the
 * self-contained .NET that ships with pwsh 7). These are the toolchain roots, NOT per-session data, so
 * granting both sessions read here does not weaken the cross-session isolation claim (which is about
 * each session's PRIVATE project/home roots being mutually inaccessible).
 */
export const systemReadonlyRoots = (): string[] => {
  const windir = process.env['SystemRoot'] ?? 'C:\\Windows';
  const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files';
  return [windir, join(programFiles, 'PowerShell', '7'), join(programFiles, 'dotnet')].filter((p) => existsSync(p));
};

export const requestFor = (
  grant: SessionGrant,
  command: string,
  proxyUrl: string,
  denyPathsSupported: boolean,
): MxcContainerRequest => ({
  command,
  containment: { type: 'processcontainer', config: { learningMode: false } },
  containerName: `tau-session-${grant.id}`,
  filesystem: {
    readwritePaths: [grant.project, grant.home, grant.temporary],
    // grant.readOnly is the session toolchain root; systemReadonlyRoots() adds Windows + the pwsh/.NET
    // install dirs so the launched PowerShell can actually load its DLLs (else 0xC0000142 at init).
    readonlyPaths: [grant.readOnly, ...systemReadonlyRoots()],
    // deniedPaths need PSE_SUPPORT_FS_DENY. When absent, omit them and let the probe record that the
    // read-isolation assertion is governed by the ambient DACL (a typed limit), not by MXC deny.
    ...(denyPathsSupported ? { deniedPaths: [...grant.deny] } : {}),
    clearPolicyOnExit: true,
  },
  network: {
    egress: { default: 'deny' },
    // Loopback is bidirectional between MXC containers; the per-session credential proxy is Tau's job.
    ingress: { default: 'deny', hostLoopback: 'allow' },
    // MXC parses runtimeConfig.networkProxy as a WHATWG URL: an empty or relative string throws
    // "Configuration parse error: runtimeConfig.networkProxy is invalid: relative URL without a base"
    // and the container never launches (this is exactly what sank the cc3b970b preflight sentinel on
    // windows-11-arm, masking an otherwise-present base-container API). Include it ONLY when an
    // ABSOLUTE proxy URL is supplied (the isolation receipt passes http://127.0.0.1:<port>); OMIT it
    // entirely otherwise — the preflight sentinel needs no egress (egress default is deny), so there
    // is nothing to proxy and the parse then succeeds.
    ...(proxyUrl ? { runtimeConfig: { networkProxy: proxyUrl } } : {}),
  },
  // inheritDefaultEnv=true so the container gets a launchable Windows environment (SYSTEMROOT,
  // LOCALAPPDATA, …) with our session vars layered on top. Without it the base-container launch throws
  // "missing the required variable(s): SYSTEMROOT, LOCALAPPDATA" and createClose/isolation never run,
  // which is what masked the otherwise-present PSEC base-container API on windows-11-arm after the
  // networkProxy parse error was fixed. Our vars go under process.env (the SDK's canonical location).
  process: { inheritDefaultEnv: true, env: { TAU_SESSION: grant.id, TAU_PROXY_TOKEN: grant.proxy.token } },
  timeoutMs: 60_000,
});

/**
 * A credential-authenticated loopback canary: an out-of-container HTTP listener that serves a secret
 * token ONLY to requests carrying the matching bearer token. Cross-session use is proven denied by
 * this listener's own log (external observation), not by any in-container error.
 */
export type ProxyCanary = {
  readonly server: Server;
  readonly port: number;
  readonly token: string;
  readonly secret: string;
  /** Every request seen: whether it presented the right token and was served. */
  readonly log: { authorization: string | undefined; served: boolean; at: number }[];
  readonly close: () => Promise<void>;
};

export const startProxyCanary = async (sessionId: string): Promise<ProxyCanary> => {
  const token = nonce();
  const secret = `secret-of-${sessionId}-${nonce()}`;
  const log: ProxyCanary['log'] = [];
  const server = createServer((req, res) => {
    const authorization = req.headers['authorization'];
    const served = authorization === `Bearer ${token}`;
    log.push({ authorization, served, at: Date.now() });
    if (served) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(secret);
    } else {
      res.writeHead(401, { 'content-type': 'text/plain' });
      res.end('denied');
    }
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    server,
    port,
    token,
    secret,
    log,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
};

/** Ensure a per-run fixture directory exists and return its realpath-safe absolute path. */
export const ensureDir = (path: string): string => {
  mkdirSync(path, { recursive: true });
  return resolve(path);
};

export const outDir = (): string => {
  const base = process.env['TAU_SPIKE_OUT'] ?? join(process.env['RUNNER_TEMP'] ?? mxcDirectory, 'mxc-spike');
  return ensureDir(base);
};

/** Lane identity recorded in every receipt (binds MXC revision + SDK digest + licence + OS + SHA). */
export const laneIdentity = (sdk?: MxcSdk): Record<string, unknown> => {
  const pin = readPin();
  return {
    lane: 'spike-w2-win-mxc',
    source: {
      sha: process.env['GITHUB_SHA'] ?? 'local',
      ref: process.env['GITHUB_REF'] ?? 'local',
      run: process.env['GITHUB_RUN_ID']
        ? `${process.env['GITHUB_SERVER_URL']}/${process.env['GITHUB_REPOSITORY']}/actions/runs/${process.env['GITHUB_RUN_ID']}/attempts/${process.env['GITHUB_RUN_ATTEMPT']}`
        : 'local',
    },
    os: {
      platform: platform(),
      arch: arch(),
      release: release(),
      build: osBuild(),
      userSid: currentUserSid(),
      runnerImage: process.env['ImageOS'] ?? 'unknown',
      imageVersion: process.env['ImageVersion'] ?? 'unknown',
    },
    node: { version: process.version, abi: process.versions.modules },
    mxc: {
      specRevisionPrefix: pin.spec.upstreamRevisionPrefix,
      specRepo: pin.spec.upstreamRepo,
      brainCommit: pin.spec.brainCommit,
      sdk: {
        name: pin.nodeSdk.name,
        pinnedVersion: pin.nodeSdk.version,
        installedVersion: sdk?.packageVersion ?? 'not-loaded',
        integrity: pin.nodeSdk.integrity,
        shasum: pin.nodeSdk.shasum,
        license: pin.nodeSdk.license,
        resolvedPath: sdk?.resolvedPath ?? null,
      },
      wxcExec: wxcExecDigest(sdk) ?? null,
    },
  };
};

/**
 * The current user's SID, read via the .NET `WindowsIdentity` API through PowerShell. This is
 * deliberately PATH-independent: it never shells out to `whoami`, so Git-bash's GNU coreutils
 * `whoami` (which rejects `/user`) cannot shadow it. Returns 'unknown' off Windows or on any failure.
 */
const currentUserSid = (): string => {
  if (!isWindows) {
    return 'n/a';
  }
  const { spawnSync } = sdkRequire('node:child_process') as typeof import('node:child_process');
  const command = '[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value';
  for (const shell of ['pwsh', 'powershell']) {
    const result = spawnSync(shell, ['-NoProfile', '-NonInteractive', '-Command', command], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 20_000,
    });
    const sid = (result.stdout ?? '').trim();
    if (result.status === 0 && /^S-\d/.test(sid)) {
      return sid;
    }
  }
  return 'unknown';
};

/** Read the Windows OS build from the registry (never from a package claim). */
const osBuild = (): string => {
  if (!isWindows) {
    return `${platform()} ${release()}`;
  }
  try {
    const { execFileSync } = sdkRequire('node:child_process') as typeof import('node:child_process');
    const key = String.raw`HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion`;
    const out = execFileSync('reg', ['query', key], { encoding: 'utf8', windowsHide: true });
    const value = (name: string): string =>
      out
        .split('\n')
        .find((row) => row.includes(name))
        ?.trim()
        .split(/\s{2,}/)
        .at(-1) ?? '';
    return ['ProductName', 'EditionID', 'CurrentBuild', 'UBR', 'DisplayVersion'].map(value).filter(Boolean).join(' ');
  } catch (error) {
    return `windows (build read failed: ${String(error)})`;
  }
};
