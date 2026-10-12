import { useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  createRenderLoopObserver,
  renderLoopObservers,
} from '#components/geometry/graphics/three/render-loop-observer.js';
import type { RenderLoopObserver } from '#components/geometry/graphics/three/render-loop-observer.js';

/** Observe completed submission callbacks without requesting frames or waiting for the GPU. */
export function RenderFpsOverlay({ hasTopRightGizmo = false }: { readonly hasTopRightGizmo?: boolean }): undefined {
  const gl = useThree((state) => state.gl);
  const observerRef = useRef<RenderLoopObserver | undefined>(undefined);
  const outputRef = useRef<HTMLOutputElement | undefined>(undefined);
  useLayoutEffect(() => {
    const parent = gl.domElement.parentElement;
    if (!parent) {
      return undefined;
    }
    const output = document.createElement('output');
    output.className =
      'pointer-events-none absolute top-2 right-2 z-10 rounded-sm bg-background px-2 py-1 font-mono text-xs text-foreground tabular-nums';
    output.setAttribute('aria-label', 'Render-loop submission FPS');
    output.setAttribute('aria-live', 'off');
    output.setAttribute(
      'aria-description',
      'Completed render-loop submissions per second. This does not measure GPU completion, complete content, or displayed frames. Idle means no recent render-loop submissions.',
    );
    output.textContent = 'FPS · idle';
    parent.append(output);
    outputRef.current = output;
    const observer = createRenderLoopObserver((status) => {
      output.textContent = status.status === 'active' ? `${status.fps.toFixed(1)} FPS` : `FPS · ${status.status}`;
    });
    observerRef.current = observer;
    renderLoopObservers.set(gl.domElement, observer);
    const visibilityChanged = (): void => {
      observer.setHidden(document.visibilityState === 'hidden');
    };
    visibilityChanged();
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      document.removeEventListener('visibilitychange', visibilityChanged);
      observer.dispose();
      renderLoopObservers.delete(gl.domElement);
      observerRef.current = undefined;
      outputRef.current = undefined;
      output.remove();
    };
  }, [gl]);
  useLayoutEffect(() => {
    const output = outputRef.current;
    if (
      !output ||
      renderLoopObservers.get(gl.domElement) !== observerRef.current ||
      output.parentElement !== gl.domElement.parentElement
    ) {
      return;
    }
    // The 96px cube and its adjacent Section picker end above this 112px band.
    output.classList.toggle('top-28', hasTopRightGizmo);
    output.classList.toggle('top-2', !hasTopRightGizmo);
  }, [gl, hasTopRightGizmo]);
  useFrame(() => {
    observerRef.current?.record(performance.now());
  }, 5);
  return undefined;
}
