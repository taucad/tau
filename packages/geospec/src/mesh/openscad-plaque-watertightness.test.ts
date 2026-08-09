import { openscad } from '@taucad/openscad';
import { replicad } from '@taucad/runtime/kernels/replicad';
import { createGeometryFile, createTestWorker, extractGltfFromResult } from '@taucad/runtime/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeGlb } from '#mesh/analyze-glb.js';

const tauPlaqueWithTextApi = `
$fa = 2;
$fs = 0.4;

width = 120;
height = 60;
base_thickness = 6;
border_width = 4;
border_height = 2;
corner_r = 6;

text_string = "TAU";
font_size = 28;
text_thickness = 3;
font_name = "Liberation Sans:style=Bold";

hole_d = 4;
hole_cb_d = 8;
hole_cb_depth = 3;
hole_offset = 8;

difference() {
    union() {
        color("#2F3542")
        rounded_rect(width, height, base_thickness, corner_r);

        color("#ECCC68")
        translate([0, 0, base_thickness - 0.1])
        linear_extrude(height = border_height + 0.1) {
            difference() {
                rounded_rect_2d(width, height, corner_r);
                rounded_rect_2d(width - 2 * border_width, height - 2 * border_width, max(0.1, corner_r - border_width));
            }
        }

        color("#ECCC68")
        translate([0, 0, base_thickness - 0.1])
        linear_extrude(height = text_thickness + 0.1) {
            text(text_string, size = font_size, font = font_name, halign = "center", valign = "center");
        }
    }

    mounting_holes();
}

module rounded_rect(w, h, thickness, r) {
    linear_extrude(height = thickness) {
        rounded_rect_2d(w, h, r);
    }
}

module rounded_rect_2d(w, h, r) {
    hull() {
        translate([-w/2 + r, -h/2 + r]) circle(r = r);
        translate([ w/2 - r, -h/2 + r]) circle(r = r);
        translate([ w/2 - r,  h/2 - r]) circle(r = r);
        translate([-w/2 + r,  h/2 - r]) circle(r = r);
    }
}

module mounting_holes() {
    x_pos = width / 2 - hole_offset;
    y_pos = height / 2 - hole_offset;

    hole_positions = [
        [-x_pos, -y_pos],
        [ x_pos, -y_pos],
        [ x_pos,  y_pos],
        [-x_pos,  y_pos]
    ];

    for (pos = hole_positions) {
        translate([pos[0], pos[1], -0.1]) {
            cylinder(h = base_thickness + border_height + 0.5, d = hole_d);

            translate([0, 0, base_thickness - hole_cb_depth + 0.1]) {
                cylinder(h = hole_cb_depth + border_height + 0.5, d = hole_cb_d);
            }
        }
    }
}
`;

const mainScadFilename = 'main.scad';
const mainReplicadFilename = 'main.ts';

const tauPlaqueReplicadWithTextApi = `
import { drawCircle, drawRoundedRectangle, drawText } from 'replicad';

const centerDrawing = (drawing) => {
  const [[minX, minY], [maxX, maxY]] = drawing.boundingBox.bounds;
  return drawing.translate(-(minX + maxX) / 2, -(minY + maxY) / 2);
};

export default function main() {
  const width = 120;
  const height = 60;
  const baseThickness = 6;
  const borderWidth = 4;
  const borderHeight = 2;
  const cornerRadius = 6;
  const textThickness = 3;
  const holeDiameter = 4;
  const counterboreDiameter = 8;
  const counterboreDepth = 3;
  const holeOffset = 8;

  let plaque = drawRoundedRectangle(width, height, cornerRadius)
    .sketchOnPlane()
    .extrude(baseThickness);

  const border = drawRoundedRectangle(width, height, cornerRadius)
    .cut(drawRoundedRectangle(width - 2 * borderWidth, height - 2 * borderWidth, cornerRadius - borderWidth))
    .sketchOnPlane('XY', baseThickness - 0.1)
    .extrude(borderHeight + 0.1);

  const text = centerDrawing(drawText('TAU', { fontSize: 28 }))
    .sketchOnPlane('XY', baseThickness - 0.1)
    .extrude(textThickness + 0.1);

  plaque = plaque.fuse(border).fuse(text);

  const x = width / 2 - holeOffset;
  const y = height / 2 - holeOffset;
  const positions = [[-x, -y], [x, -y], [x, y], [-x, y]];
  for (const [holeX, holeY] of positions) {
    const throughHole = drawCircle(holeDiameter / 2)
      .sketchOnPlane()
      .extrude(baseThickness + borderHeight + 0.5)
      .translate([holeX, holeY, -0.1]);
    const counterbore = drawCircle(counterboreDiameter / 2)
      .sketchOnPlane()
      .extrude(counterboreDepth + borderHeight + 0.5)
      .translate([holeX, holeY, baseThickness - counterboreDepth + 0.1]);
    plaque = plaque.cut(throughHole).cut(counterbore);
  }

  return plaque;
}
`;

