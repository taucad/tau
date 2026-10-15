import { expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { machineObservationMachine } from '#machines/machine-observation.machine.js';

expectTypeOf(machineObservationMachine).toExtend<AnyStateMachine>();
