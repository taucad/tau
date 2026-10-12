import { useEffect, useState } from 'react';
import { disposeGearboxParts, loadGearboxParts } from '#components/geometry/gearbox/gearbox.js';
import type { GearboxPart } from '#components/geometry/gearbox/gearbox.js';

/**
 * Load the showcase gearbox for one canvas. The effect owns cancellation and every loaded
 * resource: parts are disposed when the caller unmounts or the load is aborted.
 * @param onReady - Called once the parts are available.
 * @param onError - Called when the model cannot load.
 * @returns The parts, once loaded.
 */
export const useGearboxParts = (onReady: () => void, onError: (error: Error) => void): GearboxPart[] | undefined => {
  const [parts, setParts] = useState<GearboxPart[]>();
  useEffect(() => {
    const controller = new AbortController();
    let owned: GearboxPart[] = [];
    // async-iife: bootstrap — this effect owns cancellation and every loaded resource.
    void (async () => {
      try {
        const result = await loadGearboxParts(controller.signal);
        if (controller.signal.aborted) {
          disposeGearboxParts(result);
          return;
        }
        owned = result;
        setParts(result);
        onReady();
      } catch (error) {
        if (!controller.signal.aborted) {
          onError(error instanceof Error ? error : new Error(String(error)));
        }
      }
    })();
    return () => {
      controller.abort();
      disposeGearboxParts(owned);
    };
  }, [onReady, onError]);
  return parts;
};
