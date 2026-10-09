import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteSupplierLegacy,
  exportSupplierLegacy,
  parseSupplierLegacyArguments,
  toCsv,
} from '#api/billing/billing-supplier-legacy-export.js';
import type { LegacyTableRows, SupplierLegacyStore } from '#api/billing/billing-supplier-legacy-export.js';

const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex');

const tables: LegacyTableRows[] = [
  { table: 'billing_budget_funding', columns: ['id', 'kind'], rows: [['funding-spend', 'spend']] },
  {
    table: 'billing_budget',
    columns: ['id', 'kind', 'approved_cap'],
    rows: [
      ['budget-risk', 'risk', '500000000000000'],
      ['budget-spend', 'spend', '500000000000000'],
    ],
  },
  { table: 'billing_budget_hold', columns: ['id', 'budget_id'], rows: [['hold-1', 'budget-spend']] },
  {
    table: 'billing_route_pause',
    columns: ['id', 'sku', 'reason', 'resumed_by'],
    rows: [['pause-1', 'model:sonnet', 'retail_overrun', 'migration-0049']],
  },
  {
    table: 'supplier_cost_evidence',
    columns: ['id', 'source_revision', 'numerator'],
    rows: [['evidence-1', 'provider_rejected_v1', '0']],
  },
];
const deletedTables = tables.filter(({ table }) => table !== 'supplier_cost_evidence');
const now = new Date('2026-10-09T08:00:00.000Z');

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tau-supplier-legacy-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const readStore = (): Pick<SupplierLegacyStore, 'read'> => ({ read: vi.fn(async () => tables) });

/** A delete store that hands `verify` the given current rows and reports what it would delete. */
const deleteStore = (current: readonly LegacyTableRows[] = deletedTables) => {
  const deleted = vi.fn(() => Object.fromEntries(current.map(({ table, rows }) => [table, rows.length])));
  const store = {
    delete: vi.fn<SupplierLegacyStore['delete']>(async (verify) => {
      verify(current);
      return deleted();
    }),
  };
  return { store, deleted };
};

const exported = async (): Promise<void> => {
  await exportSupplierLegacy({ store: readStore(), environment: 'staging', outDirectory: directory, now });
};

