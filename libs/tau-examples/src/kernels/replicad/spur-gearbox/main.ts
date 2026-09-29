import {
  draw,
  drawCircle,
  drawRoundedRectangle,
  drawPolysides,
  drawPointsInterpolation,
  assembleWire,
  makeFace,
  basicFaceExtrusion,
  Vector,
  makeCylinder,
  makeBox,
  type Drawing,
  type Shape3D,
  type ShapeConfig,
  type Sketch,
  type Wire,
} from 'replicad';

// RG-03: module 2, 18/54 teeth, 20° pressure angle, 72 mm shaft centers.
// Dimensions follow https://khkgears.net/gear-knowledge/gear-technical-reference/calculation-gear-dimensions/
export const defaultParams = {
  faceWidth: 16,
  backlash: 0.18,
  inputAngle: 0,
  coverLift: 0,
  inspectionCover: true,
  part: 'assembly',
};

const screwCenters: Array<[number, number]> = [
  [-100, -52],
  [-100, 52],
  [-24, -58],
  [-24, 58],
  [60, -52],
  [60, 52],
];
const polar = (r: number, a: number): [number, number] => [
  r * Math.cos(a),
  r * Math.sin(a),
];
const cylinder = (r: number, z: number, h: number, x = 0, y = 0) =>
  makeCylinder(r, h, [x, y, z]);
const plate = (w: number, h: number, r: number, z: number, depth: number) =>
  drawRoundedRectangle(w, h, r)
    .sketchOnPlane('XY', z)
    .extrude(depth)
    .translate([-20, 0, 0]);

function gear(
  teeth: number,
  bore: number,
  hub: number,
  keyWidth: number,
  keyDepth: number,
  width: number,
  backlash: number,
): Shape3D {
  const pitch = teeth,
    base = pitch * Math.cos(Math.PI / 9);
  const root = pitch - 2.5,
    tip = pitch + 2,
    start = Math.max(root, base);
  const inv = (r: number) => {
    const t = Math.sqrt(Math.max(0, (r / base) ** 2 - 1));
    return t - Math.atan(t);
  };
  // Half the total backlash is removed from each gear's pitch-circle thickness.
  const halfTooth = Math.PI / (2 * teeth) - backlash / (4 * pitch);
  const halfAngle = (r: number) => halfTooth + inv(pitch) - inv(r);
  const wires: Wire[] = [];
  const wireOf = (drawing: Drawing) =>
    (drawing.sketchOnPlane('XY') as Sketch).wires();
  const line = (a: [number, number], b: [number, number]) =>
    wires.push(wireOf(draw(a).lineTo(b).done()));
  const arc = (r: number, a: number, b: number) =>
    wires.push(
      wireOf(
        draw(polar(r, a))
          .threePointsArcTo(polar(r, b), polar(r, (a + b) / 2))
          .done(),
      ),
    );
  for (let index = 0; index < teeth; index++) {
    const a = (2 * Math.PI * index) / teeth;
    if (root < base) {
      line(
        polar(root, a - halfAngle(start)),
        polar(start, a - halfAngle(start)),
      );
    }
    for (const side of [-1, 1]) {
      const points = Array.from({ length: 8 }, (_, index) => {
        const r = start + ((tip - start) * (side < 0 ? index : 7 - index)) / 7;
        return polar(r, a + side * halfAngle(r));
      });
      wires.push(
        wireOf(
          drawPointsInterpolation(
            points,
            { tolerance: 0.00001 },
            { closeShape: false },
          ),
        ),
      );
      if (side < 0) {
        arc(tip, a - halfAngle(tip), a + halfAngle(tip));
      }
    }
    if (root < base) {
      line(
        polar(start, a + halfAngle(start)),
        polar(root, a + halfAngle(start)),
      );
    }
    arc(
      root,
      a + halfAngle(start),
      a + (2 * Math.PI) / teeth - halfAngle(start),
    );
  }
  // ponytail: radial root extensions omit generated cutter fillets; add cutter
  // geometry and strength verification before specifying a production load rating.
  const blank = basicFaceExtrusion(
    makeFace(assembleWire(wires)),
    new Vector([0, 0, width]),
  )
    .translate([0, 0, 19 - width / 2])
    .fuse(cylinder(hub, 8, 22));
  const cuts = [
    cylinder(bore, 7, 24),
    makeBox([-keyWidth / 2, 0, 7], [keyWidth / 2, bore + keyDepth, 31]),
  ];
  if (teeth === 54) {
    for (let index = 0; index < 6; index++) {
      const [x, y] = polar(34, (index * Math.PI) / 3);
      cuts.push(cylinder(7.5, 7, 24, x, y));
    }
  }
  return blank.cutAll(cuts);
}

