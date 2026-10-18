import { expectTypeOf, it } from 'vitest';
import type { AnyStateMachine, InputFrom } from 'xstate';

import { restoreMachine } from '#restore.machine.js';
import type { RestoreMachineEmitted, RestoreMachineInput } from '#restore.machine.js';

it('preserves the complete restore.machine type contracts', () => {
  expectTypeOf(restoreMachine).toExtend<AnyStateMachine>();
  expectTypeOf<NonNullable<InputFrom<typeof restoreMachine>>>().toEqualTypeOf<RestoreMachineInput>();
  expectTypeOf<RestoreMachineEmitted['type']>().toExtend<string>();
});
