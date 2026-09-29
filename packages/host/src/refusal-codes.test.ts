import { describe, expectTypeOf, it } from 'vitest';
import type { RefusalCode } from '@taucad/agent-host/wire';
import type { RevisionPortError } from '@taucad/revisions';
import type { BranchFailureCode } from '@taucad/revisions/branch-machine';
import type { TurnFailureCode } from '@taucad/revisions/turn-machine';

type RevisionPortErrorCode = RevisionPortError['code'];

describe('refusal registry', () => {
  it('should type every revision refusal code as a registry entry', () => {
    expectTypeOf<RevisionPortErrorCode | TurnFailureCode | BranchFailureCode>().toExtend<RefusalCode>();
  });
});
