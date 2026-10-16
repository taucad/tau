// @vitest-environment node
/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- vitest asymmetric matchers return any */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ExportResult, Rendering } from '@taucad/runtime';
import { assertRenderingSuccess, createTestRuntimeClient } from '@taucad/runtime-testing';
import { esbuildBundler } from '@taucad/esbuild';
import { defineRuntime } from '@taucad/runtime/worker';
import { initOcct, occtExplicitTessellationDefaults } from '@taucad/occt-core';
import type { OpenCascadeInstance } from 'libcascade/init';
import { opencascadeKernel } from '#opencascade.kernel.js';
import { measureShapesDiagonal, renderShapesWithinBudget } from '#opencascade-mesh.js';

const sphere = (radius: number): string =>
  `import { BRepPrimAPI_MakeSphere } from 'libcascade';
export default function main() { return new BRepPrimAPI_MakeSphere(${String(radius)}).Shape(); }`;

const runtime = () => defineRuntime({ kernels: [opencascadeKernel()], bundlers: [esbuildBundler()] });

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

describe('OpenCascade tessellation request (R1)', () => {
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
    // The first case of the file initialises OpenCASCADE.
  }, 60_000);

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

describe('OpenCascade tessellation presets (P2)', () => {
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
    // The radius 500 case is evidence-only (about 45 s); a tenfold scale shows the same law.
    const small = reportOf(await renderModel(sphere(5), { tessellation: { linearTolerance: 0.01 } }));
    const large = reportOf(await renderModel(sphere(50), { tessellation: { linearTolerance: 0.01 } }));
    expect(small).toMatchObject({ requested: 'explicit', linearTolerance: 0.01, angularTolerance: 20, downgraded: 0 });
    expect(large.linearTolerance).toBe(0.01);
    expect(large.triangles / small.triangles).toBeGreaterThan(8);
    expect(large.triangles / small.triangles).toBeLessThan(12);
  }, 60_000);
});

describe('OpenCascade preview budget (P4)', () => {
  let oc: OpenCascadeInstance;

  beforeAll(async () => {
    const bindings = await import('libcascade/single/init');
    oc = await initOcct(new URL(import.meta.resolve('libcascade/wasm')).href, bindings.default);
  });

  it('coarsens an over-budget preview one step at a time and reports the downgrade', async () => {
    const maker = new oc.BRepPrimAPI_MakeSphere(50);
    const shape = maker.Shape();
    const shapes = [{ name: 'Sphere', shape }];
    const request = { tessellation: 'medium', explicitDefaults: occtExplicitTessellationDefaults.preview } as const;
    const fitted = await renderShapesWithinBudget(oc, shapes, { request, budget: Number.POSITIVE_INFINITY });
    const budget = Math.floor(fitted.tessellation.triangles / 3);
    const budgeted = await renderShapesWithinBudget(oc, shapes, { request, budget });

    expect(fitted.issues).toEqual([]);
    expect(fitted.tessellation.downgraded).toBe(0);
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
          producer: 'opencascade',
          requested: { form: 'medium', linearTolerance: fitted.tessellation.linearTolerance, angularTolerance: 20 },
          effective: {
            linearTolerance: budgeted.tessellation.linearTolerance,
            angularTolerance: budgeted.tessellation.angularTolerance,
          },
          downgraded: steps,
          triangles: budgeted.tessellation.triangles,
          budget,
        }),
      }),
    ]);
    shape.delete();
    maker.delete();
  });

  it('measures the diagonal of every shape together from the B-rep', () => {
    const nearMaker = new oc.BRepPrimAPI_MakeBox(10, 10, 10);
    const near = nearMaker.Shape();
    const corner = new oc.gp_Pnt(90, 0, 0);
    const farMaker = new oc.BRepPrimAPI_MakeBox(corner, 10, 10, 10);
    const far = farMaker.Shape();
    const empty = new oc.TopoDS_Shape();
    expect(
      measureShapesDiagonal(oc, [
        { name: 'near', shape: near },
        { name: 'far', shape: far },
        { name: 'null', shape: empty },
      ]),
    ).toBeCloseTo(Math.hypot(100, 10, 10), 6);
    expect(measureShapesDiagonal(oc, [])).toBeNaN();
    expect(measureShapesDiagonal(oc, [{ name: 'null', shape: empty }])).toBeNaN();
    for (const handle of [near, nearMaker, far, farMaker, corner, empty]) {
      handle.delete();
    }
  });
});
