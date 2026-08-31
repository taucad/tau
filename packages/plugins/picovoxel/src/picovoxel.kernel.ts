import type { Mesh, Pico, ToStlOptions, Voxels } from 'picovoxel';
import type * as PicovoxelModule from 'picovoxel';
import { createExportFile } from '@taucad/runtime/types';
import type { GeometryGltf, KernelIssue } from '@taucad/runtime/types';
import {
  asBuffer,
  createFrameClassifier,
  createKernelError,
  createKernelSuccess,
  defineKernel,
  deriveLocationFromFrames,
  enrichIssueLocation,
  extractDefaultParameters,
  finalizeMeshOutput,
  isRecordObject,
  jsonSchemaFromJson,
  parseStackTrace,
  registerKernelModule,
  resolveSourcePath,
  toVmEntryPath,
} from '@taucad/runtime/kernel';
import type { KernelRuntime, RuntimeLogger } from '@taucad/runtime/kernel';
import { detectMultiThreadSupport } from '@taucad/runtime/cross-origin-isolation';
import { resolveShapeName } from '@taucad/geometry-core';

import { picovoxelToGlb } from '#picovoxel.geometry.js';
import type { PicovoxelNativeHandle, PicovoxelShapeSnapshot } from '#picovoxel.geometry.js';
import { picovoxelExportSchemas, picovoxelOptionsSchema, picovoxelRenderSchema } from '#picovoxel.schemas.js';

const picovoxelVersion = '0.1.0';
const defaultVoxelSize = 0.5;

/** Built-in Picovoxel module specifiers supported by the Tau bundler. @public */
export const picovoxelBuiltinModuleNames = [
  'picovoxel',
  'picovoxel/latticelibrary',
  'picovoxel/numerics',
  'picovoxel/raw',
  'picovoxel/shapekernel',
  'picovoxel/slicing',
  'picovoxel/three',
  'picovoxel/multi',
] as const;

/** Detects ESM, CommonJS, and dynamic Picovoxel imports. @public */
export const picovoxelDetectPattern =
  /import\s+.*from\s+["']picovoxel(?:\/[^"']*)?["']|require\s*\(\s*["']picovoxel(?:\/[^"']*)?["']\s*\)|import\s*\(\s*["']picovoxel(?:\/[^"']*)?["']\s*\)/;

type PicovoxelRootModule = typeof PicovoxelModule;
type PicovoxelWasmVariant = 'serial' | 'multi';
/** Modules retained for Picovoxel render and export phases. @public */
export type PicovoxelContext = { readonly root: PicovoxelRootModule };

const resolvePicovoxelModule = async (
  wasm: 'auto' | PicovoxelWasmVariant,
  logger: RuntimeLogger,
): Promise<{ readonly root: PicovoxelRootModule; readonly variant: PicovoxelWasmVariant }> => {
  let variant: PicovoxelWasmVariant;
  if (wasm === 'auto') {
    const support = detectMultiThreadSupport();
    variant = support.supported ? 'multi' : 'serial';
    logger.log(`PicoVoxel WASM variant auto-selected: ${variant} (${support.reason})`);
  } else {
    variant = wasm;
  }

  if (variant === 'multi') {
    const support = detectMultiThreadSupport();
    if (!support.supported) {
      throw new Error(
        `PicoVoxel multi-threaded WASM is unavailable: ${support.reason}. Serve the browser with COOP/COEP headers or select "serial"/"auto".`,
      );
    }
    return { root: await import('picovoxel/multi'), variant };
  }

  return { root: await import('picovoxel'), variant };
};

const isCallable = (value: unknown): value is (...arguments_: readonly unknown[]) => unknown =>
  typeof value === 'function';

const resolveModule = (value: unknown): Record<string, unknown> => {
  if (!isRecordObject(value)) {
    return {};
  }
  const defaultExport = value['default'];
  return defaultExport && !isCallable(defaultExport) && isRecordObject(defaultExport) ? defaultExport : value;
};

