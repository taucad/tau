import { expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line no-restricted-imports -- The test exercises the adjacent standalone runner.
import { runWasmCorpus } from './run-conformance.mjs';

it('should match every frozen early-corpus record through the actual WASM module', async () => {
  const report = await runWasmCorpus({
    modulePath: fileURLToPath(new URL('generated/geospec_engine_native_wasm.js', import.meta.url)),
    binaryPath: fileURLToPath(new URL('generated/geospec_engine_native_wasm_bg.wasm', import.meta.url)),
    host: 'wasm-node-vitest',
  });
  expect(report.mismatches).toEqual([]);
  expect(report.passed).toBe(320);
});
