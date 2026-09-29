import { expect, it } from 'vitest';

it('should match the accepted current-profile corpus through packed Node and WASM exports on Node 26', async () => {
  const { runNode26Packed } = await import('./run-node26-conformance.ts');
  const report = await runNode26Packed();
  expect(report.runtime.version).toMatch(/^v26\./);
  expect(report.routes.node).toMatchObject({
    passed: 320,
    failed: 0,
    admissions: 124,
  });
  expect(report.routes.wasm).toMatchObject({
    passed: 320,
    failed: 0,
    admissions: 124,
  });
});
