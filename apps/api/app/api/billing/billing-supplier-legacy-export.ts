/* oxlint-disable no-await-in-loop -- legacy tables are read, written and deleted in a fixed order inside one transaction */
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type postgres from 'postgres';
import { z } from 'zod';
import { financialEnvironmentSchema } from '@taucad/billing';
import type { FinancialEnvironment } from '#api/billing/billing-policy.js';

/**
 * The supplier-side rows the settle-on-usage model retired, in export order.
 *
 * `deleteOrder` is set on the rows `--delete` removes; the order satisfies the foreign keys
 * (holds name budgets, budgets name their funding). Supplier evidence is exported only: its
 * table is dropped whole by a later migration. A pause row is automatic when it names the
 * operation that tripped it; operator pauses name none and are never touched here.
 */
const legacyTables = [
  {
    table: 'billing_budget_funding',
    where: `environment = $1 AND kind IN ('spend', 'risk')`,
    deleteOrder: 3,
  },
  {
    table: 'billing_budget',
    where: `environment = $1 AND kind IN ('spend', 'risk')`,
    deleteOrder: 2,
  },
  {
    table: 'billing_budget_hold',
    where: `budget_id IN (SELECT id FROM billing.billing_budget WHERE environment = $1 AND kind IN ('spend', 'risk'))`,
    deleteOrder: 1,
  },
  {
    table: 'billing_route_pause',
    where: `environment = $1 AND operation_id IS NOT NULL AND resumed_at IS NOT NULL`,
    deleteOrder: 4,
  },
  { table: 'supplier_cost_evidence', where: `environment = $1`, deleteOrder: undefined },
] as const;

type LegacyTableName = (typeof legacyTables)[number]['table'];

/** One table's rows as text, in the column order of the live schema; `null` is SQL NULL. */
export type LegacyTableRows = {
  readonly table: LegacyTableName;
  readonly columns: readonly string[];
  // oxlint-disable-next-line typescript/no-restricted-types -- SQL NULL, kept distinct from an empty string in the CSV
  readonly rows: ReadonlyArray<ReadonlyArray<string | null>>;
};

/** Reads and removes the legacy rows; the database half of the export, replaceable in unit tests. */
export type SupplierLegacyStore = {
  /** Every legacy table from one consistent snapshot. */
  readonly read: () => Promise<readonly LegacyTableRows[]>;
  /**
   * In one transaction: re-reads the tables `--delete` removes, lets `verify` refuse them, then
   * deletes exactly those rows and returns the deleted count per table.
   */
  readonly delete: (verify: (tables: readonly LegacyTableRows[]) => void) => Promise<Record<string, number>>;
};

const manifestFile = 'manifest.json';
const deletionFile = 'deletion.json';

const manifestSchema = z
  .object({
    version: z.literal('supplier-legacy-export-v1'),
    environment: financialEnvironmentSchema,
    exportedAt: z.iso.datetime(),
    files: z.array(
      z
        .object({
          table: z.enum(legacyTables.map(({ table }) => table)),
          file: z.string().regex(/^[a-z_]+\.csv$/u),
          rows: z.number().int().nonnegative(),
          sha256: z.string().regex(/^[0-9a-f]{64}$/u),
        })
        .strict(),
    ),
  })
  .strict();

export type SupplierLegacyManifest = z.infer<typeof manifestSchema>;

export type SupplierLegacyArguments = {
  readonly environment: FinancialEnvironment;
  readonly outDirectory: string;
  readonly delete: boolean;
};

const usage = 'Usage: export-supplier-legacy --environment ENVIRONMENT --out DIRECTORY [--delete]';

/** Parses `export-supplier-legacy`; `--out` resolves against the working directory the operator ran it from. */
export const parseSupplierLegacyArguments = (argv: readonly string[]): SupplierLegacyArguments => {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      environment: { type: 'string' },
      out: { type: 'string' },
      delete: { type: 'boolean' },
    },
  });
  if (positionals.length !== 1 || positionals[0] !== 'export-supplier-legacy' || !values.environment || !values.out) {
    throw new Error(usage);
  }
  return {
    environment: financialEnvironmentSchema.parse(values.environment),
    outDirectory: resolve(values.out),
    delete: values.delete === true,
  };
};

