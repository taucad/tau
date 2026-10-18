import type { GeoSpecUnit } from '#geometry-unit.js';
import type { GeometryDiagnostic, GeometryExportIntent } from '#mesh/types.js';
import type { GeoSpecModelFormat, GeoSpecRuntimeClient } from '#model/types.js';
import type { ExportRoute } from '@taucad/runtime/types';

/**
 *
 *
 * @public
 */
export type RuntimeBackedModelFormat = Exclude<GeoSpecModelFormat, 'mesh-buffer'>;

/** Runtime route metadata used to decide whether a runtime export can honor GeoSpec evidence requirements.
 *
 * @public
 */
export type GeoSpecExportRoute = Partial<ExportRoute> & {
  kernelId?: string;
  sourceFormat?: string;
  targetFormat?: string;
  transcoderId?: string;
  fidelity?: string;
  exportOptions?: {
    schema?: {
      properties?: Record<string, unknown>;
    };
    defaults?: Record<string, unknown>;
  };
};

/** Runtime client shape for route-aware Tau runtimes.
 *
 * @public
 */
export type RuntimeClientWithRoutes = GeoSpecRuntimeClient & {
  bestRouteFor(format: string, options?: { readonly kernelId?: string }): GeoSpecExportRoute | undefined;
};

/** Resolved runtime export request and provenance for a GeoSpec model load.
 *
 * @public
 */
export type RuntimeExportIntent = {
  options: Record<string, unknown>;
  provenance: GeometryExportIntent;
  sourceUnit: GeoSpecUnit;
};

/** Structured failure returned when a runtime cannot provide the requested GeoSpec evidence.
 *
 * @public
 */
export type RuntimeExportIntentFailure = {
  success: false;
  diagnostics: GeometryDiagnostic[];
};

const stepFormats = new Set<GeoSpecModelFormat>(['step', 'stp']);

/**
 * The matchers mesh evidence answers, as the GeoSpec authoring skill lists
 * them (`packages/geospec/agent/geospec-authoring/SKILL.md`): bounds, volume,
 * surface area, connected components and watertightness. Every other
 * exact-feature matcher needs STEP BRep evidence.
 *
 * @public
 */
export const geoSpecMeshEvidenceMatchers = [
  'toHaveBoundingBox',
  'toHaveVolume',
  'toHaveSurfaceArea',
  'toHaveConnectedComponents',
  'toBeWatertight',
] as const;

type TessellationIntent = {
  linearTolerance?: number;
  angularToleranceDegrees?: number;
};

const requestedMeshIntent = (
  format: RuntimeBackedModelFormat,
  tessellation: TessellationIntent | undefined,
): GeometryExportIntent['requested'] => ({
  format: format,
  coordinateSystem: 'z-up',
  unit: { length: 'millimeter' },
  ...(tessellation === undefined ? {} : { tessellation }),
});

const exportTessellation = (tessellation: TessellationIntent | undefined): Record<string, unknown> =>
  tessellation === undefined
    ? {}
    : {
        tessellation: {
          ...(tessellation.linearTolerance === undefined ? {} : { linearTolerance: tessellation.linearTolerance }),
          ...(tessellation.angularToleranceDegrees === undefined
            ? {}
            : { angularTolerance: tessellation.angularToleranceDegrees }),
        },
      };

const canonicalMeshIntent = (options: {
  format: RuntimeBackedModelFormat;
  exportOptions: Record<string, unknown>;
  tessellation?: TessellationIntent;
}): RuntimeExportIntent => {
  const requested = requestedMeshIntent(options.format, options.tessellation);
  return {
    options: options.exportOptions,
    sourceUnit: 'mm',
    provenance: {
      requested,
      honored: {
        format: requested.format,
        coordinateSystem: 'z-up',
        unit: { length: 'millimeter' },
        sourceUnit: 'mm',
        ...(options.tessellation === undefined ? {} : { tessellation: options.tessellation }),
      },
    },
  };
};

