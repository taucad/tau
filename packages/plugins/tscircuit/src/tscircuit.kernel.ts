/**
 * The tscircuit kernel module.
 *
 * Bundles a TSX board with the runtime bundler, evaluates it once through
 * `@tscircuit/core` to settled circuit JSON (the native handle), and meshes that
 * JSON by view: a GLB board, a schematic SVG or a
 * PCB SVG. Exports (`glb`, `csv` BOM, `txt` netlist, `json`) derive from the same
 * handle without re-evaluating (charter D8). Rendering is offline: no parts
 * engine, local autorouter, and `fetch` is trapped during evaluation and GLB
 * conversion so every URL becomes a warning issue instead of a request
 * (charter D3–D6, D10, I1).
 */

import { Primitive, WebIO } from '@gltf-transform/core';
import { allExtensions, detectEdges, normalizeGltfGeometryNames } from '@taucad/geometry-core';
import type { Document, Root } from '@gltf-transform/core';
import type { AnyCircuitElement } from 'circuit-json';
import type { ComponentType } from 'react';
import { z } from 'zod';

import type { KernelIssue } from '@taucad/runtime/types';
import { cadEdgeOverlayMaterialDefaults, createExportFile } from '@taucad/runtime/types';
import {
  createFrameClassifier,
  createKernelError,
  createKernelParameterDeclaration,
  createKernelSuccess,
  defineKernel,
  deriveLocationFromFrames,
  enrichIssueLocation,
  extractDefaultParameters,
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
 * `name` and `version` of the installed packages the vendored engine bundles. They are dev
 * dependencies (and `@tscircuit/core` exports no `./package.json`), so a built kernel cannot read
 * their manifests; `tscircuit-package-identity.test.ts` fails when these differ from the installed
 * packages.
 */
const corePackage = { name: '@tscircuit/core', version: '0.0.1844' } as const;
const propsPackage = { name: '@tscircuit/props', version: '0.0.646' } as const;
const reactPackage = { name: 'react', version: '19.2.7' } as const;

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

const pcbViewOptionsSchema = z.object({ pinNumbers: z.boolean().optional().meta({ title: 'Pin numbers' }) });

/** Per-format export option schemas: GLB shares the runtime's glTF convention; the text formats take none. @public */
const tscircuitExportSchemas = {
  board: gltfExportConventionSchema,
  bom: z.object({}),
  netlist: z.object({}),
  circuit: z.object({}),
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
  /** Public selection IDs mapped to the converter's current sheet IDs. */
  sheets: ReadonlyMap<string, string>;
};

type TscircuitContext = {
  /** Evaluate an entry module's board component to settled circuit JSON. */
  renderCircuit: (
    module: unknown,
    parameters: Record<string, unknown>,
  ) => Promise<{
    circuitJson: CircuitElement[];
    authoredSheets: ReadonlyMap<string, string>;
  }>;
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

// `circuit-json`'s schema rejects elements emitted by the installed `@tscircuit/core`.
// Preserve the handle's actual wire invariant while admitting converter input at one boundary.
const converterCircuitJsonSchema = z.custom<AnyCircuitElement[]>(isCircuitElementArray);
const asCircuitJson = (circuitJson: CircuitElement[]) => converterCircuitJsonSchema.parse(circuitJson);

const stringField = (element: CircuitElement, key: string): string | undefined => {
  const value: unknown = Reflect.get(element, key);
  return typeof value === 'string' && value !== '' ? value : undefined;
};

// Names supplied by an author are stable across reordered evaluations. Generated names and
// duplicate names are evaluation-local; a fresh random token prevents a saved choice from retargeting.
const sheetsOf = (circuitJson: CircuitElement[], authoredSheets: ReadonlyMap<string, string>) => {
  const sheets = circuitJson.filter((element) => element.type === 'schematic_sheet');
  const counts = new Map<string, number>();
  for (const sheet of sheets) {
    const name = stringField(sheet, 'name');
    if (name) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  const localId = crypto.getRandomValues(new Uint32Array(4)).join('-');
  const map = new Map<string, string>();
  const instances = sheets.flatMap((sheet) => {
    const converterId = stringField(sheet, 'schematic_sheet_id');
    if (!converterId) {
      return [];
    }
    const name = stringField(sheet, 'name');
    const stable = name && counts.get(name) === 1 && authoredSheets.get(converterId) === name;
    const id = stable ? `sheet:${encodeURIComponent(name)}` : `local:${localId}:${converterId}`;
    map.set(id, converterId);
    const title = stringField(sheet, 'display_name') ?? name ?? 'Schematic sheet';
    return [{ id, title: stable ? title : `${title} (current evaluation)` }];
  });
  return { map, instances };
};

const orphanPartIssues = (circuitJson: CircuitElement[]): KernelIssue[] => {
  if (!circuitJson.some((element) => element.type === 'schematic_sheet')) {
    return [];
  }
  const names = circuitJson
    .filter((element) => element.type === 'schematic_component' && !stringField(element, 'schematic_sheet_id'))
    .map((element) => stringField(element, 'name') ?? stringField(element, 'source_component_id') ?? 'unnamed part');
  return names.length === 0
    ? []
    : [
        {
          message: `Parts outside every schematic sheet: ${names.join(', ')}.`,
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'warning',
          details: { producer: 'tscircuit', components: names },
        },
      ];
};

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
      details: {
        producer: 'tscircuit',
        elementType: element.type,
        ...('components' in element ? { components: element.components } : {}),
        ...('ports' in element ? { ports: element.ports } : {}),
        ...('center' in element ? { center: element.center } : {}),
      },
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

const addFeatureEdges = (document: Document, root: Root): void => {
  const edgeMaterial = document
    .createMaterial('tau-edge-material')
    .setBaseColorFactor([...cadEdgeOverlayMaterialDefaults.baseColorFactor])
    .setMetallicFactor(cadEdgeOverlayMaterialDefaults.metallicFactor)
    .setRoughnessFactor(cadEdgeOverlayMaterialDefaults.roughnessFactor)
    .setDoubleSided(cadEdgeOverlayMaterialDefaults.doubleSided)
    .setAlphaMode(cadEdgeOverlayMaterialDefaults.alphaMode);
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== Primitive.Mode['TRIANGLES']) {
        continue;
      }
      const positions = primitive.getAttribute('POSITION')?.getArray();
      const indices = primitive.getIndices()?.getArray();
      if (!(positions instanceof Float32Array)) {
        continue;
      }
      const edges = detectEdges(
        positions,
        indices instanceof Uint16Array || indices instanceof Uint32Array ? indices : undefined,
        30,
      );
      if (edges.positions.length === 0) {
        continue;
      }
      mesh.addPrimitive(
        document
          .createPrimitive()
          .setMode(Primitive.Mode['LINES']!)
          .setMaterial(edgeMaterial)
          .setAttribute(
            'POSITION',
            document.createAccessor('edge-positions').setType('VEC3').setArray(edges.positions),
          ),
      );
    }
  }
};

