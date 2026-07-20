/* oxlint-disable new-cap -- OpenCascade API uses PascalCase method names */
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
  toVmEntryPath,
  convertRawIssuesToKernelIssues,
} from '#kernels/kernel-module-helpers.js';
import type { RuntimeModuleExports } from '#kernels/kernel-module-helpers.js';
import { createKernelError, createKernelSuccess } from '#kernels/kernel-helpers.js';
import { initOcct } from '#kernels/occt/oc-init.js';
import type { OcctModuleFactory } from '#kernels/occt/oc-init.js';
import { detectMultiThreadSupport, activateOccParallelism } from '#kernels/occt/oc-threading.js';
import { createIncrementalMesh, meshShapesToGltf, parseHexColor } from '#kernels/opencascade/opencascade-mesh.js';
import type { ShapeEntry } from '#kernels/opencascade/opencascade.types.js';
import { formatOcRuntimeError } from '#kernels/occt/oc-error-formatter.js';
import { RenderArtifactFinalizationError, finalizeRenderOutput } from '#framework/render-artifact-finalizer.js';
import { runOcMain } from '#kernels/occt/oc-run-main.js';
import { wrapOcForExceptions, wrapOcWithTracing } from '#kernels/occt/oc-tracing.js';
import type { OcTracingSummary } from '#kernels/occt/oc-tracing.js';
import type { KernelIssue } from '#types/runtime.types.js';
import { opencascadeDetectPattern } from '#kernels/opencascade/opencascade.constants.js';
import { createEmptyGlb, createEmptyGltf, createEmptyGltfGeometry } from '#utils/glb-writer.js';
import { resolveShapeName, uniqueShapeName } from '#utils/shape-names.js';

import type { OpenCascadeInstance, TopoDS_Shape } from '#kernels/opencascade/wasm/opencascade_full.js';

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
   * Defaults to `'full'`. Built-in variants let the OCJS glue module resolve
   * its adjacent WASM, so framework bundlers have a single owner for each
   * binary. Custom config keeps the explicit `wasmUrl` override path.
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
  isParallelMeshing: boolean;
  tracingSummary?: OcTracingSummary;
};

type OpenCascadeSerializedShapeMetadata = Omit<ShapeEntry, 'shape'>;

type OpenCascadeSerializedShapeEntry = {
  brep: Uint8Array<ArrayBuffer>;
  metadata: OpenCascadeSerializedShapeMetadata;
};

type OpenCascadeSerializedNativeHandle = {
  kind: 'opencascade-native-handle';
  version: 1;
  format: 'brep-ascii';
  occtFormatVersion: 'TopTools_FormatVersion_CURRENT';
  entries: OpenCascadeSerializedShapeEntry[];
};

// =============================================================================
// WASM resolution
// =============================================================================

/** Concrete WASM build variant the kernel runs against. */
type OpenCascadeWasmVariant = 'full' | 'multi';

/** Emscripten module factory returning the OpenCascade instance. */
type OpenCascadeModuleFactory = OcctModuleFactory<OpenCascadeInstance>;

type ResolvedWasm = {
  wasmUrl?: string;
  bindingsFactory: OpenCascadeModuleFactory;
  variant: OpenCascadeWasmVariant | 'custom';
};

let nativeHandleSnapshotCounter = 0;

/**
 * Resolve the WASM option into a concrete URL and loaded bindings factory.
 *
 * - **`'auto'`**: pick `'multi'` when `SharedArrayBuffer` + cross-origin isolation
 *   are available, otherwise fall back to `'full'`.
 * - **`'full'`** / **`'multi'`**: pin the variant explicitly. Static-string
 *   `import()` lets bundlers code-split the selected glue module. The
 *   Emscripten glue owns its adjacent `.wasm` URL; this prevents framework
 *   bundlers from emitting a duplicate asset from both the kernel module and
 *   the OCJS glue module.
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
    const module_: Record<string, unknown> = await import(
      /* webpackIgnore: true */
      /* @vite-ignore */
      wasm.wasmBindingsUrl
    );
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
      bindingsFactory: moduleExports.default,
      variant: 'multi',
    };
  }

  const moduleExports = await import('#kernels/opencascade/wasm/opencascade_full.js');
  return {
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

  const normalizeEntries = (entries: ShapeEntry[]): ShapeEntry[] => {
    const usedNames = new Map<string, number>();
    return entries.map((entry, index) => ({
      ...entry,
      name: uniqueShapeName(resolveShapeName({ index, name: entry.name, source: 'authored' }), usedNames),
    }));
  };

  if (Array.isArray(value)) {
    const entries: ShapeEntry[] = [];
    for (const item of value) {
      const entry = shapeEntryFromKernelReturnItem(item);
      if (entry) {
        entries.push(entry);
      }
    }

    return normalizeEntries(entries);
  }

  const entry = shapeEntryFromKernelReturnItem(value);
  return entry ? normalizeEntries([entry]) : [];
}

