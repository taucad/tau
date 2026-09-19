import { expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
// oxlint-disable-next-line no-restricted-imports -- The test exercises the adjacent standalone runner.
import { runEarlyCorpus } from './run-conformance.mjs';

it('should match every accepted current-profile record through the actual Node addon', async () => {
  const modulePath = fileURLToPath(new URL('generated/index.js', import.meta.url));
  const binaryPath = fileURLToPath(new URL('generated/geospec-engine-native.darwin-arm64.node', import.meta.url));
  const binding = /** @type {Parameters<typeof runEarlyCorpus>[0]['binding']} */ (
    await import(new URL('generated/index.js', import.meta.url))
  );
  const report = await runEarlyCorpus({
    binding,
    host: 'node-napi-vitest',
    artifacts: [modulePath, binaryPath],
  });
  expect(report.mismatches).toEqual([]);
  expect(report.passed).toBe(320);
});
