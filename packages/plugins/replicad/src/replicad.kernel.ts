/**
 * Replicad Kernel Module
 *
 * Full defineKernel implementation for the Replicad kernel.
 * Uses runtime.bundler for JS/TS bundling and runtime.execute for evaluation.
 * Registers replicad as a built-in module and loads OpenCASCADE WASM for geometry.
 *
 * @see docs/policy/es-module-policy.md
 */

import type { OpenCascadeInstance } from 'replicad-opencascadejs';
import type { AnyShape } from 'replicad';
import type * as ReplicadModule from 'replicad';
import { contentDigest, digestContent } from '@taucad/cache-core';
import type { CacheValue, ComputeAction, ContentDigest } from '@taucad/cache-core';
import { createExportFile } from '@taucad/runtime/types';
import type { GeometrySvg, RuntimeSpanTracer, KernelIssue, KernelStackFrame } from '@taucad/runtime/types';
import { SourceMapConsumer } from 'source-map-js';
import type { RawSourceMap } from 'source-map-js';
import {
  asBuffer,
  jsonSchemaFromJson,
  defineKernel,
  getModuleRegistry,
  isRecordObject,
  extractDefaultParameters,
  registerKernelModule,
  toVmEntryPath,
  convertRawIssuesToKernelIssues,
  loadBinaryFile,
  createKernelLibraryTracer,
  defineLibraryTracePolicy,
  createKernelError,
  createKernelSuccess,
  createKernelParameterDeclaration,
  nonemptyExportFiles,
  applyLibrarySourceMaps,
  preserveExportNames,
  demangleStackFrames,
  classifyLibraryFrames,
  named,
} from '@taucad/runtime/kernel';
import type {
  KernelServices,
  RuntimeLogger,
  KernelLibraryTraceHandle,
  KernelLibraryTraceMode,
} from '@taucad/runtime/kernel';

import { replicadOptionsSchema, replicadRenderSchema, replicadExportSchemas } from '#replicad.schemas.js';

import {
  detectMultiThreadSupport,
  initOcct,
  activateOccParallelism,
  formatOcRuntimeError,
  runOcMain,
  resolveOcctModuleFactory,
  wrapOcWithTracing,
  wrapOcForExceptions,
} from '@taucad/occt-core';
import type { OcctModuleFactory, OcErrorContext, OcTracingSummary } from '@taucad/occt-core';

import { isDrawingShape, normalizeRenderShapes, render } from '#utils/render-output.js';
import * as tauReplicadAnnotations from '#annotations/index.js';
import { exportSTEP } from '#export/interface-export.js';
import {
  bindSourceComponentIds,
  resolvePublishedComponentBindings,
  placePublishedEntry,
  resolveEntryInterfaces,
  rotateNativeEntryToYup,
} from '#interface-resolution.js';
import type { NativeHandleEntry } from '#interface-resolution.js';
import type { GlbResources } from '@taucad/geometry-core';

import { convertReplicadGeometriesToGltf } from '#utils/replicad-to-gltf.js';
import { measureReplicadPhysical } from '#utils/physical-evidence.js';
import { createReplicadComputeReuse, replicadComputeNamespace, replicadModuleFacade } from '#replicad-compute-reuse.js';
import type { ReplicadComputeReuseAdapter } from '#replicad-compute-reuse.js';

import type { GeometryReplicad } from '#replicad.types.js';
import { replicadDetectPattern } from '#replicad.constants.js';
import { loadReplicadSingleWasm } from '#replicad-wasm-single-loader.js';
import { loadReplicadMultiWasm } from '#replicad-wasm-multi-loader.js';
import {
  createEmptyGlb,
  createEmptyGltf,
  resolveShapeName,
  validateGlbResources,
  readMechanismExport,
} from '@taucad/geometry-core';

/**
 * Live Replicad native handle: the shapes `main` returned, the model's GLB resources and the entry module's
 * `mechanism` export, normalised to plain JSON. All are export-facing evidence, so all survive a snapshot.
 */
type NativeHandle = GlbResources & { shapes: NativeHandleEntry[]; mechanism?: unknown; componentIdentityVersion?: 1 };
const liveShapeReferences = new WeakMap<NativeHandleEntry['shape'], number>();
const distinctShapes = (entries: readonly NativeHandleEntry[]) => new Set(entries.map(({ shape }) => shape));
const retainNativeHandle = (handle: NativeHandle): NativeHandle => {
  for (const shape of distinctShapes(handle.shapes)) {
    liveShapeReferences.set(shape, (liveShapeReferences.get(shape) ?? 0) + 1);
  }
  return handle;
};
const releaseShapeEntries = (entries: readonly NativeHandleEntry[], retained: boolean): void => {
  for (const shape of distinctShapes(entries)) {
    const remaining = retained ? (liveShapeReferences.get(shape) ?? 1) - 1 : 0;
    if (remaining > 0) {
      liveShapeReferences.set(shape, remaining);
      continue;
    }
    liveShapeReferences.delete(shape);
    try {
      shape.delete();
    } catch {
      // Authored code may already have released a returned native wrapper.
    }
  }
};

/**
 * Advertise the views and exports supported by one retained model.
 * @param handle - Evaluated Replicad shapes.
 * @returns Ordered view and export offers with stable authored drawing instances.
 * @internal
 */
export const offersFor = (
  handle: NativeHandle,
): {
  views: ReadonlyArray<'model' | 'drawing'>;
  exports: ReadonlyArray<'glb' | 'gltf'> | undefined;
  instances?: { drawing: ReadonlyArray<{ id: string; title: string }> };
} => {
  const drawings = handle.shapes.filter(({ shape }) => isDrawingShape(shape));
  const hasModel = handle.shapes.some(({ shape }) => !isDrawingShape(shape));
  const names = new Map<string, number>();
  for (const { name } of drawings) {
    if (name) {
      names.set(name, (names.get(name) ?? 0) + 1);
    }
  }
  const instances = drawings.flatMap(({ name }) => (name && names.get(name) === 1 ? [{ id: name, title: name }] : []));
  return {
    views: hasModel || drawings.length === 0 ? (drawings.length > 0 ? ['model', 'drawing'] : ['model']) : ['drawing'],
    exports: hasModel ? undefined : drawings.length === 0 ? ['glb', 'gltf'] : [],
    ...(drawings.length > 0 ? { instances: { drawing: instances } } : {}),
  };
};

const tracedStep = <T>(tracer: RuntimeSpanTracer, label: string, operation: () => T): T => {
  const span = tracer.startSpan(label);
  try {
    return operation();
  } finally {
    span.end();
  }
};

const tracedPhase = async <T>(
  tracer: RuntimeSpanTracer,
  label: string,
  operation: () => Promise<T> | T,
): Promise<T> => {
  const span = tracer.startSpan(label);
  try {
    return await operation();
  } finally {
    span.end();
  }
};

