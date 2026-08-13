#!/usr/bin/env node
/**
 * Write or verify the exact GeoSpec v2 Wave-1 per-test parity ledger.
 *
 * Durations are deliberately absent: the ledger freezes identifiers, verdicts
 * and diagnostic keys; wall time is measured separately and never decides a
 * geometry verdict.
 *
 * Usage:
 *   node packages/geospec-engine/scripts/wave1-parity.mts --write <report.json>
 *   node packages/geospec-engine/scripts/wave1-parity.mts --verify <report.json>
 *
 * Exit codes:
 *   0  Ledger written or report matches it exactly.
 *   1  Invalid input, unexpected corpus shape, or parity mismatch.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';

export type Diagnostic = { code?: unknown };
export type ReportTest = {
  suite: string[];
  name: string;
  status: string;
  diagnostics?: Diagnostic[];
};
export type ReportFile = {
  file: string;
  durationMs?: number;
  tests?: ReportTest[];
  issues?: unknown[];
};
export type RunReport = { passed: number; failed: number; files: ReportFile[] };
export type LedgerRow = {
  id: string;
  file: string;
  suite: string[];
  name: string;
  status: 'passed' | 'failed';
  diagnosticKeys: string[];
};
type InputManifest = {
  sourceRevision: string;
  categories: Record<string, { rootSha256: string }>;
};
type ParityLedger = {
  schemaVersion: 2;
  ledgerVersion: string;
  basis: string;
  inputs: {
    sourceRevision: string;
    inputManifest: string;
    inputManifestSha256: string;
    corpusRootSha256: string;
    runtimeKernelInputsRootSha256: string;
    referenceEngineRootSha256: string;
    nativeArtifactsRootSha256: string;
  };
  expected: { files: 9; tests: 105; passed: number; failed: number };
  operatorAmendments: Array<{
    id: 'OA1';
    disposition: 'deferred';
    requirementIds: string[];
  }>;
  rows: LedgerRow[];
};

const repoRoot = resolve(import.meta.dirname, '../../..');
const verificationRoot = resolve(repoRoot, 'packages/geospec-engine/verification');
const inputManifestPath = resolve(verificationRoot, 'wave1-input-manifest-v2.json');
const ledgerPath = resolve(verificationRoot, 'wave1-parity-ledger.json');
const inputManifest = 'packages/geospec-engine/verification/wave1-input-manifest-v2.json';

type Wave1JsonDocument = InputManifest | ParityLedger | RunReport;

const readJson = <Value extends Wave1JsonDocument>(path: string): Value =>
  JSON.parse(readFileSync(path, 'utf8')) as Value;

const canonicalRows = (rows: readonly LedgerRow[]): LedgerRow[] =>
  [...rows].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

/** Project a CLI report onto the immutable parity contract. */
export const wave1ParityRows = (report: RunReport): LedgerRow[] => {
  if (report.files.length !== 9) {
    throw new Error(`Expected exactly 9 GeoSpec files, received ${report.files.length}.`);
  }
  const rows = report.files.flatMap((file) => {
    if (!file.tests) {
      throw new Error(`${file.file}: report contains issues instead of executed tests.`);
    }
    return file.tests.map((test): LedgerRow => {
      if (test.status !== 'passed' && test.status !== 'failed') {
        throw new Error(`${file.file}: '${test.name}' has forbidden status '${test.status}'.`);
      }
      const diagnosticKeys = [
        ...new Set(
          (test.diagnostics ?? []).map((diagnostic) => {
            if (typeof diagnostic.code !== 'string') {
              throw new TypeError(`${file.file}: '${test.name}' emitted a diagnostic without a string code.`);
            }
            return diagnostic.code;
          }),
        ),
      ].sort();
      if (test.status === 'passed' && diagnosticKeys.length > 0) {
        throw new Error(`${file.file}: passed test '${test.name}' emitted failure diagnostics.`);
      }
      return {
        id: `${file.file}::${[...test.suite, test.name].join(' > ')}`,
        file: file.file,
        suite: test.suite,
        name: test.name,
        status: test.status,
        diagnosticKeys,
      };
    });
  });
  if (rows.length !== 105) {
    throw new Error(`Expected exactly 105 GeoSpec tests, received ${rows.length}.`);
  }
  if (new Set(rows.map((row) => row.id)).size !== rows.length) {
    throw new Error('Wave-1 parity identifiers must be unique.');
  }
  return canonicalRows(rows);
};

