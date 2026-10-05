import { expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { observationMachine } from '#machines/observation.machine.js';

expectTypeOf(observationMachine).toExtend<AnyStateMachine>();
