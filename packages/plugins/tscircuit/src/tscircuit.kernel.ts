/**
 * The tscircuit kernel module.
 *
 * Bundles a TSX board with the runtime bundler, evaluates it once through
 * `@tscircuit/core` to settled circuit JSON (the native handle), and meshes that
 * JSON by view: a GLB board, a schematic SVG or a
 * PCB SVG. Exports (`glb`, `csv` BOM, `txt` netlist, `json`) derive from the same
 * handle without re-evaluating (charter D8). Rendering is offline by default: no parts
 * engine, local autorouter, and `fetch` is trapped during evaluation and GLB
 * conversion so every URL becomes a warning issue instead of a request
 * (charter D3–D6, D10, I1). `kicad:` footprints and common footprinter strings
 * resolve from Tau's local KiCad pack; the opt-in `parts: 'online'` kernel option
 * also lets the trap pass requests to tscircuit's own part hosts.
 */

import { Primitive, WebIO } from '@gltf-transform/core';
import { allExtensions, detectEdges, normalizeGltfGeometryNames } from '@taucad/geometry-core';
import type { Document, Material, Node, Root, Scene } from '@gltf-transform/core';
import type { AnyCircuitElement } from 'circuit-json';
import type { ComponentType } from 'react';
import { z } from 'zod';

import type { BoardPresentationOptions } from '#board-geometry.js';
import { pcbPaletteOptions, schematicThemeOptions } from '#svg-themes.js';
import {
  entryOfPackModelUrl,
  kicadFootprintCacheUrl,
  kicadNameOfModelUrl,
  kicadPackEntry,
  kicadPackEntryForFootprinterString,
  kicadPackVersion,
  loadPackFootprint,
  loadPackModel,
  packModelUrl,
} from '#kicad-pack.js';

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
const reactPackage = { name: 'react', version: '19.3.1' } as const;

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

/**
 * Where parts come from. `local` (the default) never touches the network: footprinter strings,
 * inline footprints and Tau's KiCad pack. `online` also fetches `kicad:` footprints and cadModel
 * URLs from tscircuit's part hosts ({@link onlinePartHosts}); every other URL stays blocked.
 * @public
 */
export const tscircuitOptionsSchema = z.object({
  parts: z.enum(['local', 'online']).optional().meta({
    title: 'Parts',
    description: "Local parts only, or also fetch KiCad footprints and 3D models from tscircuit's part hosts.",
  }),
});

/** The hosts `parts: 'online'` may reach, over HTTPS only. @public */
export const onlinePartHosts: readonly string[] = [
  'kicad-mod-cache.tscircuit.com',
  'modelcdn.tscircuit.com',
  'registry-api.tscircuit.com',
  'jlcsearch.tscircuit.com',
];

const pcbViewOptionsSchema = z.object({
  pinNumbers: z.boolean().optional().meta({ title: 'Pin numbers' }),
  palette: z.enum(['fabrication', 'engineering']).optional().meta({
    title: 'Palette',
    description: 'Fabrication preview (mask, finish, silkscreen) or engineering layer colours.',
  }),
});

const schematicViewOptionsSchema = z.object({
  theme: z.enum(['light', 'dark', 'engineering']).optional().meta({
    title: 'Theme',
    description: 'Light or dark presentation colours, or the classic engineering (KiCad) colours.',
  }),
});

/** The board view's look: a layered presentation board by default, or the converter's technical slab. */
const boardViewOptionsSchema = z.object({
  style: z.enum(['presentation', 'technical']).optional().meta({
    title: 'Style',
    description:
      'Presentation builds real copper, mask and silkscreen layers; technical shows the textured slab with edges.',
  }),
  finish: z.enum(['enig', 'hasl', 'bare']).optional().meta({ title: 'Pad finish' }),
});

type BoardViewOptions = z.output<typeof boardViewOptionsSchema>;

