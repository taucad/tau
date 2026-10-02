/**
 * Replicad Kernel Module
 *
 * Full defineKernel implementation for the Replicad kernel.
 * Uses runtime.bundler for JS/TS bundling and runtime.execute for evaluation.
 * Registers replicad as a built-in module and loads OpenCASCADE WASM for geometry.
 *
 * @see docs/policy/es-module-policy.md
 */

import * as replicad from 'replicad';
import type { OpenCascadeInstance } from 'replicad-opencascadejs';
import type { GeometryGltf, GeometrySvg } from '@taucad/types';
import { SourceMapConsumer } from 'source-map-js';
import { asBuffer } from '@taucad/utils/file';
import { jsonSchemaFromJson } from '@taucad/utils/schema';
import { createExportFile } from '@taucad/types/constants';
import { defineKernel } from '#types/runtime-kernel.types.js';
import type { KernelRuntime, RuntimeLogger } from '#types/runtime-kernel.types.js';
import {
  replicadOptionsSchema,
  replicadRenderSchema,
  replicadExportSchemas,
} from '#kernels/replicad/replicad.schemas.js';
import {
  KERNEL_MODULES_KEY,
  getModuleRegistry,
  isRecordObject,
  extractDefaultParameters,
  resolveToRelative,
  convertRawIssuesToKernelIssues,
  loadBinaryFile,
} from '#kernels/kernel-module-helpers.js';
import type { RuntimeModuleExports } from '#kernels/kernel-module-helpers.js';
import type { RuntimeSpanTracer } from '#types/runtime-tracer.types.js';
import type { KernelIssue, KernelStackFrame } from '#types/runtime.types.js';
import { createKernelError, createKernelSuccess } from '#kernels/kernel-helpers.js';
import { isNode, resolveFileUrl } from '#framework/environment.js';
import { initOcct } from '#kernels/occt/oc-init.js';
import type { OcctModuleFactory } from '#kernels/occt/oc-init.js';
import { detectMultiThreadSupport, activateOccParallelism } from '#kernels/occt/oc-threading.js';
import { resolveCjsDefault } from '#kernels/replicad/utils/resolve-cjs-default.js';
import { formatOcRuntimeError } from '#kernels/occt/oc-error-formatter.js';
import type { OcErrorContext } from '#kernels/occt/oc-error-formatter.js';
import { runOcMain } from '#kernels/occt/oc-run-main.js';
import { wrapOcWithTracing, wrapOcForExceptions } from '#kernels/occt/oc-tracing.js';
import type { OcTracingSummary } from '#kernels/occt/oc-tracing.js';
import {
  applyLibrarySourceMaps,
  preserveExportNames,
  demangleStackFrames,
  classifyLibraryFrames,
} from '#framework/error-enrichment.js';
import { renderOutput } from '#kernels/replicad/utils/render-output.js';
import { convertReplicadGeometriesToGltf } from '#kernels/replicad/utils/replicad-to-gltf.js';
import type { InputShape, MainResultShapes } from '#kernels/replicad/utils/render-output.js';
import type { GeometryReplicad } from '#kernels/replicad/replicad.types.js';

const geistRegularUrl = new URL('fonts/Geist-Regular.ttf', import.meta.url).href;
const replicadSourceMapUrl = new URL('sourcemaps/replicad.js.map', import.meta.url).href;

// WASM URLs using the universal pattern for browsers and bundlers. Static
// string literals so bundlers detect and copy the assets at build time.
// @see https://web.dev/articles/bundling-non-js-resources#universal_pattern_for_browsers_and_bundlers
const singleWasmUrl = new URL('wasm/replicad_single.wasm', import.meta.url).href;
const multiWasmUrl = new URL('wasm/replicad_multi.wasm', import.meta.url).href;

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
  wasmUrl: string;
  bindingsFactory: OpenCascadeModuleFactory;
  variant: WasmVariant | 'custom';
};

