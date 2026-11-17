/**
 * The win32 shell provider over `tau-windows-sandbox.exe` (blueprint D14, D15, D20, D26; Q15; `windows-sandbox/README.md`).
 *
 * Each launch runs the helper's `launch` subcommand and speaks the framed protocol on its stdin and stdout
 * ({@link encodeWindowsHostFrame}): the spec, then `ready` once the helper journaled and applied the launch's
 * descriptors with the runner suspended at its barrier, then the provider durably records the helper's processes and
 * only then sends `start`. `exited` settles only on the helper's `exit`, sent once the shell's job is empty and every
 * descriptor is restored; `cleanup-failed`, a helper that dies without `exit`, and a protocol violation reject it, and
 * the journal stays for {@link ShellProvider.recover}, which has the helper's `restore` write the descriptors back.
 *
 * Launches run concurrently (`windows-sandbox/README.md` "Sessions"): each grants only SIDs of its own and restores by
 * removing exactly those, the helper serializes the descriptor edits themselves, and an earlier launch's unrestored
 * journal stays registered with the helper, so a new launch may start beside it and recovery restores it later.
 */
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join, win32 } from 'node:path';

import { shellBaselineDenied } from '#shell/shell-baseline.js';
import { refusedShellEnvironment } from '#shell/shell-environment.js';
import type {
  ShellExit,
  ShellLaunch,
  ShellLaunchOutcome,
  ShellProcess,
  ShellProvider,
  ShellRequirement,
  ShellTerminalSize,
} from '#shell/shell-provider.js';
import {
  WindowsSandboxProtocolError,
  createWindowsFrameDecoder,
  decodeWindowsHelperFrame,
  encodeWindowsHostFrame,
  isShellRequirement,
  windowsHelperEnd,
  windowsLaunchSpec,
  windowsSandboxProtocolVersion,
} from '#shell/windows-sandbox-protocol.js';
import type {
  WindowsHelperFrame,
  WindowsHelperReady,
  WindowsHelperRefusal,
  WindowsHostFrame,
} from '#shell/windows-sandbox-protocol.js';
import { createWindowsShellCustody } from '#shell/windows-shell-custody.js';

/**
 * Start the helper with one subcommand's arguments, its three standard streams piped.
 *
 * @public
 */
export type WindowsSandboxHelperSpawn = (arguments_: readonly string[]) => ChildProcessWithoutNullStreams;

/** @public */
export type WindowsShellProviderOptions = Readonly<{
  /** The absolute path of `tau-windows-sandbox.exe`. */
  helperPath: string;
  /**
   * Where the provider keeps its durable execution receipts and the helper's ACL journals (I7), and the one parent its
   * launches' private roots may live in. Defaults to a directory under the system temporary directory and that
   * directory; a host with application data passes a directory there, so receipts survive until recovery.
   */
  custody?: Readonly<{ directory: string; sessionDirectory: string }> | undefined;
  /** Start the helper; injectable for tests. Defaults to spawning {@link WindowsShellProviderOptions.helperPath}. */
  spawnHelper?: WindowsSandboxHelperSpawn | undefined;
  /** The person's home root, for the baseline read-deny set. */
  home?: string | undefined;
  /** The host environment, for `ProgramFiles`, `SystemRoot` and the profile roots. Defaults to `process.env`. */
  environment?: Readonly<Record<string, string | undefined>> | undefined;
  /** How long the helper may take to answer `ready`. Defaults to thirty seconds. */
  startupMilliseconds?: number | undefined;
  /** How long the helper may take to report `exit` after `terminate`, or to stop after `exit`. Defaults to ten seconds. */
  terminationMilliseconds?: number | undefined;
  /** Whether a process exists, for recovery; injectable for tests. */
  processAlive?: ((pid: number) => boolean) | undefined;
  /**
   * Receives each line a launch's helper writes to its diagnostic log, such as the runner's AppContainer, registry and
   * COM checks, for the host's own log. The lines name SIDs and Windows error codes, never file contents or secrets.
   */
  onHelperDiagnostic?: ((line: string) => void) | undefined;
}>;

