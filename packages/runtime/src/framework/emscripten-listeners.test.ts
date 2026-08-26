import { describe, expect, it } from 'vitest';
import { withoutEmscriptenProcessListeners } from '#framework/emscripten-listeners.js';

describe('withoutEmscriptenProcessListeners', () => {
  it('removes process listeners added by Emscripten factories', async () => {
    const existingUncaught = () => undefined;
    const addedUncaught = () => undefined;

    process.on('uncaughtException', existingUncaught);

    try {
      await withoutEmscriptenProcessListeners(async () => {
        process.on('uncaughtException', addedUncaught);
        return 'loaded';
      });

      expect(process.listeners('uncaughtException')).toContain(existingUncaught);
      expect(process.listeners('uncaughtException')).not.toContain(addedUncaught);
    } finally {
      process.off('uncaughtException', existingUncaught);
      process.off('uncaughtException', addedUncaught);
    }
  });

  it('temporarily raises and restores the process listener limit', async () => {
    const originalMaxListeners = process.getMaxListeners();
    const existingUncaught = () => undefined;
    const addedUncaught = () => undefined;
    let observedMaxListeners = 0;

    process.setMaxListeners(Math.max(originalMaxListeners, process.listenerCount('uncaughtException') + 1));
    process.on('uncaughtException', existingUncaught);
    const constrainedMaxListeners = Math.max(
      process.listenerCount('uncaughtException'),
      process.listenerCount('unhandledRejection'),
    );
    process.setMaxListeners(constrainedMaxListeners);

    try {
      await withoutEmscriptenProcessListeners(async () => {
        observedMaxListeners = process.getMaxListeners();
        process.on('uncaughtException', addedUncaught);
        return 'loaded';
      });

      expect(observedMaxListeners).toBe(constrainedMaxListeners + 1);
      expect(process.getMaxListeners()).toBe(constrainedMaxListeners);
    } finally {
      process.off('uncaughtException', existingUncaught);
      process.off('uncaughtException', addedUncaught);
      process.setMaxListeners(originalMaxListeners);
    }
  });
});
