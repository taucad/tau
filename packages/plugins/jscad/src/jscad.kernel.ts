/**
 * JSCAD Kernel Module
 *
 * Full defineKernel implementation for the JSCAD kernel.
 * Uses runtime.bundler for JS/TS bundling and runtime.execute for evaluation.
 * Registers @jscad/modeling as a built-in module so user code can import it.
 */

import { createExportFile } from '@taucad/runtime/types';
import type { GeometryResponse, KernelIssue } from '@taucad/runtime/types';
import {
  asBuffer,
  jsonSchemaFromJson,
  defineKernel,
  createKernelModuleShim,
  createKernelModuleRegistryExpression,
  getModuleRegistry,
  isRecordObject,
  extractDefaultParameters,
  registerKernelModule,
  toVmEntryPath,
  enrichIssueLocation,
  createKernelError,
  createKernelSuccess,
  createFrameClassifier,
  parseStackTrace,
  resolveSourcePath,
  deriveLocationFromFrames,
  finalizeMeshOutput,
} from '@taucad/runtime/kernel';
import type { KernelRuntime } from '@taucad/runtime/kernel';

import { jscadExportSchemas } from '#jscad.schemas.js';

import { jscadToGltf } from '#jscad-to-gltf.js';
import { collectJscadPartIssues } from '#jscad-diagnostics.js';
import { resolveJscadModeling } from '#jscad-modeling.js';
import type { JscadModeling } from '#jscad-modeling.js';
import { assignJscadPartName, isRenderableJscadPart, normalizeJscadParts } from '#jscad-parts.js';
import type { JscadPartDescriptor } from '#jscad-parts.js';

import { createEmptyGlb, createEmptyGltfGeometry, resolveShapeName } from '@taucad/geometry-core';

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

function registerJscadModules(runtime: KernelRuntime, modeling: JscadModeling): void {
  registerKernelModule(runtime, {
    name: '@jscad/modeling',
    exports: modeling,
    version: '2.12.6',
    globalName: 'jscadModeling',
  });

  for (const subpath of jscadSubmodules) {
    const submoduleName = `@jscad/modeling/${subpath}`;
    const submoduleExports: unknown = Reflect.get(modeling, subpath);
    if (isRecordObject(submoduleExports)) {
      runtime.bundler.registerModule(submoduleName, {
        code: createKernelModuleShim({
          moduleExpression: `${createKernelModuleRegistryExpression('@jscad/modeling')}.${subpath}`,
          exports: submoduleExports,
        }),
        version: '2.12.6',
      });
    }
  }
}

// =============================================================================
// Module execution helpers
// =============================================================================

