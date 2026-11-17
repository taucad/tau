import { AsyncLocalStorage } from 'node:async_hooks';
import { once } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

/** Captured child-process result. @public */
export type GitCommandResult = Readonly<{
  exitCode: number;
  stdout: Uint8Array<ArrayBuffer>;
  stderr: Uint8Array<ArrayBuffer>;
}>;

/** Why a bounded command stopped before its process exited normally. @public */
export type CommandAbortReason = 'deadline' | 'signal' | 'output-limit';

/** A bounded command that was stopped rather than allowed to run or grow without limit. @public */
export class CommandAbortedError extends Error {
  public readonly reason: CommandAbortReason;

  /**
   * Record why a command was stopped.
   *
   * @param reason - Deadline, caller abort, or captured-output limit.
   * @param message - Safe diagnostic without command arguments.
   */
  public constructor(reason: CommandAbortReason, message: string) {
    super(message);
    this.name = 'CommandAbortedError';
    this.reason = reason;
  }
}

/** Bounds every spawned engine command carries. @public */
export type CommandBounds = Readonly<{
  /** Milliseconds. Wall-clock budget; the process is killed when it elapses. */
  deadline?: number;
  /** Maximum captured bytes per stream. The process is killed when either exceeds it. */
  maxBuffer?: number;
  /** Caller cancellation. */
  signal?: AbortSignal;
}>;

type RunCommandOptions = CommandBounds &
  Readonly<{
    executable: string;
    cwd: string;
    args: readonly string[];
    /** Overrides over the inherited environment; an `undefined` value unsets that variable. */
    env?: Readonly<Record<string, string | undefined>>;
    input?: ReadonlyArray<Uint8Array<ArrayBuffer>>;
  }>;

type RunGitCommandOptions = CommandBounds &
  Readonly<{
    gitExecutable: string;
    cwd: string;
    args: readonly string[];
    /** Overrides over the inherited environment; an `undefined` value unsets that variable. */
    env?: Readonly<Record<string, string | undefined>>;
    input?: ReadonlyArray<Uint8Array<ArrayBuffer>>;
  }>;

/** Milliseconds. Long enough for a large snapshot, short enough that a wedged engine is not forever. */
const defaultDeadline = 30_000;
/** 256 MiB of captured output is far past any legitimate plumbing response. */
const defaultMaxBuffer = 256 * 1024 * 1024;

const writeInput = async (
  child: ChildProcessWithoutNullStreams,
  chunks: ReadonlyArray<Uint8Array<ArrayBuffer>>,
): Promise<void> => {
  child.stdin.on('error', () => {
    // The exit result owns the stable process failure; EPIPE is expected when the engine rejects streamed input.
  });
  for (const chunk of chunks) {
    if (!child.stdin.write(chunk)) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- process stdin backpressure must preserve protocol byte ordering.
      await once(child.stdin, 'drain');
    }
  }
  child.stdin.end();
};

/**
 * Run one argument-array command without invoking a shell, under an explicit
 * deadline, captured-output limit and caller abort signal.
 *
 * An engine that hangs, floods its output or is no longer wanted is killed
 * rather than awaited, so no caller inherits an unbounded wait.
 *
 * @param options - Executable, working directory, arguments, environment, streamed input and bounds.
 * @returns Captured process bytes and exit status.
 * @throws CommandAbortedError When the deadline, the output limit or the signal stops the process first.
 * @public
 */
