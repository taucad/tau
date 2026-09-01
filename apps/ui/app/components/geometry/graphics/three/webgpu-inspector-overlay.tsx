import type { ReactNode } from 'react';
import { lazy } from 'react';
import { useThree } from '@react-three/fiber';
import { useThreeGraphicsBackend } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import { ClientOnly } from '#components/ui/utils/client-only.js';

const ThreeWebGpuInspectorBootstrapLazy = lazy(async () => {
  const bootstrapModule = await import('#components/geometry/graphics/three/three-webgpu-inspector-bootstrap.js');

  return {
    default: bootstrapModule.default,
  };
});

/**
 * Three.js r184 {@link Inspector} for WebGPU pipelines: toggled only when `tauDebug` is on in the parent.
 *
 * Must render **inside** an R3F `<Canvas>` (uses `useThree`). Appends the inspector DOM under
 * `document.body` so it is not clipped by viewer layout.
 */
export function WebGpuInspectorOverlay(): ReactNode {
  const backend = useThreeGraphicsBackend();
  const { gl } = useThree();

  if (backend !== 'webgpu' || !('isWebGPURenderer' in gl) || !gl.isWebGPURenderer) {
    return undefined;
  }

  return (
    <ClientOnly>
      <ThreeWebGpuInspectorBootstrapLazy />
    </ClientOnly>
  );
}
