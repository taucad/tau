/**
 * The macOS and Linux shell provider over the pinned sandbox runtime (blueprint D3, D6, D20, D26, I2, I7).
 *
 * Each launch starts its own credential-free supervisor ({@link SupervisorJob}), which initializes the runtime with
 * that launch's immutable profile and holds its proxy. The provider spawns the shell from the vector the supervisor
 * returns, so the shell never inherits the supervisor's channel, and settles only after every owned descendant has
 * stopped and the supervisor has released the runtime.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { channel } from 'node:diagnostics_channel';
import type { ChildProcess } from 'node:child_process';
import { closeSync, existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { ReadStream } from 'node:tty';
import { fileURLToPath } from 'node:url';

import {
  deniedReadRoots,
  deniedWriteRoots,
  physicalVariants,
  sandboxRuntimeReadRoots,
  sandboxRuntimeJavaAgent,
  sandboxRuntimeSeccomp,
} from '#native-sandbox.js';
import { terminateOwnedProcesses, terminationDeadline, trackDescendants } from '#shell/process-tree.js';
import type { ProcessRow } from '#shell/process-tree.js';
import { shellBaselineDenied, zshStartupFiles } from '#shell/shell-baseline.js';
import { createShellCustody } from '#shell/shell-custody.js';
import { refusedShellEnvironment } from '#shell/shell-environment.js';
import { zshStartupWrappers } from '#shell/shell-zsh-startup.js';
import { holdProtectedStandIns, useStandInJournal } from '#shell/shell-stand-ins.js';
import type { StandInProfile } from '#shell/shell-stand-ins.js';
import type {
  ShellExit,
  ShellLaunch,
  ShellLaunchOutcome,
  ShellProcess,
  ShellProvider,
  ShellTerminalSize,
} from '#shell/shell-provider.js';
import {
  abandonStartBarrier,
  createLaunchAnnouncement,
  createTerminalStartGate,
  openStartBarrier,
  stagedStartArguments,
  stagedTerminalStartArguments,
} from '#shell/shell-start-barrier.js';
import type { LaunchAnnouncement } from '#shell/shell-start-barrier.js';
import { probeStoreGuard, storeGuardCommand } from '#shell/store-guard.js';
import type { SupervisorControl, SupervisorJob, SupervisorReply } from '#shell/srt-supervisor.js';

/**
 * The parts of node-pty this provider uses. `native` is node-pty's own POSIX binding (`openpty` and `TIOCSWINSZ`),
 * exported by the package for this purpose though absent from its typings.
 *
 * @public
 */
export type PtyBinding = Readonly<{
  spawn: (
    file: string,
    args: readonly string[],
    options: Readonly<{
      name: string;
      cols: number;
      rows: number;
      cwd: string;
      env: Record<string, string>;
      // oxlint-disable-next-line typescript/no-restricted-types -- node-pty's own spelling for "deliver bytes".
      encoding: null;
    }>,
  ) => PtyTerminal;
  // oxlint-disable-next-line typescript/no-restricted-types -- node-pty exports `null` where it has no POSIX binding.
  native: PtyNative | null;
}>;

/**
 * The POSIX binding inside node-pty: `openpty` and `TIOCSWINSZ`.
 *
 * @public
 */
export type PtyNative = Readonly<{
  open: (columns: number, rows: number) => { master: number; slave: number; pty: string };
  resize: (fd: number, columns: number, rows: number) => void;
}>;

/**
 * A node-pty terminal, as far as this provider uses one.
 *
 * @public
 */
export type PtyTerminal = Readonly<{
  pid: number;
  onData: (listener: (data: Uint8Array<ArrayBuffer> | string) => void) => unknown;
  onExit: (listener: (event: { exitCode: number; signal?: number }) => void) => unknown;
  write: (data: Uint8Array<ArrayBuffer>) => void;
  resize: (columns: number, rows: number) => void;
  pause: () => void;
  resume: () => void;
  kill: (signal?: string) => void;
}>;

/** @public */
export type SandboxShellProviderOptions = Readonly<{
  /**
   * How to start one supervisor. Defaults to this process's own executable running the bundled supervisor entry,
   * with `ELECTRON_RUN_AS_NODE` set under Electron.
   */
  supervisor?: Readonly<{ executablePath: string; arguments: readonly string[] }>;
  /** On Linux, the bubblewrap the runtime runs; Tau's packaged copy carries its own AppArmor profile. */
  bwrapPath?: string;
  /** On Linux, the socat the runtime bridges network through. */
  socatPath?: string;
  /** The ripgrep the runtime searches mandatory deny paths with. */
  ripgrepPath?: string;
  /** The person's home root, for the baseline read-deny set. */
  home?: string;
  /**
   * On macOS, allow `terminal` launches, carrying the session-scoped own-pty Seatbelt rule. The desktop turns it on;
   * shell conformance C08/C09 qualify it on MAC-A and MAC-X. Off answers `unsupported: terminal`.
   */
  macOSTerminal?: boolean;
  /** Load node-pty; injectable for tests. */
  loadPty?: () => Promise<PtyBinding>;
  /** How long a supervisor may take to answer. */
  startupMilliseconds?: number;
  /** The process table cleanup confirms against; injectable only to exercise unconfirmed cleanup. */
  processTable?: () => Promise<readonly ProcessRow[]>;
  /**
   * Where this provider keeps its durable execution receipts and locks (I7), and the one parent its launches' private
   * roots may live in. Defaults to a per-user directory under the system temporary directory and that directory's
   * parent; a host with application data passes a directory there, so receipts survive until recovery.
   */
  custody?: Readonly<{ directory: string; sessionDirectory: string }>;
  /**
   * On Linux, a file under host-owned state (never inside a checkout) journalling the stand-ins this process holds, so
   * the next start sweeps the ones a crash left behind.
   */
  standInJournal?: string;
  /**
   * On Linux, the `tau-store-guard` executable that writes a Terminal's git stores through a name guard
   * ({@link ShellFilesystem.guardedStores}). Without it, or where its start check fails, {@link ShellProvider.storeGuard}
   * answers `false` and the host keeps the stores read-only (blueprint OD2).
   */
  storeGuardPath?: string;
}>;

const quote = (value: string): string => `'${value.replaceAll("'", String.raw`'\''`)}'`;

/** How long termination may take before survivors are reported (see {@link terminationDeadline}). */
const terminationMilliseconds = terminationDeadline;

/** The util-linux `setsid`, which makes the session's own PTY the controlling terminal that `bwrap --new-session` dropped. */
const linuxSetsid = '/usr/bin/setsid';

/** The Seatbelt rule that lets a shell use exactly its own PTY (never `allowPty`, which grants every `/dev/ttys*`). */
const ownPtyRule =
  '\n; Tau: this session pty only\n(allow file-ioctl file-read-data file-write-data (literal (param "TAU_TTY")))';

