import { expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { chatSessionMachine } from './chat-session.machine.js';
import type {
  ChatRequest,
  ChatRunPhase,
  ChatSyncState,
  ChatTurn,
  ChatTurnOutcome,
  ChatTurnSettlementInput,
} from './chat-session.machine.js';

expectTypeOf(chatSessionMachine).toExtend<AnyStateMachine>();
expectTypeOf<ChatRunPhase>().toEqualTypeOf<'admitted' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'>();
expectTypeOf<ChatSyncState>().toEqualTypeOf<'synced' | 'pending' | 'conflicted'>();

/*
 * V3: a settlement names the run it settles, and the only run it can name is
 * the one the context holds. `settleTurn`'s input is a closed record built from
 * `context.turn`; there is no event-shaped variant of it to hand a foreign run
 * id through, and widening it here is what would put one back.
 */
expectTypeOf<ChatTurnSettlementInput>().toEqualTypeOf<
  Readonly<{
    chatId: string;
    runId: string | undefined;
    leaseTurnId: string | undefined;
    outcome: ChatTurnOutcome;
  }>
>();
expectTypeOf<ChatTurnSettlementInput>().not.toExtend<{ readonly gesture: unknown }>();
expectTypeOf<ChatTurnOutcome>().toEqualTypeOf<'completed' | 'failed' | 'cancelled'>();
expectTypeOf<ChatTurn['request']>().toEqualTypeOf<ChatRequest>();
