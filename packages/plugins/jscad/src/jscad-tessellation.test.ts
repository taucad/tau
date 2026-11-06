// @vitest-environment node
/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- vitest asymmetric matchers return any */
import { afterAll, describe, expect, it } from 'vitest';
import type { ExportResult, Rendering } from '@taucad/runtime';
import { assertRenderingSuccess, createTestRuntimeClient } from '@taucad/runtime-testing';
import { esbuildBundler } from '@taucad/esbuild';
import { defineRuntime } from '@taucad/runtime/worker';
import { jscadKernel } from '#jscad.kernel.js';
import { jscadTessellationQualities, resolveJscadTessellation, withDefaultSegments } from '#jscad-tessellation.js';

const sphere = (radius: number, segments?: number): string =>
  `import { primitives } from '@jscad/modeling';
export default function main() {
  return primitives.sphere({ radius: ${String(radius)}${segments === undefined ? '' : `, segments: ${String(segments)}`} });
}`;

const clients: Array<{ shutdown: () => Promise<void> }> = [];

const open = (code: string) => {
  const client = createTestRuntimeClient({
    runtime: defineRuntime({ kernels: [jscadKernel()], bundlers: [esbuildBundler()] }),
    files: { 'main.ts': code },
  });
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

describe('JSCAD tessellation request (R1)', () => {
  it('accepts a preset and explicit segments on render and export', async () => {
    expect(reportOf(await renderModel(sphere(5), { tessellation: 'high' })).requested).toBe('high');
    expect(reportOf(await renderModel(sphere(5), { tessellation: { segments: 24 } })).requested).toBe('explicit');
    const exports = [
      await exportModel(sphere(5), { tessellation: 'low' }),
      await exportModel(sphere(5), { tessellation: { segments: 8 } }),
    ];
    expect(exports.map((exported) => issueText(exported))).toEqual(['', '']);
  });

  it('rejects a preset beside explicit segments and names both accepted forms', async () => {
    const combined = { quality: 'high', segments: 64 };
    const rendering = await renderModel(sphere(5), { tessellation: combined });
    expect(rendering.success).toBe(false);
    expect(issueText(rendering)).toContain('VIEW_OPTIONS_INVALID');
    expect(issueText(rendering)).toContain(bothForms);

    const exported = await exportModel(sphere(5), { tessellation: combined });
    expect(exported.success).toBe(false);
    expect(issueText(exported)).toContain('EXPORT_OPTIONS_INVALID');
    expect(issueText(exported)).toContain(bothForms);
  });
});

describe('JSCAD tessellation presets (P2)', () => {
  it('maps the presets to 16, 32, 64 and 128 default segments', () => {
    expect(jscadTessellationQualities.map((quality) => resolveJscadTessellation(quality).segments)).toEqual([
      16, 32, 64, 128,
    ]);
    expect(resolveJscadTessellation({ segments: 12 })).toEqual({ requested: 'explicit', segments: 12 });
  });

  it("fills only the segments a primitive call leaves out, and nothing with JSCAD's own default", () => {
    const calls: unknown[] = [];
    let active: number | undefined = 64;
    const wrapped = withDefaultSegments(
      {
        sphere: (options: unknown) => calls.push(options),
        torus: (options?: unknown) => calls.push(options),
        cuboid: (options: unknown) => calls.push(options),
      },
      () => active,
    );
    wrapped.sphere({ radius: 2 });
    wrapped.sphere({ radius: 2, segments: 8 });
    wrapped.torus();
    wrapped.cuboid({ size: [1, 1, 1] });
    active = undefined;
    wrapped.sphere({ radius: 2 });
    expect(calls).toEqual([
      { radius: 2, segments: 64 },
      { radius: 2, segments: 8 },
      { innerSegments: 64, outerSegments: 64 },
      { size: [1, 1, 1] },
      { radius: 2 },
    ]);
  });

  it('renders medium as the model is written', async () => {
    const medium = reportOf(await renderModel(sphere(5)));
    const written = reportOf(await renderModel(sphere(5, 32), { tessellation: 'extra-high' }));
    expect(medium.requested).toBe('medium');
    expect(medium.triangles).toBe(written.triangles);
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
});

describe('JSCAD without a triangle budget', () => {
  it('renders a preview once at the requested segments, never coarser', async () => {
    const rendering = await renderModel(sphere(50), { tessellation: 'extra-high' });
    const report = reportOf(rendering);
    const written = reportOf(await renderModel(sphere(50, 128)));
    expect(report).toMatchObject({ requested: 'extra-high', triangles: written.triangles });
    expect(report).not.toHaveProperty('downgraded');
    assertRenderingSuccess(rendering);
    expect(rendering.issues).not.toContainEqual(expect.objectContaining({ code: 'TESSELLATION_DOWNGRADED' }));
  });

  it('exports at the requested segments with no triangle check', async () => {
    const exported = await exportModel(sphere(50), { tessellation: 'extra-high' });
    expect(issueText(exported)).toBe('');
    expect(exported.success).toBe(true);
  });
});
