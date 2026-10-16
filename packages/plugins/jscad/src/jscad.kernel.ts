/**
 * JSCAD Kernel Module
 *
 * Full defineKernel implementation for the JSCAD kernel.
 * Uses runtime.bundler for JS/TS bundling and runtime.execute for evaluation.
 * Registers @jscad/modeling as a built-in module so user code can import it.
 */

import { createExportFile } from '@taucad/runtime/types';
import type { KernelIssue } from '@taucad/runtime/types';
import {
  asBuffer,
  jsonSchemaFromJson,
  defineKernel,
  isRecordObject,
  extractDefaultParameters,
  registerKernelModule,
  toVmEntryPath,
  enrichIssueLocation,
  createKernelError,
  createKernelSuccess,
  createKernelParameterDeclaration,
  createFrameClassifier,
  parseStackTrace,
  resolveSourcePath,
  deriveLocationFromFrames,
} from '@taucad/runtime/kernel';
import type { KernelServices } from '@taucad/runtime/kernel';

import modelingPackage from '@jscad/modeling/package.json' with { type: 'json' };

import { jscadExportSchemas, jscadRenderSchema } from '#jscad.schemas.js';
import {
  createJscadTessellationBudgetExceededIssue,
  createJscadTessellationDowngradedIssue,
  createJscadTessellationReport,
  jscadDefaultSegments,
  jscadTriangleBudgets,
  meshWithinJscadBudget,
  resolveJscadTessellation,
  withDefaultSegments,
} from '#jscad-tessellation.js';

import { jscadToGltf } from '#jscad-to-gltf.js';
import { resolveJscadModeling } from '#jscad-modeling.js';
import type { JscadModeling } from '#jscad-modeling.js';
import { assignJscadPartName, isRenderableJscadPart, normalizeJscadParts } from '#jscad-parts.js';
import type { JscadPartDescriptor } from '#jscad-parts.js';

import { createEmptyGlb, resolveShapeName } from '@taucad/geometry-core';

import {
  convertParameterDefinitionsToDefaults,
  convertParameterDefinitionsToJsonSchema,
} from '#jscad-json-schema.utils.js';
import type { JscadParameterDefinition } from '#jscad-json-schema.utils.js';

// =============================================================================
// Types
// =============================================================================

type JscadSerializedNativeHandleEntry = {
  type: 'geom2' | 'geom3' | 'path2';
  data: Float32Array;
  name?: string;
};

type JscadSerializedNativeHandleType = JscadSerializedNativeHandleEntry['type'];

const isJscadSerializedNativeHandleType = (value: unknown): value is JscadSerializedNativeHandleType =>
  value === 'geom2' || value === 'geom3' || value === 'path2';

const isCallable = (value: unknown): value is (...args: unknown[]) => unknown => typeof value === 'function';

const isJscadParameterDefinition = (value: unknown): value is JscadParameterDefinition => {
  if (!isRecordObject(value) || typeof value['name'] !== 'string') {
    return false;
  }
  const { type } = value;
  if (
    type !== undefined &&
    type !== 'int' &&
    type !== 'float' &&
    type !== 'number' &&
    type !== 'text' &&
    type !== 'choice' &&
    type !== 'checkbox' &&
    type !== 'slider' &&
    type !== 'group'
  ) {
    return false;
  }
  return (
    (value['caption'] === undefined || typeof value['caption'] === 'string') &&
    (value['min'] === undefined || typeof value['min'] === 'number') &&
    (value['max'] === undefined || typeof value['max'] === 'number') &&
    (value['step'] === undefined || typeof value['step'] === 'number') &&
    (value['values'] === undefined || Array.isArray(value['values'])) &&
    (value['captions'] === undefined ||
      (Array.isArray(value['captions']) && value['captions'].every((caption) => typeof caption === 'string'))) &&
    (value['checked'] === undefined || typeof value['checked'] === 'boolean')
  );
};

const isArrayBuffer = (value: unknown): value is ArrayBuffer => value instanceof ArrayBuffer;

const describeSerializedPayload = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (ArrayBuffer.isView(value)) {
    return value.constructor.name;
  }
  if (isArrayBuffer(value)) {
    return 'ArrayBuffer';
  }
  return typeof value;
};