export default function main(params = defaultParams): ShapeConfig[] {
  const p = { ...defaultParams, ...params };
  if (
    ![p.faceWidth, p.backlash, p.inputAngle, p.coverLift].every(
      Number.isFinite,
    ) ||
    p.faceWidth < 10 ||
    p.faceWidth > 18 ||
    p.backlash < 0.08 ||
    p.backlash > 0.5 ||
    p.coverLift < 0 ||
    p.coverLift > 80
  ) {
    throw new Error(
      'Use faceWidth 10–18 mm, backlash 0.08–0.5 mm, coverLift 0–80 mm, and a finite inputAngle.',
    );
  }

  const parts: ShapeConfig[] = [];
  const add = (
    name: string,
    build: () => Shape3D,
    color: string,
    alpha = 1,
  ) => {
    if (
      p.part !== 'assembly' &&
      p.part !== name &&
      !(p.part === 'gears' && ['Input pinion', 'Output wheel'].includes(name))
    ) {
      return;
    }
    parts.push({
      name,
      shape: build(),
      color,
      alpha,
      metalness: alpha < 1 ? 0 : 0.6,
      roughness: 0.3,
    });
  };
  const rotateAt = (shape: Shape3D, angle: number, x: number) =>
    shape.rotate(angle, [0, 0, 0], [0, 0, 1]).translate([x, 0, 0]);
  const outputAngle = 180 / 54 - p.inputAngle / 3;
  const bearingHoles = (z: number, depth: number) => [
    cylinder(12.15, z, depth, -72),
    cylinder(17.15, z, depth),
  ];

  add(
    'Housing',
    () => {
      let body = plate(180, 128, 10, 0, 34).cut(plate(168, 116, 8, 6, 30));
      const feet = [],
        holes = [];
      for (const x of [-94, 54]) {
        for (const y of [-65, 65]) {
          feet.push(
            drawRoundedRectangle(24, 26, 5)
              .sketchOnPlane('XY')
              .extrude(6)
              .translate([x, y, 0]),
          );
          holes.push(cylinder(3.5, -1, 8, x, Math.sign(y) * 70));
        }
      }
      body = body.fuseAll([
        ...feet,
        ...screwCenters.map(([x, y]) => cylinder(6, 6, 28, x, y)),
      ]);
      return body.cutAll([
        ...holes,
        ...bearingHoles(-1, 8),
        ...screwCenters.map(([x, y]) => cylinder(2.2, 18, 17, x, y)),
      ]);
    },
    '#24495C',
  );

  add(
    'Cover',
    () => {
      let cover = plate(180, 128, 10, 34.5, 6);
      if (p.inspectionCover) {
        cover = cover
          .cut(plate(154, 100, 10, 34, 7))
          .fuseAll([
            plate(180, 14, 0, 34.5, 6),
            cylinder(16, 34.5, 6, -72),
            cylinder(21, 34.5, 6),
          ]);
      }
      return cover
        .cutAll([
          ...bearingHoles(34, 7),
          ...screwCenters.map(([x, y]) => cylinder(2.3, 34, 7, x, y)),
        ])
        .translate([0, 0, p.coverLift]);
    },
    '#A1B6C3',
  );

  add(
    'Gasket',
    () =>
      plate(180, 128, 10, 34.1, 0.3).cutAll([
        plate(168, 116, 8, 34, 1),
        ...screwCenters.map(([x, y]) => cylinder(2.4, 34, 1, x, y)),
      ]),
    '#243039',
  );

  add(
    'Input pinion',
    () =>
      rotateAt(
        gear(18, 6.1, 12, 4.2, 2.1, p.faceWidth, p.backlash),
        p.inputAngle,
        -72,
      ),
    '#DCE4E9',
  );
  add(
    'Output wheel',
    () =>
      rotateAt(
        gear(54, 10.1, 16, 6.2, 3.1, p.faceWidth, p.backlash),
        outputAngle,
        0,
      ),
    '#CBA45C',
  );

  for (const input of [true, false]) {
    const side = input ? 'Input' : 'Output',
      x = input ? -72 : 0;
    const r = input ? 6 : 10,
      angle = input ? p.inputAngle : outputAngle;
    const keyWidth = input ? 4.2 : 6.2,
      slotBottom = input ? 3.9 : 6.9;
    add(
      `${side} shaft`,
      () =>
        rotateAt(
          cylinder(r, input ? -22 : -2, input ? 62.3 : 68).cutAll([
            makeBox([-keyWidth / 2, slotBottom, 10], [keyWidth / 2, r + 1, 28]),
            makeBox(
              [-keyWidth / 2, slotBottom, input ? -21 : 45],
              [keyWidth / 2, r + 1, input ? -6 : 64],
            ),
          ]),
          angle,
          x,
        ),
      '#B9C7D0',
    );
    const k = keyWidth - 0.4;
    add(
      `${side} key`,
      () =>
        rotateAt(
          makeBox(
            [-k / 2, slotBottom + 0.1, 11.2],
            [k / 2, slotBottom + 0.1 + k, 26.8],
          ),
          angle,
          x,
        ),
      '#637582',
    );
    for (const upper of [false, true]) {
      add(
        `${side} ${upper ? 'upper' : 'lower'} bearing`,
        () => {
          const outer = input ? 12 : 17,
            inner = r + 0.15;
          // Plain replaceable bushes, not a cosmetic stand-in for modeled ball races.
          return drawCircle(outer)
            .cut(drawCircle(inner))
            .sketchOnPlane('XY', upper ? 34.7 + p.coverLift : 0.2)
            .extrude(5.6)
            .translate([x, 0, 0]);
        },
        '#99845A',
      );
    }
  }

  let screw: Shape3D | undefined;
  const coverScrew = (x: number, y: number) => () => {
    // ponytail: unthreaded fastener envelopes; add threads only for manufacturing detail.
    screw ??= cylinder(2, 24.6, 16)
      .fuse(cylinder(3.75, 40.6, 4))
      .cut(drawPolysides(1.8, 6).sketchOnPlane('XY', 42.4).extrude(3));
    return screw.clone().translate([x, y, p.coverLift]);
  };
  for (const [index, [x, y]] of screwCenters.entries()) {
    add(`Cover screw ${index + 1}`, coverScrew(x, y), '#81919E');
  }
  if (parts.length === 0) {
    throw new Error(`Unknown part: ${p.part}`);
  }
  return parts;
}
