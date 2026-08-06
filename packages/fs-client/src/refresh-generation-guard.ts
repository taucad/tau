/**
 * Per-path monotonic generation counter so stale async refresh work cannot
 * overwrite newer results (worker event bursts).
 *
 * @public
 */
export class RefreshGenerationGuard {
  private readonly generations = new Map<string, number>();
  private nextGeneration = 0;

  /**
   * Allocate the next monotonic generation for `path`.
   * @param path - Workspace-relative path key.
   * @returns Opaque generation number for {@link isCurrent} comparisons.
   */
  public begin(path: string): number {
    const next = ++this.nextGeneration;
    this.generations.set(path, next);
    return next;
  }

  /**
   * Compares a generation token against the latest value recorded for `path`.
   * @param path - Workspace-relative path key.
   * @param generation - Generation returned from {@link begin}.
   * @returns `true` when no newer {@link begin} call has replaced `generation` for `path`.
   */
  public isCurrent(path: string, generation: number): boolean {
    return this.generations.get(path) === generation;
  }

  /**
   * Clear generation bookkeeping for one path or the entire map. Tokens are
   * never reused, so an older in-flight operation cannot ABA-match after reset.
   * @param path - Optional path key; omit to clear all tracked paths.
   */
  public reset(path?: string): void {
    if (path === undefined) {
      this.generations.clear();
      return;
    }
    this.generations.delete(path);
  }
}
