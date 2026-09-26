/* eslint-disable @typescript-eslint/naming-convention -- XState uses UPPER_CASE event types */
import { setup, types } from 'xstate';
import type { ChatMode } from '@taucad/chat/constants';
import { chatMode } from '@taucad/chat/constants';
import { eventSchemas } from '#lib/xstate.lib.js';

type ChatModeContext = {
  mode: ChatMode;
  activePlanPath: string | undefined;
};

type ChatModeEvent =
  | { type: 'SET_MODE'; mode: ChatMode }
  | { type: 'PLAN_FILE_DETECTED'; path: string }
  | { type: 'BUILD_APPROVED' }
  | { type: 'BUILD_COMPLETE' };

export const chatModeMachine = setup({
  schemas: {
    context: types<ChatModeContext>(),
    events: eventSchemas<ChatModeEvent>(),
  },
}).createMachine({
  id: 'chatMode',
  initial: 'idle',
  context: {
    mode: chatMode.agent,
    activePlanPath: undefined,
  },
  on: {
    SET_MODE: {
      context: ({ event }) => ({ mode: event.mode }),
    },
  },
  states: {
    idle: {
      on: {
        PLAN_FILE_DETECTED: {
          target: 'planCreated',
          context: ({ event }) => ({ activePlanPath: event.path }),
        },
      },
    },
    planCreated: {
      on: {
        BUILD_APPROVED: {
          target: 'building',
        },
        SET_MODE: {
          target: 'idle',
          context: ({ event }) => ({ mode: event.mode, activePlanPath: undefined }),
        },
      },
    },
    building: {
      on: {
        BUILD_COMPLETE: {
          target: 'idle',
          context: { activePlanPath: undefined, mode: chatMode.agent },
        },
      },
    },
  },
});