/** What the helper's `status` reports. @public */
export type WindowsSandboxStatus = Readonly<{
  installed: boolean;
  /**
   * Why a `status` run did not read as installed, when it was not a clean "no install record": the spawn error, a
   * timeout, the exit code or signal, unparsable output and the helper's stderr (bounded). For a host's log.
   */
  diagnostic?: string | undefined;
}>;

/** How much of the helper's own diagnostic log a refusal or failure carries, in characters. */
const diagnosticCharacters = 512;

/** The environment names the helper itself receives: Windows system locations, never the host's own settings. */
const helperEnvironmentNames = [
  'SystemRoot',
  'SystemDrive',
  'windir',
  'ProgramData',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'ProgramW6432',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'USERNAME',
  'USERDOMAIN',
  'COMPUTERNAME',
];

/**
 * The helper's environment: the allowlisted Windows names from the host, and `PATH` limited to System32.
 *
 * @param environment - The host environment.
 * @returns The helper's environment.
 */
const helperEnvironment = (environment: Readonly<Record<string, string | undefined>>): Record<string, string> => {
  const lower = new Map(Object.entries(environment).map(([name, value]) => [name.toLowerCase(), value]));
  const chosen: Record<string, string> = {};
  for (const name of helperEnvironmentNames) {
    const value = lower.get(name.toLowerCase());
    if (value !== undefined && value !== '') {
      chosen[name] = value;
    }
  }
  const systemRoot = chosen['SystemRoot'];
  if (systemRoot !== undefined) {
    chosen['PATH'] = win32.join(systemRoot, 'System32');
    /* Windows expands `%SystemDrive%` for the ProgramData known folder, where the helper keeps its install record;
       a host that passes no `SystemDrive` (the desktop services utility did not) gets the Windows directory's drive.
       The helper completes its own environment the same way. */
    const drive = /^[A-Za-z]:/u.exec(systemRoot)?.[0];
    if (chosen['SystemDrive'] === undefined && drive !== undefined) {
      chosen['SystemDrive'] = drive.toUpperCase();
    }
  }
  return chosen;
};

const defaultSpawn =
  (helperPath: string, environment: Readonly<Record<string, string | undefined>>): WindowsSandboxHelperSpawn =>
  (arguments_) =>
    spawn(helperPath, [...arguments_], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: helperEnvironment(environment),
    });

const unsupported = (requirement: ShellRequirement, message: string): ShellLaunchOutcome => ({
  status: 'unsupported',
  requirement,
  message,
});

/** Reject a launch its caller cancelled, with the caller's own reason. */
const cancelled: (signal: AbortSignal) => never = (signal) => {
  signal.throwIfAborted();
  throw new Error('The launch was cancelled.');
};

/** A Windows path rooted at a drive (`C:\`) or a UNC share; never drive-relative or root-relative. */
const absoluteWindowsPath = (path: string): boolean =>
  !path.includes('\0') && (/^[A-Za-z]:[\\/]/u.test(path) || /^[\\/]{2}[^\\/]/u.test(path));

const insideWindows = (path: string, root: string): boolean => {
  const step = win32.relative(root.toLowerCase(), path.toLowerCase());
  return step === '' || (!step.startsWith('..') && !win32.isAbsolute(step));
};

/**
 * The PowerShell executables the helper may run: the fixed paths {@link resolveShellExecutable} resolves on Windows.
 *
 * @param environment - The host environment.
 * @returns The fixed paths, lower-cased and normalized.
 */
