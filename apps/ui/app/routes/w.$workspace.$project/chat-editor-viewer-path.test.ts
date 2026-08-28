import { describe, expect, it } from 'vitest';
import { createMonacoPath } from '#routes/w.$workspace.$project/chat-editor-viewer.types.js';

describe('createMonacoPath', () => {
  it('translates a canonical Tau path to Monaco URI path syntax', () => {
    expect(createMonacoPath('lib/main.ts')).toBe('/lib/main.ts');
  });

  it('rejects legacy absolute and noncanonical Tau paths', () => {
    for (const path of ['/main.ts', '../main.ts', 'src/../main.ts', 'src\\main.ts']) {
      expect(() => createMonacoPath(path)).toThrow();
    }
  });
});
