import { describe, expect, it, vi } from 'vitest';
import type { HeadBlobArgs, HeadBlobResult, ObjectStorageService } from '@taucad/api-object-storage';
import { lfsObjectLocations } from '@taucad/api-git-core/lfs-keys';
import {
  lfsRelocationConcurrency,
  parseLfsRelocationConcurrency,
  relocateLegacyLfsInventory,
  surveyLegacyLfsObjects,
} from '#maintenance/lfs-relocation-run.js';
import type { LfsRelocationProject, LfsRelocationRow } from '#maintenance/lfs-relocation-run.js';

/**
 * STO-7's operator run. The relocation itself (verify, copy, delete under the
 * owner lock) is proved against PostgreSQL and MinIO by
 * `apps/api/app/api/git/lfs-retirement.test.ts`; this suite proves the run
 * around it: the read-only survey, dry run by default, the worker bound, the
 * resume cursor and the summary.
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

async function* listed(projects: readonly LfsRelocationProject[]): AsyncGenerator<LfsRelocationProject> {
  yield* projects;
}

const collect = () => {
  const lines: Array<Record<string, unknown>> = [];
  const report = async (line: string): Promise<void> => {
    lines.push(JSON.parse(line) as Record<string, unknown>);
  };
  return { lines, report };
};

describe('surveyLegacyLfsObjects', () => {
  it('should count each reservation by where its bytes are', async () => {
    const target = { ownerId: 'owner-a', projectId: 'project-a' };
    const rows: LfsRelocationRow[] = [
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

  it('should refuse a confirmed run wider than two workers', () => {
    expect(parseLfsRelocationConcurrency('2', true)).toBe(2);
    expect(() => parseLfsRelocationConcurrency('3', true)).toThrow(/from 1 to 2 with --confirm/u);
    expect(parseLfsRelocationConcurrency('16', false)).toBe(16);
    expect(() => parseLfsRelocationConcurrency('17', false)).toThrow(RangeError);
    expect(() => parseLfsRelocationConcurrency('0', false)).toThrow(RangeError);
    expect(() => parseLfsRelocationConcurrency('1.5', false)).toThrow(RangeError);
  });
});

describe('relocateLegacyLfsInventory', () => {
  const projects: LfsRelocationProject[] = [
    { ownerId: 'owner-a', projectId: 'project-1' },
    { ownerId: 'owner-a', projectId: 'project-2' },
    { ownerId: 'owner-b', projectId: 'project-3' },
  ];
  /* Project-1 and project-3 each hold one legacy object; project-2 is already relocated. */
  const held = new Set([
    legacyKey(projects[0]!, oid(1)),
    tenantKey(projects[1]!, oid(2)),
    legacyKey(projects[2]!, oid(3)),
  ]);
  const rowsOf = async (projectId: string): Promise<LfsRelocationRow[]> => [
    { oid: oid(Number(projectId.at(-1))), size: 4 },
  ];

  it('should plan without relocating when not confirmed', async () => {
    const relocate = vi.fn(async () => ({ moved: [] }));
    const { lines, report } = collect();

    const summary = await relocateLegacyLfsInventory(
      { projects: listed(projects), rows: rowsOf, storage: fakeStore(held), relocate },
      { confirm: false, concurrency: 2, report },
    );

    expect(relocate).not.toHaveBeenCalled();
    expect(
      lines.filter((line) => line['event'] === 'revisions_maintenance.lfs_relocation').map((line) => line['outcome']),
    ).toEqual(expect.arrayContaining(['planned', 'clean', 'planned']));
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
      resumeAfter: 'project-3',
    });
    expect(lines.at(-1)).toEqual(summary);
  });

  it('should relocate only the projects that hold a legacy key when confirmed', async () => {
    const relocate = vi.fn(async (target: LfsRelocationProject) => ({ moved: [`${target.projectId}-oid`] }));
    const { lines, report } = collect();

    const summary = await relocateLegacyLfsInventory(
      { projects: listed(projects), rows: rowsOf, storage: fakeStore(held), relocate },
      { confirm: true, concurrency: 1, report },
    );

    expect(relocate.mock.calls.map(([target]) => target.projectId)).toEqual(['project-1', 'project-3']);
    expect(lines.map((line) => [line['projectId'], line['outcome'], line['done']])).toEqual([
      ['project-1', 'relocated', 1],
      ['project-2', 'clean', 2],
      ['project-3', 'relocated', 3],
      [undefined, undefined, undefined],
    ]);
    expect(summary).toMatchObject({ dryRun: false, moved: 2, failed: [], resumeAfter: 'project-3' });
  });

  it('should keep at most the given number of projects in flight', async () => {
    let inFlight = 0;
    let widest = 0;
    const many = Array.from({ length: 8 }, (_, index) => ({ ownerId: 'owner', projectId: `p-${String(index)}` }));
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
      { projects: listed(many), rows: async () => [{ oid: oid(1), size: 1 }], storage, relocate },
      { confirm: true, concurrency: 2, report },
    );

    expect(relocate).toHaveBeenCalledTimes(8);
    expect(widest).toBe(2);
    expect(summary.moved).toBe(8);
  });

  it('should report a failed project, go on, and hold the resume cursor before it', async () => {
    const relocate = vi.fn(async (target: LfsRelocationProject) => {
      if (target.projectId === 'project-1') {
        throw new Error('legacy lfs object does not match its reservation');
      }
      return { moved: ['x'] };
    });
    const { lines, report } = collect();

    const summary = await relocateLegacyLfsInventory(
      { projects: listed(projects), rows: rowsOf, storage: fakeStore(held), relocate },
      { confirm: true, concurrency: 1, report },
    );

    expect(lines[0]).toMatchObject({
      projectId: 'project-1',
      outcome: 'failed',
      error: 'legacy lfs object does not match its reservation',
    });
    expect(lines[0]).not.toHaveProperty('resumeAfter');
    expect(relocate).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({ moved: 1, failed: ['project-1'] });
    expect(summary).not.toHaveProperty('resumeAfter');
  });

  it('should start no project after the stop signal and say it was interrupted', async () => {
    const stop = new AbortController();
    const relocate = vi.fn(async () => {
      stop.abort();
      return { moved: ['x'] };
    });
    const { report } = collect();

    const summary = await relocateLegacyLfsInventory(
      { projects: listed(projects), rows: rowsOf, storage: fakeStore(held), relocate },
      { confirm: true, concurrency: 1, report, signal: stop.signal },
    );

    expect(relocate).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ interrupted: true, projects: 1, moved: 1, resumeAfter: 'project-1' });
  });
});
