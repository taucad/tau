/**
 * Admission of one changeset phase: which entries may run side by side (D2).
 *
 * A provider runs one phase's entries concurrently, so the pipeline refuses,
 * before the first I/O, any two that could race: two entries on one path
 * (except appends, which keep their order), or one entry inside another's
 * subtree — except a recursive `mkdir` of an ancestor of non-destructive work,
 * which a write's own parent creation agrees with. The coalescer asks the same
 * question to decide whether a convenience call may join a pending changeset.
 *
 * @module
 */

/**
 * The footprint one entry leaves on one path. `destructive` covers a delete
 * and both ends of a move; `mkdir` is a recursive mkdir; `write` anything else
 * that creates or replaces the path.
 *
 * @public
 */
export type Occupancy = Readonly<{
  /** The storage space the path lives in: one per provider. */
  space: string;
  /** The path within that space. */
  path: string;
  kind: 'append' | 'mkdir' | 'write' | 'destructive';
}>;

const parentOf = (path: string): string | undefined => {
  if (path === '') {
    return undefined;
  }
  const separator = path.lastIndexOf('/');
  return separator === -1 ? '' : path.slice(0, separator);
};

/**
 * The occupancies admitted to one phase so far.
 *
 * @public
 */
export class PhaseAdmission {
  readonly #exact = new Map<string, Occupancy['kind']>();
  /** Every strict ancestor of an admitted path, and whether destructive work lies below it. */
  readonly #below = new Map<string, boolean>();

  /**
   * The first path at which `occupancies` would race an admitted entry.
   *
   * @param occupancies - One entry's footprint.
   * @returns The conflicting path, or `undefined` when the entry may join.
   */
  public conflict(occupancies: readonly Occupancy[]): string | undefined {
    for (const { space, path, kind } of occupancies) {
      const key = `${space}\0${path}`;
      const exact = this.#exact.get(key);
      if (exact !== undefined && !(exact === 'append' && kind === 'append')) {
        return path;
      }
      const below = this.#below.get(key);
      if (below !== undefined && !(kind === 'mkdir' && !below)) {
        return path;
      }
      for (let ancestor = parentOf(path); ancestor !== undefined; ancestor = parentOf(ancestor)) {
        const holder = this.#exact.get(`${space}\0${ancestor}`);
        if (holder !== undefined && !(holder === 'mkdir' && kind !== 'destructive')) {
          return path;
        }
      }
    }
    return undefined;
  }

  /**
   * Record one admitted entry's footprint.
   *
   * @param occupancies - The footprint {@link conflict} accepted.
   */
  public admit(occupancies: readonly Occupancy[]): void {
    for (const { space, path, kind } of occupancies) {
      this.#exact.set(`${space}\0${path}`, kind);
      for (let ancestor = parentOf(path); ancestor !== undefined; ancestor = parentOf(ancestor)) {
        const key = `${space}\0${ancestor}`;
        this.#below.set(key, this.#below.get(key) === true || kind === 'destructive');
      }
    }
  }
}
