import { expectTypeOf, it } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { observationMachine } from '#machines/observation.machine.js';

it('preserves the complete observation.machine type contracts', () => {
  expectTypeOf(observationMachine).toExtend<AnyStateMachine>();
});
