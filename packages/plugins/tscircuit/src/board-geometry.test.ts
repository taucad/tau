/* eslint-disable @typescript-eslint/naming-convention -- circuit JSON field names are snake_case. */
import { Document } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';

import { buildPresentationBoard } from '#board-geometry.js';

/** A 20 x 10 mm board: one top pad with a trace, a plated hole, a mounting hole and silkscreen text. */
const circuitJson: Array<{ type: string } & Record<string, unknown>> = [
  { type: 'pcb_board', pcb_board_id: 'b', center: { x: 0, y: 0 }, width: 20, height: 10, thickness: 1.6 },
  { type: 'pcb_smtpad', shape: 'rect', layer: 'top', x: -5, y: 0, width: 1.5, height: 1 },
  {
    type: 'pcb_trace',
    route: [
      { route_type: 'wire', x: -5, y: 0, width: 0.3, layer: 'top' },
      { route_type: 'wire', x: 3, y: 0, width: 0.3, layer: 'top' },
    ],
  },
  {
    type: 'pcb_plated_hole',
    shape: 'circle',
    x: 3,
    y: 0,
    hole_diameter: 1,
    outer_diameter: 1.8,
    layers: ['top', 'bottom'],
  },
  { type: 'pcb_hole', hole_shape: 'circle', x: 8, y: 3, hole_diameter: 2 },
  { type: 'pcb_silkscreen_text', layer: 'top', text: 'R1', font_size: 1, anchor_position: { x: -5, y: 2 } },
];

type Bounds = { min: number[]; max: number[] };

/** Each layer is one primitive of the board mesh; its position accessor is named after the layer. */
const layerPositions = (document: Document, name: string) =>
  document
    .getRoot()
    .listAccessors()
    .find((accessor) => accessor.getName() === `${name}-position`);

const layerNames = (document: Document): string[] =>
  document
    .getRoot()
    .listAccessors()
    .map((accessor) => accessor.getName())
    .filter((name) => name.endsWith('-position'))
    .map((name) => name.slice(0, -'-position'.length));

const boundsOf = (document: Document, name: string): Bounds | undefined => {
  const position = layerPositions(document, name);
  return position ? { min: position.getMin([]), max: position.getMax([]) } : undefined;
};

describe('buildPresentationBoard', () => {
  it('returns nothing for circuit JSON without a board', async () => {
    expect(await buildPresentationBoard(new Document(), [{ type: 'source_component' }])).toBeUndefined();
  });

  it('builds the core, copper, finish, mask and silkscreen layers as named slabs', async () => {
    const document = new Document();
    const board = await buildPresentationBoard(document, circuitJson);

    expect(board?.getName()).toBe('pcb');
    expect(board?.getMesh()?.listPrimitives().length).toBe(layerNames(document).length);
    expect(layerNames(document)).toEqual(
      expect.arrayContaining([
        'core',
        'barrels',
        'top-copper',
        'top-finish',
        'top-mask',
        'top-mask-copper',
        'top-silkscreen',
      ]),
    );
    const materials = document
      .getRoot()
      .listMaterials()
      .map((material) => material.getName());
    expect(materials).toEqual(expect.arrayContaining(['pcb-core', 'pcb-finish', 'pcb-mask-top', 'pcb-silkscreen-top']));
  });

  it('places the core in the converter frame: Y-up millimetres spanning the outline and thickness', async () => {
    const document = new Document();
    await buildPresentationBoard(document, circuitJson);

    const core = boundsOf(document, 'core');
    expect(core).toBeDefined();
    const [width, height, depth] = [0, 1, 2].map((axis) => core!.max[axis]! - core!.min[axis]!);
    expect(width).toBeCloseTo(20, 3);
    expect(height).toBeCloseTo(1.6, 3);
    expect(depth).toBeCloseTo(10, 3);
    // Layers stack outward from the core's top face.
    expect(boundsOf(document, 'top-mask')!.max[1]).toBeGreaterThan(core!.max[1]!);
    expect(boundsOf(document, 'top-silkscreen')!.max[1]).toBeGreaterThan(boundsOf(document, 'top-mask')!.max[1]!);
  });

  it.each([
    { fontSize: 1, glyph: 0.72 },
    // Reference designators (tscircuit's 0.4 mm): no fixed minimum line, so small labels keep their counters open.
    { fontSize: 0.4, glyph: 0.288 },
  ])(
    'draws $fontSize mm silkscreen text at the PCB view size with a line 1/7 of its height',
    async ({ fontSize, glyph }) => {
      const document = new Document();
      await buildPresentationBoard(document, [
        circuitJson[0]!,
        { type: 'pcb_silkscreen_text', layer: 'top', text: 'I', font_size: fontSize, anchor_position: { x: 0, y: 0 } },
      ]);

      const silkscreen = boundsOf(document, 'top-silkscreen')!;
      const [width, , depth] = [0, 1, 2].map((axis) => silkscreen.max[axis]! - silkscreen.min[axis]!);
      // An `I` is one vertical stroke: its width is the line, its depth the stem plus the line's round caps.
      expect(width).toBeCloseTo(glyph / 7, 2);
      expect(depth! / width!).toBeGreaterThan(5);
      expect(depth).toBeLessThan(glyph + width!);
    },
  );

  it('colours the mask from the board and the exposed pads from the finish', async () => {
    const blue = new Document();
    await buildPresentationBoard(blue, [{ ...circuitJson[0]!, solder_mask_color: 'blue' }, ...circuitJson.slice(1)], {
      finish: 'hasl',
    });
    const factor = (document: Document, name: string) =>
      document
        .getRoot()
        .listMaterials()
        .find((material) => material.getName() === name)
        ?.getBaseColorFactor();

    const mask = factor(blue, 'pcb-mask-top')!;
    expect(mask[2]).toBeGreaterThan(mask[1]);
    const finish = factor(blue, 'pcb-finish')!;
    // HASL is tin: a neutral grey, not ENIG gold.
    expect(Math.abs(finish[0] - finish[2])).toBeLessThan(0.1);
  });

  it('drills the board through: the mounting hole removes core area', async () => {
    const solid = new Document();
    const drilled = new Document();
    await buildPresentationBoard(solid, circuitJson.slice(0, 1));
    await buildPresentationBoard(drilled, [circuitJson[0]!, circuitJson[4]!]);
    const triangles = (document: Document) => layerPositions(document, 'core')!.getCount();
    expect(triangles(drilled)).toBeGreaterThan(triangles(solid));
  });
});
