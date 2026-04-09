/**
 * Buerli (ClassCAD) Kernel Module
 *
 * Integrates the ClassCAD WASM CAD kernel via @buerli.io/classcad into
 * Tau's kernel framework. Uses the WASM variant exclusively — no WebSocket
 * connections. Requires a ClassCAD API key for WASM initialization.
 *
 * The kernel registers `@buerli.io/classcad` as a built-in module so that
 * user code can `import { ... } from '@buerli.io/classcad'` and access the
 * Solid, Part, Assembly, Sketch, and Curve APIs.
 */

import { jsonSchemaFromJson } from '@taucad/utils/schema';
import { createExportFile } from '@taucad/types/constants';
import { asBuffer } from '@taucad/utils/file';
import { z } from 'zod';
import type { KernelIssue } from '#types/runtime.types.js';
import type { KernelRuntime } from '#types/runtime-kernel.types.js';
import { defineKernel } from '#types/runtime-kernel.types.js';
import { createKernelError, createKernelSuccess } from '#kernels/kernel-helpers.js';
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

const kernelModulesKey = '__KERNEL_MODULES__';
const buerliModuleVersion = '1.0.1';

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

  const exportNames = Object.keys(exports).filter((key) => /^[$_a-z][\w$]*$/i.test(key) && key !== 'default');
  const namedExports = exportNames.map((key) => `export const ${key} = __mod.${key};`).join('\n');
  return `const __mod = globalThis.${kernelModulesKey}.get('${name}');\n${namedExports}\nexport default __mod;\n`;
}

async function registerBuerliModules(runtime: KernelRuntime): Promise<Record<string, unknown>> {
  const classcadModule = (await import('@buerli.io/classcad')) as Record<string, unknown>;

  runtime.bundler.registerModule('@buerli.io/classcad', {
    code: generateModuleShim('@buerli.io/classcad', classcadModule),
    version: buerliModuleVersion,
    globalName: 'buerliClasscad',
  });

  return classcadModule;
}

// =============================================================================
// Module execution helpers
// =============================================================================

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveModule(module: unknown): RuntimeModuleExports {
  const module_ = module as RuntimeModuleExports;
  if (module_.default && typeof module_.default !== 'function' && isRecordObject(module_.default)) {
    const inner = module_.default as RuntimeModuleExports;
    if (typeof inner.default === 'function' || typeof inner.main === 'function') {
      return inner;
    }
  }

  return module_;
}

function extractDefaultParameters(module: unknown): Record<string, unknown> {
  if (!isRecordObject(module)) {
    return {};
  }

  /* oxlint-disable @typescript-eslint/no-unnecessary-condition -- runtime guard for untyped module */
  return (
    (module['defaultParams'] as Record<string, unknown>) ??
    (module['defaultParameters'] as Record<string, unknown>) ??
    {}
  );
  /* oxlint-enable @typescript-eslint/no-unnecessary-condition -- end of runtime guard */
}

async function runMain(module: RuntimeModuleExports, parameters: Record<string, unknown>): Promise<unknown> {
  const defaultExport = module.default ?? module.main;
  if (!defaultExport) {
    return undefined;
  }

  if (typeof defaultExport !== 'function') {
    return defaultExport;
  }

  return defaultExport(parameters);
}

function enrichIssueLocation(issues: KernelIssue[], fallbackFileName: string): KernelIssue[] {
  return issues.map((issue) => ({
    ...issue,
    location: issue.location ?? {
      fileName: fallbackFileName,
      startLineNumber: 1,
      startColumn: 1,
    },
  }));
}

// =============================================================================
// Geometry conversion
// =============================================================================

/**
 * Buerli's `createBufferGeometry` returns Three.js BufferGeometry objects.
 * We extract the position attribute and convert to a minimal glTF binary.
 *
 * If user code returns raw Three.js geometry or mesh data, we serialize it
 * to a glTF/GLB via the available scene data.
 */
async function convertBuerliOutputToGlb(output: unknown): Promise<Uint8Array<ArrayBuffer>> {
  const { NodeIO, Document } = await import('@gltf-transform/core');

  const document = new Document();
  const scene = document.createScene('BuerliScene');
  const buffer = document.createBuffer('geometry');

  if (output instanceof ArrayBuffer || ArrayBuffer.isView(output)) {
    return new Uint8Array(output instanceof ArrayBuffer ? output : output.buffer) as Uint8Array<ArrayBuffer>;
  }

  if (isRecordObject(output) && 'toJSON' in output && typeof output['toJSON'] === 'function') {
    const json = output['toJSON']() as Record<string, unknown>;
    if (json['metadata'] && json['geometries']) {
      const geometries = json['geometries'] as Array<Record<string, unknown>>;
      for (const geom of geometries) {
        const positionAttr = (geom['data'] as Record<string, unknown>)?.['attributes'] as
          | Record<string, unknown>
          | undefined;
        if (positionAttr?.['position']) {
          const posData = positionAttr['position'] as Record<string, unknown>;
          const array = posData['array'] as number[];
          if (array?.length) {
            const positions = new Float32Array(array);
            const accessor = document.createAccessor('position').setArray(positions).setType('VEC3').setBuffer(buffer);
            const prim = document.createPrimitive().setAttribute('POSITION', accessor);
            const mesh = document.createMesh('buerli-mesh').addPrimitive(prim);
            const node = document.createNode('buerli-node').setMesh(mesh);
            scene.addChild(node);
          }
        }
      }
    }
  }

  if (Array.isArray(output)) {
    for (const item of output) {
      if (isRecordObject(item)) {
        const posArray = (item as Record<string, unknown>)['position'] as Float32Array | undefined;
        const indexArray = (item as Record<string, unknown>)['index'] as Uint32Array | undefined;
        if (posArray) {
          const accessor = document
            .createAccessor('position')
            .setArray(new Float32Array(posArray))
            .setType('VEC3')
            .setBuffer(buffer);
          const prim = document.createPrimitive().setAttribute('POSITION', accessor);
          if (indexArray) {
            const indexAccessor = document
              .createAccessor('index')
              .setArray(new Uint32Array(indexArray))
              .setType('SCALAR')
              .setBuffer(buffer);
            prim.setIndices(indexAccessor);
          }
          const mesh = document.createMesh('buerli-mesh').addPrimitive(prim);
          const node = document.createNode('buerli-node').setMesh(mesh);
          scene.addChild(node);
        }
      }
    }
  }

  const io = new NodeIO();
  return io.writeBinary(document);
}

