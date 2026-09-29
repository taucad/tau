import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { defineKernel, defineMiddleware, definePlugin, defineTranscoder } from '@taucad/runtime';
import { defineRuntime } from '@taucad/runtime/worker';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import type { ExportResult } from '@taucad/runtime';
import { replicad } from '@taucad/replicad';
import { esbuild } from '@taucad/esbuild';
import { useRuntime } from '#hooks/use-runtime.js';
import type { UseRuntimeOptions } from '#hooks/use-runtime.js';

const runtime = defineRuntime({ plugins: [replicad(), esbuild()] });
const transport = inProcessTransport({ runtime, fileSystem: fromMemoryFs() });
const clientOptions = { transport };

const boardKernel = defineKernel({
  id: 'react-board',
  name: 'React board',
  version: '1.0.0',
  extensions: ['tsx'],
  evaluateOptionsSchema: z.object({ precision: z.string().transform(Number) }),
  views: {
    schematic: { title: 'Schematic', mimeType: 'image/svg+xml' },
    pcb: { title: 'PCB', mimeType: 'image/svg+xml', optionsSchema: z.object({ pinNumbers: z.boolean() }) },
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
    return { files: [{ name: 'bom.csv', mimeType: 'text/csv', bytes: new Uint8Array([1]) }] as const };
  },
});
const boardToolkit = definePlugin({
  meta: { name: '@taucad/react-board-proof' },
  kernels: { default: boardKernel },
  presets: { default: ['kernels.default'] },
});
const boardRuntime = defineRuntime({ plugins: [boardToolkit()] });
const boardTransport = inProcessTransport({ runtime: boardRuntime, fileSystem: fromMemoryFs() });
const boardClientOptions = { transport: boardTransport };
const boardMiddleware = defineMiddleware({
  id: 'react-board-content',
  name: 'React board content',
  content: {
    views: { 'image/svg+xml': ['includeEdges'] },
    exports: { csv: ['includeTopology'] },
  },
});
const boardPdf = defineTranscoder({
  id: 'react-board-pdf',
  name: 'React board PDF',
  version: '1.0.0',
  edges: [
    {
      from: 'csv',
      to: 'pdf',
      fidelity: 'mesh',
      optionsSchema: z.object({ layout: z.enum(['portrait', 'landscape']) }),
      sourceOptions: { delimiter: ',' },
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
const routedBoardRuntime = defineRuntime({
  plugins: [boardToolkit()],
  middleware: [boardMiddleware()],
  transcoders: [boardPdf()],
});
const routedBoardOptions = {
  transport: inProcessTransport({ runtime: routedBoardRuntime, fileSystem: fromMemoryFs() }),
};

describe('useRuntime public inference', () => {
  it('preserves literal files, view IDs and committed export IDs', () => {
    const result = useRuntime({
      clientOptions,
      source: { files: { 'main.ts': 'export default () => null', 'util.ts': '' }, entry: 'main.ts' },
      view: { id: 'drawing', instance: 'front' },
    });
    expectTypeOf(result.artifactStatus).toEqualTypeOf<'empty' | 'current' | 'stale'>();
    expectTypeOf(result.artifactHash).toEqualTypeOf<string | undefined>();
    expectTypeOf(result.exportModel('glb')).toEqualTypeOf<Promise<ExportResult<'glb'>>>();
    useRuntime({
      clientOptions,
      source: { path: 'main.ts' },
      view: { id: 'model', content: { includeEdges: true } },
    });
    // @ts-expect-error -- this runtime does not offer a PCB view.
    useRuntime({ clientOptions, source: { path: 'main.ts' }, view: { id: 'pcb' } });
    // @ts-expect-error -- inline entry remains a literal file key.
    useRuntime({ clientOptions, source: { files: { 'main.ts': '', 'util.ts': '' }, entry: 'other.ts' } });
    // @ts-expect-error -- multiple literal files require entry.
    useRuntime({ clientOptions, source: { files: { 'main.ts': '', 'util.ts': '' } } });
    // @ts-expect-error -- runtime export IDs remain narrow.
    void result.exportModel('bom');
    // @ts-expect-error -- the drawing view has no declared options.
    useRuntime({ clientOptions, source: { path: 'main.ts' }, view: { id: 'drawing', options: { scale: 2 } } });
    // @ts-expect-error -- the model view rejects unknown framework content.
    useRuntime({ clientOptions, source: { path: 'main.ts' }, view: { id: 'model', content: { unknown: true } } });
  });

  it('retains typed wrapper options and hook-owned parameter state', () => {
    const options: UseRuntimeOptions<typeof runtime, typeof transport, { 'main.ts': string }> = {
      clientOptions: async () => clientOptions,
      source: { files: { 'main.ts': '' } },
      initialParameters: { size: 2 },
    };
    const result = useRuntime(options);
    result.setParameters((current) => ({ ...current, size: 3 }));
    result.resetParameters();
    // @ts-expect-error -- callers cannot control effective parameters.
    options.parameters = { size: 4 };
    // @ts-expect-error -- instance applies only to declared instance views.
    useRuntime({ clientOptions, source: { path: 'main.ts' }, view: { id: 'model', instance: 'front' } });
  });

  it('keeps required evaluation, view, and export inputs through a real toolkit transport', () => {
    const result = useRuntime({
      clientOptions: boardClientOptions,
      source: { files: { 'main.tsx': '', 'part.tsx': '' }, entry: 'main.tsx' },
      evaluateOptions: { precision: '0.1' },
      view: { id: 'pcb', options: { pinNumbers: true } },
    });
    expectTypeOf(result.exportModel('bom', { options: { delimiter: ',' } })).toEqualTypeOf<
      Promise<ExportResult<'bom'>>
    >();
    // @ts-expect-error -- the kernel requires evaluation precision.
    useRuntime({ clientOptions: boardClientOptions, source: { path: 'main.tsx' } });
    // @ts-expect-error -- evaluate input uses the schema input type.
    useRuntime({ clientOptions: boardClientOptions, source: { path: 'main.tsx' }, evaluateOptions: { precision: 1 } });
    useRuntime({
      clientOptions: boardClientOptions,
      source: { path: 'main.tsx' },
      evaluateOptions: { precision: '1' },
      // @ts-expect-error -- the PCB view requires its own options.
      view: { id: 'pcb' },
    });
    useRuntime({
      clientOptions: boardClientOptions,
      source: { path: 'main.tsx' },
      evaluateOptions: { precision: '1' },
      view: {
        id: 'pcb',
        options: {
          // @ts-expect-error -- view-specific option type survives the hook.
          pinNumbers: 'yes',
        },
      },
    });
    // @ts-expect-error -- direct export requires BOM delimiter.
    void result.exportModel('bom');
    // @ts-expect-error -- export option schema stays narrow.
    void result.exportModel('bom', { options: { delimiter: 1 } });
    useRuntime({
      clientOptions: boardClientOptions,
      source: {
        files: { 'main.tsx': '', 'part.tsx': '' },
        // @ts-expect-error -- inline entry must be one of the real file keys.
        entry: 'missing.tsx',
      },
      evaluateOptions: { precision: '1' },
    });
  });

  it('carries middleware content and pinned source options into routed hook exports', () => {
    const result = useRuntime({
      clientOptions: routedBoardOptions,
      source: { path: 'main.tsx' },
      evaluateOptions: { precision: '0.1' },
      view: { id: 'pcb', options: { pinNumbers: true }, content: { includeEdges: true } },
    });
    expectTypeOf(
      result.exportModel('pdf', {
        options: { layout: 'portrait' },
        content: { includeTopology: true },
      }),
    ).toEqualTypeOf<Promise<ExportResult<'bom'>>>();
    // @ts-expect-error -- pinned BOM delimiter cannot be overridden on the route.
    void result.exportModel('pdf', { options: { layout: 'portrait', delimiter: ';' } });
    // @ts-expect-error -- the route still requires its own layout option.
    void result.exportModel('pdf');
    // @ts-expect-error -- PDF route preserves topology, not edge content.
    void result.exportModel('pdf', { options: { layout: 'portrait' }, content: { includeEdges: true } });
  });
});
