import { describe, expectTypeOf, it } from 'vitest';
import type { RuntimeClient } from '#client/runtime-client-core.js';
import type { KernelPlugin, TranscoderPlugin } from '#plugins/plugin-types.js';
import { createMockRuntimeClient } from '#testing/kernel-testing.utils.js';
import type { RuntimeDefinition } from '#worker/runtime-definition.js';

type StepKernel = KernelPlugin<{ step: Record<never, never> }, Record<never, never>, 'step-kernel'>;
type MeshTranscoder = TranscoderPlugin<{ stl: Record<never, never> }, 'step', 'mesh-transcoder'>;
type NoPlugins = readonly never[];
type TestRuntime = RuntimeDefinition<readonly [StepKernel], NoPlugins, NoPlugins, readonly [MeshTranscoder]>;

describe('createMockRuntimeClient type projection', () => {
  it('preserves the wide RuntimeClient default', () => {
    expectTypeOf(createMockRuntimeClient()).toEqualTypeOf<RuntimeClient>();
  });

  it('projects concrete runtime kernel and transcoder tuples', () => {
    expectTypeOf(createMockRuntimeClient<TestRuntime>()).toEqualTypeOf<
      RuntimeClient<readonly [StepKernel], NoPlugins, readonly [MeshTranscoder]>
    >();
  });
});
