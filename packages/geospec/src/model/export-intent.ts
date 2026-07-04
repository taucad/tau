import type { GeoSpecUnit, GeometryDiagnostic, GeometryExportIntent } from '#mesh/types.js';
import type { GeoSpecModelFormat, GeoSpecRuntimeClient } from '#model/types.js';
import type { ExportRoute } from '@taucad/runtime/types';

export type RuntimeBackedModelFormat = Exclude<GeoSpecModelFormat, 'mesh-buffer'>;

/** Runtime route metadata used to decide whether a runtime export can honor GeoSpec evidence requirements. */
export type GeoSpecExportRoute = Partial<ExportRoute> & {
  kernelId?: string;
  sourceFormat?: string;
  targetFormat?: string;
  transcoderId?: string;
  fidelity?: string;
  schema?: {
    properties?: Record<string, unknown>;
  };
  defaults?: Record<string, unknown>;
};

/** Runtime client shape for route-aware Tau runtimes. */
export type RuntimeClientWithRoutes = GeoSpecRuntimeClient & {
  bestRouteFor(format: string, kernelId?: string): GeoSpecExportRoute | undefined;
};

/** Resolved runtime export request and provenance for a GeoSpec model load. */
export type RuntimeExportIntent = {
  options: Record<string, unknown>;
  provenance: GeometryExportIntent;
  sourceUnit: GeoSpecUnit;
};

/** Structured failure returned when a runtime cannot provide the requested GeoSpec evidence. */
export type RuntimeExportIntentFailure = {
  success: false;
  diagnostics: GeometryDiagnostic[];
};

const stepFormats = new Set<GeoSpecModelFormat>(['step', 'stp']);

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

const hasSchemaProperty = (route: GeoSpecExportRoute | undefined, property: string): boolean =>
  Boolean(route?.schema?.properties && property in route.schema.properties);

const isDirectRoute = (route: GeoSpecExportRoute): boolean => route.transcoderId === undefined;

const requestedMeshIntent = (format: RuntimeBackedModelFormat): GeometryExportIntent['requested'] => ({
  format: format as GeometryExportIntent['requested']['format'],
  coordinateSystem: 'z-up',
  unit: { length: 'millimeter' },
});

const canonicalMeshIntent = (options: {
  format: RuntimeBackedModelFormat;
  exportOptions: Record<string, unknown>;
}): RuntimeExportIntent => {
  const requested = requestedMeshIntent(options.format);
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
      },
    },
  };
};

const routeToProvenance = (route: GeoSpecExportRoute | undefined): GeometryExportIntent['route'] | undefined =>
  route
    ? {
        kernelId: route.kernelId,
        sourceFormat: route.sourceFormat,
        targetFormat: route.targetFormat,
        transcoderId: route.transcoderId,
        fidelity: route.fidelity,
        direct: isDirectRoute(route),
      }
    : undefined;

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

export const resolveRuntimeExportIntent = (options: {
  runtime: GeoSpecRuntimeClient;
  format: RuntimeBackedModelFormat;
}): RuntimeExportIntent | RuntimeExportIntentFailure => {
  const { runtime, format } = options;
  const routeAware = hasRuntimeRoutes(runtime);
  const route = routeAware ? runtime.bestRouteFor(format) : undefined;

  if (stepFormats.has(format)) {
    if (route && (!isDirectRoute(route) || route.fidelity !== 'brep')) {
      return {
        success: false,
        diagnostics: [
          {
            code: 'GEOSPEC_DIRECT_STEP_ROUTE_REQUIRED',
            severity: 'error',
            message: 'GeoSpec exact BRep evidence requires a direct STEP/BRep runtime export route.',
            suggestion:
              'Request a runtime export route that preserves exact STEP/BRep evidence, or load mesh evidence with GLB/glTF when exact BRep assertions are not required.',
            details: {
              route: routeToProvenance(route),
            },
          },
        ],
      };
    }

    const exportOptions: Record<string, unknown> = {};
    const honored: NonNullable<GeometryExportIntent['honored']> = {
      format: format as GeometryExportIntent['requested']['format'],
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
        requested: { format: format as GeometryExportIntent['requested']['format'] },
        honored,
        route: routeToProvenance(route),
      },
    };
  }

  const requested = requestedMeshIntent(format);
  if (!routeAware) {
    return canonicalMeshIntent({
      format,
      exportOptions: {
        coordinateSystem: 'z-up',
        unit: { length: 'millimeter' },
      },
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
          },
        });
  }

  const missing = ['coordinateSystem', 'unit'].filter((property) => !hasSchemaProperty(route, property));
  if (missing.length > 0) {
    return canonicalUnsupported({ format, route, missing });
  }

  return {
    options: {
      coordinateSystem: 'z-up',
      unit: { length: 'millimeter' },
    },
    sourceUnit: 'mm',
    provenance: {
      requested,
      honored: {
        format: requested.format,
        coordinateSystem: 'z-up',
        unit: { length: 'millimeter' },
        sourceUnit: 'mm',
      },
      route: routeToProvenance(route),
    },
  };
};