const defaultSupervisor = (): Readonly<{ executablePath: string; arguments: readonly string[] }> => {
  const source = import.meta.url.endsWith('.ts');
  const entry = fileURLToPath(new URL(source ? './srt-supervisor.ts' : './srt-supervisor.mjs', import.meta.url));
  return { executablePath: process.execPath, arguments: [entry] };
};

const defaultLoadPty = async (): Promise<PtyBinding> => {
  // eslint-disable-next-line import-x/no-extraneous-dependencies -- optional on purpose: without a toolchain node-pty may be absent, and a terminal launch then answers sandbox-unavailable.
  const module = (await import('node-pty')) as unknown as { default?: PtyBinding } & PtyBinding;
  return module.default ?? module;
};

const unsupported = (
  requirement: Extract<ShellLaunchOutcome, { status: 'unsupported' }>['requirement'],
  message: string,
): ShellLaunchOutcome => ({
  status: 'unsupported',
  requirement,
  message,
});

const inside = (path: string, root: string): boolean => {
  const step = relative(root, path);
  return step === '' || (!step.startsWith('..') && !isAbsolute(step));
};

/**
 * The sandbox-runtime configuration for one launch.
 *
 * Reads are denied under homes, volumes and shared temporary storage, then re-allowed for the launch's readable,
 * writable and read-only roots; `denied`, with the baseline set, stays denied for reads and writes inside them. Writes
 * are allowed only in the writable roots, the read-only roots inside them are denied back to reads, and the runtime's
 * own broad default write roots are denied back off. The network
 * allows exactly the granted names through the launch's own proxy.
 *
 * @public
 * @param launch - The launch.
 * @param options - Provider options.
 * @returns A complete sandbox-runtime configuration.
 */
/**
 * The spellings of each denied path the runtime can mask. Bubblewrap masks a file by binding `/dev/null` over it, and
 * it refuses that bind through a symbolic link, whether at the leaf or at an ancestor (`/var/run` is a link to `/run`
 * on current distributions, so it refuses `/var/run/docker.sock`). On Linux a spelling whose physical
 * path differs is therefore dropped, but only when that physical spelling is itself in the set, so the target stays
 * masked; a path that cannot be resolved keeps its literal spelling. Seatbelt matches both spellings, so macOS keeps
 * them.
 *
 * @param paths - The denied or read-only paths.
 * @returns The spellings to hand the runtime.
 */
const deniedVariants = (paths: readonly string[]): string[] => {
  const variants = physicalVariants(paths);
  if (process.platform !== 'linux') {
    return variants;
  }
  const spelled = new Set(variants);
  return variants.filter((path) => {
    try {
      const physical = realpathSync(path);
      return physical === path || !spelled.has(physical);
    } catch {
      return true;
    }
  });
};

/**
 * Every directory between a writable root and a protected path inside it (D20, E04). On Linux each is bound onto itself,
 * so it is a mount point the shell can neither rename nor remove: a read-only or denied path never moves away with its
 * parent (`mv .tau elsewhere`). macOS needs none, because the runtime already denies moving a protected path's
 * ancestors. Binding a directory that is already writable onto itself widens nothing.
 *
 * @param writable - The launch's writable roots.
 * @param protectedPaths - Its read-only and denied paths.
 * @param denied - Its denied paths, every spelling: no ancestor inside one is bound.
 * @returns The ancestors to bind, outermost first.
 */
const pinnedAncestors = (
  writable: readonly string[],
  protectedPaths: readonly string[],
  denied: readonly string[],
): string[] => {
  if (process.platform !== 'linux') {
    return [];
  }
  const pinned = new Set<string>();
  for (const path of protectedPaths) {
    const root = writable.find((candidate) => candidate !== path && inside(path, candidate));
    if (root === undefined) {
      continue;
    }
    const chain: string[] = [];
    for (let ancestor = dirname(path); ancestor !== root && inside(ancestor, root); ancestor = dirname(ancestor)) {
      chain.unshift(ancestor);
    }
    /*
     * A denied directory is never bound writable onto itself, even when a read-only path lies inside it: the runtime
     * restores a write bind its read-deny tmpfs wiped, which would open the whole denied directory (`.git` around a
     * read-only `.git/objects`). Its tmpfs already keeps the inner path from moving.
     */
    for (const ancestor of chain.filter((step) => !denied.some((deny) => inside(step, deny)))) {
      pinned.add(ancestor);
    }
  }
  return [...pinned].toSorted((left, right) => left.length - right.length);
};

/** Characters the sandbox runtime reads as a glob, which a carved spelling cannot escape. */
const globCharacters = /[*?[\]]/u;

/**
 * Seatbelt read denies for one launch, with each denied directory that holds a path the launch may read spelled so the
 * runtime carves that path out (blueprint E1).
 *
 * Seatbelt is last-match-wins, and the runtime re-emits a literal deny nested inside an allowed root after every
 * allow, so a read allow for `<checkout>/.git/objects` under the `<checkout>/.git` deny is overridden. The runtime
 * re-emits a glob deny instead minus every allow its pattern covers. A denied directory that holds an allowed path is
 * therefore handed over as the one-segment glob that matches exactly its own name (`.gi[t]` for `.git`), which denies
 * the same subtree and leaves the allowed paths inside it readable. Everything else in it stays denied, names created
 * later included. A path the runtime would already read as a glob, or whose last character cannot sit in a bracket,
 * keeps its literal spelling: the inner path then stays denied, which fails closed.
 *
 * Only reads change: writes keep the literal deny, so the carved path stays unwritable.
 *
 * @internal
 * @param denied - The launch's denied paths, every spelling.
 * @param allowed - The paths the launch may read, every spelling.
 * @returns The denied paths, spelled for Seatbelt's read rules.
 */
export const seatbeltReadDenies = (denied: readonly string[], allowed: readonly string[]): string[] =>
  denied.map((path) => {
    if (!allowed.some((candidate) => candidate !== path && inside(candidate, path))) {
      return path;
    }
    const last = path.at(-1) ?? '';
    return globCharacters.test(path) || !/^[\w.]$/u.test(last) ? path : `${path.slice(0, -1)}[${last}]`;
  });