describe('supplier legacy export', () => {
  describe('toCsv', () => {
    it('should quote only fields that need it and keep NULL distinct from an empty string', () => {
      expect(
        toCsv({
          columns: ['id', 'evidence', 'note'],
          rows: [
            ['a', '{"reason": "retail_overrun", "fields": {}}', null],
            ['b', 'line one\nline two', ''],
            ['c', ' padded', 'plain'],
          ],
        }),
      ).toBe(
        'id,evidence,note\n' +
          'a,"{""reason"": ""retail_overrun"", ""fields"": {}}",\n' +
          'b,"line one\nline two",""\n' +
          'c," padded",plain\n',
      );
    });
  });

  describe('exportSupplierLegacy', () => {
    it('should write one CSV per table and a manifest with row counts and SHA-256 digests', async () => {
      const manifest = await exportSupplierLegacy({
        store: readStore(),
        environment: 'staging',
        outDirectory: directory,
        now,
      });

      const files = await readdir(directory);
      expect(files.toSorted()).toEqual([
        'billing_budget.csv',
        'billing_budget_funding.csv',
        'billing_budget_hold.csv',
        'billing_route_pause.csv',
        'manifest.json',
        'supplier_cost_evidence.csv',
      ]);
      expect(await readFile(join(directory, 'billing_budget.csv'), 'utf8')).toBe(
        'id,kind,approved_cap\nbudget-risk,risk,500000000000000\nbudget-spend,spend,500000000000000\n',
      );
      const written = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as unknown;
      expect(written).toEqual(manifest);
      expect(manifest).toMatchObject({
        version: 'supplier-legacy-export-v1',
        environment: 'staging',
        exportedAt: '2026-10-09T08:00:00.000Z',
      });
      for (const table of tables) {
        const file = `${table.table}.csv`;
        // oxlint-disable-next-line no-await-in-loop -- each file is hashed as written
        const content = await readFile(join(directory, file), 'utf8');
        expect(manifest.files).toContainEqual({
          table: table.table,
          file,
          rows: table.rows.length,
          sha256: sha256(content),
        });
      }
    });

    it('should refuse to overwrite a directory that already holds an export', async () => {
      await exported();
      const store = readStore();

      await expect(
        exportSupplierLegacy({ store, environment: 'staging', outDirectory: directory, now }),
      ).rejects.toThrow('already holds an export manifest');
      expect(store.read).not.toHaveBeenCalled();
    });
  });

  describe('deleteSupplierLegacy', () => {
    it('should refuse to delete without a manifest, before touching the database', async () => {
      const { store } = deleteStore();

      await expect(
        deleteSupplierLegacy({ store, environment: 'staging', outDirectory: directory, now }),
      ).rejects.toThrow(`--delete requires ${join(directory, 'manifest.json')}`);
      expect(store.delete).not.toHaveBeenCalled();
    });

    it('should refuse a manifest exported from another environment', async () => {
      await exported();
      const { store } = deleteStore();

      await expect(
        deleteSupplierLegacy({ store, environment: 'prod-eu', outDirectory: directory, now }),
      ).rejects.toThrow('Export manifest is for staging, not prod-eu');
      expect(store.delete).not.toHaveBeenCalled();
    });

    it('should refuse when an exported file no longer matches its digest', async () => {
      await exported();
      await writeFile(join(directory, 'billing_budget_hold.csv'), 'id,budget_id\n');
      const { store } = deleteStore();

      await expect(
        deleteSupplierLegacy({ store, environment: 'staging', outDirectory: directory, now }),
      ).rejects.toThrow('billing_budget_hold.csv no longer matches the export manifest');
      expect(store.delete).not.toHaveBeenCalled();
    });

    it('should refuse, deleting nothing, when the rows changed since the export', async () => {
      await exported();
      const drifted = deletedTables.map((table) =>
        table.table === 'billing_budget' ? { ...table, rows: [...table.rows, ['budget-late', 'spend', '1']] } : table,
      );
      const { store, deleted } = deleteStore(drifted);

      await expect(
        deleteSupplierLegacy({ store, environment: 'staging', outDirectory: directory, now }),
      ).rejects.toThrow('billing_budget changed since the export; export again before deleting');
      expect(deleted).not.toHaveBeenCalled();
      await expect(readFile(join(directory, 'deletion.json'))).rejects.toThrow('ENOENT');
    });

    it('should delete the exported rows and record the counts beside the manifest', async () => {
      await exported();
      const { store, deleted } = deleteStore();

      const result = await deleteSupplierLegacy({ store, environment: 'staging', outDirectory: directory, now });

      expect(deleted).toHaveBeenCalledOnce();
      const manifestSha256 = sha256(await readFile(join(directory, 'manifest.json'), 'utf8'));
      const counts = {
        billing_budget_funding: 1, // eslint-disable-line @typescript-eslint/naming-convention -- table name
        billing_budget: 2, // eslint-disable-line @typescript-eslint/naming-convention -- table name
        billing_budget_hold: 1, // eslint-disable-line @typescript-eslint/naming-convention -- table name
        billing_route_pause: 1, // eslint-disable-line @typescript-eslint/naming-convention -- table name
      };
      expect(result).toEqual({ deleted: counts, manifestSha256 });
      expect(JSON.parse(await readFile(join(directory, 'deletion.json'), 'utf8'))).toEqual({
        version: 'supplier-legacy-deletion-v1',
        environment: 'staging',
        deletedAt: '2026-10-09T08:00:00.000Z',
        manifestSha256,
        deleted: counts,
      });
      await expect(
        deleteSupplierLegacy({ store, environment: 'staging', outDirectory: directory, now }),
      ).rejects.toThrow('already records a deletion');
    });
  });

  describe('parseSupplierLegacyArguments', () => {
    it('should resolve the output directory and default to export only', () => {
      expect(
        parseSupplierLegacyArguments(['export-supplier-legacy', '--environment', 'staging', '--out', directory]),
      ).toEqual({ environment: 'staging', outDirectory: directory, delete: false });
      expect(
        parseSupplierLegacyArguments([
          'export-supplier-legacy',
          '--environment',
          'staging',
          '--out',
          directory,
          '--delete',
        ]),
      ).toEqual({ environment: 'staging', outDirectory: directory, delete: true });
    });

    it('should refuse a missing output directory and unknown options', () => {
      expect(() => parseSupplierLegacyArguments(['export-supplier-legacy', '--environment', 'staging'])).toThrow(
        'Usage: export-supplier-legacy --environment ENVIRONMENT --out DIRECTORY [--delete]',
      );
      expect(() =>
        parseSupplierLegacyArguments([
          'export-supplier-legacy',
          '--environment',
          'staging',
          '--out',
          directory,
          '--force',
        ]),
      ).toThrow("Unknown option '--force'");
    });
  });
});
