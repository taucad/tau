/**
 * PicoVoxel kernel: PicoGK's OpenVDB voxel engine compiled to WebAssembly, authored in TypeScript.
 *
 * Dual path (blueprint D5/D6): the viewer renders in the `'fast'` lane on the host's artifact, and
 * every export replays the model in the `'exact'` lane on the serial L0 artifact through the
 * runtime's native-build replay. `exportGeometry` stays a pure function of its handle.
 */

import type { Mesh, Pico, Voxels } from 'picovoxel';
import type * as PicovoxelModule from 'picovoxel';
import { createExportFile } from '@taucad/runtime/types';
import type { GeometryGltf, KernelIssue, KernelIssueCode } from '@taucad/runtime/types';
import {
  asBuffer,
  createFrameClassifier,
  createKernelError,
  createKernelParameterDeclaration,
  createKernelSuccess,
  defineKernel,
  deriveLocationFromFrames,
  enrichIssueLocation,
  extractDefaultParameters,
  finalizeMeshOutput,
  isRecordObject,
  jsonSchemaFromJson,
  parseStackTrace,
  quantityKinds,
  registerKernelModule,
  resolveSourcePath,
  toVmEntryPath,
} from '@taucad/runtime/kernel';
import type { KernelRuntime, RuntimeLogger } from '@taucad/runtime/kernel';
import { getIsolationStatus } from '@taucad/runtime/cross-origin-isolation';
import { resolveShapeName } from '@taucad/geometry-core';

import { picovoxelToGlb } from '#picovoxel.geometry.js';
import type { PicovoxelNativeHandle, PicovoxelShapeSnapshot } from '#picovoxel.geometry.js';
import { picovoxelExportSchemas, picovoxelOptionsSchema, picovoxelRenderSchema } from '#picovoxel.schemas.js';
import type { PicovoxelArtifact, PicovoxelLane } from '#picovoxel.schemas.js';

// =============================================================================
// Identity
// =============================================================================

/**
 * The installed `picovoxel` package version and the SHA-256 of its two WebAssembly artifacts.
 *
 * The digest of a shipped asset is a build-time constant; `picovoxel.asset-ownership.test.ts`
 * recomputes all three from the installed package and fails when the dependency moves, so geometry
 * cached under one PicoVoxel build is never reused under another.
 */
const picovoxelBuild = {
  version: '0.1.0',
  serial: 'f11f51032c14cd8c8b00f41d835c1e5dfa97c1974702c33ab8f4749584e7482b',
  multi: '987da3b8d16a83f532fa108b2a5336e795e6f8a3571c1c419ddcfb5c633985c6',
} as const;

/** Kernel version: the plugin's handle semantics plus the PicoVoxel build it runs. */
const kernelVersion = `1.0.0+picovoxel.${picovoxelBuild.version}.serial-${picovoxelBuild.serial.slice(0, 12)}.multi-${picovoxelBuild.multi.slice(0, 12)}`;

const kernelId = 'picovoxel';
const defaultVoxelSize = 0.5;

/**
 * Native memory above which a render logs a warning.
 *
 * ponytail: the constant PicoVoxel itself warned at (1 GiB); replaced by the V0.15-T measurement.
 */
const memoryWarningBytes = 2 ** 30;

/**
 * Module specifiers PicoVoxel authors may import.
 *
 * `picovoxel/multi` and `picovoxel/raw` are deliberately absent: the kernel owns every session and
 * its lane, and the raw C ABI bypasses lane provenance and disposal. `picovoxel/three` is absent
 * until `three` declarations are mounted in the editor.
 *
 * @public
 */
export const picovoxelBuiltinModuleNames = [
  'picovoxel',
  'picovoxel/latticelibrary',
  'picovoxel/numerics',
  'picovoxel/shapekernel',
  'picovoxel/slicing',
] as const;

/**
 * Detects ESM, CommonJS, and dynamic `picovoxel` imports.
 * @public
 */
