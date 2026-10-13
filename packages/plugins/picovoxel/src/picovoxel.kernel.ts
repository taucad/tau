/**
 * PicoVoxel kernel: PicoGK's OpenVDB voxel engine compiled to WebAssembly, authored in TypeScript.
 *
 * Dual path (blueprint D5/D6): the viewer renders in the `'fast'` lane on the host's artifact, and
 * every export replays the model in the `'exact'` lane on the serial L0 artifact through the
 * runtime's native-build replay. `export` stays a pure function of its handle.
 */

import type {
  CreatePicoOptions,
  CreatePicoRuntimeOptions,
  Mesh,
  Pico,
  PicoErrorCode,
  PicoRuntime,
  PicoWasmOverrides,
  Voxels,
} from 'picovoxel';
import type * as PicovoxelModule from 'picovoxel';
import picovoxelPackage from 'picovoxel/package.json' with { type: 'json' };
import { createExportFile, kernelIssueCodeValues } from '@taucad/runtime/types';
import { z } from 'zod';
import type { KernelIssue, KernelIssueCode } from '@taucad/runtime/types';
import {
  asBuffer,
  checkAbort,
  compileWasmStreaming,
  createFrameClassifier,
  createKernelError,
  createKernelParameterDeclaration,
  createKernelSuccess,
  defineKernel,
  deriveLocationFromFrames,
  enrichIssueLocation,
  extractDefaultParameters,
  isRecordObject,
  jsonSchemaFromJson,
  nonemptyExportFiles,
  parseStackTrace,
  quantityKinds,
  registerKernelModule,
  resolveFileUrl,
  resolveSourcePath,
  toVmEntryPath,
} from '@taucad/runtime/kernel';
import type { KernelServices, RuntimeLogger } from '@taucad/runtime/kernel';
import {
  readMechanismExport,
  resolveShapeName,
  validateGlbMaterial,
  validateGlbResources,
} from '@taucad/geometry-core';
import type { GlbMaterial, GlbResources } from '@taucad/geometry-core';

import { dropZeroAreaTriangles, picovoxelToGlb, picovoxelToGltf } from '#picovoxel.geometry.js';
import type { PicovoxelNativeHandle, PicovoxelShapeSnapshot } from '#picovoxel.geometry.js';
import {
  multiUnavailableReason,
  picovoxelExportSchemas,
  picovoxelOptionsSchema,
  picovoxelRenderSchema,
} from '#picovoxel.schemas.js';
import type { PicovoxelArtifact, PicovoxelLane } from '#picovoxel.schemas.js';

// =============================================================================
// Identity
// =============================================================================

/**
 * The installed `picovoxel` package: its version, the SHA-256 of its two WebAssembly artifacts, and
 * one SHA-256 over every JavaScript file it ships (the facade and both glues).
 *
 * The digest of a shipped file is a build-time constant; `picovoxel.asset-ownership.test.ts`
 * recomputes all four from the installed package and fails when the dependency moves, so geometry
 * cached under one PicoVoxel build is never reused under another. The script digest catches a
 * facade-only change (lane semantics, defaults) that keeps the version and both binaries.
 */
const picovoxelBuild = {
  version: '0.1.0',
  serial: 'eb7b254f50a2c7d37e46fb0169fd9890c1a366eeed78272c2ced10cbd1c26b01',
  multi: '8da3345c22f2d0945aef294151520da5df004ac4dd67114bf1ce07a503f0f444',
  scripts: 'e19aa9a77efb2c44cb0aa359ba7e3b64d2a022dbf98b2a4abf0126122aac9d7c',
} as const;

/** Kernel version: mechanism/name-evidence handle semantics plus the PicoVoxel build it runs. */
const kernelVersion = `1.4.0+picovoxel.${picovoxelBuild.version}.serial-${picovoxelBuild.serial.slice(0, 12)}.multi-${picovoxelBuild.multi.slice(0, 12)}.scripts-${picovoxelBuild.scripts.slice(0, 12)}`;

/**
 * Explicit URLs of the assets each artifact loads (D20): the WebAssembly binary and, for the
 * pthread build, the glue every worker runs. Resolved through picovoxel's asset subpaths so hosts
 * emit and serve them as files (the runtime's asset plugin rewrites these expressions), never by
 * trusting a bundler to follow the glue's own `new URL(…, import.meta.url)` lookups.
 */
const picovoxelAssets = {
  serial: { wasm: new URL(import.meta.resolve('picovoxel/wasm')).href },
  multi: {
    wasm: new URL(import.meta.resolve('picovoxel/multi/wasm')).href,
    worker: new URL(import.meta.resolve('picovoxel/multi/worker')).href,
  },
} as const;

const kernelId = 'picovoxel';
const defaultVoxelSize = 0.5;

type PicovoxelSerializedHandle = Omit<PicovoxelNativeHandle, 'shapes'> & {
  shapes: Array<
    Omit<PicovoxelShapeSnapshot, 'vertices' | 'triangles'> & {
      vertices: Uint8Array<ArrayBuffer>;
      triangles: Uint8Array<ArrayBuffer>;
    }
  >;
};

// Match the runtime cache's loose issue envelope while retaining source-map and producer evidence.
const mechanismIssuesSchema = z.array(
  z
    .object({
      message: z.string(),
      code: z.enum(kernelIssueCodeValues),
      severity: z.literal('warning'),
    })
    .loose(),
);

/**
 * Native memory above which a render logs a warning.
 *
 * ponytail: the constant PicoVoxel itself warned at (1 GiB); replaced by the V0.15-T measurement.
 */
const memoryWarningBytes = 2 ** 30;