type PlaqueRender = {
  glb: Uint8Array<ArrayBuffer>;
  off: string;
};

let plaqueRender: PlaqueRender | undefined;

const getPlaqueRender = (): PlaqueRender => {
  if (!plaqueRender) {
    throw new Error('Plaque fixture was not rendered before the test ran.');
  }

  return plaqueRender;
};

const expectWatertightPlaque = async (glb: Uint8Array<ArrayBuffer>): Promise<void> => {
  const stats = await analyzeGlb(glb);
  const watertight = stats.analyseWatertight();

  expect(stats.connectedComponents(0.0001)).toBe(1);
  expect(watertight.irregularEdges).toBe(0);
  expect(watertight.openBoundaryEdges).toBe(0);
  expect(watertight.nonManifoldEdges).toBe(0);
  expect(watertight.watertight).toBe(true);
  expect(stats.boundingBox?.size[0]).toBeCloseTo(0.12, 3);
  expect(stats.boundingBox?.size[1]).toBeCloseTo(0.009, 3);
  expect(stats.boundingBox?.size[2]).toBeCloseTo(0.06, 3);
};

const plaqueTextCapabilityMatrix = [
  {
    kernel: 'openscad',
    nativeSolidText: true,
    fixtureStatus: 'required',
    equalityStatus: 'blocked-native-font-engine',
  },
  {
    kernel: 'replicad',
    nativeSolidText: true,
    fixtureStatus: 'required',
    equalityStatus: 'blocked-native-font-engine',
  },
  {
    kernel: 'jscad',
    nativeSolidText: false,
    fixtureStatus: 'stroke-text-separate-semantics',
    equalityStatus: 'blocked-stroke-text-is-not-filled-glyph-text',
  },
  {
    kernel: 'manifold',
    nativeSolidText: false,
    fixtureStatus: 'blocked-no-built-in-text-api',
    equalityStatus: 'blocked-shared-glyph-outline-contract-required',
  },
  {
    kernel: 'opencascade',
    nativeSolidText: false,
    fixtureStatus: 'blocked-no-tau-solid-text-helper',
    equalityStatus: 'blocked-shared-glyph-outline-contract-required',
  },
] as const;

describe('OpenSCAD plaque watertightness regression evidence', () => {
  beforeAll(async () => {
    const worker = await createTestWorker(openscad, { [mainScadFilename]: tauPlaqueWithTextApi });
    const result = await worker.createGeometry({
      file: createGeometryFile(mainScadFilename),
      parameters: {},
    });
    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error('OpenSCAD plaque fixture did not produce geometry.');
    }
    const glb = extractGltfFromResult(result);
    const off = result.serializedNativeHandle;

    expect(glb).toBeInstanceOf(Uint8Array);
    expect(off).toEqual(expect.any(String));

    if (!(glb instanceof Uint8Array) || typeof off !== 'string') {
      throw new Error('OpenSCAD plaque fixture did not produce GLB and OFF evidence.');
    }

    plaqueRender = { glb, off };
  }, 60_000);

  it('should produce a watertight GLB from the OpenSCAD text plaque via OFF Manifold canonicalization', async () => {
    await expectWatertightPlaque(getPlaqueRender().glb);
  });

  it('should produce a watertight GLB from a Replicad native-text plaque', async () => {
    const worker = await createTestWorker(replicad, { [mainReplicadFilename]: tauPlaqueReplicadWithTextApi });
    const result = await worker.createGeometry({
      file: createGeometryFile(mainReplicadFilename),
      parameters: {},
    });
    const glb = extractGltfFromResult(result);

    expect(result.success).toBe(true);
    expect(glb).toBeInstanceOf(Uint8Array);
    if (!result.success || !(glb instanceof Uint8Array)) {
      throw new Error('Replicad plaque fixture did not produce GLB evidence.');
    }

    await expectWatertightPlaque(glb);
  }, 60_000);

  it('should document cross-kernel native text plaque capability boundaries', () => {
    expect(plaqueTextCapabilityMatrix).toEqual([
      expect.objectContaining({ kernel: 'openscad', nativeSolidText: true, fixtureStatus: 'required' }),
      expect.objectContaining({ kernel: 'replicad', nativeSolidText: true, fixtureStatus: 'required' }),
      expect.objectContaining({
        kernel: 'jscad',
        nativeSolidText: false,
        fixtureStatus: 'stroke-text-separate-semantics',
      }),
      expect.objectContaining({
        kernel: 'manifold',
        nativeSolidText: false,
        fixtureStatus: 'blocked-no-built-in-text-api',
      }),
      expect.objectContaining({
        kernel: 'opencascade',
        nativeSolidText: false,
        fixtureStatus: 'blocked-no-tau-solid-text-helper',
      }),
    ]);
  });
});
