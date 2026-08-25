/**
 * Native OpenCascade kernel.
 *
 * The model API is the curated facade (`createSolid.*`, `boolean`, `fuseAll`,
 * `mesh`, `toGlb`, `readStep`, ...), not OCCT's own 4,496-symbol class model:
 * a native package cannot serve raw-OCCT-in-JavaScript without rebuilding
 * embind through N-API, which the S2 spike priced and rejected. Users who need
 * the raw class model register `@taucad/opencascade` instead — and this package
 * never appears in that one's dependency graph (payload isolation).
 */

import {
  asBuffer,
  createKernelError,
  createKernelSuccess,
  defineKernel,
  extractDefaultParameters,
  finalizeRenderOutput,
  isRecordObject,
  jsonSchemaFromJson,
  enrichIssueLocation,
  registerKernelModule,
  toVmEntryPath,
} from '@taucad/runtime/kernel';
import type { KernelIssue } from '@taucad/runtime/kernel';
import { createExportFile } from '@taucad/runtime/types';
import { createEmptyGlb, createEmptyGltfGeometry } from '@taucad/geometry-core';

// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-import self-reference resolves this package's source alias.
import { loadNativeBackend } from '#opencascade-native-backend.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-import self-reference resolves this package's source alias.
import type { NativeBinding, NativeSolid, NativeTessellation } from '#opencascade-native-backend.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-import self-reference resolves this package's source alias.
import {
  opencascadeNativeExportSchemas,
  opencascadeNativeOptionsSchema,
  opencascadeNativeRenderSchema,
} from '#opencascade-native.schemas.js';

/** Module specifier the model imports to reach the facade. @public */
export const opencascadeNativeModuleName = '@taucad/opencascade-native';

/**
 * Canonical regex for detecting native OpenCascade usage in source code.
 * @public
 */
export const opencascadeNativeDetectPattern =
  /import\s+.*from\s+["']@taucad\/opencascade-native["']|require\s*\(\s*["']@taucad\/opencascade-native["']\s*\)|import\s*\(\s*["']@taucad\/opencascade-native["']\s*\)/;

const isCallable = (value: unknown): value is (...arguments_: readonly unknown[]) => unknown =>
  typeof value === 'function';

/**
 * The facade as the model sees it. `createSolid` is the grouped primitive
 * namespace from the S2 design; everything else is passed through unchanged.
 * @public
 */
export type OpencascadeNativeModule = Omit<NativeBinding, 'Solid'> & {
  createSolid: {
    box: NativeBinding['Solid']['createBox'];
    cylinder: NativeBinding['Solid']['createCylinder'];
    sphere: NativeBinding['Solid']['createSphere'];
    cone: NativeBinding['Solid']['createCone'];
    torus: NativeBinding['Solid']['createTorus'];
  };
};

/**
 * Group the class factories into the `createSolid` namespace.
 *
 * The factories are bound: a napi-rs `#[napi(factory)]` is a static method that
 * reads its class off the receiver, so a bare `Solid.createBox` reference fails
 * with "Failed to create instance of class".
 * @param binding - The loaded native addon.
 * @returns The facade as the model sees it.
 * @public
 */
export const toModelApi = (binding: NativeBinding): OpencascadeNativeModule => {
  const { Solid: solidFactories, ...rest } = binding;
  return {
    ...rest,
    createSolid: {
      box: solidFactories.createBox.bind(solidFactories),
      cylinder: solidFactories.createCylinder.bind(solidFactories),
      sphere: solidFactories.createSphere.bind(solidFactories),
      cone: solidFactories.createCone.bind(solidFactories),
      torus: solidFactories.createTorus.bind(solidFactories),
    },
  };
};

const isSolid = (value: unknown): value is NativeSolid =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'metrics') === 'function';

/**
 * Accept one solid, an array of solids, or nothing.
 * @param value - Whatever the model's `main` returned.
 * @returns Only the values that are native solids.
 * @public
 */
export const normalizeSolids = (value: unknown): NativeSolid[] => {
  if (isSolid(value)) {
    return [value];
  }
  return Array.isArray(value) ? value.filter((entry) => isSolid(entry)) : [];
};

const tessellationOf = (options: {
  tessellation: { linearTolerance: number; angularTolerance: number };
}): NativeTessellation => ({
  deflectionLinear: options.tessellation.linearTolerance,
  deflectionAngular: options.tessellation.angularTolerance * (Math.PI / 180),
  relativeLinear: false,
});

class OpencascadeNativeBuildError extends Error {
  public readonly issues: KernelIssue[];
  public constructor(issues: KernelIssue[]) {
    super(issues.map((issue) => issue.message).join('; '));
    this.issues = issues;
    this.name = 'OpencascadeNativeBuildError';
  }
}

const runtimeIssue = (error: unknown, fileName: string): KernelIssue[] => [
  {
    message: error instanceof Error ? error.message : String(error),
    code: 'RUNTIME',
    type: 'runtime',
    severity: 'error',
    location: { fileName, startLineNumber: 1, startColumn: 1 },
  },
];