const fixedPowerShells = (environment: Readonly<Record<string, string | undefined>>): readonly string[] => {
  const programFiles = environment['ProgramFiles'] ?? environment['PROGRAMFILES'];
  const systemRoot = environment['SystemRoot'] ?? environment['SYSTEMROOT'];
  return [
    ...(programFiles ? [win32.join(programFiles, 'PowerShell', '7', 'pwsh.exe')] : []),
    ...(systemRoot ? [win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')] : []),
  ].map((path) => win32.normalize(path).toLowerCase());
};

const validSize = (size: ShellTerminalSize): boolean =>
  Number.isInteger(size.columns) && Number.isInteger(size.rows) && size.columns > 0 && size.rows > 0;

/**
 * Refuse a launch whose shape the helper cannot enforce, before anything starts.
 *
 * @param launch - The launch.
 * @param environment - The host environment, for the fixed PowerShell paths.
 * @returns The refusal, or `undefined` when the launch may start.
 */
const admit = (
  launch: ShellLaunch,
  environment: Readonly<Record<string, string | undefined>>,
): ShellLaunchOutcome | undefined => {
  if (!fixedPowerShells(environment).includes(win32.normalize(launch.executablePath).toLowerCase())) {
    return unsupported('platform', 'the Windows sandbox runs only PowerShell from its fixed system paths.');
  }
  const refused = refusedShellEnvironment(launch.environment);
  if (refused.length > 0) {
    return unsupported('environment', `the shell may not receive ${refused.join(', ')}.`);
  }
  if (launch.startupFiles !== undefined) {
    return unsupported('filesystem-mask', 'only the macOS Terminal running /bin/zsh may read Zsh startup files.');
  }
  if (launch.toolchainBins !== undefined) {
    return unsupported('environment', 'only the Terminal Zsh with its startup files takes toolchain folders.');
  }
  if (launch.filesystem.guardedStores !== undefined) {
    return unsupported('filesystem-mask', 'the Windows sandbox has no store guard, so guarded stores stay read-only.');
  }
  if (launch.network.domains.length > 0) {
    return unsupported(
      'network-isolation',
      'the Windows sandbox blocks all network access until its per-launch proxy ships.',
    );
  }
  const { readable, writable, denied, readOnly = [] } = launch.filesystem;
  const paths = [launch.workingDirectory, ...readable, ...writable, ...readOnly, ...denied];
  if (!paths.every((path) => absoluteWindowsPath(path))) {
    return unsupported('filesystem-mask', 'every launch path must be an absolute Windows path.');
  }
  if (writable.some((root) => denied.some((deny) => insideWindows(root, deny)))) {
    return unsupported('filesystem-mask', 'a writable root lies inside a denied path, so it could not be written.');
  }
  if (writable.some((root) => readOnly.some((path) => insideWindows(root, path)))) {
    return unsupported('filesystem-mask', 'a writable root lies inside a read-only path, so it could not be written.');
  }
  if (launch.stdio.kind === 'terminal' && !validSize(launch.stdio.size)) {
    return unsupported('terminal', 'a terminal needs a positive whole number of columns and rows.');
  }
  return undefined;
};

/** A single-consumer byte stream fed by frames: it ends once the launch has ended. */
const createByteQueue = (): Readonly<{
  push: (bytes: Uint8Array<ArrayBuffer>) => void;
  end: () => void;
  iterable: AsyncIterable<Uint8Array<ArrayBuffer>>;
}> => {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let ended = false;
  let wake: (() => void) | undefined;
  const notify = (): void => {
    const waiting = wake;
    wake = undefined;
    waiting?.();
  };
  const more = async (): Promise<void> =>
    new Promise<void>((resolve) => {
      wake = resolve;
    });
  return {
    push: (bytes) => {
      if (!ended && bytes.byteLength > 0) {
        chunks.push(bytes);
        notify();
      }
    },
    end: () => {
      ended = true;
      notify();
    },
    iterable: {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          const next = chunks.shift();
          if (next !== undefined) {
            yield next;
            continue;
          }
          if (ended) {
            return;
          }
          // oxlint-disable-next-line no-await-in-loop -- waits for the next frame.
          await more();
        }
      },
    },
  };
};

/** How a launch's helper channel ended: the protocol's own endings, a violation, or the helper process gone. */
type Ending =
  | Readonly<{ kind: 'exit'; exit: ShellExit }>
  | Readonly<{ kind: 'cleanup-failed'; message: string }>
  | Readonly<{ kind: 'protocol'; message: string }>
  | Readonly<{ kind: 'closed'; message: string }>;