const parseSerializedNativeHandleEntry = (
  entry: unknown,
  index: number,
): { type: JscadSerializedNativeHandleType; data: unknown; name?: string } => {
  if (!isRecordObject(entry)) {
    throw new TypeError(`Invalid JSCAD serialized handle entry ${index}: expected an object.`);
  }

  const { type, data, name } = entry;
  if (!isJscadSerializedNativeHandleType(type)) {
    throw new TypeError(
      `Invalid JSCAD serialized handle entry ${index}: unsupported type ${JSON.stringify(type)}; expected geom2, geom3, or path2.`,
    );
  }

  return {
    type,
    data,
    ...(typeof name === 'string' ? { name } : {}),
  };
};

const normalizeCompactBinaryData = (options: {
  data: unknown;
  index: number;
  type: JscadSerializedNativeHandleType;
}): Float32Array => {
  const { data, index, type } = options;
  if (data instanceof Float32Array) {
    return data;
  }

  let bytes: Uint8Array<ArrayBuffer> | undefined;
  if (isArrayBuffer(data)) {
    bytes = new Uint8Array(data);
  } else if (ArrayBuffer.isView(data)) {
    const viewBytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    bytes = new Uint8Array(viewBytes.byteLength);
    bytes.set(viewBytes);
  }

  if (!bytes) {
    throw new TypeError(
      `Invalid JSCAD serialized handle compact binary at entry ${index} (${type}): expected Float32Array, ArrayBuffer, or ArrayBuffer view; got ${describeSerializedPayload(data)}.`,
    );
  }

  if (bytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new TypeError(
      `Invalid JSCAD serialized handle compact binary at entry ${index} (${type}): byte length ${bytes.byteLength} is not divisible by ${Float32Array.BYTES_PER_ELEMENT}.`,
    );
  }

  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Float32Array(copy.buffer);
};

// =============================================================================
// JSCAD submodule list
// =============================================================================

const jscadSubmodules = [
  'booleans',
  'colors',
  'curves',
  'expansions',
  'extrusions',
  'geometries',
  'hulls',
  'maths',
  'measurements',
  'modifiers',
  'primitives',
  'text',
  'transforms',
  'utils',
] as const;

/**
 * Canonical regex for detecting @jscad/modeling usage in source code.
 *
 * Branches: ESM import, CJS require.
 * @public
 */
export const jscadDetectPattern =
  /import\s+.*from\s+["']@jscad\/modeling(\/[^"']*)?["']|require\s*\(\s*["']@jscad\/modeling(\/[^"']*)?["']\s*\)/;

// =============================================================================
// Module registration helpers
// =============================================================================

function registerJscadModules(runtime: KernelServices, modeling: JscadModeling): void {
  registerKernelModule(runtime, {
    name: '@jscad/modeling',
    exports: modeling,
    package: modelingPackage,
    globalName: 'jscadModeling',
  });

  for (const subpath of jscadSubmodules) {
    if (isRecordObject(Reflect.get(modeling, subpath))) {
      registerKernelModule(runtime, {
        name: `@jscad/modeling/${subpath}`,
        exports: modeling,
        exportPath: subpath,
        package: modelingPackage,
      });
    }
  }
}

// =============================================================================
// Module execution helpers
// =============================================================================

async function runMain(
  module: Record<string, unknown>,
  parameters: Record<string, unknown>,
  modeling: JscadModeling,
): Promise<unknown> {
  const mainFunction = module['default'] ?? module['main'];
  if (!isCallable(mainFunction)) {
    return undefined;
  }

  if (mainFunction.length >= 2) {
    return mainFunction(modeling, parameters);
  }

  return mainFunction(parameters);
}

/**
 * When esbuild bundles CJS code (`module.exports = {...}`) to ESM format,
 * the exports are wrapped under `default` as an object. This unwraps them
 * so that named properties like `main` and `getParameterDefinitions` are
 * directly accessible.
 *
 * @param module - the raw module object returned by the bundler
 * @returns the unwrapped module exports with directly accessible named properties
 */
function resolveModule(module: unknown): Record<string, unknown> {
  if (!isRecordObject(module)) {
    return {};
  }
  const defaultExport = module['default'];
  return defaultExport && typeof defaultExport !== 'function' && isRecordObject(defaultExport) ? defaultExport : module;
}

// =============================================================================
// Tessellation re-runs
// =============================================================================

/** What re-running a model at another default segment count needs: its bundle and its parameters. */
type JscadProgram = { code: string; parameters: Record<string, unknown> };

/** Evaluated parts at JSCAD's own default segment count, and the program that rebuilds them at another. */
type JscadHandle = JscadPartDescriptor[] & { program?: JscadProgram };