const geistRegularUrl = new URL('fonts/Geist-Regular.ttf', import.meta.url).href;
const replicadSourceMapUrl = new URL('sourcemaps/replicad.js.map', import.meta.url).href;
const replicadSingleWasmUrl = new URL(import.meta.resolve('replicad-opencascadejs/wasm')).href;
const replicadMultiWasmUrl = new URL(import.meta.resolve('replicad-opencascadejs/multi/wasm')).href;
const manifoldWasmUrl = new URL(import.meta.resolve('manifold-3d/manifold.wasm')).href;

// Content digests of the two shipped OCCT binaries. The digest of a shipped asset is a
// build-time constant, so reading and SHA-256ing 23 MB again at every init (~20 ms of cold
// start) only recovers these values. `asset-ownership.test.ts` recomputes both from the
// installed binaries and fails when the dependency moves.
const replicadWasmDigests = {
  single: 'sha256:ca354769b158aa38479e6fa59bc7511d0fa896059ce755a0cff85261a637ee6a',
  multi: 'sha256:31b1fdd375d8257218bdeb155f7aeaf34e074f8ddb01a815ea7ebfa85d4e6444',
} as const;
// 1.4.4 mints stored native/display component binding; the current multi-thread variant caps the OCCT pool at four.
const kernelVersion = '1.4.4';
// Native snapshot compatibility changes only with native codec/semantics, independently of display caches.
const nativeSnapshotCompatibilityVersion = '1.4.2';
const legacyNativeSnapshotCompatibilityVersion = '1.4.1';

// =============================================================================
// WASM variant selection
// =============================================================================

type WasmVariant = 'single' | 'multi';

// =============================================================================
// WASM resolution (two-tier dynamic import pattern)
// =============================================================================

/** Emscripten module factory returning the replicad-flavoured OpenCascade instance. */
type OpenCascadeModuleFactory = OcctModuleFactory<OpenCascadeInstance>;

type ResolvedWasm = {
  wasmUrl?: string;
  bindingsFactory: OpenCascadeModuleFactory;
  variant: WasmVariant | 'custom';
};

type WasmOption = 'auto' | 'single' | 'multi' | { wasmUrl: string; wasmBindingsUrl: string };

/**
 * Resolve the WASM variant into a concrete URL and loaded bindings factory.
 *
 * - **`'auto'`** (default): pick `'multi'` when SAB + cross-origin isolation
 *   are available, otherwise fall back to `'single'`.
 * - **`'single'`** / **`'multi'`**: pin the variant explicitly. Uses static
 *   loader imports plus exported package URLs for the raw `.wasm`
 *   binary so browser bundlers can see and emit the built-in assets.
 * - **Custom config** (`{ wasmUrl, wasmBindingsUrl }`): variable `import()` with
 *   `@vite-ignore` to bypass bundler analysis. Works in Node for any module format.
 *
 * @param wasm - variant tag or custom URL pair
 * @param logger - kernel logger (used for the auto-selection log line)
 * @param tracer - optional span tracer
 * @returns the resolved WASM URL, bindings factory, and concrete variant.
 */
async function resolveWasm(wasm: WasmOption, logger: RuntimeLogger, tracer?: RuntimeSpanTracer): Promise<ResolvedWasm> {
  const span = tracer?.startSpan('replicad.resolve-bindings', {
    variant: typeof wasm === 'string' ? wasm : 'custom',
  });

  try {
    if (typeof wasm !== 'string') {
      // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- dynamic import() with variable URL returns any
      const module_: Record<string, unknown> = await import(
        /* webpackIgnore: true */
        /* @vite-ignore */
        wasm.wasmBindingsUrl
      );
      return {
        wasmUrl: wasm.wasmUrl,
        bindingsFactory: resolveOcctModuleFactory<OpenCascadeInstance>(module_),
        variant: 'custom',
      };
    }

    let variant: WasmVariant;
    if (wasm === 'auto') {
      const detection = detectMultiThreadSupport();
      variant = detection.supported ? 'multi' : 'single';
      logger.log(`Replicad WASM variant auto-selected: ${variant} (${detection.reason})`);
    } else {
      variant = wasm;
    }

    if (variant === 'multi') {
      return {
        wasmUrl: replicadMultiWasmUrl,
        bindingsFactory: await loadReplicadMultiWasm(),
        variant: 'multi',
      };
    }

    return {
      wasmUrl: replicadSingleWasmUrl,
      bindingsFactory: await loadReplicadSingleWasm(),
      variant: 'single',
    };
  } finally {
    span?.end();
  }
}

/**
 * Identify the implementation assets that participate in compute-reuse identity.
 *
 * A built-in variant resolves to its constant digest; only a caller-supplied pair has no
 * build-time identity, so it alone is read and hashed. Returns undefined when a supplied
 * asset cannot be read, which leaves compute reuse without an implementation identity.
 *
 * @param variant - Concrete variant chosen by {@link resolveWasm}.
 * @param customUrls - Caller-supplied asset URLs, empty for the built-in variants.
 * @returns The asset digests, or undefined when they could not be identified.
 */
async function identifyImplementationAssets(
  variant: ResolvedWasm['variant'],
  customUrls: readonly string[],
): Promise<readonly ContentDigest[] | undefined> {
  if (variant !== 'custom') {
    return [contentDigest({ value: replicadWasmDigests[variant] })];
  }

  const loaded = await Promise.all(customUrls.map(async (url) => loadBinaryFile(url)));
  const present = loaded.filter((bytes): bytes is ArrayBuffer => bytes !== undefined);
  if (loaded.length === 0 || present.length !== loaded.length) {
    return undefined;
  }

  return Promise.all(present.map(async (bytes) => digestContent({ bytes: new Uint8Array(bytes) })));
}

// =============================================================================
// Types
// =============================================================================

type ReplicadContext = {
  openCascade: OpenCascadeInstance;
  replicadLibrary: ReplicadLibrary;
  tessellationInstancing: boolean;
  replicadInitialised: boolean;
  librarySourceMapCache: Map<string, SourceMapConsumer | undefined>;
  exportNameMap: Map<string, string>;
  libraryExportNames: Set<string>;
  tracingSummary?: OcTracingSummary;
  libraryTrace: KernelLibraryTraceHandle<ReplicadLibrary>;
  computeReuse: ReplicadComputeReuseAdapter<ReplicadLibrary> | undefined;
  computeProducer: ComputeAction['producer'];
  computeEnvironment: CacheValue;
  exactProviderVersion: string | undefined;
  legacyExactProviderVersion: string | undefined;
};

type ReplicadLibrary = typeof ReplicadModule;
const isMeshShape = (shape: unknown, library: ReplicadLibrary): shape is ReplicadModule.MeshShape =>
  shape instanceof library.MeshShape;