/** `opencascade-native` kernel capability. @public */
export const opencascadeNativeKernel = defineKernel({
  id: 'opencascade-native',
  extensions: ['ts', 'js'],
  detectImport: opencascadeNativeDetectPattern,
  builtinModuleNames: [opencascadeNativeModuleName],
  name: 'OpenCascadeNativeKernel',
  version: '0.1.0',
  optionsSchema: opencascadeNativeOptionsSchema,
  render: { optionsSchema: opencascadeNativeRenderSchema },
  exportFormats: {
    glb: { optionsSchema: opencascadeNativeExportSchemas.glb },
    step: { optionsSchema: opencascadeNativeExportSchemas.step },
  },

  async initialize(_options, runtime) {
    // Loading is lazy per worker and never happens in `describe()`: the first
    // `dlopen` of a freshly built artifact costs 0.36-1.03 s on macOS, and
    // ~1.9 ms once the code-directory hash is cached.
    const binding = loadNativeBackend();
    const version = binding.version();
    registerKernelModule(runtime, {
      name: opencascadeNativeModuleName,
      exports: toModelApi(binding),
      version: version.package,
      globalName: 'opencascadeNative',
    });
    runtime.logger.debug(`Initialized native OpenCascade kernel (OCCT ${version.occt})`);
    return { binding, version };
  },

  async getDependencies({ entryPath }, runtime) {
    return runtime.bundler.resolveDependencies(entryPath);
  },

  async getParameters({ entryPath }, runtime) {
    const fileName = toVmEntryPath(entryPath);
    const bundleResult = await runtime.bundler.bundle(entryPath);
    if (!bundleResult.success) {
      return createKernelError(enrichIssueLocation(bundleResult.issues, fileName));
    }

    const executeResult = await runtime.execute(bundleResult.code);
    if (!executeResult.success) {
      return createKernelError(enrichIssueLocation(executeResult.issues, fileName));
    }

    const defaultParameters = extractDefaultParameters(executeResult.value);
    return createKernelSuccess({ defaultParameters, jsonSchema: await jsonSchemaFromJson(defaultParameters) });
  },

  async createGeometry({ entryPath, parameters }, runtime, context) {
    const fileName = toVmEntryPath(entryPath);

    const bundleResult = await runtime.bundler.bundle(entryPath);
    if (!bundleResult.success) {
      throw new OpencascadeNativeBuildError(enrichIssueLocation(bundleResult.issues, fileName));
    }

    const executeResult = await runtime.execute(bundleResult.code);
    if (!executeResult.success) {
      throw new OpencascadeNativeBuildError(enrichIssueLocation(executeResult.issues, fileName));
    }

    const module = executeResult.value;
    const main = isRecordObject(module) ? (module['default'] ?? module['main']) : undefined;
    if (!isCallable(main)) {
      runtime.logger.warn('createGeometry returning empty: main-function-not-found', { data: { filePath: fileName } });
      return finalizeRenderOutput({ artifacts: [createEmptyGltfGeometry()], nativeHandle: [] });
    }

    try {
      // Tessellation is deferred to `meshGeometry`: a STEP-only export must
      // never pay for a display mesh.
      return { nativeHandle: normalizeSolids(await main(toModelApi(context.binding), parameters)) };
    } catch (error) {
      throw new OpencascadeNativeBuildError(runtimeIssue(error, fileName));
    }
  },

  async meshGeometry({ nativeHandle, options }, _runtime, context) {
    if (nativeHandle.length === 0) {
      return { geometry: createEmptyGltfGeometry() };
    }
    // One crossing: tessellate and encode the whole batch inside the addon.
    const content = context.binding.toGlb(nativeHandle, tessellationOf(options));
    return { geometry: { format: 'gltf', content: new Uint8Array(content) } };
  },

  async exportGeometry({ format, nativeHandle, options }, _runtime, context) {
    switch (format) {
      case 'glb': {
        // An empty render is a successful artifact with no scene nodes, not a
        // failure.
        const glb =
          nativeHandle.length === 0
            ? createEmptyGlb()
            : new Uint8Array(context.binding.toGlb(nativeHandle, tessellationOf(options)));
        return createKernelSuccess([createExportFile('glb', 'model.glb', asBuffer(glb))]);
      }

      case 'step': {
        if (nativeHandle.length === 0) {
          return createKernelError([
            { message: 'No geometry available for STEP export', code: 'RUNTIME', type: 'runtime', severity: 'error' },
          ]);
        }
        // BRep formats never tessellate.
        const step = context.binding.writeStep(nativeHandle);
        return createKernelSuccess([createExportFile('step', 'assembly', asBuffer(new Uint8Array(step)))]);
      }

      default: {
        const exhaustive: never = format;
        return createKernelError([
          {
            message: `Export format '${String(exhaustive)}' is not supported by the native OpenCascade kernel. Supported formats: glb, step.`,
            code: 'KERNEL_CAPABILITY_MISSING',
            type: 'runtime',
            severity: 'error',
          },
        ]);
      }
    }
  },

  // BRep is the byte-stable interchange (no timestamp header), so a
  // serialize/deserialize round trip is fingerprint-comparable.
  serializeNativeHandle({ nativeHandle }, _runtime, context) {
    // An empty render still has to serialize: `writeBrep` needs at least one
    // solid, so the empty case is an empty payload, not a kernel error.
    return {
      brep: nativeHandle.length === 0 ? new Uint8Array() : new Uint8Array(context.binding.writeBrep(nativeHandle)),
    };
  },

  deserializeNativeHandle({ serializedNativeHandle }, _runtime, context) {
    return serializedNativeHandle.brep.byteLength === 0
      ? []
      : context.binding.readBrep(asBuffer(serializedNativeHandle.brep));
  },
});