type WasmOption = 'auto' | 'single' | 'multi' | { wasmUrl: string; wasmBindingsUrl: string };

/**
 * Resolve the WASM variant into a concrete URL and loaded bindings factory.
 *
 * - **`'auto'`** (default): pick `'multi'` when SAB + cross-origin isolation
 *   are available, otherwise fall back to `'single'`.
 * - **`'single'`** / **`'multi'`**: pin the variant explicitly. Uses static-string
 *   `import()` so bundlers create a code-split chunk loaded on-demand.
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
      const module_: Record<string, unknown> = await import(/* @vite-ignore */ wasm.wasmBindingsUrl);
      return {
        wasmUrl: wasm.wasmUrl,
        bindingsFactory: resolveCjsDefault(module_['default'] ?? module_) as OpenCascadeModuleFactory,
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
      const module_ = await import('replicad-opencascadejs/multi');
      return {
        wasmUrl: multiWasmUrl,
        // The multi build ships its own `OpenCascadeInstance` declaration that diverges from
        // the single build's (different NCollection template instantiations), so the factory
        // return types are not structurally comparable. Both expose the contract replicad
        // consumes at runtime, so erase to the single-build factory type via `unknown`.
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- single vs multi OCJS .d.ts diverge; runtime contract is identical
        bindingsFactory: resolveCjsDefault(module_.default) as unknown as OpenCascadeModuleFactory,
        variant: 'multi',
      };
    }

    const module_ = await import('replicad-opencascadejs');
    return {
      wasmUrl: singleWasmUrl,
      bindingsFactory: resolveCjsDefault(module_.default) as OpenCascadeModuleFactory,
      variant: 'single',
    };
  } finally {
    span?.end();
  }
}

// =============================================================================
// Types
// =============================================================================

type ReplicadContext = {
  openCascade: OpenCascadeInstance;
  withBrepEdges: boolean;
  replicadInitialised: boolean;
  librarySourceMapCache: Map<string, SourceMapConsumer | undefined>;
  exportNameMap: Map<string, string>;
  libraryExportNames: Set<string>;
  tracingSummary?: OcTracingSummary;
};

// Match both the public package name (`replicad/`) and the aliased pnpm path
// (`@taucad/replicad/`) — the package.json aliases `replicad: npm:@taucad/replicad`,
// so the actual on-disk file lives at `node_modules/.pnpm/.../@taucad/replicad/dist/replicad.js`
// while still being importable as `replicad`. Both patterns map to the `replicad`
// display name so source-mapped paths render as `replicad/src/...`.
const libraryPatterns = [
  { pattern: '@taucad/replicad/', moduleName: 'replicad' },
  { pattern: 'node_modules/replicad/', moduleName: 'replicad' },
];

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
  options: { basePath: string; bundleSourceMap?: string; entryUrl?: string },
): OcErrorContext {
  return {
    basePath: options.basePath,
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
    // oxlint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- source-map-js accepts parsed JSON
    return new SourceMapConsumer(rawMap as any);
  } catch {
    return undefined;
  }
}

async function loadTextFile(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url);
    if (response.ok) {
      return await response.text();
    }
  } catch {
    // Fetch failed — fall through to Node.js fs fallback
  }

  if (!isNode() || !url.startsWith('file:')) {
    return undefined;
  }

  try {
    const filePath = await resolveFileUrl(url);
    const { readFile } = await import('node:fs/promises');
    return await readFile(filePath, 'utf8');
  } catch {
    return undefined;
  }
}

// =============================================================================
// Module registration helpers
// =============================================================================

