import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { transformRenderingAblation } from '#routes/[__e2e].onshape-render-profile/ablation-transform.js';

const root = resolve(import.meta.dirname, '../../../../..');
const files = [
  'packages/viewer/src/graphics/three/materials/gltf-edges.ts',
  'packages/viewer/src/graphics/three/materials/named-uniform-array.ts',
  'packages/viewer/src/graphics/three/controls/section-plane-picker.ts',
  'packages/viewer/src/graphics/three/controls/viewport-gizmo-cube-surface.ts',
  'packages/viewer/src/graphics/three/controls/viewport-gizmo-cube-axes.ts',
  'packages/viewer/src/graphics/three/post-processing-webgpu.tsx',
  'packages/viewer/src/graphics/three/post-processing.tsx',
  'packages/viewer/src/graphics/three/renderer.ts',
  'packages/viewer/src/graphics/three/scene-overlay.tsx',
  'packages/viewer/src/graphics/three/react/gltf-mesh.tsx',
  'packages/viewer/src/graphics/three/react/model-emphasis-overlay.tsx',
  'apps/ui/app/routes/[__e2e].onshape-render-profile/route.tsx',
];

describe('calibration-only rendering ablation', () => {
  it.each(files)('checks every source anchor in %s', (file) => {
    const code = readFileSync(resolve(root, file), 'utf8');
    expect(transformRenderingAblation(code, `/${file}`)).toContain('const tauAblation');
    expect(() => transformRenderingAblation('', `/${file}`)).toThrow('anchor drift');
  });

  it('stops pass sampling when the last frame completes even without a pending timer', () => {
    const file = 'apps/ui/app/routes/[__e2e].onshape-render-profile/route.tsx';
    const transformed = transformRenderingAblation(readFileSync(resolve(root, file), 'utf8'), `/${file}`);
    expect(transformed).toContain(
      "current.drainStarted = now;\n        if (tauAblation.has('passCost')) resetAllocationCosts(false);",
    );
    expect(transformed).not.toContain('current.frame === 330) resetAllocationCosts(false)');
  });

  it('does not alter unrelated product modules', () => {
    expect(transformRenderingAblation('unchanged', '/graphics/three/unrelated.tsx')).toBeUndefined();
  });

  it('does not install experiment transforms in the product configuration', () => {
    expect(readFileSync(resolve(root, 'apps/ui/vite.config.ts'), 'utf8')).not.toContain('transformRenderingAblation');
  });
});
