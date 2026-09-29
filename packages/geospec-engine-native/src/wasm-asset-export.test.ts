import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('should resolve the owned WASM binary through an explicit package export', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    exports: { './wasm-binary': string };
    imports: { '#mixed-wasm-binding': { default: string } };
    publishConfig: { exports: { './wasm-binary': string }; imports: { '#mixed-wasm-binding': string } };
  };
  const source = createRequire(import.meta.url).resolve('@taucad/geospec-engine-native/wasm-binary');
  expect(source).toBe(fileURLToPath(new URL(`../${manifest.exports['./wasm-binary']}`, import.meta.url)));
  expect(manifest.publishConfig.exports['./wasm-binary']).toBe('./dist/bindings/mixed-wasm/geospec_engine_native.wasm');
  expect(dirname(manifest.exports['./wasm-binary'])).toBe(dirname(manifest.imports['#mixed-wasm-binding'].default));
  expect(dirname(manifest.publishConfig.exports['./wasm-binary'])).toBe(
    dirname(manifest.publishConfig.imports['#mixed-wasm-binding']),
  );
  expect([...readFileSync(source).subarray(0, 4)]).toEqual([0, 97, 115, 109]);
});
