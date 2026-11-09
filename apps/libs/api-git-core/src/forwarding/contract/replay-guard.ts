/**
 * The request ids a worker has accepted in the last two minutes (W9 Finding 2,
 * "Verification": `rid` unseen on this worker within the last 120 s).
 *
 * In memory and per worker on purpose. A grant lives 60 s and its `iat` may be
 * 30 s off, so 120 s outlives every grant this worker would still accept. A
 * replay that reaches another worker is the residue the specification accepts:
 * a replayed push cannot commit, because its ref expectations are stale and the
 * manifest compare-and-swap refuses it, so what is left is a repeated read the
 * holder could already perform.
 */
export class ReplayGuard {
  readonly #seen = new Map<string, number>();
  readonly #now: () => number;
  readonly #windowMilliseconds: number;

  /**
   * @param options - The clock and the window; the defaults are the wall clock and 120 s.
   */
  public constructor(options: { readonly now?: () => number; readonly windowMilliseconds?: number } = {}) {
    this.#now = options.now ?? Date.now;
    this.#windowMilliseconds = options.windowMilliseconds ?? 120_000;
  }

  /**
   * Claims a request id.
   *
   * @param rid - The grant's request id.
   * @returns True the first time inside the window, false for a replay.
   */
  public claim(rid: string): boolean {
    const now = this.#now();
    this.#prune(now);
    const seen = this.#seen.get(rid);
    if (seen !== undefined && now - seen < this.#windowMilliseconds) {
      return false;
    }
    /* Deleted first so a re-claimed id moves to the end, keeping the map in claim order. */
    this.#seen.delete(rid);
    this.#seen.set(rid, now);
    return true;
  }

  /** The ids held now, for the gauge a worker may export. */
  public get size(): number {
    return this.#seen.size;
  }

  #prune(now: number): void {
    /* Insertion order is claim order, so the expired ids are a prefix. */
    for (const [rid, seen] of this.#seen) {
      if (now - seen < this.#windowMilliseconds) {
        return;
      }
      this.#seen.delete(rid);
    }
  }
}
