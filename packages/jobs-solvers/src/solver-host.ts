import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { cp, mkdir, mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import type { JobInputSnapshot } from '@taucad/jobs';

/** One decoded process output fragment. @public */
export type SolverProcessOutput = {
  readonly stream: 'stderr' | 'stdout';
  readonly text: string;
};

/** Explicit, shell-free process request accepted by a solver attempt host. @public */
export type SolverProcessSpec = {
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
  /** Grace period in milliseconds before a cancelled process is killed. */
  readonly terminationGrace: number;
  /** Maximum combined stdout/stderr bytes accepted from the child. */
  readonly outputLimit: number;
  readonly container?: {
    readonly engine: 'docker';
    readonly name: string;
  };
  readonly onOutput: (output: SolverProcessOutput) => Promise<void>;
};

/** Discriminated result of one hosted solver process. @public */
export type SolverProcessExecution =
  | { readonly status: 'cancelled'; readonly reason: string }
  | { readonly status: 'exited'; readonly exitCode: number; readonly signal?: NodeJS.Signals };

/** Host boundary used by solver providers to execute explicit argument vectors. @public */
export type SolverProcessExecutor = {
  /**
   * Execute one process without a command shell.
   *
   * @param spec - Executable, argument vector, rooted workspace, and cancellation policy.
   * @returns The process exit or cancellation outcome.
   */
  execute(spec: SolverProcessSpec): Promise<SolverProcessExecution>;
};

/** Host boundary that resolves and copies an immutable snapshot into an attempt workspace. @public */
export type SolverInputMaterializer = {
  /**
   * Copy one immutable input snapshot into a new empty directory.
   *
   * @param input - Snapshot reference, destination, and attempt cancellation signal.
   * @returns When the snapshot has been completely materialized.
   */
  materialize(input: {
    readonly snapshot: JobInputSnapshot;
    readonly destination: string;
    readonly signal: AbortSignal;
  }): Promise<void>;
};

const processHasExited = (child: ChildProcess): boolean => child.exitCode !== null || child.signalCode !== null;

const killProcessGroup = (child: ChildProcess, signal: NodeJS.Signals): void => {
  if (processHasExited(child)) {
    return;
  }
  if (process.platform !== 'win32' && child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // The child may have exited between the state check and the group signal.
    }
  }
  child.kill(signal);
};

const waitForExit = async (child: ChildProcess): Promise<void> =>
  new Promise((resolve) => {
    if (processHasExited(child)) {
      resolve();
      return;
    }
    child.once('exit', () => {
      resolve();
    });
    child.once('error', () => {
      resolve();
    });
  });

const runDockerControl = async (arguments_: readonly string[], controlTimeout: number): Promise<void> => {
  const child = spawn('docker', [...arguments_], { shell: false, stdio: 'ignore' });
  const exited = waitForExit(child);
  if (await Promise.race([exited.then(() => true), delay(controlTimeout, false, { ref: false })])) {
    return;
  }
  child.kill('SIGKILL');
  await exited;
};

const terminateProcess = async (child: ChildProcess, spec: SolverProcessSpec): Promise<void> => {
  if (processHasExited(child)) {
    return;
  }
  const exited = waitForExit(child);
  killProcessGroup(child, 'SIGTERM');
  if (spec.container) {
    const seconds = Math.max(1, Math.ceil(spec.terminationGrace / 1000));
    await runDockerControl(['stop', '--time', String(seconds), spec.container.name], spec.terminationGrace + 1000);
    if (processHasExited(child)) {
      return;
    }
    await runDockerControl(['kill', spec.container.name], 5000);
  } else if (await Promise.race([exited.then(() => true), delay(spec.terminationGrace, false, { ref: false })])) {
    return;
  }
  killProcessGroup(child, 'SIGKILL');
  await exited;
};

/**
 * Create the native solver process executor used by Tau daemon attempt hosts.
 *
 * Processes are spawned with `shell: false` in a new POSIX process group. Cancellation
 * sends a graceful signal/container stop before a bounded hard kill.
 *
 * @returns A shell-free process executor.
 * @public
 *
 * @example <caption>Execute a version probe</caption>
 * ```typescript
 * import { createNodeSolverProcessExecutor } from '@taucad/jobs-solvers';
 *
 * const executor = createNodeSolverProcessExecutor();
 * const controller = new AbortController();
 * await executor.execute({
 *   executable: 'ccx',
 *   arguments: ['-v'],
 *   cwd: process.cwd(),
 *   environment: {},
 *   signal: controller.signal,
 *   terminationGrace: 5_000,
 *   outputLimit: 1024 * 1024,
 *   async onOutput() {},
 * });
 * ```
 */
