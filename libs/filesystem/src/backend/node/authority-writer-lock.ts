import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';

const startupTimeoutMilliseconds = 5000;

/** Input for acquiring one physical filesystem authority writer. @public */
export type AcquireNodeAuthorityWriterInput = Readonly<{ authorityRoot: string; signal?: AbortSignal }>;

/** Lifetime handle for one OS-released filesystem authority writer. @public */
export type NodeAuthorityWriter = Readonly<{
  lockPath: string;
  assertCurrent(): Promise<void>;
  release(): Promise<void>;
}>;

/** Typed authority-writer startup refusal. @public */
export class NodeAuthorityWriterError extends Error {
  public readonly code: 'AUTHORITY_ALREADY_OWNED' | 'AUTHORITY_LOCK_UNAVAILABLE' | 'AUTHORITY_LOCK_UNSUPPORTED';
  public constructor(code: NodeAuthorityWriterError['code'], message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'NodeAuthorityWriterError';
    this.code = code;
  }
}

const startupError = (detail: string, cause?: unknown): NodeAuthorityWriterError =>
  new NodeAuthorityWriterError('AUTHORITY_LOCK_UNAVAILABLE', `Filesystem authority writer unavailable: ${detail}`, {
    cause: cause instanceof Error ? cause : undefined,
  });

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : startupError('startup aborted');
  }
};

const lockCommand = (): Readonly<{ command: string; arguments_: readonly string[] }> => {
  if (process.versions['electron'] !== undefined && process.platform !== 'darwin') {
    throw new NodeAuthorityWriterError(
      'AUTHORITY_LOCK_UNSUPPORTED',
      'Electron filesystem writer ownership is only qualified on Darwin.',
    );
  }
  if (process.platform === 'darwin') {
    return { command: '/usr/bin/lockf', arguments_: ['-s', '-t', '0', '3'] };
  }
  if (process.platform === 'linux') {
    return { command: '/usr/bin/flock', arguments_: ['--exclusive', '--nonblock', '--conflict-exit-code', '75', '3'] };
  }
  throw new NodeAuthorityWriterError(
    'AUTHORITY_LOCK_UNSUPPORTED',
    `Filesystem authority writer ownership is unsupported on ${process.platform}.`,
  );
};

/**
 * Acquire a parent-owned kernel lock for one canonical physical authority.
 *
 * A short-lived native utility locks inherited fd 3. The parent retains that
 * same open file description until release or process death.
 *
 * @param input - Existing host-owned jobs authority directory, outside authored views, and optional startup abort.
 * @returns A parent-owned writer handle.
 * @public
 */
export const acquireNodeAuthorityWriter = async (
  input: AcquireNodeAuthorityWriterInput,
): Promise<NodeAuthorityWriter> => {
  const selected = lockCommand();
  throwIfAborted(input.signal);
  const authorityRoot = await realpath(input.authorityRoot);
  throwIfAborted(input.signal);
  const authorityStats = await stat(authorityRoot);
  if (!authorityStats.isDirectory()) {
    throw startupError('authority root is not a directory');
  }
  throwIfAborted(input.signal);
  const lockPath = join(authorityRoot, 'authority.writer.lock');
  let descriptor: Awaited<ReturnType<typeof open>>;
  try {
    descriptor = await open(lockPath, constants.O_APPEND + constants.O_CREAT + constants.O_NOFOLLOW + constants.O_RDWR);
  } catch (error) {
    throw startupError('could not open canonical authority lock', error);
  }
  try {
    const lockStats = await descriptor.stat();
    if (!lockStats.isFile()) {
      throw startupError('authority lock must be a regular file');
    }
    throwIfAborted(input.signal);
    const child = spawn(selected.command, [...selected.arguments_], {
      shell: false,
      stdio: ['ignore', 'ignore', 'pipe', descriptor.fd],
    });
    let stderr = '';
    const childStderr = child.stderr;
    if (childStderr === null) {
      throw startupError('native lock acquisition has no stderr pipe');
    }
    childStderr.setEncoding('utf8');
    childStderr.on('data', (chunk: string) => {
      stderr += chunk.slice(0, Math.max(0, 4096 - stderr.length));
    });
    const result = Promise.withResolvers<Readonly<{ code?: number; signal?: NodeJS.Signals }>>();
    child.once('error', (error) => {
      result.reject(startupError(`could not start ${selected.command}`, error));
    });
    child.once('close', (code, signal) => {
      result.resolve({ ...(code === null ? {} : { code }), ...(signal === null ? {} : { signal }) });
    });
    let interruption: unknown;
    const abort = (): void => {
      interruption ??= input.signal?.reason ?? startupError('startup aborted');
      child.kill('SIGKILL');
    };
    input.signal?.addEventListener('abort', abort, { once: true });
    if (input.signal?.aborted) {
      abort();
    }
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    try {
      timer = globalThis.setTimeout(() => {
        interruption ??= startupError('native lock acquisition did not finish');
        child.kill('SIGKILL');
      }, startupTimeoutMilliseconds);
      const outcome = await result.promise;
      if (interruption !== undefined) {
        throw interruption instanceof Error ? interruption : startupError('startup interrupted', interruption);
      }
      if (outcome.code === 75) {
        throw new NodeAuthorityWriterError(
          'AUTHORITY_ALREADY_OWNED',
          'This filesystem authority already has a writer.',
        );
      }
      if (outcome.code !== 0) {
        throw startupError(
          `native lock acquisition failed (code ${String(outcome.code)}, signal ${String(outcome.signal)})${stderr ? `: ${stderr.trim()}` : ''}`,
        );
      }
    } finally {
      globalThis.clearTimeout(timer);
      input.signal?.removeEventListener('abort', abort);
    }
  } catch (error) {
    await descriptor.close();
    throw error;
  }

  const state: { released: boolean; storageClosed: boolean; releasePromise?: Promise<void> } = {
    released: false,
    storageClosed: false,
  };
  const closeDescriptor = async (): Promise<void> => {
    try {
      await descriptor.close();
      state.storageClosed = true;
    } catch (error) {
      state.releasePromise = undefined;
      throw error;
    }
  };
  return Object.freeze({
    lockPath,
    async assertCurrent(): Promise<void> {
      if (state.released) {
        throw startupError('writer ownership has been released');
      }
      await descriptor.stat();
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- release may run while stat yields.
      if (state.released) {
        throw startupError('writer ownership was released across an asynchronous boundary');
      }
    },
    async release(): Promise<void> {
      if (state.storageClosed) {
        return;
      }
      state.released = true;
      state.releasePromise ??= closeDescriptor();
      await state.releasePromise;
    },
  });
};