const runMain = async (
  module: Record<string, unknown>,
  pico: Pico,
  parameters: Record<string, unknown>,
): Promise<unknown> => {
  const main = module['default'];
  if (!isCallable(main)) {
    throw new TypeError('Picovoxel source must default-export a main(pico, params) function.');
  }
  return main(pico, parameters);
};

const isMesh = (value: unknown): value is Mesh =>
  isRecordObject(value) &&
  value['vertices'] instanceof Float32Array &&
  value['triangles'] instanceof Uint32Array &&
  (value['lane'] === 'exact' || value['lane'] === 'fast');

const isVoxels = (value: unknown): value is Voxels =>
  isRecordObject(value) &&
  isCallable(value['toMesh']) &&
  typeof value['isEmpty'] === 'boolean' &&
  (value['lane'] === 'exact' || value['lane'] === 'fast');

const copyMesh = (mesh: Mesh, index: number): PicovoxelShapeSnapshot => {
  const vertices = new Float32Array(mesh.vertices);
  const triangles = new Uint32Array(mesh.triangles);
  if (vertices.length === 0 || triangles.length === 0) {
    throw new TypeError(`Picovoxel shape ${index + 1} is empty.`);
  }
  if (vertices.length % 3 !== 0 || triangles.length % 3 !== 0) {
    throw new TypeError(`Picovoxel shape ${index + 1} must contain vertex and triangle triples.`);
  }
  const vertexCount = vertices.length / 3;
  for (const vertexIndex of triangles) {
    if (vertexIndex >= vertexCount) {
      throw new TypeError(
        `Picovoxel shape ${index + 1} triangle index ${vertexIndex} is outside ${vertexCount} vertices.`,
      );
    }
  }
  return {
    name: resolveShapeName({ index, source: 'generated' }),
    vertices,
    triangles,
    lane: mesh.lane,
  };
};

const normalizeResult = (result: unknown): PicovoxelNativeHandle => {
  const values = Array.isArray(result) ? result : [result];
  if (values.length === 0) {
    throw new TypeError('Picovoxel main() returned an empty array; return Mesh, Voxels, or a non-empty flat array.');
  }
  const shapes = values.map((value, index) => {
    if (isMesh(value)) {
      return copyMesh(value, index);
    }
    if (isVoxels(value)) {
      if (value.isEmpty) {
        throw new TypeError(`Picovoxel shape ${index + 1} is an empty Voxels field.`);
      }
      return copyMesh(value.toMesh(), index);
    }
    throw new TypeError(
      `Picovoxel main() result ${index + 1} must be Mesh or Voxels; received ${
        value === null ? 'null' : Array.isArray(value) ? 'an array' : typeof value
      }.`,
    );
  });
  return { shapes };
};

const resolveVoxelSize = (parameters: Record<string, unknown>): number => {
  const voxelSize = parameters['voxelSize'] ?? defaultVoxelSize;
  if (typeof voxelSize !== 'number' || !Number.isFinite(voxelSize) || voxelSize <= 0) {
    const received = typeof voxelSize === 'number' ? String(voxelSize) : typeof voxelSize;
    throw new TypeError(`Picovoxel voxelSize must be a positive finite number; received ${received}.`);
  }
  return voxelSize;
};

const registerPicovoxelModules = async (
  runtime: KernelRuntime,
  root: PicovoxelRootModule,
  variant: PicovoxelWasmVariant,
): Promise<void> => {
  const [latticelibrary, numerics, raw, shapekernel, slicing, picovoxelThree, three] = await Promise.all([
    import('picovoxel/latticelibrary'),
    import('picovoxel/numerics'),
    import('picovoxel/raw'),
    import('picovoxel/shapekernel'),
    import('picovoxel/slicing'),
    import('picovoxel/three'),
    import('three'),
  ]);
  const modules = [root, latticelibrary, numerics, raw, shapekernel, slicing, picovoxelThree] as const;
  for (const [index, exports] of modules.entries()) {
    registerKernelModule(runtime, {
      name: picovoxelBuiltinModuleNames[index]!,
      exports,
      version: picovoxelVersion,
      globalName: `picovoxel${index}`,
    });
  }
  registerKernelModule(runtime, {
    name: 'three',
    exports: three,
    version: '0.184.0',
    globalName: 'picovoxelThreeDependency',
  });
  registerKernelModule(runtime, {
    name: 'picovoxel/multi',
    exports:
      variant === 'multi'
        ? root
        : {
            createPico: async () => {
              throw new Error(
                'picovoxel/multi is not active in this Tau Picovoxel kernel; configure the host with wasm: "multi" or use the injected main(pico, params) session.',
              );
            },
          },
    version: picovoxelVersion,
    globalName: variant === 'multi' ? 'picovoxelMulti' : 'picovoxelMultiUnsupported',
  });
};