export const shellSandboxProfile = (
  launch: Pick<ShellLaunch, 'filesystem' | 'network' | 'startupFiles'>,
  options: SandboxShellProviderOptions = {},
  runtimeDirectory?: string,
): Record<string, unknown> => {
  const home = options.home ?? homedir();
  /* The human Terminal's Zsh reopens exactly its startup files, read-only; every other baseline entry stays denied. */
  const startupFiles = launch.startupFiles === 'zsh' ? zshStartupFiles(home) : [];
  const denied = deniedVariants([
    ...launch.filesystem.denied,
    ...shellBaselineDenied({ platform: process.platform, home, environment: process.env }).filter(
      (path) => !startupFiles.includes(path),
    ),
  ]);
  const readOnly = [...(launch.filesystem.readOnly ?? []), ...startupFiles];
  const pinned = pinnedAncestors(
    launch.filesystem.writable,
    [...readOnly, ...launch.filesystem.denied],
    physicalVariants(launch.filesystem.denied),
  );
  const { domains } = launch.network;
  const readDenied =
    process.platform === 'darwin'
      ? seatbeltReadDenies(denied, physicalVariants([...launch.filesystem.readable, ...readOnly]))
      : denied;
  return {
    seccomp: sandboxRuntimeSeccomp(),
    javaAgentJarPath: sandboxRuntimeJavaAgent(),
    network: { allowedDomains: [...domains], deniedDomains: domains.length > 0 ? [] : ['*'], strictAllowlist: true },
    filesystem: {
      denyRead: [...new Set([...deniedReadRoots(), ...readDenied])],
      allowRead: physicalVariants([
        ...launch.filesystem.readable,
        ...launch.filesystem.writable,
        ...readOnly,
        ...sandboxRuntimeReadRoots(),
        ...(runtimeDirectory === undefined ? [] : [runtimeDirectory]),
      ]),
      allowWrite: physicalVariants([...launch.filesystem.writable, ...pinned]),
      denyWrite: [...new Set([...deniedWriteRoots(), ...denied, ...deniedVariants(readOnly)])],
    },
    allowPty: false,
    ripgrep: { command: options.ripgrepPath ?? 'rg' },
    ...(process.platform === 'linux'
      ? { bwrapPath: options.bwrapPath ?? '/usr/bin/bwrap', socatPath: options.socatPath ?? '/usr/bin/socat' }
      : {}),
  };
};

/**
 * The command the runtime runs under `/bin/sh -c` inside the sandbox: the launch environment as assignments (so they
 * win over the runtime's own `TMPDIR`), then `exec` of the quoted vector. Nothing from the vector is interpreted. On
 * Linux the launch's announcement ({@link createLaunchAnnouncement}) runs first, and the vector runs only if it
 * succeeded.
 *
 * @public
 * @param launch - The launch.
 * @param announcement - Shell text that announces the workload is about to run, from {@link LaunchAnnouncement}.
 * @returns The command text.
 */
export const shellSandboxCommand = (
  launch: Pick<ShellLaunch, 'executablePath' | 'arguments' | 'environment' | 'stdio'>,
  announcement?: string,
): string => {
  const assignments = Object.entries(launch.environment).map(([name, value]) => `${name}=${quote(value)}`);
  const vector = [launch.executablePath, ...launch.arguments];
  const terminal = launch.stdio.kind === 'terminal' && process.platform === 'linux';
  return [
    ...(announcement === undefined ? [] : [announcement, '&&']),
    ...assignments,
    'exec',
    ...(terminal ? [linuxSetsid, '--ctty', '--wait'] : []),
    ...vector.map((part) => quote(part)),
  ].join(' ');
};

/**
 * Bind the macOS profile to the session's own PTY: the outer shell, which runs outside the sandbox on that PTY, reads
 * its name with `tty` and passes it to `sandbox-exec` as a parameter the appended rule names.
 *
 * @public
 * @param argv - The supervisor's `[shell, '-c', wrapped]` vector.
 * @returns The vector with the own-pty rule, or `undefined` when it is not the shape Tau recognises.
 */
export const bindOwnPty = (argv: readonly string[]): readonly string[] | undefined => {
  const [shell, flag, wrapped] = argv;
  const marker = " /usr/bin/sandbox-exec -p '(version 1)";
  const start = wrapped?.indexOf(marker) ?? -1;
  if (
    shell === undefined ||
    flag !== '-c' ||
    wrapped === undefined ||
    start === -1 ||
    wrapped.includes(marker, start + 1)
  ) {
    return undefined;
  }
  /* The runtime single-quotes the profile, spelling each quote inside it as '"'"'. */
  let close = wrapped.indexOf("'", start + marker.length);
  while (close !== -1 && wrapped.startsWith(`'"'"'`, close)) {
    close = wrapped.indexOf("'", close + `'"'"'`.length);
  }
  if (close === -1) {
    return undefined;
  }
  const profiled = `${wrapped.slice(0, start)} /usr/bin/sandbox-exec -D "TAU_TTY=$TAU_TTY" -p '${wrapped.slice(start + marker.length - '(version 1)'.length, close)}${ownPtyRule}${wrapped.slice(close)}`;
  const guard = 'TAU_TTY=$(/usr/bin/tty) || exit 125; case "$TAU_TTY" in /dev/ttys[0-9]*) ;; *) exit 125 ;; esac; exec';
  return [shell, flag, `${guard} ${profiled.trimStart()}`];
};

type Supervisor = Readonly<{
  /** The supervisor's own process, registered with the launch's custody. */
  pid: number;
  reply: SupervisorReply;
  /** Hand the supervisor the launch's process group, which it kills if this process dies before releasing it. */
  own: (group: number) => void;
  /** An orderly release after confirmed stop. */
  close: () => Promise<void>;
  /** Close the channel without asserting release: the supervisor kills its retained group before it exits. */
  abandon: () => Promise<void>;
}>;

/**
 * On Linux the runtime bridges the sandbox's network to its proxies through Unix sockets it creates under `TMPDIR`,
 * which the profile denies. Each supervisor gets a private directory there instead, readable inside the sandbox so the
 * bridge can connect, and removed when the supervisor closes.
 */
const createRuntimeDirectory = (): string | undefined =>
  process.platform === 'linux' ? mkdtempSync(join(tmpdir(), 'tau-shell-runtime-')) : undefined;

/** A launch as the sandbox runs it, and how to remove what the provider wrote for it. */
type ContainedLaunch = Readonly<{ launch: ShellLaunch; remove: () => void }>;

/**
 * The launch as the sandbox runs it. For the Terminal Zsh, the provider writes its startup wrappers
 * ({@link zshStartupWrappers}) to a private folder that the sandbox reads but cannot write, and only the provider sets
 * `ZDOTDIR` to it: a host value stays refused. The folder is removed when the supervisor closes.
 *
 * @param launch - The admitted launch.
 * @param home - The person's home, which holds their own startup files.
 * @returns The launch to profile and run, and its cleanup.
 */
const containedLaunch = (launch: ShellLaunch, home: string): ContainedLaunch => {
  if (launch.startupFiles !== 'zsh') {
    return { launch, remove: () => undefined };
  }
  const folder = mkdtempSync(join(tmpdir(), 'tau-shell-zsh-'));
  const remove = (): void => {
    rmSync(folder, { recursive: true, force: true });
  };
  try {
    const wrappers = zshStartupWrappers({ folder, home, toolchainBins: launch.toolchainBins ?? [] });
    for (const [name, text] of Object.entries(wrappers)) {
      writeFileSync(join(folder, name), text, { mode: 0o600, flag: 'wx' });
    }
  } catch (error) {
    remove();
    throw error;
  }
  return {
    launch: {
      ...launch,
      filesystem: { ...launch.filesystem, readOnly: [...(launch.filesystem.readOnly ?? []), folder] },
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names.
      environment: { ...launch.environment, ZDOTDIR: folder },
    },
    remove,
  };
};

