import { setup, types } from 'xstate';

import { eventSchemas } from '#lib/xstate.lib.js';

export type MeasureInputResult = 'acceptPoint' | 'cancelCurrent' | 'ignore';

export type MeasureInputContext = {
  isPointerDown: boolean;
  pointerId?: number;
  pointerDownHadTarget: boolean;
  discardGesture: boolean;
  result?: MeasureInputResult;
};

export type MeasureInputEvent =
  | {
      type: 'pointerDown';
      button: number;
      hasTarget: boolean;
      cameraMoving: boolean;
      pointerId?: number;
      isPrimary?: boolean;
    }
  | {
      type: 'pointerUp';
      button: number;
      hasTarget: boolean;
      hasCurrentStart: boolean;
      isZeroLength: boolean;
      hasActiveSnapTarget: boolean;
      pointerId?: number;
    }
  | { type: 'cameraMoved' }
  | { type: 'cancel' }
  | { type: 'pointerCancel'; pointerId?: number }
  | { type: 'blur' }
  | { type: 'clearResult' };

const resetPointerState = (result: MeasureInputResult): Partial<MeasureInputContext> => ({
  isPointerDown: false,
  pointerId: undefined,
  pointerDownHadTarget: false,
  discardGesture: false,
  result,
});

const recordPointerDown = (
  event: Extract<MeasureInputEvent, { type: 'pointerDown' }>,
): Partial<MeasureInputContext> => {
  if ((event.button !== 0 && event.button !== 2) || event.isPrimary === false) {
    return { result: 'ignore' };
  }

  return {
    isPointerDown: true,
    pointerId: event.pointerId,
    pointerDownHadTarget: event.hasTarget,
    discardGesture: event.cameraMoving,
    result: undefined,
  };
};

const resolvePointerUp = (
  context: MeasureInputContext,
  event: Extract<MeasureInputEvent, { type: 'pointerUp' }>,
): Partial<MeasureInputContext> => {
  if (!context.isPointerDown || (context.pointerId !== undefined && event.pointerId !== context.pointerId)) {
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
    pointerId: undefined,
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
    pointerCancel: {
      context: ({ context, event }) =>
        context.pointerId === undefined || context.pointerId === event.pointerId ? resetPointerState('ignore') : {},
    },
    blur: { context: resetPointerState('ignore') },
    clearResult: { context: { result: undefined } },
  },
});