const buildIssue = (
  error: unknown,
  options: {
    readonly sourceMap: Parameters<typeof deriveLocationFromFrames>[1];
    readonly entryUrl: string;
  },
): KernelIssue => {
  const stackFrames = parseStackTrace(error, {
    classifyFrame: createFrameClassifier(),
    sourceMap: options.sourceMap,
    resolveSourcePath,
    lastEntryName: options.entryUrl,
  });
  return {
    message: error instanceof Error ? error.message : String(error),
    code: 'RUNTIME',
    type: 'runtime',
    severity: 'error',
    stackFrames,
    location: deriveLocationFromFrames(stackFrames, options.sourceMap, resolveSourcePath),
  };
};

const parseSerializedShape = (value: unknown, index: number): PicovoxelShapeSnapshot => {
  if (!isRecordObject(value)) {
    throw new TypeError(`Invalid Picovoxel serialized shape ${index}: expected an object.`);
  }
  const { name, vertices, triangles, lane } = value;
  if (
    typeof name !== 'string' ||
    !(vertices instanceof Float32Array) ||
    !(triangles instanceof Uint32Array) ||
    (lane !== 'exact' && lane !== 'fast')
  ) {
    throw new TypeError(
      `Invalid Picovoxel serialized shape ${index}: expected name, Float32Array vertices, Uint32Array triangles, and exact/fast lane.`,
    );
  }
  return {
    name,
    vertices: new Float32Array(vertices),
    triangles: new Uint32Array(triangles),
    lane,
  };
};

class PicovoxelBuildError extends Error {
  public readonly issues: readonly KernelIssue[];

  public constructor(issues: readonly KernelIssue[]) {
    super(issues.map((issue) => issue.message).join('; '));
    this.issues = issues;
  }
}

