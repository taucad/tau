/**
 * Manifold Kernel Module
 *
 * Integrates the Manifold WASM CAD kernel into Tau's kernel framework.
 * Uses runtime.bundler for JS/TS bundling and runtime.execute for module evaluation.
 * Registers manifold-3d modules as built-ins for user code imports.
 */

import { NodeIO } from '@gltf-transform/core';
import type { Document } from '@gltf-transform/core';
import { createExportFile } from '@taucad/types/constants';
import { asBuffer } from '@taucad/utils/file';
import { jsonSchemaFromJson } from '@taucad/utils/schema';
import type { KernelIssue } from '#types/runtime.types.js';
import type { KernelRuntime } from '#types/runtime-kernel.types.js';
import { defineKernel } from '#types/runtime-kernel.types.js';
import { manifoldOptionsSchema, manifoldExportSchemas } from '#kernels/manifold/manifold.schemas.js';
import {
  isRecordObject,
  extractDefaultParameters,
  registerKernelModule,
  resolveToRelative,
  enrichIssueLocation,
} from '#kernels/kernel-module-helpers.js';
import type { RuntimeModuleExports } from '#kernels/kernel-module-helpers.js';
import { createKernelError, createKernelSuccess } from '#kernels/kernel-helpers.js';
import { initManifoldWasm } from '#kernels/manifold/init-manifold.js';
import { parseStackTrace, resolveSourcePath, deriveLocationFromFrames } from '#framework/error-enrichment.js';
import { finalizeRenderOutput } from '#framework/render-artifact-finalizer.js';
import { transformGltfExportBytes } from '#utils/gltf-export-transform.js';
import { normalizeGltfGeometryNames } from '#utils/gltf-geometry-name-normalizer.js';
import { createEmptyGlb, createEmptyGltfGeometry } from '#utils/glb-writer.js';

// =============================================================================
// Types
// =============================================================================

type CleanupModule = {
  cleanup: () => void;
};

const manifoldModuleVersion = '3.3.2';

/**
 * Canonical regex for detecting manifold-3d usage in source code.
 *
 * Branches: ESM import, CJS require, dynamic import().
 * @public
 */
export const manifoldDetectPattern =
  /import\s+.*from\s+["']manifold-3d(?:\/[^"']*)?["']|require\s*\(\s*["']manifold-3d(?:\/[^"']*)?["']\s*\)|import\s*\(\s*["']manifold-3d(?:\/[^"']*)?["']\s*\)/;

// =============================================================================
// Module registration helpers
// =============================================================================

async function registerManifoldModules(runtime: KernelRuntime): Promise<Record<string, unknown>> {
  const [rootImport, manifoldCadImport, gltfNodeImport] = await Promise.all([
    import('manifold-3d'),
    import('manifold-3d/manifoldCAD'),
    import('manifold-3d/lib/gltf-node.js'),
  ]);
  const manifoldRoot = rootImport as Record<string, unknown>;
  const manifoldCad = manifoldCadImport as Record<string, unknown>;
  const gltfNodeModule = gltfNodeImport as Record<string, unknown>;

  // ManifoldCAD.js stubs GLTFNode (non-tracked) and getGLTFNodes (returns []).
  // These only work in manifold's own bundler which replaces the stubs.
  // Patch with tracked versions from gltf-node.js so side-effect patterns work.
  const patchedManifoldCad = {
    ...manifoldCad,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Manifold naming convention
    GLTFNode: gltfNodeModule['GLTFNodeTracked'],
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Manifold naming convention
    getGLTFNodes: gltfNodeModule['getGLTFNodes'],
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Manifold naming convention
    resetGLTFNodes: gltfNodeModule['resetGLTFNodes'],
  };

  registerKernelModule(runtime, {
    name: 'manifold-3d',
    exports: manifoldRoot,
    version: manifoldModuleVersion,
    globalName: 'manifold3d',
  });

  registerKernelModule(runtime, {
    name: 'manifold-3d/manifoldCAD',
    exports: patchedManifoldCad,
    version: manifoldModuleVersion,
    globalName: 'manifoldCAD',
  });

  return patchedManifoldCad;
}

// =============================================================================
// Module execution helpers
// =============================================================================

function resolveModule(module: unknown): RuntimeModuleExports {
  const module_ = module as RuntimeModuleExports;
  if (module_.default && typeof module_.default !== 'function' && isRecordObject(module_.default)) {
    const inner = module_.default as RuntimeModuleExports;
    // Only unwrap CJS-style wrappers where default.default or default.main is a function.
    // Don't unwrap geometry objects (Manifold, GLTFNode arrays, etc.) that happen to be records.
    if (typeof inner.default === 'function' || typeof inner.main === 'function') {
      return inner;
    }
  }

  return module_;
}

