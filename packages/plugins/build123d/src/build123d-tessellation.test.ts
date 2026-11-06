// @vitest-environment node
/* oxlint-disable typescript/no-unsafe-assignment -- vitest asymmetric matchers return any */
import { occtExplicitTessellationDefaults } from '@taucad/occt-core';
import type { OcctTessellation, OcctTessellationTolerances } from '@taucad/occt-core';
import { describe, expect, it, vi } from 'vitest';

import { meshTessellation } from '#build123d-tessellation.js';
import type { Build123dMesh } from '#build123d.protocol.js';

const glb = { artifactPath: '/private/model.glb', byteLength: 3 };

/**
 * A worker double whose triangle count scales with the inverse of the linear tolerance, like OCCT's.
 *
 * @param trianglesAtOneMillimetre - Triangles the shapes need at a 1 mm linear tolerance.
 * @returns The mesh request spy.
 */
const workerMesh = (trianglesAtOneMillimetre: number) =>
  vi.fn(async (tolerances: OcctTessellationTolerances): Promise<Build123dMesh> => {
    const triangles = Math.round(trianglesAtOneMillimetre / tolerances.linearTolerance);
    return { triangles, vertices: triangles * 3, ...glb };
  });

const previewLane = (tessellation: OcctTessellation, measureDiagonal = vi.fn(async () => 2000)) =>
  ({
    tessellation,
    fallback: 'medium',
    explicitDefaults: occtExplicitTessellationDefaults.preview,
    staleCode: 'VIEW_OPTIONS_INVALID',
    measureDiagonal,
  }) as const;

describe('build123d preview tessellation', () => {
  it('derives a preset from the measured diagonal and reports what it meshed', async () => {
    const measureDiagonal = vi.fn(async () => 2000);
    const mesh = workerMesh(100);

    const meshed = await meshTessellation(previewLane('medium', measureDiagonal), mesh);

    expect(measureDiagonal).toHaveBeenCalledOnce();
    expect(mesh).toHaveBeenCalledExactlyOnceWith({ requested: 'medium', linearTolerance: 1, angularTolerance: 20 });
    expect(meshed).toMatchObject({
      artifact: glb,
      tessellation: { triangles: 100, vertices: 300, requested: 'medium', linearTolerance: 1, angularTolerance: 20 },
      issues: [],
    });
    expect(meshed.tessellation).not.toHaveProperty('downgraded');
    expect(meshed.tessellation.elapsed).toBeGreaterThanOrEqual(0);
  });

  it('passes explicit millimetres and degrees through without measuring', async () => {
    const measureDiagonal = vi.fn(async () => 2000);
    const mesh = workerMesh(1);

    const meshed = await meshTessellation(previewLane({ linearTolerance: 0.05 }, measureDiagonal), mesh);

    expect(measureDiagonal).not.toHaveBeenCalled();
    expect(mesh).toHaveBeenCalledExactlyOnceWith({
      requested: 'explicit',
      linearTolerance: 0.05,
      angularTolerance: 20,
    });
    expect(meshed.tessellation).toMatchObject({ requested: 'explicit', linearTolerance: 0.05, angularTolerance: 20 });
  });

  it('meshes a large preview once at the requested tolerance, never coarser', async () => {
    const mesh = workerMesh(3_000_000);

    const meshed = await meshTessellation(previewLane({ linearTolerance: 1, angularTolerance: 20 }), mesh);

    expect(mesh).toHaveBeenCalledOnce();
    expect(meshed).toMatchObject({
      artifact: glb,
      tessellation: { triangles: 3_000_000, linearTolerance: 1, angularTolerance: 20 },
      issues: [],
    });
  });

  it('meshes a stale radian value at the default preset and says so', async () => {
    const measureDiagonal = vi.fn(async () => 2000);
    const mesh = workerMesh(100);
    const stale = { linearTolerance: 0.05, angularTolerance: 0.1 };

    const meshed = await meshTessellation(previewLane(stale, measureDiagonal), mesh);

    expect(measureDiagonal).toHaveBeenCalledOnce();
    expect(mesh).toHaveBeenCalledExactlyOnceWith({ requested: 'medium', linearTolerance: 1, angularTolerance: 20 });
    expect(meshed.issues).toEqual([
      expect.objectContaining({
        code: 'VIEW_OPTIONS_INVALID',
        severity: 'warning',
        details: { producer: 'build123d', stale, effective: 'medium' },
      }),
    ]);
  });

  it('keeps an explicit angle above π degrees and an explicit length alone', async () => {
    const mesh = workerMesh(1);

    const above = await meshTessellation(previewLane({ angularTolerance: 3.2 }), mesh);
    const lengthOnly = await meshTessellation(previewLane({ linearTolerance: 0.05 }), mesh);

    expect(above).toMatchObject({ tessellation: { requested: 'explicit', angularTolerance: 3.2 }, issues: [] });
    expect(lengthOnly).toMatchObject({ tessellation: { requested: 'explicit', angularTolerance: 20 }, issues: [] });
  });
});

describe('build123d export tessellation', () => {
  const exportLane = (tessellation: OcctTessellation) =>
    ({
      tessellation,
      fallback: 'high',
      explicitDefaults: occtExplicitTessellationDefaults.export,
      staleCode: 'EXPORT_OPTIONS_INVALID',
      measureDiagonal: async () => 8000,
    }) as const;

  it('meshes the high preset', async () => {
    const mesh = workerMesh(100);

    const meshed = await meshTessellation(exportLane('high'), mesh);

    expect(mesh).toHaveBeenCalledExactlyOnceWith({ requested: 'high', linearTolerance: 1, angularTolerance: 12 });
    expect(meshed).toMatchObject({
      artifact: glb,
      tessellation: { triangles: 100, vertices: 300, requested: 'high', linearTolerance: 1 },
      issues: [],
    });
  });

  it('exports a mesh above the former 20,000,000-triangle budget instead of refusing it', async () => {
    const mesh = workerMesh(25_000_000);

    const meshed = await meshTessellation(exportLane({ linearTolerance: 1, angularTolerance: 20 }), mesh);

    expect(mesh).toHaveBeenCalledOnce();
    expect(meshed).toMatchObject({ artifact: glb, tessellation: { triangles: 25_000_000 }, issues: [] });
  });

  it('meshes a stale radian export value at the high preset with an export warning', async () => {
    const meshed = await meshTessellation(
      exportLane({ linearTolerance: 0.01, angularTolerance: 0.1 }),
      workerMesh(100),
    );

    expect(meshed.tessellation.requested).toBe('high');
    expect(meshed.issues).toEqual([expect.objectContaining({ code: 'EXPORT_OPTIONS_INVALID', severity: 'warning' })]);
  });
});