/** Picovoxel serial WASM kernel capability. @public */
export const picovoxelKernel = defineKernel({
  id: 'picovoxel',
  extensions: ['ts', 'js'],
  detectImport: picovoxelDetectPattern,
  builtinModuleNames: [...picovoxelBuiltinModuleNames, 'three'],
  name: 'PicovoxelKernel',
  version: '1.0.0',
  optionsSchema: picovoxelOptionsSchema,
  createOptionsSchema: picovoxelRenderSchema,
  render: { optionsSchema: picovoxelRenderSchema, content: ['includeEdges'] },
  exportFormats: {
    glb: { optionsSchema: picovoxelExportSchemas.glb, content: ['includeEdges'] },
    stl: { optionsSchema: picovoxelExportSchemas.stl },
  },

  async initialize(options, runtime): Promise<PicovoxelContext> {
    const { root, variant } = await resolvePicovoxelModule(options.wasm, runtime.logger);
    await registerPicovoxelModules(runtime, root, variant);
    runtime.logger.debug(`Initialized Picovoxel ${variant} kernel`);
    return { root };
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
      const defaultParameters = extractDefaultParameters(resolveModule(executeResult.value));
      return createKernelSuccess({
        defaultParameters,
        jsonSchema: await jsonSchemaFromJson(defaultParameters),
      });
    } catch (error) {
      return createKernelError([
        {
          message: error instanceof Error ? error.message : 'Failed to extract Picovoxel parameters.',
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
          location: { fileName: relativeFilePath, startLineNumber: 1, startColumn: 1 },
        },
      ]);
    }
  },

  async createGeometry({ entryPath, parameters, options }, runtime, context) {
    const relativeFilePath = toVmEntryPath(entryPath);
    const bundleResult = await runtime.bundler.bundle(entryPath);
    if (!bundleResult.success) {
      throw new PicovoxelBuildError(enrichIssueLocation(bundleResult.issues, relativeFilePath));
    }
    const executeResult = await runtime.execute(bundleResult.code);
    if (!executeResult.success) {
      throw new PicovoxelBuildError(enrichIssueLocation(executeResult.issues, relativeFilePath));
    }

    let pico: Pico | undefined;
    try {
      pico = await context.root.createPico({
        voxelSize: resolveVoxelSize(parameters),
        lane: options.lane,
        fastRenorm: options.fastRenorm,
        serialLattice: options.serialLattice,
      });
      const result = await runMain(resolveModule(executeResult.value), pico, parameters);
      return { nativeHandle: normalizeResult(result) };
    } catch (error) {
      throw new PicovoxelBuildError([
        buildIssue(error, {
          sourceMap: bundleResult.sourceMap,
          entryUrl: executeResult.entryUrl ?? relativeFilePath,
        }),
      ]);
    } finally {
      pico?.dispose();
    }
  },

  async meshGeometry({ nativeHandle, content }) {
    const geometry: GeometryGltf = {
      format: 'gltf',
      content: picovoxelToGlb(nativeHandle, { includeEdges: content?.includeEdges === true }),
    };
    return finalizeMeshOutput({ artifacts: [geometry] });
  },

  serializeNativeHandle({ nativeHandle }) {
    return {
      shapes: nativeHandle.shapes.map((shape) => ({
        ...shape,
        vertices: new Float32Array(shape.vertices),
        triangles: new Uint32Array(shape.triangles),
      })),
    };
  },

  deserializeNativeHandle({ serializedNativeHandle }) {
    if (!isRecordObject(serializedNativeHandle) || !Array.isArray(serializedNativeHandle.shapes)) {
      throw new TypeError('Invalid Picovoxel serialized handle: expected a shapes array.');
    }
    return { shapes: serializedNativeHandle.shapes.map(parseSerializedShape) };
  },

  async exportGeometry(input, _runtime, context) {
    switch (input.format) {
      case 'glb': {
        const bytes = picovoxelToGlb(input.nativeHandle, {
          coordinateSystem: input.options.coordinateSystem,
          unit: input.options.unit,
          includeEdges: input.content?.includeEdges === true,
        });
        return createKernelSuccess([createExportFile('glb', 'model.glb', asBuffer(bytes))]);
      }
      case 'stl': {
        const fastShape = input.nativeHandle.shapes.find((shape) => shape.lane === 'fast');
        if (fastShape && input.options.acceptLane !== 'fast') {
          return createKernelError([
            {
              message:
                `STL export contains fast-lane geometry (${fastShape.name}). ` +
                "Acknowledge it with acceptLane: 'fast' or render in the exact lane.",
              code: 'RUNTIME',
              type: 'runtime',
              severity: 'error',
            },
          ]);
        }
        const stlOptions: ToStlOptions = {
          unit: input.options.unit,
          scale: input.options.scale,
          offset: input.options.offset,
          ...(input.options.acceptLane ? { acceptLane: input.options.acceptLane } : {}),
        };
        return createKernelSuccess(
          input.nativeHandle.shapes.map((shape) =>
            createExportFile(
              'stl',
              `${shape.name}.stl`,
              asBuffer(
                Uint8Array.from(
                  context.root.meshToStlBytes(
                    shape.vertices,
                    shape.triangles,
                    stlOptions,
                    shape.lane === 'fast' ? 'fast' : undefined,
                  ),
                ),
              ),
            ),
          ),
        );
      }
      default: {
        const exhaustive: never = input;
        return createKernelError([
          {
            message: `Unsupported Picovoxel export format: ${String(exhaustive)}.`,
            code: 'KERNEL_CAPABILITY_MISSING',
            type: 'runtime',
            severity: 'error',
          },
        ]);
      }
    }
  },
});
