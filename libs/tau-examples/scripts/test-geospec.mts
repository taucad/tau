/**
 * Runs every contract example suite (`geospec-contracts.ts`) through an installed
 * `geospec` CLI and holds each row to its contract: every row passes, or stays
 * undecided for exactly its pinned reason.
 *
 * The CLI comes from a consumer directory holding `@taucad/geospec-engine` in its
 * `node_modules`: by default the workspace build's consumer that
 * `scripts:prepare-geospec-test-consumer` prepares (its receipt names it).
 *
 * Usage:
 *   pnpm nx run tau-examples:test-geospec
 *   tsx scripts/test-geospec.mts --consumer <directory>   (any other installed consumer)
 *
 * Exit codes:
 *   0  Every contract example kept its contract.
 *   1  A row broke its contract, a run produced no report, or the consumer is missing.
 */

import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs, promisify } from 'node:util';
import { contractBreaks, geoSpecContractExamples } from '#scripts/geospec-contracts.js';
import type { GeoSpecReportRow } from '#scripts/geospec-contracts.js';

type GeoSpecRunReport = {
  readonly files?: ReadonlyArray<{
    readonly file: string;
    readonly tests?: ReadonlyArray<{
      readonly suite: readonly string[];
      readonly name: string;
      readonly status: string;
      readonly diagnostics?: ReadonlyArray<{ readonly code?: unknown }>;
    }>;
  }>;
};

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, '../../..');
const kernelsDirectory = resolve(import.meta.dirname, '../src/kernels');
const receiptPath = join(repositoryRoot, 'out/artifacts/geospec-test-consumer/receipt.json');

const { values } = parseArgs({ options: { consumer: { type: 'string' } } });
const consumerRoot =
  values.consumer === undefined
    ? (JSON.parse(readFileSync(receiptPath, 'utf8')) as { consumerRoot: string }).consumerRoot
    : resolve(values.consumer);
const cli = join(consumerRoot, 'node_modules/@taucad/geospec-engine/dist/cli/main.mjs');
if (!existsSync(cli)) {
  console.error(`No installed geospec CLI at ${cli}`);
  process.exit(1);
}

const run = async (directory: string): Promise<GeoSpecRunReport> => {
  const arguments_ = [cli, 'run', directory, '--test-timeout', '300000', '--workers', '1', '--json'];
  try {
    const { stdout } = await execFileAsync(process.execPath, arguments_, { maxBuffer: 128 * 1024 * 1024 });
    return JSON.parse(stdout) as GeoSpecRunReport;
  } catch (error) {
    // The exit code is the verdict, so an undecided run exits 1 with its report on stdout.
    const { stdout, stderr } = error as { stdout?: string; stderr?: string };
    if (stdout) {
      return JSON.parse(stdout) as GeoSpecRunReport;
    }
    throw new Error(`geospec run ${directory} produced no report:\n${stderr ?? String(error)}`);
  }
};

let broken = 0;
for (const contract of geoSpecContractExamples) {
  const startedAt = performance.now();
  // oxlint-disable-next-line eslint/no-await-in-loop -- Suites run serially; each CLI run owns one worker pool.
  const report = await run(join(kernelsDirectory, contract.example));
  const rows: GeoSpecReportRow[] = (report.files ?? []).flatMap(({ file, tests }) =>
    (tests ?? []).map(({ suite, name, status, diagnostics }) => ({
      file: `libs/tau-examples/src/kernels/${contract.example}/${file}`,
      suite,
      name,
      status,
      codes: (diagnostics ?? []).flatMap(({ code }) => (typeof code === 'string' ? [code] : [])),
    })),
  );
  const breaks = contractBreaks(contract, rows);
  const passed = rows.filter(({ status }) => status === 'passed').length;
  const seconds = Math.round((performance.now() - startedAt) / 1000);
  console.log(
    `${contract.example}: ${passed} passed, ${rows.length - passed} undecided of ${rows.length}, ${breaks.length} contract break(s) in ${seconds} s`,
  );
  for (const line of breaks) {
    console.error(`  ${line}`);
  }
  broken += breaks.length;
}
process.exitCode = broken === 0 ? 0 : 1;
