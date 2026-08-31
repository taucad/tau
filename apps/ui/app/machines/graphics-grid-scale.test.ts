import { afterEach, describe, expect, it } from 'vitest';
import { createActor, fromPromise } from 'xstate';
import { graphicsMachine } from '#machines/graphics.machine.js';

const actors: Array<ReturnType<typeof createActor>> = [];

describe('graphics grid scale covariance', () => {
  afterEach(() => {
    for (const actor of actors.splice(0)) {
      actor.stop();
    }
  });

  it.each([1e-30, 1e-24, 1e-18, 1e-12, 1e-9, 1e-6, 1e-3, 1, 1e3, 1e6, 1e12, 1e18, 1e24, 1e30])(
    'selects a finite physical grid decade for a %g metre span',
    (verticalSpan) => {
      const actor = createActor(graphicsMachine.provide({ actors: { probeWebGpu: fromPromise(async () => false) } }), {
        input: {},
      });
      actor.start();
      actors.push(actor);
      actor.send({ type: 'cameraViewChanged', verticalSpan });

      const { largeSize, smallSize } = actor.getSnapshot().context.gridSizes;
      expect(Number.isFinite(largeSize)).toBe(true);
      expect(largeSize).toBeGreaterThan(0);
      expect(largeSize / verticalSpan).toBeGreaterThanOrEqual(0.1);
      expect(largeSize / verticalSpan).toBeLessThanOrEqual(1);
      expect(smallSize).toBe(largeSize / 10);
    },
  );
});