/** Per-format export option schemas: GLB shares the runtime's glTF convention; the text formats take none. @public */
const tscircuitExportSchemas = {
  board: gltfExportConventionSchema.extend(boardViewOptionsSchema.shape),
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
  /** Whether the fetch guard may pass requests to {@link onlinePartHosts}; off when absent. */
  online?: boolean;
  /** Evaluate an entry module's board component to settled circuit JSON. */
  renderCircuit: (
    module: unknown,
    parameters: Record<string, unknown>,
  ) => Promise<{ circuitJson: CircuitElement[]; authoredSheets: ReadonlyMap<string, string> }>;
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

/** The `withOfflineFetch` calls in flight; one shared trap serves them all. */
type GuardCall = { urls: Set<string>; online: boolean };
const activeCalls = new Set<GuardCall>();
let replacedFetch: typeof globalThis.fetch | undefined;

/** The host's own `fetch`, for the pack's bundled assets, even while the trap is installed. */
const hostFetch: typeof globalThis.fetch = async (input, init) => {
  const fetchImpl = activeCalls.size > 0 ? replacedFetch : globalThis.fetch;
  if (!fetchImpl) {
    throw new TypeError('This host has no fetch to load bundled tscircuit assets.');
  }
  return fetchImpl(input, init);
};

const isOnlinePartUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && onlinePartHosts.includes(parsed.hostname);
  } catch {
    return false;
  }
};

const guardedFetch: typeof globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const packEntry = entryOfPackModelUrl(url);
  if (packEntry) {
    return new Response(await loadPackModel(packEntry, hostFetch), {
      headers: { 'content-type': 'model/gltf-binary' },
    });
  }
  // A request passes only when every call sharing the trap opted in.
  if (replacedFetch && isOnlinePartUrl(url) && [...activeCalls].every((call) => call.online)) {
    return replacedFetch(input, init);
  }
  for (const call of activeCalls) {
    call.urls.add(url);
  }
  throw new TypeError(`Tau renders tscircuit boards offline; network access to ${url} is not available`);
};

const networkIssue = (url: string): KernelIssue => ({
  message: isOnlinePartUrl(url)
    ? `Network access is disabled: ${url} was not fetched. Set the tscircuit kernel's parts option to 'online' to fetch tscircuit parts.`
    : `Network access is disabled: ${url} was not fetched (tscircuit boards render offline in Tau).`,
  code: 'RUNTIME',
  type: 'runtime',
  severity: 'warning',
  details: { url, producer: 'tscircuit' },
});

// Run `task` with `globalThis.fetch` replaced by a guard (charter I1): `@tscircuit/core` fetches
// `http(s)` footprints and `circuit-json-to-gltf` fetches `cadModel` URLs through the global. The
// guard serves `tau-models:` pack URLs, passes tscircuit part hosts when `online`, and records and
// rejects everything else. Nested calls share the one installation; the value replaced by the
// outermost call returns once every call has finished, and only if nothing else replaced it since.
const withOfflineFetch = async <T>(
  task: () => Promise<T>,
  { online = false }: { online?: boolean } = {},
): Promise<{ value: T; issues: KernelIssue[] }> => {
  const call: GuardCall = { urls: new Set(), online };
  if (activeCalls.size === 0) {
    replacedFetch = globalThis.fetch;
    globalThis.fetch = guardedFetch;
  }
  activeCalls.add(call);
  try {
    const value = await task();
    return { value, issues: [...call.urls].map((url) => networkIssue(url)) };
  } finally {
    activeCalls.delete(call);
    if (activeCalls.size === 0 && globalThis.fetch === guardedFetch) {
      if (replacedFetch === undefined) {
        Reflect.deleteProperty(globalThis, 'fetch');
      } else {
        globalThis.fetch = replacedFetch;
      }
    }
  }
};

// =============================================================================
// KiCad footprints and models
// =============================================================================

type FootprintLibraryResult = { footprintCircuitJson: unknown[]; cadModel?: { stepUrl: string } };

// `kicad:Library/Footprint` resolves from the local pack, else (online only) from kicad-mod-cache,
// mirroring @tscircuit/eval's resolver. The cadModel stays the canonical STEP URL so circuit JSON
// matches tscircuit's own; rendering swaps in the pack's GLB (see `withPackModels`).
const resolveKicadFootprint = async (reference: string, online: boolean): Promise<FootprintLibraryResult> => {
  // KiCad writes `Library:Footprint`; kicad-mod-cache paths are `Library/Footprint`.
  const name = reference.replace(':', '/');
  const cadModel = { stepUrl: `${kicadFootprintCacheUrl}/${name}.step` };
  const entry = kicadPackEntry(name);
  if (entry) {
    const footprint = await loadPackFootprint(entry, hostFetch);
    return { footprintCircuitJson: Array.isArray(footprint) ? footprint : [], cadModel };
  }
  if (!online) {
    throw new Error(
      `KiCad footprint "${name}" is not in Tau's local KiCad pack; set the tscircuit kernel's parts option to 'online' to fetch it.`,
    );
  }
  const url = `${kicadFootprintCacheUrl}/${name}.circuit.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load KiCad footprint "${name}" from ${url} (HTTP ${response.status}).`);
  }
  const raw: unknown = await response.json();
  const elements = Array.isArray(raw) ? raw : [raw];
  return {
    // Matches the pack: reference designator text only, no fabrication-layer notes.
    footprintCircuitJson: elements.filter((element: unknown) => {
      if (!isRecordObject(element) || typeof element['type'] !== 'string') {
        return true;
      }
      const { type } = element;
      return (
        !type.startsWith('pcb_fabrication_note') && (type !== 'pcb_silkscreen_text' || element['text'] === 'REF**')
      );
    }),
    cadModel,
  };
};

