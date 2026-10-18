// @vitest-environment node
/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- vitest asymmetric matchers return any */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ExportResult, Rendering } from '@taucad/runtime';
import { assertRenderingSuccess, createTestRuntimeClient } from '@taucad/runtime-testing';
import { esbuildBundler } from '@taucad/esbuild';
import { defineRuntime } from '@taucad/runtime/worker';
import { occtExplicitTessellationDefaults } from '@taucad/occt-core';
import { replicadKernel } from '#replicad.kernel.js';
import type { GeometryReplicad } from '#replicad.types.js';
import { measureShapesDiagonal, renderWithinBudget } from '#utils/render-output.js';

const sphere = (radius: number): string =>
  `import { makeSphere } from 'replicad'; export default function main() { return makeSphere(${String(radius)}); }`;
const filletedPlate = `import { drawRoundedRectangle } from 'replicad';
export default function main() { return drawRoundedRectangle(50, 30, 5).sketchOnPlane().extrude(10).fillet(2); }`;

const runtime = () => defineRuntime({ kernels: [replicadKernel({ wasm: 'single' })], bundlers: [esbuildBundler()] });

const clients: Array<{ shutdown: () => Promise<void> }> = [];

const open = (code: string) => {
  const client = createTestRuntimeClient({ runtime: runtime(), files: { 'main.ts': code } });
  clients.push(client);
  return client.open({ source: { path: 'main.ts' }, parameters: {} });
};

const renderModel = async (code: string, options?: Record<string, unknown>): Promise<Rendering> => {
  const document = open(code);
  const view = document.view('model', options === undefined ? {} : { options });
  const outcome = await view.rendering();
  view.close();
  if (outcome.superseded) {
    throw new Error('Render was superseded');
  }
  return outcome.rendering;
};

const exportModel = async (
  code: string,
  format: 'stl' | 'glb',
  options: Record<string, unknown>,
): Promise<ExportResult> => open(code).export(format, { options });

const reportOf = (rendering: Rendering) => {
  assertRenderingSuccess(rendering);
  const report = rendering.artifact.tessellation;
  if (report === undefined) {
    throw new Error('Rendering carries no tessellation report');
  }
  return report;
};

const issueText = (outcome: Rendering | ExportResult): string =>
  outcome.success ? '' : outcome.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n');

const bothForms = "tessellation is a preset ('low' | 'medium' | 'high' | 'extra-high') or an explicit object";

afterAll(async () => {
  await Promise.all(clients.map(async (client) => client.shutdown()));
});

describe('Replicad tessellation request (R1)', () => {
  it('accepts a preset and explicit tolerances on render and export', async () => {
    expect(reportOf(await renderModel(sphere(5), { tessellation: 'high' })).requested).toBe('high');
    expect(reportOf(await renderModel(sphere(5), { tessellation: { linearTolerance: 0.05 } })).requested).toBe(
      'explicit',
    );
    const exports = [
      await exportModel(sphere(5), 'glb', { tessellation: 'low' }),
      await exportModel(sphere(5), 'stl', { tessellation: { angularTolerance: 30 } }),
      await exportModel(sphere(5), 'stl', { tessellation: 'low', binary: false }),
    ];
    expect(exports.map((exported) => issueText(exported))).toEqual(['', '', '']);
  });

  it('rejects a preset beside explicit tolerances and names both accepted forms', async () => {
    const combined = { quality: 'high', linearTolerance: 0.01 };
    const rendering = await renderModel(sphere(5), { tessellation: combined });
    expect(rendering.success).toBe(false);
    expect(issueText(rendering)).toContain('VIEW_OPTIONS_INVALID');
    expect(issueText(rendering)).toContain(bothForms);

    const exported = await exportModel(sphere(5), 'stl', { tessellation: combined });
    expect(exported.success).toBe(false);
    expect(issueText(exported)).toContain('EXPORT_OPTIONS_INVALID');
    expect(issueText(exported)).toContain(bothForms);
  });
});

describe('Replicad tessellation presets (P2)', () => {
  it('reports the requested form and the effective tolerances', async () => {
    const report = reportOf(await renderModel(sphere(5)));
    expect(report).toMatchObject({ requested: 'medium', angularTolerance: 20, downgraded: 0 });
    // Bounding-box diagonal of a radius-5 sphere is 10 * sqrt(3) mm; medium divides it by 2000.
    expect(report.linearTolerance).toBeCloseTo((10 * Math.sqrt(3)) / 2000, 6);
    expect(report.triangles).toBeGreaterThan(0);
    expect(report.vertices).toBeGreaterThan(0);
    expect(report.elapsed).toBeGreaterThanOrEqual(0);
  });

  it('keeps the triangle count of a preset within 20 % across a hundredfold scale', async () => {
    const small = reportOf(await renderModel(sphere(5), { tessellation: 'medium' }));
    const large = reportOf(await renderModel(sphere(500), { tessellation: 'medium' }));
    expect(large.linearTolerance! / small.linearTolerance!).toBeCloseTo(100, 6);
    expect(Math.abs(large.triangles - small.triangles) / small.triangles).toBeLessThanOrEqual(0.2);
  });

  it('keeps explicit tolerances absolute: triangle count grows with the radius', async () => {
    // The radius 500 case is evidence-only (about 50 s); a tenfold scale shows the same law.
    const small = reportOf(await renderModel(sphere(5), { tessellation: { linearTolerance: 0.01 } }));
    const large = reportOf(await renderModel(sphere(50), { tessellation: { linearTolerance: 0.01 } }));
    expect(large.linearTolerance).toBe(0.01);
    expect(large.triangles / small.triangles).toBeGreaterThan(8);
    expect(large.triangles / small.triangles).toBeLessThan(12);
  }, 60_000);

  it("meshes explicit tolerances exactly as replicad's absolute mesher does", async () => {
    const tessellation = { linearTolerance: 0.05, angularTolerance: 15 };
    const exported = await exportModel(filletedPlate, 'stl', { tessellation, coordinateSystem: 'z-up' });
    if (!exported.success) {
      throw new Error(issueText(exported));
    }
    const { drawRoundedRectangle } = await import('replicad');
    const plate = drawRoundedRectangle(50, 30, 5).sketchOnPlane().extrude(10).fillet(2);
    const direct = new Uint8Array(
      await plate.blobSTL({ tolerance: 0.05, angularTolerance: (15 * Math.PI) / 180, binary: true }).arrayBuffer(),
    );
    expect(exported.files[0].bytes).toEqual(direct);

    const report = reportOf(await renderModel(filletedPlate, { tessellation }));
    const mesh = plate.mesh({ tolerance: 0.05, angularTolerance: (15 * Math.PI) / 180 });
    expect(report).toMatchObject({
      requested: 'explicit',
      linearTolerance: 0.05,
      angularTolerance: 15,
      downgraded: 0,
      triangles: mesh.triangles.length / 3,
      vertices: mesh.vertices.length / 3,
    });
    plate.delete();
  });
});

