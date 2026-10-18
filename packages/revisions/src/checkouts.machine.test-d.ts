import { expectTypeOf, it } from 'vitest';
import type { AnyStateMachine, InputFrom } from 'xstate';

import { checkoutsMachine } from '#checkouts.machine.js';
import type { CheckoutsMachineInput } from '#checkouts.machine.js';
import type { CheckoutRecord } from '#revision-port.js';

it('preserves the complete checkouts.machine type contracts', () => {
  expectTypeOf(checkoutsMachine).toExtend<AnyStateMachine>();
  expectTypeOf<NonNullable<InputFrom<typeof checkoutsMachine>>>().toEqualTypeOf<CheckoutsMachineInput>();
  expectTypeOf<CheckoutRecord['leaseRunIds']>().toEqualTypeOf<readonly string[]>();
});
