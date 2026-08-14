/**
 * Type-level contract for the one-call runtime plugin authoring API.
 *
 * These tests are statically analysed by TypeScript through Vitest typecheck.
 */

import { assertType, describe, expectTypeOf, it } from 'vitest';
import type { GeometryResponse } from '@taucad/types';
import { z } from 'zod';
import type { RuntimeClientOptions } from '#client/runtime-client-core.js';
import type { AnyRuntimeDefinition, RuntimeDefinition, RuntimeDefinitionOptions } from '#index.js';
import type { ExportRoute } from '#types/runtime.types.js';
import { createRuntimeClient } from '#client/runtime-client.js';
import type { BundlerPlugin, KernelPlugin, MiddlewarePlugin, TranscoderPlugin } from '#plugins/plugin-types.js';
import { defineBundler } from '#types/runtime-bundler.types.js';
import { defineKernel } from '#types/runtime-kernel.types.js';
import { defineMiddleware } from '#middleware/runtime-middleware.js';
import { defineTranscoder } from '#types/runtime-transcoder.types.js';
import type { TranscodeInput } from '#types/runtime-transcoder.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import type { RuntimeConfigInput, RuntimeConfigOutput } from '#worker/runtime-definition.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';

const testGeometry = { format: 'gltf', content: new Uint8Array([1]) } satisfies GeometryResponse;
const typedRenderSchema = z.object({
  tessellation: z.object({
    linearTolerance: z.number(),
  }),
});

const makeKernel = () =>
  defineKernel({
    id: 'typedKernel',
    extensions: ['ts'],
    name: 'TypedKernel',
    version: '1.0.0',
    optionsSchema: z.object({
      endpoint: z.string(),
      retries: z.number().default(2),
    }),
    createOptionsSchema: typedRenderSchema,
    render: { optionsSchema: typedRenderSchema },
    exportFormats: {
      step: { optionsSchema: z.object({ tolerance: z.number().default(0.1) }) },
      stl: { optionsSchema: z.object({ binary: z.boolean() }) },
    },
    async initialize(options) {
      return { endpoint: options.endpoint };
    },
    async getDependencies(input) {
      expectTypeOf(input.entryPath).toEqualTypeOf<string>();
      return { resolved: [], unresolved: [] };
    },
    async getParameters(input) {
      expectTypeOf(input.entryPath).toEqualTypeOf<string>();
      return { success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] };
    },
    async createGeometry(input) {
      expectTypeOf(input.entryPath).toEqualTypeOf<string>();
      expectTypeOf(input.options).toEqualTypeOf<{
        tessellation: { linearTolerance: number };
      }>();
      // @ts-expect-error -- kernel create inputs carry resolved values, not route intent.
      void input.operation;
      return { geometry: testGeometry, nativeHandle: { id: input.entryPath } };
    },
    async exportGeometry(_input) {
      return { success: true, data: [], issues: [] };
    },
  });

