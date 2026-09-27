import {
  draw,
  drawPolysides,
  drawRoundedRectangle,
  genericSweep,
  makeBox,
  makeCylinder,
  makeHelix,
  type Shape3D,
  type ShapeConfig,
  type Sketch,
} from 'replicad';

export const defaultParams = {
  opening: 55,
  jawWidth: 125,
  guideClearance: 0.1,
  handleOffset: 0,
  component: 'Assembly',
};

// BV-125, mm. X is travel, Y is jaw width, Z is up. See vice.sysml.
const xCylinder = (r: number, x: number, length: number, y = 0, z = 50) =>
  makeCylinder(r, length, [x, y, z], [1, 0, 0]);
const box = (
  x: number,
  y: number,
  z: number,
  dx: number,
  dy: number,
  dz: number,
) => makeBox([x, y, z], [x + dx, y + dy, z + dz]);
const ring = (ro: number, ri: number, x: number, length: number, y = 0) =>
  xCylinder(ro, x, length, y).cut(xCylinder(ri, x - 1, length + 2, y));

function roundedBlock(
  x: number,
  y: number,
  z: number,
  dx: number,
  dy: number,
  dz: number,
  r: number,
) {
  return drawRoundedRectangle(dx, dy, r)
    .sketchOnPlane('XY')
    .extrude(dz)
    .translate([x + dx / 2, y + dy / 2, z]);
}

// Actual helical trapezoid, clipped at both ends; the nut uses the same
// profile with explicit radial and axial running allowance.
function thread(length: number, clearance = 0): Shape3D {
  const root = 8 + clearance;
  const crest = 10 + clearance;
  const profile = draw([root - 0.15, -3.2 - clearance])
    .lineTo([crest, -2.6 - clearance])
    .lineTo([crest, -1.4 + clearance])
    .lineTo([root - 0.15, -0.8 + clearance])
    .close()
    .sketchOnPlane('XZ') as Sketch;
  const ridge = genericSweep(
    profile.wire,
    makeHelix(4, length + 4, root, [0, 0, -2]),
    { frenet: true },
  );
  return makeCylinder(root, length).fuse(
    ridge.intersect(box(-11, -11, 0, 22, 22, length)),
  );
}

function socketScrew(
  x: number,
  y: number,
  z: number,
  shaftLength: number,
  headLength: number,
) {
  const shaft = xCylinder(3, x, shaftLength, y, z);
  const head = xCylinder(5, x + shaftLength, headLength, y, z);
  const socket = drawPolysides(2.5 / Math.cos(Math.PI / 6), 6)
    .sketchOnPlane('YZ')
    .extrude(2.5)
    .translate([x + shaftLength + headLength - 2.2, y, z]);
  return shaft.fuse(head).cut(socket);
}

