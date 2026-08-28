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
import type { GeometryGltf, JSONSchema7, JSONSchema7Definition } from '@taucad/runtime/types';

import {
  asBuffer,
  assertRootedPath,
  createKernelError,
  createKernelSuccess,
  defineKernel,
  finalizeMeshOutput,
  gltfExportConventionSchema,
  isRecordObject,
  resolveImportPath,
} from '@taucad/runtime/kernel';
import type { KernelFileSystem, KernelIssue, RuntimeLogger } from '@taucad/runtime/kernel';

const maxIncludeDepth = 50;
const useIncludePattern = /^\s*(?:use|include)\s*["<]([^">]+)[">]/gm;
const importedAssetPattern = /\b(?:import|surface)\s*\(\s*(?:file\s*=\s*)?"([^"]+)"/g;
type OpenRscadBackend = typeof OpenRscadModule;
type OpenRscadContext = { backend: OpenRscadBackend; entryPath: string | undefined };

const renderTessellationSchema = z.object({
  tessellation: z
    .object({
      segments: z.number().int().min(0).optional(),
      minimumAngle: z.number().positive().optional(),
      minimumSize: z.number().positive().optional(),
    })
    .default({}),
});

/** Render-time OpenSCAD tessellation options. @public */
export const openrscadRenderSchema = renderTessellationSchema;

const exportTessellationSchema = z.object({
  tessellation: z
    .object({
      segments: z.number().int().min(3).default(32),
      minimumAngle: z.number().positive().default(12),
      minimumSize: z.number().positive().default(2),
    })
    .default({ segments: 32, minimumAngle: 12, minimumSize: 2 }),
});

/** Native OpenRSCAD 3D export options. @public */
export const openrscadExportSchemas = {
  glb: exportTessellationSchema.extend(gltfExportConventionSchema.shape),
  '3mf': exportTessellationSchema,
} as const satisfies Record<string, z.ZodType>;

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
    options: z.array(z.object({ value: z.union([z.number(), z.string()]), label: z.string() })).optional(),
  }),
});
const customizerOutputSchema = z.object({ params: z.array(customizerParameterSchema).optional() });
type CustomizerParameter = z.output<typeof customizerParameterSchema>;

type SourceBundle = {
  source: string;
  files: Record<string, string>;
  binaryFiles: Record<string, Uint8Array<ArrayBuffer>>;
  resolved: string[];
  unresolved: string[];
};

