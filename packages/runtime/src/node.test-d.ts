/* eslint-disable @typescript-eslint/naming-convention -- file map keys are filesystem paths, not identifiers */
import { describe, expectTypeOf, it } from 'vitest';
import type { RuntimeClient } from '#index.js';
import type { FileExtension } from '#types/index.js';
import { createNodeClient } from '#node.js';

describe('createNodeClient configured type inference', () => {
  it('can widen to the public client contract at a dynamic consumer boundary', async () => {
    const configuredClient = await createNodeClient();
    const client: RuntimeClient = configuredClient;
    const format = 'webp' as FileExtension;
    const content: Record<string, unknown> = { futureSemantic: { required: false } };

    void client.export(format, {
      source: { files: { 'main.ts': 'export default () => null' } },
      parameters: { enabled: false },
      exportOptions: { futurePluginOption: { values: [0, '', false] } },
      content,
    });
  });

  it('preserves preset export options and content declarations', async () => {
    const client = await createNodeClient();
    const result = client.export('webp', {
      source: { files: { 'main.ts': 'export default () => null' } },
      content: { includeEdges: true },
      exportOptions: { width: 768, height: 432 },
    });
    expectTypeOf(result).toEqualTypeOf<ReturnType<typeof client.export>>();

    void client.export('webp', {
      source: { files: { 'main.ts': 'export default () => null' } },
      exportOptions: { quality: 0.8 },
    });
    // The preset union accepts another advertised STL route's option here;
    // the selected Replicad route rejects unknown `tolerance` at runtime.
    void client.export('stl', { exportOptions: { tolerance: 0.01 } });

    void client.export('stl', {
      source: { files: { 'main.ts': 'export default () => null' } },
      // @ts-expect-error -- STL routes do not advertise framework content
      content: { includeEdges: true },
    });

    const dynamicOptions = { futurePluginOption: true };
    for (const format of [
      '3ds',
      '3mf',
      'dae',
      'fbx',
      'glb',
      'gltf',
      'jpeg',
      'obj',
      'ply',
      'png',
      'step',
      'stl',
      'usda',
      'usdz',
      'webp',
      'x',
      'x3d',
    ] as const) {
      void client.export(format, { exportOptions: dynamicOptions });
    }
    void client.render({
      source: { files: { 'main.ts': 'export default () => null' } },
      renderOptions: dynamicOptions,
    });
    void client.setOptions(dynamicOptions);
  });
});