async function runMain(
  module: RuntimeModuleExports,
  parameters: Record<string, unknown>,
  manifoldCadModule: Record<string, unknown>,
): Promise<unknown> {
  const defaultExport = module.default ?? module.main;
  if (!defaultExport) {
    return undefined;
  }

  // Non-function default export (e.g. array of GLTFNode from getGLTFNodes(),
  // or a Manifold object built at module scope). Use it directly as geometry.
  if (typeof defaultExport !== 'function') {
    return defaultExport;
  }

  if (defaultExport.length >= 2) {
    return defaultExport(manifoldCadModule, parameters);
  }

  return defaultExport(parameters);
}

async function cleanupManifoldRuntime(): Promise<void> {
  const [
    { cleanup: cleanupGarbageCollector },
    { cleanup: cleanupSceneBuilder },
    { cleanup: cleanupGltfNodes },
    { cleanup: cleanupLevelOfDetail },
  ] = await Promise.all([
    import('manifold-3d/lib/garbage-collector.js') as Promise<CleanupModule>,
    import('manifold-3d/lib/scene-builder.js') as Promise<CleanupModule>,
    import('manifold-3d/lib/gltf-node.js') as Promise<CleanupModule>,
    import('manifold-3d/lib/level-of-detail.js') as Promise<CleanupModule>,
  ]);

  cleanupGarbageCollector();
  cleanupSceneBuilder();
  cleanupGltfNodes();
  cleanupLevelOfDetail();
}

function getRequiredFunction<CallableFunction extends (...args: never[]) => unknown>(
  maybeFunction: unknown,
  name: string,
): CallableFunction {
  if (typeof maybeFunction !== 'function') {
    throw new TypeError(`Expected '${name}' to be a function.`);
  }

  return maybeFunction as CallableFunction;
}

async function createGlbFromManifoldOutput(output: unknown): Promise<Uint8Array<ArrayBuffer>> {
  const [gltfNodeImport, sceneBuilderImport, gltfIoImport] = await Promise.all([
    import('manifold-3d/lib/gltf-node.js'),
    import('manifold-3d/lib/scene-builder.js'),
    import('manifold-3d/lib/gltf-io.js'),
  ]);

  const gltfNodeModule = gltfNodeImport as Record<string, unknown>;
  const sceneBuilderModule = sceneBuilderImport as Record<string, unknown>;
  const gltfIoModule = gltfIoImport as Record<string, unknown>;

  const toGltfNodeList = getRequiredFunction<(value: unknown) => Promise<unknown[]>>(
    gltfNodeModule['anyToGLTFNodeList'],
    'anyToGLTFNodeList',
  );
  const toGltfDocument = getRequiredFunction<(nodes: unknown[]) => Document>(
    sceneBuilderModule['GLTFNodesToGLTFDoc'],
    'GLTFNodesToGLTFDoc',
  );
  const configureIo = getRequiredFunction<(io: unknown) => NodeIO>(gltfIoModule['setupIO'], 'setupIO');

  const nodes = await toGltfNodeList(output);
  if (nodes.length === 0) {
    throw new Error('No geometry was returned from the Manifold model.');
  }

  const document = toGltfDocument(nodes);
  const io = configureIo(new NodeIO());
  return io.writeBinary(document);
}

/**
 * Configuration for the Manifold kernel, allowing custom WASM builds for benchmarking or CI.
 * @public
 */
export type ManifoldOptions = {
  /** Override the default Manifold WASM URL for custom builds or benchmarking. */
  wasmUrl?: string;
};

// =============================================================================
// Kernel module definition
// =============================================================================

