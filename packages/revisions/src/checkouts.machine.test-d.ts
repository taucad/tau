import { expectTypeOf } from 'vitest';
import type { AnyStateMachine, InputFrom } from 'xstate';

import { checkoutsMachine } from '#checkouts.machine.js';
import type { CheckoutsMachineInput } from '#checkouts.machine.js';
import type { CheckoutRecord } from '#revision-port.js';

expectTypeOf(checkoutsMachine).toExtend<AnyStateMachine>();
expectTypeOf<InputFrom<typeof checkoutsMachine>>().toEqualTypeOf<CheckoutsMachineInput>();
expectTypeOf<CheckoutRecord['leaseRunIds']>().toEqualTypeOf<readonly string[]>();
