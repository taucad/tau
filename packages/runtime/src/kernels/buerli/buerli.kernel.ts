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

import type { Document as GltfDocument, Scene as GltfScene, Buffer as GltfBuffer } from '@gltf-transform/core';
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

type GltfDocumentContext = {
  document: GltfDocument;
  scene: GltfScene;
  buffer: GltfBuffer;
};

function extractPositionArray(geom: Record<string, unknown>): number[] | undefined {
  const geomData = geom['data'] as Record<string, unknown> | undefined;
  const attributes = geomData?.['attributes'] as Record<string, unknown> | undefined;
  if (!attributes?.['position']) {
    return undefined;
  }

  const posData = attributes['position'] as Record<string, unknown>;
  const array = posData['array'] as number[] | undefined;
  return array && array.length > 0 ? array : undefined;
}

function addPositionGeometry(context: GltfDocumentContext, positions: Float32Array, indices?: Uint32Array): void {
  const accessor = context.document
    .createAccessor('position')
    .setArray(positions)
    .setType('VEC3')
    .setBuffer(context.buffer);
  const primitive = context.document.createPrimitive().setAttribute('POSITION', accessor);
  if (indices) {
    const indexAccessor = context.document
      .createAccessor('index')
      .setArray(new Uint32Array(indices))
      .setType('SCALAR')
      .setBuffer(context.buffer);
    primitive.setIndices(indexAccessor);
  }

  const mesh = context.document.createMesh('buerli-mesh').addPrimitive(primitive);
  const node = context.document.createNode('buerli-node').setMesh(mesh);
  context.scene.addChild(node);
}

/**
 * Convert buerli output to GLB binary.
 *
 * Buerli's `createBufferGeometry` returns Three.js BufferGeometry objects.
 * We extract the position attribute and convert to a minimal glTF binary.
 * If user code returns raw ArrayBuffer/typed array data, it is passed through.
 *
 * @param output - geometry output from user's main() function
 * @returns GLB binary data
 */
async function convertBuerliOutputToGlb(output: unknown): Promise<Uint8Array<ArrayBuffer>> {
  if (output instanceof ArrayBuffer || ArrayBuffer.isView(output)) {
    return new Uint8Array(output instanceof ArrayBuffer ? output : output.buffer) as Uint8Array<ArrayBuffer>;
  }

  const gltfCore = await import('@gltf-transform/core');
  const document = new gltfCore.Document();
  const context: GltfDocumentContext = {
    document,
    scene: document.createScene('BuerliScene'),
    buffer: document.createBuffer('geometry'),
  };

  if (isRecordObject(output) && 'toJSON' in output && typeof output['toJSON'] === 'function') {
    const json = (output['toJSON'] as () => Record<string, unknown>)();
    const geometries = json['geometries'] as Array<Record<string, unknown>> | undefined;
    if (json['metadata'] && geometries) {
      for (const geom of geometries) {
        const array = extractPositionArray(geom);
        if (array) {
          addPositionGeometry(context, new Float32Array(array));
        }
      }
    }
  }

  if (Array.isArray(output)) {
    for (const item of output) {
      if (!isRecordObject(item)) {
        continue;
      }

      const posArray = item['position'] as Float32Array | undefined;
      if (!posArray) {
        continue;
      }

      const indexArray = item['index'] as Uint32Array | undefined;
      addPositionGeometry(context, new Float32Array(posArray), indexArray);
    }
  }

  const io = new gltfCore.NodeIO();
  return io.writeBinary(document);
}

// =============================================================================
// Options schema
// =============================================================================

/**
 * Configuration for the Buerli (ClassCAD) kernel.
 * The ClassCAD WASM API key is required for WASM engine initialization.
 * When omitted, the kernel registers modules but defers WASM init.
 * @public
 */
export type BuerliOptions = {
  /** ClassCAD WASM API key for license validation. */
  classcadKey?: string;
};

const optionsSchema = z.object({
  classcadKey: z.string().optional(),
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

    if (options.classcadKey) {
      const initFunction = classcadModule['init'] as ((factory: (drawingId: unknown) => unknown) => void) | undefined;
      // eslint-disable-next-line @typescript-eslint/naming-convention -- WASMClient is the upstream class name
      const WASMClient = classcadModule['WASMClient'] as
        | (new (drawingId: unknown, config: { classcadKey: string }) => unknown)
        | undefined;

      if (initFunction && WASMClient) {
        const key = options.classcadKey;
        initFunction((drawingId: unknown) => new WASMClient(drawingId, { classcadKey: key }));
      }

      runtime.logger.debug('Initialized Buerli (ClassCAD) kernel with WASM client');
    } else {
      runtime.logger.debug('Buerli kernel registered without WASM init (no classcadKey)');
    }

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
