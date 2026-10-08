import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  parseFocusArguments,
  parseProduct,
  phaseWindows,
  planFocusCells,
  renderFocusSummary,
  summarizeFocusRows,
} from '#experiments/performance-lab/performance-lab-focus.js';
import type { FocusCall, FocusRow } from '#experiments/performance-lab/performance-lab-focus.js';

const packageRoot = resolve(import.meta.dirname, '../../../geospec-engine-native');
const sample = (at: number, user: number, system = 0) => ({ at, cpu: { user, system } });
const call = (method: string, start: number, end?: number): FocusCall => ({
  method,
  start: sample(start, start * 10),
  ...(end === undefined ? {} : { end: sample(end, end * 10) }),
});
const host = { loadAverage: 24, loadPerCpu: 2, freeMemoryMiB: 128 };
const row = (
  product: string,
  family: FocusRow['family'],
  evidence: { sha256?: string; status?: string; exit?: number },
): FocusRow => ({
  sequence: 0,
  round: 1,
  product,
  family,
  engine: family === 'native' ? 'native-desktop' : 'combined-wasm',
  caseId: 'case',
  hostBefore: host,
  hostAfter: host,
  contended: true,
  processWall: 1000,
  exit: { code: evidence.exit ?? 0, signal: null },
  threads: { max: 12, samples: 3, pollInterval: 250 },
  report: {
    node: 'v24',
    pid: 1,
    maxRssBytes: 64 * 1024 * 1024,
    timing: { startup: 10, admission: 400, evaluation: 50, cleanup: 5, total: 470 },
    admission: null,
    perCase: [0, 1].map((repeat) => ({
      caseId: 'case',
      repeat,
      status: evidence.status ?? 'passed',
      expectedStatus: 'unverified',
      numericProfile: null,
      evaluation: repeat === 0 ? 40 : 10,
      diagnosticCodes: [],
      result: evidence.sha256 === undefined ? null : { bytes: 2, sha256: evidence.sha256, base64: 'e30=' },
    })),
  },
  stdoutTail: '',
  stderrTail: '',
});