export const runCommand = async (options: RunCommandOptions): Promise<GitCommandResult> => {
  const deadline = options.deadline ?? defaultDeadline;
  const maxBuffer = options.maxBuffer ?? defaultMaxBuffer;
  if (options.signal?.aborted === true) {
    throw new CommandAbortedError('signal', 'The command was aborted before it started.');
  }
  const environment: Record<string, string | undefined> = { ...process.env, ...options.env };
  environment['GIT_TERMINAL_PROMPT'] = '0';
  environment['LC_ALL'] = 'C';
  const child = spawn(options.executable, options.args, {
    cwd: options.cwd,
    env: environment,
    stdio: 'pipe',
    detached: process.platform !== 'win32',
  });

  const stdout: Array<Uint8Array<ArrayBuffer>> = [];
  const stderr: Array<Uint8Array<ArrayBuffer>> = [];
  let stdoutLength = 0;
  let stderrLength = 0;
  let aborted: CommandAbortReason | undefined;

  // Kill the entire engine operation: git delegates transfers to git-lfs and its workers.
  // Do not await pipe closure: an exited parent may leave descendants holding those pipes.
  const stopped = Promise.withResolvers<never>();
  const stop = (reason: CommandAbortReason): void => {
    if (aborted !== undefined) {
      return;
    }
    aborted = reason;
    const { pid } = child;
    let cleanupFailed = false;
    if (pid !== undefined) {
      if (process.platform === 'win32') {
        // Do not target a Windows pid after exit, when it may have been reused.
        if (child.exitCode === null && child.signalCode === null) {
          // Leave time for durable queue persistence inside the separate two-second close margin.
          const killed = spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', timeout: 1000 });
          cleanupFailed = killed.status !== 0;
          // Retain direct-child termination even if taskkill is unavailable or times out.
          child.kill('SIGKILL');
        } else {
          // An exited parent cannot safely identify its remaining Windows descendants.
          cleanupFailed = true;
        }
      } else {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {
          // The group may already have exited. Killing the direct child remains a safe fallback.
          child.kill('SIGKILL');
        }
      }
    }
    stopped.reject(
      new CommandAbortedError(
        reason,
        `The command was stopped by its ${reason}.${cleanupFailed ? ' Process-tree cleanup failed.' : ''}`,
      ),
    );
  };
  const collect = (chunks: Array<Uint8Array<ArrayBuffer>>, chunk: Uint8Array<ArrayBuffer>, length: number): number => {
    if (aborted !== undefined) {
      return length;
    }
    const next = length + chunk.byteLength;
    if (next > maxBuffer) {
      stop('output-limit');
      return next;
    }
    chunks.push(new Uint8Array(chunk));
    return next;
  };
  child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
    stdoutLength = collect(stdout, chunk, stdoutLength);
  });
  child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
    stderrLength = collect(stderr, chunk, stderrLength);
  });

  const timer = setTimeout(() => {
    stop('deadline');
  }, deadline);
  const onAbort = (): void => {
    stop('signal');
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const exit = new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => {
        resolve(code ?? 1);
      });
    });
    const input = writeInput(child, options.input ?? []);
    const [exitCode] = await Promise.race([Promise.all([exit, input]), stopped.promise]);
    if (aborted !== undefined) {
      throw new CommandAbortedError(aborted, `The command was stopped by its ${aborted}.`);
    }
    return {
      exitCode,
      stdout: new Uint8Array(Buffer.concat(stdout)),
      stderr: new Uint8Array(Buffer.concat(stderr)),
    };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
};

type ActivityTotals = { count: number; totalMilliseconds: number; longestMilliseconds: number };

/** A span of work a Git process can be counted in: a store's open, or a turn's admission. @public */
export type GitCommandPhase = 'open' | 'admission';

/**
 * One diagnostic fact about this realm's Git processes (W8 diagnostics). Ids and milliseconds only, never a path or
 * an argument:
 *
 * - `command`: one process that ran for {@link slowGitCommandMilliseconds} or longer, named by its subcommand (with
 *   `lfs`'s own, `lfs install`), how it ended (`exited` with its code, the bound that stopped it, or `unstarted`), and
 *   the phase it ran in, `other` outside one.
 * - `phase`: one {@link gitCommandActivity}`.during` span when it ends, with the Git processes it ran.
 *
 * @public
 */
export type GitActivityEvent =
  | Readonly<{
      type: 'command';
      command: string;
      milliseconds: number;
      outcome: 'exited' | CommandAbortReason | 'unstarted';
      exitCode?: number;
      phase: GitCommandPhase | 'other';
    }>
  | Readonly<{
      type: 'phase';
      phase: GitCommandPhase;
      status: 'completed' | 'failed';
      milliseconds: number;
      git: Readonly<ActivityTotals>;
    }>;

/** Milliseconds. A Git process this long is reported one by one: a healthy store answers in tens. @public */
export const slowGitCommandMilliseconds = 1000;

const gitActivityWindows = new Set<ActivityTotals>();
const gitActivityListeners = new Set<(event: GitActivityEvent) => void>();
const gitPhase = new AsyncLocalStorage<Readonly<{ phase: GitCommandPhase; totals: ActivityTotals }>>();

const emptyTotals = (): ActivityTotals => ({ count: 0, totalMilliseconds: 0, longestMilliseconds: 0 });

const emitGitActivity = (event: GitActivityEvent): void => {
  for (const listener of gitActivityListeners) {
    try {
      listener(event);
    } catch {
      /* A diagnostic sink that fails never changes a command's result. */
    }
  }
};

/*
 * Git's global options that may take their value as the next argument (git.c `handle_options`); every other leading
 * `-` argument stands alone or carries its value after `=`.
 */
const valuedGitOptions = new Set([
  '-c',
  '-C',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--config-env',
  '--attr-source',
  '--super-prefix',
]);

/* The shape of a Git subcommand or option name: a diagnostic never carries a word outside it, such as a path. */
const gitWord = /^-{0,2}[a-z][a-z0-9-]*$/u;

