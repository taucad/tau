import { expectTypeOf, it } from 'vitest';
import type { AnyStateMachine, InputFrom } from 'xstate';

import { turnMachine } from '#turn.machine.js';
import type { TurnMachineInput, TurnSettlement } from '#turn.machine.js';

it('preserves the complete turn.machine type contracts', () => {
  expectTypeOf(turnMachine).toExtend<AnyStateMachine>();
  expectTypeOf<NonNullable<InputFrom<typeof turnMachine>>>().toEqualTypeOf<TurnMachineInput>();
  expectTypeOf<TurnSettlement['revisionId']>().toEqualTypeOf<string | undefined>();
});
