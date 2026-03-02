/**
 * Replicad Kernel Module
 *
 * Full defineKernel implementation for the Replicad kernel.
 * Uses runtime.bundler for JS/TS bundling and runtime.execute for evaluation.
 * Registers replicad as a built-in module and loads OpenCASCADE WASM for geometry.
 *
 * Uses ES Module Asset Injection (two-tier dynamic import) to code-split WASM
 * variants. Only the selected variant's JS glue (~112KB) is loaded on-demand,
 * shrinking the worker bundle by ~225KB vs. static imports of both variants.
 *
 * @see docs/policy/es-module-policy.md
 */

import * as replicad from 'replicad';
import type { OpenCascadeInstance } from 'replicad-opencascadejs';
import type { GeometryGltf, GeometrySvg } from '@taucad/types';
import { z } from 'zod';
import { SourceMapConsumer } from 'source-map-js';
import { asBuffer } from '@taucad/utils/file';
import { jsonSchemaFromJson } from '@taucad/utils/schema';
import { createExportFile } from '@taucad/types/constants';
import { defineKernel } from '#types/kernel-worker.types.js';
import type { KernelRuntime } from '#types/kernel-worker.types.js';
import type { KernelSpanTracer } from '#types/kernel-tracer.types.js';
import type { KernelIssue, KernelStackFrame, ErrorLocation } from '#types/kernel.types.js';
import { createKernelError, createKernelSuccess } from '#framework/kernel-helpers.js';
import { isNode, resolveFileUrl } from '#framework/environment.js';
import { initOpenCascade } from '#kernels/replicad/init-open-cascade.js';
import type { OpenCascadeModuleFactory } from '#kernels/replicad/init-open-cascade.js';
import { resolveCjsDefault } from '#kernels/replicad/utils/resolve-cjs-default.js';
import { formatRuntimeErrorWithOc } from '#kernels/replicad/oc-exceptions.js';
import { wrapOcWithTracing, wrapOcForExceptions } from '#kernels/replicad/oc-tracing.js';
import type { OcTracingSummary } from '#kernels/replicad/oc-tracing.js';
import {
  parseStackTrace,
  createFrameClassifier,
  deriveLocationFromFrames,
  applyLibrarySourceMaps,
  resolveSourcePath,
} from '#framework/error-enrichment.js';
import { renderOutput } from '#kernels/replicad/utils/render-output.js';
import { convertReplicadGeometriesToGltf } from '#kernels/replicad/utils/replicad-to-gltf.js';
import type { InputShape, MainResultShapes } from '#kernels/replicad/utils/render-output.js';
import type { GeometryReplicad } from '#kernels/replicad/replicad.types.js';

const geistRegularUrl = new URL('fonts/Geist-Regular.ttf', import.meta.url).href;
const replicadSourceMapUrl = new URL('sourcemaps/replicad.js.map', import.meta.url).href;

// WASM URLs using universal pattern for browsers and bundlers.
// Static string literals so bundlers detect and copy the assets at build time.
// @see https://web.dev/articles/bundling-non-js-resources#universal_pattern_for_browsers_and_bundlers
const singleWasmUrl = new URL('wasm/replicad_single.wasm', import.meta.url).href;
const exceptionsWasmUrl = new URL('wasm/replicad_with_exceptions.wasm', import.meta.url).href;

// =============================================================================
// WASM resolution (two-tier dynamic import pattern)
// =============================================================================

type ResolvedWasm = {
  wasmUrl: string;
  bindingsFactory: OpenCascadeModuleFactory;
};

type WasmOption = string | { wasmUrl: string; wasmBindingsUrl: string };

/**
 * Resolve the WASM variant into a concrete URL and loaded bindings factory.
 *
 * - **Presets** (`'single'` / `'single-exceptions'`): Uses static-string `import()` so the
 *   bundler creates a code-split chunk loaded on-demand. Only the selected ~112KB chunk
 *   is loaded at runtime, shrinking the worker bundle by ~225KB.
 *
 * - **Custom config** (`{ wasmUrl, wasmBindingsUrl }`): Uses variable `import()` with
 *   `@vite-ignore` to bypass bundler analysis. Works in Node.js for any module format.
 */
