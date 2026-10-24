/**
 * The macOS and Linux shell provider over the pinned sandbox runtime (blueprint D3, D6, D20, D26, I2, I7).
 *
 * Each launch starts its own credential-free supervisor ({@link SupervisorJob}), which initializes the runtime with
 * that launch's immutable profile and holds its proxy. The provider spawns the shell from the vector the supervisor
 * returns, so the shell never inherits the supervisor's channel, and settles only after every owned descendant has
 * stopped and the supervisor has released the runtime.
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { closeSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, relative } from 'node:path';
import { createInterface } from 'node:readline';
import { ReadStream } from 'node:tty';
import { fileURLToPath } from 'node:url';

import { deniedReadRoots, deniedWriteRoots, physicalVariants, sandboxRuntimeReadRoots } from '#native-sandbox.js';
import { processTable, terminateOwnedProcesses } from '#shell/process-tree.js';
import type { ProcessRow } from '#shell/process-tree.js';
import { shellBaselineDenied } from '#shell/shell-baseline.js';
import { refusedShellEnvironment } from '#shell/shell-environment.js';
import type {
  ShellExit,
  ShellLaunch,
  ShellLaunchOutcome,
  ShellProcess,
  ShellProvider,
  ShellTerminalSize,
} from '#shell/shell-provider.js';
import type { SupervisorJob, SupervisorReply } from '#shell/srt-supervisor.js';

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
   * On macOS, allow `terminal` launches, carrying the session-scoped own-pty Seatbelt rule. Off until the operator's
   * own-pty validation run passes (ruling 2026-10-24T05:39Z); off answers `unsupported: terminal`.
   */
  macOSTerminal?: boolean;
  /** Load node-pty; injectable for tests. */
  loadPty?: () => Promise<PtyBinding>;
  /** How long a supervisor may take to answer. */
  startupMilliseconds?: number;
}>;

const quote = (value: string): string => `'${value.replaceAll("'", String.raw`'\''`)}'`;

/** How long termination may take before survivors are reported. */
const terminationMilliseconds = 5000;

/** How often the macOS provider records the process tree, so a job that leaves the group is still owned. */
const trackingMilliseconds = 250;

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
 * Reads are denied under homes, volumes and shared temporary storage, then re-allowed for the launch's readable and
 * writable roots; `denied`, with the baseline set, stays denied for reads and writes inside them. Writes are allowed
 * only in the writable roots, and the runtime's own broad default write roots are denied back off. The network
 * allows exactly the granted names through the launch's own proxy.
 *
 * @public
 * @param launch - The launch.
 * @param options - Provider options.
 * @returns A complete sandbox-runtime configuration.
 */
