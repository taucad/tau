/**
 * JSCAD Kernel Module
 *
 * Full defineKernel implementation for the JSCAD kernel.
 * Uses runtime.bundler for JS/TS bundling and runtime.execute for evaluation.
 * Registers @jscad/modeling as a built-in module so user code can import it.
 */

import * as jscadModeling from '@jscad/modeling';
import type { GeometryResponse } from '@taucad/types';
import { asBuffer } from '@taucad/utils/file';
import { jsonSchemaFromJson } from '@taucad/utils/schema';
import { createExportFile } from '@taucad/types/constants';
import type { KernelRuntime } from '#types/runtime-kernel.types.js';
import { defineKernel } from '#types/runtime-kernel.types.js';
import { jscadExportSchemas } from '#kernels/jscad/jscad.schemas.js';
import {
  createKernelModuleShim,
  createKernelModuleRegistryExpression,
  getModuleRegistry,
  isRecordObject,
  extractDefaultParameters,
  registerKernelModule,
  resolveToRelative,
  enrichIssueLocation,
} from '#kernels/kernel-module-helpers.js';
import type { KernelIssue } from '#types/runtime.types.js';
import { createKernelError, createKernelSuccess } from '#kernels/kernel-helpers.js';
import { parseStackTrace, resolveSourcePath, deriveLocationFromFrames } from '#framework/error-enrichment.js';
import { finalizeRenderOutput } from '#framework/render-artifact-finalizer.js';
import { jscadToGltf } from '#kernels/jscad/jscad-to-gltf.js';
import { collectJscadPartIssues } from '#kernels/jscad/jscad-diagnostics.js';
import { resolveJscadModeling } from '#kernels/jscad/jscad-modeling.js';
import { assignJscadPartName, isRenderableJscadPart, normalizeJscadParts } from '#kernels/jscad/jscad-parts.js';
import type { JscadPartDescriptor } from '#kernels/jscad/jscad-parts.js';
import { createEmptyGlb, createEmptyGltfGeometry } from '#utils/glb-writer.js';
import { resolveShapeName } from '#utils/shape-names.js';

import type { JscadParameterDefinition } from '#kernels/jscad/jscad.schema.js';
import {
  convertParameterDefinitionsToDefaults,
  convertParameterDefinitionsToJsonSchema,
} from '#kernels/jscad/jscad.schema.js';

// =============================================================================
// Types
// =============================================================================

type JscadModuleExports = {
  getParameterDefinitions?: () => JscadParameterDefinition[];
  defaultParams?: Record<string, unknown>;
  default?: (...args: unknown[]) => unknown;
  main?: (...args: unknown[]) => unknown;
};

type JscadSerializedNativeHandleEntry = {
  type: 'geom2' | 'geom3' | 'path2';
  data: Float32Array;
  name?: string;
};

type JscadSerializedNativeHandleType = JscadSerializedNativeHandleEntry['type'];

