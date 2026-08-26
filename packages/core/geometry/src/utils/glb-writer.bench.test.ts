import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { writeGlb } from '#utils/glb-writer.js';
import type { GlbInput } from '#utils/glb-writer.js';

const triangleCount = 500_000;
const warmups = 8;
const samples = 5;

const input = (): GlbInput => {
  const vertexCount = triangleCount * 3;
  const positions = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(vertexCount);
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const offset = vertex * 3;
    positions[offset] = vertex % 1000;
    positions[offset + 1] = Math.floor(vertex / 1000);
    positions[offset + 2] = vertex % 3;
    indices[vertex] = vertex;
  }
  return {
    nodes: [
      {
        primitives: [
          {
            mode: 4,
            positions,
            indices,
            material: {
              baseColorFactor: [1, 1, 1, 1],
              metallicFactor: 0,
              roughnessFactor: 1,
              doubleSided: true,
              alphaMode: 'OPAQUE',
            },
          },
        ],
      },
    ],
  };
};

describe('GLB writer benchmark gate', () => {
  it('writes 500k triangles with stable bytes after eight warmups', () => {
    const scene = input();
    const timings: number[] = [];
    let outputHash = '';
    for (let iteration = 0; iteration < warmups + samples; iteration++) {
      const started = performance.now();
      const output = writeGlb(scene);
      const elapsed = performance.now() - started;
      const hash = createHash('sha256').update(output).digest('hex');
      outputHash ||= hash;
      expect(hash).toBe(outputHash);
      if (iteration >= warmups) {
        timings.push(elapsed);
      }
    }
    timings.sort((left, right) => left - right);
    /** Milliseconds. */
    const median = timings[Math.floor(timings.length / 2)]!;
    console.log(
      JSON.stringify({ case: 'glb-writer-500k-triangles-v1', medianMs: median, outputHash, samples, warmups }),
    );
    expect(Number.isFinite(median)).toBe(true);

    if (process.env['TAU_BENCHMARK_GATE'] === '1') {
      /** Milliseconds. */
      const baseline = Number(process.env['GLB_WRITER_500K_BASELINE_MS']);
      expect(Number.isFinite(baseline), 'Pinned runner must provide GLB_WRITER_500K_BASELINE_MS').toBe(true);
      expect(median).toBeLessThanOrEqual(baseline * 1.1);
    }
  }, 120_000);
});