const manifoldInitializations = new WeakMap<ReplicadLibrary, Promise<void>>();
const ensureManifold = async (library: ReplicadLibrary): Promise<void> => {
  try {
    library.getManifold();
    return;
  } catch {
    // The Manifold WASM module is needed only for mesh import or restoration.
  }
  let initialization = manifoldInitializations.get(library);
  if (!initialization) {
    initialization = (async () => {
      const { default: createManifold } = await import('manifold-3d');
      library.setManifold(await createManifold({ locateFile: () => manifoldWasmUrl }));
    })();
    manifoldInitializations.set(library, initialization);
  }
  try {
    await initialization;
  } catch (error) {
    manifoldInitializations.delete(library);
    throw error;
  }
};
const serializeMeshShape = (shape: ReplicadModule.MeshShape) => {
  // Manifold documents getMesh() as the lossless input to a new Manifold(mesh).
  // Replicad's display mesh() recalculates normals and may split welded vertices.
  const mesh = shape.wrapped.getMesh();
  return {
    numProp: mesh.numProp,
    vertProperties: [...mesh.vertProperties],
    triVerts: [...mesh.triVerts],
    mergeFromVert: [...mesh.mergeFromVert],
    mergeToVert: [...mesh.mergeToVert],
    runIndex: [...mesh.runIndex],
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the native Manifold/Replicad API field name.
    runOriginalID: [...mesh.runOriginalID],
    runTransform: [...mesh.runTransform],
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the native Manifold/Replicad API field name.
    faceID: [...mesh.faceID],
    halfedgeTangent: [...mesh.halfedgeTangent],
    tolerance: mesh.tolerance,
  };
};
const restoreMeshShape = (
  mesh: ReturnType<typeof serializeMeshShape>,
  library: ReplicadLibrary,
): ReplicadModule.MeshShape => {
  const manifold = library.getManifold();
  const data = new manifold.Mesh({
    numProp: mesh.numProp,
    vertProperties: new Float32Array(mesh.vertProperties),
    triVerts: new Uint32Array(mesh.triVerts),
    mergeFromVert: new Uint32Array(mesh.mergeFromVert),
    mergeToVert: new Uint32Array(mesh.mergeToVert),
    runIndex: new Uint32Array(mesh.runIndex),
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the native Manifold/Replicad API field name.
    runOriginalID: new Uint32Array(mesh.runOriginalID),
    runTransform: new Float32Array(mesh.runTransform),
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the native Manifold/Replicad API field name.
    faceID: new Uint32Array(mesh.faceID),
    halfedgeTangent: new Float32Array(mesh.halfedgeTangent),
    tolerance: mesh.tolerance,
  });
  return new library.MeshShape(new manifold.Manifold(data));
};

// Match both the public package name (`replicad/`) and the aliased pnpm path
// (`@taulabs/replicad/`) — the package.json aliases `replicad` to the Tau fork,
// so the actual on-disk file lives at `node_modules/.pnpm/.../@taulabs/replicad/dist/replicad.js`
// while still being importable as `replicad`. Both patterns map to the `replicad`
// display name so source-mapped paths render as `replicad/src/...`.
const libraryPatterns = [
  { pattern: '@taulabs/replicad/', moduleName: 'replicad' },
  { pattern: 'node_modules/replicad/', moduleName: 'replicad' },
];

const replicadLibraryTracePolicy = defineLibraryTracePolicy({
  library: 'replicad',
  spanPrefix: 'replicad.library',
  summarySpanName: 'replicad.library.summary',
  traceCall(context) {
    if (context.scope !== 'user-main') {
      return { type: 'ignore' };
    }

    return { type: 'trace' };
  },
  shouldWrapValue(context) {
    return typeof context.value === 'function' || context.scope === 'user-main';
  },
});

// =============================================================================
// Error enrichment helpers
// =============================================================================

function resolveLibraryFrames(frames: KernelStackFrame[], context: ReplicadContext): KernelStackFrame[] {
  const mapped = applyLibrarySourceMaps(frames, libraryPatterns, (moduleName) => {
    return context.librarySourceMapCache.get(moduleName);
  });
  const demangled = demangleStackFrames(mapped, context.exportNameMap);
  return classifyLibraryFrames(demangled, context.libraryExportNames);
}

function buildErrorContext(
  context: ReplicadContext,
  options: { bundleSourceMap?: string; entryUrl?: string },
): OcErrorContext {
  return {
    bundleSourceMap: options.bundleSourceMap,
    entryUrl: options.entryUrl,
    applySecondarySourceMaps: (frames) => resolveLibraryFrames(frames, context),
  };
}

async function loadReplicadSourceMap(): Promise<SourceMapConsumer | undefined> {
  try {
    const json = await loadTextFile(replicadSourceMapUrl);
    if (!json) {
      return undefined;
    }

    const rawMap: unknown = JSON.parse(json);
    if (
      !isRecordObject(rawMap) ||
      !Array.isArray(rawMap['sources']) ||
      !rawMap['sources'].every((source) => typeof source === 'string') ||
      !Array.isArray(rawMap['names']) ||
      !rawMap['names'].every((name) => typeof name === 'string') ||
      typeof rawMap['mappings'] !== 'string'
    ) {
      return undefined;
    }
    const sourceMap: RawSourceMap = {
      version: String(rawMap['version']),
      sources: rawMap['sources'],
      names: rawMap['names'],
      mappings: rawMap['mappings'],
      ...(typeof rawMap['file'] === 'string' ? { file: rawMap['file'] } : {}),
      ...(typeof rawMap['sourceRoot'] === 'string' ? { sourceRoot: rawMap['sourceRoot'] } : {}),
      ...(Array.isArray(rawMap['sourcesContent']) &&
      rawMap['sourcesContent'].every((source) => typeof source === 'string')
        ? { sourcesContent: rawMap['sourcesContent'] }
        : {}),
    };
    return new SourceMapConsumer(sourceMap);
  } catch {
    return undefined;
  }
}

async function loadTextFile(url: string): Promise<string | undefined> {
  const bytes = await loadBinaryFile(url);
  return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
}

// =============================================================================
// Module registration helpers
// =============================================================================

function registerReplicadModule(
  runtime: KernelServices,
  tracedLibrary: ReplicadLibrary,
  replicadLibrary: ReplicadLibrary,
): void {
  registerKernelModule(runtime, {
    name: 'replicad',
    exports: {
      ...tracedLibrary,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the native Manifold/Replicad API field name.
      importSTLAsMesh: async (stlBlob: Blob) => {
        await ensureManifold(replicadLibrary);
        return tracedLibrary.importSTLAsMesh(stlBlob);
      },
    },
    version: '0.19.1',
    globalName: 'replicad',
  });
  registerKernelModule(runtime, {
    name: '@taucad/replicad/annotations',
    exports: { ...tauReplicadAnnotations },
    version: '0.19.1',
    globalName: 'tauReplicadAnnotations',
  });
}