const jscadSerializedNativeHandleTypes = new Set<JscadSerializedNativeHandleType>(['geom2', 'geom3', 'path2']);

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
  if (typeof type !== 'string' || !jscadSerializedNativeHandleTypes.has(type as JscadSerializedNativeHandleType)) {
    throw new TypeError(
      `Invalid JSCAD serialized handle entry ${index}: unsupported type ${JSON.stringify(type)}; expected geom2, geom3, or path2.`,
    );
  }

  return {
    type: type as JscadSerializedNativeHandleType,
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

function registerJscadModules(runtime: KernelRuntime): void {
  const exports = resolveJscadModeling(jscadModeling) as unknown as Record<string, unknown>;
  registerKernelModule(runtime, {
    name: '@jscad/modeling',
    exports,
    version: '2.12.6',
    globalName: 'jscadModeling',
  });

  for (const subpath of jscadSubmodules) {
    const submoduleName = `@jscad/modeling/${subpath}`;
    const submoduleExports = exports[subpath];
    if (submoduleExports && typeof submoduleExports === 'object') {
      const subRecord = submoduleExports as Record<string, unknown>;
      runtime.bundler.registerModule(submoduleName, {
        code: createKernelModuleShim({
          moduleExpression: `${createKernelModuleRegistryExpression('@jscad/modeling')}.${subpath}`,
          exports: subRecord,
        }),
        version: '2.12.6',
      });
    }
  }
}

// =============================================================================
// Module execution helpers
// =============================================================================

async function runMain(module: JscadModuleExports, parameters: Record<string, unknown>): Promise<unknown> {
  const mainFunction = module.default ?? module.main;
  if (!mainFunction || typeof mainFunction !== 'function') {
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
function resolveModule(module: unknown): JscadModuleExports {
  const module_ = module as JscadModuleExports;
  if (module_.default && typeof module_.default !== 'function' && isRecordObject(module_.default)) {
    return module_.default as JscadModuleExports;
  }

  return module_;
}

// =============================================================================
// Kernel module definition
// =============================================================================

/** @public */
export const jscad = defineKernel({
  id: 'jscad',
  extensions: ['ts', 'js'],
  detectImport: jscadDetectPattern,
  builtinModuleNames: ['@jscad/modeling'],
  name: 'JscadKernel',
  version: '1.0.0',
  exportSchemas: jscadExportSchemas,

  async initialize(_options, runtime) {
    registerJscadModules(runtime);
    runtime.logger.debug('Initialized JSCAD kernel with @jscad/modeling');
    return { modulesRegistered: true };
  },

  async getDependencies({ filePath }, runtime) {
    return runtime.bundler.resolveDependencies(filePath);
  },

  async getParameters({ filePath, basePath }, runtime) {
    const relativeFilePath = resolveToRelative(filePath, basePath);
    try {
      const bundleResult = await runtime.bundler.bundle(filePath);
      if (!bundleResult.success) {
        return createKernelError(enrichIssueLocation(bundleResult.issues, relativeFilePath));
      }

      const executeResult = await runtime.execute(bundleResult.code);
      if (!executeResult.success) {
        return createKernelError(enrichIssueLocation(executeResult.issues, relativeFilePath));
      }

      const rawModule = executeResult.value as JscadModuleExports;
      const module = resolveModule(rawModule);
      let defaultParameters: Record<string, unknown> = {};
      let jsonSchema;

      if (isRecordObject(module) && typeof module.getParameterDefinitions === 'function') {
        const definitions = module.getParameterDefinitions();
        defaultParameters = convertParameterDefinitionsToDefaults(definitions);
        jsonSchema = convertParameterDefinitionsToJsonSchema(definitions);
      } else if (isRecordObject(module) && module.defaultParams && isRecordObject(module.defaultParams)) {
        defaultParameters = module.defaultParams;
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

  async createGeometry({ filePath, basePath, parameters }, runtime) {
    const relativeFilePath = resolveToRelative(filePath, basePath);
    const { logger } = runtime;

    const bundleResult = await runtime.bundler.bundle(filePath);
    if (!bundleResult.success) {
      throw new JscadBuildError(enrichIssueLocation(bundleResult.issues, relativeFilePath));
    }

    const executeResult = await runtime.execute(bundleResult.code);
    if (!executeResult.success) {
      throw new JscadBuildError(enrichIssueLocation(executeResult.issues, relativeFilePath));
    }

    const rawModule = executeResult.value as JscadModuleExports;
    const module = resolveModule(rawModule);

    let shapes: unknown;
    try {
      shapes = await runMain(module, parameters);
    } catch (error) {
      const stackFrames = parseStackTrace(error, {
        sourceMap: bundleResult.sourceMap,
        resolveSourcePath: (s) => resolveSourcePath(s, basePath),
        lastEntryName: executeResult.entryUrl,
      });
      const location = deriveLocationFromFrames(stackFrames, bundleResult.sourceMap, (s) =>
        resolveSourcePath(s, basePath),
      );
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
      return finalizeRenderOutput({ artifacts: [createEmptyGltfGeometry()], nativeHandle: [] });
    }

    const parts = normalizeJscadParts(shapes);
    const issues = collectJscadPartIssues(parts);

    if (parts.length === 0) {
      return finalizeRenderOutput({ artifacts: [createEmptyGltfGeometry()], nativeHandle: [], issues });
    }

    const artifacts: GeometryResponse[] = [];
    const renderableParts = parts.filter((part) => isRenderableJscadPart(part));
    if (renderableParts.length > 0) {
      try {
        artifacts.push({ format: 'gltf', content: jscadToGltf(renderableParts) });
      } catch (error) {
        logger.warn('Failed to convert JSCAD assembly to GLTF', { data: error });
      }
    } else {
      artifacts.push(createEmptyGltfGeometry());
    }

    return finalizeRenderOutput({ artifacts, nativeHandle: parts, issues });
  },

  serializeNativeHandle({ nativeHandle }) {
    const { geom2, geom3, path2 } = resolveJscadModeling(jscadModeling).geometries;
    const parts = normalizeJscadParts(nativeHandle);
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

  deserializeNativeHandle({ serializedNativeHandle }) {
    const { geom2, geom3, path2 } = resolveJscadModeling(jscadModeling).geometries;
    if (!Array.isArray(serializedNativeHandle)) {
      throw new TypeError('Invalid JSCAD serialized handle: expected an array of compact-binary entries.');
    }

    return (serializedNativeHandle as readonly unknown[]).map((rawEntry, index): JscadPartDescriptor => {
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

  async exportGeometry(input, _runtime, _context) {
    const { format, nativeHandle, options } = input;

    switch (format) {
      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- exhaustive switch for future format expansion
      case 'glb': {
        if (nativeHandle.length === 0) {
          return createKernelSuccess([createExportFile('glb', 'model.glb', asBuffer(createEmptyGlb()))]);
        }

        const { coordinateSystem, unit } = options;
        const renderableParts = nativeHandle.filter((part) => isRenderableJscadPart(part));
        const issues = collectJscadPartIssues(nativeHandle);
        if (renderableParts.length === 0) {
          return createKernelSuccess([createExportFile('glb', 'model.glb', asBuffer(createEmptyGlb()))], issues);
        }

        const gltfData = jscadToGltf(renderableParts, { coordinateSystem, unit });
        return createKernelSuccess([createExportFile('glb', 'model.glb', asBuffer(gltfData))], issues);
      }

      default: {
        const _exhaustive: never = format;
        return createKernelError([
          {
            message: `Export format '${_exhaustive as string}' is not supported by JSCAD. Supported formats: glb.`,
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
