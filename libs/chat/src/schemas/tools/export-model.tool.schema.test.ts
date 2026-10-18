import { describe, expect, it } from 'vitest';
import { exportModelInputSchema } from '#schemas/tools/export-model.tool.schema.js';

describe('exportModelInputSchema', () => {
  it('accepts declared target and JSON options while refusing obsolete request keys', () => {
    expect(
      exportModelInputSchema.safeParse({ targetFile: 'main.ts', to: 'glb', options: { quality: 2 } }).success,
    ).toBe(true);
    for (const request of [
      { targetFile: 'main.ts', format: 'glb' },
      { targetFile: 'main.ts', to: 'glb', exportOptions: { quality: 2 } },
      { targetFile: 'main.ts', to: 'glb', options: { bytes: new Uint8Array([1]) } },
    ]) {
      expect(exportModelInputSchema.safeParse(request).success).toBe(false);
    }
  });

  it('should accept framework content keys and refuse any other content', () => {
    expect(
      exportModelInputSchema.parse({
        targetFile: 'main.ts',
        to: 'glb',
        content: { includeTopology: true, includeEdges: false },
      }),
    ).toEqual({ targetFile: 'main.ts', to: 'glb', content: { includeTopology: true, includeEdges: false } });
    for (const content of [{ includeMesh: true }, { includeTopology: 'yes' }, true]) {
      expect(exportModelInputSchema.safeParse({ targetFile: 'main.ts', to: 'glb', content }).success).toBe(false);
    }
  });
});