describe('defineKernel', () => {
  it('returns a callable factory with typed options, exports, and render options', () => {
    const kernel = makeKernel();

    assertType<(options: { endpoint: string; retries?: number | undefined }) => KernelPlugin>(kernel);
    expectTypeOf(kernel({ endpoint: 'wss://example.test' }).id).toEqualTypeOf<'typedKernel'>();

    // @ts-expect-error -- required kernel options are enforced on the factory.
    kernel();

    defineKernel({
      id: 'bad',
      extensions: ['ts'],
      name: 'Bad',
      version: '1.0.0',
      exportFormats: {},
      // @ts-expect-error -- unknown authoring keys are rejected at definition time.
      worker: () => undefined,
      async initialize() {
        return {};
      },
      async getDependencies() {
        return { resolved: [], unresolved: [] };
      },
      async getParameters() {
        return { success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] };
      },
      async createGeometry() {
        return { geometry: testGeometry, nativeHandle: {} };
      },
      async exportGeometry() {
        return { success: true, data: [], issues: [] };
      },
    });
  });

  it('threads durable native-handle snapshot types through paired hooks', () => {
    const kernel = defineKernel({
      id: 'snapshotKernel',
      extensions: ['snap'],
      name: 'SnapshotKernel',
      version: '1.0.0',
      exportFormats: {},
      async initialize() {
        return { contextValue: 'ready' };
      },
      async getDependencies() {
        return { resolved: [], unresolved: [] };
      },
      async getParameters() {
        return { success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] };
      },
      async createGeometry() {
        return { geometry: testGeometry, nativeHandle: { handleId: 'native' } };
      },
      serializeNativeHandle(input, runtime, context) {
        expectTypeOf(input.nativeHandle).toEqualTypeOf<{ handleId: string }>();
        expectTypeOf(runtime.logger.log).toBeFunction();
        expectTypeOf(context).toEqualTypeOf<{ contextValue: string }>();
        return { snapshotId: input.nativeHandle.handleId };
      },
      deserializeNativeHandle(input, runtime, context) {
        expectTypeOf(input.serializedNativeHandle).toEqualTypeOf<{ snapshotId: string }>();
        expectTypeOf(runtime.logger.log).toBeFunction();
        expectTypeOf(context).toEqualTypeOf<{ contextValue: string }>();
        return { handleId: input.serializedNativeHandle.snapshotId };
      },
      isNativeHandleValid(input, runtime, context) {
        expectTypeOf(input.nativeHandle).toEqualTypeOf<{ handleId: string }>();
        expectTypeOf(runtime.logger.log).toBeFunction();
        expectTypeOf(context).toEqualTypeOf<{ contextValue: string }>();
        return input.nativeHandle.handleId.length > 0;
      },
      async exportGeometry(input) {
        expectTypeOf(input.nativeHandle).toEqualTypeOf<{ handleId: string }>();
        return { success: true, data: [], issues: [] };
      },
    });

    assertType<() => KernelPlugin>(kernel);
  });

  it('rejects one-sided durable native-handle snapshot hooks', () => {
    // @ts-expect-error -- snapshot persistence is only valid when both hooks are present.
    defineKernel({
      id: 'halfSnapshotKernel',
      extensions: ['snap'],
      name: 'HalfSnapshotKernel',
      version: '1.0.0',
      exportFormats: {},
      async initialize() {
        return {};
      },
      async getDependencies() {
        return { resolved: [], unresolved: [] };
      },
      async getParameters() {
        return { success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] };
      },
      async createGeometry() {
        return { geometry: testGeometry, nativeHandle: { handleId: 'native' } };
      },
      serializeNativeHandle(input: { nativeHandle: { handleId: string } }) {
        const { nativeHandle } = input;
        return { snapshotId: nativeHandle.handleId };
      },
      async exportGeometry() {
        return { success: true, data: [], issues: [] };
      },
    });
  });
});

const minimalKernelDefinition = {
  id: 'minimalKernel',
  extensions: ['minimal'],
  name: 'MinimalKernel',
  version: '1.0.0',
  exportFormats: {},
  async initialize() {
    return {};
  },
  async getDependencies() {
    return { resolved: [], unresolved: [] };
  },
  async getParameters() {
    return { success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] };
  },
  async createGeometry() {
    return { geometry: testGeometry, nativeHandle: {} };
  },
  async exportGeometry() {
    return { success: true, data: [], issues: [] };
  },
};

