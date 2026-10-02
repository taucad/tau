import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { KernelPlugin, MiddlewarePlugin, TranscoderEdgeType, TranscoderPlugin } from '#plugins/plugin-types.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';
import type { RuntimeDocument, ExportResult, OpenInput } from '#client/runtime-document.types.js';
import type { RuntimeDocumentProtocol } from '#types/runtime-document-protocol.types.js';
import { createRuntimeClient } from '#client/runtime-client.js';
import type { TransportPlugin } from '#transport/runtime-transport.types.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { defineKernelV2, nonemptyExportFiles } from '#types/runtime-kernel-v2.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import type { AnyRuntimeDefinition, RuntimeMiddleware, RuntimeTranscoders } from '#worker/runtime-definition.js';
import { definePlugin } from '#plugins/plugin.js';
import { defineMiddleware } from '#plugins/middleware-entry.js';
import { defineTranscoder } from '#types/runtime-transcoder.types.js';

type BoardKernel = KernelPlugin<
  Record<never, never>,
  Record<string, unknown>,
  'board-kernel',
  never,
  Record<never, never>,
  readonly ['tsx'],
  undefined,
  {
    readonly board: {
      readonly title: 'Board';
      readonly mimeType: 'image/svg+xml';
      readonly optionsSchema: z.ZodObject<{ scale: z.ZodNumber }>;
    };
  },
  {
    readonly bom: {
      readonly title: 'BOM';
      readonly mimeType: 'text/csv';
      readonly extension: 'csv';
      readonly content: readonly ['includeTopology'];
      readonly optionsSchema: z.ZodObject<{ delimiter: z.ZodString }>;
    };
  }
>;
type SolidKernel = KernelPlugin<
  Record<never, never>,
  Record<string, unknown>,
  'solid-kernel',
  never,
  Record<never, never>,
  readonly ['scad'],
  undefined,
  { readonly solid: { readonly title: 'Solid'; readonly mimeType: 'model/gltf-binary' } },
  {
    readonly mesh: { readonly title: 'Mesh'; readonly mimeType: 'model/stl'; readonly extension: 'stl' };
    readonly csv: {
      readonly title: 'Mesh metadata';
      readonly mimeType: 'text/plain';
      readonly extension: 'obj';
      readonly optionsSchema: z.ZodObject<{ quality: z.ZodNumber }>;
    };
  }
>;
declare const document: RuntimeDocument<readonly [BoardKernel, SolidKernel]>;
type DiagramMiddleware = MiddlewarePlugin<'diagram', 'includeEdges'> &
  RuntimePluginDefinitionCarrier<{
    readonly content: {
      readonly views: { readonly 'image/svg+xml': readonly ['includeEdges'] };
      readonly exports: { readonly csv: readonly ['includeTopology'] };
    };
  }>;
type PdfTranscoder = TranscoderPlugin<
  { readonly pdf: TranscoderEdgeType<'csv', { readonly layout: 'portrait' | 'landscape' }> },
  'csv',
  'pdf-converter',
  { readonly pdf: 'includeTopology' },
  { readonly pdf: 'delimiter' }
>;
type BranchTranscoder = TranscoderPlugin<
  {
    readonly png: TranscoderEdgeType<
      'csv',
      | { readonly mode: 'single'; readonly camera: 'front' | 'top' }
      | { readonly mode: 'batch'; readonly views: readonly ['front', ...string[]] }
    >;
  },
  'csv',
  'branch-converter',
  Record<never, never>,
  { readonly png: 'delimiter' }
>;
declare const routed: RuntimeDocument<
  readonly [BoardKernel, SolidKernel],
  readonly [DiagramMiddleware],
  readonly [PdfTranscoder]
>;
declare const branchRouted: RuntimeDocument<readonly [BoardKernel], readonly never[], readonly [BranchTranscoder]>;
type PrecisionKernel = KernelPlugin<
  Record<never, never>,
  Record<string, unknown>,
  'precision',
  never,
  Record<never, never>,
  readonly ['ts'],
  z.ZodObject<{ precision: z.ZodNumber }>
>;
declare const openPrecision: (input: OpenInput<{ readonly '/main.ts': string }, readonly [PrecisionKernel]>) => void;

