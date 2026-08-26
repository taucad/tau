import { describe, expectTypeOf, it } from 'vitest';
import type {
  CollectExportFormats,
  ExportContentFor,
  ExportOptionsFor,
  KernelPlugin,
  KnownTranscoderIds,
  MiddlewarePlugin,
  RenderContentFor,
  RenderOptionsFor,
  TranscoderPlugin,
} from '#plugins/plugin-types.js';
import type { ExportRoute } from '#types/runtime.types.js';

type Kernel = KernelPlugin<
  { glb: { quality?: number; unit?: string } },
  { tolerance?: number },
  'kernel-a',
  'includeEdges',
  { glb: 'includeTopology' }
>;
type Middleware = MiddlewarePlugin<'middleware-a', 'includeTopology', { glb: 'includeEdges' }>;
type Transcoder = TranscoderPlugin<
  { stl: { binary?: boolean } },
  'glb',
  'converter',
  { stl: 'includeEdges' },
  { stl: 'quality' }
>;
type Kernels = readonly [Kernel];
type MiddlewarePlugins = readonly [Middleware];
type Transcoders = readonly [Transcoder];

type LiteralPhantomKey =
  | '__exportFormats'
  | '__renderOptions'
  | '__kernelId'
  | '__renderContent'
  | '__exportContent'
  | '__middlewareRenderContent'
  | '__middlewareExportContent'
  | '__transcodeEdges'
  | '__transcodeFrom'
  | '__transcoderId'
  | '__transcodeContent'
  | '__transcodePinnedSourceOptions';

describe('plugin phantom opacity', () => {
  it('keeps all twelve compile-time carriers out of consumer-nameable structure', () => {
    type ConsumerNameablePhantoms = Extract<LiteralPhantomKey, keyof Kernel | keyof Middleware | keyof Transcoder>;
    expectTypeOf<ConsumerNameablePhantoms>().toEqualTypeOf<never>();
  });

  it('preserves format, route, id, content, and option inference', () => {
    type Route = ExportRoute<Kernels, MiddlewarePlugins, Transcoders>;

    expectTypeOf<CollectExportFormats<Kernels>>().toEqualTypeOf<'glb'>();
    expectTypeOf<Route['targetFormat']>().toEqualTypeOf<'glb' | 'stl'>();
    expectTypeOf<Route['sourceFormat']>().toEqualTypeOf<'glb'>();
    expectTypeOf<Route['kernelId']>().toEqualTypeOf<'kernel-a'>();
    expectTypeOf<KnownTranscoderIds<Transcoders>>().toEqualTypeOf<'converter'>();
    expectTypeOf<RenderContentFor<Kernels, MiddlewarePlugins>>().toEqualTypeOf<'includeEdges' | 'includeTopology'>();
    expectTypeOf<ExportContentFor<Kernels, MiddlewarePlugins, Transcoders, 'glb'>>().toEqualTypeOf<
      'includeEdges' | 'includeTopology'
    >();
    expectTypeOf<ExportContentFor<Kernels, MiddlewarePlugins, Transcoders, 'stl'>>().toEqualTypeOf<'includeEdges'>();
    expectTypeOf<RenderOptionsFor<Kernels, 'kernel-a'>>().toEqualTypeOf<{ tolerance?: number }>();
    expectTypeOf<ExportOptionsFor<Kernels, Transcoders, 'stl'>>().toEqualTypeOf<
      { unit?: string } & { binary?: boolean }
    >();
  });
});
