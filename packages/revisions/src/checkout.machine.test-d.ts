import { expectTypeOf } from 'vitest';
import type { ActorRefFrom, AnyStateMachine, InputFrom } from 'xstate';

import { checkoutMachine } from '#checkout.machine.js';
import type { CheckoutMachineEmitted, CheckoutMachineInput } from '#checkout.machine.js';

expectTypeOf(checkoutMachine).toExtend<AnyStateMachine>();
expectTypeOf<InputFrom<typeof checkoutMachine>>().toEqualTypeOf<CheckoutMachineInput>();
expectTypeOf<ActorRefFrom<typeof checkoutMachine>['send']>().toBeFunction();
expectTypeOf<CheckoutMachineEmitted['type']>().toExtend<string>();
