import { join } from 'node:path';
import { afterAll, expect, it, vi } from 'vitest';
import { setupGeoSpecVitestProject } from '#vitest/node/index.js';

const setConfig = vi.spyOn(vi, 'setConfig');
await setupGeoSpecVitestProject({
  projectPath: join(import.meta.dirname, '../../../host-tests/installed-cli/box-project'),
  overrides: { testTimeout: 4321 },
});

afterAll(() => {
  vi.resetConfig();
});

it("should make the config's test timeout, or its override, this file's Vitest timeout", () => {
  expect(setConfig).toHaveBeenCalledExactlyOnceWith({ testTimeout: 4321 });
});
