import { expectTypeOf } from 'vitest';
import type { ActorRefFrom, AnyStateMachine, InputFrom } from 'xstate';

import { checkoutMachine } from '#checkout.machine.js';
import type { CheckoutCutTrigger, CheckoutMachineEmitted, CheckoutMachineInput } from '#checkout.machine.js';
import type { RevisionTrigger } from '#revision-authority.js';

expectTypeOf(checkoutMachine).toExtend<AnyStateMachine>();
expectTypeOf<InputFrom<typeof checkoutMachine>>().toEqualTypeOf<CheckoutMachineInput>();
expectTypeOf<ActorRefFrom<typeof checkoutMachine>['send']>().toBeFunction();
expectTypeOf<CheckoutMachineEmitted['type']>().toExtend<string>();

/*
 * One checkpoint vocabulary, in two places that cannot import each other.
 *
 * `checkout.machine` imports nothing but XState (A38), so it cannot read the
 * provenance union it fills; this assertion is what keeps the pair from
 * drifting into two.
 */
expectTypeOf<CheckoutCutTrigger>().toEqualTypeOf<RevisionTrigger>();
