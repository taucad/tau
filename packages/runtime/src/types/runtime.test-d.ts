/* eslint-disable @typescript-eslint/naming-convention -- Type tests intentionally model format names containing extensions. */
/* oxlint-disable no-empty-function, typescript/no-empty-object-type, typescript/no-restricted-types -- Type tests intentionally model exact empty option bags and plugin tuples. */
/**
 * Type tests for the resolved {@link CapabilitiesManifest},
 * {@link ExportRoute}, and {@link RenderCapability} bag projections.
 *
 * Statically analysed by the TypeScript compiler via vitest --typecheck.
 */

import { describe, expectTypeOf, it } from 'vitest';
import type { JSONSchema7 } from '@taucad/json-schema';
import type { ExportFidelity, FileExtension } from '@taucad/types';
import type * as RuntimeTypes from '#types/runtime.types.js';
import type { CapabilitiesManifest, ExportRoute, GetParametersResult, RenderCapability } from '#types/runtime.types.js';
import type { KernelPlugin, MiddlewarePlugin, TranscoderPlugin } from '#plugins/plugin-types.js';
import type { RuntimeContentInput } from '#types/runtime-content.types.js';

// =============================================================================
// Wide-default (on-wire) shape — preserved for the worker-emitted manifest
// =============================================================================

describe('ExportRoute target shape (wide default)', () => {
  it('should type schema as JSONSchema7', () => {
    expectTypeOf<ExportRoute['exportOptions']['schema']>().toEqualTypeOf<JSONSchema7>();
  });

  it('should expose targetFormat and sourceFormat as FileExtension', () => {
    expectTypeOf<ExportRoute['targetFormat']>().toEqualTypeOf<FileExtension>();
    expectTypeOf<ExportRoute['sourceFormat']>().toEqualTypeOf<FileExtension>();
  });

  it('should expose fidelity as ExportFidelity', () => {
    expectTypeOf<ExportRoute['fidelity']>().toEqualTypeOf<ExportFidelity>();
  });

  it('should not declare a routeId field on routes', () => {
    type RouteKeys = keyof ExportRoute;
    expectTypeOf<RouteKeys>().not.toEqualTypeOf<RouteKeys | 'routeId'>();
  });

  it('should expose optional route-scoped content schema and defaults', () => {
    type Content = NonNullable<ExportRoute['content']>;
    expectTypeOf<Content['schema']>().toEqualTypeOf<JSONSchema7>();
    expectTypeOf<Content['defaults']>().toEqualTypeOf<RuntimeContentInput>();
  });
});

describe('CapabilitiesManifest target shape (wide default)', () => {
  it('should require a routes field of ExportRoute', () => {
    expectTypeOf<CapabilitiesManifest['routes']>().toEqualTypeOf<readonly ExportRoute[]>();
  });

  it('should not declare parallel-array projection fields', () => {
    type Keys = keyof CapabilitiesManifest;
    expectTypeOf<Keys>().not.toEqualTypeOf<
      Keys | 'kernelExports' | 'transcodeEdges' | 'exportRoutes' | 'renderOptions'
    >();
  });
});

describe('RenderCapability shape (wide default)', () => {
  it('should expose schema as JSONSchema7', () => {
    expectTypeOf<RenderCapability['renderOptions']['schema']>().toEqualTypeOf<JSONSchema7>();
  });

  it('should expose defaults as record of unknown for the wide-default bag', () => {
    expectTypeOf<RenderCapability['renderOptions']['defaults']>().toEqualTypeOf<Record<string, unknown>>();
  });

  it('should expose optional route-scoped content schema and defaults', () => {
    type Content = NonNullable<RenderCapability['content']>;
    expectTypeOf<Content['schema']>().toEqualTypeOf<JSONSchema7>();
    expectTypeOf<Content['defaults']>().toEqualTypeOf<RuntimeContentInput>();
  });
});

describe('GetParametersResult target shape', () => {
  it('should expose jsonSchema as JSONSchema7 on success', () => {
    type Success = Extract<GetParametersResult, { success: true }>;

    expectTypeOf<Success['data']['jsonSchema']>().toEqualTypeOf<JSONSchema7>();
  });
});

// =============================================================================
// Bag-propagated narrowing
// =============================================================================

describe('ExportRoute bag propagation', () => {
  type ReplicadLike = KernelPlugin<{ stl: { binary?: boolean }; glb: {} }, { tessellation?: unknown }, 'replicad'>;
  type OpenscadLike = KernelPlugin<{ off: {} }, { tessellation?: unknown }, 'openscad'>;
  type ConverterLike = TranscoderPlugin<{ usdz: {}; '3mf': { unit?: string } }, 'glb', 'converter'>;
  type Kernels = readonly [ReplicadLike, OpenscadLike];
  type Transcoders = readonly [ConverterLike];

  it('should narrow targetFormat to the union of kernel + transcoder targets', () => {
    type Format = ExportRoute<Kernels, readonly [], Transcoders>['targetFormat'];
    expectTypeOf<Format>().toEqualTypeOf<'stl' | 'glb' | 'off' | 'usdz' | '3mf'>();
  });

  it('should narrow sourceFormat to the kernel-native export formats', () => {
    type Source = ExportRoute<Kernels, readonly [], Transcoders>['sourceFormat'];
    expectTypeOf<Source>().toEqualTypeOf<'stl' | 'glb' | 'off'>();
  });

  it('should narrow transcoderId to the registered transcoder ids (or undefined)', () => {
    type Id = ExportRoute<Kernels, readonly [], Transcoders>['transcoderId'];
    expectTypeOf<Id>().toEqualTypeOf<'converter' | undefined>();
  });

  it('should narrow kernelId via CollectKernelIds', () => {
    type Id = ExportRoute<Kernels, readonly [], Transcoders>['kernelId'];
    expectTypeOf<Id>().toEqualTypeOf<'replicad' | 'openscad'>();
  });
});

