import { describe, expect, it } from 'vitest';

import { normalizeAssetImportAttributes, resolveAssetIntent, splitAssetSpecifier } from '#asset-imports.js';

describe('asset imports', () => {
  it('normalizes supported attributes without moving source locations', async () => {
    const source = [
      "import text from './notes.txt' with { type: 'text' };",
      "import bytes from './shape.bin' with { type: 'bytes' };",
    ].join('\n');
    const result = await normalizeAssetImportAttributes(source);

    expect(result.code).toHaveLength(source.length);
    expect(result.code.split('\n').map((line) => line.length)).toEqual(source.split('\n').map((line) => line.length));
    expect(result.code).toContain("'./notes.txt?text'");
    expect(result.code).toContain("'./shape.bin?binary'");
    expect(result.rewrites).toHaveLength(2);
  });

  it('leaves unsupported attributes unchanged', async () => {
    const source = "import value from './data.json' with { type: 'json' };";
    await expect(normalizeAssetImportAttributes(source)).resolves.toEqual({ code: source, rewrites: [] });
  });

  it('uses query intent before attributes', () => {
    expect(splitAssetSpecifier('./shape.step?raw')).toEqual({
      specifier: './shape.step',
      suffix: '?raw',
      intent: 'text',
    });
    expect(resolveAssetIntent('?binary', { type: 'text' })).toBe('binary');
  });
});
