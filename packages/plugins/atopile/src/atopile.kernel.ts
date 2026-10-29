/**
 * The atopile kernel module.
 *
 * Mirrors the `.ato` project into a private directory, compiles it with atopile's own
 * `ato build` pipeline in a CPython 3.14 worker (`python/atopile_worker.py`), and turns the
 * resulting KiCad PCB and BOM into circuit JSON (the native handle) with `@tscircuit/core`.
 * Views and exports render from that handle with the same converters as `@taucad/tscircuit`:
 * a GLB board with each footprint's STEP model, a schematic SVG, a PCB SVG, a BOM from
 * atopile's own rows, a netlist, the circuit JSON and the KiCad PCB atopile wrote.
 *
 * Spike scope: the worker is a subprocess of a caller-supplied interpreter with atopile
 * installed (`python` option or `TAU_ATOPILE_PYTHON`), so the kernel runs only in Node hosts.
 */

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WebIO } from '@gltf-transform/core';
import { allExtensions, normalizeGltfGeometryNames } from '@taucad/geometry-core';
import type { AnyCircuitElement } from 'circuit-json';
import { z } from 'zod';

import type { KernelIssue, KernelServices } from '@taucad/runtime/types';
import { createExportFile } from '@taucad/runtime/types';
import {
  createKernelParameterDeclaration,
  createKernelSuccess,
  defineKernel,
  gltfExportConventionSchema,
  isRecordObject,
  toVmEntryPath,
} from '@taucad/runtime/kernel';

import { atopileBoardToCircuitJson } from '#atopile-circuit.js';
import type { AtopilePlacement, CircuitElement } from '#atopile-circuit.js';
import { atopileBoardSchema, atopileWorkerResultSchema } from '#atopile.schemas.js';
import type { AtopileBoard } from '#atopile.schemas.js';

// =============================================================================
// Constants
// =============================================================================

/** `circuit-json-to-gltf` writes Y-up millimetres; Tau's GLB space is Y-up metres. */
const millimetersToMeters = 0.001;

/** Quaternion rotating +90° about X: Y-up to Z-up. */
const zUpRotation: [number, number, number, number] = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];

/** Directories atopile regenerates; mirroring them would only slow the worker down. */
const generatedDirectories = new Set(['build', '.ato', '.git', 'node_modules']);

const workerPath = fileURLToPath(new URL('../python/atopile_worker.py', import.meta.url));

/** Options for the atopile kernel. @public */
export const atopileOptionsSchema = z.object({
  /** CPython 3.14 interpreter with `atopile` 0.15.x installed. Defaults to `TAU_ATOPILE_PYTHON`, then `python3`. */
  python: z.string().optional(),
  /** Milliseconds one compile may take before the worker is killed. */
  compileTimeout: z.number().int().positive().default(120_000),
});

const pcbViewOptionsSchema = z.object({
  pinNumbers: z.boolean().optional().meta({ title: 'Pin numbers' }),
});

type GlbConvention = z.output<typeof gltfExportConventionSchema>;

/** The display convention: Tau's GLB space is Y-up metres. */
const displayGlbConvention: GlbConvention = {
  coordinateSystem: 'y-up',
  unit: { length: 'meter' },
};

// =============================================================================
// Types
// =============================================================================

type AtopileNativeHandle = {
  board: AtopileBoard;
  circuitJson: CircuitElement[];
  placement: AtopilePlacement;
};

type AtopileContext = {
  python: string;
  /** Milliseconds. */
  compileTimeout: number;
};

class AtopileBuildError extends Error {
  public readonly issues: KernelIssue[];
  public constructor(issues: KernelIssue[]) {
    super(issues.map((issue) => issue.message).join('; '));
    this.issues = issues;
  }
}

// =============================================================================
// Project mirroring
// =============================================================================

// Runtime paths are root-relative POSIX paths; the root itself is `''`.
const parentOf = (path: string): string => {
  const parent = posix.dirname(path);
  return parent === '.' ? '' : parent;
};
const childOf = (directory: string, name: string): string => (directory === '' ? name : `${directory}/${name}`);
const relativeTo = (root: string, path: string): string => (root === '' ? path : path.slice(root.length + 1));

/**
 * Find the project an entry belongs to.
 *
 * @param entryPath - Root-relative path of the `.ato` entry.
 * @param services - The operation's kernel services.
 * @returns The nearest ancestor directory holding `ato.yaml`, else the entry's own directory.
 */
