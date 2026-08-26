/** Runner event subscriptions shared by serial and pooled hosts. @module */

import type { GeoSpecRunner, GeoSpecRunnerEvent } from 'geospec/runner/worker';

/** A runner-local event channel. */
export const createRunnerEventChannel = (): {
  on: GeoSpecRunner['on'];
  emit(event: GeoSpecRunnerEvent): void;
  clear(): void;
} => {
  const listeners = new Set<(event: GeoSpecRunnerEvent) => void>();
  return {
    on(type, handler) {
      const listener = (event: GeoSpecRunnerEvent): void => {
        if (event.type === type) {
          handler(event as Extract<GeoSpecRunnerEvent, { type: typeof type }>);
        }
      };
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event) {
      for (const listener of listeners) {
        listener(event);
      }
    },
    clear() {
      listeners.clear();
    },
  };
};
