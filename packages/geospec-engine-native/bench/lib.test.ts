/* oxlint-disable unicorn/numeric-separators-style -- Exact retained floating-point fixtures use source grouping that exposes reconstruction boundaries. */
import {
  campaignSchedule,
  campaignStatistics,
  campaignInputGaps,
  reportPlantNs,
  validateCampaignObservation,
} from '#bench/campaign';
import type { CampaignCase, ProductCampaign } from '#bench/campaign';
import { appendHostObservationCopies, observeHostCopy } from '#host-types.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aggregateObservationWork,
  observationWork,
  analyzeControls,
  compareProductReports,
  evaluationCompleted,
  decodeMesh,
  observePublicConsumerResult,
  projectLegacyBoundingBox,
  shuffled,
  verifyBroadFixtures,
  xorshift32,
} from '#bench/lib';
import type { EngineObservation, ControlObservation, ProductBenchmarkConfig } from '#bench/lib';

await test('should leave the early harness without a broad receipt when optional inputs are absent', async () => {
  assert.equal(await verifyBroadFixtures(), undefined);
});

await test('observes the first actionable report only after the public consumer promise resolves', async () => {
  const events: string[] = [];
  let resolveConsumer: ((report: { status: string }) => void) | undefined;
  const consumer = new Promise<{ status: string }>((resolve) => {
    resolveConsumer = resolve;
  });
  const observation = observePublicConsumerResult({
    consume: async () => consumer,
    acknowledge: ({ status }) => {
      events.push(`first-report:${status}`);
    },
  });
  events.push('engine-evaluate-returned');
  await Promise.resolve();
  assert.deepEqual(events, ['engine-evaluate-returned']);
  resolveConsumer?.({ status: 'passed' });
  await observation;
  events.push('cleanup');
  assert.deepEqual(events, ['engine-evaluate-returned', 'first-report:passed', 'cleanup']);
});

await test('detects a planted delay while accepting a stable A/A control', () => {
  const observations: ControlObservation[] = [];
  for (let sample = 0; sample < 8; sample += 1) {
    for (const [arm, duration] of [
      ['native-a', 100],
      ['native-b', 100],
      ['native-delay', 120],
    ] as const) {
      observations.push({
        workload: 'mesh',
        measured: true,
        sample,
        arm,
        phases: { endToEndRawNs: duration },
        outputSha256: 'same',
      });
    }
  }
  const decisions = analyzeControls({
    observations,
    sampling: { seed: 7, samples: 8, bootstrapResamples: 200, alpha: 0.01, noiseBand: [0.95, 1.05] },
  });
  assert.equal(decisions.find(({ axis }) => axis === 'native-aa')?.classification, 'noise-characterized');
  assert.equal(decisions.find(({ axis }) => axis === 'planted-delay')?.classification, 'detected');
});

await test('decodes the frozen GSM1 layout and shuffles deterministically', () => {
  const mesh = decodeMesh(
    '47534d3103000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000f03f00000000000000000000000000000000000000000000f03f0000000000000000000000000100000002000000',
  );
  assert.deepEqual([...mesh.indices], [0, 1, 2]);
  assert.deepEqual(shuffled([1, 2, 3, 4], xorshift32(42)), shuffled([1, 2, 3, 4], xorshift32(42)));
});

await test('projects the frozen matcher formula while raw extrema stay available separately', () => {
  assert.deepEqual(
    projectLegacyBoundingBox({
      center: [576_460_752_303_423_500, 0.200_000_006_705_522_54, 0.050_000_000_745_058_06],
      size: [1_152_921_504_606_847_000, 0.200_000_010_430_812_84, 0.300_000_004_470_348_36],
      primitives: [
        {
          aabb: {
            min: [1, 0.100_000_001_490_116_12, -0.100_000_001_490_116_12],
            max: [1_152_921_504_606_847_000, 0.300_000_011_920_928_96, 0.200_000_002_980_232_24],
          },
        },
      ],
    }),
    {
      center: [576_460_752_303_423_500, 0.200_000_006_705_522_54, 0.050_000_000_745_058_06],
      min: [0, 0.100_000_001_490_116_12, -0.100_000_001_490_116_12],
      max: [1_152_921_504_606_847_000, 0.300_000_011_920_928_96, 0.200_000_002_980_232_24],
      size: [1_152_921_504_606_847_000, 0.200_000_010_430_812_84, 0.300_000_004_470_348_36],
    },
  );
});

