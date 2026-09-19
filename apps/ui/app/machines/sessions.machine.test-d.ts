import { expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { sessionsMachine } from './sessions.machine.js';
import type { SessionsMachineContext, SessionsMachineEmitted } from './sessions.machine.js';

expectTypeOf(sessionsMachine).toExtend<AnyStateMachine>();
expectTypeOf<SessionsMachineContext['budget']>().toEqualTypeOf<number>();
expectTypeOf<SessionsMachineEmitted['type']>().toEqualTypeOf<'liveSetChanged' | 'budgetRefused' | 'quiesced'>();
