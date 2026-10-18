/**
 * One retained-byte budget shared by every `FileContentService` of a
 * document.
 *
 * Each mount (the Home root and every open project) holds its own content
 * service, and each one bounding itself multiplied the bound by the number of
 * mounts (D-UI-07). Services that share a budget reclaim against the document's
 * total: when one grows past it, the other members shed their least recently
 * used released bytes first — a mount the person is not using holds the stalest
 * ones — and then the one that grew. Bytes a subscriber, lease, save or pending
 * read still holds are never shed.
 *
 * @public
 * @example <caption>One budget for every mount of the page</caption>
 * ```typescript
 * import { FileContentBudget } from '@taucad/fs-client/file-content-budget';
 *
 * export const documentFileContentBudget = new FileContentBudget({ maxTotalBytes: 128 * 1024 * 1024 });
 * ```
 */
export class FileContentBudget {
  /** The most bytes every member together retains once released bytes are shed. */
  public readonly maxTotalBytes: number;
  readonly #members = new Set<FileContentBudgetMember>();

  /**
   * Create a budget.
   * @param options - The document-wide byte bound.
   */
  public constructor(options: { readonly maxTotalBytes: number }) {
    this.maxTotalBytes = options.maxTotalBytes;
  }

  /**
   * Bytes every member retains now.
   * @returns The sum of the members' retained bytes.
   */
  public get retainedBytes(): number {
    let total = 0;
    for (const member of this.#members) {
      total += member.retainedBytes();
    }
    return total;
  }

  /**
   * Add a member to the budget.
   * @param member - The member's byte count and shedding hook.
   * @returns Removes the member again.
   */
  public join(member: FileContentBudgetMember): () => void {
    this.#members.add(member);
    return () => {
      this.#members.delete(member);
    };
  }

  /**
   * Shed released bytes until the members fit the budget, `grown` last.
   * @param grown - The member that just grew.
   */
  public reclaim(grown: FileContentBudgetMember): void {
    let excess = this.retainedBytes - this.maxTotalBytes;
    for (const member of [...[...this.#members].filter((other) => other !== grown), grown]) {
      if (excess <= 0) {
        return;
      }
      excess -= member.shed(excess);
    }
  }
}

/**
 * One member of a {@link FileContentBudget}.
 *
 * @public
 */
export type FileContentBudgetMember = {
  /** Bytes the member retains now. */
  readonly retainedBytes: () => number;
  /** Release up to `bytes` of released content and answer how many bytes went. */
  readonly shed: (bytes: number) => number;
};