// =============================================================================
// Module execution helpers
// =============================================================================

function extractDefaultName(module: unknown): string | undefined {
  if (!isRecordObject(module)) {
    return undefined;
  }

  return typeof module['defaultName'] === 'string' ? module['defaultName'] : undefined;
}

function getReplicadFirstArgument(): unknown {
  const registry = getModuleRegistry();
  return registry.get('replicad');
}

// =============================================================================
// Options schema
// =============================================================================

/**
 * Custom WASM configuration for injecting non-standard builds at runtime.
 * Primarily used for Node.js tooling (benchmarks, CI) via `file://` URLs.
 * @public
 */
export type ReplicadWasmConfig = {
  /** Absolute URL to the `.wasm` binary (typically `file://` in Node.js). */
  wasmUrl: string;
  /** Absolute URL to the Emscripten JS glue module (typically `file://` in Node.js). */
  wasmBindingsUrl: string;
};

/**
 * Configuration for the Replicad kernel, controlling WASM variant, OC tracing, and edge rendering.
 * @public
 */
export type ReplicadOptions = {
  /**
   * WASM build variant or custom build configuration.
   *
   * - `'auto'` (default) -- pick `'multi'` when `SharedArrayBuffer` is usable
   *   (Node 22+, or browsers with `crossOriginIsolated=true`); fall back to
   *   `'single'` otherwise.
   * - `'single'` -- pthread-free build; works without COOP/COEP headers.
   * - `'multi'` -- pthread-enabled build; requires SAB + cross-origin isolation.
   * - `ReplicadWasmConfig` -- custom WASM/JS URLs for runtime injection (Node tooling).
   *
   * @default 'auto'
   */
  wasm?: 'auto' | 'single' | 'multi' | ReplicadWasmConfig;
  /** OC API call tracing mode. 'summary' (default) emits aggregated stats, 'per-call' emits individual spans. */
  ocTracing?: 'off' | 'summary' | 'per-call';
  /** Replicad library call tracing mode for user code. Defaults to `off`. */
  libraryTracing?: KernelLibraryTraceMode;
  /**
   * Reuse prototype tessellation for repeated transformed Replicad shapes.
   *
   * Temporary diagnostic flag. Set to `false` to force the legacy
   * one-shape-one-tessellation path for benchmarks and regression isolation.
   *
   * @default true
   */
  tessellationInstancing?: boolean;
  /** Load library source maps for enriched error stack traces. Adds ~50ms to init. Defaults to `false`. */
  withSourceMapping?: boolean;
};

// =============================================================================
// Kernel module definition
// =============================================================================

