import { mergeConfig } from 'vitest/config';
// oxlint-disable-next-line eslint/no-restricted-imports -- Reuse the owning viewer browser harness; it is not a product export.
import viewer from '../../packages/viewer/src/graphics/three/viewer-resize.vitest.browser.config.js'; // eslint-disable-line @nx/enforce-module-boundaries -- Diagnostic-only config composition; never imported by product code.
// oxlint-disable-next-line eslint/no-restricted-imports -- Calibration configuration is outside the app alias root.
import { transformRenderingAblation } from './app/routes/[__e2e].onshape-render-profile/ablation-transform.js';

const depthOwnership = process.env['TAU_E2E_DEPTH_OWNERSHIP'] ?? 'shared';
const cameraOwnership = process.env['TAU_E2E_CAMERA_OWNERSHIP'] ?? 'retarget';
if (!['shared', 'split'].includes(depthOwnership) || !['retarget', 'recreate'].includes(cameraOwnership)) {
  throw new Error('Unknown depth/camera ownership experiment');
}

// Diagnostic only: exercise the existing production-composition oracles with the candidate graph.
export default mergeConfig(viewer, {
  test: {
    include: [
      '../../apps/ui/depth-ownership.browser.test.ts',
      'src/graphics/three/post-processing-antialias.browser.test.tsx',
    ],
  },
  plugins: [
    {
      name: 'depth-ownership-experiment',
      enforce: 'pre',
      transform(source: string, id: string): string | undefined {
        if (!id.split('?')[0]?.endsWith('/graphics/three/post-processing-webgpu.tsx')) {
          return undefined;
        }
        return transformRenderingAblation(source, id)?.replace(
          'new URLSearchParams(globalThis.location.search)',
          `new URLSearchParams('depthOwnership=${depthOwnership}&cameraOwnership=${cameraOwnership}')`,
        );
      },
    },
  ],
});
