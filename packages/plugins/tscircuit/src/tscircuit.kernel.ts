/**
 * The tscircuit kernel module.
 *
 * Bundles a TSX board with the runtime bundler, evaluates it once through
 * `@tscircuit/core` to settled circuit JSON (the native handle), and meshes that
 * JSON per the `output` render option: a GLB board (`3d`), a schematic SVG or a
 * PCB SVG. Exports (`glb`, `csv` BOM, `txt` netlist, `json`) derive from the same
 * handle without re-evaluating (charter D8). Rendering is offline: no parts
 * engine, local autorouter, and `fetch` is trapped during evaluation and GLB
 * conversion so every URL becomes a warning issue instead of a request
 * (charter D3–D6, D10, I1).
 */

import { NodeIO } from '@gltf-transform/core';
import { normalizeGltfGeometryNames } from '@taucad/geometry-core';
import type { Root } from '@gltf-transform/core';
import type { AnyCircuitElement } from 'circuit-json';
import type { ComponentType } from 'react';
import { z } from 'zod';

import type { GeometryResponse, KernelIssue } from '@taucad/runtime/types';
import { createExportFile } from '@taucad/runtime/types';
import {
  createFrameClassifier,
  createKernelError,
  createKernelParameterDeclaration,
  createKernelSuccess,
  defineKernel,
  deriveLocationFromFrames,
  enrichIssueLocation,
  extractDefaultParameters,
  finalizeMeshOutput,
  gltfExportConventionSchema,
  isRecordObject,
  jsonSchemaFromJson,
  parseStackTrace,
  registerKernelModule,
  resolveSourcePath,
  toVmEntryPath,
} from '@taucad/runtime/kernel';

// =============================================================================
// Constants
// =============================================================================

/**
 * Versions reported to the bundler's module registry. `@tscircuit/core` does not
 * export its `package.json`; keep these in step with the `pnpm-workspace.yaml`
 * catalog pins.
 */
const tscircuitCoreVersion = '0.0.1844';
const tscircuitPropsVersion = '0.0.646';

/** `circuit-json-to-gltf` writes Y-up millimetres; Tau's GLB space is Y-up metres. */
const millimetersToMeters = 0.001;

/** Quaternion rotating +90° about X: Y-up to Z-up. */
const zUpRotation: [number, number, number, number] = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];

/**
 * Canonical regex for detecting tscircuit usage in source code.
 *
 * Branches: ESM import, CJS require, for both `tscircuit` and `@tscircuit/core`.
 * Kernel selection itself claims `.tsx`/`.jsx` by extension and `.ts` files by
 * bundler-detected imports of {@link tscircuitKernel}'s builtin module names,
 * so this pattern serves hosts that classify sources by content.
 * @public
 */