export const picovoxelDetectPattern =
  /import\s+.*from\s+["']picovoxel(?:\/[^"']*)?["']|require\s*\(\s*["']picovoxel(?:\/[^"']*)?["']\s*\)|import\s*\(\s*["']picovoxel(?:\/[^"']*)?["']\s*\)/;

// =============================================================================
// Artifacts and sessions
// =============================================================================

type PicovoxelRoot = typeof PicovoxelModule;
type PicovoxelArtifactModule = Pick<PicovoxelRoot, 'createPico'>;

/** Modules and host policy retained for the PicoVoxel render and export phases. @public */
export type PicovoxelContext = {
  /** The serial root: author builtin and pure STL serializer. */
  readonly root: PicovoxelRoot;
  /** The fast lane's artifact, resolved from the host's `wasm` option inside this worker. */
  readonly wasm: PicovoxelArtifact;
  /** Lazy per-artifact loads; one promise per artifact, so a multi failure never poisons serial. */
  readonly artifacts: Map<PicovoxelArtifact, Promise<PicovoxelArtifactModule>>;
};

/**
 * The artifact a session runs on. Exact is path-defined on the serial L0 artifact; the multi
 * artifact serves only the fast lane until it has promotion evidence (D6).
 *
 * @param lane - The session lane.
 * @param wasm - The fast lane's resolved artifact.
 * @returns The artifact to load.
 */
const artifactFor = (lane: PicovoxelLane, wasm: PicovoxelArtifact): PicovoxelArtifact =>
  lane === 'exact' ? 'serial' : wasm;

const loadArtifact = async (
  context: PicovoxelContext,
  artifact: PicovoxelArtifact,
): Promise<PicovoxelArtifactModule> => {
  let loading = context.artifacts.get(artifact);
  if (!loading) {
    // ponytail: a rejected multi import stays cached for the worker's life, like any failed module
    // load; the serial artifact is unaffected because each artifact owns its promise.
    loading = artifact === 'serial' ? Promise.resolve(context.root) : import('picovoxel/multi');
    context.artifacts.set(artifact, loading);
  }
  return loading;
};

/**
 * Open one PicoVoxel session for one render.
 *
 * Seam for T2.B: compile-once `instantiateWasm` through the D13 asset subpaths and the warm
 * `createPicoRuntime()` (D31) replace this body; callers keep the one-session-per-render contract.
 *
 * @param context - Kernel context.
 * @param input - Session artifact, lane and voxel size.
 * @returns The session; the caller disposes it.
 */
const openSession = async (
  context: PicovoxelContext,
  input: { readonly artifact: PicovoxelArtifact; readonly lane: PicovoxelLane; readonly voxelSize: number },
): Promise<Pico> => {
  const artifactModule = await loadArtifact(context, input.artifact);
  // No explicit `fastRenorm` or `serialLattice`: the lane bundle decides both.
  return artifactModule.createPico({ voxelSize: input.voxelSize, lane: input.lane, memoryWarningBytes: 0 });
};

/**
 * Report the render's memory through the runtime logger instead of PicoVoxel's `console.warn`.
 *
 * @param logger - Kernel logger.
 * @param pico - The live session, read before it is disposed.
 * @param artifact - The artifact the session ran on.
 */
const logSessionMemory = (logger: RuntimeLogger, pico: Pico, artifact: PicovoxelArtifact): void => {
  const nativeBytes = pico.memory.total;
  const heapBytes = pico.module.HEAPU8.byteLength;
  logger.debug(`PicoVoxel session memory native=${nativeBytes} heap=${heapBytes} variant=${artifact}`);
  if (nativeBytes > memoryWarningBytes) {
    logger.warn(
      `PicoVoxel held ${nativeBytes} bytes of native memory on the ${artifact} artifact. Increase voxelSize or shrink the model bounds to lower memory use.`,
      { data: { nativeBytes, heapBytes, artifact } },
    );
  }
};

// =============================================================================
// Author module registration and execution
// =============================================================================

