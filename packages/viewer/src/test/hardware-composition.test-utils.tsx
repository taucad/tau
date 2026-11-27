import type { ReactNode } from 'react';
import { expect, inject } from 'vitest';
import { defaultViewerEnvironment, ViewerEnvironmentProvider } from '#environment/viewer-environment.jsx';
import { resolveRenderTier } from '#graphics/three/render-tier.js';
import type { RenderTierOverride } from '#graphics/three/render-tier.js';
// oxlint-disable-next-line import/no-empty-named-blocks -- Type-only ProvidedContext augmentation for `webGpuProfile`.
import type {} from '#test/webgpu-profile.test-utils.js';

/**
 * The override a row that asserts the hardware composition runs under. On the software profile (SwiftShader in CI) the
 * render tier would drop ambient occlusion, FXAA and speculative camera preparation; the override runs them anyway, so
 * the row exercises the pipeline it asserts. The environment keeps the adapter's size: at the hardware size SwiftShader
 * filters the cubemap on the CPU for minutes, and no composition row asserts reflections. The hardware profile keeps the
 * production tier.
 */
export const hardwareCompositionOverride: RenderTierOverride | undefined =
  inject('webGpuProfile') === 'software'
    ? { features: { ambientOcclusion: true, antialias: true, speculativePreparation: true } }
    : undefined;

/**
 * Mount a viewer subtree under the hardware composition: the tier's AO, FXAA and speculative preparation run whatever
 * the adapter. A row that asserts one of those passes declares it by rendering inside this.
 *
 * @param props - The viewer subtree.
 * @returns The subtree under the overriding environment.
 */
export function HardwareComposition({ children }: { readonly children: ReactNode }): React.JSX.Element {
  return (
    <ViewerEnvironmentProvider value={{ ...defaultViewerEnvironment, renderTierOverride: hardwareCompositionOverride }}>
      {children}
    </ViewerEnvironmentProvider>
  );
}

/**
 * Assert that a canvas runs the hardware composition, so a pixel row cannot pass or fail against the reduced one. On
 * the software profile it also asserts that the override chose the features. (The classic WebGL renderer does not
 * name its rasterizer to the tier, so the rasterizer itself is not asserted.)
 *
 * @param renderer - The canvas's renderer (R3F's `gl`).
 */
export const expectHardwareComposition = (renderer: unknown): void => {
  const tier = resolveRenderTier(renderer);
  expect(tier.features, 'Row asserts the hardware composition').toMatchObject({
    ambientOcclusion: true,
    antialias: true,
    speculativePreparation: true,
  });
  expect(tier.overridden, 'Software profile runs the hardware composition by override').toBe(
    hardwareCompositionOverride !== undefined,
  );
};