export const shellSandboxProfile = (
  launch: Pick<ShellLaunch, 'filesystem' | 'network'>,
  options: SandboxShellProviderOptions = {},
): Record<string, unknown> => {
  const denied = physicalVariants([
    ...launch.filesystem.denied,
    ...shellBaselineDenied({ platform: process.platform, home: options.home ?? homedir(), environment: process.env }),
  ]);
  const { domains } = launch.network;
  return {
    network: { allowedDomains: [...domains], deniedDomains: domains.length > 0 ? [] : ['*'], strictAllowlist: true },
    filesystem: {
      denyRead: [...new Set([...deniedReadRoots(), ...denied])],
      allowRead: physicalVariants([
        ...launch.filesystem.readable,
        ...launch.filesystem.writable,
        ...sandboxRuntimeReadRoots(),
      ]),
      allowWrite: physicalVariants(launch.filesystem.writable),
      denyWrite: [...new Set([...deniedWriteRoots(), ...denied])],
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
 * win over the runtime's own `TMPDIR`), then `exec` of the quoted vector. Nothing from the vector is interpreted.
 *
 * @public
 * @param launch - The launch.
 * @returns The command text.
 */
export const shellSandboxCommand = (
  launch: Pick<ShellLaunch, 'executablePath' | 'arguments' | 'environment' | 'stdio'>,
): string => {
  const assignments = Object.entries(launch.environment).map(([name, value]) => `${name}=${quote(value)}`);
  const vector = [launch.executablePath, ...launch.arguments];
  const terminal = launch.stdio.kind === 'terminal' && process.platform === 'linux';
  return [
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

type Supervisor = Readonly<{ reply: SupervisorReply; close: () => Promise<void> }>;

const startSupervisor = async (job: SupervisorJob, options: SandboxShellProviderOptions): Promise<Supervisor> => {
  const { executablePath, arguments: supervisorArguments } = options.supervisor ?? defaultSupervisor();
  const child = spawn(executablePath, supervisorArguments, {
    /* eslint-disable @typescript-eslint/naming-convention -- environment variables keep their wire names. */
    env: {
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
      LANG: 'C.UTF-8',
      HOME: options.home ?? homedir(),
      ...(process.env['TMPDIR'] === undefined ? {} : { TMPDIR: process.env['TMPDIR'] }),
      ...(process.versions['electron'] === undefined ? {} : { ELECTRON_RUN_AS_NODE: '1' }),
    },
    /* eslint-enable @typescript-eslint/naming-convention -- camelCase names resume. */
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let diagnostics = '';
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    diagnostics = (diagnostics + chunk).slice(-4096);
  });
  const exited = new Promise<void>((resolve) => {
    child.once('close', () => {
      resolve();
    });
  });
  child.stdin.on('error', () => undefined);
  const close = async (): Promise<void> => {
    child.stdin.end();
    const timer = setTimeout(() => child.kill('SIGKILL'), terminationMilliseconds);
    await exited;
    clearTimeout(timer);
  };
  child.stdin.write(`${JSON.stringify(job)}\n`);
  const lines = createInterface({ input: child.stdout });
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
  return { reply, close };
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

const byteQueue = (pause: () => void, resume: () => void): ByteQueue => {
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
    wake?.();
  };
  return {
    push: (chunk) => {
      lastChunk = Date.now();
      chunks.push(chunk);
      if (chunks.length >= highWater && !paused) {
        paused = true;
        pause();
      }
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
            if (paused && chunks.length < highWater / 2) {
              paused = false;
              resume();
            }
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

/** Queue a readable child stream. */
const queueStream = (stream: NodeJS.ReadableStream & { destroy: () => void }): ByteQueue => {
  const queue = byteQueue(
    () => stream.pause(),
    () => stream.resume(),
  );
  stream.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
    queue.push(chunk);
  });
  stream.on('end', queue.end);
  stream.on('close', queue.end);
  /* EIO is how a PTY master reports that every slave descriptor has closed. */
  stream.on('error', queue.end);
  return queue;
};

/**
 * Descendant tracking on macOS: every process ever seen in the tree is remembered with its group, so a job that moves
 * to its own process group (interactive job control) and is reparented when the shell exits is still terminated.
 */
const trackDescendants = (root: number): { stop: () => Promise<void>; table: () => Promise<readonly ProcessRow[]> } => {
  const seen = new Map<number, number>();
  const remember = async (): Promise<readonly ProcessRow[]> => {
    const rows = await processTable();
    const tree = new Set([root, ...seen.keys()]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const row of rows) {
        if (!tree.has(row.pid) && tree.has(row.ppid)) {
          tree.add(row.pid);
          seen.set(row.pid, row.pgid);
          grew = true;
        }
      }
    }
    /* A remembered process still owned shows up as a child of the root, whatever its parent is now. */
    return rows.map((row) => (seen.get(row.pid) === row.pgid ? { ...row, ppid: root } : row));
  };
  const poll = async (): Promise<void> => {
    try {
      await remember();
    } catch {
      /* A failed poll is retried on the next tick; termination takes a fresh table of its own. */
    }
  };
  let latest: Promise<void> = Promise.resolve();
  const timer = setInterval(() => {
    latest = poll();
  }, trackingMilliseconds);
  timer.unref();
  return {
    stop: async () => {
      clearInterval(timer);
      await latest;
    },
    table: remember,
  };
};

type Started = Readonly<{
  pid: number;
  exited: Promise<ShellExit>;
  release: () => void;
}>;

/**
 * Wrap one started launch: termination on exit, abort or disposal, then supervisor release, then settlement.
 */
const settle = (
  started: Started,
  supervisor: Supervisor,
  signal: AbortSignal,
): Pick<ShellProcess, 'exited' | 'terminate' | typeof Symbol.asyncDispose> => {
  const tracker = process.platform === 'darwin' ? trackDescendants(started.pid) : undefined;
  let terminating: Promise<void> | undefined;
  const stopTree = async (): Promise<void> => {
    terminating ??= (async () => {
      await terminateOwnedProcesses({
        root: started.pid,
        group: started.pid,
        deadlineMilliseconds: terminationMilliseconds,
        ...(tracker === undefined ? {} : { table: tracker.table }),
      });
      await tracker?.stop();
    })();
    await terminating;
  };
  const exited = (async (): Promise<ShellExit> => {
    const onAbort = (): void => {
      void stopTree();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      const exit = await started.exited;
      await stopTree();
      return exit;
    } finally {
      signal.removeEventListener('abort', onAbort);
      started.release();
      await supervisor.close();
    }
  })();
  if (signal.aborted) {
    void stopTree();
  }
  const terminate = async (): Promise<ShellExit> => {
    await stopTree();
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

const startPipes = (argv: readonly string[], launch: ShellLaunch, supervisor: Supervisor): ShellProcess => {
  const child = spawn(argv[0]!, argv.slice(1), {
    cwd: launch.workingDirectory,
    env: wrapperEnvironment(launch),
    detached: true,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = queueStream(child.stdout);
  const stderr = queueStream(child.stderr);
  const settled = settle(
    {
      pid: child.pid ?? -1,
      exited: exitOf(child),
      release: () => {
        stdout.finish(() => {
          child.stdout.destroy();
        });
        stderr.finish(() => {
          child.stderr.destroy();
        });
      },
    },
    supervisor,
    launch.signal,
  );
  return { kind: 'pipes', stdout: stdout.iterable, stderr: stderr.iterable, ...settled };
};

/** One terminal start: the wrapped vector, the launch, its first size and the supervisor holding its profile. */
type TerminalStart = Readonly<{
  argv: readonly string[];
  launch: ShellLaunch;
  size: ShellTerminalSize;
  supervisor: Supervisor;
}>;

const startLinuxTerminal = (
  { argv, launch, size, supervisor }: TerminalStart,
  native: NonNullable<PtyBinding['native']>,
): ShellProcess => {
  /* Opened here, so no process outside the sandbox takes it as its controlling terminal; `setsid --ctty` inside does. */
  const pty = native.open(size.columns, size.rows);
  const child = spawn(argv[0]!, argv.slice(1), {
    cwd: launch.workingDirectory,
    env: wrapperEnvironment(launch),
    detached: true,
    shell: false,
    stdio: [pty.slave, pty.slave, pty.slave],
  });
  closeSync(pty.slave);
  const master = new ReadStream(pty.master);
  const queue = queueStream(master);
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
    supervisor,
    launch.signal,
  );
  return {
    kind: 'terminal',
    output: queue.iterable,
    write: (bytes) => {
      master.write(bytes);
    },
    resize: ({ columns, rows }) => {
      native.resize(pty.master, columns, rows);
    },
    ...settled,
  };
};

const startMacTerminal = ({ argv, launch, size, supervisor }: TerminalStart, binding: PtyBinding): ShellProcess => {
  const terminal = binding.spawn(argv[0]!, argv.slice(1), {
    name: launch.environment['TERM'] ?? 'xterm-256color',
    cols: size.columns,
    rows: size.rows,
    cwd: launch.workingDirectory,
    env: wrapperEnvironment(launch),
    encoding: null,
  });
  const queue = byteQueue(
    () => {
      terminal.pause();
    },
    () => {
      terminal.resume();
    },
  );
  terminal.onData((data) => {
    queue.push(typeof data === 'string' ? Buffer.from(data, 'utf8') : data);
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
    supervisor,
    launch.signal,
  );
  return {
    kind: 'terminal',
    output: queue.iterable,
    write: (bytes) => {
      terminal.write(Buffer.from(bytes));
    },
    resize: ({ columns, rows }) => {
      terminal.resize(columns, rows);
    },
    ...settled,
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
  const { readable, writable, denied } = launch.filesystem;
  const paths = [launch.executablePath, launch.workingDirectory, ...readable, ...writable, ...denied];
  if (paths.some((path) => !isAbsolute(path) || path.includes('\0'))) {
    return unsupported('filesystem-mask', 'every launch path must be absolute.');
  }
  if (writable.some((root) => denied.some((deny) => inside(root, deny)))) {
    return unsupported('filesystem-mask', 'a writable root lies inside a denied path, so it could not be written.');
  }
  if (launch.network.domains.some((domain) => !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(domain))) {
    return unsupported('network-isolation', 'network grants name exact lowercase host names only.');
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

/**
 * Create the macOS and Linux shell provider.
 *
 * @public
 * @param options - Supervisor, prerequisite paths and the macOS Terminal flag.
 * @returns A provider; each launch is fully contained or refused.
 */
export const createSandboxShellProvider = (options: SandboxShellProviderOptions = {}): ShellProvider => ({
  name: 'srt-0.0.75',
  launch: async (launch) => {
    launch.signal.throwIfAborted();
    const refusal = admit(launch, options);
    if (refusal !== undefined) {
      return refusal;
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
    const supervisor = await startSupervisor(
      {
        profile: shellSandboxProfile(launch, options),
        command: shellSandboxCommand(launch),
        workingDirectory: launch.workingDirectory,
        commandId: launch.commandId,
        guard: launch.network.domains.length > 0,
      },
      options,
    );
    if (supervisor.reply.status !== 'ready') {
      await supervisor.close();
      return { status: 'sandbox-unavailable', message: supervisor.reply.message };
    }
    if (launch.signal.aborted) {
      await supervisor.close();
      launch.signal.throwIfAborted();
    }
    const { argv } = supervisor.reply;
    if (launch.stdio.kind === 'pipes') {
      return { status: 'started', process: startPipes(argv, launch, supervisor) };
    }
    if (process.platform === 'linux') {
      return {
        status: 'started',
        process: startLinuxTerminal({ argv, launch, size: launch.stdio.size, supervisor }, binding!.native!),
      };
    }
    const bound = bindOwnPty(argv);
    if (bound === undefined) {
      await supervisor.close();
      return { status: 'sandbox-unavailable', message: 'the Seatbelt profile could not be bound to the session PTY.' };
    }
    return {
      status: 'started',
      process: startMacTerminal({ argv: bound, launch, size: launch.stdio.size, supervisor }, binding!),
    };
  },
});
