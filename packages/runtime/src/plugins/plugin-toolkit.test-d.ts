import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { KernelPlugin, MiddlewarePlugin, TranscoderPlugin } from '#plugins/plugin-types.js';
import { deriveImportExtensions } from '#plugins/plugin-derivation.js';
import { definePlugin } from '#plugins/plugin.js';
import type { CapabilitiesManifest } from '#types/runtime.types.js';
import type { RuntimeKernels, RuntimeMiddleware, RuntimeTranscoders } from '#worker/runtime-definition.js';
import { defineRuntime } from '#worker/runtime-definition.js';

type StepKernel = KernelPlugin<
  { step: { tolerance?: number } },
  unknown,
  'step',
  never,
  Record<never, never>,
  readonly ['ts']
>;
type DirectKernel = KernelPlugin<
  { stl: { binary: boolean } },
  unknown,
  'direct',
  never,
  Record<never, never>,
  readonly ['js']
>;
type CacheMiddleware = MiddlewarePlugin<'cache'>;
type ImageTranscoder = TranscoderPlugin<{ webp: { quality?: number } }, 'glb', 'image'>;

const stepKernel = (): StepKernel => ({ id: 'step', extensions: ['ts'] });
const directKernel = (): DirectKernel => ({ id: 'direct', extensions: ['js'] });
const cacheMiddleware = (): CacheMiddleware => ({ id: 'cache' });
const imageTranscoder = (): ImageTranscoder => ({ id: 'image' });
const configurableStepKernel = (options?: { readonly tolerance?: number }): StepKernel => {
  void options;
  return stepKernel();
};
const requiredDirectKernel = (options: { readonly endpoint: string }): DirectKernel => {
  void options;
  return directKernel();
};
const configurableImageTranscoder = (options?: { readonly quality?: number }): ImageTranscoder => {
  void options;
  return imageTranscoder();
};

const plugin = definePlugin({
  meta: { name: '@test/plugin' },
  kernels: { step: stepKernel },
  middleware: { cache: cacheMiddleware },
  transcoders: { image: imageTranscoder },
  presets: {
    default: ['kernels.step', 'middleware.cache'],
    export: ['transcoders.image'],
  },
});
const alias = plugin;

const configurablePlugin = definePlugin({
  meta: { name: '@test/configurable' },
  kernels: { configured: configurableStepKernel, required: requiredDirectKernel },
  transcoders: { image: configurableImageTranscoder },
  presets: {
    default: ['kernels.configured'],
    required: ['kernels.required'],
    export: ['transcoders.image'],
  },
});

describe('plugin toolkit types', () => {
  it('projects selected plugin tuples before direct buckets', () => {
    const runtime = defineRuntime({ plugins: [alias()], kernels: [directKernel()] });

    expectTypeOf<RuntimeKernels<typeof runtime>>().toEqualTypeOf<readonly [StepKernel, DirectKernel]>();
    expectTypeOf<RuntimeMiddleware<typeof runtime>[number]['id']>().toEqualTypeOf<'cache'>();
    expectTypeOf<RuntimeTranscoders<typeof runtime>[number]>().toEqualTypeOf<never>();
    expectTypeOf(deriveImportExtensions(runtime)).toEqualTypeOf<ReadonlyArray<'ts' | 'js'>>();
    expectTypeOf(Object.fromEntries(runtime.kernels.map((kernel) => [kernel.id, kernel.extensions]))).toEqualTypeOf<
      Record<string, readonly ['ts'] | readonly ['js']>
    >();

    type StepCapability = Extract<
      CapabilitiesManifest<RuntimeKernels<typeof runtime>>['registrations'][number],
      { readonly kind: 'kernel'; readonly id: 'step' }
    >;
    expectTypeOf<StepCapability['extensions']>().toEqualTypeOf<readonly ['ts']>();
  });

  it('derives role-nested options from the selected capability factories', () => {
    configurablePlugin({ kernels: { configured: { tolerance: 0.01 } } });
    configurablePlugin({ preset: 'required', kernels: { required: { endpoint: 'https://example.test' } } });
    configurablePlugin({ preset: 'export', transcoders: { image: { quality: 80 } } });

    // @ts-expect-error -- a selected factory with required options requires its nested option.
    configurablePlugin({ preset: 'required' });
    // @ts-expect-error -- zero-argument capability factories are not configurable.
    plugin({ kernels: { step: {} } });
    // @ts-expect-error -- capability options are limited to the selected preset.
    configurablePlugin({ transcoders: { image: { quality: 80 } } });
    // @ts-expect-error -- role names mirror the plugin definition buckets.
    configurablePlugin({ kernel: { configured: { tolerance: 0.01 } } });
  });

  it('projects a selected preset and the all-presets union for a widened preset', () => {
    const exportRuntime = defineRuntime({ plugins: [plugin({ preset: 'export' })] });
    expectTypeOf<RuntimeTranscoders<typeof exportRuntime>[number]['id']>().toEqualTypeOf<'image'>();

    const preset = 'default' as string;
    const widenedRuntime = defineRuntime({ plugins: [plugin({ preset })] });
    expectTypeOf<RuntimeKernels<typeof widenedRuntime>[number]>().toEqualTypeOf<StepKernel>();
    expectTypeOf<RuntimeMiddleware<typeof widenedRuntime>[number]>().toEqualTypeOf<CacheMiddleware>();
    expectTypeOf<RuntimeTranscoders<typeof widenedRuntime>[number]>().toEqualTypeOf<ImageTranscoder>();
  });

  it('projects config-backed plugin capabilities', () => {
    const runtime = defineRuntime({
      configSchema: z.object({}),
      createRuntime: () => ({ plugins: [plugin()] }),
    });

    expectTypeOf<RuntimeKernels<typeof runtime>[number]['id']>().toEqualTypeOf<'step'>();
    expectTypeOf<RuntimeMiddleware<typeof runtime>[number]['id']>().toEqualTypeOf<'cache'>();
  });

  it('rejects unknown literal preset selections and entries', () => {
    // @ts-expect-error -- literals must name a declared preset.
    plugin({ preset: 'missing' });

    definePlugin({
      meta: { name: '@test/invalid' },
      kernels: { step: stepKernel },
      presets: {
        // @ts-expect-error -- preset paths must name a declared capability.
        default: ['kernels.missing'],
      },
    });
  });
});