function isOpenCascadeShape(value: unknown): value is TopoDS_Shape {
  return isRecordObject(value) && typeof value['IsNull'] === 'function';
}

function createSnapshotTemporaryPath(index: number): string {
  nativeHandleSnapshotCounter += 1;
  return `/tmp/tau_opencascade_native_handle_${nativeHandleSnapshotCounter}_${index}.brep`;
}

function unlinkIfExists(oc: OpenCascadeInstance, filePath: string): void {
  try {
    oc.FS.unlink(filePath);
  } catch {
    // Best-effort MEMFS cleanup; missing temp files are harmless.
  }
}

function serializeShapeEntry(
  oc: OpenCascadeInstance,
  entry: ShapeEntry,
  index: number,
): OpenCascadeSerializedShapeEntry {
  const filePath = createSnapshotTemporaryPath(index);
  const progress = new oc.Message_ProgressRange();

  try {
    const ok = oc.BRepTools.Write(
      entry.shape,
      filePath,
      false,
      false,
      oc.TopTools_FormatVersion.TopTools_FormatVersion_CURRENT,
      progress,
    );
    if (!ok) {
      throw new Error(`OpenCascade native-handle snapshot write failed for shape ${index}.`);
    }

    const rawData = oc.FS.readFile(filePath) as Uint8Array<ArrayBuffer>;
    const brep = new Uint8Array(rawData);
    return {
      brep,
      metadata: {
        name: entry.name,
        color: entry.color,
        opacity: entry.opacity,
        metalness: entry.metalness,
        roughness: entry.roughness,
        density: entry.density,
      },
    };
  } finally {
    progress.delete();
    unlinkIfExists(oc, filePath);
  }
}

function deserializeShapeEntry(
  oc: OpenCascadeInstance,
  entry: OpenCascadeSerializedShapeEntry,
  index: number,
): ShapeEntry {
  const filePath = createSnapshotTemporaryPath(index);
  const shape = new oc.TopoDS_Shape();
  const builder = new oc.BRep_Builder();
  const progress = new oc.Message_ProgressRange();
  let ownsShape = true;

  try {
    oc.FS.writeFile(filePath, entry.brep);
    const ok = oc.BRepTools.Read(shape, filePath, builder, progress);
    if (!ok || shape.IsNull()) {
      throw new Error(`OpenCascade native-handle snapshot read failed for shape ${index}.`);
    }

    ownsShape = false;
    return {
      shape,
      ...entry.metadata,
    };
  } catch (error) {
    if (ownsShape) {
      shape.delete();
    }
    throw error;
  } finally {
    progress.delete();
    builder.delete();
    unlinkIfExists(oc, filePath);
  }
}

