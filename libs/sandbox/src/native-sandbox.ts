import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { accessSync, constants, realpathSync } from 'node:fs';
import { endianness, homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDefaultWritePaths, SandboxManager } from '@anthropic-ai/sandbox-runtime';

/**
 * The operating-system sandbox could not be established, so no native worker was started.
 *
 * Native execution never falls back to an unsandboxed child: callers surface this as an
 * ordinary runtime error naming the missing platform prerequisite.
 *
 * @public
 */
export class NativeRuntimeUnavailableError extends Error {
  /** Stable machine-readable code for hosts that map runtime failures to user-facing states. */
  public get code(): 'NATIVE_RUNTIME_UNAVAILABLE' {
    return 'NATIVE_RUNTIME_UNAVAILABLE';
  }

  public constructor(reason: string, options?: ErrorOptions) {
    super(`The native runtime is unavailable because its sandbox could not start: ${reason}`, options);
    this.name = 'NativeRuntimeUnavailableError';
  }
}

/** Host-owned launch vector for one contained native worker. @public */
export type NativeSandboxLaunch = {
  readonly executablePath: string;
  readonly arguments: readonly string[];
  /** Read-only roots the worker needs: the bundled runtime and the mirrored source snapshot. */
  readonly readablePaths: readonly string[];
  /** The single writable root: artifacts, temporary files, and the worker's private home. */
  readonly writablePath: string;
  readonly workingDirectory: string;
  /** Opaque key that attributes sandbox violations to this launch. */
  readonly commandId: string;
};

/**
 * Each path and its physical spelling, so a deny or grant holds whichever spelling a process opens.
 *
 * @internal
 */
export const physicalVariants = (paths: readonly string[]): string[] => {
  const variants = new Set<string>();
  for (const path of paths) {
    variants.add(path);
    try {
      variants.add(realpathSync(path));
    } catch {
      // A root that does not exist on this host still deserves its literal deny entry.
    }
  }
  return [...variants];
};

/**
 * Roots a native worker may never read: every user home, removable volume, and shared temporary storage.
 *
 * @internal
 * @returns Logical and physical spellings of each root.
 */
export const deniedReadRoots = (): string[] =>
  physicalVariants([homedir(), '/Users', '/home', '/root', '/Volumes', '/mnt', '/media', '/tmp', tmpdir()]);

/**
 * Directories the sandbox runtime itself executes from inside the Linux sandbox.
 *
 * On Linux the runtime starts every command through its vendored `apply-seccomp` helper, and
 * bubblewrap resolves that path inside the sandbox. A runtime installed under a denied root —
 * any checkout or app bundle below `/home` or `/tmp` — would otherwise hide its own helper and
 * every launch would exit 127 before the worker ran.
 *
 * @internal
 * @returns The vendored seccomp directory on Linux; nothing elsewhere.
 */
export const sandboxRuntimeReadRoots = (): string[] => {
  const helper = sandboxRuntimeSeccomp();
  const javaAgent = sandboxRuntimeJavaAgent();
  return helper === undefined || javaAgent === undefined
    ? []
    : [dirname(dirname(helper.applyPath)), dirname(javaAgent)];
};

/**
 * Resolve the executable on the real filesystem, not Electron's virtual ASAR filesystem.
 * Desktop packaging unpacks the seccomp directory; both bubblewrap mounts and the shell
 * invocation must use that same physical path. Missing payloads remain sandbox failures.
 *
 * @internal
 * @param entry - Resolved sandbox-runtime entry; defaults to the installed dependency.
 * @param platform - Host operating system.
 * @param architecture - Host CPU architecture.
 * @returns The Linux helper configuration; absent on other platforms.
 */
export const sandboxRuntimeSeccomp = (
  entry = fileURLToPath(import.meta.resolve('@anthropic-ai/sandbox-runtime')),
  platform: NodeJS.Platform = process.platform,
  architecture: string = process.arch,
): { applyPath: string } | undefined => {
  if (platform !== 'linux') {
    return undefined;
  }
  const physicalEntry = entry.replace(/\.asar(?=[/\\])/u, '.asar.unpacked');
  return { applyPath: join(dirname(dirname(physicalEntry)), 'vendor', 'seccomp', architecture, 'apply-seccomp') };
};

