/**
 * Type-level contract for the one-call runtime plugin authoring API.
 *
 * These tests are statically analysed by TypeScript through Vitest typecheck.
 */

import { assertType, describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { RuntimeClientOptions } from '#client/runtime-document-client-core.js';
import type { AnyRuntimeDefinition, RuntimeDefinition, RuntimeDefinitionOptions } from '#index.js';
import { createRuntimeClient } from '#client/runtime-client.js';
import type { BundlerPlugin, MiddlewarePlugin, TranscoderPlugin } from '#plugins/plugin-types.js';
import { defineBundler } from '#types/runtime-bundler.types.js';
import { defineKernelV2 } from '#types/runtime-kernel-v2.types.js';
import { defineMiddleware } from '#plugins/middleware-entry.js';
import { defineTranscoder } from '#types/runtime-transcoder.types.js';
import type { TranscodeInput } from '#types/runtime-transcoder.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import type { RuntimeConfigInput, RuntimeConfigOutput } from '#worker/runtime-definition.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';

const makeKernel = () =>
  defineKernelV2({
    id: 'typedKernel',
    extensions: ['ts'],
    name: 'TypedKernel',
    version: '1.0.0',
    optionsSchema: z.object({
      endpoint: z.string(),
      retries: z.number().default(2),
    }),
    views: {},
    exports: {},
    async initialize(options) {
      expectTypeOf(options.endpoint).toEqualTypeOf<string>();
      expectTypeOf(options.retries).toEqualTypeOf<number>();
      return { endpoint: options.endpoint };
    },
    async resolve(input) {
      expectTypeOf(input.entryPath).toEqualTypeOf<string>();
      return { resolved: [], unresolved: [] };
    },
    async describe() {
      return { success: false, issues: [] };
    },
    async evaluate(input) {
      expectTypeOf(input.entryPath).toEqualTypeOf<string>();
      return { handle: { id: input.entryPath } };
    },
  });

describe('defineKernelV2 runtime projection', () => {
  it('preserves required factory options and exact kernel identity', () => {
    const kernel = makeKernel();
    expectTypeOf(kernel({ endpoint: 'wss://example.test' }).id).toEqualTypeOf<'typedKernel'>();
    // @ts-expect-error -- required kernel options are enforced on the factory.
    kernel();
  });
});

describe('positive-only middleware and transcoder declarations', () => {
  it('accepts omission and rejects empty or unknown middleware declarations', () => {
    defineMiddleware({
      id: 'omittedMiddlewareContent',
      name: 'Omitted middleware content',
    });
    defineMiddleware({
      id: 'invalidMiddlewareRenderContent',
      name: 'Invalid middleware render content',
      content: {
        // @ts-expect-error -- middleware render content must be non-empty.
        views: { 'image/svg+xml': [] },
      },
    });
    defineMiddleware({
      id: 'invalidMiddlewareExportContent',
      name: 'Invalid middleware export content',
      content: {
        exports: {
          // @ts-expect-error -- middleware export content must be non-empty.
          glb: [],
        },
      },
    });
    defineMiddleware({
      id: 'unknownMiddlewareRenderContent',
      name: 'Unknown middleware render content',
      content: {
        // @ts-expect-error -- unknown middleware render content is rejected.
        views: { 'image/svg+xml': ['includeSketches'] },
      },
    });
    defineMiddleware({
      id: 'unknownMiddlewareExportContent',
      name: 'Unknown middleware export content',
      content: {
        exports: {
          // @ts-expect-error -- unknown middleware export content is rejected.
          glb: ['includeSketches'],
        },
      },
    });
  });

  it('gives content-empty middleware hooks no content property', () => {
    defineMiddleware({
      id: 'contentEmptyHooks',
      name: 'Content-empty hooks',
      async wrapEvaluate(input, handler) {
        expectTypeOf(input).not.toHaveProperty('content');
        // @ts-expect-error -- omission removes the provider property.
        void input.content;
        return handler(input);
      },
      async wrapRender(input, handler) {
        expectTypeOf(input).not.toHaveProperty('content');
        const result = await handler(input);
        if (result.success) {
          expectTypeOf(result.data.content).toEqualTypeOf<Uint8Array<ArrayBuffer> | string>();
        }
        return result;
      },
      async wrapExport(input, handler) {
        expectTypeOf(input).not.toHaveProperty('content');
        return handler(input);
      },
    });
  });

  it('accepts omitted transcoder content and rejects empty or unknown declarations', () => {
    const base = {
      name: 'Type transcoder',
      version: '1.0.0',
      async initialize() {
        return {};
      },
      async transcode(input: TranscodeInput) {
        return { success: true, data: input.files, issues: [] };
      },
      async cleanup() {},
    };
    defineTranscoder({
      ...base,
      id: 'omittedTranscoderContent',
      edges: [{ from: 'glb', to: 'stl', fidelity: 'mesh' }] as const,
    });
    defineTranscoder({
      ...base,
      id: 'emptyTranscoderContent',
      edges: [
        {
          from: 'glb',
          to: 'stl',
          fidelity: 'mesh',
          // @ts-expect-error -- transcoder content must be non-empty.
          content: [],
        },
      ] as const,
    });
    defineTranscoder({
      ...base,
      id: 'unknownTranscoderContent',
      edges: [
        {
          from: 'glb',
          to: 'stl',
          fidelity: 'mesh',
          // @ts-expect-error -- unknown transcoder content is rejected.
          content: ['includeSketches'],
        },
      ] as const,
    });
  });
});

describe('defineMiddleware', () => {
  it('returns a callable factory with typed middleware options', () => {
    const middleware = defineMiddleware({
      id: 'typedMiddleware',
      name: 'TypedMiddleware',
      optionsSchema: z.object({
        cacheTtl: z.number().default(60),
      }),
      async wrapEvaluate(input, handler, runtime) {
        expectTypeOf(input.entryPath).toEqualTypeOf<string>();
        expectTypeOf(runtime.options).toEqualTypeOf<{ cacheTtl: number }>();
        return handler(input);
      },
    });

    assertType<(options?: { cacheTtl?: number | undefined }) => MiddlewarePlugin>(middleware);
    expectTypeOf(middleware().id).toEqualTypeOf<'typedMiddleware'>();
  });
});

describe('defineBundler', () => {
  it('returns a callable factory with static or option-derived extensions', () => {
    const bundler = defineBundler({
      id: 'typedBundler',
      name: 'TypedBundler',
      version: '1.0.0',
      optionsSchema: z.object({
        jsx: z.boolean().default(false),
      }),
      extensions: (options) => (options?.jsx ? ['ts', 'tsx'] : ['ts']),
      async initialize(options, runtime) {
        expectTypeOf(options.jsx).toEqualTypeOf<boolean>();
        expectTypeOf(runtime.filesystem.readFile).toBeFunction();
        return {};
      },
      async detectImports(input) {
        expectTypeOf(input.entryPath).toEqualTypeOf<string>();
        return { detectedModules: [], dependencies: [] };
      },
      async bundle(input) {
        expectTypeOf(input.entryPath).toEqualTypeOf<string>();
        return {
          code: '',
          issues: [],
          success: true,
          dependencies: [],
          unresolvedPaths: [],
        };
      },
      async execute(input) {
        expectTypeOf(input.code).toEqualTypeOf<string>();
        return { success: true, value: undefined };
      },
      registerModule(input) {
        expectTypeOf(input.name).toEqualTypeOf<string>();
        expectTypeOf(input.module.code).toEqualTypeOf<string>();
      },
    });

    assertType<(options?: { jsx?: boolean | undefined }) => BundlerPlugin>(bundler);
    expectTypeOf(bundler({ jsx: true }).id).toEqualTypeOf<'typedBundler'>();
  });
});

describe('defineTranscoder', () => {
  it('preserves transcoder edge literals and per-edge options', () => {
    const transcoder = defineTranscoder({
      id: 'typedTranscoder',
      name: 'TypedTranscoder',
      version: '1.0.0',
      edges: [
        {
          from: 'glb',
          to: 'stl',
          fidelity: 'mesh',
          optionsSchema: z.object({ binary: z.boolean() }),
        },
        { from: 'glb', to: 'usdz', fidelity: 'mesh' },
      ] as const,
      async initialize() {
        return {};
      },
      async transcode(input, runtime) {
        expectTypeOf(runtime.signal).toEqualTypeOf<AbortSignal>();
        if (input.to === 'stl') {
          expectTypeOf(input.options).toEqualTypeOf<{ binary: boolean }>();
        }
        if (input.to === 'usdz') {
          expectTypeOf(input.options).toEqualTypeOf<Record<string, unknown>>();
        }
        return { success: true, data: input.files, issues: [] };
      },
    });

    assertType<() => TranscoderPlugin>(transcoder);
    expectTypeOf(transcoder().id).toEqualTypeOf<'typedTranscoder'>();
  });

  it('preserves real source-target tuples on direct RuntimeClient transcodes', () => {
    const transcoder = defineTranscoder({
      id: 'correlatedTranscoder',
      name: 'CorrelatedTranscoder',
      version: '1.0.0',
      edges: [
        {
          from: 'glb',
          to: 'webp',
          fidelity: 'mesh',
          optionsSchema: z.object({ width: z.number() }),
        },
        {
          from: 'svg',
          to: 'png',
          fidelity: 'mesh',
          optionsSchema: z.object({ density: z.number() }),
        },
      ] as const,
      async initialize() {
        return {};
      },
      async transcode(input) {
        return { success: true, data: input.files, issues: [] };
      },
    })();
    const runtime = defineRuntime({ transcoders: [transcoder] });
    const client = createRuntimeClient({
      transport: inProcessTransport({ runtime }),
    });
    const files = [
      {
        name: 'input.glb',
        bytes: new Uint8Array([1]),
        mimeType: 'model/gltf-binary',
      },
    ] as const;

    void client.transcode({
      from: 'glb',
      to: 'webp',
      files: [...files],
      options: { width: 640 },
    });
    void client.transcode({
      from: 'svg',
      to: 'png',
      files: [...files],
      options: { density: 2 },
    });
    // @ts-expect-error -- no svg → webp edge exists.
    void client.transcode({
      from: 'svg',
      to: 'webp',
      files: [...files],
      options: { width: 640 },
    });
    void client.transcode({
      from: 'svg',
      to: 'png',
      files: [...files],
      // @ts-expect-error -- png options belong only to the svg → png edge.
      options: { width: 640 },
    });
  });

  it('types duplicate direct routes from the first registration only', () => {
    const first = defineTranscoder({
      id: 'firstRoute',
      name: 'First route',
      version: '1.0.0',
      edges: [
        {
          from: 'glb',
          to: 'webp',
          fidelity: 'mesh',
          optionsSchema: z.object({ first: z.literal(true) }),
        },
      ] as const,
      async initialize() {
        return {};
      },
      async transcode(input) {
        return { success: true, data: input.files, issues: [] };
      },
    })();
    const second = defineTranscoder({
      id: 'secondRoute',
      name: 'Second route',
      version: '1.0.0',
      edges: [
        {
          from: 'glb',
          to: 'webp',
          fidelity: 'mesh',
          optionsSchema: z.object({ second: z.literal(true) }),
        },
      ] as const,
      async initialize() {
        return {};
      },
      async transcode(input) {
        return { success: true, data: input.files, issues: [] };
      },
    })();
    const runtime = defineRuntime({ transcoders: [first, second] });
    const client = createRuntimeClient({
      transport: inProcessTransport({ runtime }),
    });
    const files = [
      {
        name: 'input.glb',
        bytes: new Uint8Array([1]),
        mimeType: 'model/gltf-binary',
      },
    ] as const;

    void client.transcode({
      from: 'glb',
      to: 'webp',
      files: [...files],
      options: { first: true },
    });
    void client.transcode({
      from: 'glb',
      to: 'webp',
      files: [...files],
      // @ts-expect-error -- the shadowed registration's options are not public.
      options: { second: true },
    });
  });
});

describe('defineRuntime and client projections', () => {
  it('exports runtime authoring types from the root entry', () => {
    expectTypeOf<RuntimeDefinition>().toExtend<AnyRuntimeDefinition>();
    expectTypeOf<RuntimeDefinitionOptions>().toExtend<{
      readonly kernels?: readonly never[];
    }>();
  });

  it('threads plugin factories through a typed runtime definition', () => {
    const runtime = defineRuntime({
      kernels: [makeKernel()({ endpoint: 'wss://example.test' })],
      middleware: [
        defineMiddleware({
          id: 'runtimeMiddleware',
          name: 'RuntimeMiddleware',
        })(),
      ],
      bundlers: [
        defineBundler({
          id: 'runtimeBundler',
          name: 'RuntimeBundler',
          version: '1.0.0',
          extensions: ['ts'],
          async initialize() {
            return {};
          },
          async detectImports() {
            return { detectedModules: [], dependencies: [] };
          },
          async bundle() {
            return {
              code: '',
              issues: [],
              success: true,
              dependencies: [],
              unresolvedPaths: [],
            };
          },
          async execute() {
            return { success: true, value: undefined };
          },
          registerModule() {},
        })(),
      ],
    });

    const transport = inProcessTransport({
      runtime,
      fileSystem: fromMemoryFs(),
    });
    const client = createRuntimeClient({ transport });
    void client.open({ source: { files: { 'main.ts': 'export default 1;' } } });

    // @ts-expect-error -- static runtimes do not accept boot config.
    createRuntimeClient({ transport, config: {} });

    // @ts-expect-error -- runtime values belong to the transport/host boundary, not client options.
    createRuntimeClient({ runtime, transport });
  });

  it('types boot config using z.input on the client and z.output in createRuntime', () => {
    const configSchema = z.object({
      endpoint: z.string().url(),
      retries: z.coerce.number().default(2),
    });
    const runtime = defineRuntime({
      configSchema,
      createRuntime(config) {
        expectTypeOf(config).toEqualTypeOf<{
          endpoint: string;
          retries: number;
        }>();
        return {
          kernels: [
            makeKernel()({
              endpoint: config.endpoint,
              retries: config.retries,
            }),
          ],
        };
      },
    });

    expectTypeOf<RuntimeConfigInput<typeof runtime>>().toEqualTypeOf<{
      endpoint: string;
      retries?: unknown;
    }>();
    expectTypeOf<RuntimeConfigOutput<typeof runtime>>().toEqualTypeOf<{
      endpoint: string;
      retries: number;
    }>();

    const options = {
      transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs() }),
      config: async () => ({ endpoint: 'https://example.test', retries: '3' }),
    } satisfies RuntimeClientOptions<typeof runtime>;
    void createRuntimeClient<typeof runtime>(options);

    // @ts-expect-error -- configured runtimes require client boot config.
    createRuntimeClient<typeof runtime>({
      transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs() }),
    });

    void createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs() }),
      config: { endpoint: 'https://example.test', retries: '3' },
    });
  });
});
