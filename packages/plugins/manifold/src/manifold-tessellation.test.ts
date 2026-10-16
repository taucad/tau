// @vitest-environment node
/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- vitest asymmetric matchers return any */
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { ExportResult, Rendering } from '@taucad/runtime';
import { assertRenderingSuccess, createTestRuntimeClient } from '@taucad/runtime-testing';
import { esbuildBundler } from '@taucad/esbuild';
import { defineRuntime } from '@taucad/runtime/worker';
import { manifoldKernel } from '#manifold.kernel.js';
import {
  createManifoldTessellationBudgetExceededIssue,
  manifoldTessellationQualities,
  meshWithinManifoldBudget,
  resolveManifoldTessellation,
} from '#manifold-tessellation.js';
import type * as TessellationModule from '#manifold-tessellation.js';

const budgets = vi.hoisted(() => ({ preview: 2_000_000, export: 20_000_000 }));

vi.mock('#manifold-tessellation.js', async (importOriginal) => {
  const original = await importOriginal<typeof TessellationModule>();
  return { ...original, manifoldTriangleBudgets: budgets };
});

const sphere = (radius: number): string =>
  `import { Manifold } from 'manifold-3d/manifoldCAD'; export default () => Manifold.sphere(${String(radius)});`;

const runtime = () => defineRuntime({ kernels: [manifoldKernel()], bundlers: [esbuildBundler()] });

const clients: Array<{ shutdown: () => Promise<void> }> = [];

const open = (code: string) => {
  const client = createTestRuntimeClient({ runtime: runtime(), files: { 'main.ts': code } });
  clients.push(client);
  return client.open({ source: { path: 'main.ts' }, parameters: {} });
};

const renderModel = async (code: string, options?: Record<string, unknown>): Promise<Rendering> => {
  const view = open(code).view('model', options === undefined ? {} : { options });
  const outcome = await view.rendering();
  view.close();
  if (outcome.superseded) {
    throw new Error('Render was superseded');
  }
  return outcome.rendering;
};

const exportModel = async (code: string, options: Record<string, unknown>): Promise<ExportResult> =>
  open(code).export('glb', { options });

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

describe('Manifold tessellation request (R1)', () => {
  it('accepts a preset and explicit circular detail on render and export', async () => {
    expect(reportOf(await renderModel(sphere(5), { tessellation: 'high' })).requested).toBe('high');
    expect(reportOf(await renderModel(sphere(5), { tessellation: { segments: 24 } })).requested).toBe('explicit');
    const exports = [
      await exportModel(sphere(5), { tessellation: 'low' }),
      await exportModel(sphere(5), { tessellation: { angularTolerance: 30 } }),
    ];
    expect(exports.map((exported) => issueText(exported))).toEqual(['', '']);
  });

  it('rejects a preset beside explicit values and names both accepted forms', async () => {
    const combined = { quality: 'high', linearTolerance: 0.01 };
    const rendering = await renderModel(sphere(5), { tessellation: combined });
    expect(rendering.success).toBe(false);
    expect(issueText(rendering)).toContain('VIEW_OPTIONS_INVALID');
    expect(issueText(rendering)).toContain(bothForms);

    const exported = await exportModel(sphere(5), { tessellation: combined });
    expect(exported.success).toBe(false);
    expect(issueText(exported)).toContain('EXPORT_OPTIONS_INVALID');
    expect(issueText(exported)).toContain(bothForms);
  });

  it('rejects an empty explicit object', async () => {
    const rendering = await renderModel(sphere(5), { tessellation: {} });
    expect(issueText(rendering)).toContain('VIEW_OPTIONS_INVALID');
  });
});