/**
 * WebAssembly heap size above which an idle runtime is recycled after its render.
 *
 * Linear memory never shrinks, so a runtime that once built a fine model keeps its peak heap for the
 * worker's life. Origin: blueprint D31's provisional 1.5 GiB, replaced by the V0.15-T measurement;
 * deliberately not a user option.
 */
const recycleHeapBytes = 1.5 * 2 ** 30;

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
type PicovoxelArtifactModule = Pick<PicovoxelRoot, 'createPicoRuntime'>;

/** Anything author code can create through the `picovoxel` builtin and the kernel must release. */
type AuthorResource = { dispose(): void };

/** Modules, host policy and warm runtimes retained for the PicoVoxel render and export phases. @public */
export type PicovoxelContext = {
  /** The serial root: author builtin and pure STL serializer. */
  readonly root: PicovoxelRoot;
  /** The fast lane's artifact, resolved from the host's `wasm` option inside this worker. */
  readonly wasm: PicovoxelArtifact;
  /**
   * One warm runtime per artifact (D31): the module is compiled and instantiated once, and the multi
   * pthread pool is spawned and warmed once; every render opens a fresh session on it. A runtime is
   * dropped after a WebAssembly trap or once its heap passes the recycle threshold.
   */
  readonly runtimes: Map<PicovoxelArtifact, Promise<PicoRuntime>>;
  /** Sessions and runtimes author code created during the current render; disposed when it ends. */
  readonly authorResources: Set<AuthorResource>;
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

/**
 * The artifact's compiled WebAssembly module, compiled at most once per worker (D20, D31).
 *
 * A module the host compiled for this URL wins; otherwise the runtime's URL-keyed compile cache
 * holds it for the worker's life, so a recycled runtime instantiates the same module again instead
 * of recompiling it. On the pthread build the module is also what every worker instantiates.
 *
 * @param runtime - Kernel runtime, which holds any module the host compiled.
 * @param wasmUrl - The artifact's `.wasm` URL.
 * @returns The module every runtime of this artifact instantiates.
 */
const compiledModuleFor = async (runtime: KernelServices, wasmUrl: string): Promise<WebAssembly.Module> =>
  runtime.getCompiledWasmModule(wasmUrl) ?? compileWasmStreaming(wasmUrl);

/**
 * Emscripten overrides for an artifact (D20): its binary by explicit URL and, for the pthread
 * build, the worker script. Emscripten's Node branch spawns `worker_threads` from a filesystem path,
 * so a `file:` URL is converted there.
 *
 * @param artifact - `'serial'` or `'multi'`.
 * @returns The `wasm` overrides for `createPicoRuntime`.
 */
const emscriptenOverrides = async (artifact: PicovoxelArtifact): Promise<PicoWasmOverrides> => {
  const { wasm } = picovoxelAssets[artifact];
  const locateFile = (path: string, scriptDirectory: string): string =>
    path.endsWith('.wasm') ? wasm : `${scriptDirectory}${path}`;
  return artifact === 'multi'
    ? { locateFile, mainScriptUrlOrBlob: await resolveFileUrl(picovoxelAssets.multi.worker) }
    : { locateFile };
};

/**
 * Start an artifact's runtime; a runtime that fails to start is not kept, so the next render tries again.
 *
 * Any failure to load, compile or instantiate the artifact is a `PICO_WASM_INIT_FAILED`, so a
 * multi build that cannot start takes the D21 serial retry whatever step refused.
 *
 * @param context - Kernel context; its entry for `artifact` is removed on failure.
 * @param runtime - Kernel runtime.
 * @param artifact - `'serial'` or `'multi'`.
 * @returns The started runtime.
 */
const startRuntime = async (
  context: PicovoxelContext,
  runtime: KernelServices,
  artifact: PicovoxelArtifact,
): Promise<PicoRuntime> => {
  try {
    const artifactModule: PicovoxelArtifactModule =
      artifact === 'serial' ? context.root : await import('picovoxel/multi');
    const [wasmModule, wasm] = await Promise.all([
      compiledModuleFor(runtime, picovoxelAssets[artifact].wasm),
      emscriptenOverrides(artifact),
    ]);
    return await artifactModule.createPicoRuntime({ wasmModule, wasm });
  } catch (error) {
    context.runtimes.delete(artifact);
    if (isPicoError(error)) {
      throw error;
    }
    throw new context.root.PicoError(
      'PICO_WASM_INIT_FAILED',
      `PicoVoxel's ${artifact} build could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
};

/**
 * The warm runtime for an artifact, started on first use. Each artifact owns its promise, so a
 * multi failure never poisons serial.
 *
 * @param context - Kernel context.
 * @param runtime - Kernel runtime.
 * @param artifact - `'serial'` or `'multi'`.
 * @returns The warm runtime.
 */
const loadRuntime = async (
  context: PicovoxelContext,
  runtime: KernelServices,
  artifact: PicovoxelArtifact,
): Promise<PicoRuntime> => {
  let loading = context.runtimes.get(artifact);
  if (!loading) {
    loading = startRuntime(context, runtime, artifact);
    context.runtimes.set(artifact, loading);
  }
  return loading;
};

/**
 * Drop an artifact's runtime so the next render starts a fresh one, and release its memory and pool.
 *
 * @param context - Kernel context.
 * @param logger - Kernel logger.
 * @param recycle - The artifact whose runtime is recycled, and why (for the log).
 */
const recycleRuntime = async (
  context: PicovoxelContext,
  logger: RuntimeLogger,
  recycle: { readonly artifact: PicovoxelArtifact; readonly reason: string },
): Promise<void> => {
  const { artifact, reason } = recycle;
  const loading = context.runtimes.get(artifact);
  if (loading) {
    context.runtimes.delete(artifact);
    try {
      const picoRuntime = await loading;
      picoRuntime.dispose();
    } catch (error) {
      // Dropping the reference is what matters; a broken module may refuse an orderly teardown.
      logger.debug(`PicoVoxel runtime teardown failed: ${String(error)}`);
    }
    logger.debug(`PicoVoxel recycled the ${artifact} runtime: ${reason}`);
  }
};

/**
 * Dispose the render's session and everything author code created, whatever happened.
 *
 * A dispose that throws means the module underneath is no longer sound (after a trap, for
 * instance); the caller recycles the runtime rather than letting the failure mask the render's own.
 *
 * @param pico - The kernel's session, when one was opened.
 * @param resources - Author-created sessions and runtimes; emptied.
 * @returns `false` when any dispose threw.
 */
const releaseRender = (pico: Pico | undefined, resources: Set<AuthorResource>): boolean => {
  let clean = true;
  for (const resource of [pico, ...resources]) {
    try {
      resource?.dispose();
    } catch {
      clean = false;
    }
  }
  resources.clear();
  return clean;
};

const isCallable = (value: unknown): value is (...arguments_: readonly unknown[]) => unknown =>
  typeof value === 'function';

const abortChecked = new WeakSet<Record<string, unknown>>();

/**
 * PicoVoxel calls the current build has made, reset per build; builds in one worker never overlap
 * (the runtime serializes kernel operations). Logged when a superseded build stops, as the evidence
 * of where the cooperative check caught it.
 */
let buildCalls = 0;

/** Admit one PicoVoxel call: throw if the render was superseded, otherwise count it. */
const admitCall = (): void => {
  checkAbort();
  buildCalls++;
};

/**
 * Make every method of a PicoVoxel facade object check for cancellation before it runs (D21).
 *
 * Methods are replaced on the object itself, not behind a proxy: PicoVoxel keys session ownership
 * and lane provenance by wrapper identity, so an operand passed to another method must stay the
 * same object. Returned facade objects (anything disposable) are checked the same way, so a render
 * abandoned by a newer one stops at its next PicoVoxel call. The check sits between native
 * operations, never inside one, and the kernel's `finally` frees the session.
 *
 * @param value - A facade object, or anything else (returned unchanged).
 * @returns The same value.
 */
const withAbortChecks = <Value>(value: Value): Value => {
  if (!isRecordObject(value) || !isCallable(value['dispose']) || abortChecked.has(value)) {
    return value;
  }
  abortChecked.add(value);
  const methods: Record<string, unknown> = value;
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    const method: unknown = descriptor.value;
    if (key !== 'dispose' && isCallable(method)) {
      methods[key] = function (this: unknown, ...arguments_: unknown[]): unknown {
        admitCall();
        return withAbortChecks(method.apply(this, arguments_));
      };
    }
  }
  return value;
};

/**
 * Open one PicoVoxel session for one render on the artifact's warm runtime.
 *
 * @param context - Kernel context.
 * @param kernelRuntime - The Tau kernel runtime, which supplies host-compiled modules.
 * @param input - Session artifact, lane and voxel size.
 * @returns The session; the caller disposes it.
 */
const openSession = async (
  context: PicovoxelContext,
  kernelRuntime: KernelServices,
  input: { readonly artifact: PicovoxelArtifact; readonly lane: PicovoxelLane; readonly voxelSize: number },
): Promise<Pico> => {
  const runtime = await loadRuntime(context, kernelRuntime, input.artifact);
  // No explicit `fastRenorm` or `serialLattice`: the lane bundle decides both. `memoryWarningBytes: 0`
  // silences PicoVoxel's console warning; the kernel reports memory through its logger instead.
  return runtime.createPico({ voxelSize: input.voxelSize, lane: input.lane, memoryWarningBytes: 0 });
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

/**
 * The root builtin authors import. Sessions and runtimes that author code creates are tracked and
 * disposed when the render ends (D21), check for cancellation like the kernel's own session, and
 * report memory through the kernel logger rather than the console.
 *
 * @param root - The serial PicoVoxel root.
 * @param resources - The context's per-render resource set.
 * @returns The module namespace to register.
 */
const authorRoot = (root: PicovoxelRoot, resources: Set<AuthorResource>): PicovoxelRoot => ({
  ...root,
  async createPico(options?: CreatePicoOptions): Promise<Pico> {
    const pico = await root.createPico({ memoryWarningBytes: 0, ...options });
    resources.add(pico);
    return withAbortChecks(pico);
  },
  async createPicoRuntime(options?: CreatePicoRuntimeOptions): Promise<PicoRuntime> {
    const picoRuntime = await root.createPicoRuntime(options);
    resources.add(picoRuntime);
    const createSession = picoRuntime.createPico.bind(picoRuntime);
    return Object.assign(picoRuntime, {
      async createPico(sessionOptions?: Parameters<PicoRuntime['createPico']>[0]): Promise<Pico> {
        return withAbortChecks(await createSession({ memoryWarningBytes: 0, ...sessionOptions }));
      },
    });
  },
});

const registerPicovoxelModules = async (
  runtime: KernelServices,
  root: PicovoxelRoot,
  resources: Set<AuthorResource>,
): Promise<void> => {
  const subpaths = await Promise.all([
    import('picovoxel/latticelibrary'),
    import('picovoxel/numerics'),
    import('picovoxel/shapekernel'),
    import('picovoxel/slicing'),
  ]);
  for (const [index, exports] of [authorRoot(root, resources), ...subpaths].entries()) {
    registerKernelModule(runtime, {
      name: picovoxelBuiltinModuleNames[index]!,
      exports,
      package: picovoxelPackage,
      globalName: `picovoxel${index}`,
    });
  }
};

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
  values.buffer instanceof ArrayBuffer
    ? new Float32Array(values.buffer, values.byteOffset, values.length)
    : new Float32Array(values);

const ownedUint32 = (values: Uint32Array): Uint32Array<ArrayBuffer> =>
  values.buffer instanceof ArrayBuffer
    ? new Uint32Array(values.buffer, values.byteOffset, values.length)
    : new Uint32Array(values);

const snapshotBytes = (values: Float32Array<ArrayBuffer> | Uint32Array<ArrayBuffer>): Uint8Array<ArrayBuffer> =>
  new Uint8Array(values.buffer, values.byteOffset, values.byteLength).slice();

// oxlint-disable-next-line enforce-uint8array-arraybuffer/enforce-uint8array-arraybuffer -- Validated serialized views may have shared backing; restoration copies into an owned ArrayBuffer.
const restoredWords = (value: Uint8Array, index: number, field: 'vertices' | 'triangles'): ArrayBuffer => {
  if (value.byteLength % Uint32Array.BYTES_PER_ELEMENT !== 0) {
    throw new TypeError(`Invalid PicoVoxel serialized shape ${index}: ${field} byte length must be divisible by four.`);
  }
  return new Uint8Array(value).buffer;
};

/**
 * Validate one returned mesh and keep PicoVoxel's own JavaScript copy.
 *
 * The facade's `vertices`/`triangles` are fresh JS-owned copies read out of wasm once, so the kernel
 * adds no second copy; it only checks the trust boundary in indexed passes. Exactly-zero-area
 * triangles are dropped here, once, so the viewer and every export see the same mesh (D36).
 *
 * @param mesh - A mesh `main()` returned, or one derived from returned voxels.
 * @param part - Resolved display name and zero-based output index.
 * @param sessionLane - The session's resolved lane, used when a mesh carries no lane.
 * @returns The durable snapshot.
 */
const snapshotMesh = (
  mesh: Mesh,
  part: Readonly<{ index: number; name: string }>,
  sessionLane: PicovoxelLane,
): PicovoxelShapeSnapshot => {
  const { name, index } = part;
  const label = `${name} (output ${index + 1})`;
  const vertices = ownedFloat32(mesh.vertices);
  const triangles = ownedUint32(mesh.triangles);
  const kept = validateMeshArrays({ vertices, triangles, label });
  const meshLane: unknown = mesh.lane;
  return { name, vertices, triangles: kept, lane: isLane(meshLane) ? meshLane : sessionLane };
};

const validateMeshArrays = ({
  vertices,
  triangles,
  label,
}: {
  vertices: Float32Array<ArrayBuffer>;
  triangles: Uint32Array<ArrayBuffer>;
  label: string;
}): Uint32Array<ArrayBuffer> => {
  if (vertices.length === 0 || triangles.length === 0) {
    throw new TypeError(`PicoVoxel ${label} is empty. Return [] for an empty scene.`);
  }
  if (vertices.length % 3 !== 0 || triangles.length % 3 !== 0) {
    throw new TypeError(`PicoVoxel ${label} must contain vertex and triangle triples.`);
  }
  // oxlint-disable-next-line typescript/prefer-for-of, unicorn-js/no-for-loop -- indexed scans; `for…of` over a typed array was measured 10x slower (picogk-mesh.ts).
  for (let offset = 0; offset < vertices.length; offset++) {
    if (!Number.isFinite(vertices[offset]!)) {
      throw new TypeError(`PicoVoxel ${label} contains a non-finite vertex coordinate.`);
    }
  }
  const vertexCount = vertices.length / 3;
  // oxlint-disable-next-line typescript/prefer-for-of, unicorn-js/no-for-loop -- see above.
  for (let offset = 0; offset < triangles.length; offset++) {
    if (triangles[offset]! >= vertexCount) {
      throw new TypeError(
        `PicoVoxel ${label} triangle index ${triangles[offset]} is outside its ${vertexCount} vertices.`,
      );
    }
  }
  const kept = dropZeroAreaTriangles(vertices, triangles);
  if (kept.length === 0) {
    // Checked after the D36 filter: a shape of zero-area triangles only is empty, not an index-less mesh.
    throw new TypeError(`PicoVoxel ${label} is empty: every triangle has zero area. Return [] for an empty scene.`);
  }
  return kept;
};

const describeValue = (value: unknown): string =>
  value === null ? 'null' : Array.isArray(value) ? 'an array' : typeof value;

/**
 * Own plain material metadata, omitting undefined object properties before the cache codec.
 * @param value - Material or resource metadata.
 * @returns Deeply owned JSON data.
 */
const snapshotJson = (value: unknown): unknown => {
  // oxlint-disable-next-line unicorn/prefer-structured-clone -- MessagePack restores undefined as null; JSON omission preserves optional fields.
  const snapshot: unknown = JSON.parse(
    JSON.stringify(value, (_key, child: unknown) => {
      if (
        (typeof child === 'number' && !Number.isFinite(child)) ||
        ['bigint', 'function', 'symbol'].includes(typeof child)
      ) {
        throw new TypeError('Material properties, extras and extensions must contain finite JSON values.');
      }
      return child;
    }),
  );
  return snapshot;
};

const snapshotResources = (value: unknown): GlbResources => {
  try {
    validateGlbResources(value);
    const snapshot: unknown = {
      ...(value.textures ? { textures: snapshotJson(value.textures) } : {}),
      ...(value.samplers ? { samplers: snapshotJson(value.samplers) } : {}),
      ...(value.images
        ? {
            images: value.images.map((image) => ({
              mimeType: image.mimeType,
              data: new Uint8Array(image.data),
              ...(image.name === undefined ? {} : { name: image.name }),
            })),
          }
        : {}),
    };
    validateGlbResources(snapshot);
    return snapshot;
  } catch (error) {
    throw new TypeError(`PicoVoxel model resources: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
};

const snapshotMaterial = (value: unknown, label: string, textureCount: number): GlbMaterial | undefined => {
  if (value === undefined) {
    return undefined;
  }
  try {
    if (!isRecordObject(value)) {
      throw new TypeError('material must be an object.');
    }
    const material: GlbMaterial = value;
    // The mapper generates UV0 and tangents for every mapped/anisotropic material.
    validateGlbMaterial(material, { textureCount, texCoordCount: 1, hasTangents: true });
    const snapshot = snapshotJson(material);
    if (!isRecordObject(snapshot)) {
      throw new TypeError('material must be an object.');
    }
    validateGlbMaterial(snapshot, { textureCount, texCoordCount: 1, hasTangents: true });
    return snapshot;
  } catch (error) {
    throw new TypeError(`PicoVoxel ${label}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
};

/**
 * Normalize `main()`'s result. `[]` is an empty scene (the geospec empty-scene convention).
 *
 * @param result - The value `main()` returned.
 * @param sessionLane - The session's resolved lane.
 * @returns The durable native handle.
 */
const normalizeResult = (result: unknown, sessionLane: PicovoxelLane): PicovoxelNativeHandle => {
  const model = isRecordObject(result) && 'shapes' in result ? result : undefined;
  const modelShapes = model?.['shapes'];
  if (model && !Array.isArray(modelShapes)) {
    throw new TypeError('PicoVoxel model.shapes must be a flat array of Mesh, Voxels or part descriptors.');
  }
  const resources = model ? snapshotResources(model) : {};
  const values: readonly unknown[] = Array.isArray(modelShapes)
    ? modelShapes
    : Array.isArray(result)
      ? result
      : [result];
  const shapes = values.map((value: unknown, index) => {
    let shape = value;
    let name: string | undefined;
    let authoredMaterial: unknown;
    if (isRecordObject(value) && !isMesh(value) && !isVoxels(value)) {
      if ('children' in value) {
        throw new TypeError(
          `PicoVoxel main() result ${index + 1} cannot contain children. Return a flat array of parts.`,
        );
      }
      if (value['name'] !== undefined && typeof value['name'] !== 'string') {
        throw new TypeError(
          `PicoVoxel main() result ${index + 1} name must be a string. Omit it for a generated name.`,
        );
      }
      ({ name, shape } = value);
      authoredMaterial = value['material'];
    }
    const trimmedName = name?.trim();
    const authoredName = trimmedName?.length ? trimmedName : undefined;
    const part = { index, name: resolveShapeName({ index, name, source: 'authored' }) };
    const material = snapshotMaterial(
      authoredMaterial,
      `${part.name} (output ${index + 1})`,
      resources.textures?.length ?? 0,
    );
    const appearance = {
      ...(material === undefined ? {} : { material }),
      ...(authoredName === undefined ? {} : { authoredName }),
    };
    if (isMesh(shape)) {
      return { ...snapshotMesh(shape, part, sessionLane), ...appearance };
    }
    if (isVoxels(shape)) {
      if (shape.isEmpty) {
        throw new TypeError(
          `PicoVoxel ${part.name} (output ${index + 1}) is an empty Voxels field. Return [] for an empty scene.`,
        );
      }
      return { ...snapshotMesh(shape.toMesh(), part, sessionLane), ...appearance };
    }
    throw new TypeError(
      `PicoVoxel main() result ${index + 1} must be Mesh, Voxels or { shape: Mesh | Voxels, name?: string, material?: Material }; received ${describeValue(shape)}.`,
    );
  });
  return { shapes, ...resources };
};

/**
 * Safe export basenames are independent of display labels and payload-local identity.
 * @param shapes - Delivered part snapshots in output order.
 * @returns One safe unique filename per part.
 */
const stlFilenames = (shapes: readonly PicovoxelShapeSnapshot[]): string[] => {
  const used = new Set<string>();
  const encoder = new TextEncoder();
  return shapes.map(({ name }, index) => {
    // Replace path syntax and control characters; preserve safe Unicode in the actual filename.
    // oxlint-disable-next-line no-control-regex -- export filename trust boundary
    let stem = name.replaceAll(/[\u0000-\u001F\u007F-\u009F<>:"/\\|?*]/gu, '_').replace(/[. ]+$/u, '');
    if (/^(?:con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³]) *(?:\.|$)/iu.test(stem)) {
      stem = `_${stem}`;
    }
    let truncated = '';
    for (const point of stem) {
      if (encoder.encode(truncated + point).length > 120) {
        break;
      }
      truncated += point;
    }
    stem = truncated.replace(/[. ]+$/u, '') || resolveShapeName({ index });
    let candidate = stem;
    for (let suffix = 2; used.has(candidate.normalize('NFC').toLowerCase()); suffix++) {
      candidate = `${stem} ${suffix}`;
    }
    used.add(candidate.normalize('NFC').toLowerCase());
    return `${candidate}.stl`;
  });
};

// =============================================================================
// Issues
// =============================================================================

type PicoErrorLike = Error & { readonly code: PicoErrorCode };

/**
 * Whether a failure is a PicoVoxel error. The `PICO_` prefix is the runtime check; the typed code is
 * what ties every comparison below to picovoxel's exported `PicoErrorCode`, so a renamed code
 * breaks the build instead of silently falling through.
 *
 * @param error - The failure.
 * @returns `true` for a PicoVoxel error.
 */
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
const issueCodeFor = (picoCode: PicoErrorCode | undefined): KernelIssueCode =>
  picoCode === 'PICO_OUT_OF_MEMORY'
    ? 'RESOURCE_LIMIT'
    : picoCode === 'PICO_LANE_LOOSENED'
      ? 'REPRESENTATION_UNSUPPORTED'
      : 'RUNTIME';

const outOfMemoryRemedy =
  ' PicoVoxel ran out of WebAssembly memory; increase voxelSize (cost grows with 1/voxelSize³) or shrink the model bounds.';

/**
 * PicoVoxel's own remedy for a loosened lane names session options Tau authors never see, so the
 * issue states Tau's: the kernel owns the lane, and exports replay the model exactly.
 */
const laneLoosenedMessage =
  "PicoVoxel refused fast-lane data in an exact build: this model reads geometry stamped LANE=fast (an STL or .vdb from a fast export) or asks for fastRenorm, and exact builds, which every export and GeoSpec check uses, never accept either. Regenerate the input with an exact export (lane: 'exact', the default) and remove fastRenorm (the lane decides it), or export this model with lane: 'fast' (STL only; the file is stamped LANE=fast).";

const messageFor = (picoCode: PicoErrorCode | undefined, message: string): string =>
  picoCode === 'PICO_OUT_OF_MEMORY'
    ? `${message}${outOfMemoryRemedy}`
    : picoCode === 'PICO_LANE_LOOSENED'
      ? laneLoosenedMessage
      : message;

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
    message: messageFor(picoCode, message),
    code: issueCodeFor(picoCode),
    type: 'runtime',
    severity: 'error',
    stackFrames,
    location: deriveLocationFromFrames(stackFrames, options.sourceMap, resolveSourcePath),
    details: {
      producer: { kernelId },
      ...(picoCode ? { picoCode } : {}),
      ...(picoCode === 'PICO_LANE_LOOSENED' ? { refusal: 'PICOVOXEL_LANE_LOOSENED', picoMessage: message } : {}),
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
    "PicoVoxel refuses a fast-lane GLB or glTF export: these formats have no slot to record the lane, so fast geometry would pass for exact. Export with lane: 'exact' (the default), or export STL, which is stamped LANE=fast.",
  code: 'REPRESENTATION_UNSUPPORTED',
  type: 'runtime',
  severity: 'error',
  details: { producer: { kernelId }, refusal: 'PICOVOXEL_LANE_EXPORT', lane: 'fast', format: 'glb' },
});

const noShapesIssue = (): KernelIssue => ({
  message: 'PicoVoxel has no shapes to export: main() returned an empty scene.',
  code: 'RENDER_ARTIFACT_MISSING',
  type: 'runtime',
  severity: 'error',
  details: { producer: { kernelId } },
});

/**
 * The visible warning when a fast render on the multi-threaded build failed for memory and was
 * rebuilt on the single-threaded build (D21). It is never silent: the result carries it.
 *
 * @param picoCode - The failure the multi build raised.
 * @returns The warning issue.
 */
const serialRetryIssue = (picoCode: PicoErrorCode): KernelIssue => ({
  message:
    picoCode === 'PICO_WASM_INIT_FAILED'
      ? "PicoVoxel's multi-threaded build could not start in this worker, so this render was rebuilt on the single-threaded build. The device may be short of memory for the shared heap; exports are unaffected."
      : "PicoVoxel's multi-threaded build ran out of WebAssembly memory, so this render was rebuilt on the single-threaded build. Increase voxelSize (cost grows with 1/voxelSize³) or shrink the model bounds to render multi-threaded again.",
  // A build that cannot start is a missing capability; one that ran out of memory hit a limit.
  code: picoCode === 'PICO_WASM_INIT_FAILED' ? 'KERNEL_CAPABILITY_MISSING' : 'RESOURCE_LIMIT',
  type: 'runtime',
  severity: 'warning',
  details: { producer: { kernelId }, picoCode, retry: 'PICOVOXEL_SERIAL_RETRY', from: 'multi', to: 'serial' },
});

/** Failures of a multi fast session that one serial rebuild may recover (D21). */
const serialRetryCodes: ReadonlySet<PicoErrorCode> = new Set<PicoErrorCode>([
  'PICO_OUT_OF_MEMORY',
  'PICO_WASM_INIT_FAILED',
]);

/**
 * Whether a failure leaves the runtime unusable: a WebAssembly trap (PicoVoxel maps a guarded one to
 * `PICO_OUT_OF_MEMORY`), after which the module is aborted and every later call would fail.
 *
 * @param error - The render failure.
 * @returns `true` when the runtime must be recycled.
 */
const isTrap = (error: unknown): boolean =>
  error instanceof WebAssembly.RuntimeError ||
  (error instanceof Error && error.cause instanceof WebAssembly.RuntimeError) ||
  (isPicoError(error) && error.code === 'PICO_OUT_OF_MEMORY');

/**
 * A superseded render's cancellation, which the framework recognises by name and must receive
 * unchanged (the realm-safe check `isRenderAbortedError` performs).
 *
 * @param error - The render failure.
 * @returns `true` for a cooperative abort.
 */
const isRenderAborted = (error: unknown): boolean => error instanceof Error && error.name === 'RenderAbortedError';

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
  builtinPackages: { picovoxel: picovoxelPackage },
  name: 'PicovoxelKernel',
  version: kernelVersion,
  optionsSchema: picovoxelOptionsSchema,
  evaluateOptionsSchema: picovoxelRenderSchema,
  views: { model: { title: 'Model', mimeType: 'model/gltf-binary', content: ['includeEdges', 'includeTopology'] } },
  // D21: every PicoVoxel call checks for a newer render first, so a superseded build stops between
  // native operations instead of running to completion.
  cancellation: 'cooperative',
  exports: {
    glb: {
      title: 'glTF binary',
      mimeType: 'model/gltf-binary',
      extension: 'glb',
      optionsSchema: picovoxelExportSchemas.glb,
      content: ['includeEdges', 'includeTopology'],
    },
    gltf: {
      title: 'glTF JSON',
      mimeType: 'model/gltf+json',
      extension: 'gltf',
      optionsSchema: picovoxelExportSchemas.gltf,
      content: ['includeEdges', 'includeTopology'],
    },
    stl: { title: 'STL', mimeType: 'model/stl', extension: 'stl', optionsSchema: picovoxelExportSchemas.stl },
  },

  async initialize(options, runtime): Promise<PicovoxelContext> {
    const root = await import('picovoxel');
    const authorResources = new Set<AuthorResource>();
    await registerPicovoxelModules(runtime, root, authorResources);
    const unavailable = multiUnavailableReason();
    runtime.logger.log(
      unavailable === undefined
        ? `PicoVoxel fast-lane WASM variant: ${options.wasm}`
        : `PicoVoxel fast-lane WASM variant: ${options.wasm} (multi-threaded build unavailable: ${unavailable})`,
    );
    return { root, wasm: options.wasm, runtimes: new Map(), authorResources };
  },

  async resolve({ entryPath }, runtime) {
    return runtime.bundler.resolveDependencies(entryPath);
  },

  async describe({ entryPath }, runtime) {
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
      return createKernelSuccess({
        parameters: createKernelParameterDeclaration(defaultParameters, jsonSchema, {
          id: 'urn:taucad:picovoxel:parameters',
          name: 'PicovoxelParameters',
        }),
      });
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

  async evaluate({ entryPath, parameters, options }, runtime, context) {
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
    const module = resolveModule(executeResult.value);

    const { lane } = options;
    const artifact = artifactFor(lane, context.wasm);
    if (artifact === 'multi') {
      // An explicit multi request that cannot be honoured fails visibly; it never falls back.
      const unavailable = multiUnavailableReason();
      if (unavailable !== undefined) {
        throw new PicovoxelBuildError([multiUnavailableIssue(unavailable)]);
      }
    }

    const build = async (
      sessionArtifact: PicovoxelArtifact,
    ): Promise<{ handle: PicovoxelNativeHandle; issues: KernelIssue[] }> => {
      let pico: Pico | undefined;
      let recycleReason: string | undefined;
      try {
        pico = await openSession(context, runtime, {
          artifact: sessionArtifact,
          lane,
          voxelSize: resolveVoxelSize(parameters),
        });
        runtime.logger.debug(
          `PicoVoxel session variant=${sessionArtifact} pthreads=${pico.module.PThread?.runningWorkers.length ?? 0} lane=${pico.lane}`,
        );
        const result = await runMain(module, withAbortChecks(pico), parameters);
        const nativeHandle = normalizeResult(result, lane);
        const { mechanism, issues } = await readMechanismExport({
          module,
          parameters,
          kernelId,
          formatError: (error) => {
            if (isRenderAborted(error)) {
              throw error;
            }
            if (isTrap(error)) {
              recycleReason = 'the mechanism trapped';
            }
            return buildIssue(error, { ...issueContext, session: { lane, artifact: sessionArtifact } });
          },
        });
        logSessionMemory(runtime.logger, pico, sessionArtifact);
        return {
          handle: {
            ...nativeHandle,
            ...(mechanism === undefined ? {} : { mechanism }),
            ...(issues.length > 0 ? { mechanismIssues: issues } : {}),
          },
          issues,
        };
      } catch (error) {
        if (isTrap(error)) {
          recycleReason = 'the build trapped';
        }
        throw error;
      } finally {
        const heapBytes = pico?.module.HEAPU8.byteLength ?? 0;
        if (!releaseRender(pico, context.authorResources)) {
          recycleReason ??= 'a session could not be disposed';
        }
        if (heapBytes > recycleHeapBytes) {
          recycleReason ??= `its heap reached ${heapBytes} bytes`;
        }
        if (recycleReason !== undefined) {
          await recycleRuntime(context, runtime.logger, { artifact: sessionArtifact, reason: recycleReason });
        }
      }
    };

    const fail = (error: unknown, sessionArtifact: PicovoxelArtifact, extra: readonly KernelIssue[] = []): never => {
      if (isRenderAborted(error)) {
        runtime.logger.debug(`PicoVoxel stopped a superseded build after ${buildCalls} PicoVoxel calls`);
        throw error;
      }
      throw new PicovoxelBuildError([
        buildIssue(error, { ...issueContext, session: { lane, artifact: sessionArtifact } }),
        ...extra,
      ]);
    };

    buildCalls = 0;
    try {
      return await build(artifact);
    } catch (error) {
      if (artifact !== 'multi' || !isPicoError(error) || !serialRetryCodes.has(error.code)) {
        return fail(error, artifact);
      }
      // D21: one serial rebuild, surfaced as a warning on the result; never a silent fallback.
      const warning = serialRetryIssue(error.code);
      runtime.logger.warn(warning.message, { data: { picoCode: error.code } });
      buildCalls = 0;
      try {
        const result = await build('serial');
        return { ...result, issues: [...result.issues, warning] };
      } catch (retryError) {
        return fail(retryError, 'serial', [warning]);
      }
    }
  },

  async render({ handle, content }) {
    let issues: KernelIssue[] = [];
    return {
      content: picovoxelToGlb(handle, {
        includeTopology: content?.includeTopology === true,
        onMechanismIssues: (warnings) => {
          issues = warnings;
        },
      }),
      issues,
    };
  },

  async onDispose(context) {
    const runtimes = await Promise.allSettled(context.runtimes.values());
    context.runtimes.clear();
    // Author resources left by module top-level code, then every started runtime; a teardown that
    // throws never stops the rest.
    for (const settled of runtimes) {
      if (settled.status === 'fulfilled') {
        context.authorResources.add(settled.value);
      }
    }
    releaseRender(undefined, context.authorResources);
  },

  serializeHandle({ handle }): PicovoxelSerializedHandle {
    // MessagePack retains Uint8Array but restores other typed arrays as raw bytes.
    return {
      ...handle,
      shapes: handle.shapes.map((shape) => ({
        ...shape,
        vertices: snapshotBytes(shape.vertices),
        triangles: snapshotBytes(shape.triangles),
      })),
    };
  },

  deserializeHandle({ serialized }) {
    if (!isRecordObject(serialized) || !Array.isArray(serialized.shapes)) {
      throw new TypeError('Invalid PicoVoxel serialized handle: expected a shapes array.');
    }
    const resources = snapshotResources(serialized);
    return {
      ...resources,
      ...(serialized.mechanism === undefined ? {} : { mechanism: snapshotJson(serialized.mechanism) }),
      ...(serialized.mechanismIssues === undefined
        ? {}
        : {
            mechanismIssues: mechanismIssuesSchema.parse(snapshotJson(serialized.mechanismIssues)),
          }),
      shapes: serialized.shapes.map((value: unknown, index): PicovoxelShapeSnapshot => {
        if (
          !isRecordObject(value) ||
          typeof value['name'] !== 'string' ||
          !(value['vertices'] instanceof Uint8Array) ||
          !(value['triangles'] instanceof Uint8Array) ||
          !isLane(value['lane'])
        ) {
          throw new TypeError(
            `Invalid PicoVoxel serialized shape ${index}: expected name, Uint8Array vertex/triangle bytes and an exact/fast lane.`,
          );
        }
        const name = resolveShapeName({ index, name: value['name'], source: 'authored' });
        const authoredName: unknown = value['authoredName'];
        if (
          authoredName !== undefined &&
          (typeof authoredName !== 'string' || !authoredName.trim() || authoredName.trim() !== name)
        ) {
          throw new TypeError(
            `Invalid PicoVoxel serialized shape ${index}: authoredName must match its nonblank display name.`,
          );
        }
        // MessagePack byte views need not be four-byte aligned; own them before interpreting scalars.
        const vertices = new Float32Array(restoredWords(value['vertices'], index, 'vertices'));
        const triangles = new Uint32Array(restoredWords(value['triangles'], index, 'triangles'));
        if (value['vertices'].byteLength % 12 !== 0 || value['triangles'].byteLength % 12 !== 0) {
          throw new TypeError(
            `Invalid PicoVoxel serialized shape ${index}: vertex/triangle bytes must contain scalar triples.`,
          );
        }
        const kept = validateMeshArrays({ vertices, triangles, label: `${name} (output ${index + 1})` });
        const material = snapshotMaterial(
          value['material'],
          `${name} (output ${index + 1})`,
          resources.textures?.length ?? 0,
        );
        return {
          name,
          vertices,
          triangles: kept,
          lane: value['lane'],
          ...(authoredName === undefined ? {} : { authoredName: name }),
          ...(material === undefined ? {} : { material }),
        };
      }),
    };
  },

  async export(input, _runtime, context) {
    const { shapes } = input.handle;
    switch (input.exportId) {
      case 'glb':
      case 'gltf': {
        // Checked against the handle too: fast provenance never passes for exact, whatever was asked.
        if (input.options.lane === 'fast' || shapes.some((shape) => shape.lane === 'fast')) {
          throw new PicovoxelBuildError([laneExportRefusal()]);
        }
        let issues: KernelIssue[] = [];
        const bytes = (input.exportId === 'gltf' ? picovoxelToGltf : picovoxelToGlb)(input.handle, {
          coordinateSystem: input.options.coordinateSystem,
          unit: input.options.unit,
          includeTopology: input.content?.includeTopology === true,
          onMechanismIssues: (warnings) => {
            issues = warnings;
          },
        });
        return {
          files: [createExportFile(input.exportId, `model.${input.exportId}`, asBuffer(bytes))],
          issues: [...(input.handle.mechanismIssues ?? []), ...issues],
        };
      }
      case 'stl': {
        if (shapes.length === 0) {
          throw new PicovoxelBuildError([noShapesIssue()]);
        }
        const { unit, scale, offset, lane } = input.options;
        const filenames = stlFilenames(shapes);
        return {
          files: nonemptyExportFiles(
            shapes.map((shape, index) =>
              createExportFile(
                'stl',
                filenames[index]!,
                // An explicit fast export is the consent: the header carries LANE=fast, as does any shape
                // with fast provenance. An exact export of an exact handle never stamps.
                // `acceptLane` is PicoVoxel's own form of that consent (rider R2).
                asBuffer(
                  lane === 'fast' || shape.lane === 'fast'
                    ? context.root.meshToStlBytes(
                        shape.vertices,
                        shape.triangles,
                        { unit, scale, offset, acceptLane: 'fast' },
                        'fast',
                      )
                    : context.root.meshToStlBytes(shape.vertices, shape.triangles, { unit, scale, offset }),
                ),
              ),
            ),
          ),
          issues: [...(input.handle.mechanismIssues ?? [])],
        };
      }
      default: {
        const exhaustive: never = input;
        throw new PicovoxelBuildError([
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
