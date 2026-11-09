import { describe, expect, it, vi } from 'vitest';
import type { Voxels } from 'picovoxel';

import {
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

  it('passes the meshing to toMesh and reports it only for an adaptive mesh', () => {
    const mesh = Symbol('mesh');
    const toMesh = vi.fn(function (this: unknown) {
      expect(this).toBe(field);
      return mesh;
    });
    const field = { toMesh } as unknown as Voxels;
    expect(meshPicovoxelField(field, undefined)).toBe(mesh);
    expect(meshPicovoxelField(field, { adaptivity: 0.25 })).toBe(mesh);
    expect(toMesh.mock.calls).toEqual([[undefined], [{ adaptivity: 0.25 }]]);
    expect(picovoxelMeshingReport(undefined)).toEqual({});
    expect(picovoxelMeshingReport({ adaptivity: 0.25 })).toEqual({ adaptivity: 0.25 });
  });
});
