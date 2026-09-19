import { expect, it } from 'vitest';
// eslint-disable-next-line no-restricted-imports -- The test exercises the adjacent standalone runner.
import { runWasmCorpus } from './run-conformance.mjs';

it('should match every accepted current-profile record through the actual WASM module', async () => {
  const report = await runWasmCorpus({
    host: 'wasm-node-vitest',
  });
  expect(report.mismatches).toEqual([]);
  expect(report.passed).toBe(320);
});
