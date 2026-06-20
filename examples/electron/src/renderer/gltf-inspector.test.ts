/**
 * Unit tests for the glTF inspector — drives the bounding-box + standard-
 * property visual validator surfaced in the renderer alongside the
 * Three.js viewer (p1-electron-bbox-viewer).
 *
 * Runs in node env; the inspector is pure parsing over an `ArrayBuffer`,
 * so no DOM is required.
 */

// @vitest-environment node
import { describe, it, expect } from 'vitest';

import { inspectGlb, packGlbForTest } from './gltf-inspector.js';
import type { GltfJson } from './gltf-inspector.js';

/** Minimal cube accessor: min=[-50,-50,-50], max=[50,50,50] (centered 100³). */
function buildCubeGltf(min: readonly [number, number, number], max: readonly [number, number, number]): GltfJson {
  return {
    asset: { version: '2.0', generator: 'tau-test' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
          },
        ],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 8,
        type: 'VEC3',
        min: [...min],
        max: [...max],
      },
      {
        bufferView: 1,
        componentType: 5123,
        count: 36,
        type: 'SCALAR',
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 96 },
      { buffer: 0, byteOffset: 96, byteLength: 72 },
    ],
    buffers: [{ byteLength: 168 }],
  };
}

describe('inspectGlb (p1-electron-bbox-viewer)', () => {
  it('extracts bounding box from accessor min/max', () => {
    const gltf = buildCubeGltf([-50, -50, -50], [50, 50, 50]);
    const glb = packGlbForTest(gltf);

    const result = inspectGlb(glb);

    expect(result.bbox.min).toEqual([-50, -50, -50]);
    expect(result.bbox.max).toEqual([50, 50, 50]);
    expect(result.bbox.size).toEqual([100, 100, 100]);
    expect(result.bbox.center).toEqual([0, 0, 0]);
  });

  it('reports asset.generator and asset.version', () => {
    const gltf = buildCubeGltf([0, 0, 0], [1, 1, 1]);
    const glb = packGlbForTest(gltf);

    const result = inspectGlb(glb);

    expect(result.asset.version).toBe('2.0');
    expect(result.asset.generator).toBe('tau-test');
  });

  it('counts meshes, primitives, vertices, and triangles', () => {
    const gltf = buildCubeGltf([0, 0, 0], [1, 1, 1]);
    const glb = packGlbForTest(gltf);

    const result = inspectGlb(glb);

    expect(result.counts.meshes).toBe(1);
    expect(result.counts.primitives).toBe(1);
    expect(result.counts.vertices).toBe(8);
    expect(result.counts.triangles).toBe(12);
  });

  it('updates bbox dimensions when the underlying cube doubles (parametric validation)', () => {
    /* Simulates the bbox validation described in p1-electron-validate-bbox:
     * change the cube parameter from 100 to 200 — the displayed bbox size
     * along every axis must double. The inspector is the rendering side
     * of that contract. */
    const before = inspectGlb(packGlbForTest(buildCubeGltf([-50, -50, -50], [50, 50, 50])));
    const after = inspectGlb(packGlbForTest(buildCubeGltf([-100, -100, -100], [100, 100, 100])));

    expect(before.bbox.size).toEqual([100, 100, 100]);
    expect(after.bbox.size).toEqual([200, 200, 200]);
    expect(after.bbox.size[0]).toBeCloseTo(before.bbox.size[0] * 2);
    expect(after.bbox.size[1]).toBeCloseTo(before.bbox.size[1] * 2);
    expect(after.bbox.size[2]).toBeCloseTo(before.bbox.size[2] * 2);
  });

  it('applies node TRS transforms to the bounding box', () => {
    const gltf = buildCubeGltf([0, 0, 0], [10, 10, 10]);
    /* Translate the cube by [+5, 0, 0] — bbox shifts by the same vector. */
    gltf.nodes![0]!.translation = [5, 0, 0];
    const result = inspectGlb(packGlbForTest(gltf));

    expect(result.bbox.min).toEqual([5, 0, 0]);
    expect(result.bbox.max).toEqual([15, 10, 10]);
  });

  it('throws on non-glTF input (sanity)', () => {
    const garbage = new Uint8Array([0, 0, 0, 0]).buffer;
    expect(() => inspectGlb(garbage)).toThrow(/glTF magic/);
  });
});