export const tscircuitDetectPattern =
  /import\s+.*from\s+["'](tscircuit|@tscircuit\/core)["']|require\s*\(\s*["'](tscircuit|@tscircuit\/core)["']\s*\)/;

/** Output kinds selectable through the `output` render option. @public */
export const tscircuitRenderSchema = z.object({
  output: z.enum(['3d', 'schematic', 'pcb']).default('3d'),
});

/** Per-format export option schemas: GLB shares the runtime's glTF convention; the text formats take none. @public */
export const tscircuitExportSchemas = {
  glb: gltfExportConventionSchema,
  csv: z.object({}),
  txt: z.object({}),
  json: z.object({}),
} as const satisfies Record<string, z.ZodType>;

type GlbConvention = z.output<typeof gltfExportConventionSchema>;

/** The display convention: Tau's GLB space is Y-up metres. */
const displayGlbConvention: GlbConvention = { coordinateSystem: 'y-up', unit: { length: 'meter' } };

// =============================================================================
// Types
// =============================================================================

/**
 * Circuit JSON element as the handle stores it. Every element carries a `type`
 * discriminator; the full `circuit-json` union stays out of the public
 * declarations so consumers never type-check the tscircuit declaration closure.
 */
type CircuitElement = { type: string };

type TscircuitNativeHandle = {
  circuitJson: CircuitElement[];
};

type TscircuitContext = {
  /** Evaluate an entry module's board component to settled circuit JSON. */
  renderCircuit: (module: unknown, parameters: Record<string, unknown>) => Promise<CircuitElement[]>;
};

type CircuitComponent = ComponentType<Record<string, unknown>>;

// =============================================================================
// Module resolution helpers
// =============================================================================

const isComponent = (value: unknown): value is CircuitComponent => typeof value === 'function';

// Resolve the board component from the evaluated entry module: the default export when it is a
// function, else the first exported function whose name does not start with `use` (charter D7,
// mirroring `@tscircuit/eval`).
const resolveCircuitComponent = (module: unknown): CircuitComponent | undefined => {
  if (!isRecordObject(module)) {
    return undefined;
  }
  const defaultExport = module['default'];
  if (isComponent(defaultExport)) {
    return defaultExport;
  }
  for (const [name, value] of Object.entries(module)) {
    if (!name.startsWith('use') && isComponent(value)) {
      return value;
    }
  }
  return undefined;
};

// =============================================================================
// Circuit JSON helpers
// =============================================================================

const isCircuitElementArray = (value: unknown): value is CircuitElement[] =>
  Array.isArray(value) && value.every((element) => isRecordObject(element) && typeof element['type'] === 'string');

// The converters take circuit-json's element union; the handle stores it structurally.
const asCircuitJson = (circuitJson: CircuitElement[]): AnyCircuitElement[] => circuitJson as AnyCircuitElement[];

// Map tscircuit `*_error` / `*_warning` elements to kernel issues. A failed library or URL
// footprint leaves the part unplaced but the board renders, so it is a warning (charter D4), as is
// any error core itself flags `is_fatal: false`.
const collectCircuitIssues = (circuitJson: CircuitElement[]): KernelIssue[] => {
  const issues: KernelIssue[] = [];
  for (const element of circuitJson) {
    const isError = element.type.endsWith('_error') || 'error_type' in element;
    const isWarning = element.type.endsWith('_warning') || 'warning_type' in element;
    if (!isError && !isWarning) {
      continue;
    }
    const isNonFatal =
      element.type === 'external_footprint_load_error' || ('is_fatal' in element && element.is_fatal === false);
    const message = 'message' in element && typeof element.message === 'string' ? element.message : element.type;
    issues.push({
      message,
      code: 'RUNTIME',
      type: 'runtime',
      severity: isError && !isNonFatal ? 'error' : 'warning',
      details: { producer: 'tscircuit', elementType: element.type },
    });
  }
  return issues;
};

// =============================================================================
// Offline guard
// =============================================================================

/** URL sinks of the `withOfflineFetch` calls currently in flight; one shared trap serves them all. */
const activeUrlSinks = new Set<Set<string>>();
let replacedFetch: typeof globalThis.fetch | undefined;

const offlineFetch: typeof globalThis.fetch = async (input) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  for (const sink of activeUrlSinks) {
    sink.add(url);
  }
  throw new TypeError(`Tau renders tscircuit boards offline; network access to ${url} is not available`);
};

const networkIssue = (url: string): KernelIssue => ({
  message: `Network access is disabled: ${url} was not fetched (tscircuit boards render offline in Tau).`,
  code: 'RUNTIME',
  type: 'runtime',
  severity: 'warning',
  details: { url, producer: 'tscircuit' },
});

// Run `task` with `globalThis.fetch` replaced by a recorder that rejects every request (charter I1):
// `@tscircuit/core` fetches `http(s)` footprints and `circuit-json-to-gltf` fetches `cadModel`
// URLs through the global. Nested calls share the one installation; the value replaced by the
// outermost call returns once every call has finished, and only if nothing else replaced it since.
const withOfflineFetch = async <T>(task: () => Promise<T>): Promise<{ value: T; issues: KernelIssue[] }> => {
  const urls = new Set<string>();
  if (activeUrlSinks.size === 0) {
    replacedFetch = globalThis.fetch;
    globalThis.fetch = offlineFetch;
  }
  activeUrlSinks.add(urls);
  try {
    const value = await task();
    return { value, issues: [...urls].map((url) => networkIssue(url)) };
  } finally {
    activeUrlSinks.delete(urls);
    if (activeUrlSinks.size === 0 && globalThis.fetch === offlineFetch) {
      if (replacedFetch === undefined) {
        Reflect.deleteProperty(globalThis, 'fetch');
      } else {
        globalThis.fetch = replacedFetch;
      }
    }
  }
};

