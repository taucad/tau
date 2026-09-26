import { setup, types } from 'xstate';

import { eventSchemas } from '#lib/xstate.lib.js';

export type MeasureInputResult = 'acceptPoint' | 'cancelCurrent' | 'ignore';

export type MeasureInputContext = {
  isPointerDown: boolean;
  pointerDownHadTarget: boolean;
  discardGesture: boolean;
  result?: MeasureInputResult;
};

export type MeasureInputEvent =
  | { type: 'pointerDown'; button: number; hasTarget: boolean; cameraMoving: boolean }
  | {
      type: 'pointerUp';
      button: number;
      hasTarget: boolean;
      hasCurrentStart: boolean;
      isZeroLength: boolean;
      hasActiveSnapTarget: boolean;
    }
  | { type: 'cameraMoved' }
  | { type: 'cancel' }
  | { type: 'clearResult' };

const resetPointerState = (result: MeasureInputResult): Partial<MeasureInputContext> => ({
  isPointerDown: false,
  pointerDownHadTarget: false,
  discardGesture: false,
  result,
});

const recordPointerDown = (
  event: Extract<MeasureInputEvent, { type: 'pointerDown' }>,
): Partial<MeasureInputContext> => {
  if (event.button !== 0 && event.button !== 2) {
    return { result: 'ignore' };
  }

  return {
    isPointerDown: true,
    pointerDownHadTarget: event.hasTarget,
    discardGesture: event.cameraMoving,
    result: undefined,
  };
};

const resolvePointerUp = (
  context: MeasureInputContext,
  event: Extract<MeasureInputEvent, { type: 'pointerUp' }>,
): Partial<MeasureInputContext> => {
  if (!context.isPointerDown) {
    return resetPointerState('ignore');
  }

  if (event.button === 2) {
    const result = !context.discardGesture && event.hasCurrentStart ? 'cancelCurrent' : 'ignore';
    return resetPointerState(result);
  }

  if (event.button !== 0 || context.discardGesture) {
    return resetPointerState('ignore');
  }

  if (!context.pointerDownHadTarget && !event.hasActiveSnapTarget) {
    return resetPointerState('ignore');
  }

  if (!event.hasTarget && !event.hasActiveSnapTarget) {
    return resetPointerState('ignore');
  }

  if (event.isZeroLength) {
    return resetPointerState('ignore');
  }

  return resetPointerState('acceptPoint');
};

export const measureInputMachine = setup({
  schemas: {
    context: types<MeasureInputContext>(),
    events: eventSchemas<MeasureInputEvent>(),
  },
}).createMachine({
  id: 'measureInput',
  context: {
    isPointerDown: false,
    pointerDownHadTarget: false,
    discardGesture: false,
    result: undefined,
  },
  on: {
    pointerDown: { context: ({ event }) => recordPointerDown(event) },
    pointerUp: { context: ({ context, event }) => resolvePointerUp(context, event) },
    cameraMoved: {
      context: ({ context }) => (context.isPointerDown ? { discardGesture: true, result: undefined } : {}),
    },
    cancel: { context: resetPointerState('cancelCurrent') },
    clearResult: { context: { result: undefined } },
  },
});
