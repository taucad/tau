import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { PanzoomObject } from '@panzoom/panzoom';
import { useBuild } from '#hooks/use-build.js';

type PanzoomResetParameters = {
  /**
   * Reference to the panzoom instance.
   */
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- required by React
  panzoomRef: RefObject<PanzoomObject | null>;
  /**
   * Reference to the container element for calculating center point.
   * React useRef returns null by default, so we must use it here.
   */
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- required by React
  containerRef: RefObject<HTMLDivElement | null>;
};

/**
 * Hook that provides panzoom reset functionality and registers it with the graphics context
 *
 * @param parameters - The parameters for the SVG reset.
 * @returns The reset function.
 */
export function usePanzoomReset(parameters: PanzoomResetParameters): () => void {
  const { cameraRef: cameraCapabilityActor } = useBuild();
  const isRegistered = useRef(false);

  const { panzoomRef, containerRef } = parameters;

  const resetSvg = useCallback(() => {
    const panzoomInstance = panzoomRef.current;
    const container = containerRef.current;
    if (!panzoomInstance || !container) {
      return;
    }

    // Get the center of the viewport for zoom origin
    const rect = container.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;

    // Use zoomToPoint instead of reset() to follow the same code path as wheel zoom
    // This ensures proper pattern updates during the animation
    panzoomInstance.zoomToPoint(1, { clientX, clientY });

    // Also reset pan to center with animation
    panzoomInstance.pan(0, 0, { animate: true });
  }, [panzoomRef, containerRef]);

  // Register the reset function with the camera capability actor only once
  useEffect(() => {
    if (!isRegistered.current) {
      cameraCapabilityActor.send({ type: 'registerReset', reset: resetSvg });
      isRegistered.current = true;
    }
  }, [resetSvg, cameraCapabilityActor]);

  // Return the reset function for direct use if needed
  return resetSvg;
}