/** @public */
export const manifold = defineKernel({
  id: 'manifold',
  extensions: ['ts', 'js'],
  detectImport: manifoldDetectPattern,
  builtinModuleNames: ['manifold-3d', 'manifold-3d/manifoldCAD'],
  name: 'ManifoldKernel',
  version: '1.0.0',
  optionsSchema: manifoldOptionsSchema,
  exportSchemas: manifoldExportSchemas,

  async initialize(options, runtime) {
    initManifoldWasm(options.wasmUrl);
    const manifoldCadModule = await registerManifoldModules(runtime);
    runtime.logger.debug('Initialized Manifold kernel with manifold-3d modules');
    return { manifoldCadModule };
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

      const rawModule = executeResult.value as RuntimeModuleExports;
      const module = resolveModule(rawModule);
      const defaultParameters = extractDefaultParameters(module);
      const jsonSchema = await jsonSchemaFromJson(defaultParameters);

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

  async createGeometry({ filePath, basePath, parameters }, runtime, context) {
    const relativeFilePath = resolveToRelative(filePath, basePath);

    await cleanupManifoldRuntime();

    const bundleResult = await runtime.bundler.bundle(filePath);
    if (!bundleResult.success) {
      throw new ManifoldBuildError(enrichIssueLocation(bundleResult.issues, relativeFilePath));
    }

    const executeResult = await runtime.execute(bundleResult.code);
    if (!executeResult.success) {
      throw new ManifoldBuildError(enrichIssueLocation(executeResult.issues, relativeFilePath));
    }

    const rawModule = executeResult.value as RuntimeModuleExports;
    const module = resolveModule(rawModule);

    let model: unknown;
    try {
      model = await runMain(module, parameters, context.manifoldCadModule);
    } catch (error) {
      const stackFrames = parseStackTrace(error, {
        sourceMap: bundleResult.sourceMap,
        resolveSourcePath: (sourcePath) => resolveSourcePath(sourcePath, basePath),
        lastEntryName: executeResult.entryUrl,
      });
      const location = deriveLocationFromFrames(stackFrames, bundleResult.sourceMap, (sourcePath) =>
        resolveSourcePath(sourcePath, basePath),
      );
      throw new ManifoldBuildError([
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

    if (model === undefined || (Array.isArray(model) && model.length === 0)) {
      await cleanupManifoldRuntime();
      runtime.logger.warn('createGeometry returning empty: main-returned-undefined', {
        data: { filePath: relativeFilePath },
      });
      const geometry = createEmptyGltfGeometry();
      return finalizeRenderOutput({ artifacts: [geometry], nativeHandle: { glb: geometry.content } });
    }

    try {
      const glb = await normalizeGltfGeometryNames(await createGlbFromManifoldOutput(model), {
        format: 'glb',
        rewriteLegacyGeneratedShapeNames: true,
        materialNamePolicy: 'clear-generated',
        materialNameSource: 'external-generated',
        sceneNamePolicy: 'clear-generated',
        sceneNameSource: 'external-generated',
      });
      return finalizeRenderOutput({ artifacts: [{ format: 'gltf', content: glb }], nativeHandle: { glb } });
    } catch (error) {
      const stackFrames = parseStackTrace(error, {
        sourceMap: bundleResult.sourceMap,
        resolveSourcePath: (sourcePath) => resolveSourcePath(sourcePath, basePath),
        lastEntryName: executeResult.entryUrl,
      });
      const location = deriveLocationFromFrames(stackFrames, bundleResult.sourceMap, (sourcePath) =>
        resolveSourcePath(sourcePath, basePath),
      );
      throw new ManifoldBuildError([
        {
          message: error instanceof Error ? error.message : String(error),
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
          stackFrames,
          location,
        },
      ]);
    } finally {
      await cleanupManifoldRuntime();
    }
  },

  async exportGeometry(input) {
    const { format, nativeHandle, options } = input;

    if (nativeHandle.glb.length === 0) {
      return createKernelSuccess([createExportFile('glb', 'model.glb', asBuffer(createEmptyGlb()))]);
    }

    switch (format) {
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- exhaustive switch
      case 'glb': {
        const transformedGlb = await transformGltfExportBytes(nativeHandle.glb, {
          format: 'glb',
          coordinateSystem: options.coordinateSystem,
          unit: options.unit,
        });
        const glb = await normalizeGltfGeometryNames(transformedGlb, {
          format: 'glb',
          rewriteLegacyGeneratedShapeNames: true,
          materialNamePolicy: 'clear-generated',
          materialNameSource: 'external-generated',
          sceneNamePolicy: 'clear-generated',
          sceneNameSource: 'external-generated',
        });
        return createKernelSuccess([createExportFile('glb', 'model.glb', asBuffer(glb))]);
      }

      default: {
        const _exhaustive: never = format;
        return createKernelError([
          {
            message: `Export format '${_exhaustive as string}' is not supported by Manifold. Supported formats: glb.`,
            code: 'KERNEL_CAPABILITY_MISSING',
            type: 'runtime',
            severity: 'error',
          },
        ]);
      }
    }
  },

  async cleanup() {
    await cleanupManifoldRuntime();
  },

  serializeNativeHandle({ nativeHandle }) {
    return { glb: new Uint8Array(nativeHandle.glb) };
  },

  deserializeNativeHandle({ serializedNativeHandle }) {
    return { glb: new Uint8Array(serializedNativeHandle.glb) };
  },
});

class ManifoldBuildError extends Error {
  public readonly issues: KernelIssue[];
  public constructor(issues: KernelIssue[]) {
    super(issues.map((issue) => issue.message).join('; '));
    this.issues = issues;
  }
}