export default function main(input = defaultParams): ShapeConfig[] {
  const p = { ...defaultParams, ...input };
  for (const [key, lo, hi] of [
    ['opening', 0, 100],
    ['jawWidth', 100, 150],
    ['guideClearance', 0.05, 0.25],
    ['handleOffset', -60, 60],
  ] as const) {
    if (!Number.isFinite(p[key]) || p[key] < lo || p[key] > hi) {
      throw new Error(`${key} must be finite and in [${lo}, ${hi}] mm`);
    }
  }
  const g = p.opening,
    w = p.jawWidth,
    bodyWidth = Math.max(125, w);
  const spindleAngle = 90 * (g - 55);
  const clock = (shape: Shape3D) =>
    shape.rotate(spindleAngle, [0, 0, 50], [1, 0, 0]);
  const parts: ShapeConfig[] = [];
  const add = (
    name: string,
    color: string,
    build: () => Shape3D,
    metalness = 0.75,
  ) => {
    if (p.component === 'Assembly' || p.component === name) {
      parts.push({
        name,
        shape: build(),
        color,
        metalness,
        roughness: metalness < 0.5 ? 0.32 : 0.27,
      });
    }
  };
  const blue = '#245B79',
    steel = '#B7C4CE',
    dark = '#424C56',
    bronze = '#BA8746';

  add(
    'Frame',
    blue,
    () => {
      const base = roundedBlock(-90, -88, 0, 145, 176, 16, 12);
      const tower = roundedBlock(
        -65,
        -bodyWidth / 2,
        12,
        59,
        bodyWidth,
        100,
        4,
      );
      const holes: Shape3D[] = [];
      for (const x of [-72, 35]) {
        for (const y of [-70, 70]) {
          holes.push(makeCylinder(5.5, 18, [x, y, -1]));
          holes.push(makeCylinder(10, 12, [x, y, 5]));
        }
      }
      for (const y of [-43, 43]) {
        holes.push(xCylinder(13.05, -66, 61, y));
      }
      for (const y of [-35, 35]) {
        holes.push(xCylinder(3.1, -20, 15, y, 97));
      }
      for (const z of [29, 71]) {
        holes.push(xCylinder(3.1, -66, 15, 0, z));
      }
      holes.push(xCylinder(15.1, -66, 61));
      return base.fuse(tower).cutAll(holes);
    },
    0.25,
  );

  add(
    'Carriage',
    blue,
    () => {
      const body = roundedBlock(
        g + 6,
        -bodyWidth / 2,
        20,
        36,
        bodyWidth,
        92,
        4,
      );
      const holes = [xCylinder(10.25, g + 5, 38)];
      for (const y of [-43, 43]) {
        holes.push(xCylinder(9.98, g + 5, 31, y));
      }
      for (const y of [-35, 35]) {
        holes.push(xCylinder(3.1, g + 5, 15, y, 97));
      }
      return body.cutAll(holes);
    },
    0.25,
  );

  const jaw = () => {
    const plate = box(-6, -w / 2, 82, 6, w, 30);
    const cuts: Shape3D[] = [];
    for (const y of [-35, 35]) {
      cuts.push(xCylinder(3.2, -7, 8, y, 97));
      cuts.push(xCylinder(5.5, -3.5, 4.5, y, 97));
    }
    // Shallow square-bottom gripping grooves; uncut lands define the jaw plane.
    for (let y = -w / 2 + 2.5; y < w / 2; y += 5) {
      cuts.push(box(-0.6, y - 0.5, 81, 1, 1, 32));
    }
    return plate.cutAll(cuts);
  };
  add('Fixed jaw', steel, jaw);
  add('Moving jaw', steel, () => jaw().mirror('YZ').translateX(g));

  for (const [side, y] of [
    ['left', -43],
    ['right', 43],
  ] as const) {
    add(`Guide ${side}`, steel, () =>
      xCylinder(10, g - 167, 203, y).fuse(xCylinder(13, g - 177, 10, y)),
    );
    add(`Bush ${side}`, bronze, () =>
      xCylinder(13, -65, 59, y)
        .fuse(xCylinder(15, -67, 2, y))
        .cut(xCylinder(10 + p.guideClearance, -68, 63, y)),
    );
  }

  add('Spindle', steel, () => {
    const threaded = thread(171)
      .rotate(90, [0, 0, 0], [0, 1, 0])
      .rotate(g * 90, [0, 0, 0], [1, 0, 0])
      .translate([g - 171, 0, 50]);
    return threaded
      .fuseAll([xCylinder(10, g, 62), xCylinder(17, g, 3)])
      .cut(clock(makeCylinder(2.1, 24, [g + 58, -12, 50], [0, 1, 0])));
  });
  add('Drive nut', bronze, () => {
    const blank = xCylinder(15, -65, 47).fuse(xCylinder(26, -71, 6));
    const cutter = thread(60, 0.2)
      .rotate(90, [0, 0, 0], [0, 1, 0])
      .translate([-75, 0, 50]);
    // -75 and the nominal screw start -171 differ by exactly 24 leads.
    return blank.cutAll([
      cutter,
      ...[29, 71].map((z) => xCylinder(3.2, -72, 8, 0, z)),
    ]);
  });

  add('Rear thrust washer', dark, () => ring(17, 10.3, g + 3, 3));
  add('Front thrust washer', dark, () => ring(17, 10.3, g + 42, 3));
  add('Handle hub', dark, () =>
    clock(
      xCylinder(16, g + 45, 34).cutAll([
        xCylinder(10.1, g + 44, 18.5),
        makeCylinder(2, 34, [g + 58, -17, 50], [0, 1, 0]),
        makeCylinder(6.15, 34, [g + 69, -17, 50], [0, 1, 0]),
      ]),
    ),
  );
  add('Hub pin', steel, () =>
    clock(makeCylinder(2.01, 32, [g + 58, -16, 50], [0, 1, 0])),
  );
  add('Tommy bar', steel, () =>
    clock(
      draw([0, -106])
        .lineTo([6, -106])
        .threePointsArcTo([10, -102], [8.828427124746, -104.828427124746])
        .lineTo([10, -94])
        .threePointsArcTo([6, -90], [8.828427124746, -91.171572875254])
        .lineTo([6, 90])
        .threePointsArcTo([10, 94], [8.828427124746, 91.171572875254])
        .lineTo([10, 102])
        .threePointsArcTo([6, 106], [8.828427124746, 104.828427124746])
        .lineTo([0, 106])
        .close()
        .sketchOnPlane('XZ')
        .revolve([0, 0, 1])
        .rotate(90, [0, 0, 0], [1, 0, 0])
        .translate([g + 69, p.handleOffset, 50]),
    ),
  );

  for (const [side, y] of [
    ['left', -35],
    ['right', 35],
  ] as const) {
    add(`Fixed jaw screw ${side}`, dark, () =>
      socketScrew(-18, y, 97, 14.5, 3.3),
    );
    add(`Moving jaw screw ${side}`, dark, () =>
      socketScrew(-18, y, 97, 14.5, 3.3).mirror('YZ').translateX(g),
    );
  }
  for (const [side, z] of [
    ['lower', 29],
    ['upper', 71],
  ] as const) {
    add(`Nut screw ${side}`, dark, () =>
      socketScrew(53, 0, z, 18, 6).mirror('YZ'),
    );
  }

  if (parts.length === 0) {
    throw new Error(`Unknown component: ${p.component}`);
  }
  return parts;
}
