import { expectTypeOf, it } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { machineObservationMachine } from '#machines/machine-observation.machine.js';

it('should preserve the machine observation contract', () => {
  expectTypeOf(machineObservationMachine).toExtend<AnyStateMachine>();
});
