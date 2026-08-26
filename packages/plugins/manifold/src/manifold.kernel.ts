/**
 * Manifold Kernel Module
 *
 * Integrates the Manifold WASM CAD kernel into Tau's kernel framework.
 * Uses runtime.bundler for JS/TS bundling and runtime.execute for module evaluation.
 * Registers manifold-3d modules as built-ins for user code imports.
 */

import { NodeIO } from '@gltf-transform/core';
import type { BaseGLTFNode } from 'manifold-3d/lib/gltf-node.js';

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
  createFrameClassifier,
  parseStackTrace,
  resolveSourcePath,
  deriveLocationFromFrames,
  finalizeRenderOutput,
} from '@taucad/runtime/kernel';
import type { KernelRuntime } from '@taucad/runtime/kernel';

import { manifoldOptionsSchema, manifoldExportSchemas } from '#manifold.schemas.js';

import { initManifoldWasm } from '#init-manifold.js';

import {
  transformGltfExportBytes,
  normalizeGltfGeometryNames,
  createEmptyGlb,
  createEmptyGltfGeometry,
} from '@taucad/geometry-core';

// =============================================================================
// Types
// =============================================================================

const manifoldModuleVersion = '3.4.1';

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

const isCallable = (value: unknown): value is (...arguments_: readonly unknown[]) => unknown =>
  typeof value === 'function';

