// @vitest-environment node

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { NodeIO } from '@gltf-transform/core';
import { asKnownArtifact, defineRuntime } from '@taucad/runtime';
import type { Rendering } from '@taucad/runtime/client';
import { createTestRuntimeClient, validateGlbData } from '@taucad/runtime-testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { atopileBoardToCircuitJson, placementOf } from '#atopile-circuit.js';
import type { AtopileBoard } from '#atopile.schemas.js';
import { atopileKernel } from '#atopile.kernel.js';

// =============================================================================
// Fixtures
// =============================================================================

const fixturesRoot = join(import.meta.dirname, '..', 'fixtures');

const readFixture = async (name: string): Promise<Record<string, string>> => {
  const root = join(fixturesRoot, name);
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const path = join(entry.parentPath, entry.name);
        return [relative(root, path), await readFile(path, 'utf8')] as const;
      }),
  );
  return Object.fromEntries(files);
};

/** A two-resistor board in atopile's IR, placed inside a 20 x 10 mm outline. */
const placedBoard: AtopileBoard = {
  irVersion: 1,
  build: 'default',
  outline: [
    [-10, -5],
    [10, -5],
    [10, 5],
    [-10, 5],
  ],
  components: ['R1', 'R2'].map((designator, index) => ({
    designator,
    address: `r${String(index)}`,
    footprint: 'R0402',
    layer: 'F.Cu',
    x: index * 4,
    y: 1,
    rotation: 0,
    lcsc: 'C25744',
    manufacturer: 'UNI-ROYAL',
    mpn: '0402WGF1002TCE',
    pads: ['1', '2'].map((name, padIndex) => ({
      name,
      type: 'smd',
      shape: 'rect',
      x: index * 4 + (padIndex === 0 ? -0.43 : 0.43),
      y: 1,
      localX: padIndex === 0 ? -0.43 : 0.43,
      localY: 0,
      width: 0.57,
      height: 0.54,
      rotation: 0,
      drill: null,
      net: name === '1' ? 'vcc' : `n${String(index)}`,
    })),
    models: [],
  })),
  nets: [
    {
      name: 'vcc',
      pads: [
        ['R1', '1'],
        ['R2', '1'],
      ],
    },
  ],
  bom: [],
  kicadPcb: '',
};

const countTypes = (elements: ReadonlyArray<{ type: string }>): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const element of elements) {
    counts[element.type] = (counts[element.type] ?? 0) + 1;
  }
  return counts;
};

// =============================================================================
// IR to circuit JSON (no atopile needed)
// =============================================================================

describe('atopileBoardToCircuitJson', () => {
  it('keeps a layout whose pads sit inside the outline', () => {
    expect(placementOf(placedBoard)).toBe('layout');
  });

  it('packs a layout that leaves parts outside the outline', () => {
    const unplaced = {
      ...placedBoard,
      components: placedBoard.components.map((component) => ({
        ...component,
        pads: component.pads.map((pad) => ({ ...pad, x: pad.x + 50 })),
      })),
    };
    expect(placementOf(unplaced)).toBe('packed');
    expect(placementOf({ ...placedBoard, outline: [] })).toBe('packed');
  });

  it('settles every part, pad and net into schematic and PCB elements', async () => {
    const { circuitJson, placement } = await atopileBoardToCircuitJson(placedBoard);
    expect(placement).toBe('layout');
    expect(countTypes(circuitJson)).toMatchObject(
      Object.fromEntries([
        ['pcb_board', 1],
        ['source_component', 2],
        ['pcb_component', 2],
        ['schematic_component', 2],
        ['pcb_smtpad', 4],
        ['source_trace', 2],
      ]),
    );
    const r2 = circuitJson.find(
      (element): element is { type: string; center: { x: number; y: number } } =>
        element.type === 'pcb_component' && 'center' in element && (element.center as { x: number }).x > 2,
    );
    // KiCad's Y axis points down; circuit JSON's points up.
    expect(r2?.center).toEqual({ x: 4, y: -1 });
  });
});

// =============================================================================
// Kernel through the runtime client (needs a CPython 3.14 with atopile 0.15.x)
// =============================================================================

const python = process.env['TAU_ATOPILE_PYTHON'];
const hasAtopile = python !== undefined && existsSync(python);

