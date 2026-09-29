// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { replicadKernel } from '@taucad/replicad';
import { esbuildBundler } from '@taucad/esbuild';
import { defineRuntime } from '@taucad/runtime/worker';
import { assertSuccess, createTestRuntimeClient, extractGltfFromResult } from '@taucad/runtime-testing';
import {
  buildGltfComponentManifest,
  buildGltfMeasurementFeatures,
} from '#components/geometry/graphics/metadata/gltf-component-manifest.js';
import { evaluateExactOccurrenceDistance } from './measurement-exact.worker.js';
import type { ExactRequest } from './measurement-exact.worker.js';

vi.setConfig({ testTimeout: 120_000 });

const source = `
  import { makeBox } from 'replicad';
  export default function main() {
    return [
      { name: 'left', shape: makeBox([0, 5, 10], [10, 15, 20]) },
      { name: 'right', shape: makeBox([30, 5, 10], [40, 15, 20]) },
    ];
  }
`;

describe('displayed Replicad to retained AP242 correspondence', () => {
  it('queries exact whole-occurrence witnesses from the same rendered source', async () => {
    const runtime = defineRuntime({ kernels: [replicadKernel()], bundlers: [esbuildBundler()] });
    const client = createTestRuntimeClient({ runtime, files: { 'main.ts': source } });
    try {
      const rendered = await client.render({
        source: { path: 'main.ts' },
        // Match the viewer request: the selected Replicad route supplies its topology default.
        content: { includeEdges: true },
      });
      expect(rendered.superseded).toBe(false);
      if (rendered.superseded) {
        throw new Error('The fixture render was superseded.');
      }
      assertSuccess(rendered.geometry);
      const glb = extractGltfFromResult(rendered.geometry);
      expect(glb).toBeDefined();
      const manifest = buildGltfComponentManifest(glb!);
      expect(manifest.nodeOrder.map((id) => manifest.nodesById[id]?.name)).toEqual(
        expect.arrayContaining(['left', 'right']),
      );
      const left = manifest.nodeOrder.map((id) => manifest.nodesById[id]).find((node) => node?.name === 'left');
      const right = manifest.nodeOrder.map((id) => manifest.nodesById[id]).find((node) => node?.name === 'right');
      expect(left?.bounds?.max[0]).toBeCloseTo(0.01, 6);
      expect(right?.bounds?.min[0]).toBeCloseTo(0.03, 6);
      const features = buildGltfMeasurementFeatures(glb!, manifest);
      expect([...features.values()].some((item) => item.faces?.length)).toBe(true);
      const exported = await client.export('step', { exportOptions: { coordinateSystem: 'y-up' } });
      assertSuccess(exported);
      const stepBytes = exported.data[0]!.bytes;
      const query = (id: number, bytes: Uint8Array<ArrayBuffer>, names: readonly [string, string]): ExactRequest => ({
        id,
        source: { format: 'ap242', bytes, coordinateSystem: 'y-up' },
        occurrences: [{ name: names[0] }, { name: names[1] }],
      });
      const result = await evaluateExactOccurrenceDistance(query(1, stepBytes, ['left', 'right']));
      if (result.status === 'unavailable') {
        throw new Error(result.reason);
      }
      expect(result).toMatchObject({ status: 'cad-geometry', source: 'ap242', distanceMeters: 0.02 });
      expect(result.pointAMeters[0]).toBeCloseTo(0.01, 6);
      expect(result.pointBMeters[0]).toBeCloseTo(0.03, 6);
      expect(result.pointAMeters[0]).toBeCloseTo(left!.bounds!.max[0], 6);
      expect(result.pointBMeters[0]).toBeCloseTo(right!.bounds!.min[0], 6);
      expect(result.pointAMeters[1]).toBeGreaterThanOrEqual(0.005 - 1e-8);
      expect(result.pointAMeters[1]).toBeLessThanOrEqual(0.015 + 1e-8);
      expect(result.pointAMeters[2]).toBeGreaterThanOrEqual(0.01 - 1e-8);
      expect(result.pointAMeters[2]).toBeLessThanOrEqual(0.02 + 1e-8);
      expect(result.pointAMeters[1]).toBeGreaterThanOrEqual(-left!.bounds!.max[2] - 1e-8);
      expect(result.pointAMeters[1]).toBeLessThanOrEqual(-left!.bounds!.min[2] + 1e-8);
      expect(result.pointAMeters[2]).toBeGreaterThanOrEqual(left!.bounds!.min[1] - 1e-8);
      expect(result.pointAMeters[2]).toBeLessThanOrEqual(left!.bounds!.max[1] + 1e-8);
      expect(Math.hypot(...result.pointAMeters.map((value, index) => value - result.pointBMeters[index]!))).toBeCloseTo(
        result.distanceMeters,
        8,
      );
      const ambiguous = await evaluateExactOccurrenceDistance(query(2, stepBytes, ['left', 'left']));
      expect(ambiguous.status).toBe('unavailable');
      if (ambiguous.status === 'unavailable') {
        expect(ambiguous.reason).toContain('distinct displayed AP242 occurrence names');
      }
      const mixedUnits = await evaluateExactOccurrenceDistance(query(
        3,
        new TextEncoder().encode(new TextDecoder().decode(stepBytes).replace('SI_UNIT(.MILLI.,.METRE.)', 'SI_UNIT($,.METRE.)')),
        ['left', 'right'],
      ));
      expect(mixedUnits.status).toBe('unavailable');
      if (mixedUnits.status === 'unavailable') {
        expect(mixedUnits.reason).toContain('units or frame');
      }
    } finally {
      await client.shutdown();
    }
  });
});