async function registerManifoldModules(runtime: KernelRuntime): Promise<Record<string, unknown>> {
  const [manifoldRoot, manifoldCad, gltfNodeModule] = await Promise.all([
    import('manifold-3d'),
    import('manifold-3d/manifoldCAD'),
    import('manifold-3d/lib/gltf-node.js'),
  ]);

  // ManifoldCAD.js stubs GLTFNode (non-tracked) and getGLTFNodes (returns []).
  // These only work in manifold's own bundler which replaces the stubs.
  // Patch with tracked versions from gltf-node.js so side-effect patterns work.
  const patchedManifoldCad = {
    ...manifoldCad,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Manifold naming convention
    GLTFNode: gltfNodeModule.GLTFNodeTracked,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Manifold naming convention
    getGLTFNodes: gltfNodeModule.getGLTFNodes,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Manifold naming convention
    resetGLTFNodes: gltfNodeModule.resetGLTFNodes,
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

function resolveModule(module: unknown): Record<string, unknown> {
  if (!isRecordObject(module)) {
    return {};
  }
  const defaultExport = module['default'];
  // Only unwrap CJS-style wrappers where default.default or default.main is a function.
  // Don't unwrap geometry objects (Manifold, GLTFNode arrays, etc.) that happen to be records.
  if (
    defaultExport &&
    !isCallable(defaultExport) &&
    isRecordObject(defaultExport) &&
    (isCallable(defaultExport['default']) || isCallable(defaultExport['main']))
  ) {
    return defaultExport;
  }

  return module;
}

async function runMain(
  module: Record<string, unknown>,
  parameters: Record<string, unknown>,
  manifoldCadModule: Record<string, unknown>,
): Promise<unknown> {
  const defaultExport = module['default'] ?? module['main'];
  if (!defaultExport) {
    return undefined;
  }

  // Non-function default export (e.g. array of GLTFNode from getGLTFNodes(),
  // or a Manifold object built at module scope). Use it directly as geometry.
  if (!isCallable(defaultExport)) {
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
    import('manifold-3d/lib/garbage-collector.js'),
    import('manifold-3d/lib/scene-builder.js'),
    import('manifold-3d/lib/gltf-node.js'),
    import('manifold-3d/lib/level-of-detail.js'),
  ]);

  cleanupGarbageCollector();
  cleanupSceneBuilder();
  cleanupGltfNodes();
  cleanupLevelOfDetail();
}

async function createGlbFromManifoldOutput(output: unknown): Promise<Uint8Array<ArrayBuffer>> {
  const [gltfNodeImport, sceneBuilderImport, gltfIoImport] = await Promise.all([
    import('manifold-3d/lib/gltf-node.js'),
    import('manifold-3d/lib/scene-builder.js'),
    import('manifold-3d/lib/gltf-io.js'),
  ]);

  const toNodeList: unknown = gltfNodeImport.anyToGLTFNodeList;
  if (!isCallable(toNodeList)) {
    throw new TypeError('Manifold anyToGLTFNodeList export must be callable.');
  }
  const rawNodes: unknown = await toNodeList(output);
  if (
    !Array.isArray(rawNodes) ||
    !rawNodes.every((node): node is BaseGLTFNode => node instanceof gltfNodeImport.BaseGLTFNode)
  ) {
    throw new TypeError('Manifold anyToGLTFNodeList() must return glTF nodes.');
  }
  const nodes: BaseGLTFNode[] = rawNodes;
  if (nodes.length === 0) {
    throw new Error('No geometry was returned from the Manifold model.');
  }

  const { GLTFNodesToGLTFDoc: createGltfDocument } = sceneBuilderImport;
  const document = await createGltfDocument(nodes);
  const setupIo: unknown = gltfIoImport.setupIO;
  if (!isCallable(setupIo)) {
    throw new TypeError('Manifold setupIO export must be callable.');
  }
  const configuredIo: unknown = setupIo(new NodeIO());
  if (!isRecordObject(configuredIo) || !isCallable(configuredIo['writeBinary'])) {
    throw new TypeError('Manifold setupIO() must return a glTF IO instance.');
  }
  const bytes: unknown = await configuredIo['writeBinary'](document);
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('Manifold glTF writer must return Uint8Array bytes.');
  }
  return new Uint8Array(bytes);
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
export const manifoldKernel = defineKernel({
  id: 'manifold',
  extensions: ['ts', 'js'],
  detectImport: manifoldDetectPattern,
  builtinModuleNames: ['manifold-3d', 'manifold-3d/manifoldCAD'],
  name: 'ManifoldKernel',
  version: '1.0.0',
  optionsSchema: manifoldOptionsSchema,
  exportFormats: {
    glb: { optionsSchema: manifoldExportSchemas.glb },
  },

  async initialize(options, runtime) {
    initManifoldWasm(options.wasmUrl);
    const manifoldCadModule = await registerManifoldModules(runtime);
    runtime.logger.debug('Initialized Manifold kernel with manifold-3d modules');
    return { manifoldCadModule };
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

  async createGeometry({ entryPath, parameters }, runtime, context) {
    const relativeFilePath = toVmEntryPath(entryPath);

    await cleanupManifoldRuntime();

    const bundleResult = await runtime.bundler.bundle(entryPath);
    if (!bundleResult.success) {
      throw new ManifoldBuildError(enrichIssueLocation(bundleResult.issues, relativeFilePath));
    }

    const executeResult = await runtime.execute(bundleResult.code);
    if (!executeResult.success) {
      throw new ManifoldBuildError(enrichIssueLocation(executeResult.issues, relativeFilePath));
    }

    const module = resolveModule(executeResult.value);

    let model: unknown;
    try {
      model = await runMain(module, parameters, context.manifoldCadModule);
    } catch (error) {
      const stackFrames = parseStackTrace(error, {
        classifyFrame: createFrameClassifier(),
        sourceMap: bundleResult.sourceMap,
        resolveSourcePath,
        lastEntryName: executeResult.entryUrl,
      });
      const location = deriveLocationFromFrames(stackFrames, bundleResult.sourceMap, resolveSourcePath);
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
        classifyFrame: createFrameClassifier(),
        sourceMap: bundleResult.sourceMap,
        resolveSourcePath,
        lastEntryName: executeResult.entryUrl,
      });
      const location = deriveLocationFromFrames(stackFrames, bundleResult.sourceMap, resolveSourcePath);
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
            message: `Export format '${String(_exhaustive)}' is not supported by Manifold. Supported formats: glb.`,
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
