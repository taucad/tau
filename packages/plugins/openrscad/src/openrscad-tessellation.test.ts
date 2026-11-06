// @vitest-environment node
/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- vitest asymmetric matchers return any */
import { afterAll, describe, expect, it } from 'vitest';
import type { ExportResult, Rendering } from '@taucad/runtime';
import { assertRenderingSuccess, createTestRuntimeClient } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';
import { openrscadKernel, openrscadRenderSchema } from '#openrscad.kernel.js';
import {
  openrscadTessellationQualities,
  resolveOpenrscadRequest,
  resolveOpenrscadTessellation,
  scriptOwnedResolution,
} from '#openrscad-tessellation.js';

const sphere = (radius: number): string => `sphere(${String(radius)});`;

const clients: Array<{ shutdown: () => Promise<void> }> = [];

const open = (code: string) => {
  const client = createTestRuntimeClient({
    runtime: defineRuntime({ kernels: [openrscadKernel()] }),
    files: { 'main.scad': code },
  });
  clients.push(client);
  return client.open({ source: { path: 'main.scad' }, parameters: {} });
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

const exportModel = async (code: string, format: 'glb' | '3mf', options: Record<string, unknown>) =>
  open(code).export(format, { options });

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

describe('OpenSCAD tessellation request (R1)', () => {
  it('accepts a preset and explicit $fn/$fs/$fa on render and export', async () => {
    expect(reportOf(await renderModel(sphere(5), { tessellation: 'high' })).requested).toBe('high');
    expect(reportOf(await renderModel(sphere(5), { tessellation: { segments: 24 } })).requested).toBe('explicit');
    const exports = [
      await exportModel(sphere(5), 'glb', { tessellation: 'low' }),
      await exportModel(sphere(5), '3mf', { tessellation: { angularTolerance: 30 } }),
    ];
    expect(exports.map((exported) => issueText(exported))).toEqual(['', '']);
  });

  it('rejects a preset beside explicit values and names both accepted forms', async () => {
    const combined = { quality: 'high', linearTolerance: 0.01 };
    const rendering = await renderModel(sphere(5), { tessellation: combined });
    expect(rendering.success).toBe(false);
    expect(issueText(rendering)).toContain('VIEW_OPTIONS_INVALID');
    expect(issueText(rendering)).toContain(bothForms);

    const exported = await exportModel(sphere(5), 'glb', { tessellation: combined });
    expect(exported.success).toBe(false);
    expect(issueText(exported)).toContain('EXPORT_OPTIONS_INVALID');
    expect(issueText(exported)).toContain(bothForms);
  });

  it('still reads the old names minimumSize and minimumAngle, but never beside the new ones', async () => {
    const legacy = openrscadRenderSchema.parse({ tessellation: { minimumSize: 2, minimumAngle: 12 } }).tessellation;
    expect(resolveOpenrscadTessellation(legacy!, 100)).toEqual({
      requested: 'explicit',
      linearTolerance: 2,
      angularTolerance: 12,
    });
    const report = reportOf(await renderModel(sphere(5), { tessellation: { minimumSize: 2, minimumAngle: 12 } }));
    expect(report).toMatchObject({ requested: 'explicit', linearTolerance: 2, angularTolerance: 12 });
    expect(openrscadRenderSchema.safeParse({ tessellation: { minimumSize: 2, linearTolerance: 2 } }).success).toBe(
      false,
    );
  });
});

describe('OpenSCAD tessellation presets (P2)', () => {
  it('maps a preset to a size-derived $fs and a chord-bounded $fa, leaving $fn to the script', () => {
    const diagonal = 1000;
    for (const quality of openrscadTessellationQualities) {
      const resolved = resolveOpenrscadTessellation(quality, diagonal);
      const divisor = { low: 500, medium: 2000, high: 8000, 'extra-high': 32_000 }[quality];
      expect(resolved.linearTolerance).toBeCloseTo(diagonal / divisor, 9);
      expect(resolved.angularTolerance).toBeCloseTo((2 * Math.acos(1 - 2 / divisor) * 180) / Math.PI, 9);
      expect(resolved.segments).toBeUndefined();
    }
  });

  it('fills only what the script leaves open when the caller gives no tessellation (P6), and wins when it does (P3)', () => {
    const owned = scriptOwnedResolution(['$fa = 2;\nsphere(5);', 'module m() {}\n  $fs = 0.4;']);
    expect([...owned].toSorted()).toEqual(['$fa', '$fs']);
    expect(resolveOpenrscadRequest({ tessellation: undefined, laneDefault: 'medium', diagonal: 100, owned })).toEqual({
      requested: 'medium',
    });
    expect(
      resolveOpenrscadRequest({
        tessellation: undefined,
        laneDefault: 'medium',
        diagonal: 100,
        owned: new Set(['$fn']),
      }),
    ).toEqual({ requested: 'medium' });
    expect(resolveOpenrscadRequest({ tessellation: 'low', laneDefault: 'medium', diagonal: 100, owned })).toMatchObject(
      { requested: 'low', linearTolerance: 0.2 },
    );
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

  it("keeps a script's own $fn whatever the preset", async () => {
    const authored = '$fn = 24; sphere(500);';
    const low = reportOf(await renderModel(authored, { tessellation: 'low' }));
    const fine = reportOf(await renderModel(authored, { tessellation: 'extra-high' }));
    expect(fine.triangles).toBe(low.triangles);
  });
});

describe('OpenSCAD without a triangle budget', () => {
  it('renders a preview once at the requested values, never coarser', async () => {
    const rendering = await renderModel(sphere(50), { tessellation: 'high' });
    const report = reportOf(rendering);
    const medium = reportOf(await renderModel(sphere(50), { tessellation: 'medium' }));
    expect(report.requested).toBe('high');
    expect(report.triangles).toBeGreaterThan(medium.triangles);
    expect(report).not.toHaveProperty('downgraded');
    assertRenderingSuccess(rendering);
    expect(rendering.issues).not.toContainEqual(expect.objectContaining({ code: 'TESSELLATION_DOWNGRADED' }));
  });

  it('exports glb and 3mf at the requested values with no triangle check', async () => {
    for (const format of ['glb', '3mf'] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one export at a time keeps the client count small.
      const exported = await exportModel(sphere(50), format, { tessellation: 'extra-high' });
      expect(issueText(exported)).toBe('');
      expect(exported.success).toBe(true);
    }
  });
});