const registerPicovoxelModules = async (runtime: KernelRuntime, root: PicovoxelRoot): Promise<void> => {
  const subpaths = await Promise.all([
    import('picovoxel/latticelibrary'),
    import('picovoxel/numerics'),
    import('picovoxel/shapekernel'),
    import('picovoxel/slicing'),
  ]);
  for (const [index, exports] of [root, ...subpaths].entries()) {
    registerKernelModule(runtime, {
      name: picovoxelBuiltinModuleNames[index]!,
      exports,
      version: picovoxelBuild.version,
      globalName: `picovoxel${index}`,
    });
  }
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
    throw new TypeError('PicoVoxel source must default-export a main(pico, params) function.');
  }
  return main(pico, parameters);
};

const resolveVoxelSize = (parameters: Record<string, unknown>): number => {
  const voxelSize = parameters['voxelSize'] ?? defaultVoxelSize;
  if (typeof voxelSize !== 'number' || !Number.isFinite(voxelSize) || voxelSize <= 0) {
    const received = typeof voxelSize === 'number' ? String(voxelSize) : typeof voxelSize;
    throw new TypeError(`PicoVoxel voxelSize must be a positive finite number of millimetres; received ${received}.`);
  }
  return voxelSize;
};

// =============================================================================
// Result normalization
// =============================================================================

const isLane = (value: unknown): value is PicovoxelLane => value === 'exact' || value === 'fast';

const isMesh = (value: unknown): value is Mesh =>
  isRecordObject(value) &&
  value['vertices'] instanceof Float32Array &&
  value['triangles'] instanceof Uint32Array &&
  isCallable(value['toVoxels']);

const isVoxels = (value: unknown): value is Voxels =>
  isRecordObject(value) && isCallable(value['toMesh']) && typeof value['isEmpty'] === 'boolean';

const ownedFloat32 = (values: Float32Array): Float32Array<ArrayBuffer> =>
  values.buffer instanceof ArrayBuffer ? (values as Float32Array<ArrayBuffer>) : new Float32Array(values);

const ownedUint32 = (values: Uint32Array): Uint32Array<ArrayBuffer> =>
  values.buffer instanceof ArrayBuffer ? (values as Uint32Array<ArrayBuffer>) : new Uint32Array(values);

/**
 * Validate one returned mesh and keep PicoVoxel's own JavaScript copy.
 *
 * The facade's `vertices`/`triangles` are fresh JS-owned copies read out of wasm once, so the kernel
 * adds no second copy; it only checks the trust boundary in indexed passes.
 *
 * @param mesh - A mesh `main()` returned, or one derived from returned voxels.
 * @param index - Zero-based shape index.
 * @param sessionLane - The session's resolved lane, used when a mesh carries no lane.
 * @returns The durable snapshot.
 */
const snapshotMesh = (mesh: Mesh, index: number, sessionLane: PicovoxelLane): PicovoxelShapeSnapshot => {
  const name = resolveShapeName({ index, source: 'generated' });
  const vertices = ownedFloat32(mesh.vertices);
  const triangles = ownedUint32(mesh.triangles);
  if (vertices.length === 0 || triangles.length === 0) {
    throw new TypeError(`PicoVoxel ${name} is empty. Return [] for an empty scene.`);
  }
  if (vertices.length % 3 !== 0 || triangles.length % 3 !== 0) {
    throw new TypeError(`PicoVoxel ${name} must contain vertex and triangle triples.`);
  }
  // oxlint-disable-next-line typescript/prefer-for-of, unicorn-js/no-for-loop -- indexed scans; `for…of` over a typed array was measured 10x slower (picogk-mesh.ts).
  for (let offset = 0; offset < vertices.length; offset++) {
    if (!Number.isFinite(vertices[offset]!)) {
      throw new TypeError(`PicoVoxel ${name} contains a non-finite vertex coordinate.`);
    }
  }
  const vertexCount = vertices.length / 3;
  // oxlint-disable-next-line typescript/prefer-for-of, unicorn-js/no-for-loop -- see above.
  for (let offset = 0; offset < triangles.length; offset++) {
    if (triangles[offset]! >= vertexCount) {
      throw new TypeError(
        `PicoVoxel ${name} triangle index ${triangles[offset]} is outside its ${vertexCount} vertices.`,
      );
    }
  }
  const meshLane: unknown = mesh.lane;
  return { name, vertices, triangles, lane: isLane(meshLane) ? meshLane : sessionLane };
};

