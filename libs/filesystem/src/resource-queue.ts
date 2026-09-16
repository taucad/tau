const resolved: Promise<void> = Promise.resolve();

/** One exact resource, optionally covering every key below a caller-defined prefix. @public */
export type ResourceQueueClaim = Readonly<{
  key: string;
  descendantPrefix?: string;
}>;

type QueuedClaims = Readonly<{
  claims: readonly ResourceQueueClaim[];
  settled: PromiseWithResolvers<void>;
}>;

const covers = (claim: ResourceQueueClaim, key: string): boolean =>
  claim.key === key || (claim.descendantPrefix !== undefined && key.startsWith(claim.descendantPrefix));

const conflicts = (left: readonly ResourceQueueClaim[], right: readonly ResourceQueueClaim[]): boolean =>
  left.some((leftClaim) =>
    right.some((rightClaim) => covers(leftClaim, rightClaim.key) || covers(rightClaim, leftClaim.key)),
  );

/**
 * Per-resource write serialization queue (VS Code ResourceQueue pattern).
 *
 * Exact writes to the same resource serialize in admission order while
 * unrelated resources run concurrently. A subtree claim also conflicts with
 * exact and subtree claims below its supplied descendant prefix.
 *
 * @public
 * @see {@link https://github.com/microsoft/vscode | VS Code's} `ResourceQueue` in `src/vs/base/common/async.ts`.
 */
export class ResourceQueue {
  private readonly _operations = new Set<QueuedClaims>();
  private _totalDepth = 0;
  private _drainWaiter: PromiseWithResolvers<void> | undefined;

  /** Queue an operation serialized by one exact resource key. */
  public async queueFor<T>(path: string, operation: () => Promise<T>): Promise<T> {
    return this.queueForClaims([{ key: path }], operation);
  }

  /** Queue one operation behind every supplied exact resource key. */
  public async queueForMany<T>(paths: readonly string[], operation: () => Promise<T>): Promise<T> {
    return this.queueForClaims(
      [...new Set(paths)].sort().map((key) => ({ key })),
      operation,
    );
  }

  /**
   * Queue one operation behind every earlier conflicting exact or subtree claim.
   *
   * `descendantPrefix` is opaque and caller-owned so browser POSIX paths and
   * native host paths can supply their own separators without path parsing here.
   */
  public async queueForClaims<T>(claims: readonly ResourceQueueClaim[], operation: () => Promise<T>): Promise<T> {
    const ownedClaims = claims.map(({ key, descendantPrefix }) => ({
      key,
      ...(descendantPrefix === undefined ? {} : { descendantPrefix }),
    }));
    this._totalDepth += 1;
    const settled = Promise.withResolvers<void>();
    const queued = { claims: ownedClaims, settled };
    const blockers: Array<Promise<void>> = [];
    // One linear scan keeps unrelated operations concurrent without a second lock index.
    for (const candidate of this._operations) {
      if (conflicts(candidate.claims, ownedClaims)) {
        blockers.push(candidate.settled.promise);
      }
    }
    this._operations.add(queued);

    try {
      await Promise.all(blockers);
      return await operation();
    } finally {
      this._operations.delete(queued);
      settled.resolve();
      this._totalDepth -= 1;
      if (this._totalDepth === 0) {
        this._resolveDrainWaiter();
      }
    }
  }

  /** Aggregate queued and in-flight operation count. */
  public get depth(): number {
    return this._totalDepth;
  }

  /** Resolve when every queued and in-flight operation has settled. */
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