/** What the helper answered before the start barrier. */
type Answer =
  | Readonly<{ kind: 'ready'; ready: WindowsHelperReady }>
  | Readonly<{ kind: 'refused'; refusal: WindowsHelperRefusal }>
  | Readonly<{ kind: 'failed'; message: string }>;

/**
 * What the helper answered to `start`: `started` once the shell was admitted and runs, or `refused` (after `ready`,
 * before `started`) when the shell could not be started and the helper restored everything.
 */
type Launched =
  | Readonly<{ kind: 'started' }>
  | Readonly<{ kind: 'refused'; refusal: WindowsHelperRefusal }>
  | Readonly<{ kind: 'failed'; message: string }>;

/**
 * One helper `launch` process and its framed channel.
 *
 * @param child - The spawned helper.
 * @param stdio - The launch's stdio kind, which decides the output frames it may send.
 * @returns The channel.
 */
const openChannel = (
  child: ChildProcessWithoutNullStreams,
  stdio: ShellLaunch['stdio']['kind'],
  onDiagnostic?: (line: string) => void,
) => {
  const decoder = createWindowsFrameDecoder();
  const answer = Promise.withResolvers<Answer>();
  const launched = Promise.withResolvers<Launched>();
  const ending = Promise.withResolvers<Ending>();
  const closed = Promise.withResolvers<void>();
  const outputs = {
    stdout: createByteQueue(),
    stderr: createByteQueue(),
    output: createByteQueue(),
  };
  const state = {
    phase: 'awaiting-ready' as 'awaiting-ready' | 'ready' | 'starting' | 'running' | 'ended',
    closed: false,
  };
  let diagnostics = '';
  let partialLine = '';
  let inputOpen = true;
  const finish = (end: Ending): void => {
    if (state.phase === 'ended') {
      return;
    }
    state.phase = 'ended';
    /* Only a launch that ended before `ready`, or before `started`, still waits on these. */
    const failed = {
      kind: 'failed',
      message: end.kind === 'exit' ? 'the sandbox helper ended the launch.' : end.message,
    } as const;
    answer.resolve(failed);
    launched.resolve(failed);
    ending.resolve(end);
    for (const queue of Object.values(outputs)) {
      queue.end();
    }
  };
  const closeInput = (): void => {
    if (inputOpen) {
      inputOpen = false;
      child.stdin.end();
    }
  };
  const send = (frame: WindowsHostFrame): void => {
    if (inputOpen && child.stdin.writable) {
      child.stdin.write(encodeWindowsHostFrame(frame));
    }
  };
  const violation = (message: string): void => {
    send({ type: 'terminate' });
    closeInput();
    finish({
      kind: 'protocol',
      message: `The sandbox helper broke the launch protocol: ${message}`,
    });
  };
  const handle = (frame: WindowsHelperFrame): void => {
    if (state.phase === 'awaiting-ready') {
      if (frame.type === 'ready') {
        state.phase = 'ready';
        answer.resolve({ kind: 'ready', ready: frame.ready });
      } else if (frame.type === 'refused') {
        state.phase = 'ended';
        answer.resolve({ kind: 'refused', refusal: frame.refusal });
        ending.resolve({ kind: 'closed', message: frame.refusal.message });
      } else {
        violation(`it sent ${frame.type} before ready.`);
      }
      return;
    }
    if (state.phase === 'ready') {
      violation(`it sent ${frame.type} before start.`);
      return;
    }
    if (state.phase === 'starting') {
      switch (frame.type) {
        case 'started': {
          state.phase = 'running';
          launched.resolve({ kind: 'started' });
          return;
        }
        case 'refused': {
          state.phase = 'ended';
          launched.resolve({ kind: 'refused', refusal: frame.refusal });
          ending.resolve({ kind: 'closed', message: frame.refusal.message });
          for (const queue of Object.values(outputs)) {
            queue.end();
          }
          return;
        }
        case 'cleanup-failed': {
          break;
        }
        default: {
          violation(`it sent ${frame.type} before started.`);
          return;
        }
      }
    }
    switch (frame.type) {
      case 'stdout':
      case 'stderr': {
        if (stdio !== 'pipes') {
          violation(`it sent ${frame.type} for a terminal launch.`);
          return;
        }
        outputs[frame.type].push(frame.bytes);
        return;
      }
      case 'output': {
        if (stdio !== 'terminal') {
          violation('it sent terminal output for a pipe launch.');
          return;
        }
        outputs.output.push(frame.bytes);
        return;
      }
      case 'exit': {
        finish({ kind: 'exit', exit: frame.exit });
        return;
      }
      case 'cleanup-failed': {
        finish({
          kind: 'cleanup-failed',
          message: `The sandbox could not confirm that the shell stopped and its folder permissions were restored: ${frame.message}`,
        });
        return;
      }
      default: {
        violation(`it sent ${frame.type} after start.`);
      }
    }
  };
  const ended = (): boolean => state.phase === 'ended';
  child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
    if (ended()) {
      return;
    }
    try {
      for (const raw of decoder.push(chunk)) {
        handle(decodeWindowsHelperFrame(raw));
        if (ended()) {
          return;
        }
      }
    } catch (error) {
      violation(error instanceof WindowsSandboxProtocolError ? error.message : String(error));
    }
  });
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    diagnostics = (diagnostics + chunk).slice(-diagnosticCharacters);
    if (onDiagnostic !== undefined) {
      const lines = (partialLine + chunk).split(/\r?\n/u);
      partialLine = lines.pop() ?? '';
      for (const line of lines) {
        onDiagnostic(line);
      }
    }
  });
  child.stderr.on('end', () => {
    if (onDiagnostic !== undefined && partialLine !== '') {
      onDiagnostic(partialLine);
      partialLine = '';
    }
  });
  child.stdin.on('error', () => {
    /* The helper closed its input; its exit or death settles the launch. */
    inputOpen = false;
  });
  const onGone = (message: string): void => {
    if (!state.closed) {
      state.closed = true;
      finish({ kind: 'closed', message });
      closed.resolve();
    }
  };
  child.once('error', (error) => {
    onGone(`The sandbox helper could not run: ${error.message}`);
  });
  child.once('close', (code, signal) => {
    onGone(
      `The sandbox helper stopped before it reported the shell's exit (${windowsHelperEnd(code ?? undefined, signal ?? undefined)}).`,
    );
  });
  return {
    answer: answer.promise,
    ending: ending.promise,
    closed: closed.promise,
    outputs,
    send,
    closeInput,
    isClosed: () => state.closed,
    start: () => {
      state.phase = 'starting';
      send({ type: 'start' });
    },
    launched: launched.promise,
    diagnostics: () => diagnostics,
  };
};