const assertAggregates = (report: RunReport, rows: readonly LedgerRow[]): void => {
  const passed = rows.filter((row) => row.status === 'passed').length;
  const failed = rows.length - passed;
  if (report.passed !== passed || report.failed !== failed) {
    throw new Error(
      `Report aggregates ${report.passed}/${report.failed} do not match the exact rows ${passed}/${failed}.`,
    );
  }
};

const createLedger = (report: RunReport): ParityLedger => {
  const rows = wave1ParityRows(report);
  assertAggregates(report, rows);
  const passed = rows.filter((row) => row.status === 'passed').length;
  const inputs = readJson<InputManifest>(inputManifestPath);
  const category = (name: string): string => {
    const root = inputs.categories[name]?.rootSha256;
    if (!root) {
      throw new Error(`Frozen input manifest has no '${name}' category.`);
    }
    return root;
  };
  return {
    schemaVersion: 2,
    ledgerVersion: 'wave1-2026-08-12.2',
    basis:
      'Exact per-test reference on version-2 frozen inputs after the ratified OA1/OQ1/OQ2/OQ5/OQ6/C0/C1/C3/C5 deltas',
    inputs: {
      sourceRevision: inputs.sourceRevision,
      inputManifest,
      inputManifestSha256: createHash('sha256').update(readFileSync(inputManifestPath)).digest('hex'),
      corpusRootSha256: category('corpus'),
      runtimeKernelInputsRootSha256: category('runtimeKernelInputs'),
      referenceEngineRootSha256: category('referenceEngine'),
      nativeArtifactsRootSha256: category('nativeArtifacts'),
    },
    expected: { files: 9, tests: 105, passed, failed: rows.length - passed },
    operatorAmendments: [
      {
        id: 'OA1',
        disposition: 'deferred',
        requirementIds: ['REQ-V8R2-038', 'REQ-V8R2-044', 'REQ-V8R2-087', 'REQ-V8R2-088', 'REQ-V8R2-111'],
      },
    ],
    rows,
  };
};

const verifyLedger = (report: RunReport): void => {
  const actual = createLedger(report);
  const expected = readJson<ParityLedger>(ledgerPath);
  const canonicalExpected = { ...expected, rows: canonicalRows(expected.rows) };
  if (JSON.stringify(actual) !== JSON.stringify(canonicalExpected)) {
    const first = actual.rows.findIndex(
      (row, index) => JSON.stringify(row) !== JSON.stringify(canonicalExpected.rows[index]),
    );
    throw new Error(
      first === -1
        ? 'Wave-1 parity metadata does not match the committed ledger.'
        : `Wave-1 parity diverged at row ${first}: expected ${JSON.stringify(canonicalExpected.rows[first])}, received ${JSON.stringify(actual.rows[first])}.`,
    );
  }
};

const main = (): void => {
  const [mode, reportArgument] = process.argv.slice(2);
  if ((mode !== '--write' && mode !== '--verify') || reportArgument === undefined) {
    throw new Error('Usage: wave1-parity.mts --write <report.json> | --verify <report.json>');
  }
  const report = readJson<RunReport>(resolve(reportArgument));
  if (mode === '--write') {
    if (existsSync(ledgerPath)) {
      throw new Error('wave1-parity-ledger.json already exists; remove it explicitly before recapturing.');
    }
    writeFileSync(ledgerPath, `${JSON.stringify(createLedger(report), undefined, 2)}\n`);
    process.stdout.write('✓ wrote exact 9-file / 105-test Wave-1 parity ledger\n');
    return;
  }
  verifyLedger(report);
  process.stdout.write('✓ Wave-1 report matches all 105 parity rows exactly\n');
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
