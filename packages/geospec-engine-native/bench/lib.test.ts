import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeControls,
  decodeMesh,
  projectLegacyBoundingBox,
  shuffled,
  verifyBroadFixtures,
  xorshift32,
} from '#bench/lib';
import type { ControlObservation } from '#bench/lib';

await test('should leave the early harness without a broad receipt when optional inputs are absent', async () => {
  assert.equal(await verifyBroadFixtures(), undefined);
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