describe('CapabilitiesManifest bag propagation', () => {
  type ReplicadLike = KernelPlugin<{ stl: {}; glb: {} }, { tessellation?: unknown }, 'replicad'>;
  type OpenscadLike = KernelPlugin<{ off: {} }, { tessellation?: unknown }, 'openscad'>;
  type ConverterLike = TranscoderPlugin<{ usdz: {} }, 'glb', 'converter'>;
  type Kernels = readonly [ReplicadLike, OpenscadLike];
  type Transcoders = readonly [ConverterLike];

  it('should expose routes as a ReadonlyArray of bag-narrowed ExportRoute', () => {
    type Manifest = CapabilitiesManifest<Kernels, readonly [], Transcoders>;
    type Routes = Manifest['routes'];
    expectTypeOf<Routes>().toEqualTypeOf<ReadonlyArray<ExportRoute<Kernels, readonly [], Transcoders>>>();
  });

  it('should index renderCapabilities by the kernel-id union derived from the bag', () => {
    type Manifest = CapabilitiesManifest<Kernels, readonly [], Transcoders>;
    type Schemas = Manifest['renderCapabilities'];
    expectTypeOf<Schemas['replicad']>().toEqualTypeOf<RenderCapability<Kernels, readonly [], 'replicad'> | undefined>();
    expectTypeOf<Schemas['openscad']>().toEqualTypeOf<RenderCapability<Kernels, readonly [], 'openscad'> | undefined>();
  });
});

describe('RenderCapability bag propagation', () => {
  type ReplicadLike = KernelPlugin<
    {},
    { tessellation?: { linearTolerance?: number; angularTolerance?: number } },
    'replicad'
  >;
  type OpenscadLike = KernelPlugin<
    {},
    { tessellation?: { segments?: number; minimumAngle?: number; minimumSize?: number } },
    'openscad'
  >;
  type Kernels = readonly [ReplicadLike, OpenscadLike];

  it('should resolve defaults to the replicad render-options input type', () => {
    type Defaults = RenderCapability<Kernels, readonly [], 'replicad'>['renderOptions']['defaults'];
    expectTypeOf<Defaults>().toEqualTypeOf<{
      tessellation?: { linearTolerance?: number; angularTolerance?: number };
    }>();
  });

  it('should resolve defaults to the openscad render-options input type', () => {
    type Defaults = RenderCapability<Kernels, readonly [], 'openscad'>['renderOptions']['defaults'];
    expectTypeOf<Defaults>().toEqualTypeOf<{
      tessellation?: { segments?: number; minimumAngle?: number; minimumSize?: number };
    }>();
  });

  it('should narrow per-key access on a typed CapabilitiesManifest', () => {
    type Manifest = CapabilitiesManifest<Kernels>;
    type ReplicadDefaults = NonNullable<Manifest['renderCapabilities']['replicad']>['renderOptions']['defaults'];
    expectTypeOf<ReplicadDefaults>().toEqualTypeOf<{
      tessellation?: { linearTolerance?: number; angularTolerance?: number };
    }>();
  });
});

describe('content capability bag propagation', () => {
  type ContentKernel = KernelPlugin<
    { glb: {}; step: {} },
    {},
    'content-kernel',
    'includeTopology',
    { glb: 'includeEdges' }
  >;
  type EdgesMiddleware = MiddlewarePlugin<'edges', 'includeEdges', { glb: 'includeEdges' }>;
  type ImageTranscoder = TranscoderPlugin<{ webp: {} }, 'glb', 'image', { webp: 'includeEdges' }>;
  type Kernels = readonly [ContentKernel];
  type Middleware = readonly [EdgesMiddleware];
  type Transcoders = readonly [ImageTranscoder];

  it('should compose independent render properties from the kernel and middleware', () => {
    type Defaults = NonNullable<RenderCapability<Kernels, Middleware, 'content-kernel'>['content']>['defaults'];
    expectTypeOf<Defaults>().toEqualTypeOf<{
      readonly includeEdges?: boolean;
      readonly includeTopology?: boolean;
    }>();
  });

  it('should intersect source and transcoder declarations for the exact target route', () => {
    type Defaults = NonNullable<
      ExportRoute<Kernels, Middleware, Transcoders, 'webp', 'content-kernel'>['content']
    >['defaults'];
    expectTypeOf<Defaults>().toEqualTypeOf<{ readonly includeEdges?: boolean }>();
  });

  it('should keep content-empty formats content-empty at the type level', () => {
    type Defaults = NonNullable<
      ExportRoute<Kernels, Middleware, Transcoders, 'step', 'content-kernel'>['content']
    >['defaults'];
    expectTypeOf<Defaults>().toEqualTypeOf<{}>();
  });
});

// =============================================================================
// Removed capability types
// =============================================================================

describe('removed capability types', () => {
  it('should not export ExportFormatCapability from runtime.types.js', () => {
    // @ts-expect-error -- ExportFormatCapability has been removed
    type _Removed = RuntimeTypes.ExportFormatCapability;
  });

  it('should not export TranscodeEdgeCapability from runtime.types.js', () => {
    // @ts-expect-error -- TranscodeEdgeCapability has been removed
    type _Removed = RuntimeTypes.TranscodeEdgeCapability;
  });

  it('should not export RenderOptionCapability from runtime.types.js', () => {
    // @ts-expect-error -- RenderOptionCapability has been removed
    type _Removed = RuntimeTypes.RenderOptionCapability;
  });
});
