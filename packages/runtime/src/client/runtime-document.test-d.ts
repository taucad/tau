import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { KernelPlugin, MiddlewarePlugin, TranscoderEdgeType, TranscoderPlugin } from '#plugins/plugin-types.js';
import type { RuntimePluginDefinitionCarrier } from '#plugins/plugin-runtime-definition.js';
import type { RuntimeDocument, ExportResult, OpenInput } from '#client/runtime-document.types.js';
import { createRuntimeClient } from '#client/runtime-client.js';
import type { TransportPlugin } from '#transport/runtime-transport.types.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { defineKernelV2, nonemptyExportFiles } from '#types/runtime-kernel-v2.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import type { RuntimeMiddleware, RuntimeTranscoders } from '#worker/runtime-definition.js';
import { definePlugin } from '#plugins/plugin.js';
import { defineMiddleware } from '#plugins/middleware-entry.js';
import { defineTranscoder } from '#types/runtime-transcoder.types.js';

type BoardKernel = KernelPlugin<
  {},
  Record<string, unknown>,
  'board-kernel',
  never,
  {},
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
  {},
  Record<string, unknown>,
  'solid-kernel',
  never,
  {},
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
declare const routed: RuntimeDocument<
  readonly [BoardKernel, SolidKernel],
  readonly [DiagramMiddleware],
  readonly [PdfTranscoder]
>;
type PrecisionKernel = KernelPlugin<
  {},
  Record<string, unknown>,
  'precision',
  never,
  {},
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
  async write() {
    return { files: nonemptyExportFiles([{ name: 'bom.csv', mimeType: 'text/csv', bytes: new Uint8Array([1]) }]) };
  },
});
const realRuntime = defineRuntime({ kernels: [realKernel()] });
const realClient = createRuntimeClient({
  transport: inProcessTransport({ runtime: realRuntime, fileSystem: fromMemoryFs() }),
});
declare const wrongProtocolTransport: TransportPlugin<RuntimeProtocol>;
// @ts-expect-error A v3 transport cannot serve the document-only v4 client.
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
  it('narrows a direct export ID and its view options', () => {
    expectTypeOf(document.export('bom', { options: { delimiter: ',' } })).toEqualTypeOf<Promise<ExportResult<'bom'>>>();
    document.view('board', { options: { scale: 2 } });
    document.view('solid');
    document.export('mesh');
    document.export('stl');
    document.export('csv', { options: { delimiter: ',' } });
    document.export('csv', { options: { quality: 2 } });
    expectTypeOf(document.export('csv', { options: { delimiter: ',' } })).toEqualTypeOf<
      Promise<ExportResult<'bom' | 'csv'>>
    >();
    // @ts-expect-error -- direct and extension targets retain the required schema.
    document.export('bom');
    // @ts-expect-error -- the extension route has the same required options.
    document.export('csv');
    // @ts-expect-error -- the declared view requires options.
    document.view('board');
    // @ts-expect-error -- the concrete view schema requires a numeric scale.
    document.view('board', { options: { scale: 'large' } });
    // @ts-expect-error -- a concrete kernel does not declare this view.
    document.view('schematic');
    routed.view('board', { options: { scale: 2 }, content: { includeEdges: true } });
    routed.export('pdf', { options: { layout: 'portrait' }, content: { includeTopology: true } });
    routedClient.transcode({ from: 'csv', to: 'pdf', files: [], options: { layout: 'portrait' } });
    // @ts-expect-error -- the real converter route requires its declared layout.
    routedClient.transcode({ from: 'csv', to: 'pdf', files: [], options: {} });
    // @ts-expect-error -- the real converter does not declare this route.
    routedClient.transcode({ from: 'stl', to: 'pdf', files: [], options: { layout: 'portrait' } });
    openPrecision({ source: { files: { '/main.ts': '' } }, evaluateOptions: { precision: 0.1 } });
    // @ts-expect-error -- a single concrete kernel requires its evaluate options.
    openPrecision({ source: { files: { '/main.ts': '' } } });
    // @ts-expect-error -- source entry must refer to a declared inline file.
    openPrecision({ source: { files: { '/main.ts': '' }, entry: '/missing.ts' }, evaluateOptions: { precision: 0.1 } });
    // @ts-expect-error -- route options remain required after the source delimiter is pinned.
    routed.export('pdf');
    // @ts-expect-error -- the converter only retains topology content.
    routed.export('pdf', { options: { layout: 'portrait' }, content: { includeEdges: true } });
  });

  it('retains real factory, runtime, transport, and open inference', () => {
    const opened = realClient.open({
      source: { files: { 'main.tsx': '', 'asset.bin': new Uint8Array([1]) }, entry: 'main.tsx' },
      evaluateOptions: { precision: 0.1 },
    });
    opened.view();
    opened.view('diagram', { options: { scale: 2 } });
    // @ts-expect-error -- secondary diagram view still requires its own options.
    opened.view('diagram');
    expectTypeOf(opened.export('bom', { options: { delimiter: ',' } })).toEqualTypeOf<Promise<ExportResult<'bom'>>>();
    opened.update({ evaluateOptions: { precision: 0.2 } });
    opened.update({ parameters: { count: 2 } });
    // @ts-expect-error -- real schema requires evaluate options when opening.
    realClient.open({ source: { files: { 'main.tsx': '' } } });
    // @ts-expect-error -- source entry stays tied to actual file keys.
    realClient.open({
      source: { files: { 'main.tsx': '', 'asset.bin': new Uint8Array([1]) }, entry: 'other.ts' },
      evaluateOptions: { precision: 1 },
    });
    // @ts-expect-error -- real view schema remains narrow through the chain.
    opened.view('diagram', { options: { scale: 'large' } });
    // @ts-expect-error -- real export schema remains narrow through the chain.
    opened.export('bom', { options: { delimiter: 4 } });
    // @ts-expect-error -- update retains the real evaluation schema.
    opened.update({ evaluateOptions: { precision: 'fine' } });
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
    composed.export('pdf', { options: { delimiter: ';', layout: 'portrait' }, content: { includeTopology: true } });
    // @ts-expect-error -- source owns the overlapping delimiter key, so edge number cannot replace it.
    composed.export('pdf', { options: { delimiter: 2, layout: 'portrait' } });
  });
});