await test('should distinguish completed false geometry assertions from an incomplete workload', () => {
  const results = [
    { status: 'passed', evidence: { positiveSatisfied: true } },
    { status: 'failed', evidence: { positiveSatisfied: false } },
  ];
  assert.equal(evaluationCompleted(results, 2), true);
  assert.equal(evaluationCompleted(results, 3), false);
  const reports = results.map((result, index) => ({ claimId: `claim-${index}`, result }));
  assert.equal(compareProductReports(reports, structuredClone(reports)), true);
  assert.equal(compareProductReports(reports, [...reports].reverse()), false);
  assert.equal(compareProductReports(reports, reports.slice(0, 1)), false);
  assert.equal(results[1]?.evidence.positiveSatisfied, false);
});

const campaignCase: CampaignCase = {
  id: 'box/cold/native-regression',
  workload: 'box',
  mode: 'cold-process',
  axis: 'native-base-vs-candidate',
  baseline: 'native-base',
  candidate: 'native-candidate',
  class: 'ordinary',
  metrics: ['firstActionableReportNs', 'suiteReportNs'],
  expected: {},
};

await test('should freeze 120 alternating product and A/A pairs without discarding cold samples', () => {
  const schedule = campaignSchedule([campaignCase]);
  assert.equal(schedule.length, 360);
  assert.equal(schedule.filter((block) => !block.measured).length, 0);
  for (const phase of ['aa-baseline', 'aa-candidate', 'product']) {
    const blocks = schedule.filter((block) => block.phase === phase);
    assert.equal(blocks.length, 120);
    assert.deepEqual(blocks[0]!.order, ['A', 'B']);
    assert.deepEqual(blocks[1]!.order, ['B', 'A']);
    assert.equal(blocks[119]!.pair, 119);
  }
  const product = schedule.filter((block) => block.phase === 'product');
  assert.ok(product.every((block) => block.plants.length === 0));
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Frozen AB/BA protocol arm names.
  assert.deepEqual(product[0]!.routes, { A: 'native-base', B: 'native-candidate' });
  const stats = campaignStatistics([campaignCase]);
  assert.equal(stats.familySize, 10);
  assert.equal(stats.caseAlpha, 0.001);
  assert.equal(stats.resamples, 1_000_000);
  const broadStats = campaignStatistics(Array.from({ length: 10 }, () => campaignCase));
  assert.equal(broadStats.familySize, 100);
  assert.equal(broadStats.resamples, 2_000_000);
  const descriptive = campaignStatistics([{ ...campaignCase, axis: 'reference-vs-native', class: 'microcase' }]);
  assert.equal(descriptive.productHypotheses, 0);
  assert.equal(descriptive.familySize, 8);
});

await test('should retain five warmup pairs only for steady modes and derive public plants from paired A', () => {
  const warm = campaignSchedule([{ ...campaignCase, mode: 'resident-warm' }]);
  assert.equal(warm.filter((block) => !block.measured).length, 15);
  assert.equal(warm.filter((block) => block.measured).length, 360);
  assert.equal(
    campaignSchedule([{ ...campaignCase, mode: 'persisted-warm' }]).filter((block) => !block.measured).length,
    0,
  );
  assert.equal(reportPlantNs(1_000_000), 8_000_000);
  assert.equal(reportPlantNs(100_000_000), 25_000_000);
});

await test('should preserve a valid failed assertion while requiring every complete expected field', () => {
  const reports = [
    { status: 'failed', claimId: 'strict-volume', result: { status: 'failed', value: 0.49999999999999994 } },
  ];
  const observation = {
    successful: true,
    firstReport: { cleanupStarted: false, report: { result: reports[0] } },
    firstActionableReportNs: 1,
    suiteReportNs: 2,
    result: {},
    suiteReports: reports,
    qualification: { evaluationCompleted: true, expectedMatches: true, overlapVerified: true },
  };
  assert.equal(validateCampaignObservation(observation, structuredClone(reports), 'legacy'), true);
  assert.equal(validateCampaignObservation(observation, [{ ...reports[0], status: 'passed' }], 'legacy'), false);
});

