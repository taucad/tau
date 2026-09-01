/* oxlint-disable eslint(new-cap) -- OpenCascade API uses PascalCase method names */
/**
 * OpenCascade Kernel Module
 *
 * Direct OpenCASCADE kernel that exposes the raw opencascade.js API
 * without the Replicad abstraction layer. Users write TypeScript/JavaScript
 * that directly calls OpenCASCADE classes (gp_Pnt, BRepPrimAPI_MakeBox, etc.).
 *
 * Uses a standalone opencascade.js full WASM build for the OpenCASCADE runtime.
 */

import type { GeometryGltf } from '@taucad/types';
import { cadMaterialDefaults, createExportFile } from '@taucad/types/constants';
import { jsonSchemaFromJson } from '@taucad/utils/schema';
import { asBuffer } from '@taucad/utils/file';
import { defineKernel } from '#types/runtime-kernel.types.js';
import type { KernelRuntime, RuntimeLogger } from '#types/runtime-kernel.types.js';
import {
  opencascadeOptionsSchema,
  opencascadeRenderSchema,
  opencascadeExportSchemas,
} from '#kernels/opencascade/opencascade.schemas.js';
import {
  KERNEL_MODULES_KEY,
  getModuleRegistry,
  isRecordObject,
  extractDefaultParameters,
  resolveToRelative,
  convertRawIssuesToKernelIssues,
} from '#kernels/kernel-module-helpers.js';
import type { RuntimeModuleExports } from '#kernels/kernel-module-helpers.js';
import { createKernelError, createKernelSuccess } from '#kernels/kernel-helpers.js';
import { initOcct } from '#kernels/occt/oc-init.js';
import type { OcctModuleFactory } from '#kernels/occt/oc-init.js';
import { detectMultiThreadSupport, activateOccParallelism } from '#kernels/occt/oc-threading.js';
import { meshShapesToGltf, parseHexColor } from '#kernels/opencascade/opencascade-mesh.js';
import type { ShapeEntry } from '#kernels/opencascade/opencascade.types.js';
import { formatOcRuntimeError } from '#kernels/occt/oc-error-formatter.js';
import { runOcMain } from '#kernels/occt/oc-run-main.js';
import { wrapOcForExceptions, wrapOcWithTracing } from '#kernels/occt/oc-tracing.js';
import type { OcTracingSummary } from '#kernels/occt/oc-tracing.js';
import type { KernelIssue } from '#types/runtime.types.js';

import type { OpenCascadeInstance, TopoDS_Shape } from '#kernels/opencascade/wasm/opencascade_full.js';

// WASM URLs using the universal pattern for browsers and bundlers. Static
// string literals so bundlers detect and copy the assets at build time.
// @see https://web.dev/articles/bundling-non-js-resources#universal_pattern_for_browsers_and_bundlers
const fullWasmUrl = new URL('wasm/opencascade_full.wasm', import.meta.url).href;
const multiWasmUrl = new URL('wasm/opencascade_full_multi.wasm', import.meta.url).href;

// =============================================================================
// Types
// =============================================================================

/**
 * Custom WASM binary location for the OpenCascade kernel.
 * @public
 */
export type OpenCascadeWasmConfig = {
  wasmUrl: string;
  wasmBindingsUrl: string;
};

/**
 * Configuration options for the OpenCascade kernel plugin.
 * @public
 */
export type OpenCascadeOptions = {
  /**
   * WASM build variant or custom build configuration.
   *
   * - `'full'` (default) -- single-threaded, exceptions-enabled full opencascade.js build.
   * - `'multi'` -- pthread-enabled full build; requires `SharedArrayBuffer` + cross-origin
   *   isolation (Node 22+, or browsers with `crossOriginIsolated=true`). Loads bindings from
   *   the `opencascade.js/multi` subpath and activates OCCT global parallelism after init.
   * - `'auto'` -- pick `'multi'` when `SharedArrayBuffer` is usable, otherwise fall back to `'full'`.
   * - `OpenCascadeWasmConfig` -- custom WASM/JS URLs for runtime injection.
   *
   * Defaults to `'full'`: the multi-threaded WASM binary is served from a local asset copy
   * that is populated by the runtime `copy-assets` step. Until that asset ships, `'auto'`
   * would still resolve to the (unavailable) `'multi'` binary in Node, so `'full'` stays the
   * default and `'multi'`/`'auto'` are opt-in.
   *
   * @default 'full'
   */
  wasm?: 'auto' | 'full' | 'multi' | OpenCascadeWasmConfig;
  /** OC API call tracing mode. `'summary'` (default) emits aggregated stats, `'per-call'` emits individual spans. */
  ocTracing?: 'off' | 'summary' | 'per-call';
};

