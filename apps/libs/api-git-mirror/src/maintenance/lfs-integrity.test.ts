import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { HeadBlobArgs, HeadBlobResult } from '@taucad/api-object-storage';
import { lfsObjectLocations } from '@taucad/api-git-core/lfs-keys';
import {
  inspectLfsObject,
  inventoryLfsIntegrity,
  lfsIntegrityConcurrency,
  parseLfsIntegrityConcurrency,
} from '#maintenance/lfs-integrity.js';
import type { LfsIntegrityRow } from '#maintenance/lfs-integrity.js';

/**
 * The existing-object inventory: what the store reports for each tenant-key
 * LFS object, against its `oid`. The store is a fake keyed by location;
 * nothing here writes.
 */

const oidOf = (content: string): string => createHash('sha256').update(content).digest('hex');
const base64Of = (hex: string): string => Buffer.from(hex, 'hex').toString('base64');

const row = (content: string, size = 3, finalized = true): LfsIntegrityRow => ({
  ownerId: 'owner-a',
  projectId: 'project-a',
  oid: oidOf(content),
  size,
  finalized,
});

const noExclusions = async () => ({ skippedOtherAccount: 0, deletedProjectRows: 0 });

const collect = () => {
  const lines: Array<Record<string, unknown>> = [];
  const report = async (line: string): Promise<void> => {
    lines.push(JSON.parse(line) as Record<string, unknown>);
  };
  return { lines, report };
};

const keyOf = (location: { namespace: string; key: string }): string => `${location.namespace}/${location.key}`;
const tenantKey = (target: LfsIntegrityRow): string =>
  keyOf(lfsObjectLocations(target.ownerId, target.projectId, target.oid)[0]);
const legacyKey = (target: LfsIntegrityRow): string =>
  keyOf(lfsObjectLocations(target.ownerId, target.projectId, target.oid)[1]);

/** A store answering HEADs from a map of key to what it reports. */
const fakeStore = (held: ReadonlyMap<string, Partial<HeadBlobResult>>) => ({
  headBlob: vi.fn(async (args: HeadBlobArgs): Promise<HeadBlobResult | undefined> => {
    const stored = held.get(`${args.namespace}/${args.key}`);
    if (stored === undefined) {
      return undefined;
    }
    if (stored.etag === 'boom') {
      throw new Error('store unavailable');
    }
    return { contentType: 'application/octet-stream', size: 3, etag: 'e', cacheControl: '', ...stored };
  }),
});

async function* pagesOf(...pages: Array<readonly LfsIntegrityRow[]>): AsyncGenerator<readonly LfsIntegrityRow[]> {
  yield* pages;
}

describe('inspectLfsObject', () => {
  const equal = row('equal');
  const absent = row('absent');
  const composite = row('composite');
  const different = row('different');
  const legacy = row('legacy');
  const missing = row('missing');
  const store = fakeStore(
    new Map<string, Partial<HeadBlobResult>>([
      [tenantKey(equal), { checksumSha256: base64Of(equal.oid) }],
      [tenantKey(absent), {}],
      [tenantKey(composite), { checksumComposite: true }],
      [tenantKey(different), { checksumSha256: base64Of(oidOf('other bytes')), size: 11 }],
      [legacyKey(legacy), {}],
    ]),
  );

  it('should ask the store for the checksum at the tenant key', async () => {
    await inspectLfsObject(store, equal);

    expect(store.headBlob).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: 'tenants', key: tenantKey(equal).slice('tenants/'.length), checksum: true }),
    );
  });

  it('should tell the four tenant outcomes apart', async () => {
    await expect(inspectLfsObject(store, equal)).resolves.toEqual({ outcome: 'equal' });
    await expect(inspectLfsObject(store, absent)).resolves.toEqual({ outcome: 'absent' });
    await expect(inspectLfsObject(store, composite)).resolves.toEqual({ outcome: 'composite' });
    await expect(inspectLfsObject(store, different)).resolves.toEqual({
      outcome: 'different',
      sizeMismatch: {
        event: 'revisions_maintenance.lfs_integrity_size_mismatch',
        ownerId: 'owner-a',
        projectId: 'project-a',
        oid: different.oid,
        key: tenantKey(different),
        outcome: 'different',
        size: 3,
        storedSize: 11,
      },
      difference: {
        event: 'revisions_maintenance.lfs_integrity_different',
        ownerId: 'owner-a',
        projectId: 'project-a',
        oid: different.oid,
        key: tenantKey(different),
        storedSha256: oidOf('other bytes'),
        size: 3,
        storedSize: 11,
      },
    });
  });

  it('should fall back to the legacy key only when the tenant key is empty', async () => {
    await expect(inspectLfsObject(store, legacy)).resolves.toEqual({ outcome: 'legacy' });
    await expect(inspectLfsObject(store, missing)).resolves.toEqual({ outcome: 'missing' });
  });

  it('should tell an unfinished upload from lost bytes when neither key holds the object', async () => {
    await expect(inspectLfsObject(store, row('missing', 3, false))).resolves.toEqual({ outcome: 'unfinalized' });
    await expect(inspectLfsObject(store, row('missing', 3, true))).resolves.toEqual({ outcome: 'missing' });
  });
});

