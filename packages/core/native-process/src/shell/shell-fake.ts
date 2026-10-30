import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';

import type {
  PreparedShell,
  ShellExecution,
  ShellExit,
  ShellLaunch,
  ShellLaunchOutcome,
  ShellProcess,
  ShellProvider,
  ShellRecovery,
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
 * Where one fake execution is in its custody lifecycle (I7): prepared, launched and not yet ended, ended with confirmed
 * cleanup, ended with uncertain cleanup (never recoverable here), or claimed stopped.
 *
 * @public
 */
export type FakeShellPhase = 'prepared' | 'running' | 'exited' | 'uncertain' | 'stopped';

/** @public */
export type FakeShellOptions = Readonly<{
  /** Executions already in custody when the fake is created, as a restarted host finds them. */
  prior?: ReadonlyArray<ShellExecution & Readonly<{ phase: FakeShellPhase }>>;
  /** Refuse every preparation, as a provider whose custody record cannot be written does. */
  refusePrepare?: boolean;
}>;

/**
 * The deterministic fake provider and what it observed.
 *
 * @public
 */
export type FakeShellProvider = ShellProvider &
  Readonly<{
    /** Each execution still in custody, by id. */
    executions: ReadonlyMap<string, ShellExecution & Readonly<{ phase: FakeShellPhase }>>;
    /** Released execution ids, in order. */
    released: readonly string[];
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
export const createFakeShellProvider = (
  script: (launch: ShellLaunch) => FakeShellScript,
  options: FakeShellOptions = {},
): FakeShellProvider => {
  const launches: ShellLaunch[] = [];
  const written: Array<Array<Uint8Array<ArrayBuffer>>> = [];
  const resized: ShellTerminalSize[][] = [];
  const executions = new Map<string, ShellExecution & { phase: FakeShellPhase }>(
    (options.prior ?? []).map((row) => [row.executionId, { ...row }]),
  );
  const released: string[] = [];
  const prepare: ShellProvider['prepare'] = async ({ privateRoot, resource }) => {
    if (options.refusePrepare === true) {
      throw new Error('The fake refuses to prepare.');
    }
    const executionId = randomUUID();
    executions.set(executionId, { executionId, privateRoot, resource, phase: 'prepared' });
    return { executionId };
  };
  const recover: ShellProvider['recover'] = async ({ executionIds }) =>
    [...new Set(executionIds)].flatMap((executionId): ShellRecovery[] => {
      const execution = executions.get(executionId);
      if (execution === undefined) {
        return [];
      }
      const { phase, ...metadata } = execution;
      if (phase === 'running' || phase === 'uncertain') {
        return [{ ...metadata, status: 'blocked', message: `The fake execution is ${phase}.` }];
      }
      execution.phase = 'stopped';
      return [{ ...metadata, status: 'stopped' }];
    });
  const release = async ({ executionId }: PreparedShell): Promise<void> => {
    const execution = executions.get(executionId);
    if (execution?.phase !== 'stopped') {
      throw new Error('The fake execution has no stopped claim.');
    }
    if (existsSync(execution.privateRoot)) {
      throw new Error('The fake execution’s private root must be deleted before release.');
    }
    executions.delete(executionId);
    released.push(executionId);
  };
  const launch = async (request: ShellLaunch): Promise<ShellLaunchOutcome> => {
    request.signal.throwIfAborted();
    const execution = executions.get(request.executionId);
    if (execution?.phase !== 'prepared') {
      return { status: 'sandbox-unavailable', message: 'This launch was not prepared, so nothing started.' };
    }
    launches.push(request);
    const outcome = script(request);
    if (outcome.status !== 'started') {
      return outcome;
    }
    execution.phase = 'running';
    let finish: (exit: ShellExit) => void = () => undefined;
    const ended = new Promise<ShellExit>((resolve) => {
      finish = resolve;
    });
    const exited =
      outcome.cleanup === 'uncertain'
        ? (async (): Promise<ShellExit> => {
            await ended;
            execution.phase = 'uncertain';
            throw new Error('Owned processes survived termination: fake.');
          })()
        : (async (): Promise<ShellExit> => {
            const exit = await ended;
            execution.phase = 'exited';
            return exit;
          })();
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
  return {
    name: 'fake',
    prepare,
    launch,
    inventory: async () => [...executions.values()].map(({ phase: _phase, ...metadata }) => metadata),
    recover,
    release,
    executions,
    released,
    launches,
    written,
    resized,
  };
};
