import { createActor, createAsyncLogic } from 'xstate';
import { describe, expect, it } from 'vitest';
import { graphicsMachine } from '#machines/graphics.machine.js';

const start = () => {
  const actor = createActor(
    graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
    { input: {} },
  );
  actor.start();
  return actor;
};

const tools = (actor: ReturnType<typeof start>): { comment: boolean; measure: boolean } => {
  const { isCommentActive, isMeasureActive } = actor.getSnapshot().context;
  return { comment: isCommentActive, measure: isMeasureActive };
};

describe('graphics machine comment tool', () => {
  it('should turn Measure off when Comment starts, since both read a click on the model', () => {
    const actor = start();
    try {
      actor.send({ type: 'setMeasureActive', payload: true });
      actor.send({ type: 'setCommentActive', payload: true });
      expect(tools(actor)).toEqual({ comment: true, measure: false });
      expect(actor.getSnapshot().matches({ operational: { measure: 'off' } })).toBe(true);
    } finally {
      actor.stop();
    }
  });

  it('should turn Comment off when Measure starts', () => {
    const actor = start();
    try {
      actor.send({ type: 'setCommentActive', payload: true });
      actor.send({ type: 'setMeasureActive', payload: true });
      expect(tools(actor)).toEqual({ comment: false, measure: true });
    } finally {
      actor.stop();
    }
  });

  it('should turn off again without turning Measure on', () => {
    const actor = start();
    try {
      actor.send({ type: 'setCommentActive', payload: true });
      actor.send({ type: 'setCommentActive', payload: false });
      expect(tools(actor)).toEqual({ comment: false, measure: false });
    } finally {
      actor.stop();
    }
  });
});
