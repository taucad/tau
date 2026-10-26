import type {
  ShellExit,
  ShellLaunch,
  ShellLaunchOutcome,
  ShellProcess,
  ShellProvider,
  ShellTerminalSize,
} from '#shell/shell-provider.js';

/**
 * What one fake launch does: an outcome other than `started`, or the bytes it writes and how it ends. A launch with
 * no `exit` runs until it is aborted or terminated, then ends with `SIGKILL`.
 *
 * @public
 */
export type FakeShellScript =
  | Exclude<ShellLaunchOutcome, { status: 'started' }>
  | Readonly<{
      status: 'started';
      stdout?: string;
      stderr?: string;
      exit?: ShellExit;
      /** Cleanup that cannot be confirmed: `exited` rejects once the launch ends, as a real provider's does (I7). */
      cleanup?: 'uncertain';
    }>;

/**
 * The deterministic fake provider and what it observed.
 *
 * @public
 */
export type FakeShellProvider = ShellProvider &
  Readonly<{
    /** Every launch the fake received, in order. */
    launches: readonly ShellLaunch[];
    /** Bytes written to each terminal launch, in launch order. */
    written: ReadonlyArray<ReadonlyArray<Uint8Array<ArrayBuffer>>>;
    /** Sizes each terminal launch was resized to, in launch order. */
    resized: ReadonlyArray<readonly ShellTerminalSize[]>;
  }>;

const encoder = new TextEncoder();

const once = (text: string | undefined): AsyncIterable<Uint8Array<ArrayBuffer>> => ({
  async *[Symbol.asyncIterator]() {
    if (text !== undefined && text !== '') {
      yield encoder.encode(text);
    }
  },
});

/**
 * Create a deterministic provider for orchestration tests (testing contract, layering rule 2). It enforces nothing
 * and runs nothing: it proves what a host asked for and how the host handles each outcome, never containment.
 *
 * @public
 * @param script - What each launch does, given the launch.
 * @returns The fake provider.
 */
export const createFakeShellProvider = (script: (launch: ShellLaunch) => FakeShellScript): FakeShellProvider => {
  const launches: ShellLaunch[] = [];
  const written: Array<Array<Uint8Array<ArrayBuffer>>> = [];
  const resized: ShellTerminalSize[][] = [];
  const launch = async (request: ShellLaunch): Promise<ShellLaunchOutcome> => {
    request.signal.throwIfAborted();
    launches.push(request);
    const outcome = script(request);
    if (outcome.status !== 'started') {
      return outcome;
    }
    let finish: (exit: ShellExit) => void = () => undefined;
    const ended = new Promise<ShellExit>((resolve) => {
      finish = resolve;
    });
    const exited =
      outcome.cleanup === 'uncertain'
        ? (async (): Promise<ShellExit> => {
            await ended;
            throw new Error('Owned processes survived termination: fake.');
          })()
        : ended;
    const terminate = async (): Promise<ShellExit> => {
      finish({ signal: 'SIGKILL' });
      return exited;
    };
    request.signal.addEventListener(
      'abort',
      () => {
        finish({ signal: 'SIGKILL' });
      },
      { once: true },
    );
    if (outcome.exit !== undefined) {
      finish(outcome.exit);
    }
    const base = {
      exited,
      terminate,
      [Symbol.asyncDispose]: async () => {
        await terminate();
      },
    };
    let process: ShellProcess;
    if (request.stdio.kind === 'pipes') {
      process = { kind: 'pipes', stdout: once(outcome.stdout), stderr: once(outcome.stderr), ...base };
    } else {
      const input: Array<Uint8Array<ArrayBuffer>> = [];
      const sizes: ShellTerminalSize[] = [];
      written.push(input);
      resized.push(sizes);
      process = {
        kind: 'terminal',
        output: once(outcome.stdout),
        write: (bytes) => {
          input.push(bytes);
        },
        resize: (size) => {
          sizes.push(size);
        },
        ...base,
      };
    }
    return { status: 'started', process };
  };
  return { name: 'fake', launch, launches, written, resized };
};
