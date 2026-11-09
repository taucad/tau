/** How many of the busiest projects the rank gauges carry (W14 N11, N12). */
export const hotProjectRanks = 10;

const minuteMilliseconds = 60_000;

/** One project's committed writes in one minute. */
export type HotProject = {
  readonly projectId: string;
  readonly commits: number;
  readonly writers: number;
};

/** A closed minute, ranked two ways: by committed writes and by distinct writers. */
export type HotProjectMinute = {
  readonly minuteStart: Date;
  readonly byCommits: readonly HotProject[];
  readonly byWriters: readonly HotProject[];
};

/** Descending by `key`, then by project id, so equal counts rank the same on every read. */
const topBy = (projects: readonly HotProject[], key: 'commits' | 'writers'): HotProject[] =>
  projects
    .toSorted((a, b) => b[key] - a[key] || (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0))
    .slice(0, hotProjectRanks);

/**
 * Committed writes per project in whole UTC minutes, for the stage-1 triggers: the commit rate and
 * the concurrent writers of the busiest projects (north star DA2, W14 Finding 5).
 *
 * The gauges built on this carry a rank and never a project id; the ids reach only the callback,
 * which writes the `git.hot_projects` log line once per closed minute.
 *
 * ponytail: process-local, so each API Machine ranks the writes it served and a project whose
 * pushes Fly spreads across Machines is under-counted on each (read the gauges with `max`). OB3's
 * accounting scheduler moves the counts to a per-minute Redis sorted set and HyperLogLog for a
 * fleet-wide rank under the same names; until then this is a lower bound.
 */
export class HotProjects {
  #minute: number | undefined;
  #current = new Map<string, { commits: number; writers: Set<string> }>();
  #closed: HotProjectMinute | undefined;

  /**
   * @param onMinuteClosed - Called once with every minute that had a write, when the next one starts.
   */
  public constructor(private readonly onMinuteClosed?: (closed: HotProjectMinute) => void) {}

  /**
   * Counts one committed write.
   *
   * @param projectId - The project the write committed to.
   * @param writer - Who wrote it, distinct per device that can race another.
   * @param now - Epoch milliseconds.
   */
  public record(projectId: string, writer: string, now: number = Date.now()): void {
    this.roll(now);
    const entry = this.#current.get(projectId) ?? {
      commits: 0,
      writers: new Set<string>(),
    };
    entry.commits += 1;
    entry.writers.add(writer);
    this.#current.set(projectId, entry);
  }

  /**
   * The minute before the current one, ranked; `undefined` when nothing committed in it.
   *
   * @param now - Epoch milliseconds.
   * @returns The ranked minute, or `undefined`.
   */
  public lastFullMinute(now: number = Date.now()): HotProjectMinute | undefined {
    this.roll(now);
    return this.#closed;
  }

  private roll(now: number): void {
    const minute = Math.floor(now / minuteMilliseconds);
    if (minute === this.#minute) {
      return;
    }
    const previous = this.#minute;
    let closed: HotProjectMinute | undefined;
    if (previous !== undefined && this.#current.size > 0) {
      const projects = [...this.#current].map(([projectId, entry]) => ({
        projectId,
        commits: entry.commits,
        writers: entry.writers.size,
      }));
      closed = {
        minuteStart: new Date(previous * minuteMilliseconds),
        byCommits: topBy(projects, 'commits'),
        byWriters: topBy(projects, 'writers'),
      };
      this.onMinuteClosed?.(closed);
    }
    /* A gap of idle minutes leaves the last full minute empty, not the stale one before it. */
    this.#closed = previous === minute - 1 ? closed : undefined;
    this.#current = new Map();
    this.#minute = minute;
  }
}
