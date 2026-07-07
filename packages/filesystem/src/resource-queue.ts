// oxlint-disable-next-line eslint-plugin-promise/prefer-await-to-then -- Initial sentinel for queue chain
const resolved: Promise<void> = Promise.resolve();

/**
 * Per-resource write serialization queue (VS Code ResourceQueue pattern).
 *
 * Writes to the same file path are serialized (FIFO). Writes to different
 * file paths run in parallel. Auto-cleans empty queues on drain.
 *
 * Replaces the old global and per-parent queue variants, which were either
 * too strict or unnecessary with path-keyed IDB.
 *
 * @public
 * @see {@link https://github.com/microsoft/vscode | VS Code's} `ResourceQueue` in `src/vs/base/common/async.ts`.
 * @see {@link https://github.com/microsoft/vscode | VS Code's} `writeQueue` in `src/vs/platform/files/common/fileService.ts`.
 */
export class ResourceQueue {
  private readonly _queues = new Map<string, Promise<void>>();
  private _totalDepth = 0;
  private _drainWaiter: PromiseWithResolvers<void> | undefined;

  /**
   * Queue an operation serialized by the exact file path.
   *
   * Same-file writes execute in FIFO order. Different-file writes run
   * in parallel. The queue for a given path is auto-cleaned once empty.
   *
   * @param path - Absolute file path (used as serialization key).
   * @param operation - Async operation to execute.
   * @returns The operation's return value.
   */
  public async queueFor<T>(path: string, operation: () => Promise<T>): Promise<T> {
    this._totalDepth++;
    const existingQueue = this._queues.get(path) ?? resolved;

    const { promise, resolve, reject } = Promise.withResolvers<T>();

    // oxlint-disable-next-line eslint-plugin-promise/prefer-await-to-then -- Intentional promise chaining for queue serialization
    const next = existingQueue
      // oxlint-disable-next-line eslint-plugin-promise/prefer-await-to-then -- Intentional promise chaining for queue serialization
      .catch(() => undefined)
      // oxlint-disable-next-line eslint-plugin-promise/prefer-await-to-then -- Intentional promise chaining for queue serialization
      .then(async () => {
        try {
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this._totalDepth--;
          if (this._totalDepth === 0) {
            this._resolveDrainWaiter();
          }
        }
      });

    this._queues.set(path, next);

    // async-iife: bootstrap — auto-cleanup runs in the background after the
    // operation settles; the public promise above already surfaces errors.
    // oxlint-disable-next-line eslint-plugin-promise/prefer-await-to-then -- Intentional promise chaining for queue cleanup
    void next.then(() => {
      if (this._queues.get(path) === next) {
        this._queues.delete(path);
      }
    });

    return promise;
  }

  /**
   * Total number of operations queued or in-flight across all paths.
   * @returns The aggregate queue depth.
   */
  public get depth(): number {
    return this._totalDepth;
  }

  /**
   * Resolves when all queues are empty (no in-flight or pending operations).
   * @returns A promise that settles once every per-path queue has drained.
   */
  // oxlint-disable-next-line @typescript-eslint/promise-function-async -- concurrent waiters must receive the same pending promise by identity.
  public whenDrained(): Promise<void> {
    if (this._totalDepth === 0) {
      return resolved;
    }

    this._drainWaiter ??= Promise.withResolvers<void>();
    return this._drainWaiter.promise;
  }

  private _resolveDrainWaiter(): void {
    const waiter = this._drainWaiter;
    this._drainWaiter = undefined;
    waiter?.resolve();
  }
}
