import { describe, expectTypeOf, it } from 'vitest';
import type { ApplyParameterOperationInput, ApplyParameterOperationOutput } from '@taucad/chat/schemas';
import type {
  ParameterSetIdentity,
  ParameterSetOperation,
  ParameterSetOutcome,
  ParameterSetPlanResult,
} from '@taucad/parameters';
type ParameterSetProposal =
  | ParameterSetOutcome
  | (Extract<ParameterSetPlanResult, { status: 'confirmation-required' }> & { requestId: string });

type ProposalInput = Extract<ApplyParameterOperationInput, { operation: unknown }>;

describe('parameter agent wire compatibility', () => {
  it('keeps the chat DTO compatible with the runtime owner', () => {
    expectTypeOf<ProposalInput['expected']>().toExtend<ParameterSetIdentity>();
    expectTypeOf<ProposalInput['operation']>().toExtend<ParameterSetOperation>();
    expectTypeOf<ApplyParameterOperationOutput['outcome']>().toExtend<ParameterSetProposal>();
  });
});
