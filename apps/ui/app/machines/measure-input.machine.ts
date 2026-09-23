import { assign, assertEvent, setup } from 'xstate';

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

export const measureInputMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as MeasureInputContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as MeasureInputEvent,
  },
  actions: {
    recordPointerDown: assign(({ event }) => {
      assertEvent(event, 'pointerDown');
      if (event.button !== 0 && event.button !== 2) {
        return { result: 'ignore' };
      }

      return {
        isPointerDown: true,
        pointerDownHadTarget: event.hasTarget,
        discardGesture: event.cameraMoving,
        result: undefined,
      };
    }),
    markCameraMovement: assign(({ context }) =>
      context.isPointerDown
        ? {
            discardGesture: true,
            result: undefined,
          }
        : {},
    ),
    resolvePointerUp: assign(({ context, event }) => {
      assertEvent(event, 'pointerUp');
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
    }),
    cancelInput: assign(() => resetPointerState('cancelCurrent')),
    clearResult: assign({
      result: undefined,
    }),
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
    pointerDown: { actions: 'recordPointerDown' },
    pointerUp: { actions: 'resolvePointerUp' },
    cameraMoved: { actions: 'markCameraMovement' },
    cancel: { actions: 'cancelInput' },
    clearResult: { actions: 'clearResult' },
  },
});