/**
 * The output streams of a child spawned with an extra descriptor, whose typings no longer promise them.
 *
 * @param child - A child whose standard output and error are pipes.
 * @returns Its two output streams.
 */
const outputsOf = (child: ChildProcess): Readonly<{ stdout: Readable; stderr: Readable }> => {
  const { stdout, stderr } = child;
  if (stdout === null || stderr === null) {
    throw new Error('A launch process is missing an output stream.');
  }
  return { stdout, stderr };
};

/**
 * The standard streams of a supervisor, spawned with its custody lock as an extra descriptor.
 *
 * @param child - A child whose first three descriptors are pipes.
 * @returns Its three standard streams.
 */
const pipesOf = (child: ChildProcess): Readonly<{ stdin: Writable; stdout: Readable; stderr: Readable }> => {
  const { stdin } = child;
  if (stdin === null) {
    throw new Error('A launch process is missing its input stream.');
  }
  return { stdin, ...outputsOf(child) };
};

const startSupervisor = async (
  job: SupervisorJob,
  options: SandboxShellProviderOptions,
  launch: Readonly<{
    runtimeDirectory: string | undefined;
    /** The execution's custody lock: the supervisor inherits it as descriptor 3 and keeps it until it exits. */
    lock: number;
  }>,
): Promise<Supervisor> => {
  const { runtimeDirectory, lock } = launch;
  const { executablePath, arguments: supervisorArguments } = options.supervisor ?? defaultSupervisor();
  const temporaryDirectory = runtimeDirectory ?? process.env['TMPDIR'];
  const child = spawn(executablePath, supervisorArguments, {
    /* The runtime resolves its mandatory deny names against this directory: never a checkout. */
    ...(runtimeDirectory === undefined ? {} : { cwd: runtimeDirectory }),
    /* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */
    env: {
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
      LANG: 'C.UTF-8',
      HOME: options.home ?? homedir(),
      ...(temporaryDirectory === undefined ? {} : { TMPDIR: temporaryDirectory }),
      ...(process.versions['electron'] === undefined ? {} : { ELECTRON_RUN_AS_NODE: '1' }),
    },
    /* eslint-enable @typescript-eslint/naming-convention -- camelCase names resume. */
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe', lock],
  });
  const { stdin, stdout, stderr } = pipesOf(child);
  let diagnostics = '';
  stderr.setEncoding('utf8').on('data', (chunk: string) => {
    diagnostics = (diagnostics + chunk).slice(-4096);
  });
  /* A supervisor that is killed — which `finish` does whenever it has not exited in time — resets its own pipes, and a
   * stream with no error listener turns that into an uncaught exception in whatever process launched the shell. There
   * is nothing to recover: the reply already settles on `close`, and a supervisor that is gone has nothing left to
   * say. Same reason `stdin` has had one all along. */
  stdout.on('error', () => undefined);
  stderr.on('error', () => undefined);
  const exited = new Promise<void>((resolve) => {
    child.once('close', () => {
      resolve();
    });
  });
  stdin.on('error', () => undefined);
  const own = (group: number): void => {
    if (group > 0 && stdin.writable) {
      stdin.write(`${JSON.stringify({ own: group } satisfies SupervisorControl)}\n`);
    }
  };
  const finish = async (released: boolean): Promise<void> => {
    /* An orderly release: the launch's tree is already gone, so the supervisor has nothing to kill. */
    if (released && stdin.writable) {
      stdin.write(`${JSON.stringify({ released: true } satisfies SupervisorControl)}\n`);
    }
    stdin.end();
    const timer = setTimeout(() => child.kill('SIGKILL'), terminationMilliseconds);
    await exited;
    clearTimeout(timer);
    if (runtimeDirectory !== undefined) {
      rmSync(runtimeDirectory, { recursive: true, force: true });
    }
  };
  stdin.write(`${JSON.stringify(job)}\n`);
  const lines = createInterface({ input: stdout });
  const reply = await new Promise<SupervisorReply>((resolve) => {
    const timer = setTimeout(() => {
      resolve({ status: 'unavailable', message: 'the sandbox supervisor did not answer in time.' });
    }, options.startupMilliseconds ?? 30_000);
    lines.once('line', (line) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(line) as SupervisorReply);
      } catch {
        resolve({ status: 'unavailable', message: 'the sandbox supervisor answered malformed output.' });
      }
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      resolve({ status: 'unavailable', message: `the sandbox supervisor could not start: ${error.message}` });
    });
    child.once('close', () => {
      clearTimeout(timer);
      resolve({
        status: 'unavailable',
        message: `the sandbox supervisor exited: ${diagnostics.trim() || 'no output'}`,
      });
    });
  });
  return {
    pid: child.pid ?? -1,
    reply,
    own,
    close: async () => finish(true),
    abandon: async () => finish(false),
  };
};

/** How long an emptied stream may stay quiet after termination before it is closed. */
const quietMilliseconds = 1000;

/** A queued byte stream: chunks pushed from a source, pulled by the host, with backpressure on the source. */
type ByteQueue = Readonly<{
  push: (chunk: Uint8Array<ArrayBuffer>) => void;
  end: () => void;
  /**
   * After the launch's tree is gone: end once the source ends by itself, or once the host has drained every queued
   * chunk and nothing arrived for a quiet period. Only a writer that escaped termination still holds the source then
   * (the disclosed macOS residual); its later bytes are not part of the launch.
   */
  finish: (close: () => void) => void;
  iterable: AsyncIterable<Uint8Array<ArrayBuffer>>;
}>;

// Private diagnostics: numeric queue occupancy only, never command text or output bytes.
const queueDiagnostics = channel('taucad.native-process.shell.byte-queue');
/** Why the store guard's start check failed, once per process; the host keeps read-only stores (blueprint OD2). */
const storeGuardDiagnostics = channel('taucad.native-process.shell.store-guard');
type QueueIdentity = Readonly<{ commandId: string; stream: 'stdout' | 'stderr' | 'pty' }>;

