import { describe, expect, it, vi } from 'vitest';
import type { MeshChunk, Voxels } from 'picovoxel';

import {
  createPicovoxelMeshSink,
  meshPicovoxelField,
  picovoxelAdaptivePreviewsWatertight,
  picovoxelDefaultAdaptivity,
  picovoxelMeshingReport,
  picovoxelPreviewAdaptivity,
  resolvePicovoxelMeshing,
  snapshotPicovoxelMeshingReport,
} from '#picovoxel-meshing.js';

describe('PicoVoxel adaptive meshing', () => {
  it('runs the uniform mesh at 0 on either lane and any release', () => {
    expect(resolvePicovoxelMeshing({ meshAdaptivity: 0 }, 'exact', '0.1.0')).toEqual({});
    expect(resolvePicovoxelMeshing({ meshAdaptivity: 0 }, 'fast', '0.2.0')).toEqual({});
  });

  it('meshes adaptively only on the fast lane of a release whose toMesh takes options', () => {
    expect(resolvePicovoxelMeshing({ meshAdaptivity: 0.5 }, 'fast', '0.2.0')).toEqual({
      meshing: { adaptivity: 0.5 },
    });
    expect(resolvePicovoxelMeshing({ meshAdaptivity: 0.5 }, 'exact', '0.2.0')).toMatchObject({
      refusal: { code: 'REPRESENTATION_UNSUPPORTED', details: { refusal: 'PICOVOXEL_MESHING_EXACT_LANE' } },
    });
    expect(resolvePicovoxelMeshing({ meshAdaptivity: 0.5 }, 'fast', '0.1.0')).toMatchObject({
      refusal: { code: 'KERNEL_CAPABILITY_MISSING', details: { capability: 'PICOVOXEL_ADAPTIVE_MESHING' } },
    });
  });

  it('opens the watertightness gate, so only the lane and the release decide the default', () => {
    expect(picovoxelAdaptivePreviewsWatertight).toBe(true);
    expect(picovoxelPreviewAdaptivity).toBe(0.25);
    expect(picovoxelDefaultAdaptivity('fast', '0.2.0')).toBe(0.25);
    expect(resolvePicovoxelMeshing({}, 'fast', '0.2.0')).toEqual({
      meshing: { adaptivity: 0.25 },
    });
    for (const [lane, version] of [
      ['fast', '0.1.0'],
      ['exact', '0.1.0'],
      ['exact', '0.2.0'],
    ] as const) {
      expect(picovoxelDefaultAdaptivity(lane, version)).toBe(0);
      expect(resolvePicovoxelMeshing({}, lane, version)).toEqual({});
    }
  });

  it.each([
    { lane: 'fast', version: '0.2.0', gate: true, adaptivity: 0.25 },
    { lane: 'fast', version: '0.2.0', gate: false, adaptivity: 0 },
    { lane: 'fast', version: '0.1.0', gate: true, adaptivity: 0 },
    { lane: 'fast', version: '0.1.0', gate: false, adaptivity: 0 },
    { lane: 'exact', version: '0.2.0', gate: true, adaptivity: 0 },
    { lane: 'exact', version: '0.2.0', gate: false, adaptivity: 0 },
    { lane: 'exact', version: '0.1.0', gate: true, adaptivity: 0 },
    { lane: 'exact', version: '0.1.0', gate: false, adaptivity: 0 },
  ] as const)(
    'resolves an unset adaptivity on lane $lane of $version with the gate $gate to $adaptivity',
    ({ lane, version, gate, adaptivity }) => {
      expect(picovoxelDefaultAdaptivity(lane, version, gate)).toBe(adaptivity);
      // The default runs wherever an explicit request of the same value runs: it never refuses.
      expect(resolvePicovoxelMeshing({ meshAdaptivity: adaptivity }, lane, version)).toEqual(
        adaptivity === 0 ? {} : { meshing: { adaptivity } },
      );
    },
  );

  it('checks an explicit Balanced adaptivity as given', () => {
    expect(resolvePicovoxelMeshing({ meshAdaptivity: 0.25 }, 'fast', '0.2.0')).toEqual({
      meshing: { adaptivity: 0.25 },
    });
    expect(resolvePicovoxelMeshing({ meshAdaptivity: 0.25 }, 'exact', '0.2.0')).toMatchObject({
      refusal: { code: 'REPRESENTATION_UNSUPPORTED', details: { refusal: 'PICOVOXEL_MESHING_EXACT_LANE' } },
    });
    expect(resolvePicovoxelMeshing({ meshAdaptivity: 0.25 }, 'fast', '0.1.0')).toMatchObject({
      refusal: { code: 'KERNEL_CAPABILITY_MISSING', details: { capability: 'PICOVOXEL_ADAPTIVE_MESHING' } },
    });
  });

  it('restores a serialized meshing report as an adaptivity in (0, 1), dropping an older snapshot relax', () => {
    expect(snapshotPicovoxelMeshingReport({ triangles: 1 })).toEqual({});
    expect(snapshotPicovoxelMeshingReport(null)).toEqual({});
    expect(snapshotPicovoxelMeshingReport({ adaptivity: 0.5 })).toEqual({ adaptivity: 0.5 });
    expect(snapshotPicovoxelMeshingReport({ adaptivity: 0.5, relax: true })).toEqual({ adaptivity: 0.5 });
    for (const value of [
      { relax: false },
      { adaptivity: 0 },
      { adaptivity: 1, relax: false },
      { adaptivity: '0.5' },
      { adaptivity: 0.5, relax: 'yes' },
    ]) {
      expect(() => snapshotPicovoxelMeshingReport(value)).toThrow('adaptivity must be in (0, 1)');
    }
  });

  it('never asks for a relax option, whatever older options carried', () => {
    const saved = { meshAdaptivity: 0.5, meshRelax: true };
    expect(resolvePicovoxelMeshing(saved, 'fast', '0.2.0')).toEqual({ meshing: { adaptivity: 0.5 } });
  });

  it('streams the uniform mesh and builds only an adaptive mesh whole, freeing it at once', () => {
    // Chunks are views into one reused buffer, as wasm-memory views are: the sink must copy each before it returns.
    const scratch = new Float32Array(6);
    const indices = new Uint32Array(3);
    const streamMesh = vi.fn(function (this: unknown, onChunk: (chunk: MeshChunk) => void) {
      expect(this).toBe(field);
      scratch.set([0, 0, 0, 1, 0, 0]);
      indices.set([0, 1, 2]);
      onChunk({ vertices: scratch.subarray(0, 6), triangles: indices.subarray(0, 3) });
      scratch.set([0, 1, 0]);
      indices.set([2, 1, 0]);
      onChunk({ vertices: scratch.subarray(0, 3), triangles: indices.subarray(0, 3) });
      onChunk({ vertices: scratch.subarray(0, 0), triangles: indices.subarray(0, 0) });
      return { vertexCount: 3, triangleCount: 2 };
    });
    const adaptive = {
      vertices: new Float32Array(9),
      triangles: new Uint32Array([0, 1, 2]),
      lane: 'fast',
      dispose: vi.fn(),
    };
    const toMesh = vi.fn(() => adaptive);
    const field = { streamMesh, toMesh, lane: 'exact' } as unknown as Voxels;

    const uniform = meshPicovoxelField(field, undefined);
    expect(uniform.lane).toBe('exact');
    expect([...uniform.vertices]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect([...uniform.triangles]).toEqual([0, 1, 2, 2, 1, 0]);
    expect(uniform.vertices.buffer).not.toBe(scratch.buffer);
    expect(toMesh).not.toHaveBeenCalled();

    expect(meshPicovoxelField(field, { adaptivity: 0.25 })).toEqual({
      vertices: adaptive.vertices,
      triangles: adaptive.triangles,
      lane: 'fast',
    });
    expect(toMesh.mock.calls).toEqual([[{ adaptivity: 0.25 }]]);
    expect(adaptive.dispose).toHaveBeenCalledOnce();
    expect(streamMesh).toHaveBeenCalledOnce();
    expect(picovoxelMeshingReport(undefined)).toEqual({});
    expect(picovoxelMeshingReport({ adaptivity: 0.25 })).toEqual({ adaptivity: 0.25 });
  });

  it('frees an adaptive mesh even when reading it fails', () => {
    const dispose = vi.fn();
    const mesh = {
      get vertices(): Float32Array {
        throw new Error('read failed');
      },
      dispose,
    };
    const field = { toMesh: () => mesh } as unknown as Voxels;

    expect(() => meshPicovoxelField(field, { adaptivity: 0.5 })).toThrow('read failed');
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('joins nothing into empty arrays', () => {
    const { finish } = createPicovoxelMeshSink();
    const { vertices, triangles } = finish();

    expect(vertices).toEqual(new Float32Array(0));
    expect(triangles).toEqual(new Uint32Array(0));
  });
});