const projectRootOf = async (entryPath: string, services: KernelServices): Promise<string> => {
  const ancestors: string[] = [parentOf(entryPath)];
  while (ancestors.at(-1) !== '') {
    ancestors.push(parentOf(ancestors.at(-1) ?? ''));
  }
  const found = await Promise.all(
    ancestors.map(async (directory) => services.filesystem.exists(childOf(directory, 'ato.yaml'))),
  );
  return ancestors[found.indexOf(true)] ?? parentOf(entryPath);
};

const projectFilesOf = async (directory: string, services: KernelServices): Promise<string[]> => {
  const entries = await services.filesystem.readdirStat(directory);
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = childOf(directory, entry.name);
      if (entry.type !== 'dir') {
        return [path];
      }
      return generatedDirectories.has(entry.name) ? [] : projectFilesOf(path, services);
    }),
  );
  return nested.flat().sort();
};

const mirrorProject = async (root: string, files: readonly string[], services: KernelServices): Promise<string> => {
  const mirror = await mkdtemp(join(tmpdir(), 'tau-atopile-'));
  const contents = await services.filesystem.readFiles([...files]);
  await Promise.all(
    Object.entries(contents).map(async ([path, bytes]) => {
      const target = join(mirror, relativeTo(root, path));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }),
  );
  return mirror;
};

// =============================================================================
// Worker
// =============================================================================

type WorkerRequest = {
  context: AtopileContext;
  projectDirectory: string;
  entry: string;
  signal: AbortSignal;
};

const runWorker = async ({ context, projectDirectory, entry, signal }: WorkerRequest): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const child = spawn(context.python, [workerPath, projectDirectory, entry], {
      cwd: projectDirectory,
      signal,
      timeout: context.compileTimeout,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: string[] = [];
    const stderr: string[] = [];
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => stdout.push(chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      const text = stdout.join('');
      if (code !== 0 || text.trim() === '') {
        reject(new Error(`atopile worker exited with code ${String(code)}: ${stderr.join('').trim().slice(-2000)}`));
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });

const workerIssue = (
  issue: {
    message: string;
    severity: 'error' | 'warning';
    details: Record<string, unknown>;
  },
  fileName: string,
): KernelIssue => ({
  message: issue.message,
  code: 'RUNTIME',
  type: 'runtime',
  severity: issue.severity,
  location: { fileName, startLineNumber: 1, startColumn: 1 },
  details: { producer: 'atopile', ...issue.details },
});

// =============================================================================
// Circuit JSON helpers
// =============================================================================

const isCircuitElementArray = (value: unknown): value is CircuitElement[] =>
  Array.isArray(value) && value.every((element) => isRecordObject(element) && typeof element['type'] === 'string');

// `circuit-json`'s schema rejects elements emitted by the installed `@tscircuit/core`.
// Admit the handle's element array at one boundary for the converters, as `@taucad/tscircuit` does.
const converterCircuitJsonSchema = z.custom<AnyCircuitElement[]>(isCircuitElementArray);
const asCircuitJson = (circuitJson: CircuitElement[]) => converterCircuitJsonSchema.parse(circuitJson);

// Authoring lints from tscircuit (`<chip>` versus `<resistor>`, missing pin attributes) describe the
// generated elements, not the user's `.ato` source, so only errors and network failures surface.
const circuitIssues = (circuitJson: CircuitElement[]): KernelIssue[] =>
  circuitJson
    .filter((element) => element.type.endsWith('_error') || 'error_type' in element)
    .map((element) => ({
      message: 'message' in element && typeof element.message === 'string' ? element.message : element.type,
      code: 'RUNTIME',
      type: 'runtime',
      severity: 'is_fatal' in element && element.is_fatal === false ? 'warning' : 'error',
      details: { producer: 'tscircuit', elementType: element.type },
    }));

const placementIssue = (placement: AtopilePlacement): KernelIssue[] =>
  placement === 'packed'
    ? [
        {
          message:
            'The KiCad layout places parts outside the board outline (a fresh atopile build leaves them unplaced), so Tau packed them for the PCB and 3D views.',
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'warning',
          details: { producer: 'atopile' },
        },
      ]
    : [];

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

// STEP models travel as `data:` URLs; every other URL fails instead of reaching the network.
const withDataOnlyFetch = async <T>(task: () => Promise<T>): Promise<T> => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith('data:')) {
      throw new TypeError(`Tau renders atopile boards offline; network access to ${url} is not available`);
    }
    return original(input, init);
  };
  try {
    return await task();
  } finally {
    globalThis.fetch = original;
  }
};

