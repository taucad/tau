import { once } from 'node:events';
import { spawn } from 'node:child_process';
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
    env?: Readonly<Record<string, string>>;
    input?: ReadonlyArray<Uint8Array<ArrayBuffer>>;
  }>;

type RunGitCommandOptions = CommandBounds &
  Readonly<{
    gitExecutable: string;
    cwd: string;
    args: readonly string[];
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
  const child = spawn(options.executable, options.args, { cwd: options.cwd, env: environment, stdio: 'pipe' });

  const stdout: Array<Uint8Array<ArrayBuffer>> = [];
  const stderr: Array<Uint8Array<ArrayBuffer>> = [];
  let stdoutLength = 0;
  let stderrLength = 0;
  let aborted: CommandAbortReason | undefined;

  /**
   * A stopped command settles when the *process* is killed, not when its pipes
   * close.
   *
   * `close` fires only once every stdio stream has closed, and a killed shell
   * leaves whatever it spawned holding the pipes it inherited — so waiting for
   * it turns a 250 ms deadline into however long the grandchild runs, which is
   * exactly the unbounded wait this function exists to remove.
   *
   * ponytail: the grandchild is orphaned, not killed. Reaping the group needs
   * `detached: true` and `process.kill(-pid)`, which changes signal delivery
   * for every engine call; do that when a leaked engine child is observed.
   */
  const stopped = Promise.withResolvers<never>();
  const stop = (reason: CommandAbortReason): void => {
    aborted ??= reason;
    child.kill('SIGKILL');
    stopped.reject(new CommandAbortedError(reason, `The command was stopped by its ${reason}.`));
  };
  const collect = (chunks: Array<Uint8Array<ArrayBuffer>>, chunk: Uint8Array<ArrayBuffer>, length: number): number => {
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

/**
 * Run one argument-array Git command without invoking a shell.
 *
 * @param options - Executable, repository, arguments, streamed input and bounds.
 * @returns Captured process bytes and exit status.
 * @public
 */
export const runGitCommand = async (options: RunGitCommandOptions): Promise<GitCommandResult> =>
  runCommand({
    executable: options.gitExecutable,
    cwd: options.cwd,
    args: ['-C', options.cwd, ...options.args],
    ...(options.input === undefined ? {} : { input: options.input }),
    ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
    ...(options.maxBuffer === undefined ? {} : { maxBuffer: options.maxBuffer }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
