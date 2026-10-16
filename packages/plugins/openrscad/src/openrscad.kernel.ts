/**
 * OpenRSCAD kernel for OpenSCAD-language models.
 *
 * @public
 * @module
 */

import type { ExportShape3DOutput, RenderOptions } from '@taulabs/openrscad-engine';
import type * as OpenRscadModule from '@taulabs/openrscad-engine';
import { z } from 'zod';
import { createExportFile } from '@taucad/runtime/types';
import type { JSONSchema7, JSONSchema7Definition } from '@taucad/runtime/types';

import {
  createOpenrscadTessellationBudgetExceededIssue,
  createOpenrscadTessellationDowngradedIssue,
  createOpenrscadTessellationReport,
  meshWithinOpenrscadBudget,
  openrscadTessellationSchema,
  openrscadTriangleBudgets,
  resolveOpenrscadRequest,
  scriptOwnedResolution,
} from '#openrscad-tessellation.js';
import type {
  OpenrscadResolution,
  OpenrscadResolvedTessellation,
  OpenrscadTessellation,
} from '#openrscad-tessellation.js';
import {
  asBuffer,
  assertRootedPath,
  createKernelSuccess,
  createKernelParameterDeclaration,
  defineKernel,
  gltfExportConventionSchema,
  isRecordObject,
  resolveImportPath,
} from '@taucad/runtime/kernel';
import type { KernelFileSystem, KernelIssue, RuntimeLogger } from '@taucad/runtime/kernel';

const maxIncludeDepth = 50;
const useIncludePattern = /^\s*(?:use|include)\s*["<]([^">]+)[">]/gm;
const importedAssetPattern = /\b(?:import|surface)\s*\(\s*(?:file\s*=\s*)?"([^"]+)"/g;
type OpenRscadBackend = typeof OpenRscadModule;
type OpenRscadContext = {
  backend: OpenRscadBackend;
  entryPath: string | undefined;
};

/**
 * Render-time OpenSCAD tessellation options. Left out, previews use the `medium` preset for whatever the script does
 * not set itself: a script's own `$fn`, `$fa` and `$fs` win over the default, never over a requested value.
 * @public
 */
export const openrscadRenderSchema = z.object({
  tessellation: openrscadTessellationSchema
    .optional()
    .meta({ default: 'medium' })
    .describe("Tessellation quality for preview rendering; left out, the script's own $fn, $fa and $fs are kept"),
});

const exportTessellationSchema = z.object({
  tessellation: openrscadTessellationSchema
    .optional()
    .meta({ default: 'high' })
    .describe("Tessellation quality for mesh-based exports; left out, the script's own $fn, $fa and $fs are kept"),
});

/** Native OpenRSCAD 3D export options; left out, mesh exports use the `high` preset where the script sets nothing. @public */
export const openrscadExportSchemas = {
  glb: exportTessellationSchema.extend(gltfExportConventionSchema.shape),
  '3mf': exportTessellationSchema,
} as const satisfies Record<string, z.ZodType>;

/** The script's own `$fn`, `$fa` and `$fs`: what evaluation runs at. */
const scriptResolution: OpenrscadResolution = {};

/**
 * A stable key for the special variables a run sets, whatever else the value carries.
 *
 * @param resolution - The `$fn`, `$fs` and `$fa` a run sets.
 * @returns A key that is equal for equal settings.
 */
const resolutionKey = ({ segments, linearTolerance, angularTolerance }: OpenrscadResolution): string =>
  JSON.stringify([segments ?? null, linearTolerance ?? null, angularTolerance ?? null]);

/** The preview GLB holds metres converted from the script's millimetres (the engine's default scale). */
const previewMetresToMillimetres = 1000;

/**
 * Bounding-box diagonal of a preview GLB in millimetres, read from the `POSITION` accessors' `min` and `max`.
 * Node transforms are not applied: OpenSCAD's GLB carries at most an axis swap, which keeps the diagonal.
 *
 * @param bytes - The preview GLB.
 * @returns The diagonal in millimetres, or `NaN` when the GLB has no positions.
 */
