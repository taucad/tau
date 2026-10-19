import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  contractBreaks,
  findMeshLoadsFeedingBrepMatchers,
  geoSpecContractExamples,
} from '#scripts/geospec-contracts.js';

const kernelsDirectory = join(dirname(fileURLToPath(import.meta.url)), '../src/kernels');

describe('findMeshLoadsFeedingBrepMatchers', () => {
  it('names each mesh load that feeds an exact-BRep matcher, once per load', () => {
    const source = [
      "const m = await loadModel({ file: 'main.ts' });",
      'expectGeo(m).toHaveBoundingBox({});',
      'expectGeo(m).toHaveAssemblyOccurrences({});',
      'expectGeo(m).toHaveNoComponentInterference({});',
      "expectGeo(await loadModel({ file: 'main.ts', format: 'glb' })).not.toHaveCircularHole({});",
    ].join('\n');

    expect(findMeshLoadsFeedingBrepMatchers('suite.geospec.ts', source)).toStrictEqual([
      "suite.geospec.ts:1 loadModel feeds toHaveAssemblyOccurrences() without format: 'step'",
      "suite.geospec.ts:5 loadModel feeds toHaveCircularHole() without format: 'step'",
    ]);
  });

  it('accepts STEP loads, mesh matchers on mesh loads and nested block bindings', () => {
    const source = [
      "it('a', async () => {",
      "  const m = await loadModel({ file: 'main.ts' });",
      '  expectGeo(m).toBeWatertight();',
      '  for (const angle of [5, 10]) {',
      "    const m = await loadModel({ file: 'main.ts', format: 'step', parameters: { angle } });",
      '    expectGeo(m).toHaveNoComponentInterference({});',
      '  }',
      "  expectGeo(await loadModel({ file: 'main.ts', format: 'stp' })).toBeValidBrep();",
      '});',
    ].join('\n');

    expect(findMeshLoadsFeedingBrepMatchers('suite.geospec.ts', source)).toStrictEqual([]);
  });

  it('refuses a subject it cannot trace to a loadModel call', () => {
    const source = 'expectGeo(await helper()).toHaveCylindricalFace({});';

    expect(findMeshLoadsFeedingBrepMatchers('suite.geospec.ts', source)).toStrictEqual([
      'suite.geospec.ts:1 toHaveCylindricalFace() subject is not traceable to a loadModel call',
    ]);
  });
});

describe('contractBreaks', () => {
  const contract = { example: 'kernel/example', undecided: { limited: 'GEOSPEC_ANALYSIS_LIMIT' } };
  const row = (name: string, status: string, codes: string[] = []) => ({
    file: 'main.geospec.ts',
    suite: ['Suite'],
    name,
    status,
    codes,
  });

  it('accepts passed rows and pinned rows refused by their pinned code', () => {
    expect(
      contractBreaks(contract, [
        row('bounds', 'passed'),
        row('limited', 'inconclusive', ['GEOSPEC_ANALYSIS_LIMIT', 'GEOSPEC_ANALYSIS_LIMIT']),
      ]),
    ).toStrictEqual([]);
  });

  it('names each unpinned undecided row, each pin that changed reason or passed, and each missing pin', () => {
    expect(
      contractBreaks(contract, [row('occurrences', 'inconclusive', ['GEOSPEC_EVIDENCE_UNSUPPORTED'])]),
    ).toStrictEqual([
      'main.geospec.ts > Suite > occurrences: inconclusive (GEOSPEC_EVIDENCE_UNSUPPORTED)',
      'kernel/example: pinned row "limited" was not reported',
    ]);
    expect(contractBreaks(contract, [row('limited', 'inconclusive', ['MATCHER_TIMEOUT'])])).toStrictEqual([
      'main.geospec.ts > Suite > limited: inconclusive (MATCHER_TIMEOUT), pinned undecided by GEOSPEC_ANALYSIS_LIMIT',
    ]);
    expect(contractBreaks(contract, [row('limited', 'passed')])).toStrictEqual([
      'main.geospec.ts > Suite > limited: passed; remove its undecided pin (GEOSPEC_ANALYSIS_LIMIT)',
    ]);
  });
});

describe('GeoSpec contract examples', () => {
  it.each(geoSpecContractExamples.map(({ example }) => example))(
    '%s loads STEP for every matcher that needs exact BRep',
    (example) => {
      const directory = join(kernelsDirectory, example);
      const suites = readdirSync(directory, { recursive: true, encoding: 'utf8' })
        .filter((path) => path.endsWith('.geospec.ts'))
        .sort();

      expect(suites.length).toBeGreaterThan(0);
      const findings = suites.flatMap((suite) =>
        findMeshLoadsFeedingBrepMatchers(
          `libs/tau-examples/src/kernels/${example}/${suite}`,
          readFileSync(join(directory, suite), 'utf8'),
        ),
      );
      expect(findings).toStrictEqual([]);
    },
  );
});