// oxlint-disable-next-line typescript/no-restricted-types -- SQL NULL, kept distinct from an empty string
const csvField = (value: string | null): string => {
  if (value === null) {
    return '';
  }
  // An empty string is quoted so it stays distinct from NULL.
  return value === '' || /[",\r\n]/u.test(value) || value.trim() !== value ? `"${value.replaceAll('"', '""')}"` : value;
};

/** RFC 4180 CSV with a header row; NULL is an empty field and an empty string is `""`. */
export const toCsv = (table: Pick<LegacyTableRows, 'columns' | 'rows'>): string =>
  [table.columns, ...table.rows].map((row) => row.map((value) => csvField(value)).join(',')).join('\n') + '\n';

const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex');

const fileOf = (table: LegacyTableName): string => `${table}.csv`;

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
};

/**
 * Writes one CSV per legacy table and then `manifest.json` with each file's row count and SHA-256.
 *
 * The manifest is written last, so its presence marks a complete export. A directory that
 * already holds one is refused: an export is evidence and is never overwritten.
 */
export const exportSupplierLegacy = async (input: {
  readonly store: Pick<SupplierLegacyStore, 'read'>;
  readonly environment: FinancialEnvironment;
  readonly outDirectory: string;
  readonly now: Date;
}): Promise<SupplierLegacyManifest> => {
  if (await exists(join(input.outDirectory, manifestFile))) {
    throw new Error(`${input.outDirectory} already holds an export manifest; export into a new directory`);
  }
  const tables = await input.store.read();
  await mkdir(input.outDirectory, { recursive: true });
  const files: Array<SupplierLegacyManifest['files'][number]> = [];
  for (const table of tables) {
    const content = toCsv(table);
    await writeFile(join(input.outDirectory, fileOf(table.table)), content, { flag: 'wx' });
    files.push({ table: table.table, file: fileOf(table.table), rows: table.rows.length, sha256: sha256(content) });
  }
  const manifest = manifestSchema.parse({
    version: 'supplier-legacy-export-v1',
    environment: input.environment,
    exportedAt: input.now.toISOString(),
    files,
  });
  await writeFile(join(input.outDirectory, manifestFile), `${JSON.stringify(manifest, undefined, 2)}\n`, {
    flag: 'wx',
  });
  return manifest;
};

/**
 * Deletes the exported spend/risk budget rows, their holds and the resolved automatic pauses.
 *
 * Refused unless the export's manifest exists for this environment, its files still hash to the
 * manifest, and the rows about to be deleted are exactly the rows that were exported; the
 * deletion is one transaction and its counts are recorded beside the manifest.
 */
export const deleteSupplierLegacy = async (input: {
  readonly store: Pick<SupplierLegacyStore, 'delete'>;
  readonly environment: FinancialEnvironment;
  readonly outDirectory: string;
  readonly now: Date;
}): Promise<{ readonly deleted: Record<string, number>; readonly manifestSha256: string }> => {
  const manifestPath = join(input.outDirectory, manifestFile);
  if (!(await exists(manifestPath))) {
    throw new Error(`--delete requires ${manifestPath} from a completed export-supplier-legacy run`);
  }
  if (await exists(join(input.outDirectory, deletionFile))) {
    throw new Error(`${input.outDirectory} already records a deletion`);
  }
  const manifestContent = await readFile(manifestPath, 'utf8');
  const manifest = manifestSchema.parse(JSON.parse(manifestContent));
  if (manifest.environment !== input.environment) {
    throw new Error(`Export manifest is for ${manifest.environment}, not ${input.environment}`);
  }
  const deletedTables = legacyTables.filter(({ deleteOrder }) => deleteOrder !== undefined).map(({ table }) => table);
  const expected = new Map(manifest.files.map((file) => [file.table, file]));
  for (const table of legacyTables) {
    const file = expected.get(table.table);
    if (file === undefined) {
      throw new Error(`Export manifest has no ${table.table} file`);
    }
    const content = await readFile(join(input.outDirectory, file.file), 'utf8');
    if (sha256(content) !== file.sha256) {
      throw new Error(`${file.file} no longer matches the export manifest`);
    }
  }
  const deleted = await input.store.delete((tables) => {
    for (const table of tables) {
      if (sha256(toCsv(table)) !== expected.get(table.table)?.sha256) {
        throw new Error(`${table.table} changed since the export; export again before deleting`);
      }
    }
    if (tables.length !== deletedTables.length) {
      throw new Error('Deletion read a different set of tables than the export');
    }
  });
  const record = {
    version: 'supplier-legacy-deletion-v1',
    environment: input.environment,
    deletedAt: input.now.toISOString(),
    manifestSha256: sha256(manifestContent),
    deleted,
  };
  await writeFile(join(input.outDirectory, deletionFile), `${JSON.stringify(record, undefined, 2)}\n`, { flag: 'wx' });
  return { deleted, manifestSha256: record.manifestSha256 };
};