type Channel = ReturnType<typeof openChannel>;

/**
 * Wait for the helper process to stop, killing it after `milliseconds`.
 *
 * @param child - The helper.
 * @param channel - Its channel.
 * @param milliseconds - The bound.
 * @returns Once the process is gone.
 */
const stopHelper = async (
  child: ChildProcessWithoutNullStreams,
  channel: Channel,
  milliseconds: number,
): Promise<void> => {
  channel.closeInput();
  if (channel.isClosed()) {
    return;
  }
  const timer = setTimeout(() => {
    child.kill();
  }, milliseconds);
  try {
    await channel.closed;
  } finally {
    clearTimeout(timer);
  }
};

const awaitAnswer = async (
  channel: Channel,
  signal: AbortSignal,
  milliseconds: number,
): Promise<Answer | 'aborted'> => {
  const cancelled = Promise.withResolvers<'aborted'>();
  const onAbort = (): void => {
    cancelled.resolve('aborted');
  };
  signal.addEventListener('abort', onAbort, { once: true });
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<Answer>((resolve) => {
    timer = setTimeout(() => {
      resolve({
        kind: 'failed',
        message: 'the sandbox helper did not get ready in time.',
      });
    }, milliseconds);
  });
  try {
    return await Promise.race([channel.answer, cancelled.promise, late]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
};

/**
 * Wait for the helper's answer to `start`, the caller's abort or the startup deadline, whichever comes first.
 */
const awaitLaunched = async (
  channel: Channel,
  signal: AbortSignal,
  milliseconds: number,
): Promise<Launched | 'aborted'> => {
  const cancelled = Promise.withResolvers<'aborted'>();
  const onAbort = (): void => {
    cancelled.resolve('aborted');
  };
  signal.addEventListener('abort', onAbort, { once: true });
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<Launched>((resolve) => {
    timer = setTimeout(() => {
      resolve({ kind: 'failed', message: 'the sandbox helper did not start the shell in time.' });
    }, milliseconds);
  });
  try {
    return await Promise.race([channel.launched, cancelled.promise, late]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
};

/**
 * Read the helper's install record through its `status` subcommand, which never elevates.
 *
 * @public
 * @param helperPath - The helper.
 * @param options - The spawn to use; injectable for tests.
 * @returns Whether the one-time elevated setup has run. A helper that cannot answer reads as not installed.
 */
export const readWindowsSandboxStatus = async (
  helperPath: string,
  options: Readonly<{
    spawnHelper?: WindowsSandboxHelperSpawn | undefined;
    environment?: Readonly<Record<string, string | undefined>> | undefined;
  }> = {},
): Promise<WindowsSandboxStatus> => {
  const run = options.spawnHelper ?? defaultSpawn(helperPath, options.environment ?? process.env);
  return new Promise((resolve) => {
    const notInstalled = (reason: string | undefined, stderr = ''): void => {
      const parts = [reason, stderr.trim() === '' ? undefined : `stderr: ${stderr.trim()}`].filter(
        (part) => part !== undefined,
      );
      resolve(parts.length === 0 ? { installed: false } : { installed: false, diagnostic: parts.join('; ') });
    };
    let child: ChildProcessWithoutNullStreams;
    try {
      /* The quick answer reads the install record and the account's profile only: it must not wait on the network
         fence, which can be slow while the app starts and which every launch checks for itself. */
      child = run(['status', '--quick']);
    } catch (error) {
      notInstalled(`the helper could not be started: ${String(error)}`);
      return;
    }
    let output = '';
    let errors = '';
    let timedOut = false;
    child.stdin.end();
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      output = (output + chunk).slice(0, 64 * 1024);
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      errors = (errors + chunk).slice(-diagnosticCharacters);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 10_000);
    child.once('error', (error) => {
      clearTimeout(timer);
      notInstalled(`the helper could not be started: ${error.message}`, errors);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      const ended = timedOut
        ? 'the helper did not answer within 10 s'
        : windowsHelperEnd(code ?? undefined, signal ?? undefined);
      let record: unknown;
      try {
        record = JSON.parse(output);
      } catch {
        notInstalled(`${ended}; its output is not JSON: ${JSON.stringify(output.slice(0, 200))}`, errors);
        return;
      }
      const object = typeof record === 'object' && record !== null ? record : {};
      /* The install record names the sandbox account; an absent one prints `{"installed":false}`. */
      const absent = 'installed' in object && object.installed === false;
      if (code === 0 && !absent && 'accountSid' in object && typeof object.accountSid === 'string') {
        resolve({ installed: true });
      } else if (code === 0 && absent) {
        notInstalled(undefined, errors);
      } else {
        notInstalled(`${ended}; it answered ${JSON.stringify(output.slice(0, 200))}`, errors);
      }
    });
  });
};

/**
 * Run the helper's `restore --journal <path>` and require it to succeed.
 *
 * @param spawnHelper - The helper spawn.
 * @param journal - The journal path.
 * @param milliseconds - How long the restore may take.
 * @returns Once restored.
 */
const restoreJournal = async (
  spawnHelper: WindowsSandboxHelperSpawn,
  journal: string,
  milliseconds: number,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawnHelper(['restore', '--journal', journal]);
    let diagnostics = '';
    child.stdin.end();
    child.stdout.resume();
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      diagnostics = (diagnostics + chunk).slice(-diagnosticCharacters);
    });
    const timer = setTimeout(() => {
      child.kill();
    }, milliseconds);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`The sandbox helper could not restore folder permissions: ${error.message}`));
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `The sandbox helper could not restore folder permissions (exit ${String(code)}): ${diagnostics.trim()}`,
          ),
        );
      }
    });
  });