export const createNodeSolverProcessExecutor = (): SolverProcessExecutor => ({
  async execute(spec) {
    if (!Number.isSafeInteger(spec.outputLimit) || spec.outputLimit < 1) {
      throw new TypeError('Solver process outputLimit must be a positive safe integer.');
    }
    if (spec.signal.aborted) {
      return { status: 'cancelled', reason: String(spec.signal.reason ?? 'cancelled') };
    }
    const child = spawn(spec.executable, [...spec.arguments], {
      cwd: spec.cwd,
      detached: process.platform !== 'win32',
      env: { ...process.env, ...spec.environment },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let outputQueue = Promise.resolve();
    let outputBytes = 0;
    let outputFailure: Error | undefined;
    const decoder = new TextDecoder();
    const enqueue = (stream: SolverProcessOutput['stream'], bytes: Uint8Array<ArrayBuffer>): void => {
      outputBytes += bytes.byteLength;
      if (outputBytes > spec.outputLimit) {
        outputFailure ??= new Error(`Solver process output exceeded ${String(spec.outputLimit)} bytes.`);
        void terminateProcess(child, spec);
        return;
      }
      const previousOutput = outputQueue;
      outputQueue = (async () => {
        await previousOutput;
        await spec.onOutput({ stream, text: decoder.decode(bytes) });
      })();
    };
    child.stdout.on('data', (bytes: Uint8Array<ArrayBuffer>) => {
      enqueue('stdout', bytes);
    });
    child.stderr.on('data', (bytes: Uint8Array<ArrayBuffer>) => {
      enqueue('stderr', bytes);
    });
    const abort = (): void => {
      void terminateProcess(child, spec);
    };
    spec.signal.addEventListener('abort', abort, { once: true });
    try {
      const result = await new Promise<SolverProcessExecution>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (exitCode, signal) => {
          if (spec.signal.aborted) {
            resolve({ status: 'cancelled', reason: String(spec.signal.reason ?? 'cancelled') });
            return;
          }
          resolve({
            status: 'exited',
            exitCode: exitCode ?? 1,
            ...(signal === null ? {} : { signal }),
          });
        });
      });
      await outputQueue;
      if (outputFailure) {
        throw outputFailure;
      }
      return result;
    } finally {
      spec.signal.removeEventListener('abort', abort);
    }
  },
});

const assertRootedChild = (root: string, child: string): void => {
  const relativePath = relative(root, child);
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error('Solver attempt workspace escaped its configured root.');
  }
};

/**
 * @internal
 * @param reference - Container image reference to validate.
 * @param label - Human-readable configuration label.
 * @returns Nothing; invalid mutable references throw.
 */
export const assertImmutableContainerImageReference = (reference: string, label: string): void => {
  const marker = '@sha256:';
  const markerIndex = reference.lastIndexOf(marker);
  const digest = markerIndex === -1 ? '' : reference.slice(markerIndex + marker.length);
  const isHexDigest = digest.length === 64 && [...digest].every((character) => /^[\dA-Fa-f]$/.test(character));
  if (markerIndex < 1 || !isHexDigest) {
    throw new TypeError(`${label} must use an immutable image reference ending in @sha256:<64 hex characters>.`);
  }
};

/**
 * @internal
 * @param root - Trusted attempt workspace root.
 * @returns A fresh canonical child workspace.
 */
export const createSolverAttemptWorkspace = async (root: string): Promise<string> => {
  const resolvedRoot = resolve(root);
  await mkdir(resolvedRoot, { recursive: true });
  const canonicalRoot = await realpath(resolvedRoot);
  const workspace = await mkdtemp(join(canonicalRoot, 'tau-solver-'));
  assertRootedChild(canonicalRoot, workspace);
  return workspace;
};

/**
 * @internal
 * @param root - Trusted attempt workspace root.
 * @param workspace - Previously created attempt child.
 * @returns When the validated attempt child has been removed.
 */
export const removeSolverAttemptWorkspace = async (root: string, workspace: string): Promise<void> => {
  const canonicalRoot = await realpath(resolve(root));
  assertRootedChild(canonicalRoot, workspace);
  await rm(workspace, { force: true, recursive: true });
};

/**
 * Create a snapshot materializer backed by host-resolved source directories.
 *
 * The host resolver, rather than a browser job definition, maps opaque storage keys
 * to physical paths. The resolved directory is copied into each fresh attempt root.
 *
 * @param options - Trusted host resolver for immutable snapshot directories.
 * @returns A directory-copying input materializer.
 * @public
 *
 * @example <caption>Materialize snapshots from a host-owned CAS mount</caption>
 * ```typescript
 * import { createDirectorySolverInputMaterializer } from '@taucad/jobs-solvers';
 *
 * const materializer = createDirectorySolverInputMaterializer({
 *   resolve: async (snapshot) => `/srv/tau-cas/${snapshot.digest.slice('sha256:'.length)}`,
 * });
 * ```
 */
export const createDirectorySolverInputMaterializer = (options: {
  readonly resolve: (snapshot: JobInputSnapshot) => Promise<string>;
}): SolverInputMaterializer => ({
  async materialize(input) {
    input.signal.throwIfAborted();
    const source = await options.resolve(input.snapshot);
    const sourceStat = await stat(source);
    if (!sourceStat.isDirectory()) {
      throw new TypeError('Solver input snapshot resolver must return a directory.');
    }
    await cp(source, input.destination, { recursive: true, force: false, errorOnExist: true });
    input.signal.throwIfAborted();
  },
});

/** Default native workspace root. @internal */
export const defaultSolverWorkspaceRoot = join(tmpdir(), 'tau-solver-attempts');
