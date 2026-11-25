/* oxlint-disable @typescript-eslint/no-unsafe-assignment -- defineKernel intentionally erases private backend context */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { getBounds, WebIO } from '@gltf-transform/core';
import { createMockKernelRuntime, validateGlbData } from '@taucad/runtime-testing';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

import { cadmpegKernel } from '#cadmpeg.kernel.js';

const definition = await resolveRuntimePluginDefinition('kernel', cadmpegKernel());
const runtime = createMockKernelRuntime();
let context!: Awaited<ReturnType<typeof definition.initialize>>;

const useEntry = (name: string, bytes: Uint8Array<ArrayBuffer>): void => {
  runtime.filesystem.mocks.readdir.mockResolvedValueOnce([name]);
  runtime.filesystem.mocks.stat.mockResolvedValueOnce({ type: 'file', size: bytes.length, mtimeMs: 0 });
  runtime.filesystem.mocks.readFile.mockResolvedValue(bytes);
};

beforeAll(async () => {
  context = await definition.initialize({}, runtime);
}, 60_000);

describe('cadmpegKernel', () => {
  it('claims the native formats and nothing the STEP kernels own', () => {
    expect(cadmpegKernel()).toMatchObject({
      id: 'cadmpeg',
      views: { model: { mimeType: 'model/gltf-binary' } },
      exports: { glb: { extension: 'glb', mimeType: 'model/gltf-binary' } },
    });
    expect(cadmpegKernel().extensions).toEqual(
      expect.arrayContaining(['sldprt', 'catpart', 'ipt', 'f3d', 'fcstd', '3dm', 'sat', 'pvz']),
    );
    expect(cadmpegKernel().extensions).not.toEqual(expect.arrayContaining(['step']));
    expect(cadmpegKernel().extensions).not.toContain('iges');
    expect(cadmpegKernel().extensions).not.toContain('usd');
  });

  it('observes the OCCT heap after initialize', () => {
    const observed = definition.observedHeapBytes?.(context);
    expect(observed).toBe(context.occt.HEAPU8.byteLength);
    expect(observed).toBeGreaterThan(0);
  });

  it('imports a SOLIDWORKS part through STEP and reports its losses as warnings', async () => {
    const bytes = new Uint8Array(readFileSync(new URL('fixtures/ftc06.sldprt', import.meta.url)));
    useEntry('ftc06.sldprt', bytes);

    const result = await definition.evaluate(
      { entryPath: 'ftc06.sldprt', parameters: {}, options: {} },
      runtime,
      context,
    );
    const artifact = await definition.render!({ handle: result.handle, view: 'model', options: {} }, runtime, context);
    const glb = artifact.content as Uint8Array<ArrayBuffer>;
    validateGlbData(glb);

    const document = await new WebIO().readBinary(glb);
    const bounds = getBounds(document.getRoot().listScenes()[0]!);
    const extent = Math.max(...bounds.max.map((max, axis) => max - bounds.min[axis]!));
    // FTC 06 is about 200 mm across: glTF is in meters.
    expect(extent).toBeGreaterThan(0.05);
    expect(extent).toBeLessThan(1);

    const issues = result.issues ?? [];
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(issue).toMatchObject({ code: 'REPRESENTATION_UNSUPPORTED', type: 'kernel' });
      expect(['info', 'warning']).toContain(issue.severity);
      expect(issue.details).toMatchObject({ cadmpegCode: expect.stringContaining('/') });
    }
  }, 120_000);

  it('round-trips its handle and exports GLB', async () => {
    const bytes = new Uint8Array(readFileSync(new URL('fixtures/ftc06.sldprt', import.meta.url)));
    useEntry('ftc06.sldprt', bytes);
    const result = await definition.evaluate(
      { entryPath: 'ftc06.sldprt', parameters: {}, options: {} },
      runtime,
      context,
    );
    const serialized = definition.serializeHandle!({ handle: result.handle }, runtime, context);
    const restored = definition.deserializeHandle!({ serialized }, runtime, context);
    expect(restored).toEqual(result.handle);

    const exported = await definition.export!(
      { exportId: 'glb', handle: restored, options: { coordinateSystem: 'z-up', unit: { length: 'millimeter' } } },
      runtime,
      context,
    );
    expect(exported.files[0]).toMatchObject({ name: 'model.glb' });
    validateGlbData(exported.files[0].bytes);
    await expect(
      definition.export!(
        { exportId: 'glb', handle: new Uint8Array(), options: { coordinateSystem: 'y-up', unit: { length: 'meter' } } },
        runtime,
        context,
      ),
    ).rejects.toThrow('No geometry available for export.');
  }, 120_000);

  it('names cadmpeg’s code when a file cannot be read', async () => {
    useEntry('broken.sldprt', new Uint8Array(64));
    await expect(
      definition.evaluate({ entryPath: 'broken.sldprt', parameters: {}, options: {} }, runtime, context),
    ).rejects.toThrow(/^cadmpeg [A-Z_]+/u);
  }, 60_000);
});