/** The default segment count circular primitives read during the current run; `undefined` is JSCAD's own. */
let activeSegments: number | undefined;
let segmentsTail: Promise<void> = Promise.resolve();

/**
 * Run `operation` with `segments` active, after every earlier run in this realm has settled.
 *
 * @param segments - The default segment count to activate, or `undefined` for JSCAD's own.
 * @param operation - The model run.
 * @returns What the run returns.
 */
async function withSegments<Value>(segments: number | undefined, operation: () => Promise<Value>): Promise<Value> {
  const previous = segmentsTail;
  const done = Promise.withResolvers<void>();
  segmentsTail = done.promise;
  try {
    await previous;
    activeSegments = segments;
    return await operation();
  } finally {
    activeSegments = undefined;
    done.resolve();
  }
}

const parseSerializedProgram = (value: unknown): JscadProgram | undefined =>
  isRecordObject(value) && typeof value['code'] === 'string' && isRecordObject(value['parameters'])
    ? { code: value['code'], parameters: value['parameters'] }
    : undefined;

/**
 * The model's parts at a default segment count. JSCAD's own count is the evaluated handle; any other count runs the
 * bundle again, because a primitive's segments are fixed when it is built.
 *
 * @param input - The evaluated handle, its program, the segment count, the kernel services and the modeling API.
 * @returns The named parts at that count.
 */
async function partsAt(input: {
  handle: JscadHandle;
  program: JscadProgram;
  segments: number;
  runtime: KernelServices;
  modeling: JscadModeling;
}): Promise<JscadPartDescriptor[]> {
  const { handle, program, segments, runtime, modeling } = input;
  if (segments === jscadDefaultSegments) {
    return handle;
  }
  const executeResult = await runtime.execute(program.code);
  if (!executeResult.success) {
    throw new JscadBuildError(executeResult.issues);
  }
  const module = resolveModule(executeResult.value);
  let shapes: unknown;
  try {
    shapes = await withSegments(segments, async () => runMain(module, program.parameters, modeling));
  } catch (error) {
    throw new JscadBuildError([
      {
        message: error instanceof Error ? error.message : String(error),
        code: 'RUNTIME',
        type: 'runtime',
        severity: 'error',
      },
    ]);
  }
  return shapes === undefined ? [] : normalizeJscadParts(shapes, modeling);
}

// =============================================================================
// Kernel module definition
// =============================================================================

