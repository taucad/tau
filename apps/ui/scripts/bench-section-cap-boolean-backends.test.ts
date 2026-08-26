// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildSectionCapBooleanBenchmarkReport } from '#scripts/bench-section-cap-boolean-backends.mts';

let cacheDirectory: string | undefined;

afterEach(async () => {
  if (cacheDirectory) {
    await rm(cacheDirectory, { recursive: true, force: true });
    cacheDirectory = undefined;
  }
});

describe('bench-section-cap-boolean-backends', () => {
  it('should emit backend timing summaries and parity metadata for a saved slice fixture', async () => {
    cacheDirectory = await mkdtemp(join(tmpdir(), 'tau-section-cap-bench-'));
    await writeFile(
      join(cacheDirectory, 'fixture.json'),
      JSON.stringify({
        sliceKey: 'synthetic-overlap',
        sources: [
          {
            sourceKey: 'a',
            ownerKey: 'a',
            multiPolygon: [
              [
                [
                  [0, 0],
                  [2, 0],
                  [2, 2],
                  [0, 2],
                ],
              ],
            ],
          },
          {
            sourceKey: 'b',
            ownerKey: 'b',
            multiPolygon: [
              [
                [
                  [1, 1],
                  [3, 1],
                  [3, 3],
                  [1, 3],
                ],
              ],
            ],
          },
        ],
      }),
    );

    const report = await buildSectionCapBooleanBenchmarkReport({
      cacheDirectory,
      iterations: 1,
    });

    expect(report.selectedSlice).toMatchObject({
      sliceKey: 'synthetic-overlap',
      sourceCount: 2,
      sourcePairCount: 1,
      pointCount: 8,
    });
    expect(report.summaries.map((summary) => summary.backend)).toEqual([
      'polygon-clipping',
      'clipper2-ts',
      'clipper2-wasm',
    ]);
    for (const summary of report.summaries) {
      expect(summary.timings.p50).toEqual(expect.any(Number));
      expect(summary.positiveAreaPairCount).toBe(1);
      expect(summary.renderedOverlapArea).toBeCloseTo(1, 6);
    }
    expect(report.parity.failures).toEqual([]);
    expect(report.styleSweep).toEqual({
      topologyWorkerRequestCount: 0,
    });
  });
});
