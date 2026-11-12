import { afterEach, describe, expect, it } from 'vitest';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import { liveViewSettings, seedViewer } from '#app/workbench-state.js';

const actors: Array<Actor<typeof graphicsMachine>> = [];

const createGraphicsActor = (): Actor<typeof graphicsMachine> => {
  const actor = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: {} },
  );
  actor.start();
  actors.push(actor);
  return actor;
};

afterEach(() => {
  for (const actor of actors.splice(0)) {
    actor.stop();
  }
});

describe('liveViewSettings', () => {
  it('reports nothing before the page seeds the viewer for an entry', () => {
    expect(liveViewSettings(createGraphicsActor())).toBeUndefined();
  });

  /* An SVG model has a view camera but no three.js canvas, so no controls adapter ever attaches. */
  it('reports the settings of a seeded viewer that has no canvas', () => {
    const graphicsRef = createGraphicsActor();
    seedViewer(graphicsRef, 'drawing.svg', undefined);

    expect(graphicsRef.getSnapshot().context.controlsAdapter).toBeUndefined();
    expect(liveViewSettings(graphicsRef)).toBeDefined();
  });
});