/**
 * The environment variable naming the bubblewrap every Linux native worker starts through.
 *
 * Absent, the runtime runs `bwrap` from `PATH`. Stock Ubuntu 26.04 confines `/usr/bin/bwrap` with its
 * `bwrap-userns-restrict` AppArmor profile, which lets bubblewrap create its user namespace but strips the
 * capabilities the sandbox runtime's `apply-seccomp` helper needs to open its nested one, so every worker exits 1 with
 * `write /proc/self/setgroups (nested userns is capability-restricted …)`. A packaged desktop app ships its own copy
 * under an AppArmor profile of its own and names it here, the same binary its shell sandbox already runs.
 *
 * @public
 */
export const nativeSandboxBwrapVariable = 'TAU_NATIVE_SANDBOX_BWRAP';

/**
 * The bubblewrap {@link nativeSandboxBwrapVariable} names, when it names one on Linux.
 *
 * The path is spliced, unquoted, ahead of the seccomp descriptor the worker reads, so only an absolute path of plain
 * characters is accepted; anything else refuses every launch rather than running a different binary.
 *
 * @internal
 * @param environment - Environment to read; defaults to this process's.
 * @param platform - Host operating system.
 * @returns The absolute bubblewrap path, or `undefined` to use `bwrap` from `PATH`.
 * @throws {NativeRuntimeUnavailableError} When the variable holds anything but a plain absolute path.
 */
