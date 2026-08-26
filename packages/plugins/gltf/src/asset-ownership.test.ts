import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('draco-backend.ts', import.meta.url), 'utf8');
const copyConfig = readFileSync(new URL('../copy-files-from-to.cjson', import.meta.url), 'utf8');

describe('glTF asset ownership', () => {
  it('generates every package-owned WASM URL from the declared dependency', () => {
    expect(source).toContain("new URL('wasm/draco_decoder_gltf.wasm', import.meta.url)");
    expect(source).toContain("new URL('wasm/draco_encoder.wasm', import.meta.url)");
    expect(copyConfig).toContain('src/wasm/draco_decoder_gltf.wasm');
    expect(copyConfig).toContain('src/wasm/draco_encoder.wasm');
    // Every binary comes from `draco3dgltf`; a stray copy has no refresh path.
    expect(
      readdirSync(new URL('wasm', import.meta.url), { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort(),
    ).toEqual(['draco_decoder_gltf.wasm', 'draco_encoder.wasm']);
  });
});