const describeValue = (value: unknown): string =>
  value === null ? 'null' : Array.isArray(value) ? 'an array' : typeof value;

/**
 * Normalize `main()`'s result. `[]` is an empty scene (the geospec empty-scene convention).
 *
 * @param result - The value `main()` returned.
 * @param sessionLane - The session's resolved lane.
 * @returns The durable native handle.
 */
const normalizeResult = (result: unknown, sessionLane: PicovoxelLane): PicovoxelNativeHandle => {
  const values = Array.isArray(result) ? result : [result];
  const shapes = values.map((value: unknown, index) => {
    if (isMesh(value)) {
      return snapshotMesh(value, index, sessionLane);
    }
    if (isVoxels(value)) {
      if (value.isEmpty) {
        throw new TypeError(
          `PicoVoxel ${resolveShapeName({ index, source: 'generated' })} is an empty Voxels field. Return [] for an empty scene.`,
        );
      }
      return snapshotMesh(value.toMesh(), index, sessionLane);
    }
    throw new TypeError(
      `PicoVoxel main() result ${index + 1} must be Mesh or Voxels; received ${describeValue(value)}.`,
    );
  });
  return { shapes };
};

// =============================================================================
// Issues
// =============================================================================

type PicoErrorLike = Error & { readonly code: string };

const isPicoError = (error: unknown): error is PicoErrorLike => {
  if (!(error instanceof Error) || !('code' in error)) {
    return false;
  }
  const { code } = error;
  return typeof code === 'string' && code.startsWith('PICO_');
};

/**
 * Tau issue code for a PicoVoxel error code; the PicoVoxel code stays in `details.picoCode`.
 *
 * @param picoCode - The PicoVoxel error code, when the failure carried one.
 * @returns The Tau issue code.
 */
const issueCodeFor = (picoCode: string | undefined): KernelIssueCode =>
  picoCode === 'PICO_OUT_OF_MEMORY' ? 'RESOURCE_LIMIT' : 'RUNTIME';

const outOfMemoryRemedy =
  ' PicoVoxel ran out of WebAssembly memory; increase voxelSize (cost grows with 1/voxelSize³) or shrink the model bounds.';

type SessionFacts = { readonly lane: PicovoxelLane; readonly artifact: PicovoxelArtifact };

const buildIssue = (
  error: unknown,
  options: {
    readonly sourceMap: Parameters<typeof deriveLocationFromFrames>[1];
    readonly entryUrl: string;
    readonly session?: SessionFacts;
  },
): KernelIssue => {
  const stackFrames = parseStackTrace(error, {
    classifyFrame: createFrameClassifier(),
    sourceMap: options.sourceMap,
    resolveSourcePath,
    lastEntryName: options.entryUrl,
  });
  const picoCode = isPicoError(error) ? error.code : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return {
    message: picoCode === 'PICO_OUT_OF_MEMORY' ? `${message}${outOfMemoryRemedy}` : message,
    code: issueCodeFor(picoCode),
    type: 'runtime',
    severity: 'error',
    stackFrames,
    location: deriveLocationFromFrames(stackFrames, options.sourceMap, resolveSourcePath),
    details: {
      producer: { kernelId },
      ...(picoCode ? { picoCode } : {}),
      ...options.session,
    },
  };
};

const multiUnavailableIssue = (reason: string): KernelIssue => ({
  message: `PicoVoxel's multi-threaded build cannot run in this worker (${reason}). Serve the app with COOP/COEP headers, or configure the kernel with wasm: 'auto' or 'serial'. Exact exports still work.`,
  code: 'KERNEL_CAPABILITY_MISSING',
  type: 'runtime',
  severity: 'error',
  details: { producer: { kernelId }, capability: 'PICOVOXEL_MULTI_UNAVAILABLE', reason },
});

