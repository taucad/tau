import { describe, expect, it } from 'vitest';
import { snapshotSchema } from '#schemas/metadata.schema.js';

describe('snapshotSchema', () => {
  it('accepts a basic file when its text line count is unknown', () => {
    expect(
      snapshotSchema.safeParse({
        fileTree: [{ path: 'main.ts', name: 'main.ts', type: 'file', size: 5 }],
        activeFile: { path: 'main.ts', name: 'main.ts' },
      }).success,
    ).toBe(true);
    expect(
      snapshotSchema.safeParse({
        fileTree: [{ path: 'main.ts', name: 'main.ts', type: 'file', size: 5, contentKind: 'text' }],
      }).success,
    ).toBe(false);
  });
});