// =============================================================================
// Options schema
// =============================================================================

/**
 * Configuration for the Buerli (ClassCAD) kernel.
 * Requires a ClassCAD WASM API key.
 * @public
 */
export type BuerliOptions = {
  /** ClassCAD WASM API key for license validation. */
  classcadKey: string;
};

const optionsSchema = z.object({
  classcadKey: z.string().min(1, 'ClassCAD WASM key is required'),
}) satisfies z.ZodType<BuerliOptions>;

// =============================================================================
// Kernel module definition
// =============================================================================

/** @public */
export default defineKernel({
  name: 'BuerliKernel',
  version: '1.0.0',
  optionsSchema,

  async initialize(options, runtime) {
    const classcadModule = await registerBuerliModules(runtime);

    const initFn = classcadModule['init'] as ((factory: (drawingId: unknown) => unknown) => void) | undefined;
    const WASMClientClass = classcadModule['WASMClient'] as
      | (new (drawingId: unknown, config: { classcadKey: string }) => unknown)
      | undefined;

    if (initFn && WASMClientClass) {
      initFn((drawingId: unknown) => new WASMClientClass(drawingId, { classcadKey: options.classcadKey }));
    }

    runtime.logger.debug('Initialized Buerli (ClassCAD) kernel with WASM client');
    return { classcadModule, classcadKey: options.classcadKey };
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

  async createGeometry({ filePath, basePath, parameters }, runtime, _context) {
    const relativeFilePath = resolveToRelative(filePath, basePath);

    const bundleResult = await runtime.bundler.bundle(filePath);
    if (!bundleResult.success) {
      throw new BuerliBuildError(enrichIssueLocation(bundleResult.issues, relativeFilePath));
    }

    const executeResult = await runtime.execute(bundleResult.code);
    if (!executeResult.success) {
      throw new BuerliBuildError(enrichIssueLocation(executeResult.issues, relativeFilePath));
    }

    const rawModule = executeResult.value as RuntimeModuleExports;
    const module = resolveModule(rawModule);

    let model: unknown;
    try {
      model = await runMain(module, parameters);
    } catch (error) {
      const stackFrames = parseStackTrace(error, {
        sourceMap: bundleResult.sourceMap,
        resolveSourcePath: (sourcePath) => resolveSourcePath(sourcePath, basePath),
      });
      const location = deriveLocationFromFrames(stackFrames, bundleResult.sourceMap, (sourcePath) =>
        resolveSourcePath(sourcePath, basePath),
      );
      throw new BuerliBuildError([
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
      return {
        geometry: [],
        nativeHandle: undefined,
        issues: [
          {
            message: 'main() did not return any geometry. Export a default function that returns ClassCAD geometry.',
            location: {
              fileName: relativeFilePath,
              startLineNumber: 1,
              startColumn: 1,
            },
            type: 'runtime',
            severity: 'warning',
          },
        ],
      };
    }

    try {
      const glb = await convertBuerliOutputToGlb(model);
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
      throw new BuerliBuildError([
        {
          message: error instanceof Error ? error.message : String(error),
          type: 'runtime',
          severity: 'error',
          stackFrames,
          location,
        },
      ]);
    }
  },

  async exportGeometry({ fileType, nativeHandle }) {
    if (!nativeHandle) {
      return createKernelError([
        {
          message: 'No geometry available for export.',
          type: 'runtime',
          severity: 'error',
        },
      ]);
    }

    if (fileType === 'glb' || fileType === 'gltf') {
      return createKernelSuccess([
        createExportFile(fileType, fileType === 'glb' ? 'model.glb' : 'model.gltf', asBuffer(nativeHandle.glb)),
      ]);
    }

    return createKernelError([
      {
        message: `Export format '${fileType}' is not implemented for Buerli. Only 'glb' and 'gltf' are supported.`,
        type: 'runtime',
        severity: 'error',
      },
    ]);
  },
});

class BuerliBuildError extends Error {
  public readonly issues: KernelIssue[];
  public constructor(issues: KernelIssue[]) {
    super(issues.map((issue) => issue.message).join('; '));
    this.issues = issues;
  }
}
