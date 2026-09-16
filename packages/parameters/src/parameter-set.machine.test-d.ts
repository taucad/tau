import { expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { parameterSetMachine } from '#parameter-set.machine.js';

expectTypeOf(parameterSetMachine).toExtend<AnyStateMachine>();