/** @public */
export const jscadKernel = defineKernel({
  id: 'jscad',
  extensions: ['ts', 'js'],
  detectImport: jscadDetectPattern,
  builtinModuleNames: ['@jscad/modeling'],
  builtinPackages: { '@jscad/modeling': modelingPackage },
  name: 'JscadKernel',
  version: '1.1.0',
  views: {
    model: {
      title: 'Model',
      mimeType: 'model/gltf-binary',
      optionsSchema: jscadRenderSchema,
      content: ['includeEdges'],
    },
  },
  // D2: in-worker CSG yields cooperatively, so a superseded drag render is abandoned, not killed.
  cancellation: 'cooperative',
  exports: {
    glb: {
      title: 'glTF binary',
      mimeType: 'model/gltf-binary',
      extension: 'glb',
      optionsSchema: jscadExportSchemas.glb,
      content: ['includeEdges'],
    },
  },

  async initialize(_options, runtime) {
    const resolved = resolveJscadModeling(await import('@jscad/modeling'));
    const primitives: unknown = Reflect.get(resolved, 'primitives');
    // Circular primitives without their own `segments` take the active default count of the current run.
    const authoring = isRecordObject(primitives)
      ? { ...resolved, primitives: withDefaultSegments(primitives, () => activeSegments) }
      : resolved;
    const modeling: JscadModeling = authoring;
    registerJscadModules(runtime, modeling);
    runtime.logger.debug('Initialized JSCAD kernel with @jscad/modeling');
    return { modulesRegistered: true, modeling };
  },

  async resolve({ entryPath }, runtime) {
    return runtime.bundler.resolveDependencies(entryPath);
  },

  async describe({ entryPath }, runtime) {
    const relativeFilePath = toVmEntryPath(entryPath);
    try {
      const bundleResult = await runtime.bundler.bundle(entryPath);
      if (!bundleResult.success) {
        return createKernelError(enrichIssueLocation(bundleResult.issues, relativeFilePath));
      }

      const executeResult = await runtime.execute(bundleResult.code);
      if (!executeResult.success) {
        return createKernelError(enrichIssueLocation(executeResult.issues, relativeFilePath));
      }

      const module = resolveModule(executeResult.value);
      let defaultParameters: Record<string, unknown> = {};
      let jsonSchema;

      const { getParameterDefinitions } = module;
      if (isCallable(getParameterDefinitions)) {
        const definitions = getParameterDefinitions();
        if (!Array.isArray(definitions) || !definitions.every((definition) => isJscadParameterDefinition(definition))) {
          throw new TypeError('JSCAD getParameterDefinitions() must return valid parameter definitions.');
        }
        defaultParameters = convertParameterDefinitionsToDefaults(definitions);
        jsonSchema = convertParameterDefinitionsToJsonSchema(definitions);
      } else if (isRecordObject(module['defaultParams'])) {
        defaultParameters = module['defaultParams'];
        jsonSchema = await jsonSchemaFromJson(defaultParameters);
      } else {
        defaultParameters = extractDefaultParameters(module);
        jsonSchema = await jsonSchemaFromJson(defaultParameters);
      }

      return createKernelSuccess({
        parameters: createKernelParameterDeclaration(defaultParameters, jsonSchema, {
          id: 'urn:taucad:jscad:parameters',
          name: 'JscadParameters',
        }),
      });
    } catch (error) {
      return createKernelError([
        {
          message: error instanceof Error ? error.message : 'Failed to extract parameters',
          code: 'RUNTIME',
          location: {
            fileName: relativeFilePath,
            startLineNumber: 1,
            startColumn: 1,
          },
          type: 'runtime',
          severity: 'error',
        },
      ]);
    }
  },

  async evaluate({ entryPath, parameters }, runtime, context) {
    const relativeFilePath = toVmEntryPath(entryPath);

    const bundleResult = await runtime.bundler.bundle(entryPath);
    if (!bundleResult.success) {
      throw new JscadBuildError(enrichIssueLocation(bundleResult.issues, relativeFilePath));
    }

    const executeResult = await runtime.execute(bundleResult.code);
    if (!executeResult.success) {
      throw new JscadBuildError(enrichIssueLocation(executeResult.issues, relativeFilePath));
    }

    const module = resolveModule(executeResult.value);

    let shapes: unknown;
    try {
      shapes = await withSegments(undefined, async () => runMain(module, parameters, context.modeling));
    } catch (error) {
      const stackFrames = parseStackTrace(error, {
        classifyFrame: createFrameClassifier(),
        sourceMap: bundleResult.sourceMap,
        resolveSourcePath,
        lastEntryName: executeResult.entryUrl,
      });
      const location = deriveLocationFromFrames(stackFrames, bundleResult.sourceMap, resolveSourcePath);
      throw new JscadBuildError([
        {
          message: error instanceof Error ? error.message : String(error),
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
          stackFrames,
          location,
        },
      ]);
    }

    if (shapes === undefined) {
      return { handle: [] };
    }

    const handle: JscadHandle = Object.assign(normalizeJscadParts(shapes, context.modeling), {
      program: { code: bundleResult.code, parameters },
    });
    return { handle };
  },

  async render({ handle, options, content }, runtime, context) {
    const includeEdges = content?.includeEdges === true;
    const started = performance.now();
    if (handle.program === undefined) {
      if (!handle.some((part) => isRenderableJscadPart(part, context.modeling))) {
        return { content: asBuffer(createEmptyGlb()) };
      }
      const gltf = jscadToGltf(handle, { includeEdges }, context.modeling);
      return { content: gltf.content, issues: gltf.issues };
    }
    const { program } = handle;
    const requested = resolveJscadTessellation(options.tessellation);
    const budget = jscadTriangleBudgets.preview;
    const { result, segments, downgraded } = await meshWithinJscadBudget({
      segments: requested.segments,
      budget,
      async mesh(count) {
        const parts = await partsAt({ handle, program, segments: count, runtime, modeling: context.modeling });
        if (!parts.some((part) => isRenderableJscadPart(part, context.modeling))) {
          return { content: asBuffer(createEmptyGlb()), issues: [], triangles: 0, vertices: 0 };
        }
        return jscadToGltf(parts, { includeEdges }, context.modeling);
      },
    });
    const tessellation = createJscadTessellationReport({
      requested,
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
            createJscadTessellationDowngradedIssue({
              requested,
              segments,
              downgraded,
              triangles: result.triangles,
              budget,
            }),
          ];
    return { content: result.content, tessellation, issues };
  },

  serializeHandle({ handle }, _runtime, context) {
    const { geom2, geom3, path2 } = context.modeling.geometries;
    const parts = normalizeJscadParts(handle, context.modeling);
    const entries = parts.map((part): JscadSerializedNativeHandleEntry => {
      const { shape } = part;
      if (geom3.isA(shape)) {
        return {
          type: 'geom3',
          data: geom3.toCompactBinary(shape),
          name: part.name,
        };
      }
      if (geom2.isA(shape)) {
        return {
          type: 'geom2',
          data: geom2.toCompactBinary(shape),
          name: part.name,
        };
      }
      if (path2.isA(shape)) {
        return {
          type: 'path2',
          data: path2.toCompactBinary(shape),
          name: part.name,
        };
      }
      throw new Error(`Unsupported JSCAD geometry type for serialized handle at index ${part.index}.`);
    });
    return handle.program === undefined ? entries : { parts: entries, program: { ...handle.program } };
  },

  deserializeHandle({ serialized }, _runtime, context): JscadHandle {
    const { geom2, geom3, path2 } = context.modeling.geometries;
    const withProgram = isRecordObject(serialized) && !Array.isArray(serialized) ? serialized : undefined;
    const rawEntries: unknown = withProgram ? withProgram.parts : serialized;
    if (!Array.isArray(rawEntries)) {
      throw new TypeError('Invalid JSCAD serialized handle: expected an array of compact-binary entries.');
    }

    const serializedEntries: unknown[] = rawEntries;
    const parts = serializedEntries.map((rawEntry, index): JscadPartDescriptor => {
      const entry = parseSerializedNativeHandleEntry(rawEntry, index);
      const compactBinary = normalizeCompactBinaryData({
        data: entry.data,
        index,
        type: entry.type,
      });
      const name = resolveShapeName({
        index,
        name: entry.name,
        source: 'authored',
      });
      let shape: unknown;
      switch (entry.type) {
        case 'geom2': {
          shape = geom2.fromCompactBinary(compactBinary);
          break;
        }
        case 'path2': {
          shape = path2.fromCompactBinary(compactBinary);
          break;
        }
        case 'geom3': {
          shape = geom3.fromCompactBinary(compactBinary);
          break;
        }
      }

      assignJscadPartName(shape, name);
      return {
        shape,
        name,
        index,
        sourceName: name,
      };
    });
    const program = parseSerializedProgram(withProgram?.program);
    return program === undefined ? parts : Object.assign(parts, { program });
  },

  async export(input, runtime, context) {
    const { exportId, handle, options, content } = input;

    switch (exportId) {
      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- exhaustive switch for future format expansion
      case 'glb': {
        if (handle.length === 0) {
          return { files: [createExportFile('glb', 'model.glb', asBuffer(createEmptyGlb()))] };
        }

        const { coordinateSystem, unit } = options;
        const requested = resolveJscadTessellation(options.tessellation);
        const parts =
          handle.program === undefined
            ? handle
            : await partsAt({
                handle,
                program: handle.program,
                segments: requested.segments,
                runtime,
                modeling: context.modeling,
              });
        if (!parts.some((part) => isRenderableJscadPart(part, context.modeling))) {
          return { files: [createExportFile('glb', 'model.glb', asBuffer(createEmptyGlb()))] };
        }

        const gltf = jscadToGltf(
          parts,
          {
            coordinateSystem,
            unit,
            includeEdges: content?.includeEdges === true,
          },
          context.modeling,
        );
        const budget = jscadTriangleBudgets.export;
        if (handle.program !== undefined && gltf.triangles > budget) {
          throw new JscadBuildError([
            createJscadTessellationBudgetExceededIssue({ requested, triangles: gltf.triangles, budget }),
          ]);
        }
        return { files: [createExportFile('glb', 'model.glb', asBuffer(gltf.content))], issues: gltf.issues };
      }

      default: {
        const _exhaustive: never = exportId;
        throw new Error(`Export format '${String(_exhaustive)}' is not supported by JSCAD. Supported formats: glb.`);
      }
    }
  },
});

class JscadBuildError extends Error {
  public readonly issues: KernelIssue[];
  public constructor(issues: KernelIssue[]) {
    super(issues.map((index) => index.message).join('; '));
    this.issues = issues;
  }
}