/*
 * A command's subcommand, and `lfs`'s own after it: the only words of its arguments a diagnostic may carry. With no
 * subcommand (`--version`), the option that stood in for one, without any `=` value. A word not shaped like a Git
 * name, such as an unlisted option's separate value, is never reported: the label falls back to the option, then
 * `git`.
 */
const gitCommandName = (args: readonly string[]): string => {
  let index = 0;
  let option: string | undefined;
  for (let word = args[0]; word?.startsWith('-') === true; word = args[index]) {
    option ??= valuedGitOptions.has(word) ? undefined : word.split('=', 1)[0];
    index += valuedGitOptions.has(word) ? 2 : 1;
  }
  const name = args[index];
  const named = (word: string | undefined): string | undefined =>
    word !== undefined && gitWord.test(word) ? word : undefined;
  if (name === 'lfs') {
    return `lfs ${named(args[index + 1]) ?? ''}`.trimEnd();
  }
  return named(name) ?? named(option) ?? 'git';
};

/**
 * Time one Git process for {@link gitCommandActivity}: its windows, the phase it runs in, and a `command` event when
 * it ran {@link slowGitCommandMilliseconds} or longer.
 *
 * @internal
 * @param args - The arguments Git is given, global options included.
 * @param run - Spawns the process and answers its result.
 * @returns What `run` answers.
 */
export const meteredGitCommand = async (
  args: readonly string[],
  run: () => Promise<GitCommandResult>,
): Promise<GitCommandResult> => {
  const start = performance.now();
  let outcome: Extract<GitActivityEvent, { type: 'command' }>['outcome'] = 'unstarted';
  let exitCode: number | undefined;
  try {
    const result = await run();
    outcome = 'exited';
    ({ exitCode } = result);
    return result;
  } catch (error) {
    if (error instanceof CommandAbortedError) {
      outcome = error.reason;
    }
    throw error;
  } finally {
    const milliseconds = performance.now() - start;
    const scope = gitPhase.getStore();
    for (const totals of scope === undefined ? gitActivityWindows : [...gitActivityWindows, scope.totals]) {
      totals.count += 1;
      totals.totalMilliseconds += milliseconds;
      totals.longestMilliseconds = Math.max(totals.longestMilliseconds, milliseconds);
    }
    if (milliseconds >= slowGitCommandMilliseconds && gitActivityListeners.size > 0) {
      emitGitActivity({
        type: 'command',
        command: gitCommandName(args),
        milliseconds,
        outcome,
        ...(exitCode === undefined ? {} : { exitCode }),
        phase: scope?.phase ?? 'other',
      });
    }
  }
};

/**
 * Every Git process this realm runs through {@link runGitCommand} (and the toolchain's version probes), timed from
 * spawn to exit.
 *
 * - `open()` starts a window: closing it answers how many processes finished while it was open, their total time and
 *   the longest (a turn's admission, for one). With no window open a process costs one empty loop.
 * - `during(phase, run)` names the span `run` is: the processes it starts, and only those, are counted in it, a slow
 *   one is reported with it, and a `phase` event reports it when it ends.
 * - `observe(listener)` hears each {@link GitActivityEvent} until the returned function is called.
 *
 * @public
 */
export const gitCommandActivity = Object.freeze({
  open: (): Readonly<{ close: () => Readonly<ActivityTotals> }> => {
    const totals = emptyTotals();
    gitActivityWindows.add(totals);
    return {
      close: () => {
        gitActivityWindows.delete(totals);
        return { ...totals };
      },
    };
  },
  during: async <Result>(phase: GitCommandPhase, run: () => Promise<Result>): Promise<Result> => {
    const totals = emptyTotals();
    const start = performance.now();
    let status: 'completed' | 'failed' = 'failed';
    try {
      const result = await gitPhase.run({ phase, totals }, run);
      status = 'completed';
      return result;
    } finally {
      emitGitActivity({ type: 'phase', phase, status, milliseconds: performance.now() - start, git: { ...totals } });
    }
  },
  observe: (listener: (event: GitActivityEvent) => void): (() => void) => {
    gitActivityListeners.add(listener);
    return () => {
      gitActivityListeners.delete(listener);
    };
  },
});

/**
 * Run one argument-array Git command without invoking a shell.
 *
 * @param options - Executable, repository, arguments, streamed input and bounds.
 * @returns Captured process bytes and exit status.
 * @public
 */
export const runGitCommand = async (options: RunGitCommandOptions): Promise<GitCommandResult> =>
  meteredGitCommand(options.args, async () =>
    runCommand({
      executable: options.gitExecutable,
      cwd: options.cwd,
      args: ['-C', options.cwd, ...options.args],
      ...(options.env === undefined ? {} : { env: options.env }),
      ...(options.input === undefined ? {} : { input: options.input }),
      ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
      ...(options.maxBuffer === undefined ? {} : { maxBuffer: options.maxBuffer }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    }),
  );