const applyGlbConvention = async (
  glb: Uint8Array<ArrayBuffer>,
  { coordinateSystem, unit }: GlbConvention,
): Promise<Uint8Array<ArrayBuffer>> => {
  const io = new WebIO().registerExtensions(allExtensions);
  const document = await io.readBinary(glb);
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  if (scene) {
    const scale = unit.length === 'meter' ? millimetersToMeters : 1;
    const wrapper = document.createNode('atopile').setScale([scale, scale, scale]);
    if (coordinateSystem === 'z-up') {
      wrapper.setRotation(zUpRotation);
    }
    for (const child of scene.listChildren()) {
      // oxlint-disable-next-line unicorn/prefer-dom-node-remove -- gltf-transform scene graph, not the DOM
      scene.removeChild(child);
      wrapper.addChild(child);
    }
    scene.addChild(wrapper);
  }
  const written = await io.writeBinary(document);
  const copy = new Uint8Array(written.byteLength);
  copy.set(written);
  return normalizeGltfGeometryNames(copy, {
    format: 'glb',
    rewriteLegacyGeneratedShapeNames: true,
    materialNamePolicy: 'clear-generated',
    materialNameSource: 'external-generated',
    sceneNamePolicy: 'clear-generated',
    sceneNameSource: 'external-generated',
  });
};

const circuitJsonToGlb = async (
  circuitJson: CircuitElement[],
  convention: GlbConvention,
): Promise<Uint8Array<ArrayBuffer>> => {
  const { convertCircuitJsonToGltf } = await import('circuit-json-to-gltf');
  return withDataOnlyFetch(async () => {
    const glb = await convertCircuitJsonToGltf(asCircuitJson(circuitJson), {
      format: 'glb',
    });
    if (!(glb instanceof ArrayBuffer)) {
      throw new TypeError('circuit-json-to-gltf did not return binary GLB bytes.');
    }
    return applyGlbConvention(new Uint8Array(glb), convention);
  });
};