const glbDiagonal = (bytes: Uint8Array<ArrayBuffer>): number => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== 0x46_54_6c_67) {
    return Number.NaN;
  }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))));
  const gltf = glbPositionsSchema.safeParse(parsed);
  if (!gltf.success) {
    return Number.NaN;
  }
  const { accessors = [], meshes = [] } = gltf.data;
  const bounds = meshes
    .flatMap((mesh) => mesh.primitives)
    .flatMap((primitive) => {
      const accessor = accessors[primitive.attributes.POSITION ?? -1];
      return accessor?.min && accessor.max ? [{ min: accessor.min, max: accessor.max }] : [];
    });
  const extent = [0, 1, 2].map(
    (axis) =>
      Math.max(...bounds.map(({ max }) => max[axis] ?? Number.NaN)) -
      Math.min(...bounds.map(({ min }) => min[axis] ?? Number.NaN)),
  );
  const diagonal = Math.hypot(...extent);
  return Number.isFinite(diagonal) ? diagonal * previewMetresToMillimetres : Number.NaN;
};

const glbPositionsSchema = z.object({
  accessors: z.array(z.object({ min: z.array(z.number()).optional(), max: z.array(z.number()).optional() })).optional(),
  meshes: z
    .array(
      z.object({
        // eslint-disable-next-line @typescript-eslint/naming-convention -- glTF attribute semantic
        primitives: z.array(z.object({ attributes: z.object({ POSITION: z.number().int().optional() }) })),
      }),
    )
    .optional(),
});

const customizerParameterSchema = z.object({
  name: z.string(),
  group: z.string(),
  description: z.unknown().optional(),
  type: z.enum(['number', 'bool', 'string', 'vector']),
  value: z.union([z.number(), z.boolean(), z.string(), z.array(z.number())]),
  control: z.object({
    kind: z.enum(['number', 'checkbox', 'slider', 'text', 'vector', 'dropdown']),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.unknown().optional(),
    maxLength: z.unknown().optional(),
    length: z.number().optional(),
    options: z
      .array(
        z.object({
          value: z.union([z.number(), z.string()]),
          label: z.string(),
        }),
      )
      .optional(),
  }),
});
const customizerOutputSchema = z.object({
  params: z.array(customizerParameterSchema).optional(),
});
type CustomizerParameter = z.output<typeof customizerParameterSchema>;

type SourceBundle = {
  source: string;
  files: Record<string, string>;
  binaryFiles: Record<string, Uint8Array<ArrayBuffer>>;
  resolved: string[];
  unresolved: string[];
};

type OpenRscadNativeHandle = {
  /** The plain GLB produced by evaluation; render never mutates this handle. */
  previewGlb?: Uint8Array<ArrayBuffer>;
  previewGlbTessellation?: string;
  /** Bounding-box diagonal in millimetres at the script's own resolution; presets scale with it. */
  diagonal?: number;
  source: string;
  files: Record<string, string>;
  binaryFiles: Record<string, Uint8Array<ArrayBuffer>>;
  parameters: Record<string, unknown>;
  entryPath: string;
  is2d: boolean;
  issues: KernelIssue[];
  stats: {
    area: number;
    triangleCount: number;
    vertexCount: number;
    volume: number;
  };
};

const parseIncludes = (source: string): string[] => {
  useIncludePattern.lastIndex = 0;
  return [...source.matchAll(useIncludePattern)].flatMap((match) => (match[1] ? [match[1]] : []));
};

const parseImportedAssets = (source: string): string[] => {
  importedAssetPattern.lastIndex = 0;
  return [...source.matchAll(importedAssetPattern)].flatMap((match) => (match[1] ? [match[1]] : []));
};

const engineLookupKey = (parentKey: string, specifier: string): string => {
  if (specifier.startsWith('/')) {
    return specifier;
  }
  const slash = parentKey.lastIndexOf('/');
  return slash === -1 ? specifier : `${parentKey.slice(0, slash)}/${specifier}`;
};

const isMissingFileError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  ['ENOENT', 'ENOTDIR'].includes(String(Reflect.get(error, 'code')));

