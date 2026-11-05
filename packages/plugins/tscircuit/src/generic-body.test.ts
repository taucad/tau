/* eslint-disable @typescript-eslint/naming-convention -- circuit JSON field names are snake_case. */
import { WebIO, getBounds } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';

import { buildGenericBodyGlb, genericBodyOf, genericBodyUrl, parseGenericBodyUrl } from '#generic-body.js';
import type { GenericBody } from '#generic-body.js';

type Element = { type: string } & Record<string, unknown>;

/** An inline-footprint power inductor as core writes it: two 2 x 3.2 mm pads 6 mm apart in an 8 mm courtyard. */
const inductor = (rotation = 0, center = { x: 7, y: 7 }): Element[] => {
  const turn = (x: number, y: number) => {
    const angle = (rotation * Math.PI) / 180;
    return {
      x: center.x + x * Math.cos(angle) - y * Math.sin(angle),
      y: center.y + x * Math.sin(angle) + y * Math.cos(angle),
    };
  };
  const swap = rotation % 180 === 0 ? { width: 2, height: 3.2 } : { width: 3.2, height: 2 };
  return [
    { type: 'pcb_component', pcb_component_id: 'L1', center, rotation, width: 8, height: 3.2 },
    { type: 'pcb_smtpad', pcb_component_id: 'L1', shape: 'rect', ...turn(-3, 0), ...swap },
    { type: 'pcb_smtpad', pcb_component_id: 'L1', shape: 'rect', ...turn(3, 0), ...swap },
    { type: 'pcb_courtyard_rect', pcb_component_id: 'L1', center, width: 8, height: 8 },
  ];
};

describe('generic bodies', () => {
  it('sizes a part from its courtyard less the courtyard excess, with a moulded height for an inductor', () => {
    expect(genericBodyOf(inductor(), 'L1', 'simple_inductor')).toEqual({
      kind: 'moulded',
      width: 7.5,
      depth: 7.5,
      height: 3,
      x: 0,
      y: 0,
    });
  });

  it('sizes a part from its pads when it has no courtyard, in its own frame whatever its rotation', () => {
    const pads = inductor(90).filter((element) => element.type !== 'pcb_courtyard_rect');
    const body = genericBodyOf(pads, 'L1', 'simple_chip');
    expect(body).toMatchObject({ kind: 'package', x: 0, y: 0 });
    // The converter turns the model by the component's rotation, so the body is the unturned 8 x 3.2 mm span.
    expect(body?.width).toBeCloseTo(8, 6);
    expect(body?.depth).toBeCloseTo(3.2, 6);
    expect(body?.height).toBeCloseTo(0.8, 6);
  });

  it('keeps an off-centre courtyard offset from the component centre', () => {
    const elements = [
      ...inductor().filter((element) => element.type !== 'pcb_courtyard_rect'),
      { type: 'pcb_courtyard_rect', pcb_component_id: 'L1', center: { x: 8, y: 7 }, width: 10, height: 4 },
    ];
    expect(genericBodyOf(elements, 'L1', undefined)).toMatchObject({ kind: 'plastic', x: 1, y: 0, width: 9.5 });
  });

  it.each([
    ['simple_capacitor', 'ceramic'],
    ['simple_resistor', 'package'],
    ['simple_fuse', 'moulded'],
    ['simple_switch', 'plastic'],
  ] as const)('reads a %s as a %s body', (ftype, kind) => {
    expect(genericBodyOf(inductor(), 'L1', ftype)?.kind).toBe(kind);
  });

  it('gives no body to copper-only parts or to a part with nothing to size it from', () => {
    expect(genericBodyOf(inductor(), 'L1', 'simple_test_point')).toBeUndefined();
    expect(genericBodyOf(inductor(), 'L1', 'simple_fiducial')).toBeUndefined();
    expect(genericBodyOf(inductor(), 'L1', 'simple_solderjumper')).toBeUndefined();
    expect(genericBodyOf(inductor(), 'other', 'simple_inductor')).toBeUndefined();
    expect(genericBodyOf(inductor().slice(0, 1), 'L1', 'simple_inductor')).toBeUndefined();
  });

  it('names a body by a URL the fetch guard can read back, and refuses anything else', () => {
    const body: GenericBody = { kind: 'moulded', width: 7.5, depth: 7.5, height: 3, x: -0.25, y: 1 };
    const url = genericBodyUrl(body);
    expect(url).toBe('tau-models:generic/moulded/7.5x7.5x3@-0.25,1.glb');
    expect(parseGenericBodyUrl(url)).toEqual(body);
    expect(parseGenericBodyUrl('tau-models:kicad/Package_SO/SOIC-8.glb')).toBeUndefined();
    expect(parseGenericBodyUrl('tau-models:generic/glass/1x1x1@0,0.glb')).toBeUndefined();
    expect(parseGenericBodyUrl('tau-models:generic/moulded/0x1x1@0,0.glb')).toBeUndefined();
    expect(parseGenericBodyUrl('https://example.com/generic/moulded/1x1x1@0,0.glb')).toBeUndefined();
  });

  it('builds the body as a closed box in KiCad frame: Z-up millimetres standing on z = 0', async () => {
    const body: GenericBody = { kind: 'ceramic', width: 4, depth: 2, height: 1, x: 0.5, y: -0.5 };
    const document = await new WebIO().readBinary(await buildGenericBodyGlb(body));
    const [scene] = document.getRoot().listScenes();
    const bounds = getBounds(scene!);
    expect(bounds.min).toEqual([-1.5, -1.5, 0]);
    expect(bounds.max).toEqual([2.5, 0.5, 1]);
    const [primitive] = document.getRoot().listMeshes()[0]!.listPrimitives();
    expect(primitive?.getIndices()?.getCount()).toBe(36);
    // Each face winds outward: its triangles' normal agrees with the stored normal.
    const position = primitive!.getAttribute('POSITION')!;
    const normal = primitive!.getAttribute('NORMAL')!;
    const indices = primitive!.getIndices()!;
    for (let triangle = 0; triangle < 12; triangle++) {
      const [a, b, c] = [0, 1, 2].map((corner) => position.getElement(indices.getScalar(triangle * 3 + corner), []));
      const u = [0, 1, 2].map((axis) => b![axis]! - a![axis]!);
      const v = [0, 1, 2].map((axis) => c![axis]! - a![axis]!);
      const cross = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
      const stored = normal.getElement(indices.getScalar(triangle * 3), []);
      expect(cross.reduce((sum, value, axis) => sum + value * stored[axis]!, 0)).toBeGreaterThan(0);
    }
    // Stored as sRGB, as the converter reads KiCad colours; presentation classifies it as fired ceramic.
    expect(document.getRoot().listMaterials()[0]?.getBaseColorFactor()).toEqual([
      expect.closeTo(0.71, 5),
      expect.closeTo(0.56, 5),
      expect.closeTo(0.42, 5),
      1,
    ]);
  });
});
