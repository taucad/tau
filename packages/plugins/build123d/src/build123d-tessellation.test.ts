// @vitest-environment node
/* oxlint-disable typescript/no-unsafe-assignment -- vitest asymmetric matchers return any */
import { occtExplicitTessellationDefaults } from '@taucad/occt-core';
import type { OcctTessellation, OcctTessellationTolerances } from '@taucad/occt-core';
import { describe, expect, it, vi } from 'vitest';

import {
  Build123dTessellationRefusal,
  meshExportWithinBudget,
  meshPreviewWithinBudget,
} from '#build123d-tessellation.js';
import type { Build123dMesh } from '#build123d.protocol.js';

const glb = { artifactPath: '/private/model.glb', byteLength: 3 };

/**
 * A worker double whose triangle count scales with the inverse of the linear tolerance, like OCCT's.
 *
 * @param trianglesAtOneMillimetre - Triangles the shapes need at a 1 mm linear tolerance.
 * @returns The mesh request spy.
 */
const workerMesh = (trianglesAtOneMillimetre: number) =>
  vi.fn(async (tolerances: OcctTessellationTolerances, maxTriangles?: number): Promise<Build123dMesh> => {
    const triangles = Math.round(trianglesAtOneMillimetre / tolerances.linearTolerance);
    const counts = { triangles, vertices: triangles * 3 };
    return maxTriangles !== undefined && triangles > maxTriangles ? counts : { ...counts, ...glb };
  });

const previewLane = (tessellation: OcctTessellation, measureDiagonal = vi.fn(async () => 2000)) =>
  ({
    tessellation,
    fallback: 'medium',
    explicitDefaults: occtExplicitTessellationDefaults.preview,
    budget: 1000,
    staleCode: 'VIEW_OPTIONS_INVALID',
    measureDiagonal,
  }) as const;

describe('build123d preview tessellation', () => {
  it('derives a preset from the measured diagonal and reports what it meshed', async () => {
    const measureDiagonal = vi.fn(async () => 2000);
    const mesh = workerMesh(100);

    const meshed = await meshPreviewWithinBudget(previewLane('medium', measureDiagonal), mesh);

    expect(measureDiagonal).toHaveBeenCalledOnce();
    expect(mesh).toHaveBeenCalledExactlyOnceWith(
      { requested: 'medium', linearTolerance: 1, angularTolerance: 20 },
      1000,
    );
    expect(meshed).toMatchObject({
      artifact: glb,
      tessellation: {
        triangles: 100,
        vertices: 300,
        requested: 'medium',
        linearTolerance: 1,
        angularTolerance: 20,
        downgraded: 0,
      },
      issues: [],
    });
    expect(meshed.tessellation.elapsed).toBeGreaterThanOrEqual(0);
  });

  it('passes explicit millimetres and degrees through without measuring', async () => {
    const measureDiagonal = vi.fn(async () => 2000);
    const mesh = workerMesh(1);

    const meshed = await meshPreviewWithinBudget(previewLane({ linearTolerance: 0.05 }, measureDiagonal), mesh);

    expect(measureDiagonal).not.toHaveBeenCalled();
    expect(mesh).toHaveBeenCalledExactlyOnceWith(
      { requested: 'explicit', linearTolerance: 0.05, angularTolerance: 20 },
      1000,
    );
    expect(meshed.tessellation).toMatchObject({ requested: 'explicit', linearTolerance: 0.05, angularTolerance: 20 });
  });

  it('coarsens an over-budget preview one step at a time and warns', async () => {
    const mesh = workerMesh(3000);

    const meshed = await meshPreviewWithinBudget(previewLane({ linearTolerance: 1, angularTolerance: 20 }), mesh);

    expect(mesh.mock.calls.map(([tolerances, budget]) => [tolerances.linearTolerance, budget])).toEqual([
      [1, 1000],
      [2, 1000],
      [4, 1000],
    ]);
    expect(meshed.tessellation).toMatchObject({
      triangles: 750,
      linearTolerance: 4,
      angularTolerance: 28,
      downgraded: 2,
    });
    expect(meshed.issues).toEqual([
      expect.objectContaining({
        code: 'TESSELLATION_DOWNGRADED',
        severity: 'warning',
        details: expect.objectContaining({ producer: 'build123d', downgraded: 2, triangles: 750, budget: 1000 }),
      }),
    ]);
  });

  it('delivers the third coarser step whatever it costs', async () => {
    const mesh = workerMesh(1_000_000);

    const meshed = await meshPreviewWithinBudget(previewLane({ linearTolerance: 1, angularTolerance: 20 }), mesh);

    expect(mesh.mock.calls.map(([tolerances, budget]) => [tolerances.linearTolerance, budget])).toEqual([
      [1, 1000],
      [2, 1000],
      [4, 1000],
      [8, undefined],
    ]);
    expect(meshed).toMatchObject({ artifact: glb, tessellation: { triangles: 125_000, downgraded: 3 } });
  });

  it('meshes a stale radian value at the default preset and says so', async () => {
    const measureDiagonal = vi.fn(async () => 2000);
    const mesh = workerMesh(100);
    const stale = { linearTolerance: 0.05, angularTolerance: 0.1 };

    const meshed = await meshPreviewWithinBudget(previewLane(stale, measureDiagonal), mesh);

    expect(measureDiagonal).toHaveBeenCalledOnce();
    expect(mesh).toHaveBeenCalledExactlyOnceWith(
      { requested: 'medium', linearTolerance: 1, angularTolerance: 20 },
      1000,
    );
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

    const above = await meshPreviewWithinBudget(previewLane({ angularTolerance: 3.2 }), mesh);
    const lengthOnly = await meshPreviewWithinBudget(previewLane({ linearTolerance: 0.05 }), mesh);

    expect(above).toMatchObject({ tessellation: { requested: 'explicit', angularTolerance: 3.2 }, issues: [] });
    expect(lengthOnly).toMatchObject({ tessellation: { requested: 'explicit', angularTolerance: 20 }, issues: [] });
  });

  it('refuses a worker answer that withholds an unbounded GLB', async () => {
    const mesh = vi.fn(async () => ({ triangles: 5000, vertices: 15_000 }));

    await expect(
      meshPreviewWithinBudget(previewLane({ linearTolerance: 1, angularTolerance: 20 }), mesh),
    ).rejects.toThrow(/without a GLB/);
  });
});

