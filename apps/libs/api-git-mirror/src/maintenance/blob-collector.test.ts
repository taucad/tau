import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { DatabaseType } from '@taucad/api-database';
import type { ObjectStorageService } from '@taucad/api-object-storage';
import { collectZeroCountBlobs, maxCollectedBlobsWithoutConfirmation } from '#maintenance/blob-collector.js';

/**
 * R11: the per-run bound on the zero-count collector. The fence itself (row
 * locks against a racing publisher, both tiers swept inside the transaction) is
 * proved against PostgreSQL and MinIO by `apps/api/app/api/git/maintenance/blob-collector.test.ts`;
 * this suite proves only the decision taken before anything is deleted, so the
 * database is a fake that holds `count` zero-count rows and deletes what it is asked.
 */

const zeroCountRows = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    sha256: index.toString(16).padStart(64, '0'),
    sizeBytes: 8n,
    refcount: 0,
  }));

const fakeCollector = (count: number, batch: number) => {
  const rows = zeroCountRows(count);
  const findMany = vi.fn(async ({ limit }: { limit: number }) => rows.slice(0, limit));
  // The conditional delete returns every planned row, as it does when no publisher races the pass.
  const returning = vi.fn(async () => rows.slice(0, batch));
  const transaction = vi.fn(async (run: (transaction: unknown) => Promise<unknown>) =>
    run({ delete: () => ({ where: () => ({ returning }) }) }),
  );
  const database = { query: { blobRef: { findMany } }, transaction } as unknown as DatabaseType;
  const driver = mock<ObjectStorageService>();
  driver.deleteBlobs.mockImplementation(async ({ keys }) => ({ deleted: keys.length }));
  const lines: string[] = [];
  const report = (line: string): void => {
    lines.push(line);
  };

  return { database, driver, transaction, lines, report };
};

describe('zero-count blob collector bound', () => {
  it('should collect a backlog at or under the bound without confirmation', async () => {
    const { database, driver, report } = fakeCollector(5, 10);

    const result = await collectZeroCountBlobs({ database, driver, report, batchSize: 10, blobBound: 5 });

    expect(result.refused).toBe(false);
    expect(result.collected).toHaveLength(5);
    expect(driver.deleteBlobs).toHaveBeenCalledTimes(2);
  });

  it('should delete nothing above the bound without confirmation', async () => {
    const { database, driver, transaction, lines, report } = fakeCollector(6, 10);

    const result = await collectZeroCountBlobs({ database, driver, report, batchSize: 10, blobBound: 5 });

    expect(result).toMatchObject({ refused: true, collected: [], bytes: 0 });
    expect(transaction).not.toHaveBeenCalled();
    expect(driver.deleteBlobs).not.toHaveBeenCalled();
    expect(lines.at(-1)).toMatch(/refusing blob collection: more than 5 .*--confirm/u);
  });

  it('should refuse above the bound even when the bound is larger than one batch would show', async () => {
    const { database, driver, transaction, report } = fakeCollector(6, 2);

    const result = await collectZeroCountBlobs({ database, driver, report, batchSize: 2, blobBound: 5 });

    expect(result.refused).toBe(true);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('should collect above the bound when the operator confirms, still one batch at a time', async () => {
    const { database, driver, report } = fakeCollector(6, 4);

    const result = await collectZeroCountBlobs({
      database,
      driver,
      report,
      batchSize: 4,
      blobBound: 5,
      confirm: true,
    });

    expect(result.refused).toBe(false);
    expect(result.collected).toHaveLength(4);
    expect(driver.deleteBlobs).toHaveBeenCalledTimes(2);
  });

  it('should plan above the bound under a dry run without deleting', async () => {
    const { database, driver, transaction, report } = fakeCollector(6, 10);

    const result = await collectZeroCountBlobs({ database, driver, report, batchSize: 10, blobBound: 5, dryRun: true });

    expect(result).toMatchObject({ refused: false, collected: [] });
    expect(result.planned).toHaveLength(6);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('should bound an unconfirmed pass by default', () => {
    expect(maxCollectedBlobsWithoutConfirmation).toBe(500);
  });
});