const collectSourceBundle = async (options: {
  entryPath: string;
  filesystem: KernelFileSystem;
  logger: RuntimeLogger;
}): Promise<SourceBundle> => {
  const entryPath = assertRootedPath(options.entryPath);
  const source = await options.filesystem.readFile(entryPath, 'utf8');
  const resolved = new Set([entryPath]);
  const unresolved = new Set<string>();
  const files = new Map<string, string>();
  const binaryFiles = new Map<string, Uint8Array<ArrayBuffer>>();
  const visited = new Set<string>();

  const visit = async (input: {
    source: string;
    absolutePath: string;
    engineKey: string;
    depth: number;
  }): Promise<void> => {
    if (input.depth >= maxIncludeDepth) {
      options.logger.warn(`OpenSCAD include depth exceeded ${maxIncludeDepth} at ${input.absolutePath}`);
      return;
    }
    const visitKey = `${input.absolutePath}\0${input.engineKey}`;
    if (visited.has(visitKey)) {
      return;
    }
    visited.add(visitKey);
    /* oxlint-disable no-await-in-loop -- static imported assets are resolved in source order. */
    for (const specifier of parseImportedAssets(input.source)) {
      const absolutePath = resolveImportPath(
        specifier.startsWith('/') || specifier.startsWith('.') ? specifier : `./${specifier}`,
        input.absolutePath,
      );
      const lookupKey = engineLookupKey(input.engineKey, specifier);
      try {
        const extension = specifier.slice(specifier.lastIndexOf('.')).toLowerCase();
        if (extension === '.dxf' || extension === '.svg') {
          files.set(lookupKey, await options.filesystem.readFile(absolutePath, 'utf8'));
        } else {
          binaryFiles.set(lookupKey, await options.filesystem.readFile(absolutePath));
        }
        resolved.add(absolutePath);
      } catch (error) {
        if (!isMissingFileError(error)) {
          throw error;
        }
        unresolved.add(absolutePath);
      }
    }
    /* oxlint-enable no-await-in-loop */
    for (const specifier of parseIncludes(input.source)) {
      const absolutePath = resolveImportPath(
        specifier.startsWith('/') || specifier.startsWith('.') ? specifier : `./${specifier}`,
        input.absolutePath,
      );
      const lookupKey = engineLookupKey(input.engineKey, specifier);
      try {
        // oxlint-disable-next-line no-await-in-loop -- recursive includes depend on the parent source.
        const dependencySource = await options.filesystem.readFile(absolutePath, 'utf8');
        resolved.add(absolutePath);
        files.set(lookupKey, dependencySource);
        // oxlint-disable-next-line no-await-in-loop -- bounded DFS keeps engine aliases deterministic.
        await visit({
          source: dependencySource,
          absolutePath,
          engineKey: lookupKey,
          depth: input.depth + 1,
        });
      } catch (error) {
        if (!isMissingFileError(error)) {
          throw error;
        }
        unresolved.add(absolutePath);
      }
    }
  };

  await visit({ source, absolutePath: entryPath, engineKey: '', depth: 0 });
  return {
    source,
    files: Object.fromEntries(files),
    binaryFiles: Object.fromEntries(binaryFiles),
    resolved: [...resolved],
    unresolved: [...unresolved],
  };
};

const flattenParameters = (parameters: Record<string, unknown>): Record<string, unknown> => {
  const flattened: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parameters)) {
    if (isRecordObject(value)) {
      Object.assign(flattened, flattenParameters(value));
    } else {
      flattened[key] = value;
    }
  }
  return flattened;
};