// =============================================================================
// Context type
// =============================================================================

type OpenCascadeContext = {
  oc: OpenCascadeInstance;
  tracingSummary?: OcTracingSummary;
};

// =============================================================================
// WASM resolution
// =============================================================================

/** Concrete WASM build variant the kernel runs against. */
type OpenCascadeWasmVariant = 'full' | 'multi';

/** Emscripten module factory returning the OpenCascade instance. */
type OpenCascadeModuleFactory = OcctModuleFactory<OpenCascadeInstance>;

type ResolvedWasm = {
  wasmUrl: string;
  bindingsFactory: OpenCascadeModuleFactory;
  variant: OpenCascadeWasmVariant | 'custom';
};

/**
 * Resolve the WASM option into a concrete URL and loaded bindings factory.
 *
 * - **`'auto'`**: pick `'multi'` when `SharedArrayBuffer` + cross-origin isolation
 *   are available, otherwise fall back to `'full'`.
 * - **`'full'`** / **`'multi'`**: pin the variant explicitly. The multi build's
 *   bindings load from the published `opencascade.js/multi` subpath (static
 *   specifier so bundlers can code-split it); the matching pthread `.wasm` is
 *   served from the local asset copy (`wasm/opencascade_full_multi.wasm`)
 *   populated by the runtime `copy-assets` step — mirroring how the
 *   single-threaded build and the Replicad kernel resolve their binaries.
 * - **Custom config** (`{ wasmUrl, wasmBindingsUrl }`): variable `import()` with
 *   `@vite-ignore` to bypass bundler analysis. Works in Node for any module format.
 *
 * @param wasm - variant tag or custom URL pair
 * @param logger - kernel logger (used for the auto-selection log line)
 * @returns the resolved WASM URL, bindings factory, and concrete variant.
 */
async function resolveWasm(
  wasm: 'auto' | 'full' | 'multi' | OpenCascadeWasmConfig,
  logger: RuntimeLogger,
): Promise<ResolvedWasm> {
  if (typeof wasm !== 'string') {
    // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- dynamic import() with variable URL returns any
    const module_: Record<string, unknown> = await import(/* @vite-ignore */ wasm.wasmBindingsUrl);
    return {
      wasmUrl: wasm.wasmUrl,
      bindingsFactory: (module_['default'] ?? module_) as OpenCascadeModuleFactory,
      variant: 'custom',
    };
  }

  let variant: OpenCascadeWasmVariant;
  if (wasm === 'auto') {
    const detection = detectMultiThreadSupport();
    variant = detection.supported ? 'multi' : 'full';
    logger.log(`OpenCascade WASM variant auto-selected: ${variant} (${detection.reason})`);
  } else {
    variant = wasm;
  }

  if (variant === 'multi') {
    const moduleExports = await import('opencascade.js/multi');
    return {
      wasmUrl: multiWasmUrl,
      bindingsFactory: moduleExports.default,
      variant: 'multi',
    };
  }

  const moduleExports = await import('#kernels/opencascade/wasm/opencascade_full.js');
  return {
    wasmUrl: fullWasmUrl,
    bindingsFactory: moduleExports.default,
    variant: 'full',
  };
}

// =============================================================================
// Helpers
// =============================================================================

function registerOcModule(oc: OpenCascadeInstance, runtime: KernelRuntime): void {
  const registry = getModuleRegistry();
  const ocRecord = oc as Record<string, unknown>;
  registry.set('opencascade.js', ocRecord);

  const exportNames = Object.keys(ocRecord).filter((key) => /^[$_a-z][\w$]*$/i.test(key));
  const namedExports = exportNames.map((key) => `export const ${key} = __mod.${key};`).join('\n');
  const code = `const __mod = globalThis.${KERNEL_MODULES_KEY}.get('opencascade.js');\n${namedExports}\nexport default function init() {}\n`;

  runtime.bundler.registerModule('opencascade.js', { code, version: '3.0.0' });
}

function shapeEntryFromKernelReturnItem(item: unknown): ShapeEntry | undefined {
  if (isOpenCascadeShape(item)) {
    return { shape: item };
  }

  if (!isRecordObject(item) || !('shape' in item) || !isOpenCascadeShape(item['shape'])) {
    return undefined;
  }

  return {
    shape: item['shape'],
    name: typeof item['name'] === 'string' ? item['name'] : undefined,
    color: typeof item['color'] === 'string' ? item['color'] : undefined,
    opacity: typeof item['opacity'] === 'number' ? item['opacity'] : undefined,
    metalness: typeof item['metalness'] === 'number' ? item['metalness'] : undefined,
    roughness: typeof item['roughness'] === 'number' ? item['roughness'] : undefined,
    density: typeof item['density'] === 'number' ? item['density'] : undefined,
  };
}

