import { createRuntimeClient, defineRuntime } from '@taucad/runtime';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import type { ExportFile } from '@taucad/runtime/types';
import { describe, it } from 'vitest';

import { gltf } from '#gltf.plugin.js';

describe('glTF transcoder types', () => {
  it('projects all four codec routes onto RuntimeClient', () => {
    const runtime = defineRuntime({ plugins: [gltf()] });
    const client = createRuntimeClient({ transport: inProcessTransport({ runtime }) });
    const files: ExportFile[] = [{ name: 'model.glb', bytes: new Uint8Array([1]), mimeType: 'model/gltf-binary' }];

    void client.transcode({ from: 'glb', to: 'glb', files, options: { compression: 'draco' } });
    void client.transcode({ from: 'glb', to: 'gltf', files, options: { compression: 'none' } });
    void client.transcode({ from: 'gltf', to: 'glb', files, options: { compression: 'draco' } });
    void client.transcode({ from: 'gltf', to: 'gltf', files, options: {} });
    // @ts-expect-error -- @taucad/gltf does not declare glb -> obj.
    void client.transcode({ from: 'glb', to: 'obj', files, options: {} });
    // @ts-expect-error -- compression is an explicit none | draco capability.
    void client.transcode({ from: 'glb', to: 'glb', files, options: { compression: 'brotli' } });
  });
});
