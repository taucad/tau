import { expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { branchMachine } from '#branch.machine.js';
import type { BranchActors, BranchMachineEmitted, BranchMachineEvent } from '#branch.machine.js';

expectTypeOf(branchMachine).toExtend<AnyStateMachine>();

/* Every effect is an injected actor, so a host that drifts from one's input or
 * output is a type error at the host rather than a runtime surprise. */
expectTypeOf<keyof BranchActors>().toEqualTypeOf<'checkBranch' | 'applySwitch' | 'merge' | 'rename'>();

/* The five verbs of the architecture's `branch.machine` row, plus the two the
 * confirmation needs, the three answers to its delegated registry requests
 * (by request id, RM-R11), and the four answers to the cut a *New branch*
 * asks the root for (P3). */
expectTypeOf<BranchMachineEvent['type']>().toEqualTypeOf<
  | 'switch'
  | 'merge'
  | 'discard'
  | 'create'
  | 'rename'
  | 'confirm'
  | 'cancel'
  | 'selectBranch'
  | 'checkoutAdded'
  | 'checkoutRemoved'
  | 'operationFailed'
  | 'revisionMinted'
  | 'nothingToSave'
  | 'cutFailed'
  | 'casLost'
>();

expectTypeOf<BranchMachineEmitted['type']>().toEqualTypeOf<
  'checkoutChanged' | 'branchMerged' | 'mergeConflicted' | 'toast.branch' | 'toast.error'
>();