type OpenRscadNativeHandle = {
  previewGlb: Uint8Array<ArrayBuffer>;
  previewGlbWithEdges?: Uint8Array<ArrayBuffer>;
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
    for (const specifier of parseImportedAssets(input.source)) {
      const absolutePath = resolveImportPath(
        specifier.startsWith('/') || specifier.startsWith('.') ? specifier : `./${specifier}`,
        input.absolutePath,
      );
      const lookupKey = engineLookupKey(input.engineKey, specifier);
      try {
        const extension = specifier.slice(specifier.lastIndexOf('.')).toLowerCase();
        if (extension === '.dxf' || extension === '.svg') {
          // oxlint-disable-next-line no-await-in-loop -- static assets are resolved in source order.
          files.set(lookupKey, await options.filesystem.readFile(absolutePath, 'utf8'));
        } else {
          // oxlint-disable-next-line no-await-in-loop -- static assets are resolved in source order.
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

const flattenParameters = (parameters: Record<string, unknown>, prefix = ''): Record<string, unknown> => {
  const flattened: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parameters)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (isRecordObject(value)) {
      Object.assign(flattened, flattenParameters(value, name));
    } else {
      flattened[name] = value;
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
  tessellation: z.output<typeof renderTessellationSchema>['tessellation'],
): Record<string, string> => {
  const flattened = flattenParameters(parameters);
  const overrides: Record<string, number | undefined> = {
    $fn: tessellation.segments,
    $fa: tessellation.minimumAngle,
    $fs: tessellation.minimumSize,
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
  if (parameter.control.kind === 'dropdown') {
    return {
      ...base,
      type: parameter.type === 'number' ? 'number' : 'string',
      oneOf: (parameter.control.options ?? []).map((option) => ({ const: option.value, title: option.label })),
    };
  }
  if (parameter.type === 'vector') {
    const length = parameter.control.length ?? (Array.isArray(parameter.value) ? parameter.value.length : 0);
    return { ...base, type: 'array', items: { type: 'number' }, minItems: length, maxItems: length };
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
): Promise<{ defaultParameters: Record<string, unknown>; jsonSchema: JSONSchema7 }> => {
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
    add({ code: 'RUNTIME', message: result.error, severity: 'error', type: 'kernel' });
  }
  return issues;
};

const requestOptions = <T extends Record<string, unknown>>(input: {
  files: Record<string, string>;
  binaryFiles: Record<string, Uint8Array<ArrayBuffer>>;
  parameters: Record<string, unknown>;
  tessellation: z.output<typeof renderTessellationSchema>['tessellation'];
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

/** Engine version this kernel is authored against. @public */
const engineVersion = '0.11.0-beta.1';

/** Options for {@link createOpenrscadKernel}. @public */
export type CreateOpenrscadKernelOptions = {
  /**
   * Loads the engine module. Defaults to the WebAssembly build, which is the
   * reference semantics and the only build a browser can run. A Node host may
   * pass a different build of the *same* engine — the artifacts are held
   * byte-identical by a parity gate — but it must be a host recipe's choice,
   * never a probe inside this package: this is a `hostTarget: browser` package
   * and its payload-isolation test forbids naming a Node-only implementation.
   */
  loadBackend?: () => Promise<OpenRscadBackend>;
  /**
   * Kernel version. A host registering a non-default backend must vary this,
   * because the runtime's build cache is keyed on kernel version and two
   * backends sharing one key would let one host reuse the other's artifacts.
   */
  version?: string;
};

/**
 * Build an OpenRSCAD kernel over a chosen engine build.
 *
 * @param options - the engine loader and the kernel version to declare
 * @returns a kernel factory, ready to register with a runtime
 * @public
 */
// oxlint-disable-next-line typescript/explicit-module-boundary-types -- defineKernel's exact inferred contract is the public type; spelling it would restore the deleted ReturnType annotation
export const createOpenrscadKernel = ({
  loadBackend = async () => import('@taulabs/openrscad-engine'),
  version = engineVersion,
}: CreateOpenrscadKernelOptions = {}) =>
  defineKernel({
    id: 'openrscad',
    extensions: ['scad'],
    name: 'OpenRSCADKernel',
    version,
    createOptionsSchema: openrscadRenderSchema,
    render: { optionsSchema: openrscadRenderSchema, content: ['includeEdges'] },
    exportFormats: {
      glb: { optionsSchema: openrscadExportSchemas.glb, content: ['includeEdges'] },
      '3mf': { optionsSchema: openrscadExportSchemas['3mf'] },
    },

    async initialize() {
      const context: OpenRscadContext = {
        backend: await loadBackend(),
        entryPath: undefined,
      };
      return context;
    },

    async getDependencies({ entryPath }, { filesystem, logger }) {
      const bundle = await collectSourceBundle({ entryPath, filesystem, logger });
      return { resolved: bundle.resolved, unresolved: bundle.unresolved };
    },

    async getParameters({ entryPath }, { filesystem }, context) {
      const source = await filesystem.readFile(entryPath, 'utf8');
      return createKernelSuccess(await parseCustomizer(source, context.backend.parameters));
    },

    async createGeometry({ entryPath, parameters, options }, { filesystem, logger, tracer }, context) {
      const normalizedEntryPath = assertRootedPath(entryPath);
      if (context.entryPath !== normalizedEntryPath) {
        await context.backend.clearCache();
        context.entryPath = normalizedEntryPath;
      }
      const bundle = await collectSourceBundle({ entryPath, filesystem, logger });
      const span = tracer.startSpan('openrscad.export-3d', { phase: 'computingGeometry' });
      let result: ExportShape3DOutput;
      try {
        result = assertExport(
          await context.backend.renderToGlb(
            bundle.source,
            requestOptions({
              files: bundle.files,
              binaryFiles: bundle.binaryFiles,
              parameters,
              tessellation: options.tessellation,
              exportOptions: {
                includeEdges: false,
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
      const previewGlb = asBuffer(result.bytes);
      const nativeHandle: OpenRscadNativeHandle = {
        previewGlb,
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
        nativeHandle,
        issues,
      };
    },

    async meshGeometry({ nativeHandle, options, content }, { tracer }, context) {
      if (content?.includeEdges !== true) {
        const geometry: GeometryGltf = { format: 'gltf', content: nativeHandle.previewGlb };
        return finalizeMeshOutput({ artifacts: [geometry], issues: nativeHandle.issues });
      }
      if (nativeHandle.previewGlbWithEdges) {
        return finalizeMeshOutput({
          artifacts: [{ format: 'gltf', content: nativeHandle.previewGlbWithEdges }],
          issues: nativeHandle.issues,
        });
      }
      const span = tracer.startSpan('openrscad.export-3d-edges', { phase: 'serializingGeometry' });
      let result: ExportShape3DOutput;
      try {
        result = assertExport(
          await context.backend.renderToGlb(
            nativeHandle.source,
            requestOptions({
              files: nativeHandle.files,
              binaryFiles: nativeHandle.binaryFiles,
              parameters: nativeHandle.parameters,
              tessellation: options.tessellation,
              exportOptions: {
                includeEdges: true,
              },
            }),
          ),
        );
      } finally {
        span.end();
      }
      nativeHandle.previewGlbWithEdges = asBuffer(result.bytes);
      const geometry: GeometryGltf = { format: 'gltf', content: nativeHandle.previewGlbWithEdges };
      return finalizeMeshOutput({
        artifacts: [geometry],
        issues: collectIssues(result, nativeHandle.source, nativeHandle.entryPath),
      });
    },

    async exportGeometry(input, { tracer }, context) {
      const { format, nativeHandle } = input;
      const exportNative = async (
        format: '3mf' | 'glb',
        exportArtifact: () => Promise<ExportShape3DOutput>,
      ): Promise<ExportShape3DOutput> => {
        const span = tracer.startSpan(`openrscad.export-${format}`, { phase: 'serializingGeometry' });
        try {
          return await exportArtifact();
        } finally {
          span.end();
        }
      };
      switch (format) {
        case 'glb': {
          const { content, options } = input;
          const result = await exportNative('glb', async () =>
            context.backend.exportShape3D(
              nativeHandle.source,
              'glb',
              requestOptions({
                files: nativeHandle.files,
                binaryFiles: nativeHandle.binaryFiles,
                parameters: nativeHandle.parameters,
                tessellation: options.tessellation,
                exportOptions: {
                  includeEdges: content?.includeEdges === true,
                  sourceUnitToMeters: options.unit.length === 'millimeter' ? 1 : 0.001,
                  coordinateSystem: options.coordinateSystem,
                },
              }),
            ),
          );
          const issues = collectIssues(result, nativeHandle.source, nativeHandle.entryPath);
          if (!result.ok) {
            return createKernelError(issues);
          }
          return createKernelSuccess([createExportFile('glb', 'model.glb', asBuffer(result.bytes))], issues);
        }
        case '3mf': {
          const { options } = input;
          const result = await exportNative('3mf', async () =>
            context.backend.exportShape3D(
              nativeHandle.source,
              '3mf',
              requestOptions({
                files: nativeHandle.files,
                binaryFiles: nativeHandle.binaryFiles,
                parameters: nativeHandle.parameters,
                tessellation: options.tessellation,
                exportOptions: {},
              }),
            ),
          );
          const issues = collectIssues(result, nativeHandle.source, nativeHandle.entryPath);
          if (!result.ok) {
            return createKernelError(issues);
          }
          return createKernelSuccess([createExportFile('3mf', 'model.3mf', asBuffer(result.bytes))], issues);
        }
        default: {
          const exhaustive: never = format;
          return createKernelError([
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

    async cleanup(context) {
      await context.backend.clearCache();
    },
  });

/** OpenRSCAD WebAssembly kernel plugin. @public */
export const openrscadKernel = createOpenrscadKernel();