describe('positive-only kernel declarations', () => {
  it('accepts omitted render and export content', () => {
    defineKernel(minimalKernelDefinition);
    defineKernel({
      ...minimalKernelDefinition,
      id: 'schemaOnlyRender',
      render: { optionsSchema: z.object({ quality: z.number().default(1) }) },
      exportFormats: { glb: { optionsSchema: z.object({}) } },
    });
  });

  it('rejects empty and unknown kernel content declarations', () => {
    defineKernel({
      ...minimalKernelDefinition,
      id: 'emptyRenderContent',
      render: {
        // @ts-expect-error -- content declarations are positive and non-empty.
        content: [],
      },
      async meshGeometry() {
        return { geometry: testGeometry };
      },
    });
    defineKernel({
      ...minimalKernelDefinition,
      id: 'emptyExportContent',
      exportFormats: {
        glb: {
          optionsSchema: z.object({}),
          // @ts-expect-error -- content declarations are positive and non-empty.
          content: [],
        },
      },
    });
    defineKernel({
      ...minimalKernelDefinition,
      id: 'unknownRenderContent',
      render: {
        // @ts-expect-error -- only canonical framework content keys are accepted.
        content: ['includeSketches'],
      },
      async meshGeometry() {
        return { geometry: testGeometry };
      },
    });
    defineKernel({
      ...minimalKernelDefinition,
      id: 'unknownExportContent',
      exportFormats: {
        glb: {
          optionsSchema: z.object({}),
          // @ts-expect-error -- only canonical framework content keys are accepted.
          content: ['includeSketches'],
        },
      },
    });
  });

  it('requires meshGeometry for positive native render content', () => {
    // @ts-expect-error -- render content is fulfilled at the mesh boundary.
    defineKernel({ ...minimalKernelDefinition, id: 'renderContentWithoutMesh', render: { content: ['includeEdges'] } });
    defineKernel({
      ...minimalKernelDefinition,
      id: 'renderContentWithMesh',
      render: { content: ['includeEdges'] },
      async meshGeometry(input) {
        expectTypeOf(input.content).toEqualTypeOf<{ readonly includeEdges?: boolean } | undefined>();
        return { geometry: testGeometry };
      },
    });
  });

  it('accepts only object create option schemas and rejects the removed scope flag', () => {
    defineKernel({
      ...minimalKernelDefinition,
      id: 'objectCreateSchema',
      createOptionsSchema: z.object({ quality: z.number().default(1) }),
      async createGeometry(input) {
        expectTypeOf(input.options).toEqualTypeOf<{ quality: number }>();
        expectTypeOf(input).not.toHaveProperty('content');
        const output = { geometry: testGeometry, nativeHandle: {} };
        expectTypeOf(output).not.toHaveProperty('nativeBuildInput');
        return output;
      },
    });

    // @ts-expect-error -- createOptionsSchema must be a Zod object.
    defineKernel({ ...minimalKernelDefinition, id: 'scalarCreateSchema', createOptionsSchema: z.string() });
    // @ts-expect-error -- createOptionsSchema must be a Zod object.
    defineKernel({ ...minimalKernelDefinition, id: 'arrayCreateSchema', createOptionsSchema: z.array(z.string()) });
    defineKernel({
      ...minimalKernelDefinition,
      id: 'unionCreateSchema',
      // @ts-expect-error -- createOptionsSchema must be a Zod object.
      createOptionsSchema: z.union([z.object({ a: z.string() }), z.object({ b: z.string() })]),
    });
    defineKernel({
      ...minimalKernelDefinition,
      id: 'transformedCreateSchema',
      // @ts-expect-error -- transformed object schemas are not direct Zod objects.
      createOptionsSchema: z.object({ quality: z.number() }).transform((value) => value),
    });
    defineKernel({
      ...minimalKernelDefinition,
      id: 'removedNativeScope',
      // @ts-expect-error -- native compatibility is derived from exact build identity.
      nativeHandleScope: 'source',
    });
  });

  it('omits content and options from source-only create hooks', () => {
    defineKernel({
      ...minimalKernelDefinition,
      id: 'sourceOnlyCreate',
      async createGeometry(input) {
        expectTypeOf(input).not.toHaveProperty('content');
        expectTypeOf(input).not.toHaveProperty('options');
        // @ts-expect-error -- framework content never reaches kernel construction.
        void input.content;
        // @ts-expect-error -- options exist only with createOptionsSchema.
        void input.options;
        return { geometry: testGeometry, nativeHandle: {} };
      },
    });
  });
});