void describe('performance-lab focus benchmark', () => {
  void it('should fill installed product defaults and refuse relative, foreign or mixed ST/MT fields', () => {
    assert.deepStrictEqual(parseProduct('engine=native'), {
      family: 'native',
      engine: 'native-desktop',
      addon: resolve(packageRoot, 'bindings/node/generated/geospec-engine-native.darwin-arm64.node'),
    });
    assert.deepStrictEqual(parseProduct('engine=native,addon=/lane/a.node,permits=4,label=lane'), {
      family: 'native',
      engine: 'native-desktop',
      label: 'lane',
      permits: 4,
      addon: '/lane/a.node',
    });
    assert.deepStrictEqual(parseProduct('engine=wasm,binary=/lane/a.wasm'), {
      family: 'wasm',
      engine: 'combined-wasm',
      binary: '/lane/a.wasm',
      glue: resolve(packageRoot, 'bindings/emscripten/generated/geospec_engine_native.mjs'),
    });
    assert.deepStrictEqual(parseProduct('engine=wasm,receipt=/lane/geospec_engine_native.mt.json,permits=2'), {
      family: 'wasm',
      engine: 'combined-wasm',
      permits: 2,
      receipt: '/lane/geospec_engine_native.mt.json',
    });
    for (const text of [
      'engine=gpu',
      'engine=native,addon=lane.node',
      'engine=native,permits=0',
      'engine=legacy',
      'engine=wasm,permits=2',
      'engine=wasm,receipt=/lane/geospec_engine_native.mt.json',
      'engine=wasm,receipt=/lane/geospec_engine_native.mt.json,permits=2,binary=/lane/a.wasm',
    ]) {
      assert.throws(() => parseProduct(text), Error, text);
    }
  });

  void it('should default to the nine focus cases, installed native/ST WASM and the unchanged guard', () => {
    const options = parseFocusArguments(['--output-dir=out/reports/benchmarks/focus']);
    assert.equal(options.caseIds.length, 9);
    assert.ok(options.caseIds.includes('exploratory-many-occurrences-4096-step'));
    assert.ok(options.caseIds.includes('exploratory-planetary-gearbox-step'));
    assert.deepStrictEqual(
      options.products.map(({ family }) => family),
      ['native', 'wasm'],
    );
    assert.deepStrictEqual(
      [options.samples, options.repeats, options.maxLoadPerCpu, options.minFreeMemoryMiB, options.contendedHost],
      [5, 2, 1, 1024, false],
    );
    assert.equal(
      parseFocusArguments(['--output-dir=out/x', '--contended-host', '--case=m3-query-analyzeBrep']).contendedHost,
      true,
    );
    assert.throws(() => parseFocusArguments(['--output-dir=out/x', '--case=not-a-case']), /Unknown or repeated/);
    assert.throws(() => parseFocusArguments(['--output-dir=out/x', '--repeats=0']), /repeats 1-20/);
  });

  void it('should keep each case adjacent while rotating product order across rounds', () => {
    const cells = planFocusCells(['a', 'b'], ['x', 'y', 'z'], 3);
    assert.equal(cells.length, 18);
    for (const round of [1, 2, 3]) {
      const pairs = cells.filter((cell) => cell.round === round).map(({ caseId, product }) => `${caseId}${product}`);
      assert.deepStrictEqual(pairs.toSorted(), ['ax', 'ay', 'az', 'bx', 'by', 'bz']);
    }
    assert.deepStrictEqual(
      [1, 2, 3].map((round) => cells.find((cell) => cell.round === round && cell.caseId === 'a')?.product),
      ['x', 'y', 'z'],
    );
    const paired = planFocusCells(['a'], ['old', 'new'], 2).map(({ product }) => product);
    assert.deepStrictEqual(paired, ['old', 'new', 'new', 'old']);
  });

  void it('should window CPU at traced call boundaries and split evaluation only per whole repeat', () => {
    const calls = [
      call('new Engine', 1, 2),
      call('ingestSubject', 3, 7),
      call('subjectHandle', 7, 8),
      call('canonicalPlan', 9, 10),
      call('evaluatePlan', 10, 13),
      call('canonicalPlan', 14, 15),
      call('evaluatePlan', 15, 16),
      call('releaseSubject', 17, 18),
      call('close', 18, 19),
    ];
    const phases = phaseWindows(calls, { start: sample(0, 0), end: sample(20, 200) }, 2);
    assert.deepStrictEqual(phases.startup, { wall: 2, userMicros: 20, systemMicros: 0 });
    assert.deepStrictEqual(phases.admission, { wall: 5, userMicros: 50, systemMicros: 0 });
    assert.deepStrictEqual(phases.evaluation, { wall: 7, userMicros: 70, systemMicros: 0 });
    assert.deepStrictEqual(phases.evaluationByRepeat, [
      { wall: 4, userMicros: 40, systemMicros: 0 },
      { wall: 2, userMicros: 20, systemMicros: 0 },
    ]);
    assert.deepStrictEqual(phases.cleanup, { wall: 3, userMicros: 30, systemMicros: 0 });
    assert.equal(
      phaseWindows(calls.slice(0, 6), { start: sample(0, 0), end: sample(20, 200) }, 2).evaluationByRepeat,
      null,
    );
    assert.equal(
      phaseWindows([call('ingestSubject', 3)], { start: sample(0, 0), end: sample(4, 40) }, 1).admission,
      null,
    );
  });

  void it('should require identical bytes within an engine family and compare families by status only', () => {
    const exact = summarizeFocusRows([
      row('native-a', 'native', { sha256: 'a'.repeat(64) }),
      row('native-b', 'native', { sha256: 'a'.repeat(64) }),
      row('wasm', 'wasm', { sha256: 'b'.repeat(64) }),
      row('native-c', 'native', { sha256: 'c'.repeat(64), exit: 1 }),
    ]);
    assert.equal(exact.counts.failures, 1);
    assert.equal(exact.counts.sameFamilyMismatches, 0);
    assert.equal(exact.counts.unverifiedExpectations, 6);
    assert.equal(exact.counts.unsupported, 0);
    assert.equal(exact.parity[0]?.crossFamilyStatusAgreement, true);
    assert.deepStrictEqual(
      exact.parity[0].families.map(({ family, observations, exact: same }) => [family, observations, same]),
      [
        ['native', 4, true],
        ['wasm', 2, true],
      ],
    );
    const group = exact.groups.find(({ product }) => product === 'native-a');
    assert.deepStrictEqual([group?.wall.firstClaim?.median, group?.wall.repeatClaim?.median], [40, 10]);
    assert.equal(group?.wall.harness?.median, 530);
    const drift = summarizeFocusRows([
      row('native-a', 'native', { sha256: 'a'.repeat(64) }),
      row('native-b', 'native', { sha256: 'd'.repeat(64), status: 'failed' }),
    ]);
    assert.equal(drift.counts.sameFamilyMismatches, 1);
    assert.equal(drift.parity[0]?.families[0]?.exact, false);
    assert.match(
      renderFocusSummary(drift),
      /\| case \| native \| native-a, native-b \| 4 \| passed\/failed \|.*\| \*\*NO\*\* \|/,
    );
  });
});
