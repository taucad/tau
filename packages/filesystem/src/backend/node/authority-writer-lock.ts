import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';

const startupTimeoutMilliseconds = 5000;

/** Input for acquiring one physical filesystem authority writer. @public */
export type AcquireNodeAuthorityWriterInput = Readonly<{ authorityRoot: string; signal?: AbortSignal }>;

/** Lifetime handle for one OS-released filesystem authority writer. @public */
export type NodeAuthorityWriter = Readonly<{
  /** Native ownership endpoint: a lock file on POSIX or a named pipe on Windows. */
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

const acquireWindowsAuthorityWriter = async (input: AcquireNodeAuthorityWriterInput): Promise<NodeAuthorityWriter> => {
  throwIfAborted(input.signal);
  const authorityRoot = await realpath(input.authorityRoot);
  throwIfAborted(input.signal);
  // Libuv resolves mapped drives and junctions using GetFinalPathNameByHandleW.
  // Its UNC results cannot use a machine-local pipe for cross-host exclusion.
  if (!/^[a-z]:\\/i.test(authorityRoot)) {
    throw startupError('Windows writer ownership requires a local authority directory');
  }
  const identity = await stat(authorityRoot, { bigint: true });
  if (!identity.isDirectory() || identity.ino <= 0n || identity.dev < 0n) {
    throw startupError('authority root must be a directory with a physical file identity');
  }
  throwIfAborted(input.signal);
  const lockPath = `\\\\.\\pipe\\tau-filesystem-authority-${identity.dev.toString(16)}-${identity.ino.toString(16)}`;
  // Windows libuv binds with FILE_FLAG_FIRST_PIPE_INSTANCE. A second bind fails
  // even in another process/session; there is no persistent file to reclaim.
  // libuv replenishes the listening instance before delivering this callback.
  const server = createServer({ pauseOnConnect: true }, (socket) => {
    socket.destroy();
  });
  const ready = Promise.withResolvers<void>();
  const state: { released: boolean; failure?: Error; releasePromise?: Promise<void> } = { released: false };
  server.on('error', (error: NodeJS.ErrnoException) => {
    state.failure ??=
      error.code === 'EADDRINUSE'
        ? new NodeAuthorityWriterError('AUTHORITY_ALREADY_OWNED', 'This filesystem authority already has a writer.')
        : startupError('native pipe ownership failed', error);
    ready.reject(state.failure);
  });
  server.on('close', () => {
    state.failure ??= startupError('native pipe ownership has closed');
    ready.reject(state.failure);
  });
  const release = async (): Promise<void> => {
    state.released = true;
    state.releasePromise ??= new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error !== undefined && (!('code' in error) || error.code !== 'ERR_SERVER_NOT_RUNNING')) {
          state.releasePromise = undefined;
          reject(startupError('could not release native pipe ownership', error));
          return;
        }
        resolve();
      });
    });
    await state.releasePromise;
  };
  const assertOwned = (): void => {
    if (state.released || state.failure !== undefined || !server.listening) {
      throw state.failure ?? startupError('writer ownership has been released');
    }
  };
  const assertCurrent = async (): Promise<void> => {
    assertOwned();
    try {
      const current = await stat(authorityRoot, { bigint: true });
      if (!current.isDirectory() || current.dev !== identity.dev || current.ino !== identity.ino) {
        throw startupError('authority root physical identity has changed');
      }
    } catch (error) {
      state.failure ??= startupError('could not verify authority root physical identity', error);
      throw state.failure;
    }
    assertOwned();
  };
  const abort = (): void => {
    ready.reject(input.signal?.reason ?? startupError('startup aborted'));
  };
  input.signal?.addEventListener('abort', abort, { once: true });
  const timer = globalThis.setTimeout(() => {
    ready.reject(startupError('native pipe acquisition did not finish'));
  }, startupTimeoutMilliseconds);
  try {
    try {
      server.listen({ path: lockPath, exclusive: true }, () => {
        ready.resolve();
      });
    } catch (error) {
      ready.reject(startupError('could not acquire native pipe ownership', error));
    }
    // Ownership follows the process lifetime; it must not keep an idle host alive.
    server.unref();
    await ready.promise;
    throwIfAborted(input.signal);
    await assertCurrent();
    throwIfAborted(input.signal);
    return Object.freeze({ lockPath, assertCurrent, release });
  } catch (error) {
    await release();
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    input.signal?.removeEventListener('abort', abort);
  }
};

/**
 * Acquire a parent-owned kernel lock for one canonical physical authority.
 *
 * On POSIX a short-lived native utility locks inherited fd 3; the parent retains
 * that open file description. On Windows a parent-owned exclusive named pipe
 * protects a local authority directory. Network authority directories are refused.
 * Both native owners are released on process death without stale-file recovery.
 *
 * @param input - Existing host-owned jobs authority directory, outside authored views, and optional startup abort.
 * @returns A parent-owned writer handle.
 * @public
 */
export const acquireNodeAuthorityWriter = async (
  input: AcquireNodeAuthorityWriterInput,
): Promise<NodeAuthorityWriter> => {
  if (process.platform === 'win32') {
    return acquireWindowsAuthorityWriter(input);
  }
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