/** @public */
export const replicadKernel = defineKernel({
  id: 'replicad',
  extensions: ['ts', 'js'],
  detectImport: replicadDetectPattern,
  builtinModuleNames: ['replicad', '@taucad/replicad/annotations'],
  name: 'ReplicadKernel',
  version: kernelVersion,
  optionsSchema: replicadOptionsSchema,
  views: {
    model: {
      title: 'Model',
      mimeType: 'model/gltf-binary',
      optionsSchema: replicadRenderSchema,
      content: ['includeEdges', 'includeTopology', 'includePhysical'],
    },
    drawing: { title: 'Drawing', mimeType: 'image/svg+xml', instances: true },
  },
  // D2: in-worker OpenCascade yields cooperatively, so a superseded drag render is abandoned, not killed.
  cancellation: 'cooperative',
  exports: {
    stl: { title: 'STL', mimeType: 'model/stl', extension: 'stl', optionsSchema: replicadExportSchemas.stl },
    step: { title: 'STEP', mimeType: 'application/step', extension: 'step', optionsSchema: replicadExportSchemas.step },
    glb: {
      title: 'glTF binary',
      mimeType: 'model/gltf-binary',
      extension: 'glb',
      optionsSchema: replicadExportSchemas.glb,
      content: ['includeEdges', 'includeTopology', 'includePhysical'],
    },
    gltf: {
      title: 'glTF JSON',
      mimeType: 'model/gltf+json',
      extension: 'gltf',
      optionsSchema: replicadExportSchemas.gltf,
      content: ['includeEdges', 'includeTopology', 'includePhysical'],
    },
  },
  async initialize(options, runtime): Promise<ReplicadContext> {
    const replicadModule = await import('replicad');
    const replicadLibrary = replicadModuleFacade(replicadModule);
    const { mangledToOriginal: exportNameMap, exportNames: libraryExportNames } = preserveExportNames(replicadModule);

    const { logger, tracer } = runtime;
    const {
      ocTracing,
      libraryTracing,
      withSourceMapping,
      tessellationInstancing,
      wasm,
      computeReuse: computeReuseOption,
    } = options;

    const wasmLabel = typeof wasm === 'string' ? wasm : 'custom';
    logger.debug(
      `Initializing OpenCASCADE WASM (ocTracing: ${ocTracing}, libraryTracing: ${libraryTracing}, wasm: ${wasmLabel})`,
    );

    const wasmSpan = tracer.startSpan('replicad.wasm-init');
    const resolved = await resolveWasm(wasm, logger, tracer);
    const compiledModule = resolved.wasmUrl ? runtime.getCompiledWasmModule(resolved.wasmUrl) : undefined;
    let openCascade = await initOcct(resolved.wasmUrl, resolved.bindingsFactory, {
      tracer,
      ...(compiledModule ? { compiledModule } : {}),
      print: (text) => {
        logger.trace('OCJS stdout', { data: { text } });
      },
      printErr: (text) => {
        logger.warn('OCJS stderr', { data: { text } });
      },
    });

    if (resolved.variant === 'multi') {
      /* oxlint-disable new-cap -- OCCT exposes callable C++ PascalCase methods. */
      const pool = openCascade.OSD_ThreadPool.DefaultPool(-1);
      try {
        if (pool.IsInUse()) {
          throw new Error('Cannot configure Replicad OCCT thread pool while it is in use');
        }
        // ponytail: cap OCCT threads to reduce parallel working sets; revisit after native batch memory is reduced.
        pool.Init(Math.min(pool.NbThreads(), 4));
      } finally {
        pool.delete();
      }
      /* oxlint-enable new-cap */
      activateOccParallelism(openCascade, logger);
    } else {
      logger.log(`Replicad OCCT initialised: variant=${resolved.variant} (single-threaded)`);
    }

    let tracingSummary: OcTracingSummary | undefined;

    if (ocTracing === 'summary' || ocTracing === 'per-call') {
      const traced = wrapOcWithTracing(openCascade, tracer, {
        mode: ocTracing,
      });
      openCascade = traced.tracedInstance;
      tracingSummary = traced.summary;
    } else {
      openCascade = wrapOcForExceptions(openCascade);
    }

    replicadLibrary.setOC(openCascade);
    wasmSpan.end();

    try {
      const fontSpan = tracer.startSpan('replicad.font-load');
      // The dependency declaration says this is always present, but its registry lookup returns undefined before load.
      if (Object.is(replicadLibrary.getFont('default'), undefined)) {
        logger.debug('Loading default font for text rendering');
        const fontData = await loadBinaryFile(geistRegularUrl);
        if (!fontData) {
          throw new Error('Default font file not found');
        }
        await replicadLibrary.loadFont(fontData, 'default');
      }
      fontSpan.end();
    } catch (error) {
      logger.warn('Failed to load default font', { data: error });
    }

    // Off constructs nothing: no asset read, no digest, no adapter (D14, I13, A5).
    const identifiedAssets =
      computeReuseOption === false
        ? undefined
        : await identifyImplementationAssets(
            resolved.variant,
            typeof wasm === 'string' ? [] : [wasm.wasmUrl, wasm.wasmBindingsUrl],
          );
    const assetsIdentified = identifiedAssets !== undefined;
    // Explicit off wins; omission keeps the historical asset-derived default (C2).
    const computeReuseEnabled = computeReuseOption ?? assetsIdentified;
    const implementationAssets = identifiedAssets ?? [];
    if (!assetsIdentified && computeReuseOption !== false) {
      logger.warn('Replicad semantic compute reuse disabled because implementation assets could not be identified.');
    }
    const computeProducer = {
      id: '@taucad/replicad',
      version: 'replicad@1.1.0-taulabs.0|replicad-opencascadejs@0.23.0-beta.0|adapter@1',
      implementationAssets,
    };
    const computeEnvironment = {
      wasmVariant: resolved.variant,
      lengthUnit: 'millimeter',
    };
    const snapshotProviderVersion = (version: string): string | undefined =>
      identifiedAssets && identifiedAssets.length > 0
        ? JSON.stringify({
            kernelVersion: version,
            producer: computeProducer.version,
            wasmVariant: resolved.variant,
            assets: identifiedAssets,
          })
        : undefined;
    // Explicit legacy compatibility uses the same verified implementation assets, units and producer.
    const exactProviderVersion = snapshotProviderVersion(nativeSnapshotCompatibilityVersion);
    const legacyExactProviderVersion = snapshotProviderVersion(legacyNativeSnapshotCompatibilityVersion);
    const computeReuse = computeReuseEnabled
      ? createReplicadComputeReuse({
          library: replicadLibrary,
          enabled: true,
          producer: computeProducer,
          environment: computeEnvironment,
        })
      : undefined;
    const libraryTrace = createKernelLibraryTracer({
      library: computeReuse?.library ?? replicadLibrary,
      tracer,
      mode: libraryTracing,
      policy: replicadLibraryTracePolicy,
      defaultScope: 'kernel-setup',
    });
    registerReplicadModule(runtime, libraryTrace.tracedLibrary, replicadLibrary);

    const librarySourceMapCache = new Map<string, SourceMapConsumer | undefined>();
    if (withSourceMapping) {
      try {
        const sourceMapSpan = tracer.startSpan('replicad.source-map-load');
        const consumer = await loadReplicadSourceMap();
        if (consumer) {
          librarySourceMapCache.set('replicad', consumer);
          logger.debug('Loaded replicad library source map for error diagnostics');
        }

        sourceMapSpan.end();
      } catch {
        // Source map loading is best-effort — errors are still enriched without it
      }
    }

    logger.debug('Replicad kernel initialized');

    return {
      openCascade,
      replicadLibrary,
      tessellationInstancing,
      replicadInitialised: true,
      librarySourceMapCache,
      exportNameMap,
      libraryExportNames,
      tracingSummary,
      libraryTrace,
      computeReuse,
      computeProducer,
      computeEnvironment,
      exactProviderVersion,
      legacyExactProviderVersion,
    };
  },

  async resolve({ entryPath }, runtime) {
    return runtime.bundler.resolveDependencies(entryPath);
  },

  async describe({ entryPath }, runtime, context) {
    const relativeFilePath = toVmEntryPath(entryPath);
    let bundleSourceMap: string | undefined;
    let entryUrl: string | undefined;
    try {
      const bundleResult = await runtime.bundler.bundle(entryPath);
      if (!bundleResult.success) {
        return createKernelError(convertRawIssuesToKernelIssues(bundleResult.issues, relativeFilePath));
      }
      bundleSourceMap = bundleResult.sourceMap;

      const executeResult = await runtime.execute(bundleResult.code);
      if (!executeResult.success) {
        return createKernelError(convertRawIssuesToKernelIssues(executeResult.issues, relativeFilePath));
      }
      entryUrl = executeResult.entryUrl;

      const defaultParameters = extractDefaultParameters(executeResult.value);
      const jsonSchema = await jsonSchemaFromJson(defaultParameters);

      return createKernelSuccess({
        parameters: createKernelParameterDeclaration(defaultParameters, jsonSchema, {
          id: 'urn:taucad:replicad:parameters',
          name: 'ReplicadParameters',
        }),
      });
    } catch (error) {
      const issue = formatOcRuntimeError(
        error,
        context.openCascade,
        buildErrorContext(context, { bundleSourceMap, entryUrl }),
      );
      return createKernelError([issue]);
    }
  },

  async evaluate({ entryPath, parameters }, runtime, context: ReplicadContext) {
    const { tracer } = runtime;
    const relativeFilePath = toVmEntryPath(entryPath);
    let bundleSourceMap: string | undefined;
    let entryUrl: string | undefined;

    try {
      const bundleResult = await runtime.bundler.bundle(entryPath);
      if (!bundleResult.success) {
        throw new ReplicadBuildError(convertRawIssuesToKernelIssues(bundleResult.issues, relativeFilePath));
      }
      bundleSourceMap = bundleResult.sourceMap;

      const buildGeometry = named('Object.createGeometry', async () => {
        const executeResult = await runtime.execute(bundleResult.code);
        if (!executeResult.success) {
          throw new ReplicadBuildError(convertRawIssuesToKernelIssues(executeResult.issues, relativeFilePath));
        }
        entryUrl = executeResult.entryUrl;

        // The module shares Replicad's OC registration with other in-process clients.
        context.replicadLibrary.setOC(context.openCascade);
        const mainResult = await tracedPhase(tracer, 'create.runOcMain', async () => {
          const mainSpan = tracer.startSpan('replicad.run-main', {
            phase: 'computingGeometry',
            stage: 'brep',
          });
          try {
            return await context.libraryTrace.runInScope({
              scope: 'user-main',
              operation: async () =>
                runOcMain({
                  module: executeResult.value,
                  parameters,
                  ocInstance: context.openCascade,
                  errorContext: buildErrorContext(context, {
                    bundleSourceMap,
                    entryUrl,
                  }),
                  firstArg: getReplicadFirstArgument(),
                }),
            });
          } finally {
            context.libraryTrace.emitSummary();
            context.tracingSummary?.flush();
            mainSpan.end();
          }
        });

        if (!mainResult.success) {
          throw new ReplicadBuildError(mainResult.issues);
        }

        const traced = context.libraryTrace.unwrap(mainResult.value);
        const shapes = context.computeReuse ? context.computeReuse.unwrap(traced) : traced;

        if (shapes === undefined) {
          runtime.logger.warn('createGeometry returning empty: main-returned-undefined', {
            data: { filePath: relativeFilePath },
          });
          const handle: NativeHandle = { shapes: [] };
          return { handle, ...offersFor(handle) };
        }

        const model = isRecordObject(shapes) && 'shapes' in shapes ? shapes : undefined;
        if (model && !Array.isArray(model['shapes'])) {
          throw new TypeError('Model.shapes must be an array of shape configurations.');
        }
        const modelShapes = model?.['shapes'];
        if (model) {
          validateGlbResources(model);
        }
        const defaultName = extractDefaultName(executeResult.value);
        context.replicadLibrary.setOC(context.openCascade);
        const { mechanism, issues } = await readMechanismExport({
          module: executeResult.value,
          parameters,
          kernelId: 'replicad',
          formatError: (error) =>
            formatOcRuntimeError(error, context.openCascade, buildErrorContext(context, { bundleSourceMap, entryUrl })),
        });

        context.replicadLibrary.setOC(context.openCascade);
        // Build phase ends here: normalize main() output and resolve GeoSpec
        // interfaces (pure BRep queries) onto the nativeHandle. The handle carries
        // all export-facing evidence — tessellation is deferred to meshGeometry
        // and never runs on a BRep-only export path.
        const entries: NativeHandleEntry[] = await tracedPhase(tracer, 'create.resolveInterfaces', () => {
          const interfaceSpan = tracer.startSpan('replicad.resolve-interfaces', {
            phase: 'computingGeometry',
            stage: 'brep',
          });
          try {
            return bindSourceComponentIds(
              normalizeRenderShapes(model ? modelShapes : shapes, defaultName).map((entry) =>
                resolveEntryInterfaces(entry, context.replicadLibrary),
              ),
            );
          } finally {
            interfaceSpan.end();
          }
        });

        runtime.signal.throwIfAborted();
        const handle: NativeHandle = {
          shapes: entries,
          componentIdentityVersion: 1,
          mechanism,
          ...(model ? { images: model.images, textures: model.textures, samplers: model.samplers } : {}),
        };
        return { handle: retainNativeHandle(handle), issues, ...offersFor(handle) };
      });

      if (runtime.compute.status !== 'on' || !context.computeReuse) {
        // Off arm: no scope, no recipe, no announcement, no publication tail.
        return await buildGeometry();
      }
      const computeScope = runtime.compute.openScope({
        namespace: replicadComputeNamespace,
        producer: context.computeProducer,
        environment: context.computeEnvironment,
        discovery: { entryPath },
        resident: context.computeReuse.resident,
      });
      let outcome: 'delivered' | 'failed' = 'failed';
      try {
        const built = await context.computeReuse.run(computeScope, buildGeometry);
        outcome = 'delivered';
        return built;
      } finally {
        // Seals metadata only; the runtime permits the tail after actual delivery.
        computeScope.close({ outcome });
      }
    } catch (error) {
      if (error instanceof ReplicadBuildError) {
        throw error;
      }

      const issue = formatOcRuntimeError(
        error,
        context.openCascade,
        buildErrorContext(context, { bundleSourceMap, entryUrl }),
      );
      throw new ReplicadBuildError([issue]);
    }
  },

  async render(input, runtime, context) {
    context.replicadLibrary.setOC(context.openCascade);
    const { handle } = input;
    if (input.view === 'drawing') {
      const drawings = handle.shapes.filter(({ shape }) => isDrawingShape(shape));
      const selected = input.instance === undefined ? drawings : drawings.filter(({ name }) => name === input.instance);
      if (selected.length === 0) {
        throw new Error(`Drawing instance '${String(input.instance)}' is unavailable.`);
      }
      const rendered = render(
        selected.map((entry, index) => ({
          ...entry,
          name: resolveShapeName({ index, name: entry.name, source: 'authored' }),
        })),
      );
      const drawing = rendered.find((artifact): artifact is GeometrySvg => artifact.format === 'svg');
      if (drawing === undefined) {
        throw new Error('Drawing render produced no SVG artifact.');
      }
      return { content: drawing.content, units: drawing.units };
    }
    const { options, content } = input;
    const { tracer } = runtime;
    const modelShapes = handle.shapes.filter(({ shape }) => !isDrawingShape(shape));
    if (modelShapes.length === 0) {
      return { content: asBuffer(createEmptyGlb()) };
    }

    try {
      const { tessellation } = options;
      const includeEdges = content?.includeEdges === true;
      const includePhysical = content?.includePhysical === true;
      const includeTopology = content?.includeTopology === true || includePhysical;
      let mechanismIssues: KernelIssue[] = [];
      const namedShapes = await Promise.all(
        modelShapes.map(async (entry, index) => ({
          ...entry,
          name: resolveShapeName({ index, name: entry.name, source: 'authored' }),
          ...(includePhysical ? { physical: await measureReplicadPhysical(entry, context.openCascade) } : {}),
        })),
      );

      context.replicadLibrary.setOC(context.openCascade);

      let renderMode: 'flat' | 'tessellation-instanced' | 'mixed' = 'flat';
      const renderedShapes = await tracedPhase(tracer, 'mesh.renderDisplayTessellation', () => {
        const renderOutputSpan = tracer.startSpan('replicad.render-output', {
          phase: 'computingGeometry',
          stage: 'render-output',
        });
        try {
          return context.libraryTrace.runInScope({
            scope: 'render-output',
            operation: () =>
              render(namedShapes, {
                tessellation,
                collectBrepEdges: includeEdges || includeTopology,
                openCascade: context.openCascade,
                tessellationInstancing: context.tessellationInstancing,
                tracer,
                onRenderMode(mode) {
                  renderMode = mode;
                },
              }),
          });
        } finally {
          renderOutputSpan.end({ renderMode });
        }
      });

      const shapes3d = renderedShapes.filter((shape): shape is GeometryReplicad => shape.format === 'replicad');
      if (shapes3d.length === 0) {
        runtime.logger.warn('meshGeometry returning empty: render-output-filtered-empty', {
          data: {
            rawShapeCount: modelShapes.length,
            renderedShapeCount: renderedShapes.length,
          },
        });
        return { content: asBuffer(createEmptyGlb()) };
      }

      const gltfBlob = await tracedPhase(tracer, 'mesh.packGltf', () => {
        const gltfSpan = tracer.startSpan('replicad.mesh-to-gltf', {
          shapeCount: shapes3d.length,
          phase: 'computingGeometry',
          stage: 'gltf-pack',
        });
        try {
          return convertReplicadGeometriesToGltf({
            images: handle.images,
            textures: handle.textures,
            samplers: handle.samplers,
            geometries: includeEdges
              ? shapes3d
              : shapes3d.map((geometry) => ({
                  ...geometry,
                  edges: { ...geometry.edges, lines: [] },
                })),
            format: 'glb',
            includeTauTopology: includeTopology,
            logger: runtime.logger,
            mechanism: handle.mechanism,
            onMechanismIssues(issues) {
              mechanismIssues = issues;
            },
          });
        } finally {
          gltfSpan.end();
        }
      });
      return { content: gltfBlob, issues: mechanismIssues };
    } catch (error) {
      const issue = formatOcRuntimeError(error, context.openCascade, buildErrorContext(context, {}));
      throw new ReplicadBuildError([issue]);
    }
  },

  async export(input, runtime, context) {
    // Replicad resolves native calls through a module-global OC binding. Another in-process client may have initialized since this handle was built.
    context.replicadLibrary.setOC(context.openCascade);
    return context.libraryTrace.runInScope({
      scope: 'export',
      operation: async () => {
        const { exportId, handle } = input;
        const { shapes: entries, mechanism } = handle;
        const emptyGltfExport = (format: 'glb' | 'gltf') => ({
          files: [
            createExportFile(
              format,
              format === 'glb' ? 'model.glb' : 'model.gltf',
              asBuffer(format === 'glb' ? createEmptyGlb() : createEmptyGltf()),
            ),
          ] as const,
        });
        const noGeometryExportError = (): never => {
          throw new ReplicadBuildError([
            { message: 'No geometry available for export', code: 'RUNTIME', type: 'runtime', severity: 'error' },
          ]);
        };
        const stepExportError = (error: unknown): never => {
          throw new ReplicadBuildError([
            {
              message: error instanceof Error ? error.message : String(error),
              code: 'RUNTIME',
              type: 'runtime',
              severity: 'error',
            },
          ]);
        };

        switch (exportId) {
          case 'glb':
          case 'gltf': {
            const { options, content } = input;
            if (entries.length === 0) {
              return emptyGltfExport(exportId);
            }

            const { linearTolerance, angularTolerance } = options.tessellation;
            const { coordinateSystem, unit } = options;
            const includePhysical = content?.includePhysical === true;
            const namedShapes = await Promise.all(
              entries.map(async (shapeConfig, index) => ({
                ...shapeConfig,
                name: resolveShapeName({
                  index,
                  name: shapeConfig.name,
                  source: 'generated',
                }),
                ...(includePhysical
                  ? { physical: await measureReplicadPhysical(shapeConfig, context.openCascade) }
                  : {}),
              })),
            );
            context.replicadLibrary.setOC(context.openCascade);
            const renderedShapes = await tracedPhase(runtime.tracer, 'export.renderGlbTessellation', () =>
              render(namedShapes, {
                tessellation: { linearTolerance, angularTolerance },
                collectBrepEdges: content?.includeEdges === true || content?.includeTopology === true,
                openCascade: context.openCascade,
                tessellationInstancing: context.tessellationInstancing,
                tracer: runtime.tracer,
              }),
            );
            const temporaryShapes = renderedShapes.filter(
              (shape): shape is GeometryReplicad => shape.format === 'replicad',
            );

            if (temporaryShapes.length === 0) {
              return emptyGltfExport(exportId);
            }

            let mechanismIssues: KernelIssue[] = [];
            const gltfData = await tracedPhase(runtime.tracer, 'export.packGltf', () =>
              convertReplicadGeometriesToGltf({
                images: handle.images,
                textures: handle.textures,
                samplers: handle.samplers,
                geometries:
                  content?.includeEdges === true
                    ? temporaryShapes
                    : temporaryShapes.map((geometry) => ({
                        ...geometry,
                        edges: { ...geometry.edges, lines: [] },
                      })),
                format: exportId,
                includeTauTopology: content?.includeTopology === true || includePhysical,
                logger: runtime.logger,
                coordinateSystem,
                unit,
                mechanism,
                onMechanismIssues(issues) {
                  mechanismIssues = issues;
                },
              }),
            );
            return {
              files: [
                createExportFile(exportId, exportId === 'glb' ? 'model.glb' : 'model.gltf', asBuffer(gltfData)),
              ] as const,
              issues: mechanismIssues,
            };
          }

          case 'step': {
            const { options } = input;
            if (entries.length === 0) {
              return noGeometryExportError();
            }

            const brepEntries = entries.filter(
              (entry): entry is NativeHandleEntry & { shape: AnyShape } =>
                entry.shape instanceof context.replicadLibrary.Shape,
            );
            if (brepEntries.length !== entries.length) {
              return stepExportError(
                new TypeError('STEP export requires native BRep shapes; imported meshes are display-only.'),
              );
            }

            const { coordinateSystem } = options;

            const shapes =
              coordinateSystem === 'y-up' ? brepEntries.map((entry) => rotateNativeEntryToYup(entry)) : brepEntries;

            let stepBlob: Blob;
            try {
              stepBlob = await tracedPhase(runtime.tracer, 'export.exportSTEP', () =>
                exportSTEP(context.openCascade, shapes, {
                  phase: (label, operation) => tracedStep(runtime.tracer, label, operation),
                }),
              );
            } catch (error) {
              return stepExportError(error);
            }
            const stepBytes = new Uint8Array(await stepBlob.arrayBuffer());
            return { files: [createExportFile('step', 'assembly', stepBytes)] as const };
          }

          case 'stl': {
            const { options } = input;
            if (entries.length === 0) {
              return noGeometryExportError();
            }

            const { linearTolerance, angularTolerance } = options.tessellation;
            const angularToleranceRad = angularTolerance * (Math.PI / 180);
            const { coordinateSystem } = options;

            const shapes =
              coordinateSystem === 'y-up'
                ? entries.map((s) => ({
                    ...s,
                    shape: s.shape.clone().rotate(-90, [0, 0, 0], [1, 0, 0]),
                  }))
                : entries;

            const result = await Promise.all(
              shapes.map(async ({ shape, name }, index) => {
                const bytes = await buildExportBytes(
                  shape,
                  {
                    tolerance: linearTolerance,
                    angularTolerance: angularToleranceRad,
                    binary: options.binary,
                  },
                  context.replicadLibrary,
                );
                return createExportFile('stl', resolveShapeName({ index, name, source: 'generated' }), bytes);
              }),
            );
            return { files: nonemptyExportFiles(result) };
          }

          default: {
            const _exhaustive: never = exportId;
            throw new ReplicadBuildError([
              {
                message: `Unsupported export format: ${String(_exhaustive)}`,
                code: 'KERNEL_CAPABILITY_MISSING',
                type: 'runtime',
                severity: 'error',
              },
            ]);
          }
        }
      },
    });
  },

  serializeHandle({ handle }, runtime, context) {
    context.replicadLibrary.setOC(context.openCascade);
    return tracedStep(runtime.tracer, 'create.serializeNativeHandle', () =>
      handle.shapes.every(
        ({ shape }) => shape instanceof context.replicadLibrary.Shape || isMeshShape(shape, context.replicadLibrary),
      )
        ? serializeReplicadHandle(handle, context.replicadLibrary)
        : undefined,
    );
  },

  async deserializeHandle({ serialized }, _runtime, context): Promise<NativeHandle> {
    if (!serialized) {
      throw new TypeError('Replicad native-handle snapshot is unavailable.');
    }
    if (serialized.shapes.some((entry) => entry.kind === 'mesh')) {
      await ensureManifold(context.replicadLibrary);
    }
    context.replicadLibrary.setOC(context.openCascade);
    const shapes: NativeHandleEntry[] = [];
    try {
      for (const entry of serialized.shapes) {
        shapes.push({
          shape:
            entry.kind === 'brep'
              ? context.replicadLibrary.deserializeShape(entry.brep)
              : restoreMeshShape(entry.mesh, context.replicadLibrary),
          ...entry.metadata,
        });
      }
      return retainNativeHandle({ ...serialized, shapes });
    } catch (error) {
      releaseShapeEntries(shapes, false);
      throw error;
    }
  },

  async composeHandles({ occurrences }, _runtime, context): Promise<NativeHandle> {
    context.replicadLibrary.setOC(context.openCascade);
    const shapes: NativeHandleEntry[] = [];
    try {
      // Preflight every identity join before native cloning; legacy ordinary composition keeps its prior route.
      const canonicalIds = new Set<string>();
      const bound = occurrences.map((occurrence) => {
        if (occurrence.components === undefined && occurrence.displaySourceComponentIds === undefined) {
          return occurrence.handle.shapes.map((entry) => ({
            entry,
            worldTransform: occurrence.worldTransform,
            occurrencePath: occurrence.occurrencePath,
          }));
        }
        return resolvePublishedComponentBindings(occurrence).map(({ entry, placement }) => {
          if (canonicalIds.has(placement.componentId)) {
            throw new TypeError('Pinned canonical component IDs are duplicated across occurrences.');
          }
          canonicalIds.add(placement.componentId);
          return {
            entry,
            worldTransform: placement.worldTransform,
            occurrencePath: occurrence.occurrencePath,
            componentId: placement.componentId,
          };
        });
      });
      for (const entries of bound) {
        for (const entry of entries) {
          shapes.push(placePublishedEntry({ ...entry, library: context.replicadLibrary, oc: context.openCascade }));
        }
      }
      return retainNativeHandle({ shapes });
    } catch (error) {
      releaseShapeEntries(shapes, false);
      throw error;
    }
  },

  describeHandleSnapshot({ serialized }, _runtime, context) {
    if (
      !context.exactProviderVersion ||
      !serialized ||
      serialized.shapes.length === 0 ||
      serialized.shapes.some((entry) => entry.kind !== 'brep' || entry.brep.length === 0)
    ) {
      return undefined;
    }
    // Only the historical absence of the marker is codec-v1; an explicit unknown/invalid marker is not legacy.
    const hasIdentityVersion = Object.hasOwn(serialized, 'componentIdentityVersion');
    if (hasIdentityVersion && serialized.componentIdentityVersion !== 1) {
      return undefined;
    }
    const bound = hasIdentityVersion;
    if (bound) {
      const ids = serialized.shapes.map(({ metadata }) => metadata.sourceComponentId);
      if (ids.some((id) => typeof id !== 'string' || id.length === 0) || new Set(ids).size !== ids.length) {
        return undefined;
      }
    }
    const providerVersion = bound ? context.exactProviderVersion : context.legacyExactProviderVersion;
    if (!providerVersion) {
      return undefined;
    }
    return {
      provider: '@taucad/replicad',
      providerVersion,
      codec: 'replicad.native-handle-msgpack',
      codecVersion: bound ? '2' : '1',
      unit: 'millimeter',
      linearToleranceMm: 0,
      angularToleranceRad: 0,
    };
  },
  releaseHandle({ handle }) {
    releaseShapeEntries(handle.shapes, true);
  },
});