const modelUrlKeys = [
  'model_stl_url',
  'model_obj_url',
  'model_glb_url',
  'model_gltf_url',
  'model_step_url',
  'model_wrl_url',
] as const;

// Converter input with pack models swapped in: a KiCad STEP/WRL model the pack carries, or a
// generic footprinter body the pack maps by its exact footprinter string, becomes a `tau-models:`
// GLB. The handle's circuit JSON is untouched, so exports keep tscircuit's canonical URLs.
const withPackModels = (circuitJson: CircuitElement[]): CircuitElement[] =>
  circuitJson.map((element) => {
    if (element.type !== 'cad_component') {
      return element;
    }
    const record = element as CircuitElement & Partial<Record<(typeof modelUrlKeys)[number], string>>;
    const kicadUrl = record.model_step_url ?? record.model_wrl_url;
    const kicadName = kicadUrl === undefined ? undefined : kicadNameOfModelUrl(kicadUrl);
    // Core writes absent model fields as present-but-undefined keys.
    const hasModel = modelUrlKeys.some((key) => Boolean(record[key])) || Boolean(Reflect.get(record, 'model_jscad'));
    const footprinterString = stringField(element, 'footprinter_string');
    const entry =
      kicadName === undefined
        ? hasModel || footprinterString === undefined
          ? undefined
          : kicadPackEntryForFootprinterString(footprinterString)
        : kicadPackEntry(kicadName);
    if (!entry) {
      return element;
    }
    const { model_step_url: _step, model_wrl_url: _wrl, ...rest } = record;
    // eslint-disable-next-line @typescript-eslint/naming-convention -- circuit JSON field name.
    return { ...rest, model_glb_url: packModelUrl(entry) };
  });

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

const boundsOf = (node: Node): { min: number[]; max: number[] } | undefined => {
  const mesh = node.getMesh();
  if (!mesh) {
    return undefined;
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const primitive of mesh.listPrimitives()) {
    const position = primitive.getAttribute('POSITION');
    if (!position) {
      continue;
    }
    const lo = position.getMin([]);
    const hi = position.getMax([]);
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis]!, lo[axis]!);
      max[axis] = Math.max(max[axis]!, hi[axis]!);
    }
  }
  return { min, max };
};

// Swap the converter's untextured board slab for the layered presentation board, and give the
// component bodies presentation materials. The slab is the root mesh spanning a board's outline
// and thickness (the converter names it generically, so it is matched by size, not name).
const presentBoard = async (
  document: Document,
  scene: Scene | undefined,
  { circuitJson, options }: { circuitJson: CircuitElement[]; options: BoardPresentationOptions },
): Promise<void> => {
  const { buildPresentationBoard } = await import('#board-geometry.js');
  const { applyPresentationMaterial } = await import('#presentation-materials.js');
  const boards = circuitJson.filter((element) => element.type === 'pcb_board') as Array<
    CircuitElement & { width?: number; height?: number; thickness?: number }
  >;
  const isBoardSlab = (node: Node): boolean => {
    const bounds = boundsOf(node);
    if (!bounds) {
      return false;
    }
    const size = bounds.max.map((value, axis) => value - bounds.min[axis]!);
    return boards.some(
      (board) =>
        Math.abs((size[0] ?? 0) - (board.width ?? Number.NaN)) < 0.5 &&
        Math.abs((size[2] ?? 0) - (board.height ?? Number.NaN)) < 0.5 &&
        Math.abs((size[1] ?? 0) - (board.thickness ?? 1.6)) < 0.2,
    );
  };
  const slabMaterials = new Set<Material>();
  for (const node of scene?.listChildren() ?? []) {
    if (isBoardSlab(node)) {
      for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        const material = primitive.getMaterial();
        if (material) {
          slabMaterials.add(material);
        }
      }
      node.dispose();
    }
  }
  for (const material of slabMaterials) {
    material.dispose();
  }
  for (const material of document.getRoot().listMaterials()) {
    applyPresentationMaterial(material);
  }
  const board = await buildPresentationBoard(document, circuitJson, options);
  if (board && scene) {
    scene.addChild(board);
  }
};

