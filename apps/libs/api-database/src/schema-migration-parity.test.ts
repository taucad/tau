import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { describe, expect, it } from 'vitest';
import * as schema from '#schema/index.js';

/**
 * Schema/migration parity guard. `drizzle-kit generate` diffs the Drizzle
 * schema against the newest snapshot in `migrations/meta`; this test runs the
 * same diff in-process and requires it to be empty. A change that edits a
 * table without a migration, or a refactor that moves or splits the schema and
 * loses a table, column, index or constraint, fails here instead of producing
 * a surprise migration later.
 */

const migrationsDirectory = join(import.meta.dirname, 'migrations');

type Journal = { entries: Array<{ idx: number; tag: string }> };
type Snapshot = { id: string } & Record<string, unknown>;

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

describe('database schema', () => {
  it('should match the newest migration snapshot exactly', async () => {
    const journal = readJson(join(migrationsDirectory, 'meta/_journal.json')) as Journal;
    const newest = journal.entries.at(-1);
    if (!newest) {
      throw new Error('The migration journal has no entries');
    }
    const snapshotFile = `${String(newest.idx).padStart(4, '0')}_snapshot.json`;
    const previous = readJson(join(migrationsDirectory, 'meta', snapshotFile)) as Snapshot;

    const current: unknown = generateDrizzleJson(schema as Record<string, unknown>, previous.id);

    await expect(generateMigration(previous, current)).resolves.toEqual([]);
  });
});