const byteQueue = (pause: () => void, resume: () => void, identity: QueueIdentity): ByteQueue => {
  const queueId = randomUUID();
  let queuedBytes = 0;
  let peakBytes = 0;
  let peakChunks = 0;
  let pauses = 0;
  let resumes = 0;
  const report = (): void => {
    if (queueDiagnostics.hasSubscribers) {
      queueDiagnostics.publish(
        Object.freeze({
          ...identity,
          queueId,
          queuedBytes,
          queuedChunks: chunks.length,
          peakBytes,
          peakChunks,
          pauses,
          resumes,
        }),
      );
    }
  };
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let ended = false;
  let paused = false;
  let lastChunk = Date.now();
  let wake: (() => void) | undefined;
  const highWater = 64;
  const nextChunk = async (): Promise<void> =>
    new Promise<void>((resolve) => {
      wake = resolve;
    });
  const end = (): void => {
    ended = true;
    report();
    wake?.();
  };
  return {
    push: (chunk) => {
      lastChunk = Date.now();
      chunks.push(chunk);
      queuedBytes += chunk.byteLength;
      peakBytes = Math.max(peakBytes, queuedBytes);
      peakChunks = Math.max(peakChunks, chunks.length);
      if (chunks.length >= highWater && !paused) {
        paused = true;
        pauses += 1;
        pause();
      }
      report();
      wake?.();
    },
    end,
    finish: (close) => {
      const timer = setInterval(() => {
        if (ended || (chunks.length === 0 && !paused && Date.now() - lastChunk >= quietMilliseconds)) {
          clearInterval(timer);
          end();
          close();
        }
      }, quietMilliseconds / 4);
      timer.unref();
    },
    iterable: {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          const chunk = chunks.shift();
          if (chunk !== undefined) {
            queuedBytes -= chunk.byteLength;
            if (paused && chunks.length < highWater / 2) {
              paused = false;
              resumes += 1;
              resume();
            }
            report();
            yield chunk;
          } else if (ended) {
            return;
          } else {
            // oxlint-disable-next-line no-await-in-loop -- waits for the next chunk or the end.
            await nextChunk();
            wake = undefined;
          }
        }
      },
    },
  };
};

/*
 * Queue a readable child stream. A stream that carries the launch's announcement passes only what followed it, and
 * tells it how the stream ended.
 */
const queueStream = (
  stream: NodeJS.ReadableStream & { destroy: () => void },
  identity: QueueIdentity,
  announcement?: LaunchAnnouncement,
): ByteQueue => {
  const queue = byteQueue(
    () => stream.pause(),
    () => stream.resume(),
    identity,
  );
  stream.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
    const passed = announcement === undefined ? chunk : announcement.pass(chunk);
    if (passed !== undefined) {
      queue.push(passed);
    }
  });
  stream.on('end', () => {
    announcement?.end(true);
    queue.end();
  });
  /* Without an `end` first, the host destroyed the stream: that proves nothing about what the launch wrote. */
  stream.on('close', () => {
    announcement?.end(false);
    queue.end();
  });
  /* EIO is how a PTY master reports that every slave descriptor has closed. */
  stream.on('error', (error: NodeJS.ErrnoException) => {
    announcement?.end(error.code === 'EIO');
    queue.end();
  });
  return queue;
};

/** Who owns one started launch's cleanup: its supervisor, and the process table cleanup confirms against. */
type LaunchOwner = Readonly<{
  supervisor: Supervisor;
  table: (() => Promise<readonly ProcessRow[]>) | undefined;
}>;

/** Await a promise whose failure another path reports. */
const quietly = async (promise: Promise<unknown>): Promise<void> => {
  try {
    await promise;
  } catch {
    /* Reported where `exited` settles. */
  }
};

type Started = Readonly<{
  pid: number;
  exited: Promise<ShellExit>;
  release: () => void;
}>;

/**
 * Wrap one started launch: termination on exit, abort or disposal, then supervisor release, then settlement.
 *
 * `exited` resolves only once every owned process is confirmed gone. An unreadable process table or a survivor
 * rejects it instead (I7): readers still end, but the supervisor is not told the launch ended in order, so it kills
 * its retained group as it exits, and the caller keeps the launch's roots and custody.
 */