// Re-parent the converter's Y-up millimetre scene under one node carrying the requested convention.
const applyGlbConvention = async (
  glb: Uint8Array<ArrayBuffer>,
  { coordinateSystem, unit }: GlbConvention,
  {
    circuitJson,
    options: { style = 'presentation', finish },
  }: { circuitJson: CircuitElement[]; options: BoardViewOptions },
): Promise<Uint8Array<ArrayBuffer>> => {
  const io = new WebIO().registerExtensions(allExtensions);
  const document = await io.readBinary(glb);
  const root = document.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (style === 'presentation') {
    await presentBoard(document, scene, { circuitJson, options: { finish } });
  } else {
    addFeatureEdges(document, root);
  }
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
  { online = false, ...options }: BoardViewOptions & { online?: boolean | undefined } = {},
): Promise<{ content: Uint8Array<ArrayBuffer>; issues: KernelIssue[] }> => {
  const { convertCircuitJsonToGltf } = await import('#engine/gltf.js');
  const presentation = (options.style ?? 'presentation') === 'presentation';
  // Presentation builds the board from layer geometry, so the converter skips its raster texture.
  // The technical path keeps the converter's textured board (resvg-wasm in the browser worker).
  const { value: content, issues } = await withOfflineFetch(
    async () => {
      const glb = await convertCircuitJsonToGltf(asCircuitJson(withPackModels(circuitJson)), {
        format: 'glb',
        ...(presentation ? { boardTextureResolution: 0 } : {}),
      });
      if (!(glb instanceof ArrayBuffer)) {
        throw new TypeError('circuit-json-to-gltf did not return binary GLB bytes.');
      }
      return applyGlbConvention(new Uint8Array(glb), convention, { circuitJson, options });
    },
    { online },
  );
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
    'react-dom': { name: 'react-dom', version: reactPackage.version },
    // The connectivity-map dependency accepts newer Biome releases whose platform binaries may be unpublished.
    '@biomejs/biome': { name: '@biomejs/biome', version: '2.5.15' },
    // The published core requires wildcard peers. Projects own the same exact versions as the vendored engine.
    '@tscircuit/capacity-autorouter': { name: '@tscircuit/capacity-autorouter', version: '0.0.879' },
    '@tscircuit/checks': { name: '@tscircuit/checks', version: '0.0.183' },
    '@tscircuit/circuit-json-util': { name: '@tscircuit/circuit-json-util', version: '0.0.111' },
    '@tscircuit/create-fdm-enclosure': { name: '@tscircuit/create-fdm-enclosure', version: '0.0.7' },
    '@tscircuit/footprinter': { name: '@tscircuit/footprinter', version: '0.0.426' },
    '@tscircuit/infgrid-ijump-astar': { name: '@tscircuit/infgrid-ijump-astar', version: '0.0.35' },
    '@tscircuit/math-utils': { name: '@tscircuit/math-utils', version: '0.0.38' },
    '@tscircuit/schematic-match-adapt': { name: '@tscircuit/schematic-match-adapt', version: '0.0.22' },
    'circuit-json-to-bpc': { name: 'circuit-json-to-bpc', version: '0.0.14' },
    'bpc-graph': { name: 'bpc-graph', version: '0.0.67' },
    '@tscircuit/matchpack': { name: '@tscircuit/matchpack', version: '0.0.91' },
    'circuit-json': { name: 'circuit-json', version: '0.0.485' },
    'circuit-json-to-connectivity-map': { name: 'circuit-json-to-connectivity-map', version: '0.0.30' },
    'circuit-json-to-spice': { name: 'circuit-json-to-spice', version: '0.0.46' },
    'schematic-symbols': { name: 'schematic-symbols', version: '0.0.244' },
    spicets: { name: 'spicets', version: '0.0.5' },
    typescript: { name: 'typescript', version: '5.9.3' },
    '@tscircuit/soup-util': { name: '@tscircuit/soup-util', version: '0.0.41' },
    'connectivity-map': { name: 'connectivity-map', version: '1.0.0' },
    // These runtime imports are incorrectly declared as dev dependencies by the published core.
    '@tscircuit/copper-pour-solver': { name: '@tscircuit/copper-pour-solver', version: '0.0.52' },
    '@tscircuit/image-utils': { name: '@tscircuit/image-utils', version: '0.0.10' },
    '@tscircuit/infer-cable-insertion-point': { name: '@tscircuit/infer-cable-insertion-point', version: '0.0.4' },
    '@tscircuit/miniflex': { name: '@tscircuit/miniflex', version: '0.0.4' },
    '@tscircuit/schematic-trace-solver': { name: '@tscircuit/schematic-trace-solver', version: '0.0.184' },
    '@tscircuit/solver-utils': { name: '@tscircuit/solver-utils', version: '0.0.21' },
    'calculate-elbow': { name: 'calculate-elbow', version: '0.0.13' },
    'graphics-debug': { name: 'graphics-debug', version: '0.0.100' },
    minicssgrid: { name: 'minicssgrid', version: '0.0.9' },
    spicey: { name: 'spicey', version: '0.0.14' },
    debug: { name: 'debug', version: '4.4.3' },
    flatbush: { name: 'flatbush', version: '4.6.2' },
  },
  name: 'TscircuitKernel',
  version: `1.2.0+kicad.${kicadPackVersion}`,
  optionsSchema: tscircuitOptionsSchema,
  views: {
    board: { title: '3D board', mimeType: 'model/gltf-binary', optionsSchema: boardViewOptionsSchema },
    schematic: {
      title: 'Schematic',
      mimeType: 'image/svg+xml',
      instances: true,
      optionsSchema: schematicViewOptionsSchema,
    },
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

  async initialize(options, runtime): Promise<TscircuitContext> {
    const online = options.parts === 'online';
    const [reactModule, jsxRuntimeModule, core] = await Promise.all([
      import('#engine/react.js'),
      import('#engine/jsx-runtime.js'),
      import('#engine/core.js'),
    ]);
    const { React: react } = reactModule;
    const { jsxRuntime } = jsxRuntimeModule;
    const tscircuitCore: Record<string, unknown> = { ...core };
    // `React` as a global lets the bundler's classic JSX transform resolve without an import.
    registerKernelModule(runtime, { name: 'react', exports: { ...react }, package: reactPackage, globalName: 'React' });
    registerKernelModule(runtime, { name: 'react/jsx-runtime', exports: { ...jsxRuntime }, package: reactPackage });
    registerKernelModule(runtime, { name: '@tscircuit/core', exports: tscircuitCore, package: corePackage });
    // `tscircuit` runs `@tscircuit/core`, so its identity is the alias `npm:@tscircuit/core@<version>`.
    registerKernelModule(runtime, { name: 'tscircuit', exports: tscircuitCore, package: corePackage });
    // Types-only package: an empty runtime module, as `@tscircuit/eval` provides.
    registerKernelModule(runtime, { name: '@tscircuit/props', exports: {}, package: propsPackage });
    runtime.logger.debug('Initialized tscircuit kernel with @tscircuit/core');
    return {
      online,
      async renderCircuit(module, parameters) {
        const component = resolveCircuitComponent(module);
        if (!component) {
          throw new Error(
            'tscircuit entry must export a board component: a default export or a named function export.',
          );
        }
        // No `partsEngine` and the local autorouter keep the render offline (charter D4); `kicad:`
        // footprints resolve from the local pack, and from kicad-mod-cache when online.
        const circuit = new core.RootCircuit({
          platform: {
            autorouter: 'auto',
            footprintLibraryMap: { kicad: async (name: string) => resolveKicadFootprint(name, online) },
          },
        });
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
      } = await withOfflineFetch(async () => context.renderCircuit(executeResult.value, parameters), {
        online: context.online,
      }));
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

  async render(request, _runtime, context) {
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
              ...schematicThemeOptions(request.options.theme),
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
              ...pcbPaletteOptions(request.options.palette, circuitJson),
              matchBoardAspectRatio: true,
              drawPaddingOutsideBoard: false,
            }),
          ),
        };
      }
      case 'board': {
        const { content, issues } = await circuitJsonToGlb(circuitJson, displayGlbConvention, {
          ...request.options,
          online: context.online,
        });
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

  async export({ exportId, handle, options }, _runtime, context) {
    const { circuitJson } = handle;
    const issues = collectCircuitIssues(circuitJson);
    switch (exportId) {
      case 'board': {
        const { coordinateSystem, unit, style, finish } = options;
        const { content, issues: glbIssues } = await circuitJsonToGlb(
          circuitJson,
          { coordinateSystem, unit },
          { style, finish, online: context.online },
        );
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