const realKernel = defineKernelV2({
  id: 'real-document',
  name: 'Real document',
  version: '1.0.0',
  extensions: ['tsx'],
  evaluateOptionsSchema: z.object({ precision: z.number() }),
  views: {
    preview: { title: 'Preview', mimeType: 'image/svg+xml' },
    diagram: { title: 'Diagram', mimeType: 'image/svg+xml', optionsSchema: z.object({ scale: z.number() }) },
  },
  exports: {
    bom: { title: 'BOM', mimeType: 'text/csv', extension: 'csv', optionsSchema: z.object({ delimiter: z.string() }) },
  },
  async initialize() {
    return {};
  },
  async resolve() {
    return { resolved: [], unresolved: [] };
  },
  async describe() {
    return { success: false, issues: [] };
  },
  async evaluate() {
    return { handle: {} };
  },
  async render() {
    return { content: '<svg/>' };
  },
  async export() {
    return { files: nonemptyExportFiles([{ name: 'bom.csv', mimeType: 'text/csv', bytes: new Uint8Array([1]) }]) };
  },
});
const realRuntime = defineRuntime({ kernels: [realKernel()] });
const realClient = createRuntimeClient({
  transport: inProcessTransport({ runtime: realRuntime, fileSystem: fromMemoryFs() }),
});
const configuredRuntime = defineRuntime({
  configSchema: z.object({ endpoint: z.url() }),
  createRuntime: () => ({ kernels: [realKernel()] }),
});
const configuredTransport = inProcessTransport({ runtime: configuredRuntime, fileSystem: fromMemoryFs() });
createRuntimeClient<AnyRuntimeDefinition>({
  transport: configuredTransport,
  config: { endpoint: 'https://example.test' },
});
// @ts-expect-error A known configured runtime requires its config.
createRuntimeClient({ transport: configuredTransport });
createRuntimeClient({
  transport: inProcessTransport({ runtime: realRuntime, fileSystem: fromMemoryFs() }),
  // @ts-expect-error A known unconfigured runtime rejects supplied config.
  config: { endpoint: 'https://example.test' },
});
const emptyWireValue = null;
type WrongProtocol = {
  readonly hello: RuntimeDocumentProtocol['hello'];
  readonly calls: { readonly ping: { readonly args: typeof emptyWireValue; readonly result: typeof emptyWireValue } };
  readonly notifies: Record<never, never>;
  readonly listens: Record<never, never>;
};
declare const wrongProtocolTransport: TransportPlugin<WrongProtocol>;
// @ts-expect-error A non-document protocol transport cannot serve the document client.
createRuntimeClient({ transport: wrongProtocolTransport });
const realToolkit = definePlugin({
  meta: { name: '@taucad/document-proof' },
  kernels: { default: realKernel },
  presets: { default: ['kernels.default'] },
});
const toolkitRuntime = defineRuntime({ plugins: [realToolkit()] });
const toolkitClient = createRuntimeClient({
  transport: inProcessTransport({ runtime: toolkitRuntime, fileSystem: fromMemoryFs() }),
});
const realMiddleware = defineMiddleware({
  id: 'document-content',
  name: 'Document content',
  content: { views: { 'image/svg+xml': ['includeEdges'] }, exports: { csv: ['includeTopology'] } },
});
const realTranscoder = defineTranscoder({
  id: 'document-pdf',
  name: 'Document PDF',
  version: '1.0.0',
  edges: [
    {
      from: 'csv',
      to: 'pdf',
      fidelity: 'mesh',
      optionsSchema: z.object({ delimiter: z.number().default(9), layout: z.enum(['portrait', 'landscape']) }),
      content: ['includeTopology'],
    },
  ] as const,
  async initialize() {
    return {};
  },
  async transcode(input) {
    return { success: true, data: input.files, issues: [] };
  },
});
const routedRuntime = defineRuntime({
  kernels: [realKernel()],
  middleware: [realMiddleware()],
  transcoders: [realTranscoder()],
});
const routedClient = createRuntimeClient({
  transport: inProcessTransport({ runtime: routedRuntime, fileSystem: fromMemoryFs() }),
});

