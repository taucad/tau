import type { ReactNode } from 'react';
import { lazy, Suspense } from 'react';
import { useThree } from '@react-three/fiber';
import { useThreeGraphicsBackend } from '#graphics/three/three-graphics-backend-context.jsx';
import { ClientOnly } from '@taucad/ui/components/client-only';

const ThreeWebGpuInspectorBootstrapLazy = lazy(async () => {
  const bootstrapModule = await import('#graphics/three/three-webgpu-inspector-bootstrap.jsx');

  return {
    default: bootstrapModule.default,
  };
});

/**
 * Three.js r184 {@link Inspector} for WebGPU pipelines: explicitly enabled through `webGpuInspector`.
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

  // R3F hands a suspension inside the canvas to the page's nearest boundary, which would hide the whole
  // workspace while this debug chunk loads, so the chunk suspends here instead.
  return (
    <ClientOnly>
      <Suspense fallback={null}>
        <ThreeWebGpuInspectorBootstrapLazy />
      </Suspense>
    </ClientOnly>
  );
}
