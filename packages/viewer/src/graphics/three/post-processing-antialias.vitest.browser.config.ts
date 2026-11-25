import { mergeConfig } from 'vitest/config';
// oxlint-disable-next-line eslint/no-restricted-imports -- Config composition before aliases are installed; not product code.
import viewer from './viewer-resize.vitest.browser.config.js';

/*
 * The post-processing and antialiasing suite on its own, with the viewer-resize harness unchanged (Chromium launch,
 * TAU_E2E_WEBGPU_PROFILE, TAU_E2E_SURFACE_AA, 60 s default test timeout). Since 2026-11-18 most of its tests time out
 * under the software profile (#2279), about 92 min a run, which used up the nightly job's budget before the rest of
 * viewer-resize ran. As its own config and Nx task it runs in its own nightly job, so that budget is its alone.
 */
export default mergeConfig(
  { ...viewer, test: { ...viewer.test, include: [] } },
  {
    test: {
      include: ['src/graphics/three/post-processing-antialias.browser.test.tsx'],
      browser: {
        screenshotDirectory: '../../out/test-results/vitest-browser/post-processing-antialias',
      },
    },
  },
);
