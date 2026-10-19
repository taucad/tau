// @vitest-environment node
/* oxlint-disable typescript/no-unsafe-assignment -- vitest asymmetric matchers return any */
import { occtExplicitTessellationDefaults } from '@taucad/occt-core';
import type { OcctTessellation, OcctTessellationTolerances } from '@taucad/occt-core';
import { describe, expect, it, vi } from 'vitest';

import { SmlibpyTessellationRefusal, meshExportWithinBudget, meshPreviewWithinBudget } from '#smlibpy-tessellation.js';
import type { SmlibpyMesh } from '#smlibpy.protocol.js';

const bundle = { artifactPath: '/private/model.smlibpy-mesh.bin', byteLength: 3 };

/**
 * A worker double whose triangle count scales with the inverse of the linear tolerance, like smlibpy's.
 *
 * @param trianglesAtOneMillimetre - Triangles the shapes need at a 1 mm linear tolerance.
 * @returns The mesh request spy.
 */
const workerMesh = (trianglesAtOneMillimetre: number) =>
  vi.fn(async (tolerances: OcctTessellationTolerances, maxTriangles?: number): Promise<SmlibpyMesh> => {
    const triangles = Math.round(trianglesAtOneMillimetre / tolerances.linearTolerance);
    const counts = { triangles, vertices: triangles * 3 };
    return maxTriangles !== undefined && triangles > maxTriangles ? counts : { ...counts, ...bundle };
  });

const previewLane = (tessellation: OcctTessellation, measureDiagonal = vi.fn(async () => 2000)) =>
  ({
    tessellation,
    explicitDefaults: occtExplicitTessellationDefaults.preview,
    budget: 1000,
    measureDiagonal,
  }) as const;

describe('smlibpy preview tessellation', () => {
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
      artifact: bundle,
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
        details: expect.objectContaining({ producer: 'smlibpy', downgraded: 2, triangles: 750, budget: 1000 }),
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
    expect(meshed).toMatchObject({ artifact: bundle, tessellation: { triangles: 125_000, downgraded: 3 } });
  });

  it('keeps an explicit angle above π degrees and an explicit length alone', async () => {
    const mesh = workerMesh(1);

    const above = await meshPreviewWithinBudget(previewLane({ angularTolerance: 3.2 }), mesh);
    const lengthOnly = await meshPreviewWithinBudget(previewLane({ linearTolerance: 0.05 }), mesh);

    expect(above).toMatchObject({ tessellation: { requested: 'explicit', angularTolerance: 3.2 }, issues: [] });
    expect(lengthOnly).toMatchObject({ tessellation: { requested: 'explicit', angularTolerance: 20 }, issues: [] });
  });

  it('refuses a worker answer that withholds an unbounded mesh bundle', async () => {
    const mesh = vi.fn(async () => ({ triangles: 5000, vertices: 15_000 }));

    await expect(
      meshPreviewWithinBudget(previewLane({ linearTolerance: 1, angularTolerance: 20 }), mesh),
    ).rejects.toThrow(/without a mesh bundle/);
  });
});

describe('smlibpy export tessellation', () => {
  const exportLane = (tessellation: OcctTessellation) =>
    ({
      tessellation,
      explicitDefaults: occtExplicitTessellationDefaults.export,
      budget: 1000,
      measureDiagonal: async () => 8000,
    }) as const;

  it('meshes the high preset within the export budget', async () => {
    const mesh = workerMesh(100);

    const meshed = await meshExportWithinBudget(exportLane('high'), mesh);

    expect(mesh).toHaveBeenCalledExactlyOnceWith({ requested: 'high', linearTolerance: 1, angularTolerance: 12 }, 1000);
    expect(meshed).toMatchObject({
      artifact: bundle,
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
    expect(refusal).toBeInstanceOf(SmlibpyTessellationRefusal);
    expect((refusal as SmlibpyTessellationRefusal).issue).toMatchObject({
      code: 'RESOURCE_LIMIT',
      severity: 'error',
      details: { producer: 'smlibpy', suggested: { linearTolerance: 4 }, triangles: 4000, budget: 1000 },
    });
  });
});
