import { describe, expect, it, vi } from 'vitest';
import { HotProjects, hotProjectRanks } from '#api/git/hot-projects.js';

const minute = 60_000;
/** A minute boundary, so `at(n)` is n milliseconds into one whole minute. */
const start = Date.UTC(2026, 9, 24, 12, 0, 0);
const at = (milliseconds: number): number => start + milliseconds;

describe('HotProjects', () => {
  it('reads nothing until a minute has closed', () => {
    const tracker = new HotProjects();
    tracker.record('proj_a', 'user-a', at(1000));

    expect(tracker.lastFullMinute(at(2000))).toBeUndefined();
  });

  it('ranks the last full minute by commits and, separately, by distinct writers', () => {
    const tracker = new HotProjects();
    for (const [project, writer] of [
      ['proj_a', 'user-1'],
      ['proj_a', 'user-1'],
      ['proj_a', 'user-1'],
      ['proj_b', 'user-1'],
      ['proj_b', 'user-2'],
      ['proj_b', 'user-3'],
    ] as const) {
      tracker.record(project, writer, at(1000));
    }

    const closed = tracker.lastFullMinute(at(minute + 5));

    expect(closed?.byCommits).toEqual([
      { projectId: 'proj_a', commits: 3, writers: 1 },
      { projectId: 'proj_b', commits: 3, writers: 3 },
    ]);
    expect(closed?.byWriters.map((entry) => entry.projectId)).toEqual(['proj_b', 'proj_a']);
  });

  it('keeps only the top ranks', () => {
    const tracker = new HotProjects();
    for (let project = 0; project < hotProjectRanks + 5; project += 1) {
      for (let commit = 0; commit <= project; commit += 1) {
        tracker.record(`proj_${String(project)}`, 'user-1', at(1000));
      }
    }

    const closed = tracker.lastFullMinute(at(minute));

    expect(closed?.byCommits).toHaveLength(hotProjectRanks);
    expect(closed?.byCommits[0]).toMatchObject({
      projectId: `proj_${String(hotProjectRanks + 4)}`,
    });
  });

  it('reads an idle minute as empty, never as the stale minute before it', () => {
    const tracker = new HotProjects();
    tracker.record('proj_a', 'user-1', at(1000));

    expect(tracker.lastFullMinute(at(minute))?.byCommits).toHaveLength(1);
    expect(tracker.lastFullMinute(at(2 * minute))).toBeUndefined();
  });

  it('reports each closed minute once, with its project ids, for the git.hot_projects log line', () => {
    const closed = vi.fn();
    const tracker = new HotProjects(closed);
    tracker.record('proj_a', 'user-1', at(1000));
    tracker.record('proj_a', 'user-2', at(2000));

    tracker.lastFullMinute(at(minute + 1));
    tracker.lastFullMinute(at(minute + 2));
    tracker.record('proj_b', 'user-1', at(minute + 3));

    expect(closed).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        minuteStart: new Date(start),
        byCommits: [{ projectId: 'proj_a', commits: 2, writers: 2 }],
      }),
    );
  });
});
