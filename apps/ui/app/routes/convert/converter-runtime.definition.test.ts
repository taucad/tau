// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { resolveRuntimeDefinition } from '@taucad/runtime/worker';
import { createConverterSource } from '@taucad/converter/contracts';
import { base64ToUint8Array } from 'uint8array-extras';
import { converterExportFormats, converterImportFormats, converterRuntime } from '@taucad/converter/runtime';
import type { ConverterRuntimeClient } from '@taucad/converter/runtime';
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
    await client.connect();
    const bytes = base64ToUint8Array(cubeGlbBase64);
    const document = client.open({ source: { files: { 'cube.glb': bytes }, entry: 'cube.glb' }, watch: false });
    const outcome = await document.evaluation();
    expect(outcome.superseded).toBe(false);
    expect(outcome.superseded || outcome.evaluation.success).toBe(true);

    const [glb, gltf] = await Promise.all([document.export('glb'), document.export('gltf')]);
    expect(glb.success && glb.files.length > 0).toBe(true);
    expect(gltf.success && gltf.files.length > 0).toBe(true);
    document.close();

    const manifestTargets = [...new Set(client.capabilities?.routes.map((route) => route.targetFormat))];
    expect(converterExportFormats).toEqual(manifestTargets);
  });
});