const laneExportRefusal = (): KernelIssue => ({
  message:
    "PicoVoxel refuses a fast-lane GLB export: GLB has no slot to record the lane, so fast geometry would pass for exact. Export with lane: 'exact' (the default), or export STL, which is stamped LANE=fast.",
  code: 'REPRESENTATION_UNSUPPORTED',
  type: 'runtime',
  severity: 'error',
  details: { producer: { kernelId }, refusal: 'PICOVOXEL_LANE_EXPORT', lane: 'fast', format: 'glb' },
});

const noShapesIssue = (): KernelIssue => ({
  message: 'PicoVoxel has no shapes to export: main() returned an empty scene.',
  code: 'NO_RENDER_GEOMETRY',
  type: 'runtime',
  severity: 'error',
  details: { producer: { kernelId } },
});

class PicovoxelBuildError extends Error {
  public readonly issues: readonly KernelIssue[];

  public constructor(issues: readonly KernelIssue[]) {
    super(issues.map((issue) => issue.message).join('; '));
    this.issues = issues;
  }
}

// =============================================================================
// Parameters
// =============================================================================

/**
 * Declare `voxelSize` as a length in millimetres so hosts show and convert it with a unit.
 *
 * @param schema - The JSON schema inferred from the defaults.
 * @returns The schema with the `voxelSize` claim.
 */
const declareVoxelSize = (schema: Readonly<{ properties?: unknown }>): Readonly<Record<string, unknown>> => {
  const { properties } = schema;
  if (!isRecordObject(properties) || !isRecordObject(properties['voxelSize'])) {
    return { ...schema };
  }
  return {
    ...schema,
    properties: {
      ...properties,
      voxelSize: {
        ...properties['voxelSize'],
        exclusiveMinimum: 0,
        description: 'Voxel edge length. Cost grows roughly with 1/voxelSize³; start coarse and refine.',
        'x-tau-unit': 'mm',
        'x-tau-quantity-kind': quantityKinds.length,
      },
    },
  };
};

// =============================================================================
// Kernel
// =============================================================================