describe('parseLfsIntegrityConcurrency', () => {
  it('should default and bound the HEADs in flight', () => {
    expect(parseLfsIntegrityConcurrency(undefined)).toBe(lfsIntegrityConcurrency.default);
    expect(parseLfsIntegrityConcurrency('32')).toBe(32);
    expect(() => parseLfsIntegrityConcurrency('33')).toThrow(RangeError);
    expect(() => parseLfsIntegrityConcurrency('0')).toThrow(RangeError);
  });
});

describe('inventoryLfsIntegrity', () => {
  it('should count every object, list each different, size-mismatched and failed one and end with the summary', async () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map((content) => row(content));
    const [equal, absent, composite, different, failing] = rows as [
      LfsIntegrityRow,
      LfsIntegrityRow,
      LfsIntegrityRow,
      LfsIntegrityRow,
      LfsIntegrityRow,
    ];
    const store = fakeStore(
      new Map<string, Partial<HeadBlobResult>>([
        [tenantKey(equal), { checksumSha256: base64Of(equal.oid) }],
        [tenantKey(absent), { size: 4 }],
        [tenantKey(composite), { checksumComposite: true }],
        [tenantKey(different), { checksumSha256: base64Of(equal.oid) }],
        [tenantKey(failing), { etag: 'boom' }],
      ]),
    );
    const { lines, report } = collect();

    const summary = await inventoryLfsIntegrity(
      {
        pages: pagesOf(rows.slice(0, 2), rows.slice(2), [row('lost'), row('pending', 3, false)]),
        storage: store,
        exclusions: async () => ({ skippedOtherAccount: 2, deletedProjectRows: 5 }),
      },
      { concurrency: 2, progressEvery: 3, report },
    );

    expect(summary).toEqual({
      event: 'revisions_maintenance.lfs_integrity',
      scope: 'reservation rows of active projects in this storage account; no bucket listing',
      interrupted: false,
      objects: 7,
      tenant: { equal: 1, absent: 1, composite: 1, different: 1 },
      legacy: 0,
      unfinalized: 1,
      missing: 1,
      sizeMismatch: 1,
      errors: 1,
      skippedOtherAccount: 2,
      deletedProjectRows: 5,
    });
    const linesOf = (event: string) => lines.filter((line) => line['event'] === `revisions_maintenance.${event}`);
    expect(linesOf('lfs_integrity_different')).toEqual([
      expect.objectContaining({ oid: different.oid, projectId: 'project-a', ownerId: 'owner-a' }),
    ]);
    expect(linesOf('lfs_integrity_size_mismatch')).toEqual([
      expect.objectContaining({ oid: absent.oid, outcome: 'absent', size: 3, storedSize: 4 }),
    ]);
    expect(linesOf('lfs_integrity_error')).toEqual([
      {
        event: 'revisions_maintenance.lfs_integrity_error',
        ownerId: 'owner-a',
        projectId: 'project-a',
        oid: failing.oid,
        error: 'store unavailable',
      },
    ]);
    expect(linesOf('lfs_integrity_progress')).toHaveLength(2);
    expect(lines.at(-1)).toEqual(summary);
  });

  it('should check the stop signal before each row and say it was interrupted', async () => {
    const stop = new AbortController();
    const store = {
      headBlob: vi.fn(async () => {
        stop.abort();
        return undefined;
      }),
    };
    const { lines, report } = collect();

    const summary = await inventoryLfsIntegrity(
      {
        pages: pagesOf([row('one'), row('two'), row('three')], [row('four')]),
        storage: store,
        exclusions: noExclusions,
      },
      { concurrency: 1, report, signal: stop.signal },
    );

    // The first row's HEADs finish; no later row of the same page starts.
    expect(summary).toMatchObject({ interrupted: true, objects: 1, missing: 1 });
    expect(store.headBlob).toHaveBeenCalledTimes(2);
    expect(lines).toHaveLength(1);
  });

  it('should count an object once and stop every worker when its line cannot be written', async () => {
    const rows = ['a', 'b', 'c', 'd'].map((content) => row(content));
    const store = fakeStore(
      new Map<string, Partial<HeadBlobResult>>(
        rows.map((each) => [tenantKey(each), { checksumSha256: base64Of(oidOf('x')) }]),
      ),
    );
    const inspected: string[] = [];
    store.headBlob.mockImplementation(async (args: HeadBlobArgs) => {
      inspected.push(args.key);
      await new Promise((resolve) => {
        setTimeout(resolve, args.key.endsWith(rows[1]!.oid) ? 10 : 0);
      });
      return { contentType: '', size: 3, etag: 'e', cacheControl: '', checksumSha256: base64Of(oidOf('x')) };
    });
    const report = vi.fn(async (_line: string): Promise<void> => {
      throw new Error('stdout closed');
    });
    const exclusions = vi.fn(noExclusions);

    await expect(
      inventoryLfsIntegrity({ pages: pagesOf(rows), storage: store, exclusions }, { concurrency: 2, report }),
    ).rejects.toThrow('stdout closed');

    // Row a's line failed; row b was in flight and settled; c and d never started; no summary.
    expect(inspected).toHaveLength(2);
    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.calls.every(([line]) => !String(line).includes('"errors"'))).toBe(true);
    expect(exclusions).not.toHaveBeenCalled();
  });
});
