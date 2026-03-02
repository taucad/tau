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
import { z } from 'zod';
import type { KernelIssue } from '#types/kernel.types.js';
import type { KernelRuntime } from '#types/kernel-worker.types.js';
import { defineKernel } from '#types/kernel-worker.types.js';
import { createKernelError, createKernelSuccess } from '#framework/kernel-helpers.js';
import { initManifoldWasm } from '#kernels/manifold/init-manifold.js';
import { parseStackTrace, resolveSourcePath, deriveLocationFromFrames } from '#framework/error-enrichment.js';

// =============================================================================
// Types
// =============================================================================

type RuntimeModuleExports = {
  default?: (...args: unknown[]) => unknown;
  main?: (...args: unknown[]) => unknown;
  defaultParams?: Record<string, unknown>;
  defaultParameters?: Record<string, unknown>;
};

type CleanupModule = {
  cleanup: () => void;
};

const kernelModulesKey = '__KERNEL_MODULES__';
const manifoldModuleVersion = '3.3.2';

// =============================================================================
// Path helpers
// =============================================================================

function resolveToRelative(absolutePath: string, basePath: string): string {
  const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  if (absolutePath.startsWith(`${normalizedBase}/`)) {
    return absolutePath.slice(normalizedBase.length + 1);
  }

  return absolutePath;
}

// =============================================================================
// Module registration helpers
// =============================================================================

function getModuleRegistry(): Map<string, Record<string, unknown>> {
  let registry = (globalThis as Record<string, unknown>)[kernelModulesKey] as
    | Map<string, Record<string, unknown>>
    | undefined;
  if (!registry) {
    registry = new Map();
    (globalThis as Record<string, unknown>)[kernelModulesKey] = registry;
  }

  return registry;
}

function generateModuleShim(name: string, exports: Record<string, unknown>): string {
  const registry = getModuleRegistry();
  registry.set(name, exports);

  const exportNames = Object.keys(exports).filter((key) => /^[a-z_$][\w$]*$/i.test(key) && key !== 'default');
  const namedExports = exportNames.map((key) => `export const ${key} = __mod.${key};`).join('\n');
  return `const __mod = globalThis.${kernelModulesKey}.get('${name}');\n${namedExports}\nexport default __mod;\n`;
}

async function registerManifoldModules(runtime: KernelRuntime): Promise<Record<string, unknown>> {
  const [rootImport, manifoldCadImport, gltfNodeImport] = await Promise.all([
    import('manifold-3d'),
    import('manifold-3d/manifoldCAD'),
    import('manifold-3d/lib/gltf-node.js'),
  ]);
  const manifoldRoot = rootImport as unknown as Record<string, unknown>;
  const manifoldCad = manifoldCadImport as unknown as Record<string, unknown>;
  const gltfNodeModule = gltfNodeImport as unknown as Record<string, unknown>;

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

  runtime.bundler.registerModule('manifold-3d', {
    code: generateModuleShim('manifold-3d', manifoldRoot),
    version: manifoldModuleVersion,
    globalName: 'manifold3d',
  });

  runtime.bundler.registerModule('manifold-3d/manifoldCAD', {
    code: generateModuleShim('manifold-3d/manifoldCAD', patchedManifoldCad),
    version: manifoldModuleVersion,
    globalName: 'manifoldCAD',
  });

  return patchedManifoldCad;
}

// =============================================================================
// Module execution helpers
// =============================================================================

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveModule(module: unknown): RuntimeModuleExports {
  const mod = module as RuntimeModuleExports;
  if (mod.default && typeof mod.default !== 'function' && isRecordObject(mod.default)) {
    const inner = mod.default as RuntimeModuleExports;
    // Only unwrap CJS-style wrappers where default.default or default.main is a function.
    // Don't unwrap geometry objects (Manifold, GLTFNode arrays, etc.) that happen to be records.
    if (typeof inner.default === 'function' || typeof inner.main === 'function') {
      return inner;
    }
  }

  return mod;
}