async function runMain(module: Record<string, unknown>, parameters: Record<string, unknown>): Promise<unknown> {
  const mainFunction = module['default'] ?? module['main'];
  if (!isCallable(mainFunction)) {
    return undefined;
  }

  if (mainFunction.length >= 2) {
    const registry = getModuleRegistry();
    const injectedModule = registry.values().next();
    return mainFunction(injectedModule.done ? undefined : injectedModule.value, parameters);
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
// Kernel module definition
// =============================================================================

/** @public */
export const jscadKernel = defineKernel({
  id: 'jscad',
  extensions: ['ts', 'js'],
  detectImport: jscadDetectPattern,
  builtinModuleNames: ['@jscad/modeling'],
  name: 'JscadKernel',
  version: '1.0.0',
  render: { content: ['includeEdges'] },
  exportFormats: {
    glb: { optionsSchema: jscadExportSchemas.glb, content: ['includeEdges'] },
  },

  async initialize(_options, runtime) {
    const modeling = resolveJscadModeling(await import('@jscad/modeling'));
    registerJscadModules(runtime, modeling);
    runtime.logger.debug('Initialized JSCAD kernel with @jscad/modeling');
    return { modulesRegistered: true, modeling };
  },

  async getDependencies({ entryPath }, runtime) {
    return runtime.bundler.resolveDependencies(entryPath);
  },

  async getParameters({ entryPath }, runtime) {
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

      return createKernelSuccess({ defaultParameters, jsonSchema });
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

  async createGeometry({ entryPath, parameters }, runtime, context) {
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
      shapes = await runMain(module, parameters);
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
      return { nativeHandle: [] };
    }

    const parts = normalizeJscadParts(shapes, context.modeling);
    const issues = collectJscadPartIssues(parts, context.modeling);

    return { nativeHandle: parts, issues };
  },

  async meshGeometry({ nativeHandle, content }, runtime, context) {
    const artifacts: GeometryResponse[] = [];
    const renderableParts = nativeHandle.filter((part) => isRenderableJscadPart(part, context.modeling));
    if (renderableParts.length > 0) {
      try {
        artifacts.push({
          format: 'gltf',
          content: jscadToGltf(renderableParts, { includeEdges: content?.includeEdges === true }, context.modeling),
        });
      } catch (error) {
        runtime.logger.warn('Failed to convert JSCAD assembly to GLTF', { data: error });
      }
    } else {
      artifacts.push(createEmptyGltfGeometry());
    }

    return finalizeMeshOutput({ artifacts });
  },

  serializeNativeHandle({ nativeHandle }, _runtime, context) {
    const { geom2, geom3, path2 } = context.modeling.geometries;
    const parts = normalizeJscadParts(nativeHandle, context.modeling);
    return parts.map((part): JscadSerializedNativeHandleEntry => {
      const { shape } = part;
      if (geom3.isA(shape)) {
        return { type: 'geom3', data: geom3.toCompactBinary(shape), name: part.name };
      }
      if (geom2.isA(shape)) {
        return { type: 'geom2', data: geom2.toCompactBinary(shape), name: part.name };
      }
      if (path2.isA(shape)) {
        return { type: 'path2', data: path2.toCompactBinary(shape), name: part.name };
      }
      throw new Error(`Unsupported JSCAD geometry type for serialized handle at index ${part.index}.`);
    });
  },

  deserializeNativeHandle({ serializedNativeHandle }, _runtime, context) {
    const { geom2, geom3, path2 } = context.modeling.geometries;
    if (!Array.isArray(serializedNativeHandle)) {
      throw new TypeError('Invalid JSCAD serialized handle: expected an array of compact-binary entries.');
    }

    const serializedEntries: unknown[] = serializedNativeHandle;
    return serializedEntries.map((rawEntry, index): JscadPartDescriptor => {
      const entry = parseSerializedNativeHandleEntry(rawEntry, index);
      const compactBinary = normalizeCompactBinaryData({ data: entry.data, index, type: entry.type });
      const name = resolveShapeName({ index, name: entry.name, source: 'authored' });
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
  },

  async exportGeometry(input, _runtime, context) {
    const { format, nativeHandle, options, content } = input;

    switch (format) {
      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- exhaustive switch for future format expansion
      case 'glb': {
        if (nativeHandle.length === 0) {
          return createKernelSuccess([createExportFile('glb', 'model.glb', asBuffer(createEmptyGlb()))]);
        }

        const { coordinateSystem, unit } = options;
        const renderableParts = nativeHandle.filter((part) => isRenderableJscadPart(part, context.modeling));
        const issues = collectJscadPartIssues(nativeHandle, context.modeling);
        if (renderableParts.length === 0) {
          return createKernelSuccess([createExportFile('glb', 'model.glb', asBuffer(createEmptyGlb()))], issues);
        }

        const gltfData = jscadToGltf(
          renderableParts,
          {
            coordinateSystem,
            unit,
            includeEdges: content?.includeEdges === true,
          },
          context.modeling,
        );
        return createKernelSuccess([createExportFile('glb', 'model.glb', asBuffer(gltfData))], issues);
      }

      default: {
        const _exhaustive: never = format;
        return createKernelError([
          {
            message: `Export format '${String(_exhaustive)}' is not supported by JSCAD. Supported formats: glb.`,
            code: 'KERNEL_CAPABILITY_MISSING',
            type: 'runtime',
            severity: 'error',
          },
        ]);
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