async function resolveWasm(wasm: WasmOption, tracer?: KernelSpanTracer): Promise<ResolvedWasm> {
  const span = tracer?.startSpan('replicad.resolve-bindings', {
    variant: typeof wasm === 'string' ? wasm : 'custom',
  });

  try {
    if (typeof wasm === 'string') {
      if (wasm === 'single-exceptions') {
        const mod = await import('replicad-opencascadejs/src/replicad_with_exceptions.js');
        return {
          wasmUrl: exceptionsWasmUrl,
          bindingsFactory: resolveCjsDefault(mod.default) as OpenCascadeModuleFactory,
        };
      }

      const mod = await import('replicad-opencascadejs/src/replicad_single.js');
      return {
        wasmUrl: singleWasmUrl,
        bindingsFactory: resolveCjsDefault(mod.default) as OpenCascadeModuleFactory,
      };
    }

    // Custom WASM config -- runtime import bypasses bundler
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- dynamic import() with variable URL returns any
    const mod: Record<string, unknown> = await import(/* @vite-ignore */ wasm.wasmBindingsUrl);
    return {
      wasmUrl: wasm.wasmUrl,
      bindingsFactory: resolveCjsDefault(mod['default'] ?? mod) as OpenCascadeModuleFactory,
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
  tracingSummary?: OcTracingSummary;
};

type RuntimeModuleExports = {
  default?: (...args: unknown[]) => unknown;
  main?: (...args: unknown[]) => unknown;
  defaultParams?: Record<string, unknown>;
  defaultParameters?: Record<string, unknown>;
  defaultName?: string;
};

// eslint-disable-next-line @typescript-eslint/naming-convention -- module-level constant
const KERNEL_MODULES_KEY = '__KERNEL_MODULES__';

// eslint-disable-next-line @typescript-eslint/naming-convention -- module-level constant
const LIBRARY_PATTERNS = [{ pattern: 'node_modules/replicad/', moduleName: 'replicad' }];
const frameClassifier = createFrameClassifier(LIBRARY_PATTERNS);

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
// Error enrichment helpers
// =============================================================================

function parseError(error: unknown, sourceMapJson?: string, projectPath?: string): KernelStackFrame[] {
  return parseStackTrace(error, {
    classifyFrame: frameClassifier,
    sourceMap: sourceMapJson,
    resolveSourcePath: (s) => resolveSourcePath(s, projectPath),
  });
}

function resolveLibraryFrames(frames: KernelStackFrame[], context: ReplicadContext): KernelStackFrame[] {
  return applyLibrarySourceMaps(frames, LIBRARY_PATTERNS, (moduleName) => {
    return context.librarySourceMapCache.get(moduleName);
  });
}

async function loadReplicadSourceMap(): Promise<SourceMapConsumer | undefined> {
  try {
    const json = await loadTextFile(replicadSourceMapUrl);
    if (!json) {
      return undefined;
    }

    const rawMap: unknown = JSON.parse(json);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- source-map-js accepts parsed JSON
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

function deriveLocation(
  frames: KernelStackFrame[],
  sourceMapJson?: string,
  projectPath?: string,
): ErrorLocation | undefined {
  return deriveLocationFromFrames(frames, sourceMapJson, (s) => resolveSourcePath(s, projectPath));
}

// =============================================================================
// Module registration helpers
// =============================================================================

function getModuleRegistry(): Map<string, Record<string, unknown>> {
  let registry = (globalThis as Record<string, unknown>)[KERNEL_MODULES_KEY] as
    | Map<string, Record<string, unknown>>
    | undefined;
  if (!registry) {
    registry = new Map();
    (globalThis as Record<string, unknown>)[KERNEL_MODULES_KEY] = registry;
  }

  return registry;
}

function registerReplicadModule(runtime: KernelRuntime): void {
  const exports = replicad as unknown as Record<string, unknown>;
  const registry = getModuleRegistry();
  registry.set('replicad', exports);

  const exportNames = Object.keys(exports).filter((key) => /^[a-z_$][\w$]*$/i.test(key));
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

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function extractDefaultName(module: unknown): string | undefined {
  if (!isRecordObject(module)) {
    return undefined;
  }

  return typeof module['defaultName'] === 'string' ? module['defaultName'] : undefined;
}

type RunMainResult<T> = { success: true; value: T } | { success: false; issues: KernelIssue[] };

async function runMainRaw(module: RuntimeModuleExports, parameters: Record<string, unknown>): Promise<unknown> {
  const mainFunction = module.default ?? module.main;
  if (!mainFunction || typeof mainFunction !== 'function') {
    return undefined;
  }

  if (mainFunction.length >= 2) {
    const registry = getModuleRegistry();
    const first = registry.values().next();
    return mainFunction(first.done ? undefined : first.value, parameters);
  }

  return mainFunction(parameters);
}

async function runMain<T>(input: {
  module: RuntimeModuleExports;
  parameters: Record<string, unknown>;
  context: ReplicadContext;
  sourceMapJson?: string;
  projectPath?: string;
}): Promise<RunMainResult<T>> {
  try {
    const value = await runMainRaw(input.module, input.parameters);
    return { success: true, value: value as T };
  } catch (error) {
    const issue = formatRuntimeErrorWithOc({
      error,
      ocInstance: input.context.openCascade,
      parseStackTrace: (errorToFormat) => parseError(errorToFormat, input.sourceMapJson, input.projectPath),
      applySourceMaps: (frames) => resolveLibraryFrames(frames, input.context),
      deriveLocation: (frames) => deriveLocation(frames, input.sourceMapJson, input.projectPath),
      sourceMap: input.sourceMapJson,
    });
    return { success: false, issues: [issue] };
  }
}

function enrichIssueLocation(
  issues: Array<{ message: string; severity: string; location?: unknown }>,
  fallbackFileName: string,
): KernelIssue[] {
  return issues.map((issue) => ({
    ...issue,
    message: issue.message,
    type: 'runtime' as const,
    severity: issue.severity === 'warning' ? ('warning' as const) : ('error' as const),
    location: (issue.location as KernelIssue['location']) ?? {
      fileName: fallbackFileName,
      startLineNumber: 1,
      startColumn: 1,
    },
  }));
}

// =============================================================================
// Options schema
// =============================================================================

/**
 * Custom WASM configuration for injecting non-standard builds at runtime.
 * Primarily used for Node.js tooling (benchmarks, CI) via `file://` URLs.
 */
export type ReplicadWasmConfig = {
  /** Absolute URL to the `.wasm` binary (typically `file://` in Node.js). */
  wasmUrl: string;
  /** Absolute URL to the Emscripten JS glue module (typically `file://` in Node.js). */
  wasmBindingsUrl: string;
};

/**
 * Replicad kernel options.
 */
export type ReplicadOptions = {
  /**
   * WASM build variant or custom build configuration.
   *
   * - `'single'` (default) -- compact build (~17 MB), OC errors abort rather than throw
   * - `'single-exceptions'` -- exceptions-enabled build (~20 MB) with human-readable OC error messages
   * - `ReplicadWasmConfig` -- custom WASM/JS URLs for runtime injection (Node.js tooling)
   *
   * @default 'single'
   */
  wasm?: 'single' | 'single-exceptions' | ReplicadWasmConfig;
  /** OC API call tracing mode. 'summary' (default) emits aggregated stats, 'per-call' emits individual spans. */
  ocTracing?: 'off' | 'summary' | 'per-call';
  /** Include Boundary Representation (BRep) edge lines in the generated GLTF geometry. Defaults to `false`. */
  withBrepEdges?: boolean;
  /** Load library source maps for enriched error stack traces. Adds ~50ms to init. Defaults to `false`. */
  withSourceMapping?: boolean;
};

const wasmConfigSchema = z.object({
  wasmUrl: z.string(),
  wasmBindingsUrl: z.string(),
}) satisfies z.ZodType<ReplicadWasmConfig>;

const replicadOptionsSchema = z.object({
  wasm: z
    .union([z.enum(['single', 'single-exceptions']), wasmConfigSchema])
    .optional()
    .default('single'),
  ocTracing: z.enum(['off', 'summary', 'per-call']).optional().default('summary'),
  withBrepEdges: z.boolean().optional().default(false),
  withSourceMapping: z.boolean().optional().default(false),
}) satisfies z.ZodType<Required<ReplicadOptions>>;

// =============================================================================
// Kernel module definition
// =============================================================================

export default defineKernel({
  name: 'ReplicadKernel',
  version: '1.0.0',
  optionsSchema: replicadOptionsSchema,

  async initialize(options, runtime) {
    const { logger, tracer } = runtime;
    const { ocTracing, withBrepEdges, withSourceMapping, wasm } = options;

    const wasmLabel = typeof wasm === 'string' ? wasm : 'custom';
    logger.debug(`Initializing OpenCASCADE WASM (ocTracing: ${ocTracing}, wasm: ${wasmLabel})`);

    const wasmSpan = tracer.startSpan('replicad.wasm-init');
    const resolved = await resolveWasm(wasm, tracer);
    let openCascade = await initOpenCascade(resolved.wasmUrl, resolved.bindingsFactory, { tracer });
    let tracingSummary: OcTracingSummary | undefined;

    if (ocTracing !== 'off') {
      const traced = wrapOcWithTracing(openCascade, tracer, { mode: ocTracing });
      openCascade = traced.tracedInstance;
      tracingSummary = traced.summary;
    } else if (wasm !== 'single') {
      openCascade = wrapOcForExceptions(openCascade);
    }

    replicad.setOC(openCascade);
    wasmSpan.end();

    try {
      const fontSpan = tracer.startSpan('replicad.font-load');
      logger.debug('Loading default font for text rendering');
      await replicad.loadFont(geistRegularUrl, 'default');
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
      tracingSummary,
    };
  },

  async canHandle({ filePath, extension }, { filesystem }) {
    if (!['ts', 'js'].includes(extension)) {
      return false;
    }

    const code = await filesystem.readFile(filePath, 'utf8');

    const hasImport = /import.*from\s+['"]replicad['"]/s.test(code);
    const hasRequire = /require\s*\(['"]replicad['"]\)/.test(code);
    const hasDestructure = /\bconst\s*{\s*[\w\s,]*}\s*=\s*replicad\s*;/.test(code);
    const hasTypedef = /@typedef.*import\s*\(\s*['"]replicad['"]\s*\)/.test(code);
    const hasCdnImport = /import.*from\s+['"]https?:\/\/[^'"]*replicad[^'"]*['"]/s.test(code);

    return hasImport || hasRequire || hasDestructure || hasTypedef || hasCdnImport;
  },

  async getDependencies({ filePath }, runtime) {
    return runtime.bundler.resolveDependencies(filePath);
  },

  async getParameters({ filePath, basePath }, runtime, context) {
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

      const defaultParameters = extractDefaultParameters(executeResult.value);
      const jsonSchema = await jsonSchemaFromJson(defaultParameters);

      return createKernelSuccess({ defaultParameters, jsonSchema });
    } catch (error) {
      const issue = formatRuntimeErrorWithOc({
        error,
        ocInstance: context.openCascade,
        parseStackTrace: (errorToFormat) => parseError(errorToFormat, undefined, basePath),
        applySourceMaps: (frames) => resolveLibraryFrames(frames, context),
        deriveLocation: (frames) => deriveLocation(frames, undefined, basePath),
      });
      return createKernelError([issue]);
    }
  },

  async createGeometry({ filePath, basePath, parameters, tessellation }, runtime, context) {
    const { tracer } = runtime;
    const relativeFilePath = resolveToRelative(filePath, basePath);

    const bundleResult = await runtime.bundler.bundle(filePath);
    if (!bundleResult.success) {
      throw new ReplicadBuildError(enrichIssueLocation(bundleResult.issues, relativeFilePath));
    }

    const executeResult = await runtime.execute(bundleResult.code);
    if (!executeResult.success) {
      throw new ReplicadBuildError(enrichIssueLocation(executeResult.issues, relativeFilePath));
    }

    const module = executeResult.value as RuntimeModuleExports;
    const mainSpan = tracer.startSpan('replicad.run-main', { phase: 'computingGeometry' });
    const mainResult = await runMain<MainResultShapes>({
      module,
      parameters,
      context,
      sourceMapJson: bundleResult.sourceMap,
      projectPath: basePath,
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
      return {
        geometry: [],
        nativeHandle: [],
        issues: [
          {
            message: 'main() did not return any shapes. Did you forget to add a return statement?',
            location: { fileName: relativeFilePath, startLineNumber: 1, startColumn: 1 },
            type: 'runtime',
            severity: 'warning',
          },
        ],
      };
    }

    const defaultName = extractDefaultName(module);

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
      return { geometry: [], nativeHandle: [] };
    }

    const gltfShapes: GeometryGltf[] = [];
    if (shapes3d.length > 0) {
      const gltfSpan = tracer.startSpan('replicad.mesh-to-gltf', {
        shapeCount: shapes3d.length,
        phase: 'computingGeometry',
      });
      const gltfBlob = await convertReplicadGeometriesToGltf(shapes3d, 'glb');
      gltfSpan.end();
      gltfShapes.push({ format: 'gltf', content: gltfBlob });
    }

    return { geometry: [...gltfShapes, ...shapes2d], nativeHandle };
  },

  async exportGeometry({ fileType, tessellation, nativeHandle }, _runtime, _context) {
    const resolvedTessellation = tessellation ?? { linearTolerance: 0.01, angularTolerance: 30 };

    if (nativeHandle.length === 0) {
      return createKernelError([{ message: 'No geometry available for export', type: 'runtime', severity: 'error' }]);
    }

    if (fileType === 'glb' || fileType === 'gltf') {
      const temporaryShapes = nativeHandle.map((shapeConfig) => {
        const { shape } = shapeConfig;
        const faces = shape.mesh({
          tolerance: resolvedTessellation.linearTolerance,
          angularTolerance: resolvedTessellation.angularTolerance,
        });
        return {
          format: 'replicad',
          name: shapeConfig.name ?? 'Geometry',
          color: shapeConfig.color,
          opacity: shapeConfig.opacity,
          faces,
          edges: { lines: [], edgeGroups: [] },
        } satisfies GeometryReplicad;
      });

      const gltfData = await convertReplicadGeometriesToGltf(temporaryShapes, fileType);
      return createKernelSuccess([
        createExportFile(fileType, fileType === 'glb' ? 'model.glb' : 'model.gltf', asBuffer(gltfData)),
      ]);
    }

    if (fileType === 'step-assembly') {
      const stepBlob: Blob = replicad.exportSTEP(nativeHandle);
      const stepBytes = new Uint8Array(await stepBlob.arrayBuffer());
      return createKernelSuccess([createExportFile('step-assembly', 'assembly', stepBytes)]);
    }

    const result = await Promise.all(
      nativeHandle.map(async ({ shape, name }) => {
        const bytes = await buildExportBytes(shape, fileType, {
          tolerance: resolvedTessellation.linearTolerance,
          angularTolerance: resolvedTessellation.angularTolerance,
        });
        return createExportFile(fileType, name ?? 'Geometry', bytes);
      }),
    );

    return createKernelSuccess(result);
  },
});

async function buildExportBytes(
  shape: replicad.AnyShape,
  fileType: string,
  tessellation: { tolerance: number; angularTolerance: number },
): Promise<Uint8Array<ArrayBuffer>> {
  let blob: Blob;

  switch (fileType) {
    case 'stl': {
      blob = shape.blobSTL(tessellation);

      break;
    }

    case 'stl-binary': {
      blob = shape.blobSTL({ ...tessellation, binary: true });

      break;
    }

    case 'step': {
      blob = shape.blobSTEP();

      break;
    }

    default: {
      throw new Error(`Unsupported export format: ${fileType}`);
    }
  }

  return new Uint8Array(await blob.arrayBuffer());
}

class ReplicadBuildError extends Error {
  public readonly issues: KernelIssue[];
  public constructor(issues: KernelIssue[]) {
    super(issues.map((i) => i.message).join('; '));
    this.issues = issues;
  }
}
