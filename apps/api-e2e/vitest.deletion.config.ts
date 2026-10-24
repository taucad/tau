import { defineConfig } from 'vitest/config';
// oxlint-disable-next-line no-restricted-imports -- Compose the adjacent Git harness before test aliases exist.
import gitConfig from './vitest.git.config.js';

/** Run the completed-artifact acceptance only with its explicitly owned services. */
export default defineConfig({
  ...gitConfig,
  test: {
    ...gitConfig.test,
    include: ['src/git/project-deletion.spec.ts'],
    exclude: [],
  },
});
