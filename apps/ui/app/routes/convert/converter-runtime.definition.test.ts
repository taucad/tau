// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { resolveRuntimeDefinition } from '@taucad/runtime/worker';
import {
  converterExportFormats,
  converterImportFormats,
  converterRuntime,
  createConverterSource,
  type ConverterRuntimeClient,
} from '#routes/convert/converter-runtime.definition.js';
import cubeGlbBase64 from '#routes/_index/assets/gear-8.glb?base64';

vi.mock('draco3dgltf', () => ({
  default: {
    createDecoderModule: vi.fn(async () => ({})),
    createEncoderModule: vi.fn(async () => ({})),
  },
}));

describe('converter runtime definition', () => {
  let client: ConverterRuntimeClient | undefined;

  afterEach(() => {
    client?.terminate();
    client = undefined;
  });

  it('rejects duplicate staged runtime paths', () => {
    const bytes = new Uint8Array(new ArrayBuffer(1));
    expect(() =>
      createConverterSource(
        [
          ['model.gltf', bytes],
          ['model.gltf', bytes],
        ],
        'model.gltf',
      ),
    ).toThrow('duplicate runtime paths');
  });

  it('keeps derived imports and exports aligned with the worker capabilities', { timeout: 30_000 }, async () => {
    const resolved = await resolveRuntimeDefinition(converterRuntime, undefined);
    const resolvedImports = [...new Set(resolved.kernels.flatMap((kernel) => kernel.extensions))].filter(
      (extension) => extension !== '*',
    );
    expect(converterImportFormats).toEqual(resolvedImports);

    client = createRuntimeClient<typeof converterRuntime>({
      transport: inProcessTransport({ runtime: converterRuntime, fileSystem: fromMemoryFs() }),
    });
    const bytes = Uint8Array.from(atob(cubeGlbBase64), (character) => character.charCodeAt(0));
    const outcome = await client.render({ source: { files: { 'cube.glb': bytes }, entry: 'cube.glb' } });
    expect(outcome.superseded).toBe(false);
    expect(outcome.superseded || outcome.geometry.success).toBe(true);

    const source = { files: { 'cube.glb': bytes }, entry: 'cube.glb' } as const;
    const [glb, gltf] = await Promise.all([client.export('glb', { source }), client.export('gltf', { source })]);
    expect(glb.success && glb.data.length > 0).toBe(true);
    expect(gltf.success && gltf.data.length > 0).toBe(true);

    const manifestTargets = [...new Set(client.capabilities?.routes.map((route) => route.targetFormat))];
    expect(converterExportFormats).toEqual(manifestTargets);
  });
});
