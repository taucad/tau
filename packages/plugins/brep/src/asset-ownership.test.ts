import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('brep.kernel.ts', import.meta.url), 'utf8');
const copyConfig = readFileSync(new URL('../copy-files-from-to.cjson', import.meta.url), 'utf8');

describe('BRep asset ownership', () => {
  it('generates every package-owned WASM URL from the declared dependency', () => {
    expect(source).toContain("new URL('wasm/occt-import-js.wasm', import.meta.url)");
    expect(copyConfig).toContain('src/wasm/occt-import-js.wasm');
    // Every binary comes from `occt-import-js`; a stray copy has no refresh path.
    expect(
      readdirSync(new URL('wasm', import.meta.url), { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort(),
    ).toEqual(['occt-import-js.wasm']);
  });
});