export const nativeSandboxBwrap = (
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | undefined => {
  const path = environment[nativeSandboxBwrapVariable];
  if (platform !== 'linux' || path === undefined || path === '') {
    return undefined;
  }
  if (!/^\/[\w./+-]+$/u.test(path) || path.split('/').includes('..')) {
    throw new NativeRuntimeUnavailableError(`${nativeSandboxBwrapVariable} must be a plain absolute path.`);
  }
  return path;
};

/**
 * Resolve the Linux proxy agent on the physical filesystem for bubblewrap mounts.
 *
 * @internal
 * @param entry - Installed sandbox-runtime entry.
 * @param platform - Host operating system.
 * @returns Physical JAR path on Linux; absent elsewhere.
 */
export const sandboxRuntimeJavaAgent = (
  entry = fileURLToPath(import.meta.resolve('@anthropic-ai/sandbox-runtime')),
  platform: NodeJS.Platform = process.platform,
): string | undefined => {
  if (platform !== 'linux') {
    return undefined;
  }
  const physicalEntry = entry.replace(/\.asar(?=[/\\])/u, '.asar.unpacked');
  return join(dirname(dirname(physicalEntry)), 'vendor', 'java-proxy-agent', 'srt-proxy-agent.jar');
};

/**
 * Shared roots the sandbox runtime grants every command by default, which a CAD worker must not have.
 *
 * The runtime unions {@link getDefaultWritePaths} into the emitted write allowance, so the profile
 * would otherwise let user-authored C# or Python write into `/tmp/claude`, `~/.npm/_logs` and
 * `~/.claude/debug` — directories other tooling reads, i.e. an influence channel out of the sandbox.
 * Reading the roots back from the same export keeps a runtime upgrade from re-opening the hole with a
 * new default. Character devices stay writable because the worker's stdio needs them.
 *
 * @internal
 * @returns Every default write root except the `/dev` devices.
 */
export const deniedWriteRoots = (): string[] => getDefaultWritePaths().filter((path) => !path.startsWith('/dev/'));

/**
 * The capability profile handed to the sandbox runtime, spelled locally so the published
 * declarations never reach into the runtime's own types.
 *
 * @public
 */
export type NativeSandboxProfile = {
  seccomp?: { applyPath: string };
  bwrapPath?: string;
  javaAgentJarPath?: string;
  network: { allowedDomains: string[]; deniedDomains: string[]; strictAllowlist: boolean };
  filesystem: { denyRead: string[]; allowRead: string[]; allowWrite: string[]; denyWrite: string[] };
};

/**
 * The fixed Tau capability profile shared by every native CAD worker.
 *
 * Reads are denied under user homes, removable volumes, and shared temporary storage, then
 * re-allowed only for the launch's bundled runtime, source snapshot, and private writable
 * root, plus the sandbox runtime's own Linux helper ({@link sandboxRuntimeReadRoots}). Writes are allowed only inside that writable root: the sandbox runtime's own broad
 * default write roots are denied back off ({@link deniedWriteRoots}).
 *
 * Network egress is **proxy-mediated, not kernel-denied**. The emitted profile pins socket
 * access to the runtime's loopback proxy ports and nothing else; the proxy then refuses every
 * destination because the allowlist is empty, `*` is denied, and no interactive callback exists
 * to widen it. Declaring `allowedDomains` is what selects that restricted path — removing the
 * network facet makes the runtime emit `(allow network*)` instead, which is the inversion of
 * this invariant. A kernel-level "no sockets at all" option does not exist in the pinned runtime.
 *
 * @public
 * @param launch - Paths of one launch; omit for the process-wide baseline used at initialization.
 * @returns A complete sandbox-runtime configuration.
 */
export const nativeSandboxPolicy = (
  launch?: Pick<NativeSandboxLaunch, 'readablePaths' | 'writablePath'>,
): NativeSandboxProfile => {
  const bwrapPath = nativeSandboxBwrap();
  return {
    seccomp: sandboxRuntimeSeccomp(),
    ...(bwrapPath === undefined ? {} : { bwrapPath }),
    javaAgentJarPath: sandboxRuntimeJavaAgent(),
    network: { allowedDomains: [], deniedDomains: ['*'], strictAllowlist: true },
    filesystem: {
      denyRead: deniedReadRoots(),
      allowRead: launch
        ? physicalVariants([...launch.readablePaths, launch.writablePath, ...sandboxRuntimeReadRoots()])
        : [],
      allowWrite: launch ? physicalVariants([launch.writablePath]) : [],
      denyWrite: deniedWriteRoots(),
    },
  };
};

const unavailable = (error: unknown): NativeRuntimeUnavailableError =>
  error instanceof NativeRuntimeUnavailableError
    ? error
    : new NativeRuntimeUnavailableError(error instanceof Error ? error.message : String(error), { cause: error });

let initialization: Promise<void> | undefined;
let leases = 0;
let release: Promise<void> = Promise.resolve();

/**
 * Hold the process-wide sandbox for one native session until {@link releaseNativeSandbox}.
 *
 * @public
 */
export const acquireNativeSandbox = (): void => {
  leases += 1;
};

/**
 * Release one session's hold; the last release stops the sandbox runtime.
 *
 * On Linux the runtime keeps a referenced `socat` network bridge child alive until `reset()`,
 * and only resets on `process.on('exit')`, which that child prevents. Without this release a
 * one-shot host such as the CLI never exits after its last native worker has stopped.
 *
 * @public
 * @returns Once the sandbox runtime has stopped, when this was the last hold.
 */
export const releaseNativeSandbox = async (): Promise<void> => {
  leases = Math.max(0, leases - 1);
  const previous = release;
  release = (async () => {
    try {
      await previous;
    } catch {
      // The earlier release already reported its own failure to its caller.
    }
    const running = initialization;
    // A session acquired meanwhile keeps the runtime; a failed start left nothing to stop.
    if (leases > 0 || running === undefined) {
      return;
    }
    initialization = undefined;
    try {
      await running;
    } catch {
      return;
    }
    await SandboxManager.reset();
  })();
  await release;
};

/**
 * How many times one launch starts the sandbox runtime before reporting its Linux network bridge as unavailable.
 *
 * @internal
 */
export const bridgeStartAttempts = 3;

/** Milliseconds to pause before the next start, growing with each failed one: a host slow to start `socat` is usually a busy one. */
const bridgeRetryDelay = 250;

/**
 * Whether a failed {@link SandboxManager.initialize} is the Linux network bridge starting too slowly.
 *
 * The runtime starts two `socat` bridges and gives their sockets about 600 ms to appear before it kills them and
 * rejects with `Failed to create bridge sockets after 5 attempts` (or reports a bridge that died or never started).
 * On a loaded host that window is sometimes too short, and nothing about the next start depends on the last one.
 */
const isBridgeStartFailure = (error: unknown): boolean => error instanceof Error && /\bbridge\b/iu.test(error.message);

/**
 * Initialize the sandbox runtime, starting it again after a transient Linux bridge failure.
 *
 * The runtime clears its own state after a failed start, but runs that cleanup without awaiting it; the reset here is
 * awaited, and the pause after it outlasts the runtime's own, so the next start never races the last one's teardown.
 * Every other failure, and the last bridge failure, is reported as it is.
 *
 * @param profile - The process-wide baseline profile.
 */
const initializeWithBridgeRetry = async (profile: NativeSandboxProfile): Promise<void> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- each start must finish before the next one begins.
      await SandboxManager.initialize(profile);
      return;
    } catch (error) {
      if (attempt >= bridgeStartAttempts || !isBridgeStartFailure(error)) {
        throw error;
      }
      try {
        // oxlint-disable-next-line no-await-in-loop -- the failed start's bridges and proxy must be gone first.
        await SandboxManager.reset();
      } catch {
        // The runtime already started its own cleanup; a second one that fails leaves nothing more to stop.
      }
      // oxlint-disable-next-line no-await-in-loop -- the pause is the point.
      await new Promise((resolve) => {
        setTimeout(resolve, bridgeRetryDelay * attempt);
      });
    }
  }
};