const quoteIdentifier = (name: string): string => `"${name.replaceAll('"', '""')}"`;

/* Text output of timestamps depends on the session; the digest must not. */
const pinTextOutput = async (transaction: postgres.TransactionSql): Promise<void> => {
  await transaction`SET LOCAL TimeZone = 'UTC'`;
  await transaction`SET LOCAL DateStyle = 'ISO, YMD'`;
  await transaction`SET LOCAL IntervalStyle = 'iso_8601'`;
};

const readTable = async (
  transaction: postgres.TransactionSql,
  spec: (typeof legacyTables)[number],
  environment: FinancialEnvironment,
): Promise<LegacyTableRows> => {
  const columns = await transaction<Array<{ name: string }>>`
    SELECT column_name AS name FROM information_schema.columns
    WHERE table_schema = 'billing' AND table_name = ${spec.table}
    ORDER BY ordinal_position`;
  if (columns.length === 0) {
    throw new Error(`billing.${spec.table} does not exist`);
  }
  const names = columns.map(({ name }) => name);
  const select = names.map((name) => `${quoteIdentifier(name)}::text AS ${quoteIdentifier(name)}`).join(', ');
  const rows = await transaction
    .unsafe(`SELECT ${select} FROM billing.${spec.table} WHERE ${spec.where} ORDER BY id`, [environment])
    .values();
  return {
    table: spec.table,
    columns: names,
    rows: rows.map((row) => row.map((value) => (value === null ? null : String(value)))),
  };
};

/** The owner-identity store: a repeatable-read snapshot for the export, one transaction for the delete. */
export const createSupplierLegacyStore = (
  sql: postgres.Sql,
  environment: FinancialEnvironment,
): SupplierLegacyStore => ({
  read: async () =>
    sql.begin('isolation level repeatable read read only', async (transaction) => {
      await pinTextOutput(transaction);
      const tables: LegacyTableRows[] = [];
      for (const spec of legacyTables) {
        tables.push(await readTable(transaction, spec, environment));
      }
      return tables;
    }),
  /* Repeatable read: the delete sees the snapshot it verified, so a row written after the
   * snapshot is neither verified nor deleted, and a concurrent change to a verified row fails
   * the transaction instead of deleting something the export never saw. */
  delete: async (verify) =>
    sql.begin('isolation level repeatable read', async (transaction) => {
      await pinTextOutput(transaction);
      const removed = legacyTables
        .filter((spec) => spec.deleteOrder !== undefined)
        .toSorted((left, right) => left.deleteOrder - right.deleteOrder);
      const verified: Array<{ readonly spec: (typeof removed)[number]; readonly rows: LegacyTableRows }> = [];
      for (const spec of removed) {
        verified.push({ spec, rows: await readTable(transaction, spec, environment) });
      }
      verify(verified.map(({ rows }) => rows));
      const deleted: Record<string, number> = {};
      for (const { spec, rows } of verified) {
        const result = await transaction.unsafe(`DELETE FROM billing.${spec.table} WHERE ${spec.where}`, [environment]);
        if (result.count !== rows.rows.length) {
          throw new Error(`billing.${spec.table} deleted ${result.count} rows, expected ${rows.rows.length}`);
        }
        deleted[spec.table] = result.count;
      }
      return deleted;
    }),
});
