import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { digestAction, digestContent } from '@taucad/cache-core';
import type { ComputeAction } from '@taucad/cache-core';
import { describe, expect, it } from 'vitest';
import { _hotPathSql, createSqliteComputeEngine } from '#cache/sqlite-compute-engine.js';
import type { ComputeStoreEntry } from '#types/runtime-compute.types.js';

const makeEntry = async (operation: string, content: string): Promise<ComputeStoreEntry> => {
  const action: ComputeAction = {
    schemaVersion: 1,
    namespace: 'sqlite-budget',
    producer: { id: 'sqlite-budget-test', version: '1.0.0', implementationAssets: [] },
    operation,
    inputs: [],
    arguments: { operation },
    environment: {},
    codec: { id: 'raw', version: '1' },
  };
  const bytes = new TextEncoder().encode(content);
  return {
    action,
    actionDigest: await digestAction({ action }),
    contentDigest: await digestContent({ bytes }),
    mediaType: 'application/octet-stream',
    bytes,
    determinism: 'byte-exact',
  };
};

describe('SQLite compute read budget', () => {
  it('should leave an over-budget payload in SQLite while preserving hit, missing, poison, and budget outcomes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tau-sqlite-budget-'));
    const store = createSqliteComputeEngine({ directory });
    try {
      const session = await store.engine.open({ workspace: 'budget-test' });
      try {
        const small = await makeEntry('small', 'seven!!');
        const large = await makeEntry('large', 'nine!!!!!');
        const absent = await makeEntry('absent', '?');
        await session.put({ entries: [small, large], generation: session.generation, durability: 'disposable' });

        const result = await session.get({
          digests: [small.actionDigest, large.actionDigest, absent.actionDigest],
          maxEntries: 2,
          maxBytes: 8,
          generation: session.generation,
        });
        expect(result).toMatchObject({
          status: 'ok',
          entries: [{ actionDigest: small.actionDigest, bytes: small.bytes }],
          omitted: [
            { digest: large.actionDigest, reason: 'budget' },
            { digest: absent.actionDigest, reason: 'missing' },
          ],
        });

        const directoryEntries = await readdir(directory);
        const files = directoryEntries.filter((name) => name.endsWith('.sqlite'));
        expect(files).toHaveLength(1);
        const db = new DatabaseSync(join(directory, files[0]!));
        try {
          const row = db.prepare(_hotPathSql.getRecord).get(8, large.actionDigest, session.generation);
          expect(row?.['bytes']).toBeNull();
          expect(row?.['byte_length']).toBe(large.bytes.byteLength);
        } finally {
          db.close();
        }

        const conflict = await makeEntry('small', 'changed');
        expect(conflict.actionDigest).toBe(small.actionDigest);
        await session.put({ entries: [conflict], generation: session.generation, durability: 'disposable' });
        const poisoned = await session.get({
          digests: [small.actionDigest],
          maxEntries: 1,
          maxBytes: 8,
          generation: session.generation,
        });
        expect(poisoned).toMatchObject({
          status: 'ok',
          entries: [],
          omitted: [{ digest: small.actionDigest, reason: 'poisoned' }],
        });
      } finally {
        await session.close();
      }
    } finally {
      await store.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
