/* eslint-disable @typescript-eslint/naming-convention -- file map keys are filesystem paths, not identifiers */
import { describe, expectTypeOf, it } from 'vitest';
import { createNodeClient } from '#node.js';

describe('createNodeClient configured type inference', () => {
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
      exportOptions: {
        // @ts-expect-error -- WebP is lossless and has no quality option
        quality: 0.8,
      },
    });

    void client.export('stl', {
      source: { files: { 'main.ts': 'export default () => null' } },
      // @ts-expect-error -- STL routes do not advertise framework content
      content: { includeEdges: true },
    });
  });
});
