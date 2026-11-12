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
 * STO-17's existing-object inventory: what the store reports for each
 * tenant-key LFS object, against its `oid`. The store is a fake keyed by
 * location; nothing here writes.
 */

const oidOf = (content: string): string => createHash('sha256').update(content).digest('hex');
const base64Of = (hex: string): string => Buffer.from(hex, 'hex').toString('base64');

const row = (content: string, size = 3): LfsIntegrityRow => ({
  ownerId: 'owner-a',
  projectId: 'project-a',
  oid: oidOf(content),
  size,
});

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
    await expect(inspectLfsObject(store, equal)).resolves.toEqual({ outcome: 'equal', sizeMismatch: false });
    await expect(inspectLfsObject(store, absent)).resolves.toEqual({ outcome: 'absent', sizeMismatch: false });
    await expect(inspectLfsObject(store, composite)).resolves.toEqual({ outcome: 'composite', sizeMismatch: false });
    await expect(inspectLfsObject(store, different)).resolves.toEqual({
      outcome: 'different',
      sizeMismatch: true,
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
    await expect(inspectLfsObject(store, legacy)).resolves.toEqual({ outcome: 'legacy', sizeMismatch: false });
    await expect(inspectLfsObject(store, missing)).resolves.toEqual({ outcome: 'missing', sizeMismatch: false });
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
  it('should count every object, list each different one and end with the summary', async () => {
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
    const lines: Array<Record<string, unknown>> = [];

    const summary = await inventoryLfsIntegrity(
      { pages: pagesOf(rows.slice(0, 2), rows.slice(2), [row('legacy-free')]), storage: store },
      {
        concurrency: 2,
        progressEvery: 3,
        report: async (line) => {
          lines.push(JSON.parse(line) as Record<string, unknown>);
        },
      },
    );

    expect(summary).toEqual({
      event: 'revisions_maintenance.lfs_integrity',
      interrupted: false,
      objects: 6,
      tenant: { equal: 1, absent: 1, composite: 1, different: 1 },
      legacy: 0,
      missing: 1,
      sizeMismatch: 1,
      errors: 1,
    });
    expect(lines.filter((line) => line['event'] === 'revisions_maintenance.lfs_integrity_different')).toEqual([
      expect.objectContaining({ oid: different.oid, projectId: 'project-a', ownerId: 'owner-a' }),
    ]);
    expect(lines.filter((line) => line['event'] === 'revisions_maintenance.lfs_integrity_progress')).toHaveLength(2);
    expect(lines.at(-1)).toEqual(summary);
  });

  it('should stop between pages on the signal and say so', async () => {
    const stop = new AbortController();
    const store = {
      headBlob: vi.fn(async () => {
        stop.abort();
        return undefined;
      }),
    };

    const lines: string[] = [];

    const summary = await inventoryLfsIntegrity(
      { pages: pagesOf([row('one')], [row('two')]), storage: store },
      {
        concurrency: 1,
        report: async (line) => {
          lines.push(line);
        },
        signal: stop.signal,
      },
    );

    expect(summary).toMatchObject({ interrupted: true, objects: 1, missing: 1 });
    expect(lines).toHaveLength(1);
  });
});
