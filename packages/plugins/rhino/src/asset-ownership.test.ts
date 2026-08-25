import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('rhino.kernel.ts', import.meta.url), 'utf8');
const copyConfig = readFileSync(new URL('../copy-files-from-to.cjson', import.meta.url), 'utf8');

describe('Rhino asset ownership', () => {
  it('generates every package-owned WASM URL from the declared dependency', () => {
    expect(source).toContain("new URL('wasm/rhino3dm.wasm', import.meta.url)");
    expect(copyConfig).toContain('src/wasm/rhino3dm.wasm');
    // Every binary comes from `rhino3dm`; a stray copy has no refresh path.
    expect(
      readdirSync(new URL('wasm', import.meta.url), { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort(),
    ).toEqual(['rhino3dm.wasm']);
  });
});
