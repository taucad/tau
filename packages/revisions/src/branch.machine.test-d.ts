import { expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { branchMachine } from '#branch.machine.js';
import type { BranchActors, BranchMachineEmitted, BranchMachineEvent } from '#branch.machine.js';

expectTypeOf(branchMachine).toExtend<AnyStateMachine>();

/* Every effect is an injected actor, so a host that drifts from one's input or
 * output is a type error at the host rather than a runtime surprise. */
expectTypeOf<keyof BranchActors>().toEqualTypeOf<'checkBranch' | 'applySwitch' | 'merge' | 'rename'>();

/* The five verbs of the architecture's `branch.machine` row, plus the two the
 * confirmation needs and the three the parent answers with. */
expectTypeOf<BranchMachineEvent['type']>().toEqualTypeOf<
  | 'switch'
  | 'merge'
  | 'discard'
  | 'create'
  | 'rename'
  | 'confirm'
  | 'cancel'
  | 'selectBranch'
  | 'branchesChanged'
  | 'operationFailed'
>();

expectTypeOf<BranchMachineEmitted['type']>().toEqualTypeOf<
  'checkoutChanged' | 'branchMerged' | 'mergeConflicted' | 'toast.branch' | 'toast.error'
>();
