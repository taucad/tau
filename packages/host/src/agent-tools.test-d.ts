import { describe, expectTypeOf, it } from 'vitest';
import { defineRuntime } from '@taucad/runtime';
import type { KernelPlugin, RuntimeClient } from '@taucad/runtime';
import type { RuntimeAgentClient } from '@taucad/agent-tools/runtime';
import { z } from 'zod';

import type { HostRuntimeClient } from '#agent-tools.js';

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

describe('host runtime client admission', () => {
  it('should preserve the complete prior host runtime surface in both directions', () => {
    type PreviousHostRuntimeClient = Pick<RuntimeClient, 'describe' | 'transcode' | 'connect' | 'capabilities'> &
      Pick<RuntimeAgentClient, 'open'>;
    expectTypeOf<HostRuntimeClient>().toExtend<PreviousHostRuntimeClient>();
    expectTypeOf<PreviousHostRuntimeClient>().toExtend<HostRuntimeClient>();
    expectTypeOf<HostRuntimeClient['open']>().toEqualTypeOf<RuntimeAgentClient['open']>();
  });

  it('accepts finite defaultable evaluation and rejects required evaluation options', () => {
    expectTypeOf<RuntimeClient<typeof optionalRuntime>>().toExtend<HostRuntimeClient>();
    expectTypeOf<RuntimeClient<typeof defaultRuntime>>().toExtend<HostRuntimeClient>();
    expectTypeOf<RuntimeClient<typeof transformedRuntime>>().toExtend<HostRuntimeClient>();
    expectTypeOf<RuntimeClient<typeof requiredRuntime>>().not.toExtend<HostRuntimeClient>();
  });
});