function normalizeShapes(value: unknown): ShapeEntry[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    const entries: ShapeEntry[] = [];
    for (const item of value) {
      const entry = shapeEntryFromKernelReturnItem(item);
      if (entry) {
        entries.push(entry);
      }
    }

    return entries;
  }

  const entry = shapeEntryFromKernelReturnItem(value);
  return entry ? [entry] : [];
}

function isOpenCascadeShape(value: unknown): value is TopoDS_Shape {
  return isRecordObject(value) && typeof value['IsNull'] === 'function' && typeof value['delete'] === 'function';
}

/**
 * XCAF STEP assembly export (`STEPCAFControl_Writer.Perform` — must not use `Transfer(..., '', ...)`:
 * an empty string is a non-null `const char*` and enables multi-file mode with no geometry in the main file).
 *
 * @param oc - WASM OpenCascade instance
 * @param nativeHandle - shapes and metadata from the last `createGeometry`
 * @returns STEP file bytes on success, or `{ ok: false }` when `Perform` fails
 */
function exportOpencascadeStepAssembly(
  oc: OpenCascadeInstance,
  nativeHandle: ShapeEntry[],
): { ok: true; bytes: Uint8Array<ArrayBuffer> } | { ok: false } {
  const documentName = new oc.TCollection_ExtendedString();
  const document = new oc.TDocStd_Document(documentName);
  const mainLabel = document.Main();
  const shapeTool = oc.XCAFDoc_DocumentTool.ShapeTool(mainLabel);
  const colorTool = oc.XCAFDoc_DocumentTool.ColorTool(mainLabel);

  for (const entry of nativeHandle) {
    if (entry.shape.IsNull()) {
      continue;
    }

    const label = shapeTool.NewShape();
    shapeTool.SetShape(label, entry.shape);

    if (entry.name) {
      const entryName = new oc.TCollection_ExtendedString(entry.name, true);
      oc.TDataStd_Name.Set(label, entryName);
      entryName.delete();
    }

    if (entry.color) {
      const [r, g, b] = parseHexColor(entry.color);
      const color = new oc.Quantity_Color(r, g, b, oc.Quantity_TypeOfColor.Quantity_TOC_sRGB);
      colorTool.SetColor(label, color, oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf);
      color.delete();
    }

    if (entry.metalness !== undefined || entry.roughness !== undefined) {
      const visTool = oc.XCAFDoc_DocumentTool.VisMaterialTool(mainLabel);
      const pbrMat = new oc.XCAFDoc_VisMaterialPBR();
      if (entry.color) {
        const [r, g, b] = parseHexColor(entry.color);
        const baseColor = new oc.Quantity_ColorRGBA(r, g, b, entry.opacity ?? 1);
        pbrMat.BaseColor = baseColor;
        baseColor.delete();
      }
      pbrMat.Metallic = entry.metalness ?? cadMaterialDefaults.metalnessFactor;
      pbrMat.Roughness = entry.roughness ?? cadMaterialDefaults.roughnessFactor;
      pbrMat.IsDefined = true;
      const visMat = new oc.XCAFDoc_VisMaterial();
      visMat.SetPbrMaterial(pbrMat);
      const matName = new oc.TCollection_AsciiString(entry.name ?? 'material');
      const visMatLabel = visTool.AddMaterial(visMat, matName);
      visTool.SetShapeMaterial(label, visMatLabel);
      matName.delete();
      visMatLabel.delete();
      visMat.delete();
      pbrMat.delete();
      visTool.delete();
    }

    if (entry.density !== undefined) {
      const matTool = oc.XCAFDoc_DocumentTool.MaterialTool(mainLabel);
      const materialName = new oc.TCollection_HAsciiString(entry.name ?? 'material');
      const description = new oc.TCollection_HAsciiString('');
      const densityName = new oc.TCollection_HAsciiString('g/cm3');
      const densityValueType = new oc.TCollection_HAsciiString('POSITIVE_RATIO_MEASURE');
      matTool.SetMaterial(label, materialName, description, entry.density, densityName, densityValueType);
      densityValueType.delete();
      densityName.delete();
      description.delete();
      materialName.delete();
      matTool.delete();
    }

    label.delete();
  }

  shapeTool.UpdateAssemblies();

  const session = new oc.XSControl_WorkSession();
  const writer = new oc.STEPCAFControl_Writer(session, false);
  writer.SetColorMode(true);
  writer.SetNameMode(true);
  writer.SetMaterialMode(true);
  oc.Interface_Static.SetIVal('write.surfacecurve.mode', 1);
  oc.Interface_Static.SetIVal('write.step.assembly', 2);
  oc.Interface_Static.SetIVal('write.step.schema', 5);

  const progress = new oc.Message_ProgressRange();
  const filePath = `/tmp/export_${Date.now()}.step`;
  const ok = writer.Perform(document, filePath, progress);
  if (!ok) {
    progress.delete();
    writer.delete();
    session.delete();
    colorTool.delete();
    shapeTool.delete();
    mainLabel.delete();
    documentName.delete();
    document.delete();
    return { ok: false };
  }

  const rawData = oc.FS.readFile(filePath) as Uint8Array<ArrayBuffer>;
  const bytes = new Uint8Array(rawData);
  oc.FS.unlink(filePath);

  progress.delete();
  writer.delete();
  session.delete();
  colorTool.delete();
  shapeTool.delete();
  mainLabel.delete();
  documentName.delete();
  document.delete();

  return { ok: true, bytes };
}

