/**
 * In-process per-key serialiser for asynchronous tasks.
 *
 * Defence-in-depth complement to atomic IndexedDB transactions: even when the
 * underlying store guarantees per-row isolation, callers may still want
 * deterministic submission-order execution for the same key (e.g. so the last
 * `patchChat` call wins). Two tasks scheduled for the same key run strictly
 * back-to-back; tasks scheduled for different keys run in parallel.
 *
 * Map entries are dropped automatically once a key's queue drains, so the
 * mutex never accumulates unbounded state for short-lived keys.
 *
 * @public
 */
export class KeyedMutex<K> {
  // The tail of the per-key chain. Each new run() appends after the current
  // tail, then becomes the new tail. We always return a Promise that resolves
  // with the task's value (or rejects with its error), but the tail itself is
  // a Promise<void> that NEVER rejects so subsequent tasks always run.
  private readonly tails = new Map<K, Promise<void>>();

  /**
   * Number of keys currently tracked by the mutex. Exposed for tests so we can
   * assert that drained keys are released.
   */
  public get size(): number {
    return this.tails.size;
  }

  /**
   * Schedule `task` to run after every previously scheduled task for the same
   * `key` has settled. Tasks for different keys never block each other.
   *
   * The implementation is a hand-rolled promise chain (deliberate `.then`
   * usage): we need each newly scheduled task to be queued behind the current
   * tail without awaiting that tail in the calling fiber, because awaiting
   * here would block enqueue ordering. The lint-disables below mark this as
   * intentional rather than incidental.
   */
  public async run<T>(key: K, task: () => Promise<T>): Promise<T> {
    // oxlint-disable-next-line promise/prefer-await-to-then -- Promise.resolve() is a factory, not a chain method
    const previousTail = this.tails.get(key) ?? Promise.resolve();

    // oxlint-disable-next-line promise/prefer-await-to-then -- chain-based queue, see method JSDoc
    const taskPromise = previousTail.then(task);

    // The chain tail must never reject, otherwise the next `then(task)` call
    // would short-circuit straight to the rejection without running.
    // oxlint-disable-next-line promise/prefer-await-to-then -- chain-based queue, see method JSDoc
    const newTail = taskPromise.then(
      () => undefined,
      () => undefined,
    );

    this.tails.set(key, newTail);

    // async-iife: bootstrap — await chain tail so cleanup runs without `.then` chaining
    void (async (): Promise<void> => {
      await newTail;
      if (this.tails.get(key) === newTail) {
        this.tails.delete(key);
      }
    })();

    return taskPromise;
  }
}