// Transports may deliver the snapshot as any view or buffer; TextDecoder accepts either.
const toBufferSource = (value: unknown): ArrayBufferView | ArrayBuffer => {
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return value;
  }
  throw new TypeError('Invalid tscircuit serialized handle: expected UTF-8 circuit JSON bytes.');
};

// =============================================================================
// Artifact helpers
// =============================================================================

// `circuit-to-svg` emits `width`/`height` only; the SVG viewer fits by `viewBox`.
const withViewBox = (svg: string): string => {
  const rootTag = svg.slice(0, svg.indexOf('>'));
  if (rootTag.includes(' viewBox=')) {
    return svg;
  }
  const width = /\swidth="([\d.]+)"/.exec(rootTag)?.[1];
  const height = /\sheight="([\d.]+)"/.exec(rootTag)?.[1];
  return width !== undefined && height !== undefined
    ? svg.replace('<svg ', `<svg viewBox="0 0 ${width} ${height}" `)
    : svg;
};

const svgArtifact = (svg: string): GeometryResponse => ({ format: 'svg', content: withViewBox(svg) });

// Drop the converter's `TEXCOORD_n` attributes: with `boardTextureResolution: 0` no material samples
// them, and untextured rasterizers (Tau's nanoraster thumbnail transcoder) reject UV-bearing primitives.
const stripTextureCoordinates = (root: Root): void => {
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      for (const semantic of primitive.listSemantics()) {
        if (!semantic.startsWith('TEXCOORD_')) {
          continue;
        }
        const accessor = primitive.getAttribute(semantic);
        primitive.setAttribute(semantic, null);
        // The document root is every accessor's first parent; dispose once no primitive shares it.
        if (accessor && accessor.listParents().length <= 1) {
          accessor.dispose();
        }
      }
    }
  }
};

// Re-parent the converter's Y-up millimetre scene under one node carrying the requested convention.
const applyGlbConvention = async (
  glb: Uint8Array<ArrayBuffer>,
  { coordinateSystem, unit }: GlbConvention,
): Promise<Uint8Array<ArrayBuffer>> => {
  const io = new NodeIO();
  const document = await io.readBinary(glb);
  const root = document.getRoot();
  stripTextureCoordinates(root);
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) {
    return glb;
  }
  const scale = unit.length === 'meter' ? millimetersToMeters : 1;
  const wrapper = document.createNode('tscircuit').setScale([scale, scale, scale]);
  if (coordinateSystem === 'z-up') {
    wrapper.setRotation(zUpRotation);
  }
  for (const child of scene.listChildren()) {
    // oxlint-disable-next-line unicorn/prefer-dom-node-remove -- gltf-transform scene graph, not the DOM
    scene.removeChild(child);
    wrapper.addChild(child);
  }
  scene.addChild(wrapper);
  const written = await io.writeBinary(document);
  const copy = new Uint8Array(written.byteLength);
  copy.set(written);
  // The converter labels its output with generated names (`Scene`, `Material_1`, `Box0`);
  // clear them at the Tau boundary per the geometry naming policy.
  return normalizeGltfGeometryNames(copy, {
    format: 'glb',
    rewriteLegacyGeneratedShapeNames: true,
    materialNamePolicy: 'clear-generated',
    materialNameSource: 'external-generated',
    sceneNamePolicy: 'clear-generated',
    sceneNameSource: 'external-generated',
  });
};

// One GLB path for render and export (charter D6, D8).
const circuitJsonToGlb = async (
  circuitJson: CircuitElement[],
  convention: GlbConvention,
): Promise<{ content: Uint8Array<ArrayBuffer>; issues: KernelIssue[] }> => {
  const { convertCircuitJsonToGltf } = await import('circuit-json-to-gltf');
  // Textures off: the texture path needs resvg and a DOM; component bodies come from
  // local footprinter models and bounding boxes, never from model URLs (charter D10).
  const { value: glb, issues } = await withOfflineFetch(async () =>
    convertCircuitJsonToGltf(asCircuitJson(circuitJson), { format: 'glb', boardTextureResolution: 0 }),
  );
  if (!(glb instanceof ArrayBuffer)) {
    throw new TypeError('circuit-json-to-gltf did not return binary GLB bytes.');
  }
  return { content: await applyGlbConvention(new Uint8Array(glb), convention), issues };
};

