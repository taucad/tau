import { expectTypeOf } from 'vitest';
import type { ActorRefFrom, AnyStateMachine, InputFrom } from 'xstate';

import { checkoutMachine } from '#checkout.machine.js';
import type { CheckoutCutTrigger, CheckoutMachineEmitted, CheckoutMachineInput } from '#checkout.machine.js';
import type { RevisionTrigger } from '#revision-authority.js';

expectTypeOf(checkoutMachine).toExtend<AnyStateMachine>();
expectTypeOf<NonNullable<InputFrom<typeof checkoutMachine>>>().toEqualTypeOf<CheckoutMachineInput>();
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

declare const checkout: ActorRefFrom<typeof checkoutMachine>;

/* RM-A16: a cut without a request id could not be answered to its requester (D14, RM-R1). */
// @ts-expect-error `requestId` is required on every cut.
checkout.send({ type: 'cut', trigger: 'save', leaseIds: [] });

/* RM-R5: a producer's head is a hint, never adopted; `headMoved` carries nothing. */
// @ts-expect-error `headChanged` is gone.
checkout.send({ type: 'headChanged', revisionId: 'rev-2', treeId: 'tree-2' });