describe('Replicad preview budget (P4)', () => {
  beforeAll(async () => {
    // Loads OpenCASCADE into the replicad module the direct calls below use.
    assertRenderingSuccess(await renderModel(sphere(1)));
  });

  it('coarsens an over-budget preview one step at a time and reports the downgrade', async () => {
    const { makeSphere } = await import('replicad');
    const shape = makeSphere(50);
    const request = { tessellation: 'medium', explicitDefaults: occtExplicitTessellationDefaults.preview } as const;
    const fitted = renderWithinBudget([{ name: 'Sphere', shape }], { request, budget: Number.POSITIVE_INFINITY });
    const budget = Math.floor(fitted.tessellation.triangles / 3);
    const budgeted = renderWithinBudget([{ name: 'Sphere', shape }], { request, budget });

    expect(fitted.issues).toEqual([]);
    expect(budgeted.tessellation.downgraded).toBeGreaterThanOrEqual(1);
    expect(budgeted.tessellation.downgraded).toBeLessThanOrEqual(3);
    expect(budgeted.tessellation.triangles).toBeLessThan(fitted.tessellation.triangles);
    const steps = budgeted.tessellation.downgraded!;
    expect(budgeted.tessellation.linearTolerance).toBeCloseTo(fitted.tessellation.linearTolerance! * 2 ** steps, 9);
    expect(budgeted.tessellation.angularTolerance).toBe(20 + 4 * steps);
    expect(budgeted.issues).toEqual([
      expect.objectContaining({
        code: 'TESSELLATION_DOWNGRADED',
        severity: 'warning',
        details: expect.objectContaining({
          producer: 'replicad',
          requested: { form: 'medium', linearTolerance: fitted.tessellation.linearTolerance, angularTolerance: 20 },
          effective: {
            linearTolerance: budgeted.tessellation.linearTolerance,
            angularTolerance: budgeted.tessellation.angularTolerance,
          },
          downgraded: steps,
        }),
      }),
    ]);
    shape.delete();
  });

  it('keeps every tessellated mesh in typed arrays, instanced copies included', async () => {
    const replicad = await import('replicad');
    const original = replicad.makeBox([0, 0, 0], [10, 10, 10]);
    const copy = original.clone().translate([20, 0, 0]);
    const { geometries } = renderWithinBudget(
      [
        { name: 'original', shape: original },
        { name: 'copy', shape: copy },
      ],
      {
        request: { tessellation: 'medium', explicitDefaults: occtExplicitTessellationDefaults.preview },
        budget: Number.POSITIVE_INFINITY,
        openCascade: replicad.getOC(),
        collectBrepEdges: true,
        tessellationInstancing: true,
      },
    );

    const meshes = geometries.filter((geometry): geometry is GeometryReplicad => geometry.format === 'replicad');
    expect(meshes).toHaveLength(2);
    for (const { faces, edges } of meshes) {
      expect(faces.vertices).toBeInstanceOf(Float32Array);
      expect(faces.normals).toBeInstanceOf(Float32Array);
      expect(faces.triangles).toBeInstanceOf(Uint32Array);
      expect(edges.lines).toBeInstanceOf(Float32Array);
      expect(faces.triangles.length).toBeGreaterThan(0);
      expect(edges.lines.length).toBeGreaterThan(0);
    }
    original.delete();
    copy.delete();
  });

  it('measures the diagonal of every meshable shape together', async () => {
    const { makeBox, makeCompound } = await import('replicad');
    const near = makeBox([0, 0, 0], [10, 10, 10]);
    const far = makeBox([90, 0, 0], [100, 10, 10]);
    expect(
      measureShapesDiagonal([
        { name: 'near', shape: near },
        { name: 'far', shape: far },
      ]),
    ).toBeCloseTo(Math.hypot(100, 10, 10), 6);
    expect(measureShapesDiagonal([])).toBeNaN();
    const empty = makeCompound([]);
    expect(measureShapesDiagonal([{ name: 'empty', shape: empty }])).toBeNaN();
    for (const shape of [near, far, empty]) {
      shape.delete();
    }
  });
});