// Re-parent the converter's Y-up millimetre scene under one node carrying the requested convention.
const applyGlbConvention = async (
  glb: Uint8Array<ArrayBuffer>,
  { coordinateSystem, unit }: GlbConvention,
): Promise<Uint8Array<ArrayBuffer>> => {
  const io = new WebIO().registerExtensions(allExtensions);
  const document = await io.readBinary(glb);
  const root = document.getRoot();
  addFeatureEdges(document, root);
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
  const { convertCircuitJsonToGltf } = await import('#engine/gltf.js');
  // The converter's browser worker path uses resvg-wasm for board layers.
  const { value: content, issues } = await withOfflineFetch(async () => {
    const glb = await convertCircuitJsonToGltf(asCircuitJson(circuitJson), { format: 'glb' });
    if (!(glb instanceof ArrayBuffer)) {
      throw new TypeError('circuit-json-to-gltf did not return binary GLB bytes.');
    }
    return applyGlbConvention(new Uint8Array(glb), convention);
  });
  return { content, issues };
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
  builtinPackages: {
    tscircuit: corePackage,
    '@tscircuit/core': corePackage,
    '@tscircuit/props': propsPackage,
    react: reactPackage,
  },
  name: 'TscircuitKernel',
  version: '1.1.0',
  views: {
    board: { title: '3D board', mimeType: 'model/gltf-binary' },
    schematic: { title: 'Schematic', mimeType: 'image/svg+xml', instances: true },
    pcb: { title: 'PCB', mimeType: 'image/svg+xml', optionsSchema: pcbViewOptionsSchema },
  },
  exports: {
    board: {
      title: '3D board (glTF)',
      mimeType: 'model/gltf-binary',
      extension: 'glb',
      optionsSchema: tscircuitExportSchemas.board,
    },
    bom: {
      title: 'Bill of materials',
      mimeType: 'text/csv',
      extension: 'csv',
      optionsSchema: tscircuitExportSchemas.bom,
    },
    netlist: {
      title: 'Netlist',
      mimeType: 'text/plain',
      extension: 'txt',
      optionsSchema: tscircuitExportSchemas.netlist,
    },
    circuit: {
      title: 'Circuit JSON',
      mimeType: 'application/json',
      extension: 'json',
      optionsSchema: tscircuitExportSchemas.circuit,
    },
  },

  async initialize(_options, runtime): Promise<TscircuitContext> {
    const [reactModule, jsxRuntimeModule, core] = await Promise.all([
      import('#engine/react.js'),
      import('#engine/jsx-runtime.js'),
      import('#engine/core.js'),
    ]);
    const { React: react } = reactModule;
    const { jsxRuntime } = jsxRuntimeModule;
    const tscircuitCore: Record<string, unknown> = { ...core };
    // `React` as a global lets the bundler's classic JSX transform resolve without an import.
    registerKernelModule(runtime, {
      name: 'react',
      exports: { ...react },
      package: reactPackage,
      globalName: 'React',
    });
    registerKernelModule(runtime, { name: 'react/jsx-runtime', exports: { ...jsxRuntime }, package: reactPackage });
    registerKernelModule(runtime, { name: '@tscircuit/core', exports: tscircuitCore, package: corePackage });
    // `tscircuit` runs `@tscircuit/core`, so its identity is the alias `npm:@tscircuit/core@<version>`.
    registerKernelModule(runtime, { name: 'tscircuit', exports: tscircuitCore, package: corePackage });
    // Types-only package: an empty runtime module, as `@tscircuit/eval` provides.
    registerKernelModule(runtime, { name: '@tscircuit/props', exports: {}, package: propsPackage });
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
        const authoredSheets = new Map<string, string>();
        for (const child of circuit.children) {
          for (const component of [child, ...child.getDescendants()]) {
            if (component.componentName !== 'SchematicSheet') {
              continue;
            }
            const props: unknown = Reflect.get(component, '_parsedProps');
            const name = isRecordObject(props) && typeof props['name'] === 'string' ? props['name'] : undefined;
            const converterId: unknown = Reflect.get(component, 'schematic_sheet_id');
            if (name && typeof converterId === 'string') {
              authoredSheets.set(converterId, name);
            }
          }
        }
        return { circuitJson: circuit.getCircuitJson(), authoredSheets };
      },
    };
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
      const defaultParameters = extractDefaultParameters(executeResult.value);
      const jsonSchema = await jsonSchemaFromJson(defaultParameters);
      return createKernelSuccess({
        parameters: createKernelParameterDeclaration(defaultParameters, jsonSchema, {
          id: 'urn:taucad:tscircuit:parameters',
          name: 'TscircuitParameters',
        }),
      });
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

  async evaluate({ entryPath, parameters }, runtime, context) {
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
    let authoredSheets: ReadonlyMap<string, string>;
    let networkIssues: KernelIssue[];
    try {
      ({
        value: { circuitJson, authoredSheets },
        issues: networkIssues,
      } = await withOfflineFetch(async () => context.renderCircuit(executeResult.value, parameters)));
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

    const sheets = sheetsOf(circuitJson, authoredSheets);
    const handle: TscircuitNativeHandle = { circuitJson, sheets: sheets.map };
    const hasBoard = circuitJson.some((element) => element.type === 'pcb_board');
    const hasSchematic = circuitJson.some((element) => element.type.startsWith('schematic_'));
    return {
      handle,
      issues: [...collectCircuitIssues(circuitJson), ...orphanPartIssues(circuitJson), ...networkIssues],
      views: hasBoard ? undefined : hasSchematic ? (['schematic'] as const) : ([] as const),
      exports: hasBoard ? undefined : (['bom', 'netlist', 'circuit'] as const),
      ...(hasSchematic ? { instances: { schematic: sheets.instances } } : {}),
    };
  },

  async render(request) {
    const { handle, view } = request;
    const { circuitJson } = handle;
    switch (view) {
      case 'schematic': {
        const { convertCircuitJsonToSchematicSvg } = await import('#engine/svg.js');
        const sheetId = request.instance === undefined ? undefined : handle.sheets.get(request.instance);
        if (request.instance !== undefined && sheetId === undefined) {
          throw new TypeError(`Unknown schematic sheet instance: ${request.instance}`);
        }
        return {
          content: withViewBox(
            convertCircuitJsonToSchematicSvg(asCircuitJson(circuitJson), {
              ...(sheetId === undefined ? {} : { schematicSheetId: sheetId }),
              colorOverrides: { schematic: { junction: 'rgb(0, 105, 0)', wire: 'rgb(0, 105, 0)' } },
            }),
          ),
        };
      }
      case 'pcb': {
        const { convertCircuitJsonToPcbSvg } = await import('#engine/svg.js');
        return {
          content: withViewBox(
            convertCircuitJsonToPcbSvg(asCircuitJson(circuitJson), {
              showPinNumbers: request.options.pinNumbers,
              matchBoardAspectRatio: true,
              drawPaddingOutsideBoard: false,
            }),
          ),
        };
      }
      case 'board': {
        const { content, issues } = await circuitJsonToGlb(circuitJson, displayGlbConvention);
        return { content, issues };
      }
    }
  },

  serializeHandle({ handle }) {
    return new TextEncoder().encode(JSON.stringify({ circuitJson: handle.circuitJson, sheets: [...handle.sheets] }));
  },

  deserializeHandle({ serialized }): TscircuitNativeHandle {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(toBufferSource(serialized)));
    if (
      !isRecordObject(parsed) ||
      !isCircuitElementArray(parsed['circuitJson']) ||
      !Array.isArray(parsed['sheets']) ||
      !parsed['sheets'].every(
        (entry: unknown) =>
          Array.isArray(entry) && entry.length === 2 && entry.every((part) => typeof part === 'string'),
      )
    ) {
      throw new TypeError('Invalid tscircuit serialized handle: expected circuit JSON and sheet mappings.');
    }
    const mappings = new Map<string, string>(parsed['sheets']);
    const converterIds = new Set(
      parsed['circuitJson']
        .filter((element) => element.type === 'schematic_sheet')
        .map((element) => stringField(element, 'schematic_sheet_id')),
    );
    if (
      mappings.size !== parsed['sheets'].length ||
      mappings.size !== converterIds.size ||
      [...mappings].some(([id, converterId]) => !id || !converterIds.has(converterId)) ||
      new Set(mappings.values()).size !== mappings.size
    ) {
      throw new TypeError('Invalid tscircuit serialized handle: sheet mappings do not match circuit JSON.');
    }
    return { circuitJson: parsed['circuitJson'], sheets: mappings };
  },

  async export({ exportId, handle, options }) {
    const { circuitJson } = handle;
    const issues = collectCircuitIssues(circuitJson);
    switch (exportId) {
      case 'board': {
        const { content, issues: glbIssues } = await circuitJsonToGlb(circuitJson, options);
        return { files: [createExportFile('glb', 'model.glb', content)], issues: [...issues, ...glbIssues] };
      }
      case 'bom': {
        const { convertBomRowsToCsv, convertCircuitJsonToBomRows } = await import('#engine/bom.js');
        const rows = await convertCircuitJsonToBomRows({ circuitJson: asCircuitJson(circuitJson) });
        return { files: [textExportFile('csv', 'bom.csv', convertBomRowsToCsv(rows))], issues };
      }
      case 'netlist': {
        const { convertCircuitJsonToReadableNetlist } = await import('#engine/netlist.js');
        return {
          files: [
            textExportFile('txt', 'netlist.txt', convertCircuitJsonToReadableNetlist(asCircuitJson(circuitJson))),
          ],
          issues,
        };
      }
      case 'circuit': {
        return { files: [textExportFile('json', 'circuit.json', JSON.stringify(circuitJson, null, 2))], issues };
      }
      default: {
        const exhaustive: never = exportId;
        throw new Error(`Export '${String(exhaustive)}' is not supported by tscircuit.`);
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
