import { expectTypeOf, it } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { chatSessionMachine } from './chat-session.machine.js';
import type { ChatRequest, ChatRunPhase, ChatSyncState, ChatTurn } from './chat-session.machine.js';

it('preserves the complete chat-session.machine type contracts', () => {
  expectTypeOf(chatSessionMachine).toExtend<AnyStateMachine>();
  expectTypeOf<ChatRunPhase>().toEqualTypeOf<
    'admitted' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  >();
  expectTypeOf<ChatSyncState>().toEqualTypeOf<'synced' | 'pending' | 'conflicted'>();

  expectTypeOf<ChatTurn['request']>().toEqualTypeOf<ChatRequest>();
});
