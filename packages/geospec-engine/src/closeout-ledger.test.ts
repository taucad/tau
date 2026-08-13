// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ledgerPath = resolve(import.meta.dirname, '../verification/wave1-closeout-ledger.json');
const repoRoot = resolve(import.meta.dirname, '../../..');
const v8Root = resolve(repoRoot, 'libs/tau-examples/src/kernels/replicad/v8-engine-rev2');
const statuses = new Set(['MET', 'NOT_MET', 'OPERATOR_AMENDED']);

const filesBelow = (root: string): string[] =>
  readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });

type Ledger = {
  schemaVersion: number;
  codeReadiness: string;
  publishReadiness: string;
  wave2Entry: string;
  publicationOnlyRows: string[];
  adoptedDecisions: Array<{ id: string; evidence: string[] }>;
  rows: Array<{ id: string; phase: string; requirement: string; status: string; evidence: string[] }>;
};

describe('Wave-1 closeout ledger', () => {
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) as Ledger;

  it('uses only the ratified statuses and unique stable row ids', () => {
    expect(ledger.schemaVersion).toBe(1);
    expect(statuses.has(ledger.codeReadiness)).toBe(true);
    expect(statuses.has(ledger.publishReadiness)).toBe(true);
    expect(statuses.has(ledger.wave2Entry)).toBe(true);
    expect(new Set(ledger.rows.map((row) => row.id)).size).toBe(ledger.rows.length);
    expect(ledger.rows.every((row) => ['PE0', 'PE1', 'PE2', 'PE3'].includes(row.phase))).toBe(true);
    expect(ledger.rows.every((row) => statuses.has(row.status))).toBe(true);
  });

  it('references every adopted closeout decision exactly once', () => {
    expect(ledger.adoptedDecisions.map(({ id }) => id)).toStrictEqual([
      'OQ1',
      'OQ2',
      'OQ3',
      'OQ4',
      'OQ5',
      'OQ6',
      'OQ7',
      'OQ8',
      'OQ9',
    ]);
    expect(ledger.adoptedDecisions.every(({ evidence }) => evidence.length > 0)).toBe(true);
  });

  it('requires evidence for every claimed MET or OPERATOR_AMENDED row', () => {
    const claimed = ledger.rows.filter((row) => row.status !== 'NOT_MET');
    expect(claimed.every((row) => row.evidence.length > 0)).toBe(true);
  });

  it('cannot open Wave 2 while any mandatory row is NOT_MET', () => {
    expect(ledger.publicationOnlyRows).toStrictEqual(['PE3.r19-counsel']);
    expect(ledger.publicationOnlyRows.every((id) => ledger.rows.some((row) => row.id === id))).toBe(true);
    const mandatoryRows = ledger.rows.filter((row) => !ledger.publicationOnlyRows.includes(row.id));
    if (ledger.codeReadiness === 'MET') {
      expect(mandatoryRows.every((row) => row.status !== 'NOT_MET')).toBe(true);
    }
    if (ledger.wave2Entry === 'MET') {
      expect(ledger.codeReadiness).toBe('MET');
      expect(mandatoryRows.every((row) => row.status !== 'NOT_MET')).toBe(true);
    }
  });

  it('keeps publication separate from code readiness while counsel is open', () => {
    const counsel = ledger.rows.find((row) => row.id === 'PE3.r19-counsel');
    expect(counsel).toBeDefined();
    if (counsel?.status === 'NOT_MET') {
      expect(ledger.publishReadiness).toBe('NOT_MET');
    }
    if (ledger.publishReadiness === 'MET') {
      expect(ledger.codeReadiness).toBe('MET');
      expect(ledger.rows.every((row) => row.status !== 'NOT_MET')).toBe(true);
    }
  });

  it('keeps every OA1-retired matcher and option absent from executable source', () => {
    const retired = [
      `toHave${'Chamfer'}DistanceTo`,
      `toHave${'Hausdorff'}DistanceTo`,
      `toHave${'Minimum'}DistanceTo`,
      `min${'Contact'}Area`,
    ];
    const roots = [
      resolve(repoRoot, 'apps/api/app/api/chat/prompts'),
      resolve(repoRoot, 'libs/api-extractor/src/generated/geospec'),
      resolve(repoRoot, 'libs/chat/src'),
      resolve(repoRoot, 'packages/geospec/src'),
      resolve(repoRoot, 'packages/geospec-engine/src'),
      resolve(repoRoot, 'packages/geospec-engine/native/opencascade'),
      v8Root,
    ];
    const offenders = roots.flatMap((root) =>
      filesBelow(root)
        .filter((path) => /\.(?:[cm]?[jt]s|tsx|json|ya?ml|cpp|h)$/u.test(path))
        .filter((path) => path !== import.meta.filename && !path.endsWith('.test.ts'))
        .filter((path) => retired.some((name) => readFileSync(path, 'utf8').includes(name))),
    );
    expect(offenders).toStrictEqual([]);
  });

  it('keeps removed requirements only in the explicit OA1 deferral registry', () => {
    const retiredRequirements = ['038', '044', '087', '088', '111'].map((id) => `REQ-V8R2-${id}`);
    const activeSpecs = filesBelow(resolve(v8Root, 'geospec')).filter(
      (path) => path.endsWith('.geospec.ts') && !path.endsWith('deferred-frontiers.geospec.ts'),
    );
    expect(
      activeSpecs.filter((path) => retiredRequirements.some((id) => readFileSync(path, 'utf8').includes(id))),
    ).toStrictEqual([]);
    expect(existsSync(resolve(v8Root, 'test-exports/service-access.ts'))).toBe(false);
  });

  it('allows no skipped or todo rows in the Wave-1 corpus', () => {
    const corpus = filesBelow(resolve(v8Root, 'geospec')).filter((path) => path.endsWith('.geospec.ts'));
    const forbidden = /\b(?:describe|it)\.(?:skip|todo)\s*\(/u;
    expect(corpus.filter((path) => forbidden.test(readFileSync(path, 'utf8')))).toStrictEqual([]);
  });

  it('pins the Wave-1 corpus shape and canonical full-assembly STEP load', () => {
    const corpus = filesBelow(resolve(v8Root, 'geospec'))
      .filter((path) => path.endsWith('.geospec.ts'))
      .sort();
    expect(corpus.map((path) => basename(path))).toStrictEqual([
      'census.geospec.ts',
      'deferred-frontiers.geospec.ts',
      'dfm-structure.geospec.ts',
      'fits.geospec.ts',
      'flow-paths.geospec.ts',
      'pin-retention.geospec.ts',
      'sealing.geospec.ts',
      'split-lines-fasteners.geospec.ts',
      'valvetrain-drive.geospec.ts',
    ]);
    expect(
      corpus.reduce((count, path) => count + (readFileSync(path, 'utf8').match(/\bit\s*\(/gu)?.length ?? 0), 0),
    ).toBe(105);

    const modelSuites = corpus.filter((path) => !path.endsWith('deferred-frontiers.geospec.ts'));
    expect(
      modelSuites.filter((path) => !readFileSync(path, 'utf8').includes('loadModel(assemblyStepLoadOptions)')),
    ).toStrictEqual([]);
    expect(
      modelSuites.filter((path) =>
        /loadModel\s*\(\s*\{\s*file:\s*testExports\.assembly,\s*format:\s*['"]step['"]/u.test(
          readFileSync(path, 'utf8'),
        ),
      ),
    ).toStrictEqual([]);
    expect(
      readFileSync(resolve(v8Root, 'geospec/flow-paths.geospec.ts'), 'utf8').match(/\.toHaveVoidContinuity\(/gu),
    ).toHaveLength(1);
    expect(existsSync(resolve(v8Root, 'test-exports/sub-assembly.ts'))).toBe(false);

    const snapshots = filesBelow(resolve(repoRoot, 'packages/geospec-engine/src/step/__evidence-snapshots__'));
    expect(snapshots).toHaveLength(44);
  });
});