const routeToProvenance = (route: GeoSpecExportRoute | undefined): GeometryExportIntent['route'] | undefined =>
  route
    ? {
        ...(route.kernelId === undefined ? {} : { kernelId: route.kernelId }),
        ...(route.sourceFormat === undefined ? {} : { sourceFormat: route.sourceFormat }),
        ...(route.targetFormat === undefined ? {} : { targetFormat: route.targetFormat }),
        ...(route.transcoderId === undefined ? {} : { transcoderId: route.transcoderId }),
        ...(route.fidelity === undefined ? {} : { fidelity: route.fidelity }),
        direct: isDirectRoute(route),
      }
    : undefined;

const meshAlternative = `loadModel({ file, format: 'glb' }) with mesh-supported matchers (${geoSpecMeshEvidenceMatchers.join(', ')})`;

/**
 * The kernel cannot produce exact BRep evidence: no direct BRep STEP route.
 * Names the mesh alternative and never asks for STEP the kernel cannot give.
 *
 * @param options - The evaluating kernel, when known, and its best STEP route.
 * @returns The refusal with its mesh alternative.
 */
const kernelBrepUnsupported = (options: {
  kernelId: string | undefined;
  route: GeoSpecExportRoute | undefined;
}): RuntimeExportIntentFailure => {
  const subject = options.kernelId === undefined ? 'No kernel in this runtime' : `Kernel '${options.kernelId}'`;
  return {
    success: false,
    diagnostics: [
      {
        code: 'GEOSPEC_KERNEL_BREP_UNSUPPORTED',
        severity: 'error',
        message: `${subject} has no direct STEP/BRep export route, so exact BRep evidence is unavailable and BRep matchers are unsupported on ${options.kernelId === undefined ? 'it' : 'this kernel'}.`,
        suggestion: `Keep the requirement and report it as unsupported on this kernel. Load mesh evidence with ${meshAlternative} for the requirements a mesh can answer.`,
        details: {
          format: 'step',
          ...(options.kernelId === undefined ? {} : { kernelId: options.kernelId }),
          ...(options.route === undefined ? {} : { route: routeToProvenance(options.route) }),
          meshAlternative: { format: 'glb', matchers: [...geoSpecMeshEvidenceMatchers] },
        },
      },
    ],
  };
};

const hasRuntimeRoutes = (runtime: GeoSpecRuntimeClient): runtime is RuntimeClientWithRoutes =>
  typeof (runtime as { bestRouteFor?: unknown }).bestRouteFor === 'function';

const hasAnyRouteMetadata = (runtime: GeoSpecRuntimeClient, format: RuntimeBackedModelFormat): boolean => {
  const { capabilities } = runtime as { capabilities?: { routes?: readonly unknown[] } };
  if ((capabilities?.routes?.length ?? 0) > 0) {
    return true;
  }

  const { routesFor } = runtime as { routesFor?: unknown };
  return typeof routesFor === 'function' && (routesFor as (format: string) => readonly unknown[])(format).length > 0;
};

const hasSchemaProperty = (route: GeoSpecExportRoute | undefined, property: string): boolean => {
  const properties = route?.exportOptions?.schema.properties;
  return property in (properties ?? {});
};

const isDirectRoute = (route: GeoSpecExportRoute): boolean => route.transcoderId === undefined;

const canonicalUnsupported = (options: {
  format: RuntimeBackedModelFormat;
  route?: GeoSpecExportRoute;
  missing: string[];
}): RuntimeExportIntentFailure => ({
  success: false,
  diagnostics: [
    {
      code: 'GEOSPEC_CANONICAL_EXPORT_UNSUPPORTED',
      severity: 'error',
      message: `GeoSpec cannot request canonical Z-up millimeter ${options.format.toUpperCase()} evidence from this runtime route.`,
      suggestion:
        'Use a runtime route whose export schema exposes coordinateSystem and unit.length, or pass a custom runtime that returns canonical millimeter geometry bytes.',
      details: {
        format: options.format,
        missing: options.missing,
        route: routeToProvenance(options.route),
      },
    },
  ],
});