function extractDefaultParameters(module: unknown): Record<string, unknown> {
  if (!isRecordObject(module)) {
    return {};
  }

  /* eslint-disable @typescript-eslint/no-unnecessary-condition -- runtime guard for untyped module */
  return (
    (module['defaultParams'] as Record<string, unknown>) ??
    (module['defaultParameters'] as Record<string, unknown>) ??
    {}
  );
  /* eslint-enable @typescript-eslint/no-unnecessary-condition -- end of runtime guard */
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

function getRequiredFunction<Fn extends (...arguments_: never[]) => unknown>(maybeFunction: unknown, name: string): Fn {
  if (typeof maybeFunction !== 'function') {
    throw new TypeError(`Expected '${name}' to be a function.`);
  }

  return maybeFunction as Fn;
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

function enrichIssueLocation(issues: KernelIssue[], fallbackFileName: string): KernelIssue[] {
  return issues.map((issue) => ({
    ...issue,
    location: issue.location ?? { fileName: fallbackFileName, startLineNumber: 1, startColumn: 1 },
  }));
}

// =============================================================================
// Options schema
// =============================================================================

/**
 * Manifold kernel options.
 */
export type ManifoldOptions = {
  /** Override the default Manifold WASM URL for custom builds or benchmarking. */
  wasmUrl?: string;
};

const optionsSchema = z.object({
  wasmUrl: z.string().optional(),
}) satisfies z.ZodType<ManifoldOptions>;

// =============================================================================
// Kernel module definition
// =============================================================================

export default defineKernel({
  name: 'ManifoldKernel',
  version: '1.0.0',
  optionsSchema,

  async initialize(options, runtime) {
    initManifoldWasm(options.wasmUrl);
    const manifoldCadModule = await registerManifoldModules(runtime);
    runtime.logger.debug('Initialized Manifold kernel with manifold-3d modules');
    return { manifoldCadModule };
  },

  async canHandle({ filePath, extension }, { filesystem }) {
    if (!['ts', 'js'].includes(extension)) {
      return false;
    }

    const code = await filesystem.readFile(filePath, 'utf8');
    const hasEsmImport = /import\s+.*from\s+['"]manifold-3d(?:\/[^'"]*)?['"]/.test(code);
    const hasRequire = /require\s*\(\s*['"]manifold-3d(?:\/[^'"]*)?['"]\s*\)/.test(code);
    const hasDynamicImport = /import\s*\(\s*['"]manifold-3d(?:\/[^'"]*)?['"]\s*\)/.test(code);
    return hasEsmImport || hasRequire || hasDynamicImport;
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
          location: { fileName: relativeFilePath, startLineNumber: 1, startColumn: 1 },
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
      });
      const location = deriveLocationFromFrames(stackFrames, bundleResult.sourceMap, (sourcePath) =>
        resolveSourcePath(sourcePath, basePath),
      );
      throw new ManifoldBuildError([
        {
          message: error instanceof Error ? error.message : String(error),
          type: 'runtime',
          severity: 'error',
          stackFrames,
          location,
        },
      ]);
    }

    if (model === undefined || (Array.isArray(model) && model.length === 0)) {
      await cleanupManifoldRuntime();
      return {
        geometry: [],
        nativeHandle: undefined,
        issues: [
          {
            message:
              'main() did not return any model. Export a Manifold object (or an array of Manifold/GLTFNode objects).',
            location: { fileName: relativeFilePath, startLineNumber: 1, startColumn: 1 },
            type: 'runtime',
            severity: 'warning',
          },
        ],
      };
    }

    try {
      const glb = await createGlbFromManifoldOutput(model);
      return {
        geometry: [{ format: 'gltf', content: glb }],
        nativeHandle: { glb },
      };
    } catch (error) {
      const stackFrames = parseStackTrace(error, {
        sourceMap: bundleResult.sourceMap,
        resolveSourcePath: (sourcePath) => resolveSourcePath(sourcePath, basePath),
      });
      const location = deriveLocationFromFrames(stackFrames, bundleResult.sourceMap, (sourcePath) =>
        resolveSourcePath(sourcePath, basePath),
      );
      throw new ManifoldBuildError([
        {
          message: error instanceof Error ? error.message : String(error),
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

  async exportGeometry({ fileType, nativeHandle }) {
    if (!nativeHandle) {
      return createKernelError([{ message: 'No geometry available for export.', type: 'runtime', severity: 'error' }]);
    }

    if (fileType === 'glb' || fileType === 'gltf') {
      return createKernelSuccess([
        createExportFile(fileType, fileType === 'glb' ? 'model.glb' : 'model.gltf', asBuffer(nativeHandle.glb)),
      ]);
    }

    return createKernelError([
      {
        message: `Export format '${fileType}' is not implemented for Manifold. Only 'glb' and 'gltf' are supported.`,
        type: 'runtime',
        severity: 'error',
      },
    ]);
  },

  async cleanup() {
    await cleanupManifoldRuntime();
  },
});

class ManifoldBuildError extends Error {
  public readonly issues: KernelIssue[];
  public constructor(issues: KernelIssue[]) {
    super(issues.map((issue) => issue.message).join('; '));
    this.issues = issues;
  }
}