const serializeReplicadHandle = (nativeHandle: NativeHandle, library: ReplicadLibrary) => ({
  ...(nativeHandle.componentIdentityVersion === 1 ? ({ componentIdentityVersion: 1 } as const) : {}),
  ...(nativeHandle.images === undefined ? {} : { images: nativeHandle.images }),
  ...(nativeHandle.textures === undefined ? {} : { textures: nativeHandle.textures }),
  ...(nativeHandle.samplers === undefined ? {} : { samplers: nativeHandle.samplers }),
  shapes: nativeHandle.shapes.map((entry) => ({
    ...(isMeshShape(entry.shape, library)
      ? ({
          kind: 'mesh',
          mesh: serializeMeshShape(entry.shape),
        } as const)
      : ({ kind: 'brep', brep: entry.shape.serialize() } as const)),
    metadata: {
      ...(entry.sourceComponentId === undefined ? {} : { sourceComponentId: entry.sourceComponentId }),
      ...(entry.name === undefined ? {} : { name: entry.name }),
      ...(entry.color === undefined ? {} : { color: entry.color }),
      ...(entry.opacity === undefined ? {} : { opacity: entry.opacity }),
      ...(entry.metalness === undefined ? {} : { metalness: entry.metalness }),
      ...(entry.roughness === undefined ? {} : { roughness: entry.roughness }),
      ...(entry.material === undefined ? {} : { material: entry.material }),
      ...(entry.density === undefined ? {} : { density: entry.density }),
      ...(entry.resolvedInterfaces === undefined ? {} : { resolvedInterfaces: entry.resolvedInterfaces }),
    },
  })),
  ...(nativeHandle.mechanism === undefined ? {} : { mechanism: nativeHandle.mechanism }),
});

async function buildExportBytes(
  shape: AnyShape | ReplicadModule.MeshShape,
  tessellation: {
    tolerance: number;
    angularTolerance: number;
    binary?: boolean;
  },
  library: ReplicadLibrary,
): Promise<Uint8Array<ArrayBuffer>> {
  const blob = isMeshShape(shape, library)
    ? shape.blobSTL({ binary: tessellation.binary })
    : shape.blobSTL(tessellation.binary ? { ...tessellation, binary: true } : tessellation);
  return new Uint8Array(await blob.arrayBuffer());
}

class ReplicadBuildError extends Error {
  public readonly issues: KernelIssue[];
  public constructor(issues: KernelIssue[]) {
    super(issues.map((index) => index.message).join('; '));
    this.issues = issues;
  }
}
