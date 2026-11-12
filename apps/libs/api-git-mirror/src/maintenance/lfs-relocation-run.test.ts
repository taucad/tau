import { describe, expect, it, vi } from 'vitest';
import type { HeadBlobArgs, HeadBlobResult, ObjectStorageService } from '@taucad/api-object-storage';
import { lfsObjectLocations } from '@taucad/api-git-core/lfs-keys';
import {
  lfsRelocationConcurrency,
  lfsRelocationProjects,
  parseLfsRelocationConcurrency,
  relocateLegacyLfsInventory,
  surveyLegacyLfsObjects,
} from '#maintenance/lfs-relocation-run.js';
import type { LfsRelocationProject, LfsRelocationTarget } from '#maintenance/lfs-relocation-run.js';
import type { LfsReservation } from '#maintenance/lfs-reservation-scope.js';

/**
 * The `relocate-lfs` operator run. The relocation itself (copy, then verify
 * and delete under the owner lock) is proved against PostgreSQL and MinIO by
 * `apps/api/app/api/git/lfs-retirement.test.ts`; this suite proves the run
 * around it: the read-only survey, dry run by default, the worker bound, the
 * resume cursor, the stop signal and the summary.
 */

const oid = (index: number): string => index.toString(16).padStart(64, '0');

/** A store that holds the given keys, each `size` bytes, and answers HEADs for them. */
const fakeStore = (held: ReadonlySet<string>) => {
  const headBlob = vi.fn(async (args: HeadBlobArgs): Promise<HeadBlobResult | undefined> => {
    args.signal?.throwIfAborted();
    return held.has(`${args.namespace}/${args.key}`)
      ? { contentType: 'application/octet-stream', size: 1, etag: 'e', cacheControl: '' }
      : undefined;
  });
  return { headBlob } satisfies Pick<ObjectStorageService, 'headBlob'>;
};

const keyOf = (location: { namespace: string; key: string }): string => `${location.namespace}/${location.key}`;

const tenantKey = (project: LfsRelocationProject, objectId: string): string =>
  keyOf(lfsObjectLocations(project.ownerId, project.projectId, objectId)[0]);

const legacyKey = (project: LfsRelocationProject, objectId: string): string =>
  keyOf(lfsObjectLocations(project.ownerId, project.projectId, objectId)[1]);

async function* listed(projects: readonly LfsRelocationTarget[]): AsyncGenerator<LfsRelocationTarget> {
  yield* projects;
}

const collect = () => {
  const lines: Array<Record<string, unknown>> = [];
  const report = async (line: string): Promise<void> => {
    lines.push(JSON.parse(line) as Record<string, unknown>);
  };
  return { lines, report };
};

const projectLines = (lines: ReadonlyArray<Record<string, unknown>>) =>
  lines.filter((line) => line['event'] === 'revisions_maintenance.lfs_relocation');

describe('lfsRelocationProjects', () => {
  it('should yield each project once with every row, across page boundaries', async () => {
    const row = (projectId: string, index: number): LfsReservation => ({
      ownerId: `owner-${projectId}`,
      projectId,
      oid: oid(index),
      size: index,
      finalized: true,
    });
    async function* pages(): AsyncGenerator<readonly LfsReservation[]> {
      yield [row('p-1', 1), row('p-2', 2)];
      yield [row('p-2', 3), row('p-3', 4)];
    }

    expect(await Array.fromAsync(lfsRelocationProjects(pages()))).toEqual([
      { ownerId: 'owner-p-1', projectId: 'p-1', rows: [{ oid: oid(1), size: 1 }] },
      {
        ownerId: 'owner-p-2',
        projectId: 'p-2',
        rows: [
          { oid: oid(2), size: 2 },
          { oid: oid(3), size: 3 },
        ],
      },
      { ownerId: 'owner-p-3', projectId: 'p-3', rows: [{ oid: oid(4), size: 4 }] },
    ]);
  });
});

describe('surveyLegacyLfsObjects', () => {
  it('should count each reservation by where its bytes are', async () => {
    const target = { ownerId: 'owner-a', projectId: 'project-a' };
    const rows = [
      { oid: oid(1), size: 10 },
      { oid: oid(2), size: 30 },
      { oid: oid(3), size: 5 },
      { oid: oid(4), size: 7 },
      { oid: oid(5), size: 9 },
    ];
    const store = fakeStore(
      new Set([
        legacyKey(target, oid(1)),
        legacyKey(target, oid(2)),
        legacyKey(target, oid(3)),
        tenantKey(target, oid(3)),
        tenantKey(target, oid(4)),
      ]),
    );

    const survey = await surveyLegacyLfsObjects(store, { ...target, rows });

    expect(survey).toEqual({
      objects: 5,
      legacyOnly: 2,
      both: 1,
      tenantOnly: 1,
      missing: 1,
      legacyBytes: 40,
      largestLegacyBytes: 30,
    });
    expect(store.headBlob).toHaveBeenCalledTimes(10);
    expect(store.headBlob.mock.calls.every(([args]) => args.tier === 'private')).toBe(true);
  });
});