describe('positive-only middleware and transcoder declarations', () => {
  it('accepts omission and rejects empty or unknown middleware declarations', () => {
    defineMiddleware({ id: 'omittedMiddlewareContent', name: 'Omitted middleware content' });
    defineMiddleware({
      id: 'invalidMiddlewareRenderContent',
      name: 'Invalid middleware render content',
      content: {
        // @ts-expect-error -- middleware render content must be non-empty.
        render: [],
      },
    });
    defineMiddleware({
      id: 'invalidMiddlewareExportContent',
      name: 'Invalid middleware export content',
      content: {
        exportFormats: {
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
        render: ['includeSketches'],
      },
    });
    defineMiddleware({
      id: 'unknownMiddlewareExportContent',
      name: 'Unknown middleware export content',
      content: {
        exportFormats: {
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
      async wrapCreateGeometry(input, handler) {
        expectTypeOf(input).not.toHaveProperty('content');
        // @ts-expect-error -- omission removes the provider property.
        void input.content;
        return handler(input);
      },
      async wrapMeshGeometry(input, handler) {
        expectTypeOf(input).not.toHaveProperty('content');
        return handler(input);
      },
      async wrapExportGeometry(input, handler) {
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
      async wrapCreateGeometry(input, handler, runtime) {
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
      async initialize(_init, _options) {
        return {};
      },
      async detectImports(input) {
        expectTypeOf(input.entryPath).toEqualTypeOf<string>();
        return { detectedModules: [], dependencies: [] };
      },
      async bundle(input) {
        expectTypeOf(input.entryPath).toEqualTypeOf<string>();
        return { code: '', issues: [], success: true, dependencies: [], unresolvedPaths: [] };
      },
      async execute() {
        return { success: true, value: undefined };
      },
      registerModule() {},
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
        { from: 'glb', to: 'stl', fidelity: 'mesh', optionsSchema: z.object({ binary: z.boolean() }) },
        { from: 'glb', to: 'usdz', fidelity: 'mesh' },
      ] as const,
      async initialize() {
        return {};
      },
      async transcode(input) {
        if (input.to === 'stl') {
          expectTypeOf(input.options).toEqualTypeOf<{ binary: boolean }>();
        }
        if (input.to === 'usdz') {
          expectTypeOf(input.options).toEqualTypeOf<Record<string, unknown>>();
        }
        return { success: true, data: input.files, issues: [] };
      },
      async cleanup() {},
    });

    assertType<() => TranscoderPlugin>(transcoder);
    expectTypeOf(transcoder().id).toEqualTypeOf<'typedTranscoder'>();
  });
});

describe('defineRuntime and client projections', () => {
  it('exports runtime authoring types from the root entry', () => {
    expectTypeOf<RuntimeDefinition>().toExtend<AnyRuntimeDefinition>();
    expectTypeOf<RuntimeDefinitionOptions>().toExtend<{ readonly kernels?: readonly never[] }>();
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
            return { code: '', issues: [], success: true, dependencies: [], unresolvedPaths: [] };
          },
          async execute() {
            return { success: true, value: undefined };
          },
          registerModule() {},
        })(),
      ],
    });

    const transport = inProcessTransport({ runtime, fileSystem: fromMemoryFs() });
    const client = createRuntimeClient({ transport });
    const mainSourcePath = 'main.ts';
    void client.bestRouteFor('step');
    void client.export('step', {
      source: { files: { [mainSourcePath]: 'export default 1;' } },
      exportOptions: { tolerance: 0.1 },
    });
    void client.export('step', {
      source: { files: { [mainSourcePath]: 'export default 1;' } },
      exportOptions: { tolerance: 0.1 },
    });
    void client.export('step', {
      source: { files: { [mainSourcePath]: 'export default 1;' } },
      exportOptions: {
        // @ts-expect-error -- `binary` is an STL export option, not a STEP export option.
        binary: true,
      },
    });
    // @ts-expect-error -- unknown export formats are rejected from the typed runtime projection.
    void client.bestRouteFor('unknown');

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
        expectTypeOf(config).toEqualTypeOf<{ endpoint: string; retries: number }>();
        return {
          kernels: [makeKernel()({ endpoint: config.endpoint, retries: config.retries })],
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
    createRuntimeClient<typeof runtime>({ transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs() }) });

    void createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs() }),
      config: { endpoint: 'https://example.test', retries: '3' },
    });
  });
});

