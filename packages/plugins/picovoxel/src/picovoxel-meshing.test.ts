import { describe, expect, it, vi } from 'vitest';
import type { Voxels } from 'picovoxel';

import {
  meshPicovoxelField,
  picovoxelMeshingReport,
  resolvePicovoxelMeshing,
  snapshotPicovoxelMeshingReport,
} from '#picovoxel-meshing.js';

describe('PicoVoxel adaptive meshing', () => {
  it('runs the uniform mesh at 0 on either lane and any release', () => {
    expect(resolvePicovoxelMeshing({ meshAdaptivity: 0, meshRelax: true }, 'exact', '0.1.0')).toEqual({});
    expect(resolvePicovoxelMeshing({ meshAdaptivity: 0, meshRelax: false }, 'fast', '0.2.0')).toEqual({});
  });

  it('meshes adaptively only on the fast lane of a release whose toMesh takes options', () => {
    expect(resolvePicovoxelMeshing({ meshAdaptivity: 0.5, meshRelax: true }, 'fast', '0.2.0')).toEqual({
      meshing: { adaptivity: 0.5, relax: true },
    });
    expect(resolvePicovoxelMeshing({ meshAdaptivity: 0.5, meshRelax: true }, 'exact', '0.2.0')).toMatchObject({
      refusal: { code: 'REPRESENTATION_UNSUPPORTED', details: { refusal: 'PICOVOXEL_MESHING_EXACT_LANE' } },
    });
    expect(resolvePicovoxelMeshing({ meshAdaptivity: 0.5, meshRelax: false }, 'fast', '0.1.0')).toMatchObject({
      refusal: { code: 'KERNEL_CAPABILITY_MISSING', details: { capability: 'PICOVOXEL_ADAPTIVE_MESHING' } },
    });
  });

  it('restores a serialized meshing report only as an adaptivity in (0, 1) with a boolean relax', () => {
    expect(snapshotPicovoxelMeshingReport({ triangles: 1 })).toEqual({});
    expect(snapshotPicovoxelMeshingReport(null)).toEqual({});
    expect(snapshotPicovoxelMeshingReport({ adaptivity: 0.5, relax: true })).toEqual({ adaptivity: 0.5, relax: true });
    for (const value of [
      { adaptivity: 0.5 },
      { relax: false },
      { adaptivity: 0, relax: false },
      { adaptivity: 1, relax: false },
      { adaptivity: '0.5', relax: false },
      { adaptivity: 0.5, relax: 'yes' },
    ]) {
      expect(() => snapshotPicovoxelMeshingReport(value)).toThrow(
        'adaptivity in (0, 1) and a boolean relax must appear together',
      );
    }
  });

  it('passes the meshing to toMesh and reports it only for an adaptive mesh', () => {
    const mesh = Symbol('mesh');
    const toMesh = vi.fn(function (this: unknown) {
      expect(this).toBe(field);
      return mesh;
    });
    const field = { toMesh } as unknown as Voxels;
    expect(meshPicovoxelField(field, undefined)).toBe(mesh);
    expect(meshPicovoxelField(field, { adaptivity: 0.25, relax: false })).toBe(mesh);
    expect(toMesh.mock.calls).toEqual([[undefined], [{ adaptivity: 0.25, relax: false }]]);
    expect(picovoxelMeshingReport(undefined)).toEqual({});
    expect(picovoxelMeshingReport({ adaptivity: 0.25, relax: false })).toEqual({ adaptivity: 0.25, relax: false });
  });
});