/** @public */
export const resolveRuntimeExportIntent = (options: {
  runtime: GeoSpecRuntimeClient;
  format: RuntimeBackedModelFormat;
  meshLinearTolerance?: number;
  meshAngularToleranceDegrees?: number;
  /**
   * The kernel that evaluates this source, when the host knows it. Routes are
   * then chosen among that kernel's own, so a mesh-only kernel is told its
   * BRep matchers are unsupported instead of being sent to another kernel's
   * STEP route.
   */
  kernelId?: string;
}): RuntimeExportIntent | RuntimeExportIntentFailure => {
  const { runtime, format } = options;
  const tessellation: TessellationIntent | undefined =
    options.meshLinearTolerance === undefined && options.meshAngularToleranceDegrees === undefined
      ? undefined
      : {
          ...(options.meshLinearTolerance === undefined ? {} : { linearTolerance: options.meshLinearTolerance }),
          ...(options.meshAngularToleranceDegrees === undefined
            ? {}
            : { angularToleranceDegrees: options.meshAngularToleranceDegrees }),
        };
  const routeAware = hasRuntimeRoutes(runtime);
  const { kernelId } = options;
  const route = routeAware
    ? kernelId === undefined
      ? runtime.bestRouteFor(format)
      : runtime.bestRouteFor(format, { kernelId })
    : undefined;

  if (stepFormats.has(format)) {
    const exact = route !== undefined && isDirectRoute(route) && route.fidelity === 'brep';
    if (routeAware && !exact && kernelId !== undefined && hasAnyRouteMetadata(runtime, format)) {
      return kernelBrepUnsupported({ kernelId, route });
    }
    if (route && !exact) {
      return {
        success: false,
        diagnostics: [
          {
            code: 'GEOSPEC_DIRECT_STEP_ROUTE_REQUIRED',
            severity: 'error',
            message: 'GeoSpec exact BRep evidence requires a direct STEP/BRep runtime export route.',
            suggestion: `No kernel in this runtime offers a direct STEP/BRep route, so keep the requirement and report it as unsupported here. Load mesh evidence with ${meshAlternative} for the requirements a mesh can answer.`,
            details: {
              route: routeToProvenance(route),
              meshAlternative: { format: 'glb', matchers: [...geoSpecMeshEvidenceMatchers] },
            },
          },
        ],
      };
    }

    const exportOptions: Record<string, unknown> = {};
    const honored: NonNullable<GeometryExportIntent['honored']> = {
      format: format,
      sourceUnit: 'mm',
    };
    if (hasSchemaProperty(route, 'coordinateSystem')) {
      exportOptions['coordinateSystem'] = 'z-up';
      honored.coordinateSystem = 'z-up';
    }

    return {
      options: exportOptions,
      sourceUnit: 'mm',
      provenance: {
        requested: { format: format },
        honored,
        route: routeToProvenance(route),
      },
    };
  }

  const requested = requestedMeshIntent(format, tessellation);
  if (!routeAware) {
    return canonicalMeshIntent({
      format,
      exportOptions: {
        coordinateSystem: 'z-up',
        unit: { length: 'millimeter' },
        ...exportTessellation(tessellation),
      },
      ...(tessellation === undefined ? {} : { tessellation }),
    });
  }

  if (!route) {
    return hasAnyRouteMetadata(runtime, format)
      ? canonicalUnsupported({ format, missing: ['route'] })
      : canonicalMeshIntent({
          format,
          exportOptions: {
            coordinateSystem: 'z-up',
            unit: { length: 'millimeter' },
            ...exportTessellation(tessellation),
          },
          ...(tessellation === undefined ? {} : { tessellation }),
        });
  }

  const missing = ['coordinateSystem', 'unit', ...(tessellation === undefined ? [] : ['tessellation'])].filter(
    (property) => !hasSchemaProperty(route, property),
  );
  if (missing.length > 0) {
    return canonicalUnsupported({ format, route, missing });
  }

  return {
    options: {
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
      ...exportTessellation(tessellation),
    },
    sourceUnit: 'mm',
    provenance: {
      requested,
      honored: {
        format: requested.format,
        coordinateSystem: 'z-up',
        unit: { length: 'millimeter' },
        sourceUnit: 'mm',
        ...(tessellation === undefined ? {} : { tessellation }),
      },
      route: routeToProvenance(route),
    },
  };
};
