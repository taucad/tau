import { expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { sessionsMachine } from './sessions.machine.js';
import type { SessionsMachineContext, SessionsMachineEmitted, SessionsPendingOpen } from './sessions.machine.js';

expectTypeOf(sessionsMachine).toExtend<AnyStateMachine>();
expectTypeOf<SessionsMachineContext['budget']>().toEqualTypeOf<number>();
expectTypeOf<SessionsMachineEmitted['type']>().toEqualTypeOf<
  'liveSetChanged' | 'budgetRefused' | 'quiesced' | 'pendingOpenDropped'
>();
expectTypeOf<SessionsMachineContext['pendingOpen']>().toEqualTypeOf<SessionsPendingOpen | undefined>();
