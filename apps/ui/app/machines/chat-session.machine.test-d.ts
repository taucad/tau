import { expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { chatSessionMachine } from './chat-session.machine.js';
import type { ChatRunPhase, ChatSyncState } from './chat-session.machine.js';

expectTypeOf(chatSessionMachine).toExtend<AnyStateMachine>();
expectTypeOf<ChatRunPhase>().toEqualTypeOf<'admitted' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'>();
expectTypeOf<ChatSyncState>().toEqualTypeOf<'synced' | 'pending' | 'conflicted'>();
