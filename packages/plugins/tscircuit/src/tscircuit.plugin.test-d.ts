import { expectTypeOf } from 'vitest';
import { esbuildBundler } from '@taucad/esbuild';
import { createRuntimeClient, defineRuntime, fromMemoryFs } from '@taucad/runtime';
import type { ExportResult } from '@taucad/runtime';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import type { ExpandPluginKernels } from '@taucad/runtime/plugin';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

import { plugin, tscircuit, tscircuitKernel } from '#index.js';

const selected = plugin();

expectTypeOf<ExpandPluginKernels<readonly [typeof selected]>>().toEqualTypeOf<
  readonly [ReturnType<typeof tscircuitKernel>]
>();

expectTypeOf(tscircuit).toEqualTypeOf(plugin);

const resolve = async () => resolveRuntimePluginDefinition('kernel', tscircuitKernel());
type Definition = Awaited<ReturnType<typeof resolve>>;
type RenderRequest = Parameters<NonNullable<Definition['render']>>[0];
type WriteRequest = Parameters<NonNullable<Definition['write']>>[0];
expectTypeOf<Extract<RenderRequest, { view: 'board' }>['options']>().toEqualTypeOf<Readonly<Record<never, never>>>();
expectTypeOf<Extract<RenderRequest, { view: 'schematic' }>['instance']>().toEqualTypeOf<string | undefined>();
expectTypeOf<Extract<RenderRequest, { view: 'pcb' }>['options']>().toEqualTypeOf<{ pinNumbers?: boolean }>();
expectTypeOf<Extract<WriteRequest, { exportId: 'board' }>['options']>().toExtend<{
  coordinateSystem: 'y-up' | 'z-up';
}>();
expectTypeOf<(typeof selected.capabilities.kernels)[0]['exports']['board']['extension']>().toEqualTypeOf<'glb'>();

const runtime = defineRuntime({ plugins: [tscircuit()], bundlers: [esbuildBundler()] });
const client = createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs() }) });

const checkDocumentRequestTypes = (): void => {
  const document = client.open({ source: { path: 'main.tsx' } });
  document.view('board');
  document.view('schematic', { instance: 'sheet:Power' });
  document.view('pcb', { options: { pinNumbers: true } });
  expectTypeOf(document.view('pcb', { options: { pinNumbers: true } }).view).toEqualTypeOf<'pcb' | undefined>();
  expectTypeOf(document.export('board')).toEqualTypeOf<Promise<ExportResult<'board'>>>();
  expectTypeOf(document.export('bom')).toEqualTypeOf<Promise<ExportResult<'bom'>>>();
  expectTypeOf(document.export('netlist')).toEqualTypeOf<Promise<ExportResult<'netlist'>>>();
  expectTypeOf(document.export('circuit')).toEqualTypeOf<Promise<ExportResult<'circuit'>>>();
  // @ts-expect-error -- board does not declare PCB presentation options.
  document.view('board', { options: { pinNumbers: true } });
  // @ts-expect-error -- instances belong only to the schematic view.
  document.view('pcb', { instance: 'sheet:Power' });
  // @ts-expect-error -- the PCB option is boolean.
  document.view('pcb', { options: { pinNumbers: 'yes' } });
  // @ts-expect-error -- the toolkit does not declare a STEP export.
  expectTypeOf(document.export('step'));
};
expectTypeOf(checkDocumentRequestTypes).toBeFunction();