describe('route-scoped content projections', () => {
  const contentKernel = defineKernel({
    id: 'contentKernel',
    extensions: ['content'],
    name: 'ContentKernel',
    version: '1.0.0',
    render: {
      optionsSchema: z.object({ detail: z.number().default(1) }),
      content: ['includeEdges', 'includeTopology'],
    },
    exportFormats: {
      glb: {
        optionsSchema: z
          .object({
            coordinateSystem: z.enum(['y-up', 'z-up']).default('y-up'),
            unit: z.object({ length: z.enum(['meter', 'millimeter']).default('meter') }).default({ length: 'meter' }),
            tessellation: z.object({ linearTolerance: z.number().default(0.01) }).optional(),
          })
          .strict(),
        content: ['includeEdges', 'includeTopology'],
      },
      step: { optionsSchema: z.object({ tolerance: z.number().default(0.01) }).strict() },
    },
    async initialize() {
      return {};
    },
    async getDependencies() {
      return { resolved: [], unresolved: [] };
    },
    async getParameters() {
      return { success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] };
    },
    async createGeometry(input) {
      expectTypeOf(input).not.toHaveProperty('content');
      expectTypeOf(input).not.toHaveProperty('options');
      // @ts-expect-error -- kernel construction is always content-free.
      void input.content;
      return { nativeHandle: {} };
    },
    async meshGeometry(input) {
      expectTypeOf<typeof input.content>().toEqualTypeOf<
        | {
            readonly includeEdges?: boolean;
            readonly includeTopology?: boolean;
          }
        | undefined
      >();
      return { geometry: testGeometry };
    },
    async exportGeometry(input) {
      // @ts-expect-error -- mixed format unions require format narrowing before content access.
      void input.content;
      if (input.format === 'glb') {
        expectTypeOf<typeof input.content>().toEqualTypeOf<
          | {
              readonly includeEdges?: boolean;
              readonly includeTopology?: boolean;
            }
          | undefined
        >();
      }
      if (input.format === 'step') {
        expectTypeOf(input).not.toHaveProperty('content');
        // @ts-expect-error -- omitted STEP support removes the provider property.
        void input.content;
      }
      return { success: true, data: [], issues: [] };
    },
  })();

  const fallbackKernel = defineKernel({
    id: 'fallbackKernel',
    extensions: ['fallback'],
    name: 'FallbackKernel',
    version: '1.0.0',
    exportFormats: { glb: { optionsSchema: z.object({}) } },
    async initialize() {
      return {};
    },
    async getDependencies() {
      return { resolved: [], unresolved: [] };
    },
    async getParameters() {
      return { success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] };
    },
    async createGeometry(input) {
      expectTypeOf(input).not.toHaveProperty('content');
      expectTypeOf(input).not.toHaveProperty('options');
      return { geometry: testGeometry, nativeHandle: {} };
    },
    async exportGeometry(input) {
      expectTypeOf(input).not.toHaveProperty('content');
      return { success: true, data: [], issues: [] };
    },
  })();

  const edges = defineMiddleware({
    id: 'typedEdges',
    name: 'TypedEdges',
    content: {
      render: ['includeEdges'],
      exportFormats: { glb: ['includeEdges'] },
    },
    async wrapCreateGeometry(input, handler) {
      expectTypeOf<typeof input.content>().toEqualTypeOf<{ readonly includeEdges?: boolean } | undefined>();
      return handler(input);
    },
    async wrapMeshGeometry(input, handler) {
      expectTypeOf<typeof input.content>().toEqualTypeOf<{ readonly includeEdges?: boolean } | undefined>();
      return handler(input);
    },
    async wrapExportGeometry(input, handler) {
      expectTypeOf<typeof input.content>().toEqualTypeOf<{ readonly includeEdges?: boolean } | undefined>();
      return handler(input);
    },
  })();

  const images = defineTranscoder({
    id: 'typedImages',
    name: 'TypedImages',
    version: '1.0.0',
    edges: [
      {
        from: 'glb',
        to: 'webp',
        fidelity: 'mesh',
        optionsSchema: z.object({ width: z.number().default(768) }).strict(),
        content: ['includeEdges'],
        sourceOptions: { coordinateSystem: 'y-up', unit: { length: 'meter' } },
      },
    ] as const,
    async initialize() {
      return {};
    },
    async transcode(input) {
      expectTypeOf(input).not.toHaveProperty('content');
      return { success: true, data: input.files, issues: [] };
    },
    async cleanup() {},
  })();

  const runtime = defineRuntime({
    kernels: [contentKernel, fallbackKernel],
    middleware: [edges],
    transcoders: [images],
  });
  const client = createRuntimeClient({
    transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs() }),
  });
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Runtime source maps are keyed by literal file paths.
  const source = { files: { 'main.content': 'model' } } as const;

  it('accepts only content reachable for the requested target', () => {
    void client.render({ source, content: { includeEdges: true, includeTopology: true } });
    void client.export('glb', { source, content: { includeEdges: true, includeTopology: true } });
    void client.export('webp', {
      source,
      content: { includeEdges: true },
      exportOptions: { tessellation: { linearTolerance: 0.005 }, width: 1920 },
    });

    void client.export('webp', {
      source,
      // @ts-expect-error -- the image edge fulfills edges, not Tau topology metadata.
      content: { includeTopology: true },
    });
    void client.export('step', {
      source,
      // @ts-expect-error -- STEP does not advertise framework content.
      content: { includeEdges: false },
    });
    void client.export('webp', {
      source,
      exportOptions: {
        // @ts-expect-error -- the image route pins its intermediate coordinate system.
        coordinateSystem: 'z-up',
      },
    });
  });

  it('narrows bestRouteFor by target, kernel, and requested content', () => {
    const native = client.bestRouteFor('glb', { kernelId: 'contentKernel' });
    expectTypeOf(native).toEqualTypeOf<
      | ExportRoute<
          readonly [typeof contentKernel, typeof fallbackKernel],
          readonly [typeof edges],
          readonly [typeof images],
          'glb',
          'contentKernel'
        >
      | undefined
    >();
    void client.bestRouteFor('glb', { kernelId: 'fallbackKernel', content: { includeEdges: true } });
    void client.bestRouteFor('webp', { kernelId: 'contentKernel', content: { includeEdges: true } });

    // @ts-expect-error -- kernel ids are projected from the runtime definition.
    void client.bestRouteFor('glb', { kernelId: 'missingKernel' });
    // @ts-expect-error -- WebP does not carry topology.
    void client.bestRouteFor('webp', { content: { includeTopology: true } });
  });
});