describe.skipIf(!hasAtopile)('atopile kernel', () => {
  const createRuntime = () => defineRuntime({ kernels: [atopileKernel({ python })] });
  let divider: Record<string, string>;
  let session: ReturnType<typeof open>;

  const open = (files: Record<string, string>) => {
    const client = createTestRuntimeClient({ runtime: createRuntime(), files });
    return {
      client,
      document: client.open({ source: { path: 'main.ato' }, watch: false }),
    };
  };

  const renderView = async (view: 'board' | 'schematic' | 'pcb'): Promise<Rendering> => {
    const handle = session.document.view(view);
    const outcome = await handle.rendering();
    handle.close();
    if (outcome.superseded) {
      throw new Error('render superseded');
    }
    return outcome.rendering;
  };

  const exportFile = async (exportId: 'board' | 'bom' | 'netlist' | 'circuit' | 'kicad') => {
    const result = await session.document.export(exportId);
    expect(result.success, result.success ? undefined : result.issues.map((issue) => issue.message).join('\n')).toBe(
      true,
    );
    if (!result.success) {
      throw new Error('unreachable');
    }
    return result.files[0];
  };

  beforeAll(async () => {
    divider = await readFixture('divider');
    session = open(divider);
  });

  afterAll(async () => {
    await session.client.shutdown();
  });

  it('renders the board as a GLB carrying the footprint STEP model', async () => {
    const rendering = await renderView('board');
    expect(rendering.success, rendering.success ? undefined : rendering.issues.map((i) => i.message).join('\n')).toBe(
      true,
    );
    if (!rendering.success) {
      return;
    }
    const artifact = asKnownArtifact(rendering.artifact);
    expect(artifact?.mimeType).toBe('model/gltf-binary');
    if (artifact?.mimeType !== 'model/gltf-binary') {
      return;
    }
    validateGlbData(artifact.content);
    const document = await new NodeIO().readBinary(artifact.content);
    const triangles = document
      .getRoot()
      .listMeshes()
      .flatMap((mesh) => mesh.listPrimitives())
      .reduce((sum, primitive) => sum + (primitive.getIndices()?.getCount() ?? 0) / 3, 0);
    // The R0402 STEP body alone tessellates to thousands of triangles; boxes would be a few dozen.
    expect(triangles).toBeGreaterThan(1000);
  }, 180_000);

  it('renders a schematic SVG with every part and net atopile compiled', async () => {
    const rendering = await renderView('schematic');
    if (!rendering.success) {
      throw new Error(rendering.issues.map((issue) => issue.message).join('\n'));
    }
    const artifact = asKnownArtifact(rendering.artifact);
    if (artifact?.mimeType !== 'image/svg+xml') {
      throw new TypeError('schematic is not SVG');
    }
    for (const label of ['R1', 'R2', 'C1', 'output', 'hv', 'lv']) {
      expect(artifact.content).toContain(`>${label}<`);
    }
  }, 180_000);

  it('renders the PCB view at the KiCad layout positions', async () => {
    const rendering = await renderView('pcb');
    expect(rendering.success).toBe(true);
    const circuitFile = await exportFile('circuit');
    const circuit = JSON.parse(new TextDecoder().decode(circuitFile.bytes)) as Array<{
      type: string;
      center?: { x: number; y: number };
    }>;
    const centers = circuit.filter((element) => element.type === 'pcb_component').map((element) => element.center);
    // `fixtures/divider/layout` places R1 at (-6, 2, 90°) and C1 at (6, 2) in KiCad's Y-down space.
    expect(centers).toContainEqual({ x: -6, y: -2 });
    expect(centers).toContainEqual({ x: 6, y: -2 });
  }, 180_000);

  it('exports atopile BOM rows with designators, MPNs and LCSC numbers', async () => {
    const file = await exportFile('bom');
    expect(file.name).toBe('bom.csv');
    const lines = new TextDecoder().decode(file.bytes).trim().split('\n');
    expect(lines[0]).toBe('Designator,Quantity,Manufacturer,MPN,LCSC Part #,Package,Value,Datasheet');
    expect(lines.slice(1).map((line) => line.split(',').slice(0, 5))).toEqual(
      expect.arrayContaining([
        ['C1', '1', 'Samsung Electro-Mechanics', 'CL05B104KO5NNNC', 'C1525'],
        ['R1', '1', 'UNI-ROYAL', '0402WGF5101TCE', 'C25905'],
        ['R2', '1', 'UNI-ROYAL', '0402WGF1002TCE', 'C25744'],
      ]),
    );
  }, 180_000);

  it('exports the GLB, netlist and the KiCad PCB atopile wrote', async () => {
    const glb = await exportFile('board');
    expect(glb.name).toBe('board.glb');
    validateGlbData(glb.bytes);
    const netlistFile = await exportFile('netlist');
    const netlist = new TextDecoder().decode(netlistFile.bytes);
    expect(netlist).toContain('output');
    const kicad = await exportFile('kicad');
    expect(kicad.name).toBe('default.kicad_pcb');
    expect(new TextDecoder().decode(kicad.bytes)).toMatch(/^\(kicad_pcb/u);
  }, 180_000);

  it('reports the sign-in requirement for parametric parts instead of reaching the picker', async () => {
    const picker = open(await readFixture('needs-picker'));
    try {
      const handle = picker.document.view('board');
      const outcome = await handle.rendering();
      handle.close();
      if (outcome.superseded) {
        throw new Error('render superseded');
      }
      expect(outcome.rendering.success).toBe(false);
      if (outcome.rendering.success) {
        return;
      }
      expect(outcome.rendering.issues.map((issue) => issue.message).join('\n')).toMatch(/requires sign-in/u);
    } finally {
      await picker.client.shutdown();
    }
  }, 180_000);
});