const textExportFile = (format: 'csv' | 'txt' | 'json', name: string, text: string) =>
  createExportFile(format, name, new TextEncoder().encode(text));

// =============================================================================
// Kernel module definition
// =============================================================================

/** @public */
export const tscircuitKernel = defineKernel({
  id: 'tscircuit',
  extensions: ['tsx', 'jsx'],
  builtinModuleNames: ['tscircuit', '@tscircuit/core'],
  name: 'TscircuitKernel',
  version: '1.0.0',
  render: { optionsSchema: tscircuitRenderSchema },
  exportFormats: {
    glb: { optionsSchema: tscircuitExportSchemas.glb },
    csv: { optionsSchema: tscircuitExportSchemas.csv },
    txt: { optionsSchema: tscircuitExportSchemas.txt },
    json: { optionsSchema: tscircuitExportSchemas.json },
  },

  async initialize(_options, runtime): Promise<TscircuitContext> {
    const [react, jsxRuntime, core] = await Promise.all([
      import('react'),
      import('react/jsx-runtime'),
      import('@tscircuit/core'),
    ]);
    const tscircuitCore: Record<string, unknown> = { ...core };
    // `React` as a global lets the bundler's classic JSX transform resolve without an import.
    registerKernelModule(runtime, {
      name: 'react',
      exports: { ...react },
      version: react.version,
      globalName: 'React',
    });
    registerKernelModule(runtime, { name: 'react/jsx-runtime', exports: { ...jsxRuntime }, version: react.version });
    registerKernelModule(runtime, { name: '@tscircuit/core', exports: tscircuitCore, version: tscircuitCoreVersion });
    registerKernelModule(runtime, { name: 'tscircuit', exports: tscircuitCore, version: tscircuitCoreVersion });
    // Types-only package: an empty runtime module, as `@tscircuit/eval` provides.
    registerKernelModule(runtime, { name: '@tscircuit/props', exports: {}, version: tscircuitPropsVersion });
    runtime.logger.debug('Initialized tscircuit kernel with @tscircuit/core');
    return {
      async renderCircuit(module, parameters) {
        const component = resolveCircuitComponent(module);
        if (!component) {
          throw new Error(
            'tscircuit entry must export a board component: a default export or a named function export.',
          );
        }
        // No `partsEngine` and the local autorouter keep the render offline (charter D4).
        const circuit = new core.RootCircuit({ platform: { autorouter: 'auto' } });
        circuit.add(react.createElement(component, parameters));
        await circuit.renderUntilSettled();
        return circuit.getCircuitJson();
      },
    };
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
      const defaultParameters = extractDefaultParameters(executeResult.value);
      const jsonSchema = await jsonSchemaFromJson(defaultParameters);
      return createKernelSuccess(
        createKernelParameterDeclaration(defaultParameters, jsonSchema, {
          id: 'urn:taucad:tscircuit:parameters',
          name: 'TscircuitParameters',
        }),
      );
    } catch (error) {
      return createKernelError([
        {
          message: error instanceof Error ? error.message : 'Failed to extract parameters',
          code: 'RUNTIME',
          location: { fileName: relativeFilePath, startLineNumber: 1, startColumn: 1 },
          type: 'runtime',
          severity: 'error',
        },
      ]);
    }
  },

  async createGeometry({ entryPath, parameters }, runtime, context) {
    const relativeFilePath = toVmEntryPath(entryPath);

    const bundleResult = await runtime.bundler.bundle(entryPath);
    if (!bundleResult.success) {
      throw new TscircuitBuildError(enrichIssueLocation(bundleResult.issues, relativeFilePath));
    }

    const executeResult = await runtime.execute(bundleResult.code);
    if (!executeResult.success) {
      throw new TscircuitBuildError(enrichIssueLocation(executeResult.issues, relativeFilePath));
    }

    let circuitJson: CircuitElement[];
    let networkIssues: KernelIssue[];
    try {
      ({ value: circuitJson, issues: networkIssues } = await withOfflineFetch(async () =>
        context.renderCircuit(executeResult.value, parameters),
      ));
      runtime.signal.throwIfAborted();
    } catch (error) {
      const stackFrames = parseStackTrace(error, {
        classifyFrame: createFrameClassifier(),
        sourceMap: bundleResult.sourceMap,
        resolveSourcePath,
        lastEntryName: executeResult.entryUrl,
      });
      const location = deriveLocationFromFrames(stackFrames, bundleResult.sourceMap, resolveSourcePath);
      throw new TscircuitBuildError([
        {
          message: error instanceof Error ? error.message : String(error),
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
          stackFrames,
          location,
        },
      ]);
    }

    const nativeHandle: TscircuitNativeHandle = { circuitJson };
    return { nativeHandle, issues: [...collectCircuitIssues(circuitJson), ...networkIssues] };
  },

  async meshGeometry({ nativeHandle, options }) {
    const { circuitJson } = nativeHandle;
    switch (options.output) {
      case 'schematic': {
        const { convertCircuitJsonToSchematicSvg } = await import('circuit-to-svg');
        return finalizeMeshOutput({
          artifacts: [svgArtifact(convertCircuitJsonToSchematicSvg(asCircuitJson(circuitJson)))],
        });
      }
      case 'pcb': {
        const { convertCircuitJsonToPcbSvg } = await import('circuit-to-svg');
        return finalizeMeshOutput({ artifacts: [svgArtifact(convertCircuitJsonToPcbSvg(asCircuitJson(circuitJson)))] });
      }
      case '3d': {
        const { content, issues } = await circuitJsonToGlb(circuitJson, displayGlbConvention);
        return finalizeMeshOutput({ artifacts: [{ format: 'gltf', content }], issues });
      }
    }
  },

  serializeNativeHandle({ nativeHandle }) {
    return new TextEncoder().encode(JSON.stringify(nativeHandle.circuitJson));
  },

  deserializeNativeHandle({ serializedNativeHandle }): TscircuitNativeHandle {
    const parsed = JSON.parse(new TextDecoder().decode(toBufferSource(serializedNativeHandle))) as unknown;
    if (!isCircuitElementArray(parsed)) {
      throw new TypeError('Invalid tscircuit serialized handle: expected a circuit JSON array.');
    }
    return { circuitJson: parsed };
  },

  async exportGeometry({ format, nativeHandle, options }) {
    const { circuitJson } = nativeHandle;
    const issues = collectCircuitIssues(circuitJson);
    switch (format) {
      case 'glb': {
        const { content, issues: glbIssues } = await circuitJsonToGlb(circuitJson, options);
        return createKernelSuccess([createExportFile('glb', 'model.glb', content)], [...issues, ...glbIssues]);
      }
      case 'csv': {
        const { convertBomRowsToCsv, convertCircuitJsonToBomRows } = await import('circuit-json-to-bom-csv');
        const rows = await convertCircuitJsonToBomRows({ circuitJson: asCircuitJson(circuitJson) });
        return createKernelSuccess([textExportFile('csv', 'bom.csv', convertBomRowsToCsv(rows))], issues);
      }
      case 'txt': {
        const { convertCircuitJsonToReadableNetlist } = await import('circuit-json-to-readable-netlist');
        return createKernelSuccess(
          [textExportFile('txt', 'netlist.txt', convertCircuitJsonToReadableNetlist(asCircuitJson(circuitJson)))],
          issues,
        );
      }
      case 'json': {
        return createKernelSuccess(
          [textExportFile('json', 'circuit.json', JSON.stringify(circuitJson, null, 2))],
          issues,
        );
      }
      default: {
        const exhaustive: never = format;
        return createKernelError([
          {
            message: `Export format '${String(exhaustive)}' is not supported by tscircuit. Supported formats: glb, csv, txt, json.`,
            code: 'KERNEL_CAPABILITY_MISSING',
            type: 'runtime',
            severity: 'error',
          },
        ]);
      }
    }
  },
});

class TscircuitBuildError extends Error {
  public readonly issues: KernelIssue[];
  public constructor(issues: KernelIssue[]) {
    super(issues.map((issue) => issue.message).join('; '));
    this.issues = issues;
  }
}