/** PicoVoxel kernel capability. @public */
export const picovoxelKernel = defineKernel({
  id: kernelId,
  extensions: ['ts', 'js'],
  detectImport: picovoxelDetectPattern,
  builtinModuleNames: [...picovoxelBuiltinModuleNames],
  name: 'PicovoxelKernel',
  version: kernelVersion,
  optionsSchema: picovoxelOptionsSchema,
  createOptionsSchema: picovoxelRenderSchema,
  render: { optionsSchema: picovoxelRenderSchema, content: ['includeEdges'] },
  exportFormats: {
    glb: { optionsSchema: picovoxelExportSchemas.glb, content: ['includeEdges'] },
    stl: { optionsSchema: picovoxelExportSchemas.stl },
  },

  async initialize(options, runtime): Promise<PicovoxelContext> {
    const root = await import('picovoxel');
    await registerPicovoxelModules(runtime, root);
    const isolation = getIsolationStatus();
    runtime.logger.log(
      isolation.crossOriginIsolated
        ? `PicoVoxel fast-lane WASM variant: ${options.wasm}`
        : `PicoVoxel fast-lane WASM variant: ${options.wasm} (multi-threaded build unavailable: ${isolation.reason})`,
    );
    return { root, wasm: options.wasm, artifacts: new Map() };
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
      const jsonSchema = declareVoxelSize(await jsonSchemaFromJson(defaultParameters));
      return createKernelSuccess(
        createKernelParameterDeclaration(defaultParameters, jsonSchema, {
          id: 'urn:taucad:picovoxel:parameters',
          name: 'PicovoxelParameters',
        }),
      );
    } catch (error) {
      return createKernelError([
        {
          message: error instanceof Error ? error.message : 'Failed to extract PicoVoxel parameters.',
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
    const issueContext = { sourceMap: bundleResult.sourceMap, entryUrl: executeResult.entryUrl ?? relativeFilePath };

    const { lane } = options;
    const artifact = artifactFor(lane, context.wasm);
    if (artifact === 'multi') {
      const isolation = getIsolationStatus();
      // An explicit multi request that cannot be honoured fails visibly; it never falls back.
      if (!isolation.crossOriginIsolated) {
        throw new PicovoxelBuildError([multiUnavailableIssue(isolation.reason)]);
      }
    }

    let pico: Pico | undefined;
    try {
      pico = await openSession(context, { artifact, lane, voxelSize: resolveVoxelSize(parameters) });
      runtime.logger.debug(
        `PicoVoxel session variant=${artifact} pthreads=${pico.module.PThread?.runningWorkers.length ?? 0} lane=${pico.lane}`,
      );
      const result = await runMain(resolveModule(executeResult.value), pico, parameters);
      const nativeHandle = normalizeResult(result, lane);
      logSessionMemory(runtime.logger, pico, artifact);
      return { nativeHandle };
    } catch (error) {
      throw new PicovoxelBuildError([buildIssue(error, { ...issueContext, session: { lane, artifact } })]);
    } finally {
      pico?.dispose();
    }
  },

  async meshGeometry({ nativeHandle }) {
    const geometry: GeometryGltf = { format: 'gltf', content: picovoxelToGlb(nativeHandle) };
    return finalizeMeshOutput({ artifacts: [geometry] });
  },

  serializeNativeHandle({ nativeHandle }) {
    return nativeHandle;
  },

  deserializeNativeHandle({ serializedNativeHandle }) {
    if (!isRecordObject(serializedNativeHandle) || !Array.isArray(serializedNativeHandle.shapes)) {
      throw new TypeError('Invalid PicoVoxel serialized handle: expected a shapes array.');
    }
    return {
      shapes: serializedNativeHandle.shapes.map((value: unknown, index): PicovoxelShapeSnapshot => {
        if (
          !isRecordObject(value) ||
          typeof value['name'] !== 'string' ||
          !(value['vertices'] instanceof Float32Array) ||
          !(value['triangles'] instanceof Uint32Array) ||
          !isLane(value['lane'])
        ) {
          throw new TypeError(
            `Invalid PicoVoxel serialized shape ${index}: expected name, Float32Array vertices, Uint32Array triangles and an exact/fast lane.`,
          );
        }
        return {
          name: value['name'],
          vertices: ownedFloat32(value['vertices']),
          triangles: ownedUint32(value['triangles']),
          lane: value['lane'],
        };
      }),
    };
  },

  async exportGeometry(input, _runtime, context) {
    const { shapes } = input.nativeHandle;
    switch (input.format) {
      case 'glb': {
        // Checked against the handle too: fast provenance never passes for exact, whatever was asked.
        if (input.options.lane === 'fast' || shapes.some((shape) => shape.lane === 'fast')) {
          return createKernelError([laneExportRefusal()]);
        }
        const bytes = picovoxelToGlb(input.nativeHandle, {
          coordinateSystem: input.options.coordinateSystem,
          unit: input.options.unit,
        });
        return createKernelSuccess([createExportFile('glb', 'model.glb', asBuffer(bytes))]);
      }
      case 'stl': {
        if (shapes.length === 0) {
          return createKernelError([noShapesIssue()]);
        }
        const { unit, scale, offset, lane } = input.options;
        return createKernelSuccess(
          shapes.map((shape) =>
            createExportFile(
              'stl',
              `${shape.name}.stl`,
              // An explicit fast export is the consent: the header carries LANE=fast, as does any shape
              // with fast provenance. An exact export of an exact handle never stamps.
              asBuffer(
                context.root.meshToStlBytes(
                  shape.vertices,
                  shape.triangles,
                  { unit, scale, offset },
                  lane === 'fast' || shape.lane === 'fast' ? 'fast' : undefined,
                ) as Uint8Array<ArrayBuffer>,
              ),
            ),
          ),
        );
      }
      default: {
        const exhaustive: never = input;
        return createKernelError([
          {
            message: `Unsupported PicoVoxel export format: ${String(exhaustive)}.`,
            code: 'KERNEL_CAPABILITY_MISSING',
            type: 'runtime',
            severity: 'error',
          },
        ]);
      }
    }
  },
});