describe('Manifold tessellation presets (P2)', () => {
  it('maps a preset to a size-derived edge length and a chord-bounded angle', () => {
    const diagonal = 1000;
    for (const quality of manifoldTessellationQualities) {
      const resolved = resolveManifoldTessellation(quality, diagonal);
      const divisor = { low: 500, medium: 2000, high: 8000, 'extra-high': 32_000 }[quality];
      expect(resolved.linearTolerance).toBeCloseTo(diagonal / divisor, 9);
      // The chord of an angle θ on a circle of radius D / 2 deviates by (D / 2)(1 − cos(θ / 2)).
      const chordAngle = (2 * Math.acos(1 - 2 / divisor) * 180) / Math.PI;
      expect(resolved.angularTolerance).toBeCloseTo(chordAngle, 9);
      expect(resolved.segments).toBeUndefined();
    }
    expect(resolveManifoldTessellation('low', Number.NaN)).toEqual({
      requested: 'low',
      linearTolerance: 50,
      angularTolerance: 30,
    });
  });

  it("fills an explicit object's missing fields with Manifold's defaults", () => {
    expect(resolveManifoldTessellation({ segments: 24 }, 100)).toEqual({
      requested: 'explicit',
      segments: 24,
      linearTolerance: 1,
      angularTolerance: 10,
    });
  });

  it('reports the requested form and the effective detail', async () => {
    const report = reportOf(await renderModel(sphere(5)));
    expect(report).toMatchObject({ requested: 'medium', downgraded: 0 });
    expect(report.linearTolerance).toBeCloseTo((10 * Math.sqrt(3)) / 2000, 6);
    expect(report.triangles).toBeGreaterThan(0);
    expect(report.vertices).toBeGreaterThan(0);
    expect(report.elapsed).toBeGreaterThanOrEqual(0);
  });

  it('keeps the triangle count of a preset within 20 % across a hundredfold scale', async () => {
    const small = reportOf(await renderModel(sphere(5), { tessellation: 'medium' }));
    const large = reportOf(await renderModel(sphere(500), { tessellation: 'medium' }));
    expect(Math.abs(large.triangles - small.triangles) / small.triangles).toBeLessThanOrEqual(0.2);
  });

  it('meshes a radius-500 sphere under 2,000 triangles at low and over 10,000 at extra-high', async () => {
    expect(reportOf(await renderModel(sphere(500), { tessellation: 'low' })).triangles).toBeLessThan(2000);
    expect(reportOf(await renderModel(sphere(500), { tessellation: 'extra-high' })).triangles).toBeGreaterThan(10_000);
  });

  it("keeps a model's own segment count over any preset", async () => {
    const authored = `import { Manifold } from 'manifold-3d/manifoldCAD'; export default () => Manifold.sphere(500, 16);`;
    const low = reportOf(await renderModel(authored, { tessellation: 'low' }));
    const fine = reportOf(await renderModel(authored, { tessellation: 'extra-high' }));
    expect(fine.triangles).toBe(low.triangles);
  });
});

describe('Manifold triangle budget (P4)', () => {
  it('coarsens one step at a time, at most three times', async () => {
    const seen: number[] = [];
    const outcome = await meshWithinManifoldBudget({
      detail: { linearTolerance: 1, angularTolerance: 2, segments: 64 },
      budget: 10,
      async mesh(detail) {
        seen.push(detail.angularTolerance);
        return { triangles: 100 };
      },
    });
    expect(seen).toEqual([2, 6, 10, 14]);
    expect(outcome).toEqual({
      result: { triangles: 100 },
      effective: { segments: 8, linearTolerance: 8, angularTolerance: 14 },
      downgraded: 3,
    });
  });

  it('downgrades an over-budget preview and reports it', async () => {
    const fitted = reportOf(await renderModel(sphere(50), { tessellation: 'high' }));
    budgets.preview = Math.floor(fitted.triangles / 2);
    try {
      const rendering = await renderModel(sphere(50), { tessellation: 'high' });
      const report = reportOf(rendering);
      expect(report.downgraded).toBeGreaterThanOrEqual(1);
      expect(report.triangles).toBeLessThanOrEqual(budgets.preview);
      expect(report.angularTolerance).toBeCloseTo(fitted.angularTolerance! + 4 * report.downgraded!, 9);
      assertRenderingSuccess(rendering);
      expect(rendering.issues).toEqual([
        expect.objectContaining({
          code: 'TESSELLATION_DOWNGRADED',
          severity: 'warning',
          details: expect.objectContaining({ producer: 'manifold', downgraded: report.downgraded }),
        }),
      ]);
    } finally {
      budgets.preview = 2_000_000;
    }
  });

  it('refuses an over-budget export with RESOURCE_LIMIT instead of coarsening it', async () => {
    budgets.export = 100;
    try {
      const exported = await exportModel(sphere(50), { tessellation: 'high' });
      expect(exported.success).toBe(false);
      // The kernel throws a `RESOURCE_LIMIT` issue; the runtime's export boundary keeps only its message.
      expect(issueText(exported)).toContain('over the 100-triangle export budget');
      expect(issueText(exported)).toContain('Exports are never coarsened silently');
    } finally {
      budgets.export = 20_000_000;
    }
    const issue = createManifoldTessellationBudgetExceededIssue({
      requested: { requested: 'explicit', linearTolerance: 1, angularTolerance: 10 },
      triangles: 30_000_000,
      budget: 20_000_000,
    });
    expect(issue.code).toBe('RESOURCE_LIMIT');
    expect(issue.details).toMatchObject({ suggested: { linearTolerance: 2, angularTolerance: 14 } });
  });
});