const toOpenScadLiteral = (value: unknown): string => {
  if (value === undefined || value === null) {
    return 'undef';
  }
  if (typeof value === 'string' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  throw new TypeError(`Unsupported OpenSCAD parameter value type: ${typeof value}`);
};

const renderParameters = (
  parameters: Record<string, unknown>,
  tessellation: OpenrscadResolution,
): Record<string, string> => {
  const flattened = flattenParameters(parameters);
  const overrides: Record<string, number | undefined> = {
    $fn: tessellation.segments,
    $fa: tessellation.angularTolerance,
    $fs: tessellation.linearTolerance,
  };
  for (const [name, value] of Object.entries(overrides)) {
    if (value !== undefined && !(name in flattened)) {
      flattened[name] = value;
    }
  }
  return Object.fromEntries(Object.entries(flattened).map(([name, value]) => [name, toOpenScadLiteral(value)]));
};

const customizerProperty = (parameter: CustomizerParameter): JSONSchema7 => {
  const base: JSONSchema7 = {
    title: parameter.name,
    default: parameter.value,
    ...(typeof parameter.description === 'string' ? { description: parameter.description } : {}),
  };
  const options = parameter.control.options ?? [];
  const onlyOption = options.length === 1 ? options[0] : undefined;
  if (
    parameter.control.kind === 'dropdown' &&
    parameter.type === 'number' &&
    onlyOption !== undefined &&
    typeof onlyOption.value === 'number' &&
    onlyOption.value !== parameter.value
  ) {
    return {
      ...base,
      type: 'number',
      minimum: 0,
      maximum: onlyOption.value,
    };
  }
  if (parameter.control.kind === 'dropdown') {
    return {
      ...base,
      type: parameter.type === 'number' ? 'number' : 'string',
      oneOf: options.map((option) => ({
        const: option.value,
        title: option.label,
      })),
    };
  }
  if (parameter.type === 'vector') {
    const length = parameter.control.length ?? (Array.isArray(parameter.value) ? parameter.value.length : 0);
    return {
      ...base,
      type: 'array',
      items: { type: 'number' },
      minItems: length,
      maxItems: length,
    };
  }
  if (parameter.type === 'bool') {
    return { ...base, type: 'boolean' };
  }
  if (parameter.type === 'string') {
    return {
      ...base,
      type: 'string',
      ...(typeof parameter.control.maxLength === 'number' ? { maxLength: parameter.control.maxLength } : {}),
    };
  }
  return {
    ...base,
    type: 'number',
    ...(parameter.control.min === undefined ? {} : { minimum: parameter.control.min }),
    ...(parameter.control.max === undefined ? {} : { maximum: parameter.control.max }),
    ...(typeof parameter.control.step === 'number' ? { multipleOf: parameter.control.step } : {}),
  };
};

const parseCustomizer = async (
  source: string,
  extractParameters: OpenRscadBackend['parameters'],
): Promise<{
  defaultParameters: Record<string, unknown>;
  jsonSchema: JSONSchema7;
}> => {
  const parsedJson: unknown = JSON.parse(await extractParameters(source));
  const parsed = customizerOutputSchema.parse(parsedJson);
  const properties: Record<string, JSONSchema7Definition> = {};
  const defaults: Record<string, unknown> = {};
  const groupedProperties = new Map<string, Record<string, JSONSchema7Definition>>();
  for (const parameter of parsed.params ?? []) {
    const property = customizerProperty(parameter);
    if (!parameter.group) {
      properties[parameter.name] = property;
      defaults[parameter.name] = parameter.value;
      continue;
    }
    let groupProperties = groupedProperties.get(parameter.group);
    if (!groupProperties) {
      groupProperties = {};
      groupedProperties.set(parameter.group, groupProperties);
      properties[parameter.group] = {
        type: 'object',
        title: parameter.group,
        properties: groupProperties,
        additionalProperties: false,
      };
    }
    groupProperties[parameter.name] = property;
    const currentDefaults = defaults[parameter.group];
    const groupDefaults = isRecordObject(currentDefaults) ? currentDefaults : {};
    defaults[parameter.group] = groupDefaults;
    groupDefaults[parameter.name] = parameter.value;
  }
  return {
    defaultParameters: defaults,
    jsonSchema: { type: 'object', properties, additionalProperties: false },
  };
};

const byteOffsetLocation = (source: string, fileName: string, byteOffset: number): KernelIssue['location'] => {
  if (byteOffset < 0) {
    return { fileName, startLineNumber: 1, startColumn: 1 };
  }
  const prefix = new TextDecoder().decode(new TextEncoder().encode(source).slice(0, byteOffset));
  const lines = prefix.split('\n');
  return {
    fileName,
    startLineNumber: lines.length,
    startColumn: (lines.at(-1)?.length ?? 0) + 1,
  };
};

const collectIssues = (result: ExportShape3DOutput, source: string, entryPath: string): KernelIssue[] => {
  const issues: KernelIssue[] = [];
  const seen = new Set<string>();
  const add = (issue: KernelIssue): void => {
    const key = `${issue.severity}\0${issue.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      issues.push(issue);
    }
  };
  for (const diagnostic of result.diagnostics) {
    add({
      code: 'RUNTIME',
      message: diagnostic.message,
      severity: diagnostic.severity,
      type: 'compilation',
      location: byteOffsetLocation(source, entryPath, diagnostic.start),
    });
  }
  for (const [message, severity] of [
    [result.warnings, 'warning'],
    [result.geomErrors, 'error'],
  ] as const) {
    for (const line of message.split('\n').filter(Boolean)) {
      add({ code: 'RUNTIME', message: line, severity, type: 'kernel' });
    }
  }
  if (result.error) {
    add({
      code: 'RUNTIME',
      message: result.error,
      severity: 'error',
      type: 'kernel',
    });
  }
  return issues;
};

const requestOptions = <T extends Record<string, unknown>>(input: {
  files: Record<string, string>;
  binaryFiles: Record<string, Uint8Array<ArrayBuffer>>;
  parameters: Record<string, unknown>;
  tessellation: OpenrscadResolution;
  exportOptions: T;
}): T & RenderOptions => ({
  files: input.files,
  binaryFiles: input.binaryFiles,
  params: renderParameters(input.parameters, input.tessellation),
  ...input.exportOptions,
});

const assertExport = (result: ExportShape3DOutput): ExportShape3DOutput => {
  if (!result.ok) {
    throw new Error(result.error || 'OpenSCAD native export failed');
  }
  return result;
};

class OpenRscadExportError extends Error {
  public readonly issues: readonly KernelIssue[];
  public constructor(issues: readonly KernelIssue[]) {
    super(issues.map((issue) => issue.message).join('\n'));
    this.issues = issues;
  }
}

/** Engine version this kernel is authored against. @public */
const engineVersion = '0.11.0-beta.4';

/** Options for {@link createOpenrscadKernel}. @public */
export type CreateOpenrscadKernelOptions = {
  /**
   * Loads the engine module. The default is the bare
   * `@taulabs/openrscad-engine` specifier, and the *engine's* export map picks
   * the payload: browsers and bundlers get the WebAssembly build, a Node host
   * gets the N-API addon when a platform package matches it and the same
   * WebAssembly build when none does. That choice is invisible here, which is
   * what keeps this a `hostTarget: browser` package — no Node-only name is
   * ever spelled in this source.
   *
   * Override it only to bind a *different build of the same engine* (the
   * parity test rebuilds the wasm facade over `./node` this way). The artifacts
   * are held byte-identical by a per-release parity gate.
   */
  loadBackend?: () => Promise<OpenRscadBackend>;
  /**
   * Kernel version, and with it the runtime's build-cache namespace. It is the
   * *engine release*, not the backend: one release's addon and WebAssembly
   * build are byte-identical artifacts, gated per release, so they share one
   * cache key deliberately. Override this only for an engine build that is not
   * that release.
   */
  version?: string;
};

/* oxlint-disable typescript/explicit-module-boundary-types -- defineKernel's exact inferred contract is the public type; spelling it would restore the deleted ReturnType annotation. */
/**
 * Build an OpenRSCAD kernel over a chosen engine build.
 *
 * @param options - the engine loader and the kernel version to declare
 * @returns a kernel factory, ready to register with a runtime
 * @public
 */
export const createOpenrscadKernel = ({
  loadBackend = async () => import('@taulabs/openrscad-engine'),
  version = engineVersion,
}: CreateOpenrscadKernelOptions = {}) =>
  defineKernel({
    id: 'openrscad',
    extensions: ['scad'],
    name: 'OpenRSCADKernel',
    version,
    evaluateOptionsSchema: z.object({}),
    views: {
      model: {
        title: 'Model',
        mimeType: 'model/gltf-binary',
        optionsSchema: openrscadRenderSchema,
        content: ['includeEdges'],
      },
    },
    exports: {
      glb: {
        title: 'glTF binary',
        mimeType: 'model/gltf-binary',
        extension: 'glb',
        optionsSchema: openrscadExportSchemas.glb,
        content: ['includeEdges'],
      },
      '3mf': {
        title: '3D Manufacturing Format',
        mimeType: 'model/3mf',
        extension: '3mf',
        optionsSchema: openrscadExportSchemas['3mf'],
      },
    },

    async initialize(_options, { logger }) {
      const backend = await loadBackend();
      // Which payload the engine's export map actually bound. A Node host that
      // no platform package covers still renders — through the WebAssembly
      // build — and this is the only place that says so, so it is logged once
      // per kernel context rather than left to be inferred from timings.
      logger.log(`OpenRSCAD engine backend: ${backend.backend}`);
      if (backend.backendCause !== undefined) {
        // The addon loader's failure chain, never flattened: it names every
        // candidate it tried. Debug level, and never thrown — the fallback is a
        // supported outcome, not an error.
        logger.debug('OpenRSCAD bound the WebAssembly build; the native addon did not load', {
          data: backend.backendCause,
        });
      }
      const context: OpenRscadContext = { backend, entryPath: undefined };
      return context;
    },

    async resolve({ entryPath }, { filesystem, logger }) {
      const bundle = await collectSourceBundle({
        entryPath,
        filesystem,
        logger,
      });
      return { resolved: bundle.resolved, unresolved: bundle.unresolved };
    },

    async describe({ entryPath }, { filesystem }, context) {
      const source = await filesystem.readFile(entryPath, 'utf8');
      const { defaultParameters, jsonSchema } = await parseCustomizer(source, context.backend.parameters);
      return createKernelSuccess({
        parameters: createKernelParameterDeclaration(defaultParameters, jsonSchema, {
          id: 'urn:taucad:openrscad:parameters',
          name: 'OpenRscadParameters',
        }),
      });
    },

    async evaluate({ entryPath, parameters }, { filesystem, logger, tracer }, context) {
      const normalizedEntryPath = assertRootedPath(entryPath);
      if (context.entryPath !== normalizedEntryPath) {
        await context.backend.clearCache();
        context.entryPath = normalizedEntryPath;
      }
      const bundle = await collectSourceBundle({
        entryPath,
        filesystem,
        logger,
      });
      const includeEdges = false;
      const span = tracer.startSpan('openrscad.export-3d', {
        phase: 'computingGeometry',
        includeEdges,
      });
      let result: ExportShape3DOutput;
      try {
        result = assertExport(
          await context.backend.renderToGlb(
            bundle.source,
            requestOptions({
              files: bundle.files,
              binaryFiles: bundle.binaryFiles,
              parameters,
              tessellation: scriptResolution,
              exportOptions: {
                includeEdges,
              },
            }),
          ),
        );
      } finally {
        span.end();
      }
      if (result.echo) {
        logger.debug(result.echo);
      }
      const issues = collectIssues(result, bundle.source, normalizedEntryPath);
      const preview = asBuffer(result.bytes);
      const nativeHandle: OpenRscadNativeHandle = {
        previewGlb: preview,
        previewGlbTessellation: resolutionKey(scriptResolution),
        diagonal: glbDiagonal(preview),
        source: bundle.source,
        files: bundle.files,
        binaryFiles: bundle.binaryFiles,
        parameters,
        entryPath: normalizedEntryPath,
        is2d: result.is2d,
        issues,
        stats: {
          area: result.area,
          triangleCount: result.triangleCount,
          vertexCount: result.vertexCount,
          volume: result.volume,
        },
      };
      return {
        handle: nativeHandle,
        issues,
      };
    },

    async render({ handle: nativeHandle, options, content }, { tracer }, context) {
      const includeEdges = content?.includeEdges === true;
      const started = performance.now();
      const requested = resolveOpenrscadRequest({
        tessellation: options.tessellation,
        laneDefault: 'medium',
        diagonal: nativeHandle.diagonal ?? Number.NaN,
        owned: scriptOwnedResolution([nativeHandle.source, ...Object.values(nativeHandle.files)]),
      });
      const budget = openrscadTriangleBudgets.preview;
      const meshAt = async (
        resolution: OpenrscadResolution,
      ): Promise<{ content: Uint8Array<ArrayBuffer>; issues: KernelIssue[]; triangles: number; vertices: number }> => {
        const rendered =
          !includeEdges && nativeHandle.previewGlbTessellation === resolutionKey(resolution) && nativeHandle.previewGlb;
        if (rendered) {
          return {
            content: rendered,
            issues: nativeHandle.issues,
            triangles: nativeHandle.stats.triangleCount,
            vertices: nativeHandle.stats.vertexCount,
          };
        }
        const span = tracer.startSpan(includeEdges ? 'openrscad.export-3d-edges' : 'openrscad.export-3d-plain', {
          phase: 'serializingGeometry',
        });
        let result: ExportShape3DOutput;
        try {
          result = assertExport(
            await context.backend.renderToGlb(
              nativeHandle.source,
              requestOptions({
                files: nativeHandle.files,
                binaryFiles: nativeHandle.binaryFiles,
                parameters: nativeHandle.parameters,
                tessellation: resolution,
                exportOptions: {
                  includeEdges,
                },
              }),
            ),
          );
        } finally {
          span.end();
        }
        return {
          content: asBuffer(result.bytes),
          issues: collectIssues(result, nativeHandle.source, nativeHandle.entryPath),
          triangles: result.triangleCount,
          vertices: result.vertexCount,
        };
      };
      const { result, effective, downgraded } = await meshWithinOpenrscadBudget({
        resolution: requested,
        budget,
        mesh: meshAt,
      });
      const tessellation = createOpenrscadTessellationReport({
        requested,
        effective,
        downgraded,
        triangles: result.triangles,
        vertices: result.vertices,
        elapsed: performance.now() - started,
      });
      const issues =
        downgraded === 0
          ? result.issues
          : [
              ...result.issues,
              createOpenrscadTessellationDowngradedIssue({
                requested,
                effective,
                downgraded,
                triangles: result.triangles,
                budget,
              }),
            ];
      return { content: result.content, tessellation, issues };
    },

    async export(input, { tracer }, context) {
      const { exportId: format, handle: nativeHandle } = input;
      const resolve = (tessellation: OpenrscadTessellation | undefined): OpenrscadResolvedTessellation =>
        resolveOpenrscadRequest({
          tessellation,
          laneDefault: 'high',
          diagonal: nativeHandle.diagonal ?? Number.NaN,
          owned: scriptOwnedResolution([nativeHandle.source, ...Object.values(nativeHandle.files)]),
        });
      const exportNative = async (
        format: '3mf' | 'glb',
        exportArtifact: () => Promise<ExportShape3DOutput>,
      ): Promise<ExportShape3DOutput> => {
        const span = tracer.startSpan(`openrscad.export-${format}`, {
          phase: 'serializingGeometry',
        });
        try {
          return await exportArtifact();
        } finally {
          span.end();
        }
      };
      const checked = (result: ExportShape3DOutput, requested: OpenrscadResolvedTessellation): KernelIssue[] => {
        const issues = collectIssues(result, nativeHandle.source, nativeHandle.entryPath);
        if (!result.ok) {
          throw new OpenRscadExportError(issues);
        }
        const budget = openrscadTriangleBudgets.export;
        if (result.triangleCount > budget) {
          throw new OpenRscadExportError([
            createOpenrscadTessellationBudgetExceededIssue({ requested, triangles: result.triangleCount, budget }),
          ]);
        }
        return issues;
      };
      switch (format) {
        case 'glb': {
          const { content, options } = input;
          const requested = resolve(options.tessellation);
          const result = await exportNative('glb', async () =>
            context.backend.exportShape3D(
              nativeHandle.source,
              'glb',
              requestOptions({
                files: nativeHandle.files,
                binaryFiles: nativeHandle.binaryFiles,
                parameters: nativeHandle.parameters,
                tessellation: requested,
                exportOptions: {
                  includeEdges: content?.includeEdges === true,
                  sourceUnitToMeters: options.unit.length === 'millimeter' ? 1 : 0.001,
                  coordinateSystem: options.coordinateSystem,
                },
              }),
            ),
          );
          const issues = checked(result, requested);
          return { files: [createExportFile('glb', 'model.glb', asBuffer(result.bytes))], issues };
        }
        case '3mf': {
          const { options } = input;
          const requested = resolve(options.tessellation);
          const result = await exportNative('3mf', async () =>
            context.backend.exportShape3D(
              nativeHandle.source,
              '3mf',
              requestOptions({
                files: nativeHandle.files,
                binaryFiles: nativeHandle.binaryFiles,
                parameters: nativeHandle.parameters,
                tessellation: requested,
                exportOptions: {},
              }),
            ),
          );
          const issues = checked(result, requested);
          return { files: [createExportFile('3mf', 'model.3mf', asBuffer(result.bytes))], issues };
        }
        default: {
          const exhaustive: never = format;
          throw new OpenRscadExportError([
            {
              message: `Export format '${String(exhaustive)}' is not supported by OpenSCAD.`,
              code: 'KERNEL_CAPABILITY_MISSING',
              type: 'runtime',
              severity: 'error',
            },
          ]);
        }
      }
    },

    async onDispose(context) {
      await context.backend.clearCache();
    },
  });
/* oxlint-enable typescript/explicit-module-boundary-types */

/** OpenRSCAD WebAssembly kernel plugin. @public */
export const openrscadKernel = createOpenrscadKernel();