await test('should keep absent readiness and unsupported warm state explicit instead of silently measuring cold', () => {
  const config = {
    schemaVersion: 2,
    source: 'synthetic',
    workspaceRoot: '/',
    broadFixtures: { path: '/unused', sha256: 'unused' },
    routes: {},
    workloads: [{ id: 'box', kind: 'common-tetrahedron-bounds' }],
    repeats: 1,
    campaignGate: { provisional: true, releaseCampaign: false, reason: 'host-only' },
    toolchain: {},
  } satisfies ProductBenchmarkConfig;
  const campaign = {
    id: 'host-only',
    ready: false,
    frozenProducts: false,
    environment: { path: '/unused', sha256: 'unused' },
    freeze: [],
    seeds: [11, 22, 33, 44],
    cases: [{ ...campaignCase, mode: 'warm-engine-cold-subject' }],
    gates: {},
  } satisfies ProductCampaign;
  const gaps = campaignInputGaps(config, campaign);
  assert.ok(gaps.includes('campaign.ready is not explicitly true'));
  assert.ok(gaps.some((gap) => gap.includes('stateful contract')));
  assert.ok(gaps.some((gap) => gap.includes('complete expected reports')));
});

await test('observation deltas exclude prefill and aggregate exact compatible work', () => {
  const before: EngineObservation = {
    schema: 'geospec-engine-observations-v1',
    numericProfile: 'geospec-st-logical-requests-v3',
    scope: 'engine-methods',
    exact: true,
    unavailable: ['kernelInternalIterations'],
    logical: { chargedUnits: '9007199254740993', claims: '3', evaluations: '1' },
    physical: { parses: '1', overlapBuilds: '1' },
    copies: { inputCopies: '1', inputBytes: '128', outputCopies: '1', outputBytes: '256' },
  };
  const after = structuredClone(before);
  after.logical['chargedUnits'] = '18014398509481987';
  after.logical['claims'] = '6';
  after.logical['evaluations'] = '2';
  after.copies['outputCopies'] = '2';
  after.copies['outputBytes'] = '512';
  const original = JSON.stringify({ before, after });
  const delta = observationWork(before, after);
  assert.equal(delta['engineReportedConsumedWorkUnits'], '9007199254740994');
  assert.deepEqual((delta['observations'] as EngineObservation).physical, { parses: '0', overlapBuilds: '0' });
  const aggregate = aggregateObservationWork([delta, delta]);
  assert.equal(aggregate['engineReportedConsumedWorkUnits'], '18014398509481988');
  assert.equal((aggregate['observations'] as EngineObservation).copies['outputBytes'], '512');
  assert.equal(JSON.stringify({ before, after }), original);
  assert.equal(aggregateObservationWork([delta, undefined])['observations'], null);
});

await test('host copy observations count actual transfers and exclude repeated snapshots', () => {
  const copies = { exact: true, inputCopies: 0n, inputBytes: 0n, outputCopies: 0n, outputBytes: 0n };
  observeHostCopy(copies, 'input', 128);
  observeHostCopy(copies, 'output', 256);
  observeHostCopy(copies, 'output', 256);
  const snapshot = new TextEncoder().encode(
    JSON.stringify({
      schema: 'geospec-engine-observations-v1',
      exact: true,
      copies: { inputCopies: '0', inputBytes: '0', outputCopies: '0', outputBytes: '0' },
    }),
  );
  const first = appendHostObservationCopies(snapshot, copies);
  const second = appendHostObservationCopies(snapshot, copies);
  assert.deepEqual(first, second);
  assert.deepEqual(copies, { exact: true, inputCopies: 1n, inputBytes: 128n, outputCopies: 2n, outputBytes: 512n });
});