/**
 * How many times one launch checks the sandbox runtime's host prerequisites before reporting one as missing.
 *
 * @internal
 */
export const dependencyCheckAttempts = 3;

/**
 * The sandbox runtime's prerequisite errors that persist across {@link dependencyCheckAttempts} checks.
 *
 * On Linux the runtime finds `rg`, `bwrap` and `socat` with `spawnSync('which', …, { timeout: 1000 })` and reads a
 * `which` that has not answered within that second as a missing binary, so a host busy enough to delay one spawn
 * reports `ripgrep (rg) not found` with ripgrep installed. A binary that is really missing is missing every time; a
 * slow spawn rarely is twice. Only the last check's errors are reported.
 *
 * @returns The errors of the last check; empty once any check passes.
 */
const missingDependencies = async (): Promise<string[]> => {
  for (let attempt = 1; ; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each check runs only when the previous one failed.
    const { errors } = await SandboxManager.checkDependenciesAsync();
    if (errors.length === 0 || attempt >= dependencyCheckAttempts) {
      return errors;
    }
    // oxlint-disable-next-line no-await-in-loop -- the pause is the point.
    await new Promise((resolve) => {
      setTimeout(resolve, bridgeRetryDelay * attempt);
    });
  }
};

const ensureInitialized = async (): Promise<void> => {
  // A launch never initializes into a runtime whose reset is still under way.
  try {
    await release;
  } catch {
    // A failed reset was reported to its releasing session; initialization starts afresh.
  }
  initialization ??= (async () => {
    if (process.platform === 'win32') {
      // The released Windows backend cannot grant per-launch filesystem paths; see the blueprint's release gates.
      throw new NativeRuntimeUnavailableError('Windows is not yet a supported native runtime platform.');
    }
    if (!SandboxManager.isSupportedPlatform()) {
      throw new NativeRuntimeUnavailableError(`${process.platform} has no supported sandbox backend.`);
    }
    const errors = await missingDependencies();
    if (errors.length > 0) {
      throw new NativeRuntimeUnavailableError(errors.join('; '));
    }
    const profile = nativeSandboxPolicy();
    if (profile.seccomp) {
      accessSync(profile.seccomp.applyPath, constants.X_OK);
    }
    await initializeWithBridgeRetry(profile);
  })();
  const attempt = initialization;
  try {
    await attempt;
  } catch (error) {
    // A later launch may retry once the operator installs the missing prerequisite; only the
    // failed attempt is forgotten, never a newer one already under way.
    if (initialization === attempt) {
      initialization = undefined;
    }
    throw unavailable(error);
  }
};

const quote = (value: string): string => `'${value.replaceAll("'", String.raw`'\''`)}'`;

/* Classic BPF, as `bwrap --seccomp` loads it: one `struct sock_filter` (code, jt, jf, k) per instruction. */
const bpfLoadWord = 0x20;
const bpfAnd = 0x54;
const bpfJumpEqual = 0x15;
const bpfJump = 0x05;
const bpfReturn = 0x06;
const seccompAllow = 0x7f_ff_00_00;
/* SECCOMP_RET_ERRNO with EPERM. */
const seccompRefuse = 0x00_05_00_01;

/**
 * The calls that create a symbolic or hard link, per audit architecture, plus `io_uring_setup` (425 on every one of
 * them), whose rings carry their own `symlinkat` and `linkat`. The compat architectures are listed because a 64-bit
 * process can still enter through them.
 */
