/* eslint-disable @typescript-eslint/naming-convention -- file names include extensions */
/* oxlint-disable no-empty-function -- type-level test bodies are intentionally empty */
/**
 * Type tests for the resolved {@link CapabilitiesManifest},
 * {@link ExportRoute}, and {@link KernelRenderSchema} bag projections.
 *
 * Statically analysed by the TypeScript compiler via vitest --typecheck.
 */

import { describe, expectTypeOf, it } from 'vitest';
import type { JSONSchema7 } from '@taucad/json-schema';
import type { ExportFidelity, FileExtension } from '@taucad/types';
import type * as RuntimeTypes from '#types/runtime.types.js';
import type {
  CapabilitiesManifest,
  ExportRoute,
  GetParametersResult,
  KernelRenderSchema,
} from '#types/runtime.types.js';
import type { KernelPlugin, TranscoderPlugin } from '#plugins/plugin-types.js';

// =============================================================================
// Wide-default (on-wire) shape — preserved for the worker-emitted manifest
// =============================================================================

describe('ExportRoute target shape (wide default)', () => {
  it('should type schema as JSONSchema7', () => {
    expectTypeOf<ExportRoute['schema']>().toEqualTypeOf<JSONSchema7>();
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

describe('KernelRenderSchema shape (wide default)', () => {
  it('should expose schema as JSONSchema7', () => {
    expectTypeOf<KernelRenderSchema['schema']>().toEqualTypeOf<JSONSchema7>();
  });

  it('should expose defaults as record of unknown for the wide-default bag', () => {
    expectTypeOf<KernelRenderSchema['defaults']>().toEqualTypeOf<Record<string, unknown>>();
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
  /* oxlint-disable @typescript-eslint/no-empty-object-type -- matches plugin defaults */
  type ReplicadLike = KernelPlugin<{ stl: { binary?: boolean }; glb: {} }, { tessellation?: unknown }, 'replicad'>;
  type OpenscadLike = KernelPlugin<{ off: {} }, { tessellation?: unknown }, 'openscad'>;
  type ConverterLike = TranscoderPlugin<{ usdz: {}; '3mf': { unit?: string } }, 'glb', 'converter'>;
  /* oxlint-enable @typescript-eslint/no-empty-object-type */
  type Kernels = readonly [ReplicadLike, OpenscadLike];
  type Transcoders = readonly [ConverterLike];

  it('should narrow targetFormat to the union of kernel + transcoder targets', () => {
    type Format = ExportRoute<Kernels, Transcoders>['targetFormat'];
    expectTypeOf<Format>().toEqualTypeOf<'stl' | 'glb' | 'off' | 'usdz' | '3mf'>();
  });

  it('should narrow sourceFormat to the kernel-native export formats', () => {
    type Source = ExportRoute<Kernels, Transcoders>['sourceFormat'];
    expectTypeOf<Source>().toEqualTypeOf<'stl' | 'glb' | 'off'>();
  });

  it('should narrow transcoderId to the registered transcoder ids (or undefined)', () => {
    type Id = ExportRoute<Kernels, Transcoders>['transcoderId'];
    expectTypeOf<Id>().toEqualTypeOf<'converter' | undefined>();
  });

  it('should narrow kernelId via CollectKernelIds', () => {
    type Id = ExportRoute<Kernels, Transcoders>['kernelId'];
    expectTypeOf<Id>().toEqualTypeOf<'replicad' | 'openscad'>();
  });
});

describe('CapabilitiesManifest bag propagation', () => {
  /* oxlint-disable @typescript-eslint/no-empty-object-type -- matches plugin defaults */
  type ReplicadLike = KernelPlugin<{ stl: {}; glb: {} }, { tessellation?: unknown }, 'replicad'>;
  type OpenscadLike = KernelPlugin<{ off: {} }, { tessellation?: unknown }, 'openscad'>;
  type ConverterLike = TranscoderPlugin<{ usdz: {} }, 'glb', 'converter'>;
  /* oxlint-enable @typescript-eslint/no-empty-object-type */
  type Kernels = readonly [ReplicadLike, OpenscadLike];
  type Transcoders = readonly [ConverterLike];

  it('should expose routes as a ReadonlyArray of bag-narrowed ExportRoute', () => {
    type Manifest = CapabilitiesManifest<Kernels, Transcoders>;
    type Routes = Manifest['routes'];
    expectTypeOf<Routes>().toEqualTypeOf<ReadonlyArray<ExportRoute<Kernels, Transcoders>>>();
  });

  it('should index renderSchemas by the kernel-id union derived from the bag', () => {
    type Manifest = CapabilitiesManifest<Kernels, Transcoders>;
    type Schemas = Manifest['renderSchemas'];
    expectTypeOf<Schemas['replicad']>().toEqualTypeOf<KernelRenderSchema<Kernels, 'replicad'> | undefined>();
    expectTypeOf<Schemas['openscad']>().toEqualTypeOf<KernelRenderSchema<Kernels, 'openscad'> | undefined>();
  });
});

describe('KernelRenderSchema bag propagation', () => {
  /* oxlint-disable @typescript-eslint/no-empty-object-type -- matches plugin defaults */
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
  /* oxlint-enable @typescript-eslint/no-empty-object-type */
  type Kernels = readonly [ReplicadLike, OpenscadLike];

  it('should resolve defaults to the replicad render-options input type', () => {
    type Defaults = KernelRenderSchema<Kernels, 'replicad'>['defaults'];
    expectTypeOf<Defaults>().toEqualTypeOf<{
      tessellation?: { linearTolerance?: number; angularTolerance?: number };
    }>();
  });

  it('should resolve defaults to the openscad render-options input type', () => {
    type Defaults = KernelRenderSchema<Kernels, 'openscad'>['defaults'];
    expectTypeOf<Defaults>().toEqualTypeOf<{
      tessellation?: { segments?: number; minimumAngle?: number; minimumSize?: number };
    }>();
  });

  it('should narrow per-key access on a typed CapabilitiesManifest', () => {
    type Manifest = CapabilitiesManifest<Kernels>;
    type ReplicadDefaults = NonNullable<Manifest['renderSchemas']['replicad']>['defaults'];
    expectTypeOf<ReplicadDefaults>().toEqualTypeOf<{
      tessellation?: { linearTolerance?: number; angularTolerance?: number };
    }>();
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