describe('typed runtime document', () => {
  it('narrows a direct export ID and its view options', async () => {
    expectTypeOf(document.export('bom', { options: { delimiter: ',' } })).toEqualTypeOf<Promise<ExportResult<'bom'>>>();
    document.view('board', { options: { scale: 2 } });
    document.view('solid');
    await document.export('mesh');
    await document.export('stl');
    await document.export('csv', { options: { delimiter: ',' } });
    await document.export('csv', { options: { quality: 2 } });
    expectTypeOf(document.export('csv', { options: { delimiter: ',' } })).toEqualTypeOf<
      Promise<ExportResult<'bom' | 'csv'>>
    >();
    // @ts-expect-error -- direct and extension targets retain the required schema.
    await document.export('bom');
    // @ts-expect-error -- the extension route has the same required options.
    await document.export('csv');
    // @ts-expect-error -- the declared view requires options.
    document.view('board');
    // @ts-expect-error -- the concrete view schema requires a numeric scale.
    document.view('board', { options: { scale: 'large' } });
    // @ts-expect-error -- a concrete kernel does not declare this view.
    document.view('schematic');
    routed.view('board', { options: { scale: 2 }, content: { includeEdges: true } });
    await routed.export('pdf', { options: { layout: 'portrait' }, content: { includeTopology: true } });
    await routedClient.transcode({ from: 'csv', to: 'pdf', files: [], options: { layout: 'portrait' } });
    // @ts-expect-error -- the real converter route requires its declared layout.
    await routedClient.transcode({ from: 'csv', to: 'pdf', files: [], options: {} });
    // @ts-expect-error -- the real converter does not declare this route.
    await routedClient.transcode({ from: 'stl', to: 'pdf', files: [], options: { layout: 'portrait' } });
    openPrecision({ source: { files: { '/main.ts': '' } }, evaluateOptions: { precision: 0.1 } });
    // @ts-expect-error -- a single concrete kernel requires its evaluate options.
    openPrecision({ source: { files: { '/main.ts': '' } } });
    // @ts-expect-error -- source entry must refer to a declared inline file.
    openPrecision({ source: { files: { '/main.ts': '' }, entry: '/missing.ts' }, evaluateOptions: { precision: 0.1 } });
    // @ts-expect-error -- route options remain required after the source delimiter is pinned.
    await routed.export('pdf');
    // @ts-expect-error -- the converter only retains topology content.
    await routed.export('pdf', { options: { layout: 'portrait' }, content: { includeEdges: true } });
  });

  it('preserves discriminated route option branches after source option ownership', async () => {
    await branchRouted.export('png', { options: { mode: 'single', camera: 'front' } });
    await branchRouted.export('png', { options: { mode: 'batch', views: ['front', 'top'] } });
    // @ts-expect-error Batch views do not belong to the single-camera branch.
    await branchRouted.export('png', { options: { mode: 'single', views: ['front'] } });
    // @ts-expect-error A batch requires its own nonempty views.
    await branchRouted.export('png', { options: { mode: 'batch', camera: 'front' } });
    // @ts-expect-error Pinned source options are supplied by the route, not callers.
    await branchRouted.export('png', { options: { mode: 'single', camera: 'front', delimiter: ',' } });
  });

  it('retains real factory, runtime, transport, and open inference', async () => {
    const opened = realClient.open({
      source: { files: { 'main.tsx': '', 'asset.bin': new Uint8Array([1]) }, entry: 'main.tsx' },
      evaluateOptions: { precision: 0.1 },
    });
    opened.view();
    opened.view('diagram', { options: { scale: 2 } });
    // @ts-expect-error -- secondary diagram view still requires its own options.
    opened.view('diagram');
    expectTypeOf(opened.export('bom', { options: { delimiter: ',' } })).toEqualTypeOf<Promise<ExportResult<'bom'>>>();
    await opened.update({ evaluateOptions: { precision: 0.2 } });
    await opened.update({ parameters: { count: 2 } });
    // @ts-expect-error -- real schema requires evaluate options when opening.
    realClient.open({ source: { files: { 'main.tsx': '' } } });
    realClient.open({
      // @ts-expect-error -- source entry stays tied to actual file keys.
      source: { files: { 'main.tsx': '', 'asset.bin': new Uint8Array([1]) }, entry: 'other.ts' },
      evaluateOptions: { precision: 1 },
    });
    // @ts-expect-error -- real view schema remains narrow through the chain.
    opened.view('diagram', { options: { scale: 'large' } });
    // @ts-expect-error -- real export schema remains narrow through the chain.
    await opened.export('bom', { options: { delimiter: 4 } });
    // @ts-expect-error -- update retains the real evaluation schema.
    await opened.update({ evaluateOptions: { precision: 'fine' } });
    const fromToolkit = toolkitClient.open({ source: { path: 'main.tsx' }, evaluateOptions: { precision: 1 } });
    fromToolkit.view('diagram', { options: { scale: 2 } });
    expectTypeOf(fromToolkit.export('bom', { options: { delimiter: ',' } })).toEqualTypeOf<
      Promise<ExportResult<'bom'>>
    >();
    // @ts-expect-error -- toolkit expansion preserves declared view options.
    fromToolkit.view('diagram', { options: { scale: 'large' } });
    // @ts-expect-error -- toolkit expansion preserves required evaluate options.
    toolkitClient.open({ source: { path: 'main.tsx' } });
    const composed = routedClient.open({ source: { path: 'main.tsx' }, evaluateOptions: { precision: 1 } });
    expectTypeOf<RuntimeMiddleware<typeof routedRuntime>['length']>().toEqualTypeOf<1>();
    expectTypeOf<RuntimeTranscoders<typeof routedRuntime>['length']>().toEqualTypeOf<1>();
    composed.view('diagram', { options: { scale: 1 }, content: { includeEdges: true } });
    await composed.export('pdf', {
      options: { delimiter: ';', layout: 'portrait' },
      content: { includeTopology: true },
    });
    // @ts-expect-error -- source owns the overlapping delimiter key, so edge number cannot replace it.
    await composed.export('pdf', { options: { delimiter: 2, layout: 'portrait' } });
  });
});