const linkCalls: ReadonlyArray<{ readonly arch: number; readonly mask?: number; readonly calls: readonly number[] }> = [
  /* On x86_64: link, symlink, linkat, symlinkat. An x32 call carries bit 30 and is masked onto the same number. */
  { arch: 0xc0_00_00_3e, mask: 0xbf_ff_ff_ff, calls: [86, 88, 265, 266, 425] },
  /* On i386: link, symlink, linkat, symlinkat. */
  { arch: 0x40_00_00_03, calls: [9, 83, 303, 304, 425] },
  /* On aarch64: symlinkat, linkat (it has no link or symlink). */
  { arch: 0xc0_00_00_b7, calls: [36, 37, 425] },
  /* 32-bit Arm: link, symlink, linkat, symlinkat. */
  { arch: 0x40_00_00_28, calls: [9, 83, 330, 331, 425] },
];

let linkRefusal: Uint8Array<ArrayBuffer> | undefined;

/**
 * The seccomp program every Linux worker runs under: creating a symbolic or hard link fails with EPERM, every other
 * call is left to the sandbox runtime's own filter, and an architecture it does not know is refused outright.
 *
 * A worker writes inside a root the requesting process also reads and writes. Node's permission model follows a
 * symlink it finds there, so a link a worker planted would carry that process's grants anywhere; a worker that cannot
 * create one cannot plant one.
 *
 * @returns The compiled program, little-endian.
 */
const linkRefusalProgram = (): Uint8Array<ArrayBuffer> => {
  if (linkRefusal !== undefined) {
    return linkRefusal;
  }
  if (endianness() !== 'LE') {
    throw new NativeRuntimeUnavailableError('the link-refusing seccomp program is built for little-endian hosts only.');
  }
  const program: Array<{ code: number; jt: number; jf: number; k: number }> = [];
  const emit = (code: number, k: number): number => program.push({ code, jt: 0, jf: 0, k }) - 1;
  /* Load `seccomp_data.arch`. */
  emit(bpfLoadWord, 4);
  const dispatch = linkCalls.map(({ arch }) => {
    program.push({ code: bpfJumpEqual, jt: 0, jf: 1, k: arch });
    return emit(bpfJump, 0);
  });
  emit(bpfReturn, seccompRefuse);
  const refusals: number[] = [];
  for (const [index, { mask, calls }] of linkCalls.entries()) {
    program[dispatch[index]!]!.k = program.length - dispatch[index]! - 1;
    /* Load `seccomp_data.nr`. */
    emit(bpfLoadWord, 0);
    if (mask !== undefined) {
      emit(bpfAnd, mask);
    }
    for (const call of calls) {
      refusals.push(emit(bpfJumpEqual, call));
    }
    emit(bpfReturn, seccompAllow);
  }
  const refuse = emit(bpfReturn, seccompRefuse);
  for (const at of refusals) {
    program[at]!.jt = refuse - at - 1;
  }
  const bytes = Buffer.alloc(program.length * 8);
  for (const [index, { code, jt, jf, k }] of program.entries()) {
    bytes.writeUInt16LE(code, index * 8);
    bytes.writeUInt8(jt, index * 8 + 2);
    bytes.writeUInt8(jf, index * 8 + 3);
    bytes.writeUInt32LE(k, index * 8 + 4);
  }
  linkRefusal = Uint8Array.from(bytes);
  return linkRefusal;
};

/** File descriptor `bwrap` reads {@link linkRefusalProgram} from. */
const linkRefusalDescriptor = 3;

/* Appended last, so they win over the runtime's own re-allow of file-write-create in the writable root (Seatbelt is
 * last-match-wins between rules for the same operation). */
const seatbeltLinkRefusal =
  '\n; Tau: no symbolic or hard link\n(deny file-write-create (vnode-type SYMLINK))\n(deny file-link)';

/**
 * Close the gap the sandbox runtime leaves: it lets a worker create links inside its writable root. On Linux `bwrap`
 * is handed {@link linkRefusalProgram} on file descriptor 3; on macOS the Seatbelt profile gains rules refusing both
 * kinds of link. A vector of any other shape is refused rather than run without them.
 *
 * @param argv - The runtime's `[shell, '-c', wrapped]` vector.
 * @returns The same vector, refusing links.
 */