const csvCell = (value: unknown): string => {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/**
 * Write atopile's own BOM rows as CSV.
 *
 * @param board - The board IR carrying atopile's BOM.
 * @returns One line per part, with every designator that uses it.
 */
const bomCsv = (board: AtopileBoard): string => {
  const header = ['Designator', 'Quantity', 'Manufacturer', 'MPN', 'LCSC Part #', 'Package', 'Value', 'Datasheet'];
  const rows = board.bom.map((row) => [
    row.usages.map((usage) => usage.designator).join(' '),
    row.quantity,
    row.manufacturer,
    row.mpn,
    row.lcsc,
    row.package,
    row.value,
    row.datasheet,
  ]);
  return `${[header, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(',')).join('\n')}\n`;
};

const textExportFile = (format: 'csv' | 'txt' | 'json', name: string, text: string) =>
  createExportFile(format, name, new TextEncoder().encode(text));

// =============================================================================
// Kernel module definition
// =============================================================================

/** @public */
export const atopileKernel = defineKernel({
  id: 'atopile',
  extensions: ['ato'],
  name: 'AtopileKernel',
  version: '0.1.0',
  optionsSchema: atopileOptionsSchema,
  views: {
    board: { title: '3D board', mimeType: 'model/gltf-binary' },
    schematic: { title: 'Schematic', mimeType: 'image/svg+xml' },
    pcb: {
      title: 'PCB',
      mimeType: 'image/svg+xml',
      optionsSchema: pcbViewOptionsSchema,
    },
  },
  exports: {
    board: {
      title: '3D board (glTF)',
      mimeType: 'model/gltf-binary',
      extension: 'glb',
      optionsSchema: gltfExportConventionSchema,
    },
    bom: {
      title: 'Bill of materials',
      mimeType: 'text/csv',
      extension: 'csv',
      optionsSchema: z.object({}),
    },
    netlist: {
      title: 'Netlist',
      mimeType: 'text/plain',
      extension: 'txt',
      optionsSchema: z.object({}),
    },
    circuit: {
      title: 'Circuit JSON',
      mimeType: 'application/json',
      extension: 'json',
      optionsSchema: z.object({}),
    },
    kicad: {
      title: 'KiCad PCB',
      mimeType: 'application/x-kicad-pcb',
      extension: 'kicad_pcb',
      optionsSchema: z.object({}),
    },
  },

  async initialize(options): Promise<AtopileContext> {
    return {
      python: options.python ?? process.env['TAU_ATOPILE_PYTHON'] ?? 'python3',
      compileTimeout: options.compileTimeout,
    };
  },

  async resolve({ entryPath }, services) {
    const root = await projectRootOf(entryPath, services);
    return { resolved: await projectFilesOf(root, services), unresolved: [] };
  },

  async describe() {
    // `.ato` values are solver constraints, not runtime parameters.
    return createKernelSuccess({
      parameters: createKernelParameterDeclaration(
        {},
        { type: 'object', properties: {}, additionalProperties: false },
        { id: 'urn:taucad:atopile:parameters', name: 'AtopileParameters' },
      ),
    });
  },

  async evaluate({ entryPath }, services, context) {
    const fileName = toVmEntryPath(entryPath);
    const root = await projectRootOf(entryPath, services);
    const mirror = await mirrorProject(root, await projectFilesOf(root, services), services);
    try {
      const raw = await runWorker({
        context,
        projectDirectory: mirror,
        entry: relativeTo(root, entryPath),
        signal: services.signal,
      });
      const result = atopileWorkerResultSchema.parse(raw);
      const issues = result.issues.map((issue) => workerIssue(issue, fileName));
      if (!result.ok) {
        throw new AtopileBuildError(issues);
      }
      const { circuitJson, placement } = await atopileBoardToCircuitJson(result.ir);
      services.signal.throwIfAborted();
      const handle: AtopileNativeHandle = {
        board: result.ir,
        circuitJson,
        placement,
      };
      return {
        handle,
        issues: [...issues, ...circuitIssues(circuitJson), ...placementIssue(placement)],
      };
    } finally {
      await rm(mirror, { recursive: true, force: true });
    }
  },

  async render(request) {
    const { handle, view } = request;
    switch (view) {
      case 'schematic': {
        const { convertCircuitJsonToSchematicSvg } = await import('circuit-to-svg');
        return {
          content: withViewBox(
            convertCircuitJsonToSchematicSvg(asCircuitJson(handle.circuitJson), {
              colorOverrides: {
                schematic: {
                  junction: 'rgb(0, 105, 0)',
                  wire: 'rgb(0, 105, 0)',
                },
              },
            }),
          ),
        };
      }
      case 'pcb': {
        const { convertCircuitJsonToPcbSvg } = await import('circuit-to-svg');
        return {
          content: withViewBox(
            convertCircuitJsonToPcbSvg(asCircuitJson(handle.circuitJson), {
              showPinNumbers: request.options.pinNumbers,
              matchBoardAspectRatio: true,
              drawPaddingOutsideBoard: false,
            }),
          ),
        };
      }
      case 'board': {
        return {
          content: await circuitJsonToGlb(handle.circuitJson, displayGlbConvention),
        };
      }
    }
  },

  serializeHandle({ handle }) {
    return new TextEncoder().encode(JSON.stringify(handle));
  },

  deserializeHandle({ serialized }): AtopileNativeHandle {
    // Transports may deliver the snapshot as any view or buffer; TextDecoder accepts either.
    const bytes: unknown = serialized;
    if (!(ArrayBuffer.isView(bytes) || bytes instanceof ArrayBuffer)) {
      throw new TypeError('Invalid atopile serialized handle: expected UTF-8 JSON bytes.');
    }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!isRecordObject(parsed) || !isCircuitElementArray(parsed['circuitJson'])) {
      throw new TypeError('Invalid atopile serialized handle: expected a board and circuit JSON.');
    }
    return {
      board: atopileBoardSchema.parse(parsed['board']),
      circuitJson: parsed['circuitJson'],
      placement: parsed['placement'] === 'layout' ? 'layout' : 'packed',
    };
  },

  async export({ exportId, handle, options }) {
    switch (exportId) {
      case 'board': {
        const content = await circuitJsonToGlb(handle.circuitJson, options);
        return { files: [createExportFile('glb', 'board.glb', content)] };
      }
      case 'bom': {
        return {
          files: [textExportFile('csv', 'bom.csv', bomCsv(handle.board))],
        };
      }
      case 'netlist': {
        const { convertCircuitJsonToReadableNetlist } = await import('circuit-json-to-readable-netlist');
        return {
          files: [
            textExportFile(
              'txt',
              'netlist.txt',
              convertCircuitJsonToReadableNetlist(asCircuitJson(handle.circuitJson)),
            ),
          ],
        };
      }
      case 'circuit': {
        return {
          files: [textExportFile('json', 'circuit.json', JSON.stringify(handle.circuitJson, null, 2))],
        };
      }
      case 'kicad': {
        return {
          files: [
            {
              name: `${handle.board.build}.kicad_pcb`,
              mimeType: 'application/x-kicad-pcb',
              bytes: new TextEncoder().encode(handle.board.kicadPcb),
            },
          ],
        };
      }
      default: {
        const exhaustive: never = exportId;
        throw new Error(`Export '${String(exhaustive)}' is not supported by atopile.`);
      }
    }
  },
});
