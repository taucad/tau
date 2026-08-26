import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('replicad.kernel.ts', import.meta.url), 'utf8');
const copyConfig = readFileSync(new URL('../copy-files-from-to.cjson', import.meta.url), 'utf8');

describe('Replicad asset ownership', () => {
  it('keeps both loaders and upstream WASM exports statically visible', () => {
    expect(source).toContain("from '#replicad-wasm-multi-loader.js'");
    expect(source).toContain("new URL(import.meta.resolve('replicad-opencascadejs/wasm'))");
    expect(source).toContain("new URL(import.meta.resolve('replicad-opencascadejs/multi/wasm'))");
    expect(copyConfig).not.toContain('.wasm');
    expect(copyConfig).toContain('src/sourcemaps/replicad.js.map');
    // Declarations come from the `replicad-opencascadejs` dependency, never a vendored copy.
    expect(copyConfig).not.toContain('types.d.ts');
  });
});