// =============================================================================
// Kernel definition
// =============================================================================

/** @public */
export default defineKernel({
  name: 'OpenCascadeKernel',
  version: '1.0.0',
  optionsSchema: opencascadeOptionsSchema,
  renderSchema: opencascadeRenderSchema,
  exportSchemas: opencascadeExportSchemas,

  async initialize(options, runtime) {
    const { logger, tracer } = runtime;
    const { ocTracing } = options;
    logger.debug(
      `Initializing OpenCascade kernel (wasm: ${typeof options.wasm === 'string' ? options.wasm : 'custom'}, ocTracing: ${ocTracing})`,
    );

    const span = tracer.startSpan('opencascade.wasm-init');
    const resolved = await resolveWasm(options.wasm, logger);
    let oc = await initOcct<OpenCascadeInstance>(resolved.wasmUrl, resolved.bindingsFactory, {
      tracer,
      print: (text) => {
        logger.trace('OCJS stdout', { data: { text } });
      },
      printErr: (text) => {
        logger.warn('OCJS stderr', { data: { text } });
      },
    });
    span.end();

    if (resolved.variant === 'multi') {
      activateOccParallelism(oc, logger);
    } else {
      logger.log(`OpenCascade OCCT initialised: variant=${resolved.variant} (single-threaded)`);
    }

    let tracingSummary: OcTracingSummary | undefined;
    if (ocTracing === 'summary' || ocTracing === 'per-call') {
      const traced = wrapOcWithTracing(oc, tracer, { mode: ocTracing });
      oc = traced.tracedInstance;
      tracingSummary = traced.summary;
    } else {
      oc = wrapOcForExceptions(oc);
    }

    registerOcModule(oc, runtime);
    logger.debug('OpenCascade kernel initialized');

    return { oc, tracingSummary } satisfies OpenCascadeContext;
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
      const issue = formatOcRuntimeError(error, context.oc, { basePath, bundleSourceMap, entryUrl });
      return createKernelError([issue]);
    }
  },

  async createGeometry({ filePath, basePath, parameters, options }, runtime, context) {
    const { logger, tracer } = runtime;
    const relativeFilePath = resolveToRelative(filePath, basePath);
    let bundleSourceMap: string | undefined;
    let entryUrl: string | undefined;

    try {
      const bundleResult = await runtime.bundler.bundle(filePath);
      if (!bundleResult.success) {
        throw new OcctBuildError(convertRawIssuesToKernelIssues(bundleResult.issues, relativeFilePath));
      }
      bundleSourceMap = bundleResult.sourceMap;

      const executeResult = await runtime.execute(bundleResult.code);
      if (!executeResult.success) {
        throw new OcctBuildError(convertRawIssuesToKernelIssues(executeResult.issues, relativeFilePath));
      }
      entryUrl = executeResult.entryUrl;

      const module = executeResult.value as RuntimeModuleExports;
      const mainFunction = module.default ?? module.main;

      if (!mainFunction || typeof mainFunction !== 'function') {
        logger.warn('createGeometry returning empty: main-function-not-found', {
          data: { filePath: relativeFilePath },
        });
        return {
          geometry: [],
          nativeHandle: [],
          issues: [],
        };
      }

      const mainSpan = tracer.startSpan('opencascade.run-main', { phase: 'computingGeometry' });
      const mainResult = await runOcMain<unknown>({
        module,
        parameters,
        ocInstance: context.oc,
        errorContext: { basePath, bundleSourceMap, entryUrl },
        firstArg: context.oc,
      });
      mainSpan.end();

      if (context.tracingSummary) {
        context.tracingSummary.flush();
      }

      if (!mainResult.success) {
        throw new OcctBuildError(mainResult.issues);
      }

      const shapeEntries = normalizeShapes(mainResult.value);
      if (shapeEntries.length === 0) {
        logger.warn('createGeometry returning empty: main-returned-no-shapes', {
          data: { filePath: relativeFilePath },
        });
        return {
          geometry: [],
          nativeHandle: [],
          issues: [],
        };
      }

      const meshSpan = tracer.startSpan('opencascade.mesh-to-gltf', {
        shapeCount: shapeEntries.length,
        phase: 'computingGeometry',
      });

      const { tessellation } = options;
      const { linearTolerance, angularTolerance } = tessellation;
      const gltfData = await meshShapesToGltf(context.oc, shapeEntries, {
        linearTolerance,
        angularTolerance: angularTolerance * (Math.PI / 180),
      });
      meshSpan.end();

      const geometry: GeometryGltf[] = [{ format: 'gltf', content: gltfData }];
      return { geometry, nativeHandle: shapeEntries };
    } catch (error) {
      if (error instanceof OcctBuildError) {
        throw error;
      }

      const issue = formatOcRuntimeError(error, context.oc, { basePath, bundleSourceMap, entryUrl });
      throw new OcctBuildError([issue]);
    }
  },

  async exportGeometry(input, _runtime, context) {
    const { format, nativeHandle, options } = input;
    if (nativeHandle.length === 0) {
      return createKernelError([
        { message: 'No geometry available for export', code: 'RUNTIME', type: 'runtime', severity: 'error' },
      ]);
    }

    switch (format) {
      case 'glb':
      case 'gltf': {
        const { linearTolerance, angularTolerance } = options.tessellation;
        const { coordinateSystem } = options;

        const gltfData = await meshShapesToGltf(context.oc, nativeHandle, {
          linearTolerance,
          angularTolerance: angularTolerance * (Math.PI / 180),
          coordinateSystem,
        });

        return createKernelSuccess([
          createExportFile(format, format === 'glb' ? 'model.glb' : 'model.gltf', asBuffer(gltfData)),
        ]);
      }

      case 'step': {
        const result = exportOpencascadeStepAssembly(context.oc, nativeHandle);
        if (!result.ok) {
          return createKernelError([
            { message: 'STEP write failed', code: 'RUNTIME', type: 'runtime', severity: 'error' },
          ]);
        }

        return createKernelSuccess([createExportFile('step', 'assembly', result.bytes)]);
      }

      case 'stl': {
        const { oc } = context;
        const { linearTolerance, angularTolerance } = options.tessellation;
        const angularToleranceRad = angularTolerance * (Math.PI / 180);
        const { coordinateSystem } = options;

        const results = nativeHandle.map((entry) => {
          let exportShape = entry.shape;

          if (coordinateSystem === 'y-up') {
            const origin = new oc.gp_Pnt(0, 0, 0);
            const direction = new oc.gp_Dir(1, 0, 0);
            const axis = new oc.gp_Ax1(origin, direction);
            const trsf = new oc.gp_Trsf();
            trsf.SetRotation(axis, Math.PI / 2);
            const transform = new oc.BRepBuilderAPI_Transform(entry.shape, trsf, true, false);
            exportShape = transform.Shape();
            origin.delete();
            direction.delete();
            axis.delete();
            trsf.delete();
            transform.delete();
          }

          oc.BRepTools.Clean(exportShape, false);
          const mesh = new oc.BRepMesh_IncrementalMesh(exportShape, linearTolerance, false, angularToleranceRad, false);
          const filePath = `/tmp/export_${Date.now()}.stl`;
          const writer = new oc.StlAPI_Writer();
          const progress = new oc.Message_ProgressRange();
          writer.Write(exportShape, filePath, progress);
          const rawData = oc.FS.readFile(filePath) as Uint8Array<ArrayBuffer>;
          const data = new Uint8Array(rawData);
          oc.FS.unlink(filePath);
          mesh.delete();
          progress.delete();
          writer.delete();
          return createExportFile('stl', entry.name ?? 'Geometry', data);
        });

        return createKernelSuccess(results);
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
});

class OcctBuildError extends Error {
  public readonly issues: KernelIssue[];
  public constructor(issues: KernelIssue[]) {
    super(issues.map((i) => i.message).join('; '));
    this.issues = issues;
  }
}
