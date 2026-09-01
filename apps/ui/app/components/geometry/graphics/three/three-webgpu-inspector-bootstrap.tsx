import type { ReactNode } from 'react';
import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { WebGPURenderer } from 'three/webgpu';

/**
 * Default export for `React.lazy`: mounts Three.js {@link Inspector} on the shared WebGPU renderer.
 *
 * Implemented in its own module so Vite splits the bulky inspector bundle from the CAD viewer baseline.
 *
 * The `Inspector` class is imported dynamically inside {@link useLayoutEffect} — not at module scope —
 * because `three/addons/inspector` pulls tabs that touch `localStorage` at evaluate time (`Settings.js`).
 */
export default function ThreeWebGpuInspectorBootstrap(): ReactNode {
  const { gl } = useThree();

  useLayoutEffect(() => {
    if (!('isWebGPURenderer' in gl) || !gl.isWebGPURenderer) {
      return undefined;
    }

    const gpuRenderer = gl as unknown as WebGPURenderer;

    /** Prior inspector attachment (typically `InspectorBase` from three.js). */
    const previousInspector: unknown = gpuRenderer.inspector;

    /** Object holder so mutation from the effect teardown is visible across async continuation (not falsely narrowed). */
    const lifecycle = { cancelled: false };
    let detach: (() => void) | undefined;

    // async-iife: bootstrap — `useLayoutEffect` cannot return a Promise; Inspector loads only after DOM commit.
    void (async (): Promise<void> => {
      const { Inspector } = await import('three/addons/inspector/Inspector.js');

      if (lifecycle.cancelled) {
        return;
      }

      const inspector = new Inspector();

      gpuRenderer.inspector = inspector;
      globalThis.document.body.append(inspector.domElement);

      detach = (): void => {
        inspector.hide();

        inspector.domElement.remove();

        gpuRenderer.inspector = previousInspector as WebGPURenderer['inspector'];
      };
    })();

    return (): void => {
      lifecycle.cancelled = true;
      detach?.();
    };
  }, [gl]);

  return undefined;
}