const refuseLinkCreation = (argv: readonly string[]): readonly string[] => {
  const [shell, flag, wrapped] = argv;
  if (argv.length !== 3 || flag !== '-c' || wrapped === undefined) {
    throw new NativeRuntimeUnavailableError('the sandbox runtime returned a vector Tau cannot refuse links in.');
  }
  if (process.platform === 'linux') {
    const bwrap = `${nativeSandboxBwrap() ?? 'bwrap'} `;
    if (!wrapped.startsWith(bwrap)) {
      throw new NativeRuntimeUnavailableError('the sandbox runtime did not start bwrap, so links cannot be refused.');
    }
    return [shell!, flag, `${bwrap}--seccomp ${String(linkRefusalDescriptor)} ${wrapped.slice(bwrap.length)}`];
  }
  if (process.platform === 'darwin') {
    /* The runtime single-quotes the profile, spelling each quote inside it as '"'"'. */
    const marker = "/usr/bin/sandbox-exec -p '(version 1)";
    const start = wrapped.indexOf(marker);
    if (start === -1 || wrapped.includes(marker, start + 1)) {
      throw new NativeRuntimeUnavailableError(
        'the sandbox runtime did not pass one Seatbelt profile, so links cannot be refused.',
      );
    }
    let close = wrapped.indexOf("'", start + marker.length);
    while (close !== -1 && wrapped.startsWith(`'"'"'`, close)) {
      close = wrapped.indexOf("'", close + `'"'"'`.length);
    }
    if (close === -1) {
      throw new NativeRuntimeUnavailableError('the Seatbelt profile is not closed, so links cannot be refused.');
    }
    return [shell!, flag, `${wrapped.slice(0, close)}${seatbeltLinkRefusal}${wrapped.slice(close)}`];
  }
  return argv;
};

/**
 * Wrap one host-owned executable and argument vector in the fixed Tau sandbox.
 *
 * The returned vector is spawned with `shell: false`; only host-owned paths and fixed worker
 * arguments are quoted into the wrapper command, never project content. The worker may not create a symbolic or hard
 * link. On Linux the vector reads the seccomp program that refuses them from file descriptor 3, so spawn it with
 * {@link spawnInNativeSandbox}: spawned any other way it fails to start.
 *
 * @public
 * @param launch - Executable, arguments, and the paths the worker may use.
 * @returns The spawn vector, or a rejection with {@link NativeRuntimeUnavailableError}.
 */
export const launchInNativeSandbox = async (launch: NativeSandboxLaunch): Promise<readonly string[]> => {
  await ensureInitialized();
  const vector = [launch.executablePath, ...launch.arguments].map((value) => quote(value)).join(' ');
  // The runtime's wrapper points TMPDIR at its own shared `/tmp/claude`, which this profile denies;
  // the worker's temporary files belong in its private artifact root.
  const temporary = ['TMPDIR', 'TEMP', 'TMP'].map((name) => `${name}=${quote(launch.writablePath)}`).join(' ');
  const command = `${temporary} exec ${vector}`;
  let argv: readonly string[];
  try {
    ({ argv } = await SandboxManager.wrapWithSandboxArgv(
      command,
      '/bin/sh',
      nativeSandboxPolicy(launch),
      undefined,
      launch.workingDirectory,
      { commandId: launch.commandId },
    ));
  } catch (error) {
    throw unavailable(error);
  }
  return refuseLinkCreation(argv);
};

/**
 * Spawn a vector from {@link launchInNativeSandbox} with piped stdio, handing `bwrap` the seccomp program that
 * refuses links on file descriptor 3 on Linux.
 *
 * @public
 * @param vector - The spawn vector.
 * @param options - The working directory and the environment.
 * @returns The started process.
 */
export const spawnInNativeSandbox = (
  vector: readonly string[],
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
): ChildProcessWithoutNullStreams => {
  const [command, ...commandArguments] = vector;
  const filtered = process.platform === 'linux';
  const program = filtered ? linkRefusalProgram() : undefined;
  const child = spawn(command!, commandArguments, {
    cwd: options.cwd,
    detached: process.platform !== 'win32',
    env: options.env,
    shell: false,
    windowsHide: true,
    stdio: filtered ? ['pipe', 'pipe', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
  });
  const channel = program === undefined ? undefined : child.stdio[linkRefusalDescriptor];
  if (program !== undefined && channel !== undefined && channel !== null && 'end' in channel) {
    /* A process that exits before reading the program closes its end; that is its failure to report, not this. */
    channel.on('error', () => undefined);
    /* Only the program crosses: once it is written this end closes, so the worker inherits nothing to talk on. */
    channel.end(program, () => {
      channel.destroy();
    });
  }
  return child;
};
