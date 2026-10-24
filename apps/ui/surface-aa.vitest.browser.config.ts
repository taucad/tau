import { mergeConfig } from 'vitest/config';
// oxlint-disable-next-line eslint/no-restricted-imports -- Diagnostic-only reuse of the owning viewer harness.
import viewer from '../../packages/viewer/src/graphics/three/viewer-resize.vitest.browser.config.js'; // eslint-disable-line @nx/enforce-module-boundaries -- No product dependency.
// oxlint-disable-next-line eslint/no-restricted-imports -- Calibration configuration is outside the app alias root.
import { transformRenderingAblation } from './app/routes/[__e2e].onshape-render-profile/ablation-transform.js';

if (process.env['TAU_E2E_SURFACE_FILTER'] !== undefined) {
  throw new Error('TAU_E2E_SURFACE_FILTER is retired; use source 44fd8d3acb for historical composition comparisons.');
}

const frameStorage = process.env['TAU_E2E_FRAME_STORAGE'] ?? 'compact';
if (!['compact', 'half'].includes(frameStorage)) {
  throw new Error('Unknown frame storage experiment');
}

export default mergeConfig(
  { ...viewer, test: { ...viewer.test, include: [] } },
  {
    test: {
      include: ['src/graphics/three/post-processing-antialias.browser.test.tsx'],
    },
    plugins: [
      {
        name: 'surface-aa-experiment',
        enforce: 'pre',
        transform(source: string, id: string): string | undefined {
          if (!id.split('?')[0]?.endsWith('/graphics/three/post-processing-webgpu.tsx')) {
            return undefined;
          }
          return transformRenderingAblation(source, id)?.replace(
            'new URLSearchParams(globalThis.location.search)',
            `new URLSearchParams('frameStorage=${frameStorage}')`,
          );
        },
      },
    ],
  },
);