function assertSerializedNativeHandle(
  serializedNativeHandle: unknown,
): asserts serializedNativeHandle is OpenCascadeSerializedNativeHandle {
  if (!isRecordObject(serializedNativeHandle)) {
    throw new Error('Invalid OpenCascade native-handle snapshot: expected an object.');
  }

  const { kind, version, format, occtFormatVersion, entries } = serializedNativeHandle;
  if (kind !== 'opencascade-native-handle' || version !== 1) {
    throw new Error(`Unsupported OpenCascade native-handle snapshot schema: ${String(kind)}/${String(version)}`);
  }

  if (format !== 'brep-ascii' || occtFormatVersion !== 'TopTools_FormatVersion_CURRENT' || !Array.isArray(entries)) {
    throw new Error(
      `Unsupported OpenCascade native-handle snapshot format: ${String(format)}/${String(occtFormatVersion)}`,
    );
  }
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

  // GeoSpec AP242 profile (blueprint R1): every export is a proper root
  // assembly — one component per entry (identity placement), names on both the
  // instance and product labels, never free shapes. A single entry still
  // yields a one-component assembly. Auto-naming off so only authored names
  // reach the STEP output.
  oc.XCAFDoc_ShapeTool.SetAutoNaming(false);
  const rootLabel = shapeTool.NewShape();
  const rootName = new oc.TCollection_ExtendedString('assembly', true);
  oc.TDataStd_Name.Set(rootLabel, rootName);
  rootName.delete();

  for (const entry of nativeHandle) {
    if (entry.shape.IsNull()) {
      continue;
    }

    const label = shapeTool.AddShape(entry.shape, false);
    const identity = new oc.TopLoc_Location();
    const instanceLabel = shapeTool.AddComponent(rootLabel, label, identity);
    identity.delete();

    if (entry.name) {
      const entryName = new oc.TCollection_ExtendedString(entry.name, true);
      // Product label (PRODUCT name) and instance label (NEXT_ASSEMBLY_USAGE_OCCURRENCE name).
      oc.TDataStd_Name.Set(label, entryName);
      oc.TDataStd_Name.Set(instanceLabel, entryName);
      entryName.delete();
    }
    instanceLabel.delete();

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
      const matName = new oc.TCollection_AsciiString('tau-material');
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
      const materialName = new oc.TCollection_HAsciiString('tau-material');
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
  rootLabel.delete();

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
export const opencascade = defineKernel({
  id: 'opencascade',
  extensions: ['ts', 'js'],
  detectImport: opencascadeDetectPattern,
  builtinModuleNames: ['opencascade.js'],
  name: 'OpenCascadeKernel',
  version: '1.1.0',
  nativeHandleScope: 'source',
  optionsSchema: opencascadeOptionsSchema,
  render: { optionsSchema: opencascadeRenderSchema, content: [] },
  exportFormats: {
    stl: { optionsSchema: opencascadeExportSchemas.stl, content: [] },
    step: { optionsSchema: opencascadeExportSchemas.step, content: [] },
    glb: { optionsSchema: opencascadeExportSchemas.glb, content: [] },
    gltf: { optionsSchema: opencascadeExportSchemas.gltf, content: [] },
  },

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

    return { oc, isParallelMeshing: resolved.variant === 'multi', tracingSummary } satisfies OpenCascadeContext;
  },

  async getDependencies({ entryPath }, runtime) {
    return runtime.bundler.resolveDependencies(entryPath);
  },

  async getParameters({ entryPath }, runtime, context) {
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

      return createKernelSuccess({ defaultParameters, jsonSchema });
    } catch (error) {
      const issue = formatOcRuntimeError(error, context.oc, { bundleSourceMap, entryUrl });
      return createKernelError([issue]);
    }
  },

  async createGeometry({ entryPath, parameters }, runtime, context) {
    const { logger, tracer } = runtime;
    const relativeFilePath = toVmEntryPath(entryPath);
    let bundleSourceMap: string | undefined;
    let entryUrl: string | undefined;

    try {
      const bundleResult = await runtime.bundler.bundle(entryPath);
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
        return finalizeRenderOutput({ artifacts: [createEmptyGltfGeometry()], nativeHandle: [] });
      }

      const mainSpan = tracer.startSpan('opencascade.run-main', { phase: 'computingGeometry' });
      const mainResult = await runOcMain<unknown>({
        module,
        parameters,
        ocInstance: context.oc,
        errorContext: { bundleSourceMap, entryUrl },
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
        return finalizeRenderOutput({ artifacts: [createEmptyGltfGeometry()], nativeHandle: [] });
      }

      // Tessellation is deferred to meshGeometry — the raw TopoDS shapes are the
      // nativeHandle, and a BRep-only export never pays for a display mesh.
      return { nativeHandle: shapeEntries };
    } catch (error) {
      if (error instanceof OcctBuildError || error instanceof RenderArtifactFinalizationError) {
        throw error;
      }

      const issue = formatOcRuntimeError(error, context.oc, { bundleSourceMap, entryUrl });
      throw new OcctBuildError([issue]);
    }
  },

  async meshGeometry({ nativeHandle, options }, runtime, context) {
    if (nativeHandle.length === 0) {
      return { geometry: createEmptyGltfGeometry() };
    }

    try {
      const meshSpan = runtime.tracer.startSpan('opencascade.mesh-to-gltf', {
        shapeCount: nativeHandle.length,
        phase: 'computingGeometry',
      });

      const { tessellation } = options;
      const { linearTolerance, angularTolerance } = tessellation;
      const gltfData = await (async () => {
        try {
          return await meshShapesToGltf(context.oc, nativeHandle, {
            linearTolerance,
            angularTolerance: angularTolerance * (Math.PI / 180),
            inParallel: context.isParallelMeshing,
          });
        } finally {
          meshSpan.end();
        }
      })();

      const geometry: GeometryGltf = { format: 'gltf', content: gltfData };
      return { geometry };
    } catch (error) {
      const issue = formatOcRuntimeError(error, context.oc, {});
      throw new OcctBuildError([issue]);
    }
  },

  async exportGeometry(input, _runtime, context) {
    const { format, nativeHandle, options } = input;
    const emptyGltfExport = () =>
      createKernelSuccess([
        createExportFile(
          format,
          format === 'glb' ? 'model.glb' : 'model.gltf',
          asBuffer(format === 'glb' ? createEmptyGlb() : createEmptyGltf()),
        ),
      ]);
    const noGeometryExportError = () =>
      createKernelError([
        { message: 'No geometry available for export', code: 'RUNTIME', type: 'runtime', severity: 'error' },
      ]);

    switch (format) {
      case 'glb':
      case 'gltf': {
        if (nativeHandle.length === 0) {
          return emptyGltfExport();
        }

        const { linearTolerance, angularTolerance } = options.tessellation;
        const { coordinateSystem, unit } = options;

        const gltfData = await meshShapesToGltf(context.oc, nativeHandle, {
          linearTolerance,
          angularTolerance: angularTolerance * (Math.PI / 180),
          inParallel: context.isParallelMeshing,
          coordinateSystem,
          unit,
        });

        return createKernelSuccess([
          createExportFile(format, format === 'glb' ? 'model.glb' : 'model.gltf', asBuffer(gltfData)),
        ]);
      }

      case 'step': {
        if (nativeHandle.length === 0) {
          return noGeometryExportError();
        }

        const result = exportOpencascadeStepAssembly(context.oc, nativeHandle);
        if (!result.ok) {
          return createKernelError([
            { message: 'STEP write failed', code: 'RUNTIME', type: 'runtime', severity: 'error' },
          ]);
        }

        return createKernelSuccess([createExportFile('step', 'assembly', result.bytes)]);
      }

      case 'stl': {
        if (nativeHandle.length === 0) {
          return noGeometryExportError();
        }

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
          const mesh = createIncrementalMesh(oc, exportShape, {
            linearTolerance,
            angularTolerance: angularToleranceRad,
            inParallel: context.isParallelMeshing,
          });
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
          if (!entry.name) {
            throw new Error('OpenCascade ShapeEntry names must be normalized before STL export.');
          }
          return createExportFile('stl', entry.name, data);
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

  serializeNativeHandle({ nativeHandle }, _runtime, context): OpenCascadeSerializedNativeHandle {
    return {
      kind: 'opencascade-native-handle',
      version: 1,
      format: 'brep-ascii',
      occtFormatVersion: 'TopTools_FormatVersion_CURRENT',
      entries: nativeHandle.map((entry, index) => serializeShapeEntry(context.oc, entry, index)),
    };
  },

  deserializeNativeHandle({ serializedNativeHandle }, _runtime, context) {
    assertSerializedNativeHandle(serializedNativeHandle);
    return serializedNativeHandle.entries.map((entry, index) => deserializeShapeEntry(context.oc, entry, index));
  },
});

class OcctBuildError extends Error {
  public readonly issues: KernelIssue[];
  public constructor(issues: KernelIssue[]) {
    super(issues.map((i) => i.message).join('; '));
    this.issues = issues;
  }
}
