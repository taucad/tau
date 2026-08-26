import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('opencascade.kernel.ts', import.meta.url), 'utf8');

describe('OpenCascade asset ownership', () => {
  it('keeps both initializers and libcascade WASM exports statically visible', () => {
    expect(source).toContain("import('libcascade/single/init')");
    expect(source).toContain("import('libcascade/multi/init')");
    expect(source).toContain("new URL(import.meta.resolve('libcascade/wasm'))");
    expect(source).toContain("new URL(import.meta.resolve('libcascade/multi/wasm'))");
    // Declarations come from the `libcascade` dependency, never a vendored copy.
    expect(source).toContain("from 'libcascade/init'");
  });
});
