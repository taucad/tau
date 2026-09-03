import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('draco-backend.ts', import.meta.url), 'utf8');
const require_ = createRequire(import.meta.url);

describe('glTF asset ownership', () => {
  it('resolves codec WASM from draco3dgltf without package-local copies', () => {
    expect(existsSync(require_.resolve('draco3dgltf/draco_decoder_gltf.wasm'))).toBe(true);
    expect(existsSync(require_.resolve('draco3dgltf/draco_encoder.wasm'))).toBe(true);
    expect(source).toContain("new URL(import.meta.resolve('draco3dgltf/draco_decoder_gltf.wasm'))");
    expect(source).toContain("new URL(import.meta.resolve('draco3dgltf/draco_encoder.wasm'))");
    expect(existsSync(new URL('wasm', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../copy-files-from-to.cjson', import.meta.url))).toBe(false);
  });
});