const settle = (
  started: Started,
  { supervisor, table }: LaunchOwner,
  signal: AbortSignal,
): Pick<ShellProcess, 'exited' | 'terminate' | typeof Symbol.asyncDispose> => {
  const tracker = process.platform === 'darwin' ? trackDescendants(started.pid, table) : undefined;
  supervisor.own(started.pid);
  let terminating: Promise<void> | undefined;
  const stopTree = async (): Promise<void> => {
    terminating ??= (async () => {
      let survivors: readonly number[];
      try {
        survivors = await terminateOwnedProcesses({
          root: started.pid,
          group: started.pid,
          deadlineMilliseconds: terminationMilliseconds,
          ...(tracker === undefined ? (table === undefined ? {} : { table }) : { table: tracker.table }),
        });
      } catch (error) {
        throw new Error(
          `Cleanup could not confirm that every owned process stopped: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      } finally {
        await tracker?.stop();
      }
      if (survivors.length > 0) {
        throw new Error(`Owned processes survived termination: ${survivors.join(', ')}.`);
      }
    })();
    await terminating;
  };
  const exited = (async (): Promise<ShellExit> => {
    const onAbort = (): void => {
      void quietly(stopTree());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    let confirmed = false;
    try {
      const exit = await started.exited;
      await stopTree();
      confirmed = true;
      return exit;
    } finally {
      signal.removeEventListener('abort', onAbort);
      started.release();
      await (confirmed ? supervisor.close() : supervisor.abandon());
    }
  })();
  if (signal.aborted) {
    void quietly(stopTree());
  }
  const terminate = async (): Promise<ShellExit> => {
    await quietly(stopTree());
    return exited;
  };
  return {
    exited,
    terminate,
    [Symbol.asyncDispose]: async () => {
      await terminate();
    },
  };
};

const exitOf = async (child: ChildProcess): Promise<ShellExit> =>
  new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      resolve(code === null ? { signal: signal ?? 'SIGKILL' } : { exitCode: code });
    });
    child.once('error', () => {
      resolve({ signal: 'SIGKILL' });
    });
  });

/** The outer wrapper's environment: fixed system paths; the shell's own environment travels in the command. */
const wrapperEnvironment = (launch: ShellLaunch): Record<string, string> => ({
  ...launch.environment,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names.
  PATH: '/usr/bin:/bin',
});

/**
 * The vector this process spawns. On Linux the wrapper shell execs bubblewrap instead of waiting on it, so bwrap's own
 * `--die-with-parent` binds the sandbox to this process: a host that is killed takes every process in the sandbox with
 * it (E11), where a waiting `/bin/sh` would be orphaned and keep bwrap and the shell running.
 *
 * @param argv - The supervisor's `[shell, '-c', wrapped]` vector.
 * @param bwrapPath - The bubblewrap the wrapped command must start with; any other vector is spawned as it is.
 * @returns The vector to spawn.
 */
const hostBound = (argv: readonly string[], bwrapPath: string): readonly string[] =>
  process.platform === 'linux' && argv.length === 3 && argv[1] === '-c' && argv[2]!.startsWith(`${bwrapPath} `)
    ? [argv[0]!, '-c', `exec ${argv[2]!}`]
    : argv;

/**
 * The vector for a launch with guarded stores (blueprint R2): the outer bubblewrap and the guard launcher, which exec
 * the runtime's own command text once the guard is mounted and every capability is dropped. Any other launch keeps
 * its vector.
 *
 * @param argv - The host-bound `[shell, '-c', 'exec <bwrap> …']` vector.
 * @param launch - The launch, whose `guardedStores` decide.
 * @param options - The provider's bubblewrap and guard paths.
 * @returns The vector to spawn, or `undefined` when a guarded launch's vector is not the shape Tau recognises.
 */
const guardedVector = (
  argv: readonly string[],
  launch: ShellLaunch,
  options: SandboxShellProviderOptions,
): readonly string[] | undefined => {
  const guarded = launch.filesystem.guardedStores;
  if (guarded === undefined) {
    return argv;
  }
  const bwrapPath = options.bwrapPath ?? '/usr/bin/bwrap';
  const [shell, flag, command] = argv;
  if (
    options.storeGuardPath === undefined ||
    shell === undefined ||
    flag !== '-c' ||
    command === undefined ||
    !command.startsWith(`exec ${bwrapPath} `)
  ) {
    return undefined;
  }
  return [shell, '-c', storeGuardCommand({ guardPath: options.storeGuardPath, bwrapPath, guarded, command })];
};

/**
 * A launch spawned behind its start barrier (I7): the staged root runs nothing until `open`, and `abandon` makes it
 * exit without executing the workload.
 */
type Staged = Readonly<{
  process: ShellProcess;
  root: number;
  open: () => Promise<void>;
  abandon: () => void;
}>;

const startPipes = (
  { argv, launch, owner }: Readonly<{ argv: readonly string[]; launch: ShellLaunch; owner: LaunchOwner }>,
  announcement: LaunchAnnouncement | undefined,
): Staged => {
  const [executable, ...rest] = stagedStartArguments(argv);
  const child = spawn(executable!, rest, {
    cwd: launch.workingDirectory,
    env: wrapperEnvironment(launch),
    detached: true,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
  });
  const pipes = outputsOf(child);
  const stdout = queueStream(pipes.stdout, { commandId: launch.commandId, stream: 'stdout' });
  const stderr = queueStream(pipes.stderr, { commandId: launch.commandId, stream: 'stderr' }, announcement);
  const settled = settle(
    {
      pid: child.pid ?? -1,
      exited: exitOf(child),
      release: () => {
        stdout.finish(() => {
          pipes.stdout.destroy();
        });
        stderr.finish(() => {
          pipes.stderr.destroy();
        });
      },
    },
    owner,
    launch.signal,
  );
  return {
    process: { kind: 'pipes', stdout: stdout.iterable, stderr: stderr.iterable, ...settled },
    root: child.pid ?? -1,
    open: async () => openStartBarrier(child),
    abandon: () => {
      abandonStartBarrier(child);
    },
  };
};

/** One terminal start: the wrapped vector, the launch, its first size and the supervisor holding its profile. */
type TerminalStart = Readonly<{
  argv: readonly string[];
  launch: ShellLaunch;
  size: ShellTerminalSize;
  owner: LaunchOwner;
}>;

const startLinuxTerminal = (
  { argv, launch, size, owner }: TerminalStart,
  native: NonNullable<PtyBinding['native']>,
  announcement: LaunchAnnouncement | undefined,
): Staged => {
  /* Opened here, so no process outside the sandbox takes it as its controlling terminal; `setsid --ctty` inside does. */
  const pty = native.open(size.columns, size.rows);
  const [executable, ...rest] = stagedStartArguments(argv);
  const child = spawn(executable!, rest, {
    cwd: launch.workingDirectory,
    env: wrapperEnvironment(launch),
    detached: true,
    shell: false,
    stdio: [pty.slave, pty.slave, pty.slave, 'pipe'],
  });
  closeSync(pty.slave);
  const master = new ReadStream(pty.master);
  const queue = queueStream(master, { commandId: launch.commandId, stream: 'pty' }, announcement);
  const settled = settle(
    {
      pid: child.pid ?? -1,
      exited: exitOf(child),
      release: () => {
        queue.finish(() => {
          master.destroy();
        });
      },
    },
    owner,
    launch.signal,
  );
  return {
    process: {
      kind: 'terminal',
      output: queue.iterable,
      write: (bytes) => {
        master.write(bytes);
      },
      resize: ({ columns, rows }) => {
        native.resize(pty.master, columns, rows);
      },
      ...settled,
    },
    root: child.pid ?? -1,
    open: async () => openStartBarrier(child),
    abandon: () => {
      abandonStartBarrier(child);
    },
  };
};

/*
 * Because node-pty cannot pass a descriptor 3, the macOS barrier travels over the session's own PTY: the staged wrapper reads
 * one gate line with echo off. Nothing the PTY printed before the wrapper's start marker reaches the person, and the
 * host writes nothing but the gate before the barrier opens (the process is returned only after it opened).
 */
const startMacTerminal = ({ argv, launch, size, owner }: TerminalStart, binding: PtyBinding): Staged => {
  const gate = createTerminalStartGate();
  const [executable, ...rest] = stagedTerminalStartArguments(argv);
  const terminal = binding.spawn(executable!, rest, {
    name: launch.environment['TERM'] ?? 'xterm-256color',
    cols: size.columns,
    rows: size.rows,
    cwd: launch.workingDirectory,
    env: { ...wrapperEnvironment(launch), ...gate.environment },
    encoding: null,
  });
  const queue = byteQueue(
    () => {
      terminal.pause();
    },
    () => {
      terminal.resume();
    },
    { commandId: launch.commandId, stream: 'pty' },
  );
  terminal.onData((data) => {
    const passed = gate.pass(typeof data === 'string' ? new Uint8Array(Buffer.from(data, 'utf8')) : data);
    if (passed !== undefined) {
      queue.push(passed);
    }
  });
  const exited = new Promise<ShellExit>((resolve) => {
    terminal.onExit(({ exitCode, signal }) => {
      resolve(signal ? { signal: String(signal) } : { exitCode });
    });
  });
  const settled = settle(
    {
      pid: terminal.pid,
      exited,
      release: () => {
        queue.finish(() => {
          terminal.kill('SIGKILL');
        });
      },
    },
    owner,
    launch.signal,
  );
  return {
    process: {
      kind: 'terminal',
      output: queue.iterable,
      write: (bytes) => {
        terminal.write(Buffer.from(bytes));
      },
      resize: ({ columns, rows }) => {
        terminal.resize(columns, rows);
      },
      ...settled,
    },
    root: terminal.pid,
    open: async () => {
      gate.open((line) => {
        terminal.write(Buffer.from(line, 'utf8'));
      });
    },
    abandon: () => {
      terminal.kill('SIGKILL');
    },
  };
};

/**
 * Refuse a launch whose shape the provider cannot enforce, before anything starts.
 */
const admit = (launch: ShellLaunch, options: SandboxShellProviderOptions): ShellLaunchOutcome | undefined => {
  if (process.platform !== 'linux' && process.platform !== 'darwin') {
    return unsupported('platform', `${process.platform} is served by its own shell provider.`);
  }
  const refused = refusedShellEnvironment(launch.environment);
  if (refused.length > 0) {
    return unsupported('environment', `the shell may not receive ${refused.join(', ')}.`);
  }
  const { readable, writable, denied, readOnly = [] } = launch.filesystem;
  const paths = [launch.executablePath, launch.workingDirectory, ...readable, ...writable, ...readOnly, ...denied];
  if (paths.some((path) => !isAbsolute(path) || path.includes('\0'))) {
    return unsupported('filesystem-mask', 'every launch path must be absolute.');
  }
  if (writable.some((root) => denied.some((deny) => inside(root, deny)))) {
    return unsupported('filesystem-mask', 'a writable root lies inside a denied path, so it could not be written.');
  }
  if (writable.some((root) => readOnly.some((path) => inside(root, path)))) {
    return unsupported('filesystem-mask', 'a writable root lies inside a read-only path, so it could not be written.');
  }
  if (launch.network.domains.some((domain) => !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(domain))) {
    return unsupported('network-isolation', 'network grants name exact lowercase host names only.');
  }
  if (
    launch.startupFiles !== undefined &&
    (process.platform !== 'darwin' || launch.stdio.kind !== 'terminal' || launch.executablePath !== '/bin/zsh')
  ) {
    return unsupported('filesystem-mask', 'only the macOS Terminal running /bin/zsh may read Zsh startup files.');
  }
  if (launch.toolchainBins !== undefined && launch.startupFiles === undefined) {
    return unsupported('environment', 'only the Terminal Zsh with its startup files takes toolchain folders.');
  }
  const { guardedStores } = launch.filesystem;
  if (guardedStores !== undefined) {
    if (process.platform !== 'linux' || launch.stdio.kind !== 'terminal' || options.storeGuardPath === undefined) {
      return unsupported(
        'filesystem-mask',
        'only a Linux Terminal launch with the store guard may write guarded stores.',
      );
    }
    const plain = /^[^/\0]+$/u;
    if (
      guardedStores.stores.length === 0 ||
      guardedStores.protect.length === 0 ||
      guardedStores.protect.some((name) => !plain.test(name) || name === '.' || name === '..') ||
      guardedStores.stores.some(
        (store) =>
          !isAbsolute(store) ||
          store.includes('\0') ||
          !writable.some((root) => store !== root && inside(store, root)) ||
          [...readOnly, ...denied].some((path) => inside(store, path) || inside(path, store)),
      )
    ) {
      return unsupported(
        'filesystem-mask',
        'each guarded store must lie inside a writable root, outside every read-only and denied path, with a plain policy.',
      );
    }
  }
  if (launch.stdio.kind === 'terminal') {
    if (process.platform === 'darwin' && options.macOSTerminal !== true) {
      return unsupported('terminal', 'the macOS Terminal waits for the own-pty validation run.');
    }
    if (process.platform === 'linux' && !existsSync(linuxSetsid)) {
      return unsupported('terminal', `${linuxSetsid} (util-linux) is missing, so the sandbox cannot own a terminal.`);
    }
  }
  return undefined;
};

/** The runtime lists a hold is computed from: exactly those of the profile, plus the grant's directory rows. */
const standInProfile = (profile: Record<string, unknown>, launch: ShellLaunch): StandInProfile => {
  const { denyWrite, allowWrite } = profile['filesystem'] as Readonly<{
    denyWrite: readonly string[];
    allowWrite: readonly string[];
  }>;
  return {
    denyWrite,
    allowWrite,
    directories: launch.filesystem.directories,
  };
};

/** How much of the sandbox's own setup diagnostics a refused launch reports, in characters. */
const setupDiagnosticCharacters = 512;

/**
 * The announcement one launch carries. On Linux bubblewrap builds the sandbox only after the barrier opens, so its
 * setup can still fail then, and the announcement tells that apart from the workload's own exit (see
 * {@link createLaunchAnnouncement}). Pipes carry it on standard error, where bubblewrap reports; a terminal on its PTY.
 * macOS refuses a profile before the barrier opens, so it carries none.
 *
 * @param launch - The launch, whose stdio picks the carrying stream.
 * @returns Its announcement, on Linux only.
 */
const announcementFor = (launch: ShellLaunch): LaunchAnnouncement | undefined =>
  process.platform === 'linux' ? createLaunchAnnouncement(launch.stdio.kind === 'pipes' ? 2 : 1) : undefined;

/**
 * Wait for an opened launch's announcement, at most as long as a supervisor may take to answer, and refuse the launch
 * only when the sandbox proved it never started the workload (I7).
 *
 * A launch that neither announced nor ended by then is handed over as started, exactly as before the announcement
 * existed: only proof that nothing ran may turn a launch into a refusal. A refused launch is settled first, so its tree
 * is confirmed stopped and its supervisor and stand-ins released; an unconfirmed stop rejects instead, and the caller
 * keeps its roots. Only then may the caller prepare a fresh launch, whose fresh profile stands in for a protected path
 * that disappeared.
 *
 * @param staged - The opened launch.
 * @param announcement - Its announcement; without one (macOS) the launch is handed over at once.
 * @param wait - The launch's abort signal, and how long to wait (the supervisor startup bound by default).
 * @returns The refusal, or `undefined` when the launch is to be handed over as started.
 */
const refusedSetup = async (
  staged: Staged,
  announcement: LaunchAnnouncement | undefined,
  wait: Readonly<{ signal: AbortSignal; milliseconds: number | undefined }>,
): Promise<ShellLaunchOutcome | undefined> => {
  if (announcement === undefined) {
    return undefined;
  }
  const timer = setTimeout(announcement.abandon, wait.milliseconds ?? 30_000);
  let answer: Awaited<LaunchAnnouncement['answer']>;
  try {
    answer = await announcement.answer;
  } finally {
    clearTimeout(timer);
  }
  if (answer !== 'not-started') {
    return undefined;
  }
  await staged.process.exited;
  wait.signal.throwIfAborted();
  const diagnostic = announcement.preamble().slice(-setupDiagnosticCharacters);
  return {
    status: 'sandbox-unavailable',
    message: 'the sandbox could not be set up, so nothing ran.',
    ...(diagnostic === '' ? {} : { diagnostic }),
    retryable: true,
  };
};

/** The default custody namespace: per user, beside the default private-root parent. */
const defaultCustody = (): Readonly<{ directory: string; sessionDirectory: string }> => ({
  directory: join(tmpdir(), `tau-shell-custody-${String(process.getuid?.() ?? 0)}`),
  sessionDirectory: tmpdir(),
});

/**
 * Create the macOS and Linux shell provider.
 *
 * Every launch is prepared first (I7): its durable receipt and exclusive lock exist before any process. The launch's
 * supervisor inherits the lock, the shell starts behind a start barrier, and the barrier opens only after the
 * supervisor and the staged root are durably registered and this process has handed its copy of the lock away. Once
 * `exited` settles the supervisor has exited, so {@link ShellProvider.recover} can claim the stopped receipt. On Linux a
 * launch is handed over once its sandbox announced the workload; one whose sandbox exited before that ran nothing and
 * answers a `retryable` `sandbox-unavailable` (see {@link createLaunchAnnouncement}).
 *
 * @public
 * @param options - Supervisor, prerequisite paths, custody namespace and the macOS Terminal flag.
 * @returns A provider; each launch is fully contained or refused.
 */
export const createSandboxShellProvider = (options: SandboxShellProviderOptions = {}): ShellProvider => {
  if (process.platform === 'linux' && options.standInJournal !== undefined) {
    useStandInJournal(options.standInJournal);
  }
  const custody = createShellCustody(options.custody ?? defaultCustody());
  /* One start check per process (blueprint R3): a host without the guard keeps read-only stores. */
  let storeGuard: Promise<boolean> | undefined;
  const storeGuardAvailable = async (): Promise<boolean> => {
    storeGuard ??= (async () => {
      if (process.platform !== 'linux' || options.storeGuardPath === undefined) {
        return false;
      }
      const probe = await probeStoreGuard({
        guardPath: options.storeGuardPath,
        bwrapPath: options.bwrapPath ?? '/usr/bin/bwrap',
      }).catch((error: unknown) => ({
        available: false as const,
        reason: error instanceof Error ? error.message : String(error),
      }));
      if (!probe.available) {
        storeGuardDiagnostics.publish({ available: false, reason: probe.reason });
      }
      return probe.available;
    })();
    return storeGuard;
  };
  const stage = async (launch: ShellLaunch, binding: PtyBinding | undefined): Promise<ShellLaunchOutcome> => {
    let lock: number;
    try {
      lock = custody.descriptor(launch.executionId);
    } catch {
      return { status: 'sandbox-unavailable', message: 'This launch was not prepared, so nothing started.' };
    }
    // The runtime also masks its own mandatory names relative to the supervisor's working directory. The supervisor
    // runs in its private runtime directory; a host that itself runs inside a writable root is refused as well.
    if (
      process.platform === 'linux' &&
      physicalVariants(launch.filesystem.writable).some((root) => inside(process.cwd(), root))
    ) {
      return {
        status: 'sandbox-unavailable',
        message: `the host process runs inside a writable root (${process.cwd()}); start it outside every project.`,
      };
    }
    const runtimeDirectory = createRuntimeDirectory();
    // Absent protected paths get shared stand-ins, computed from exactly the lists the runtime is handed, before it
    // observes the filesystem; released only once this launch's supervisor is gone (see holdProtectedStandIns).
    let releaseStandIns: () => void;
    let profile: Record<string, unknown>;
    let contained: ContainedLaunch | undefined;
    try {
      contained = containedLaunch(launch, options.home ?? homedir());
      profile = shellSandboxProfile(contained.launch, options, runtimeDirectory);
      releaseStandIns = holdProtectedStandIns(standInProfile(profile, launch));
    } catch (error) {
      if (runtimeDirectory !== undefined) {
        rmSync(runtimeDirectory, { recursive: true, force: true });
      }
      contained?.remove();
      return {
        status: 'sandbox-unavailable',
        message: `a protected path could not be prepared: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    const { remove } = contained;
    const release = (): void => {
      releaseStandIns();
      remove();
    };
    const announcement = announcementFor(launch);
    let started: Supervisor;
    try {
      started = await startSupervisor(
        {
          profile,
          command: shellSandboxCommand(contained.launch, announcement?.command),
          workingDirectory: launch.workingDirectory,
          commandId: launch.commandId,
          guard: launch.network.domains.length > 0,
        },
        options,
        { runtimeDirectory, lock },
      );
    } catch (error) {
      release();
      throw error;
    }
    const supervisor: Supervisor = {
      ...started,
      close: async () => {
        try {
          await started.close();
        } finally {
          release();
        }
      },
    };
    if (supervisor.reply.status !== 'ready') {
      await supervisor.close();
      return { status: 'sandbox-unavailable', message: supervisor.reply.message };
    }
    if (launch.signal.aborted) {
      await supervisor.close();
      launch.signal.throwIfAborted();
    }
    const argv = guardedVector(
      hostBound(supervisor.reply.argv, options.bwrapPath ?? '/usr/bin/bwrap'),
      launch,
      options,
    );
    if (argv === undefined) {
      await supervisor.close();
      return { status: 'sandbox-unavailable', message: 'the sandbox command could not be wrapped by the store guard.' };
    }
    const owner: LaunchOwner = { supervisor, table: options.processTable };
    let staged: Staged;
    if (launch.stdio.kind === 'pipes') {
      staged = startPipes({ argv, launch, owner }, announcement);
    } else if (process.platform === 'linux') {
      staged = startLinuxTerminal({ argv, launch, size: launch.stdio.size, owner }, binding!.native!, announcement);
    } else {
      const bound = bindOwnPty(argv);
      if (bound === undefined) {
        await supervisor.close();
        return {
          status: 'sandbox-unavailable',
          message: 'the Seatbelt profile could not be bound to the session PTY.',
        };
      }
      staged = startMacTerminal({ argv: bound, launch, size: launch.stdio.size, owner }, binding!);
    }
    /*
     * The staged root is owned by the supervisor (`settle` hands it over) before registration: if this process dies
     * now, the root never ran anything and the supervisor still stops it. A failure here abandons the barrier; an
     * unconfirmed stop of the staged root rejects the launch, and the caller keeps its roots.
     */
    try {
      await custody.register({ executionId: launch.executionId, supervisor: supervisor.pid, root: staged.root });
      await custody.handoff(launch.executionId);
      await staged.open();
    } catch (error) {
      staged.abandon();
      await staged.process.terminate();
      return {
        status: 'sandbox-unavailable',
        message: `Tau could not take custody of this launch, so it did not run: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    /* A sandbox that exits before its announcement failed to set up: never the workload's exit (I7). */
    const refused = await refusedSetup(staged, announcement, {
      signal: launch.signal,
      milliseconds: options.startupMilliseconds,
    });
    return refused ?? { status: 'started', process: staged.process };
  };
  return {
    name: 'srt-0.0.75',
    storeGuard: storeGuardAvailable,
    prepare: async (input) => custody.prepare(input),
    inventory: async () => custody.inventory(),
    recover: async (input) => custody.recover(input),
    release: async (input) => custody.release(input),
    launch: async (launch) => {
      launch.signal.throwIfAborted();
      const refusal = admit(launch, options);
      if (refusal !== undefined) {
        return refusal;
      }
      if (launch.filesystem.guardedStores !== undefined && !(await storeGuardAvailable())) {
        return { status: 'sandbox-unavailable', message: 'the store guard cannot start on this device.' };
      }
      let binding: PtyBinding | undefined;
      if (launch.stdio.kind === 'terminal') {
        try {
          binding = await (options.loadPty ?? defaultLoadPty)();
        } catch (error) {
          return {
            status: 'sandbox-unavailable',
            message: `node-pty could not load: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
        if (process.platform === 'linux' && binding.native === null) {
          return { status: 'sandbox-unavailable', message: 'node-pty has no POSIX binding on this host.' };
        }
      }
      return stage(launch, binding);
    },
  };
};