describe('build123d export tessellation', () => {
  const exportLane = (tessellation: OcctTessellation) =>
    ({
      tessellation,
      fallback: 'high',
      explicitDefaults: occtExplicitTessellationDefaults.export,
      budget: 1000,
      staleCode: 'EXPORT_OPTIONS_INVALID',
      measureDiagonal: async () => 8000,
    }) as const;

  it('meshes the high preset within the export budget', async () => {
    const mesh = workerMesh(100);

    const meshed = await meshExportWithinBudget(exportLane('high'), mesh);

    expect(mesh).toHaveBeenCalledExactlyOnceWith({ requested: 'high', linearTolerance: 1, angularTolerance: 12 }, 1000);
    expect(meshed).toMatchObject({
      artifact: glb,
      tessellation: { triangles: 100, vertices: 300, requested: 'high', linearTolerance: 1, downgraded: 0 },
      issues: [],
    });
  });

  it('refuses an over-budget export with a suggested tolerance instead of coarsening it', async () => {
    const mesh = workerMesh(4000);

    const refusal = await meshExportWithinBudget(exportLane({ linearTolerance: 1, angularTolerance: 20 }), mesh).catch(
      (error: unknown) => error,
    );

    expect(mesh).toHaveBeenCalledOnce();
    expect(refusal).toBeInstanceOf(Build123dTessellationRefusal);
    expect((refusal as Build123dTessellationRefusal).issue).toMatchObject({
      code: 'RESOURCE_LIMIT',
      severity: 'error',
      details: { producer: 'build123d', suggested: { linearTolerance: 4 }, triangles: 4000, budget: 1000 },
    });
  });

  it('meshes a stale radian export value at the high preset with an export warning', async () => {
    const meshed = await meshExportWithinBudget(
      exportLane({ linearTolerance: 0.01, angularTolerance: 0.1 }),
      workerMesh(100),
    );

    expect(meshed.tessellation.requested).toBe('high');
    expect(meshed.issues).toEqual([expect.objectContaining({ code: 'EXPORT_OPTIONS_INVALID', severity: 'warning' })]);
  });
});
