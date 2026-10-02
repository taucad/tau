import { describe, expectTypeOf, it } from 'vitest';
import { defineRuntime } from '@taucad/runtime';
import type { KernelPlugin, RuntimeClient } from '@taucad/runtime';
import { z } from 'zod';
import type { RuntimeAgentClient } from '#runtime/runtime-agent-clients.js';
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

type EvaluationKernel<Id extends string, Schema extends z.ZodType> = KernelPlugin<
  Record<never, never>,
  Record<string, unknown>,
  Id,
  never,
  Record<never, never>,
  readonly ['cad'],
  Schema
>;
declare const optionalKernel: EvaluationKernel<'optional', z.ZodObject<{ quality: z.ZodOptional<z.ZodNumber> }>>;
declare const defaultKernel: EvaluationKernel<'default', z.ZodObject<{ quality: z.ZodDefault<z.ZodNumber> }>>;
const transformedSchema = z.object({ quality: z.number().optional() }).transform((value) => value);
declare const transformedKernel: EvaluationKernel<'transformed', typeof transformedSchema>;
declare const requiredKernel: EvaluationKernel<'required', z.ZodObject<{ quality: z.ZodNumber }>>;
const optionalRuntime = defineRuntime({ kernels: [optionalKernel] });
const defaultRuntime = defineRuntime({ kernels: [defaultKernel] });
const transformedRuntime = defineRuntime({ kernels: [transformedKernel] });
const requiredRuntime = defineRuntime({ kernels: [requiredKernel] });

describe('runtime agent client admission', () => {
  it('accepts finite defaultable evaluation and rejects required evaluation options', () => {
    expectTypeOf<RuntimeClient<typeof optionalRuntime>>().toExtend<RuntimeAgentClient>();
    expectTypeOf<RuntimeClient<typeof defaultRuntime>>().toExtend<RuntimeAgentClient>();
    expectTypeOf<RuntimeClient<typeof transformedRuntime>>().toExtend<RuntimeAgentClient>();
    expectTypeOf<RuntimeClient<typeof requiredRuntime>>().not.toExtend<RuntimeAgentClient>();
  });
});

describe('parameter agent wire compatibility', () => {
  it('keeps the chat DTO compatible with the runtime owner', () => {
    expectTypeOf<ProposalInput['expected']>().toExtend<ParameterSetIdentity>();
    expectTypeOf<ProposalInput['operation']>().toExtend<ParameterSetOperation>();
    // Both directions: the wire must not silently drop an operation kind the owner still accepts.
    expectTypeOf<ParameterSetOperation['kind']>().toEqualTypeOf<ProposalInput['operation']['kind']>();
    expectTypeOf<ApplyParameterOperationOutput['outcome']>().toExtend<ParameterSetProposal>();
  });
});