describe('parseLfsRelocationConcurrency', () => {
  it('should default to the mode bound', () => {
    expect(parseLfsRelocationConcurrency(undefined, false)).toBe(lfsRelocationConcurrency.dryRun.default);
    expect(parseLfsRelocationConcurrency(undefined, true)).toBe(lfsRelocationConcurrency.confirm.default);
  });

  it('should refuse a confirmed run wider than one worker', () => {
    expect(parseLfsRelocationConcurrency('1', true)).toBe(1);
    expect(() => parseLfsRelocationConcurrency('2', true)).toThrow(/from 1 to 1 with --confirm/u);
    expect(parseLfsRelocationConcurrency('16', false)).toBe(16);
    expect(() => parseLfsRelocationConcurrency('17', false)).toThrow(RangeError);
    expect(() => parseLfsRelocationConcurrency('0', false)).toThrow(RangeError);
    expect(() => parseLfsRelocationConcurrency('1.5', false)).toThrow(RangeError);
  });
});

describe('relocateLegacyLfsInventory', () => {
  const target = (ownerId: string, projectId: string): LfsRelocationTarget => ({
    ownerId,
    projectId,
    rows: [{ oid: oid(Number(projectId.at(-1))), size: 4 }],
  });
  const projects: LfsRelocationTarget[] = [
    target('owner-a', 'project-1'),
    target('owner-a', 'project-2'),
    target('owner-b', 'project-3'),
  ];
  /* Project-1 and project-3 each hold one legacy object; project-2 is already relocated. */
  const held = new Set([
    legacyKey(projects[0]!, oid(1)),
    tenantKey(projects[1]!, oid(2)),
    legacyKey(projects[2]!, oid(3)),
  ]);
  /* Every project holds a legacy object. */
  const allLegacy = new Set(projects.map((each) => legacyKey(each, each.rows[0]!.oid)));

  it('should plan without relocating, and give no resume cursor, when not confirmed', async () => {
    const relocate = vi.fn(async () => ({ moved: [] }));
    const { lines, report } = collect();

    const summary = await relocateLegacyLfsInventory(
      { projects: listed(projects), storage: fakeStore(held), relocate },
      { confirm: false, concurrency: 2, report },
    );

    expect(relocate).not.toHaveBeenCalled();
    expect(projectLines(lines).map((line) => line['outcome'])).toEqual(
      expect.arrayContaining(['planned', 'clean', 'planned']),
    );
    // A dry run moved nothing: a cursor from it would let `--confirm --after` skip legacy keys.
    expect(lines.every((line) => !('resumeAfter' in line))).toBe(true);
    expect(summary).toEqual({
      event: 'revisions_maintenance.lfs_relocation_summary',
      dryRun: true,
      interrupted: false,
      projects: 3,
      withLegacy: 2,
      legacyObjects: 2,
      legacyBytes: 8,
      moved: 0,
      missing: 0,
      failed: [],
    });
    expect(lines.at(-1)).toEqual(summary);
  });

  it('should relocate only the projects that hold a legacy key when confirmed', async () => {
    const relocate = vi.fn(async (each: LfsRelocationProject) => ({ moved: [`${each.projectId}-oid`] }));
    const { lines, report } = collect();

    const summary = await relocateLegacyLfsInventory(
      { projects: listed(projects), storage: fakeStore(held), relocate },
      { confirm: true, concurrency: 1, report },
    );

    expect(relocate.mock.calls.map(([each]) => each)).toEqual([
      { ownerId: 'owner-a', projectId: 'project-1' },
      { ownerId: 'owner-b', projectId: 'project-3' },
    ]);
    expect(lines.map((line) => [line['projectId'], line['outcome'], line['done'], line['resumeAfter']])).toEqual([
      ['project-1', 'relocated', 1, 'project-1'],
      ['project-2', 'clean', 2, 'project-2'],
      ['project-3', 'relocated', 3, 'project-3'],
      [undefined, undefined, undefined, 'project-3'],
    ]);
    expect(summary).toMatchObject({ dryRun: false, moved: 2, failed: [], resumeAfter: 'project-3' });
  });

  it('should keep at most the given number of projects in flight', async () => {
    let inFlight = 0;
    let widest = 0;
    const many = Array.from({ length: 8 }, (_, index) => target('owner', `p-${String(index)}`));
    const storage = {
      headBlob: vi.fn(async (args: HeadBlobArgs) => {
        const legacy = args.namespace === 'blobs';
        return legacy ? { contentType: '', size: 1, etag: 'e', cacheControl: '' } : undefined;
      }),
    };
    const relocate = vi.fn(async () => {
      inFlight += 1;
      widest = Math.max(widest, inFlight);
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
      inFlight -= 1;
      return { moved: ['x'] };
    });
    const { report } = collect();

    const summary = await relocateLegacyLfsInventory(
      { projects: listed(many), storage, relocate },
      { confirm: true, concurrency: 2, report },
    );

    expect(relocate).toHaveBeenCalledTimes(8);
    expect(widest).toBe(2);
    expect(summary.moved).toBe(8);
  });

  it('should report a failed first project, go on, and give no resume cursor', async () => {
    const relocate = vi.fn(async (each: LfsRelocationProject) => {
      if (each.projectId === 'project-1') {
        throw new Error('legacy lfs object does not match its reservation');
      }
      return { moved: ['x'] };
    });
    const { lines, report } = collect();

    const summary = await relocateLegacyLfsInventory(
      { projects: listed(projects), storage: fakeStore(held), relocate },
      { confirm: true, concurrency: 1, report },
    );

    expect(lines[0]).toMatchObject({
      projectId: 'project-1',
      outcome: 'failed',
      error: 'legacy lfs object does not match its reservation',
    });
    expect(lines.every((line) => !('resumeAfter' in line))).toBe(true);
    expect(relocate).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({ moved: 1, failed: ['project-1'] });
  });

  it('should hold the resume cursor at project-1 when project-2 fails', async () => {
    const relocate = vi.fn(async (each: LfsRelocationProject) => {
      if (each.projectId === 'project-2') {
        throw new Error('relocated lfs object did not store its bytes');
      }
      return { moved: ['x'] };
    });
    const { lines, report } = collect();

    const summary = await relocateLegacyLfsInventory(
      { projects: listed(projects), storage: fakeStore(allLegacy), relocate },
      { confirm: true, concurrency: 1, report },
    );

    expect(projectLines(lines).map((line) => [line['projectId'], line['outcome'], line['resumeAfter']])).toEqual([
      ['project-1', 'relocated', 'project-1'],
      ['project-2', 'failed', 'project-1'],
      ['project-3', 'relocated', 'project-1'],
    ]);
    expect(summary).toMatchObject({ moved: 2, failed: ['project-2'], resumeAfter: 'project-1' });
  });

  it('should advance the resume cursor only over the finished prefix when projects finish out of order', async () => {
    const gates = new Map(projects.map((each) => [each.projectId, Promise.withResolvers<void>()]));
    const relocate = vi.fn(async (each: LfsRelocationProject) => {
      await gates.get(each.projectId)!.promise;
      return { moved: ['x'] };
    });
    const { lines, report } = collect();
    const settledLines = async (count: number): Promise<void> => {
      await vi.waitFor(() => {
        expect(projectLines(lines)).toHaveLength(count);
      });
    };

    const run = relocateLegacyLfsInventory(
      { projects: listed(projects), storage: fakeStore(allLegacy), relocate },
      { confirm: true, concurrency: 2, report },
    );
    await vi.waitFor(() => {
      expect(relocate).toHaveBeenCalledTimes(2);
    });
    // Project-2 finishes while project-1 is still in flight: nothing is safe to skip yet.
    gates.get('project-2')!.resolve();
    await settledLines(1);
    expect(lines[0]).toMatchObject({ projectId: 'project-2', outcome: 'relocated' });
    expect(lines[0]).not.toHaveProperty('resumeAfter');
    // Project-3 starts and finishes; project-1 still holds the cursor back.
    gates.get('project-3')!.resolve();
    await settledLines(2);
    expect(lines[1]).toMatchObject({ projectId: 'project-3' });
    expect(lines[1]).not.toHaveProperty('resumeAfter');
    // Project-1 finishes: the whole prefix is done at once.
    gates.get('project-1')!.resolve();
    const summary = await run;

    expect(lines[2]).toMatchObject({ projectId: 'project-1', resumeAfter: 'project-3' });
    expect(summary).toMatchObject({ moved: 3, failed: [], resumeAfter: 'project-3' });
  });

  it('should mark a project failed when its survey HEAD errors', async () => {
    const relocate = vi.fn(async (_target: LfsRelocationProject) => ({ moved: ['x'] }));
    const store = fakeStore(allLegacy);
    store.headBlob.mockImplementation(async (args: HeadBlobArgs) => {
      if (args.key.includes('project-2')) {
        throw new Error('HEAD timed out');
      }
      return allLegacy.has(`${args.namespace}/${args.key}`)
        ? { contentType: 'application/octet-stream', size: 1, etag: 'e', cacheControl: '' }
        : undefined;
    });
    const { lines, report } = collect();

    const summary = await relocateLegacyLfsInventory(
      { projects: listed(projects), storage: store, relocate },
      { confirm: true, concurrency: 1, report },
    );

    expect(projectLines(lines)[1]).toMatchObject({
      projectId: 'project-2',
      outcome: 'failed',
      error: 'HEAD timed out',
    });
    expect(relocate.mock.calls.map(([each]) => each.projectId)).toEqual(['project-1', 'project-3']);
    expect(summary).toMatchObject({ failed: ['project-2'], resumeAfter: 'project-1' });
  });

  it('should start no project after the stop signal and say it was interrupted', async () => {
    const stop = new AbortController();
    const relocate = vi.fn(async () => {
      stop.abort();
      return { moved: ['x'] };
    });
    const { report } = collect();

    const summary = await relocateLegacyLfsInventory(
      { projects: listed(projects), storage: fakeStore(held), relocate },
      { confirm: true, concurrency: 1, report, signal: stop.signal },
    );

    expect(relocate).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ interrupted: true, projects: 1, moved: 1, resumeAfter: 'project-1' });
  });

  it('should not start the project a page read returns after the stop signal', async () => {
    const stop = new AbortController();
    const pageRead = Promise.withResolvers<void>();
    async function* slowPage(): AsyncGenerator<LfsRelocationTarget> {
      await pageRead.promise;
      yield* projects;
    }
    const relocate = vi.fn(async () => ({ moved: ['x'] }));
    const store = fakeStore(allLegacy);
    const { report } = collect();

    const run = relocateLegacyLfsInventory(
      { projects: slowPage(), storage: store, relocate },
      { confirm: true, concurrency: 1, report, signal: stop.signal },
    );
    // The signal arrives while the worker awaits the page.
    stop.abort();
    pageRead.resolve();
    const summary = await run;

    expect(store.headBlob).not.toHaveBeenCalled();
    expect(relocate).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ interrupted: true, projects: 0 });
  });

  it('should stop every worker and let in-flight projects settle before rethrowing a report failure', async () => {
    const release = Promise.withResolvers<void>();
    const settled: string[] = [];
    const relocate = vi.fn(async (each: LfsRelocationProject) => {
      if (each.projectId === 'project-2') {
        await release.promise;
      }
      settled.push(each.projectId);
      return { moved: ['x'] };
    });
    const lines: string[] = [];
    const report = vi.fn(async (line: string): Promise<void> => {
      if (line.includes('"project-1"')) {
        // Let project-2 settle only after the failure, so the run must wait for it.
        setTimeout(() => {
          release.resolve();
        }, 10);
        throw new Error('stdout closed');
      }
      lines.push(line);
    });

    await expect(
      relocateLegacyLfsInventory(
        { projects: listed(projects), storage: fakeStore(allLegacy), relocate },
        { confirm: true, concurrency: 2, report },
      ),
    ).rejects.toThrow('stdout closed');

    // Project-2 was in flight and settled before the rejection; project-3 was never started.
    expect(settled).toEqual(['project-1', 'project-2']);
    expect(relocate).toHaveBeenCalledTimes(2);
    expect(lines.some((line) => line.includes('lfs_relocation_summary'))).toBe(false);
  });

  it('should rethrow the worker failure, not a failure to close the pages', async () => {
    const closing = new Error('page cursor already closed');
    const pages = (fail: boolean): AsyncIterable<LfsRelocationTarget> => ({
      [Symbol.asyncIterator]: () => {
        let index = 0;
        return {
          next: async () => {
            const value = projects[index];
            index += 1;
            return value === undefined ? { done: true, value: undefined } : { done: false, value };
          },
          return: async () => {
            if (fail) {
              throw closing;
            }
            return { done: true, value: undefined };
          },
        };
      },
    });
    const relocate = vi.fn(async () => ({ moved: ['x'] }));
    const failingReport = vi.fn(async (_line: string): Promise<void> => {
      throw new Error('stdout closed');
    });

    await expect(
      relocateLegacyLfsInventory(
        { projects: pages(true), storage: fakeStore(allLegacy), relocate },
        { confirm: true, concurrency: 1, report: failingReport },
      ),
    ).rejects.toThrow('stdout closed');
    // With no worker failure, the close failure itself is what the run reports.
    const { report } = collect();
    await expect(
      relocateLegacyLfsInventory(
        { projects: pages(true), storage: fakeStore(allLegacy), relocate },
        { confirm: true, concurrency: 1, report },
      ),
    ).rejects.toBe(closing);
  });
});