function registerReplicadModule(runtime: KernelRuntime): void {
  const registry = getModuleRegistry();
  const replicadRecord = replicad as Record<string, unknown>;
  registry.set('replicad', replicadRecord);

  const exportNames = Object.keys(replicadRecord).filter((key) => /^[$_a-z][\w$]*$/i.test(key));
  const namedExports = exportNames.map((key) => `export const ${key} = __mod.${key};`).join('\n');
  const code = `const __mod = globalThis.${KERNEL_MODULES_KEY}.get('replicad');\n${namedExports}\nexport default __mod;\n`;

  runtime.bundler.registerModule('replicad', {
    code,
    version: '0.19.1',
    globalName: 'replicad',
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
  const first = registry.values().next();
  return first.done ? undefined : first.value;
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
  /** Include Boundary Representation (BRep) edge lines in the generated GLTF geometry. Defaults to `false`. */
  withBrepEdges?: boolean;
  /** Load library source maps for enriched error stack traces. Adds ~50ms to init. Defaults to `false`. */
  withSourceMapping?: boolean;
};

// =============================================================================
// Kernel module definition
// =============================================================================

/** @public */
export default defineKernel({
  name: 'ReplicadKernel',
  version: '1.0.0',
  optionsSchema: replicadOptionsSchema,
  renderSchema: replicadRenderSchema,
  exportSchemas: replicadExportSchemas,

  async initialize(options, runtime) {
    const { mangledToOriginal: exportNameMap, exportNames: libraryExportNames } = preserveExportNames(replicad);

    const { logger, tracer } = runtime;
    const { ocTracing, withBrepEdges, withSourceMapping, wasm } = options;

    const wasmLabel = typeof wasm === 'string' ? wasm : 'custom';
    logger.debug(`Initializing OpenCASCADE WASM (ocTracing: ${ocTracing}, wasm: ${wasmLabel})`);

    const wasmSpan = tracer.startSpan('replicad.wasm-init');
    const resolved = await resolveWasm(wasm, logger, tracer);
    let openCascade = await initOcct(resolved.wasmUrl, resolved.bindingsFactory, {
      tracer,
      print: (text) => {
        logger.trace('OCJS stdout', { data: { text } });
      },
      printErr: (text) => {
        logger.warn('OCJS stderr', { data: { text } });
      },
    });

    if (resolved.variant === 'multi') {
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

    replicad.setOC(openCascade);
    wasmSpan.end();

    try {
      const fontSpan = tracer.startSpan('replicad.font-load');
      logger.debug('Loading default font for text rendering');
      const fontData = await loadBinaryFile(geistRegularUrl);
      if (fontData) {
        await replicad.loadFont(fontData, 'default');
      } else {
        logger.warn('Default font file not found');
      }
      fontSpan.end();
    } catch (error) {
      logger.warn('Failed to load default font', { data: error });
    }

    registerReplicadModule(runtime);

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
      withBrepEdges,
      replicadInitialised: true,
      librarySourceMapCache,
      exportNameMap,
      libraryExportNames,
      tracingSummary,
    };
  },

  async getDependencies({ filePath }, runtime) {
    return runtime.bundler.resolveDependencies(filePath);
  },

  async getParameters({ filePath, basePath }, runtime, context) {
    const relativeFilePath = resolveToRelative(filePath, basePath);
    let bundleSourceMap: string | undefined;
    let entryUrl: string | undefined;
    try {
      const bundleResult = await runtime.bundler.bundle(filePath);
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

      return createKernelSuccess({ defaultParameters, jsonSchema });
    } catch (error) {
      const issue = formatOcRuntimeError(
        error,
        context.openCascade,
        buildErrorContext(context, { basePath, bundleSourceMap, entryUrl }),
      );
      return createKernelError([issue]);
    }
  },

  async createGeometry({ filePath, basePath, parameters, options }, runtime, context) {
    const { tracer } = runtime;
    const relativeFilePath = resolveToRelative(filePath, basePath);
    let bundleSourceMap: string | undefined;
    let entryUrl: string | undefined;

    try {
      const bundleResult = await runtime.bundler.bundle(filePath);
      if (!bundleResult.success) {
        throw new ReplicadBuildError(convertRawIssuesToKernelIssues(bundleResult.issues, relativeFilePath));
      }
      bundleSourceMap = bundleResult.sourceMap;

      const executeResult = await runtime.execute(bundleResult.code);
      if (!executeResult.success) {
        throw new ReplicadBuildError(convertRawIssuesToKernelIssues(executeResult.issues, relativeFilePath));
      }
      entryUrl = executeResult.entryUrl;

      const module = executeResult.value as RuntimeModuleExports;
      const mainSpan = tracer.startSpan('replicad.run-main', {
        phase: 'computingGeometry',
      });
      const mainResult = await runOcMain<MainResultShapes>({
        module,
        parameters,
        ocInstance: context.openCascade,
        errorContext: buildErrorContext(context, { basePath, bundleSourceMap, entryUrl }),
        firstArg: getReplicadFirstArgument(),
      });
      mainSpan.end();

      if (context.tracingSummary) {
        context.tracingSummary.flush();
      }

      if (!mainResult.success) {
        throw new ReplicadBuildError(mainResult.issues);
      }

      const shapes = mainResult.value;

      if (shapes === undefined) {
        runtime.logger.warn('createGeometry returning empty: main-returned-undefined', {
          data: { filePath: relativeFilePath },
        });
        return {
          geometry: [],
          nativeHandle: [],
          issues: [],
        };
      }

      const defaultName = extractDefaultName(module);

      const { tessellation } = options;

      let nativeHandle: InputShape[] = [];
      const renderedShapes = renderOutput({
        shapes,
        beforeRender(shapesArray) {
          nativeHandle = shapesArray;
          return shapesArray;
        },
        defaultName,
        tessellation,
        withBrepEdges: context.withBrepEdges,
      });

      const shapes3d = renderedShapes.filter((shape): shape is GeometryReplicad => shape.format === 'replicad');
      const shapes2d = renderedShapes.filter((shape): shape is GeometrySvg => shape.format === 'svg');

      if (shapes3d.length === 0 && shapes2d.length === 0) {
        runtime.logger.warn('createGeometry returning empty: render-output-filtered-empty', {
          data: {
            filePath: relativeFilePath,
            rawShapeCount: Array.isArray(shapes) ? shapes.length : 1,
            renderedShapeCount: renderedShapes.length,
          },
        });
        return { geometry: [], nativeHandle: [] };
      }

      const gltfShapes: GeometryGltf[] = [];
      if (shapes3d.length > 0) {
        const gltfSpan = tracer.startSpan('replicad.mesh-to-gltf', {
          shapeCount: shapes3d.length,
          phase: 'computingGeometry',
        });
        const gltfBlob = convertReplicadGeometriesToGltf(shapes3d, 'glb', runtime.logger);
        gltfSpan.end();
        gltfShapes.push({ format: 'gltf', content: gltfBlob });
      }

      return { geometry: [...gltfShapes, ...shapes2d], nativeHandle };
    } catch (error) {
      if (error instanceof ReplicadBuildError) {
        throw error;
      }

      const issue = formatOcRuntimeError(
        error,
        context.openCascade,
        buildErrorContext(context, { basePath, bundleSourceMap, entryUrl }),
      );
      throw new ReplicadBuildError([issue]);
    }
  },

  async exportGeometry(input, runtime, _context) {
    const { format, nativeHandle, options } = input;

    if (nativeHandle.length === 0) {
      return createKernelError([
        {
          message: 'No geometry available for export',
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
        },
      ]);
    }

    switch (format) {
      case 'glb':
      case 'gltf': {
        const { linearTolerance, angularTolerance } = options.tessellation;
        const angularToleranceRad = angularTolerance * (Math.PI / 180);
        const { coordinateSystem } = options;

        const shapes =
          coordinateSystem === 'y-up'
            ? nativeHandle.map((s) => ({ ...s, shape: s.shape.clone().rotate(-90, [0, 0, 0], [1, 0, 0]) }))
            : nativeHandle;

        const temporaryShapes = shapes.map((shapeConfig) => {
          const { shape } = shapeConfig;
          const faces = shape.mesh({
            tolerance: linearTolerance,
            angularTolerance: angularToleranceRad,
          });
          return {
            format: 'replicad',
            name: shapeConfig.name ?? 'Geometry',
            color: shapeConfig.color,
            opacity: shapeConfig.opacity,
            metalness: shapeConfig.metalness,
            roughness: shapeConfig.roughness,
            faces,
            edges: { lines: [], edgeGroups: [] },
          } satisfies GeometryReplicad;
        });

        const gltfData = convertReplicadGeometriesToGltf(temporaryShapes, format, runtime.logger);
        return createKernelSuccess([
          createExportFile(format, format === 'glb' ? 'model.glb' : 'model.gltf', asBuffer(gltfData)),
        ]);
      }

      case 'step': {
        const { coordinateSystem } = options;
        const shapes =
          coordinateSystem === 'y-up'
            ? nativeHandle.map((s) => ({ ...s, shape: s.shape.clone().rotate(-90, [0, 0, 0], [1, 0, 0]) }))
            : nativeHandle;

        const stepShapes = shapes.map((s) => ({
          shape: s.shape,
          name: s.name,
          color: s.color,
          alpha: s.opacity,
          metalness: s.metalness,
          roughness: s.roughness,
          density: s.density,
        }));
        const stepBlob: Blob = replicad.exportSTEP(stepShapes);
        const stepBytes = new Uint8Array(await stepBlob.arrayBuffer());
        return createKernelSuccess([createExportFile('step', 'assembly', stepBytes)]);
      }

      case 'stl': {
        const { linearTolerance, angularTolerance } = options.tessellation;
        const angularToleranceRad = angularTolerance * (Math.PI / 180);
        const { coordinateSystem } = options;

        const shapes =
          coordinateSystem === 'y-up'
            ? nativeHandle.map((s) => ({ ...s, shape: s.shape.clone().rotate(-90, [0, 0, 0], [1, 0, 0]) }))
            : nativeHandle;

        const result = await Promise.all(
          shapes.map(async ({ shape, name }) => {
            const bytes = await buildExportBytes(shape, {
              tolerance: linearTolerance,
              angularTolerance: angularToleranceRad,
              binary: options.binary,
            });
            return createExportFile('stl', name ?? 'Geometry', bytes);
          }),
        );
        return createKernelSuccess(result);
      }

      default: {
        const _exhaustive: never = format;
        return createKernelError([
          {
            message: `Unsupported export format: ${_exhaustive as string}`,
            code: 'KERNEL_CAPABILITY_MISSING',
            type: 'runtime',
            severity: 'error',
          },
        ]);
      }
    }
  },

  serializeHandle(nativeHandle) {
    return nativeHandle.map((entry) => ({
      brep: entry.shape.serialize(),
      metadata: {
        name: entry.name,
        color: entry.color,
        opacity: entry.opacity,
        metalness: entry.metalness,
        roughness: entry.roughness,
        density: entry.density,
      },
    }));
  },

  deserializeHandle(data) {
    return data.map((entry) => ({
      shape: replicad.deserializeShape(entry.brep),
      ...entry.metadata,
    }));
  },
});

async function buildExportBytes(
  shape: replicad.AnyShape,
  tessellation: { tolerance: number; angularTolerance: number; binary?: boolean },
): Promise<Uint8Array<ArrayBuffer>> {
  const blob = shape.blobSTL(tessellation.binary ? { ...tessellation, binary: true } : tessellation);
  return new Uint8Array(await blob.arrayBuffer());
}

class ReplicadBuildError extends Error {
  public readonly issues: KernelIssue[];
  public constructor(issues: KernelIssue[]) {
    super(issues.map((index) => index.message).join('; '));
    this.issues = issues;
  }
}