/** The default custody namespace: per user, under the system temporary directory. */
const defaultCustody = (): Readonly<{
  directory: string;
  sessionDirectory: string;
}> => ({
  directory: join(tmpdir(), 'tau-shell-custody-windows'),
  sessionDirectory: tmpdir(),
});

/**
 * Create the win32 shell provider over the Windows sandbox helper.
 *
 * Every launch is prepared first (I7): its receipt names the helper's journal before the helper starts and the
 * helper's launcher and runner before the shell starts. Launches run concurrently, beside live ones and beside an
 * earlier launch's unrestored journal alike.
 *
 * @public
 * @param options - The helper, the custody namespace and the host environment.
 * @returns A provider; each launch is fully contained or refused.
 */
export const createWindowsShellProvider = (options: WindowsShellProviderOptions): ShellProvider => {
  const environment = options.environment ?? process.env;
  const spawnHelper = options.spawnHelper ?? defaultSpawn(options.helperPath, environment);
  const startupMilliseconds = options.startupMilliseconds ?? 30_000;
  const terminationMilliseconds = options.terminationMilliseconds ?? 10_000;
  const custody = createWindowsShellCustody({
    ...(options.custody ?? defaultCustody()),
    restore: async (journal) => restoreJournal(spawnHelper, journal, startupMilliseconds),
    processAlive: options.processAlive,
  });
  const baselineDenied = shellBaselineDenied({
    platform: 'win32',
    home: options.home ?? homedir(),
    environment,
  });

  /**
   * Wrap one started launch: termination on abort, `terminate` or disposal; settlement on the helper's ending.
   */
  const started = (launch: ShellLaunch, child: ChildProcessWithoutNullStreams, channel: Channel): ShellProcess => {
    /* A helper that does not report `exit` in time after `terminate` is killed; its death then rejects `exited`. */
    const stopping: { requested: boolean; timer?: NodeJS.Timeout } = { requested: false };
    const requestStop = (): void => {
      if (!stopping.requested) {
        stopping.requested = true;
        channel.send({ type: 'terminate' });
        channel.closeInput();
        stopping.timer = setTimeout(() => {
          child.kill();
        }, terminationMilliseconds);
      }
    };
    const onAbort = (): void => {
      requestStop();
    };
    const exited = (async (): Promise<ShellExit> => {
      const end = await channel.ending;
      clearTimeout(stopping.timer);
      launch.signal.removeEventListener('abort', onAbort);
      await stopHelper(child, channel, terminationMilliseconds);
      try {
        await custody.end(launch.executionId, end.kind === 'exit');
      } catch {
        /* The receipt keeps its journal; recovery restores it. */
      }
      if (end.kind === 'exit') {
        return end.exit;
      }
      const diagnostic = channel.diagnostics().trim();
      throw new Error(diagnostic === '' ? end.message : `${end.message} ${diagnostic}`);
    })();
    const terminate = async (): Promise<ShellExit> => {
      requestStop();
      return exited;
    };
    launch.signal.addEventListener('abort', onAbort, { once: true });
    if (launch.signal.aborted) {
      onAbort();
    }
    const base = {
      exited,
      terminate,
      [Symbol.asyncDispose]: async () => {
        await terminate();
      },
    };
    if (launch.stdio.kind === 'pipes') {
      return {
        ...base,
        kind: 'pipes',
        stdout: channel.outputs.stdout.iterable,
        stderr: channel.outputs.stderr.iterable,
      };
    }
    return {
      ...base,
      kind: 'terminal',
      output: channel.outputs.output.iterable,
      write: (bytes) => {
        channel.send({ type: 'input', bytes });
      },
      resize: (size) => {
        if (validSize(size)) {
          channel.send({ type: 'resize', size });
        }
      },
    };
  };

  const stage = async (launch: ShellLaunch): Promise<ShellLaunchOutcome> => {
    let journal: string;
    try {
      journal = await custody.begin(launch.executionId);
    } catch {
      return {
        status: 'sandbox-unavailable',
        message: 'This launch was not prepared, so nothing started.',
      };
    }
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnHelper(['launch']);
    } catch (error) {
      await custody.end(launch.executionId, false);
      return {
        status: 'sandbox-unavailable',
        message: `the Windows sandbox helper could not start: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    const channel = openChannel(child, launch.stdio.kind, options.onHelperDiagnostic);
    const notStarted = async (): Promise<void> => {
      channel.send({ type: 'terminate' });
      await stopHelper(child, channel, terminationMilliseconds);
      await custody.end(launch.executionId, false);
    };
    channel.send({
      type: 'spec',
      spec: windowsLaunchSpec(launch, { journal, baselineDenied }),
    });
    const answer = await awaitAnswer(channel, launch.signal, startupMilliseconds);
    if (answer === 'aborted') {
      await notStarted();
      cancelled(launch.signal);
    }
    if (answer.kind === 'failed') {
      await notStarted();
      const diagnostic = channel.diagnostics().trim();
      return {
        status: 'sandbox-unavailable',
        message: answer.message,
        ...(diagnostic === '' ? {} : { diagnostic }),
      };
    }
    if (answer.kind === 'refused') {
      await notStarted();
      const { refusal } = answer;
      if (refusal.status === 'unsupported' && isShellRequirement(refusal.requirement)) {
        return unsupported(refusal.requirement, refusal.message);
      }
      return {
        status: 'sandbox-unavailable',
        message: refusal.message,
        ...(refusal.diagnostic === undefined ? {} : { diagnostic: refusal.diagnostic }),
      };
    }
    if (answer.ready.journal !== journal) {
      await notStarted();
      return {
        status: 'sandbox-unavailable',
        message: 'the sandbox helper journaled this launch somewhere Tau did not name, so nothing ran.',
      };
    }
    try {
      await custody.arm(launch.executionId, {
        launcherPid: answer.ready.launcherPid,
        runnerPid: answer.ready.runnerPid,
      });
    } catch (error) {
      await notStarted();
      return {
        status: 'sandbox-unavailable',
        message: `Tau could not take custody of this launch, so it did not run: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    if (launch.signal.aborted) {
      await notStarted();
      cancelled(launch.signal);
    }
    channel.start();
    /* `started` is reported only for a shell the helper admitted and resumed; until then it may still refuse. */
    const launched = await awaitLaunched(channel, launch.signal, startupMilliseconds);
    if (launched === 'aborted') {
      await notStarted();
      cancelled(launch.signal);
    }
    if (launched.kind === 'started') {
      return { status: 'started', process: started(launch, child, channel) };
    }
    await notStarted();
    const diagnostic = channel.diagnostics().trim();
    if (launched.kind === 'refused') {
      const { refusal } = launched;
      if (refusal.status === 'unsupported' && isShellRequirement(refusal.requirement)) {
        return unsupported(refusal.requirement, refusal.message);
      }
      return {
        status: 'sandbox-unavailable',
        message: refusal.message,
        ...(refusal.diagnostic === undefined ? {} : { diagnostic: refusal.diagnostic }),
      };
    }
    return {
      status: 'sandbox-unavailable',
      message: launched.message,
      ...(diagnostic === '' ? {} : { diagnostic }),
    };
  };

  return {
    name: `tau-windows-restricted-token-${String(windowsSandboxProtocolVersion)}`,
    prepare: async (input) => custody.prepare(input),
    inventory: async () => custody.inventory(),
    recover: async (input) => custody.recover(input),
    release: async (input) => custody.release(input),
    launch: async (launch) => {
      launch.signal.throwIfAborted();
      const refusal = admit(launch, environment);
      if (refusal !== undefined) {
        return refusal;
      }
      return stage(launch);
    },
  };
};
